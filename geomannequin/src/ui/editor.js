/* GeoMannequin — editor de comandos: numeração de linhas, execução, exemplos e histórico */
import { $ } from "../scene/ambiente.js";
import { LOG, camera, cena, tema, poseCmd } from "../scene/comandos.js";
import { loadScene, sceneState } from "../scene/estado.js";
import { refreshScene } from "./painel-cena.js";
import { syncControls } from "./controles.js";
import { render } from "./palco.js";
import { SCN } from "../scene/modelo.js";
import { EXAMPLES, REF } from "../scene/ajuda.js";

let codeEl,gut,outEl;
function gutter(){const n=codeEl.value.split("\n").length;let t="";for(let i=1;i<=n;i++)t+=i+"\n";gut.textContent=t;gut.scrollTop=codeEl.scrollTop}
function outLine(t,cls){const s=document.createElement("span");if(cls)s.className=cls;s.textContent=t+"\n";outEl.appendChild(s);outEl.scrollTop=outEl.scrollHeight}
let HIST=[];
function refreshHist(){const h=$("history");h.innerHTML='<option value="">Histórico…</option>';HIST.forEach((c,i)=>{const o=document.createElement("option");o.value=i;o.textContent=(i+1)+". "+c.split("\n")[0].slice(0,40);h.appendChild(o)})}
let execRodando=false;
async function runCode(){
  const code=codeEl.value;if(!code.trim()||execRodando)return;
  execRodando=true;const botao=$("runCode");if(botao)botao.disabled=true;
  outEl.textContent="";LOG.length=0;
  const log=(...a)=>LOG.push(["log",a.map(x=>typeof x==="object"?JSON.stringify(x):String(x)).join(" ")]);
  const snapshot=cena.estadoCompleto();
  try{
    // Executa scripts síncronos antigos e scripts com await na mesma API.
    // Não é sandbox de segurança: só execute código que você conhece.
    const fn=new Function("cena","camera","tema","log","pose",'"use strict";return (async()=>{\n'+code+'\n})();');
    await fn(cena,camera,tema,log,poseCmd);
    if(!/cena\.(?:desfazer|refazer|marcarEstado)\s*\(/.test(code))cena.marcarEstado(snapshot);
    LOG.forEach(([k,t])=>outLine((k==="aviso"?"⚠ ":"")+t,k==="aviso"?"err":""));
    outLine("✓ Executado: "+SCN.list.length+" manequim(ns). Comandos com await finalizados.","ok");
    HIST=[code].concat(HIST.filter(c=>c!==code)).slice(0,15);
    try{localStorage.setItem("geomannequin.hist",JSON.stringify(HIST))}catch(e){}
    refreshHist();
  }catch(err){
    LOG.forEach(([k,t])=>outLine(t));
    const m=/<anonymous>:(\d+):(\d+)/.exec(err.stack||"");
    const ln=m?" (linha aproximada "+Math.max(1,Number(m[1])-4)+")":"";
    outLine("✗ Erro"+ln+": "+(err.message||String(err)),"err");
    try{cena.restaurarCompleto(snapshot)}catch(e){outLine("Falha ao restaurar: "+e.message,"err")}
    outLine("A cena, as camadas visuais e o estilo voltaram ao estado anterior.","err");
  }finally{
    execRodando=false;if(botao)botao.disabled=false;
    refreshScene();syncControls();render();
  }
}

/* execução inicial deste módulo (na mesma ordem do app original) */
export function iniciarEditor(){
  codeEl=$("code");
  gut=$("gutter");
  outEl=$("cmdOut");
  codeEl.addEventListener("input",gutter);
  codeEl.addEventListener("scroll",()=>{gut.scrollTop=codeEl.scrollTop});
  codeEl.addEventListener("keydown",e=>{
    if(e.key==="Tab"){e.preventDefault();const a=codeEl.selectionStart,b=codeEl.selectionEnd;codeEl.value=codeEl.value.slice(0,a)+"  "+codeEl.value.slice(b);codeEl.selectionStart=codeEl.selectionEnd=a+2;gutter()}
    if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)){e.preventDefault();runCode()}
  });
  try{HIST=JSON.parse(localStorage.getItem("geomannequin.hist")||"[]")}catch(e){}
  $("runCode").addEventListener("click",runCode);
  $("clearOut").addEventListener("click",()=>{outEl.textContent=""});
  $("apiHelp").addEventListener("click",()=>{outEl.textContent="";outLine(REF)});
  {const ex=$("examples");Object.keys(EXAMPLES).forEach(k=>{const o=document.createElement("option");o.value=k;o.textContent=k;ex.appendChild(o)});
   ex.addEventListener("change",()=>{if(ex.value){codeEl.value=EXAMPLES[ex.value];gutter();ex.value=""}})}
  $("history").addEventListener("change",()=>{const v=$("history").value;if(v!==""){codeEl.value=HIST[Number(v)];gutter();$("history").value=""}});
  try{codeEl.value=localStorage.getItem("geomannequin.code")||EXAMPLES["Três manequins em fila"]}catch(e){codeEl.value=EXAMPLES["Três manequins em fila"]}
  codeEl.addEventListener("change",()=>{try{localStorage.setItem("geomannequin.code",codeEl.value)}catch(e){}});
  gutter();
  refreshHist();
}

export { codeEl, gut, outEl, gutter, outLine, HIST, refreshHist, runCode };
