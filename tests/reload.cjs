const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const root=path.resolve(__dirname,'..');
const output=process.env.XCARD_RELOAD_QA_DIR||path.join(os.tmpdir(),`shiju-reload-${Date.now()}`);
const results=[];
let context;
async function eventually(fn){for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw new Error('Reconnect condition did not become true');}
async function check(name,fn){await fn();results.push({name,status:'passed'});console.log(`PASS ${name}`);}
async function main(){
  await fs.mkdir(output,{recursive:true});
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'shiju-reload-chrome-'));
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],acceptDownloads:true,viewport:{width:600,height:900},args:['--enable-unsafe-extension-debugging']});
  const errors=[];context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  const devtools=await context.browser().newBrowserCDPSession();
  await devtools.send('Extensions.loadUnpacked',{path:path.join(root,'extension')});
  const icon=await fs.readFile(path.join(root,'extension/icons/icon128.png'));
  await context.route('https://pbs.twimg.com/**',r=>r.fulfill({contentType:'image/png',body:icon}));
  await context.route('https://x.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><body style="font:16px sans-serif;padding:20px"><button data-testid="SideNav_AccountSwitcher_Button">Self<br>@self</button><a data-testid="AppTabBar_Profile_Link" href="/self">Profile</a><article data-testid="tweet" style="padding:24px;min-height:240px;margin-top:20px;border:1px solid #ddd"><div data-testid="UserAvatar-Container-author"><img src="https://pbs.twimg.com/profile_images/1/author.png" width="40"></div><div data-testid="User-Name"><a href="/author">Original Author</a><a href="/author/status/1234567890123456789"><time datetime="2026-10-21T03:04:05.000Z">Oct 21</time></a></div><div data-testid="tweetText">A post that remains open while the extension reloads.</div></article></body></html>`}));
  let worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host,url=`chrome-extension://${id}/sidepanel.html`;
  const x=await context.newPage();await x.goto('https://x.com/home');
  const selector='article > .shiju-tweet-export';
  await x.locator(selector).waitFor({state:'attached'});
  let panel=await context.newPage();await panel.goto(url);await panel.locator('#templates button').first().waitFor();
  const stubOpen=()=>worker.evaluate(()=>{chrome.sidePanel.open=async()=>{};});
  const exportPost=async filename=>{
    await stubOpen();await x.locator('article').hover();await eventually(()=>x.locator(selector).isEnabled());
    const waiting=panel.waitForEvent('download',{timeout:15000});await x.locator(selector).click();
    const download=await waiting;await download.saveAs(path.join(output,filename));
    assert.match(download.suggestedFilename(),/author/);
    await eventually(()=>panel.evaluate(async()=>((await chrome.storage.local.get('shijuDraft')).shijuDraft?.tweetSource?.publishedAt)==='2026-10-21T03:04:05.000Z'));
    assert.equal(await panel.locator('#sourceLink').getAttribute('href'),'https://x.com/author/status/1234567890123456789');
  };
  await exportPost('before-reload.png');
  await x.evaluate(()=>{globalThis.shijuPageMarker='kept';});
  const oldSession=await x.locator(selector).getAttribute('data-shiju-session');
  await check('A real extension disable/enable cycle reconnects existing X buttons without reloading the page',async()=>{
    const replacement=context.waitForEvent('serviceworker',{predicate:candidate=>candidate!==worker,timeout:15000});
    replacement.catch(()=>{});
    if(!panel.isClosed())await panel.close();
    const manager=await context.newPage();await manager.goto('chrome://extensions/');
    // Restart via Chrome's management page to invalidate the old isolated world.
    await manager.evaluate(async id=>{await chrome.management.setEnabled(id,false);await chrome.management.setEnabled(id,true);},id);
    await eventually(async()=>(await devtools.send('Extensions.getExtensions',{})).extensions.some(extension=>extension.id===id && extension.enabled));
    await manager.close();
    panel=await context.newPage();await panel.goto(url);
    worker=await replacement;
    await panel.locator('#templates button').first().waitFor();
    await eventually(async()=>await x.locator(selector).getAttribute('data-shiju-session')!==oldSession);
    assert.equal(await x.locator(selector).count(),1);assert.equal(await x.evaluate(()=>globalThis.shijuPageMarker),'kept');assert.equal(x.url(),'https://x.com/home');
  });
  await check('The reconnected button downloads the original author and publication time',async()=>{
    await exportPost('after-reload.png');
    assert.match(await panel.locator('#preview').getAttribute('aria-label'),/^Original Author/);
    await panel.locator('#preview').screenshot({path:path.join(output,'reconnected-preview.png')});
  });
  const tabId=await worker.evaluate(async()=>((await chrome.tabs.query({url:'https://x.com/home'}))[0].id));
  await check('Reinjection replaces stale callbacks and repeated reconnects do not duplicate downloads',async()=>{
    await x.evaluate(()=>{globalThis.legacyClicks=0;document.querySelector('.shiju-tweet-export').addEventListener('click',()=>globalThis.legacyClicks++);});
    await worker.evaluate(tabId=>installContent(tabId),tabId);
    await worker.evaluate(async tabId=>{await Promise.all([ensureContent(tabId),ensureContent(tabId),reconnectOpenXTabs()]);},tabId);
    assert.equal(await x.locator(selector).count(),1);
    let downloads=0;panel.on('download',()=>downloads++);await exportPost('after-reinjection.png');
    await new Promise(r=>setTimeout(r,500));assert.equal(downloads,1);assert.equal(await x.evaluate(()=>globalThis.legacyClicks),0);
  });
  await check('Invalidated-context errors show a localized refresh instruction',async()=>{
    await worker.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:()=>{globalThis.shijuOriginalSendMessage=chrome.runtime.sendMessage;chrome.runtime.sendMessage=()=>{throw new Error('Extension context invalidated.');};}}),tabId);
    try{
      await eventually(()=>x.locator(selector).isEnabled());await x.locator('article').hover();await x.locator(selector).click();
      await eventually(async()=>await x.locator('.shiju-page-toast').innerText()==='插件已更新，请刷新 X 页面后重试。');
      await x.screenshot({path:path.join(output,'refresh-instruction.png'),fullPage:true});
    }finally{await worker.evaluate(tabId=>chrome.scripting.executeScript({target:{tabId},func:()=>{chrome.runtime.sendMessage=globalThis.shijuOriginalSendMessage;}}),tabId);}
  });
  assert.deepEqual(errors,[],'No application JavaScript errors');
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({results,output,liveAccount:false,realExtensionRestart:true,sidePanelOpenStubbed:true},null,2));
  console.log(`RELOAD_QA_OUTPUT=${output}`);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(context)await context.close();});
