/* GeoMannequin — Grip V3 (attachment 6DOF geométrico, não simulação de forças).
 * Wobj = Wmao × grip.relative. O ponto pode estar no encosto da cadeira.
 * Suporta segunda mão como vínculo de observação, sem solver bilateral global.
 */
import {shape,chainSetup,armPose,armDims,comp,applyA,paraMundo,doMundo,ikArm,restGround,partesDoObjeto} from "../engine/index.js";
import {rigidFrame,rigidCompose,rigidInverse,rigidPoint,objectRigidPose,setRigidObjectPose} from "../engine/rigid-transform.js";
import {gripSites,gripSite,gripSiteWorld,closestGripSite} from "../engine/grip-sites.js";
import {fecharDedos} from "./preensao-v2.js";
function handFrameV3(it,side,ground){
 if(!it||!(side===1||side===-1))throw Error("Selecione uma mão esquerda ou direita.");
 const p=it.params,S=shape(p),ch=chainSetup(p,S),A=armDims(p),
      hand=comp(ch.A2,armPose(p,ch.F,side).hand),W=paraMundo({...p,wy:ground-restGround(p)}),
      local=[0,-.50*A.LH,0],basis=[local,[local[0]+1,local[1],local[2]],
         [local[0],local[1]+1,local[2]],[local[0],local[1],local[2]+1]]
       .map(x=>W(applyA(hand,x))),p0=basis[0],
      X=basis[1].map((x,i)=>x-p0[i]),Y=basis[2].map((x,i)=>x-p0[i]),Z=basis[3].map((x,i)=>x-p0[i]);
 return rigidFrame([X[0],Y[0],Z[0],X[1],Y[1],Z[1],X[2],Y[2],Z[2]],p0);
}
function gripSiteSelection(o,frame,ground,site){
 if(site!==undefined&&site!==null&&site!=="auto")return gripSiteWorld(o,site,ground);
 return closestGripSite(o,frame.T,ground);
}
/* Pousar 6DOF: encontra o ponto mais baixo das caixas/cilindros orientados.
 * Não simula gravidade; evita que a cadeira inclinada atravesse o chão. */
function pousarObjetoRigido(o,ground,{endireitar=false}={}){
 if(!Number.isFinite(ground))throw Error("Solo inválido.");
 if(endireitar)delete o.rot3;
 const parts=partesDoObjeto(o,ground);
 if(!parts.length)throw Error("Objeto sem partes físicas.");
 const minY=Math.min(...parts.map(b=>{
   const ext=b.cil?Math.abs(b.e[1][1])*b.hh+
     Math.hypot(b.e[0][1],b.e[2][1])*b.r:
     b.h.reduce((sum,v,i)=>sum+Math.abs(b.e[i][1])*v,0);
   return b.c[1]-ext;
 }));
 if(!Number.isFinite(minY))throw Error("Altura de apoio inválida.");
 const deslocamento=ground-minY;
 o.base=(o.base||0)+deslocamento;
 if(endireitar){o.base=0;delete o.rot3;o.emAr=false}
 else o.emAr=true; // pose 6DOF inclinada precisa preservar a altura do pivô
 delete o.sobre;delete o.sobreRel;
 return {apoiado:true,deslocamento};
}
/* IK do punho + refinamento do deslocamento até o CENTRO DA PALMA.
 * O ikArm legado persegue o punho; Grip V3 precisa atingir a palma. */
function alinharPalmaV3(it,side,target,ground){
 if(!Array.isArray(target)||target.length!==3||!target.every(Number.isFinite))
   throw Error("Alvo da palma precisa ser um ponto 3D finito.");
 const p=it.params,ext=side===1?"L":"R",halfHand=.5*armDims(p).LH;
 let residual=Infinity;
 for(let attempt=0;attempt<5;attempt++){
   const frame=handFrameV3(it,side,ground);
   // A palma está a -LH/2 do punho no eixo Y local da mão.
   const wristTarget=target.map((v,i)=>v+halfHand*frame.M[i*3+1]);
   const local=doMundo({...p,wy:ground-restGround(p)})(wristTarget);
   const r=ikArm(p,shape(p),side,local);
   Object.assign(p,{["armAbd"+ext]:r.abd,["armFlex"+ext]:r.flex,
     ["armRot"+ext]:r.rot,["elbow"+ext]:r.elbow});
   const H=handFrameV3(it,side,ground);
   residual=Math.hypot(...target.map((v,i)=>v-H.T[i]));
   if(residual<=.035)break;
 }
 return residual;
}
/* A mão secundária acompanha o GripSite por IK; a primária permanece dona
 * da pose do objeto. Retorna desvio real para não ocultar extrapolação. */
function sincronizarMaoSecundaria(it,o,ground){
 const s=o.gripV3?.secundaria;
 if(!s)return null;
 const target=gripSiteWorld(o,s.siteId,ground).mundo;
 const deviation=alinharPalmaV3(it,s.side,target,ground);
 s.desvio=deviation;s.alcancavel=deviation<=.35;
 return deviation;
}
function beginRigidGrip(it,o,side,ground,{ponto,site,reach=2.5,modo="preservar",fechar=false,segunda=false,objetos=[]}={}){
 if(!it||!o||!(side===1||side===-1))throw Error("Manequim, objeto ou mão inválidos.");
 if(!Number.isFinite(reach)||reach<0||reach>100)throw Error("Alcance precisa estar entre 0 e 100 R.");
 if(o.gripV3&&!segunda)throw Error("Objeto já está segurado; use segunda:true para adicionar outra mão.");
 if(segunda&&!o.gripV3)throw Error("A segunda mão requer um vínculo primário.");
 if(o.gripV3&&o.gripV3.mannequinId!==it.id)throw Error("Objeto segurado por outro manequim.");
 if(o.grip&&!o.gripV3)throw Error("Objeto com vínculo V2. Solte-o antes de usar preensão V3.");
 if(Array.isArray(objetos)&&objetos.some(q=>q!==o&&
   ((q.gripV3?.mannequinId===it.id&&(q.gripV3.side===side||q.gripV3.secundaria?.side===side))||
     (q.grip?.mannequinId===it.id&&q.grip.side===side))))
   throw Error("Esta mão já segura outro objeto. Solte-o antes de agarrar outro.");
 const H=handFrameV3(it,side,ground),selected=gripSiteSelection(o,H,ground,ponto??site),
       distance=Math.hypot(...selected.mundo.map((v,i)=>v-H.T[i]));
 if(distance>reach)throw Error("Ponto "+selected.nome+" fora de alcance ("+(distance*11.4).toFixed(1)+" cm). Aproxime a palma.");
 if(!["preservar","encaixar"].includes(modo))throw Error("Modo: use 'preservar' ou 'encaixar'.");
 const old=objectRigidPose(o,ground);
 if(o.gripV3){
   if(o.gripV3.side===side||o.gripV3.secundaria?.side===side)throw Error("Esta mão já está vinculada.");
   const prev={...it.params};
   o.gripV3.secundaria={side,siteId:selected.id,relative:rigidCompose(rigidInverse(H),old)};
   let residual;
   try{residual=sincronizarMaoSecundaria(it,o,ground)}
   catch(e){Object.assign(it.params,prev);delete o.gripV3.secundaria;throw e}
   if(residual>.35){
     Object.assign(it.params,prev);delete o.gripV3.secundaria;
     throw Error("A segunda mão não consegue agarrar o ponto ("+residual.toFixed(2)+" R).");
   }
   return {objeto:o.nome||o.tipo,mao:side===1?"esquerda":"direita",ponto:selected.id,
     secundaria:true,distancia:distance,modo:"IK secundária",desvio:residual,versao:3};
 }
 // Encaixar desloca a mão por IK (camada de comandos), não o objeto.
 const objPose=old;
 if(modo==="encaixar"&&distance>.35)
   throw Error("A mão precisa alcançar o ponto antes de encaixar; use cena.segurarObjeto({modo:'encaixar'}).");
 const rel=rigidCompose(rigidInverse(H),objPose);
 // Captura os objetos apoiados ANTES de movimentar o pai no mundo.
 // Cada filho guarda uma pose relativa à cadeira (sem depender do chão).
 if(Array.isArray(objetos)){
   const byId=new Map(objetos.map(x=>[x.id,x]));
   for(const child of objetos){
     if(child===o)continue;
     let parent=byId.get(child.sobre),found=false,seen=new Set([child.id]);
     while(parent&&!seen.has(parent.id)){
       if(parent.id===o.id){found=true;break}
       seen.add(parent.id);parent=byId.get(parent.sobre);
     }
     if(!found)continue;
     // Guarda a relação IMEDIATA com o pai, antes de mover a cadeira.
     const direct=byId.get(child.sobre);
     if(direct)child.sobreRel=rigidCompose(rigidInverse(objectRigidPose(direct,ground)),objectRigidPose(child,ground));
   }
 }
 // Só depois de validar e calcular o vínculo, alterar o objeto.
 if(o.sobre)delete o.sobre;
 o.gripV3={version:3,mannequinId:it.id,side,siteId:selected.id,relative:rel};
 o.emAr=true;

 const dedos=fechar?fecharDedos(it,o,side,ground):null;
 return {objeto:o.nome||o.tipo,mao:side===1?"esquerda":"direita",ponto:selected.id,
   distancia:distance,modo,versao:3,dedos};
}
function updateRigidGrip(it,o,ground,{ajustarSegundaMao=true}={}){
 const g=o.gripV3;
 if(!g||!it)return false;
 const H=handFrameV3(it,g.side,ground);
 setRigidObjectPose(o,rigidCompose(H,g.relative),ground);
 o.emAr=true;
 if(ajustarSegundaMao&&g.secundaria)sincronizarMaoSecundaria(it,o,ground);
 return true;
}
function inspectRigidGrip(it,o,ground){
 const g=o.gripV3;if(!g)return {ativo:false};
 const H=handFrameV3(it,g.side,ground),want=rigidCompose(H,g.relative),
 current=objectRigidPose(o,ground),positionError=Math.hypot(...want.T.map((v,i)=>v-current.T[i]));
 let secondaryError=null;
 if(g.secundaria){
   const h2=handFrameV3(it,g.secundaria.side,ground);
   const site=gripSiteWorld(o,g.secundaria.siteId,ground);
   secondaryError=Math.hypot(...site.mundo.map((v,i)=>v-h2.T[i]));
 }
 return {ativo:true,objeto:o.nome||o.tipo,manequim:it.name,mao:g.side===1?"esquerda":"direita",
   ponto:g.siteId,segundaMao:g.secundaria?(g.secundaria.side===1?"esquerda":"direita"):null,
   desvio:positionError,desvioSegundaMao:secondaryError,versao:3};
}
function releaseRigidGrip(it,o,ground,{mao,modo="manter"}={}){
 const g=o.gripV3;if(!g)return false;
 if(it&&g.mannequinId!==it.id)throw Error("Este manequim não segura o objeto.");
 if(!["manter","chao","pousar","queda"].includes(modo))throw Error("Soltura V3: 'manter', 'chao', 'pousar' ou 'queda'.");
 const side=mao===undefined?null:mao===1||mao==="esquerda"?1:mao===-1||mao==="direita"?-1:null;
 if(mao!==undefined&&side===null)throw Error("Mão deve ser esquerda ou direita.");
 updateRigidGrip(it,o,ground);
 if(side!==null&&g.secundaria&&side!==g.side&&side===g.secundaria.side){
   delete g.secundaria;return {solto:false,restante:g.side===1?"esquerda":"direita"};
 }
 if(side!==null&&g.secundaria&&side===g.side){
   const next=g.secundaria;
   g.side=next.side;g.siteId=next.siteId;g.relative=rigidCompose(rigidInverse(handFrameV3(it,next.side,ground)),objectRigidPose(o,ground));
   delete g.secundaria;return {solto:false,restante:g.side===1?"esquerda":"direita"};
 }
 delete o.gripV3;
 if(modo==="chao"||modo==="pousar"||modo==="queda"){
   // Queda = aterrissagem instantânea cinemática, sem dinâmica ou atrito.
   pousarObjetoRigido(o,ground,{endireitar:modo==="chao"});
 }else{o.emAr=true;}
 return {solto:true,modo};
}
export {handFrameV3,beginRigidGrip,updateRigidGrip,releaseRigidGrip,inspectRigidGrip,pousarObjetoRigido,sincronizarMaoSecundaria,alinharPalmaV3};
