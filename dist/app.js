'use strict';
(() => {
const maps=window.ATLAS_COUNTRIES,$=id=>document.getElementById(id),TAU=2*Math.PI,SAMPLES=2048;
const canvas=$('drawing'),ctx=canvas.getContext('2d'),historyLayer=document.createElement('canvas'),historyCtx=historyLayer.getContext('2d');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const groups={world:'countries',province:'provinces',complex:'complex-shapes'};
const lastSelections=Object.fromEntries(Object.keys(groups).map(g=>[g,maps.find(c=>c.group===g)]));
const color={trace:'#8cdeba',pen:'#edac7e',circle:'#9bbfa8',original:'#8fa996'};
const initialShape=new URLSearchParams(location.search).get('shape')||document.body.dataset.defaultShape;
let country=maps.find(c=>c.id===initialShape)||maps[0],count=1,phase=0,running=!reduced,last=0,curves=[],camera=null,width=0,height=0,dpr=1;
let history=[],historyDirty=true,historyPainted=0,fixedIncrement=5;
function maxTerms(){const n=Number($('max-terms').value);return Number.isFinite(n)&&n>=1?Math.min(1024,Math.round(n)):512;}
function adaptiveIncrement(n){if(n<8)return 1;if(n<32)return 4;if(n<96)return 8;if(n<192)return 12;if(n<384)return 24;if(n<768)return 48;return 64;}
function increment(){return $('step-mode').value==='adaptive'?adaptiveIncrement(count):fixedIncrement;}
function nextCount(){return Math.min(maxTerms(),count+increment());}
function endpoint(r,n,t,visit){
 let [x,y]=r.center;
 for(let i=0;i<n;i++){const [k,radius,a]=r.terms[i],angle=TAU*k*t+a,nx=x+radius*Math.cos(angle),ny=y+radius*Math.sin(angle);if(visit)visit(x,y,nx,ny,radius);x=nx;y=ny;}
 return [x,y];
}
// Inverse radix-2 FFT. Coefficients are already normalized by the data generator.
function makeCurve(r,n){
 const re=new Float64Array(SAMPLES),im=new Float64Array(SAMPLES);
 re[0]=r.center[0];im[0]=r.center[1];
 for(let i=0;i<n;i++){const [frequency,radius,angle]=r.terms[i],k=(frequency+SAMPLES)%SAMPLES;re[k]+=radius*Math.cos(angle);im[k]+=radius*Math.sin(angle);}
 for(let i=1,j=0;i<SAMPLES;i++){let bit=SAMPLES>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
 for(let length=2;length<=SAMPLES;length*=2){
  const half=length/2,stepRe=Math.cos(TAU/length),stepIm=Math.sin(TAU/length);
  for(let base=0;base<SAMPLES;base+=length){let wr=1,wi=0;for(let j=0;j<half;j++){
   const a=base+j,b=a+half,vr=re[b]*wr-im[b]*wi,vi=re[b]*wi+im[b]*wr,ur=re[a],ui=im[a];
   re[a]=ur+vr;im[a]=ui+vi;re[b]=ur-vr;im[b]=ui-vi;
   const nextWr=wr*stepRe-wi*stepIm;wi=wr*stepIm+wi*stepRe;wr=nextWr;
  }}
 }
 const xy=new Float32Array((SAMPLES+1)*2);for(let i=0;i<SAMPLES;i++){xy[i*2]=re[i];xy[i*2+1]=im[i];}xy[SAMPLES*2]=xy[0];xy[SAMPLES*2+1]=xy[1];return xy;
}
function geoBounds(c){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const r of c.rings)for(const [x,y] of r.points){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return {x0,y0,x1,y1};}
function fixedCamera(c){const b=geoBounds(c);let tail=0;for(const r of c.rings){tail=Math.max(tail,r.terms.slice(128).reduce((sum,t)=>sum+t[1],0));for(let j=0;j<64;j++)endpoint(r,128,j/64,(x,y,nx,ny,radius)=>{b.x0=Math.min(b.x0,x-radius);b.x1=Math.max(b.x1,x+radius);b.y0=Math.min(b.y0,y-radius);b.y1=Math.max(b.y1,y+radius);});}b.x0-=tail;b.x1+=tail;b.y0-=tail;b.y1+=tail;return b;}
function projection(b,w,h,pad=16){const scale=Math.min((w-pad*2)/(b.x1-b.x0),(h-pad*2)/(b.y1-b.y0));return {scale,x:w/2-(b.x0+b.x1)*scale/2,y:h/2-(b.y0+b.y1)*scale/2};}
function plotProjection(){return projection(camera,width,height,18);}
function outlinePath(c){const p=projection(geoBounds(c),80,50,3);return c.rings.map(r=>'M'+r.points.map(([x,y])=>(p.x+x*p.scale).toFixed(2)+','+(p.y+y*p.scale).toFixed(2)).join('L')+'Z').join('');}
function showGroup(group){
 for(const [g,id] of Object.entries(groups))$(id).hidden=group!==g;
 $('group-note').hidden=group!=='province';
 document.querySelectorAll('[data-group]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.group===group)));
}
function mapsUI(){
 for(const c of maps){
  const button=document.createElement('button');button.type='button';button.className='country';button.dataset.country=c.id;button.dataset.shape=c.group==='complex';button.setAttribute('aria-label',c.fullName+(c.rank?'，2024 年人口第 '+c.rank+'，'+c.population+' 万人':''));button.setAttribute('aria-pressed',String(c.id===country.id));
  button.innerHTML=(c.rank?'<span class="population-rank">'+String(c.rank).padStart(2,'0')+'</span>':'')+'<svg aria-hidden="true" viewBox="0 0 80 50"><path d="'+outlinePath(c)+'"/></svg><span class="name">'+c.name+'</span>'+(c.rank?'<span class="population">'+c.population.toLocaleString('zh-CN')+' 万人</span>':'');
  button.onclick=()=>choose(c);$(groups[c.group]).appendChild(button);
 }
 document.querySelectorAll('[data-group]').forEach(b=>{b.onclick=()=>choose(lastSelections[b.dataset.group]);});
}
function announce(text){$('status').textContent=text;}
function updateControls(){
 const max=maxTerms();
 $('terms').max=max;$('terms').value=count;$('terms-output').value=count;$('increment').value=increment();$('increment').readOnly=$('step-mode').value==='adaptive';
 $('play').textContent=running?'暂停':(phase===1&&count===max&&$('auto').checked?'重新播放':'播放');
 $('next').disabled=count>=max&&$('auto').checked;
 const finished=phase===1&&count===max&&$('auto').checked&&!running;
 $('state-text').textContent=finished?'本次渐进绘制完成':running?($('auto').checked?'渐进绘制中':'单圈循环中'):'已暂停';
 $('state-text').parentElement.classList.toggle('is-paused',!running);
 document.querySelectorAll('.stage').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.n===count)));
 document.body.dataset.count=count;document.body.dataset.country=country.id;document.body.dataset.running=String(running);document.body.dataset.history=history.length;
}
function clearHistory(){history=[];historyDirty=true;historyPainted=0;}
function rememberCompleted(){
 if(phase<1||history.some(entry=>entry.count===count))return;
 history.push({count,curves});
}
function buildCurves(){curves=country.rings.map(r=>makeCurve(r,count));}
function setCount(n,{complete=false,notify=true}={}){
 count=Math.max(1,Math.min(maxTerms(),n));phase=complete?1:0;buildCurves();updateControls();draw();
 if(notify)announce('每条轮廓使用 '+count+' 个旋转圆'+(complete?'，显示完整重建轮廓。':'，开始新的一圈。')+' 已保留 '+history.length+' 轮历史轮廓。');
}
function choose(c){
 country=c;lastSelections[c.group]=c;showGroup(c.group);camera=fixedCamera(c);clearHistory();count=1;phase=0;running=!reduced;
 if($('clean-view'))$('clean-view').href='pure.html?shape='+encodeURIComponent(c.id);
 if($('full-view'))$('full-view').href='./?shape='+encodeURIComponent(c.id);
 $('country-name').textContent=c.fullName;$('drawing').setAttribute('aria-label',c.fullName+'傅里叶轮廓绘图。'+c.note+'。虚线为原始轮廓，浅色实线为已完成的历史轮廓，亮绿色实线为当前轨迹。');
 $('country-note').textContent=c.rings.length+' 条独立轮廓 · '+c.note;
 document.querySelectorAll('.country').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.country===c.id)));
 buildCurves();stagesUI();resize();updateControls();announce('已切换至'+c.name+'。从每条轮廓 1 个旋转圆开始，每圈增加 '+increment()+' 个，至 '+maxTerms()+' 个。');
}
function drawLine(context,xy,p,end,stroke,lineWidth,dash=[]){
 if(end<0)return;context.beginPath();for(let i=0;i<=end;i++){const x=p.x+xy[i*2]*p.scale,y=p.y+xy[i*2+1]*p.scale;i?context.lineTo(x,y):context.moveTo(x,y);}context.strokeStyle=stroke;context.lineWidth=lineWidth;context.setLineDash(dash);context.stroke();context.setLineDash([]);
}
function renderHistory(p){
 if(historyDirty){historyCtx.clearRect(0,0,width,height);historyPainted=0;historyDirty=false;}
 if(historyPainted===history.length)return;
 historyCtx.globalAlpha=.3;
 for(;historyPainted<history.length;historyPainted++)for(const xy of history[historyPainted].curves)drawLine(historyCtx,xy,p,SAMPLES,'#506d5c',1);
 historyCtx.globalAlpha=1;
}
function draw(){
 if(!camera||!width)return;ctx.clearRect(0,0,width,height);const p=plotProjection();
 if($('show-outline').checked){ctx.globalAlpha=.5;for(const r of country.rings){ctx.beginPath();r.points.forEach(([x,y],i)=>i?ctx.lineTo(p.x+x*p.scale,p.y+y*p.scale):ctx.moveTo(p.x+x*p.scale,p.y+y*p.scale));ctx.strokeStyle=color.original;ctx.lineWidth=.85;ctx.setLineDash([3,5]);ctx.stroke();}ctx.setLineDash([]);ctx.globalAlpha=1;}
 if($('show-history').checked){renderHistory(p);ctx.drawImage(historyLayer,0,0,width,height);}
 country.rings.forEach((r,index)=>{
  const tip=endpoint(r,count,phase,$('show-circles').checked?(x,y,nx,ny,radius)=>{
   if(radius*p.scale<.4)return;
   if(radius*p.scale>.6){ctx.globalAlpha=$('emphasize-circles').checked?(index===0?.78:.22):.22;ctx.strokeStyle=$('emphasize-circles').checked&&index===0?'#e6b77d':color.circle;ctx.lineWidth=$('emphasize-circles').checked&&index===0?1.25:.75;ctx.beginPath();ctx.arc(p.x+x*p.scale,p.y+y*p.scale,radius*p.scale,0,TAU);ctx.stroke();}
   ctx.globalAlpha=$('emphasize-circles').checked&&index===0?.86:.43;ctx.strokeStyle=$('emphasize-circles').checked&&index===0?'#efd5ad':color.circle;ctx.lineWidth=$('emphasize-circles').checked&&index===0?1:.8;ctx.beginPath();ctx.moveTo(p.x+x*p.scale,p.y+y*p.scale);ctx.lineTo(p.x+nx*p.scale,p.y+ny*p.scale);ctx.stroke();
   if($('emphasize-circles').checked&&index===0&&radius*p.scale>1.5){ctx.beginPath();ctx.arc(p.x+x*p.scale,p.y+y*p.scale,1.6,0,TAU);ctx.fillStyle='#efd5ad';ctx.fill();}
  }:null);
  ctx.globalAlpha=1;const end=Math.floor(phase*SAMPLES);drawLine(ctx,curves[index],p,end,color.trace,1.9);
  if(end<SAMPLES){ctx.beginPath();ctx.moveTo(p.x+curves[index][end*2]*p.scale,p.y+curves[index][end*2+1]*p.scale);ctx.lineTo(p.x+tip[0]*p.scale,p.y+tip[1]*p.scale);ctx.strokeStyle=color.trace;ctx.lineWidth=1.9;ctx.stroke();}
  ctx.fillStyle=color.pen;ctx.beginPath();ctx.arc(p.x+tip[0]*p.scale,p.y+tip[1]*p.scale,index===0?3.6:2.1,0,TAU);ctx.fill();
 });
 const percent=Math.floor(phase*100);$('lap-fill').style.width=percent+'%';$('lap-value').textContent=percent+'%';
}
function resize(){width=canvas.clientWidth;height=canvas.clientHeight;dpr=Math.min(devicePixelRatio||1,2);for(const c of [canvas,historyLayer]){c.width=Math.round(width*dpr);c.height=Math.round(height*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);historyCtx.setTransform(dpr,0,0,dpr,0,0);historyDirty=true;draw();}
function stagesUI(){
 const stages=$('stages');stages.replaceChildren();
 const max=maxTerms(),values=[...new Set([1,Math.min(8,max),Math.max(1,Math.round(max/8)),Math.max(1,Math.round(max/2)),max])].sort((a,b)=>a-b);
 values.forEach(n=>{
  const button=document.createElement('button');button.type='button';button.className='stage';button.dataset.n=n;button.setAttribute('aria-pressed',String(n===count));button.setAttribute('aria-label','查看每条轮廓 '+n+' 个旋转圆的完整重建图');
  button.innerHTML='<canvas aria-hidden="true" width="340" height="220"></canvas><span class="stage-label"><span>'+n+' 个圆</span></span>';
  button.onclick=()=>{running=false;setCount(n,{complete:true});};stages.appendChild(button);
  const cx=button.querySelector('canvas').getContext('2d'),p=projection(geoBounds(country),340,220,18);for(const r of country.rings)drawLine(cx,makeCurve(r,n),p,SAMPLES,color.trace,2.3);
 });
}
function finish(){running=false;updateControls();announce('已完成 '+country.name+' 的渐进绘制，使用 '+count+' 个圆，保留 '+history.length+' 轮历史轮廓。');}
function advance(){rememberCompleted();if($('auto').checked){if(count<maxTerms())setCount(nextCount());else finish();}else{phase=0;updateControls();draw();}}
function frame(time){
 const dt=last?Math.min((time-last)/1000,.1):0;last=time;
 if(running&&!document.hidden){
  let remaining=dt/+$('speed').value;
  while(running&&remaining>0){
   const toEnd=1-phase;
   if(remaining<toEnd){phase+=remaining;remaining=0;draw();}
   else{remaining-=toEnd;phase=1;if($('auto').checked&&count===maxTerms()){draw();finish();}else advance();}
  }
 }
 requestAnimationFrame(frame);
}
function restart(){clearHistory();running=true;setCount(1);last=0;}
$('play').onclick=()=>{
 if(!running&&phase===1){if($('auto').checked&&count===maxTerms()){restart();return;}rememberCompleted();if($('auto').checked)setCount(nextCount());else{phase=0;}}
 running=!running;last=0;updateControls();announce(running?'继续绘制。':'已暂停绘制。');
};
$('restart').onclick=restart;
$('next').onclick=()=>{phase=1;advance();};
$('terms').addEventListener('input',()=>{running=false;setCount(+$('terms').value,{complete:true,notify:false});});
$('terms').addEventListener('change',()=>announce('已暂停，显示 '+count+' 个旋转圆的完整重建轮廓。'));
$('speed').oninput=()=>{$('speed-output').value=Number($('speed').value).toFixed(1)+' 秒';};
$('increment').onchange=()=>{const n=Number($('increment').value);fixedIncrement=Number.isFinite(n)&&n>=1?Math.min(1024,Math.round(n)):5;updateControls();};
$('step-mode').onchange=()=>{updateControls();};
$('max-terms').onchange=()=>{$('max-terms').value=maxTerms();if(count>maxTerms())setCount(maxTerms(),{complete:true});if(count===maxTerms()&&phase===1&&$('auto').checked)running=false;stagesUI();updateControls();};
$('auto').onchange=()=>{updateControls();};
for(const id of ['show-outline','show-history'])$(id).onchange=draw;
$('show-circles').onchange=()=>{if(!$('show-circles').checked)$('emphasize-circles').checked=false;draw();};
$('emphasize-circles').onchange=()=>{if($('emphasize-circles').checked)$('show-circles').checked=true;draw();};
if($('parameter-panel')){
 const panel=$('parameter-panel');
 $('open-settings').onclick=()=>{panel.showModal();panel.scrollTop=0;};
 $('close-settings').onclick=()=>panel.close();
 panel.addEventListener('click',event=>{if(event.target!==panel)return;const r=panel.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)panel.close();});
}
new ResizeObserver(resize).observe(canvas);document.addEventListener('visibilitychange',()=>{last=0;});
mapsUI();choose(country);requestAnimationFrame(frame);
})();
