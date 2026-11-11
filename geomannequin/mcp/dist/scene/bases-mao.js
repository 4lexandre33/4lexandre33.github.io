import { aplicarGesto, armDims, juntasDedos, rigidCompose, rigidFrame, rigidInverse, rigidPoint, pointSolid, setRigidObjectPose, restGround, normalizarPerfil, gripSite, colliderRig, colliderObject, manifoldObject, colisaoEntreObjetos, partesDoObjeto, rotM } from "../engine/index.js";
import { medirMao } from "./grip-auto.js";
import { beginRigidGrip, handFrameV3 } from "./grip-v3.js";
import { adicionarObjeto, removerObjeto } from "./cenario.js";
import { SCN } from "./modelo.js";

// O eixo longo da pega cruza os quatro dedos ao longo de Z local.
// Medir a folga transversal contra cada segmento, descontando seu raio.
function medirBaseMao(params,side){
  const pose={...params};
  aplicarGesto(pose,side,"segurar");
  const medidas=medirMao(pose,side),k=medidas.escala;
  const segmentos=juntasDedos(pose,side).flatMap((d,i)=>
    d.pts.slice(1).map((b,j)=>({a:d.pts[j],b,r:medidas.dedos[i].raio})));
  let melhor=null;
  for(let ix=16;ix<=42;ix++)for(let iy=68;iy<=95;iy++){
    const x=-side*ix*k/100,y=-iy*k/100;
    let folga=Math.abs(x)-medidas.espessuraPalma/2;
    for(const {a,b,r} of segmentos){
      const dx=b[0]-a[0],dy=b[1]-a[1];
      const t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));
      folga=Math.min(folga,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)-r);
    }
    if(!melhor||folga>melhor.raio)melhor={raio:folga,centro:[x,y+armDims(pose).LH/2,0]};
  }
  if(!(melhor.raio>0))throw Error("Sem espaço livre na mão para esta base.");
  return {...melhor,comprimento:medidas.larguraPalma,pose};
}

// Ajuste local com o braço imóvel. Avaliar as falanges na seção da pega
// e rejeitar candidatos que introduzam penetração na peça inteira.
function ajustarFalangesNaBase(it,side,o,ground){
  const p=it.params,lado=side===1?"L":"R",H=handFrameV3(it,side,ground);
  const altura=armDims(p).LH/2,local=gripSite(o,"baseMao").local;
  const extensao=["cadeiraVazada","mesaComAlca"].includes(o.tipo)?o.larg:o.tipo==="espada"?1.4:o.alt;
  const guia=partesDoObjeto({...o,_guiaPega:local,comprimentoPega:extensao},ground);
  const corpo=partesDoObjeto(o,ground),metricas=medirMao(p,side);
  const dist=(v,solidos)=>solidos.reduce((m,b)=>Math.min(m,pointSolid(v,b).d),Infinity);
  const codigos=["Th","In","Me","An","Mi"],resultado=[];
  for(let dedo=0;dedo<codigos.length;dedo++){
    const raio=metricas.dedos[dedo].raio;
    function avaliar(){
      const ps=juntasDedos(p,side)[dedo].pts.map(q=>rigidPoint(H,[q[0],q[1]+altura,q[2]]));
      let penetracao=0;
      for(let j=1;j<4;j++)for(let a=0;a<=4;a++){
        const q=ps[j].map((v,k)=>ps[j-1][k]+a/4*(v-ps[j-1][k]));
        penetracao=Math.max(penetracao,raio*(1-.1*(j-1))-dist(q,corpo));
      }
      const folga=dist(ps[3],guia)-raio*.7;
      return {folga,penetracao,custo:Math.abs(folga)+30*penetracao};
    }
    const antes=avaliar();
    let melhor=antes;
    const prefixo="f"+codigos[dedo];
    const controles=dedo===0?["thumbOpp",prefixo+"Abd",prefixo+"Mcp",prefixo+"Ip",prefixo]:
      [prefixo+"Mcp",prefixo+"Ip",prefixo];
    if(dedo===0){
      const keys=controles.map(k=>k+lado);
      let escolhidos=keys.map(k=>p[k]);
      for(const op of [0,.5,1])for(const abd of [-1,0,1])for(const mcp of [-1,0,1])
        for(const ip of [-1,0,1])for(const curl of [-.6,0,.4]){
          const valores=[op,abd,mcp,ip,curl];
          keys.forEach((k,i)=>{p[k]=valores[i]});
          const r=avaliar();
          if(r.penetracao<=Math.max(antes.penetracao,.012*metricas.escala)&&r.custo<melhor.custo){
            melhor=r;escolhidos=valores;
          }
        }
      keys.forEach((k,i)=>{p[k]=escolhidos[i]});
    }
    for(const passo of [.5,.15,.05])for(const nome of controles){
      const key=nome+lado,inicial=p[key]||0,min=nome==="thumbOpp"?0:-1;
      let escolhido=inicial;
      for(const delta of [-2,-1,1,2]){
        p[key]=Math.min(1,Math.max(min,inicial+passo*delta));
        const r=avaliar();
        if(r.penetracao<=Math.max(antes.penetracao,.012*metricas.escala)&&r.custo<melhor.custo-1e-6){
          escolhido=p[key];melhor=r;
        }
      }
      p[key]=escolhido;
    }
    resultado.push({dedo:metricas.dedos[dedo].nome,folgaAntes:antes.folga,
      folga:melhor.folga,penetracao:melhor.penetracao});
  }
  return resultado;
}

const modelosNaMao={
  cadeira:"cadeiraVazada",mesa:"mesaComAlca",bastao:"bastao",cajado:"cajado",
  espada:"espada",eliptica:"basePerfil",plana:"basePerfil",personalizada:"basePerfil",retangular:"baseRetangular",circular:"baseCircular"
};
function gerarNaMao(it,side,modelo,opts){
  const tipo=modelosNaMao[modelo];
  if(!Object.hasOwn(modelosNaMao,modelo))throw Error("Modelo de mão desconhecido.");
  if(SCN.objetos.some(o=>[o.grip,o.gripV3].some(g=>g?.mannequinId===it.id&&
    (g.side===side||g.secundaria?.side===side))))throw Error("Esta mão já segura um objeto.");
  const medida=medirBaseMao(it.params,side),ground=restGround(SCN.list[0].params);
  const redonda=["bastao","cajado","espada","circular"].includes(modelo);
  const elipse=Array.from({length:20},(_,i)=>[Math.cos(i*Math.PI/10),.58*Math.sin(i*Math.PI/10)]);
  const chapa=[[-1,-.22],[1,-.22],[1,.22],[-1,.22]];
  const livre=opts.perfil??(modelo==="eliptica"?elipse:modelo==="plana"?chapa:null);
  if(modelo==="personalizada"&&!livre)throw Error("Informe o contorno do perfil.");
  const perfil=livre?normalizarPerfil(livre):null;
  const diametro=medida.raio*2*(redonda||perfil?1:1/Math.sqrt(2));
  const o=adicionarObjeto(tipo,{nome:opts.nome||modelo,cor:opts.cor});
  const anterior={...it.params};
  try{
    o.secaoPega=diametro;
    o.comprimentoPega=medida.comprimento;
    if(perfil)o.perfilPega=perfil;
    o.modeloMao=modelo;
    const sufixo=side===1?"L":"R";
    o.gestoAnterior=Object.fromEntries(Object.entries(it.params).filter(([k])=>
      k.endsWith(sufixo)&&/^(handCurl|thumbOpp|fSpread|fTh|fIn|fMe|fAn|fMi)/.test(k)));
    if(tipo==="baseRetangular"||tipo==="baseCircular"||tipo==="basePerfil")o.alt=medida.comprimento;
    Object.assign(it.params,medida.pose);
    const H=handFrameV3(it,side,ground);
    const local=gripSite(o,"baseMao").local;
    const horizontal=tipo==="cadeiraVazada"||tipo==="mesaComAlca";
    const rot=horizontal?[0,0,-1,0,1,0,1,0,0]:[1,0,0,0,0,-1,0,1,0];
    const base=rigidCompose(H,rigidFrame(rot,medida.centro));
    const origem=rigidInverse(rigidFrame(undefined,local));
    const corpos=SCN.list.map(m=>{
      const rig=colliderRig({...m.params,wy:ground-restGround(m.params)},{level:"coarse"});
      return {caps:rig.caps.filter(c=>m!==it||c.nome!==(side>0?"maoE":"maoD"))};
    });
    // Primeiro arranjo livre em torno do eixo da pega, a começar pela vertical.
    let livre=false;
    for(let i=0;i<36&&!livre;i++){
      const angulo=Math.ceil(i/2)*(i%2?1:-1)*Math.PI/18;
      const volta=rigidFrame(horizontal?rotM(0,angulo,0):rotM(angulo,0,0));
      const pose=rigidCompose(rigidCompose(base,volta),origem);
      setRigidObjectPose(o,pose,ground);
      const partes=partesDoObjeto(o,ground);
      if(partes.some(b=>b.c[1]-b.h.reduce((v,h,j)=>v+h*Math.abs(b.e[j][1]),0)<ground-.025))continue;
      if(SCN.objetos.some(q=>q!==o&&colisaoEntreObjetos(o,q,ground,.035).length))continue;
      const solidos=colliderObject(o,ground);
      livre=corpos.every(rig=>!manifoldObject(rig,solidos,{tol:.045,max:1}).length);
    }
    if(!livre)throw Error("Sem espaço para o modelo. Afaste o braço do corpo ou dos obstáculos.");
    o.ajusteBase=ajustarFalangesNaBase(it,side,o,ground);
    beginRigidGrip(it,o,side,ground,{ponto:"baseMao",reach:2,objetos:SCN.objetos});
    return o;
  }catch(e){Object.assign(it.params,anterior);removerObjeto(o);throw e}
}
export { gerarNaMao, medirBaseMao };
