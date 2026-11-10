import {clamp,mix,gauss,smoother} from "./constants.js";
/* Seções do perfil sagital baseadas na abóbada oval/parietal/occipital. */
export function sagittalProfile(y,p,S){
  const t=S.t,chin=S.chinY,yy=clamp(y,chin,1),r=Math.sqrt(Math.max(0,1-yy*yy)),fat=clamp(p.fat||0,0,1);
  const orbit=-t*.66;
  const upperFront=r*(.94-.040*gauss(yy,.60,.27)+.045*gauss(yy,-.10,.22))+
    .125*gauss(yy,.39,.27); /* frontal alongado, não testa de esfera */
  const k=smoother((orbit+.14-yy)/.28);
  const lowerFront=mix(.99,(p.chinProj||.80)*(1-.018*(p.fem||0)),smoother((orbit-yy)/(orbit-chin)));
  const front=mix(upperFront,lowerFront,k);
  /* O occipital arredondado acompanha a nuca com tangência contínua,
     em vez de formar o bico anterior na transição cervical. */
  const backRoof=r*(1.10+.185*gauss(yy,.16,.36))*(p.cranialDepth||1);
  const nape=smoother((-.30-yy)/.72);
  const back=mix(backRoof,.64+.05*fat,nape);
  return {front,back:Math.max(.14,back)};
}
