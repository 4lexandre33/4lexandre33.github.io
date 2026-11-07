/* GeoMannequin — câmera: matriz de rotação (yaw, pitch, roll e giro no mundo) */
import { D } from "./matematica.js";

function makeXf(p){
  const wr=(p.wRot||0)*D,cw=Math.cos(wr),sw=Math.sin(wr);
  const cy=Math.cos(p.yaw*D),sy=Math.sin(p.yaw*D);
  const cp=Math.cos(p.pitch*D),sp=Math.sin(p.pitch*D);
  const cr=Math.cos(p.roll*D),sr=Math.sin(p.roll*D);
  return v=>{
    const vx=v[0]*cw+v[2]*sw,vz=-v[0]*sw+v[2]*cw;
    const x1=vx*cy+vz*sy, z1=-vx*sy+vz*cy;
    const y2=v[1]*cp+z1*sp,  z2=-v[1]*sp+z1*cp;
    return [x1*cr-y2*sr, x1*sr+y2*cr, z2];
  };
}

export { makeXf };
