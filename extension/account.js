(() => {
  const validHandle = value => typeof value === 'string' && /^[A-Za-z0-9_]{1,15}$/.test(value);
  const avatarURL = value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'pbs.twimg.com' && url.pathname.startsWith('/profile_images/') ? url.href : '';
    } catch { return ''; }
  };
  function readAccount(doc = document) {
    // Only the logged-in account switcher is authoritative. Never read UserName in a profile or tweet.
    const switcher = doc.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    if (!switcher) return null;
    const text = switcher.innerText || switcher.textContent || '';
    const handle = text.match(/@([A-Za-z0-9_]{1,15})(?![A-Za-z0-9_])/u)?.[1];
    const ownLink = doc.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    const linkedHandle = ownLink?.getAttribute('href')?.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1];
    const resolved = handle || linkedHandle;
    if (!validHandle(resolved)) return null;
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    // Other X extensions may insert an avatar placeholder such as "-" before the real name.
    const name = lines.find(line => !line.startsWith('@') && !/^[\s\-–—·•.…]+$/u.test(line) && !/^(more|更多|accounts|账户)$/i.test(line));
    const image = switcher.querySelector('img');
    return {name: (name || resolved).slice(0, 60), handle: resolved, url: `https://x.com/${resolved}`, avatar: avatarURL(image?.currentSrc || image?.getAttribute('src')), source: 'x', syncedAt: Date.now()};
  }
  function tweetURL(value) {
    try {
      const url = new URL(value, 'https://x.com');
      const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)\/?$/);
      if(url.protocol!=='https:' || !['x.com','twitter.com'].includes(url.hostname) || !match)return null;
      return {handle:match[1],url:`https://x.com/${match[1]}/status/${match[2]}`};
    } catch {return null;}
  }
  function readTweet(article) {
    const link=article.querySelector('time')?.closest('a[href]');
    const source=tweetURL(link?.getAttribute('href'));
    if(!source)throw new Error('还没有读到这条推文的原始链接，请等页面加载完成。');
    if(article.querySelector('[data-testid="tweet-text-show-more-link"]'))throw new Error('请先展开这条推文的全文，再导出卡片。');
    const textNode=[...article.querySelectorAll('[data-testid="tweetText"]')].find(node=>!node.closest('[data-testid="quoteTweet"], [role="link"]'));
    const text=(textNode?.innerText || textNode?.textContent || '').trim();
    if(!text)throw new Error('这条推文没有可导出的文字。');
    if(text.length>2400)throw new Error('这条推文超过 2400 字符，请分段制作卡片。');
    const header=article.querySelector('[data-testid="User-Name"], [data-testid="UserName"]') || article;
    const nameLink=[...header.querySelectorAll('a[href]')].find(a=>{
      try {return new URL(a.getAttribute('href'),'https://x.com').pathname.toLowerCase()===`/${source.handle.toLowerCase()}` && (a.innerText || a.textContent || '').trim();}catch{return false;}
    });
    const image=article.querySelector('[data-testid^="UserAvatar-Container-"] img, img[src*="/profile_images/"]');
    return {text,url:source.url,account:{name:((nameLink?.innerText || nameLink?.textContent || source.handle).trim()).slice(0,60),handle:source.handle,url:`https://x.com/${source.handle}`,avatar:avatarURL(image?.currentSrc || image?.getAttribute('src')),source:'tweet'}};
  }
  globalThis.XCardAccount = {readAccount, validHandle, avatarURL, tweetURL, readTweet};
})();
