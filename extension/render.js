import {githubPath,repositoryLabel} from './branding.js';
export const templates = [
  {id:'white', name:'素白', bg:'#ffffff', fg:'#242c27', muted:'#85918a', line:'#dce2dd', accent:'#173e34', serif:true},
  {id:'ink', name:'墨夜', bg:'#262827', fg:'#f5f4ef', muted:'#abb0aa', line:'#4b514c', accent:'#d6dacb', serif:true},
  {id:'forest', name:'松绿', bg:'#204b40', fg:'#f2f4ed', muted:'#b1c5ba', line:'#56776a', accent:'#c9dbc2', serif:true},
  {id:'clay', name:'赤陶', bg:'#ad583d', fg:'#fff3e7', muted:'#efd0bb', line:'#cd8c6f', accent:'#f4dbb5', serif:true},
  {id:'paper', name:'手札', bg:'#f1ecdf', fg:'#383c33', muted:'#8a8b7b', line:'#d2cbbb', accent:'#727958', serif:true},
  {id:'blue', name:'雾蓝', bg:'#6c8b9a', fg:'#faf8ef', muted:'#d3dfe0', line:'#a0b6be', accent:'#e4e8da', serif:false}
];
const sans = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
const serif = '"Songti SC", "STSong", "Noto Serif CJK SC", Georgia, serif';
const graphemes = new Intl.Segmenter('zh', {granularity:'grapheme'});
const words = new Intl.Segmenter('zh', {granularity:'word'});

export function wrapText(ctx, text, width) {
  const result = [];
  for (const paragraph of text.replace(/\r\n?/g,'\n').split('\n')) {
    if (!paragraph) {result.push(''); continue;}
    let line = '';
    for (const {segment} of words.segment(paragraph)) {
      if (ctx.measureText(line + segment).width <= width) {line += segment; continue;}
      if (line) {result.push(line.trimEnd()); line = '';}
      if (ctx.measureText(segment).width <= width) {line = segment.trimStart(); continue;}
      for (const {segment: glyph} of graphemes.segment(segment)) {
        if (line && ctx.measureText(line + glyph).width > width) {result.push(line); line = '';}
        line += glyph;
      }
    }
    if (line) result.push(line.trimEnd());
  }
  return result;
}
function ellipsis(ctx, value, width) {
  if (ctx.measureText(value).width <= width) return value;
  const chars = [...graphemes.segment(value)].map(x => x.segment);
  while (chars.length && ctx.measureText(chars.join('') + '…').width > width) chars.pop();
  return chars.join('') + '…';
}
function line(ctx, x, y, width, color) {ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+width,y);ctx.stroke();}
function textLines(ctx, lines, x, y, leading, color) {
  ctx.fillStyle=color;
  lines.forEach((value, i) => ctx.fillText(value,x,y+i*leading));
}
function drawQuotation(ctx,x,y,size,color) {
  ctx.save();ctx.translate(x,y);ctx.scale(size/72,size/72);ctx.translate(-29,-30);
  ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=9;ctx.lineCap='round';
  ctx.stroke(new Path2D('M34 76V58c0-13 6-21 18-26M76 76V58c0-13 6-21 18-26'));
  ctx.beginPath();ctx.roundRect(30,62,27,31,5);ctx.roundRect(72,62,27,31,5);ctx.fill();
  ctx.restore();
}
function drawBrandmark(ctx, right, y, color) {
  ctx.save();
  ctx.font=`500 28px ${serif}`;
  const markSize=24,gap=10,textWidth=ctx.measureText('拾句').width;
  const width=markSize+gap+textWidth;
  const left=right-width;
  ctx.globalAlpha=.8;ctx.fillStyle=color;ctx.strokeStyle=color;
  ctx.fillText('拾句',left+markSize+gap,y);
  // Reuse the extension icon's quotation-mark geometry as a crisp monochrome logo.
  drawQuotation(ctx,left,y+4,markSize,color);
  ctx.restore();
  return width;
}
function drawRepository(ctx,right,y,color) {
  ctx.save();
  ctx.font=`400 18px ${sans}`;ctx.fillStyle=color;
  const iconSize=18,gap=7,textWidth=ctx.measureText(repositoryLabel).width;
  const left=right-textWidth-gap-iconSize;
  ctx.fillText(repositoryLabel,left+iconSize+gap,y);
  ctx.translate(left,y+2);ctx.scale(iconSize/16,iconSize/16);
  ctx.fill(new Path2D(githubPath));
  ctx.restore();
}
export async function loadAvatar(data) {
  if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(data || '')) return null;
  return new Promise(resolve => {const image = new Image();image.onload=()=>resolve(image);image.onerror=()=>resolve(null);image.src=data;});
}
export function renderCard(canvas, state, avatar = null, outputWidth = 1080) {
  const template = templates.find(t=>t.id===state.template) || templates[0];
  const ctx = canvas.getContext('2d');
  const padding = 88, inner = 1080-padding*2;
  const title = state.title.trim(), body = state.body.trim();
  const requestedBodySize = Number(state.fontSize) || 38;
  const requestedTitleSize = Number(state.titleSize) || Math.round(requestedBodySize * 2.8);
  const requestedTitleGap=state.titleBodyGap==null?38:Math.max(0,Math.min(160,Number(state.titleBodyGap)||0));
  let fontSize = requestedBodySize;
  let titleSize, titleGap, titleLines, bodyRows, bodyHeight, titleLeading, bodyLeading, contentHeight;
  const titleFamily = template.serif ? serif : sans;
  const fixedHeight = state.ratio === 'square' ? 1080 : state.ratio === 'portrait' ? 1350 : null;
  const contentTop = 239;
  const layout = () => {
    titleSize = Math.round(requestedTitleSize * fontSize / requestedBodySize);titleLeading=titleSize*1.28;bodyLeading=fontSize*1.85;
    titleGap=requestedTitleGap*fontSize/requestedBodySize;
    ctx.font=`600 ${titleSize}px ${titleFamily}`;
    let heading=title;
    if(ctx.measureText(title).width>inner && !title.includes('\n')) {
      const pause=title.match(/^(.{2,12}[，、：])(.{3,})$/u);
      if(pause && ctx.measureText(pause[1]).width<=inner && ctx.measureText(pause[2]).width<=inner) heading=`${pause[1]}\n${pause[2]}`;
    }
    titleLines=title ? wrapText(ctx,heading,inner) : [];
    ctx.font=`400 ${fontSize}px ${sans}`;
    const requestedGap=Number(state.paragraphSpacing);
    const paragraphGap=(Number.isFinite(requestedGap) && state.paragraphSpacing!=null ? Math.max(0,Math.min(160,requestedGap)) : 70)*fontSize/requestedBodySize;
    bodyRows=[];bodyHeight=0;
    // Keep explicit paragraphs separate from automatic line wrapping. Blank lines
    // retain their own height; add the paragraph gap once between text paragraphs.
    for(const paragraph of body ? body.replace(/\r\n?/g,'\n').split('\n') : []) {
      if(!paragraph.trim()){bodyHeight+=bodyLeading;continue;}
      if(bodyRows.length)bodyHeight+=paragraphGap;
      for(const value of wrapText(ctx,paragraph,inner)) {
        bodyRows.push({text:value,offset:bodyHeight});bodyHeight+=bodyLeading;
      }
    }
    contentHeight=titleLines.length*titleLeading + (title && body ? titleGap : 0) + bodyHeight;
  };
  layout();
  // Shrink fixed-ratio cards only as far as the readable minimum; fail explicitly rather than crop.
  if (fixedHeight) while(contentTop+contentHeight+180>fixedHeight && fontSize>22) {fontSize--;layout();}
  if (fixedHeight && contentTop+contentHeight+180>fixedHeight) throw new Error('文字超出当前比例，请切换「自动高度」或缩短正文。');
  const height=fixedHeight || Math.max(1000,Math.ceil(contentTop+contentHeight+180));
  if (height>10000) throw new Error('卡片过长，请拆成两张卡片后导出。');
  const scale=outputWidth/1080;
  canvas.width=outputWidth;canvas.height=Math.round(height*scale);
  ctx.scale(scale,scale);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.fillStyle=template.bg;ctx.fillRect(0,0,1080,height);ctx.textBaseline='top';
  if(template.id==='forest') {ctx.fillStyle=template.accent;ctx.fillRect(padding,0,64,8);}
  const account=state.tweetSource?.account || state.account || {name:'示例账号',handle:'yourname'};
  ctx.save();ctx.beginPath();ctx.arc(padding+43,93+43,43,0,Math.PI*2);ctx.clip();
  if(avatar) {
    const edge=Math.min(avatar.naturalWidth,avatar.naturalHeight);
    ctx.drawImage(avatar,(avatar.naturalWidth-edge)/2,(avatar.naturalHeight-edge)/2,edge,edge,padding,93,86,86);
  } else {
    ctx.fillStyle=template.line;ctx.fillRect(padding,93,86,86);ctx.fillStyle=template.muted;
    if(!state.account && !state.tweetSource?.account){ctx.fillStyle='#173e34';ctx.fillRect(padding,93,86,86);drawQuotation(ctx,padding+29*86/128,93+30*86/128,72*86/128,'#f6f4e9');}
    else {ctx.beginPath();ctx.arc(padding+43,125,16,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(padding+43,171,31,28,0,0,Math.PI*2);ctx.fill();}
  }
  ctx.restore();
  ctx.font=`600 30px ${sans}`;ctx.fillStyle=template.fg;ctx.fillText(ellipsis(ctx,account.name,inner-116),padding+112,100);
  ctx.font=`400 25px ${sans}`;ctx.fillStyle=template.muted;ctx.fillText(`@${account.handle}`,padding+112,145);
  let cursor=contentTop;
  if(title) {ctx.font=`600 ${titleSize}px ${titleFamily}`;textLines(ctx,titleLines,padding,cursor,titleLeading,template.fg);cursor+=titleLines.length*titleLeading+(body?titleGap:0);}
  if(body) {
    ctx.font=`400 ${fontSize}px ${sans}`;
    if(template.id==='paper') {
      // Place each rule below the actual body glyphs. Headings, blank paragraphs and footer stay clear.
      ctx.strokeStyle='#ddd6c5';ctx.lineWidth=1;
      bodyRows.forEach(({text:value,offset})=>{
        const top=cursor+offset;
        const bottom=Math.max(fontSize,ctx.measureText(value).actualBoundingBoxDescent || fontSize);
        const ruleY=top+bottom+fontSize*.2;
        if(ruleY>=top+bodyLeading-fontSize*.12 || ruleY>=height-140)return;
        ctx.beginPath();ctx.moveTo(padding,ruleY);ctx.lineTo(1080-padding,ruleY);ctx.stroke();
      });
    }
    ctx.fillStyle=template.fg;bodyRows.forEach(({text,offset})=>ctx.fillText(text,padding,cursor+offset));
  }
  const footerY=height-139;
  line(ctx,padding,footerY,inner,template.line);
  ctx.font=`400 25px ${sans}`;ctx.fillStyle=template.muted;
  const footerURL=state.tweetSource?.url?.replace(/^https:\/\//,'') || `x.com/${account.handle}`;
  const brandWidth=drawBrandmark(ctx,1080-padding,footerY+35,template.muted);
  const linkWidth=inner-brandWidth-36;
  let linkSize=25;
  while(ctx.measureText(footerURL).width>linkWidth && linkSize>19){linkSize--;ctx.font=`400 ${linkSize}px ${sans}`;}
  // Keep the complete original URL while reserving clear space for the brandmark.
  ctx.fillText(footerURL,padding,footerY+38,linkWidth);
  drawRepository(ctx,1080-padding,footerY+82,template.muted);
  return {width:canvas.width,height:canvas.height,fontSize,titleSize,template:template.name};
}
