import {clamp,gauss,PI2} from "./constants.js";
import {ringV2} from "./sections.js";
export function earPointV2(p,S,sign,u,v){
  const size=p.earSize||1,k=S.scale||1,ey=S.eyeY-.10;
  const ry=.35*size*k,depth=.15*size*k,y=ey+ry*v;
  const [w,center]=ringV2(y,p,S);
  const r=Math.hypot(u,v),lobe=1-.23*clamp((-v-.53)/.47,0,1);
  const relief=.02+.09*gauss(r,.85,.13)-.042*gauss(r,.25,.24);
  return [sign*(w+.03+.06*(p.earFlare||1)*lobe+relief),y,center-.07+depth*u-.04*v];
}
export function buildEarV2(p,S,sign){
  const rows=14,cols=48,V=new Float32Array(rows*cols*3);
  for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
    const r=i/(rows-1),a=j/cols*PI2,pt=earPointV2(p,S,sign,r*Math.cos(a),r*Math.sin(a));
    const o=3*(i*cols+j);V[o]=pt[0];V[o+1]=pt[1];V[o+2]=pt[2];
  }
  return {V,rows,cols,flip:-sign,fb:[sign,0,0]};
}
