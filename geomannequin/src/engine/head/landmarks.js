import {clamp,mix} from "./constants.js";
import {sidePlanesV2} from "./side-planes.js";
/* Âncoras da folha 3x3: estáveis na pose neutra; diferenças sutis por biotipo. */
export function landmarks(p,S){
  const scale=clamp(p.headScale||1,.9,1.1),fat=clamp(p.fat||0,0,1),fem=clamp(p.fem||0,0,1),mus=clamp(p.muscle||0,0,1);
  const eye=S.eyeY,mid=S.mouthY,chin=S.chinY;
  const jawW=(p.jaw||.64)*scale*(1+.04*mus-.045*fem+.035*fat);
  const side=(p.skull||.82)*scale*(1-.015*fem+.04*fat);
  const loomis=sidePlanesV2(p,S)[1],d=loomis.distance,zc=loomis.center[2];
  const L={
    vertex:[0,1,0],glabella:[0,.09,.98],nasion:[0,-.20,1.05],
    eyeL:[-side*.40,eye,1],eyeR:[side*.40,eye,1],
    orbitL:[-side*.42,eye+.015,1.01],orbitR:[side*.42,eye+.015,1.01],
    zygomaL:[-side*.79,eye-.30,.83],zygomaR:[side*.79,eye-.30,.83],
    noseTip:[0,-.76*S.t,1.30],subnasal:[0,-.97*S.t,1.05],
    mouthL:[-.245*scale,mid,1.04],mouthR:[.245*scale,mid,1.04],
    menton:[0,chin+.03,.87],gonionL:[-jawW,-.48,.12],gonionR:[jawW,-.48,.12],
    tmjL:[-d-.04*scale,eye-.30,zc+.17*scale],
    tmjR:[d+.04*scale,eye-.30,zc+.17*scale],
    mastoidL:[-d,eye-.52,zc-.20*scale],
    mastoidR:[d,eye-.52,zc-.20*scale],
    occipital:[0,.17,-1.22*(p.cranialDepth||1)],c7:[0,chin-.96,-.63]
  };
  return L;
}
