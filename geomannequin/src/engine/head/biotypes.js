import {clamp} from "./constants.js";
/* NÃO cria segundo cadastro de biotipos: usa p, já calibrado em scene/biotipos.js. */
export function headBiotypeV2(p){
 const fem=clamp(p.fem||0,0,1),fat=clamp(p.fat||0,0,1),mus=clamp(p.muscle||0,0,1);
 return {sex:fem,fat,mus,scale:clamp(p.headScale||1,.9,1.1),
  width:clamp(p.skull||.82,.6,.95),depth:clamp(p.cranialDepth||1,.9,1.12),
  jaw:clamp(p.jaw||.64,.3,.95),chin:p.chin||.28,neck:p.neck||.56,
  planeDepth:clamp(p.sidePlaneDepth??.72,.61,.83),
  planeRadius:clamp(p.sidePlaneRadius??.47,.37,.52)};
}
