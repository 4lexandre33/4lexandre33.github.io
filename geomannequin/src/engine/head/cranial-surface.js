import {clamp,gauss,PI2,smooth} from "./constants.js";
import {ringV2} from "./sections.js";
import {facialRelief} from "./face-fields.js";
import {jawPoseV2} from "./jaw-rig.js";
export function pointV2(y,theta,p,S,offset=0){
  const [w,cz,depth]=ringV2(y,p,S),sn=Math.sin(theta),cs=Math.cos(theta);
  const x=w*sn;
  /* Temporal achatada; occipital convexo, frontal de seção comprimida. */
  const lateral=1-.07*gauss(y,.01,.33)*Math.pow(Math.abs(sn),14);
  let z=cz+depth*cs*lateral;
  const front=smooth((cs+.10)/.75);
  z+=front*facialRelief(y,x,p,S);
  const jo=clamp(p.jawOpen||0,0,1),my=S.mouthY;
  if(jo>.01){const gap=.16*Math.pow(jo,.82),cy=my-.46*gap;
    const rr=(x/.23)**2+((y-cy)/(.034+.45*gap))**2;
    z-=.095*jo*front*smooth((1-rr)/.42);
  }
  return jawPoseV2([x+offset*sn,y,z+offset*cs],p,S);
}
export function buildHeadV2(p,S,level=0){
  /* LOD estável pela configuração do usuário, não pela câmera:
     0=baixo, 1=normal, 2=alta definição para close. */
  const density=Math.max(0,Math.min(2,Math.round(p.headDetail===undefined?1:p.headDetail)));
  const cols=[68,112,152][density],rows=[90,142,194][density],total=rows*cols,V=new Float32Array(total*3);
  for(let i=0;i<rows;i++){
    const q=i/(rows-1),y=1+(S.chinY-.015-1)*q;
    for(let j=0;j<cols;j++){
      const theta=j/cols*PI2,k=3*(i*cols+j),pt=pointV2(y,theta,p,S);
      V[k]=pt[0];V[k+1]=pt[1];V[k+2]=pt[2];
    }
  }
  return {V,rows,cols,flip:1,fb:null};
}
