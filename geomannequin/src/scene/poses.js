/* GeoMannequin — poses rápidas, tipos corporais, rostos, posturas e proteção dos braços */
import { P } from "./modelo.js";
import { BODIES } from "./biotipos.js";
import { faixa } from "./parametros.js";
import { D, ISQUIO, ampliar, nivelFlex, apoiarContatos, aplicarGesto, applyA, armClear, bodyProxies, chainSetup, comp, flatAnkle, handOnHip, ikArm, ikLeg, hipJoint, legClear, legDims, legPose, minAbd, pushOut, shape, AU_KEYS, ESTADO_KEYS } from "../engine/index.js";

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
  /* Rosto não redefine ombros, pescoço nem tecido corporal: isso é do biotipo. */
  feminino:{skull:0.78,jaw:0.56,chin:0.24,chinProj:0.76,brow:0.045,nose:0.2,lips:0.06,eyeSize:1.3,browW:0.04,earSize:0.9,adam:0},
  masculino:{skull:0.86,jaw:0.68,chin:0.34,chinProj:0.84,brow:0.09,nose:0.27,lips:0.04,eyeSize:1.1,browW:0.056,earSize:1.05,adam:1},
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
  /* desconfiança: uma sobrancelha sobe e o outro olho aperta; canto da boca de um lado só */
  desconfianca:{jawOpen:0,jawSide:0.3,smile:-0.3,eyeLid:0.3,browUp:-0.2,browIn:0.5,browOuterL:0.7,browInnerL:0.2,browInnerR:-0.3,lidLoR:0.5,lidUpR:0.15,mouthCornerL:0.3},
  /* piscando: fecha só o olho esquerdo, bochecha do mesmo lado sobe */
  piscando:{jawOpen:0,jawSide:0,smile:0.6,eyeLid:0,browUp:0.1,browIn:0,lidUpL:1,cheekL:0.6,browOuterL:-0.3,mouthCornerL:0.2},
  /* exageradas (a V5 anime as leva ao máximo; nas outras cabeças viram versões contidas) */
  riso:{jawOpen:0.6,jawSide:0,smile:1,eyeLid:0.95,browUp:0.3,browIn:-0.2,blush:0.4,tears:0},
  choro:{jawOpen:0.45,jawSide:0,smile:-0.9,eyeLid:0.4,browUp:0.2,browIn:-1,blush:0.3,tears:1},
  vergonha:{jawOpen:0,jawSide:0.15,smile:0.25,eyeLid:0.3,browUp:0.15,browIn:-0.45,blush:1,tears:0,eyeYaw:0.55,eyePitch:-0.35},
  /* biblioteca nova: montadas com as unidades de ação de cada lado (o que não aparece fica em 0) */
  nojo:{smile:-0.3,browIn:0.5,browUp:-0.2,upperLipL:0.85,upperLipR:0.6,noseWrinkle:0.9,lidLoL:0.5,lidLoR:0.5,cheekL:0.3,cheekR:0.2},
  desprezo:{mouthCornerL:0.9,mouthCornerR:-0.2,browOuterL:0.5,browInnerR:-0.2,eyeLid:0.3,lidLoR:0.3,eyeYaw:0.15},
  determinacao:{browIn:0.6,browUp:-0.3,eyeLid:0.12,lidLoL:0.45,lidLoR:0.45,lipPress:0.7,smile:-0.1},
  malicia:{smile:0.45,mouthCornerL:0.45,mouthCornerR:-0.15,browIn:0.3,browOuterR:0.45,eyeLid:0.35,lidLoL:0.45,lidLoR:0.4,eyeYaw:-0.3},
  confusao:{browIn:0.15,browInnerL:0.6,browOuterL:0.45,browInnerR:-0.35,mouthCornerR:-0.35,jawSide:0.25,smile:-0.1,eyePitch:0.2},
  choque:{jawOpen:0.85,browUp:1,browIn:-0.15,smile:-0.3},
  tedio:{eyeLid:0.55,browUp:-0.15,smile:-0.15,lipPress:0.25,eyePitch:-0.2,eyeYaw:0.35},
  dor:{browIn:0.7,browInnerL:0.5,browInnerR:0.5,eyeLid:0.5,lidLoL:0.7,lidLoR:0.7,cheekL:0.4,cheekR:0.4,teethClench:0.8,noseWrinkle:0.5,upperLipL:0.3,upperLipR:0.3,smile:-0.4},
  cansaco:{eyeLid:0.5,eyeBags:1,browUp:-0.1,browIn:-0.25,smile:-0.2,jawOpen:0.06},
  admiracao:{browUp:0.6,browIn:-0.2,jawOpen:0.22,smile:0.35,blush:0.3},
  culpa:{browIn:-0.6,browUp:0.1,eyeLid:0.35,eyePitch:-0.6,eyeYaw:0.3,smile:-0.4,lipPress:0.4,blush:0.2},
  orgulho:{smile:0.45,mouthCornerL:0.15,eyeLid:0.3,browUp:0.1,lidLoL:0.2,lidLoR:0.2,eyePitch:-0.1},
  pensativo:{browIn:0.2,browInnerL:0.35,eyeYaw:0.5,eyePitch:0.5,pout:0.35,mouthCornerR:-0.2},
  alivio:{smile:0.4,eyeLid:0.45,browIn:-0.3,browUp:0.15,jawOpen:0.08}
};
/* nomes para a interface e a ajuda */
const NOMES_EXPRESSOES={neutra:"Neutra",alegria:"Alegria",riso:"Riso",surpresa:"Surpresa",raiva:"Raiva",tristeza:"Tristeza",choro:"Choro",medo:"Medo",grito:"Grito",
  vergonha:"Vergonha",sono:"Sono",desconfianca:"Desconfiança",piscando:"Piscando",nojo:"Nojo",desprezo:"Desprezo",determinacao:"Determinação",malicia:"Malícia",
  confusao:"Confusão",choque:"Choque",tedio:"Tédio",dor:"Dor",cansaco:"Cansaço",admiracao:"Admiração",culpa:"Culpa",orgulho:"Orgulho",pensativo:"Pensativo",alivio:"Alívio"};
/* toda expressão zera corar, lágrimas e as unidades de ação que não usa, para não herdar da anterior */
const BASE_ROSTO=["jawOpen","jawSide","smile","eyeLid","browUp","browIn","blush","tears",...AU_KEYS,...ESTADO_KEYS];
Object.values(EXPRESSOES).forEach(e=>{for(const k of BASE_ROSTO)if(e[k]===undefined)e[k]=0});
/* nome de expressão sem acento e em minúsculas */
const chaveExpressao=nome=>String(nome||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
/* mistura: pesos {raiva: 0.6, tristeza: 0.4} (ou o texto "60% raiva + 40% tristeza"), intensidade 0..1.5.
   Cada parâmetro é a média ponderada das expressões (o que uma não usa conta como 0) vezes a intensidade;
   o olhar (eyeYaw/eyePitch) só entra se alguma das expressões o define. */
const FAIXA_ROSTO={jawOpen:[0,1],eyeLid:[0,1],blush:[0,1],tears:[0,1]};
/* expressões guardadas pelo usuário (Minhas expressões): rosto-codigo.js registra a busca aqui */
let EXPR_EXTRA=null;
function definirExpressoesExtras(f){EXPR_EXTRA=f}
const fonteExpressao=k=>EXPRESSOES[k]||(EXPR_EXTRA?EXPR_EXTRA(k):null);
function lerPesos(pesos){
  if(typeof pesos==="string"){
    const o={},partes=pesos.split(/[+,;]/).map(t=>t.trim()).filter(Boolean);
    for(const t of partes){const m=/^(?:(\d+(?:[.,]\d+)?)\s*%?\s*)?([^\d%]+?)(?:\s*(\d+(?:[.,]\d+)?)\s*%)?$/.exec(t);
      if(!m)throw new Error("Mistura: não entendi “"+t+"”. Ex.: \"60% raiva + 40% tristeza\".");
      const v=parseFloat((m[1]||m[3]||"100").replace(",","."));o[m[2].trim()]=v}
    pesos=o;
  }
  if(!pesos||typeof pesos!=="object")throw new Error("Mistura: passe {raiva: 0.6, tristeza: 0.4} ou \"60% raiva + 40% tristeza\".");
  const out={};
  for(const [n,v] of Object.entries(pesos)){const k=chaveExpressao(n);if(!fonteExpressao(k))throw new Error("Expressão “"+n+"” não existe. Use: "+Object.keys(EXPRESSOES).join(", ")+".");
    if(typeof v!=="number"||!isFinite(v)||v<0)throw new Error("Peso de “"+n+"” precisa ser um número ≥ 0.");out[k]=(out[k]||0)+v}
  return out;
}
function misturarExpressoes(pesos,intensidade=1){
  const P0=lerPesos(pesos),tot=Object.values(P0).reduce((a,b)=>a+b,0);
  if(!(tot>0))throw new Error("Mistura: algum peso precisa ser maior que 0.");
  const I=Math.max(0,Math.min(1.5,Number.isFinite(intensidade)?intensidade:1)),out={};
  const chaves=new Set(BASE_ROSTO);Object.keys(P0).forEach(n=>Object.keys(fonteExpressao(n)).forEach(k=>chaves.add(k)));
  for(const k of chaves){let v=0;for(const [n,w] of Object.entries(P0))v+=(fonteExpressao(n)[k]||0)*w/tot;
    const [a,b]=FAIXA_ROSTO[k]||(/^(lidUp|lidLo|cheek|upperLip|noseWrinkle|lipPress|pout|teethClench|eyeBags)/.test(k)?[0,1]:[-1,1]);
    out[k]=Math.round(Math.max(a,Math.min(b,v*I))*1000)/1000}
  return out;
}
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
/* luta: base de guarda (pé do lado s à frente, punhos perto do queixo) */
/* os dois pés no chão com o quadril mais baixo: a pose decide ONDE cada pé fica (na horizontal, pelos ângulos);
   aqui o chão "sobe" queda × comprimento da perna e a cinemática inversa dobra as pernas até cada pé encostar.
   Pé com o tornozelo estendido (≥ 15°, calcanhar levantado) continua na ponta. */
function plantarPes(Q,queda,o={}){
  const S=shape(Q),A=legDims(Q),base=Object.assign({},Q,{ground:0,bodyLift:0}),ch=chainSetup(base,S),F=ch.F,perna=A.L1+A.L2;
  const g0=hipJoint(chainSetup(Object.assign({},Q,{ground:0,bodyLift:0,bodyPitch:0,bodyRoll:0}),S).F,1)[1]-perna-A.hA,yChao=g0+queda*perna;
  const ondas=(o.so?[o.so]:[1,-1]);
  ondas.forEach(t=>{
    const L_=t>0?"L":"R",J=applyA(ch.Pel,hipJoint(F,t)),Af=comp(ch.Pel,legPose(base,F,ch,t).foot),f=A.f,cd=(Q["toes"+L_]||0)*D;
    const pts=[[0,-A.hA,-0.42*f],[-t*0.42*f,-A.hA,1.25*f],[t*0.4*f,-A.hA,1.12*f],[-t*0.29*f,-0.47*f-0.48*f*Math.sin(cd)-0.11*f,1.36*f+0.48*f*Math.cos(cd)]].map(v=>applyA(Af,v)[1]);
    const folga=Math.max(0.3,Af.T[1]-Math.min(...pts)),y=yChao+folga,v=J[1]-y,lim=0.97*perna;
    let hx=Af.T[0]-J[0],hz=Af.T[2]-J[2];const h=Math.hypot(hx,hz)||1e-6,hMax=Math.sqrt(Math.max(0,lim*lim-v*v)),hh=Math.min(h,hMax);
    const r=ikLeg(base,S,t,[J[0]+hx/h*hh,y,J[2]+hz/h*hh]);
    Object.assign(Q,{["hipFlex"+L_]:r.hipFlex,["hipAbd"+L_]:r.hipAbd,["hipRot"+L_]:r.hipRot,["kneeFlex"+L_]:r.knee});
    if((Q["ankleFlex"+L_]||0)<15)Q["ankleFlex"+L_]=r.ankle;
  });
  Q.ground=1;Q.bodyLift=0;
}
/* pés em pontos do chão: alvos = {L:[lado, frente], R:[lado, frente]} em comprimentos de perna, medidos a partir do
   centro da pelve (lado + = para fora daquele pé; frente + = para onde o corpo olha); queda = quanto o quadril desce
   (fração da perna). A cinemática inversa resolve quadril e joelho; o pé assenta (ou fica na ponta se ankleFlex ≥ 15). */
/* ponto mais baixo do pé (calcanhar, bola, ponta) no referencial do corpo */
function soleY(q,ch,t){const A=legDims(q),L_=t>0?"L":"R",Af=comp(ch.Pel,legPose(q,ch.F,ch,t).foot),f=A.f,cd=((q["toes"+L_]||0)+(q["hallux"+L_]||0))*D;
  return Math.min(...[[0,-A.hA,-0.42*f],[-t*0.42*f,-A.hA,1.25*f],[t*0.4*f,-A.hA,1.12*f],[-t*0.29*f,-0.47*f-0.48*f*Math.sin(cd)-0.11*f,1.36*f+0.48*f*Math.cos(cd)]].map(v=>applyA(Af,v)[1]))}
function pesEm(Q,alvos,queda,joelho){
  const S=shape(Q),A=legDims(Q),base=Object.assign({},Q,{ground:0,bodyLift:0}),ch=chainSetup(base,S),perna=A.L1+A.L2,C=ch.Pel.T;
  const g0=hipJoint(chainSetup(Object.assign({},Q,{ground:0,bodyLift:0,bodyPitch:0,bodyRoll:0}),S).F,1)[1]-perna-A.hA,yChao=g0+queda*perna;
  for(const [L_,[la,fr]] of Object.entries(alvos)){
    const t=L_==="L"?1:-1,ponta=(Q["ankleFlex"+L_]||0)>=15;let y=yChao+A.hA;
    for(let it=0;it<4;it++){
      const r=ikLeg(base,S,t,[C[0]+t*la*perna,y,C[2]+fr*perna],joelho),v={["hipFlex"+L_]:r.hipFlex,["hipAbd"+L_]:r.hipAbd,["hipRot"+L_]:r.hipRot,["kneeFlex"+L_]:r.knee};
      if(!ponta)v["ankleFlex"+L_]=r.ankle;
      /* dentro da faixa do perfil (assim o código da pose recria exatamente a mesma pose) */
      for(const k in v){const [mn,mx]=faixa(k,Q.flex);v[k]=Math.round(Math.min(mx,Math.max(mn,v[k]))*10)/10}
      Object.assign(Q,v);Object.assign(base,v);
      const erro=soleY(base,chainSetup(base,S),t)-yChao;if(Math.abs(erro)<0.03)break;y-=erro;
    }
  }
  Q.ground=1;Q.bodyLift=0;
}
/* base de cavalo (carga de energia): pés bem afastados lado a lado, joelhos dobrados para fora */
const cavalo=(Q,w,queda)=>pesEm(Q,{L:[w,0.02],R:[w,0.02]},queda,[0.75,0,0.66]);
/* base de luta (referências de mangá): pés afastados ≈ meio corpo, de lado para o alvo, joelhos dobrados (quadril ≈ 85% da altura em pé),
   peso na frente, calcanhar de trás levantado, tronco um pouco à frente e queixo baixo. prof = 0..1 aprofunda (estocada). */
const guardaBase=(Q,s,prof=0)=>{Object.assign(Q,{[opo(s,"ankleFlex")]:18+6*prof,[opo(s,"toes")]:-40,[lad(s,"tibiaRot")]:-6,[opo(s,"tibiaRot")]:20,
  bodyPitch:6+14*prof,pelvisTwist:s*-24,spineTwist:s*-8,spineFlex:12+2*prof,headPitch:-10-18*prof,headYaw:s*14,
  [lad(s,"armFlex")]:62,[lad(s,"armAbd")]:12,[lad(s,"elbow")]:105,[lad(s,"pron")]:-20,[opo(s,"armFlex")]:42,[opo(s,"armAbd")]:14,[opo(s,"elbow")]:135,[opo(s,"pron")]:-10});
  pesEm(Q,{[lad(s,"")]:[0.2,0.36+0.22*prof],[opo(s,"")]:[0.24,-0.6-0.2*prof]},0.17+0.1*prof);return Q};
const punhos=Q=>{aplicarGesto(Q,1,"punho");aplicarGesto(Q,-1,"punho")};
const POSES_CORPO={
  sentado:(Q,s)=>{Object.assign(Q,{hipFlexL:88,hipFlexR:88,kneeFlexL:88,kneeFlexR:84,hipAbdL:6,hipAbdR:8,ankleFlexL:2,ankleFlexR:4,spineFlex:6,pronL:-40,pronR:-40,handCurlL:0.35,handCurlR:0.35,headPitch:4});
    [1,-1].forEach(t=>maoNoCorpo(Q,t,(ch,pe)=>applyA(pe[t].Th,[0,-pe[t].A.L1*0.62,0.62*pe[t].A.k])))},
  sentadoChao:(Q,s)=>Object.assign(Q,{hipFlexL:84,hipFlexR:84,hipAbdL:42,hipAbdR:42,hipRotL:38,hipRotR:38,kneeFlexL:148,kneeFlexR:142,ankleFlexL:20,ankleFlexR:20,ankleTiltL:20,ankleTiltR:20,spineFlex:14,armFlexL:40,armFlexR:40,elbowL:35,elbowR:35,armAbdL:16,armAbdR:16,handCurlL:0.4,handCurlR:0.4,headPitch:6}),
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
  correndo:(Q,s)=>{Object.assign(Q,{bodyPitch:14,[lad(s,"hipFlex")]:82,[lad(s,"kneeFlex")]:105,[lad(s,"ankleFlex")]:14,[opo(s,"ankleFlex")]:30,[opo(s,"toes")]:-40,spineFlex:6,[lad(s,"armFlex")]:-55,[lad(s,"elbow")]:95,[opo(s,"armFlex")]:68,[opo(s,"elbow")]:88,armAbdL:10,armAbdR:10,handCurlL:0.6,handCurlR:0.6,headPitch:-18,spineTwist:s*-12,pelvisTwist:s*10});pesEm(Q,{[opo(s,"")]:[0.06,-0.52]},0.05)},
  impulso:(Q,s)=>Object.assign(Q,{hipFlexL:70,hipFlexR:70,kneeFlexL:85,kneeFlexR:85,ankleFlexL:-12,ankleFlexR:-12,spineFlex:32,armFlexL:-55,armFlexR:-55,elbowL:10,elbowR:10,headPitch:-20}),
  saltando:(Q,s)=>Object.assign(Q,{hipFlexL:35,hipFlexR:28,kneeFlexL:70,kneeFlexR:62,ankleFlexL:35,ankleFlexR:35,toesL:10,toesR:10,armAbdL:150,armAbdR:150,armFlexL:20,armFlexR:20,elbowL:10,elbowR:10,spineFlex:-10,headPitch:-12,handCurlL:0.1,handCurlR:0.1,bodyLift:3.5}),
  aterrissando:(Q,s)=>Object.assign(Q,{hipFlexL:60,hipFlexR:60,kneeFlexL:80,kneeFlexR:80,ankleFlexL:-10,ankleFlexR:-10,spineFlex:25,armFlexL:60,armFlexR:60,armAbdL:30,armAbdR:30,elbowL:20,elbowR:20,headPitch:-10}),
  chutando:(Q,s)=>{Object.assign(Q,{bodyPitch:-12,spineFlex:-2,[lad(s,"hipFlex")]:100,[lad(s,"kneeFlex")]:6,[lad(s,"ankleFlex")]:-12,[lad(s,"hipAbd")]:4,[opo(s,"hipRot")]:24,[opo(s,"ankleFlex")]:0,[lad(s,"armFlex")]:40,[lad(s,"armAbd")]:20,[lad(s,"elbow")]:115,[opo(s,"armFlex")]:-20,[opo(s,"armAbd")]:30,[opo(s,"elbow")]:40,headPitch:14});pesEm(Q,{[opo(s,"")]:[0.1,0.02]},0.05);punhos(Q)},
  socando:(Q,s)=>{guardaBase(Q,s,0.55);Object.assign(Q,{bodyPitch:14,[opo(s,"armFlex")]:100,[opo(s,"armAbd")]:-10,[opo(s,"elbow")]:0,[opo(s,"pron")]:-80,[opo(s,"shProt")]:0.8,[lad(s,"armFlex")]:30,[lad(s,"armAbd")]:20,[lad(s,"elbow")]:120,spineTwist:s*34,pelvisTwist:s*-2,spineFlex:8,headPitch:-22,[opo(s,"ankleFlex")]:26,[opo(s,"toes")]:-45});pesEm(Q,{[lad(s,"")]:[0.2,0.52],[opo(s,"")]:[0.2,-0.76]},0.24);punhos(Q)},
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
    [1,-1].forEach(t=>maoNoCorpo(Q,t,(ch,pe)=>{const k=pe[t].Cf.T;return [k[0],k[1]+0.75,k[2]]}));aplicarGesto(Q,1,"ok");aplicarGesto(Q,-1,"ok")},
  /* ===== luta (referências de golpes de mangá). lado: 1 = esquerdo à frente (guarda canhota invertida), −1 = direito ===== */
  guardaLuta:(Q,s)=>{guardaBase(Q,s);punhos(Q)},
  jab:(Q,s)=>{guardaBase(Q,s,0.35);Object.assign(Q,{bodyPitch:12,[lad(s,"armFlex")]:92,[lad(s,"armAbd")]:-6,[lad(s,"elbow")]:2,[lad(s,"pron")]:-80,[lad(s,"shProt")]:0.7,spineTwist:s*-30,pelvisTwist:s*-25,headYaw:s*20,headRoll:s*6});pesEm(Q,{[lad(s,"")]:[0.2,0.48],[opo(s,"")]:[0.24,-0.74]},0.2);punhos(Q)},
  direto:(Q,s)=>{guardaBase(Q,s,0.7);Object.assign(Q,{bodyPitch:20,[opo(s,"armFlex")]:92,[opo(s,"armAbd")]:-12,[opo(s,"elbow")]:0,[opo(s,"pron")]:-80,[opo(s,"shProt")]:0.8,[lad(s,"armFlex")]:48,[lad(s,"armAbd")]:6,[lad(s,"elbow")]:130,spineTwist:s*30,pelvisTwist:s*-4,spineFlex:10,spineSide:s*-6,headYaw:s*-10,[opo(s,"ankleFlex")]:26,[opo(s,"toes")]:-45,[opo(s,"tibiaRot")]:30});pesEm(Q,{[lad(s,"")]:[0.2,0.56],[opo(s,"")]:[0.18,-0.84]},0.25);punhos(Q)},
  gancho:(Q,s)=>{guardaBase(Q,s,0.35);Object.assign(Q,{bodyPitch:10,[lad(s,"armAbd")]:84,[lad(s,"armFlex")]:24,[lad(s,"elbow")]:92,[lad(s,"armRot")]:0,[lad(s,"pron")]:-60,spineTwist:s*-40,pelvisTwist:s*-25,spineSide:s*8,headYaw:s*24,[lad(s,"ankleFlex")]:18});pesEm(Q,{[lad(s,"")]:[0.24,0.4],[opo(s,"")]:[0.26,-0.68]},0.22);punhos(Q)},
  uppercut:(Q,s)=>{guardaBase(Q,s,0.5);Object.assign(Q,{bodyPitch:8,[opo(s,"armFlex")]:72,[opo(s,"armAbd")]:4,[opo(s,"elbow")]:95,[opo(s,"pron")]:70,[opo(s,"armRot")]:-10,spineTwist:s*24,pelvisTwist:s*-6,spineSide:s*-10,spineFlex:4,headPitch:-14,[opo(s,"ankleFlex")]:24,[opo(s,"toes")]:-45});pesEm(Q,{[lad(s,"")]:[0.24,0.42],[opo(s,"")]:[0.24,-0.6]},0.23);punhos(Q)},
  socoParaCima:(Q,s)=>{Object.assign(Q,{bodyLift:4,[opo(s,"armFlex")]:168,[opo(s,"armAbd")]:6,[opo(s,"elbow")]:6,[opo(s,"pron")]:-20,[lad(s,"armFlex")]:30,[lad(s,"armAbd")]:20,[lad(s,"elbow")]:100,[lad(s,"hipFlex")]:88,[lad(s,"kneeFlex")]:115,[lad(s,"ankleFlex")]:30,[opo(s,"hipFlex")]:6,[opo(s,"kneeFlex")]:22,[opo(s,"ankleFlex")]:42,headPitch:-28,spineFlex:-10,spineSide:s*-10,spineTwist:s*10});punhos(Q)},
  cotovelada:(Q,s)=>{guardaBase(Q,s,0.45);Object.assign(Q,{bodyPitch:16,[opo(s,"armAbd")]:88,[opo(s,"armFlex")]:62,[opo(s,"elbow")]:148,[opo(s,"pron")]:-40,spineTwist:s*36,pelvisTwist:s*-4,spineFlex:10,[opo(s,"ankleFlex")]:24,[opo(s,"toes")]:-45});pesEm(Q,{[lad(s,"")]:[0.22,0.5],[opo(s,"")]:[0.2,-0.78]},0.24);punhos(Q)},
  joelhada:(Q,s)=>{Object.assign(Q,{bodyPitch:-8,spineFlex:10,[lad(s,"hipFlex")]:112,[lad(s,"kneeFlex")]:124,[lad(s,"ankleFlex")]:42,[opo(s,"ankleFlex")]:22,[opo(s,"toes")]:-35,armFlexL:70,armFlexR:70,armAbdL:8,armAbdR:8,elbowL:85,elbowR:85,pronL:-70,pronR:-70,headPitch:8,shProtL:0.5,shProtR:0.5});pesEm(Q,{[opo(s,"")]:[0.1,0.0]},0.04);aplicarGesto(Q,1,"garra");aplicarGesto(Q,-1,"garra")},
  chuteLateral:(Q,s)=>{Object.assign(Q,{flex:Math.max(Q.flex||0,1),bodyRoll:s*46,spineSide:s*-10,headRoll:s*-30,headYaw:s*30,[lad(s,"hipAbd")]:60,[lad(s,"hipFlex")]:20,[lad(s,"hipRot")]:-20,[lad(s,"kneeFlex")]:4,[lad(s,"ankleFlex")]:-14,[opo(s,"hipRot")]:30,[opo(s,"tibiaRot")]:24,[lad(s,"armFlex")]:50,[lad(s,"elbow")]:110,[lad(s,"armAbd")]:24,[opo(s,"armFlex")]:30,[opo(s,"elbow")]:100,[opo(s,"armAbd")]:40});pesEm(Q,{[opo(s,"")]:[0.04,0.0]},0.05);punhos(Q)},
  chuteAlto:(Q,s)=>{Object.assign(Q,{flex:Math.max(Q.flex||0,1),bodyRoll:s*38,spineSide:s*-14,spineTwist:s*-14,pelvisTwist:s*20,[lad(s,"hipFlex")]:58,[lad(s,"hipAbd")]:60,[lad(s,"hipRot")]:-40,[lad(s,"kneeFlex")]:12,[lad(s,"ankleFlex")]:48,[opo(s,"hipRot")]:34,[opo(s,"tibiaRot")]:20,[lad(s,"armFlex")]:-30,[lad(s,"armAbd")]:38,[lad(s,"elbow")]:25,[opo(s,"armFlex")]:62,[opo(s,"armAbd")]:12,[opo(s,"elbow")]:120,headRoll:s*-16,headYaw:s*20});pesEm(Q,{[opo(s,"")]:[0.06,0.0]},0.05);punhos(Q)},
  chuteGiratorio:(Q,s)=>{Object.assign(Q,{bodyPitch:52,[lad(s,"hipFlex")]:-30,[lad(s,"hipAbd")]:8,[lad(s,"kneeFlex")]:0,[lad(s,"ankleFlex")]:-8,[opo(s,"hipFlex")]:55,[opo(s,"kneeFlex")]:18,[opo(s,"ankleFlex")]:-8,headPitch:-48,headYaw:s*40,spineTwist:s*15,armFlexL:60,armFlexR:60,elbowL:115,elbowR:115,armAbdL:20,armAbdR:20});punhos(Q)},
  chuteVoador:(Q,s)=>{Object.assign(Q,{bodyLift:6,bodyPitch:-18,[lad(s,"hipFlex")]:88,[lad(s,"kneeFlex")]:0,[lad(s,"ankleFlex")]:22,[opo(s,"hipFlex")]:95,[opo(s,"kneeFlex")]:135,[opo(s,"ankleFlex")]:35,[lad(s,"armFlex")]:-35,[lad(s,"armAbd")]:45,[lad(s,"elbow")]:30,[opo(s,"armFlex")]:62,[opo(s,"elbow")]:105,headPitch:10,spineFlex:12});punhos(Q)},
  rasteira:(Q,s)=>{Object.assign(Q,{[opo(s,"hipFlex")]:112,[opo(s,"kneeFlex")]:145,[opo(s,"hipAbd")]:22,[opo(s,"ankleFlex")]:-22,[lad(s,"hipAbd")]:45,[lad(s,"hipFlex")]:35,[lad(s,"hipRot")]:-30,[lad(s,"kneeFlex")]:0,[lad(s,"ankleFlex")]:-10,spineFlex:38,spineTwist:s*-20,headPitch:-26,[opo(s,"armFlex")]:62,[opo(s,"armAbd")]:12,[opo(s,"elbow")]:0,[opo(s,"wrist")]:-70,[lad(s,"armFlex")]:45,[lad(s,"armAbd")]:45,[lad(s,"elbow")]:30});aplicarGesto(Q,-s,"espalmada");Q[opo(s,"wrist")]=-70},
  palma:(Q,s)=>{guardaBase(Q,s,0.7);Object.assign(Q,{bodyPitch:20,[opo(s,"armFlex")]:90,[opo(s,"armAbd")]:-8,[opo(s,"elbow")]:0,[opo(s,"pron")]:-80,[opo(s,"wrist")]:-70,[opo(s,"shProt")]:0.8,[lad(s,"armFlex")]:44,[lad(s,"elbow")]:130,spineTwist:s*28,pelvisTwist:s*-4,spineFlex:10,[opo(s,"ankleFlex")]:26,[opo(s,"toes")]:-45});pesEm(Q,{[lad(s,"")]:[0.2,0.56],[opo(s,"")]:[0.18,-0.84]},0.25);aplicarGesto(Q,s,"punho");aplicarGesto(Q,-s,"espalmada");Q[opo(s,"wrist")]=-70},
  palmaDupla:(Q,s)=>{Object.assign(Q,{armFlexL:86,armFlexR:86,armAbdL:-12,armAbdR:-12,elbowL:6,elbowR:6,pronL:-80,pronR:-80,[lad(s,"ankleFlex")]:0,[opo(s,"ankleFlex")]:24,[opo(s,"toes")]:-45,[opo(s,"tibiaRot")]:24,bodyPitch:18,pelvisTwist:s*-18,spineTwist:s*14,spineFlex:8,headPitch:-30,shProtL:0.7,shProtR:0.7});pesEm(Q,{[lad(s,"")]:[0.26,0.6],[opo(s,"")]:[0.26,-0.84]},0.3);aplicarGesto(Q,1,"espalmada");aplicarGesto(Q,-1,"espalmada");Q.wristL=-70;Q.wristR=-70},
  defesaCruzada:(Q,s)=>{Object.assign(Q,{armFlexL:80,armFlexR:80,armAbdL:-38,armAbdR:-34,elbowL:100,elbowR:104,pronL:-10,pronR:-10,spineFlex:24,headPitch:22,shElevL:0.4,shElevR:0.4,shProtL:0.5,shProtR:0.5,hipRotL:14,hipRotR:14});pesEm(Q,{L:[0.32,0.12],R:[0.32,-0.12]},0.24);punhos(Q)},
  aterrissagemHeroi:(Q,s)=>{Object.assign(Q,{[lad(s,"hipFlex")]:92,[lad(s,"kneeFlex")]:118,[lad(s,"ankleFlex")]:-14,[lad(s,"hipAbd")]:14,[opo(s,"hipFlex")]:-4,[opo(s,"kneeFlex")]:118,[opo(s,"ankleFlex")]:18,[opo(s,"toes")]:-50,spineFlex:42,headPitch:-38,[opo(s,"armFlex")]:28,[opo(s,"armAbd")]:6,[opo(s,"elbow")]:0,[lad(s,"armAbd")]:62,[lad(s,"armFlex")]:-38,[lad(s,"elbow")]:18});aplicarGesto(Q,-s,"punho");aplicarGesto(Q,s,"aberta")},
  investida:(Q,s)=>{Object.assign(Q,{bodyPitch:34,[lad(s,"hipFlex")]:92,[lad(s,"kneeFlex")]:105,[lad(s,"ankleFlex")]:10,[opo(s,"hipFlex")]:-28,[opo(s,"kneeFlex")]:25,[opo(s,"ankleFlex")]:35,[opo(s,"toes")]:-45,armFlexL:-58,armFlexR:-58,armAbdL:14,armAbdR:14,elbowL:4,elbowR:4,pronL:-60,pronR:-60,headPitch:-38,spineFlex:6});aplicarGesto(Q,1,"espalmada");aplicarGesto(Q,-1,"espalmada")},
  esquiva:(Q,s)=>{guardaBase(Q,s,0.3);Object.assign(Q,{bodyPitch:14,spineFlex:22,spineSide:s*-20,spineTwist:s*14,headPitch:-14,headRoll:s*-10,[lad(s,"armFlex")]:70,[lad(s,"elbow")]:120,[opo(s,"armFlex")]:62,[opo(s,"elbow")]:130});pesEm(Q,{[lad(s,"")]:[0.3,0.38],[opo(s,"")]:[0.26,-0.5]},0.28);punhos(Q)},
  provocando:(Q,s)=>{guardaBase(Q,s);Object.assign(Q,{[lad(s,"armFlex")]:62,[lad(s,"armAbd")]:6,[lad(s,"elbow")]:55,[lad(s,"pron")]:80,[lad(s,"wrist")]:20,headPitch:-6});aplicarGesto(Q,s,"garra");aplicarGesto(Q,-s,"punho")},
  /* ===== reação a golpes e quedas ===== */
  golpeRosto:(Q,s)=>{Object.assign(Q,{headPitch:-48,neckFlex:-25,headYaw:s*26,headRoll:s*-12,spineFlex:-26,spineTwist:s*-18,spineSide:s*8,bodyPitch:-14,armAbdL:78,armAbdR:56,armFlexL:30,armFlexR:-24,elbowL:46,elbowR:22,handCurlL:0.15,handCurlR:0.15,[opo(s,"ankleFlex")]:0,[lad(s,"ankleFlex")]:20,[lad(s,"toes")]:-30});pesEm(Q,{[lad(s,"")]:[0.18,0.28],[opo(s,"")]:[0.22,-0.34]},0.16)},
  golpeEstomago:(Q,s)=>{Object.assign(Q,{bodyPitch:20,spineFlex:48,thoFlex:12,headPitch:-22,armFlexL:52,armFlexR:48,armAbdL:-32,armAbdR:-28,elbowL:112,elbowR:105,pronL:-20,pronR:-20,handCurlL:0.55,handCurlR:0.55,[opo(s,"ankleFlex")]:24,[opo(s,"toes")]:-30});pesEm(Q,{[lad(s,"")]:[0.18,0.14],[opo(s,"")]:[0.18,-0.18]},0.2)},
  arremessadoCostas:(Q,s)=>Object.assign(Q,{bodyPitch:-62,bodyLift:5,spineFlex:30,headPitch:28,armFlexL:62,armFlexR:48,armAbdL:42,armAbdR:30,elbowL:30,elbowR:42,hipFlexL:62,hipFlexR:40,kneeFlexL:42,kneeFlexR:24,ankleFlexL:30,ankleFlexR:30,handCurlL:0.2,handCurlR:0.2}),
  girandoNoAr:(Q,s)=>Object.assign(Q,{bodyPitch:-130,bodyRoll:s*30,bodyLift:6,spineFlex:30,armAbdL:120,armAbdR:92,elbowL:40,elbowR:28,hipFlexL:72,hipFlexR:32,kneeFlexL:92,kneeFlexR:42,headPitch:30,handCurlL:0.2,handCurlR:0.2}),
  deCabecaParaBaixo:(Q,s)=>Object.assign(Q,{bodyPitch:158,bodyLift:7,armFlexL:150,armFlexR:140,armAbdL:20,armAbdR:28,elbowL:15,elbowR:25,hipAbdL:28,hipAbdR:18,kneeFlexL:32,kneeFlexR:62,hipFlexL:10,hipFlexR:35,spineFlex:-12,headPitch:-30,handCurlL:0.1,handCurlR:0.1}),
  rolando:(Q,s)=>Object.assign(Q,{bodyRoll:s*80,spineFlex:66,headPitch:40,hipFlexL:122,hipFlexR:118,kneeFlexL:142,kneeFlexR:140,armFlexL:78,armFlexR:78,armAbdL:-15,armAbdR:-15,elbowL:110,elbowR:110,handCurlL:0.6,handCurlR:0.6}),
  deslizandoSentado:(Q,s)=>{Object.assign(Q,{hipFlexL:90,hipFlexR:84,kneeFlexL:8,kneeFlexR:52,ankleFlexL:-10,ankleFlexR:12,spineFlex:-14,bodyPitch:-24,armFlexL:-48,armFlexR:-48,armAbdL:24,armAbdR:24,elbowL:8,elbowR:8,headPitch:12,headYaw:s*-20});aplicarGesto(Q,1,"espalmada");aplicarGesto(Q,-1,"espalmada");Q.wristL=-70;Q.wristR=-70},
  estatelado:(Q,s)=>Object.assign(Q,{bodyPitch:-90,armAbdL:112,armAbdR:78,elbowL:32,elbowR:12,hipAbdL:28,hipAbdR:18,kneeFlexL:22,kneeFlexR:0,ankleFlexL:30,ankleFlexR:25,headRoll:s*28,headYaw:s*20,handCurlL:0.35,handCurlR:0.35}),
  levantandoDeQuatro:(Q,s)=>{POSES_CORPO.umJoelho(Q,s);Object.assign(Q,{spineFlex:48,headPitch:-28,[lad(s,"armFlex")]:62,[lad(s,"armAbd")]:-8,[lad(s,"elbow")]:42,[opo(s,"armFlex")]:42,[opo(s,"armAbd")]:8,[opo(s,"elbow")]:0});aplicarGesto(Q,-s,"espalmada");Q[opo(s,"wrist")]=-70},
  atordoado:(Q,s)=>{Object.assign(Q,{spineFlex:18,spineSide:s*14,pelvisSide:s*-8,headRoll:s*30,headPitch:22,armAbdL:16,armAbdR:12,elbowL:26,elbowR:18,handCurlL:0.45,handCurlR:0.45,shElevL:-0.4,shElevR:-0.4,[opo(s,"ankleFlex")]:18,[lad(s,"ankleTilt")]:12});pesEm(Q,{[lad(s,"")]:[0.24,0.08],[opo(s,"")]:[0.12,-0.14]},0.13,[0.2,0,1])},
  recuando:(Q,s)=>{Object.assign(Q,{[opo(s,"ankleFlex")]:22,[opo(s,"toes")]:-35,spineFlex:-16,bodyPitch:-10,armFlexL:76,armFlexR:66,armAbdL:-8,armAbdR:-4,elbowL:100,elbowR:92,pronL:-80,pronR:-80,headPitch:8,headYaw:s*-12});pesEm(Q,{[lad(s,"")]:[0.18,0.34],[opo(s,"")]:[0.22,-0.46]},0.16);aplicarGesto(Q,1,"espalmada");aplicarGesto(Q,-1,"espalmada");Q.wristL=-55;Q.wristR=-55},
  ajoelhadoFerido:(Q,s)=>{POSES_CORPO.ajoelhado(Q,s);Object.assign(Q,{spineFlex:32,headPitch:26,headRoll:s*10,[lad(s,"armFlex")]:48,[lad(s,"armAbd")]:-36,[lad(s,"elbow")]:122,[lad(s,"pron")]:-20,[lad(s,"handCurl")]:0.5,[opo(s,"armFlex")]:30,[opo(s,"armAbd")]:6,[opo(s,"elbow")]:0});aplicarGesto(Q,-s,"espalmada");Q[opo(s,"wrist")]=-70},
  atravessandoParede:(Q,s)=>Object.assign(Q,{bodyPitch:-78,bodyLift:5,hipFlexL:82,hipFlexR:74,kneeFlexL:92,kneeFlexR:80,armFlexL:82,armFlexR:72,armAbdL:20,armAbdR:28,elbowL:22,elbowR:35,headPitch:30,spineFlex:22,handCurlL:0.2,handCurlR:0.2}),
  caindoDeCostas:(Q,s)=>Object.assign(Q,{bodyPitch:-52,bodyLift:1.6,hipFlexL:82,hipFlexR:58,kneeFlexL:30,kneeFlexR:52,armAbdL:100,armAbdR:92,armFlexL:-28,armFlexR:-20,elbowL:20,elbowR:26,headPitch:26,spineFlex:12,handCurlL:0.2,handCurlR:0.2}),
  /* ===== carga de energia / poder ===== */
  lotusFlutuando:(Q,s)=>{POSES_CORPO.meditando(Q,s);Q.bodyLift=3.2;Q.ground=1},
  baseGritando:(Q,s)=>{Object.assign(Q,{armAbdL:40,armAbdR:40,armFlexL:12,armFlexR:12,elbowL:80,elbowR:80,armRotL:-34,armRotR:-34,pronL:-40,pronR:-40,shElevL:0.5,shElevR:0.5,shProtL:-0.3,shProtR:-0.3,spineFlex:-12,headPitch:-30});cavalo(Q,0.42,0.3);punhos(Q)},
  agachadoCerrando:(Q,s)=>{Object.assign(Q,{hipFlexL:90,hipFlexR:90,kneeFlexL:112,kneeFlexR:112,hipAbdL:26,hipAbdR:26,ankleFlexL:-16,ankleFlexR:-16,spineFlex:28,headPitch:-8,armFlexL:32,armFlexR:32,armAbdL:16,armAbdR:16,elbowL:112,elbowR:112,pronL:-30,pronR:-30,shProtL:0.4,shProtR:0.4,shElevL:0.3,shElevR:0.3});punhos(Q)},
  bracosAbertosLevitando:(Q,s)=>{Object.assign(Q,{bodyLift:3,armAbdL:72,armAbdR:72,armFlexL:22,armFlexR:22,elbowL:18,elbowR:18,pronL:80,pronR:80,wristL:-18,wristR:-18,headPitch:-26,spineFlex:-8,hipFlexL:12,hipFlexR:4,kneeFlexL:28,kneeFlexR:14,ankleFlexL:42,ankleFlexR:42});aplicarGesto(Q,1,"aberta");aplicarGesto(Q,-1,"aberta")},
  maosEmPrece:(Q,s)=>{Object.assign(Q,{headPitch:16});cavalo(Q,0.2,0.06);
    [1,-1].forEach(t=>maoNoCorpo(Q,t,ch=>applyA(ch.A2,[t*0.18,ch.F.yJ-1.7,ch.F.zT+1.35]),{["pron"+(t>0?"L":"R")]:0,["wrist"+(t>0?"L":"R")]:-55}));aplicarGesto(Q,1,"espalmada");aplicarGesto(Q,-1,"espalmada");Q.wristL=-55;Q.wristR=-55},
  bracosCruzadosPeito:(Q,s)=>{Object.assign(Q,{spineFlex:18,headPitch:12,shProtL:0.5,shProtR:0.5});cavalo(Q,0.34,0.2);
    [1,-1].forEach(t=>maoNoCorpo(Q,t,ch=>applyA(ch.A2,[-t*(ch.F.W-0.45),ch.F.yAc-0.2+(t>0?0.25:0),ch.F.zT+0.95+(t>0?0.35:0)]),{["pron"+(t>0?"L":"R")]:-10}));punhos(Q)},
  joelhoMaoNoChao:(Q,s)=>{POSES_CORPO.umJoelho(Q,s);Object.assign(Q,{spineFlex:34,headPitch:28,[opo(s,"armFlex")]:32,[opo(s,"armAbd")]:8,[opo(s,"elbow")]:0,[lad(s,"armFlex")]:48,[lad(s,"elbow")]:52});aplicarGesto(Q,-s,"espalmada");Q[opo(s,"wrist")]=-70;aplicarGesto(Q,s,"punho")},
  esferaDeLado:(Q,s)=>{Object.assign(Q,{bodyPitch:6,[opo(s,"ankleFlex")]:16,[opo(s,"toes")]:-35,spineTwist:s*-40,pelvisTwist:s*-25,spineFlex:14,spineSide:s*6,headYaw:s*40,headPitch:-8});pesEm(Q,{[lad(s,"")]:[0.3,0.42],[opo(s,"")]:[0.3,-0.56]},0.27,[0.45,0,0.9]);
    /* as duas mãos em concha junto ao quadril de trás, uma em cima da outra */
    [1,-1].forEach(t=>maoNoCorpo(Q,t,(ch,pe)=>{const b=pe[-s].Th.T;return [b[0]-s*1.15,b[1]+0.9+(t===-s?0.55:-0.35),b[2]+0.75]},{["pron"+(t>0?"L":"R")]:t===-s?-70:70}));aplicarGesto(Q,1,"garra");aplicarGesto(Q,-1,"garra")},
  bracoAosCeus:(Q,s)=>{Object.assign(Q,{[lad(s,"armAbd")]:168,[lad(s,"armFlex")]:12,[lad(s,"elbow")]:6,[opo(s,"armAbd")]:30,[opo(s,"armFlex")]:-4,[opo(s,"elbow")]:100,[opo(s,"armRot")]:-28,[opo(s,"pron")]:-30,headPitch:-36,spineFlex:-10,spineSide:s*-8});cavalo(Q,0.3,0.15);punhos(Q)},
  concentrando:(Q,s)=>{Object.assign(Q,{armAbdL:30,armAbdR:30,armFlexL:-4,armFlexR:-4,elbowL:100,elbowR:100,armRotL:-28,armRotR:-28,pronL:-30,pronR:-30,shElevL:0.35,shElevR:0.35,spineFlex:4,headPitch:18,shProtL:-0.2,shProtR:-0.2});cavalo(Q,0.3,0.18);punhos(Q)},
  cargaDuasMaos:(Q,s)=>{Object.assign(Q,{armAbdL:162,armAbdR:162,armFlexL:28,armFlexR:28,elbowL:16,elbowR:16,wristL:-30,wristR:-30,headPitch:-38,spineFlex:-12});cavalo(Q,0.3,0.1);aplicarGesto(Q,1,"aberta");aplicarGesto(Q,-1,"aberta")},
  /* ===== parkour / ambiente ===== */
  saltoSobreCaixa:(Q,s)=>{Object.assign(Q,{bodyLift:4,bodyRoll:s*-24,[lad(s,"armAbd")]:22,[lad(s,"armFlex")]:24,[lad(s,"elbow")]:0,[lad(s,"wrist")]:-70,[opo(s,"armAbd")]:82,[opo(s,"elbow")]:22,hipFlexL:82,hipFlexR:72,kneeFlexL:96,kneeFlexR:104,[opo(s,"hipAbd")]:28,[lad(s,"hipAbd")]:-12,headYaw:s*-20,spineSide:s*10});aplicarGesto(Q,s,"espalmada");Q[lad(s,"wrist")]=-70},
  subindoDegrau:(Q,s)=>Object.assign(Q,{[lad(s,"hipFlex")]:98,[lad(s,"kneeFlex")]:104,[lad(s,"ankleFlex")]:-6,[opo(s,"hipFlex")]:-12,[opo(s,"kneeFlex")]:6,[opo(s,"ankleFlex")]:34,[opo(s,"toes")]:-45,spineFlex:30,headPitch:-22,[lad(s,"armFlex")]:-34,[lad(s,"elbow")]:60,[opo(s,"armFlex")]:62,[opo(s,"elbow")]:62,handCurlL:0.55,handCurlR:0.55,ground:1}),
  saltoLongo:(Q,s)=>Object.assign(Q,{bodyLift:5,hipFlexL:98,hipFlexR:94,kneeFlexL:32,kneeFlexR:38,ankleFlexL:-5,ankleFlexR:-5,armFlexL:92,armFlexR:88,elbowL:12,elbowR:16,spineFlex:36,headPitch:-24,handCurlL:0.2,handCurlR:0.2}),
  desviando:(Q,s)=>Object.assign(Q,{[lad(s,"hipAbd")]:40,[lad(s,"hipFlex")]:32,[lad(s,"kneeFlex")]:72,[opo(s,"hipAbd")]:30,[opo(s,"kneeFlex")]:0,[opo(s,"ankleTilt")]:20,spineSide:s*-16,spineFlex:14,[opo(s,"armAbd")]:132,[opo(s,"elbow")]:96,[opo(s,"armFlex")]:30,[lad(s,"armAbd")]:52,[lad(s,"elbow")]:24,headPitch:-16,headYaw:s*-22,handCurlL:0.35,handCurlR:0.35}),
  escalando:(Q,s)=>{Object.assign(Q,{[opo(s,"armAbd")]:164,[opo(s,"armFlex")]:30,[opo(s,"elbow")]:6,[lad(s,"armFlex")]:58,[lad(s,"elbow")]:92,[lad(s,"hipFlex")]:92,[lad(s,"kneeFlex")]:102,[opo(s,"ankleFlex")]:38,[opo(s,"toes")]:-40,spineFlex:-6,headPitch:-40});aplicarGesto(Q,-s,"garra");aplicarGesto(Q,s,"garra")},
  vitoria:(Q,s)=>{Object.assign(Q,{[lad(s,"armAbd")]:150,[lad(s,"armFlex")]:24,[lad(s,"elbow")]:34,[opo(s,"armAbd")]:14,[opo(s,"elbow")]:22,headPitch:-22,spineFlex:-10,pelvisSide:s*-6,[opo(s,"hipFlex")]:6});punhos(Q)}
};
/* nomes alternativos (o que alguém escreveria) */
const POSE_ALIAS={"sentada":"sentado","sentado no chão":"sentadoChao","pernas cruzadas":"sentadoChao","deitado":"deitadoCostas","deitado de costas":"deitadoCostas","de costas":"deitadoCostas",
  "deitado de lado":"deitadoLado","de lado":"deitadoLado","de bruços":"deBrucos","bruços":"deBrucos","ajoelhada":"ajoelhado","de joelhos":"ajoelhado","um joelho":"umJoelho","agachado":"agachar",
  "de cócoras":"cocoras","cócoras":"cocoras","correndo":"correndo","correr":"correndo","saltando":"saltando","pulando":"saltando","salto":"saltando","pulo":"saltando","chutando":"chutando","chute":"chutando",
  "socando":"socando","soco":"socando","alongando":"alongando","parada de mão":"paradaDeMao","de cabeça para baixo":"paradaDeMao","engatinhando":"engatinhando","de quatro":"engatinhando",
  "apontando":"apontando","acenando":"acenando","carregando":"carregando","empurrando":"empurrando","pensando":"pensando","encostado":"encostado","caindo":"caindo","meditando":"meditando",
  "em pé":"empe","de pé":"empe","caminhando":"caminhando","andando":"caminhando","abraçando os joelhos":"abracandoJoelhos","sentado nos calcanhares":"sentadoCalcanhares","apoiado nos cotovelos":"apoiadoCotovelos","ponte":"ponte","ponte em uma perna":"ponteUmaPerna","parada com abertura":"paradaAbertura","parada de mão com abertura":"paradaAbertura","escorpião":"escorpiao","arabesque":"arabesque","arabesco":"arabesque","espacate":"espacateSaltado","espacate saltado":"espacateSaltado","salto espacate":"espacateSaltado","camelo":"camelo","agachamento profundo":"agachamentoProfundo","prancha":"prancha","quatro apoios":"quatroApoios"};
/* grupos da biblioteca (lista do app, manual para IA) */
const POSE_GRUPOS={
  "Em pé e gestos":["empe","contrapposto","caminhando","frente","torcao","passo","joelho","ponta","erguido","alcancar","lateral","cintura","cruzar","ombro","apontando","acenando","carregando","empurrando","pensando","encostado","alongando","vitoria"],
  "Sentado, ajoelhado e no chão":["agachar","sentado","sentadoChao","pernasEsticadas","abracandoJoelhos","deitadoCostas","deitadoLado","deBrucos","apoiadoCotovelos","ajoelhado","sentadoCalcanhares","umJoelho","cocoras","engatinhando","meditando","agachamentoProfundo","prancha","quatroApoios"],
  "Movimento":["correndo","impulso","saltando","aterrissando","caindo","saltoLongo","saltoSobreCaixa","subindoDegrau","desviando","escalando"],
  "Luta":["guardaLuta","jab","direto","gancho","uppercut","socando","socoParaCima","cotovelada","joelhada","chutando","chuteLateral","chuteAlto","chuteGiratorio","chuteVoador","rasteira","palma","palmaDupla","defesaCruzada","aterrissagemHeroi","investida","esquiva","provocando"],
  "Reação a golpe e queda":["golpeRosto","golpeEstomago","recuando","atordoado","arremessadoCostas","atravessandoParede","girandoNoAr","deCabecaParaBaixo","caindoDeCostas","rolando","deslizandoSentado","estatelado","levantandoDeQuatro","ajoelhadoFerido"],
  "Carga de energia / poder":["concentrando","baseGritando","agachadoCerrando","bracosCruzadosPeito","maosEmPrece","esferaDeLado","palmaDupla","bracoAosCeus","cargaDuasMaos","bracosAbertosLevitando","lotusFlutuando","joelhoMaoNoChao"],
  "Ginástica e flexibilidade":["paradaDeMao","ponte","ponteUmaPerna","paradaAbertura","escorpiao","arabesque","espacateSaltado","camelo"]
};
Object.assign(POSE_ALIAS,{"guarda":"guardaLuta","guarda de luta":"guardaLuta","soco direto":"direto","cruzado":"direto","soco de direita":"direto","gancho":"gancho","uppercut":"uppercut","soco para cima":"socoParaCima","soco voador":"socoParaCima",
  "cotovelada":"cotovelada","joelhada":"joelhada","chute lateral":"chuteLateral","chute alto":"chuteAlto","chute circular":"chuteAlto","chute giratório":"chuteGiratorio","chute de costas":"chuteGiratorio","voadora":"chuteVoador","chute voador":"chuteVoador","rasteira":"rasteira",
  "palma":"palma","golpe de palma":"palma","palma dupla":"palmaDupla","kamehameha":"palmaDupla","rajada":"palmaDupla","defesa":"defesaCruzada","defesa cruzada":"defesaCruzada","pouso de herói":"aterrissagemHeroi","aterrissagem de herói":"aterrissagemHeroi","investida":"investida","corrida ninja":"investida","esquiva":"esquiva","provocando":"provocando",
  "levando soco":"golpeRosto","soco no rosto":"golpeRosto","golpe no estômago":"golpeEstomago","dobrado de dor":"golpeEstomago","arremessado":"arremessadoCostas","voando para trás":"arremessadoCostas","girando no ar":"girandoNoAr","de cabeça para baixo caindo":"deCabecaParaBaixo",
  "rolando":"rolando","deslizando":"deslizandoSentado","estatelado":"estatelado","levantando":"levantandoDeQuatro","atordoado":"atordoado","tonto":"atordoado","recuando":"recuando","ajoelhado ferido":"ajoelhadoFerido","atravessando a parede":"atravessandoParede","caindo de costas":"caindoDeCostas",
  "flutuando":"lotusFlutuando","lótus flutuando":"lotusFlutuando","gritando":"baseGritando","carregando energia":"baseGritando","power up":"baseGritando","cerrando os punhos":"agachadoCerrando","braços abertos":"bracosAbertosLevitando","levitando":"bracosAbertosLevitando","prece":"maosEmPrece","mãos em prece":"maosEmPrece",
  "braços cruzados":"bracosCruzadosPeito","joelho e mão no chão":"joelhoMaoNoChao","esfera de lado":"esferaDeLado","braço aos céus":"bracoAosCeus","punho para o céu":"bracoAosCeus","concentrando":"concentrando","genki dama":"cargaDuasMaos","esfera acima da cabeça":"cargaDuasMaos",
  "salto sobre a caixa":"saltoSobreCaixa","subindo degrau":"subindoDegrau","salto longo":"saltoLongo","desviando":"desviando","escalando":"escalando","vitória":"vitoria","comemorando":"vitoria"});
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

export { BASE_ROSTO, definirExpressoesExtras, POSE_GRUPOS, EXPRESSOES, NOMES_EXPRESSOES, misturarExpressoes, chaveExpressao, limitesAcoplados, GUARD, guardArms, FACES, POSTURES, BODIES, POSE0, BPOSES, doBodyPose, POSES_CORPO, POSE_ALIAS, nomePose, todasPoses };
