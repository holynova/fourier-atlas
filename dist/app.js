'use strict';
(() => {
const maps=window.ATLAS_COUNTRIES,$=id=>document.getElementById(id),TAU=2*Math.PI,SAMPLES=1024;
const canvas=$('drawing'),ctx=canvas.getContext('2d'),historyLayer=document.createElement('canvas'),historyCtx=historyLayer.getContext('2d');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const groups={world:'countries',province:'provinces',complex:'complex-shapes'};
const lastSelections=Object.fromEntries(Object.keys(groups).map(g=>[g,maps.find(c=>c.group===g)]));
const color={trace:'#8cdeba',pen:'#edac7e',circle:'#9bbfa8',original:'#8fa996'};
let country=maps[0],count=1,phase=0,running=!reduced,hold=0,last=0,curves=[],camera=null,width=0,height=0,dpr=1;
let history=[],historyDirty=true;
function maxTerms(){return +$('max-terms').value;}
function increment(){const n=Number($('increment').value);return Number.isFinite(n)&&n>=1?Math.min(50,Math.round(n)):5;}
function nextCount(){return Math.min(maxTerms(),count+increment());}
function endpoint(r,n,t,visit){
 let [x,y]=r.center;
 for(let i=0;i<n;i++){const [k,radius,a]=r.terms[i],angle=TAU*k*t+a,nx=x+radius*Math.cos(angle),ny=y+radius*Math.sin(angle);if(visit)visit(x,y,nx,ny,radius);x=nx;y=ny;}
 return [x,y];
}
function makeCurve(r,n){const xy=new Float64Array((SAMPLES+1)*2);for(let j=0;j<=SAMPLES;j++){const p=endpoint(r,n,j/SAMPLES);xy[j*2]=p[0];xy[j*2+1]=p[1];}return xy;}
function geoBounds(c){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const r of c.rings)for(const [x,y] of r.points){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return {x0,y0,x1,y1};}
function fixedCamera(c){const b=geoBounds(c);for(const r of c.rings)for(let j=0;j<64;j++)endpoint(r,128,j/64,(x,y,nx,ny,radius)=>{b.x0=Math.min(b.x0,x-radius);b.x1=Math.max(b.x1,x+radius);b.y0=Math.min(b.y0,y-radius);b.y1=Math.max(b.y1,y+radius);});return b;}
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
 $('terms').max=max;$('terms').value=count;$('terms-output').value=count;
 $('play').textContent=running?'暂停':(phase===1&&count===max&&$('auto').checked?'重新播放':'播放');
 $('next').disabled=count>=max&&$('auto').checked;
 const finished=phase===1&&count===max&&$('auto').checked&&!running;
 $('state-text').textContent=finished?'本次渐进绘制完成':running?($('auto').checked?'渐进绘制中':'单圈循环中'):'已暂停';
 $('state-text').parentElement.classList.toggle('is-paused',!running);
 document.querySelectorAll('.stage').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.n===count)));
 document.body.dataset.count=count;document.body.dataset.country=country.id;document.body.dataset.running=String(running);document.body.dataset.history=history.length;
}
function clearHistory(){history=[];historyDirty=true;}
function rememberCompleted(){
 if(phase<1||history.some(entry=>entry.count===count))return;
 history.push({count,curves});historyDirty=true;
}
function buildCurves(){curves=country.rings.map(r=>makeCurve(r,count));}
function setCount(n,{complete=false,notify=true}={}){
 count=Math.max(1,Math.min(maxTerms(),n));phase=complete?1:0;hold=0;buildCurves();updateControls();draw();
 if(notify)announce('每条轮廓使用 '+count+' 个旋转圆'+(complete?'，显示完整重建轮廓。':'，开始新的一圈。')+' 已保留 '+history.length+' 轮历史轮廓。');
}
function choose(c){
 country=c;lastSelections[c.group]=c;showGroup(c.group);camera=fixedCamera(c);clearHistory();count=1;phase=0;hold=0;running=!reduced;
 $('country-name').textContent=c.fullName;$('drawing').setAttribute('aria-label',c.fullName+'傅里叶轮廓绘图。'+c.note+'。虚线为原始轮廓，浅色实线为已完成的历史轮廓，亮绿色实线为当前轨迹。');
 $('country-note').textContent=c.rings.length+' 条独立轮廓 · '+c.note;
 document.querySelectorAll('.country').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.country===c.id)));
 buildCurves();stagesUI();resize();updateControls();announce('已切换至'+c.name+'。从每条轮廓 1 个旋转圆开始，每圈增加 '+increment()+' 个，至 '+maxTerms()+' 个。');
}
function drawLine(context,xy,p,end,stroke,lineWidth,dash=[]){
 if(end<0)return;context.beginPath();for(let i=0;i<=end;i++){const x=p.x+xy[i*2]*p.scale,y=p.y+xy[i*2+1]*p.scale;i?context.lineTo(x,y):context.moveTo(x,y);}context.strokeStyle=stroke;context.lineWidth=lineWidth;context.setLineDash(dash);context.stroke();context.setLineDash([]);
}
function renderHistory(p){
 if(!historyDirty)return;
 historyCtx.clearRect(0,0,width,height);
 history.forEach((entry,index)=>{const age=history.length-index-1;historyCtx.globalAlpha=.035+.16*Math.exp(-age*.24);for(const xy of entry.curves)drawLine(historyCtx,xy,p,SAMPLES,color.trace,1);});
 historyCtx.globalAlpha=1;historyDirty=false;
}
function draw(){
 if(!camera||!width)return;ctx.clearRect(0,0,width,height);const p=plotProjection();
 if($('show-outline').checked){ctx.globalAlpha=.5;for(const r of country.rings){ctx.beginPath();r.points.forEach(([x,y],i)=>i?ctx.lineTo(p.x+x*p.scale,p.y+y*p.scale):ctx.moveTo(p.x+x*p.scale,p.y+y*p.scale));ctx.strokeStyle=color.original;ctx.lineWidth=.85;ctx.setLineDash([3,5]);ctx.stroke();}ctx.setLineDash([]);ctx.globalAlpha=1;}
 if($('show-history').checked){renderHistory(p);ctx.drawImage(historyLayer,0,0,width,height);}
 country.rings.forEach((r,index)=>{
  const tip=endpoint(r,count,phase,$('show-circles').checked?(x,y,nx,ny,radius)=>{
   if(radius*p.scale>.3){ctx.globalAlpha=.22;ctx.strokeStyle=color.circle;ctx.lineWidth=.75;ctx.beginPath();ctx.arc(p.x+x*p.scale,p.y+y*p.scale,radius*p.scale,0,TAU);ctx.stroke();}
   ctx.globalAlpha=.43;ctx.strokeStyle=color.circle;ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(p.x+x*p.scale,p.y+y*p.scale);ctx.lineTo(p.x+nx*p.scale,p.y+ny*p.scale);ctx.stroke();
  }:null);
  ctx.globalAlpha=1;const end=Math.floor(phase*SAMPLES);drawLine(ctx,curves[index],p,end,color.trace,1.9);
  if(end<SAMPLES){ctx.beginPath();ctx.moveTo(p.x+curves[index][end*2]*p.scale,p.y+curves[index][end*2+1]*p.scale);ctx.lineTo(p.x+tip[0]*p.scale,p.y+tip[1]*p.scale);ctx.strokeStyle=color.trace;ctx.lineWidth=1.9;ctx.stroke();}
  ctx.fillStyle=color.pen;ctx.beginPath();ctx.arc(p.x+tip[0]*p.scale,p.y+tip[1]*p.scale,index===0?3.6:2.1,0,TAU);ctx.fill();
 });
 for(const r of country.rings){if(!r.label)continue;const x=p.x+r.center[0]*p.scale,y=p.y+r.center[1]*p.scale;ctx.globalAlpha=1;ctx.font='11px -apple-system, sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillStyle='#cfdfd2';ctx.fillText(r.label,Math.min(width-31,x+12),y);}
 const percent=Math.floor(phase*100);$('lap-fill').style.width=percent+'%';$('lap-value').textContent=percent+'%';
}
function resize(){width=canvas.clientWidth;height=canvas.clientHeight;dpr=Math.min(devicePixelRatio||1,2);for(const c of [canvas,historyLayer]){c.width=Math.round(width*dpr);c.height=Math.round(height*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);historyCtx.setTransform(dpr,0,0,dpr,0,0);historyDirty=true;draw();}
function stagesUI(){
 const stages=$('stages');stages.replaceChildren();
 [1,6,21,51,100].forEach((n,i)=>{
  const button=document.createElement('button');button.type='button';button.className='stage';button.dataset.n=n;button.setAttribute('aria-pressed',String(n===count));button.setAttribute('aria-label','查看每条轮廓 '+n+' 个旋转圆的完整重建图');
  button.innerHTML='<canvas aria-hidden="true" width="340" height="220"></canvas><span class="stage-label"><span>'+n+' 个圆</span></span>';
  button.onclick=()=>{running=false;if(n>maxTerms())$('max-terms').value='100';setCount(n,{complete:true});};stages.appendChild(button);
  const cx=button.querySelector('canvas').getContext('2d'),p=projection(geoBounds(country),340,220,18);for(const r of country.rings)drawLine(cx,makeCurve(r,n),p,SAMPLES,color.trace,2.3);
 });
}
function finish(){running=false;updateControls();announce('已完成 '+country.name+' 的渐进绘制，使用 '+count+' 个圆，保留 '+history.length+' 轮历史轮廓。');}
function advance(){rememberCompleted();if($('auto').checked){if(count<maxTerms())setCount(nextCount());else finish();}else{phase=0;hold=0;updateControls();draw();}}
function frame(time){
 const dt=last?Math.min((time-last)/1000,.1):0;last=time;
 if(running&&!document.hidden){if(phase>=1){hold+=dt;if(hold>=.55)advance();}else{phase=Math.min(1,phase+dt/+$('speed').value);draw();if(phase>=1&&$('auto').checked&&count===maxTerms())finish();}}
 requestAnimationFrame(frame);
}
function restart(){clearHistory();running=true;setCount(1);last=0;}
$('play').onclick=()=>{
 if(!running&&phase===1){if($('auto').checked&&count===maxTerms()){restart();return;}rememberCompleted();if($('auto').checked)setCount(nextCount());else{phase=0;hold=0;}}
 running=!running;last=0;updateControls();announce(running?'继续绘制。':'已暂停绘制。');
};
$('restart').onclick=restart;
$('next').onclick=()=>{phase=1;advance();};
$('terms').addEventListener('input',()=>{running=false;setCount(+$('terms').value,{complete:true,notify:false});});
$('terms').addEventListener('change',()=>announce('已暂停，显示 '+count+' 个旋转圆的完整重建轮廓。'));
$('speed').oninput=()=>{$('speed-output').value=Number($('speed').value).toFixed(1)+' 秒';};
$('increment').onchange=()=>{$('increment').value=increment();announce('每圈增加 '+increment()+' 个旋转圆，最终到 '+maxTerms()+' 个圆。');};
$('max-terms').onchange=()=>{if(count>maxTerms())setCount(maxTerms(),{complete:true});if(count===maxTerms()&&phase===1&&$('auto').checked)running=false;updateControls();};
$('auto').onchange=()=>{hold=0;updateControls();};
for(const id of ['show-circles','show-outline','show-history'])$(id).onchange=draw;
new ResizeObserver(resize).observe(canvas);document.addEventListener('visibilitychange',()=>{last=0;});
mapsUI();choose(country);requestAnimationFrame(frame);
})();
