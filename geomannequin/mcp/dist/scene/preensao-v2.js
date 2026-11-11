/* GeoMannequin · Preensão V2, versão CINEMÁTICA de vínculo de objeto.
 * Segurar cria uma âncora relativa ao punho/palma, sem teleporte: o objeto
 * só pode ser anexado se estiver alcançável. O fechamento incremental das
 * falanges é geométrico; não simula força, torque ou atrito reais.
 */
import {restGround,shape,chainSetup,armPose,armDims,comp,applyA,paraMundo,clamp} from "../engine/index.js";
import {colliderRig,colliderObject,capsuleSolidContact} from "../engine/contact-v2.js";
function getHandAnchor(it,side,ground){
 const p=it.params,S=shape(p),ch=chainSetup(p,S),A=armDims(p),frame=comp(ch.A2,armPose(p,ch.F,side).hand);
 const local=applyA(frame,[0,-.50*A.LH,0]);
 return paraMundo({...p,wy:ground-restGround(p)})(local);
}
function localOffset(dx,dz,angle){
 const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 return [dx*c-dz*s,dx*s+dz*c];
}
function worldOffset(dx,dz,angle){
 const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 return [dx*c+dz*s,-dx*s+dz*c];
}
function beginGrip(it,o,side,ground,{reach=2.5,fechar=true}={}){
 if(!it||!o)throw Error("Manequim ou objeto inválido.");
 if(side!==1&&side!==-1)throw Error("Mão inválida; escolha esquerda ou direita.");
 if(o.grip&&o.grip.mannequinId!==it.id)throw Error("Este objeto já está sendo segurado.");
 const p=it.params,anchor=getHandAnchor(it,side,ground),
   center=[o.x,ground+(o.base||0)+(o.alt||0)/2,o.z];
 const delta=center.map((v,i)=>v-anchor[i]),distance=Math.hypot(...delta);
 if(distance>reach)throw Error("A mão está a "+(distance*11.4).toFixed(1)+" cm do centro do objeto. Aproxime-a antes de segurar.");
 if(o.sobre)delete o.sobre; // agora deixa de repousar em outro objeto
 const [dx,dz]=localOffset(delta[0],delta[2],p.wRot||0);
 o.grip={mannequinId:it.id,side,offset:[dx,delta[1],dz],
  yawOffset:(o.giro||0)-(p.wRot||0),version:1};
 const dedos=fechar?fecharDedos(it,o,side,ground):null;
 return {objeto:o.nome||o.tipo,mao:side===1?"esquerda":"direita",distancia:distance,dedos};
}
function updateGrip(it,o,ground){
 if(!o.grip||!it)return false;
 const anchor=getHandAnchor(it,o.grip.side,ground),delta=o.grip.offset||[0,0,0],
  [dx,dz]=worldOffset(delta[0],delta[2],it.params.wRot||0);
 o.x=anchor[0]+dx;o.z=anchor[2]+dz;
 o.base=anchor[1]+delta[1]-ground-(o.alt||0)/2;
 o.giro=((it.params.wRot||0)+(o.grip.yawOffset||0)+540)%360-180;
 return true;
}
/* Cada falange para antes de aprofundar contato com caixa/cilindro.
 * Ainda não é uma grasp simulation com forças ou atrito. */
function fecharDedos(it,o,side,ground){
 const p=it.params,label=side===1?"E":"D",
       entries=[["Th","polegar"],["In","indicador"],["Me","médio"],["An","anelar"],["Mi","mínimo"]];
 const solids=colliderObject(o,ground),res=[];
 for(const [code,nome] of entries){
  const key="f"+code+(side===1?"L":"R");
  const initial=Number.isFinite(p[key])?p[key]:0;
  let safe=initial,dist=Infinity,encostou=false;
  for(let k=0;k<=16;k++){
   const v=initial+(1-initial)*k/16;p[key]=v;
   const caps=colliderRig({...p,wy:ground-restGround(p)},{level:"fine"}).caps
     .filter(c=>c.kind==="finger"&&c.side===label&&c.finger===nome);
   let nearest=Infinity;
   for(const c of caps)for(const s of solids)
     nearest=Math.min(nearest,capsuleSolidContact(c,s.shape,s.id).distancia);
   if(nearest<-.025){p[key]=safe;encostou=dist<=.055;break;}
   safe=v;dist=nearest;
   if(nearest<=.045){encostou=true;break;}
  }
  p[key]=safe;
  res.push({dedo:nome,contato:encostou,distancia:Number.isFinite(dist)?+dist.toFixed(4):null});
 }
 return res;
}
function releaseGrip(o){if(!o?.grip)return false;delete o.grip;return true;}
export {getHandAnchor,beginGrip,updateGrip,releaseGrip,fecharDedos,localOffset,worldOffset};
