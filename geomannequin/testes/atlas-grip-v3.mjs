/* Atlas 3x3 — preensão 6DOF, transporte, soltura e queda.
 * node testes/atlas-grip-v3.mjs
 * Gera SVG no diretório testes/saida/grip-v3 (não altera o app).
 */
import {createWorld} from "../mcp/lib/core.mjs";
import {mkdirSync,writeFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {restGround} from "../src/engine/index.js";
import {objectRigidPose} from "../src/engine/rigid-transform.js";
const w=createWorld(),m=w.cena.ativo.renomear("Ator Grip");
const cadeira=w.cena.objeto("cadeira",{nome:"Cadeira Atlas",x:3,z:0});
Object.assign(w.P,{persp:0,yaw:42,pitch:9,zoom:.82});
w.setPreset("construcao");
const ground=restGround(w.SCN.list[0].params);
const frames=[
 ["01 · Cadeira livre",()=>{}],
 ["02 · Pegar encosto",()=>w.cena.segurarObjeto("Cadeira Atlas",{mao:"direita",ponto:"encostoTopo",reach:100})],
 ["03 · Erguer braço",()=>m.parametro("armFlexR",35)],
 ["04 · Flexionar cotovelo",()=>m.parametro("elbowR",75)],
 ["05 · Pronacao do punho",()=>m.parametro("pronR",45)],
 ["06 · Girar o manequim",()=>m.girar(55)],
 ["07 · Soltar no ar",()=>w.cena.soltarObjeto("Cadeira Atlas",{modo:"manter"})],
 ["08 · Iniciar queda",()=>cadeira.cair({restituicao:.1})],
 ["09 · Final da queda",()=>w.cena.simularQueda({duracao:3,passo:1/60})]
];
const W=w.W,H=w.H,pad=18,head=64,meta=[];
let out='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+
 (W*3+pad*4)+' '+(H*3+pad*4+head)+'"><rect width="100%" height="100%" fill="white"/>'+
 '<text x="20" y="36" font-family="Arial" font-size="24">GeoMannequin | Atlas preensao V3 | 3x3</text>';
for(let i=0;i<frames.length;i++){
 const [label,change]=frames[i];change();
 const pose=objectRigidPose(w.SCN.objetos.find(o=>o.nome==="Cadeira Atlas"),ground);
 const r=w.renderScene(w.sceneList(true),{...w.L,grid:false,shadow:true},false,0);
 if(!r.svg||/NaN|Infinity|undefined/.test(r.svg))throw Error("SVG inválido: "+label);
 const x=pad+(i%3)*(W+pad),y=head+pad+Math.floor(i/3)*(H+pad);
 out+='<svg x="'+x+'" y="'+y+'" width="'+W+'" height="'+H+
   '" viewBox="0 0 '+W+' '+H+'">'+r.svg+'</svg>'+
   '<text x="'+(x+12)+'" y="'+(y+H-14)+'" font-family="Arial" font-size="17">'+label+'</text>';
 meta.push({etapa:label,matriz:pose.M,origem:pose.T,bytes:r.svg.length});
}
out+='</svg>';
const dir=join(dirname(fileURLToPath(import.meta.url)),"saida","grip-v3");
mkdirSync(dir,{recursive:true});
writeFileSync(join(dir,"atlas-grip-v3-3x3.svg"),out,"utf8");
writeFileSync(join(dir,"atlas-grip-v3-3x3.json"),JSON.stringify(meta,null,2),"utf8");
console.log("ATLAS GRIP V3 PASS: 9 vistas salvas",dir);
