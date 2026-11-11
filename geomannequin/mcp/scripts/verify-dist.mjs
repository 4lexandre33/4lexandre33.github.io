/* Verifica dist entregue versus a fonte atual. Executar após npm run build. */
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {fingerprint} from "./source-fingerprint.mjs";
const mcp=resolve(dirname(fileURLToPath(import.meta.url)),".."),root=resolve(mcp,"..");
const read=p=>readFileSync(join(mcp,p),"utf8");
assert.ok(existsSync(join(mcp,"dist/source-manifest.json")),
  "dist está obsoleto: falta source-manifest.json. Execute npm run build.");
const source=JSON.parse(readFileSync(join(root,"src/scene/ordem.json"),"utf8"));
const dist=JSON.parse(read("dist/scene/ordem.json"));
assert.deepEqual(dist.modulos,source.modulos,"Lista de módulos src/scene ≠ dist/scene.");
for(const f of source.modulos){
 assert.equal(read("dist/scene/"+f),readFileSync(join(root,"src/scene",f),"utf8"),
   "Módulo obsoleto em dist: "+f);
}
const manifest=JSON.parse(read("dist/source-manifest.json"));
const expected=fingerprint(root);
assert.equal(manifest.sha256,expected.sha256,
 "Bundle MCP não corresponde ao código-fonte atual. Recompile dist.");
assert.ok(manifest.sha256.length===64&&manifest.files===expected.files);
const bundle=read("dist/server.mjs");
for(const name of ["preensao","fisica","objeto_3d","grip_sites","camera_anatomica",
 "roteiro_declarativo","artefatos_mcp","operacoes_lote","anatomia_mcp","aparencia_mcp"]){
 assert.ok(bundle.includes(name),"Ferramenta MCP ausente do bundle: "+name);
}
console.log("MCP DIST PARITY PASS:",source.modulos.length,"módulos,",
 manifest.files,"arquivos-fonte; sha256",manifest.sha256.slice(0,16));
