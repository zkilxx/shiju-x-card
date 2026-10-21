(() => {
  const root=document.documentElement;
  const system=matchMedia('(prefers-color-scheme: dark)');
  const valid=value=>['system','light','dark'].includes(value);
  const extension=Boolean(globalThis.chrome?.runtime?.id);
  let mode='system',revision=0;
  try{const cached=localStorage.getItem('shijuTheme');if(valid(cached))mode=cached;}catch{}
  function apply(value) {
    mode=valid(value)?value:'system';
    root.dataset.theme=mode;
    root.dataset.colorMode=mode==='system'?(system.matches?'dark':'light'):mode;
    const control=document.getElementById('themeMode');if(control)control.value=mode;
  }
  function cache() {try{localStorage.setItem('shijuTheme',mode);}catch{}}
  function choose(value) {
    ++revision;apply(value);cache();
    if(extension)chrome.storage.local.set({shijuTheme:mode}).catch(()=>{});
  }
  // This script runs before the stylesheet to avoid flashing the wrong theme on open.
  apply(mode);
  system.addEventListener('change',()=>{if(mode==='system')apply(mode);});
  document.addEventListener('DOMContentLoaded',()=>{
    apply(mode);
    document.getElementById('themeMode').addEventListener('change',event=>choose(event.target.value));
  });
  if(extension) {
    const initialRevision=revision;
    chrome.storage.local.get('shijuTheme').then(({shijuTheme})=>{
      if(revision===initialRevision && valid(shijuTheme)){apply(shijuTheme);cache();}
    }).catch(()=>{});
    chrome.storage.onChanged.addListener((changes,area)=>{
      if(area==='local' && valid(changes.shijuTheme?.newValue)){++revision;apply(changes.shijuTheme.newValue);cache();}
    });
  } else {
    window.addEventListener('storage',event=>{if(event.key==='shijuTheme' && valid(event.newValue)){++revision;apply(event.newValue);}});
  }
})();
