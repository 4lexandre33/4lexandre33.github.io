import {clamp,smooth} from "./constants.js";
import {sidePlanesV2} from "./side-planes.js";
/* A articulação da mandíbula usa ATM bilateral; o campo de influência conserva o neurocrânio. */
export function jawPoseV2(v,p,S){
  const opening=clamp(p.jawOpen||0,0,1),side=clamp(p.jawSide||0,-1,1);
  if(!opening&&!side)return [...v];
  const y=v[1],z=v[2],wY=smooth((S.mouthY+.025-y)/.19),wZ=smooth((z+.36)/.62),w=wY*wZ;
  if(w<1e-7)return [...v];
  /* Pivô comum aos dois côndilos, colocado junto ao quadrante inferior
     anterior do disco, e não no centro arbitrário da cabeça. */
  const plane=sidePlanesV2(p,S)[1],cy=S.eyeY-.30,cz=plane.center[2]+.17*(S.scale||1);
  const angle=opening*.35*w,dy=y-cy,dz=z-cz;
  const sn=Math.sin(angle),cs=Math.cos(angle);
  const translation=.035*opening*w;
  return [v[0]+side*.055*w,cy+dy*cs-dz*sn-translation,cz+dy*sn+dz*cs+translation*.6];
}
/* Posição do ramo mandibular 3D, não a mesma transformação da pele. */
export function jawBoneTransformV2(v,p,S){
  const jawOpen=clamp(p.jawOpen||0,0,1),a=.37*jawOpen;
  const plane=sidePlanesV2(p,S)[1],cy=S.eyeY-.30,cz=plane.center[2]+.17*(S.scale||1);
  const dy=v[1]-cy,dz=v[2]-cz,c=Math.cos(a),s=Math.sin(a);
  return [v[0]+(p.jawSide||0)*.04,cy+dy*c-dz*s-.03*jawOpen,cz+dy*s+dz*c+.017*jawOpen];
}
