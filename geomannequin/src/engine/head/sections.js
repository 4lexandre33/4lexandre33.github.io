import {clamp,mix,gauss,smoother} from "./constants.js";
import {sagittalProfile} from "./profile.js";
export function ringV2(y,p,S){
  const k=clamp(p.headScale||1,.9,1.1),t=S.t,chin=S.chinY,yy=clamp(y,chin,1);
  const fat=clamp(p.fat||0,0,1),fem=clamp(p.fem||0,0,1),mus=clamp(p.muscle||0,0,1);
  const sw=(p.skull||.82)*(1+.035*fat-.015*fem+.012*mus);
  /* Seção superelíptica suave no topo: caixa craniana menos esférica. */
  const r=Math.pow(Math.max(0,1-yy*yy),yy>0?.405:.5);
  const skullWidth=sw*r*(1+.105*gauss(yy,.18,.30)-.083*gauss(yy,-.28,.16));
  const hinge=-.16,lo=-t*.90;
  const wJaw=(p.jaw||.61)*(1+.04*mus+.028*fat-.045*fem);
  const target=yy>lo?mix(skullWidth,wJaw,smoother((hinge-yy)/(hinge-lo))):
    wJaw*Math.sqrt(Math.max(0,1-Math.pow(clamp((lo-yy)/(lo-chin),0,1),2.1)));
  const blend=smoother((hinge+.12-yy)/.24);
  const w=Math.max(.004,mix(skullWidth,target,blend))*k;
  const sagittal=sagittalProfile(yy,p,S),f=sagittal.front,b=sagittal.back;
  return [w,(f-b)*k*.5,(f+b)*k*.5];
}
