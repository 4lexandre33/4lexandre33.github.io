/* Atlas QA 3x3 da Cabeça V3 com PESCOÇO real (não crânio isolado).
 * Gera SVGs de vistas opostas, métricas de contorno e JSON de parâmetros. */
import {createWorld} from "../mcp/lib/core.mjs";
import {NOMES_BIOTIPOS,aplicarBiotipo} from "../src/scene/biotipos.js";
import {mkdirSync,writeFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const sexo=process.argv[2]||"masculino",biotipo=process.argv[3]||"medio";
if(!["masculino","feminino"].includes(sexo)||!NOMES_BIOTIPOS.includes(biotipo))
 throw Error("Biotipo/sexo inválido para o atlas V3");
const w=createWorld(),p=w.P,name=w.SCN.list[0].name;
aplicarBiotipo(p,biotipo,sexo==="feminino"?1:0);
Object.assign(p,{headModel:"v3_microgeometry",microDensity:1,microStrength:1,
 headDetail:1,persp:0,jawOpen:0});
w.setPreset("construcao");
const views=[
 ["Frontal",0,0],["3/4 esquerdo",45,12],["Perfil esquerdo",90,0],
 ["Costas",180,0],["3/4 direito",-45,12],["Perfil direito",-90,0],
 ["Superior",40,62],["Inferior",-40,-50],["Frontal próximo",0,4]
];
const W=w.W,H=w.H,pad=18,top=64,log=[];
let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+(W*3+pad*4)+' '+(H*3+pad*4+top)+'">'+
 '<rect width="100%" height="100%" fill="#fff"/><text x="24" y="40" font-size="24" font-family="Arial">V3 CORRIGIDA · crânio + pescoço · '+sexo+' · '+biotipo+'</text>';
for(let i=0;i<views.length;i++){
 const [titulo,azimute,elevacao]=views[i];
 w.camera.orbitar(name,{area:"cabeca",azimute,elevacao,enquadrar:true,folga:i===8?1.3:1.65});
 const L={...w.L,sphere:0,planes:1,rings:1,merid:1,anat:1,
   torso:1,arms:0,legs:0,hands:0,grid:0,floor:0,shadow:0};
 const start=Date.now(),r=w.renderScene(w.sceneList(true),L,false,0);
 if(!r.svg||/NaN|Infinity|undefined/.test(r.svg))throw Error("SVG inválido: "+titulo);
 const x=pad+(i%3)*(W+pad),y=top+pad+Math.floor(i/3)*(H+pad);
 svg+='<svg x="'+x+'" y="'+y+'" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'">'+r.svg+'</svg>'+
 '<text x="'+(x+15)+'" y="'+(y+H-18)+'" font-size="18" font-family="Arial">'+titulo+'</text>';
 log.push({titulo,azimute,elevacao,camera:[p.tx,p.ty,p.tz],zoom:p.zoom,
   ms:Date.now()-start,bytes:r.svg.length});
}
svg+='</svg>';
const dir=join(dirname(fileURLToPath(import.meta.url)),"saida","cabeca-v3-reconstrucao");
mkdirSync(dir,{recursive:true});
const base=sexo+"-"+biotipo+"-cranio-pescoco-3x3";
writeFileSync(join(dir,base+".svg"),svg,"utf8");
writeFileSync(join(dir,base+".json"),JSON.stringify(log,null,2),"utf8");
console.log("ATLAS ANATOMIA V3:",base,views.length,"vistas");
