/* Head study V4.2 — teste do compositor SVG e atlas exportável.
 * node testes/folha-cabeca-v4-2.mjs
 * node testes/folha-cabeca-v4-2.mjs --svg
 */
import assert from "node:assert/strict";
import {mkdirSync,writeFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import "../src/engine/index.js";
import {DEF} from "../src/engine/padroes.js";
import {buildHeadStudySvg,STUDY_VIEWS,STUDY_SIZE} from "../src/engine/head-v4/study-sheet.js";

const calls=[],shared=[];
const params={...DEF,headModel:"v4_anatomical",yaw:20,headDetail:0};
const renderer=(list,L)=>{
 calls.push({yaw:list[0].p.yaw,pitch:list[0].p.pitch,zoom:list[0].p.zoom,
  wire:L.rings,headModel:list[0].p.headModel,fill:list[0].pal.fill});
 shared.push(list[0].p._cache);
 return {svg:'<path d="M 10 20 L 30 40" />'};
};
const svg=buildHeadStudySvg(params,{renderer});
assert.equal(calls.length,5);
assert.deepEqual(calls.map(c=>c.yaw),[-90,-40,0,145,-43]);
assert.ok(shared.every(c=>c===shared[0]),"Geometria deve ser reaproveitada entre câmeras");
assert.equal(params.yaw,20,"A folha alterou a câmera do editor");
assert.equal(params.headDetail,0,"A folha alterou o LOD da cena");
assert.ok(calls.every(c=>c.headModel==="v4_anatomical"));
assert.ok(svg.startsWith('<svg')&&svg.endsWith('</svg>'));
for(const t of ["LEFT PROFILE","THREE-QUARTER VIEW","FRONT VIEW",
  "OCCIPITAL–NAPE","RESTORED EAR","EYE SOCKET","PROPORTIONS / NOTES"])
  assert.ok(svg.includes(t),"Componente ausente: "+t);
assert.ok(calls.every(c=>c.fill==="#f4dbe8"),"Preenchimento rosado ausente");
for(const t of ["gm42Minor","gm42Major"])
  assert.ok(svg.includes(t),"Cor ou grid ausente: "+t);
assert.ok(!/NaN|Infinity|undefined/.test(svg));
const wireCalls=[];
buildHeadStudySvg(params,{wire:false,renderer:(list,L)=>{
 wireCalls.push(L.rings);return {svg:'<path d="M0 0L1 1"/>'};
}});
assert.ok(wireCalls.every(n=>n===0),"O interruptor de wireframe não desativou as linhas");
if(process.argv.includes("--svg")){
 const real=buildHeadStudySvg({...DEF,headModel:"v4_anatomical"});
 assert.ok(real.length>20000,"Renderização não produziu geometria suficiente");
 assert.ok(real.startsWith("<svg")&&real.endsWith("</svg>"));
 assert.ok(!/NaN|Infinity|undefined/.test(real));
 const dir=join(dirname(fileURLToPath(import.meta.url)),"saida","cabeca-v4-2");
 mkdirSync(dir,{recursive:true});
 const path=join(dir,"anatomical-head-study-v4-2.svg");
 writeFileSync(path,real,"utf8");
 console.log("ATLAS SVG GERADO:",path,real.length,"bytes");
}
console.log("V4.2 SHEET PASS:",STUDY_VIEWS.length,"câmeras,",
 STUDY_SIZE.width+"×"+STUDY_SIZE.height,"px.");
