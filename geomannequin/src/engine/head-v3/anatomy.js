/* Cabeça V3: seções anatômicas definidas por splines 2D independentes.
 * Coordenadas do motor: x=lateral, y=vertical, z=anterior.
 * v=(1-y)/(1-chinY), do vértice ao mento. NÃO parte de uma esfera. */
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const mix=(a,b,t)=>a+(b-a)*t;
export const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
export const gauss=(x,c,s)=>Math.exp(-0.5*((x-c)/Math.max(.0001,s))**2);
const WIDTH=[[0,.003],[.025,.34],[.08,.56],[.15,.75],[.24,.87],[.33,.86],[.40,.81],[.48,.76],[.54,.73],[.62,.78],[.70,.72],[.76,.63],[.83,.55],[.90,.46],[.96,.33],[1,.008]];
const FRONT=[[0,.12],[.025,.47],[.08,.74],[.15,.92],[.24,.99],[.33,1.01],[.40,1.02],[.48,.97],[.54,.88],[.62,.85],[.70,.89],[.76,.90],[.83,.87],[.90,.87],[.96,.84],[1,.78]];
const BACK=[[0,.10],[.025,-.39],[.08,-.69],[.15,-.94],[.24,-1.12],[.33,-1.21],[.40,-1.23],[.48,-1.14],[.54,-1.0],[.62,-.74],[.70,-.36],[.76,-.10],[.83,.14],[.90,.30],[.96,.53],[1,.72]];
/* Hermite cúbico com derivadas limitadas: não cria bicos entre as seções. */
export function spline(knots,t){
 t=clamp(t,0,1);let i=0;
 while(i<knots.length-2&&t>knots[i+1][0])i++;
 const a=knots[i],b=knots[i+1],h=b[0]-a[0],q=clamp((t-a[0])/h,0,1);
 const sec=k=>(knots[k+1][1]-knots[k][1])/(knots[k+1][0]-knots[k][0]);
 const tangent=k=>{
   if(k===0)return sec(0);if(k===knots.length-1)return sec(knots.length-2);
   const left=sec(k-1),right=sec(k);
   if(left*right<=0)return 0;
   const h0=knots[k][0]-knots[k-1][0],h1=knots[k+1][0]-knots[k][0];
   const w0=2*h1+h0,w1=h1+2*h0;
   return (w0+w1)/(w0/left+w1/right);
 };
 const q2=q*q,q3=q2*q;
 return (2*q3-3*q2+1)*a[1]+(q3-2*q2+q)*h*tangent(i)+(-2*q3+3*q2)*b[1]+(q3-q2)*h*tangent(i+1);
}
export const normalizedHeight=(y,S)=>clamp((1-y)/(1-S.chinY),0,1);
export const yAt=(v,S)=>1-v*(1-S.chinY);
export function sectionV3(v,p,S){
 const fat=clamp(p.fat||0,0,1),fem=clamp(p.fem||0,0,1),muscle=clamp(p.muscle||0,0,1);
 const scale=clamp(p.headScale||1,.9,1.1),skull=clamp((p.skull||.82)/.82,.73,1.22);
 const jaw=clamp((p.jaw||.6)/.6,.7,1.4),chin=clamp((p.chin||.27)/.27,.55,1.55);
 const middle=1+.034*fat-.013*fem+.014*muscle;
 const jawW=mix(1,jaw,smooth((v-.70)/.17));
 const chinW=mix(1,chin,smooth((v-.90)/.10));
 const width=Math.max(.002,spline(WIDTH,v)*skull*middle*jawW*chinW*scale);
 const front=spline(FRONT,v)*scale*(1+.015*fat)+
   (v>.82?(.80-(p.chinProj||.80))*-.75*smooth((v-.82)/.18):0);
 const rear=spline(BACK,v)*scale*(v<.81?clamp(p.cranialDepth||1,.9,1.12):1);
 return {width,front,back:rear};
}
