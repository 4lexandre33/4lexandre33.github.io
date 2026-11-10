/* Toque V2: alvo cinemático na superfície de outra pessoa ou objeto.
 * Não desativa o colisor do par. Para resultado reproduzível, usa o mesmo
 * algoritmo de distância da cena e o bloqueio da proposta de pose.
 */
import {capsulas,segSeg} from "../engine/colisao-cena.js";
import {colliderObject,pointSolid} from "../engine/contact-v2.js";
import {restGround} from "../engine/index.js";
import {pMundo} from "./colisoes.js";
import {SCN} from "./modelo.js";
import {maoEm} from "./cenario.js";
import {getHandAnchor} from "./preensao-v2.js";
import {CONTATO_V2,limitarPropostaV2} from "./contato-v2.js";
const tchUnit=v=>{const l=Math.hypot(...v);return l>1e-8?v.map(x=>x/l):[0,0,1]};
const tchSub=(a,b)=>a.map((x,i)=>x-b[i]);
const tchAdd=(a,b)=>a.map((x,i)=>x+b[i]);
const tchScale=(v,k)=>v.map(x=>x*k);
function targetSurface(it,target,side,parte){
 const ground=restGround(SCN.list[0].params);
 const wrist=getHandAnchor(it,side,ground);
 let candidates=[];
 if(target.params){
  const other=capsulas(pMundo(target));
  candidates=other.caps.filter(c=>!parte||c.nome===parte).map(c=>{
   const q=segSeg(wrist,wrist,c.a,c.b),n=tchUnit(tchSub(wrist,q.q));
   return {score:q.d-c.r,point:tchAdd(q.q,tchScale(n,c.r)),normal:n,region:c.nome};
  });
 }else{
  for(const p of colliderObject(target,ground)){
   const x=pointSolid(wrist,p.shape);
   candidates.push({score:x.d,point:tchSub(wrist,tchScale(x.n,x.d)),normal:x.n,region:p.id});
  }
 }
 if(!candidates.length)throw Error("Região anatômica/objeto não encontrado: "+(parte||""));
 candidates.sort((a,b)=>a.score-b.score);
 return candidates[0];
}
function tocarV2(it,ref,{mao="direita",parte,folga=.30}={}){
 if(!CONTATO_V2.enabled)throw Error("Ative cena.contatoV2({enabled:true}) antes de criar um toque.");
 if(!SCN.list.includes(it))throw Error("Manequim não pertence à cena.");
 const target=SCN.list.find(m=>m!==it&&m.name===ref)||SCN.objetos.find(o=>(o.nome||o.tipo)===ref);
 if(!target)throw Error("Alvo de toque não encontrado.");
 const side=/^esq|^left$/i.test(String(mao))?1:-1,prev={...it.params};
 const dest=targetSurface(it,target,side,parte);
 const tip=tchAdd(dest.point,tchScale(dest.normal,folga));
 const err=maoEm(it,side,tip);
 const correction=limitarPropostaV2(it,prev,{includeSelf:true});
 return {alvo:ref,parte:dest.region,mao:side>0?"esquerda":"direita",
  distanciaResidual:err,bloqueado:!!correction.blocked,
  fração:correction.fraction};
}
export {targetSurface,tocarV2};
