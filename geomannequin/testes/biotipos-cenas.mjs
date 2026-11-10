/* Regressão da seleção de sexo/biotipo via API, serialização JSON e roteiro de quadros.
   Protege a mesma lógica usada pelo editor de frames e pelo MCP headless. */
import assert from "node:assert/strict";
import { createWorld } from "../mcp/lib/core.mjs";
import { BIOTIPOS } from "../src/scene/biotipos.js";

const w=createWorld(),m=w.cena.ativo;
m.corpo("masculino atletico");
assert.equal(w.P._biotipo,"atletico");
assert.equal(w.P.fem,0);
assert.equal(w.P.hips,BIOTIPOS.masculino.atletico.hips);
const state=w.sceneState();
assert.equal(state.list[0].params._biotipo,"atletico");

const w2=createWorld();w2.loadScene(state);
assert.equal(w2.P._biotipo,"atletico","Biotipo deve sobreviver ao JSON da cena");
w2.cena.ativo.corpo({feminino:1});
assert.equal(w2.P.hips,BIOTIPOS.feminino.atletico.hips,
  "Mudar sexo após carregar cena deve continuar no perfil atlético");
assert.equal(w2.P._biotipo,"atletico");

const antes=JSON.stringify(w.sceneState());
const roteiro=[
  "#cena",
  "cena.ativo.corpo('feminino medio');",
  "#quadro 1",
  "cena.ativo.poseRapida('agachar');",
  "#quadro 2",
  "cena.ativo.corpo('masculino atletico');",
  "#quadro 3",
  "cena.ativo.corpo({feminino:1});"
].join("\n");
const out=w.executarRoteiro(roteiro);
assert.equal(out.quadros.length,3);
for(const q of out.quadros)assert.ok(!q.erro,"Quadro "+q.n+": "+q.erro);
const s=out.quadros.map(q=>q.estado.list[0].params);
assert.deepEqual(s.map(p=>[p._biotipo,p.fem]),[["medio",1],["atletico",0],["atletico",1]]);
assert.equal(s[2].hips,BIOTIPOS.feminino.atletico.hips);
assert.equal(JSON.stringify(w.sceneState()),antes,"Editor não deve modificar a cena aberta");
console.log("  ok  biotipos: API, troca de sexo, JSON e continuidade dos quadros");
