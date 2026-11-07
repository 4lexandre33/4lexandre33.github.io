/* GeoMannequin — campos de tom: oclusão, meio-tom, sombra própria e luz de borda, com desfoque */
import { HH, HN, HW, RS, SMN, SMO, SMS, hid, hld, hlx, hly, hnl, hz, sm } from "./zbuffer.js";
import { CUR_ID } from "./projecao.js";

/* campos escalares: negativo = dentro da região pintada */
let cov,aoA;
const RIMD=[[1,0],[-1,0],[0,1],[0,-1],[0.7,0.7],[-0.7,0.7],[0.7,-0.7],[-0.7,-0.7]];
let AOD;
let FcRaw,FcTmp,Fc;
let FARaw,FA,FBRaw,FB,FHRaw,FH,FRRaw,FR;
let CelTmp;
function blurPlain(src,dst){
  for(let y=0;y<HH;y++){
    const y0=y>0?y-1:0,y1=y<HH-1?y+1:y;
    for(let x=0;x<HW;x++){
      const x0=x>0?x-1:0,x1=x<HW-1?x+1:x;
      dst[y*HW+x]=(src[y0*HW+x0]+src[y0*HW+x]+src[y0*HW+x1]+src[y*HW+x0]+src[y*HW+x]+src[y*HW+x1]+src[y1*HW+x0]+src[y1*HW+x]+src[y1*HW+x1])/9;
    }
  }
}
function blurMasked(src,dst){
  for(let y=0;y<HH;y++){
    const y0=y>0?y-1:0,y1=y<HH-1?y+1:y;
    for(let x=0;x<HW;x++){
      const k=y*HW+x;
      if(!cov[k]){dst[k]=1;continue}
      const x0=x>0?x-1:0,x1=x<HW-1?x+1:x;
      let s=0,n=0;
      const ks=[y0*HW+x0,y0*HW+x,y0*HW+x1,y*HW+x0,k,y*HW+x1,y1*HW+x0,y1*HW+x,y1*HW+x1];
      for(let q=0;q<9;q++){const j=ks[q];if(cov[j]){s+=src[j];n++}}
      dst[k]=s/n;
    }
  }
}
function borders(F){
  for(let x=0;x<HW;x++){F[x]=1;F[(HH-1)*HW+x]=1}
  for(let y=0;y<HH;y++){F[y*HW]=1;F[y*HW+HW-1]=1}
}
/* cel: tons planos (écorché) — mais desfoque e só a normal suavizada decide o tom, sem ruído do mapa de sombra */
function makeFields(doShade,cel){
  for(let y=0;y<HH;y++)for(let x=0;x<HW;x++){
    const k=y*HW+x;
    if(hz[k]<-1e5||hid[k]!==CUR_ID){cov[k]=0;FcRaw[k]=1;FARaw[k]=1;FBRaw[k]=1;FHRaw[k]=1;FRRaw[k]=1;continue}
    cov[k]=1;FcRaw[k]=-1;
    if(!doShade){FARaw[k]=1;FBRaw[k]=1;FHRaw[k]=1;FRRaw[k]=1;continue}
    const sx=(hlx[k]+SMO)*SMS,sy=(hly[k]+SMO)*SMS,ref=hld[k];
    const ix=Math.floor(sx),iy=Math.floor(sy);
    let lit=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const xx=ix+dx,yy=iy+dy;
      const v=(xx<0||yy<0||xx>=SMN||yy>=SMN)?-9:sm[yy*SMN+xx];
      if(ref>=v-0.12)lit++;
    }
    let occ=0;
    for(const d of AOD){
      const xx=x+d[0],yy=y+d[1];
      if(xx<0||yy<0||xx>=HW||yy>=HH)continue;
      const dd=hz[yy*HW+xx]-hz[k];
      if(dd>0.03)occ+=Math.min(1,(dd-0.03)/0.22);
    }
    const ao=occ/AOD.length;
    const cs=(lit/9-0.5)*2,nl=hnl[k]-0.9*ao;
    FHRaw[k]=Math.min(nl-0.44,cs+0.5);
    /* luz refletida: faixa clara dentro da sombra, junto ao contorno externo */
    let rim=1;
    if(nl<0.02){const R=Math.round(7/RS);for(const d of RIMD){const xx=x+Math.round(d[0]*R),yy=y+Math.round(d[1]*R);if(xx<0||yy<0||xx>=HW||yy>=HH||hz[yy*HW+xx]<-1e5){rim=-1;break}}}
    FRRaw[k]=rim;
    FARaw[k]=Math.min(nl-0.20,cs);
    FBRaw[k]=Math.min(nl-(-0.12),Math.max(nl-0.20,cs));
  }
  blurPlain(FcRaw,FcTmp);blurPlain(FcTmp,Fc);borders(Fc);
  if(doShade){blurMasked(FARaw,FA);blurMasked(FBRaw,FB);blurMasked(FHRaw,FH);blurMasked(FRRaw,FR);
    for(let i=0;i<(cel?3:1);i++){blurMasked(FA,CelTmp);blurMasked(CelTmp,FA);blurMasked(FB,CelTmp);blurMasked(CelTmp,FB)}
    if(!cel){blurMasked(FH,CelTmp);blurMasked(CelTmp,FH)}
    borders(FA);borders(FB);borders(FH);borders(FR)}
}

/* execução inicial deste módulo (na mesma ordem do app original) */
export function iniciarCampos(){
  cov=new Uint8Array(HN);
  aoA=new Float32Array(HN);
  AOD=(()=>{const o=[];for(let i=0;i<8;i++){const a=i/8*2*Math.PI+0.3;for(const r of [Math.round(8/RS),Math.round(18/RS)])o.push([Math.round(Math.cos(a)*r),Math.round(Math.sin(a)*r)])}return o})();
  FcRaw=new Float32Array(HN);
  FcTmp=new Float32Array(HN);
  Fc=new Float32Array(HN);
  FARaw=new Float32Array(HN);
  FA=new Float32Array(HN);
  FBRaw=new Float32Array(HN);
  FB=new Float32Array(HN);
  FHRaw=new Float32Array(HN);
  FH=new Float32Array(HN);
  FRRaw=new Float32Array(HN);
  FR=new Float32Array(HN);
  CelTmp=new Float32Array(HN);
}

export { cov, aoA, RIMD, AOD, FcRaw, FcTmp, Fc, FARaw, FA, FBRaw, FB, FHRaw, FH, FRRaw, FR, blurPlain, blurMasked, borders, makeFields };
