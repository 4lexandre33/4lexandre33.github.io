/* GeoMannequin — exportar SVG/JSON, abas e cópia */
import { P, SCN, UIH, sceneList } from "../scene/modelo.js";
import { L } from "../scene/modos.js";
import { styleName } from "../scene/paletas.js";
import { draw, lastInfo } from "./palco.js";
import { applyState, sceneState } from "../scene/estado.js";
import { $ } from "../scene/ambiente.js";
import { syncControls } from "./controles.js";
import { updateModeButtons } from "./modos.js";
import { FLEX_NOMES, H, W, renderScene, shape, watertightMeshV3, meshTopologyV3, exportObjV3 } from "../engine/index.js";

/* exportação */
function exportSvg(){
  const r=renderScene(sceneList(true),Object.assign({},L,{grid:false}),false,L.floor?16:0,{canal:"export",exato:SCN.exato});
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'">\n'+
    '<title>GeoMannequin</title>\n<rect width="'+W+'" height="'+H+'" fill="#FFFFFF"/>\n'+
    wrapStyle(r.svg).replace(/(<path|<circle)/g,"\n$1")+"\n</svg>\n";
}
function wrapStyle(svg){
  if(styleName!=="lapis")return svg;
  return '<defs><filter id="gmPencil" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.6"/></filter></defs><g filter="url(#gmPencil)">'+svg+'</g>';
}
function exportJson(){return JSON.stringify({app:"GeoMannequin",version:8,scene:sceneState(),layers:L,style:styleName,code:$("code")?$("code").value:"",roteiro:UIH.quadros?UIH.quadros.texto():""},null,2)}
let tab="svg";
/* a caixa de exportação só é atualizada quando está à vista (gerar o SVG de exportação também custa) */
let outVisivel=true,outSujo=false;
function refreshOut(){
  const ta=$("out");
  if(!outVisivel){outSujo=true;return}
  outSujo=false;
  if(tab==="svg"){ta.value=exportSvg();ta.readOnly=true}
  else if(document.activeElement!==ta){ta.value=exportJson()}
}
function setTab(t){
  tab=t;
  $("tabSvg").setAttribute("aria-pressed",String(t==="svg"));
  $("tabJson").setAttribute("aria-pressed",String(t==="json"));
  $("applyJson").hidden=t!=="json";
  const ta=$("out");ta.readOnly=t==="svg";
  ta.value=t==="svg"?exportSvg():exportJson();
  say("");
}
function say(text,cls){const m=$("msg");m.textContent=text;m.className="msg"+(cls?" "+cls:"")}
/* controles */
function fmt(d,v){
  if(d.k==="flex")return FLEX_NOMES[Math.round(v)]||"normal";
  if(d.pct)return Math.round(v*100)+d.u;
  const dec=d.step>=1?0:d.step>=0.01?2:3;
  return v.toFixed(dec)+d.u;
}

/* execução inicial deste módulo (na mesma ordem do app original) */
export function iniciarExportar(){
  try{if(typeof IntersectionObserver!=="undefined"){outVisivel=false;new IntersectionObserver(es=>{outVisivel=es.some(e=>e.isIntersecting);if(outVisivel&&outSujo)refreshOut()}).observe($("out"))}}catch(e){outVisivel=true}
  window.gmState=()=>({info:lastInfo,P});
  $("downloadHeadV3").addEventListener("click",()=>{
    if(P.headModel!=="v3_microgeometry"){say("Selecione a Cabeça V3 no painel de proporções para exportar OBJ.","err");return}
    try{
      const mesh=watertightMeshV3(P,shape(P)),check=meshTopologyV3(mesh);
      if(check.invalid||check.boundary||check.nonmanifold||check.degenerate)throw Error("Malha não-manifold: "+JSON.stringify(check));
      const blob=new Blob([exportObjV3(mesh)],{type:"text/plain;charset=utf-8"});
      const url=URL.createObjectURL(blob),a=document.createElement("a");
      a.href=url;a.download="geomannequin-cabeca-v3.obj";document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),2000);
      say("Cabeça V3 exportada: "+mesh.vertexCount+" vértices, "+mesh.triangleCount+" triângulos.","ok");
    }catch(e){say("Falha ao exportar OBJ: "+e.message,"err")}
  });
  $("tabSvg").addEventListener("click",()=>setTab("svg"));
  $("tabJson").addEventListener("click",()=>setTab("json"));
  $("copy").addEventListener("click",()=>{
    const ta=$("out"),txt=ta.value;
    const fallback=()=>{ta.focus();ta.select();say("Seleção feita. Use Ctrl+C para copiar.","")};
    try{navigator.clipboard.writeText(txt).then(()=>say(tab==="svg"?"SVG copiado.":"JSON copiado.","ok"),fallback)}
    catch(e){fallback()}
  });
  $("applyJson").addEventListener("click",()=>{
    try{const js=JSON.parse($("out").value);applyState(js);if(js.roteiro&&UIH.quadros)UIH.quadros.texto(js.roteiro);syncControls();updateModeButtons();draw();setTab("json");say("Modelo carregado.","ok")}
    catch(e){say("JSON inválido: "+e.message,"err")}
  });
}

export { exportSvg, wrapStyle, exportJson, tab, refreshOut, setTab, say, fmt };
