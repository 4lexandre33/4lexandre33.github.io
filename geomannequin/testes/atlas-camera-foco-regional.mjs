/* Atlas visual 3x3 do foco regional, SVGs reais do motor (não desenho simulado).
 * node testes/atlas-camera-foco-regional.mjs */
import {createWorld} from "../mcp/lib/core.mjs";
import {mkdirSync,writeFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const w=createWorld(),m=w.cena.ativo.renomear("Ana");
w.cena.objeto("caixa",{nome:"Caixa Focal",x:6,z:0,alt:5,giro:30});
w.camera.perspectiva(false);w.setPreset("construcao");
const views=[
 ["Cabeça · frente","Ana","cabeca",0,0],
 ["Cabeça · 3/4","Ana","cabeca",45,25],
 ["Cabeça · perfil","Ana","cabeca",90,0],
 ["Torso · 3/4","Ana","torso",-45,10],
 ["Mão esquerda","Ana","mao esquerda",45,-10],
 ["Braço direito","Ana","braco direito",-90,15],
 ["Pé esquerdo","Ana","pe esquerdo",135,-20],
 ["Objeto · superior","Caixa Focal","superior",45,55],
 ["Objeto · inferior","Caixa Focal","inferior",-45,-25]
];
const W=w.W,H=w.H,pad=18,top=56,meta=[];
let out='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+(W*3+pad*4)+' '+(H*3+pad*4+top)+'">'+
 '<rect width="100%" height="100%" fill="white"/>'+
 '<text x="22" y="36" font-family="Arial" font-size="24">GeoMannequin · órbita por região · 3×3</text>';
for(let i=0;i<views.length;i++){
 const [name,target,area,azimute,elevacao]=views[i];
 w.camera.orbitar(target,{area,azimute,elevacao,enquadrar:true,folga:1.08});
 const opts={...w.L,grid:false,shadow:false,floor:false};
 const start=Date.now(),r=w.renderScene(w.sceneList(true),opts,false,0);
 if(!r.svg||/NaN|Infinity|undefined/.test(r.svg))throw Error("Falha no SVG: "+name);
 const x=pad+(i%3)*(W+pad),y=top+pad+Math.floor(i/3)*(H+pad);
 out+='<svg x="'+x+'" y="'+y+'" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'">'+r.svg+'</svg>'+
   '<text x="'+(x+12)+'" y="'+(y+H-14)+'" font-family="Arial" font-size="17">'+name+'</text>';
 meta.push({name,target,area,azimute,elevacao,pivo:[w.P.tx,w.P.ty,w.P.tz],zoom:w.P.zoom,
   svgBytes:r.svg.length,ms:Date.now()-start});
}
out+='</svg>';
const dir=join(dirname(fileURLToPath(import.meta.url)),"saida","camera-foco-regional");mkdirSync(dir,{recursive:true});
writeFileSync(join(dir,"atlas-foco-regional-3x3.svg"),out,"utf8");
writeFileSync(join(dir,"atlas-foco-regional-3x3.json"),JSON.stringify(meta,null,2));
console.log("ATLAS ÓRBITA REGIONAL:",views.length,"vistas SVG reais");
