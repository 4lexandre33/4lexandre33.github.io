/* GeoMannequin — valores padrão de todos os parâmetros (DEF), modos de camadas (PRESETS) e estilos de traço */
import { AU_ZERO } from "./rosto-au.js";

const DEF={yaw:0,pitch:0,roll:0,zoom:1,skull:0.82,jaw:0.60,chin:0.27,face:38,chinProj:0.80,cranialDepth:1,headDetail:1,headModel:"v3_microgeometry",blush:0,tears:0,v5Olhos:1.75,v5Boca:1.7,v5Exagero:1,microDensity:1,microStrength:1,v4Detail:.85,v4TemporalPlane:.55,v4OrbitalDepth:1,v4MalarPlane:.9,v4JawPlane:.85,v4NasalBridge:1,v4Mouth:.85,v41OccipitalReduction:.82,v41CranialCompactness:.28,v41PosteriorArcTightness:.55,v41MandibleConvergence:.85,v41ChinTaper:.82,v41ChinPointedness:.80,v41EarSetback:.015,v41EarRelief:1,v41EarTilt:-6,v42OrbitalCavity:.95,v42NapeRoundness:.85,v42EarProjection:.085,sidePlaneDepth:.72,sidePlaneRadius:.73,sidePlaneCenterY:.10,sidePlaneCenterZ:0,sidePlaneBevel:.075,neck:0.63,brow:0.06,nose:0.24,lips:0.045,
  eyeSize:1.25,eyeGap:22,eyeOpen:1.1,headScale:1,browW:0.045,earSize:1,earFlare:1,eyeStyle:1,shW:1.78,shDrop:0.72,lightAz:-44,lightEl:52,headYaw:0,headPitch:0,headRoll:0,neckLen:0.608,chestF:0,adam:0,shElevL:0,shElevR:0,shProtL:0,shProtR:0,shTension:0.3,armAbdL:12,armAbdR:12,armFlexL:0,armFlexR:0,armRotL:0,armRotR:0,elbowL:0,elbowR:0,armLen:1,armThick:1,muscle:0.4,fat:0.2,fem:0,_biotipo:"medio",gluteVol:1,waist:0.93,hips:1.10,thighThick:1,legLen:1,pronL:0,pronR:0,wristL:0,wristR:0,handCurlL:0.3,handCurlR:0.3,spineFlex:0,spineSide:0,spineTwist:0,pelvisTilt:0,pelvisSide:0,pelvisTwist:0,hipFlexL:0,hipFlexR:0,hipAbdL:3,hipAbdR:3,hipRotL:0,hipRotR:0,kneeFlexL:0,kneeFlexR:0,ankleFlexL:0,ankleFlexR:0,ankleTiltL:0,ankleTiltR:0,toesL:0,toesR:0,ground:1,panX:0,panY:0,wx:0,wy:0,wz:0,wRot:0,bodyPitch:0,bodyRoll:0,bodyLift:0,lumFlex:0,lumSide:0,lumTwist:0,thoFlex:0,thoSide:0,thoTwist:0,neckFlex:0,neckSide:0,neckTwist:0,wristDevL:0,wristDevR:0,fThL:0,fInL:0,fMeL:0,fAnL:0,fMiL:0,fThR:0,fInR:0,fMeR:0,fAnR:0,fMiR:0,fSpreadL:0.4,fSpreadR:0.4,thumbOppL:0,thumbOppR:0,halluxL:0,halluxR:0,footAddL:0,footAddR:0,tibiaRotL:0,tibiaRotR:0,shTensL:0,shTensR:0,scapRotL:0,scapRotR:0,jawOpen:0,jawSide:0,smile:0,eyeYaw:0,eyePitch:0,eyeLid:0,browUp:0,browIn:0,fThMcpL:0,fThIpL:0,fThAbdL:0,fInMcpL:0,fInIpL:0,fInAbdL:0,fMeMcpL:0,fMeIpL:0,fMeAbdL:0,fAnMcpL:0,fAnIpL:0,fAnAbdL:0,fMiMcpL:0,fMiIpL:0,fMiAbdL:0,fThMcpR:0,fThIpR:0,fThAbdR:0,fInMcpR:0,fInIpR:0,fInAbdR:0,fMeMcpR:0,fMeIpR:0,fMeAbdR:0,fAnMcpR:0,fAnIpR:0,fAnAbdR:0,fMiMcpR:0,fMiIpR:0,fMiAbdR:0,flex:0,tx:0,ty:0,tz:0,persp:1,camDist:30,lens:50,atmo:0.4};
/* unidades de ação do rosto (por lado): todas em 0 */
Object.assign(DEF,AU_ZERO);
const PRESETS={
  manequim:{sil:1,fill:1,shade:1,sphere:0,planes:0,rings:1,merid:1,jaw:0,feat:1,eyes:1,ears:1,neck:1,torso:1,anat:1,girdle:1,arms:1,hands:1,legs:1,hidden:0,grid:1,prop:1,floor:1,shadow:1,horizon:0,fibras:0,cel:0,ossos:0},
  construcao:{ocultas:0.16,sil:1,fill:1,shade:0,sphere:1,planes:1,rings:1,merid:1,jaw:1,feat:1,eyes:1,ears:1,neck:1,torso:1,anat:1,girdle:1,arms:1,hands:1,legs:1,hidden:1,grid:1,prop:1,floor:1,shadow:1,horizon:1,fibras:0,cel:0,ossos:0},
  /* écorché: anatomia limpa (linhas de músculo com hierarquia, tons planos), sem guias */
  ecorche:{sil:1,fill:1,shade:1,sphere:0,planes:0,rings:0,merid:0,jaw:0,feat:1,eyes:1,ears:1,neck:1,torso:1,anat:1,girdle:0,arms:1,hands:1,legs:1,hidden:0,grid:1,prop:0,floor:1,shadow:1,horizon:0,fibras:0,cel:1,ossos:0}
};
const ST={
  eyeU:{c:"ink",w:2.0},pupil:{c:"ink",w:1},brow:{c:"ink",w:0.7},
  jaw:{c:"ink",w:1.2},anat:{c:"ink",w:1.5},mus:{c:"ink",w:1.0,o:0.8},
  /* hierarquia de traço anatômico: sobreposição firme, divisão interna média, fibras finas */
  dobra:{c:"ink",w:1.8},divisao:{c:"ink",w:0.95,o:0.78},fibra:{c:"ink",w:0.5,o:0.6},gdash:{c:"ink",w:0.9},ext:{c:"cobalt",w:1.0},
  sil:{c:"ink",w:2.4},silN:{c:"ink",w:1.75},silH:{c:"ink",w:1.5},ring:{c:"coral",w:1.1},axis:{c:"coral",w:1.3},jaxis:{c:"coral",w:1.0},
  sphere:{c:"cobalt",w:1.1},plane:{c:"cobalt",w:1.1},feat:{c:"ink",w:1.3},ear:{c:"ink",w:1.4}
};

/* modelos de cabeça: a V3 é a principal e o padrão de manequins novos;
   cenas salvas sem modelo registrado continuam com a V1, que era o padrão quando foram feitas */
const CABECA_PADRAO="v3_microgeometry";
const MODELOS_CABECA=[
  ["v3_microgeometry","Cabeça V3 — principal (microgeometria anatômica)"],
  ["v5_anime","Cabeça V5 — anime/mangá (base V3, olhos e boca grandes)"],
  ["v1","Cabeça V1 — clássica"],
  ["v2","Cabeça V2 — experimental"],
  ["v4_anatomical","Cabeça V4.2 — estudo anatômico"]
];
const APELIDOS_CABECA={v3:"v3_microgeometry",v4:"v4_anatomical",v5:"v5_anime",anime:"v5_anime"};
function normalizarModeloCabeca(v,reserva=CABECA_PADRAO){
  const k=APELIDOS_CABECA[String(v||"").toLowerCase()]||String(v||"").toLowerCase();
  return MODELOS_CABECA.some(([m])=>m===k)?k:reserva;
}

export { DEF, PRESETS, ST, CABECA_PADRAO, MODELOS_CABECA, normalizarModeloCabeca };
