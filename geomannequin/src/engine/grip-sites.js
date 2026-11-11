/* GeoMannequin — locais geométricos reais de pega.
 * Cada site pertence ao espaço local BASE do objeto (0,0,0 = base inferior).
 */
import {ehCilindro} from "./objetos.js";
import {rigidFrame,rigidCompose,objectRigidPose} from "./rigid-transform.js";
function gripSites(o){
 const L=o.larg/2,P=o.prof/2,A=o.alt;
 const arr=[],push=(id,nome,x,y,z,normal=[0,0,1],priority=0)=>{
  // eixo normal do site informa aproximação; base alinhada à matriz do objeto.
  arr.push({id,nome,local:[x,y,z],normal,prioridade:priority});
 };
 if(["cadeiraVazada","mesaComAlca","baseCircular","baseRetangular","espada","bastao","cajado"].includes(o.tipo)){
  const cadeira=o.tipo==="cadeiraVazada",mesa=o.tipo==="mesaComAlca";
  const y=cadeira?A+(o.encosto||4.2):mesa?A-.5:o.tipo==="espada"?.7:A/2;
  push("baseMao","Centro da base da mão",0,y,cadeira?-P+.18:mesa?P+.65:0,[1,0,0],100);
 }else if(o.tipo==="cadeira"){
  const E=o.encosto||4.2,B=-P+0.18;
  push("encostoTopo","Topo do encosto",0,A+E,B,[0,0,-1],100);
  push("encostoEsquerdo","Encosto à esquerda",-L+.23,A+E*.75,B,[0,0,-1],90);
  push("encostoDireito","Encosto à direita",L-.23,A+E*.75,B,[0,0,-1],90);
  push("assentoFrente","Borda dianteira do assento",0,A,P,[0,0,1],75);
  push("assentoEsquerdo","Lateral esquerda do assento",-L,A,0,[-1,0,0],70);
  push("assentoDireito","Lateral direita do assento",L,A,0,[1,0,0],70);
  push("assentoCentro","Centro do assento",0,A,0,[0,1,0],30);
 }else if(ehCilindro(o)){
  const r=o.raio;
  push("lateralDireita","Lateral direita",r,A*.5,0,[1,0,0],90);
  push("lateralEsquerda","Lateral esquerda",-r,A*.5,0,[-1,0,0],90);
  push("lateralFrente","Lateral frontal",0,A*.5,r,[0,0,1],95);
  push("topo","Topo",0,A,0,[0,1,0],20);
 }else{
  push("bordaSuperior","Borda superior",0,A,P,[0,0,1],80);
  push("lateralEsquerda","Lateral esquerda",-L,A*.5,0,[-1,0,0],75);
  push("lateralDireita","Lateral direita",L,A*.5,0,[1,0,0],75);
  push("frente","Face frontal",0,A*.5,P,[0,0,1],85);
  push("topo","Topo",0,A,0,[0,1,0],30);
 }
 if(Array.isArray(o.sitesExtras)){
  for(const s of o.sitesExtras)if(s&&typeof s.id==="string"&&
   Array.isArray(s.local)&&s.local.length===3&&s.local.every(Number.isFinite))
   arr.push({...s,normal:s.normal||[0,0,1]});
 }
 return arr;
}
function gripSite(o,id){
 const sites=gripSites(o),s=sites.find(v=>v.id===id);
 if(!s)throw Error("Ponto de agarre desconhecido: "+id+". Opções: "+sites.map(s=>s.id).join(", "));
 return s;
}
function gripSiteWorld(o,id,ground=0){
 const s=gripSite(o,id),pose=objectRigidPose(o,ground);
 const P=pose.M,t=s.local;
 return {...s,mundo:[pose.T[0]+P[0]*t[0]+P[1]*t[1]+P[2]*t[2],
   pose.T[1]+P[3]*t[0]+P[4]*t[1]+P[5]*t[2],
   pose.T[2]+P[6]*t[0]+P[7]*t[1]+P[8]*t[2]]};
}
function closestGripSite(o,hand,ground=0){
 const sites=gripSites(o).map(s=>gripSiteWorld(o,s.id,ground));
 sites.sort((a,b)=>Math.hypot(...a.mundo.map((v,i)=>v-hand[i]))-
                         Math.hypot(...b.mundo.map((v,i)=>v-hand[i]))||
                         b.prioridade-a.prioridade);
 return sites[0];
}
export {gripSites,gripSite,gripSiteWorld,closestGripSite};
