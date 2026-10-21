// Generate documentation from the actual extension in an isolated Chrome profile.
const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const root=path.resolve(__dirname,'..');
const assets=path.join(root,'docs/images');
let context;
async function main(){
  await fs.mkdir(assets,{recursive:true});
  const profile=await fs.mkdtemp(path.join(os.tmpdir(),'shiju-docs-'));
  context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,viewport:{width:440,height:1500},deviceScaleFactor:2,args:[`--disable-extensions-except=${path.join(root,'extension')}`,`--load-extension=${path.join(root,'extension')}`]});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const base=`chrome-extension://${new URL(worker.url()).host}`;
  const panel=await context.newPage();await panel.goto(`${base}/sidepanel.html`);
  await panel.locator('#templates button').first().waitFor();
  await panel.locator('#settings').click();
  await panel.locator('#profileName').fill('拾句示例');await panel.locator('#profileHandle').fill('yourname');
  await panel.locator('#avatarFile').setInputFiles(path.join(root,'extension/icons/icon128.png'));
  await panel.getByRole('button',{name:'保存资料',exact:true}).click();
  await panel.locator('#profileDialog').waitFor({state:'hidden'});
  await panel.locator('#title').fill('把想法，留在这一刻。');
  await panel.locator('#body').fill('好的表达，不必很大声。\n记下一个念头，分享一点日常。\n让文字有自己的样子。');
  await panel.locator('#titleSize').fill('92');await panel.locator('#paragraphSpacing').fill('38');
  await panel.locator('#themeMode').selectOption('light');
  await panel.waitForFunction(()=>document.querySelector('#saveStatus').textContent==='已保存'&&document.querySelector('#paragraphSpacingLabel').textContent==='38px');
  await panel.screenshot({path:path.join(assets,'sidepanel-light.png'),fullPage:true});
  await panel.locator('#themeMode').selectOption('dark');
  await panel.screenshot({path:path.join(assets,'sidepanel-dark.png'),fullPage:true});
  const cards=await panel.evaluate(async()=>{
    const {templates,renderCard,loadAvatar}=await import('./render.js');
    const {shijuDraft}=await chrome.storage.local.get('shijuDraft');
    const avatar=await loadAvatar(shijuDraft.account.avatarData);
    return templates.map(t=>{const c=document.createElement('canvas');renderCard(c,{...shijuDraft,template:t.id},avatar,1080);return {name:t.name,image:c.toDataURL()};});
  });
  const stage=await context.newPage();await stage.setViewportSize({width:1440,height:1200});
  await stage.setContent(`<html lang="zh-CN"><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:64px;background:#eef1ed;color:#173e34;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}header{display:flex;align-items:end;justify-content:space-between;margin-bottom:36px}h1{font-size:42px;margin:0;font-weight:600}header p{font-size:18px;color:#6d7772;margin:0}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:32px}figure{margin:0}img{width:100%;display:block;border-radius:4px;box-shadow:0 8px 24px #173e3410}figcaption{font-size:18px;margin-top:14px;text-align:center}</style></head><body><header><h1>拾句 · 六种文字的底色</h1><p>真实卡片渲染 · 演示账号</p></header><div class="grid">${cards.map(c=>`<figure><img src="${c.image}"><figcaption>${c.name}</figcaption></figure>`).join('')}</div></body></html>`);
  await stage.screenshot({path:path.join(assets,'templates.png'),fullPage:true});
  const icon=(await fs.readFile(path.join(root,'extension/icons/icon128.png'))).toString('base64');
  await context.route('https://x.com/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>body{margin:0;padding:48px;background:#f7f8f7;color:#202923;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}h1{font-size:24px;margin:0 0 10px}p.note{color:#6d7772;font-size:14px;margin-bottom:30px}article{background:white;border:1px solid #e4e7e5;border-radius:16px;padding:28px;min-height:300px}.author{display:flex;gap:14px;align-items:center}.author img{width:48px;height:48px;border-radius:50%}.author a{color:#202923;text-decoration:none}.muted{color:#85918a;font-size:14px}time{font-size:13px}div[data-testid=tweetText]{font-size:19px;line-height:1.9;margin-top:26px}footer{color:#6d7772;font-size:13px;margin-top:36px}</style></head><body><h1>把一条推文，留成一张卡片</h1><p class="note">演示页面 · 示例作者与文字，非真实 X 动态</p><article data-testid="tweet"><div class="author"><div data-testid="UserAvatar-Container-yourname"><img src="data:image/png;base64,${icon}"></div><div data-testid="User-Name"><a href="/yourname"><strong>示例作者</strong></a><div class="muted">@yourname · <a href="/yourname/status/1234567890123456789"><time>10 月 21 日</time></a></div></div></div><div data-testid="tweetText">好的表达，不必很大声。<br><br>记下一个念头，分享一点日常。<br>让文字有自己的样子。</div></article><footer>悬停推文 → 点击「导出卡片」→ 使用当前模板生成图片，保留原作者与出处</footer></body></html>`}));
  const tweet=await context.newPage();await tweet.setViewportSize({width:820,height:620});await tweet.goto('https://x.com/home');
  await tweet.locator('.shiju-tweet-export').waitFor({state:'attached'});await tweet.locator('article').hover();
  await tweet.waitForFunction(()=>getComputedStyle(document.querySelector('.shiju-tweet-export')).opacity==='1');
  await tweet.screenshot({path:path.join(assets,'tweet-export.png'),fullPage:true});
  console.log('Documentation screenshots saved to docs/images');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(context)await context.close();});
