import {clamp,mix,gauss,smoother} from "./constants.js";
/* Seções do perfil sagital baseadas na abóbada oval/parietal/occipital. */
export function sagittalProfile(y,p,S){
  const t=S.t,chin=S.chinY,yy=clamp(y,chin,1),r=Math.sqrt(Math.max(0,1-yy*yy)),fat=clamp(p.fat||0,0,1);
  const orbit=-t*.66;
  const upperFront=r*(.95-.095*gauss(yy,.45,.26)+.065*gauss(yy,-.10,.22));
  const k=smoother((orbit+.14-yy)/.28);
  const lowerFront=mix(.99,(p.chinProj||.80)*(1-.018*(p.fem||0)),smoother((orbit-yy)/(orbit-chin)));
  const front=mix(upperFront,lowerFront,k);
  const backRoof=r*(1.10+.20*gauss(yy,.15,.35))*(p.cranialDepth||1);
  const taper=smoother((-.38-yy)/(.20));
  const back=mix(backRoof,mix(1.20,.24+.08*fat,smoother((-.48-yy)/(chin+.48)*-1)),taper);
  return {front,back:Math.max(.11,back)};
}
