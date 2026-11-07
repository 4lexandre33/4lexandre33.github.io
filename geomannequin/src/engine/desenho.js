/* GeoMannequin — desenho de um manequim: monta, projeta, sombreia e gera o SVG */
import { LD, LWK, MULTI, PAN, PERSP, SPAN, camPt, camQ, effScale, proj, setLWK, setLight, setPAN, setPERSP, setSPAN } from "./projecao.js";
import { makeXf } from "./camera.js";
import { getMeshes, makeMat } from "./montagem.js";
import { earSurf, headPt, ringAt, shape } from "./cabeca.js";
import { chainSetup, legPose } from "./cadeia.js";
import { BASE, CX, CY, D, H, W, applyA, clamp, comp, f1, gauss, lerp, mmul, mv, rotM } from "./matematica.js";
import { contourPath, fillPath, silhouette } from "./contornos.js";
import { armDims, armJoint, armPose, armRadius, foreR } from "./bracos.js";
import { bandMesh } from "./malhas.js";
import { SMN, SMO, hid, hz, raster, rasterH, rasterS, setSMO, setSMS, sm, visAt, zb } from "./zbuffer.js";
import { restGround } from "./cena.js";
import { FS, FSRaw, shadowMesh } from "./sombra.js";
import { FA, FB, FH, FR, Fc, blurPlain, makeFields } from "./campos.js";
import { calfR, legDims, thighR } from "./pernas.js";
import { ST } from "./padroes.js";
import { bustLocal, bustTh, bustTw, shoulderWarp } from "./tronco.js";
import { muscleDefs } from "./musculos.js";
import { scapTri } from "./corpo.js";

function scene(p,L,pal,fast,mode){
  setLight(p.lightAz,p.lightEl);
  {const cam=makeXf(Object.assign({},p,{wRot:0})),T=cam([(p.wx||0)-(p.tx||0),(p.wy||0)-(p.ty||0),(p.wz||0)-(p.tz||0)]);setPAN(T);setSPAN([p.panX,p.panY]);setPERSP(p.persp?Math.max(3,p.camDist||20):0)}
  const S=effScale(p),xv0=makeXf(p),xv=v=>camPt(xv0(v)),Mx=makeMat(p),sh=shape(p),M=getMeshes(p,sh);
  /* perspectiva: o manequim mais longe tem linhas mais finas e menos guias */
  {const qz=xv0([0,-5.5,-0.4])[2]+PAN[2],wc=PERSP>0?PERSP/Math.max(0.2*PERSP,PERSP-qz):1,hp=S*wc*14;
   setLWK(PERSP>0?clamp(Math.pow(wc,0.6),0.45,1.2):1);
   if(hp<200)L=Object.assign({},L,{girdle:0,rings:0,merid:0,prop:0,sphere:0,planes:0});
   if(hp<120)L=Object.assign({},L,{anat:0,hidden:0})}
  const ch=chainSetup(p,sh),F=ch.F,tab=ch.tab,A3=ch.A3,A2=ch.A2;
  M.head.tf=[A3];M.earL.tf=[A3];M.earR.tf=[A3];M.bust.tf=tab;
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
    const pa=applyA(A2,[s*0.38,F.yJ-0.9,-0.02]),pb=applyA(Aa,[-s*0.08,-0.8,0.17]);
    const la=applyA(A2,[s*0.62,F.yJ-1.85,-0.7]),lb=applyA(Aa,[-s*0.08,-0.95,-0.13]);
    /* músculo esticado fica mais fino */
    const thin=(P,Q,L0)=>Math.pow(clamp(L0/Math.hypot(P[0]-Q[0],P[1]-Q[1],P[2]-Q[2]),0.45,1),0.8);
    const tp=thin(pa,pb,1.3),tl=thin(la,lb,1.25);
    const pec=proj(bandMesh(pa,pb,mid(pa,pb,fw.map(c=>c*0.1)),0.38*k*tp,0.21*k*tp,fw),Mx,S);
    const lat=proj(bandMesh(la,lb,mid(la,lb,fw.map(c=>-c*0.04)),0.31*k*tl,0.17*k*tl,fw),Mx,S);
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
  const all=[head];if(bust)all.push(bust);arms.forEach(o=>{all.push(o.a,o.f,o.el,o.d,o.pec,o.lat);o.hs.forEach(h=>all.push(h))});legs.forEach(o=>{all.push(o.t,o.kn,o.c,o.an,o.ft);o.toes.forEach(m=>all.push(m))});ears.forEach(e=>all.push(e));
  if(!MULTI){let mx=1;all.forEach(m=>{const n=m.LX.length;for(let i=0;i<n;i+=3){const a=Math.abs(m.LX[i]),b=Math.abs(m.LY[i]);if(a>mx)mx=a;if(b>mx)mx=b}});setSMO(mx+0.3);setSMS(SMN/(2*SMO))}
  /* caixa delimitadora em espaço de câmera (independente de zoom/pan) para o ajuste automático de distância */
  let bbX0=1e9,bbX1=-1e9,bbY0=1e9,bbY1=-1e9;
  all.forEach(m=>{const X=m.X,Y=m.Y,n=X.length;for(let i=0;i<n;i++){const x=X[i],y=Y[i];if(x<bbX0)bbX0=x;if(x>bbX1)bbX1=x;if(y<bbY0)bbY0=y;if(y>bbY1)bbY1=y}});
  const MX=40,MY=26,cXr=(bbX0+bbX1)/2-SPAN[0],cYr=(bbY0+bbY1)/2-SPAN[1],wCam=Math.max(0.05,bbX1-bbX0),hCam=Math.max(0.05,bbY1-bbY0);
  const Sfit=Math.min((W-2*MX)/wCam,(H-2*MY)/hCam)*0.96;
  const fit={zoom:+(Sfit/BASE).toFixed(3),panX:+(-cXr).toFixed(3),panY:+(((CY-H/2)/Sfit)-cYr).toFixed(3)};
  if(mode!=="draw"){
    if(!MULTI){zb.fill(-1e6);hid.fill(-1)}
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
  if(shadow&&mode!=="draw")out.push('<g id="sombra">'+shadow+'</g>');
  /* linhas-guia de proporção: módulo de "cabeças" cobrindo a altura visível inteira */
  if(L.prop&&!MULTI&&mode!=="draw"){
    out.push('<g id="proporcao">');
    const nMod=8,x0=Math.max(16,CX-240),x1=Math.min(W-16,CX+240);
    for(let i=1;i<nMod;i++){
      const yc=bbY0+(bbY1-bbY0)*i/nMod,sy=CY-S*yc;
      out.push('<path d="M'+f1(x0)+' '+f1(sy)+'H'+f1(x1)+'" style="fill:none;stroke:'+pal.coral+';stroke-width:0.6;stroke-dasharray:4 5;opacity:.5"/>');
    }
    out.push('</g>');
  }
  function style(k,hid,wm){
    const s=ST[k];
    return "fill:none;stroke:"+pal[s.c]+";stroke-width:"+f1(s.w*(wm||1)*LWK)+";stroke-linecap:round;stroke-linejoin:round"+(hid?";stroke-dasharray:3 6;opacity:.5":(k==="gdash"||k==="jaxis"?";stroke-dasharray:5 5":""));
  }
  const LS=(()=>{const l=Math.hypot(LD[0],LD[1])||1;return [LD[0]/l,-LD[1]/l]})();
  function emit(k,sx,sy,sz,n,showHid,cen){
    const isSil=k==="sil"||k==="silN"||k==="silH";
    const eps=k==="sil"?0.2:(k==="silN"||k==="silH")?0.05:0.035;
    let dh="",lastH=false;const dv=["","",""];let lastC=-1;
    for(let i=0;i<n-1;i++){
      const v=visAt((sx[i]+sx[i+1])/2,(sy[i]+sy[i+1])/2,(sz[i]+sz[i+1])/2,eps);
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
    if(dh&&(L.hidden||showHid)&&!isSil)out.push('<path d="'+dh+'" style="'+style(k,true)+'"/>');
    const WM=isSil?[0.72,1,1.32]:[1,1,1];
    dv.forEach((d,c)=>{if(d)out.push('<path d="'+d+'" style="'+style(k,false,WM[c])+'"/>')});
  }
  function curve(k,pts,X,showHid){
    X=X||xf;
    const n=pts.length,sx=new Array(n),sy=new Array(n),sz=new Array(n);
    for(let i=0;i<n;i++){const q=X(pts[i]);sx[i]=CX+S*q[0];sy[i]=CY-S*q[1];sz[i]=q[2]}
    emit(k,sx,sy,sz,n,showHid);
  }
  function lineT(k,pts,X){
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
    paths.forEach((d,c)=>{if(d)out.push('<path d="'+d+'" style="'+style(k,false,W3[c])+'"/>')});
  }
  const xb=v=>{const w=bustTw(v[0],v[1],F),A=tab[Math.round(clamp(w,0,3)*64)],q=A.M;return xv([q[0]*v[0]+q[1]*v[1]+q[2]*v[2]+A.T[0],q[3]*v[0]+q[4]*v[1]+q[5]*v[2]+A.T[1],q[6]*v[0]+q[7]*v[1]+q[8]*v[2]+A.T[2]])};
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
  const fillP=(pts,col,op)=>{
    let d="",vis=0;
    for(let i=0;i<pts.length;i++){
      const q=xf(pts[i]),sx=CX+S*q[0],sy=CY-S*q[1];
      d+=(i?"L":"M")+f1(sx)+" "+f1(sy);
      if(visAt(sx,sy,q[2]))vis++;
    }
    if(vis<pts.length*0.7)return;
    out.push('<path d="'+d+'Z" style="fill:'+col+';stroke:none'+(op?';opacity:'+op:'')+'"/>');
  };
  const arr=(fn,a0,a1,n)=>{const o=[];for(let i=0;i<=n;i++)o.push(fn(a0+(a1-a0)*i/n));return o};
  const hp=(y,th,off)=>headPt(y,th,p,sh,off);

  out.push('<g id="corpo">');
  /* corpo: preenchimento e sombras vetorizados a partir dos campos por pixel */
  const hSil=silhouette(head),bSil=bust?silhouette(bust):[];
  if(!fast&&(L.fill||L.shade)){
    if(mode!=="draw"){hz.fill(-1e6);sm.fill(-9);hid.fill(-1);all.forEach(m=>{rasterH(m);rasterS(m)})}
    makeFields(!!L.shade);
    if(L.fill){const d=contourPath(Fc);if(d)out.push('<path d="'+d+'" style="fill:'+pal.fill+';stroke:none;fill-rule:evenodd"/>')}
    if(L.shade){
      const dh=contourPath(FH);if(dh)out.push('<path d="'+dh+'" style="fill:'+pal.shade1+';stroke:none;fill-rule:evenodd;opacity:.5"/>');
      const d1=contourPath(FA),d2=contourPath(FB);
      if(d1)out.push('<path d="'+d1+'" style="fill:'+pal.shade1+';stroke:none;fill-rule:evenodd"/>');
      if(d2)out.push('<path d="'+d2+'" style="fill:'+pal.shade2+';stroke:none;fill-rule:evenodd"/>');
      const dr=contourPath(FR);if(dr)out.push('<path d="'+dr+'" style="fill:'+pal.shade1+';stroke:none;fill-rule:evenodd;opacity:.85"/>');
    }
  }else if(L.fill){
    out.push('<path d="'+fillPath(hSil,head)+(bust?fillPath(bSil,bust):"")+arms.map(o=>fillPath(silhouette(o.a),o.a)+fillPath(silhouette(o.f),o.f)+o.hs.map(h=>fillPath(silhouette(h),h)).join("")).join("")+legs.map(o=>[o.t,o.c,o.ft].map(m=>fillPath(silhouette(m),m)).join("")).join("")+'" style="fill:'+pal.fill+';stroke:none"/>');
  }

  out.push('</g>');
  out.push('<g id="guias">');
  /* esfera guia */
  if(L.sphere){
    const c0=xf([0,0,0]),cx0=CX+S*c0[0],cy0=CY-S*c0[1];
    out.push('<circle cx="'+f1(cx0)+'" cy="'+f1(cy0)+'" r="'+f1(S)+'" style="'+style("sphere",false)+'"/>');
    out.push('<path d="M'+f1(cx0-6)+' '+f1(cy0)+'H'+f1(cx0+6)+'M'+f1(cx0)+' '+f1(cy0-6)+'V'+f1(cy0+6)+'" style="'+style("sphere",false)+'"/>');
  }
  /* planos laterais: círculo de corte desenhado sobre a superfície */
  if(L.planes){
    [-1,1].forEach(s=>{
      const pts=arr(a=>{
        const y=0.05+0.56*Math.sin(a),z=0.56*Math.cos(a);
        const r=ringAt(y,p,sh),cs=clamp((z-r[1])/r[2],-1,1);
        return [s*r[0]*Math.sqrt(1-cs*cs)*1.004,y,z];
      },0,2*Math.PI,72);
      curve("plane",pts);
    });
  }
  /* contornos transversais */
  if(L.rings){
    const full=y=>arr(th=>hp(y,th,0.004),0,2*Math.PI,140);
    const part_=y=>arr(th=>hp(y,th,0.004),-110*D,110*D,90);
    curve("ring",full(t));
    curve("axis",full(0));
    curve("ring",full(eyeY));
    curve("ring",part_(-t));
    curve("ring",part_(mouthY));
  }
  /* linhas de proporção estendidas, com marcas nas pontas */
  if(L.rings){
    [0.11,eyeY,-t].forEach(y=>{
      const r=ringAt(y,p,sh),xe=r[0]+0.3;
      curve("ext",arr(x=>[x,y,r[1]],-xe,xe,40));
      [-1,1].forEach(q=>curve("ext",[[q*xe,y-0.035,r[1]],[q*xe,y+0.035,r[1]]]));
    });
  }
  /* meridianos: eixo central na frente (segue o perfil) e atrás, mais os planos do rosto */
  if(L.merid){
    curve("axis",arr(i=>hp(i,0,0.004),1,chinY+0.015,110));
    curve("ring",arr(i=>hp(i,Math.PI,0),1,-0.85,60));
    [-1,1].forEach(s=>curve("ring",arr(i=>hp(i,s*38*D,0.004),t,-t,50)));
  }
  /* linha da mandíbula: da orelha ao queixo, sobre a superfície */
  if(L.jaw){
    [-1,1].forEach(s=>{
      curve("jaw",arr(k=>{
        const y=lerp(-0.5,chinY+0.01,k);
        return hp(y,s*lerp(92,0,Math.pow(k,1.3))*D,0.004);
      },0,1,50));
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
    const jc=(P,r)=>{const q=xv(P),x=CX+S*q[0],y=CY-S*q[1];
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
      lineT("anat",arr(u=>bp(lerp(-0.7,F.yJ+0.04,u),s*lerp(112,16,u)*D,0.012),0.22,0.97,26),xb);
      lineT("anat",arr(q=>{const x=s*(0.1+q*(F.W-0.12)),yc=F.yJ+0.03+0.04*q+0.035*Math.sin(Math.PI*q);return bp(yc,bustTh(yc,x,true,p,F),0.012)},0.08,0.97,30),xb);
      /* bordas dos músculos (mesmas formas que geram o relevo) */
      const Mu=muscleDefs(F),B=F.B,mu=B.mus;
      const cr=(Pts,n)=>{const o=[];for(let i=0;i<Pts.length-1;i++){const a=Pts[Math.max(0,i-1)],b=Pts[i],c=Pts[i+1],d=Pts[Math.min(Pts.length-1,i+2)];
        for(let j=0;j<n;j++){const t=j/n,t2=t*t,t3=t2*t;o.push([0,1].map(k=>0.5*(2*b[k]+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t2+(-a[k]+3*b[k]-3*c[k]+d[k])*t3)))}}
        o.push(Pts[Pts.length-1]);return o};
      const onF=(Q,side)=>Q.map(([ax,yy])=>{const y=F.yJ+yy;return bp(y,bustTh(y,s*ax,side,p,F),0.012)});
      const pec=Mu.pec,ms=B.breast<0.35;
      if(ms)lineT("mus",onF(cr(pec.slice(3,10),7),true),xb);
      lineT("mus",onF(cr(pec.slice(1,5),6),true),xb);
      if(!ms){const yb=-1.28-0.3;lineT("mus",onF(arr(q=>[lerp(0.26,0.9,q),yb+0.22*Math.pow(2*q-1,2)*(q<0.5?0.6:1)],0,1,22),true),xb)}
      if(mu*(1-B.fat)*(1-0.75*B.fem)>0.16){
        Mu.abs.forEach((P,i)=>{if(i<3)lineT("mus",onF(arr(q=>[lerp(0.04,P[3][0],q),P[3][1]+0.02-0.04*q*q],0,1,10),true),xb)});
        const a0=Mu.abs[0],a3=Mu.abs[3];
        lineT("mus",onF(cr([[a0[1][0]+0.01,a0[1][1]],[a0[2][0]+0.02,a0[2][1]],[Mu.abs[2][2][0]+0.02,Mu.abs[2][2][1]],[a3[2][0]+0.01,a3[2][1]],[a3[3][0],a3[3][1]]],6),true),xb);
        lineT("mus",onF(cr([[Mu.obl[0][0],Mu.obl[0][1]],[Mu.obl[1][0]*0.98,Mu.obl[1][1]]],8),true),xb);
        /* dedos do serrátil */
        for(let i=0;i<4;i++){const yc=-1.2-0.3*i,ac=1.18+0.06*i;lineT("mus",arr(q=>{const a=ac+0.16*(q-0.5),y=F.yJ+yc-0.09+0.12*(q-0.5);return bp(y,s*a,0.012)},0,1,6),xb)}
      }
      {const T=scapTri(p,F,s);const ed=(P,Q,n)=>lineT("anat",arr(k=>{const ax=lerp(P[0],Q[0],k),y=lerp(P[1],Q[1],k);return bp(y,bustTh(y,s*ax,false,p,F),0.014)},0,1,n),xb);
       const sp=cr(T.poly.concat([T.poly[0],T.poly[1]]),5).slice(0,-5);lineT("mus",sp.map(([ax,y])=>bp(y,bustTh(y,s*ax,false,p,F),0.014)),xb);
       ed(T.sp0,T.sp1,16);ed(T.poly[4],[F.W-0.4,F.yJ-0.98],12);
       lineT("mus",onF(cr([[0.05,F.yJ-2.9-F.yJ],[0.3,-1.6],[T.sp0[0]+0.02,T.sp0[1]-F.yJ-0.05]],8),false),xb);}
    });
    curve("anat",arr(th=>{const y=lerp(F.yJ+0.14,F.yC7,(1-Math.cos(th))/2);return bp(y,th,0.01)},0,2*Math.PI,90),xb);
    lineT("anat",arr(x=>{const y=F.yJ-2.35-0.6*Math.pow(x/0.75,2)-0.04;return bp(y,bustTh(y,x,true,p,F),0.012)},-0.72,0.72,30),xb);
    lineT("anat",arr(x=>{const y=F.yJ+0.05+3*x*x;return bp(y,bustTh(y,x,true,p,F),0.012)},-0.11,0.11,10),xb);
    lineT("anat",arr(y=>bp(y,Math.PI,0.012),F.yC7-0.15,F.yHip-0.25,40),xb);
    for(let y=F.yC7-0.05;y>F.yHip+0.1;y-=0.3)lineT("mus",arr(x=>bp(y,Math.PI+x,0.012),-0.06,0.06,4),xb);
    lineT("mus",arr(y=>bp(y,0,0.012),F.yJ-1.45,F.yNav+0.06,20),xb);
    /* umbigo, linha inguinal, glúteos */
    lineT("anat",arr(a=>{const x=0.03*Math.cos(a),y=F.yNav+0.035*Math.sin(a);return bp(y,bustTh(y,x,true,p,F),0.01)},0,2*Math.PI,12),xb);
    [-1,1].forEach(s=>{
      /* linha da "calcinha": abertura da perna na frente (do quadril até a virilha) e o "V" do sacro atrás */
      lineT("anat",arr(k=>{const ax=lerp(0.97*F.B.hip*0.93,0.04,k),y=lerp(F.yHip+0.42,F.yCr+0.06,Math.pow(k,1.25))-0.1*Math.sin(Math.PI*k);return bp(y,bustTh(y,s*ax,true,p,F),0.012)},0,1,24),xb);
      lineT("mus",arr(k=>{const ax=lerp(0.9*F.B.hip*0.93,0.03,k),y=lerp(F.yHip+0.38,F.yHip-0.3,Math.pow(k,1.3));return bp(y,bustTh(y,s*ax,false,p,F),0.012)},0,1,20),xb);
    });
    lineT("anat",arr(y=>bp(y,Math.PI,0.012),F.yHip-0.1,F.yCr+0.05,14),xb);
    /* braços: borda do deltoide, bíceps, tríceps e braquiorradial (com a torção do antebraço) */
    arms.forEach(o=>{
      const A=armDims(p),s=o.s,X=v=>xv(applyA(o.Aa,v)),L1=A.L1,L2=A.L2;
      const onA=(u,th,off)=>{const r=armRadius(u,th,A,s)+(off||0.012);return [r*Math.sin(th),-u,r*Math.cos(th)]};
      lineT("mus",arr(ph=>{const th=s*Math.PI/2+ph,u=L1*(0.47-0.3*Math.pow(Math.abs(ph)/1.95,1.3));return onA(u,th,0.03)},-1.9,1.9,40).map(X),v=>v);
      [-0.62,0.62].forEach(a=>lineT("mus",arr(u=>onA(u,a*(1+0.15*Math.sin(Math.PI*u/L1)),0.012),0.4*L1,0.88*L1,16).map(X),v=>v));
      lineT("mus",arr(q=>{const th=Math.PI+(q-0.5)*1.2,u=L1*(0.72-0.34*Math.pow(Math.abs(2*q-1),1.6));return onA(u,th)},0,1,22).map(X),v=>v);
      const XF=(u,th)=>{const t=clamp(u/L2,0,1),Afu=comp(A2,{M:mmul(o.ap.Mb,rotM(o.ap.pr*t,0,0)),T:o.ap.fore.T}),r=foreR(u,th,A,s)+0.012;return xv(applyA(Afu,[r*Math.sin(th),-u,r*Math.cos(th)]))};
      lineT("mus",arr(u=>XF(u,s*(0.75+0.25*u/L2)),0.06*L2,0.7*L2,16),v=>v);
      lineT("mus",arr(u=>XF(u,-s*0.55),0.12*L2,0.55*L2,12),v=>v);
      /* vinco na dobra do cotovelo */
      const el=s>0?p.elbowL:p.elbowR;
      if(el>25)lineT("mus",arr(a=>{const r=0.34*A.k;return xv(applyA(o.Ae,[r*Math.sin(a),0.02*A.k,r*Math.cos(a)]))},-0.8,0.8,12),v=>v);
    });
    /* pernas: oval da patela, maléolos, divisa da panturrilha e linha da canela */
    legs.forEach(o=>{
      const A=legDims(p),k=A.k,s=o.s,Xk=v=>xv(applyA(o.Akn,v)),Xc=v=>xv(applyA(o.Acf,v));
      lineT("mus",arr(a=>[0.15*k*Math.cos(a),0.06*k+0.19*k*Math.sin(a),0.42*k],0,2*Math.PI,24).map(Xk),v=>v);
      const kf=s>0?p.kneeFlexL:p.kneeFlexR,hf=s>0?p.hipFlexL:p.hipFlexR,Xt=v=>xv(applyA(o.Ath,v));
      /* vinco atrás do joelho quando dobra */
      if(kf>25)lineT("mus",arr(a=>{const r=0.36*k;return [-r*Math.sin(a),-0.02*k,-r*Math.cos(a)]},-0.85,0.85,14).map(Xk),v=>v);
      /* dobra do glúteo (some quando a coxa sobe) */
      if(hf<45)lineT("mus",arr(a=>{const th=Math.PI+s*a,u=A.L1*(0.19+0.035*a),r=thighR(u,th,A,s)+0.012;return [r*Math.sin(th),-u,r*Math.cos(th)]},0.95,-0.35,16).map(Xt),v=>v);
      [[-1,0.07],[1,-0.06]].forEach(([sd,dy])=>lineT("mus",arr(a=>[s*sd*0.205*k,-A.L2+dy*k+0.06*k*Math.sin(a),0.06*k*Math.cos(a)],0,2*Math.PI,14).map(Xc),v=>v));
      lineT("mus",arr(u=>{const th=Math.PI-s*0.08,r=calfR(u,th,A,s)+0.012;return [r*Math.sin(th),-u,r*Math.cos(th)]},0.12*A.L2,0.5*A.L2,14).map(Xc),v=>v);
      lineT("mus",arr(u=>{const th=s*0.18,r=calfR(u,th,A,s)+0.012;return [r*Math.sin(th),-u,r*Math.cos(th)]},0.1*A.L2,0.85*A.L2,16).map(Xc),v=>v);
    });
    /* crista ilíaca (borda de cima da pelve) dos lados e borda do grande dorsal nas costas */
    [-1,1].forEach(s=>{
      lineT("anat",arr(a=>{const y=F.yHip+0.52+0.07*Math.sin(Math.PI*(a-0.9)/1.7);return bp(y,s*a,0.012)},0.95,2.45,22),xb);
      lineT("anat",arr(k=>{const ax=lerp(F.W-0.42,0.8,k),y=lerp(F.yJ-1.15,F.yWst+0.2,k);return bp(y,bustTh(y,s*ax,false,p,F),0.012)},0,1,20),xb);
    });
  }
  out.push('</g>');
  out.push('<g id="feicoes">');
  /* sobrancelhas, pálpebras, nariz e boca */
  const surfX=(y,x)=>Math.asin(clamp(x/ringAt(y,p,sh)[0],-0.99,0.99));
  if(L.feat){
    [-1,1].forEach(s=>{
      const browPt=(u,dy)=>{
        const y=0.10+0.045*Math.sin(Math.PI*Math.pow(u,0.8))-0.04*u+dy;
        return hp(y,s*(10+36*u)*D,0.01);
      };
      if(p.browW>0.002){
        const up=[],lo=[];
        for(let i=0;i<=24;i++){
          const u=i/24,th=p.browW*(0.9-0.25*u)*(1-0.7*Math.pow(u,2.2))+0.004;
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
    /* boca: lábio superior e inferior preenchidos, sombra sob o lábio */
    {
      const mY=x=>mouthY+0.016*Math.pow(x/0.2,2);
      const top=x=>mouthY+0.034*(1-Math.pow(Math.abs(x)/0.2,1.3))*(1-0.35*gauss(x,0,0.035))+0.016*Math.pow(x/0.2,2);
      const bot=x=>mouthY-0.07-0.02*(1-Math.pow(x/0.13,2));
      const H=(x,y,o)=>hp(y,surfX(y,x),o||0.008);
      fillP(arr(x=>H(x,top(x)),-0.2,0.2,24).concat(arr(x=>H(x,mY(x)),0.2,-0.2,24)),pal.shade3);
      fillP(arr(x=>H(x,mY(x)),-0.2,0.2,24).concat(arr(x=>H(x,mY(x)-0.055*Math.max(0,1-Math.pow(x/0.2,2))-0.004),0.2,-0.2,24)),pal.shade1);
      fillP(arr(x=>H(x,bot(x)-0.005,0.006),-0.13,0.13,16).concat(arr(x=>H(x,bot(x)-0.05*(1-Math.pow(x/0.13,2)),0.006),0.13,-0.13,16)),pal.shade2,0.8);
    }
    const wing=[[0.105,-0.76],[0.14,-0.85],[0.17,-0.93],[0.14,-0.985],[0.07,-1.0],[0,-1.0]];
    const half=wing.map(w=>[w[0],w[1]*t]);
    const poly2=half.slice().reverse().map(w=>[-w[0],w[1]]).concat(half.slice(1));
    curve("feat",poly2.map(w=>hp(w[1],surfX(w[1],w[0]),0.008)));
    curve("feat",arr(x=>{const y=mouthY+0.016*Math.pow(x/0.2,2);return hp(y,surfX(y,x),0.008)},-0.2,0.2,30));
    curve("feat",arr(x=>{const y=mouthY+0.034*(1-Math.pow(Math.abs(x)/0.2,1.3))*(1-0.35*gauss(x,0,0.035))+0.016*Math.pow(x/0.2,2);return hp(y,surfX(y,x),0.008)},-0.2,0.2,40));
    curve("feat",arr(x=>{const y=mouthY-0.07-0.02*(1-Math.pow(x/0.13,2));return hp(y,surfX(y,x),0.008)},-0.13,0.13,24));
  }
  out.push('</g>');
  out.push('<g id="olhos">');
  /* olhos 2D: sombra da órbita, amêndoa preenchida, íris recortada (opcional), pálpebras e prega */
  if(L.eyes){
    const w=0.30*p.eyeSize,hu=0.062*p.eyeSize*p.eyeOpen,hl=0.036*p.eyeSize*p.eyeOpen;
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
      if(p.eyeStyle>=0.5){
        const ri=0.066*p.eyeSize;
        const ip=[];
        for(let i=0;i<48;i++){
          const a=i/48*2*Math.PI,ex=ri*Math.cos(a),ey=ri*Math.sin(a),q=clamp(ex/w+0.5,0,1);
          ip.push(E(ex,clamp(ey,lo(q)*0.98,up(q)*0.98),0.012));
        }
        fillP(ip,pal.shade2);
        const pp=arr(a=>E(0.024*p.eyeSize*Math.cos(a),0.024*p.eyeSize*Math.sin(a),0.013),0,2*Math.PI,16);
        fillP(pp,pal.ink);
        fillP(arr(a=>E(0.012*p.eyeSize+0.007*Math.cos(a),0.02*p.eyeSize+0.007*Math.sin(a),0.014),0,2*Math.PI,10),"#fff");
      }
      /* linhas: pálpebra superior grossa, inferior fina, prega, cantos */
      curve("eyeU",arr(q=>E(X(q),up(q)),-0.04,1.02,32));
      curve("feat",arr(q=>E(X(q),lo(q)),0.03,0.97,28));
      curve("feat",arr(q=>{const r=0.1+0.8*q;return E(X(r),up(r)+0.026*p.eyeSize+0.01*Math.sin(Math.PI*q),0.01)},0,1,20));
      curve("feat",arr(k=>E(X(1)+0.012*k,up(1)-0.004+0.005*k),0,1,4));
      curve("feat",arr(a=>E(X(0)+0.012*Math.cos(a)+0.012,lo(0)+0.012*Math.sin(a)+0.006),-0.5,2.8,10));
    });
  }
  out.push('</g>');
  out.push('<g id="orelhas">');
  /* orelhas: hélice, anti-hélice, concha preenchida, trago e lóbulo sobre a malha 3D */
  if(L.ears){
    [-1,1].forEach(s=>{
      const E=(u,v)=>earSurf(p,sh,s,u,v);
      if(s*xfd([1,0,0])[2]>0.05)fillP(arr(a=>E(0.12+0.34*Math.cos(a),-0.05+0.36*Math.sin(a)),0,2*Math.PI,28),pal.shade2,0.9);
      curve("ear",arr(a=>E(Math.cos(a),Math.sin(a)),0,2*Math.PI,64));
      curve("ear",arr(a=>E(0.8*Math.cos(a)-0.02,0.84*Math.sin(a)),35*D,335*D,52));
      curve("ear",arr(k=>E(-0.07-0.38*Math.sin(Math.PI*k),0.62-1.12*k),0,1,22));
      curve("ear",arr(k=>E(lerp(0.25,-0.1,k),lerp(0.78,0.5,k)),0,1,8));
      curve("ear",arr(a=>E(0.8+0.1*Math.cos(a),-0.18+0.16*Math.sin(a)),-80*D,100*D,12));
      curve("ear",arr(k=>E(lerp(-0.5,0.45,k),-0.74+0.06*Math.sin(Math.PI*k)),0,1,14));
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
      draw(o.a,silhouette(o.a),"silN");draw(o.f,silhouette(o.f),"silN");draw(o.el,silhouette(o.el),"silN");draw(o.d,silhouette(o.d),"silN");draw(o.pec,silhouette(o.pec),"silN");draw(o.lat,silhouette(o.lat),"silN");
      o.hs.forEach(h=>draw(h,silhouette(h),"silH"));
    });
    legs.forEach(o=>{
      [o.t,o.c,o.kn,o.an,o.ft].forEach(m=>draw(m,silhouette(m),"silN"));o.toes.forEach(m=>draw(m,silhouette(m),"silH"))});
  }

  out.push('</g>');
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
  const info={handles,S,t,chinY,eyeY,fit,bb,depth:PAN[2],
    brow:axes(a=>[p.skull*Math.sin(a),0,Math.cos(a)]),
    mer:axes(a=>[0,Math.sin(a),Math.cos(a)])};
  return {svg:out.join(""),info};
}

export { scene };
