const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const root=path.resolve(__dirname,'..');
const output=process.env.XCARD_QA_DIR || path.join(os.tmpdir(),`shiju-qa-${Date.now()}`);
const results=[];
let context;
const check=(name,fn)=>Promise.resolve().then(fn).then(()=>{results.push({name,status:'passed'});console.log(`PASS ${name}`);});
const eventually=async(fn)=>{for(let i=0;i<50;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw new Error('Condition did not become true');};
async function main(){
  await fs.mkdir(output,{recursive:true});
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'shiju-chrome-'));
  context=await chromium.launchPersistentContext(userData,{channel:'chromium',headless:true,acceptDownloads:true,viewport:{width:440,height:1200},args:[`--disable-extensions-except=${path.join(root,'extension')}`,`--load-extension=${path.join(root,'extension')}`]});
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;
  const panel=await context.newPage();
  const errors=[];panel.on('pageerror',e=>errors.push(e.message));
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  await panel.locator('#templates button').first().waitFor();
  await check('MV3 service worker and real extension UI load',async()=>{
    assert.equal(await panel.locator('#templates button').count(),6);
    assert.match(await panel.locator('#accountStatus').innerText(),/未关联/);
    const behavior=await worker.evaluate(()=>chrome.sidePanel.getPanelBehavior());assert.equal(behavior.openPanelOnActionClick,true);
  });
  await panel.screenshot({path:path.join(output,'sidepanel-440.png'),fullPage:true});
  await check('Interface follows live system appearance, dark controls/dialog stay readable, card pixels stay unchanged',async()=>{
    await eventually(()=>panel.locator('#preview').evaluate(c=>c.width===2160));
    const before=await panel.locator('#preview').evaluate(c=>c.toDataURL());assert.equal(await panel.locator('#themeMode').inputValue(),'system');
    await panel.emulateMedia({colorScheme:'dark'});await eventually(()=>panel.evaluate(()=>document.documentElement.dataset.colorMode==='dark'));
    assert.equal(await panel.locator('#preview').evaluate(c=>c.toDataURL()),before);
    const contrast=await panel.locator('#body').evaluate(el=>{
      const style=getComputedStyle(el),lum=value=>{const c=value.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;};const a=lum(style.color),b=lum(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });assert.ok(contrast>=4.5);
    await panel.screenshot({path:path.join(output,'theme-dark-440.png'),fullPage:true});
    await panel.locator('#settings').click();assert.equal(await panel.locator('#profileDialog').isVisible(),true);assert.notEqual(await panel.locator('#profileDialog').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(247, 248, 247)');await panel.locator('#closeDialog').click();
    await panel.emulateMedia({colorScheme:'light'});await eventually(()=>panel.evaluate(()=>document.documentElement.dataset.colorMode==='light'));assert.equal(await panel.locator('#preview').evaluate(c=>c.toDataURL()),before);
  });
  await check('Manual theme overrides the system, survives reload, and can return to system mode',async()=>{
    await panel.emulateMedia({colorScheme:'dark'});await panel.locator('#themeMode').selectOption('light');assert.equal(await panel.evaluate(()=>document.documentElement.dataset.colorMode),'light');
    await eventually(()=>panel.evaluate(async()=>((await chrome.storage.local.get('shijuTheme')).shijuTheme)==='light'));await panel.reload();await panel.locator('#templates button').first().waitFor();assert.equal(await panel.locator('#themeMode').inputValue(),'light');assert.equal(await panel.evaluate(()=>document.documentElement.dataset.colorMode),'light');
    await panel.locator('#themeMode').selectOption('dark');await panel.emulateMedia({colorScheme:'light'});assert.equal(await panel.evaluate(()=>document.documentElement.dataset.colorMode),'dark');await eventually(()=>panel.evaluate(async()=>((await chrome.storage.local.get('shijuTheme')).shijuTheme)==='dark'));await panel.reload();await panel.locator('#templates button').first().waitFor();assert.equal(await panel.locator('#themeMode').inputValue(),'dark');assert.equal(await panel.evaluate(()=>document.documentElement.dataset.colorMode),'dark');
    await panel.locator('#themeMode').selectOption('system');await eventually(()=>panel.evaluate(()=>document.documentElement.dataset.colorMode==='light'));assert.equal(await panel.locator('#themeMode').inputValue(),'system');
  });
  await check('Export requires identity; manual profile and local avatar work',async()=>{
    await panel.locator('#export').click();assert.equal(await panel.locator('#profileDialog').isVisible(),true);
    await panel.locator('#profileName').fill('卡片测试员');await panel.locator('#profileHandle').fill('card_test');
    await panel.locator('#avatarFile').setInputFiles(path.join(root,'extension/icons/icon128.png'));
    await panel.getByRole('button',{name:'保存资料',exact:true}).click();
    await panel.locator('#profileDialog').waitFor({state:'hidden'});
    assert.equal(await panel.locator('#accountName').innerText(),'卡片测试员');assert.equal(await panel.locator('#avatar img').count(),1);
  });
  await check('Six templates render six different actual images',async()=>{
    const images=new Set();
    for(const name of ['素白','墨夜','松绿','赤陶','手札','雾蓝']){
      await panel.getByRole('button',{name:`${name}模板`,exact:true}).click();
      images.add(await panel.locator('#preview').evaluate(c=>c.toDataURL()));
      await panel.locator('#preview').screenshot({path:path.join(output,`card-${name}.png`)});
    }
    assert.equal(images.size,6);
  });
  await check('PNG download exactly matches preview pixels and uses requested resolution',async()=>{
    await panel.getByRole('button',{name:'素白模板',exact:true}).click();
    const before=await panel.locator('#preview').evaluate(c=>c.toDataURL().split(',')[1]);
    const pending=panel.waitForEvent('download');await panel.locator('#export').click();const download=await pending;
    const saved=path.join(output,'export-2160.png');await download.saveAs(saved);
    const pngBytes=await fs.readFile(saved);assert.deepEqual(pngBytes,Buffer.from(before,'base64'));assert.equal(pngBytes.readUInt32BE(16),2160);
    await panel.locator('#resolution').selectOption('3240');await eventually(()=>panel.locator('#preview').evaluate(c=>c.width===3240));
    const ultraPending=panel.waitForEvent('download');await panel.locator('#export').click();const ultra=await ultraPending;const ultraPath=path.join(output,'export-3240.png');await ultra.saveAs(ultraPath);assert.equal((await fs.readFile(ultraPath)).readUInt32BE(16),3240);
    await panel.locator('#resolution').selectOption('2160');
    await eventually(()=>panel.locator('#preview').evaluate(c=>c.width===2160));
    await panel.locator('#format').selectOption('jpeg');
    const jpgPending=panel.waitForEvent('download');await panel.locator('#export').click();const jpg=await jpgPending;const jpgPath=path.join(output,'export-2160.jpg');await jpg.saveAs(jpgPath);
    const bytes=await fs.readFile(jpgPath);assert.equal(bytes.readUInt16BE(0),0xffd8);assert.match(jpg.suggestedFilename(),/\.jpg$/);
  });
  await check('Title and body font sizes adjust independently and persist',async()=>{
    await panel.locator('#titleSize').fill('80');
    await eventually(async()=>await panel.locator('#titleSizeLabel').innerText()==='80');
    assert.equal(await panel.locator('#fontSize').inputValue(),'38');
    await panel.locator('#fontSize').fill('44');
    await eventually(async()=>await panel.locator('#fontSizeLabel').innerText()==='44');
    assert.equal(await panel.locator('#titleSize').inputValue(),'80');
    const measured=await panel.evaluate(async()=>{const {renderCard}=await import('./render.js');return renderCard(document.createElement('canvas'),{title:'独立标题',body:'独立正文',titleSize:80,fontSize:44,ratio:'auto',template:'white'});});
    assert.equal(measured.titleSize,80);assert.equal(measured.fontSize,44);
    await eventually(async()=>await panel.locator('#saveStatus').innerText()==='已保存');await panel.reload();await panel.locator('#templates button').first().waitFor();
    assert.equal(await panel.locator('#titleSize').inputValue(),'80');assert.equal(await panel.locator('#fontSize').inputValue(),'44');
    await panel.locator('#titleSize').fill('106');await panel.locator('#fontSize').fill('38');
  });
  await check('Handwritten rules align below body text at independent sizes and skip heading/blank paragraphs',async()=>{
    const cases=await panel.evaluate(async()=>{
      const {renderCard}=await import('./render.js');
      return [{titleSize:64,fontSize:32},{titleSize:128,fontSize:48}].map(sizes=>{
        const c=document.createElement('canvas');renderCard(c,{...sizes,title:'标题',body:'第一行\n第二行\n\n第三行',paragraphSpacing:0,ratio:'auto',template:'paper'});
        const ctx=c.getContext('2d'),data=ctx.getImageData(980,220,1,c.height-360).data,runs=[];
        for(let i=0;i<data.length;i+=4){const marked=Math.abs(data[i]-241)>2; if(marked && (i===0 || Math.abs(data[i-4]-241)<=2))runs.push(220+i/4);}
        return {...sizes,runs,bodyTop:239+sizes.titleSize*1.28+38};
      });
    });
    for(const item of cases){assert.equal(item.runs.length,3);assert.ok(item.runs[0]>item.bodyTop+item.fontSize);assert.ok(Math.abs((item.runs[1]-item.runs[0])-item.fontSize*1.85)<2);assert.ok(Math.abs((item.runs[2]-item.runs[1])-item.fontSize*1.85*2)<2);}
  });
  await check('Title-to-body spacing moves body/rules together and persists independently',async()=>{
    const rows=await panel.evaluate(async()=>{
      const {renderCard}=await import('./render.js');
      return [0,120].map(titleBodyGap=>{const c=document.createElement('canvas');renderCard(c,{title:'标题',body:'第一段\n\n第二段',titleSize:80,fontSize:38,titleBodyGap,paragraphSpacing:55,ratio:'auto',template:'paper'});const data=c.getContext('2d').getImageData(980,220,1,c.height-360).data,runs=[];for(let i=0;i<data.length;i+=4){if(Math.abs(data[i]-241)>2 && (i===0 || Math.abs(data[i-4]-241)<=2))runs.push(220+i/4);}return runs;});
    });
    assert.equal(rows[0].length,2);assert.equal(rows[1].length,2);for(let i=0;i<2;i++)assert.ok(Math.abs(rows[1][i]-rows[0][i]-120)<2);
    await panel.locator('#titleBodyGap').fill('120');await eventually(async()=>await panel.locator('#titleBodyGapLabel').innerText()==='120px');assert.equal(await panel.locator('#paragraphSpacing').inputValue(),'70');
    await eventually(async()=>await panel.locator('#saveStatus').innerText()==='已保存');await panel.reload();await panel.locator('#templates button').first().waitFor();assert.equal(await panel.locator('#titleBodyGap').inputValue(),'120');await panel.locator('#titleBodyGap').fill('38');
  });
  await check('Paragraph spacing affects single Enter boundaries, preserves soft wraps and blank lines, and persists',async()=>{
    const positions=await panel.evaluate(async()=>{
      const {renderCard}=await import('./render.js');
      return [0,120].map(paragraphSpacing=>{
        const c=document.createElement('canvas');renderCard(c,{title:'标题',body:'这是一段会自动折成两行的正文，用来检查段内行距不会被段间距影响。\n第二段',titleSize:80,fontSize:38,paragraphSpacing,ratio:'auto',template:'paper'});
        const data=c.getContext('2d').getImageData(980,220,1,c.height-360).data,runs=[];
        for(let i=0;i<data.length;i+=4){if(Math.abs(data[i]-241)>2 && (i===0 || Math.abs(data[i-4]-241)<=2))runs.push(220+i/4);}
        return {runs,image:c.toDataURL()};
      });
    });
    for(let i=0;i<positions.length;i++)await fs.writeFile(path.join(output,`paragraph-gap-${i===0?0:120}.png`),Buffer.from(positions[i].image.split(',')[1],'base64'));
    const rows=positions.map(p=>p.runs);
    assert.equal(rows[0].length,3);assert.equal(rows[1].length,3);assert.deepEqual(rows[0].slice(0,2),rows[1].slice(0,2));assert.ok(Math.abs(rows[1][2]-rows[0][2]-120)<2);
    const blankLines=await panel.evaluate(async()=>{
      const {renderCard}=await import('./render.js');
      return ['\n','\r\n','\n\n','\n \n'].map(separator=>{
        const c=document.createElement('canvas');renderCard(c,{title:'',body:`第一段${separator}第二段`,titleSize:80,fontSize:38,paragraphSpacing:120,ratio:'auto',template:'paper'});
        const data=c.getContext('2d').getImageData(980,220,1,c.height-360).data,runs=[];
        for(let i=0;i<data.length;i+=4)if(Math.abs(data[i]-241)>2 && (i===0 || Math.abs(data[i-4]-241)<=2))runs.push(220+i/4);
        return runs;
      });
    });
    assert.deepEqual(blankLines[0],blankLines[1]);assert.deepEqual(blankLines[2],blankLines[3]);
    assert.equal(blankLines[0].length,2);assert.equal(blankLines[2].length,2);assert.ok(Math.abs(blankLines[2][1]-blankLines[0][1]-38*1.85)<2);
    const previousBody=await panel.locator('#body').inputValue();await panel.locator('#body').fill('第一段\n第二段');await panel.locator('#paragraphSpacing').fill('0');
    await eventually(async()=>await panel.locator('#paragraphSpacingLabel').innerText()==='0px');const before=await panel.locator('#preview').evaluate(c=>c.toDataURL());
    await panel.locator('#paragraphSpacing').fill('120');await eventually(async()=>await panel.locator('#paragraphSpacingLabel').innerText()==='120px');
    assert.notEqual(await panel.locator('#preview').evaluate(c=>c.toDataURL()),before);
    assert.equal(await panel.locator('#fontSize').inputValue(),'38');assert.equal(await panel.locator('#titleSize').inputValue(),'106');
    await eventually(async()=>await panel.locator('#saveStatus').innerText()==='已保存');await panel.reload();await panel.locator('#templates button').first().waitFor();assert.equal(await panel.locator('#paragraphSpacing').inputValue(),'120');
    await panel.locator('#paragraphSpacing').fill('0');await eventually(async()=>await panel.locator('#saveStatus').innerText()==='已保存');await panel.reload();await panel.locator('#templates button').first().waitFor();assert.equal(await panel.locator('#paragraphSpacing').inputValue(),'0');
    await panel.locator('#paragraphSpacing').fill('70');await panel.locator('#body').fill(previousBody);
  });
  await check('Draft survives extension reload including avatar, format and template',async()=>{
    await panel.locator('#title').fill('夜里写给自己的一句话');await panel.getByRole('button',{name:'墨夜模板',exact:true}).click();
    await eventually(async()=>await panel.locator('#saveStatus').innerText()==='已保存');await panel.reload();
    await panel.locator('#templates button').first().waitFor();
    assert.equal(await panel.locator('#title').inputValue(),'夜里写给自己的一句话');assert.equal(await panel.locator('#format').inputValue(),'jpeg');assert.equal(await panel.locator('#avatar img').count(),1);assert.equal(await panel.getByRole('button',{name:'墨夜模板',exact:true}).getAttribute('aria-pressed'),'true');
  });
  await check('Long text fixed-ratio overflow is explicit; auto height recovers; emoji/URL wrap intact',async()=>{
    await panel.locator('#title').fill('中文 English 👨‍👩‍👧‍👦');await panel.locator('#body').fill(('长段落文字与 https://example.com/verylongpath 👩🏽‍💻\n').repeat(35));
    await panel.locator('#ratio').selectOption('square');await eventually(async()=>await panel.locator('#export').isDisabled());assert.match(await panel.locator('#notice').innerText(),/自动高度/);
    await panel.locator('#ratio').selectOption('auto');await eventually(async()=>await panel.locator('#export').isEnabled());
    const dimensions=await panel.locator('#preview').evaluate(c=>({width:c.width,height:c.height}));assert.ok(dimensions.height>dimensions.width);
    const wrapped=await panel.evaluate(async()=>{const {wrapText}=await import('./render.js');const ctx=document.createElement('canvas').getContext('2d');ctx.font='30px sans-serif';return wrapText(ctx,'👨‍👩‍👧‍👦'.repeat(5),35);});assert.ok(wrapped.every(x=>x==='👨‍👩‍👧‍👦'));
  });
  await check('Empty title and body cannot produce an empty export',async()=>{
    await panel.locator('#title').fill('');await panel.locator('#body').fill('');await eventually(async()=>await panel.locator('#titleCount').innerText()==='0/80');
    await panel.locator('#export').click();assert.match(await panel.locator('#notice').innerText(),/先写一点文字/);
  });
  await check('320px, 440px and desktop layouts have no horizontal overflow',async()=>{
    for(const theme of ['light','dark']){await panel.locator('#themeMode').selectOption(theme);for(const width of [320,440,1280]){await panel.setViewportSize({width,height:1200});assert.equal(await panel.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}}await panel.locator('#themeMode').selectOption('system');
    await panel.setViewportSize({width:440,height:1200});
  });
  // Intercept the public page only; no user browser session, credentials or live X account is involved.
  const avatarBytes=await fs.readFile(path.join(root,'extension/icons/icon128.png'));
  await worker.evaluate(png=>{globalThis.fetch=async()=>new Response(Uint8Array.from(atob(png),c=>c.charCodeAt(0)),{headers:{'content-type':'image/png'}});},avatarBytes.toString('base64'));
  await check('High-resolution X avatar is requested first and original URL remains a working fallback',async()=>{
    const result=await worker.evaluate(async png=>{
      const original=fetch,calls=[];
      globalThis.fetch=async url=>{calls.push(url);return url.includes('_400x400')?new Response('',{status:404}):new Response(Uint8Array.from(atob(png),c=>c.charCodeAt(0)),{headers:{'content-type':'image/png'}});};
      try{return {data:await imageData('https://pbs.twimg.com/profile_images/1/avatar_normal.jpg'),calls};}finally{globalThis.fetch=original;}
    },avatarBytes.toString('base64'));
    assert.equal(result.calls.length,2);assert.match(result.calls[0],/_400x400\.jpg$/);assert.match(result.calls[1],/_normal\.jpg$/);assert.equal(result.data,`data:image/png;base64,${avatarBytes.toString('base64')}`);
  });
  await context.route('https://pbs.twimg.com/**',route=>route.fulfill({contentType:'image/png',body:avatarBytes}));
  await context.route('https://x.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body><a data-testid="AppTabBar_Profile_Link" href="/logged_in">Profile</a><button data-testid="SideNav_AccountSwitcher_Button"><img src="https://pbs.twimg.com/profile_images/1/test_normal.png"><div>-</div><div>登录账号</div><div>@logged_in</div></button><div data-testid="UserName">被浏览的其他人 @other_user</div></body></html>'}));
  const x=await context.newPage();await x.goto('https://x.com/other_user');
  await check('Account reader uses logged-in account, never viewed profile',async()=>{
    await x.locator('[data-testid="SideNav_AccountSwitcher_Button"]').waitFor();
    // Content scripts run in the isolated world: ask through the extension bridge.
    const result=await panel.evaluate(()=>chrome.runtime.sendMessage({type:'SYNC_ACCOUNT'}));
    assert.equal(result.account.handle,'logged_in');assert.equal(result.account.name,'登录账号');assert.equal(result.account.url,'https://x.com/logged_in');
    assert.equal(result.account.avatarData,`data:image/png;base64,${avatarBytes.toString('base64')}`);
    await eventually(async()=>await panel.locator('#accountHandle').innerText()==='@logged_in');
  });
  await check('Live account switch updates identity automatically',async()=>{
    await x.evaluate(()=>{document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]').innerHTML='<div>另一个账号</div><div>@new_account</div>';document.querySelector('[data-testid="AppTabBar_Profile_Link"]').setAttribute('href','/new_account');});
    await eventually(async()=>await panel.locator('#accountHandle').innerText()==='@new_account');
    assert.equal(await panel.locator('#accountHandle').getAttribute('href'),'https://x.com/new_account');
  });
  await check('Missing login entry never falls back to viewed user and is labeled unverified',async()=>{
    await x.evaluate(()=>document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]').remove());
    const result=await panel.evaluate(()=>chrome.runtime.sendMessage({type:'SYNC_ACCOUNT'}));assert.ok(result.error);
    await eventually(async()=>/未确认/.test(await panel.locator('#accountStatus').innerText()));
    assert.equal(await panel.locator('#accountHandle').innerText(),'@new_account');
  });
  await check('Unsafe avatar origins, HTML titles and script strings are inert',async()=>{
    const safety=await panel.evaluate(()=>({bad:XCardAccount.avatarURL('https://evil.example/profile_images/1.png'),spoof:XCardAccount.avatarURL('https://pbs.twimg.com.evil.test/profile_images/1.png'),good:XCardAccount.avatarURL('https://pbs.twimg.com/profile_images/1/a_normal.jpg')}));
    assert.equal(safety.bad,'');assert.equal(safety.spoof,'');assert.ok(safety.good);
    await panel.locator('#title').fill('<img src=x onerror=alert(1)>');await panel.locator('#body').fill('<script>window.hacked=true</script>');
    assert.equal(await panel.evaluate(()=>Boolean(window.hacked)),false);assert.equal(await panel.locator('.editor img').count(),0);
  });
  await check('Hover export controls attach once to dynamically loaded tweets',async()=>{
    await worker.evaluate(()=>{chrome.sidePanel.open=async()=>{globalThis.shijuPanelOpenRequested=true;};});
    await x.evaluate(()=>{
      const article=document.createElement('article');article.dataset.testid='tweet';article.id='source-tweet';article.style.cssText='min-height:220px;padding:20px;margin-top:30px';
      article.innerHTML='<div data-testid="UserAvatar-Container-the_author"><img src="https://pbs.twimg.com/profile_images/1/author.png" width="40"></div><div data-testid="User-Name"><a href="/the_author">原作者</a><a href="/the_author/status/1234567890123456789"><time>2026-10-21</time></a></div><div data-testid="tweetText">这是原作者的推文。<br><br>保留原文，也保留出处。</div><div data-testid="quoteTweet" role="link"><div data-testid="tweetText">被引用的文字不能混入正文</div></div>';
      document.body.append(article);
    });
    await x.locator('#source-tweet > .shiju-tweet-export').waitFor({state:'attached'});
    await x.locator('#source-tweet').hover();assert.equal(await x.locator('#source-tweet > .shiju-tweet-export').isVisible(),true);
    await x.evaluate(()=>document.querySelector('#source-tweet').append(document.createElement('span')));
    assert.equal(await x.locator('#source-tweet > .shiju-tweet-export').count(),1);
  });
  await check('One-click tweet export preserves original author/text/link and uses current template',async()=>{
    await panel.locator('#title').fill('我的草稿还在');await panel.locator('#body').fill('自己的文字');await panel.getByRole('button',{name:'手札模板',exact:true}).click();
    const pending=panel.waitForEvent('download');await x.locator('#source-tweet > .shiju-tweet-export').click();const download=await pending;
    await download.saveAs(path.join(output,`tweet-one-click${path.extname(download.suggestedFilename())}`));assert.match(download.suggestedFilename(),/the_author/);
    assert.equal(await panel.locator('#accountHandle').innerText(),'@new_account');assert.equal(await panel.locator('#sourceLink').getAttribute('href'),'https://x.com/the_author/status/1234567890123456789');
    assert.equal(await panel.locator('#title').inputValue(),'');assert.equal(await panel.locator('#body').inputValue(),'这是原作者的推文。\n\n保留原文，也保留出处。');
    assert.match(await panel.locator('#preview').getAttribute('aria-label'),/^原作者的卡片/);
    const pixel=await panel.locator('#preview').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,1,1).data));assert.deepEqual(pixel,[241,236,223,255]);
    assert.equal(await worker.evaluate(()=>globalThis.shijuPanelOpenRequested),true);
    await panel.screenshot({path:path.join(output,'tweet-export-sidepanel.png'),fullPage:true});
  });
  await check('Returning from a tweet restores personal draft without changing linked account or re-exporting',async()=>{
    await panel.locator('#restoreDraft').click();assert.equal(await panel.locator('#title').inputValue(),'我的草稿还在');assert.equal(await panel.locator('#body').inputValue(),'自己的文字');assert.equal(await panel.locator('#tweetSource').isVisible(),false);assert.equal(await panel.locator('#accountHandle').innerText(),'@new_account');
    await eventually(async()=>await panel.locator('#saveStatus').innerText()==='已保存');await panel.reload();await panel.locator('#templates button').first().waitFor();assert.equal(await panel.locator('#body').inputValue(),'自己的文字');assert.equal(await panel.locator('#tweetSource').isVisible(),false);
  });
  await check('Media-only, quoted-only and collapsed tweets are rejected without overwriting draft',async()=>{
    await x.evaluate(()=>{document.querySelector('#source-tweet > [data-testid="tweetText"]').remove();});
    await x.locator('#source-tweet').hover();await x.locator('#source-tweet > .shiju-tweet-export').click();await eventually(async()=>await x.locator('.shiju-page-toast').innerText()==='这条推文没有可导出的文字。');
    assert.equal(await panel.locator('#body').inputValue(),'自己的文字');
    await x.evaluate(()=>{const more=document.createElement('button');more.dataset.testid='tweet-text-show-more-link';more.textContent='显示更多';document.querySelector('#source-tweet').append(more);});
    await eventually(async()=>await x.locator('#source-tweet > .shiju-tweet-export').isEnabled());await x.locator('#source-tweet > .shiju-tweet-export').click();await eventually(async()=>/先展开/.test(await x.locator('.shiju-page-toast').innerText()));
  });
  await check('Existing low-resolution draft upgrades to lossless HD while new explicit settings persist',async()=>{
    const saved=await panel.evaluate(async()=>{const {shijuDraft}=await chrome.storage.local.get('shijuDraft');return shijuDraft;});
    await panel.evaluate(()=>chrome.storage.local.set({shijuDraft:{title:'旧标题',body:'旧正文',fontSize:38,resolution:1080,format:'jpeg'}}));await panel.reload();await panel.locator('#templates button').first().waitFor();
    assert.equal(await panel.locator('#resolution').inputValue(),'2160');assert.equal(await panel.locator('#format').inputValue(),'png');assert.equal(await panel.locator('#body').inputValue(),'旧正文');
    await panel.locator('#resolution').selectOption('1080');await panel.locator('#format').selectOption('jpeg');await eventually(async()=>await panel.locator('#saveStatus').innerText()==='已保存');await panel.reload();await panel.locator('#templates button').first().waitFor();assert.equal(await panel.locator('#resolution').inputValue(),'1080');assert.equal(await panel.locator('#format').inputValue(),'jpeg');
    await panel.evaluate(value=>chrome.storage.local.set({shijuDraft:value}),saved);await panel.reload();await panel.locator('#templates button').first().waitFor();
  });
  await check('No application JavaScript errors',async()=>assert.deepEqual(errors,[]));
  await panel.locator('#title').fill('把想法，留在这一刻。');await panel.locator('#body').fill('好的表达，不必很大声。\n\n记下一个念头，分享一点日常。\n让文字有自己的样子。');await panel.locator('#resolution').selectOption('1080');await panel.locator('#format').selectOption('png');await panel.getByRole('button',{name:'素白模板',exact:true}).click();
  await eventually(async()=>await panel.locator('#saveStatus').innerText()==='已保存');await panel.screenshot({path:path.join(output,'extension-final-440.png'),fullPage:true});
  await fs.writeFile(path.join(output,'results.json'),JSON.stringify({results,output,liveAccount:false},null,2));console.log(`QA_OUTPUT=${output}`);
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(context)await context.close();});
