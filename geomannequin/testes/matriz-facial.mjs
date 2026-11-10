/* GeoMannequin — 10 biotipos × 3 vistas × 5 expressões × 2 modos = 300 cenas.
   node testes/matriz-facial.mjs --rapido --svg
   node testes/matriz-facial.mjs --svg
   A verificação de SVG finito NÃO substitui revisão estética. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWorld } from "../mcp/lib/core.mjs";
import { NOMES_BIOTIPOS } from "../src/scene/biotipos.js";

const HERE=dirname(fileURLToPath(import.meta.url)),OUT=join(HERE,"saida","face");
const exportar=process.argv.includes("--svg"),rapido=process.argv.includes("--rapido");
const vistas=[["frente",0],["tresquartos",-40],["perfil",-90]];
const exp={
  neutra:{smile:0,jawOpen:0,eyeLid:0,browUp:0,browIn:0},
  sorriso:{smile:0.85,jawOpen:0.12,eyeLid:0.22,browUp:0.15,browIn:0},
  boca_aberta:{smile:0,jawOpen:0.88,eyeLid:0.05,browUp:0.35,browIn:0},
  surpresa:{smile:0,jawOpen:0.48,eyeLid:0,browUp:0.9,browIn:-0.3},
  olhos_contraidos:{smile:0.45,jawOpen:0,eyeLid:0.8,browUp:-0.2,browIn:0.6}
};
if(exportar)mkdirSync(OUT,{recursive:true});
const paletes=[["masculino",0],["feminino",1]],modos=["manequim","ecorche"];
const expressions=rapido?["neutra","boca_aberta"]:Object.keys(exp);
const failures=[],records=[];let total=0;
for(const [sexo,fem] of paletes)for(const tipo of NOMES_BIOTIPOS){
  const w=createWorld();w.cena.ativo.corpo(tipo).corpo({feminino:fem});
  for(const expr of expressions)for(const [view,yaw] of vistas){
    Object.assign(w.P,exp[expr],{yaw,pitch:0,roll:0});
    for(const modo of modos){
      total++;
      try{
        w.setPreset(modo);
        const out=w.renderScene(w.sceneList(true),{...w.L,grid:false,shadow:false,floor:false},false,0);
        const svg=out.svg||"";
        assert.ok(svg.length>5000&&!/NaN|Infinity|undefined/.test(svg),"Cena inválida");
        records.push({sexo,tipo,expr,view,modo,length:svg.length});
        if(exportar&&modo==="ecorche"&&(view==="frente"||view==="perfil")){
          writeFileSync(join(OUT,`${sexo}-${tipo}-${expr}-${view}.svg`),svg);
        }
      }catch(e){failures.push({sexo,tipo,expr,view,modo,error:String(e)})}
    }
  }
  console.log("  verificado",sexo,tipo);
}
const summary={total,ok:records.length,failed:failures.length,failures};
if(exportar)writeFileSync(join(OUT,"manifesto.json"),JSON.stringify({summary,records},null,2));
console.log(JSON.stringify(summary));
assert.equal(total,rapido?120:300);
assert.equal(failures.length,0,"Falhas no render facial: "+failures.length);
