import {CX,CY,applyA} from "./matematica.js";
import {makeXf} from "./camera.js";
import {effScale} from "./projecao.js";
import {colliderRig} from "./contact-v2.js";
import {paraMundo,doMundo} from "./colisao-cena.js";
import {shape,headPt} from "./cabeca.js";
import {chainSetup} from "./cadeia.js";
import {ossosDoCorpo} from "./esqueleto.js";

const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cruz=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function raioTela(p,x,y){
  const escala=effScale(p),d=Math.max(3,p.camDist||30);
  const u=(x-CX)/escala-p.panX,v=(CY-y)/escala-p.panY;
  const alvo=[p.tx||0,p.ty||0,p.tz||0],cam=makeXf({...p,wRot:0});
  const eixos=[[1,0,0],[0,1,0],[0,0,1]].map(cam);
  const origem=p.persp?[0,0,d]:[u,v,200],direcao=p.persp?[u,v,-d]:[0,0,-1];
  return {origem:eixos.map((e,i)=>dot(e,origem)+alvo[i]),
    direcao:eixos.map(e=>dot(e,direcao)/Math.hypot(...direcao))};
}
function marcarTecido(p,x,y,modo){
  const {origem,direcao}=raioTela(p,x,y);
  const caps=colliderRig(p,{level:"coarse"}).caps;
  // Distância assinada à união das cápsulas do manequim ativo. Marchar a
  // partir da câmera seleciona a primeira superfície visível em cada vista.
  let t=0;
  for(let i=0;i<192&&t<400;i++){
    const q=origem.map((v,k)=>v+t*direcao[k]);
    let distancia=Infinity;
    for(const c of caps){
      const eixo=sub(c.b,c.a),v=sub(q,c.a);
      const pos=Math.max(0,Math.min(1,dot(v,eixo)/(dot(eixo,eixo)||1)));
      distancia=Math.min(distancia,Math.hypot(...v.map((n,k)=>n-pos*eixo[k]))-c.r);
    }
    if(distancia<=.002){
      const local=doMundo(p)(q.map((n,k)=>n-.025*direcao[k]));
      const juntas=ossosDoCorpo(p).juntas.filter(j=>["pescoço","ombro","cotovelo","punho","quadril","joelho","tornozelo"].includes(j.nome));
      const j=juntas.reduce((a,b)=>Math.hypot(...sub(a.P,local))<=Math.hypot(...sub(b.P,local))?a:b);
      return {junta:j.nome,lado:j.s,offset:sub(local,j.P),modo};
    }
    t+=distancia;
  }
  return null;
}
function marcarRaiz(p,x,y,comprimento){
  const ray=raioTela(p,x,y),S=shape(p),ch=chainSetup(p,S),mundo=paraMundo(p);
  const rings=[],cols=48,rows=9;
  for(let i=0;i<=rows;i++){
    const h=.1+.85*i/rows;
    rings.push(Array.from({length:cols+1},(_,j)=>{
      const angulo=-180+360*j/cols;
      return {h,angulo,w:mundo(applyA(ch.A3,headPt(h,angulo*Math.PI/180,p,S,.04)))};
    }));
  }
  let tMin=Infinity,raiz=null;
  function testar(a,b,c){
    const u=sub(b.w,a.w),v=sub(c.w,a.w),normal=cruz(ray.direcao,v),det=dot(u,normal);
    if(Math.abs(det)<1e-9)return;
    const delta=sub(ray.origem,a.w),beta=dot(delta,normal)/det;
    if(beta<0||beta>1)return;
    const q=cruz(delta,u),gama=dot(ray.direcao,q)/det,t=dot(v,q)/det;
    if(gama<0||beta+gama>1||t<0||t>=tMin)return;
    tMin=t;
    raiz={angulo:a.angulo+beta*(b.angulo-a.angulo)+gama*(c.angulo-a.angulo),
      altura:a.h+beta*(b.h-a.h)+gama*(c.h-a.h),comprimento};
  }
  for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
    const a=rings[i][j],b=rings[i][j+1],c=rings[i+1][j],d=rings[i+1][j+1];
    testar(a,b,c);testar(b,d,c);
  }
  return raiz;
}
export {marcarTecido,marcarRaiz};
