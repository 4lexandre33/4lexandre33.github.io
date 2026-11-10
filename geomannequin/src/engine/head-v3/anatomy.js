/* Head V3: perfil ósseo-construtivo independente de primitivas esféricas.
 * X = lateral, Y = alto, Z = anterior. v=0 vértice, v=1 mento.
 * Cada tabela representa uma família de secções 2D. A interpolação PCHIP
 * preserva extremos e evita espinhos / cintura côncava no temporal. */
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const mix=(a,b,t)=>a+(b-a)*t;
export const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
export const gauss=(x,c,s)=>Math.exp(-.5*((x-c)/Math.max(.0001,s))**2);

/* Largura transversal: calota ampla, lateral parietal contínua, zigoma
 * localizado e mandíbula afunilando SEM estrangulamento acima da orelha. */
export const WIDTH_V3=[
 [0,.008],[.025,.31],[.08,.55],[.15,.73],[.23,.835],[.31,.855],
 [.40,.845],[.48,.835],[.55,.825],[.61,.822],[.65,.83],
 [.70,.79],[.76,.72],[.82,.65],[.88,.57],[.93,.47],[.975,.33],[1,.18]
];
/* Testa: longo plano frontal quase vertical entre brow ridge e calota.
 * O volume facial é mantido estável; nariz/órbitas vêm das microformas. */
export const FRONT_V3=[
 [0,.10],[.025,.39],[.08,.67],[.15,.88],[.24,.985],
 [.33,1.015],[.40,1.02],[.47,1.018],[.53,1.004],[.59,.985],
 [.65,.972],[.71,.943],[.77,.918],[.83,.885],[.89,.895],
 [.94,.916],[.975,.88],[1,.79]
];
/* Occipital: máximo posterior aproximadamente no terço médio, curvatura
 * inferior progressiva no plano sagital; nunca termina em tampo vertical. */
export const BACK_V3=[
 [0,.10],[.025,-.34],[.08,-.65],[.15,-.92],[.24,-1.11],
 [.34,-1.20],[.41,-1.225],[.48,-1.205],[.55,-1.12],
 [.61,-.96],[.67,-.76],[.72,-.57],[.78,-.31],
 [.83,-.08],[.89,.19],[.95,.43],[1,.63]
];

/* Interpolação cúbica monotônica (Fritsch-Butland). Sem overshoot. */
export function spline(knots,t){
 t=clamp(t,0,1);let i=0;
 while(i<knots.length-2&&t>knots[i+1][0])i++;
 const a=knots[i],b=knots[i+1],h=b[0]-a[0],q=clamp((t-a[0])/h,0,1);
 const sec=k=>(knots[k+1][1]-knots[k][1])/(knots[k+1][0]-knots[k][0]);
 const tangent=k=>{
   if(k===0)return sec(0);
   if(k===knots.length-1)return sec(knots.length-2);
   const left=sec(k-1),right=sec(k);
   if(left*right<=0)return 0;
   const h0=knots[k][0]-knots[k-1][0],h1=knots[k+1][0]-knots[k][0],
     w0=2*h1+h0,w1=h1+2*h0;
   return (w0+w1)/(w0/left+w1/right);
 };
 const q2=q*q,q3=q2*q;
 return (2*q3-3*q2+1)*a[1]+(q3-2*q2+q)*h*tangent(i)+(-2*q3+3*q2)*b[1]+(q3-q2)*h*tangent(i+1);
}
export const normalizedHeight=(y,S)=>clamp((1-y)/(1-S.chinY),0,1);
export const yAt=(v,S)=>1-v*(1-S.chinY);
export function sectionV3(v,p,S){
 const fat=clamp(p.fat||0,0,1),fem=clamp(p.fem||0,0,1),
   muscle=clamp(p.muscle||0,0,1);
 const scale=clamp(p.headScale??1,.9,1.1),skull=clamp((p.skull??.82)/.82,.73,1.22);
 const jaw=clamp((p.jaw??.6)/.6,.7,1.4),chin=clamp((p.chin??.27)/.27,.55,1.55);
 const middle=1+.030*fat-.012*fem+.014*muscle,
   jawW=mix(1,jaw,smooth((v-.70)/.16)),
   chinW=mix(1,chin,smooth((v-.91)/.09));
 const width=Math.max(.005,spline(WIDTH_V3,v)*skull*middle*jawW*chinW*scale);
 const front=spline(FRONT_V3,v)*scale*(1+.012*fat)+
   (v>.85?(.80-(p.chinProj??.80))*.58*smooth((v-.85)/.15):0);
 const back=spline(BACK_V3,v)*scale*(v<.79?clamp(p.cranialDepth??1,.90,1.12):1);
 return {width,front,back};
}
