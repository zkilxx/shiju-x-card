(() => {
  const tasks=new Map();
  const pause=()=>new Promise(resolve=>setTimeout(resolve,200));
  const visible=element=>Boolean(element?.getClientRects().length);
  const previews=root=>[...root.querySelectorAll('[data-testid="attachments"] img,[data-testid="attachments"] video,[data-testid="mediaPreview"]')].filter(visible);
  function url() {
    const href=document.querySelector('a[data-testid="SideNav_NewTweet_Button"]')?.href;
    try{const link=new URL(href);if(link.origin===location.origin && /^\/compose\/(post|tweet)\/?$/.test(link.pathname))return link.href;}catch{}
    return 'https://x.com/intent/tweet';
  }
  async function attachImage(request) {
    if(!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(request.dataURL||'') || request.dataURL.length>7*1024*1024)throw new Error('卡片图片无效，请重新生成。');
    const mime=request.dataURL.slice(5,request.dataURL.indexOf(';'));
    const binary=atob(request.dataURL.split(',')[1]);
    if(binary.length>5*1024*1024)throw new Error('图片超过 5MB，请调低卡片宽度后重试。');
    let root,input,editor;
    const deadline=Date.now()+20000;
    while(Date.now()<deadline) {
      if(/\/i\/flow\/(login|signup)/.test(location.pathname))throw new Error('请先在新标签页登录 X，再回到拾句重试。');
      editor=[...document.querySelectorAll('[data-testid^="tweetTextarea_"][contenteditable="true"]')].find(visible);
      if(editor){root=editor.closest('[role="dialog"]')||editor.closest('form')||document;input=root.querySelector('input[type="file"][data-testid="fileInput"],input[type="file"][accept*="image"]');if(input && !input.disabled)break;}
      await pause();
    }
    if(!editor || !input || input.disabled)throw new Error('未找到 X 图片上传入口，请确认已登录并打开推文编辑栏后重试。');
    if(input.files.length || previews(root).length)throw new Error('X 编辑栏已有图片，请先处理现有草稿，再重试。');
    const bytes=Uint8Array.from(binary,character=>character.charCodeAt(0));
    const filename=String(request.filename||'Shiju.png').replace(/[\\/]/g,'-');
    const transfer=new DataTransfer();transfer.items.add(new File([bytes],filename,{type:mime}));
    input.files=transfer.files;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    const previewDeadline=Date.now()+20000;
    while(Date.now()<previewDeadline) {
      if(previews(root).length){editor.focus();return {ok:true};}
      if([...root.querySelectorAll('[role="alert"]')].some(element=>visible(element)&&element.textContent.trim()))throw new Error('X 未能添加图片，请在新标签页查看提示。');
      await pause();
    }
    throw new Error('X 尚未显示图片预览，请检查新标签页，避免重复添加。');
  }
  function attach(request) {
    if(typeof request.id!=='string')return Promise.reject(new Error('卡片图片无效，请重新生成。'));
    if(tasks.has(request.id))return tasks.get(request.id);
    const task=attachImage(request);tasks.set(request.id,task);
    if(tasks.size>20)tasks.delete(tasks.keys().next().value);
    return task;
  }
  globalThis.ShijuComposer={url,attach};
})();
