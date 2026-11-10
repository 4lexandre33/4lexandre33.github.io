import {clamp,gauss,smooth} from "./constants.js";
export function facialRelief(y,x,p,S){
  const fat=clamp(p.fat||0,0,1),mus=clamp(p.muscle||0,0,1),fem=clamp(p.fem||0,0,1);
  const ax=Math.abs(x),ey=S.eyeY,my=S.mouthY,t=S.t;
  const smile=clamp(p.smile||0,-1,1),lid=clamp(p.eyeLid||0,0,1),brow=p.brow||0;
  let z=0;
  /* Bordo supraorbital, cavidade ocular e orbicular de pálpebras. */
  z+=(.035+.07*brow)*gauss(y,ey+.15,.080)*gauss(ax,.36,.26);
  z-=.120*gauss(y,ey,.128)*gauss(ax,.35,.16);
  z+=(.028+.022*lid)*gauss(y,ey-.10,.059)*gauss(ax,.36,.12);
  /* Saliência zigomática, bochecha e sulco nasolabial móveis. */
  z+=(.105+.032*fat+.024*smile)*gauss(y,ey-.30,.19)*gauss(ax,.52,.22);
  z+=(.028+.047*mus+.012*fat-.015*fem)*gauss(y,my-.17,.25)*gauss(ax,.58,.21);
  z-=.038*Math.max(0,smile)*gauss(y,my+.13,.12)*gauss(ax,.27,.04);
  /* Frente do nariz volumétrica: raiz, dorso, ponta e asas. */
  z+=(p.nose||.30)*(.62*gauss(y,-.58*t,.24)*gauss(x,0,.085)+
    .70*gauss(y,-.82*t,.10)*gauss(x,0,.11));
  z+=.042*gauss(y,-.93*t,.06)*gauss(ax,.112,.045);
  /* Filtro, volume labial e mento: aparência tridimensional mesmo fechado. */
  z+=.032*gauss(y,my+.060,.042)*gauss(x,0,.075);
  z+=(p.lips||.07)*gauss(y,my+.013,.053)*gauss(x,0,.22);
  z+=.052*gauss(y,S.chinY+.17,.115)*gauss(x,0,.17);
  z-=.025*gauss(y,my-.115,.044)*gauss(x,0,.16);
  return z;
}
