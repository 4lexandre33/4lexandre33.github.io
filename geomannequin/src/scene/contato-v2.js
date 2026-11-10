/* GeoMannequin Contact V2: interação com o motor da cena e bloqueio transacional.
 * DESLIGADO por padrão, preserva scripts/poses antigos. O usuário pode habilitar
 * explicitamente precisão 3D. Não confundir "contato permitido" com atravessamento.
 */
import {SCN} from "./modelo.js";
import {pMundo,COL} from "./colisoes.js";
import {colliderRig,colliderObject,manifoldCaps,manifoldObject,manifoldSelf} from "../engine/contact-v2.js";
import {restGround} from "../engine/index.js";
const CONTATO_V2={enabled:false,level:"fine",tol:.07,last:null,blocked:0};
const MOTION=/^(?:wx|wy|wz|wRot|arm|elbow|pron|wrist|handCurl|f(?:Th|In|Me|An|Mi)|thumbOpp|hip|knee|ankle|foot|toes|hallux|head|neck|spine|lum|tho|pelvis|body|shElev|shProt|scap)/;
function setContatoV2(opts={}){
 if(typeof opts==="boolean")opts={enabled:opts};
 if(opts.enabled!==undefined)CONTATO_V2.enabled=!!opts.enabled;
 if(opts.level!==undefined){
  if(!["fine","coarse"].includes(opts.level))throw Error("Nível: use fine ou coarse.");
  CONTATO_V2.level=opts.level;
 }
 if(opts.tol!==undefined){
  if(!Number.isFinite(opts.tol)||opts.tol<0||opts.tol>.5)throw Error("Tolerância de 0 a 0.5 R.");
  CONTATO_V2.tol=opts.tol;
 }
 return {enabled:CONTATO_V2.enabled,level:CONTATO_V2.level,tol:CONTATO_V2.tol};
}
function worldGround(){
 if(!SCN.list.length)return 0;
 return restGround(SCN.list[0].params);
}
function rig(it,params,level){return colliderRig(pMundo(it,params),{level});}
/* O snapshot de corpos terceiros é computado uma só vez por edição de pose.
 * Campos opcionais: incluirAuto, incluirManequins, incluirObjetos.
 */
function context(it,{level=CONTATO_V2.level,incluirManequins=true,incluirObjetos=true}={}){
 const outros=incluirManequins?SCN.list.filter(x=>x!==it&&!x.oculto)
  .map(o=>({it:o,body:rig(o,o.params,level)})):[];
 const objetos=incluirObjetos?SCN.objetos.map(o=>({obj:o,parts:colliderObject(o,worldGround())})):[];
 return {outros,objetos,level};
}
function contacts(it,params,ctx,{incluirAuto=true,margin=.025,max=32}={}){
 if(!it||!params)return [];
 const body=rig(it,params,ctx.level),out=[];
 const opts={tol:0,margin,max};
 if(incluirAuto)for(const c of manifoldCaps(body,body,{...opts,self:true})){
  out.push({...c,tipo:"auto",a:it.id,b:it.id,alvo:"próprio corpo"});
 }
 for(const other of ctx.outros)for(const c of manifoldCaps(body,other.body,opts)){
  out.push({...c,tipo:"manequim",a:it.id,b:other.it.id,alvo:other.it.name});
 }
 for(const o of ctx.objetos)for(const c of manifoldObject(body,o.parts,opts)){
  out.push({...c,tipo:"objeto",a:it.id,b:o.obj.id,alvo:o.obj.nome||o.obj.tipo});
 }
 out.sort((a,b)=>a.distancia-b.distancia);
 return out.slice(0,max);
}
function consultarContatosV2(opts={}){
 const out=[],level=opts.level||CONTATO_V2.level;
 for(const it of SCN.list){
  if(it.oculto)continue;
  const ctx=context(it,{level,incluirObjetos:opts.objetos!==false,incluirManequins:opts.manequins!==false});
  out.push(...contacts(it,it.params,ctx,{incluirAuto:opts.auto!==false,max:opts.max??40}));
 }
 const dedup=new Map();
 for(const c of out){
  const owners=[c.a,c.b].sort().join("/");
  const parts=c.tipo==="manequim"&&c.a>c.b?[c.idB,c.idA]:[c.idA,c.idB];
  const key=owners+"/"+parts.join("/");
  if(!dedup.has(key)||c.prof>dedup.get(key).prof)dedup.set(key,c);
 }
 const cs=[...dedup.values()].sort((a,b)=>b.prof-a.prof);
 CONTATO_V2.last=cs;
 return cs.slice(0,opts.max??100);
}
function key(c){return c.tipo+"|"+c.b+"|"+c.idA+"|"+c.idB;}
function baselineMap(cs){
 const map=new Map();for(const c of cs)map.set(key(c),Math.max(map.get(key(c))||0,c.prof));return map;
}
/* Não criar novas penetrações nem aprofundar as já preexistentes no modelo legado.
 * Essas exceções são do baseline geométrico, nunca "permitirContato()" por pessoa.
 */
function intrusion(cs,base,tol){
 let worst=0,sum=0;
 for(const c of cs){
  const allowed=Math.max(tol,base.get(key(c))||0);
  const extra=c.prof-allowed;
  if(extra>0){worst=Math.max(worst,extra);sum+=extra;}
 }
 return {worst,sum,ok:worst<=1e-4};
}
function interpolate(start,end,t){
 const q={...end};
 for(const k of Object.keys(end)){
  if(!MOTION.test(k))continue;
  const a=start[k],b=end[k];
  if(Number.isFinite(a)&&Number.isFinite(b))q[k]=a+(b-a)*t;
 }
 return q;
}
function maxMovement(a,b){
 let m=0;for(const k in b)if(MOTION.test(k)&&Number.isFinite(a[k])&&Number.isFinite(b[k])){
  const delta=Math.abs(b[k]-a[k]);m=Math.max(m,/^(wx|wy|wz)/.test(k)?delta*28:delta);
 }
 return m;
}
/* CCD incremental aproximado: amostra o caminho articulado e bisecta o primeiro
 * bloqueio. NÃO é CCD analítica para todas as geometrias deformáveis.
 */
function limitarPropostaV2(it,before,{samples,includeSelf=true}={}){
 if(!CONTATO_V2.enabled||!it||!before)return {ok:true,enabled:false,fraction:1};
 const desired={...it.params},ctx=context(it),tol=CONTATO_V2.tol;
 const base=baselineMap(contacts(it,before,ctx,{incluirAuto:includeSelf,max:500}));
 const evaluate=t=>{
  const q=interpolate(before,desired,t);
  return intrusion(contacts(it,q,ctx,{incluirAuto:includeSelf,max:500}),base,tol);
 };
 const total=maxMovement(before,desired);
 if(total<=1e-8)return {ok:true,enabled:true,fraction:1};
 let stepCount=samples??Math.min(24,Math.max(5,Math.ceil(total/12)));
 let safe=0,unsafe=null,last={ok:true,worst:0};
 for(let i=1;i<=stepCount;i++){
  const t=i/stepCount,r=evaluate(t);
  if(!r.ok){unsafe=t;last=r;break}
  safe=t;
 }
 if(unsafe===null)return {ok:true,enabled:true,fraction:1};
 // Encontrou o primeiro contato proibido: bisseta a fronteira segura.
 for(let i=0;i<9;i++){
  const mid=(safe+unsafe)/2,r=evaluate(mid);
  if(r.ok)safe=mid;else {unsafe=mid;last=r}
 }
 Object.assign(it.params,interpolate(before,desired,safe));
 CONTATO_V2.blocked++;
 return {ok:false,enabled:true,blocked:true,fraction:safe,
  penetration:Math.max(0,last.worst),reason:"Movimento limitado por contato sólido 3D"};
}
function contatoParteV2(it,alvo,opts={}){
 // Consulta local; intenção de tocar não desliga contato sólido.
 if(!SCN.list.includes(it))throw Error("Manequim inválido.");
 const other=SCN.list.find(x=>x.name===alvo)||SCN.objetos.find(x=>(x.nome||x.tipo)===alvo);
 if(!other)throw Error("Alvo não encontrado: "+alvo);
 const cs=consultarContatosV2({auto:false});
 const rel=cs.filter(x=>(x.a===it.id&&x.b===other.id)||(x.b===it.id&&x.a===other.id));
 return rel.filter(x=>!opts.parte||x.pa===opts.parte||x.pb===opts.parte);
}
export {CONTATO_V2,setContatoV2,consultarContatosV2,limitarPropostaV2,contatoParteV2,
   context,contacts,baselineMap,intrusion,interpolate};
