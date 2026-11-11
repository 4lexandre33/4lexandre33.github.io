/* GeoMannequin · Contact V2
 * Narrowphase orientada ao MUNDO. Render, câmera e regras de "contato permitido"
 * não alteram o teste sólido. As aproximações de corpo continuam cápsulas;
 * dedos/palma em LOD fino usam as próprias juntas procedurais da mão.
 *
 * Convenções:
 * - distancia > 0: folga; < 0: interpenetração
 * - normal n: de B para A
 * - a/b: pontos testemunha na superfície dos dois colisores
 * - limites em R (uma unidade de desenho, NÃO um metro)
 */
import {applyA,comp,clamp} from "./matematica.js";
import {capsulas,paraMundo,segSeg} from "./colisao-cena.js";
import {shape} from "./cabeca.js";
import {chainSetup} from "./cadeia.js";
import {armDims,armPose} from "./bracos.js";
import {juntasDedos} from "./maos.js";
import {partesDoObjeto} from "./objetos.js";
const V=(a,b)=>a.map((x,i)=>x-b[i]);
const add=(a,b)=>a.map((x,i)=>x+b[i]);
const mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const len=a=>Math.hypot(...a);
const unit=(v,fallback=[1,0,0])=>{const l=len(v);return l>1e-9?mul(v,1/l):fallback;};
const FINITE=x=>Number.isFinite(x)&&x>=0;
function bounds(caps){
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(const c of caps)for(const p of [c.a,c.b])for(let k=0;k<3;k++){
  lo[k]=Math.min(lo[k],p[k]-c.r);hi[k]=Math.max(hi[k],p[k]+c.r);
 }
 return {caps,lo,hi};
}
function overlaps(A,B,pad=0){
 for(let i=0;i<3;i++)if(A.hi[i]+pad<B.lo[i]||B.hi[i]+pad<A.lo[i])return false;
 return true;
}
function capsuleBox(c){
 return {lo:c.a.map((x,i)=>Math.min(x,c.b[i])-c.r),
  hi:c.a.map((x,i)=>Math.max(x,c.b[i])+c.r)};
}
function colliderRig(p,{level="fine"}={}){
 const base=capsulas(p);
 if(level==="coarse")return {...base,caps:base.caps.map((x,i)=>({...x,id:x.nome+"#"+i,kind:"body"}))};
 const out=base.caps.filter(x=>!/^mao[ED]$/.test(x.nome))
   .map((x,i)=>({...x,id:x.nome+"#"+i,kind:"body"}));
 const S=shape(p),ch=chainSetup(p,S),toWorld=paraMundo(p),A=armDims(p);
 // Igual à escala geométrica usada em buildPalm/buildFingers e juntasDedos.
 const handK=.95*A.k*p.armLen;
 const fingerRadius={polegar:.09,indicador:.075,"médio":.078,anelar:.073,"mínimo":.064};
 const append=(nome,a,b,r,meta={})=>out.push({id:nome+"#"+out.length,nome,a:toWorld(a),b:toWorld(b),r,kind:meta.kind||"palm",side:meta.side,segment:meta.segment,finger:meta.finger,parent:meta.parent});
 for(const side of [1,-1]){
  const label=side>0?"E":"D",hand=comp(ch.A2,armPose(p,ch.F,side).hand);
  const palm=(v)=>applyA(hand,v);
  append("mao"+label,palm([0,-.10*A.LH,0]),palm([0,-.80*A.LH,.04*handK]),.27*handK,{side:label,kind:"palm"});
  const F=juntasDedos(p,side);
  for(const d of F){
   const names={polegar:"Polegar",indicador:"Indicador","médio":"Medio",anelar:"Anelar","mínimo":"Minimo"};
   const simple="dedo"+names[d.nome]+label;
   for(let j=0;j<d.pts.length-1;j++){
    const rr=fingerRadius[d.nome]*handK*(1-.10*j);
    append(simple,palm(d.pts[j]),palm(d.pts[j+1]),rr,{side:label,kind:"finger",finger:d.nome,segment:j,parent:"mao"+label});
   }
  }
 }
 return bounds(out);
}
const ADJACENT=[
 ["cabeca","pescoco"],["pescoco","torax"],["torax","abdomen"],["abdomen","pelve"],["torax","pelve"],
 ["bracoE","torax"],["bracoD","torax"],["pescoco","bracoE"],["pescoco","bracoD"],
 ["bracoE","antebracoE"],["bracoD","antebracoD"],["antebracoE","maoE"],["antebracoD","maoD"],
 ["coxaE","pelve"],["coxaD","pelve"],["abdomen","coxaE"],["abdomen","coxaD"],
 ["coxaE","pernaE"],["coxaD","pernaD"],["pernaE","peE"],["pernaD","peD"],
 ["coxaE","coxaD"]
];
const pairKey=(a,b)=>a<b?a+"|"+b:b+"|"+a;
const ignored=new Set(ADJACENT.map(([a,b])=>pairKey(a,b)));
function adjacentSelf(a,b){
 if(a.id===b.id||a.nome===b.nome)return true;
 if(ignored.has(pairKey(a.nome,b.nome)))return true;
 if(a.kind==="finger"||b.kind==="finger"){
  // Os contatos dedo-palmar da própria mão não são colisão:
  // as origens das falanges ficam embutidas nas articulações.
  const finger=a.kind==="finger"?a:b,other=a.kind==="finger"?b:a;
  if(other.nome===finger.parent)return true;
  if(other.nome==="antebraco"+finger.side)return true;
  if(other.kind==="finger"&&other.side===finger.side){
   if(other.finger===finger.finger)return true; // falanges conectadas
   // raízes de dedos vizinhos se sobrepõem naturalmente
   if(finger.segment===0&&other.segment===0)return true;
  }
 }
 return false;
}
function capsuleContact(A,B){
 const r=segSeg(A.a,A.b,B.a,B.b);
 const fallback=unit(V(mul(add(A.a,A.b),.5),mul(add(B.a,B.b),.5)));
 const n=unit(V(r.p,r.q),fallback),dist=r.d-(A.r+B.r);
 return {idA:A.id,idB:B.id,pa:A.nome,pb:B.nome,kindA:A.kind,kindB:B.kind,
   distancia:dist,prof:Math.max(0,-dist),n,
   a:V(r.p,mul(n,A.r)),b:add(r.q,mul(n,B.r)),
   ponto:mul(add(V(r.p,mul(n,A.r)),add(r.q,mul(n,B.r))),.5)};
}
function manifoldCaps(A,B,{tol=0,includeTouch=false,margin=.025,self=false,max=96}={}){
 const out=[];if(!overlaps(A,B,margin))return out;
 const bboxes=B.caps.map(capsuleBox);
 for(let i=0;i<A.caps.length;i++){
  const a=A.caps[i],ab=capsuleBox(a);
  for(let j=self?i+1:0;j<B.caps.length;j++){
   const b=B.caps[j];
   if(self&&adjacentSelf(a,b))continue;
   if(!overlaps(ab,bboxes[j],margin))continue;
   const hit=capsuleContact(a,b);
   if(hit.distancia> (includeTouch?margin:-tol))continue;
   out.push(hit);
  }
 }
 out.sort((a,b)=>a.distancia-b.distancia||a.idA.localeCompare(b.idA)||a.idB.localeCompare(b.idB));
 return out.slice(0,max);
}
/* Signed distance + normal of point to world-aligned oriented primitive.
 * Parts from partesDoObjeto carry axes e[axis][worldcoordinate].
 */
function pointSolid(p,b){
 const delta=V(p,b.c),loc=b.e.map(e=>dot(delta,e));
 let d,nLocal;
 if(b.cil){
  const radial=Math.hypot(loc[0],loc[2]),dx=radial-b.r,dy=Math.abs(loc[1])-b.hh;
  const outside=Math.hypot(Math.max(0,dx),Math.max(0,dy));
  d=outside+Math.min(Math.max(dx,dy),0);
  const nr=radial>1e-9?[loc[0]/radial,0,loc[2]/radial]:[1,0,0];
  const ny=[0,Math.sign(loc[1])||1,0];
  if(dx>0&&dy>0)nLocal=unit(add(mul(nr,dx),mul(ny,dy)));
  else if(dx>0)nLocal=nr;
  else if(dy>0)nLocal=ny;
  else nLocal=dx>dy?nr:ny;
 }else{
  const ds=loc.map((v,i)=>Math.abs(v)-b.h[i]);
  const outside=Math.hypot(...ds.map(x=>Math.max(0,x)));
  d=outside+Math.min(Math.max(...ds),0);
  if(outside>1e-10)nLocal=unit(ds.map((v,i)=>v>0?Math.sign(loc[i])*v:0));
  else {
   const k=ds.indexOf(Math.max(...ds));
   nLocal=[0,0,0];nLocal[k]=Math.sign(loc[k])||1;
  }
 }
 const normal=[0,0,0];
 for(let i=0;i<3;i++)for(let k=0;k<3;k++)normal[k]+=b.e[i][k]*nLocal[i];
 return {d,n:unit(normal)};
}
function capsuleSolidContact(cap,solid,partId){
 // Convex point-to-solid SDF along a segment: golden section minimum.
 // Refine nearest region with endpoints and midpoint; handles segment inside box.
 const dir=V(cap.b,cap.a),evalT=t=>pointSolid(add(cap.a,mul(dir,t)),solid);
 let lo=0,hi=1;
 for(let k=0;k<29;k++){
  const c=lo+(hi-lo)*.38196601125,d=lo+(hi-lo)*.61803398875;
  if(evalT(c).d<evalT(d).d)hi=d;else lo=c;
 }
 const candidates=[0,.5,1,(lo+hi)/2];let best=null;
 for(const t of candidates){const hit=evalT(t);if(!best||hit.d<best.d)best={...hit,t};}
 const center=add(cap.a,mul(dir,best.t)),n=best.n,dist=best.d-cap.r;
 const a=V(center,mul(n,cap.r)),b=V(center,mul(n,best.d));
 return {idA:cap.id,idB:partId,pa:cap.nome,pb:partId,
  distancia:dist,prof:Math.max(0,-dist),n,a,b,ponto:mul(add(a,b),.5),
  kindA:cap.kind,kindB:solid.cil?"cylinder":"box"};
}
function solidAABB(b){
 const e=b.e,h=b.h,ex=[0,1,2].map(k=>e.reduce((s,ax,i)=>s+Math.abs(ax[k])*h[i],0));
 return {lo:b.c.map((v,k)=>v-ex[k]),hi:b.c.map((v,k)=>v+ex[k])};
}
function colliderObject(o,ground=0){
 const parts=partesDoObjeto(o,ground);
 return parts.map((shape,i)=>({id:(o.id??o.nome??o.tipo)+":part"+i,shape,box:solidAABB(shape)}));
}
function manifoldObject(body,object,{tol=0,margin=.025,max=96}={}){
 const out=[],solids=Array.isArray(object)?object:colliderObject(object);
 for(const c of body.caps){
  const box=capsuleBox(c);
  for(const {id,shape,box:bb}of solids){
   if(!overlaps(box,bb,margin))continue;
   const hit=capsuleSolidContact(c,shape,id);
   if(hit.distancia<=-tol)out.push(hit);
  }
 }
 out.sort((a,b)=>a.distancia-b.distancia);
 return out.slice(0,max);
}
function manifoldRig(p,q,opts={}){
 return manifoldCaps(colliderRig(p,opts),colliderRig(q,opts),opts);
}
function manifoldSelf(p,opts={}){
 const c=colliderRig(p,opts);
 return manifoldCaps(c,c,{...opts,self:true});
}
export {bounds,overlaps,capsuleBox,colliderRig,adjacentSelf,capsuleContact,manifoldCaps,
  pointSolid,capsuleSolidContact,colliderObject,manifoldObject,manifoldRig,manifoldSelf};
