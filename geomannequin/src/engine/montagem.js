/* GeoMannequin — montagem: cache de malhas, rotações e pose de cada parte */
import { buildEar, buildHead } from "./cabeca.js";
import {oralMeshV2,toothMeshesV2,tongueMeshV2,orbitMeshesV2} from "./head/index.js";
import { buildBust } from "./tronco.js";
import { buildArm, buildDelt, buildElbow, buildForearm } from "./bracos.js";
import { buildAnkle, buildCalf, buildFoot, buildKnee, buildThigh, buildToes } from "./pernas.js";
import { buildFingers, buildPalm, dedosChave } from "./maos.js";
import { D, mv, rotM } from "./matematica.js";
import { bustFrame, bustZc } from "./corpo.js";
import { makeXf } from "./camera.js";

/* cache de malhas: um por manequim (p._cache) ou o global */
function newCache(){return {meshKey:"",bustKey:"",armKey:"",legKey:"",handKey:["",""],toeKey:["",""],jointKey:{},meshes:{}}}
let GCACHE;
function getMeshes(p,S){
  const C=p._cache||GCACHE;
  const key=[p.headModel||"v1",p.headDetail===undefined?1:p.headDetail,p.skull,p.jaw,p.chin,p.face,p.chinProj,p.cranialDepth||1,p.headScale||1,p.sidePlaneDepth,p.sidePlaneRadius,p.sidePlaneCenterY,p.sidePlaneCenterZ,p.sidePlaneBevel,p.microDensity,p.microStrength,p.brow,p.nose,p.lips,p.earSize,p.earFlare,p.muscle,p.fat,p.fem,Math.round((p.jawOpen||0)*50),Math.round((p.jawSide||0)*50),Math.round((p.smile||0)*50),Math.round((p.eyeLid||0)*40),Math.round((p.browUp||0)*40),Math.round((p.browIn||0)*40)].join("|");
  if(key!==C.meshKey){
    C.meshKey=key;
    C.meshes.head=buildHead(p,S);C.meshes.earL=buildEar(p,S,-1);C.meshes.earR=buildEar(p,S,1);
    /* V2: volumes reais adicionais; nunca são construídos no caminho V1. */
    if(p.headModel==="v2"){
      const teeth=toothMeshesV2(p,S);
      C.meshes.headV2Parts=[
        {mesh:oralMeshV2(p,S),kind:"cavity"},
        {mesh:tongueMeshV2(p,S),kind:"tongue"},
        ...teeth.upper.map(mesh=>({mesh,kind:"tooth"})),
        ...teeth.lower.map(mesh=>({mesh,kind:"tooth"})),
        ...orbitMeshesV2(p,S).map(mesh=>({mesh,kind:"eye"}))
      ].filter(q=>q.mesh);
    }else C.meshes.headV2Parts=[];
  }
  const bk=[p.headModel||"v1",p.jaw,p.face,p.neck,p.neckLen,p.shW,p.shDrop,p.chestF,p.adam,p.shElevL,p.shElevR,p.shProtL,p.shProtR,p.shTension,p.shTensL||0,p.shTensR||0,p.scapRotL||0,p.scapRotR||0,p.armAbdL,p.armAbdR,p.armFlexL,p.armFlexR,p.muscle,p.fat,p.fem,p.waist,p.hips,p.gluteVol,Math.round(p.spineSide),Math.round(p.spineFlex)].join("|");
  if(bk!==C.bustKey){C.bustKey=bk;C.meshes.bust=buildBust(p,S)}
  const ak=[p.armLen,p.armThick,p.muscle,p.fat,p.fem].join("|");
  if(ak!==C.armKey){C.armKey=ak;C.jointKey={};[["R",-1],["L",1]].forEach(([n,s])=>{C.meshes["fore"+n]=buildForearm(p,s);C.meshes["delt"+n]=buildDelt(p,s)});C.handKey=["",""]}
  /* braço/cotovelo e joelho dependem do ângulo da junta (refeitos a cada 5°) */
  [["R",-1,p.elbowR,p.kneeFlexR],["L",1,p.elbowL,p.kneeFlexL]].forEach(([n,s,el,kf])=>{
    const ek=ak+"|"+Math.round(el/5);if(C.jointKey["e"+n]!==ek){C.jointKey["e"+n]=ek;C.meshes["arm"+n]=buildArm(p,s,Math.round(el/5)*5);C.meshes["elb"+n]=buildElbow(p,s,Math.round(el/5)*5)}
    const kk=[p.legLen,p.thighThick,p.muscle,p.fat,p.fem].join("|")+"|"+Math.round(kf/5);if(C.jointKey["k"+n]!==kk){C.jointKey["k"+n]=kk;C.meshes["knee"+n]=buildKnee(p,Math.round(kf/5)*5)}
  });
  const lk=[p.legLen,p.thighThick,p.muscle,p.fat,p.fem,p.hips,p.gluteVol].join("|");
  if(lk!==C.legKey){C.legKey=lk;C.toeKey=["",""];
    [["R",-1],["L",1]].forEach(([n,s])=>{C.meshes["thigh"+n]=buildThigh(p,s);C.meshes["calf"+n]=buildCalf(p,s);C.meshes["ankle"+n]=buildAnkle(p,s);C.meshes["foot"+n]=buildFoot(p,s)})}
  [["R",-1,p.toesR,p.halluxR],["L",1,p.toesL,p.halluxL]].forEach(([n,s,t,h],i)=>{const tk=lk+"|"+t+"|"+(h||0);if(tk!==C.toeKey[i]){C.toeKey[i]=tk;C.meshes["toes"+n]=buildToes(p,s,t,h||0)}});
  [-1,1].forEach((s,i)=>{
    const c=s>0?p.handCurlL:p.handCurlR,hk=ak+"|"+c+"|"+dedosChave(p,s);
    if(hk!==C.handKey[i]){C.handKey[i]=hk;C.meshes["hand"+i]=[buildPalm(p,s)].concat(buildFingers(p,s,c))}
  });
  return C.meshes;
}
/* cadeia cervical: a base do pescoço dobra uma parte do movimento, o resto gira em torno da base do crânio */
function poseSetup(p,S){
  const ya=p.headYaw*D,pa=p.headPitch*D,ra=p.headRoll*D,nt=(p.neckTwist||0)*D,nf=(p.neckFlex||0)*D,ns=(p.neckSide||0)*D;
  const F=bustFrame(p,S),yb=F.yJ+0.15,B=[0,yb,bustZc(yb,F)],Hs=[0,-0.55,-0.22];
  const kb=[0.4,0.45,0.45];
  /* cervical: parte da rotação da cabeça + o ajuste próprio do pescoço (neckFlex/Side/Twist) acontece na base do pescoço */
  const Rb=rotM(ya*kb[0]+nt,pa*kb[1]+nf,ra*kb[2]+ns);
  const bh=mv(Rb,[Hs[0]-B[0],Hs[1]-B[1],Hs[2]-B[2]]);
  const H1=[B[0]+bh[0],B[1]+bh[1],B[2]+bh[2]];
  const aff=t=>{
    const R1=rotM((ya*kb[0]+nt)*t,(pa*kb[1]+nf)*t,(ra*kb[2]+ns)*t);
    const t2=t*t,R2=rotM(ya*(1-kb[0])*t2,pa*(1-kb[1])*t2,ra*(1-kb[2])*t2);
    const M=[];for(let i=0;i<3;i++)for(let j=0;j<3;j++)M.push(R2[i*3]*R1[j]+R2[i*3+1]*R1[3+j]+R2[i*3+2]*R1[6+j]);
    const b1=mv(R1,B),d=[B[0]-b1[0]-H1[0],B[1]-b1[1]-H1[1],B[2]-b1[2]-H1[2]],r2=mv(R2,d);
    return {M,T:[r2[0]+H1[0],r2[1]+H1[1],r2[2]+H1[2]]};
  };
  const tab=[];for(let i=0;i<=64;i++)tab.push(aff(i/64));
  return {head:tab[64],neck:aff,tab};
}
function makeMat(p){const xf=makeXf(p);return [xf([1,0,0]),xf([0,1,0]),xf([0,0,1])]}

/* execução inicial deste módulo (na mesma ordem do app original) */
export function iniciarMontagem(){
  GCACHE=newCache();
}

export { newCache, GCACHE, getMeshes, poseSetup, makeMat };
