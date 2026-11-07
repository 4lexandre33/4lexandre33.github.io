/* GeoMannequin — salvar e carregar a cena (JSON) */
import { LAY, SL, SLK } from "./parametros.js";
import { STYLES, setStyleName } from "./paletas.js";
import { $ } from "./ambiente.js";
import { L, setMode } from "./modos.js";
import { CAMK, MAXM, P, SCN, hex2rgb, newInst, nextHue, setP } from "./modelo.js";
import { DEF, clamp, zoomToDist } from "../engine/index.js";

function applyState(s){
  if(s&&s.scene){loadScene(s.scene);if(s.style&&STYLES[s.style])setStyleName(s.style);
    if(s.layers&&typeof s.layers==="object"){LAY.forEach(l=>{const v=s.layers[l.k];if(typeof v==="boolean")L[l.k]=v;else if(typeof v==="number")L[l.k]=!!v});setMode(null)}
    if(typeof s.code==="string"&&$("code")){$("code").value=s.code}
    return}
  const pr=s&&s.params?s.params:s;
  if(!pr||typeof pr!=="object")throw new Error("JSON sem o campo params.");
  SL.forEach(d=>{if(typeof pr[d.k]==="number"&&isFinite(pr[d.k]))P[d.k]=clamp(pr[d.k],d.min,d.max)});
  if(typeof pr.shrug==="number"&&typeof pr.shElevL!=="number"){P.shElevL=P.shElevR=clamp(pr.shrug/0.3,-1,1)}
  if(s.style&&STYLES[s.style])setStyleName(s.style);
  if(s.layers&&typeof s.layers==="object"){
    LAY.forEach(l=>{const v=s.layers[l.k];if(typeof v==="boolean")L[l.k]=v;else if(typeof v==="number")L[l.k]=!!v});
    setMode(null);
  }
}
/* estado da cena (salvar / carregar / JSON) */
function sceneState(){
  const cam={};CAMK.forEach(k=>cam[k]=P[k]);
  return {active:SCN.active,camera:cam,list:SCN.list.map(it=>{const pr={};SL.forEach(d=>pr[d.k]=it.params[d.k]);return {name:it.name,params:pr,hue:it.hue,col:it.col}})};
}
function loadScene(sc){
  if(!sc||!Array.isArray(sc.list)||!sc.list.length)throw new Error("JSON da cena sem manequins.");
  SCN.list.length=0;
  sc.list.slice(0,MAXM).forEach(o=>{const it=newInst(null,o.name);SL.forEach(d=>{const v=o.params&&o.params[d.k];if(typeof v==="number"&&isFinite(v))it.params[d.k]=clamp(v,d.min,d.max)});
    it.hue=typeof o.hue==="number"?o.hue:null;it.col=o.col&&hex2rgb(o.col.fill)&&hex2rgb(o.col.ink)?o.col:null;SCN.list.push(it)});
  if(SCN.list.length>1&&SCN.list[0].hue===null&&false)SCN.list[0].hue=nextHue();
  SCN.active=clamp(sc.active|0,0,SCN.list.length-1);setP(SCN.list[SCN.active].params);
  if(sc.camera)CAMK.forEach(k=>{const d=SLK[k];if(typeof sc.camera[k]==="number"&&d)P[k]=clamp(sc.camera[k],d.min,d.max)});
  if(sc.camera&&typeof sc.camera.lens!=="number"){P.persp=1;P.lens=DEF.lens;P.atmo=DEF.atmo;P.camDist=clamp(zoomToDist(P,P.zoom||1),4,200)}
}

export { applyState, sceneState, loadScene };
