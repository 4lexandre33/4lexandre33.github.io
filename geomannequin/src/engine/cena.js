/* GeoMannequin — cena com vários manequins: ordem de profundidade, chão, horizonte e pontos de fuga, enquadramento e seleção */
import { shape } from "./cabeca.js";
import { bustFrame } from "./corpo.js";
import { hipJoint, legDims } from "./pernas.js";
import { BASE, CX, CY, D, H, W, clamp, f1 } from "./matematica.js";
import { makeXf } from "./camera.js";
import { PAN, PERSP, camPt, effScale, setCUR_ID, setMULTI, setPAN, setPERSP, setSPAN } from "./projecao.js";
import { HN, HW, RS, SMN, SMO, hid, hz, setSMO, setSMS, sm, zb } from "./zbuffer.js";
import { scene } from "./desenho.js";
import { ULTIMA, pickCamadas, renderCamadas, setUltima } from "./camadas.js";

/* ===== Cena com vários manequins: z-buffer comum, cada manequim com suas cores ===== */
function restGround(p){const S=shape(p),F=bustFrame(p,S),A=legDims(p);return hipJoint(F,1)[1]-A.L1-A.L2-A.hA}
/* enquadramento em perspectiva: o tamanho na tela vem da distância da câmera (dolly), não do zoom */
function zoomToDist(p,z){return (W/2)*(p.lens||50)/(18*BASE*Math.max(0.05,z))}
function distToZoom(p){return (W/2)*(p.lens||50)/(18*BASE*Math.max(3,p.camDist||30))}
/* area (opcional): recorte central {w, h} do quadro (roteiro de quadros com formato 16:9, 1:1…) — cabe nele em vez do palco inteiro */
function fitFromBB(bb,area){
  const AW=area?area.w:W,AH=area?area.h:H,MX=area?AW*0.067:40,MY=area?AH*0.037:26,w=Math.max(0.05,bb[1]-bb[0]),h=Math.max(0.05,bb[3]-bb[2]),S=Math.min((AW-2*MX)/w,(AH-2*MY)/h)*0.96;
  return {zoom:+(S/BASE).toFixed(3),panX:+(-(bb[0]+bb[1])/2).toFixed(3),panY:+(((CY-H/2)/S)-(bb[2]+bb[3])/2).toFixed(3)};
}
/* chão: grade no plano y = gy (coordenadas do mundo), vista pela câmera da cena */
function floorSvg(p,gy,pal,R){
  const cam=makeXf(Object.assign({},p,{wRot:0})),S=effScale(p),o=[];
  setPAN(cam([-(p.tx||0),-(p.ty||0),-(p.tz||0)]));setSPAN([p.panX,p.panY]);setPERSP(p.persp?Math.max(3,p.camDist||20):0);
  const pt=(x,z)=>{const q=camPt(cam([x,gy,z]));return f1(CX+S*q[0])+" "+f1(CY-S*q[1])};
  /* linhas do chão em segmentos curtos: em perspectiva, as partes atrás da câmera são descartadas */
  const ok=(x,z)=>{const q=cam([x,gy,z]);return !PERSP||q[2]+PAN[2]<PERSP*0.85};
  let d="";const seg=(x0,z0,x1,z1)=>{const n=12;let pen=false;for(let k=0;k<=n;k++){const x=x0+(x1-x0)*k/n,z=z0+(z1-z0)*k/n;if(ok(x,z)){d+=(pen?"L":"M")+pt(x,z);pen=true}else pen=false}};
  for(let i=-R;i<=R;i+=2){seg(i,-R,i,R);seg(-R,i,R,i)}
  o.push('<path d="'+d+'" style="fill:none;stroke:'+pal.cobalt+';stroke-width:0.7;opacity:.35"/>');
  d="";seg(-R,0,R,0);o.push('<path d="'+d+'" style="fill:none;stroke:'+pal.coral+';stroke-width:1.1;opacity:.6"/>');
  d="";seg(0,-R,0,R);o.push('<path d="'+d+'" style="fill:none;stroke:'+pal.cobalt+';stroke-width:1.1;opacity:.7"/>');
  return o.join("");
}
/* horizonte (altura dos olhos) e pontos de fuga das direções do chão e da vertical */
function vanishSvg(p,pal,infos){
  if(!p.persp)return "";
  const cam=makeXf(Object.assign({},p,{wRot:0})),S=effScale(p),d=Math.max(3,p.camDist||30),o=[];
  const vp=v=>{const c=cam(v);if(c[2]>-1e-3)return null;return [CX+S*(d*c[0]/(-c[2])+p.panX),CY-S*(d*c[1]/(-c[2])+p.panY)]};
  const inside=q=>q&&q[0]>-W&&q[0]<2*W&&q[1]>-H&&q[1]<2*H;
  /* horizonte: reta pelos pontos de fuga de duas direções horizontais que se afastam */
  const hs=[];for(let a=0;a<360;a+=3){const v=[Math.sin(a*D),0,Math.cos(a*D)],c=cam(v);if(c[2]<-0.25){const q=vp(v);if(q)hs.push(q)}}
  if(hs.length>=2){
    let A=hs[0],B=hs[0],best=-1;for(const q1 of hs)for(const q2 of hs){const dd=Math.hypot(q1[0]-q2[0],q1[1]-q2[1]);if(dd>best){best=dd;A=q1;B=q2}}
    if(best>1&&Math.abs(B[0]-A[0])>1e-3){
      /* reta do horizonte recortada à tela (só desenha se passar pela tela) */
      const m=(B[1]-A[1])/(B[0]-A[0]),yAt=x=>A[1]+m*(x-A[0]),y0=yAt(-10),y1=yAt(W+10);
      if(Math.max(y0,y1)>0&&Math.min(y0,y1)<H){
        o.push('<path d="M-10 '+f1(y0)+'L'+(W+10)+' '+f1(y1)+'" style="fill:none;stroke:'+pal.coral+';stroke-width:1.2;stroke-dasharray:8 5;opacity:.8"/>');
        const ly=yAt(W-10);
        if(ly>14&&ly<H-4)o.push('<text x="'+f1(W-10)+'" y="'+f1(ly-5)+'" text-anchor="end" style="font:10px system-ui,sans-serif;fill:'+pal.coral+'">horizonte (altura dos olhos)</text>')}
    }
  }
  /* pontos de fuga: eixos do chão (X e Z) e vertical */
  const pts=[];
  [[[1,0,0],"PF1"],[[-1,0,0],"PF1"],[[0,0,1],"PF2"],[[0,0,-1],"PF2"],[[0,-1,0],"PF3"],[[0,1,0],"PF3"]].forEach(([v,n])=>{const q=vp(v);if(q&&inside(q)&&!pts.some(x=>x.n===n))pts.push({q,n,v})});
  const feet=[];(infos||[]).forEach(i=>{if(!i||!i.handles)return;i.handles.forEach(h=>{if(h.k==="head"||h.k==="ankle")feet.push([h.x,h.y])})});
  pts.forEach(({q,n})=>{
    let dd="";feet.forEach(f=>{dd+="M"+f1(q[0])+" "+f1(q[1])+"L"+f1(f[0])+" "+f1(f[1])});
    if(dd)o.push('<path d="'+dd+'" style="fill:none;stroke:'+pal.cobalt+';stroke-width:0.6;stroke-dasharray:3 5;opacity:.55"/>');
    o.push('<circle cx="'+f1(q[0])+'" cy="'+f1(q[1])+'" r="5" style="fill:none;stroke:'+pal.coral+';stroke-width:1.5"/>');
    o.push('<text x="'+f1(q[0]+8)+'" y="'+f1(q[1]-8)+'" style="font:bold 10px system-ui,sans-serif;fill:'+pal.coral+'">'+n+'</text>');
  });
  return o.join("");
}
/* list: [{p, pal}] — p já contém câmera, posição (wx, wy, wz) e giro (wRot) */
function mixC(a,b,t){const A=/^#([0-9a-f]{6})$/i.exec(a||""),B=/^#([0-9a-f]{6})$/i.exec(b||"");if(!A||!B)return a;const x=parseInt(A[1],16),y=parseInt(B[1],16);
  return "#"+[16,8,0].map(sh=>{const u=x>>sh&255,v=y>>sh&255;return Math.round(u+(v-u)*t).toString(16).padStart(2,"0")}).join("")}
function atmoPal(pal,bg,t){const o={};for(const k in pal)o[k]=mixC(pal[k],bg,k==="ink"?t*0.85:t);return o}
function figDepth(p){const cam=makeXf(Object.assign({},p,{wRot:0}));return cam([(p.wx||0)-(p.tx||0),(p.wy||0)-6-(p.ty||0),(p.wz||0)-(p.tz||0)])[2]}
/* opts.exato: todos num z-buffer comum (modo antigo); sem ele, com 2 ou mais manequins visíveis, a cena é montada em camadas (camadas.js) */
function renderScene(list0,L,fast,floor,opts){
  setUltima(null);
  if((!(opts&&opts.exato)&&list0.filter(o=>!o.p._oculto).length>1)||(list0.objetos&&list0.objetos.length))return renderCamadas(list0,L,fast,floor,opts);
  let floorStr="";
  if(floor&&list0.length){let R=floor;list0.forEach(o=>R=Math.max(R,2*Math.ceil((Math.max(Math.abs(o.p.wx||0),Math.abs(o.p.wz||0))+5)/2)));floorStr=floorSvg(list0[0].p,list0[0].gy||0,list0[0].pal,Math.min(R,80))}
  /* quem está atrás da câmera (ou colado nela) não é desenhado */
  const vis=list0.map(o=>!o.p._oculto&&(!o.p.persp||figDepth(o.p)<Math.max(3,o.p.camDist||30)-3));
  const idx=list0.map((o,i)=>i).filter(i=>vis[i]),list=idx.map(i=>list0[i]);
  const hidden={hidden:true,handles:[],bb:null,fit:null};
  const remap=inf=>{const out=list0.map(()=>hidden);idx.forEach((i,k)=>out[i]=inf[k]);return out};
  const guides=infos=>L.horizon&&list0.length?vanishSvg(list0[0].p,list0[0].pal,infos):"";
  if(!list.length)return {svg:floorStr+guides([]),infos:remap([])};
  if(list.length===1){setCUR_ID(0);const r=scene(list[0].p,L,list[0].pal,fast);return {svg:floorStr+r.svg+guides([r.info]),infos:remap([r.info])}}
  setMULTI(true);
  zb.fill(-1e6);hz.fill(-1e6);sm.fill(-9);hid.fill(-1);
  let ext=0;list.forEach(o=>ext=Math.max(ext,Math.hypot((o.p.wx||0)-(o.p.tx||0),(o.p.wz||0)-(o.p.tz||0))));
  setSMO(ext+16);setSMS(SMN/(2*SMO));
  const infos=[];
  try{
    list.forEach((o,i)=>{setCUR_ID(i);infos[i]=scene(o.p,L,o.pal,fast,"depth").info});
    /* perspectiva atmosférica: quem está mais longe perde contraste e se aproxima da cor do fundo */
    const at=list[0].p.persp?(list[0].p.atmo||0):0,bg=list[0].p.bg;
    if(at>0&&bg){const z=list.map(o=>figDepth(o.p)),zn=Math.max(...z);
      list.forEach((o,i)=>{const t=at*clamp((zn-z[i])/28,0,0.8);if(t>0.01)o=list[i]={p:o.p,pal:atmoPal(o.pal,bg,t),gy:o.gy}})}
    const order=list.map((o,i)=>i).sort((a,b)=>infos[a].depth-infos[b].depth);
    let svg=floorStr+'<g id="sombras">'+infos.map(i=>i.shadow||"").join("")+'</g>';
    order.forEach(i=>{setCUR_ID(i);const r=scene(list[i].p,L,list[i].pal,fast,"draw");infos[i]=r.info;svg+='<g data-m="'+idx[i]+'">'+r.svg+'</g>'});
    svg+=guides(infos);
    return {svg,infos:remap(infos)};
  }finally{setMULTI(false)}
}
function ptW(p,v){const xv0=makeXf(p),cam=makeXf(Object.assign({},p,{wRot:0})),T=cam([(p.wx||0)-(p.tx||0),(p.wy||0)-(p.ty||0),(p.wz||0)-(p.tz||0)]),qz=xv0(v)[2]+T[2],d=Math.max(3,p.camDist||30);return p.persp?d/Math.max(0.2*d,d-qz):1}
function pickAt(x,y){if(ULTIMA)return pickCamadas(x,y);const k=Math.floor(y/RS)*HW+Math.floor(x/RS);return k>=0&&k<HN?hid[k]:-1}

export { restGround, zoomToDist, distToZoom, fitFromBB, floorSvg, vanishSvg, mixC, atmoPal, figDepth, renderScene, ptW, pickAt };
