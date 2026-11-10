/* Regressão do HTML modular: V3 visível antes de scripts e sem duplicação.
 * Uso: node testes/seletor-cabeca-v3.mjs */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {join,dirname} from "node:path";
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const html=readFileSync(join(root,"index.html"),"utf8");
const controls=readFileSync(join(root,"src/ui/controles.js"),"utf8");
const head=readFileSync(join(root,"src/engine/head-v3/index.js"),"utf8");
const values=["v1","v2","v3_microgeometry"];
for(const v of values){
 assert.match(html,new RegExp('<option value="'+v+'">'));
 assert.ok(controls.includes('"'+v+'"'),"A inicialização perdeu "+v);
}
assert.equal((html.match(/id="headModelSelect"/g)||[]).length,1,"Seletor duplicado no HTML");
assert.match(html,/<label for="headModelSelect">Geometria da cabeça<\/label>/);
assert.match(html,/<script type="module" src="src\/main\.js\?v=[^"]+"><\/script>/);
assert.match(controls,/if\(!q\)/,"O fallback para HTML antigo desapareceu");
assert.match(controls,/q\.addEventListener\("change"/);
assert.match(controls,/P\.headModel=/);
assert.match(head,/headV3Enabled/);
console.log("SELETOR HEAD V3 PASS: V1/V2/V3 no HTML, inicialização única e motor V3 presente.");
