(() => {
  // A reinjection must replace callbacks from an invalidated or older context.
  globalThis.__shijuContentInstalled?.dispose?.();
  const version=chrome.runtime.getManifest().version,session=crypto.randomUUID();
  let disposed=false,last='',timer;
  const resets=new Set();
  const {t,text:localized}=globalThis.ShijuI18n;
  const connected=()=>{try{return Boolean(chrome.runtime?.id);}catch{return false;}};
  const onMessage=(message,_sender,respond)=>{
    if(message.type==='SHIJU_PING')respond({version,session});
    if(message.type==='READ_ACCOUNT')respond({account:XCardAccount.readAccount()});
  };
  chrome.runtime.onMessage.addListener(onMessage);
  const showToast=text=>{
    let toast=document.querySelector('.shiju-page-toast');
    if(!toast){toast=document.createElement('div');toast.className='shiju-page-toast';toast.setAttribute('role','status');document.body.append(toast);}
    localized(toast,text);toast.hidden=false;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>{toast.hidden=true;},4500);
  };
  const attachButton=article=>{
    const previous=article.querySelector(':scope > .shiju-tweet-export');
    if(previous?.dataset.shijuSession===session)return;
    previous?.remove();
    const button=document.createElement('button');button.className='shiju-tweet-export';button.type='button';
    button.dataset.shijuSession=session;button.dataset.shijuVersion=version;
    localized(button,'导出卡片');button.dataset.i18nAria='将这条推文导出为文字卡片';button.dataset.i18nTitle='使用拾句当前模板导出这条推文';
    button.setAttribute('aria-label',t(button.dataset.i18nAria));button.title=t(button.dataset.i18nTitle);
    button.addEventListener('click',async event=>{
      event.preventDefault();event.stopPropagation();
      if(disposed || button.disabled)return;
      try {
        if(!connected())throw new Error('插件已更新，请刷新 X 页面后重试。');
        const tweet=XCardAccount.readTweet(article);button.disabled=true;localized(button,'正在生成…');
        const result=await chrome.runtime.sendMessage({type:'EXPORT_TWEET',tweet});
        if(!result?.ok)throw new Error(result?.error || '插件连接已失效，请刷新 X 页面后再试。');
        localized(button,'已发送');
      }catch(error){
        showToast(/extension context invalidated/i.test(error.message)?'插件已更新，请刷新 X 页面后重试。':error.message);
      }finally{
        if(!disposed){const reset=setTimeout(()=>{resets.delete(reset);button.disabled=false;localized(button,'导出卡片');},1200);resets.add(reset);}
      }
    });
    article.append(button);
  };
  const scan=root=>{
    if(disposed || !connected() || root.nodeType!==Node.ELEMENT_NODE)return;
    if(root.matches('article[data-testid="tweet"]'))attachButton(root);
    root.querySelectorAll('article[data-testid="tweet"]').forEach(attachButton);
  };
  const publish=()=>{
    if(disposed || !connected())return;
    const account=XCardAccount.readAccount(),key=JSON.stringify(account && [account.name,account.handle,account.avatar]);
    if(key===last)return;last=key;
    try{chrome.runtime.sendMessage({type:'ACCOUNT_CHANGED',account}).catch(()=>{});}catch{}
  };
  const observer=new MutationObserver(records=>{
    if(disposed || !connected())return;
    records.forEach(record=>record.addedNodes.forEach(scan));
    clearTimeout(timer);timer=setTimeout(publish,450);
  });
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['src','href']});
  globalThis.__shijuContentInstalled={version,session,dispose(){
    disposed=true;observer.disconnect();clearTimeout(timer);clearTimeout(showToast.timer);resets.forEach(clearTimeout);
    try{chrome.runtime.onMessage.removeListener(onMessage);}catch{}
  }};
  scan(document.body);publish();
})();
