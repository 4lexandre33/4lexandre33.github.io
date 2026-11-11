import { aplicarGesto, armDims, juntasDedos, rigidCompose, rigidFrame, rigidInverse, setRigidObjectPose, restGround, gripSite } from "../engine/index.js";
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

const modelosNaMao={
  cadeira:"cadeiraVazada",mesa:"mesaComAlca",bastao:"bastao",cajado:"cajado",
  espada:"espada",retangular:"baseRetangular",circular:"baseCircular"
};
function gerarNaMao(it,side,modelo,opts){
  const tipo=modelosNaMao[modelo];
  if(!Object.hasOwn(modelosNaMao,modelo))throw Error("Modelo de mão desconhecido.");
  if(SCN.objetos.some(o=>[o.grip,o.gripV3].some(g=>g?.mannequinId===it.id&&
    (g.side===side||g.secundaria?.side===side))))throw Error("Esta mão já segura um objeto.");
  const medida=medirBaseMao(it.params,side),ground=restGround(SCN.list[0].params);
  const redonda=["bastao","cajado","espada","circular"].includes(modelo);
  const diametro=medida.raio*2*(redonda?1:1/Math.sqrt(2));
  const o=adicionarObjeto(tipo,{nome:opts.nome||modelo,cor:opts.cor});
  const anterior={...it.params};
  try{
    o.secaoPega=diametro;
    if(tipo==="baseRetangular"||tipo==="baseCircular")o.alt=medida.comprimento;
    Object.assign(it.params,medida.pose);
    const H=handFrameV3(it,side,ground);
    const local=gripSite(o,"baseMao").local;
    const horizontal=tipo==="cadeiraVazada"||tipo==="mesaComAlca";
    const rot=horizontal?[0,0,-1,0,1,0,1,0,0]:[1,0,0,0,0,-1,0,1,0];
    const pose=rigidCompose(rigidCompose(H,rigidFrame(rot,medida.centro)),rigidInverse(rigidFrame(undefined,local)));
    setRigidObjectPose(o,pose,ground);
    beginRigidGrip(it,o,side,ground,{ponto:"baseMao",reach:2,objetos:SCN.objetos});
    return o;
  }catch(e){Object.assign(it.params,anterior);removerObjeto(o);throw e}
}
export { gerarNaMao, medirBaseMao };
