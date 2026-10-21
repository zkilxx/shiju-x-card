(() => {
  if(globalThis.ShijuI18n)return;
  const english={
  "未读到这条推文的发布时间，请刷新 X 页面后重试。":"Could not read the publication time. Refresh X and try again.",
  "这张推文卡片缺少发布时间，请返回 X 重新生成。":"This saved post has no publication time. Return to X and generate the card again.",
  "插件已更新，请刷新 X 页面后重试。":"The extension was updated. Refresh X and try again.",
  "拾句 · X 文字卡片": "Shiju · X Text Cards",
  "拾句": "Shiju",
  "界面主题": "Appearance",
  "语言": "Language",
  "跟随系统": "System",
  "浅色": "Light",
  "深色": "Dark",
  "打开 GitHub 仓库": "Open GitHub repository",
  "编辑账号资料": "Edit account profile",
  "当前账号": "Current account",
  "示例账号": "Demo account",
  "未关联 · 打开 X 后同步": "Not linked · Open X to sync",
  "同步当前 X 账号": "Sync current X account",
  "模板": "Templates",
  "卡片模板": "Card templates",
  "素白": "White",
  "墨夜": "Ink",
  "松绿": "Forest",
  "赤陶": "Terracotta",
  "手札": "Notebook",
  "雾蓝": "Mist",
  "{name}模板": "{name} template",
  "把想法，": "A thought,",
  "留在这一刻。": "to keep.",
  "当前推文来源": "Source post",
  "原推文": "Original post",
  "原推文 · @{handle}": "Original post · @{handle}",
  "返回我的草稿": "Back to my draft",
  "文字": "Text",
  "本机草稿": "Local draft",
  "标题": "Title",
  "（选填）": "(optional)",
  "给这张卡片一个标题": "Give your card a title",
  "正文": "Body",
  "写下想分享的文字……": "Write something worth sharing…",
  "预览": "Preview",
  "卡片比例": "Card aspect ratio",
  "自动高度": "Auto height",
  "正方形 1:1": "Square 1:1",
  "竖版 4:5": "Portrait 4:5",
  "卡片实时预览": "Live card preview",
  "标题字号": "Title size",
  "正文字号": "Body size",
  "段间距": "Paragraph gap",
  "标题到正文": "Title–body gap",
  "标题到正文间距": "Title–body gap",
  "回车即分段，调节段落之间的额外留白；自动换行的行距不变，按 1080px 宽度计算": "Enter starts a paragraph. Adjust extra space between paragraphs; wrapped-line spacing stays unchanged. Values use a 1080px card width.",
  "标题与正文之间的距离，按 1080px 卡片宽度计算": "Space between the title and body, measured at a 1080px card width.",
  "导出格式": "Format",
  "宽度": "Width",
  "2160px · 高清": "2160px · HD",
  "3240px · 超清": "3240px · Ultra HD",
  "导出卡片": "Export card",
  "草稿自动保存在本机": "Drafts are saved on this device",
  "账号资料": "Account profile",
  "关闭": "Close",
  "可从当前 X 账号同步，也可以手动填写。": "Sync your current X account or enter your profile manually.",
  "昵称": "Display name",
  "你的昵称": "Your display name",
  "X ID": "X handle",
  "头像（选填）": "Avatar (optional)",
  "主页链接将自动显示为 x.com/你的ID。": "Your profile link appears as x.com/yourhandle.",
  "保存资料": "Save profile",
  "已保存": "Saved",
  "保存失败": "Save failed",
  "正在保存…": "Saving…",
  "本机存储空间不足，当前草稿尚未保存，请先导出图片。": "Device storage is full. This draft has not been saved; export your image first.",
  "已返回你自己的卡片草稿。": "Your own card draft has been restored.",
  "推文导出失败：{error}": "Post export failed: {error}",
  "导出失败：{error}": "Export failed: {error}",
  "打开失败：{error}": "Could not open: {error}",
  " · 字号已适配": " · Text resized to fit",
  "{name}的卡片：{title}。{body}": "Card by {name}: {title}. {body}",
  "文字超出尺寸 · 上次有效预览": "Text does not fit · Last valid preview",
  "上次同步资料 · 待确认当前账号": "Cached profile · Current account not verified",
  "手动资料 · 可同步 X 账号": "Manual profile · Sync X anytime",
  "网页预览无法读取 X。安装插件后可同步，或点击右上角填写账号资料。": "Web preview cannot read X. Install the extension to sync, or enter your profile using the settings button.",
  "正在读取当前 X 账号…": "Reading current X account…",
  "无法连接账号读取服务，请重新加载插件后重试。": "Could not read the account. Reload the extension and try again.",
  "已关联 · 当前 X 账号": "Linked · Current X account",
  "已关联 · 头像暂不可用": "Linked · Avatar unavailable",
  "账号资料已同步。": "Account profile synced.",
  "账号已同步；头像获取失败，可在资料设置中上传。": "Account synced. The avatar could not be fetched; upload one in profile settings.",
  "手动资料 · 未确认当前 X 账号": "Manual profile · Current X account not verified",
  "上次同步资料 · 未确认当前账号": "Cached profile · Current account not verified",
  "头像请小于 5MB。": "Choose an avatar smaller than 5MB.",
  "请选择 PNG、JPG 或 WebP 图片。": "Choose a PNG, JPG or WebP image.",
  "头像读取失败。": "Could not read the avatar.",
  "这张图片无法打开，请换一张。": "Could not open this image. Choose another one.",
  "先写一点文字，再导出卡片。": "Add some text before exporting your card.",
  "先同步当前 X 账号，或填写账号资料后导出。": "Sync your X account or enter your profile before exporting.",
  "正在导出…": "Exporting…",
  "图片生成失败，请重试。": "Could not create the image. Try again.",
  "{format} 图片已生成，正在下载。": "{format} image created. Downloading…",
  "无法读取上次草稿，已打开新的编辑页。": "Could not load your previous draft. A new editor is ready.",
  "请填写昵称和有效的 X ID（1–15 位字母、数字或下划线）。": "Enter a display name and a valid X handle (1–15 letters, numbers or underscores).",
  "账号资料已保存。": "Account profile saved.",
  "文字超出当前比例，请切换「自动高度」或缩短正文。": "The text does not fit this aspect ratio. Switch to Auto height or shorten the body.",
  "卡片过长，请拆成两张卡片后导出。": "This card is too long. Split it into two cards before exporting.",
  "将这条推文导出为文字卡片": "Export this post as a text card",
  "使用拾句当前模板导出这条推文": "Export this post using the current Shiju template",
  "正在生成…": "Creating…",
  "已发送": "Sent",
  "插件连接已失效，请刷新 X 页面后再试。": "The extension connection expired. Refresh X and try again.",
  "还没有读到这条推文的原始链接，请等页面加载完成。": "The original post link is not ready. Wait for the page to load.",
  "请先展开这条推文的全文，再导出卡片。": "Expand the full post before exporting it.",
  "这条推文没有可导出的文字。": "This post has no text to export.",
  "这条推文超过 2400 字符，请分段制作卡片。": "This post exceeds 2400 characters. Split it into multiple cards.",
  "请先在当前窗口打开并登录 X，再点同步。": "Open X in this window and sign in, then click Sync.",
  "还没有读到登录账号，请等 X 页面加载完成后重试。": "The signed-in account is not ready. Wait for X to load and try again.",
  "推文作者或原始链接无效。": "The post author or original link is invalid.",
  "只支持 1–2400 字符的推文正文，请先展开全文。": "Posts must contain 1–2400 characters. Expand the full text first."
};
  const hasDocument=typeof document!=='undefined';
  const extension=Boolean(globalThis.chrome?.runtime?.id);
  const valid=value=>value==='zh-CN'||value==='en';
  let language='zh-CN',revision=0;
  // Never store preferences in the host site's localStorage.
  const local=hasDocument && (!extension || location.protocol==='chrome-extension:');
  try{if(local && valid(localStorage.getItem('shijuLanguage')))language=localStorage.getItem('shijuLanguage');}catch{}
  function t(key,values={}) {
    const text=language==='en'?(english[key]??key):key;
    return text.replace(/\{(\w+)\}/g,(match,name)=>String(values[name]??match));
  }
  function text(element,key,values={}) {
    element.dataset.i18n=key;element.dataset.i18nValues=JSON.stringify(values);
    element.textContent=t(key,values);
  }
  function translate(root=document) {
    const owned=el=>local || el.matches('.shiju-tweet-export,.shiju-page-toast');
    root.querySelectorAll('[data-i18n]').forEach(el=>{if(!owned(el))return;let values={};try{values=JSON.parse(el.dataset.i18nValues||'{}');}catch{}el.textContent=t(el.dataset.i18n,values);});
    for(const [attribute,data] of [['aria-label','i18nAria'],['title','i18nTitle'],['placeholder','i18nPlaceholder']]) {
      root.querySelectorAll(`[data-${data.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}]`).forEach(el=>{if(owned(el))el.setAttribute(attribute,t(el.dataset[data]));});
    }
  }
  function apply(value) {
    const changed=language!==value;language=value;
    if(local)try{localStorage.setItem('shijuLanguage',language);}catch{}
    if(hasDocument){
      if(local){document.documentElement.lang=language;const control=document.getElementById('languageMode');if(control)control.value=language;}
      translate();if(changed)document.dispatchEvent(new CustomEvent('shiju-language-change'));
    }
  }
  function choose(value) {
    if(!valid(value))return;++revision;apply(value);
    if(extension)chrome.storage.local.set({shijuLanguage:language}).catch(()=>{});
  }
  globalThis.ShijuI18n={t,text,translate,choose,get language(){return language;}};
  if(hasDocument && local) {
    document.documentElement.lang=language;
    document.addEventListener('DOMContentLoaded',()=>{
      translate();const control=document.getElementById('languageMode');if(control){control.value=language;control.addEventListener('change',e=>choose(e.target.value));}
    });
  }
  let ready=Promise.resolve();
  if(extension) {
    const initialRevision=revision;
    ready=chrome.storage.local.get('shijuLanguage').then(({shijuLanguage})=>{if(revision===initialRevision && valid(shijuLanguage))apply(shijuLanguage);}).catch(()=>{});
    chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && valid(changes.shijuLanguage?.newValue)){++revision;apply(changes.shijuLanguage.newValue);}});
  } else if(hasDocument)window.addEventListener('storage',e=>{if(e.key==='shijuLanguage' && valid(e.newValue)){++revision;apply(e.newValue);}});
  globalThis.ShijuI18n.ready=ready;
})();
