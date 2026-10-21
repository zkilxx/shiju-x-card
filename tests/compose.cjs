const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const root=path.resolve(__dirname,'..');
const output=process.env.XCARD_COMPOSE_QA_DIR||path.join(os.tmpdir(),`shiju-compose-${Date.now()}`);
const results=[];
let context;
const eventually=async fn=>{for(let i=0;i<150;i++){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Composer condition did not become true');};
async function check(name,fn){await fn();results.push({name,status:'passed'});console.log(`PASS ${name}`);}
function fixture(mode='normal') {
  return `<!doctype html><html><head><meta charset="utf-8"><title>X composer fixture</title><style>body{font:16px sans-serif;margin:40px;background:#f7f8f7}section{max-width:600px;background:white;border:1px solid #ddd;border-radius:16px;padding:24px}input{display:none}img{max-width:300px;border-radius:8px}button{padding:10px 22px;background:#111;color:white;border:0;border-radius:24px}[contenteditable]{min-height:60px;margin:20px 0}</style></head><body><button data-testid="SideNav_AccountSwitcher_Button"><div>Card Author</div><div>@card_author</div></button><a data-testid="AppTabBar_Profile_Link" href="/card_author">Card Author</a><a data-testid="SideNav_NewTweet_Button" href="/compose/post">Compose</a><h1>Isolated composer test</h1><section role="dialog"><div contenteditable="true" data-testid="tweetTextarea_0" role="textbox">An unfinished draft</div><input type="file" data-testid="fileInput" accept="image/png,image/jpeg" multiple><div data-testid="attachments"></div><p role="alert"></p><button data-testid="tweetButton">Post</button></section><script>
  window.uploads=[];window.published=0;
  document.querySelector('[data-testid=tweetButton]').addEventListener('click',()=>window.published++);
  document.querySelector('input').addEventListener('change',async event=>{
    const file=event.target.files[0];const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    window.uploads.push({name:file.name,type:file.type,size:file.size,base64:btoa(binary)});
    if(${JSON.stringify(mode)}==='reject'){document.querySelector('[role=alert]').textContent='Image upload rejected';return;}
    const img=new Image();img.src=URL.createObjectURL(file);await img.decode();window.uploads.at(-1).width=img.naturalWidth;window.uploads.at(-1).height=img.naturalHeight;document.querySelector('[data-testid=attachments]').append(img);
  });
  if(${JSON.stringify(mode)}==='existing'){const img=new Image();img.src='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>';document.querySelector('[data-testid=attachments]').append(img);}
  </script></body></html>`;
}
async function main() {
  await fs.mkdir(output,{recursive:true});
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'shiju-compose-chrome-'));
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,acceptDownloads:true,viewport:{width:440,height:1000},timezoneId:'Asia/Shanghai',args:[`--disable-extensions-except=${path.join(root,'extension')}`,`--load-extension=${path.join(root,'extension')}`]});
  const errors=[];context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const panel=await context.newPage();await panel.clock.setFixedTime(new Date('2026-10-21T13:30:00Z'));
  await panel.goto(`chrome-extension://${new URL(worker.url()).host}/sidepanel.html`);await panel.locator('#templates button').first().waitFor();
  // Extension-created tabs can navigate before Playwright installs route interception.
  // Hold their first navigation at about:blank, then load the same requested URL
  // through Playwright so every X response stays local to this fixture.
  await worker.evaluate(()=>{const create=chrome.tabs.create.bind(chrome.tabs);chrome.tabs.create=async options=>{globalThis.composeTestRequestedURL=options.url;return create({...options,url:'about:blank'});};});
  let mode='normal',downloads=0,postRequests=0;
  context.on('page',page=>page.on('download',()=>downloads++));panel.on('download',()=>downloads++);
  await context.route('https://x.com/**',route=>{
    if(route.request().method()!=='GET'){postRequests++;return route.abort();}
    return route.fulfill({contentType:'text/html; charset=utf-8',body:mode==='login'?'<html><title>Sign in</title><input autocomplete="username"></html>':fixture(mode)});
  });
  const open=async(native=false)=>{
    const pending=context.waitForEvent('page');
    if(native)await panel.evaluate(()=>document.querySelector('#compose').click());else {await panel.bringToFront();await panel.locator('#compose').click();}
    const page=await pending;const requested=await worker.evaluate(()=>globalThis.composeTestRequestedURL);await page.goto(mode==='login'?'https://x.com/i/flow/login':requested);await page.waitForLoadState('domcontentloaded');return page;
  };
  await check('Composer action requires identity and fits Chinese/English at 320px',async()=>{
    const before=context.pages().length;await panel.locator('#compose').click();assert.equal(await panel.locator('#profileDialog').isVisible(),true);assert.equal(context.pages().length,before);
    await panel.locator('#profileName').fill('Card Author');await panel.locator('#profileHandle').fill('card_author');await panel.locator('#profileForm [type=submit]').click();
    for(const language of ['zh-CN','en']){await panel.locator('#languageMode').selectOption(language);await panel.setViewportSize({width:320,height:1000});assert.ok(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const bounds=await panel.locator('#compose').boundingBox();assert.ok(bounds.width>100&&bounds.x+bounds.width<=320);}
    await panel.locator('#languageMode').selectOption('zh-CN');await panel.setViewportSize({width:440,height:1000});
  });
  let composer;
  await check('One click attaches an exact HD PNG in a new X tab without posting or changing its text',async()=>{
    const existing=await context.newPage();await existing.goto('https://x.com/home');await existing.evaluate(()=>window.originalMarker='kept');
    composer=await open();await eventually(async()=>/卡片已放入/.test(await panel.locator('#notice').innerText()));
    assert.equal(composer.url(),'https://x.com/intent/tweet');assert.equal(await composer.title(),'X composer fixture');
    await eventually(()=>composer.evaluate(()=>window.uploads.length===1&&window.uploads[0].width));const upload=await composer.evaluate(()=>window.uploads[0]);
    assert.equal(upload.type,'image/png');assert.equal(upload.width,2160);assert.match(upload.name,/card_author.*\.png$/);
    assert.equal(upload.base64,await panel.locator('#preview').evaluate(canvas=>canvas.toDataURL().split(',')[1]));
    assert.equal(await composer.locator('[role=textbox]').innerText(),'An unfinished draft');assert.equal(await existing.evaluate(()=>window.originalMarker),'kept');
    assert.equal(await composer.evaluate(()=>window.published),0);assert.equal(postRequests,0);assert.equal(downloads,0);
    await fs.writeFile(path.join(output,'attached-card.png'),Buffer.from(upload.base64,'base64'));await composer.screenshot({path:path.join(output,'composer-png.png'),fullPage:true});await panel.screenshot({path:path.join(output,'panel-compose.png'),fullPage:true});
  });
  await check('The native compose route and selected JPG resolution are used without duplicate attachments',async()=>{
    await panel.locator('#format').selectOption('jpeg');await panel.locator('#resolution').selectOption('3240');await eventually(()=>panel.locator('#preview').evaluate(canvas=>canvas.width===3240));
    await composer.bringToFront();const previous=composer;composer=await open(true);await eventually(async()=>/卡片已放入/.test(await panel.locator('#notice').innerText())&&await composer.evaluate(()=>window.uploads?.[0]?.width===3240));
    assert.equal(composer.url(),'https://x.com/compose/post');const upload=await composer.evaluate(()=>window.uploads[0]);assert.equal(upload.type,'image/jpeg');assert.match(upload.name,/\.jpg$/);assert.equal(await composer.evaluate(()=>window.uploads.length),1);assert.equal(await previous.evaluate(()=>window.uploads.length),1);assert.equal(await composer.evaluate(()=>window.published),0);
  });
  await check('Existing composer attachments and draft text remain untouched with clear guidance',async()=>{
    mode='existing';const page=await open();await eventually(async()=>/已有图片/.test(await panel.locator('#notice').innerText()));assert.equal(await page.evaluate(()=>window.uploads.length),0);assert.equal(await page.locator('[role=textbox]').innerText(),'An unfinished draft');assert.equal(await page.locator('[data-testid=attachments] img').count(),1);assert.equal(await panel.locator('#compose').isEnabled(),true);
  });
  await check('Signed-out X tabs produce login guidance without attempting an upload',async()=>{
    mode='login';const page=await open();await eventually(async()=>/先在新标签页登录 X/.test(await panel.locator('#notice').innerText()));assert.match(page.url(),/\/i\/flow\/login/);assert.equal(await panel.locator('#compose').isEnabled(),true);
  });
  await check('X upload rejection is reported in English and restores both card actions',async()=>{
    mode='reject';await panel.locator('#languageMode').selectOption('en');const page=await open();await eventually(async()=>/Could not add card: X could not add the image/.test(await panel.locator('#notice').innerText()));assert.equal(await page.evaluate(()=>window.uploads.length),1);assert.equal(await panel.locator('#compose').isEnabled(),true);assert.equal(await panel.locator('#export').isEnabled(),true);assert.equal(await page.evaluate(()=>window.published),0);
  });
  await check('Invalid/oversized image messages are rejected before opening a tab',async()=>{
    const count=context.pages().length;
    for(const dataURL of ['data:text/html;base64,PHNjcmlwdD4=',`data:image/png;base64,${'A'.repeat(7*1024*1024)}`]){const result=await panel.evaluate(dataURL=>chrome.runtime.sendMessage({type:'OPEN_CARD_COMPOSER',image:{dataURL,filename:'image.png'}}),dataURL);assert.match(result.error,/无效/);}
    assert.equal(context.pages().length,count);assert.equal(postRequests,0);assert.deepEqual(errors,[]);
  });
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({results,output,liveAccount:false,mockedXComposer:true,initialTabNavigationHeldForRouting:true,posted:false},null,2));console.log(`COMPOSE_QA_OUTPUT=${output}`);
}
main().catch(async error=>{console.error(error);if(context)for(const page of context.pages())console.error('DIAGNOSTIC',page.url(),await page.evaluate(()=>({notice:document.querySelector('#notice')?.textContent,uploads:window.uploads?.length,files:document.querySelector('input[type=file]')?.files.length,editors:document.querySelectorAll('[contenteditable]').length})).catch(()=>null));process.exitCode=1;}).finally(async()=>{if(context)await context.close();});
