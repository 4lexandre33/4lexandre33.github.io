/* GeoMannequin · Cabeça V4 — fundação craniofacial independente da V3.
 * Seções 2D (x largura, z anterior/posterior, v altura normalizada).
 * V3 fornece apenas o interpolador PCHIP; nenhuma malha V3 é deformada. */
import {clamp,mix,smooth,gauss,spline,normalizedHeight,yAt} from "../head-v3/anatomy.js";
export {clamp,mix,smooth,gauss,normalizedHeight,yAt};

/* Macrocontorno derivado das folhas de referência: vértice regular,
 * laterais parietais sustentadas, têmpora com transição de plano,
 * arco malar, mandíbula em cunha e mento com base frontal. */
const W=[
 [0,.008],[.025,.29],[.07,.51],[.13,.70],[.20,.785],[.29,.83],
 [.37,.835],[.44,.825],[.51,.813],[.575,.808],[.64,.817],
 [.69,.805],[.735,.769],[.795,.698],[.85,.615],[.91,.50],[.97,.335],[1,.235]
];
const F=[
 [0,.085],[.025,.36],[.07,.64],[.13,.845],[.21,.955],[.30,1.005],
 [.39,1.012],[.475,1.01],[.535,.998],[.59,.973],[.655,.945],
 [.72,.911],[.775,.891],[.835,.863],[.885,.877],[.94,.900],[.975,.862],[1,.78]
];
const B=[
 [0,.08],[.025,-.33],[.07,-.62],[.13,-.89],[.22,-1.10],
 [.32,-1.205],[.40,-1.235],[.49,-1.19],[.57,-1.07],
 [.645,-.865],[.715,-.60],[.79,-.29],[.86,.045],[.92,.31],[1,.62]
];
export const V4_SECTION_KNOTS=Object.freeze({width:W,front:F,back:B});

/* V4.1 — o eixo posterior fica compacto SEM comprimir o rosto.
 * A janela tem derivadas suaves nos extremos e preserva a nuca em v>=.82.
 * O afunilamento da mandíbula começa abaixo das órbitas (v≈.57).
 * A ponta conserva uma seção não nula: quase pontuda, nunca singular. */
export function posteriorReductionV41(v,p){
 const reduction=clamp(p.v41OccipitalReduction??.82,0,1);
 const compact=clamp(p.v41CranialCompactness??.28,0,1);
 const arc=clamp(p.v41PosteriorArcTightness??.55,0,1);
 const window=smooth((v-.04)/.16)*(1-smooth((v-.70)/.14));
 return clamp((.34*reduction+.09*compact+.035*arc*gauss(v,.42,.18))*window,0,.47);
}
export function mandibleTaperV41(v,p){
 const convergence=clamp(p.v41MandibleConvergence??.85,0,1);
 const taper=clamp(p.v41ChinTaper??.82,0,1);
 const pointed=clamp(p.v41ChinPointedness??.80,0,1);
 const a=1-.18*convergence*smooth((v-.57)/.34);
 const b=1-.27*taper*smooth((v-.79)/.21);
 const c=1-.54*pointed*smooth((v-.90)/.10);
 return Math.max(.30,a*b*c);
}
export function sectionV4(v,p,S){
 v=clamp(v,0,1);
 const scale=clamp(p.headScale??1,.9,1.1);
 const fat=clamp(p.fat??0,0,1),fem=clamp(p.fem??0,0,1),muscle=clamp(p.muscle??0,0,1);
 const skull=clamp((p.skull??.82)/.82,.72,1.23);
 const jaw=clamp((p.jaw??.6)/.6,.66,1.44);
 const chin=clamp((p.chin??.27)/.27,.5,1.65);
 const jawFactor=mix(1,jaw,smooth((v-.70)/.16));
 const chinFactor=mix(1,chin,smooth((v-.90)/.10));
 const temporal=clamp(p.v4TemporalPlane??.55,0,1);
 const widthFactor=1+.024*fat-.014*fem+.014*muscle;
 const temporalCut=1-.038*temporal*gauss(v,.48,.16);
 const width=Math.max(.026,spline(W,v)*scale*skull*widthFactor*jawFactor*chinFactor*temporalCut*mandibleTaperV41(v,p));
 const front=spline(F,v)*scale*(1+.012*fat)+
   (v>.88?((p.chinProj??.8)-.8)*.45*smooth((v-.88)/.12):0);
 const backOriginal=spline(B,v)*scale*(v<.79?clamp(p.cranialDepth??1,.90,1.12):1);
 const back=backOriginal<0?backOriginal*(1-posteriorReductionV41(v,p)):backOriginal;
 return {width,front,back};
}
export const profileV4=(y,p,S)=>sectionV4(normalizedHeight(y,S),p,S);
