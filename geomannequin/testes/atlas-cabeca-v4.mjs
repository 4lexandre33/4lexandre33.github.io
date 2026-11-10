/* Cabeça V4: 3×3 do motor real com crânio e pescoço.
 * node testes/atlas-cabeca-v4.mjs masculino medio
 * node testes/atlas-cabeca-v4.mjs feminino medio */
import {createWorld} from "../mcp/lib/core.mjs";
import {NOMES_BIOTIPOS,aplicarBiotipo} from "../src/scene/biotipos.js";
import {mkdirSync,writeFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const sexo=process.argv[2]||"masculino",tipo=process.argv[3]||"medio";
if(!["masculino","feminino"].includes(sexo)||!NOMES_BIOTIPOS.includes(tipo))
 throw Error("Sexo/biotipo desconhecido");
const w=createWorld(),p=w.P;
aplicarBiotipo(p,tipo,sexo==="feminino"?1:0);
Object.assign(p,{headModel:"v4_anatomical",headDetail:1,persp:0,jawOpen:0});
w.setPreset("construcao");
const W=w.W,H=w.H,pad=18,top=56;
const views=[
 ["Frontal",0,0],["3/4 direito",45,10],["Perfil direito",90,0],
 ["3/4 posterior",-135,8],["Traseira",180,0],["Perfil esquerdo",-90,0],
 ["De baixo",30,-55],["De cima",-30,55],["3/4 esquerdo",-45,12]
];
let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+(W*3+pad*4)+' '+(H*3+pad*4+top)+'"><rect width="100%" height="100%" fill="#fff"/>'+
 '<text x="22" y="36" font-family="Arial" font-size="24">GeoMannequin V4 | '+sexo+' | '+tipo+' | crânio + pescoço</text>';
const report=[];
for(let i=0;i<views.length;i++){
 const [label,azimute,elevacao]=views[i];
 w.camera.orbitar(w.SCN.list[0].name,{area:"cabeca",azimute,elevacao,enquadrar:true,folga:1.35});
 const options={...w.L,planes:1,rings:1,merid:0,anat:1,feat:1,sphere:0,
   torso:1,arms:0,hands:0,legs:0,grid:0,shadow:0,floor:0};
 const t=Date.now(),r=w.renderScene(w.sceneList(true),options,false,0);
 if(!r.svg||/NaN|Infinity|undefined/.test(r.svg))throw Error("SVG inválido: "+label);
 const x=pad+(i%3)*(W+pad),y=top+pad+Math.floor(i/3)*(H+pad);
 svg+='<svg x="'+x+'" y="'+y+'" width="'+W+'" height="'+H+
  '" viewBox="0 0 '+W+' '+H+'">'+r.svg+'</svg><text x="'+(x+14)+'" y="'+(y+H-14)+
  '" font-family="Arial" font-size="18">'+label+'</text>';
 report.push({label,azimute,elevacao,zoom:p.zoom,svgBytes:r.svg.length,ms:Date.now()-t});
}
svg+='</svg>';
const dir=join(dirname(fileURLToPath(import.meta.url)),"saida","cabeca-v4");
mkdirSync(dir,{recursive:true});
const name=sexo+"-"+tipo+"-3x3";
writeFileSync(join(dir,name+".svg"),svg,"utf8");
writeFileSync(join(dir,name+".json"),JSON.stringify(report,null,2),"utf8");
console.log("ATLAS V4:",name,report.length,"vistas");
