/* Verificação de carregamento ESM e da fábrica headless do AutoGrip.
 * Diferente de checagem sintática: executa os imports e cria uma cena real.
 * node testes/autogrip-exports.mjs
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
import * as autogrip from "../src/scene/grip-auto.js";
import * as barrel from "../src/scene/index.js";
import {createWorld,appMeta} from "../mcp/lib/core.mjs";

const root=dirname(fileURLToPath(import.meta.url));
const exported=["planejarAutoGrip","planejarAutoGripComAjuste","resumirAutoGrip",
 "medirMao","validarOpcoes","validarContatoAutoGrip","validarCenaAutoGrip",
 "registrarRegiaoAutoGrip","verificarMicroDeslocamentoAutoGrip",
 "validarAproximacaoAutoGrip"];

for(const name of exported){
 assert.equal(typeof autogrip[name],"function","Export ESM ausente: "+name);
 assert.equal(typeof barrel[name],"function","Barrel src/scene não exporta "+name);
}
const order=JSON.parse(readFileSync(join(root,"../src/scene/ordem.json"),"utf8"));
assert.equal(order.modulos.filter(x=>x==="grip-auto.js").length,1,
  "O carregador headless precisa carregar AutoGrip uma única vez");
const w=createWorld();
assert.ok(appMeta().modulos===order.modulos.length);
for(const name of ["planejarEncaixe","autoEncaixarObjeto","aplicarEncaixe",
 "reajustarEncaixe","inspecionarAutoGrip"]){
 assert.equal(typeof w.cena[name],"function","API pública não registrada: "+name);
}
assert.equal(typeof w.cena.ativo.medidasMao,"function");
assert.ok(w.cena.capacidades().some(c=>c.id==="autoGrip"),"Capacidade AutoGrip ausente");
const sceneBefore=JSON.stringify(w.cena.estadoCompleto());
assert.throws(()=>w.cena.inspecionarAutoGrip("Não existe"),/Objeto não encontrado/);
assert.equal(JSON.stringify(w.cena.estadoCompleto()),sceneBefore,
  "Inspeção inválida não pode alterar a cena");
w.cena.objeto("copo",{nome:"Copo de Teste",x:2,z:1});
const state=JSON.stringify(w.cena.estadoCompleto());
const report=w.cena.inspecionarAutoGrip("Copo de Teste");
assert.equal(report.status,"livre");
assert.equal(JSON.stringify(w.cena.estadoCompleto()),state,
  "A inspeção de objeto livre deve ser somente leitura");
assert.throws(()=>w.cena.planejarEncaixe("Copo de Teste",{mao:"invalida"}),
  /Mão:/);
assert.equal(JSON.stringify(w.cena.estadoCompleto()),state,
  "A validação de preview não pode alterar o estado");
console.log("AUTOGRIP EXPORT/HEADLESS PASS",exported.length,
  "funções ESM, 1 módulo headless e comandos públicos.");
