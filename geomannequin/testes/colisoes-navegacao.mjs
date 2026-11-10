/* Testa a navegação para a seção Colisões sem exigir navegador.
 * Execute: node testes/colisoes-navegacao.mjs
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,resolve} from "node:path";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=path=>readFileSync(resolve(root,path),"utf8");
const html=read("index.html"),ui=read("src/ui/colisoes.js"),css=read("css/layout.css");
const occurs=(s,pattern)=>(s.match(pattern)||[]).length;
assert.equal(occurs(html,/id="colisoesAtalho"/g),1,"O atalho deve existir uma única vez");
assert.equal(occurs(html,/id="colSecao"/g),1,"A seção deve existir uma única vez");
assert.ok(html.includes('aria-controls="colSecao"'),"Atalho deve apontar para seção real");
assert.ok(html.includes('aria-labelledby="colSecaoTitulo"'),"Seção deve ter rótulo acessível");
assert.ok(html.includes('id="colModo"')&&html.includes('id="colV2"'),"Controles antigos e V2 devem ser preservados");
assert.ok(html.indexOf('id="colSecao"')<html.indexOf('id="colModo"'),"Controles devem ficar dentro da seção");
assert.ok(html.indexOf('id="colMsg"')<html.indexOf('</section>\n      <div id="slScene"'),"Seção deve envolver todos os controles");
assert.ok(ui.includes('$("colisoesAtalho")?.addEventListener("click"'),"Botão deve funcionar");
assert.ok(ui.includes('get("painel")==="colisoes"'),"URL de acesso direto deve funcionar");
assert.ok(ui.includes('scrollIntoView(')&&ui.includes('target.focus('),"Navegação deve rolar e focalizar");
assert.ok(css.includes('#colSecao{scroll-margin-top:'),"Seção deve manter margem de rolagem");
assert.ok(css.includes('@media (max-width:1039px){#params{max-height:60vh;overflow-y:auto;'),"Painel responsivo deve continuar rolável");
console.log("OK: atalho para Colisões, URL ?painel=colisoes, foco, rolagem e controles V2.");
