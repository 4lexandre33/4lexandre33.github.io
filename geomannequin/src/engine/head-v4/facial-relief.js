/* V4: microcampos regionais anatômicos sobre a seção 2D.
 * u = sin(longitude), v = 0 topo/1 mento; deslocamentos em unidades do crânio.
 * Cada feição é contínua, simétrica e local. Não são sólidos adicionados à malha.
 * Campos da V3 são reaproveitados como subestrutura de alta frequência. */
import {clamp,gauss,smooth} from "./anatomy.js";
import {compileMicroAtlasV3,sampleMicroV3} from "../head-v3/microfields.js";
const bell=(x,y,cx,cy,sx,sy)=>gauss(x,cx,sx)*gauss(y,cy,sy);
const eyeMask=(u,v,s)=>Math.hypot((u-s*.335)/.205,(v-.535)/.042);
export function facialReliefV4(u,v,p,S,atlas=compileMicroAtlasV3(p,S)){
 const detail=clamp(p.v4Detail??.85,0,1.5),orb=clamp(p.v4OrbitalDepth??1,.4,1.8);
 const malar=clamp(p.v4MalarPlane??.9,.4,1.8);
 const jaw=clamp(p.v4JawPlane??.85,.35,1.7);
 const bridge=clamp(p.v4NasalBridge??1,.35,1.7);
 const oral=clamp(p.v4Mouth??.85,.3,1.7);
 const fat=clamp(p.fat??0,0,1),mus=clamp(p.muscle??0,0,1);
 const brow=clamp((p.brow??.06)/.06,0,2),nose=clamp((p.nose??.24)/.24,.4,1.9);
 const lips=clamp((p.lips??.045)/.045,.4,1.8);
 let f=0,side=0,back=0;
 /* As peças pequenas da V3 permanecem no processo matemático, mas têm
  * peso reduzido para evitar órbitas fundas e bocas pontiagudas. */
 f+=.36*sampleMicroV3(atlas,u,v,"front");
 side+=.35*sampleMicroV3(atlas,u,v,"side");
 back+=.55*sampleMicroV3(atlas,u,v,"back");
 /* Frontal e sobrancelhas: placa frontal e rebordo supraorbital. */
 f+=detail*.018*bell(u,v,0,.38,.76,.19);
 f+=detail*.045*brow*bell(u,v,0,.477,.115,.045); // glabela
 for(const s of [-1,1]){
   const center=s*.335,r=eyeMask(u,v,s);
   /* A cavidade recua, mas é limitada por rebordos. Em perfil a depressão
      interna não deve perfurar a silhueta lateral. */
   f-=detail*.074*orb*bell(u,v,center,.535,.184,.046);
   f+=detail*.047*brow*bell(u,v,center,.465,.228,.039);
   f+=detail*.022*gauss(r,1,.23)*gauss(v,.535,.090);
   f+=detail*.021*bell(u,v,center,.582,.21,.032);
   /* Malar: plano diagonal, saliência suavemente angular sob órbita. */
   f+=detail*(.074+.014*fat)*malar*bell(u,v,s*.55,.659,.228,.078);
   f-=detail*.018*malar*bell(u,v,s*.67,.76,.13,.05);
   /* Sulco nasolabial pequeno, sem formar vala até a mandíbula. */
   f-=detail*.013*bell(u,v,s*.28,.797,.06,.059);
   /* Temporal e gônio: dão planos laterais sem afundar a cabeça. */
   side-=detail*.021*gauss(u,s*.86,.125)*gauss(v,.47,.19);
   side+=detail*(.031+.015*mus)*jaw*bell(u,v,s*.75,.833,.18,.089);
 }
 /* Nariz: três níveis independentes de profundidade. */
 f+=detail*.052*bridge*nose*bell(u,v,0,.605,.108,.058);
 f+=detail*.116*bridge*nose*bell(u,v,0,.690,.088,.072);
 f+=detail*.155*nose*bell(u,v,0,.742,.126,.035);
 for(const s of [-1,1]){
   f+=detail*.050*nose*bell(u,v,s*.160,.765,.061,.026);
   f-=detail*.015*bell(u,v,s*.092,.798,.028,.016);
 }
 /* Região oral: cilindro maxilar leve, lábios em volumes distintos,
  * cantos discretamente recuados e mento em plano frontal. */
 f+=detail*.024*oral*bell(u,v,0,.821,.295,.057);
 f+=detail*.034*oral*lips*bell(u,v,0,.850,.205,.018);
 f-=detail*.014*oral*bell(u,v,0,.867,.22,.009);
 f+=detail*.034*oral*lips*bell(u,v,0,.889,.210,.021);
 f-=detail*.025*oral*bell(u,v,0,.917,.226,.020);
 f+=detail*.061*jaw*bell(u,v,0,.948,.29,.055);
 /* Plano inferior do queixo suavemente recuado. */
 f-=detail*.029*jaw*bell(u,v,0,.982,.28,.033);
 return {
  front:clamp(f,-.13,.30),
  side:clamp(side,-.06,.11),
  back:clamp(back,-.08,.06)
 };
}
