(() => {
  if (globalThis.__shijuContentInstalled) return;
  globalThis.__shijuContentInstalled = true;
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.type === 'READ_ACCOUNT') respond({account: XCardAccount.readAccount()});
  });
  let last = '', timer;
  const showToast = text => {
    let toast=document.querySelector('.shiju-page-toast');
    if(!toast){toast=document.createElement('div');toast.className='shiju-page-toast';toast.setAttribute('role','status');document.body.append(toast);}
    toast.textContent=text;toast.hidden=false;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>{toast.hidden=true;},4500);
  };
  const attachButton = article => {
    if(article.querySelector(':scope > .shiju-tweet-export'))return;
    const button=document.createElement('button');button.className='shiju-tweet-export';button.type='button';button.textContent='导出卡片';button.setAttribute('aria-label','将这条推文导出为文字卡片');button.title='使用拾句当前模板导出这条推文';
    button.addEventListener('click',async event=>{
      event.preventDefault();event.stopPropagation();
      if(button.disabled)return;
      try {
        const tweet=XCardAccount.readTweet(article);button.disabled=true;button.textContent='正在生成…';
        const result=await chrome.runtime.sendMessage({type:'EXPORT_TWEET',tweet});
        if(!result?.ok)throw new Error(result?.error || '插件连接已失效，请刷新 X 页面后再试。');
        button.textContent='已发送';
      }catch(error){showToast(error.message);}finally{setTimeout(()=>{button.disabled=false;button.textContent='导出卡片';},1200);}
    });
    article.append(button);
  };
  const scan = root => {
    if(root.nodeType!==Node.ELEMENT_NODE)return;
    if(root.matches('article[data-testid="tweet"]'))attachButton(root);
    root.querySelectorAll('article[data-testid="tweet"]').forEach(attachButton);
  };
  const publish = () => {
    const account = XCardAccount.readAccount();
    const key = JSON.stringify(account && [account.name, account.handle, account.avatar]);
    if (key === last) return;
    last = key;
    try{chrome.runtime.sendMessage({type: 'ACCOUNT_CHANGED', account}).catch(() => {});}catch{}
  };
  new MutationObserver(records => {
    records.forEach(record=>record.addedNodes.forEach(scan));
    clearTimeout(timer);
    timer = setTimeout(publish, 450);
  }).observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['src', 'href']});
  scan(document.body);
  publish();
})();
