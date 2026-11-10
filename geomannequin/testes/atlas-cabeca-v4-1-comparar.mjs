/* Atlas comparativo: V4 inicial versus V4.1, em mesma câmera/escala.
 * Orelhas são V4.1 em ambas linhas (não há módulo antigo selecionável);
 * comparar apenas dimensões cranianas e o V facial. */
import {createWorld} from "../mcp/lib/core.mjs";
import {mkdirSync,writeFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const w=createWorld(),p=w.P,name=w.SCN.list[0].name;
Object.assign(p,{headModel:"v4_anatomical",headDetail:1,persp:0,jawOpen:0});
w.setPreset("construcao");
const base={v41OccipitalReduction:0,v41CranialCompactness:0,v41PosteriorArcTightness:0,
 v41MandibleConvergence:0,v41ChinTaper:0,v41ChinPointedness:0};
const edited={v41OccipitalReduction:.82,v41CranialCompactness:.28,
 v41PosteriorArcTightness:.55,v41MandibleConvergence:.85,v41ChinTaper:.82,v41ChinPointedness:.80};
const angles=[["Frontal",0,0],["3/4",45,10],["Perfil",90,0],["Traseira",180,0]];
const gap=18,top=55,W=w.W,H=w.H,cols=4,rows=2;
let img='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+(cols*W+(cols+1)*gap)+' '+(rows*H+(rows+1)*gap+top)+'">'+
  '<rect width="100%" height="100%" fill="white"/>'+
  '<text font-family="Arial" font-size="22" x="20" y="35">V4 original (acima) x V4.1 compacta e em V (abaixo) — mesmas câmeras</text>';
const meta=[],L={...w.L,planes:1,anat:1,jaw:1,feat:1,rings:0,merid:0,sphere:0,grid:0,
 floor:0,shadow:0,hands:0,arms:0,legs:0,torso:1};
for(let col=0;col<4;col++){
 const [title,azimute,elevacao]=angles[col];
 Object.assign(p,base);
 w.camera.orbitar(name,{area:"cabeca",azimute,elevacao,enquadrar:true,folga:1.4});
 const zoom=p.zoom,dist=p.camDist,tx=p.tx,ty=p.ty,tz=p.tz;
 for(let row=0;row<2;row++){
  Object.assign(p,row===0?base:edited);
  Object.assign(p,{zoom,camDist:dist,tx,ty,tz});
  const data=w.renderScene(w.sceneList(true),L,false,0);
  if(!data.svg||/NaN|Infinity|undefined/.test(data.svg))throw Error("SVG falhou: "+title+" linha "+row);
  const x=gap+col*(W+gap),y=top+gap+row*(H+gap);
  img+='<svg x="'+x+'" y="'+y+'" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'">'+data.svg+'</svg>'+
    '<text x="'+(x+12)+'" y="'+(y+H-13)+'" font-family="Arial" font-size="17">'+
    (row===0?"V4 / ":"V4.1 / ")+title+'</text>';
  meta.push({title,variant:row?"V4.1":"V4 original",azimute,elevacao,zoom,pivot:[tx,ty,tz],svgBytes:data.svg.length});
 }
}
img+='</svg>';
const dir=join(dirname(fileURLToPath(import.meta.url)),"saida","cabeca-v4-1");
mkdirSync(dir,{recursive:true});
writeFileSync(join(dir,"comparativo-cranio-queixo-v4-v41.svg"),img,"utf8");
writeFileSync(join(dir,"comparativo-cranio-queixo-v4-v41.json"),JSON.stringify(meta,null,2),"utf8");
console.log("ATLAS COMPARATIVO V4/V4.1:",meta.length,"vistas.");
