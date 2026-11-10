import {clamp,gauss,PI2} from "./constants.js";
import {ringV2} from "./sections.js";
import {planeAtV2} from "./side-planes.js";
export function earPointV2(p,S,sign,u,v){
  /* A orelha nasce sobre a parte anteroinferior do disco Loomis. */
  const plane=planeAtV2(p,S,sign),scale=S.scale||1,size=p.earSize||1;
  const ey=S.eyeY-.09,ry=.30*size*scale,rz=.145*size*scale;
  const y=ey+ry*v,z=plane.center[2]+.105*scale+rz*u-.042*scale*v;
  const radial=Math.hypot(y-plane.center[1],z-plane.center[2]);
  const [w,cz,depth]=ringV2(y,p,S);
  const q=clamp((z-cz)/(depth||1),-.999,.999);
  const shellX=w*Math.sqrt(Math.max(0,1-q*q));
  const blend=clamp((radial-plane.radius)/plane.fillet,0,1);
  const t=blend*blend*(3-2*blend);
  const base=plane.distance+(shellX-plane.distance)*t;
  const rho=Math.hypot(u,v),helix=.066*gauss(rho,.82,.15)*size;
  const concha=-.025*gauss(rho,.23,.20)*size;
  const lobe=v<-.54?1-.28*clamp((-.54-v)/.46,0,1):1;
  return [sign*(base+.028*scale+.026*(p.earFlare||1)*lobe+helix+concha),y,z];
}
export function buildEarV2(p,S,sign){
  const rows=14,cols=48,V=new Float32Array(rows*cols*3);
  for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
    const r=i/(rows-1),a=j/cols*PI2,pt=earPointV2(p,S,sign,r*Math.cos(a),r*Math.sin(a));
    const o=3*(i*cols+j);V[o]=pt[0];V[o+1]=pt[1];V[o+2]=pt[2];
  }
  return {V,rows,cols,flip:-sign,fb:[sign,0,0]};
}
