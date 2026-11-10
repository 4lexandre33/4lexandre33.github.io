/* Matriz 10 biotipos x 9 vistas x 5 expressões x 3 modos = 1350.
   --rapido: 10 biotipos x 3 vistas x 2 expressões x 1 modo = 60.
   --svg: guarda somente SVG de perfil e 3/4 da versão construcao.
   Não regrava os snapshots oficiais nem afirma aprovação estética. */
import {createWorld} from "../mcp/lib/core.mjs";
import {NOMES_BIOTIPOS} from "../src/scene/biotipos.js";
import {EXPRESSION_V2,expressionParamsV2} from "../src/engine/head/index.js";
import assert from "node:assert/strict";
import {mkdirSync,writeFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const rapido=process.argv.includes("--rapido"),svgOutput=process.argv.includes("--svg");
const views=rapido?[["frente",0,0],["perfil",-90,0],["tres-quartos",-40,0]]:
[["frente",0,0],["perfil-esquerdo",-90,0],["tres-quartos-esquerdo",-40,0],
 ["costas",180,0],["perfil-direito",90,0],["tres-quartos-direito",40,0],
 ["inferior",-40,28],["superior",-40,-28],["frontal-baixo",0,20]];
const expressions=rapido?["neutra","surpresa"]:Object.keys(EXPRESSION_V2);
const modes=rapido?["construcao"]:["manequim","construcao","ecorche"];
const out=join(dirname(fileURLToPath(import.meta.url)),"saida","cabeca-v2");
if(svgOutput)mkdirSync(out,{recursive:true});
let ok=0,failures=[],records=[];
for(const fem of [0,1])for(const tipo of NOMES_BIOTIPOS){
  const w=createWorld(),p=w.P;
  w.cena.ativo.corpo(tipo).cabeca("v2");
  w.cena.ativo.corpo({feminino:fem});
  p.headDetail=rapido?0:1;
  for(const [view,yaw,pitch] of views)for(const expr of expressions){
    Object.assign(p,expressionParamsV2(p,expr));
    p.yaw=yaw;p.pitch=pitch;
    for(const mode of modes)try{
      w.setPreset(mode);
      const start=Date.now(),r=w.renderScene(w.sceneList(true),{...w.L,grid:false,floor:false,shadow:false},false,0);
      assert.ok(r.svg.length>10000&&!/NaN|Infinity|undefined/.test(r.svg));
      records.push({fem,tipo,view,expr,mode,bytes:r.svg.length,ms:Date.now()-start});ok++;
      if(svgOutput&&mode==="construcao"&&["perfil-esquerdo","tres-quartos-esquerdo","perfil","tres-quartos"].includes(view)
         &&["neutra","surpresa"].includes(expr)){
        writeFileSync(join(out,`${fem?"f":"m"}-${tipo}-${view}-${expr}.svg`),r.svg);
      }
    }catch(e){failures.push({fem,tipo,view,expr,mode,error:String(e)})}
  }
}
const target=rapido?60:1350;assert.equal(ok+failures.length,target);
if(svgOutput)writeFileSync(join(out,"manifesto.json"),JSON.stringify({ok,failed:failures.length,failures,records},null,2));
console.log(JSON.stringify({target,ok,failures:failures.length}));
assert.equal(failures.length,0);
