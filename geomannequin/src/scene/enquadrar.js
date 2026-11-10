/* GeoMannequin — enquadramento, zoom/distância em perspectiva e altura dos olhos */
import { P, SCN, sceneBB } from "./modelo.js";
import { D, clamp, distToZoom, fitFromBB, restGround, zoomToDist } from "../engine/index.js";

/* calcula zoom/deslocamento para caber o manequim inteiro (camadas visíveis) na tela, com margem */
/* tamanho na tela: sem perspectiva muda o zoom; com perspectiva aproxima ou afasta a câmera (dolly) */
function getZoomEff(){return P.persp?distToZoom(P):P.zoom}
function setZoomEff(z){if(P.persp)P.camDist=+clamp(zoomToDist(P,z),4,200).toFixed(2);else P.zoom=+clamp(z,0.05,12).toFixed(3)}
function autoFit(only){
  /* em perspectiva o contorno muda com a distância: repete até estabilizar */
  for(let it=0;it<(P.persp?3:1);it++){
    const bb=sceneBB(only);if(!(bb[1]>bb[0]))return;
    const fit=fitFromBB(bb,SCN.recorte||undefined);
    if(!fit||!isFinite(fit.zoom))return;
    setZoomEff(fit.zoom);P.panX=fit.panX;P.panY=fit.panY;
    /* poses compactas (agachado, sentado) pediriam a câmera a ~1 m: a perspectiva deforma demais. Mantém ≥ 13 R (≈ 1,5 m) e recentra */
    if(P.persp&&P.camDist<13){P.camDist=13;const b2=sceneBB(only);if(b2[1]>b2[0]){const f2=fitFromBB(b2,SCN.recorte||undefined);P.panX=f2.panX;P.panY=f2.panY}break}
  }
}
/* altura dos olhos (câmera) acima do chão, em R */
function eyeHeight(){const g0=restGround(SCN.list[0].params);return (P.ty-g0)-Math.sin(P.pitch*D)*Math.max(3,P.camDist)}

export { getZoomEff, setZoomEff, autoFit, eyeHeight };
