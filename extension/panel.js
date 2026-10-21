import {templates, renderCard, loadAvatar} from './render.js';
import {githubPath,xPath} from './branding.js';
const {t,text:localized}=globalThis.ShijuI18n;
const $ = id => document.getElementById(id);
const extension = Boolean(globalThis.chrome?.runtime?.id);
const defaults = {title:$('title').value,body:$('body').value,template:'white',ratio:'auto',titleSize:106,fontSize:38,paragraphSpacing:70,titleBodyGap:38,format:'png',resolution:2160,exportQualityVersion:2,account:null,tweetSource:null,personalDraft:null};
let state = {...defaults}, avatar = null, sourceAvatar=null, saveTimer, renderTimer, syncGeneration=0, saveRevision=0;
let tweetQueue=Promise.resolve(),previewExportedAt=new Date().toISOString();
let saving=Promise.resolve(), exporting=false, importing=false, renderValid=false;
const storage = {
  async get() {return extension ? (await chrome.storage.local.get('shijuDraft')).shijuDraft : JSON.parse(localStorage.getItem('shijuDraft') || 'null');},
  async set(value) {if(extension) await chrome.storage.local.set({shijuDraft:value});else localStorage.setItem('shijuDraft',JSON.stringify(value));}
};
const notice = (value,values={}) => localized($('notice'),value,values);
const status = (id,value,values={}) => localized($(id),value,values);
const exportLabel = () => localized($('export').querySelector('span'),exporting?'正在导出…':'导出卡片');
function updateActions() {
  exportLabel();localized($('compose').querySelector('span'),importing?'正在添加…':'放入 X 编辑栏');
  $('export').disabled=$('compose').disabled=!renderValid || exporting || importing;
}
const cardAccount=()=>state.tweetSource?.account || state.account;
const cardAvatar=()=>state.tweetSource ? sourceAvatar : avatar;
function showTweetSource() {
  $('tweetSource').hidden=!state.tweetSource;
  if(state.tweetSource){status('sourceLink','原推文 · @{handle}',{handle:state.tweetSource.account.handle});$('sourceLink').href=state.tweetSource.url;}
}
async function importTweet(request) {
  if(!request || request.status!=='ready' || Date.now()-request.createdAt>60000)return;
  const claim=await chrome.runtime.sendMessage({type:'CLAIM_TWEET_EXPORT',id:request.id});
  if(!claim?.claimed)return;
  const image=await loadAvatar(request.account.avatarData);
  if(!state.tweetSource)state.personalDraft={title:state.title,body:state.body,ratio:state.ratio,fontSize:state.fontSize,titleSize:state.titleSize,paragraphSpacing:state.paragraphSpacing,titleBodyGap:state.titleBodyGap};
  state.tweetSource={url:request.url,publishedAt:XCardAccount.timestamp(request.publishedAt),account:request.account,requestId:request.id};
  state.title='';state.body=request.text;sourceAvatar=image;
  try{renderCard(document.createElement('canvas'),state,sourceAvatar,1080);}catch{
    state.ratio='auto';
    try{renderCard(document.createElement('canvas'),state,sourceAvatar,1080);}catch{state.fontSize=Math.min(state.fontSize,38);}
  }
  for(const id of ['title','body','ratio','fontSize','titleSize','paragraphSpacing','titleBodyGap'])$(id).value=state[id];
  showTweetSource();redraw();queueSave();
  if(renderValid)await exportCard();
}
function enqueueTweet(request) {
  tweetQueue=tweetQueue.catch(()=>{}).then(()=>importTweet(request)).catch(error=>notice('推文导出失败：{error}',{error:t(error.message)}));
}
function restorePersonalDraft() {
  if(state.personalDraft){for(const id of ['title','body','ratio','fontSize','titleSize','paragraphSpacing','titleBodyGap'])state[id]=state.personalDraft[id] ?? state[id];}
  state.tweetSource=null;state.personalDraft=null;sourceAvatar=null;
  for(const id of ['title','body','ratio','fontSize','titleSize','paragraphSpacing','titleBodyGap'])$(id).value=state[id];
  showTweetSource();redraw();queueSave();notice('已返回你自己的卡片草稿。');
}
function flushSave() {
  clearTimeout(saveTimer);saveTimer=undefined;
  const revision=saveRevision,snapshot=structuredClone(state);
  saving=saving.catch(()=>{}).then(()=>storage.set(snapshot)).then(()=>{if(revision===saveRevision)status('saveStatus','已保存');}).catch(()=>{status('saveStatus','保存失败');notice('本机存储空间不足，当前草稿尚未保存，请先导出图片。');});
}
function queueSave() {
  ++saveRevision;
  status('saveStatus','正在保存…');clearTimeout(saveTimer);
  saveTimer=setTimeout(flushSave,200);
}
function updateRangeFill(input) {
  const min=Number(input.min),max=Number(input.max);
  const progress=max>min?Math.max(0,Math.min(100,(Number(input.value)-min)/(max-min)*100)):0;
  input.style.setProperty('--range-progress',`${progress}%`);
}
function redraw() {
  try {
    const dimensions=renderCard($('preview'),{...state,exportedAt:previewExportedAt},cardAvatar(),Number(state.resolution));
    $('preview').removeAttribute('data-i18n-aria');
    $('dimensions').textContent=`${dimensions.width} × ${dimensions.height}${dimensions.fontSize<state.fontSize?t(' · 字号已适配'):''}`;
    $('preview').setAttribute('aria-label',t('{name}的卡片：{title}。{body}',{name:cardAccount()?.name || t('示例账号'),title:state.title,body:state.body}));
    renderValid=true;
    if($('notice').dataset.renderError) {notice('');delete $('notice').dataset.renderError;}
  } catch(error) {
    renderValid=false;notice(error.message);$('notice').dataset.renderError='1';
    $('dimensions').textContent=t('文字超出尺寸 · 上次有效预览');
  }
  updateActions();
  $('titleCount').textContent=`${[...state.title].length}/80`;$('bodyCount').textContent=`${[...state.body].length}/2400`;
  $('fontSizeLabel').textContent=state.fontSize;
  $('titleSizeLabel').textContent=state.titleSize;
  $('paragraphSpacingLabel').textContent=`${state.paragraphSpacing}px`;
  $('titleBodyGapLabel').textContent=`${state.titleBodyGap}px`;
  for(const id of ['titleSize','fontSize','paragraphSpacing','titleBodyGap'])updateRangeFill($(id));
}
function renderTemplates() {
  for(const template of templates) {
    const button=document.createElement('button');button.className='template';button.type='button';button.dataset.template=template.id;button.setAttribute('aria-label',t('{name}模板',{name:t(template.name)}));
    const swatch=document.createElement('span');swatch.className='swatch';swatch.style.background=template.bg;swatch.style.color=template.fg;
    const sample=document.createElement('span');sample.className='swatch-title';sample.append(t('把想法，'),document.createElement('br'),t('留在这一刻。'));
    const rule=document.createElement('span');rule.className='swatch-line';const url=document.createElement('span');url.className='swatch-url';url.textContent='x.com/yourname';swatch.append(sample,rule,url);
    const label=document.createElement('span');label.className='template-label';label.textContent=t(template.name);button.append(swatch,label);$('templates').append(button);
    button.addEventListener('click',()=>{state.template=template.id;selectTemplate();redraw();queueSave();});
  }
}
function selectTemplate() {
  $('templateName').removeAttribute('data-i18n');
  document.querySelectorAll('[data-template]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.template===state.template)));
  $('templateName').textContent=t(templates.find(item=>item.id===state.template)?.name || '素白');
}
function showAccount(status) {
  const account=state.account;
  $('accountName').removeAttribute('data-i18n');
  $('accountName').textContent=account?.name || t('示例账号');$('accountHandle').textContent=`@${account?.handle || 'yourname'}`;
  if(account) $('accountHandle').href=`https://x.com/${account.handle}`;else $('accountHandle').removeAttribute('href');
  localized($('accountStatus'),status || (account ? account.source==='x'?'上次同步资料 · 待确认当前账号':'手动资料 · 可同步 X 账号':'未关联 · 打开 X 后同步'));
  $('avatar').replaceChildren();
  if(account?.avatarData) {const img=document.createElement('img');img.src=account.avatarData;img.alt='';$('avatar').append(img);} else if(account)$('avatar').textContent=account.name.slice(0,1);
  else {const img=document.createElement('img');img.src='icons/icon128.png';img.alt='';$('avatar').append(img);}
}
async function syncAccount(quiet=false) {
  if(!extension) {if(!quiet)notice('网页预览无法读取 X。安装插件后可同步，或点击右上角填写账号资料。');return;}
  const generation=++syncGeneration;$('sync').disabled=true;status('accountStatus','正在读取当前 X 账号…');
  try {
    const result=await chrome.runtime.sendMessage({type:'SYNC_ACCOUNT'});
    if(generation!==syncGeneration)return;
    if(!result?.account) throw new Error(result?.error || '无法连接账号读取服务，请重新加载插件后重试。');
    const account=result.account;
    // Keep a cached avatar only for the exact same account and avatar URL.
    if(!account.avatarData && account.handle===state.account?.handle && account.avatar===state.account?.avatar) account.avatarData=state.account.avatarData;
    const nextAvatar=await loadAvatar(account.avatarData);
    if(generation!==syncGeneration)return;
    state.account=account;avatar=nextAvatar;
    showAccount(avatar?'已关联 · 当前 X 账号':'已关联 · 头像暂不可用');redraw();queueSave();
    if(!quiet)notice(avatar?'账号资料已同步。':'账号已同步；头像获取失败，可在资料设置中上传。');
  } catch(error) {
    if(generation!==syncGeneration)return;
    showAccount(state.account ? state.account.source==='manual'?'手动资料 · 未确认当前 X 账号':'上次同步资料 · 未确认当前账号':'未关联 · 打开 X 后同步');
    if(!quiet)notice(error.message);
  } finally {if(generation===syncGeneration)$('sync').disabled=false;}
}
async function uploadAvatar(file) {
  if(!file)return null;
  if(file.size>5*1024*1024)throw new Error('头像请小于 5MB。');
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('请选择 PNG、JPG 或 WebP 图片。');
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('头像读取失败。'));reader.readAsDataURL(file);});
  const image=await loadAvatar(data);if(!image)throw new Error('这张图片无法打开，请换一张。');
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
  const edge=Math.min(image.naturalWidth,image.naturalHeight);const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(image,(image.naturalWidth-edge)/2,(image.naturalHeight-edge)/2,edge,edge,0,0,512,512);
  return canvas.toDataURL('image/png');
}
function openProfile() {
  $('profileName').value=state.account?.name || '';$('profileHandle').value=state.account?.handle || '';$('avatarFile').value='';status('profileError','');$('profileDialog').showModal();
}
function canCreateCard() {
  if(exporting || importing)return false;
  if(!state.title.trim() && !state.body.trim()) {notice('先写一点文字，再导出卡片。');$('body').focus();return false;}
  if(!cardAccount()) {notice('先同步当前 X 账号，或填写账号资料后导出。');openProfile();return false;}
  return renderValid;
}
async function createCardImage() {
  previewExportedAt=new Date().toISOString();redraw();
  const snapshot={...structuredClone(state),exportedAt:previewExportedAt},author=cardAccount();
  const canvas=document.createElement('canvas');renderCard(canvas,snapshot,cardAvatar(),Number(state.resolution));
  const mime=snapshot.format==='jpeg'?'image/jpeg':'image/png';
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,mime,1));if(!blob)throw new Error('图片生成失败，请重试。');
  const filename=`${ShijuI18n.language==='en'?'Shiju':'拾句'}-${author.handle}-${snapshot.exportedAt.replace(/[:.]/g,'-')}.${snapshot.format==='jpeg'?'jpg':'png'}`;
  return {blob,filename};
}
async function exportCard() {
  if(!canCreateCard())return;
  exporting=true;updateActions();
  try {
    const {blob,filename}=await createCardImage();
    const url=URL.createObjectURL(blob), link=document.createElement('a');
    link.href=url;link.download=filename;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    notice('{format} 图片已生成，正在下载。',{format:state.format==='jpeg'?'JPG':'PNG'});
  } catch(error) {notice('导出失败：{error}',{error:t(error.message)});}
  finally {exporting=false;updateActions();}
}
async function addToComposer() {
  if(!extension){notice('安装 Chrome 插件后，即可将卡片放入 X 编辑栏。');return;}
  if(!canCreateCard())return;
  importing=true;updateActions();
  try {
    const {blob,filename}=await createCardImage();
    if(blob.size>5*1024*1024)throw new Error('图片超过 5MB，请调低卡片宽度后重试。');
    const dataURL=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('图片生成失败，请重试。'));reader.readAsDataURL(blob);});
    const result=await chrome.runtime.sendMessage({type:'OPEN_CARD_COMPOSER',image:{dataURL,filename}});
    if(!result?.ok)throw new Error(result?.error || 'X 未能添加图片，请在新标签页查看提示。');
    notice('卡片已放入 X 编辑栏，检查后即可发布。');
  } catch(error){notice('添加失败：{error}',{error:t(error.message)});}
  finally {importing=false;updateActions();}
}
async function init() {
  await ShijuI18n.ready;
  const repoPath=document.createElementNS('http://www.w3.org/2000/svg','path');repoPath.setAttribute('d',githubPath);$('repository').querySelector('svg').append(repoPath);
  const composePath=document.createElementNS('http://www.w3.org/2000/svg','path');composePath.setAttribute('d',xPath);$('compose').querySelector('svg').append(composePath);
  try {
    const saved=await storage.get();if(saved)state={...defaults,...saved,titleSize:saved.titleSize ?? Math.round((Number(saved.fontSize)||38)*2.8),paragraphSpacing:saved.paragraphSpacing ?? Math.round((Number(saved.fontSize)||38)*1.85)};
    state.title=String(state.title||'').slice(0,80);state.body=String(state.body||'').slice(0,2400);
    if(!templates.some(t=>t.id===state.template))state.template='white';
    if(!['auto','square','portrait'].includes(state.ratio))state.ratio='auto';
    state.fontSize=Math.max(30,Math.min(50,Number(state.fontSize)||38));
    state.titleSize=Math.max(48,Math.min(144,Number(state.titleSize)||106));
    state.paragraphSpacing=Math.max(0,Math.min(160,Number.isFinite(Number(state.paragraphSpacing))?Number(state.paragraphSpacing):70));
    state.titleBodyGap=Math.max(0,Math.min(160,Number.isFinite(Number(state.titleBodyGap))?Number(state.titleBodyGap):38));
    if(saved && saved.exportQualityVersion!==2){state.resolution=Math.max(2160,Number(state.resolution)||2160);state.format='png';state.exportQualityVersion=2;}
    state.resolution=[1080,2160,3240].includes(Number(state.resolution))?Number(state.resolution):2160;
    state.format=state.format==='jpeg'?'jpeg':'png';
    if(state.account && (!XCardAccount.validHandle(state.account.handle) || typeof state.account.name!=='string'))state.account=null;
    if(state.account?.avatarData && !/^data:image\/(png|jpeg|webp|gif);base64,/.test(state.account.avatarData))state.account.avatarData='';
    if(state.tweetSource)state.tweetSource.publishedAt=XCardAccount.timestamp(state.tweetSource.publishedAt);
    if(state.tweetSource && (!XCardAccount.validHandle(state.tweetSource.account?.handle) || !XCardAccount.tweetURL(state.tweetSource.url)))state.tweetSource=null;
  } catch {notice('无法读取上次草稿，已打开新的编辑页。');}
  renderTemplates();selectTemplate();
  document.addEventListener('shiju-language-change',()=>{
    $('templates').replaceChildren();renderTemplates();selectTemplate();showTweetSource();
    if(!state.account)$('accountName').textContent=t('示例账号');
    updateActions();redraw();
  });
  for(const id of ['title','body','ratio','titleSize','fontSize','paragraphSpacing','titleBodyGap','format','resolution']) {
    $(id).value=state[id];$(id).addEventListener(['title','body','titleSize','fontSize','paragraphSpacing','titleBodyGap'].includes(id)?'input':'change',()=>{
      state[id]=['titleSize','fontSize','paragraphSpacing','titleBodyGap','resolution'].includes(id)?Number($(id).value):$(id).value;
      if($(id).type==='range')updateRangeFill($(id));
      clearTimeout(renderTimer);renderTimer=setTimeout(redraw,60);queueSave();
    });
  }
  avatar=await loadAvatar(state.account?.avatarData);sourceAvatar=await loadAvatar(state.tweetSource?.account?.avatarData);showAccount();showTweetSource();redraw();
  $('restoreDraft').addEventListener('click',restorePersonalDraft);
  $('sync').addEventListener('click',()=>syncAccount());$('settings').addEventListener('click',openProfile);$('closeDialog').addEventListener('click',()=>$('profileDialog').close());$('export').addEventListener('click',exportCard);
  $('compose').addEventListener('click',addToComposer);
  $('profileForm').addEventListener('submit',async event=>{
    event.preventDefault();const name=$('profileName').value.trim(),handle=$('profileHandle').value.trim().replace(/^@/,'');
    if(!name || !XCardAccount.validHandle(handle)) {status('profileError','请填写昵称和有效的 X ID（1–15 位字母、数字或下划线）。');return;}
    const submit=$('profileForm').querySelector('[type=submit]');submit.disabled=true;
    try {
      const uploaded=await uploadAvatar($('avatarFile').files[0]);
      ++syncGeneration;$('sync').disabled=false;
      const avatarData=uploaded ?? (state.account?.handle.toLowerCase()===handle.toLowerCase()?state.account.avatarData:'');
      state.account={name,handle,url:`https://x.com/${handle}`,avatarData,source:'manual'};avatar=await loadAvatar(avatarData);showAccount();redraw();queueSave();$('profileDialog').close();notice('账号资料已保存。');
    } catch(error) {status('profileError',error.message);}finally{submit.disabled=false;}
  });
  if(extension) {
    chrome.runtime.onMessage.addListener(message=>{if(message.type==='ACCOUNT_INVALIDATED')syncAccount(true);});
    chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes.shijuPendingTweet?.newValue?.status==='ready')enqueueTweet(changes.shijuPendingTweet.newValue);});
    const {shijuPendingTweet}=await chrome.storage.local.get('shijuPendingTweet');enqueueTweet(shijuPendingTweet);
    syncAccount(true);
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden && saveTimer)flushSave();});
  window.addEventListener('pagehide',()=>{if(saveTimer)flushSave();});
}
init().catch(error=>notice('打开失败：{error}',{error:t(error.message)}));
