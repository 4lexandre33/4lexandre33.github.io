/* GeoMannequin — modelo da cena: manequins, câmera comum, cores exclusivas, adicionar/copiar/remover */
import { PAL_EXPORT, PAL_SCREEN, STYLES, styleName } from "./paletas.js";
import { L } from "./modos.js";
import { refreshScene, render, syncControls } from "./ambiente.js";
import { DEF, newCache, renderScene, restGround } from "../engine/index.js";
import { atualizarFocoOrbita } from "./orbita.js";
import {updateGrip} from "./preensao-v2.js";

let P;
/* ===== Cena: vários manequins, câmera comum, cores exclusivas ===== */
let UID=0,OBJID=1000;
function novoIdObjeto(){return ++OBJID}
/* exato: todos num z-buffer comum (mais lento); sem ele, cada manequim vira uma camada (foto .svg) guardada em cache */
const SCN={list:[],active:0,exato:false,objetos:[],objSel:null};
/* ganchos da interface (o código chama a página sem depender dela; no MCP ficam vazios) */
const UIH={};
const CAMK=["yaw","pitch","roll","zoom","panX","panY","lightAz","lightEl","tx","ty","tz","persp","camDist","lens","atmo"];
const WORLDK=["wx","wy","wz","wRot"];
function newInst(params,name){UID++;return {id:UID,name:name||("Manequim "+UID),params:Object.assign({},DEF,params||{}),cache:newCache(),hue:null,col:null,congelado:false,oculto:false,ordem:0}}
function isDark(){const t=document.documentElement.dataset.theme;return t==="dark"||(t!=="light"&&window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches)}
function hsl2hex(h,s,l){s/=100;l/=100;const k=n=>(n+h/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
  return "#"+[f(0),f(8),f(4)].map(x=>Math.round(x*255).toString(16).padStart(2,"0")).join("")}
function hex2rgb(h){const m=/^#?([0-9a-f]{6})$/i.exec(h||"");if(!m)return null;const n=parseInt(m[1],16);return [n>>16&255,n>>8&255,n&255]}
function mixHex(a,b,t){const A=hex2rgb(a),B=hex2rgb(b);if(!A||!B)return a;return "#"+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,"0")).join("")}
function colDist(a,b){const A=hex2rgb(a),B=hex2rgb(b);if(!A||!B)return 999;return Math.hypot(A[0]-B[0],A[1]-B[1],A[2]-B[2])}
function hueColors(h,dark){
  return dark?{fill:hsl2hex(h,24,25),shade1:hsl2hex(h,24,20),shade2:hsl2hex(h,26,15),shade3:hsl2hex(h,28,11),ink:hsl2hex(h,60,82)}
             :{fill:hsl2hex(h,40,91),shade1:hsl2hex(h,32,83),shade2:hsl2hex(h,28,73),shade3:hsl2hex(h,26,58),ink:hsl2hex(h,48,27)};
}
/* matiz livre: longe (> 24°) de TODOS os manequins e objetos da cena — cada item tem a sua cor */
function matizesUsados(skip){return SCN.list.filter(it=>it!==skip&&it.hue!==null).map(it=>it.hue).concat(SCN.objetos.filter(o=>o!==skip&&typeof o.hue==="number"&&!o.col).map(o=>o.hue))}
function nextHue(skip){
  const used=matizesUsados(skip);
  for(const gap of [24,16,10])for(let i=0;i<720;i++){const h=(205+i*137.508)%360;if(used.every(u=>Math.min(Math.abs(u-h),360-Math.abs(u-h))>gap))return Math.round(h)}
  return Math.round(Math.random()*360);
}
/* cores de objeto: mais saturadas que as dos manequins (lê-se como coisa, não como gente), no tema claro ou escuro */
function hueColorsObj(h,dark){
  return dark?{fill:hsl2hex(h,34,30),ink:hsl2hex(h,62,80)}:{fill:hsl2hex(h,52,82),ink:hsl2hex(h,52,26)};
}
function corObjeto(o,exp){
  const dark=exp?false:(typeof document!=="undefined"&&isDark());
  if(o.col)return {fill:o.col.fill,ink:o.col.ink};
  if(typeof o.hue!=="number")o.hue=nextHue(o);
  return hueColorsObj(o.hue,dark);
}
/* cor manual de um objeto: não pode repetir a de outro objeto nem a de um manequim */
function setCorObjeto(o,fill,ink){
  if(!hex2rgb(fill))throw new Error("Use cores no formato #RRGGBB, por exemplo '#7FB3D5'.");
  if(!ink||!hex2rgb(ink)){const A=hex2rgb(fill),l=(0.3*A[0]+0.59*A[1]+0.11*A[2])/255;ink=mixHex(fill,l>0.5?"#000000":"#ffffff",0.72)}
  if(colDist(fill,ink)<60)throw new Error("Preenchimento e contorno estão parecidos demais; o contorno não ficaria visível.");
  conflitoCor(fill,o);
  o.col={fill:fill.toLowerCase(),ink:ink.toLowerCase()};
}
/* quem já usa uma cor parecida (manequim ou objeto) */
function conflitoCor(fill,skip){
  for(const it of SCN.list){if(it===skip)continue;if(colDist(instColors(it).fill,fill)<18)throw new Error("Essa cor já é usada por “"+it.name+"”. Escolha outra.")}
  for(const q of SCN.objetos){if(q===skip)continue;if(colDist(corObjeto(q).fill,fill)<18)throw new Error("Essa cor já é usada pelo objeto “"+(q.nome||q.tipo)+"”. Escolha outra.")}
}
/* cores efetivas do manequim (preenchimento e contorno em hexadecimal, para comparar e mostrar) */
function instColors(it,exp){
  const dark=exp?false:isDark();
  if(it.col)return {fill:it.col.fill,ink:it.col.ink,shade1:mixHex(it.col.fill,it.col.ink,0.1),shade2:mixHex(it.col.fill,it.col.ink,0.22),shade3:mixHex(it.col.fill,it.col.ink,0.38)};
  if(it.hue!==null)return hueColors(it.hue,dark);
  const st=STYLES[styleName]||STYLES.creme;
  if(styleName==="creme"&&dark)return {fill:"#3A4556",ink:"#DCE2EC",shade1:"#2E3846",shade2:"#222B38",shade3:"#161D27"};
  return {fill:st.fill,ink:st.ink,shade1:st.shade1,shade2:st.shade2,shade3:st.shade3};
}
function palOf(it,exp){
  const base=exp?PAL_EXPORT:PAL_SCREEN;
  if(!it.col&&it.hue===null)return base;
  return Object.assign({},base,instColors(it,exp));
}
function cssHex(v){
  const m=/^var\((--[\w-]+)\)$/.exec(v||"");if(!m)return v;
  try{const c=getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();return /^#[0-9a-f]{6}$/i.test(c)?c:(/^#[0-9a-f]{3}$/i.test(c)?"#"+c.slice(1).split("").map(x=>x+x).join(""):v)}catch(e){return v}
}
/* objeto em cima de outro (o.sobre = id do de baixo): a base dele é o topo do de baixo, em cadeia */
function atualizarApoios(){
  const por=new Map(SCN.objetos.map(o=>[o.id,o]));
  const topo=(o,vis)=>{if(!o.sobre||!por.has(o.sobre)||vis.has(o.id)){o.sobre=o.sobre&&por.has(o.sobre)?o.sobre:null;return 0}vis.add(o.id);const s=por.get(o.sobre);return topo(s,vis)+s.alt};
  const ground=SCN.list.length?restGround(SCN.list[0].params):0;
  SCN.objetos.forEach(o=>{
    if(o.grip){
      const it=SCN.list.find(m=>m.id===o.grip.mannequinId);
      if(it&&updateGrip(it,o,ground))return;
      delete o.grip; // o manequim foi removido; liberação segura
    }
    o.base=Math.round(topo(o,new Set())*1000)/1000;
  });
}
function sceneList(exp){
  atualizarApoios();
  atualizarFocoOrbita();
  const g0=restGround(SCN.list[0].params),cam={};CAMK.forEach(k=>cam[k]=P[k]);
  const bg=exp?"#ffffff":cssHex("var(--paper)");
  const lst=SCN.list.map(it=>{const pal=palOf(it,exp),pr={};for(const k in pal)pr[k]=exp?pal[k]:cssHex(pal[k]);
    return {p:Object.assign({},it.params,cam,{_cache:it.cache,_id:it.id,_nome:it.name,_congelado:!!it.congelado,_oculto:!!it.oculto,_ordem:it.ordem||0,wy:g0-restGround(it.params),bg}),pal:pr,gy:g0}});
  /* objetos da cena (banco, cadeira, parede…), o chão e as cores neutras deles */
  lst.objetos=SCN.objetos.map(o=>Object.assign({},o,{_cor:corObjeto(o,exp)}));lst.chao=g0;
  const base=exp?PAL_EXPORT:PAL_SCREEN,po={};for(const k in base)po[k]=exp?base[k]:cssHex(base[k]);lst.palObjetos=po;
  return lst;
}
function sceneBB(only){
  const lst=sceneList();lst.forEach(o=>Object.assign(o.p,{zoom:1,panX:0,panY:0,atmo:0}));
  const r=renderScene(lst,L,true,0,{canal:"enquadrar",exato:SCN.exato}),bb=[1e9,-1e9,1e9,-1e9];
  r.infos.forEach((i,k)=>{if(!i||!i.bb||(only!==undefined&&k!==only))return;bb[0]=Math.min(bb[0],i.bb[0]);bb[1]=Math.max(bb[1],i.bb[1]);bb[2]=Math.min(bb[2],i.bb[2]);bb[3]=Math.max(bb[3],i.bb[3])});
  return bb;
}
function setActive(i){
  if(i<0||i>=SCN.list.length)return;
  const cam={};CAMK.forEach(k=>cam[k]=P[k]);
  SCN.active=i;P=SCN.list[i].params;Object.assign(P,cam);
  refreshScene();syncControls();render();
}
const MAXM=12;
function addInst(params,name,silent){
  if(SCN.list.length>=MAXM)throw new Error("Limite de "+MAXM+" manequins na cena.");
  let mx=-1e9;SCN.list.forEach(it=>mx=Math.max(mx,it.params.wx));
  const cam={};CAMK.forEach(k=>cam[k]=P[k]);
  const it=newInst(Object.assign({},params||{},cam),name);
  /* 7,5 R (≈ 85 cm) entre centros: com os braços soltos, as mãos de um não entram no vizinho */
  if(!params||params.wx===undefined)it.params.wx=Math.round((mx+7.5)*10)/10;
  it.hue=nextHue(it);SCN.list.push(it);
  if(!silent)setActive(SCN.list.length-1);
  return it;
}
function dupInst(src,silent){
  const it=addInst(Object.assign({},src.params,{wx:src.params.wx+7.5,wz:src.params.wz}),src.name+" (cópia)",true);
  if(!silent)setActive(SCN.list.indexOf(it));
  return it;
}
function delInst(it){
  if(SCN.list.length<2)throw new Error("A cena precisa de pelo menos um manequim.");
  const i=SCN.list.indexOf(it);if(i<0)return;
  SCN.list.splice(i,1);
  const cam={};CAMK.forEach(k=>cam[k]=P[k]);
  SCN.active=Math.min(SCN.active>i?SCN.active-1:SCN.active,SCN.list.length-1);P=SCN.list[SCN.active].params;Object.assign(P,cam);
}
/* cor manual: preenchimento e contorno não podem repetir os de outro manequim */
function setColor(it,fill,ink){
  if(!hex2rgb(fill)||!hex2rgb(ink))throw new Error("Use cores no formato #RRGGBB, por exemplo '#E8D5C4'.");
  if(colDist(fill,ink)<60)throw new Error("Preenchimento e contorno estão parecidos demais; o contorno não ficaria visível.");
  for(const o of SCN.list){if(o===it)continue;const c=instColors(o);
    if(colDist(c.fill,fill)<18)throw new Error("Essa cor de preenchimento já é usada por “"+o.name+"”. Escolha outra.");
    if(colDist(c.ink,ink)<18)throw new Error("Essa cor de contorno já é usada por “"+o.name+"”. Escolha outra.");}
  for(const q of SCN.objetos){if(colDist(corObjeto(q).fill,fill)<18)throw new Error("Essa cor já é usada pelo objeto “"+(q.nome||q.tipo)+"”. Escolha outra.")}
  it.col={fill:fill.toLowerCase(),ink:ink.toLowerCase()};it.hue=it.hue;
}

/* execução inicial deste módulo (na mesma ordem do app original) */
export function iniciarModelo(){
  P=Object.assign({},DEF);
  SCN.list.push(newInst(P,"Manequim 1"));
  P=SCN.list[0].params;
}

/* alteração de variáveis deste módulo por outros módulos */
export function setP(v){return P=v}

export { UIH, novoIdObjeto, P, UID, SCN, CAMK, WORLDK, newInst, isDark, hsl2hex, hex2rgb, mixHex, colDist, hueColors, nextHue, instColors, hueColorsObj, corObjeto, atualizarApoios, setCorObjeto, conflitoCor, palOf, cssHex, sceneList, sceneBB, setActive, MAXM, addInst, dupInst, delInst, setColor };
