/* GeoMannequin · dinâmica cinemática aproximada de objetos soltos.
 * Integração por subpassos, reproduzível no editor/roteiros, sem motor de
 * corpos rígidos: colisões com piso e sólidos OBB, não com malhas exatas.
 * Unidade de distância = R (~11,4 cm); tempo em segundos.
 */
import {rotM} from "./matematica.js";
import {partesDoObjeto,colisaoEntreObjetos} from "./objetos.js";
import {rigidCompose,objectRigidPose,setRigidObjectPose} from "./rigid-transform.js";
const DEG=Math.PI/180,EPS=1e-5;
const vec3=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function menorAlturaObjeto(o,ground){
 const parts=partesDoObjeto(o,ground);
 if(!parts.length)throw Error("Objeto sem partes para colisão.");
 const min=Math.min(...parts.map(b=>{
  const h=b.cil?[b.r,b.hh,b.r]:b.h;
  return b.c[1]-h.reduce((sum,v,i)=>sum+Math.abs(b.e[i][1])*v,0);
 }));
 if(!Number.isFinite(min))throw Error("Geometria inválida do objeto.");
 return min;
}
function iniciarQuedaObjeto(o,ground,{
 gravidade=86,restituicao=.18,atrito=.45,
 velocidade=[0,0,0],angular=[0,0,0],ignorarDono=null
}={}){
 if(!o||o.grip||o.gripV3)throw Error("Solte o objeto antes de ativar sua dinâmica.");
 if(!Number.isFinite(ground)||!Number.isFinite(gravidade)||gravidade<=0||gravidade>1000||
  !Number.isFinite(restituicao)||restituicao<0||restituicao>1||
  !Number.isFinite(atrito)||atrito<0||atrito>1||
  !vec3(velocidade)||!vec3(angular)||velocidade.some(v=>Math.abs(v)>250)||angular.some(v=>Math.abs(v)>720)||
  (ignorarDono!==null&&(typeof ignorarDono!=="string"||ignorarDono.length>100)))
  throw Error("Parâmetros físicos inválidos. Use vetores [x,y,z] finitos, gravidade positiva e restituição/atrito entre 0 e 1.");
 delete o.sobre;delete o.sobreRel;
 o.emAr=true;
 o.dinamica={
  versao:1,ativo:true,tempo:0,gravidade,restituicao,atrito,
  velocidade:velocidade.slice(),angular:angular.slice(),
  contato:null,impactos:0,ignorarDono
 };
 return {...o.dinamica};
}
function cancelarQuedaObjeto(o){if(!o?.dinamica)return false;delete o.dinamica;return true;}
function obstaculoDaQueda(o,objetos,ground,colisaoHumano){
 for(const p of objetos||[]){
  if(p===o||p.id===o.id||p.sobre===o.id||o.sobre===p.id)continue;
  // Objetos carregados ou estáticos mantêm a sua pose atual.
  if(colisaoEntreObjetos(o,p,ground,0.001).length)return p;
 }
 return typeof colisaoHumano==="function"?colisaoHumano(o)||null:null;
}
function simularPassoObjeto(o,objetos,ground,h,colisaoHumano){
 const d=o.dinamica;
 if(!d?.ativo)return {ativo:false,contato:d?.contato||null};
 const before=objectRigidPose(o,ground);
 d.velocidade[1]-=d.gravidade*h;
 const after={
  M:rigidCompose({M:before.M,T:[0,0,0]},
    {M:rotM(...d.angular.map(a=>a*h*DEG)),T:[0,0,0]}).M,
  T:before.T.map((v,i)=>v+d.velocidade[i]*h)
 };
 setRigidObjectPose(o,after,ground);
 // Separação exata contra o plano horizontal para as caixas/OBBs do objeto.
 const low=menorAlturaObjeto(o,ground);
 if(low<ground){
  const pose=objectRigidPose(o,ground);
  pose.T[1]+=ground-low;
  setRigidObjectPose(o,pose,ground);
 }
 // Colisão aproximada e varredura numérica contra outros sólidos.
 const hit=obstaculoDaQueda(o,objetos,ground,colisaoHumano);
 if(hit){
  let lo=0,hi=1;
  // Se já começara em interpenetração, retorna a pose anterior
  // sem tentar resolver por teletransporte.
  for(let n=0;n<14;n++){
   const mid=(lo+hi)*.5;
   const t=before.T.map((v,i)=>v+(after.T[i]-v)*mid);
   setRigidObjectPose(o,{M:before.M,T:t},ground);
   if(obstaculoDaQueda(o,objetos,ground,colisaoHumano))hi=mid;else lo=mid;
  }
  setRigidObjectPose(o,{M:before.M,T:before.T.map((v,i)=>v+(after.T[i]-v)*lo)},ground);
  d.velocidade=[0,0,0];d.angular=[0,0,0];
  d.contato={tipo:hit.tipo==="manequim"?"manequim":"objeto",nome:hit.nome||hit.tipo||"obstáculo"};
  d.ativo=false;
  return {ativo:false,contato:d.contato};
 }
 const onGround=menorAlturaObjeto(o,ground)<=ground+EPS;
 if(onGround&&d.velocidade[1]<0){
  d.impactos++;
  const incoming=-d.velocidade[1];
  d.velocidade[1]=incoming>1.5?incoming*d.restituicao:0;
  d.velocidade[0]*=(1-d.atrito);d.velocidade[2]*=(1-d.atrito);
  d.angular=d.angular.map(v=>v*(1-d.atrito));
  d.contato={tipo:"chao",nome:"chão"};
  if(d.velocidade[1]<1.2&&Math.hypot(d.velocidade[0],d.velocidade[2])<.25){
   d.ativo=false;d.velocidade=[0,0,0];d.angular=[0,0,0];
  }
 }
 return {ativo:d.ativo,contato:d.contato};
}
function avancarDinamicaObjetos(objetos,ground,segundos=1/60,{colisaoHumano=null}={}){
 if(!Array.isArray(objetos)||!Number.isFinite(ground)||
   !Number.isFinite(segundos)||segundos<0||segundos>3||
   (colisaoHumano!==null&&typeof colisaoHumano!=="function"))
  throw Error("avancarFisica: tempo entre 0 e 3 segundos.");
 const active=objetos.filter(o=>o.dinamica?.ativo&&!o.grip&&!o.gripV3);
 if(!segundos||!active.length)return {ativos:active.length,passos:0,contatos:[]};
 // Varredura incremental adaptativa: <=0,20 R por subpasso de translação,
 // <=5 graus por subpasso angular, até um limite operacional explícito.
 // Isto NÃO é CCD analítica, mas evita atravessar obstáculos em quedas rápidas.
 const speed=Math.max(0,...active.map(o=>Math.hypot(...o.dinamica.velocidade)+o.dinamica.gravidade*segundos));
 const spin=Math.max(0,...active.map(o=>Math.hypot(...o.dinamica.angular)));
 const steps=clamp(Math.ceil(Math.max(segundos*180,speed*segundos/.2,spin*segundos/5)),1,4096);
 const dt=segundos/steps;
 const contatos=[];
 for(let n=0;n<steps;n++)for(const o of active){
  if(!o.dinamica?.ativo)continue;
  const d=o.dinamica;
  const prev=d.contato;
  const result=simularPassoObjeto(o,objetos,ground,dt,colisaoHumano);
  d.tempo+=dt;
  if(result.contato&&result.contato!==prev&&
    (!prev||result.contato.tipo!==prev.tipo||result.contato.nome!==prev.nome))
    contatos.push({objeto:o.nome||o.tipo,...result.contato,tempo:d.tempo});
 }
 return {ativos:active.filter(o=>o.dinamica?.ativo).length,passos:steps,contatos};
}
export {menorAlturaObjeto,iniciarQuedaObjeto,cancelarQuedaObjeto,avancarDinamicaObjetos};
