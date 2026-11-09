/* GeoMannequin — poses rápidas, tipos corporais, rostos, posturas e proteção dos braços */
import { P } from "./modelo.js";
import { ISQUIO, ampliar, nivelFlex, apoiarContatos, aplicarGesto, applyA, armClear, bodyProxies, chainSetup, comp, flatAnkle, handOnHip, ikArm, legClear, legDims, legPose, minAbd, pushOut, shape } from "../engine/index.js";

/* o braço e a mão não atravessam a cabeça nem o tronco */
const GUARD=/^(armAbd|armFlex|armRot|elbow|pron|wrist|spine|pelvis|shElev|shProt|head|hip|knee|ankle|toes)/;
/* limites que dependem de outra articulação (como no corpo real); devolve avisos */
function limitesAcoplados(Q){
  const av=[];
  [["L","esquerda"],["R","direita"]].forEach(([L_,n])=>{
    /* isquiotibiais: com o joelho esticado a coxa sobe menos (≈ 90°); com o joelho dobrado vai até ~125° */
    const fx=nivelFlex(Q),top=ampliar("hipFlex",-30,125,fx)[1],mx=Math.round(Math.min(top,ISQUIO[fx]+(top-ISQUIO[fx])*Math.min(1,Math.max(0,Q["kneeFlex"+L_])/90)));
    if(Q["hipFlex"+L_]>mx){Q["hipFlex"+L_]=mx;av.push("coxa "+n+": com o joelho quase esticado sobe só até "+mx+"° (músculos de trás da coxa"+(fx<2?"; perfil “ginasta” vai mais longe":"")+")")}
    /* braço acima da cabeça pela lateral: o úmero precisa girar para fora (rotação externa) */
    if(Q["armAbd"+L_]>120&&Q["armRot"+L_]<-20){Q["armRot"+L_]=-20;av.push("braço "+(n==="esquerda"?"esquerdo":"direito")+": acima de 120° pela lateral o braço gira para fora")}
    /* dedos: com a base (MCF) dobrada, o dedo quase não abre para os lados (ligamentos colaterais esticam) */
    ["Th","In","Me","An","Mi"].forEach(f=>{const mc=Q["f"+f+"Mcp"+L_]||0,ab=Q["f"+f+"Abd"+L_]||0,lim=Math.max(0.25,1-Math.max(0,mc));if(Math.abs(ab)>lim+1e-6){Q["f"+f+"Abd"+L_]=Math.sign(ab)*Math.round(lim*100)/100;av.push("mão "+n+": com a base do dedo dobrada, ele abre no máximo "+Math.round(lim*100)+"%")}});
    /* dedão + dedos do pé: juntos não passam de 60° para cima nem para baixo */
    {const t=(Q["toes"+L_]||0)+(Q["hallux"+L_]||0);if(Math.abs(t)>60){Q["hallux"+L_]=Math.sign(t)*60-(Q["toes"+L_]||0);av.push("pé "+n+": dedão e dedos juntos vão até 60°")}}
    /* a canela só gira com o joelho dobrado (esticado, os ligamentos travam) */
    {const tr=Q["tibiaRot"+L_]||0,lim=Math.round(5+Math.max(0,Q["kneeFlex"+L_]||0)*0.45);if(Math.abs(tr)>lim){Q["tibiaRot"+L_]=Math.sign(tr)*lim;av.push("canela "+n+": com o joelho a "+Math.round(Q["kneeFlex"+L_]||0)+"° gira só até "+lim+"°")}}
  });
  /* mandíbula: aberta, desvia menos para o lado */
  {const lim=Math.round((1-0.5*Math.max(0,Q.jawOpen||0))*100)/100;if(Math.abs(Q.jawSide||0)>lim){Q.jawSide=Math.sign(Q.jawSide)*lim;av.push("mandíbula: aberta, desvia para o lado só até "+Math.round(lim*100)+"%")}}
  return av;
}
function guardArms(){
  let ch=false;const sh=shape(P);
  if(limitesAcoplados(P).length)ch=true;
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
/* expressões do rosto (mandíbula, boca, olhos, pálpebras e sobrancelhas) */
const EXPRESSOES={
  neutra:{jawOpen:0,jawSide:0,smile:0,eyeLid:0,browUp:0,browIn:0},
  alegria:{jawOpen:0.12,jawSide:0,smile:0.9,eyeLid:0.28,browUp:0.2,browIn:-0.1},
  surpresa:{jawOpen:0.55,jawSide:0,smile:0,eyeLid:0,browUp:1,browIn:-0.2},
  raiva:{jawOpen:0.1,jawSide:0,smile:-0.6,eyeLid:0.25,browUp:-0.5,browIn:1},
  tristeza:{jawOpen:0,jawSide:0,smile:-0.8,eyeLid:0.35,browUp:0.1,browIn:-0.9},
  medo:{jawOpen:0.35,jawSide:0,smile:-0.4,eyeLid:0,browUp:0.8,browIn:-0.7},
  grito:{jawOpen:1,jawSide:0,smile:-0.2,eyeLid:0.2,browUp:-0.2,browIn:0.9},
  sono:{jawOpen:0.05,jawSide:0,smile:0,eyeLid:0.95,browUp:-0.1,browIn:0},
  desconfianca:{jawOpen:0,jawSide:0.3,smile:-0.3,eyeLid:0.45,browUp:-0.2,browIn:0.5},
  piscando:{jawOpen:0,jawSide:0,smile:0.6,eyeLid:0,browUp:0.1,browIn:0}
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
  headYaw:0,headPitch:0,headRoll:0,shElevL:0,shElevR:0,shProtL:0,shProtR:0,
  bodyPitch:0,bodyRoll:0,bodyLift:0,ground:1,lumFlex:0,lumSide:0,lumTwist:0,thoFlex:0,thoSide:0,thoTwist:0,neckFlex:0,neckSide:0,neckTwist:0,
  wristDevL:0,wristDevR:0,fThL:0,fInL:0,fMeL:0,fAnL:0,fMiL:0,fThR:0,fInR:0,fMeR:0,fAnR:0,fMiR:0,fSpreadL:0.4,fSpreadR:0.4,thumbOppL:0,thumbOppR:0,
  halluxL:0,halluxR:0,footAddL:0,footAddR:0,tibiaRotL:0,tibiaRotR:0,shTensL:0,shTensR:0,scapRotL:0,scapRotR:0,
  fThMcpL:0,fThIpL:0,fThAbdL:0,fInMcpL:0,fInIpL:0,fInAbdL:0,fMeMcpL:0,fMeIpL:0,fMeAbdL:0,fAnMcpL:0,fAnIpL:0,fAnAbdL:0,fMiMcpL:0,fMiIpL:0,fMiAbdL:0,fThMcpR:0,fThIpR:0,fThAbdR:0,fInMcpR:0,fInIpR:0,fInAbdR:0,fMeMcpR:0,fMeIpR:0,fMeAbdR:0,fAnMcpR:0,fAnIpR:0,fAnAbdR:0,fMiMcpR:0,fMiIpR:0,fMiAbdR:0};
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
/* mão (s) num ponto do próprio corpo, por cinemática inversa; onde(ch, legs) devolve o ponto em coordenadas do corpo */
function maoNoCorpo(Q,s,onde,extra){
  const S=shape(Q),ch=chainSetup(Q,S),pernas={};[-1,1].forEach(t=>{const lp=legPose(Q,ch.F,ch,t);pernas[t]={Th:comp(ch.Pel,lp.thigh),Cf:comp(ch.Pel,lp.calf),A:legDims(Q)}});
  const alvo=onde(ch,pernas),r=ikArm(Q,S,s,alvo),L_=s>0?"L":"R";
  Object.assign(Q,{["armAbd"+L_]:r.abd,["armFlex"+L_]:r.flex,["armRot"+L_]:r.rot,["elbow"+L_]:r.elbow},extra||{});
}
/* ===== Biblioteca de poses humanas (usa o esqueleto: corpo inteiro, apoio no chão, mãos) =====
   Cada pose escreve só os ângulos; o apoio no chão assenta o corpo pela parte mais baixa.
   lado: 1 = o lado esquerdo faz o movimento principal, −1 = o direito. */
/* poses que pedem flexibilidade de ginasta */
const gin=Q=>{if(nivelFlex(Q)<2)Q.flex=2};
const lad=(s,k)=>k+(s>0?"L":"R"),opo=(s,k)=>k+(s>0?"R":"L");
const POSES_CORPO={
  sentado:(Q,s)=>{Object.assign(Q,{hipFlexL:88,hipFlexR:88,kneeFlexL:88,kneeFlexR:84,hipAbdL:6,hipAbdR:8,ankleFlexL:2,ankleFlexR:4,spineFlex:6,pronL:-40,pronR:-40,handCurlL:0.35,handCurlR:0.35,headPitch:4});
    [1,-1].forEach(t=>maoNoCorpo(Q,t,(ch,pe)=>applyA(pe[t].Th,[0,-pe[t].A.L1*0.62,0.62*pe[t].A.k])))},
  sentadoChao:(Q,s)=>Object.assign(Q,{hipFlexL:80,hipFlexR:80,hipAbdL:42,hipAbdR:42,hipRotL:-40,hipRotR:-40,kneeFlexL:140,kneeFlexR:135,ankleFlexL:20,ankleFlexR:20,ankleTiltL:20,ankleTiltR:20,spineFlex:14,armFlexL:40,armFlexR:40,elbowL:35,elbowR:35,armAbdL:16,armAbdR:16,handCurlL:0.4,handCurlR:0.4,headPitch:6}),
  pernasEsticadas:(Q,s)=>Object.assign(Q,{hipFlexL:88,hipFlexR:88,kneeFlexL:0,kneeFlexR:0,ankleFlexL:18,ankleFlexR:18,spineFlex:-12,armFlexL:-45,armFlexR:-45,armAbdL:18,armAbdR:18,elbowL:0,elbowR:0,wristL:-70,wristR:-70,handCurlL:0.05,handCurlR:0.05,headPitch:-6}),
  abracandoJoelhos:(Q,s)=>{Object.assign(Q,{hipFlexL:118,hipFlexR:118,kneeFlexL:140,kneeFlexR:140,ankleFlexL:10,ankleFlexR:10,hipAbdL:4,hipAbdR:4,spineFlex:30,headPitch:14,handCurlL:0.55,handCurlR:0.55});
    [1,-1].forEach(t=>maoNoCorpo(Q,t,(ch,pe)=>applyA(pe[-t].Cf,[t*0.35,-pe[-t].A.L2*0.3,0.55*pe[-t].A.k]),{["pron"+(t>0?"L":"R")]:60}))},
  deitadoCostas:(Q,s)=>Object.assign(Q,{bodyPitch:-90,armAbdL:14,armAbdR:14,handCurlL:0.35,handCurlR:0.35,ankleFlexL:25,ankleFlexR:25,hipRotL:12,hipRotR:12}),
  deitadoLado:(Q,s)=>Object.assign(Q,{bodyRoll:s*88,[lad(s,"hipFlex")]:35,[lad(s,"kneeFlex")]:55,[opo(s,"hipFlex")]:45,[opo(s,"kneeFlex")]:70,[lad(s,"armAbd")]:150,[lad(s,"elbow")]:110,[opo(s,"armFlex")]:45,[opo(s,"elbow")]:30,[opo(s,"armAbd")]:-10,headRoll:s*-12,spineFlex:12,ankleFlexL:20,ankleFlexR:20}),
  deBrucos:(Q,s)=>Object.assign(Q,{bodyPitch:90,armAbdL:95,armAbdR:95,elbowL:95,elbowR:95,armRotL:-50,armRotR:-50,pronL:-60,pronR:-60,headYaw:s*70,ankleFlexL:45,ankleFlexR:45,handCurlL:0.2,handCurlR:0.2}),
  apoiadoCotovelos:(Q,s)=>Object.assign(Q,{bodyPitch:75,spineFlex:-28,headPitch:-28,armFlexL:95,armFlexR:95,elbowL:95,elbowR:95,armAbdL:4,armAbdR:4,pronL:-70,pronR:-70,ankleFlexL:45,ankleFlexR:45,[lad(s,"kneeFlex")]:70}),
  ajoelhado:(Q,s)=>Object.assign(Q,{kneeFlexL:90,kneeFlexR:90,hipFlexL:2,hipFlexR:2,ankleFlexL:40,ankleFlexR:40,toesL:-20,toesR:-20,armAbdL:12,armAbdR:12,elbowL:15,elbowR:15}),
  sentadoCalcanhares:(Q,s)=>Object.assign(Q,{kneeFlexL:150,kneeFlexR:150,hipFlexL:30,hipFlexR:30,ankleFlexL:48,ankleFlexR:48,spineFlex:-4,armFlexL:30,armFlexR:30,elbowL:55,elbowR:55,handCurlL:0.3,handCurlR:0.3}),
  umJoelho:(Q,s)=>Object.assign(Q,{[lad(s,"hipFlex")]:88,[lad(s,"kneeFlex")]:92,[lad(s,"ankleFlex")]:-4,[opo(s,"hipFlex")]:-6,[opo(s,"kneeFlex")]:92,[opo(s,"ankleFlex")]:10,[opo(s,"toes")]:-55,spineFlex:6,[lad(s,"armFlex")]:30,[lad(s,"elbow")]:60,[opo(s,"armAbd")]:10,[opo(s,"elbow")]:15,handCurlL:0.35,handCurlR:0.35}),
  cocoras:(Q,s)=>Object.assign(Q,{hipFlexL:112,hipFlexR:112,kneeFlexL:150,kneeFlexR:150,hipAbdL:28,hipAbdR:28,hipRotL:-12,hipRotR:-12,ankleFlexL:-20,ankleFlexR:-20,spineFlex:18,headPitch:-14,armFlexL:55,armFlexR:55,elbowL:35,elbowR:35,armAbdL:-6,armAbdR:-6}),
  correndo:(Q,s)=>Object.assign(Q,{[lad(s,"hipFlex")]:62,[lad(s,"kneeFlex")]:95,[lad(s,"ankleFlex")]:10,[opo(s,"hipFlex")]:-25,[opo(s,"kneeFlex")]:45,[opo(s,"ankleFlex")]:30,[opo(s,"toes")]:-35,spineFlex:12,[lad(s,"armFlex")]:-45,[lad(s,"elbow")]:95,[opo(s,"armFlex")]:55,[opo(s,"elbow")]:90,armAbdL:10,armAbdR:10,handCurlL:0.6,handCurlR:0.6,headPitch:-6,spineTwist:s*-8,pelvisTwist:s*8}),
  impulso:(Q,s)=>Object.assign(Q,{hipFlexL:70,hipFlexR:70,kneeFlexL:85,kneeFlexR:85,ankleFlexL:-12,ankleFlexR:-12,spineFlex:32,armFlexL:-55,armFlexR:-55,elbowL:10,elbowR:10,headPitch:-20}),
  saltando:(Q,s)=>Object.assign(Q,{hipFlexL:35,hipFlexR:28,kneeFlexL:70,kneeFlexR:62,ankleFlexL:35,ankleFlexR:35,toesL:10,toesR:10,armAbdL:150,armAbdR:150,armFlexL:20,armFlexR:20,elbowL:10,elbowR:10,spineFlex:-10,headPitch:-12,handCurlL:0.1,handCurlR:0.1,bodyLift:3.5}),
  aterrissando:(Q,s)=>Object.assign(Q,{hipFlexL:60,hipFlexR:60,kneeFlexL:80,kneeFlexR:80,ankleFlexL:-10,ankleFlexR:-10,spineFlex:25,armFlexL:60,armFlexR:60,armAbdL:30,armAbdR:30,elbowL:20,elbowR:20,headPitch:-10}),
  chutando:(Q,s)=>Object.assign(Q,{[lad(s,"hipFlex")]:88,[lad(s,"kneeFlex")]:8,[lad(s,"ankleFlex")]:35,[opo(s,"kneeFlex")]:14,[opo(s,"hipFlex")]:8,spineFlex:-14,armAbdL:50,armAbdR:50,armFlexL:20,armFlexR:-10,elbowL:30,elbowR:30,handCurlL:0.7,handCurlR:0.7}),
  socando:(Q,s)=>{Object.assign(Q,{[opo(s,"armFlex")]:88,[opo(s,"armAbd")]:-6,[opo(s,"elbow")]:0,[opo(s,"pron")]:80,[lad(s,"armFlex")]:55,[lad(s,"elbow")]:125,[lad(s,"armAbd")]:-10,[lad(s,"pron")]:60,spineTwist:s*22,pelvisTwist:s*-8,[lad(s,"hipFlex")]:22,[lad(s,"kneeFlex")]:20,[opo(s,"hipFlex")]:-12,[opo(s,"kneeFlex")]:10,headPitch:4});aplicarGesto(Q,1,"punho");aplicarGesto(Q,-1,"punho")},
  alongando:(Q,s)=>Object.assign(Q,{armAbdL:172,armAbdR:172,elbowL:0,elbowR:0,armRotL:40,armRotR:40,spineFlex:-12,headPitch:-22,ankleFlexL:38,ankleFlexR:38,toesL:-45,toesR:-45,handCurlL:0.1,handCurlR:0.1}),
  paradaDeMao:(Q,s)=>{Object.assign(Q,{bodyPitch:180,armFlexL:175,armFlexR:175,armAbdL:12,armAbdR:12,elbowL:0,elbowR:0,wristL:-80,wristR:-80,spineFlex:-8,headPitch:-30,ankleFlexL:40,ankleFlexR:40,hipAbdL:6,hipAbdR:6});aplicarGesto(Q,1,"espalmada");aplicarGesto(Q,-1,"espalmada");Q.wristL=-70;Q.wristR=-70},
  engatinhando:(Q,s)=>{Object.assign(Q,{bodyPitch:90,armFlexL:92,armFlexR:92,elbowL:0,elbowR:0,wristL:-75,wristR:-75,hipFlexL:92,hipFlexR:92,kneeFlexL:92,kneeFlexR:92,ankleFlexL:40,ankleFlexR:40,headPitch:-40,[lad(s,"hipFlex")]:105,[opo(s,"armFlex")]:105});aplicarGesto(Q,1,"espalmada");aplicarGesto(Q,-1,"espalmada");Q.wristL=-70;Q.wristR=-70},
  apontando:(Q,s)=>{Object.assign(Q,{[opo(s,"armFlex")]:85,[opo(s,"armAbd")]:12,[opo(s,"elbow")]:5,[opo(s,"pron")]:70,spineTwist:s*-6,headYaw:s*-12});aplicarGesto(Q,-s,"apontar")},
  acenando:(Q,s)=>{Object.assign(Q,{[opo(s,"armAbd")]:110,[opo(s,"armFlex")]:30,[opo(s,"elbow")]:85,[opo(s,"armRot")]:60,[opo(s,"wrist")]:-10,headRoll:s*6});aplicarGesto(Q,-s,"acenar")},
  carregando:(Q,s)=>{Object.assign(Q,{armFlexL:52,armFlexR:52,elbowL:78,elbowR:78,armAbdL:8,armAbdR:8,pronL:-10,pronR:-10,wristL:-10,wristR:-10,spineFlex:-6,hipFlexL:6,hipFlexR:-4,kneeFlexL:8,kneeFlexR:6});aplicarGesto(Q,1,"segurar");aplicarGesto(Q,-1,"segurar")},
  empurrando:(Q,s)=>{Object.assign(Q,{spineFlex:22,armFlexL:85,armFlexR:85,elbowL:28,elbowR:28,wristL:-70,wristR:-70,pronL:-80,pronR:-80,[lad(s,"hipFlex")]:45,[lad(s,"kneeFlex")]:40,[opo(s,"hipFlex")]:-28,[opo(s,"kneeFlex")]:6,[opo(s,"ankleFlex")]:-18,[opo(s,"toes")]:-40,headPitch:-14});aplicarGesto(Q,1,"espalmada");aplicarGesto(Q,-1,"espalmada")},
  pensando:(Q,s)=>Object.assign(Q,{[opo(s,"armFlex")]:48,[opo(s,"armAbd")]:-18,[opo(s,"elbow")]:145,[opo(s,"pron")]:75,[opo(s,"wrist")]:10,[opo(s,"handCurl")]:0.55,[lad(s,"armFlex")]:30,[lad(s,"armAbd")]:-25,[lad(s,"elbow")]:95,[lad(s,"pron")]:70,headPitch:14,headRoll:s*-6,spineFlex:8,pelvisSide:s*5,[lad(s,"hipFlex")]:8,[opo(s,"hipAbd")]:6}),
  maosNaCintura:(Q,s)=>Object.assign(Q,{}),
  encostado:(Q,s)=>Object.assign(Q,{bodyPitch:-8,[lad(s,"hipFlex")]:30,[lad(s,"kneeFlex")]:55,[lad(s,"hipRot")]:30,[lad(s,"ankleFlex")]:20,armFlexL:-15,armFlexR:-15,elbowL:20,elbowR:20,headPitch:-4,spineFlex:-4}),
  caindo:(Q,s)=>Object.assign(Q,{bodyPitch:-35,bodyLift:2,armAbdL:120,armAbdR:110,elbowL:40,elbowR:30,armFlexL:30,hipFlexL:55,kneeFlexL:70,hipFlexR:25,kneeFlexR:40,headPitch:-25,handCurlL:0.1,handCurlR:0.1}),
  /* ===== poses de ginasta / bailarina (pedem o perfil “ginasta”: o manequim passa a ele se estiver abaixo) ===== */
  ponte:(Q,s)=>{gin(Q);Object.assign(Q,{bodyPitch:-90,spineFlex:-40,lumFlex:-20,thoFlex:-10,neckFlex:-20,headPitch:-30,armFlexL:190,armFlexR:190,armAbdL:14,armAbdR:14,hipFlexL:-20,hipFlexR:-20,hipAbdL:10,hipAbdR:10,kneeFlexL:90,kneeFlexR:90});
    aplicarGesto(Q,1,"espalmada");aplicarGesto(Q,-1,"espalmada");apoiarContatos(Q,"maos pes")},
  ponteUmaPerna:(Q,s)=>{POSES_CORPO.ponte(Q,s);Object.assign(Q,{[lad(s,"hipFlex")]:150,[lad(s,"kneeFlex")]:0,[lad(s,"ankleFlex")]:60});apoiarContatos(Q,"maos pe "+(s>0?"direito":"esquerdo"),{girar:false})},
  paradaAbertura:(Q,s)=>{gin(Q);Object.assign(Q,{bodyPitch:180,armFlexL:180,armFlexR:180,armAbdL:10,armAbdR:10,elbowL:0,elbowR:0,spineFlex:-15,headPitch:-35,
    [lad(s,"hipFlex")]:150,[opo(s,"hipFlex")]:-55,kneeFlexL:0,kneeFlexR:0,ankleFlexL:60,ankleFlexR:60});aplicarGesto(Q,1,"espalmada");aplicarGesto(Q,-1,"espalmada");apoiarContatos(Q,"maos",{faixa:40})},
  escorpiao:(Q,s)=>{gin(Q);Object.assign(Q,{bodyPitch:-80,armFlexL:178,armFlexR:178,armAbdL:12,armAbdR:12,elbowL:0,elbowR:0,spineFlex:-55,lumFlex:-30,thoFlex:-15,headPitch:-45,neckFlex:-20,
    hipFlexL:-45,hipFlexR:-35,kneeFlexL:95,kneeFlexR:75,ankleFlexL:55,ankleFlexR:55});aplicarGesto(Q,1,"espalmada");aplicarGesto(Q,-1,"espalmada");apoiarContatos(Q,"maos",{faixa:90})},
  arabesque:(Q,s)=>{gin(Q);Object.assign(Q,{bodyPitch:28,[opo(s,"hipFlex")]:28,[opo(s,"ankleFlex")]:8,[lad(s,"hipFlex")]:-58,[lad(s,"hipRot")]:-25,[lad(s,"ankleFlex")]:60,kneeFlexL:0,kneeFlexR:0,
    spineFlex:-38,lumFlex:-12,headPitch:-18,[opo(s,"armFlex")]:110,[opo(s,"elbow")]:8,[lad(s,"armAbd")]:95,[lad(s,"armFlex")]:-10,[lad(s,"elbow")]:10,handCurlL:0.15,handCurlR:0.15})},
  espacateSaltado:(Q,s)=>{gin(Q);Object.assign(Q,{bodyLift:6,bodyPitch:-6,[lad(s,"hipFlex")]:150,[opo(s,"hipFlex")]:-55,kneeFlexL:0,kneeFlexR:0,ankleFlexL:65,ankleFlexR:65,
    spineFlex:-18,headPitch:-15,[opo(s,"armFlex")]:120,[opo(s,"armAbd")]:20,[lad(s,"armAbd")]:100,[lad(s,"armFlex")]:-5,elbowL:8,elbowR:8,handCurlL:0.15,handCurlR:0.15})},
  camelo:(Q,s)=>{gin(Q);Object.assign(Q,{kneeFlexL:90,kneeFlexR:90,hipFlexL:-15,hipFlexR:-15,ankleFlexL:45,ankleFlexR:45,spineFlex:-50,lumFlex:-25,thoFlex:-15,neckFlex:-20,headPitch:-40,pelvisTilt:-10});
    [1,-1].forEach(t=>maoNoCorpo(Q,t,(ch,pe)=>applyA(pe[t].Cf,[0,-pe[t].A.L2-0.35,-0.45]),{["pron"+(t>0?"L":"R")]:0}))},
  agachamentoProfundo:(Q,s)=>{if(nivelFlex(Q)<1)Q.flex=1;Object.assign(Q,{hipFlexL:128,hipFlexR:128,kneeFlexL:150,kneeFlexR:150,hipAbdL:20,hipAbdR:20,hipRotL:-10,hipRotR:-10,ankleFlexL:-32,ankleFlexR:-32,
    spineFlex:28,headPitch:-22,armFlexL:80,armFlexR:80,elbowL:10,elbowR:10,armAbdL:8,armAbdR:8})},
  prancha:(Q,s)=>{Object.assign(Q,{bodyPitch:90,armFlexL:90,armFlexR:90,elbowL:0,elbowR:0,ankleFlexL:30,ankleFlexR:30,toesL:-60,toesR:-60,headPitch:-20});aplicarGesto(Q,1,"espalmada");aplicarGesto(Q,-1,"espalmada");apoiarContatos(Q,"maos pes")},
  quatroApoios:(Q,s)=>{Object.assign(Q,{bodyPitch:90,armFlexL:90,armFlexR:90,elbowL:0,elbowR:0,hipFlexL:90,hipFlexR:90,kneeFlexL:90,kneeFlexR:90,ankleFlexL:40,ankleFlexR:40,headPitch:-30});
    aplicarGesto(Q,1,"espalmada");aplicarGesto(Q,-1,"espalmada");apoiarContatos(Q,"maos joelhos")},
  meditando:(Q,s)=>{POSES_CORPO.sentadoChao(Q,s);Object.assign(Q,{spineFlex:0,headPitch:4,pronL:-70,pronR:-70,wristL:-15,wristR:-15});
    [1,-1].forEach(t=>maoNoCorpo(Q,t,(ch,pe)=>{const k=pe[t].Cf.T;return [k[0],k[1]+0.75,k[2]]}));aplicarGesto(Q,1,"ok");aplicarGesto(Q,-1,"ok")}
};
/* nomes alternativos (o que alguém escreveria) */
const POSE_ALIAS={"sentada":"sentado","sentado no chão":"sentadoChao","pernas cruzadas":"sentadoChao","deitado":"deitadoCostas","deitado de costas":"deitadoCostas","de costas":"deitadoCostas",
  "deitado de lado":"deitadoLado","de lado":"deitadoLado","de bruços":"deBrucos","bruços":"deBrucos","ajoelhada":"ajoelhado","de joelhos":"ajoelhado","um joelho":"umJoelho","agachado":"agachar",
  "de cócoras":"cocoras","cócoras":"cocoras","correndo":"correndo","correr":"correndo","saltando":"saltando","pulando":"saltando","salto":"saltando","pulo":"saltando","chutando":"chutando","chute":"chutando",
  "socando":"socando","soco":"socando","alongando":"alongando","parada de mão":"paradaDeMao","de cabeça para baixo":"paradaDeMao","engatinhando":"engatinhando","de quatro":"engatinhando",
  "apontando":"apontando","acenando":"acenando","carregando":"carregando","empurrando":"empurrando","pensando":"pensando","encostado":"encostado","caindo":"caindo","meditando":"meditando",
  "em pé":"empe","de pé":"empe","caminhando":"caminhando","andando":"caminhando","abraçando os joelhos":"abracandoJoelhos","sentado nos calcanhares":"sentadoCalcanhares","apoiado nos cotovelos":"apoiadoCotovelos","ponte":"ponte","ponte em uma perna":"ponteUmaPerna","parada com abertura":"paradaAbertura","parada de mão com abertura":"paradaAbertura","escorpião":"escorpiao","arabesque":"arabesque","arabesco":"arabesque","espacate":"espacateSaltado","espacate saltado":"espacateSaltado","salto espacate":"espacateSaltado","camelo":"camelo","agachamento profundo":"agachamentoProfundo","prancha":"prancha","quatro apoios":"quatroApoios"};
function nomePose(k){const t=String(k||"").trim();if(POSES_CORPO[t]||BPOSES[t]||["cintura","cruzar","ombro"].includes(t))return t;const a=POSE_ALIAS[t.toLowerCase()];return a||t}
function todasPoses(){return Object.keys(BPOSES).concat(["cintura","cruzar","ombro"],Object.keys(POSES_CORPO).filter(k=>k!=="maosNaCintura"))}
function doBodyPose(k,opts){
    k=nomePose(k);
    const s=opts&&(opts.lado==="dir"||opts.lado==="direito"||opts.lado===-1)?-1:1;
    if(POSES_CORPO[k]){Object.assign(P,POSE0);POSES_CORPO[k](P,s);limitesAcoplados(P);guardArms();return}
    doBodyPoseBase(k);
}
function doBodyPoseBase(k){
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

export { EXPRESSOES, limitesAcoplados, GUARD, guardArms, FACES, POSTURES, BODIES, POSE0, BPOSES, doBodyPose, POSES_CORPO, POSE_ALIAS, nomePose, todasPoses };
