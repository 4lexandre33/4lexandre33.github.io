/* Integração estática do modo Head Study V4.2: arquivo único, UI,
 * entrada por URL, CSS e registro da nova cabeça no editor. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname,join} from "node:path";
const ROOT=join(dirname(fileURLToPath(import.meta.url)),"..");
const read=path=>readFileSync(join(ROOT,path),"utf8");
const html=read("index.html"),main=read("src/main.js"),
 style=read("css/head-study.css"),ui=read("src/ui/head-study.js"),
 shell=read("src/engine/head-v4/study-sheet.js"),controls=read("src/ui/controles.js"),
 math=read("src/engine/padroes.js"),state=read("src/scene/estado.js");
assert.ok(html.includes('id="headStudyOpen"'),"Botão do estudo não está na página");
assert.ok(html.includes('href="css/head-study.css"'),"CSS do estudo não carregado");
assert.ok(main.includes("iniciarHeadStudy()"),"Modo da folha não foi inicializado");
for(const id of ["gm42Close","gm42Save","gm42Refresh","gm42Wire","gm42Svg"])
 assert.ok(ui.includes(id),"Controle ausente: "+id);
assert.ok(ui.includes('params.get("study")==="v42"'),"URL direta não funcional");
assert.ok(ui.includes("buildHeadStudySvg(P"),"Folha não usa modelo real");
assert.ok(ui.includes("Blob([lastSvg]"),"Exportação SVG não implementada");
assert.ok(style.includes(".gm42-sheet>svg"),"Folha não responsiva");
assert.ok(shell.includes("renderScene"),"Folha não chama o motor real");
assert.ok(shell.includes("STUDY_SIZE"),"Tamanho de folha indefinido");
assert.ok(controls.includes("v4_anatomical")&&state.includes("v4_anatomical"));
for(const s of ["v42NapeRoundness","v42OrbitalCavity","v42EarProjection"])
 assert.ok(math.includes(s),"Parâmetro não foi persistido: "+s);
assert.ok(!shell.includes("<image "), "A folha não deve fingir ser um render usando imagem embutida");
console.log("V4.2 UI INTEGRATION PASS: entrada, exportacao, parametros, CSS, SVG real.");
