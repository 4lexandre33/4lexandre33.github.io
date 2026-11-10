/* GeoMannequin — salvar e carregar a cena (JSON) */
import { LAY, SL, SLK } from "./parametros.js";
import { NOMES_BIOTIPOS } from "./biotipos.js";
import { STYLES, setStyleName } from "./paletas.js";
import { $ } from "./ambiente.js";
import { L, setMode } from "./modos.js";
import { CAMK, MAXM, P, SCN, hex2rgb, newInst, nextHue, novoIdObjeto, setP, atualizarApoios } from "./modelo.js";
import { DEF, TIPOS_OBJETO, clamp, objetoPadrao, zoomToDist } from "../engine/index.js";
import { COL, setModoColisao, setPreferir } from "./colisoes.js";

function applyState(s){
  if(s&&s.scene){loadScene(s.scene);if(s.style&&STYLES[s.style])setStyleName(s.style);
    if(s.layers&&typeof s.layers==="object"){LAY.forEach(l=>{const v=s.layers[l.k];if(typeof v==="boolean")L[l.k]=v;else if(typeof v==="number")L[l.k]=!!v});setMode(null)}
    if(typeof s.code==="string"&&$("code")){$("code").value=s.code}
    return}
  const pr=s&&s.params?s.params:s;
  if(!pr||typeof pr!=="object")throw new Error("JSON sem o campo params.");
  SL.forEach(d=>{if(typeof pr[d.k]==="number"&&isFinite(pr[d.k]))P[d.k]=clamp(pr[d.k],d.min,d.max)});
  if(NOMES_BIOTIPOS.includes(pr._biotipo))P._biotipo=pr._biotipo;
  P.headModel=pr.headModel==="v2"?"v2":"v1";
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
  return {active:SCN.active,camera:cam,exato:!!SCN.exato,list:SCN.list.map(it=>{const pr={};SL.forEach(d=>pr[d.k]=it.params[d.k]);if(NOMES_BIOTIPOS.includes(it.params._biotipo))pr._biotipo=it.params._biotipo;pr.headModel=it.params.headModel==="v2"?"v2":"v1";const o={name:it.name,params:pr,hue:it.hue,col:it.col};if(it.congelado)o.congelado=true;if(it.oculto)o.oculto=true;if(it.ordem)o.ordem=it.ordem;if(it.apoioEm){const j=SCN.objetos.findIndex(x=>x.id===it.apoioEm);if(j>=0)o.apoioEm=j}if(it.contato&&it.contato.length){const ix=it.contato.map(id=>SCN.list.findIndex(x=>x.id===id)).filter(i=>i>=0);if(ix.length)o.contato=ix}return o}),colisao:{modo:COL.modo,preferir:COL.preferir,composicao:!!COL.composicao},objetos:SCN.objetos.map(o=>{const q=Object.assign({},o);delete q.id;delete q.base;if(o.sobre){const j=SCN.objetos.findIndex(x=>x.id===o.sobre);if(j>=0)q.sobre=j;else delete q.sobre}else delete q.sobre;return q})};
}
function loadScene(sc){
  if(!sc||!Array.isArray(sc.list)||!sc.list.length)throw new Error("JSON da cena sem manequins.");
  SCN.list.length=0;
  sc.list.slice(0,MAXM).forEach(o=>{const it=newInst(null,o.name);SL.forEach(d=>{const v=o.params&&o.params[d.k];if(typeof v==="number"&&isFinite(v))it.params[d.k]=clamp(v,d.min,d.max)});
    if(o.params&&NOMES_BIOTIPOS.includes(o.params._biotipo))it.params._biotipo=o.params._biotipo;it.params.headModel=o.params&&o.params.headModel==="v2"?"v2":"v1";
    it.hue=typeof o.hue==="number"?o.hue:null;it.col=o.col&&hex2rgb(o.col.fill)&&hex2rgb(o.col.ink)?o.col:null;
    it.congelado=!!o.congelado;it.oculto=!!o.oculto;it.ordem=typeof o.ordem==="number"&&isFinite(o.ordem)?clamp(Math.round(o.ordem),-99,99):0;SCN.list.push(it)});
  SCN.exato=!!sc.exato;
  /* objetos da cena */
  SCN.objetos.length=0;SCN.objSel=null;
  if(Array.isArray(sc.objetos))sc.objetos.slice(0,40).forEach(o=>{try{if(o&&TIPOS_OBJETO[o.tipo]){const q=objetoPadrao(o.tipo);["x","z","giro","larg","prof","alt","encosto","cabeceira","raio"].forEach(k=>{if(typeof o[k]==="number"&&isFinite(o[k]))q[k]=clamp(o[k],k==="giro"?-180:k==="raio"?0.1:-40,k==="giro"?180:k==="raio"?20:40)});
    if(q.raio!==undefined)q.larg=q.prof=2*q.raio;if(typeof o.nome==="string")q.nome=o.nome.slice(0,24);q.id=novoIdObjeto();
    q.hue=typeof o.hue==="number"&&isFinite(o.hue)?o.hue:null;if(o.col&&hex2rgb(o.col.fill)&&hex2rgb(o.col.ink))q.col={fill:o.col.fill,ink:o.col.ink};if(Number.isInteger(o.sobre))q._sobre=o.sobre;
    SCN.objetos.push(q)}else SCN.objetos.push(null)}catch(e){SCN.objetos.push(null)}});
  /* apoio de objeto em objeto (guardado pelo índice) e cores que faltarem */
  {const arr=SCN.objetos.slice();SCN.objetos.length=0;arr.forEach(q=>{if(q)SCN.objetos.push(q)});
   SCN.objetos.forEach(q=>{if(q._sobre!==undefined){const s=arr[q._sobre];q.sobre=s&&s!==q?s.id:null;delete q._sobre}if(q.hue===null&&!q.col)q.hue=nextHue(q)});atualizarApoios();}
  /* apoio (sentado em um objeto) guardado pelo índice do objeto */
  sc.list.slice(0,MAXM).forEach((o,i)=>{if(Number.isInteger(o.apoioEm)&&SCN.objetos[o.apoioEm])SCN.list[i].apoioEm=SCN.objetos[o.apoioEm].id});
  /* contatos permitidos (abraço, aperto de mão): guardados como índices na lista */
  sc.list.slice(0,MAXM).forEach((o,i)=>{if(Array.isArray(o.contato))SCN.list[i].contato=o.contato.filter(j=>Number.isInteger(j)&&SCN.list[j]&&j!==i).map(j=>SCN.list[j].id)});
  if(sc.colisao&&typeof sc.colisao==="object"){try{if(sc.colisao.modo)setModoColisao(sc.colisao.modo)}catch(e){}try{if(sc.colisao.preferir)setPreferir(sc.colisao.preferir)}catch(e){}COL.composicao=!!sc.colisao.composicao}
  if(SCN.list.length>1&&SCN.list[0].hue===null&&false)SCN.list[0].hue=nextHue();
  SCN.active=clamp(sc.active|0,0,SCN.list.length-1);setP(SCN.list[SCN.active].params);
  if(sc.camera)CAMK.forEach(k=>{const d=SLK[k];if(typeof sc.camera[k]==="number"&&d)P[k]=clamp(sc.camera[k],d.min,d.max)});
  if(sc.camera&&typeof sc.camera.lens!=="number"){P.persp=1;P.lens=DEF.lens;P.atmo=DEF.atmo;P.camDist=clamp(zoomToDist(P,P.zoom||1),4,200)}
}

export { applyState, sceneState, loadScene };
