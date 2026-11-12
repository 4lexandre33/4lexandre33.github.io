/* GeoMannequin — contratos públicos de cena/estilo/arquivos/roteiro.
 * node testes/paridade-editor-codigo.mjs
 */
import assert from "node:assert/strict";
import {createWorld} from "../mcp/lib/core.mjs";
import {readFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const w=createWorld(),a=w.cena.ativo;
const catalog=w.cena.comandos();
for(const c of ["costas","frente","ver","seguir","pararSeguir","orientacaoDoAlvo","areas","alvos"])
 assert.ok(catalog.camera.includes(c),"Comando ausente: camera."+c);
for(const c of ["camadasVisuais","camadaVisual","estilos","estilo","exportarSVG","exportarOBJ","exportarJSON","importarJSON","renderizarQuadros","paginasDeRoteiro","comandos","capacidades","desfazer","refazer"])
 assert.ok(catalog.cena.includes(c),"Comando ausente: cena."+c);
assert.ok(catalog.manequim.includes("orientacao"));
assert.ok(catalog.manequim.includes("exportarOBJ"));
assert.ok(catalog.manequim.includes("parametro"));
assert.ok(catalog.camera.includes("capturar")&&catalog.camera.includes("capturarVistas"));
const headOld=w.cena.ativo.parametro("headYaw");
w.cena.ativo.parametro("headYaw",31);
assert.equal(w.cena.ativo.parametro("headYaw"),31);
w.cena.ativo.parametro("headYaw",headOld);
assert.throws(()=>w.cena.ativo.parametro("parametroInexistente",10),/desconhecido/);
const pitchOld=w.camera.parametro("pitch");w.camera.parametro("pitch",22);
assert.equal(w.camera.parametro("pitch"),22);w.camera.parametro("pitch",pitchOld);
const zip=w.cena.exportarZIP();
assert.ok(zip instanceof Uint8Array&&zip[0]===0x50&&zip[1]===0x4b,"ZIP não possui cabeçalho PK");
assert.ok(w.cena.capacidades().some(c=>c.id==="camera3d"));
const original=w.cena.ativo.info().x;
w.cena.marcarEstado();w.cena.ativo.posicao(8,0);
assert.ok(w.cena.desfazer());assert.equal(w.cena.ativo.info().x,original);
assert.ok(w.cena.refazer());assert.equal(w.cena.ativo.info().x,8);
w.cena.ativo.posicao(original,0);
const pages=w.cena.renderizarQuadros('#quadro 1\ncamera.costas("'+w.cena.ativo.nome+'",{referencia:"tronco"});',{passes:false});
assert.equal(pages.length,1);assert.ok(pages[0].svg.includes("<svg"));
const f=w.cena.folhaDeContato('#quadro 1\ncamera.frente("'+w.cena.ativo.nome+'");');
assert.ok(f.includes("<svg"));
const json=JSON.parse(w.cena.exportarJSON());
assert.ok(json.scene&&json.layers&&json.style);
assert.equal(typeof w.cena.estudoAnatomico.svg,"function");
await assert.rejects(w.cena.exportarPNG(),/headless|Canvas/i);
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const scene=JSON.parse(readFileSync(join(root,"src/scene/ordem.json"),"utf8"));
assert.ok(scene.modulos.indexOf("orientacao-frames.js")>=0&&scene.modulos.indexOf("orientacao-frames.js")<scene.modulos.indexOf("orbita.js"),"Headless sem orientação 3D");
const editor=readFileSync(join(root,"src/ui/editor.js"),"utf8");
assert.ok(editor.includes("async function runCode()")&&/await fn\(cena,camera,tema,log(,poseCmd)?(,\(t,o\)=>cena\.efeito\(t,o\))?\)/.test(editor));
assert.ok(editor.includes("cena.restaurarCompleto(snapshot)"));
console.log("PARIDADE API PASS: câmera, camadas, estilos, dados, Quadros, undo/redo, editor async, UI e headless.");
