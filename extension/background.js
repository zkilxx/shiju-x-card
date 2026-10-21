importScripts('account.js');
chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true}).catch(console.error);

async function imageData(value) {
  const url = XCardAccount.avatarURL(value);
  if (!url) return '';
  const highResolution=new URL(url);
  highResolution.pathname=highResolution.pathname.replace(/_(normal|bigger|mini|200x200)(?=\.[a-z0-9]+$)/i,'_400x400');
  for(const candidate of new Set([highResolution.href,url]))try {
    const response = await fetch(candidate, {credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(8000)});
    const type = response.headers.get('content-type')?.split(';')[0];
    if (!response.ok || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type)) continue;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > 3 * 1024 * 1024) continue;
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return `data:${type};base64,${btoa(binary)}`;
  } catch {}
  return '';
}
async function activeXTab() {
  const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
  if (!tab?.id || !/^https:\/\/(x\.com|twitter\.com)\//.test(tab.url || '')) throw new Error('请先在当前窗口打开并登录 X，再点同步。');
  return tab;
}
const reconnectingTabs=new Map();
async function installContent(tabId) {
  await chrome.scripting.executeScript({target:{tabId},files:['i18n.js','account.js','composer.js','content.js']});
  await chrome.scripting.insertCSS({target:{tabId},files:['content.css']});
}
function ensureContent(tabId) {
  if(reconnectingTabs.has(tabId))return reconnectingTabs.get(tabId);
  const task=(async()=>{
    try{const pong=await chrome.tabs.sendMessage(tabId,{type:'SHIJU_PING'});if(pong?.version===chrome.runtime.getManifest().version)return;}catch{}
    await installContent(tabId);
  })().finally(()=>reconnectingTabs.delete(tabId));
  reconnectingTabs.set(tabId,task);return task;
}
async function reconnectOpenXTabs() {
  const tabs=await chrome.tabs.query({url:['https://x.com/*','https://twitter.com/*']});
  await Promise.allSettled(tabs.filter(tab=>tab.id!=null).map(tab=>ensureContent(tab.id)));
}
// Reloading an unpacked extension fires onInstalled with reason "update".
// Rebind its existing buttons without navigating or refreshing the user's pages.
chrome.runtime.onInstalled.addListener(()=>{reconnectOpenXTabs().catch(console.warn);});
chrome.runtime.onStartup.addListener(()=>{reconnectOpenXTabs().catch(console.warn);});
reconnectOpenXTabs().catch(console.warn);

async function sync() {
  const tab = await activeXTab();
  await ensureContent(tab.id);
  const response=await chrome.tabs.sendMessage(tab.id,{type:'READ_ACCOUNT'});
  const account = response?.account;
  if (!account || !XCardAccount.validHandle(account.handle)) throw new Error('还没有读到登录账号，请等 X 页面加载完成后重试。');
  account.avatarData = await imageData(account.avatar);
  return {account};
}
async function openCardComposer(image) {
  if(!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(image?.dataURL||'') || image.dataURL.length>7*1024*1024)throw new Error('卡片图片无效，请重新生成。');
  let url='https://x.com/intent/tweet';
  try {
    const current=await activeXTab();await ensureContent(current.id);
    const result=await chrome.tabs.sendMessage(current.id,{type:'READ_COMPOSER_URL'});
    const candidate=new URL(result?.url);
    if(/^https:\/\/(x\.com|twitter\.com)\/(compose\/(post|tweet)|intent\/tweet)\/?$/.test(candidate.href))url=candidate.href;
  } catch {}
  const tab=await chrome.tabs.create({url,active:true});
  const deadline=Date.now()+30000;
  let ready=false;
  while(Date.now()<deadline) {
    const current=await chrome.tabs.get(tab.id);
    if(/\/i\/flow\/(login|signup)/.test(current.url||''))throw new Error('请先在新标签页登录 X，再回到拾句重试。');
    try {
      const pong=await chrome.tabs.sendMessage(tab.id,{type:'SHIJU_PING'});
      if(pong?.version===chrome.runtime.getManifest().version){ready=true;break;}
    } catch {}
    if(current.status==='complete' && /^https:\/\/(x\.com|twitter\.com)\//.test(current.url||''))try{await ensureContent(tab.id);ready=true;break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!ready)throw new Error('X 编辑栏加载超时，请检查新标签页后重试。');
  const result=await chrome.tabs.sendMessage(tab.id,{type:'ATTACH_CARD',id:crypto.randomUUID(),dataURL:image.dataURL,filename:image.filename});
  if(!result?.ok)throw new Error(result?.error||'X 未能添加图片，请在新标签页查看提示。');
  return {ok:true};
}
const exportClaims=new Set();
async function prepareTweet(tweet) {
  const source=XCardAccount.tweetURL(tweet?.url);
  if(!source || !tweet?.account || tweet.account.handle?.toLowerCase()!==source.handle.toLowerCase())throw new Error('推文作者或原始链接无效。');
  const text=typeof tweet.text==='string'?tweet.text.trim():'';
  if(!text || text.length>2400)throw new Error('只支持 1–2400 字符的推文正文，请先展开全文。');
  const publishedAt=XCardAccount.timestamp(tweet.publishedAt);
  if(!publishedAt)throw new Error('未读到这条推文的发布时间，请刷新 X 页面后重试。');
  const account={name:String(tweet.account.name || source.handle).slice(0,60),handle:source.handle,url:`https://x.com/${source.handle}`,source:'tweet'};
  account.avatarData=await imageData(tweet.account.avatar);
  return {id:crypto.randomUUID(),text,url:source.url,publishedAt,account,createdAt:Date.now(),status:'ready'};
}
async function claimTweet(id) {
  if(typeof id!=='string' || exportClaims.has(id))return {claimed:false};
  exportClaims.add(id);
  const {shijuPendingTweet:pending}=await chrome.storage.local.get('shijuPendingTweet');
  if(!pending || pending.id!==id || pending.status!=='ready' || Date.now()-pending.createdAt>60000)return {claimed:false};
  await chrome.storage.local.set({shijuPendingTweet:{...pending,status:'claimed'}});
  return {claimed:true};
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const fromPanel = sender.id === chrome.runtime.id && sender.url?.split(/[?#]/)[0] === chrome.runtime.getURL('sidepanel.html');
  if(message.type==='OPEN_CARD_COMPOSER' && fromPanel) {
    openCardComposer(message.image).then(respond).catch(error=>respond({error:error.message}));return true;
  }
  if (message.type === 'SYNC_ACCOUNT' && fromPanel) {
    sync().then(respond).catch(error => respond({error: error.message}));
    return true;
  }
  if(message.type==='CLAIM_TWEET_EXPORT' && fromPanel) {
    claimTweet(message.id).then(respond).catch(error=>respond({error:error.message}));return true;
  }
  if(message.type==='EXPORT_TWEET' && sender.tab && /^https:\/\/(x\.com|twitter\.com)\//.test(sender.url || '')) {
    // Call immediately while the originating click still grants a user gesture.
    const opening=chrome.sidePanel.open({tabId:sender.tab.id});
    Promise.all([opening,prepareTweet(message.tweet)]).then(async([,request])=>{
      await chrome.storage.local.set({shijuPendingTweet:request});respond({ok:true});
    }).catch(error=>respond({error:error.message}));
    return true;
  }
  if (message.type === 'ACCOUNT_CHANGED' && sender.tab) {
    activeXTab().then(tab => {
      if (tab.id === sender.tab.id) chrome.runtime.sendMessage({type: 'ACCOUNT_INVALIDATED'}).catch(() => {});
    }).catch(() => {});
  }
});
chrome.tabs.onActivated.addListener(() => chrome.runtime.sendMessage({type: 'ACCOUNT_INVALIDATED'}).catch(() => {}));
