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
// Font caches can change a handful of antialiasing channels by 1/255 across redraws.
// Keep geometry exact and tolerate only that tiny raster rounding difference.
async function sameCard(page,expected,actual=null) {
  const difference=await page.evaluate(async({expected,actual})=>{
    const read=async src=>{const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return {width:c.width,height:c.height,data:ctx.getImageData(0,0,c.width,c.height).data};};
    const a=await read(expected),b=await read(actual||document.querySelector('#preview').toDataURL());
    if(a.width!==b.width||a.height!==b.height)return {sameSize:false};
    let changed=0,max=0;for(let i=0;i<a.data.length;i++)if(a.data[i]!==b.data[i]){changed++;max=Math.max(max,Math.abs(a.data[i]-b.data[i]));}
    return {sameSize:true,changed,max,channels:a.data.length};
  },{expected,actual});
  assert.ok(difference.sameSize && difference.changed<=difference.channels*0.0001 && difference.max<=1,`Card image changed: ${JSON.stringify(difference)}`);
}
async function main(){
  await fs.mkdir(output,{recursive:true});
  const userData=await fs.mkdtemp(path.join(os.tmpdir(),'shiju-chrome-'));
  context=await chromium.launchPersistentContext(userData,{channel:'chromium',headless:true,acceptDownloads:true,viewport:{width:440,height:1200},timezoneId:'Asia/Shanghai',args:[`--disable-extensions-except=${path.join(root,'extension')}`,`--load-extension=${path.join(root,'extension')}`]});
  const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;
  const panel=await context.newPage();
  const clockStart=new Date();await panel.clock.setFixedTime(clockStart);
  const errors=[];panel.on('pageerror',e=>errors.push(e.message));
  await panel.goto(`chrome-extension://${id}/sidepanel.html`);
  await panel.locator('#templates button').first().waitFor();
  await check('MV3 service worker and real extension UI load',async()=>{
    assert.equal(await panel.locator('#templates button').count(),6);
    await eventually(async()=>/未关联/.test(await panel.locator('#accountStatus').innerText()));
    assert.equal(await panel.locator('#avatar img[src="icons/icon128.png"]').count(),1);
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
  await check('Header logo and repository link are present and safe to open',async()=>{
    assert.equal(await panel.locator('.brand-logo').evaluate(img=>img.complete && img.naturalWidth>0),true);
    assert.equal(await panel.locator('#repository').getAttribute('href'),'https://github.com/zkilxx/shiju-x-card');
    assert.equal(await panel.locator('#repository').getAttribute('target'),'_blank');
    assert.match(await panel.locator('#repository').getAttribute('rel'),/noopener/);assert.equal(await panel.locator('#repository svg path').count(),1);
  });
  await check('English interface persists independently without changing profile, draft or card pixels',async()=>{
    await eventually(async()=>await panel.locator('#saveStatus').innerText()==='已保存');
    const before=await panel.evaluate(async()=>({draft:(await chrome.storage.local.get('shijuDraft')).shijuDraft,image:document.querySelector('#preview').toDataURL(),theme:document.querySelector('#themeMode').value}));
    await panel.locator('#languageMode').selectOption('en');await eventually(async()=>await panel.locator('#export span').innerText()==='Export card');
    assert.equal(await panel.locator('html').getAttribute('lang'),'en');assert.equal(await panel.locator('.brand h1').innerText(),'拾句');
    assert.equal(await panel.locator('#accountName').innerText(),'卡片测试员');assert.match(await panel.locator('#accountStatus').innerText(),/Manual profile/);
    assert.equal(await panel.getByRole('button',{name:'Notebook template',exact:true}).count(),1);
    await fs.writeFile(path.join(output,'language-before.png'),Buffer.from(before.image.split(',')[1],'base64'));const after=await panel.locator('#preview').evaluate(c=>c.toDataURL());await fs.writeFile(path.join(output,'language-after.png'),Buffer.from(after.split(',')[1],'base64'));await sameCard(panel,before.image,after);assert.equal(await panel.locator('#themeMode').inputValue(),before.theme);
    await panel.locator('#settings').click();assert.equal(await panel.locator('#profileDialog h2').innerText(),'Account profile');assert.equal(await panel.locator('#profileName').getAttribute('placeholder'),'Your display name');await panel.locator('#closeDialog').click();
    await eventually(()=>panel.evaluate(async()=>((await chrome.storage.local.get('shijuLanguage')).shijuLanguage)==='en'));
    await panel.reload();await panel.getByRole('button',{name:'Notebook template',exact:true}).waitFor();
    assert.equal(await panel.locator('#languageMode').inputValue(),'en');assert.equal(await panel.locator('#accountName').innerText(),'卡片测试员');
    assert.deepEqual(await panel.evaluate(async()=>((await chrome.storage.local.get('shijuDraft')).shijuDraft)),before.draft);
    await sameCard(panel,before.image);
    await panel.locator('#sync').click();await eventually(async()=>/Open X in this window/.test(await panel.locator('#notice').innerText()));
    for(const width of [320,440,1000]){
      await panel.setViewportSize({width,height:1200});
      assert.ok(await panel.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`English UI overflows at ${width}px`);
      const thumbnails=await panel.locator('.swatch').evaluateAll(tiles=>tiles.every(tile=>{
        const box=tile.getBoundingClientRect();return [...tile.children].every(child=>{
          const r=child.getBoundingClientRect();if(r.left<box.left||r.right>box.right||r.top<box.top||r.bottom>box.bottom)return false;
          if(child.classList.contains('swatch-title')){const range=document.createRange();range.selectNodeContents(child);return [...range.getClientRects()].every(line=>line.left>=box.left&&line.right<=box.right&&line.bottom<=box.bottom);}
          return true;
        });
      }));assert.equal(thumbnails,true,`Template content overflows at ${width}px`);
      const controls=await panel.locator('.toolbar select,.typography-controls input,.export-options select').evaluateAll(els=>els.every(el=>{const r=el.getBoundingClientRect();return r.width>15&&r.left>=0&&r.right<=innerWidth;}));assert.equal(controls,true);
    }
    await panel.setViewportSize({width:440,height:1200});await panel.screenshot({path:path.join(output,'english-440.png'),fullPage:true});
    const pending=panel.waitForEvent('download');await panel.locator('#export').click();const download=await pending;await download.saveAs(path.join(output,'english-export.png'));await sameCard(panel,before.image,'data:image/png;base64,'+(await fs.readFile(path.join(output,'english-export.png'))).toString('base64'));
    await panel.locator('#languageMode').selectOption('zh-CN');await eventually(async()=>await panel.locator('#export span').innerText()==='导出卡片');
  });
  await check('Every card includes the full repository address and GitHub icon below the brand',async()=>{
    const cases=await panel.evaluate(async()=>{
      const {templates,renderCard}=await import('./render.js');
      return templates.map(template=>{
        const c=document.createElement('canvas'),ctx=c.getContext('2d'),calls=[],original=ctx.fillText;
        ctx.fillText=function(text,x,y,...rest){calls.push({text,x,y,width:this.measureText(text).width});return original.call(this,text,x,y,...rest);};
        const url='https://x.com/the_author/status/1234567890123456789';
        renderCard(c,{title:'标题',body:'正文',fontSize:38,titleSize:80,template:template.id,ratio:'auto',tweetSource:{url,publishedAt:'2026-10-21T03:04:05.000Z',account:{name:'原作者',handle:'the_author'}}});
        const repo=calls.find(call=>call.text==='github.com/zkilxx/shiju-x-card'),brand=calls.find(call=>call.text==='拾句'),link=calls.find(call=>call.text===url.replace('https://',''));
        const icon=ctx.getImageData(Math.floor(repo.x-20),Math.floor(repo.y+2),14,14).data,bg=ctx.getImageData(0,0,1,1).data;let ink=0;
        for(let i=0;i<icon.length;i+=4)if(Math.abs(icon[i]-bg[0])+Math.abs(icon[i+1]-bg[1])+Math.abs(icon[i+2]-bg[2])>12)ink++;
        return {repo,brand,link,height:c.height,ink};
      });
    });
    for(const c of cases){assert.ok(c.repo&&c.brand&&c.link);assert.ok(c.repo.y>c.brand.y+30);assert.ok(c.repo.x>88);assert.ok(c.repo.x+c.repo.width<=993);assert.ok(c.repo.y+22<c.height);assert.ok(c.ink>50);}
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
  await check('Personal cards record each export click time and refresh the matching preview',async()=>{
    const downloads=[];
    for(const offset of [0,65000]) {
      const when=new Date(clockStart.getTime()+offset);await panel.clock.setFixedTime(when);
      const pending=panel.waitForEvent('download');await panel.locator('#export').click();const download=await pending;
      assert.ok(download.suggestedFilename().includes(when.toISOString().replace(/[:.]/g,'-')));
      const draft=await panel.evaluate(async()=>((await chrome.storage.local.get('shijuDraft')).shijuDraft));
      assert.equal(draft.exportedAt,undefined);
      const {renderCard,formatTimestamp}=await panel.evaluate(async()=>({renderCard:typeof (await import('./render.js')).renderCard,formatTimestamp:(await import('./render.js')).formatTimestamp(new Date().toISOString())}));
      assert.equal(renderCard,'function');assert.match(formatTimestamp,/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
      downloads.push(await panel.locator('#preview').evaluate(c=>c.toDataURL()));
      await download.saveAs(path.join(output,`timestamp-${offset}.jpg`));
    }
    assert.notEqual(downloads[0],downloads[1]);
    await panel.clock.setFixedTime(clockStart);await panel.reload();await panel.locator('#templates button').first().waitFor();
  });
  await check('Publication time comes from the original time element and invalid metadata never falls back to export time',async()=>{
    const parsed=await panel.evaluate(()=>{
      const article=document.createElement('article');article.dataset.testid='tweet';
      article.innerHTML='<div data-testid="quoteTweet"><a href="/quoted/status/999"><time datetime="2020-01-01T00:00:00Z">quoted</time></a></div><div data-testid="User-Name"><a href="/author">Author</a><a href="/author/status/1234567890123456789"><time datetime="2026-10-21T11:04:05+08:00">2h</time></a></div><div data-testid="tweetText">Original words</div>';
      const tweet=XCardAccount.readTweet(article);article.querySelector('[data-testid="User-Name"] time').removeAttribute('datetime');
      let error;try{XCardAccount.readTweet(article);}catch(e){error=e.message;}
      return {tweet,error,bad:XCardAccount.timestamp('2026-10-21 11:04:05')};
    });
    assert.equal(parsed.tweet.publishedAt,'2026-10-21T03:04:05.000Z');assert.equal(parsed.tweet.account.handle,'author');assert.match(parsed.error,/发布时间/);assert.equal(parsed.bad,null);
    const prepared=await worker.evaluate(async tweet=>prepareTweet(tweet),parsed.tweet);assert.equal(prepared.publishedAt,'2026-10-21T03:04:05.000Z');assert.notEqual(prepared.createdAt,Date.parse(prepared.publishedAt));
    const error=await worker.evaluate(async tweet=>{delete tweet.publishedAt;try{await prepareTweet(tweet);}catch(e){return e.message;}},parsed.tweet);assert.match(error,/发布时间/);
  });
  await check('Timestamp and rounded X badge render below/alongside the link without touching GitHub branding',async()=>{
    const cases=await panel.evaluate(async()=>{
      const {renderCard,formatTimestamp,templates}=await import('./render.js');
      const formatted=formatTimestamp('2026-10-21T20:04:05.000Z');
      return {formatted,cards:templates.map(template=>{
        const c=document.createElement('canvas'),ctx=c.getContext('2d'),calls=[],original=ctx.fillText;
        ctx.fillText=function(text,x,y,maxWidth){calls.push({text,x,y,width:this.measureText(text).width,maxWidth});return original.call(this,text,x,y,...(maxWidth===undefined?[]:[maxWidth]));};
        renderCard(c,{title:'Title',body:'Body',titleSize:80,fontSize:38,template:template.id,ratio:'auto',exportedAt:'2026-10-21T20:04:05.000Z'});
        const stamp=calls.find(call=>call.text===formatted),link=calls.find(call=>call.text==='x.com/yourname'),repo=calls.find(call=>call.text==='github.com/zkilxx/shiju-x-card');
        const data=ctx.getImageData(88,c.height-139+34,30,30).data;let black=0,white=0;
        for(let i=0;i<data.length;i+=4){if(data[i]===17&&data[i+1]===17&&data[i+2]===17)black++;if(data[i]>245&&data[i+1]>245&&data[i+2]>245)white++;}
        return {stamp,link,repo,black,white};
      })};
    });
    assert.equal(cases.formatted,'2026-10-22 04:04');
    for(const c of cases.cards){assert.ok(c.stamp&&c.link&&c.repo);assert.equal(c.stamp.x,88);assert.equal(c.link.x,130);assert.ok(c.stamp.y>c.link.y+30);assert.ok(c.stamp.width<=c.stamp.maxWidth);assert.ok(c.stamp.x+c.stamp.width<c.repo.x-25);assert.ok(c.black>300);assert.ok(c.white>20);}
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
      article.innerHTML='<div data-testid="UserAvatar-Container-the_author"><img src="https://pbs.twimg.com/profile_images/1/author.png" width="40"></div><div data-testid="User-Name"><a href="/the_author">原作者</a><a href="/the_author/status/1234567890123456789"><time datetime="2026-10-21T03:04:05.000Z">2026-10-21</time></a></div><div data-testid="tweetText">这是原作者的推文。<br><br>保留原文，也保留出处。</div><div data-testid="quoteTweet" role="link"><div data-testid="tweetText">被引用的文字不能混入正文</div></div>';
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
    await eventually(async()=>await panel.evaluate(async()=>((await chrome.storage.local.get('shijuDraft')).shijuDraft?.tweetSource?.publishedAt))==='2026-10-21T03:04:05.000Z');
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
  await check('Existing and new tweet buttons follow language changes and show English errors',async()=>{
    const body=await panel.locator('#body').inputValue();
    await panel.locator('#languageMode').selectOption('en');
    await eventually(async()=>await x.locator('#source-tweet > .shiju-tweet-export').innerText()==='Export card');
    assert.equal(await x.locator('#source-tweet > .shiju-tweet-export').getAttribute('aria-label'),'Export this post as a text card');
    await eventually(async()=>await x.locator('#source-tweet > .shiju-tweet-export').isEnabled());await x.locator('#source-tweet > .shiju-tweet-export').click();
    await eventually(async()=>await x.locator('.shiju-page-toast').innerText()==='Expand the full post before exporting it.');
    await x.evaluate(()=>{const copy=document.querySelector('#source-tweet').cloneNode(true);copy.id='english-tweet';copy.querySelector('.shiju-tweet-export').remove();document.body.append(copy);});
    await x.locator('#english-tweet').hover();
    await eventually(async()=>await x.locator('#english-tweet > .shiju-tweet-export').innerText()==='Export card');
    assert.equal(await panel.locator('#body').inputValue(),body);
    await panel.locator('#languageMode').selectOption('zh-CN');await eventually(async()=>await x.locator('#english-tweet > .shiju-tweet-export').innerText()==='导出卡片');
  });
  await check('Legacy imported drafts without publication metadata cannot export a fabricated timestamp',async()=>{
    const saved=await panel.evaluate(async()=>((await chrome.storage.local.get('shijuDraft')).shijuDraft));
    await panel.evaluate(draft=>chrome.storage.local.set({shijuDraft:{...draft,tweetSource:{url:'https://x.com/author/status/1234567890123456789',account:{name:'Author',handle:'author'}}}}),saved);
    await panel.reload();await panel.locator('#templates button').first().waitFor();
    await eventually(async()=>/缺少发布时间/.test(await panel.locator('#notice').innerText()));assert.equal(await panel.locator('#export').isDisabled(),true);
    await panel.evaluate(draft=>chrome.storage.local.set({shijuDraft:draft}),saved);await panel.reload();await panel.locator('#templates button').first().waitFor();
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
