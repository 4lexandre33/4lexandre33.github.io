// Referências leves para composição: painéis e mechas são superfícies abertas.
// Cada ponto acompanha uma junta do rig ou uma raiz da superfície craniana.
import {ossosDoCorpo} from "./esqueleto.js";
import {headPt,shape} from "./cabeca.js";
import {chainSetup} from "./cadeia.js";
import {applyA,H,W} from "./matematica.js";
import {colliderRig} from "./contact-v2.js";
import {paraMundo} from "./colisao-cena.js";

const TIPOS_MANGA=["paleto","camisa","calca","painel","curto","longo","franja","preso","linhas","impacto","explosao","fumaca","chama","rastro"];
const juntasManga=["ombro","cotovelo","punho","quadril","joelho","tornozelo","pescoço","pelve"];
function numeroManga(v,min,max){
  if(!Number.isFinite(v)||v<min||v>max)throw Error("Parâmetro de referência fora do intervalo.");
  return v;
}
function validarReferencia(r){
  if(!r||!TIPOS_MANGA.includes(r.tipo)||!/^#[\da-f]{6}$/i.test(r.cor))throw Error("Tipo ou cor de referência inválidos.");
  const out={tipo:r.tipo,cor:r.cor,ativo:r.ativo!==false,previa:r.previa!==false,exportar:r.exportar!==false,inicio:numeroManga(r.inicio??0,0,100000),
    duracao:numeroManga(r.duracao??100000,1,100001),escala:numeroManga(r.escala??1,.1,5),
    semente:numeroManga(r.semente??1,0,10000),x:numeroManga(r.x??.5,0,1),y:numeroManga(r.y??.5,0,1)};
  if(r.posicao!==undefined){
    if(!Array.isArray(r.posicao)||r.posicao.length!==3)throw Error("Posição 3D inválida.");
    out.posicao=r.posicao.map(v=>numeroManga(v,-100,100));
  }
  if(r.tipo==="rastro"){
    if(!Array.isArray(r.trajetoria)||!r.trajetoria.length||r.trajetoria.length>64)throw Error("Use até 64 amostras para o rastro.");
    out.trajetoria=r.trajetoria.map(q=>{
      if(!Array.isArray(q)||q.length!==4)throw Error("Amostra de rastro inválida.");
      return [numeroManga(q[0],0,100000),...q.slice(1).map(v=>numeroManga(v,-200,200))];
    }).sort((a,b)=>a[0]-b[0]);
  }
  if(r.raizes!==undefined){
    if(!Array.isArray(r.raizes)||!r.raizes.length||r.raizes.length>40)throw Error("Use de uma a 40 raízes.");
    out.raizes=r.raizes.map(q=>({angulo:numeroManga(q.angulo,-180,180),altura:numeroManga(q.altura,.1,.95),comprimento:numeroManga(q.comprimento,.1,5)}));
  }
  if(r.tipo==="painel"){
    if(!Array.isArray(r.pontos)||r.pontos.length<3||r.pontos.length>40)throw Error("Desenhe de 3 a 40 pontos.");
    out.pontos=r.pontos.map(q=>{
      if(!juntasManga.includes(q.junta)||!(["pelve","pescoço"].includes(q.junta)?[0]:[-1,1]).includes(q.lado)||!["apoio","pressao","livre"].includes(q.modo)||!Array.isArray(q.offset)||q.offset.length!==3)
        throw Error("Ponto de tecido inválido.");
      return {junta:q.junta,lado:q.lado,modo:q.modo,offset:q.offset.map(v=>numeroManga(v,-8,8))};
    });
  }
  return out;
}
function ventoManga(v={}){
  return {x:numeroManga(v.x??0,-4,4),z:numeroManga(v.z??0,-4,4),rajada:numeroManga(v.rajada??0,0,1)};
}
function linhasDeQuadro(ref,t){
  const impacto=ref.tipo==="impacto",n=impacto?54:24,x=ref.x*W,y=ref.y*H;
  let d="";
  for(let i=0;i<n;i++){
    const a=i*2*Math.PI/n,onda=Math.sin(i*13+ref.semente+t*.09);
    const k=(.18+.09*onda)/ref.escala;
    const ax=impacto?x+Math.cos(a)*W*k:-W*.15;
    const ay=impacto?y+Math.sin(a)*H*k:(i+.35*onda)*H/n;
    const bx=impacto?x+Math.cos(a)*W:ax+W*(.24+.12*onda)*ref.escala;
    const by=impacto?y+Math.sin(a)*H:ay-H*.08;
    d+="M"+ax.toFixed(1)+" "+ay.toFixed(1)+"L"+bx.toFixed(1)+" "+by.toFixed(1);
  }
  return '<path data-vfx="'+ref.tipo+'" d="'+d+'" fill="none" stroke="'+ref.cor+'" stroke-width="1.6"/>';
}
function geometriaReferencia(p,refs,frame,vento,exportacao=false){
  const grupos=[],tela=[];
  const ativos=refs.filter(r=>r.ativo&&(exportacao?r.exportar:r.previa)&&frame>=r.inicio&&frame<r.inicio+r.duracao);
  let rig,ch,S,colisores;
  const foraDoCorpo=q=>{
    colisores??=colliderRig(p,{level:"coarse"}).caps;
    for(const c of colisores){
      const d=c.b.map((v,i)=>v-c.a[i]),v=q.map((n,i)=>n-c.a[i]);
      const t=Math.max(0,Math.min(1,v.reduce((n,x,i)=>n+x*d[i],0)/(d.reduce((n,x)=>n+x*x,0)||1)));
      const n=v.map((x,i)=>x-t*d[i]),dist=Math.hypot(...n);
      if(dist<c.r+.02&&dist>.0001)q=q.map((x,i)=>x+n[i]*((c.r+.02)/dist-1));
    }
    return q;
  };
  const mundo=paraMundo(p),angulo=(p.wRot||0)*Math.PI/180;
  const pontoJ=(j,s)=>{rig??=ossosDoCorpo(p);const q=rig.juntas.find(k=>k.nome===j&&k.s===s);
    if(!q)throw Error("Junta de referência ausente: "+j);return q.P;};
  for(const r of ativos){
    const t=frame-r.inicio;
    if(["linhas","impacto"].includes(r.tipo)){tela.push(linhasDeQuadro(r,t));continue}
    const faces=[],amp=1+vento.rajada*Math.sin(t*.13+r.semente);
    const deslocar=(q,peso)=>peso?foraDoCorpo([q[0]+vento.x*peso*amp,q[1]-.12*peso,q[2]+vento.z*peso*amp]):q;
    const ponto=(j,s,x,y,z,peso=0)=>deslocar(mundo(pontoJ(j,s).map((n,i)=>n+[x,y,z][i])),peso);
    const unir=(a,b)=>{for(let i=0;i<a.length;i++){const k=(i+1)%a.length;faces.push([a[i],a[k],b[k],b[i]])}};
    if(r.tipo==="painel"){
      faces.push(r.pontos.map(q=>ponto(q.junta,q.lado,...q.offset,q.modo==="livre"?.55:q.modo==="pressao"?.025:0)));
    }else if(["camisa","calca","paleto"].includes(r.tipo)){
      const anel=(j,s,rx,rz,dy,livre)=>Array.from({length:10},(_,i)=>{
        const a=i*Math.PI/5;return ponto(j,s,rx*Math.cos(a)*r.escala,dy,rz*Math.sin(a)*r.escala,livre)});
      for(const s of [-1,1]){
        if(r.tipo==="calca"){
          const c=anel("quadril",s,.78,.87,.55,0),jo=anel("joelho",s,.62,.65,0,.03),pe=anel("tornozelo",s,.43,.5,0,.15);unir(c,jo);unir(jo,pe);
        }else{
          const om=anel("ombro",s,.65,.69,0,0),co=anel("cotovelo",s,.55,.55,.05,.04),
          pu=anel("punho",s,.38,.4,.05,0);unir(om,co);unir(co,pu);
        }
      }
      if(r.tipo!=="calca"){
        const cintura=(pontoJ("quadril",1)[1]+pontoJ("quadril",-1)[1])/2;
        const tronco=(baixo)=>Array.from({length:16},(_,i)=>{
          const a=i*Math.PI/8,s=Math.cos(a)>=0?1:-1,j=pontoJ(baixo?"quadril":"ombro",s);
          const pt=[Math.abs(j[0])*Math.cos(a)*(baixo?1.65:1.08),baixo?cintura-.8:j[1],
            j[2]+Math.sin(a)*(baixo?1.18:1.27)*r.escala];
          return deslocar(mundo(pt),baixo?.24:0);
        });
        unir(tronco(false),tronco(true));
        if(r.tipo==="paleto"){
          const cuello=ponto("pescoço",0,0,.05,1.25),fim=ponto("pescoço",0,0,-2.55,1.58);
          const lapelas=[];
          for(const s of [-1,1])lapelas.push([ponto("pescoço",0,.38*s,0,1.23),
            ponto("pescoço",0,1.02*s,-.53,1.43),ponto("pescoço",0,.72*s,-.75,1.55),
            ponto("pescoço",0,.9*s,-.88,1.57),fim]);
          grupos.push({tipo:"lapelas",cor:r.cor,faces:lapelas},
            {tipo:"gola",cor:"#eee9e4",faces:[[ponto("pescoço",0,-.38,0,1.24),cuello,
              ponto("pescoço",0,.38,0,1.24),fim]]});
        }
      }
    }else if(["curto","longo","preso","franja"].includes(r.tipo)){
      S??=shape(p);ch??=chainSetup(p,S);
      const raizes=r.raizes??Array.from({length:18},(_,i)=>({angulo:i*20-170,altura:.72,
        comprimento:r.tipo==="curto"?.45:r.tipo==="franja"?.65:r.tipo==="preso"?1.5:2}));
      for(const raiz of raizes){
        const a=raiz.angulo*Math.PI/180;
        if(r.tipo==="franja"&&Math.cos(a)<.35)continue;
        const raizP=(h,da)=>mundo(applyA(ch.A3,headPt(h,da,p,S,.085)));
        const h=raiz.altura, borda=Math.cos(a)>.55?.26*S.t:-.18*S.t;
        const top=raizP(h,a),l=raizP(borda,a-.19),rr=raizP(borda,a+.19);
        const comprimento=raiz.comprimento*r.escala*(Math.cos(a)>.55?.38:1);
        const ponta=deslocar(raizP(borda,a),.35*comprimento);
        ponta[1]-=comprimento;ponta[0]+=.13*Math.sin(a+angulo);ponta[2]+=.13*Math.cos(a+angulo);
        if(r.tipo==="preso"&&Math.cos(a)<.4){const no=raizP(borda,Math.PI);ponta[0]=(ponta[0]+no[0])/2;ponta[2]=(ponta[2]+no[2])/2}
        for(const [h1,h2] of [[.999,.93],[.93,h],[h,(h+borda)/2],[(h+borda)/2,borda]]){
          faces.push([raizP(h1,a-.19),raizP(h1,a+.19),raizP(h2,a+.19),raizP(h2,a-.19)]);
        }
        faces.push([l,foraDoCorpo(ponta),rr]);
      }
    }else{
      if(r.tipo==="rastro"){
        const amostras=r.trajetoria.filter(q=>q[0]<=frame&&q[0]>=frame-24);
        for(let i=1;i<amostras.length;i++){
          const a=amostras[i-1].slice(1),b=amostras[i].slice(1),w=.12*r.escala*i/amostras.length;
          faces.push([a,b,[b[0],b[1]+w,b[2]],[a[0],a[1]+w,a[2]]]);
        }
        if(faces.length)grupos.push({tipo:r.tipo,cor:r.cor,faces});
        continue;
      }
      const origem=r.posicao??ponto("punho",-1,0,0,0);
      for(let i=0;i<14;i++){
        const a=i*2*Math.PI/14,s=Math.sin(a),c=Math.cos(a),fase=(t%24)/24;
        const raio=(r.tipo==="explosao"?1+2*fase:.4+.15*Math.sin(t*.2+i))*r.escala;
        const base=[origem[0]+s*raio,origem[1]+(r.tipo==="fumaca"?fase*2:0),origem[2]+c*raio];
        faces.push([base,[base[0]+.28*c,base[1]+.1,base[2]-.28*s],
          [base[0]+s*raio*.55,base[1]+(.5+Math.abs(Math.sin(i+r.semente+t*.1)))*r.escala,base[2]+c*raio*.55]]);
      }
    }
    if(faces.length)grupos.push({tipo:r.tipo,cor:r.cor,faces});
  }
  return {grupos,tela:tela.join("")};
}
export {TIPOS_MANGA,validarReferencia,ventoManga,geometriaReferencia};
