/* Atlas de nove vistas da cabeça V3 renderizadas pelo motor real. */
import {createWorld} from "../mcp/lib/core.mjs";
import {NOMES_BIOTIPOS,aplicarBiotipo} from "../src/scene/biotipos.js";
import {mkdirSync,writeFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const sexo=process.argv[2]||"masculino",tipo=process.argv[3]||"medio";
if(!["masculino","feminino"].includes(sexo)||!NOMES_BIOTIPOS.includes(tipo))throw Error("Sexo ou biotipo inválido");
const views=[["frente",0,0],["perfil esquerdo",-90,0],["3/4 esquerdo",-45,0],
 ["perfil direito",90,0],["costas",180,0],["3/4 direito",45,0],
 ["superior",-55,-30],["inferior",-50,27],["neutra diagonal",-25,12]];
const w=createWorld(),p=w.P;aplicarBiotipo(p,tipo,sexo==="feminino"?1:0);
Object.assign(p,{headModel:"v3_microgeometry",microDensity:1,microStrength:1,
  headDetail:1,persp:0,zoom:2.7,panY:-.12,jawOpen:0});
w.setPreset("construcao");
const W=w.W,H=w.H,pad=16,top=55;
let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+(W*3+pad*4)+' '+(H*3+pad*4+top)+'"><rect width="100%" height="100%" fill="#fff"/>'+
 '<text x="24" y="38" font-size="24" font-family="Arial">HEAD V3 MICROGEOMETRY · '+sexo+' · '+tipo+'</text>';
const log=[];
for(let i=0;i<views.length;i++){
 const [name,yaw,pitch]=views[i];Object.assign(p,{yaw,pitch});
 const opts={...w.L,planes:1,rings:1,merid:1,sphere:0,grid:false,shadow:false,floor:false,
  torso:false,legs:false,arms:false,hands:false};
 const begin=Date.now(),result=w.renderScene(w.sceneList(true),opts,false,0);
 if(!result.svg||/NaN|Infinity|undefined/.test(result.svg))throw Error("SVG inválido na vista "+name);
 const x=pad+(i%3)*(W+pad),y=top+pad+Math.floor(i/3)*(H+pad);
 svg+='<svg x="'+x+'" y="'+y+'" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'">'+result.svg+'</svg>'+
   '<text x="'+(x+12)+'" y="'+(y+H-15)+'" font-family="Arial" font-size="17">'+name+'</text>';
 log.push({name,bytes:result.svg.length,ms:Date.now()-begin});
}
svg+='</svg>';
const directory=join(dirname(fileURLToPath(import.meta.url)),"saida","cabeca-v3");
mkdirSync(directory,{recursive:true});
const base=sexo+"-"+tipo+"-3x3";
writeFileSync(join(directory,base+".svg"),svg,"utf8");
writeFileSync(join(directory,base+".json"),JSON.stringify(log,null,2));
console.log("Atlas V3 gerado:",base,views.length,"vistas");
