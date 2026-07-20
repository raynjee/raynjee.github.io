/* Slim scraper v2 — iframes + visible tappable link + pause + chapter range */
(function(){
if(window.__ak)return;window.__ak=1;
var d=document,b=d.body,APP='https://raynjee.github.io';

/* ── UI ─────────────────────────────────────────────────── */
var bar=d.createElement('div');
bar.id='__a';
bar.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:9999999;background:#0a0a0a;color:#f5f5f5;font:13px system-ui;padding:12px 14px;display:flex;flex-wrap:wrap;align-items:center;gap:8px';

var status=d.createElement('span');status.id='__as';status.textContent='Scanning...';
var prog=d.createElement('span');prog.id='__ap';prog.style.cssText='font-size:11px;color:#999';
var right=d.createElement('span');right.style.cssText='margin-left:auto;display:flex;gap:6px;align-items:center';
var pauseBtn=d.createElement('button');pauseBtn.id='__apa';pauseBtn.textContent='Pause';pauseBtn.style.cssText='background:#333;color:#f5f5f5;border:1px solid#555;padding:4px 10px;border-radius:4px;font:11px system-ui;cursor:pointer;display:none';
var stopBtn=d.createElement('button');stopBtn.id='__ast';stopBtn.textContent='Stop';stopBtn.style.cssText='background:#522;color:#f99;border:1px solid#844;padding:4px 10px;border-radius:4px;font:11px system-ui;cursor:pointer;display:none';
var startInp=d.createElement('input');startInp.id='__asi';startInp.type='number';startInp.min='1';startInp.placeholder='Start ch';startInp.style.cssText='width:52px;background:#222;color:#f5f5f5;border:1px solid#444;border-radius:4px;padding:3px 5px;font:11px system-ui;display:none';
var goBtn=d.createElement('button');goBtn.id='__ag';goBtn.disabled=true;goBtn.textContent='Send';goBtn.style.cssText='background:#f5f5f5;color:#0a0a0a;border:none;padding:5px 12px;border-radius:4px;font:600 11px system-ui;cursor:pointer';
var closeBtn=d.createElement('button');closeBtn.id='__ax';closeBtn.textContent='✕';closeBtn.style.cssText='background:none;color:#888;border:1px solid#555;padding:4px 8px;border-radius:4px;font:12px system-ui;cursor:pointer';

right.appendChild(pauseBtn);right.appendChild(stopBtn);right.appendChild(startInp);right.appendChild(goBtn);right.appendChild(closeBtn);
bar.appendChild(status);bar.appendChild(prog);bar.appendChild(right);
b.appendChild(bar);

var m=d.getElementById('__as'),p=d.getElementById('__ap'),g=d.getElementById('__ag'),x=d.getElementById('__ax'),
    pa=d.getElementById('__apa'),st=d.getElementById('__ast'),si=d.getElementById('__asi');
x.onclick=function(){bar.remove();window.__ak=0};

function msg(t,c){m.textContent=t;if(c!=null)p.textContent=c+'/'+total}

/* ── Chapter link detection ─────────────────────────────── */
var links=[],seen={};
Array.from(d.querySelectorAll('a[href]')).forEach(function(a){
  var t=(a.textContent||'').trim().toLowerCase(),h=(a.getAttribute('href')||'').toLowerCase();
  if(/chapter\s*\d|ch\.?\s*\d|^c?\d+[\.\-:]|^\d+[\s\-\.]|chapter[-_]\d/i.test(t+h)){
    try{var u=new URL(a.href,location.href).href;if(!seen[u]&&!u.startsWith('#')&&(!u.startsWith('http')||u.includes(location.hostname))){seen[u]=1;links.push(u)}}catch(e){}
  }
});
if(!links.length){
  Array.from(d.querySelectorAll('.chapter-list a,.wp-manga-chapter a,.listing a,.eplister a,.postlist a')).forEach(function(a){
    try{var u=new URL(a.href,location.href).href;if(!seen[u]&&!u.startsWith('#')){seen[u]=1;links.push(u)}}catch(e){}
  });
}
var total=links.length||1;
si.style.display=links.length>1?'':'none';
si.max=links.length;

if(!links.length){
  msg('Found 1 chapter',1);p.textContent='';
  var ch=[];var ps=Array.from(d.querySelectorAll('p')).map(function(p){return(p.textContent||'').trim()}).filter(function(t){return t.length>10});
  if(!ps.length){msg('No text found.');return}
  ch.push({t:d.title.replace(/\s*[-–|].*$/,'').trim(),p:ps});
  showResult(ch);return;
}

/* ── Scraping loop ──────────────────────────────────────── */
var ch=[],ok=0,fail=0,i=0,paused=false,stopped=false;
pa.style.display='inline-block';st.style.display='inline-block';
pa.onclick=function(){paused=!paused;pa.textContent=paused?'Resume':'Pause';if(!paused)next()};
st.onclick=function(){stopped=true;msg(ok+' chapters · '+fail+' failed');pa.style.display='none';st.style.display='none';si.style.display='none';if(!ch.length){msg('No chapters scraped yet.');return}showResult(ch)};

function next(){
  if(stopped||paused)return;
  var startAt=parseInt(si.value)||1;
  if(i===0&&startAt>1&&startAt<=links.length){i=startAt-1;total=links.length-startAt+1;}
  if(i>=links.length){
    msg(ok+' chapters · '+fail+' failed');
    if(!ch.length){msg('All failed.');return}
    pa.style.display='none';st.style.display='none';si.style.display='none';
    showResult(ch);return;
  }
  msg('Ch '+(i+1-startAt+1)+'/'+total+' ('+ok+' ok)');
  var ifr=d.createElement('iframe');
  ifr.style.cssText='position:absolute;left:-9999px;width:1px;height:1px;border:none';
  ifr.src=links[i];
  var done=0;
  var t=setTimeout(function(){if(!done){done=1;ifr.remove();fail++;i++;next()}},12000);
  ifr.onload=function(){
    if(done)return;
    try{
      var doc=ifr.contentDocument||(ifr.contentWindow&&ifr.contentWindow.document);
      if(doc&&doc.body){
        var ps=Array.from(doc.querySelectorAll('p')).map(function(p){return(p.textContent||'').trim()}).filter(function(t){return t.length>10});
        if(ps.length){ch.push({t:doc.title.replace(/\s*[-–|].*$/,'').trim()||('Ch '+(i+1)),p:ps});ok++;}else{fail++}
      }else{fail++}
    }catch(e){fail++}
    done=1;clearTimeout(t);ifr.remove();i++;next();
  };
  ifr.onerror=function(){if(!done){done=1;clearTimeout(t);ifr.remove();fail++;i++;next()}};
  b.appendChild(ifr);
}

/* ── Show visible tappable link (Safari CANNOT block this!) ─ */
function showResult(data){
  g.style.display='none';
  try{
    var j=JSON.stringify({chapters:data.map(function(c){return{title:c.t,paragraphs:c.p}}),source:location.href});
    var e=btoa(encodeURIComponent(j).replace(/%([0-9A-F]{2})/g,function(m,p){return String.fromCharCode(parseInt(p,16))}));
    var u=APP+'/#/import?data='+e;
    var link=d.createElement('a');
    link.href=u;link.target='_top';
    link.textContent='📥 Import '+data.length+' chapters →';
    link.style.cssText='color:#f5f5f5;font-weight:600;font-size:13px;text-decoration:underline;cursor:pointer;white-space:nowrap';
    right.insertBefore(link,closeBtn);
  }catch(er){msg('Too large.');}
}

next();
})();
