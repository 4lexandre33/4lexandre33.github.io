/* Landmarks topológicos e cross-contours Asaro/Loomis da cabeça V3.
 * Linhas projetadas NA malha existente, nunca elipses sobrepostas 2D.
 * A anatomia é construtiva, não uma afirmação de exatidão clínica. */
import {clamp,yAt} from './anatomy.js';
const PI=Math.PI,TAU=2*PI;
const lerp=(a,b,t)=>a+(b-a)*t;
const line=(kind,pts,id)=>({kind,pts,id});
const range=(n,fn)=>Array.from({length:n+1},(_,i)=>fn(i/n));
/* Angulação por longitude permite linhas bilaterais ancoradas ao volume. */
export function anatomicalCurvesV3(p,S,point){
 const surface=(v,theta)=>point(yAt(clamp(v,.006,.994),S),theta,p,S,.010),out=[];
 for(const sign of [-1,1]){
  /* Fronteira entre placa frontal da testa e plano parietotemporal. */
  out.push(line('temporal-ridge',range(40,t=>{
   const v=lerp(.17,.53,t),th=sign*(.91+.17*t-.08*Math.sin(PI*t));
   return surface(v,th);
  }),'temporal-'+sign));
  /* Supraorbital -> zigoma -> mandíbula: mudanças de plano de Asaro. */
  out.push(line('brow-ridge',range(25,t=>{
   const v=.465+.020*Math.sin(PI*t),th=sign*lerp(.20,.89,t);
   return surface(v,th);
  }),'brow-'+sign));
  out.push(line('zygomatic',range(35,t=>{
   const v=.615+.095*t+.017*Math.sin(PI*t),th=sign*lerp(.96,1.20,t);
   return surface(v,th);
  }),'zygoma-'+sign));
  /* Gônio: ramo posterior relativamente vertical, corpo em direção ao mento.
   * Interpolação angular contínua para não criar uma linha fraturada. */
  const jaw=[[.665,1.47],[.75,1.43],[.82,1.19],[.90,.70],[.976,.16]];
  out.push(line('mandibular-angle',range(55,t=>{
   const v=lerp(.665,.976,t);let k=0;while(k<jaw.length-2&&v>jaw[k+1][0])k++;
   const f=clamp((v-jaw[k][0])/(jaw[k+1][0]-jaw[k][0]),0,1);
   return surface(v,sign*lerp(jaw[k][1],jaw[k+1][1],f));
  }),'mandibula-'+sign));
  /* Região mastoide posterior à orelha, sobre o osso temporal. */
  out.push(line('mastoid',range(16,t=>
   surface(lerp(.58,.68,t),sign*lerp(1.67,1.92,t))),'mastoide-'+sign));
 }
 /* A base occipital inclina-se anteriormente até a inserção cervical. */
 out.push(line('nuchal-ridge',range(52,t=>{
  const th=lerp(1.72,TAU-1.72,t),v=.635+.022*Math.cos(th-PI);
  return surface(v,th);
 }),'occipital-inferior'));
 /* Plano medial frontal e plano mentoniano estreito. */
 out.push(line('facial-axis',range(70,t=>surface(lerp(.28,.97,t),0)),'eixo-facial'));
 out.push(line('chin-plane',range(18,t=>surface(.956,lerp(-.32,.32,t))),'plano-mento'));
 return out;
}
export function landmarksV3(p,S,point){
 const basis=(v,t)=>point(yAt(v,S),t,p,S,.012);
 const s=sign=>[
  {id:'temporal-'+sign,point:basis(.39,sign*1.10)},
  {id:'supraorbital-'+sign,point:basis(.485,sign*.65)},
  {id:'zygion-'+sign,point:basis(.642,sign*1.12)},
  {id:'gonion-'+sign,point:basis(.82,sign*1.26)},
  {id:'mastoide-'+sign,point:basis(.62,sign*1.75)}
 ];
 return [
  {id:'vertex',point:basis(.015,0)},
  {id:'glabela',point:basis(.48,0)},
  {id:'nasion',point:basis(.565,0)},
  {id:'pronasale',point:basis(.738,0)},
  {id:'subnasale',point:basis(.79,0)},
  {id:'menton',point:basis(.984,0)},
  {id:'occipital',point:basis(.41,PI)},
  ...s(-1),...s(1)
 ];
}
