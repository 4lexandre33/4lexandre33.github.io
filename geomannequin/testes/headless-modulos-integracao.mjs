/* Integração REAL do carregador MCP/headless. Verifica que os módulos
 * Contact V2 e orientação 3D são incluídos na fábrica e funcionam juntos.
 * npm run testar:headless-modulos
 */
import assert from "node:assert/strict";
import {createWorld} from "../mcp/lib/core.mjs";
import {readFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const root=join(dirname(fileURLToPath(import.meta.url)),"..");
const order=JSON.parse(readFileSync(join(root,"src/scene/ordem.json"),"utf8"));
for(const file of ["colisoes.js","cenario.js","contato-v2.js","preensao-v2.js","toque-v2.js","orientacao-frames.js","orbita.js","comandos.js"])
 assert.ok(order.modulos.includes(file),"Falta carregar módulo "+file);
for(const name of ["contato-v2.js","preensao-v2.js","toque-v2.js"])
 assert.ok(order.modulos.indexOf(name)<order.modulos.indexOf("comandos.js"),
   "Dependência de comandos após consumidor: "+name);
const world=createWorld();
const {cena,camera}=world;
assert.ok(Array.isArray(cena.lista()));
assert.ok(cena.estado().list.length>0);
assert.equal(cena.contatoV2({enabled:false}).enabled,false);
assert.equal(cena.contatoV2({enabled:true,level:"coarse"}).enabled,true);
assert.ok(Array.isArray(cena.contatosFisicos({max:5})));
assert.equal(cena.contatoV2(false).enabled,false);
assert.ok(typeof cena.ativo.parametro==="function");
assert.ok(cena.ativo.orientacao("cabeca").frente.every(Number.isFinite));
camera.costas(cena.ativo.nome,{referencia:"tronco"});
assert.equal(camera.vista().azimute,180);
assert.ok(cena.capacidades().some(c=>c.id==="camera3d"));
assert.ok(cena.comandos().camera.includes("capturar"));
const zip=cena.exportarZIP();
assert.ok(zip.length>60&&zip[0]===80&&zip[1]===75);
console.log("HEADLESS MODULE PASS: factory, Contact V2, orientacao, comandos e ZIP.");
