/* GeoMannequin — desenho de um manequim: monta, projeta, sombreia e gera o SVG */
import { LD, LWK, MULTI, PAN, PERSP, SPAN, camPt, camQ, effScale, proj, setLWK, setLight, setPAN, setPERSP, setSPAN } from "./projecao.js";
import { makeXf } from "./camera.js";
import { getMeshes, makeMat } from "./montagem.js";
import { earSurf, headPt, ringAt, shape } from "./cabeca.js";
import { bocaForma, arcadas } from "./boca.js";
import { olhosAnime, feicoesAnime } from "./head-v5/anime.js";
import { ladoRosto, rostoGeral } from "./rosto-au.js";
import { chainSetup, legPose } from "./cadeia.js";
import { BASE, CX, CY, D, H, W, applyA, clamp, comp, f1, gauss, lerp, mmul, mv, rotM } from "./matematica.js";
import { contourPath, fillPath, silhouette } from "./contornos.js";
import { armDims, armJoint, armPose, armRadius, foreR } from "./bracos.js";
import { bandMesh } from "./malhas.js";
import { atlasPerna } from "./atlas/pernas.js";
import { suavizarSvg } from "./curvas.js";
import { suave } from "./atlas/util.js";
import { ossosDoCorpo } from "./esqueleto.js";
import { SMN, SMO, hid, hz, raster, rasterH, rasterS, setSMO, setSMS, sm, visAt, zb } from "./zbuffer.js";
import { restGround } from "./cena.js";
import { FS, FSRaw, shadowMesh } from "./sombra.js";
import { FA, FB, FH, FK, FR, Fc, blurPlain, makeFields } from "./campos.js";
import { calfR, legDims, linhaDedao, quadrosGluteo, thighR } from "./pernas.js";
import { ST } from "./padroes.js";
import { bustLocal, bustTh, bustTw, pesoGluteo, shoulderWarp } from "./tronco.js";
import { muscleDefs } from "./musculos.js";
import { scapTri } from "./corpo.js";
import { atlasTronco, linhaParaPele } from "./atlas/tronco.js";
import { atlasBraco } from "./atlas/bracos.js";
import { atlasRosto } from "./atlas/rosto.js";
import { isoCurvesV2, lipCurvesV2, sideBorderV2 } from "./head/index.js";
import { isoCurvesV3, constructionCurvesV3, anatomicalCurvesV3, earPointV3, headV3Enabled } from "./head-v3/index.js";
import { isoCurvesV4, constructionCurvesV4, anatomicalCurvesV4, earPointV4, earCurvesV41 } from "./head-v4/index.js";

/* malhas de outros manequins que fazem sombra neste (cena em camadas): entram só no mapa de sombra */
let CASTERS=[];
function setCasters(v){return CASTERS=v||[]}
function scene(p,L,pal,fast,mode){
  setLight(p.lightAz,p.lightEl);
  /* tamanho do corpo (criança, gigante): escala tudo em volta do ponto do chão sob o manequim (os pés continuam no chão) */
  const TK=clamp(p.tamanho||1,0.4,1.6);
  {const cam=makeXf(Object.assign({},p,{wRot:0})),T=cam([(p.wx||0)-(p.tx||0),(p.wy||0)-(p.ty||0)+(TK!==1?(1-TK)*restGround(p):0),(p.wz||0)-(p.tz||0)]);setPAN(T);setSPAN([p.panX,p.panY]);setPERSP(p.persp?Math.max(3,p.camDist||20):0)}
  const S=effScale(p),xr0=makeXf(p),xv0=TK===1?xr0:v=>xr0([v[0]*TK,v[1]*TK,v[2]*TK]),xv=v=>camPt(xv0(v)),Mx=TK===1?makeMat(p):makeMat(p).map(c=>c.map(x=>x*TK)),sh=shape(p),M=getMeshes(p,sh);
  /* perspectiva: o manequim mais longe tem linhas mais finas e menos guias */
  {const qz=xv0([0,-5.5,-0.4])[2]+PAN[2],wc=PERSP>0?PERSP/Math.max(0.2*PERSP,PERSP-qz):1,hp=S*wc*14;
   setLWK(PERSP>0?clamp(Math.pow(wc,0.6),0.45,1.2):1);
   if(hp<200)L=Object.assign({},L,{girdle:0,rings:0,merid:0,prop:0,sphere:0,planes:0});
   if(hp<120)L=Object.assign({},L,{anat:0,hidden:0})}
  const ch=chainSetup(p,sh),F=ch.F,tab=ch.tab,A3=ch.A3,A2=ch.A2;
  M.head.tf=[A3];M.earL.tf=[A3];M.earR.tf=[A3];M.bust.tf=tab;M.bust.tq=quadrosGluteo(p,F,ch);
  const xf=v=>xv(applyA(A3,v));
  const xfd=v=>xv0(mv(A3.M,v));
  const head=proj(M.head,Mx,S),bust=L.torso?proj(M.bust,Mx,S):null;
  const arms=[],legs=[],handles=[];
  if(L.torso&&L.arms)[-1,1].forEach((s,i)=>{
    const ap=armPose(p,F,s),Aa=comp(A2,ap.arm),Af=comp(A2,ap.fore),Ah=comp(A2,ap.hand),Ae=comp(A2,ap.elbow),n=s>0?"L":"R";
    const am=M["arm"+n];am.tf=[Aa];const a=proj(am,Mx,S);
    /* antebraço: a torção (pronação/supinação) cresce do cotovelo até o punho, linha a linha */
    const fm=M["fore"+n],Ad=armDims(p),u0=-0.31*Ad.k,u1=Ad.L2+0.18*Ad.k,rt=[];
    for(let r=0;r<fm.rows;r++){const u=lerp(u0,u1,r/(fm.rows-1)),t=clamp(u/Ad.L2,0,1);rt.push(comp(A2,{M:mmul(ap.Mb,rotM(ap.pr*t,0,0)),T:ap.fore.T}))}
    fm.tf=rt;const f=proj(fm,Mx,S);
    const em=M["elb"+n];em.tf=[Ae];const el=proj(em,Mx,S);
    const dm=M["delt"+n];dm.tf=[Aa];const d=proj(dm,Mx,S);
    const hs=L.hands?M["hand"+i].map(m=>{m.tf=[Ah];return proj(m,Mx,S)}):[];
    /* axila: peitoral (frente) e grande dorsal (atrás) ligam o tronco ao braço e esticam quando o braço sobe */
    const fw=mv(A2.M,[0,0,1]),k=Ad.k,mid=(P,Q,o)=>[0,1,2].map(i=>(P[i]+Q[i])/2+o[i]);
    /* peitoral → braço: começa escondido dentro do tórax e entra no braço por baixo do deltoide anterior (parede da frente da axila) */
    const pa=applyA(A2,[s*0.32,F.yJ-0.88,-0.22]),pb=applyA(Aa,[-s*0.1,-0.82,0.08]);
    /* grande dorsal: nasce mais baixo e por fora no tronco e entra mais longe no braço — com o braço erguido a parede de trás da axila fica uma curva contínua */
    const ab0=Math.max(s>0?p.armAbdL:p.armAbdR,s>0?p.armFlexL:p.armFlexR),er=clamp((ab0-70)/90,0,1);
    const la=applyA(A2,[s*(0.55+0.1*er),F.yJ-1.35-0.4*er,-0.5+0.02*er]),lb=applyA(Aa,[-s*0.06,-0.62-0.3*er,-0.1-0.02*er]);
    /* músculo esticado fica mais fino */
    const thin=(P,Q,L0)=>Math.pow(clamp(L0/Math.hypot(P[0]-Q[0],P[1]-Q[1],P[2]-Q[2]),0.62,1),0.8);
    const tp=thin(pa,pb,1.3),tl=thin(la,lb,1.25);
    /* Pontes axilares estreitas e tangentes suaves: desaparecem os recortes
       triangulares artificiais sob o deltoide em poses de braço elevado. */
    const soft=1-0.12*(p.fem||0);
    const pec=proj(bandMesh(pa,pb,mid(pa,pb,fw.map(c=>c*0.02)),0.29*k*tp*soft,0.17*k*tp*soft,fw,0.2),Mx,S);
    const lat=proj(bandMesh(la,lb,mid(la,lb,fw.map(c=>-c*0.12)),(0.32+0.06*er)*k*tl*soft,(0.23+0.06*er)*k*tl*soft,fw,0.2),Mx,S);
    arms.push({s,a,f,el,d,ap,Aa,Af,Ah,Ae,hs,pec,lat});
    const wp=Ah.T,ws=xv(wp),ep=Af.T,es=xv(ep);
    handles.push({k:"wrist",s,P:wp,x:CX+S*ws[0],y:CY-S*ws[1]});
    handles.push({k:"elbow",s,P:ep,x:CX+S*es[0],y:CY-S*es[1]});
  });
  if(L.torso&&L.legs)[-1,1].forEach(s=>{
    const lp=legPose(p,F,ch,s),n=s>0?"L":"R";
    const Ath=comp(ch.Pel,lp.thigh),Akn=comp(ch.Pel,lp.knee),Acf=comp(ch.Pel,lp.calf),Aft=comp(ch.Pel,lp.foot);
    const pj=(m,A)=>{m.tf=[A];return proj(m,Mx,S)};
    const t=pj(M["thigh"+n],Ath),kn=pj(M["knee"+n],Akn),c=pj(M["calf"+n],Acf),an=pj(M["ankle"+n],Acf),ft=pj(M["foot"+n],Aft);
    const toes=M["toes"+n].map(m=>pj(m,Aft));
    legs.push({s,t,kn,c,an,ft,toes,Ath,Akn,Acf,Aft});
    const kp=Acf.T,ap2=Aft.T,ks=xv(kp),as2=xv(ap2);
    handles.push({k:"knee",s,P:kp,x:CX+S*ks[0],y:CY-S*ks[1]});
    handles.push({k:"ankle",s,P:ap2,x:CX+S*as2[0],y:CY-S*as2[1]});
  });
  {const hc=xv(applyA(A3,[0,0,0]));handles.push({k:"head",s:0,P:applyA(A3,[0,0,0]),x:CX+S*hc[0],y:CY-S*hc[1]})}
  const ears=L.ears?[proj(M.earL,Mx,S),proj(M.earR,Mx,S)]:[];
  const v2Extra=p.headModel==="v2"?(M.headV2Parts||[]).map(q=>{
    q.mesh.tf=[A3];return {kind:q.kind,mesh:proj(q.mesh,Mx,S)};
  }):[];
  const all=[head,...v2Extra.map(q=>q.mesh)];if(bust)all.push(bust);arms.forEach(o=>{all.push(o.a,o.f,o.el,o.d,o.pec,o.lat);o.hs.forEach(h=>all.push(h))});legs.forEach(o=>{all.push(o.t,o.kn,o.c,o.an,o.ft);o.toes.forEach(m=>all.push(m))});ears.forEach(e=>all.push(e));
  /* só as malhas projetadas: este manequim vai apenas fazer sombra na camada de outro */
  if(mode==="malhas")return {all};
  const lanc=mode==="camada"?CASTERS:[];
  if(!MULTI){let mx=1;all.concat(lanc).forEach(m=>{const n=m.LX.length;for(let i=0;i<n;i+=3){const a=Math.abs(m.LX[i]),b=Math.abs(m.LY[i]);if(a>mx)mx=a;if(b>mx)mx=b}});setSMO(mx+0.3);setSMS(SMN/(2*SMO))}
  /* caixa delimitadora em espaço de câmera (independente de zoom/pan) para o ajuste automático de distância */
  let bbX0=1e9,bbX1=-1e9,bbY0=1e9,bbY1=-1e9;
  all.forEach(m=>{const X=m.X,Y=m.Y,n=X.length;for(let i=0;i<n;i++){const x=X[i],y=Y[i];if(x<bbX0)bbX0=x;if(x>bbX1)bbX1=x;if(y<bbY0)bbY0=y;if(y>bbY1)bbY1=y}});
  const MX=40,MY=26,cXr=(bbX0+bbX1)/2-SPAN[0],cYr=(bbY0+bbY1)/2-SPAN[1],wCam=Math.max(0.05,bbX1-bbX0),hCam=Math.max(0.05,bbY1-bbY0);
  const Sfit=Math.min((W-2*MX)/wCam,(H-2*MY)/hCam)*0.96;
  const fit={zoom:+(Sfit/BASE).toFixed(3),panX:+(-cXr).toFixed(3),panY:+(((CY-H/2)/Sfit)-cYr).toFixed(3)};
  if(mode!=="draw"){
    if(!MULTI){zb.fill(-1e6);hid.fill(-1)}
    /* parte do corpo de cada malha (segmentação por partes): 1 cabeça, 2 tronco, braço/antebraço/mão, coxa/perna/pé — esquerda 3–5 e 9–11, direita 6–8 e 12–14 */
    head.parte=1;v2Extra.forEach(o=>o.mesh.parte=1);ears.forEach(e=>e.parte=1);if(bust)bust.parte=2;
    arms.forEach(o=>{const b=o.s>0?3:6;o.a.parte=o.d.parte=o.el.parte=b;o.pec.parte=o.lat.parte=2;o.f.parte=b+1;o.hs.forEach(h=>h.parte=b+2)});
    legs.forEach(o=>{const b=o.s>0?9:12;o.t.parte=o.kn.parte=b;o.c.parte=o.an.parte=b+1;o.ft.parte=b+2;o.toes.forEach(m=>m.parte=b+2)});
    all.forEach(m=>raster(m));
  }
  const bb=[bbX0-SPAN[0],bbX1-SPAN[0],bbY0-SPAN[1],bbY1-SPAN[1]];
  let shadow="";
  const bgL=(()=>{const m=/^#([0-9a-f]{6})$/i.exec(p.bg||"");if(!m)return 1;const n=parseInt(m[1],16);return ((n>>16&255)*0.3+(n>>8&255)*0.59+(n&255)*0.11)/255})();
  const shCol=bgL<0.35?"#000000":pal.shade3,shOp=bgL<0.35?0.55:0.38;
  if(L.shadow&&L.legs&&L.torso&&mode!=="draw"){
    const gY=restGround(p),G=camQ(xv0([0,gY,0])),n=xv0([0,1,0]),ln=LD[0]*n[0]+LD[1]*n[1]+LD[2]*n[2];
    if(ln>0.08){
      FSRaw.fill(1);
      const sm2=[head,bust].concat(arms.map(o=>[o.a,o.f]).flat(),legs.map(o=>[o.t,o.c,o.ft]).flat()).filter(Boolean);
      sm2.forEach(m=>shadowMesh(m,G,n,ln,S));
      blurPlain(FSRaw,FS);
      const d=contourPath(FS);if(d)shadow+='<path d="'+d+'" style="fill:'+shCol+';stroke:none;fill-rule:evenodd;opacity:'+shOp+'"/>';
    }
    legs.forEach(o=>{const A=legDims(p),f=A.f,c=applyA(o.Aft,[0,0,0.55*f]);if(c[1]-gY>1.6)return;
      const k=clamp(1-(c[1]-gY)/1.6,0,1),pts=[];for(let i=0;i<24;i++){const a=i/24*2*Math.PI;pts.push(xv([c[0]+0.75*f*Math.sin(a),gY,c[2]+1.15*f*Math.cos(a)]))}
      shadow+='<path d="M'+pts.map(q=>f1(CX+S*q[0])+" "+f1(CY-S*q[1])).join("L")+'Z" style="fill:'+shCol+';stroke:none;opacity:'+(0.5*k*shOp/0.38).toFixed(2)+'"/>'});
  }
  if(mode==="depth"){
    if(!fast)all.forEach(m=>{rasterH(m);rasterS(m)});
    return {svg:"",info:{handles,fit,bb,depth:PAN[2],S,shadow}};
  }
  const t=sh.t,chinY=sh.chinY,eyeY=sh.eyeY,mouthY=sh.mouthY;
  const out=[];
  if(shadow&&mode!=="draw"&&mode!=="camada")out.push('<g id="sombra">'+shadow+'</g>');
  /* linhas-guia de proporção: módulo de "cabeças" cobrindo a altura visível inteira */
  if(L.prop&&!MULTI&&mode!=="draw"&&mode!=="camada"){
    out.push('<g id="proporcao">');
    const nMod=8,x0=Math.max(16,CX-240),x1=Math.min(W-16,CX+240);
    for(let i=1;i<nMod;i++){
      const yc=bbY0+(bbY1-bbY0)*i/nMod,sy=CY-S*yc;
      out.push('<path d="M'+f1(x0)+' '+f1(sy)+'H'+f1(x1)+'" style="fill:none;stroke:'+pal.coral+';stroke-width:0.6;stroke-dasharray:4 5;opacity:.5"/>');
    }
    out.push('</g>');
  }
  /* contorno do deltoide sem a parte de dentro (que fica sob o braço e criava um "bico" na axila) */
  function silDelt(m,s){
    const cols=m.cols,out=[];
    const fora=v=>{const c=v%cols,th=c/cols*2*Math.PI,phi=Math.atan2(Math.sin(th-s*Math.PI/2),Math.cos(th-s*Math.PI/2));return Math.abs(phi)<100*D};
    silhouette(m).forEach(ch=>{let cur=[];ch.forEach(v=>{if(fora(v))cur.push(v);else{if(cur.length>1)out.push(cur);cur=[]}});if(cur.length>1)out.push(cur)});
    return out;
  }
  function style(k,hid,wm){
    const s=ST[k];
    /* hierarquia: silhueta grossa; sobreposição (peça na frente de outra) média; linhas internas finas e mais claras.
       Linhas ocultas (atrás do corpo): tracejadas com a opacidade escolhida (L.ocultas, 0 a 1) */
    const oc=L.ocultas===undefined?0.5:+L.ocultas;
    return "fill:none;stroke:"+pal[s.c]+";stroke-width:"+f1(s.w*(wm||1)*LWK)+";stroke-linecap:round;stroke-linejoin:round"+(hid?";stroke-dasharray:3 6;opacity:"+f1(oc):(k==="gdash"||k==="jaxis"?";stroke-dasharray:5 5":"")+(s.o?";opacity:"+s.o:""));
  }
  const LS=(()=>{const l=Math.hypot(LD[0],LD[1])||1;return [LD[0]/l,-LD[1]/l]})();
  function emit(k,sx,sy,sz,n,showHid,cen){
    const isSil=k==="sil"||k==="silN"||k==="silH";
    const eps=k==="sil"?0.2:(k==="silN"||k==="silH")?0.05:0.035;
    let dh="",lastH=false;const dv=["","",""];let lastC=-1;
    /* visibilidade por segmento; nos contornos das peças (silN), trechos visíveis muito curtos são dobras internas soltas e saem */
    const VIS=new Uint8Array(Math.max(0,n-1));
    for(let i=0;i<n-1;i++)VIS[i]=visAt((sx[i]+sx[i+1])/2,(sy[i]+sy[i+1])/2,(sz[i]+sz[i+1])/2,eps)?1:0;
    if(k==="silN"){let i=0;while(i<n-1){if(!VIS[i]){i++;continue}let j=i,len=0;while(j<n-1&&VIS[j]){len+=Math.hypot(sx[j+1]-sx[j],sy[j+1]-sy[j]);j++}
      if(len<16)for(let q=i;q<j;q++)VIS[q]=0;i=j}}
    /* dobra interna: corpo dos dois lados do traço, na mesma profundidade (ex.: relevo do abdômen visto de lado) → traço fino */
    const Z=(x,y)=>{x=Math.floor(x);y=Math.floor(y);return x<0||y<0||x>=W||y>=H?-1e6:zb[y*W+x]};
    let dIn="";let lastIn=false;let dOv="",lastOv=false;
    for(let i=0;i<n-1;i++){
      const v=VIS[i];
      if(v&&isSil){
        const mx=(sx[i]+sx[i+1])/2,my=(sy[i]+sy[i+1])/2,mz=(sz[i]+sz[i+1])/2;let nx=-(sy[i+1]-sy[i]),ny=sx[i+1]-sx[i];const l=Math.hypot(nx,ny)||1;nx/=l;ny/=l;
        const a=Z(mx+4*nx,my+4*ny),b=Z(mx-4*nx,my-4*ny);
        if(a>-1e5&&b>-1e5&&Math.abs(a-mz)<0.3&&Math.abs(b-mz)<0.3){if(!lastIn)dIn+="M"+f1(sx[i])+" "+f1(sy[i]);dIn+="L"+f1(sx[i+1])+" "+f1(sy[i+1]);lastIn=true;lastC=-1;continue}
        /* junção em T: a peça da frente passa sobre outra parte do corpo bem mais atrás → traço de sobreposição (mais firme) */
        if(k==="silN"&&a>-1e5&&b>-1e5&&Math.abs(a-b)>0.9){if(!lastOv)dOv+="M"+f1(sx[i])+" "+f1(sy[i]);dOv+="L"+f1(sx[i+1])+" "+f1(sy[i+1]);lastOv=true;lastIn=false;lastC=-1;continue}
        lastOv=false;
      }
      lastIn=false;lastOv=false;
      const pre="M"+f1(sx[i])+" "+f1(sy[i]),seg="L"+f1(sx[i+1])+" "+f1(sy[i+1]);
      if(!v){if(!lastH)dh+=pre;dh+=seg;lastH=true;lastC=-1;continue}
      lastH=false;
      let c=1;
      if(isSil&&cen){
        let nx=-(sy[i+1]-sy[i]),ny=sx[i+1]-sx[i];const l=Math.hypot(nx,ny)||1;nx/=l;ny/=l;
        if(nx*((sx[i]+sx[i+1])/2-cen[0])+ny*((sy[i]+sy[i+1])/2-cen[1])<0){nx=-nx;ny=-ny}
        const d=nx*LS[0]+ny*LS[1];c=d>0.35?0:d<-0.2?2:1;
      }
      if(c!==lastC)dv[c]+=pre;
      dv[c]+=seg;lastC=c;
    }
    if(dh&&(L.hidden||showHid)&&!isSil&&(L.ocultas===undefined||L.ocultas>0.01))out.push('<path d="'+dh+'" style="'+style(k,true)+'"/>');
    const WM=isSil?[0.72,1,1.32]:[1,1,1];
    dv.forEach((d,c)=>{if(d)out.push('<path d="'+d+'" style="'+style(k,false,WM[c])+'"/>')});
    if(dIn)out.push('<path d="'+dIn+'" style="'+style("divisao",false)+'"/>');
    if(dOv)out.push('<path d="'+dOv+'" style="'+style(k,false,1.2)+'"/>');
  }
  function curve(k,pts,X,showHid){
    X=X||xf;
    const n=pts.length,sx=new Array(n),sy=new Array(n),sz=new Array(n);
    for(let i=0;i<n;i++){const q=X(pts[i]);sx[i]=CX+S*q[0];sy[i]=CY-S*q[1];sz[i]=q[2]}
    emit(k,sx,sy,sz,n,showHid);
  }
  function lineT(k,pts,X,intensidade=1){
    X=X||xf;const n=pts.length;if(n<2)return;
    const paths=["","",""],W3=[0.4,0.7,1];
    let prevC=-1,prevEnd=-1;
    for(let i=0;i<n-1;i++){
      const a=X(pts[i]),b=X(pts[i+1]);
      const ax=CX+S*a[0],ay=CY-S*a[1],bx=CX+S*b[0],by=CY-S*b[1];
      if(!visAt((ax+bx)/2,(ay+by)/2,(a[2]+b[2])/2)){prevC=-1;continue}
      const f=Math.sin(Math.PI*(i+0.5)/(n-1)),c=f<0.4?0:f<0.75?1:2;
      if(c!==prevC||prevEnd!==i)paths[c]+="M"+f1(ax)+" "+f1(ay);
      paths[c]+="L"+f1(bx)+" "+f1(by);prevC=c;prevEnd=i+1;
    }
    paths.forEach((d,c)=>{if(d)out.push('<path d="'+d+'" style="'+style(k,false,W3[c])+(intensidade<0.999?";opacity:"+f1(intensidade):"")+'"/>')});
  }
  const GQ=M.bust.tq;
  const xb=v=>{const w=bustTw(v[0],v[1],F),A=tab[Math.round(clamp(w,0,3)*64)];let r=applyA(A,v);
    if(GQ){const [wl,wr]=pesoGluteo(v[0],v[1],v[2],F);if(wl>0.001||wr>0.001){const a=applyA(GQ[0],v),b=applyA(GQ[1],v),w0=1-wl-wr;r=[0,1,2].map(i=>w0*r[i]+wl*a[i]+wr*b[i])}}
    return xv(r)};
  const bp=(y,th,off)=>bustLocal(y,th,p,F,off);
  function poly(k,pts,fillCol){
    const n=pts.length;let d="",vis=0;
    for(let i=0;i<n;i++){
      const q=xf(pts[i]),sx=CX+S*q[0],sy=CY-S*q[1];
      d+=(i?"L":"M")+f1(sx)+" "+f1(sy);
      if(visAt(sx,sy,q[2]))vis++;
    }
    if(vis<n*0.6)return;
    const st=ST[k];
    out.push('<path d="'+d+'Z" style="fill:'+fillCol+';stroke:'+pal[st.c]+';stroke-width:'+st.w+';stroke-linejoin:round"/>');
  }
  const fillP=(pts,col,op,minVis=0.7)=>{
    let d="",vis=0;
    for(let i=0;i<pts.length;i++){
      const q=xf(pts[i]),sx=CX+S*q[0],sy=CY-S*q[1];
      d+=(i?"L":"M")+f1(sx)+" "+f1(sy);
      if(visAt(sx,sy,q[2]))vis++;
    }
    if(vis<pts.length*minVis)return;
    out.push('<path d="'+d+'Z" style="fill:'+col+';stroke:none'+(op?';opacity:'+op:'')+'"/>');
  };
  const arr=(fn,a0,a1,n)=>{const o=[];for(let i=0;i<=n;i++)o.push(fn(a0+(a1-a0)*i/n));return o};
  const hp=(y,th,off)=>headPt(y,th,p,sh,off);

  out.push('<g id="corpo">');
  /* corpo: preenchimento e sombras vetorizados a partir dos campos por pixel */
  const hSil=silhouette(head),bSil=bust?silhouette(bust):[];
  if(!fast&&(L.fill||L.shade)){
    if(mode!=="draw"){hz.fill(-1e6);sm.fill(-9);hid.fill(-1);all.forEach(m=>{rasterH(m);rasterS(m)});lanc.forEach(m=>rasterS(m))}
    makeFields(!!L.shade,!!L.cel);
    if(L.fill){const d=contourPath(Fc);if(d)out.push('<path d="'+d+'" style="fill:'+pal.fill+';stroke:none;fill-rule:evenodd"/>')}
    if(L.shade){
      const dh=L.cel?"":contourPath(FH);if(dh)out.push('<path d="'+dh+'" style="fill:'+pal.shade1+';stroke:none;fill-rule:evenodd;opacity:.5"/>');
      const d1=contourPath(FA),d2=contourPath(FB);
      if(d1)out.push('<path d="'+d1+'" style="fill:'+pal.shade1+';stroke:none;fill-rule:evenodd"/>');
      if(d2)out.push('<path d="'+d2+'" style="fill:'+pal.shade2+';stroke:none;fill-rule:evenodd"/>');
      const dr=contourPath(FR);if(dr)out.push('<path d="'+dr+'" style="fill:'+pal.shade1+';stroke:none;fill-rule:evenodd;opacity:.85"/>');
      const dk=contourPath(FK);if(dk)out.push('<path d="'+dk+'" style="fill:'+pal.shade2+';stroke:none;fill-rule:evenodd;opacity:'+(L.cel?0.75:0.45)+'"/>');
    }
  }else if(L.fill){
    out.push('<path d="'+fillPath(hSil,head)+(bust?fillPath(bSil,bust):"")+arms.map(o=>fillPath(silhouette(o.a),o.a)+fillPath(silhouette(o.f),o.f)+o.hs.map(h=>fillPath(silhouette(h),h)).join("")).join("")+legs.map(o=>[o.t,o.c,o.ft].map(m=>fillPath(silhouette(m),m)).join("")).join("")+'" style="fill:'+pal.fill+';stroke:none"/>');
  }

  out.push('</g>');
  /* V2: cavidade, dentes, língua e globos oculares são volumes
     projetados pelo motor, com cores próprias sobre a malha do rosto. */
  if(v2Extra.length&&mode!=="draw"&&mode!=="camada"){
    out.push('<g id="volumes-cabeca-v2">');
    for(const q of v2Extra){
      const d=fillPath(silhouette(q.mesh),q.mesh);
      if(d){
        const color=q.kind==="cavity"?pal.ink:q.kind==="tongue"?"#AE747C":
          q.kind==="tooth"?"#EFECE6":"#F3F2EB";
        out.push('<path d="'+d+'" style="fill:'+color+';stroke:none;opacity:'+ (q.kind==="cavity"?.96:1)+'"/>');
      }
    }
    out.push('</g>');
  }
  /* guias de construção: grupo separado, mais leve, para não competir com a anatomia */
  out.push('<g id="construction-guides" style="opacity:'+(L.cel?0.45:0.8)+'">');
  /* esfera guia */
  if(L.sphere&&!headV3Enabled(p)&&p.headModel!=="v4_anatomical"){
    const c0=xf([0,0,0]),cx0=CX+S*c0[0],cy0=CY-S*c0[1];
    out.push('<circle cx="'+f1(cx0)+'" cy="'+f1(cy0)+'" r="'+f1(S)+'" style="'+style("sphere",false)+'"/>');
    out.push('<path d="M'+f1(cx0-6)+' '+f1(cy0)+'H'+f1(cx0+6)+'M'+f1(cx0)+' '+f1(cy0-6)+'V'+f1(cy0+6)+'" style="'+style("sphere",false)+'"/>');
  }
  /* A V2 obtém a circunferência da superfície 3D plana de Loomis.
     Nada de círculo decorativo desenhado sobre uma esfera arredondada. */
  if(L.planes){
    if(p.headModel==="v4_anatomical")constructionCurvesV4(p,sh,48).forEach(g=>curve("plane",g.pts));
    else if(headV3Enabled(p))constructionCurvesV3(p,sh,64).forEach(g=>curve("plane",g.pts));
    else if(p.headModel==="v2")[-1,1].forEach(s=>
      curve("plane",sideBorderV2(p,sh,s,128,.008)));
    else [-1,1].forEach(s=>{
      const pts=arr(a=>{
        const y=0.05+0.56*Math.sin(a),z=0.56*Math.cos(a);
        const r=ringAt(y,p,sh),cs=clamp((z-r[1])/r[2],-1,1);
        return [s*r[0]*Math.sqrt(1-cs*cs)*1.004,y,z];
      },0,2*Math.PI,72);
      curve("plane",pts);
    });
  }
  /* Topografia 3D real, para a referência matemática 3x3. */
  if(headV3Enabled(p)&&(L.rings||L.merid)){
    isoCurvesV3(p,sh,{meridians:L.merid?16:0,parallels:L.rings?13:0,resolution:104}).forEach(g=>curve("ring",g.pts));
  }
  if(p.headModel==="v4_anatomical"&&(L.rings||L.merid)){
    isoCurvesV4(p,sh,{meridians:L.merid?16:0,parallels:L.rings?13:0,resolution:104})
      .forEach(g=>curve("ring",g.pts));
  }
  if(p.headModel==="v4_anatomical"&&(L.planes||L.anat||L.jaw||L.feat)){
    anatomicalCurvesV4(p,sh).forEach(g=>{
      const jaw=["mandibular-angle","facial-v-plane","chin-wedge"].includes(g.kind),micro=["upper-eyelid","lower-eyelid","nasal-alar",
        "nasolabial","mouth-corner","nose-bridge","philtrum","upper-lip","lower-lip"].includes(g.kind);
      if(jaw&&!(L.jaw||L.anat))return;
      if(micro&&!(L.feat||L.anat))return;
      if(!micro&&!jaw&&!(L.planes||L.anat))return;
      curve(jaw?"jaw":micro?"divisao":"plane",g.pts);
    });
  }
  /* Marcos Loomis/Asaro acompanham VÉRTICES da cabeça V3 e não uma
     esfera auxiliar: linha temporal, arco supraorbital, zigoma, gônio,
     plano do mento, processo mastoide e base occipital. */
  if(headV3Enabled(p)&&(L.planes||L.anat||L.jaw)){
    anatomicalCurvesV3(p,sh).forEach(g=>{
      const jaw=g.kind==="mandibular-angle";
      if(jaw&&!(L.jaw||L.anat))return;
      if(!jaw&&!(L.planes||L.anat))return;
      const kind=jaw?(L.jaw?"jaw":"divisao"):g.kind==="facial-axis"?"axis":
        g.kind==="brow-ridge"||g.kind==="chin-plane"?"divisao":"plane";
      curve(kind,g.pts);
    });
  }
  if(p.headModel==="v2"&&(L.rings||L.merid)){
    isoCurvesV2(p,sh,{meridians:L.merid?16:0,parallels:L.rings?13:2,resolution:104}).forEach(l=>{
      if((l.kind==="meridiano"&&L.merid)||(l.kind==="paralelo"&&L.rings))
        curve("ring",l.pts,xf);
    });
  }
  /* contornos transversais */
  if(L.rings&&p.headModel!=="v2"&&!headV3Enabled(p)&&p.headModel!=="v4_anatomical"){
    const full=y=>arr(th=>hp(y,th,0.004),0,2*Math.PI,140);
    const part_=y=>arr(th=>hp(y,th,0.004),-110*D,110*D,90);
    curve("ring",full(t));
    curve("axis",full(0));
    curve("ring",full(eyeY));
    curve("ring",part_(-t));
    curve("ring",part_(mouthY));
  }
  /* linhas de proporção estendidas, com marcas nas pontas */
  if(L.rings&&p.headModel!=="v2"&&!headV3Enabled(p)&&p.headModel!=="v4_anatomical"){
    [0.11,eyeY,-t].forEach(y=>{
      const r=ringAt(y,p,sh),xe=r[0]+0.3;
      curve("ext",arr(x=>[x,y,r[1]],-xe,xe,40));
      [-1,1].forEach(q=>curve("ext",[[q*xe,y-0.035,r[1]],[q*xe,y+0.035,r[1]]]));
    });
  }
  /* meridianos: eixo central na frente (segue o perfil) e atrás, mais os planos do rosto */
  if(L.merid&&p.headModel!=="v2"&&!headV3Enabled(p)&&p.headModel!=="v4_anatomical"){
    curve("axis",arr(i=>hp(i,0,0.004),1,chinY+0.015,110));
    curve("ring",arr(i=>hp(i,Math.PI,0),1,-0.85,60));
    [-1,1].forEach(s=>curve("ring",arr(i=>hp(i,s*38*D,0.004),t,-t,50)));
  }
  /* linha da mandíbula: da orelha ao queixo, sobre a superfície */
  /* Ângulo mandibular visível também no modo anatômico, inclusive em perfil. */
  if((L.jaw||L.anat)&&!headV3Enabled(p)&&p.headModel!=="v4_anatomical"){
    [-1,1].forEach(s=>{
      curve(L.jaw?"jaw":"divisao",arr(k=>{
        const y=lerp(-0.48,chinY+0.07,k);
        const a=k<0.38?lerp(102,87,k/0.38):lerp(87,0,Math.pow((k-0.38)/0.62,0.86));
        return hp(y,s*a*D,0.011);
      },0,1,46));
    });
  }
  /* guias do busto: cilindro do pescoço, cintura escapular, deltoides, linha central e coluna */
  if(bust&&L.girdle){
    [-1.2,F.yJ+0.3].forEach(y=>curve("ring",arr(th=>bp(y,th,0.006),0,2*Math.PI,90),xb,true));
    const notch=bp(F.yJ+0.03,0,0.01);
    const acr=[-1,1].map(s=>shoulderWarp([s*(F.W-0.1),F.yAc+0.06,F.zT+0.05],p,F));
    curve("gdash",arr(k=>[lerp(acr[0][0],acr[1][0],k),lerp(acr[0][1],acr[1][1],k),lerp(acr[0][2],acr[1][2],k)],0,1,30),xb);
    [-1,1].forEach(s=>{
      const G=xv(applyA(A2,armJoint(p,F,s))),gx=CX+S*G[0],gy=CY-S*G[1];
      if(zb[Math.floor(gy)*W+Math.floor(gx)]>G[2]+0.62+0.45&&gx>=1&&gy>=1&&gx<W-1&&gy<H-1)return;
      const lat=xv0(mv(A2.M,[s,0,0])),la=Math.atan2(-lat[1],lat[0]);
      const r1=0.2*S,r2=0.62*S,r3=0.36*S;
      out.push('<circle cx="'+f1(gx)+'" cy="'+f1(gy)+'" r="'+f1(r1)+'" style="'+style("plane",false)+'"/>');
      out.push('<circle cx="'+f1(gx)+'" cy="'+f1(gy)+'" r="2.6" style="fill:'+pal.cobalt+';stroke:none"/>');
      out.push('<path d="M'+f1(gx-r3)+' '+f1(gy)+'H'+f1(gx+r3)+'M'+f1(gx)+' '+f1(gy-r3)+'V'+f1(gy+r3)+'" style="'+style("plane",false,0.7)+'"/>');
      const a0=la-1.75,a1=la+0.55;
      out.push('<path d="M'+f1(gx+r2*Math.cos(a0))+' '+f1(gy+r2*Math.sin(a0))+'A'+f1(r2)+' '+f1(r2)+' 0 0 1 '+f1(gx+r2*Math.cos(a1))+' '+f1(gy+r2*Math.sin(a1))+'" style="'+style("plane",false,0.8)+'"/>');
      curve("ring",arr(q=>{const x=s*(0.14+q*(F.W-0.3)),yc=F.yJ+0.06+0.04*q+0.035*Math.sin(Math.PI*q);return bp(yc,bustTh(yc,x,true,p,F),0.02)},0,1,24),xb);
      [0,1].forEach(q=>{const x=s*(0.14+q*(F.W-0.3)),yc=F.yJ+0.06+0.04*q+0.035*Math.sin(Math.PI*q),v=xb(bp(yc,bustTh(yc,x,true,p,F),0.02));
        out.push('<circle cx="'+f1(CX+S*v[0])+'" cy="'+f1(CY-S*v[1])+'" r="3.2" style="fill:none;stroke:'+pal.coral+';stroke-width:1.1"/>')});
    });
    /* círculo de construção escondido atrás de outra parte do corpo (ex.: ombro atrás da cabeça): some ou fica como linha oculta */
    const tapado=(q,r)=>{const x=Math.floor(CX+S*q[0]),y=Math.floor(CY-S*q[1]);if(x<1||y<1||x>=W-1||y>=H-1)return false;return zb[y*W+x]>q[2]+r+0.45};
    const jc=(P,r)=>{const q=xv(P),x=CX+S*q[0],y=CY-S*q[1];if(tapado(q,r)){if(L.hidden&&(L.ocultas===undefined||L.ocultas>0.01))out.push('<circle cx="'+f1(x)+'" cy="'+f1(y)+'" r="'+f1(r*S)+'" style="'+style("plane",true)+'"/>');return}
      out.push('<circle cx="'+f1(x)+'" cy="'+f1(y)+'" r="'+f1(r*S)+'" style="'+style("plane",false)+'"/>');
      out.push('<circle cx="'+f1(x)+'" cy="'+f1(y)+'" r="2.2" style="fill:'+pal.cobalt+';stroke:none"/>')};
    arms.forEach(o=>{jc(o.Af.T,0.2);jc(o.Ah.T,0.14)});
    /* pernas: juntas, anéis de seção, linha central, eixos tracejados, arcos de rotação e plano de apoio do pé */
    const arc3=(k,C,U,V,r,a0,a1,X)=>{
      const P=a=>[C[0]+r*(U[0]*Math.cos(a)+V[0]*Math.sin(a)),C[1]+r*(U[1]*Math.cos(a)+V[1]*Math.sin(a)),C[2]+r*(U[2]*Math.cos(a)+V[2]*Math.sin(a))];
      curve(k,arr(P,a0,a1,24),X);
      const e=P(a1),tg=[-U[0]*Math.sin(a1)+V[0]*Math.cos(a1),-U[1]*Math.sin(a1)+V[1]*Math.cos(a1),-U[2]*Math.sin(a1)+V[2]*Math.cos(a1)],rd=[e[0]-C[0],e[1]-C[1],e[2]-C[2]].map(c=>c/r);
      const h=0.16*r,sg=Math.sign(a1-a0);
      [1,-1].forEach(q=>curve(k,[e,[e[0]-sg*tg[0]*h+q*rd[0]*h*0.6,e[1]-sg*tg[1]*h+q*rd[1]*h*0.6,e[2]-sg*tg[2]*h+q*rd[2]*h*0.6]],X));
    };
    legs.forEach(o=>{
      const Ll=legDims(p),k=Ll.k,s=o.s,f=Ll.f,Xt=v=>xv(applyA(o.Ath,v)),Xc=v=>xv(applyA(o.Acf,v)),Xk=v=>xv(applyA(o.Akn,v)),Xf=v=>xv(applyA(o.Aft,v));
      jc(o.Ath.T,0.3);jc(o.Akn.T,0.2);jc(o.Aft.T,0.12);
      [0.3,0.62].forEach(t=>{const u=t*Ll.L1;curve("ring",arr(th=>{const r=thighR(u,th,Ll,s)+0.012;return [r*Math.sin(th),-u,r*Math.cos(th)]},0,2*Math.PI,56),Xt,true)});
      [0.3,0.68].forEach(t=>{const u=t*Ll.L2;curve("ring",arr(th=>{const r=calfR(u,th,Ll,s)+0.012;return [r*Math.sin(th),-u,r*Math.cos(th)]},0,2*Math.PI,48),Xc,true)});
      curve("axis",arr(u=>[0,-u,thighR(u,0,Ll,s)+0.012],0.14*Ll.L1,0.93*Ll.L1,26),Xt);
      curve("axis",arr(u=>[0,-u,calfR(u,0,Ll,s)+0.012],0.07*Ll.L2,0.93*Ll.L2,24),Xc);
      curve("axis",arr(u=>[s*(thighR(u,s*Math.PI/2,Ll,s)+0.012),-u,0],0.2*Ll.L1,0.9*Ll.L1,22),Xt);
      curve("jaxis",[[-0.95*k,0,0],[0.95*k,0,0]],Xk);
      curve("jaxis",[[-0.55*k,-Ll.L2,0],[0.55*k,-Ll.L2,0]],Xc);
      arc3("plane",[s*0.47*k,0,0],[0,-1,0],[0,0,-1],0.68*k,-0.35,1.25,Xk);
      arc3("plane",[s*0.3*k,0,0],[0,0,1],[0,-1,0],0.5*k,-0.45,0.55,Xf);
      const y0=-Ll.hA,zA=-0.6*f,zB=1.98*f,xm=-s*0.52*f,xl=s*0.5*f;
      curve("plane",[[xm,y0,zA],[xl,y0,zA],[xl,y0,zB],[xm,y0,zB],[xm,y0,zA]],Xf,true);
      curve("jaxis",[[0,y0,zA-0.15*f],[0,y0,zB+0.15*f]],Xf);
    });
    [F.yUB,F.yWst,F.yHip].forEach(y=>curve("ring",arr(th=>bp(y,th,0.008),0,2*Math.PI,110),xb,true));
    /* braços: anéis de seção, linha central da frente, eixos tracejados no ombro e cotovelo, arcos de rotação */
    arms.forEach(o=>{
      const A=armDims(p),s=o.s,k=A.k,X=v=>xv(applyA(o.Aa,v)),Xf=v=>xv(applyA(o.Af,v)),Xe=v=>xv(applyA(o.Ae,v));
      [0.35,0.7].forEach(t=>{const u=A.L1*t;curve("ring",arr(th=>{const r=armRadius(u,th,A,s)+0.01;return [r*Math.sin(th),-u,r*Math.cos(th)]},0,2*Math.PI,48),X,true)});
      [0.3,0.68].forEach(t=>{const u=A.L2*t;curve("ring",arr(th=>{const r=foreR(u,th,A,s)+0.01;return [r*Math.sin(th),-u,r*Math.cos(th)]},0,2*Math.PI,40),Xf,true)});
      curve("axis",arr(uu=>[0,-uu,armRadius(uu,0,A,s)+0.012],0.55,A.L1*0.95,26),X);
      curve("axis",arr(uu=>[s*(armRadius(uu,s*Math.PI/2,A,s)+0.012),-uu,0],0.55,A.L1,26),X);
      curve("axis",arr(uu=>[0,-uu,foreR(uu,0,A,s)+0.012],0.1*A.L2,0.92*A.L2,22),Xf);
      curve("jaxis",[[-0.6*k,0,0],[0.6*k,0,0]],Xe);
      curve("jaxis",[[0,0,-0.75*k],[0,0,0.75*k]],X);
      arc3("plane",[s*0.4*k,0,0],[0,-1,0],[0,0,1],0.6*k,-0.3,1.3,Xe);
      arc3("plane",[0,0,0],[s,0,0],[0,1,0],0.78*k,-0.5,0.9,X);
    });
    curve("axis",arr(y=>bp(y,0,0.006),F.yJ-0.02,F.yCr+0.05,90),xb);
    curve("axis",arr(y=>bp(y,Math.PI,0.006),F.yC7,F.yHip-0.2,90),xb);
    curve("ring",arr(th=>bp(F.yJ-0.95,th,0.006),-100*D,100*D,60),xb);
    const cy0=F.yJ-0.72;
    lineT("anat",arr(y=>bp(y,0,0.012),cy0+0.13,cy0-0.13,8),xb);
    lineT("anat",arr(x=>bp(cy0,bustTh(cy0,x,true,p,F),0.012),-0.11,0.11,8),xb);
  }
  out.push('</g>');
  out.push('<g id="anatomia">');
  /* linhas anatômicas: esternocleidomastoideo, clavículas, incisura, peitoral, deltoide, escápulas, trapézio, coluna */
  if(bust&&L.anat){
    [-1,1].forEach(s=>{
      /* borda da frente do trapézio: desce do lado do pescoço e abre sobre o ombro até a ponta da clavícula */
      {const nw=F.B.neck;lineT("divisao",suave([[F.yJ+0.62,0.8*nw],[F.yJ+0.38,0.98*nw],[F.yJ+0.2,0.5*(nw+F.W-0.3)],[F.yJ+0.1,F.W-0.42]],8).map(([y,ax])=>bp(y,bustTh(y,s*ax,true,p,F),0.012)),xb);}
      /* esternocleidomastoideo (pescoço) e clavícula em S */
      /* esternocleidomastoideo: do processo mastoide (atrás da orelha, gira com a cabeça) até a fúrcula esternal (fixa no
         tórax); a linha é apoiada na superfície do pescoço e estica/curva quando a cabeça gira ou inclina */
      {const WT=v=>applyA(tab[Math.round(clamp(bustTw(v[0],v[1],F),0,3)*64)],v);
       const mastoid=p.headModel==="v4_anatomical"?earPointV4(p,sh,s,-.85,-.55):headV3Enabled(p)?earPointV3(p,sh,s,-.85,-.55):[s*.68,-.62,-.30];
       if(headV3Enabled(p)||p.headModel==="v4_anatomical")mastoid[2]-=.12;
       const Wm=applyA(A3,mastoid),Wn=WT(bp(F.yJ+0.04,s*0.09,0.0)),C0=WT([0,F.yJ+0.12,-0.28]),C1=applyA(A3,[0,-0.62,-0.2]);
       const ax=[C1[0]-C0[0],C1[1]-C0[1],C1[2]-C0[2]],al=ax[0]*ax[0]+ax[1]*ax[1]+ax[2]*ax[2]||1;
       const raio=P=>{const t=clamp(((P[0]-C0[0])*ax[0]+(P[1]-C0[1])*ax[1]+(P[2]-C0[2])*ax[2])/al,0,1),c=[C0[0]+ax[0]*t,C0[1]+ax[1]*t,C0[2]+ax[2]*t];return {c,d:[P[0]-c[0],P[1]-c[1],P[2]-c[2]]}};
       const rm=Math.hypot(...raio(Wm).d),rn=Math.hypot(...raio(Wn).d);
       lineT("divisao",arr(u=>{const P=[0,1,2].map(i=>lerp(Wm[i],Wn[i],u)),q=raio(P),l=Math.hypot(...q.d)||1,r=lerp(rm,rn,u)*(1+0.1*Math.sin(Math.PI*u))+0.025;
         return xv([q.c[0]+q.d[0]/l*r,q.c[1]+q.d[1]/l*r,q.c[2]+q.d[2]/l*r])},0.08,0.97,26),v=>v);}
      lineT("divisao",arr(q=>{const x=s*(0.1+q*(F.W-0.28)),yc=F.yJ+0.015+0.12*Math.sin(Math.PI*q)-0.025*q;return bp(yc,bustTh(yc,x,true,p,F),0.012)},0.08,0.88,30),xb);
    });
    /* músculos do tronco: linhas do atlas muscular (mesmas formas que geram o relevo) */
    {const at=atlasTronco(p,F),B=F.B,def=clamp(B.mus*(1-B.fat)*(1-0.75*B.fem),0,2);
     [1,-1].forEach(s=>at[s].linhas.forEach(l=>{
       if(l.tipo==="fibra"&&!L.fibras)return;
       if(def<(l.min||0))return;
       const strength=L.cel?1:clamp(0.42+0.35*B.mus-0.32*B.fat-0.10*B.fem,0.3,0.93);
       lineT(l.tipo,l.pts.map(q=>{const yt=linhaParaPele(l,q,bustTh,p,F);return bp(yt[0],yt[1],0.012)}),xb,strength);
     }));
    }
    lineT("anat",arr(x=>{const y=F.yJ+0.05+3*x*x;return bp(y,bustTh(y,x,true,p,F),0.012)},-0.11,0.11,10),xb);
    /* sulco da coluna e processos espinhosos */
    lineT("divisao",arr(y=>bp(y,Math.PI,0.012),F.yC7-0.15,F.yHip-0.25,40),xb,L.cel?0.9:0.48);
    if(L.fibras||L.cel)for(let y=F.yC7-0.05;y>F.yHip+0.1;y-=0.3)
      lineT("fibra",arr(x=>bp(y,Math.PI+x,0.012),-0.05,0.05,4),xb,0.65);
    /* umbigo, linha inguinal, glúteos */
    lineT("anat",arr(a=>{const x=0.03*Math.cos(a),y=F.yNav+0.035*Math.sin(a);return bp(y,bustTh(y,x,true,p,F),0.01)},0,2*Math.PI,12),xb);
    [-1,1].forEach(s=>{
      /* linha da "calcinha": abertura da perna na frente (do quadril até a virilha) e o "V" do sacro atrás */
      lineT("dobra",arr(k=>{const ax=lerp(0.97*F.B.hip*0.93,0.04,k),y=lerp(F.yHip+0.42,F.yCr+0.06,Math.pow(k,1.25))-0.1*Math.sin(Math.PI*k);return bp(y,bustTh(y,s*ax,true,p,F),0.012)},0,1,24),xb,L.cel?0.85:0.58);
      lineT("divisao",arr(k=>{const ax=lerp(0.26,0.02,k),y=lerp(F.yHip+0.32,F.yHip-0.3,Math.pow(k,1.1));return bp(y,bustTh(y,s*ax,false,p,F),0.012)},0,1,16),xb);
    });
    /* fenda entre os glúteos (sem a cinta) — com a cinta, o cós: uma faixa lisa em volta do quadril, como peça de manequim */
    const cinta=clamp(p.cinta??1,0,1);
    if(cinta<0.5)lineT("dobra",arr(y=>bp(y,Math.PI,0.012),F.yHip-0.2,F.yCr+0.05,14),xb);
    else{const yc=F.yHip+0.36;lineT("divisao",arr(a=>bp(yc+0.04*Math.cos(a),a,0.012),-Math.PI*0.62,Math.PI*0.62,30),xb,L.cel?0.8:0.45);lineT("divisao",arr(a=>bp(yc-0.04*Math.cos(a),a,0.012),Math.PI*0.62,Math.PI*1.38,22),xb,L.cel?0.8:0.45)}
    /* glúteo máximo: borda de fora (do sacro, descendo em diagonal para fora até o trocânter) e glúteo médio acima, no lado */
    {const gk=clamp(F.B.glute/0.21,0,2.5),hw=F.B.hip;
     if(gk>0.25)[-1,1].forEach(s=>{
       lineT("divisao",arr(k=>{const y=lerp(F.yHip+0.02,F.yAt(5.40),k)-0.055*Math.sin(Math.PI*k),ax=lerp(0.12,0.72*hw,k*k*(3-2*k))-0.045*Math.sin(Math.PI*k);return bp(y,bustTh(y,s*ax,false,p,F),0.012)},0.04,1,22),xb,L.cel?0.90:0.52);
       if(L.cel||L.fibras)lineT("fibra",arr(k=>{const y=lerp(F.yHip+0.42,F.yHip-0.25,k),ax=lerp(0.62*hw,0.88*hw,Math.pow(k,0.8));return bp(y,bustTh(y,s*ax,false,p,F),0.012)},0,1,12),xb,0.65);
     });
    }
    /* braços: borda do deltoide, bíceps, tríceps e braquiorradial (com a torção do antebraço) */
    arms.forEach(o=>{
      const A=armDims(p),s=o.s,X=v=>xv(applyA(o.Aa,v)),L1=A.L1,L2=A.L2;
      const onA=(u,th,off)=>{const r=armRadius(u,th,A,s)+(off||0.012);return [r*Math.sin(th),-u,r*Math.cos(th)]};
      const XF=(u,th)=>{const t=clamp(u/L2,0,1),Afu=comp(A2,{M:mmul(o.ap.Mb,rotM(o.ap.pr*t,0,0)),T:o.ap.fore.T}),r=foreR(u,th,A,s)+0.012;return xv(applyA(Afu,[r*Math.sin(th),-u,r*Math.cos(th)]))};
      const def=clamp(F.B.mus*(1-F.B.fat)*(1-0.75*F.B.fem),0,2);
      /* atlas do braço: deltoide (borda e 3 feixes), bíceps, braquial, tríceps; antebraço: braquiorradial, extensores, flexores */
      atlasBraco(A,s).forEach(l=>{
        if(l.tipo==="fibra"&&!L.fibras)return;if(def<(l.min||0))return;
        const pts=l.parte==="ante"?l.pts.map(([t,th])=>XF(t*L2,th)):(l.pts3?l.pts3.map(([t,th,off])=>X(onA(t*L1,th,off))):l.pts.map(([t,th])=>X(onA(t*L1,th,l.off||0.012))));
        lineT(l.tipo,pts,v=>v);
      });
      /* vinco na dobra do cotovelo */
      const el=s>0?p.elbowL:p.elbowR;
      if(el>25)lineT("mus",arr(a=>{const r=0.34*A.k;return xv(applyA(o.Ae,[r*Math.sin(a),0.02*A.k,r*Math.cos(a)]))},-0.8,0.8,12),v=>v);
    });
    /* pernas: patela, dobras do joelho e do glúteo, maléolos e linhas do atlas da perna (coxa e panturrilha) */
    {const def=clamp(F.B.mus*(1-F.B.fat)*(1-0.75*F.B.fem),0,2),AP=atlasPerna();
    legs.forEach(o=>{
      const A=legDims(p),k=A.k,s=o.s,Xk=v=>xv(applyA(o.Akn,v)),Xc=v=>xv(applyA(o.Acf,v));
      /* patela: escudo arredondado, mais estreito embaixo */
      lineT("divisao",arr(a=>{const sn=Math.sin(a),c=Math.cos(a),q=1-0.32*Math.max(0,-sn);return [0.15*k*q*Math.sign(c)*Math.pow(Math.abs(c),0.8),0.06*k+0.19*k*Math.sign(sn)*Math.pow(Math.abs(sn),0.9),0.42*k]},0,2*Math.PI,28).map(Xk),v=>v);
      const kf=s>0?p.kneeFlexL:p.kneeFlexR,hf=s>0?p.hipFlexL:p.hipFlexR,Xt=v=>xv(applyA(o.Ath,v));
      /* vinco atrás do joelho quando dobra */
      if(kf>25)lineT("dobra",arr(a=>{const r=0.36*k;return [-r*Math.sin(a),-0.02*k,-r*Math.cos(a)]},-0.85,0.85,14).map(Xk),v=>v);
      /* joelho dobrado: tendão patelar (da ponta da patela à tuberosidade da tíbia) salta na frente */
      if(kf>20){const fk=clamp((kf-20)/60,0,1);[-1,1].forEach(q=>lineT("mus",arr(u=>{const th=q*(0.2+0.04*u),r=calfR(u*0.32*A.L2,th,A,s)+0.012+0.03*fk*Math.sin(Math.PI*u);return [r*Math.sin(th),-u*0.32*A.L2,r*Math.cos(th)]},0,1,10).map(Xc),v=>v))}
      /* pé em cunha: só a divisão do dedão aparece na caixa dos dedos */
      {const Xf=v=>xv(applyA(o.Aft,v));lineT("divisao",linhaDedao(p,s,s>0?p.toesL:p.toesR,(s>0?p.halluxL:p.halluxR)||0).map(Xf),v=>v)}
      /* trocânter maior: o relevo ósseo do lado de fora, logo abaixo do quadril */
      lineT("mus",arr(a=>{const u=A.L1*(0.07+0.05*Math.sin(a)),th=s*(Math.PI/2+0.25*Math.cos(a)),r=thighR(u,th,A,s)+0.012;return [r*Math.sin(th),-u,r*Math.cos(th)]},0.3,Math.PI*2-0.3,14).map(Xt),v=>v);
      /* dobra do glúteo: um "sorriso" sob cada nádega, da fenda para fora (some quando a coxa sobe) */
      if(hf<45&&(p.cinta??1)<0.5)lineT("dobra",arr(a=>{const th=Math.PI+s*a,u=A.L1*(0.2-0.03*Math.pow(a,1.6)),r=thighR(u,th,A,s)+0.05;return [r*Math.sin(th),-u,r*Math.cos(th)]},0.04,1.3,18).map(Xt),v=>v);
      /* maléolos (o de dentro mais alto) */
      [[-1,0.07],[1,-0.06]].forEach(([sd,dy])=>lineT("mus",arr(a=>[s*sd*0.205*k,-A.L2+dy*k+0.06*k*Math.sin(a),0.06*k*Math.cos(a)],0,2*Math.PI,14).map(Xc),v=>v));
      /* atlas: sartório, reto femoral, vastos, trato iliotibial, adutores, isquiotibiais; tíbia, gastrocnêmio, sóleo, Aquiles */
      AP.forEach(l=>{
        if(l.tipo==="fibra"&&!L.fibras)return;if(def<(l.min||0))return;
        const coxa=l.parte==="coxa",LL=coxa?A.L1:A.L2,X=coxa?Xt:Xc;
        lineT(l.tipo,l.pts.map(([t,a])=>{const th=s*a,u=t*LL,r=(coxa?thighR(u,th,A,s):calfR(u,th,A,s))+0.012;return X([r*Math.sin(th),-u,r*Math.cos(th)])}),v=>v);
      });
    });}
    /* crista ilíaca (borda de cima da pelve) dos lados e borda do grande dorsal nas costas */
    [-1,1].forEach(s=>{
      /* crista ilíaca: da espinha ilíaca anterior (frente) até as covinhas do sacro (atrás) */
      lineT("divisao",arr(a=>{const y=F.yHip+0.52+0.07*Math.sin(Math.PI*(a-0.9)/1.7)-0.12*Math.max(0,0.95-a);return bp(y,s*a,0.012)},0.7,2.5,24),xb);
    });
  }
  out.push('</g>');
  out.push('<g id="feicoes">');
  /* sobrancelhas, pálpebras, nariz e boca */
  const surfX=(y,x)=>Math.asin(clamp(x/ringAt(y,p,sh)[0],-0.99,0.99));
  /* V5 anime: sobrancelhas, nariz e boca próprios (a geometria continua a da V3) */
  if(L.feat&&p.headModel==="v5_anime")feicoesAnime({p,sh,hp,ringAt,curve,fillP:(q,c,o)=>fillP(q,c,o,0.35),poly,arr,pal,eyeY});
  else if(L.feat){
    [-1,1].forEach(s=>{
      /* sobrancelhas: subir (+) / baixar (−); franzir (+, a ponta de dentro desce: raiva) / aflição (−, a ponta de dentro sobe) */
      const bU=p.browUp||0,bI=p.browIn||0,RB=ladoRosto(p,s),SB=rostoGeral(p).sobrancelha;
      const browPt=(u,dy)=>{
        const y=0.10+0.045*(1+0.9*SB.arco)*Math.sin(Math.PI*Math.pow(u,0.8))-0.04*u+dy+0.035*bU-0.035*bI*Math.pow(1-u,1.5)+0.04*RB.browInner*Math.pow(1-u,1.4)+0.04*RB.browOuter*Math.pow(u,1.4)
          +SB.quebra*0.04*Math.max(0,1-Math.abs(u-0.6)/0.6)-SB.quebra*0.018*u+SB.onda*0.01*Math.sin(u*Math.PI*5);
        return hp(y,s*(10+36*u)*D,0.01);
      };
      if(p.browW>0.002){
        const up=[],lo=[];
        for(let i=0;i<=24;i++){
          const u=i/24,th=(p.browW*(0.9-0.25*u)*(1-0.7*Math.pow(u,2.2))+0.004)*(1+0.75*SB.grossa)*(1-0.4*SB.quebra*u);
          up.push(browPt(u,th/2));lo.push(browPt(u,-th/2));
        }
        poly("brow",up.concat(lo.reverse()),pal.shade3);
      }else curve("feat",arr(u=>browPt(u,0),0,1,30));
      if(!L.eyes)curve("feat",arr(u=>hp(eyeY+0.03*Math.sin(Math.PI*u)*(1-0.4*u),s*(15+27*u)*D,0.008),0,1,24));
      const ytip=-0.76*t;
      curve("feat",arr(k=>{
        const y=lerp(-0.02,ytip,k),xw=lerp(0.045,0.105,Math.pow(k,1.2));
        return hp(y,s*surfX(y,xw),0.008);
      },0,1,18));
      curve("feat",arr(u=>{
        const x=s*lerp(0.055,0.115,u),y=-0.965*t+0.014*Math.sin(Math.PI*u);
        return hp(y,surfX(y,x),0.01);
      },0,1,10));
      curve("feat",arr(k=>{
        const y=lerp(-t*0.99,mouthY+0.032,k);
        return hp(y,surfX(y,s*0.035),0.008);
      },0,1,10));
    });
    /* nariz: sombra sob a ponta, narinas e asas preenchidas */
    fillP(arr(a=>{const y=-0.83*t+0.2*t*Math.sin(a/2)*0+(-0.1*t)*(1-Math.cos(a))/2*0;return hp(-0.84*t-0.12*t*Math.sin(a/2),surfX(-0.9*t,0.12*Math.cos(a)),0.01)},0,Math.PI,14),pal.shade2,0.7);
    [-1,1].forEach(s=>{
      fillP(arr(a=>{const y=-0.955*t+0.012*Math.sin(a);return hp(y,surfX(y,s*(0.066+0.034*Math.cos(a))),0.011)},0,2*Math.PI,14),pal.shade3);
      curve("feat",arr(k=>{const y=lerp(-0.80*t,-0.96*t,k),x=s*(0.12+0.05*Math.sin(Math.PI*k));return hp(y,surfX(y,x),0.01)},0,1,12));
    });
    /* boca: lábio superior e inferior preenchidos, sombra sob o lábio; sorriso (cantos) e boca aberta (mandíbula) */
    if(p.headModel==="v2"){
      /* Um único conjunto de curvas labiais sobre a superfície v2.
         Não sobrepor os polígonos da boca legada aos volumes dentários. */
      const lip=lipCurvesV2(p,sh);
      curve("feat",lip.upper);
      curve("feat",lip.lower);
      if((p.jawOpen||0)>.03){
        curve("feat",lip.top);
        curve("feat",lip.bottom);
      }
    }else{
      const M=bocaForma(p,sh),sm=M.sorriso,jo=M.aberto,ab=M.altura,Qr=M.Q;
      const H=(x,y,off=0.015)=>hp(y,surfX(y,x+M.dx),off),H0=(x,y,off=0.015)=>hp(y,surfX(y,x),off);
      const w=M.width, xs=(f,a=1)=>arr(x=>H(x,f(x),0.028),-w*a,w*a,36);
      const upper=xs(M.labioSup),upperBase=xs(M.cima);
      /* Lábio superior fixo na maxila; contorno curvo, mais largo que alto.
         A abertura não é uma faixa vertical desenhada sobre a cabeça. */
      fillP(upper.concat(upperBase.slice().reverse()),pal.shade3,0.96);
      if(jo>0.035){
        const roof=arr(x=>H(x,M.cima(x)-0.003,0.043),-w,w,48);
        const floor=arr(x=>H(x,M.baixo(x),0.047),w,-w,48);
        /* Cavidade oval: bordas se encontram naturalmente nos cantos. */
        fillP(roof.concat(floor),pal.ink,0.97);
        /* Língua curva e parcialmente oculta, apoiada no assoalho da boca. */
        if(jo>0.15&&Qr.round<0.4){
          const tWidth=w*0.68;
          fillP(arr(x=>H(x,M.linguaSup(x),0.052),-tWidth,tWidth,28)
            .concat(arr(x=>H(x,M.linguaInf(x),0.054),tWidth,-tWidth,28)),pal.coral,0.70);
          curve("fibra",arr(x=>H(x,M.linguaSup(x),0.054),-tWidth*0.62,tWidth*0.62,22));
        }
        /* Arcadas incisiva/canina com forma contínua arqueada. As coroas são
           curtas e arredondadas, evitando as barras pretas dos prints. */
        const dSup=Qr.round>0.4?[]:arcadas(M,false);
        for(const crown of dSup)fillP(crown.pontos.map(([x,y])=>H(x,y,0.054)),"#F1EBDE",0.96);
        if(jo>0.62||M.mostraDentesBaixo)for(const crown of arcadas(M,true))
          fillP(crown.pontos.map(([x,y])=>H(x,y,0.054)),"#E7DDD0",0.90);
      }
      /* Lábio inferior ligado ao queixo que gira na ATM. */
      const lower=arr(x=>H(x,M.baixo(x),0.031),-w,w,36);
      const lowerOuter=arr(x=>H(x,M.labioInf(x),0.033),w,-w,36);
      fillP(lower.concat(lowerOuter),pal.shade1,0.96);
      if(jo<0.04)curve("feat",xs(M.cima));
      else{
        curve("feat",xs(M.cima));
        curve("feat",arr(x=>H(x,M.baixo(x),0.031),-w,w,32));
      }
      curve("feat",xs(M.labioSup));
      curve("feat",arr(x=>H(x,M.labioInf(x),0.033),-w,w,30));
      /* O sulco mentolabial acompanha o terço inferior, sem uma placa
         vertical sombreando o pescoço quando a mandíbula se desloca. */
      curve("fibra",arr(x=>H(x,M.labioInf(x)-0.055*M.curva(x),0.012),-0.14,0.14,20));
      /* Sulcos nasolabiais e zigomáticos: aparecem com o sorriso e com as rugas pedidas (rugasBoca, rugasBochecha) */
      const nl=Math.max(sm>0.06?sm:0,Qr.rugas.boca),bc=Math.max(sm>0.45?sm:0,Qr.rugas.bochecha);
      if(nl>0.06)[-1,1].forEach(side=>{
        curve("divisao",arr(u=>{
          const x=side*(0.145+0.115*Math.sin(Math.PI*u*0.8));
          const y=lerp(-0.96*t,mouthY+0.07*nl,u);
          return H0(x,y,0.017);
        },0,1,18));
      });
      if(bc>0.2)[-1,1].forEach(side=>{for(let i=0;i<(bc>0.6?2:1);i++)curve(bc>0.45?"divisao":"fibra",arr(u=>H0(side*(0.29+0.06*u+0.03*i),eyeY-0.17-0.05*u-0.045*i,0.013),0,1,12))});
      /* bochechas: infladas = contorno arredondado saindo da face; chupadas = sulco fundo sob o osso da bochecha */
      if(Math.abs(Qr.puff)>0.08)[-1,1].forEach(side=>{
        if(Qr.puff>0)curve("divisao",arr(u=>{const a=Math.PI*(0.15+0.7*u);return H0(side*(0.36+0.07*Qr.puff*Math.sin(a)),lerp(eyeY-0.2,mouthY-0.04,u),0.02+0.02*Qr.puff*Math.sin(a))},0,1,16));
        else curve("divisao",arr(u=>H0(side*(0.3+0.04*Math.sin(Math.PI*u)),lerp(eyeY-0.22,mouthY+0.02,u),0.012),0,1,14));
      });
      /* linhas de expressão pedidas à mão (as automáticas da expressão continuam) */
      {const rg=Qr.rugas,fr=Math.max(rg.franzido,clamp((p.browIn||0)-0.55,0,1)),te=Math.max(rg.testa,clamp((p.browUp||0)-0.55,0,1));
       const est=v=>v>0.45?"divisao":"fibra";
       if(te>0.06)for(let i=0;i<(te>0.55?3:2);i++){const y0=eyeY+0.42+0.08*i,xs=0.2+0.05*i;curve(est(te),arr(x=>H0(x,y0+0.008*Math.sin(x*30+i)-0.04*Math.pow(x/xs,2),0.012),-xs*(0.5+0.5*te),xs*(0.5+0.5*te),16))}
       if(fr>0.06)[-1,1].forEach(side=>{for(let i=0;i<(fr>0.55?2:1);i++)curve(est(fr),arr(u=>H0(side*(0.035+0.025*i+0.01*u),eyeY+0.1+0.02*i+(0.07+0.07*fr)*u,0.012),0,1,5))});
       if(rg.olhos>0.06)[-1,1].forEach(side=>{for(let i=0;i<(rg.olhos>0.5?3:2);i++){const a=(-0.4+0.4*i)*(0.6+0.4*rg.olhos);curve(est(rg.olhos),arr(u=>H0(side*(0.53+(0.04+0.06*rg.olhos)*u*Math.cos(a)),eyeY-0.005+(0.04+0.06*rg.olhos)*u*Math.sin(a),0.012),0,1,4))}});
       if(rg.queixo>0.08){const yc=sh.chinY+0.1;[-0.06,0,0.06].forEach(xc=>curve(est(rg.queixo),arr(a=>H0(xc+0.022*Math.cos(a),yc+0.015*Math.sin(a),0.014),Math.PI*0.15,Math.PI*0.85,5)));if(rg.queixo>0.45)curve("fibra",arr(x=>H0(x,yc-0.035+0.012*Math.pow(x/0.08,2),0.014),-0.08,0.08,8))}
       if(rg.nariz>0.08)for(let i=0;i<(rg.nariz>0.5?3:2);i++)curve(est(rg.nariz),arr(x=>H0(x,eyeY+0.03-0.035*i+0.006*Math.sin(x*60),0.013),-0.045-0.012*i,0.045+0.012*i,6));
       if(Qr.veia>0.05){const cx=0.24,cy=eyeY+0.48,r=0.055+0.03*Qr.veia;for(let q=0;q<4;q++){const a0=q*Math.PI/2+Math.PI/4,ox=Math.cos(a0)*r*1.1,oy=Math.sin(a0)*r*1.1;curve("divisao",arr(a=>H0(cx+ox+r*0.75*Math.cos(a),cy+oy+r*0.75*Math.sin(a),0.03),a0+Math.PI*0.62,a0+Math.PI*1.38,7))}}
       if(Qr.suor>0.05){const cx=-0.5,cy=eyeY+0.3,rr=0.035+0.03*Qr.suor,g=arr(a=>H0(cx+rr*Math.cos(a)*(1-0.4*Math.max(0,Math.sin(a))),cy+rr*Math.sin(a)+(Math.sin(a)>0?1.4*rr*Math.pow(Math.sin(a),3):0),0.05),0,2*Math.PI,18);fillP(g,"#BFE3F5",0.9);curve("feat",g.concat([g[0]]))}}
    }
    const fl=clamp(p.nostrilFlare||0,0,1);
    const wing=[[0.105,-0.76],[0.14+0.02*fl,-0.85],[0.17+0.045*fl,-0.93],[0.14+0.035*fl,-0.985],[0.07+0.01*fl,-1.0],[0,-1.0]];
    const half=wing.map(w=>[w[0],w[1]*t]);
    const poly2=half.slice().reverse().map(w=>[-w[0],w[1]]).concat(half.slice(1));
    curve("feat",poly2.map(w=>hp(w[1],surfX(w[1],w[0]),0.008)));
  }
  /* Anatomia facial esquemática: 16 grupos musculares superficiais em
     cada hemiface, exibidos no écorché. Nada é pintado permanentemente
     sobre o modo de pele/contorno comum. */
  if(L.feat&&L.cel){
    const pt=([x,y])=>{
      const r=Math.max(0.015,ringAt(y,p,sh)[0]);
      return hp(y,Math.asin(clamp(x/r,-0.98,0.98)),0.016);
    };
    const def=clamp(0.55+0.30*(p.muscle||0)-0.15*(p.fat||0),0.40,0.88);
    for(const mus of atlasRosto(p,sh))
      lineT(mus.tipo,suave(mus.pts,5).map(pt),xf,def);
  }
  out.push('</g>');
  out.push('<g id="olhos">');
  /* olhos 2D: sombra da órbita, amêndoa preenchida, íris recortada (opcional), pálpebras e prega */
  if(L.eyes&&p.headModel==="v5_anime")olhosAnime({p,sh,hp,ringAt,curve,fillP:(q,c,o)=>fillP(q,c,o,0.35),arr,pal,eyeY});
  else if(L.eyes){
    /* pálpebras: eyeLid 0 = abertas, 1 = fechadas (a de cima desce mais); olhar: eyeYaw (− direita / + esquerda do manequim) e eyePitch (+ cima) */
    const lid=Math.max(0,Math.min(1,p.eyeLid||0)),gY=p.eyeYaw||0,gP=p.eyePitch||0;
    const w=0.30*p.eyeSize,hu=0.062*p.eyeSize*p.eyeOpen*(1-0.92*lid)*(1+0.18*Math.max(0,p.browUp||0)),hl=0.036*p.eyeSize*p.eyeOpen*(1-0.6*lid);
    const tilt=q=>0.034*(q-0.45);
    const up=q=>{q=clamp(q,0,1);return hu*Math.sin(Math.PI*Math.pow(q,0.75))+tilt(q)};
    const lo=q=>{q=clamp(q,0,1);return -hl*Math.sin(Math.PI*Math.pow(q,1.15))+tilt(q)};
    const X=q=>(q-0.5)*w;
    const fillP=(pts,col,op)=>{
      let d="",vis=0;
      for(let i=0;i<pts.length;i++){
        const q=xf(pts[i]),sx=CX+S*q[0],sy=CY-S*q[1];
        d+=(i?"L":"M")+f1(sx)+" "+f1(sy);
        if(visAt(sx,sy,q[2]))vis++;
      }
      if(vis<pts.length*0.6)return;
      out.push('<path d="'+d+'Z" style="fill:'+col+';stroke:none'+(op?';opacity:'+op:'')+'"/>');
    };
    [-1,1].forEach(s=>{
      /* cada olho com a sua pálpebra (piscar um só), pálpebra de baixo e bochecha */
      const R=ladoRosto(p,s),lid=R.lid,ap=clamp(R.lidLo+0.55*R.cheek,0,1);
      const OL=rostoGeral(p).olho;
      const hu=0.062*p.eyeSize*p.eyeOpen*(1-0.92*lid)*(1+0.18*Math.max(0,p.browUp||0)+0.45*OL.arregalar)*(1-0.2*ap),hl=0.036*p.eyeSize*p.eyeOpen*(1-0.6*lid)*(1-0.5*ap)*(1+0.4*OL.arregalar);
      const up=q=>{q=clamp(q,0,1);return hu*Math.sin(Math.PI*Math.pow(q,0.75))+tilt(q)};
      const lo=q=>{q=clamp(q,0,1);return -hl*Math.sin(Math.PI*Math.pow(q,1.15))+tilt(q)};
      const xc=ringAt(eyeY,p,sh)[0]*Math.sin(p.eyeGap*D);
      const E=(ex,ey,off)=>{const y=eyeY+ey;return hp(y,s*Math.asin(clamp((xc+ex)/ringAt(y,p,sh)[0],0,0.99)),off||0.01)};
      /* sombra da órbita sob a sobrancelha */
      const so=[],si=[];
      for(let i=0;i<=20;i++){
        const q=i/20,k=Math.sin(Math.PI*q);
        so.push(E(X(q)*1.25-0.01,up(q)+0.012+0.05*k*p.eyeSize,0.004));
        si.push(E(X(q),up(q),0.004));
      }
      fillP(so.concat(si.reverse()),pal.shade2,0.75);
      /* amêndoa branca */
      const al=arr(q=>E(X(q),up(q),0.008),0,1,28),bl=arr(q=>E(X(q),lo(q),0.008),1,0,28);
      fillP(al.concat(bl),pal.fill);
      /* sombra suave da pálpebra superior sobre o globo */
      const sh1=arr(q=>E(X(q),up(q),0.01),0.05,0.95,20),sh2=arr(q=>E(X(q),up(q)-0.4*hu*Math.sin(Math.PI*q),0.01),0.95,0.05,20);
      fillP(sh1.concat(sh2),pal.shade1,0.9);
      /* íris */
      /* olho de foco: branco com um ponto preto minúsculo */
      if(OL.foco>0.5&&lid<0.8)fillP(arr(a=>E(s*gY*0.085*p.eyeSize+0.008*p.eyeSize*Math.cos(a),gP*0.03*p.eyeSize+0.009*p.eyeSize*Math.sin(a),0.013),0,2*Math.PI,10),pal.ink);
      if((p.eyeStyle>=0.5||OL.iris||OL.pupila||OL.brilho||OL.fenda)&&OL.branco<0.5&&OL.foco<0.5){
        const ri=0.066*p.eyeSize*(1+0.3*OL.iris)*(1-0.2*OL.arregalar),gx=s*gY*0.085*p.eyeSize,gy=gP*0.03*p.eyeSize,rpu=0.024*p.eyeSize*(OL.pupila>=0?1+0.8*OL.pupila:1+0.8*OL.pupila)*(1+0.3*OL.iris);
        const ip=[];
        for(let i=0;i<48;i++){
          const a=i/48*2*Math.PI,ex=ri*Math.cos(a)+gx,ey=ri*Math.sin(a)+gy,q=clamp(ex/w+0.5,0,1);
          ip.push(E(ex,clamp(ey,lo(q)*0.98,up(q)*0.98),0.012));
        }
        fillP(ip,pal.shade2);
        if(lid<0.8){const pc=q=>[clamp(gx+rpu*(1-0.75*OL.fenda)*Math.cos(q),X(0.08),X(0.92)),clamp(gy+rpu*(1+0.5*OL.fenda)*Math.sin(q),lo(clamp(gx/w+0.5,0,1))*0.9,up(clamp(gx/w+0.5,0,1))*0.9)];
        const pp=arr(a=>{const c=pc(a);return E(c[0],c[1],0.013)},0,2*Math.PI,16);
        fillP(pp,pal.ink);
        const ob=clamp(1+OL.brilho,0,1),kb=1+0.5*Math.max(0,OL.brilho);
        if(ob>0.02)fillP(arr(a=>E(gx+0.012*p.eyeSize+0.007*kb*Math.cos(a),gy+0.02*p.eyeSize+0.007*kb*Math.sin(a),0.014),0,2*Math.PI,10),"#fff",ob<1?ob:undefined);
        if(OL.brilho>0.3)fillP(arr(a=>E(gx-0.012*p.eyeSize+0.004*Math.cos(a),gy-0.012*p.eyeSize+0.004*Math.sin(a),0.014),0,2*Math.PI,8),"#fff");}
      }
      /* linhas: pálpebra superior grossa, inferior fina, prega, cantos */
      curve("eyeU",arr(q=>E(X(q),up(q)),-0.04,1.02,32));
      curve("feat",arr(q=>E(X(q),lo(q)),0.03,0.97,28));
      curve("feat",arr(q=>{const r=0.1+0.8*q;return E(X(r),up(r)+0.026*p.eyeSize+0.01*Math.sin(Math.PI*q),0.01)},0,1,20));
      curve("feat",arr(k=>E(X(1)+0.012*k,up(1)-0.004+0.005*k),0,1,4));
      curve("feat",arr(a=>E(X(0)+0.012*Math.cos(a)+0.012,lo(0)+0.012*Math.sin(a)+0.006),-0.5,2.8,10));
      /* Orbicular dos olhos, pálpebras e pregas laterais coordenados. */
      const contr=clamp(0.65*Math.max(0,R.smile)+0.35*lid+0.2*Math.max(0,p.browIn||0)+0.4*ap,0,1);
      if(contr>0.16){
        curve("divisao",arr(q=>E(X(q),lo(q)-0.025-0.018*contr*Math.sin(Math.PI*q),0.012),0.13,0.88,22));
        if(contr>0.4)for(const d of [-0.025,0.007])curve("fibra",
          arr(u=>E(X(1)+0.015+0.06*u,0.025+d-0.025*u,0.015),0,1,9));
      }
    });
  }
  out.push('</g>');
  out.push('<g id="orelhas">');
  /* orelhas: hélice, anti-hélice, concha preenchida, trago e lóbulo sobre a malha 3D */
  if(L.ears){
    [-1,1].forEach(s=>{
      /* V3: traços internos um pouco para fora da aba, senão o z-buffer os esconde dentro da concha */
      const E=headV3Enabled(p)?(u,v)=>earPointV3(p,sh,s,u,v,true):(u,v)=>earSurf(p,sh,s,u,v);
      if(s*xfd([1,0,0])[2]>0.05)fillP(arr(a=>E(0.12+0.34*Math.cos(a),-0.05+0.36*Math.sin(a)),0,2*Math.PI,28),pal.shade2,0.9);
      if(p.headModel==="v4_anatomical"){
        /* A V4.1 usa os contornos da orelha recalculada no espaço da
           própria malha. Ocultação do z-buffer permanece no emit(). */
        earCurvesV41(p,sh,s).forEach(g=>
          curve(g.name==="helix"?"ear":"divisao",g.pts));
      }else{
        curve("ear",arr(a=>E(Math.cos(a),Math.sin(a)),0,2*Math.PI,64));
        curve("ear",arr(a=>E(0.8*Math.cos(a)-0.02,0.84*Math.sin(a)),35*D,335*D,52));
        curve("ear",arr(k=>E(-0.07-0.38*Math.sin(Math.PI*k),0.62-1.12*k),0,1,22));
        curve("ear",arr(k=>E(lerp(0.25,-0.1,k),lerp(0.78,0.5,k)),0,1,8));
        curve("ear",arr(a=>E(0.8+0.1*Math.cos(a),-0.18+0.16*Math.sin(a)),-80*D,100*D,12));
        curve("ear",arr(k=>E(lerp(-0.5,0.45,k),-0.74+0.06*Math.sin(Math.PI*k)),0,1,14));
      }
    });
  }
  out.push('</g>');
  out.push('<g id="contorno">');
  /* contornos externos (cabeça e pescoço) */
  if(L.sil){
    const draw=(m,chains,kk)=>{
      let cx=0,cy=0;const N=m.SX.length;
      for(let i=0;i<N;i+=7){cx+=m.SX[i];cy+=m.SY[i]}
      const cen=[cx/Math.ceil(N/7),cy/Math.ceil(N/7)];
      for(const ch of chains){
        const n=ch.length,sx=new Array(n),sy=new Array(n),sz=new Array(n);
        let len=0;
        for(let i=0;i<n;i++){sx[i]=m.SX[ch[i]];sy[i]=m.SY[ch[i]];sz[i]=m.Z[ch[i]];if(i)len+=Math.hypot(sx[i]-sx[i-1],sy[i]-sy[i-1])}
        if(kk==="silN"&&len<45)continue;
        emit(kk||"sil",sx,sy,sz,n,false,cen);
      }
    };
    draw(head,hSil);if(bust)draw(bust,bSil,"silN");
    arms.forEach(o=>{
      draw(o.a,silhouette(o.a),"silN");draw(o.f,silhouette(o.f),"silN");draw(o.el,silhouette(o.el),"silN");draw(o.d,silDelt(o.d,o.s),"silN");draw(o.pec,silhouette(o.pec),"silH");draw(o.lat,silhouette(o.lat),"silH");
      o.hs.forEach(h=>draw(h,silhouette(h),"silH"));
    });
    legs.forEach(o=>{
      [o.t,o.c,o.kn,o.an,o.ft].forEach(m=>draw(m,silhouette(m),"silN"));o.toes.forEach(m=>draw(m,silhouette(m),"silH"))});
  }

  out.push('</g>');
  /* ossos: o esqueleto por cima (raio X) — vértebras, costelas, pelve, membros, mãos e pés */
  let juntasTela=null;
  if(L.ossos&&mode!=="depth"){
    const E=ossosDoCorpo(p),sp=v=>{const q=xv(v);return [CX+S*q[0],CY-S*q[1],q[2]]},g=[];
    const ord=E.ossos.map(o=>({o,a:sp(o.a),b:sp(o.b)})).sort((x,y)=>(x.a[2]+x.b[2])-(y.a[2]+y.b[2]));
    for(const {o,a,b} of ord){
      if(o.tipo==="cranio"){const r=o.r*S;g.push('<circle cx="'+f1(a[0])+'" cy="'+f1(a[1])+'" r="'+f1(r)+'" style="fill:'+pal.fill+';fill-opacity:.55;stroke:'+pal.ink+';stroke-width:1.1"/>');continue}
      const w=Math.max(1.2,2*o.r*S),d='M'+f1(a[0])+' '+f1(a[1])+'L'+f1(b[0])+' '+f1(b[1]);
      g.push('<path d="'+d+'" style="fill:none;stroke:'+pal.ink+';stroke-width:'+f1(w+1.6)+';stroke-linecap:round;opacity:.85"/>');
      g.push('<path d="'+d+'" style="fill:none;stroke:'+pal.fill+';stroke-width:'+f1(w)+';stroke-linecap:round"/>');
    }
    juntasTela=E.juntas.filter(j=>!j.menor).map(j=>{const q=sp(j.P);return {nome:j.nome,k:j.k,s:j.s,x:q[0],y:q[1]}});
    juntasTela.forEach(j=>g.push('<circle cx="'+f1(j.x)+'" cy="'+f1(j.y)+'" r="3.2" style="fill:'+pal.coral+';stroke:'+pal.fill+';stroke-width:1"/>'));
    out.push('<g id="ossos">'+g.join("")+'</g>');
  }
  /* medidas e equações */
  const axes=fn=>{
    let mx=0,mn=1e9,ang=0;
    for(let i=0;i<180;i++){
      const q=xfd(fn(i/180*2*Math.PI)),r=Math.hypot(q[0],q[1]);
      if(r>mx){mx=r;ang=Math.atan2(q[1],q[0])}
      if(r<mn)mn=r;
    }
    let th=ang/D;th=((th%180)+180)%180;if(th>90)th-=180;
    return {a:mx*S,b:mn*S,th};
  };
  const info={handles,S,t,chinY,eyeY,fit,bb,depth:PAN[2],shadow,juntas:juntasTela,
    brow:axes(a=>[p.skull*Math.sin(a),0,Math.cos(a)]),
    mer:axes(a=>[0,Math.sin(a),Math.cos(a)])};
  return {svg:L.retas?out.join(""):suavizarSvg(out.join("")),info};
}

export { scene, CASTERS, setCasters };
