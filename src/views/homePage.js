import { pageLayout, topbar } from "./layout.js";

const CSS = `
.home .foot{margin-top:48px}
.drop{position:relative;border:1.5px dashed var(--line2);border-radius:12px;background:var(--panel);
  padding:54px 24px;text-align:center;cursor:pointer;transition:border-color .15s,background .15s;margin-top:8px}
.drop:hover{border-color:var(--accent)}
.drop.drag{border-color:var(--accent);background:var(--accent-dim)}
.drop .big{font-family:var(--mono);font-size:17px;color:var(--text)}
.drop .big .cursor{color:var(--accent);animation:blink 1.1s steps(1) infinite}
.drop .hint{font-family:var(--mono);font-size:12px;color:var(--muted);margin-top:10px}
@keyframes blink{50%{opacity:0}}
.toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:16px 0 0}
.toolbar .spacer{flex:1}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:6px;overflow:hidden}
.seg button{font-family:var(--mono);font-size:12px;background:var(--panel2);color:var(--muted);border:none;
  border-left:1px solid var(--line);padding:7px 13px;cursor:pointer}
.seg button:first-child{border-left:none}
.seg button.on{background:var(--accent);color:#0d1117}
.prog{display:none;margin-top:18px}
.prog .bar{height:3px;background:var(--panel2);border-radius:3px;overflow:hidden}
.prog .bar i{display:block;height:100%;width:0;background:var(--accent);transition:width .2s}
.prog .t{font-family:var(--mono);font-size:12px;color:var(--muted);margin-top:7px}
.results{margin-top:18px;display:flex;flex-direction:column;gap:10px}
.result{display:flex;align-items:center;gap:12px;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px 12px}
.result .thumb{width:44px;height:44px;border-radius:6px;overflow:hidden;flex:none;background:var(--panel2);display:flex;align-items:center;justify-content:center}
.result .thumb img,.result .thumb video{width:100%;height:100%;object-fit:cover}
.result .thumb .ic{font-family:var(--mono);font-size:10px;color:var(--muted)}
.result .rurl{flex:1;min-width:0;font-family:var(--mono);font-size:12.5px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.result .rurl .p{color:var(--accent)}
.hist{margin-top:16px;display:flex;flex-direction:column;gap:8px}
.hist .hrow{display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:8px 12px}
.hist .hrow code{flex:1;min-width:0;font-family:var(--mono);font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.toasts{position:fixed;right:16px;bottom:16px;display:flex;flex-direction:column;gap:8px;z-index:200}
.toast{font-family:var(--mono);font-size:12.5px;background:var(--panel2);border:1px solid var(--line);
  border-left-width:3px;border-radius:6px;padding:9px 13px;color:var(--text);box-shadow:0 6px 20px rgba(0,0,0,.4);transition:opacity .3s}
.toast.ok{border-left-color:var(--ok)} .toast.err{border-left-color:var(--danger)}
`;

const SCRIPT = `
(function(){
  var $=function(s){return document.querySelector(s)};
  var fileInput=$('#file'),drop=$('#drop'),results=$('#results'),prog=$('#prog'),bar=$('#bar'),
    ptext=$('#ptext'),compBtn=$('#compBtn'),histBtn=$('#histBtn'),histEl=$('#hist'),
    copyAll=$('#copyAll'),clearBtn=$('#clearBtn'),toasts=$('#toasts');
  var compress=true,fmt='url',urls=[];
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function toast(msg,kind){var t=document.createElement('div');t.className='toast '+(kind||'');t.textContent=msg;toasts.appendChild(t);setTimeout(function(){t.style.opacity='0';setTimeout(function(){t.remove()},300)},2600)}
  function fmtLink(u,f){if(f==='markdown')return '!['+'image'+']('+u+')';if(f==='bbcode')return '[img]'+u+'[/img]';return u}
  function copy(text){var p=navigator.clipboard?navigator.clipboard.writeText(text):Promise.reject();p.then(function(){toast('已复制','ok')}).catch(function(){var ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');toast('已复制','ok')}catch(e){toast('复制失败','err')}ta.remove()})}
  Array.prototype.forEach.call(document.querySelectorAll('#fmt button'),function(b){b.onclick=function(){Array.prototype.forEach.call(document.querySelectorAll('#fmt button'),function(x){x.classList.remove('on')});b.classList.add('on');fmt=b.getAttribute('data-f')}});
  compBtn.onclick=function(){compress=!compress;compBtn.textContent='压缩: '+(compress?'开':'关')};
  drop.onclick=function(){fileInput.click()};
  fileInput.onchange=function(){handle(fileInput.files);fileInput.value=''};
  ['dragover','dragenter'].forEach(function(e){drop.addEventListener(e,function(ev){ev.preventDefault();drop.classList.add('drag')})});
  drop.addEventListener('dragleave',function(ev){if(!drop.contains(ev.relatedTarget))drop.classList.remove('drag')});
  drop.addEventListener('drop',function(ev){ev.preventDefault();drop.classList.remove('drag');if(ev.dataTransfer.files.length)handle(ev.dataTransfer.files)});
  document.addEventListener('paste',function(ev){var items=(ev.clipboardData&&ev.clipboardData.items)||[];var fs=[];for(var i=0;i<items.length;i++){if(items[i].kind==='file'){var f=items[i].getAsFile();if(f)fs.push(f)}}if(fs.length)handle(fs)});
  async function handle(files){for(var i=0;i<files.length;i++){await processOne(files[i])}}
  async function hashOf(file){var chunk=file.size>1048576?file.slice(0,1048576):file;var buf=await chunk.arrayBuffer();var h=await crypto.subtle.digest('SHA-256',buf);var a=Array.prototype.map.call(new Uint8Array(h),function(b){return b.toString(16).padStart(2,'0')});return a.join('')+'-'+file.size+'-'+file.lastModified}
  function cacheGet(){try{return JSON.parse(localStorage.getItem('uf_cache'))||[]}catch(e){return[]}}
  function cacheAdd(rec){var c=cacheGet();c.push(rec);localStorage.setItem('uf_cache',JSON.stringify(c.slice(-500)))}
  function compressImg(file){return new Promise(function(res){var img=new Image();img.onload=function(){var c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);c.toBlob(function(b){res(b?new File([b],file.name,{type:'image/jpeg'}):file)},'image/jpeg',0.75)};img.onerror=function(){res(file)};var r=new FileReader();r.onload=function(e){img.src=e.target.result};r.onerror=function(){res(file)};r.readAsDataURL(file)})}
  async function processOne(orig){
    var file=orig;
    try{
      var hash=await hashOf(orig);
      var hit=cacheGet().filter(function(x){return x.hash===hash})[0];
      if(hit){addResult(orig,hit.url);toast('本地缓存命中','ok');return}
      if(compress&&file.type.indexOf('image/')===0&&file.type!=='image/gif'){file=await compressImg(file)}
      var url=await uploadOne(file);
      addResult(orig,url);cacheAdd({hash:hash,url:url,name:orig.name,ts:Date.now()});toast('上传成功','ok');
    }catch(err){toast(err.message||'上传失败','err')}
  }
  function uploadOne(file){
    return new Promise(function(resolve,reject){
      var fd=new FormData();fd.append('file',file,file.name);
      var xhr=new XMLHttpRequest();
      prog.style.display='block';bar.style.width='0';ptext.textContent='上传中… 0%';
      xhr.upload.onprogress=function(e){if(e.lengthComputable){var p=Math.round(e.loaded/e.total*100);bar.style.width=p+'%';ptext.textContent='上传中… '+p+'%'}};
      xhr.onload=function(){prog.style.display='none';var d;try{d=JSON.parse(xhr.responseText)}catch(e){reject(new Error('响应解析失败'));return}if(xhr.status>=200&&xhr.status<300&&d.data){resolve(d.data)}else{reject(new Error(d.error||('上传失败 HTTP '+xhr.status)))}};
      xhr.onerror=function(){prog.style.display='none';reject(new Error('网络错误'))};
      xhr.ontimeout=function(){prog.style.display='none';reject(new Error('上传超时'))};
      xhr.open('POST','/upload');xhr.timeout=120000;xhr.send(fd);
    });
  }
  function thumbHtml(file){
    if(file.type.indexOf('image/')===0)return '<img src="'+URL.createObjectURL(file)+'">';
    if(file.type.indexOf('video/')===0)return '<video src="'+URL.createObjectURL(file)+'" muted></video>';
    var ext=(file.name.split('.').pop()||'?').toUpperCase();return '<span class="ic">'+esc(ext)+'</span>';
  }
  function addResult(file,url){
    urls.push(url);
    var row=document.createElement('div');row.className='result';
    row.innerHTML='<div class="thumb">'+thumbHtml(file)+'</div><code class="rurl"><span class="p">$</span> '+esc(url)+'</code><button class="btn btn-sm copy">copy</button>';
    row.querySelector('.copy').onclick=function(){copy(fmtLink(url,fmt))};
    results.insertBefore(row,results.firstChild);
    copyAll.hidden=false;clearBtn.hidden=false;
  }
  copyAll.onclick=function(){if(urls.length)copy(urls.map(function(u){return fmtLink(u,fmt)}).join('\\n\\n'))};
  clearBtn.onclick=function(){urls=[];results.innerHTML='';copyAll.hidden=true;clearBtn.hidden=true};
  histBtn.onclick=function(){
    if(!histEl.hidden){histEl.hidden=true;return}
    var c=cacheGet().slice().reverse();
    histEl.innerHTML=c.length?c.map(function(r){return '<div class="hrow"><code>'+esc(r.url)+'</code><button class="btn btn-sm" data-u="'+esc(r.url)+'">copy</button></div>'}).join(''):'<div class="empty">还没有上传记录</div>';
    Array.prototype.forEach.call(histEl.querySelectorAll('button[data-u]'),function(b){b.onclick=function(){copy(fmtLink(b.getAttribute('data-u'),fmt))}});
    histEl.hidden=false;
  };
})();
`;

export function homePage(user) {
  const body = `${topbar(user, "home")}
<main class="page home">
  <div class="eyebrow">UPLOAD</div>
  <h1>拖一个文件进来</h1>
  <p class="sub">drop · 粘贴 · 点击 — 自动转直链。支持多文件与图片压缩。</p>

  <form id="up" action="/upload" method="post" enctype="multipart/form-data">
    <input id="file" name="file" type="file" multiple hidden>
    <div id="drop" class="drop">
      <div class="big"><span class="cursor">▌</span> drop files here</div>
      <div class="hint">拖拽 / Ctrl+V 粘贴 / 点击选择文件</div>
    </div>
  </form>

  <div class="toolbar">
    <div class="seg" id="fmt">
      <button type="button" data-f="url" class="on">URL</button>
      <button type="button" data-f="markdown">Markdown</button>
      <button type="button" data-f="bbcode">BBCode</button>
    </div>
    <button type="button" id="compBtn" class="btn btn-sm">压缩: 开</button>
    <button type="button" id="histBtn" class="btn btn-sm">历史</button>
    <span class="spacer"></span>
    <button type="button" id="copyAll" class="btn btn-sm" hidden>复制全部</button>
    <button type="button" id="clearBtn" class="btn btn-sm" hidden>清空</button>
  </div>

  <div class="prog" id="prog"><div class="bar"><i id="bar"></i></div><div class="t" id="ptext">上传中…</div></div>
  <div class="results" id="results"></div>
  <div class="hist" id="hist" hidden></div>

  <p class="foot">开源于 GitHub · <a href="https://github.com/jiangmuran/user_files" target="_blank" rel="noopener noreferrer">jiangmuran/user_files</a></p>
</main>
<div class="toasts" id="toasts"></div>
<script>${SCRIPT}</script>`;
  return pageLayout({ title: "上传 · files.muran.tech", head: `<style>${CSS}</style>`, body });
}
