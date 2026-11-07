/* GeoMannequin — poses rápidas, tipos corporais, rostos, posturas e proteção dos braços */
import { P } from "./modelo.js";
import { applyA, armClear, bodyProxies, chainSetup, flatAnkle, handOnHip, ikArm, legClear, minAbd, pushOut, shape } from "../engine/index.js";

/* o braço e a mão não atravessam a cabeça nem o tronco */
const GUARD=/^(armAbd|armFlex|armRot|elbow|pron|wrist|spine|pelvis|shElev|shProt|head|hip|knee|ankle|toes)/;
function guardArms(){
  let ch=false;const sh=shape(P);
  const lc=legClear(P,sh);if(lc){P.hipAbdL=Math.round(lc.abdL);P.hipAbdR=Math.round(lc.abdR);ch=true}
  [1,-1].forEach(s=>{const L_=s>0?"L":"R",mn=Math.round(minAbd(P["armFlex"+L_]));if(P["armAbd"+L_]<mn){P["armAbd"+L_]=mn;ch=true}
    const f=armClear(P,sh,s);if(!f)return;ch=true;
    if(f.elbow!==undefined)P["elbow"+L_]=Math.round(f.elbow);if(f.abd!==undefined)P["armAbd"+L_]=Math.round(f.abd)});
  return ch;
}
const FACES={
  neutro:{},
  feminino:{skull:0.78,jaw:0.56,chin:0.24,chinProj:0.76,neck:0.46,brow:0.045,nose:0.2,lips:0.06,eyeSize:1.3,browW:0.04,shW:1.6,earSize:0.9,chestF:0.6,adam:0,neckLen:0.9},
  masculino:{skull:0.86,jaw:0.68,chin:0.34,chinProj:0.84,neck:0.6,brow:0.09,nose:0.27,lips:0.04,eyeSize:1.1,browW:0.056,shW:1.92,earSize:1.05,chestF:0,adam:1,neckLen:0.8},
  infantil:{skull:0.88,jaw:0.5,chin:0.22,face:34,chinProj:0.72,neck:0.34,brow:0.03,nose:0.16,lips:0.05,eyeSize:1.5,browW:0.03,shW:1.25,earSize:1.1,chestF:0,adam:0,neckLen:0.8}
};
const POSTURES={
  relaxado:{shElevL:0,shElevR:0,shProtL:0,shProtR:0,shTension:0.1},
  tenso:{shElevL:0.3,shElevR:0.3,shProtL:0.1,shProtR:0.1,shTension:1},
  encolhido:{shElevL:0.95,shElevR:0.95,shProtL:0.35,shProtR:0.35,shTension:0.8},
  aberto:{shElevL:-0.2,shElevR:-0.2,shProtL:-0.85,shProtR:-0.85,shTension:0.45},
  curvado:{shElevL:-0.3,shElevR:-0.3,shProtL:0.85,shProtR:0.85,shTension:0.1,headPitch:14},
  assimetrico:{shElevL:0.7,shElevR:-0.5,shProtL:0.2,shProtR:-0.2,shTension:0.4,headRoll:-12}
};
const BODIES={
  magro:{muscle:0.15,fat:0,waist:0.86,thighThick:0.92,armThick:0.95},
  medio:{muscle:0.4,fat:0.2,waist:0.93,thighThick:1,armThick:1},
  atletico:{muscle:0.75,fat:0.12,waist:0.92,thighThick:1.05,armThick:1.05},
  musculoso:{muscle:1,fat:0.08,waist:0.98,thighThick:1.12,armThick:1.15,shW:1.9,neck:0.64},
  cheio:{muscle:0.3,fat:0.8,waist:1.0,thighThick:1.1,armThick:1.05}
};
const POSE0={spineFlex:0,spineSide:0,spineTwist:0,pelvisTilt:0,pelvisSide:0,pelvisTwist:0,hipFlexL:0,hipFlexR:0,hipAbdL:3,hipAbdR:3,hipRotL:0,hipRotR:0,kneeFlexL:0,kneeFlexR:0,ankleFlexL:0,ankleFlexR:0,ankleTiltL:0,ankleTiltR:0,toesL:0,toesR:0,
  armAbdL:12,armAbdR:12,armFlexL:0,armFlexR:0,armRotL:0,armRotR:0,elbowL:0,elbowR:0,pronL:0,pronR:0,wristL:0,wristR:0,handCurlL:0.3,handCurlR:0.3,
  headYaw:0,headPitch:0,headRoll:0,shElevL:0,shElevR:0,shProtL:0,shProtR:0};
const BPOSES={
  empe:{},
  contrapposto:{pelvisSide:7,spineSide:-9,hipAbdL:7,hipAbdR:-2,hipFlexR:12,shElevL:-0.2,shElevR:0.25,headRoll:5,armAbdL:10,armAbdR:6,elbowR:15},
  caminhando:{hipFlexL:24,hipFlexR:-14,kneeFlexL:6,kneeFlexR:28,ankleFlexL:-3,ankleFlexR:-4,toesR:-30,armFlexL:-22,armFlexR:25,elbowL:15,elbowR:30,spineTwist:7,pelvisTwist:-6},
  frente:{spineFlex:35,headPitch:-15,armFlexL:20,armFlexR:20,flat:[1,-1]},
  torcao:{spineTwist:35,pelvisTwist:-8,headYaw:20,armAbdL:15,armAbdR:15},
  passo:{hipFlexL:58,kneeFlexL:72,hipFlexR:-18,kneeFlexR:12,ankleFlexR:14,toesR:-26,spineFlex:6,armFlexL:-25,armFlexR:30,elbowL:20,elbowR:35,flat:[1]},
  joelho:{hipFlexL:88,kneeFlexL:95,ankleFlexL:22,toesL:10,armAbdL:20,armAbdR:20,armFlexR:15,elbowL:20,elbowR:25,flat:[-1]},
  ponta:{ankleFlexL:42,ankleFlexR:42,toesL:-38,toesR:-38,armAbdL:18,armAbdR:18},
  erguido:{armAbdL:155,armFlexL:20,elbowL:15,wristL:-10,handCurlL:0.15,headPitch:-10,headYaw:12,spineSide:5,armAbdR:14},
  alcancar:{armFlexR:95,armAbdR:4,elbowR:6,armRotR:10,shProtR:0.6,spineTwist:-18,spineFlex:8,armFlexL:-18,elbowL:12,headYaw:-12,handCurlR:0.1},
  lateral:{spineSide:22,pelvisSide:-6,armAbdL:150,armFlexL:10,elbowL:35,armAbdR:14,elbowR:15,headRoll:-8},
  agachar:{hipFlexL:62,hipFlexR:62,kneeFlexL:88,kneeFlexR:88,hipAbdL:12,hipAbdR:12,hipRotL:8,hipRotR:8,spineFlex:22,headPitch:-14,armFlexL:55,armFlexR:55,elbowL:25,elbowR:25,flat:[1,-1]}
};
function doBodyPose(k){
    Object.assign(P,POSE0);
    {
    if(k==="cintura"){
      Object.assign(P,{pelvisSide:5,spineSide:-5,headRoll:4});
      const sh=shape(P),r=handOnHip(P,sh,1);
      Object.assign(P,{armAbdL:r.abd,armFlexL:r.flex,armRotL:r.rot,elbowL:r.elbow,wristL:-35,pronL:40,handCurlL:0.35});
    }else if(k==="cruzar"||k==="ombro"){
      if(k==="cruzar")Object.assign(P,{spineTwist:-8,headYaw:-10});
      const sh=shape(P),ch=chainSetup(P,sh),F=ch.F;
      const T=k==="cruzar"?[-0.5,F.yJ-1.35,F.zT+1.25]:[-(F.W-0.35),F.yAc+0.05,F.zT+0.7];
      const r=ikArm(P,sh,1,pushOut(applyA(ch.A2,T),bodyProxies(P,sh),0.15),[0.25,-1,0.7]);
      Object.assign(P,{armAbdL:r.abd,armFlexL:r.flex,armRotL:r.rot,elbowL:r.elbow,pronL:k==="cruzar"?70:60,wristL:k==="cruzar"?10:-10,handCurlL:0.35});
      guardArms();
    }else{
      const bp=Object.assign({},BPOSES[k]),fl=bp.flat||[];delete bp.flat;
      Object.assign(P,bp);
      fl.forEach(s=>{P["ankleFlex"+(s>0?"L":"R")]=flatAnkle(P,shape(P),s)});
    }
    }
}

export { GUARD, guardArms, FACES, POSTURES, BODIES, POSE0, BPOSES, doBodyPose };
