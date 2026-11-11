// Medição headless de uma composição em movimento. Inclui a avaliação da pose
// e a montagem do SVG. Não inclui pintura do navegador nem transferência à GPU.
import {performance} from "node:perf_hooks";
import {createWorld} from "../mcp/lib/core.mjs";

for(const quantidade of [1,3]){
  const w=createWorld();
  for(let i=1;i<quantidade;i++)w.cena.adicionar({nome:"Figura "+i,x:8*i});
  for(let i=0;i<quantidade;i++){
    for(const tipo of ["paleto","calca","longo"])w.cena.referencia(tipo,{manequim:i});
  }
  w.cena.referencia("impacto");
  w.cena.objetoNaMao("cadeira",{manequim:0});
  w.cena.ventoChave(0,{x:-1,z:0,rajada:.3});
  w.cena.ventoChave(48,{x:1,z:.2,rajada:.6});
  const amostras=[];
  for(let frame=0;frame<36;frame++){
    w.cena.quadroSimulado(frame);
    w.SCN.list[0].params.elbowR=10+frame;
    const inicio=performance.now();
    w.renderScene(w.sceneList(),w.L,true,0,{canal:"medicao"});
    if(frame>=6)amostras.push(performance.now()-inicio);
  }
  amostras.sort((a,b)=>a-b);
  const percentil=p=>+amostras[Math.ceil(p*amostras.length)-1].toFixed(1);
  console.log(JSON.stringify({manequins:quantidade,quadros:amostras.length,medianaMs:percentil(.5),
    p95Ms:percentil(.95),memoriaProcessoMiB:Math.round(process.memoryUsage().rss/1048576)}));
}
