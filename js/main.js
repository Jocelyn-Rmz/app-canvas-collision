/* ====== Config ====== */
const ITEMS_PER_LEVEL=10, MAX_LEVELS=10;
const BASE_SPEED_PX_S=70, LEVEL_SPEED_STEP=0.12;
const QUICK_KILL=true, FADE_SPEED=10.0, FLASH_MS=100;

const MIN_RADIUS=16, MAX_RADIUS=28, MAX_DRIFT=45;
const WOBBLE_AMP_MIN=6, WOBBLE_AMP_MAX=18, WOBBLE_FREQ_MIN=0.5, WOBBLE_FREQ_MAX=1.2;
const PALETTE=["#60a5fa","#34d399","#fbbf24","#f472b6","#a78bfa","#22d3ee","#f87171"];

/* ====== Stage / Canvas ====== */
const stage=document.getElementById("stage");
const canvas=document.getElementById("canvas");
const ctx=canvas.getContext("2d");
function fitCanvasToStage(){ const r=stage.getBoundingClientRect(); canvas.width=Math.floor(r.width); canvas.height=Math.floor(r.height); }
fitCanvasToStage(); window.addEventListener("resize", fitCanvasToStage);

/* ====== HUD ====== */
const levelEl=document.getElementById("level");
const killedEl=document.getElementById("killed");
const percentEl=document.getElementById("percent");

/* ====== Modales ====== */
const resultModal=new bootstrap.Modal(document.getElementById("resultModal"),{backdrop:'static',keyboard:false});
const summaryModal=new bootstrap.Modal(document.getElementById("summaryModal"),{backdrop:'static',keyboard:false});
const rmLevelEl=document.getElementById("rmLevel");
const rmKilledEl=document.getElementById("rmKilled");
const rmEscapedEl=document.getElementById("rmEscaped");
const rmEffEl=document.getElementById("rmEff");
const rmTimeEl=document.getElementById("rmTime");
const rmEffBar=document.getElementById("rmEffBar");
const rmNextBtn=document.getElementById("rmNext");
const rmEndBtn=document.getElementById("rmEnd");
const sumTableBody=document.querySelector("#summaryTable tbody");
const sumKilledEl=document.getElementById("sumKilled");
const sumEscapedEl=document.getElementById("sumEscaped");
const sumEffEl=document.getElementById("sumEff");
const sumTimeEl=document.getElementById("sumTime");
const summaryRestartBtn=document.getElementById("summaryRestart");

/* ====== Botones ====== */
const btnStart=document.getElementById("btnStart");
const btnPause=document.getElementById("btnPause");
const btnResume=document.getElementById("btnResume");
const btnReset=document.getElementById("btnReset");

/* ====== Utils ====== */
const rand=(a,b)=>Math.random()*(b-a)+a;
const randInt=(a,b)=>Math.floor(rand(a,b+1));
const randomColor=()=>PALETTE[randInt(0,PALETTE.length-1)];
const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
const round1=x=>Math.round(x*10)/10;

/* ====== Estado ====== */
let items=[], level=1, killedCount=0, escapedCount=0;
let mouseX=-9999, mouseY=-9999, lastTs=performance.now();
let started=false, gameOver=false, paused=true;  // comienza en pausa hasta pulsar INICIAR
let advancing=false, nextLevelTimer=null;
let levelStartTime=performance.now();
const levelStats=[];

/* ====== Clase Item ====== */
class Item{
  constructor(x,y,r,c,speed){ this.posX=x; this.posY=y; this.radius=r; this.baseColor=c;
    this.alpha=1; this.fading=false; this.flashUntil=0; this.speedBase=speed;
    this.vx=rand(-20,20); this.vy=-speed;
    this.wobbleAmp=rand(WOBBLE_AMP_MIN,WOBBLE_AMP_MAX); this.wobbleFreq=rand(WOBBLE_FREQ_MIN,WOBBLE_FREQ_MAX); this.phase=rand(0,Math.PI*2);
    this.clicked=false; this.removed=false; }
  get isDead(){ return this.alpha<=0; }
  containsPoint(x,y){ return Math.hypot(x-this.posX,y-this.posY)<=this.radius; }
  click(){ if(this.isDead||this.removed) return; this.flashUntil=performance.now()+FLASH_MS; this.clicked=true; this.alpha=QUICK_KILL?0:this.alpha; this.fading=!QUICK_KILL;
    if(!this.removed){ this.removed=true; killedCount=clamp(killedCount+1,0,ITEMS_PER_LEVEL); updateHUD(); checkLevelComplete(); } }
  update(dt,mult,width){
    const wobble=Math.sin((performance.now()/1000)*this.wobbleFreq+this.phase)*this.wobbleAmp;
    const noise=rand(-1,1)*MAX_DRIFT; this.vx=clamp(this.vx+noise*dt,-120,120); this.vy=-this.speedBase*mult;
    this.posX+=(this.vx+0.6*wobble)*dt; this.posY+=this.vy*dt;
    // Rebote lateral
    if(this.posX-this.radius<=0 && this.vx<0){ this.posX=this.radius; this.vx=-this.vx; }
    if(this.posX+this.radius>=width && this.vx>0){ this.posX=width-this.radius; this.vx=-this.vx; }
    // Escapar por arriba
    if(this.posY+this.radius<0 && !this.removed){ this.alpha=0; this.removed=true; if(!this.clicked){ escapedCount=clamp(escapedCount+1,0,ITEMS_PER_LEVEL); updateHUD(); } }
    if(this.fading){ this.alpha=Math.max(0,this.alpha-FADE_SPEED*dt); }
  }
  draw(context){
    const now=performance.now(), over=this.containsPoint(mouseX,mouseY), flashing=now<this.flashUntil;
    const fill=flashing?"red":(over?"#ffffff":this.baseColor);
    context.save(); context.globalAlpha=this.alpha; context.shadowColor=fill; context.shadowBlur=18;
    context.beginPath(); context.arc(this.posX,this.posY,this.radius,0,Math.PI*2); context.fillStyle=fill; context.fill();
    context.shadowBlur=0; context.lineWidth=2.4; context.strokeStyle="#ffffff"; context.stroke(); context.restore();
  }
}

/* ====== Lógica de niveles ====== */
const speedMult=lvl=>1+(lvl-1)*LEVEL_SPEED_STEP;

function spawnLevel(n){
  if(nextLevelTimer){ clearTimeout(nextLevelTimer); nextLevelTimer=null; }
  advancing=false;
  if(n>MAX_LEVELS){ showSummary(); return; }
  level=n; killedCount=0; escapedCount=0; updateHUD(); levelStartTime=performance.now();
  items=[]; const w=canvas.width,h=canvas.height;
  for(let i=0;i<ITEMS_PER_LEVEL;i++){ const r=randInt(MIN_RADIUS,MAX_RADIUS), x=rand(r,w-r), y=h+r+rand(10,h*0.6);
    items.push(new Item(x,y,r,randomColor(),BASE_SPEED_PX_S)); }
}

function endLevelAndAsk(){
  const time=(performance.now()-levelStartTime)/1000, eff=Math.round((killedCount/ITEMS_PER_LEVEL)*100);
  levelStats.push({level, killed:killedCount, escaped:escapedCount, effPct:eff, timeSec:round1(time)});
  rmLevelEl.textContent=level; rmKilledEl.textContent=killedCount; rmEscapedEl.textContent=escapedCount;
  rmEffEl.textContent=`${eff}%`; rmEffBar.style.width=`${eff}%`; rmTimeEl.textContent=`${round1(time)} s`;
  rmNextBtn.textContent=(level>=MAX_LEVELS)?"Finalizar":"Siguiente nivel";
  paused=true; resultModal.show(); updateControls();
}

function showSummary(){
  sumTableBody.innerHTML=""; let tK=0,tE=0,tT=0;
  for(const s of levelStats){ const tr=document.createElement("tr");
    tr.innerHTML=`<td class="text-center">${s.level}</td><td>${s.killed}</td><td>${s.escaped}</td><td>${s.effPct}%</td><td>${s.timeSec}</td>`;
    sumTableBody.appendChild(tr); tK+=s.killed; tE+=s.escaped; tT+=s.timeSec; }
  const total=levelStats.length*ITEMS_PER_LEVEL, eff=total?Math.round((tK/total)*100):0;
  sumKilledEl.textContent=tK; sumEscapedEl.textContent=tE; sumEffEl.textContent=`${eff}%`; sumTimeEl.textContent=round1(tT);
  paused=true; summaryModal.show(); updateControls();
}

/* ====== HUD ====== */
function updateHUD(){ levelEl.textContent=started?level:"—"; killedEl.textContent=`${killedCount}/${ITEMS_PER_LEVEL}`;
  percentEl.textContent=`${Math.round((killedCount/ITEMS_PER_LEVEL)*100)}%`; }

/* ====== Botonera (estados) ====== */
function updateControls(){
  btnStart.disabled = started;                 // solo antes de empezar
  btnPause.disabled = !started || paused;      // activo cuando jugando
  btnResume.disabled= !started || !paused;     // activo cuando pausado
  btnReset.disabled = !started;                // activo durante/tras partida
}

/* ====== Interacción ====== */
canvas.addEventListener("mousemove",e=>{ const r=canvas.getBoundingClientRect(), sx=canvas.width/r.width, sy=canvas.height/r.height;
  mouseX=(e.clientX-r.left)*sx; mouseY=(e.clientY-r.top)*sy; });
canvas.addEventListener("mouseleave",()=>{ mouseX=-9999; mouseY=-9999; });
canvas.addEventListener("click",()=>{ if(!started || paused) return;
  for(let i=items.length-1;i>=0;i--){ const it=items[i]; if(!it.isDead && it.containsPoint(mouseX,mouseY)){ it.click(); break; } }});

/* ====== Loop ====== */
function checkLevelComplete(){
  if(advancing||paused) return;
  if(!items.every(it=>it.isDead)) return;
  advancing=true; nextLevelTimer=setTimeout(()=>endLevelAndAsk(),200);
}
function loop(ts){
  const dt=Math.min(0.035,(ts-lastTs)/1000); lastTs=ts;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(started && !paused){
    const mult=speedMult(level);
    for(const it of items){ if(!it.isDead){ it.update(dt,mult,canvas.width); it.draw(ctx); } }
    items=items.filter(it=>!it.isDead);
    if(items.length===0) checkLevelComplete();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ====== Botones: acciones ====== */
btnStart.addEventListener("click", ()=>{
  if(started) return;
  started=true; gameOver=false; levelStats.length=0;
  spawnLevel(1);
  paused=false; updateControls(); updateHUD();
});
btnPause.addEventListener("click", ()=>{ if(!started) return; paused=true; updateControls(); });
btnResume.addEventListener("click", ()=>{ if(!started) return; paused=false; updateControls(); });
btnReset.addEventListener("click", ()=>{
  // cierra modales y reinicia
  try{ resultModal.hide(); }catch{} try{ summaryModal.hide(); }catch{}
  started=true; levelStats.length=0; level=1; killedCount=0; escapedCount=0; paused=false; advancing=false; items=[];
  spawnLevel(1); updateControls(); updateHUD();
});

/* ====== Modales: siguiente/terminar/reiniciar ====== */
rmNextBtn.addEventListener("click", ()=>{
  resultModal.hide(); if(level>=MAX_LEVELS){ showSummary(); }
  else { paused=false; spawnLevel(level+1); updateControls(); }
});
rmEndBtn.addEventListener("click", ()=>{ resultModal.hide(); showSummary(); });
summaryRestartBtn.addEventListener("click", ()=>{
  summaryModal.hide(); started=true; levelStats.length=0; paused=false; spawnLevel(1); updateControls(); updateHUD();
});
