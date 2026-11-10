/* Boca anatômica paramétrica: arcadas contínuas, rima labial e língua.
   Unidade: coordenadas locais do crânio. O motor projeta as curvas sobre
   a maxila fixa e mandíbula articulada em cabeca.js.
   As arcadas são formas visuais; não substituem uma tomografia dentária. */
import { clamp } from "./matematica.js";

function bocaForma(p,S){
  const aberto=clamp(Number.isFinite(p.jawOpen)?p.jawOpen:0,0,1);
  const sorriso=clamp(Number.isFinite(p.smile)?p.smile:0,-1,1);
  const width=(0.235+0.012*Math.max(0,sorriso))*(S.scale||1);
  const altura=0.162*Math.pow(aberto,0.85);
  const my=S.mouthY;
  const curva=x=>Math.sqrt(Math.max(0,1-Math.pow(clamp(x/width,-1,1),2)));
  const canto=x=>sorriso*0.035*Math.pow(Math.abs(x/width),1.4);
  const cima=x=>my+canto(x)+0.007*curva(x);
  const baixo=x=>cima(x)-altura*curva(x);
  const labioSup=x=>cima(x)+(0.042+0.003*Math.max(0,sorriso))*curva(x);
  const labioInf=x=>baixo(x)-(0.038+0.008*aberto)*curva(x);
  const denteSup=x=>cima(x)-Math.min(0.05,altura*0.32)*curva(x);
  const denteInf=x=>baixo(x)+Math.min(0.029,altura*0.18)*curva(x);
  const linguaSup=x=>baixo(x)+altura*(0.22+0.20*curva(x))*curva(x);
  const linguaInf=x=>baixo(x)+0.10*altura*curva(x);
  return {aberto,sorriso,width,altura,cima,baixo,labioSup,labioInf,denteSup,denteInf,linguaSup,linguaInf,curva,my};
}
/* A dentição visível forma um arco estreito: oito coroas anteriores sem
   barras verticais longas. Cada coroa tem quatro cantos com leve relevo. */
function arcadas(B,inferior=false){
  const n=8,lim=B.width*0.72,step=2*lim/n;
  return Array.from({length:n},(_,i)=>{
    const a=-lim+i*step+step*0.035,b=-lim+(i+1)*step-step*0.035;
    const sup=inferior?B.denteInf:B.cima,inf=inferior?B.baixo:B.denteSup;
    const y0=x=>inferior?inf(x):sup(x)-0.012*B.curva(x);
    const y1=x=>inferior?sup(x):inf(x);
    const xMid=(a+b)/2;
    return {numero:i+1,lado:inferior?"inferior":"superior",
      pontos:[[a,y0(a)],[b,y0(b)],[b,y1(b)],[xMid,y1(xMid)-0.002*(inferior?-1:1)],[a,y1(a)]]};
  });
}
export { bocaForma, arcadas };
