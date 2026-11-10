/* Matriz de regressão: 10 biotipos × 6 vistas × 5 poses × 3 modos = 900 cenas.
   node testes/matriz-anatomica.mjs [--rapido] [--svg]
   --rapido: apenas pose neutra (180 cenas); --svg: salva 20 referências SVG frontais e 3/4.
   Não confundir esta verificação automatizada com aprovação estética humana. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createWorld } from "../mcp/lib/core.mjs";
import { NOMES_BIOTIPOS } from "../src/scene/biotipos.js";

const VISTAS=[
  ["frente",0,0],["tresquartosE",-40,0],["perfilE",-90,0],
  ["costas",180,0],["tresquartosD",40,0],["perfilD",90,0]
];
const POSES=["empe","erguido","sentado","agachar","torcao"];
const MODOS=["manequim","construcao","ecorche"];
const OUT=join(dirname(fileURLToPath(import.meta.url)),"saida","biotipos");
const rapido=process.argv.includes("--rapido"),exportar=process.argv.includes("--svg");
if(exportar)mkdirSync(OUT,{recursive:true});
const nomes=rapido?["empe"]:POSES,assinaturas=[],falhas=[];
let feitos=0;
for(const [sexo,fem] of [["masculino",0],["feminino",1]])for(const tipo of NOMES_BIOTIPOS){
  const w=createWorld();w.cena.ativo.corpo(tipo).corpo({feminino:fem});
  for(const pose of nomes){
    w.cena.ativo.poseRapida(pose);
    for(const [vista,yaw,pitch] of VISTAS){
      w.P.yaw=yaw;w.P.pitch=pitch;w.P.roll=0;
      for(const modo of MODOS){
        try {
          w.setPreset(modo);
          const out=w.renderScene(w.sceneList(true),{...w.L,grid:false,shadow:false,floor:false},false,0);
          const svg=out.svg||"";
          assert.ok(svg.length>20000,"SVG incompleto");
          assert.ok(!/NaN|Infinity|undefined/.test(svg),"SVG contém valores não finitos");
          if(exportar&&pose==="empe"&&modo==="ecorche"&&["frente","tresquartosE"].includes(vista)){
            writeFileSync(join(OUT,`${sexo}-${tipo}-${vista}.svg`),svg);
          }
          assinaturas.push({sexo,tipo,pose,vista,modo,bytes:svg.length});
        } catch(e){falhas.push({sexo,tipo,pose,vista,modo,erro:String(e)})}
        feitos++;
      }
    }
  }
  console.log("  biotipo",sexo,tipo,"processado");
}
const rel={total:feitos,aprovados:assinaturas.length,falhas,amostrasSvg:exportar?20:0};
if(exportar)writeFileSync(join(OUT,"manifesto.json"),JSON.stringify({sumario:rel,cenas:assinaturas},null,2));
console.log(JSON.stringify(rel));
assert.equal(feitos,rapido?180:900);
assert.equal(falhas.length,0,"Falha(s) na renderização de cenas; consulte manifesto/log");
