import {ringV2} from "./sections.js";
import {pointV2} from "./cranial-surface.js";
import {clamp} from "./constants.js";
export function noseCurvesV2(p,S){
  const side=sign=>Array.from({length:25},(_,i)=>{
    const q=i/24,y=-.13*S.t-q*.77*S.t;
    const x=sign*(.015+.085*q*q);
    const th=Math.asin(clamp(x/ringV2(y,p,S)[0],-.96,.96));
    return pointV2(y,th,p,S,.022);
  });
  return [side(-1),side(1)];
}
