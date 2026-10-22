'use strict';
(() => {
const countries=window.ATLAS_COUNTRIES,$=id=>document.getElementById(id),TAU=2*Math.PI,SAMPLES=512;
const ctx=$('drawing').getContext('2d');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let country=countries[0],count=1,phase=0,running=!reduced,hold=0,last=0,curves=[],camera=null,width=0,height=0,raf;
const lastSelections={world:countries[0],province:countries.find(c=>c.group==='province')};
const color={trace:'#8cdeba',pen:'#edac7e',circle:'#9bbfa8',original:'#8fa996'};
function endpoint(r,n,t,visit){let [x,y]=r.center;for(let i=0;i<n;i++){const [k,radius,a]=r.terms[i],angle=TAU*k*t+a,nx=x+radius*Math.cos(angle),ny=y+radius*Math.sin(angle);if(visit)visit(x,y,nx,ny,radius);x=nx;y=ny;}return [x,y];}
function makeCurve(r,n){const xy=new Float64Array((SAMPLES+1)*2);for(let j=0;j<=SAMPLES;j++){const p=endpoint(r,n,j/SAMPLES);xy[j*2]=p[0];xy[j*2+1]=p[1];}return xy;}
function geoBounds(c){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const r of c.rings)for(const [x,y] of r.points){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return {x0,y0,x1,y1};}
function fixedCamera(c){const b=geoBounds(c);for(const r of c.rings)for(let j=0;j<64;j++)endpoint(r,128,j/64,(x,y,nx,ny,radius)=>{b.x0=Math.min(b.x0,x-radius);b.x1=Math.max(b.x1,x+radius);b.y0=Math.min(b.y0,y-radius);b.y1=Math.max(b.y1,y+radius);});return b;}
function projection(bounds,w,h,pad=16){const scale=Math.min((w-pad*2)/(bounds.x1-bounds.x0),(h-pad*2)/(bounds.y1-bounds.y0));return {scale,x:w/2-(bounds.x0+bounds.x1)*scale/2,y:h/2-(bounds.y0+bounds.y1)*scale/2};}
function outlinePath(c){const b=geoBounds(c),p=projection(b,80,50,3);return c.rings.map(r=>'M'+r.points.map(([x,y])=>(p.x+x*p.scale).toFixed(2)+','+(p.y+y*p.scale).toFixed(2)).join('L')+'Z').join('');}
function showGroup(group){$('countries').hidden=group!=='world';$('provinces').hidden=group!=='province';$('collection-range').textContent=group==='world'?'01 — 10':'01 — 08';document.querySelectorAll('[data-group]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.group===group)));}
function countriesUI(){for(const c of countries){const button=document.createElement('button');button.type='button';button.className='country';button.dataset.country=c.id;button.setAttribute('aria-label',c.fullName);button.setAttribute('aria-pressed',String(c.id===country.id));button.innerHTML='<svg aria-hidden="true" viewBox="0 0 80 50"><path d="'+outlinePath(c)+'"/></svg><span class="name">'+c.name+'</span>';button.onclick=()=>choose(c);$(c.group==='province'?'provinces':'countries').appendChild(button);}document.querySelectorAll('[data-group]').forEach(b=>{b.onclick=()=>choose(lastSelections[b.dataset.group]);});}
function announce(text){$('status').textContent=text;}
function updateControls(){
 const max=+$('max-terms').value;
 $('circle-count').textContent=count;$('terms').max=max;$('terms').value=count;$('terms-output').value=count;$('range-max').textContent=max+' · 更多细节';
 $('play').textContent=running?'暂停':(phase===1&&count===max&&$('auto').checked?'重新播放':'播放');
 $('next').disabled=count>=max&&$('auto').checked;
 const finished=phase===1&&count===max&&$('auto').checked&&!running;
 $('state-text').textContent=finished?'本次渐进绘制完成':running?($('auto').checked?'渐进绘制中':'单圈循环中'):'已暂停';
 $('state-text').parentElement.classList.toggle('is-paused',!running);
 document.querySelectorAll('.stage').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.n===count)));
 document.body.dataset.count=count;document.body.dataset.country=country.id;document.body.dataset.running=String(running);
}
function buildCurves(){curves=country.rings.map(r=>makeCurve(r,count));}
function setCount(n,{complete=false,notify=true}={}){count=Math.max(1,Math.min(+$('max-terms').value,n));phase=complete?1:0;hold=0;buildCurves();updateControls();draw();if(notify)announce('每条轮廓使用 '+count+' 个旋转圆'+(complete?'，显示完整重建轮廓。':'，开始新的一圈。'));}
function choose(c){country=c;lastSelections[c.group]=c;showGroup(c.group);camera=fixedCamera(c);count=1;phase=0;hold=0;running=!reduced;$('country-name').textContent=c.fullName;$('drawing').setAttribute('aria-label',c.fullName+'傅里叶轮廓绘图。'+c.note+'。虚线为原始轮廓，绿色实线为重建轨迹。');$('country-en').textContent=c.en.toUpperCase();$('country-note').textContent=c.rings.length+' 条独立陆地轮廓 · '+c.note;document.querySelectorAll('.country').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.country===c.id)));buildCurves();stagesUI();resize();updateControls();announce('已切换至'+c.name+'。从每条轮廓 1 个旋转圆开始'+(running?'渐进绘制。':'，点击播放开始。'));}
function drawLine(context,xy,p,end,color,width,dash=[]){if(end<0)return;context.beginPath();for(let i=0;i<=end;i++){const x=p.x+xy[i*2]*p.scale,y=p.y+xy[i*2+1]*p.scale;i?context.lineTo(x,y):context.moveTo(x,y);}context.strokeStyle=color;context.lineWidth=width;context.setLineDash(dash);context.stroke();context.setLineDash([]);}
function draw(){if(!camera||!width)return;ctx.clearRect(0,0,width,height);const topInset=width<420?60:0;const p=projection(camera,width,height-topInset,18);p.y+=topInset;
 if($('show-outline').checked){ctx.globalAlpha=.5;for(const r of country.rings){ctx.beginPath();r.points.forEach(([x,y],i)=>i?ctx.lineTo(p.x+x*p.scale,p.y+y*p.scale):ctx.moveTo(p.x+x*p.scale,p.y+y*p.scale));ctx.strokeStyle=color.original;ctx.lineWidth=.85;ctx.setLineDash([3,5]);ctx.stroke();}ctx.setLineDash([]);ctx.globalAlpha=1;}
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
 const percent=Math.floor(phase*100);$('lap-fill').style.width=percent+'%';$('lap-value').textContent=percent+'%';$('round-detail').textContent='第 '+count+' 圈 · '+percent+'%';
}
function resize(){const canvas=$('drawing');width=canvas.clientWidth;height=canvas.clientHeight;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
function stagesUI(){const stages=$('stages');stages.replaceChildren();const descriptions=['最初的圆','大致走向','形状初现','海岸细节','精细轮廓'];[1,4,16,64,128].forEach((n,i)=>{const button=document.createElement('button');button.type='button';button.className='stage';button.dataset.n=n;button.setAttribute('aria-pressed',String(n===count));button.setAttribute('aria-label','查看每条轮廓 '+n+' 个旋转圆的完整重建图');button.innerHTML='<canvas aria-hidden="true" width="340" height="220"></canvas><span class="stage-label"><span>'+String(n).padStart(2,'0')+' 个圆</span><span>'+descriptions[i]+'</span></span>';button.onclick=()=>{running=false;if(n>+$('max-terms').value)$('max-terms').value='128';setCount(n,{complete:true});};stages.appendChild(button);const cv=button.querySelector('canvas'),cx=cv.getContext('2d'),p=projection(geoBounds(country),340,220,18);for(const r of country.rings){drawLine(cx,makeCurve(r,n),p,SAMPLES,color.trace,2.3);}});}
function advance(){const max=+$('max-terms').value;if($('auto').checked){if(count<max){setCount(count+1);return;}running=false;updateControls();announce('已完成 '+country.name+' 的 '+max+' 圈渐进绘制。');}else{phase=0;hold=0;}}
function frame(time){const dt=last?Math.min((time-last)/1000,.1):0;last=time;if(running&&!document.hidden){if(phase>=1){hold+=dt;if(hold>=.55)advance();}else{phase=Math.min(1,phase+dt/+$('speed').value);draw();if(phase>=1&&$('auto').checked&&count===+$('max-terms').value){running=false;updateControls();announce('已完成 '+country.name+' 的 '+count+' 圈渐进绘制。');}}}raf=requestAnimationFrame(frame);}
$('play').onclick=()=>{if(!running&&phase===1){if($('auto').checked&&count===+$('max-terms').value)setCount(1);else if($('auto').checked)setCount(count+1);else{phase=0;hold=0;}}running=!running;last=0;updateControls();announce(running?'继续绘制。':'已暂停绘制。');};
$('restart').onclick=()=>{running=true;setCount(1);last=0;};
$('next').onclick=()=>{if($('auto').checked){if(count<+$('max-terms').value)setCount(count+1);}else{phase=0;hold=0;draw();}};
$('terms').addEventListener('input',()=>{running=false;setCount(+$('terms').value,{complete:true,notify:false});});$('terms').addEventListener('change',()=>announce('已暂停，显示 '+count+' 个旋转圆的完整重建轮廓。'));
$('speed').oninput=()=>{$('speed-output').value=Number($('speed').value).toFixed(1)+' 秒';};
$('max-terms').onchange=()=>{if(count>+$('max-terms').value)setCount(+$('max-terms').value,{complete:true});updateControls();};
$('auto').onchange=()=>{hold=0;updateControls();};$('show-circles').onchange=draw;$('show-outline').onchange=draw;
new ResizeObserver(resize).observe($('drawing'));document.addEventListener('visibilitychange',()=>{last=0;});
countriesUI();choose(country);raf=requestAnimationFrame(frame);
})();
