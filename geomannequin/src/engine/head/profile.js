import {clamp,mix,gauss,smoother} from "./constants.js";
/* Perfil sagital. A testa tem um segmento reto tangente ao teto craniano;
 * o occipital é um ARCO no plano y,z, não uma esfera colada na nuca.
 * A transição inferior é uma Hermite C1: sem bicos ou quinas no pescoço. */
const hermite=(u,v0,v1,m0,m1,h)=>{
 const t=clamp(u,0,1),t2=t*t,t3=t2*t;
 return (2*t3-3*t2+1)*v0+(t3-2*t2+t)*h*m0+(-2*t3+3*t2)*v1+(t3-t2)*h*m1;
};
export function sagittalProfile(y,p,S){
 const t=S.t,chin=S.chinY,yy=clamp(y,chin,1),fat=clamp(p.fat||0,0,1);
 const r=Math.sqrt(Math.max(0,1-yy*yy));
 const organicFront=r*(.94-.04*gauss(yy,.60,.27)+.045*gauss(yy,-.10,.22))+
   .125*gauss(yy,.39,.27);
 /* Testa linear em y=.20..67; encontro tangente com arco superior. */
 const roofStart=.67,foreheadZ=1.035,foreheadSlope=-.035;
 const straight=foreheadZ+foreheadSlope*(yy-.17);
 let upperFront=mix(organicFront,straight,smoother((yy-.045)/.155));
 if(yy>roofStart){
   const u=clamp((yy-roofStart)/(1-roofStart),0,1);
   const atRoof=foreheadZ+foreheadSlope*(roofStart-.17);
   upperFront=Math.max(0,(atRoof+foreheadSlope*(yy-roofStart))*
     Math.sqrt(Math.max(0,1-u*u)));
 }
 const orbit=-t*.66;
 const k=smoother((orbit+.14-yy)/.28);
 const lowerFront=mix(.99,(p.chinProj||.80)*(1-.018*(p.fem||0)),
   smoother((orbit-yy)/(orbit-chin)));
 const front=mix(upperFront,lowerFront,k);
 /* Arco posterior elíptico no perfil, controlado independentemente da
    largura craniolateral. Hermite liga o arco à base da nuca com C1. */
 const cy=.14,ry=.86,join=-.28,rad=1.245*(p.cranialDepth||1);
 const arc=q=>rad*Math.sqrt(Math.max(0,1-((q-cy)/ry)**2));
 const arcSlope=q=>-rad*(q-cy)/(ry*ry*
   Math.sqrt(Math.max(1e-8,1-((q-cy)/ry)**2)));
 let back;
 if(yy>=join)back=arc(yy);
 else {
   const bottom=.62+.05*fat,y0=chin,y1=join,h=y1-y0;
   back=hermite((yy-y0)/h,bottom,arc(join),.04,arcSlope(join),h);
 }
 return {front:Math.max(0,front),back:Math.max(0,back)};
}
