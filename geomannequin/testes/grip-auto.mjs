/* GeoMannequin — AutoGrip: contratos e segurança de estado.
 * node testes/grip-auto.mjs
 */
import assert from "node:assert/strict";
import {createWorld} from "../mcp/lib/core.mjs";
import {handFrameV3} from "../src/scene/grip-v3.js";
import {registrarRegiaoAutoGrip} from "../src/scene/grip-auto.js";
import {gripSiteWorld} from "../src/engine/grip-sites.js";
import {rigidDirection,objectRigidPose} from "../src/engine/rigid-transform.js";
import {restGround} from "../src/engine/index.js";

const w=createWorld();
const mannequin=w.SCN.list[0];
const ground=restGround(mannequin.params);
assert.ok(w.cena.capacidades().some(c=>c.id==="autoGrip"),"AutoGrip não anunciado");
const hand=w.cena.ativo.medidasMao("direita");
assert.equal(hand.dedos.length,5);
assert.ok(hand.comprimentoPalma>0&&hand.espessuraPalma>0);
assert.ok(Number.isFinite(hand.aberturaPincaAberta));
const enlarged={...mannequin.params,armLen:mannequin.params.armLen*1.05};
const larger=(await import("../src/scene/grip-auto.js")).medirMao(enlarged,-1);
assert.ok(larger.comprimentoPalma>hand.comprimentoPalma,"Tamanho de mão deriva de armLen");
const start=handFrameV3(mannequin,-1,ground);
assert.ok(start.T.every(Number.isFinite),"Frame de palma deve ser finito");
w.cena.objeto("cadeira",{nome:"Cadeira AutoGrip",x:start.T[0],z:start.T[2]+3});
const obj=w.SCN.objetos.find(o=>o.nome==="Cadeira AutoGrip");
assert.ok(obj);
// Ponto amostrado deve voltar do referencial mundo para o local da cadeira,
// mesmo com rotação yaw: não usar o centro do GripSite no vínculo.
const rotated={...obj,giro:37,sitesExtras:[]};
const anchor=gripSiteWorld(rotated,"encostoTopo",ground);
const offset=rigidDirection(objectRigidPose(rotated,ground),[.22,0,0]);
const worldSample=anchor.mundo.map((v,i)=>v+offset[i]);
const newId=registrarRegiaoAutoGrip(rotated,{
  ponto:"encostoTopo",posicaoRegiao:worldSample,normalLocal:anchor.normal,
  amostra:{deslocamento:.22}
},-1,ground);
const attached=gripSiteWorld(rotated,newId,ground);
assert.ok(Math.hypot(...attached.mundo.map((v,i)=>v-worldSample[i]))<1e-9,
  "A amostra otimizada precisa ser o mesmo ponto no vínculo, mesmo após rotação");
assert.ok(newId.startsWith("__autogrip_"));
assert.equal(rotated.sitesExtras.length,1);
const originalSite=gripSiteWorld(rotated,"encostoTopo",ground);
assert.ok(Math.hypot(...originalSite.mundo.map((v,i)=>v-attached.mundo[i]))>.1,
  "A regressão precisa distinguir ponto otimizado do GripSite nominal");

const options={manequim:"Manequim 1",mao:"auto",pegada:"auto",
  preservarObjeto:true,maxSites:2,maxIteracoes:1,reach:15};
const before=JSON.stringify(w.cena.estadoCompleto());
const preview=w.cena.planejarEncaixe(obj.id,options);
assert.ok(["planejado","inviavel"].includes(preview.status),
 "O planejador deve devolver resultado ou inviabilidade, sem corromper estado");
assert.equal(JSON.stringify(w.cena.estadoCompleto()),before,
 "Prévia tem de ser pura, não pode modificar rig, câmera ou objeto");
assert.ok(preview.revisao&&preview.opcoes,"Prévia precisa de revisão e opções");
assert.ok(preview.status==="inviavel"||preview.escolha?.desvioPalma>=0);
assert.ok(preview.status==="inviavel"||preview.escolha?.penetracao<=preview.opcoes.limitePenetracao);

if(preview.status==="planejado"){
 const r=w.cena.aplicarEncaixe(preview);
 assert.equal(r.status,"aplicado");
 assert.equal(obj.gripV3?.version,3);
 assert.equal(obj.gripV3?.autoGrip?.version,1);
 assert.ok(r.qualidade.penetracao<=preview.opcoes.limitePenetracao);
 const saved=w.cena.exportarJSON(),w2=createWorld();
 w2.cena.importarJSON(saved);
 assert.equal(w2.SCN.objetos.find(o=>o.nome===obj.nome).gripV3.autoGrip.version,1,
   "AutoGrip precisa sobreviver ao JSON");
 assert.equal(w.cena.desfazer(),true,"Undo do encaixe");
 assert.ok(!w.SCN.objetos.some(o=>o.nome===obj.nome&&o.gripV3),
   "Undo remove o vínculo completo");
 assert.equal(w.cena.refazer(),true,"Redo do encaixe");
 assert.ok(w.SCN.objetos.some(o=>o.nome===obj.nome&&o.gripV3));
}else{
 assert.throws(()=>w.cena.autoEncaixarObjeto(obj.id,options),/inviável|inviavel/i);
 assert.equal(JSON.stringify(w.cena.estadoCompleto()),before,
   "Encaixe impossível não deve mutar estado");
}
// Reencaixar também deve funcionar quando o objeto JÁ ESTÁ vinculado à mão.
const held=createWorld();
held.cena.objeto("cadeira",{nome:"Cadeira Vinculada",x:0,z:0});
const heldObj=held.SCN.objetos.find(q=>q.nome==="Cadeira Vinculada");
const oldGrip=held.cena.segurarObjeto("Cadeira Vinculada",
  {mao:"direita",ponto:"encostoTopo",reach:100});
assert.equal(oldGrip.versao,3);
const oldState=JSON.stringify(held.cena.estadoCompleto());
const diagnosed=held.cena.inspecionarAutoGrip("Cadeira Vinculada");
assert.equal(diagnosed.status,"reajuste_necessario",
  "Pegada manual não deve ser apresentada como AutoGrip certificado");
assert.equal(diagnosed.necessitaAjuste,true);
assert.equal(JSON.stringify(held.cena.estadoCompleto()),oldState,
  "Inspeção da pegada não pode modificar a cena");
const replOptions={mao:"direita",pegada:"gancho",reach:100,maxSites:1,maxIteracoes:1};
const replan=held.cena.planejarEncaixe("Cadeira Vinculada",replOptions);
assert.ok(["planejado","inviavel"].includes(replan.status),
  "A prévia de um vínculo existente deve ser permitida");
assert.equal(JSON.stringify(held.cena.estadoCompleto()),oldState,
  "Prévia de objeto segurado não pode soltar nem alterar o vínculo");
if(replan.status==="planejado"){
  try{
    const next=held.cena.autoEncaixarObjeto("Cadeira Vinculada",replOptions);
    assert.equal(next.status,"aplicado");
    assert.equal(next.reencaixado,true);
    assert.equal(heldObj.gripV3?.autoGrip?.version,1);
    const inspected=held.cena.inspecionarAutoGrip("Cadeira Vinculada");
    assert.equal(inspected.status,"contato_geometrico");
    assert.equal(inspected.necessitaAjuste,false);
    assert.ok(inspected.porMao.every(q=>Number.isFinite(q.penetracao)));
  }catch(e){
    assert.match(e.message,/AutoGrip revertido/i);
    assert.equal(JSON.stringify(held.cena.estadoCompleto()),oldState,
      "Uma tentativa rejeitada deve devolver o objeto e a mão à pose antiga");
  }
}else{
  assert.throws(()=>held.cena.autoEncaixarObjeto("Cadeira Vinculada",replOptions),
    /AutoGrip revertido/i);
  assert.equal(JSON.stringify(held.cena.estadoCompleto()),oldState,
    "Sem encaixe viável, vínculo original deve sobreviver à operação");
}

assert.throws(()=>w.cena.autoEncaixarObjeto("Inexistente",options),/não encontrado/i);
assert.throws(()=>w.cena.planejarEncaixe(obj.id,{...options,permitirMoverObjeto:true}),/não suportado/i);
// Microajuste horizontal: opt-in explícito, preview pura, limite finito e
// rejeição quando o usuário não autorizou mover a peça.
const adjustWorld=createWorld();
adjustWorld.cena.objeto("copo",{nome:"Micro Ajuste",x:1,z:1});
const adjustable=adjustWorld.SCN.objetos.find(o=>o.nome==="Micro Ajuste");
const beforeMicro=JSON.stringify(adjustWorld.cena.estadoCompleto());
const moveOptions={mao:"direita",pegada:"auto",permitirMoverObjeto:true,
  preservarObjeto:false,maxDeslocamento:.20,maxSites:1,maxIteracoes:1,maxTempoMs:600};
const movePreview=adjustWorld.cena.planejarEncaixe(adjustable.id,moveOptions);
assert.ok(["planejado","inviavel"].includes(movePreview.status));
assert.equal(JSON.stringify(adjustWorld.cena.estadoCompleto()),beforeMicro,
  "Microajuste opcional não deve mover o objeto durante a prévia");
assert.equal(movePreview.opcoes.maxDeslocamento,.2);
assert.throws(()=>adjustWorld.cena.planejarEncaixe(adjustable.id,{
  ...moveOptions,preservarObjeto:true
}),/preservarObjeto:false/);
assert.throws(()=>adjustWorld.cena.planejarEncaixe(adjustable.id,{
  ...moveOptions,maxDeslocamento:2
}),/maxDeslocamento/);
if(movePreview.status==="planejado"&&movePreview.escolha?.ajusteObjeto){
  const shift=movePreview.escolha.ajusteObjeto;
  assert.ok(Math.hypot(shift.dx,shift.dz)<=.29,
    "Microajuste deve respeitar a extensão diagonal máxima da busca");
}

const extra=createWorld();
extra.cena.objeto("copo",{nome:"Distante",x:50,z:50});
const impossibleBefore=JSON.stringify(extra.cena.estadoCompleto());
const impossible=extra.cena.planejarEncaixe("Distante",{mao:"direita",pegada:"pinca",reach:.2,maxSites:1,maxIteracoes:1});
assert.equal(impossible.status,"inviavel");
assert.equal(JSON.stringify(extra.cena.estadoCompleto()),impossibleBefore);
console.log("AUTOGRIP CONTRACT PASS — métricas por mão, preview, revisão, rollback e JSON;",
 preview.status,"com",preview.avaliados,"candidatos");
