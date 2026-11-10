import {createWorld} from "../mcp/lib/core.mjs";
import {NOMES_BIOTIPOS,aplicarBiotipo} from "../src/scene/biotipos.js";
import {mkdirSync,writeFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
/* Folha técnica com nove vistas reais (nunca imagens geradas).
   node testes/atlas-planos-loomis.mjs [masculino|feminino] [biotipo] */
const sex=process.argv[2]||"masculino",type=process.argv[3]||"medio";
if(!["masculino","feminino"].includes(sex)||!NOMES_BIOTIPOS.includes(type))throw Error("Sexo ou biotipo desconhecido");
const views=[["frente",0,0,0],["perfil esquerdo",-90,0,0],["3/4 esquerdo",-45,0,0],
["perfil direito",90,0,0],["costas",180,0,0],["3/4 direito",45,0,0],
["superior",-55,-30,0],["inferior",-50,27,0],["boca aberta",-45,0,.90]];
const w=createWorld(),p=w.P;aplicarBiotipo(p,type,sex==="feminino"?1:0);
Object.assign(p,{headModel:"v2",headDetail:1,persp:0,zoom:2.7,panY:-.12});w.setPreset("construcao");
const W=w.W,H=w.H,pad=16,top=54;
let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W*3+pad*4} ${H*3+pad*4+top}"><rect width="100%" height="100%" fill="#fff"/><text x="24" y="38" font-size="24" font-family="Arial">LOOMIS · CABEÇA V2 · ${sex} ${type}</text>`;
const timings=[];
for(let i=0;i<views.length;i++){
 const [name,yaw,pitch,jawOpen]=views[i];Object.assign(p,{yaw,pitch,jawOpen});
 const opts={...w.L,planes:1,rings:1,merid:1,grid:false,shadow:false,floor:false,torso:false,legs:false,arms:false,hands:false};
 const start=Date.now(),r=w.renderScene(w.sceneList(true),opts,false,0);
 if(!r.svg||/NaN|Infinity|undefined/.test(r.svg))throw Error("SVG inválido "+name);
 const x=pad+(i%3)*(W+pad),y=top+pad+Math.floor(i/3)*(H+pad);
 svg+=`<svg x="${x}" y="${y}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${r.svg}</svg><text x="${x+12}" y="${y+H-15}" font-family="Arial" font-size="17">${name}</text>`;
 timings.push({name,bytes:r.svg.length,ms:Date.now()-start});
}
svg+="</svg>";
const dir=join(dirname(fileURLToPath(import.meta.url)),"saida","cabeca-v2-planos");mkdirSync(dir,{recursive:true});
const name=`loomis-${sex}-${type}`;
writeFileSync(join(dir,name+".svg"),svg,"utf8");
writeFileSync(join(dir,name+".json"),JSON.stringify(timings,null,2));
console.log("Atlas gerado:",name,views.length,"vistas");
