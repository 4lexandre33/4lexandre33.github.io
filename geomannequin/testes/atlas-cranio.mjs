/* GeoMannequin — folha 3×3 de curvatura da cabeça.
   node testes/atlas-cranio.mjs [masculino|feminino] [magro|medio|atletico|musculoso|cheio]
   Renderiza vistas de perfil, três quartos, frente, costas, por baixo e por cima.
   Não substitui a análise visual de um modelador humano. */
import { createWorld } from "../mcp/lib/core.mjs";
import { NOMES_BIOTIPOS } from "../src/scene/biotipos.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";

const sexo=process.argv[2]||"masculino",tipo=process.argv[3]||"medio";
if(!["masculino","feminino"].includes(sexo)||!NOMES_BIOTIPOS.includes(tipo))
  throw Error("Uso: node testes/atlas-cranio.mjs masculino|feminino magro|medio|atletico|musculoso|cheio");
const w=createWorld();
w.cena.ativo.corpo(sexo+" "+tipo);w.setPreset("construcao");
const p=w.P;
Object.assign(p,{camDist:8.2,lens:51,ty:-0.4,tz:0,tx:0,persp:1,panX:0,panY:0});
const views=[
  ["perfil esquerdo",-90,0,0],["tres quartos esquerdo",-40,0,0],["frente",0,0,0],
  ["costas",180,0,0],["tres quartos direito",40,0,0],["perfil direito",90,0,0],
  ["de baixo",-40,22,0],["boca aberta",0,0,0.85],["occipital",145,0,0]
];
const ww=w.W,hh=w.H,margin=28,head=54;
const totalW=3*ww+4*margin,totalH=3*hh+4*margin+head;
let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}"><rect width="100%" height="100%" fill="white"/><text x="${margin}" y="37" font-family="Arial" font-size="26" fill="#333">GeoMannequin · Crânio 3×3 · ${sexo} ${tipo}</text>`;
for(let i=0;i<views.length;i++){
  const [name,yaw,pitch,open]=views[i];Object.assign(p,{yaw,pitch,jawOpen:open});
  const img=w.renderScene(w.sceneList(true),{...w.L,fill:false,shade:false,grid:false,shadow:false,floor:false,horizon:false,hidden:false},false,0);
  if(!img.svg||/NaN|Infinity|undefined/.test(img.svg))throw Error("SVG inválido: "+name);
  const col=i%3,row=(i/3)|0,x=margin+col*(ww+margin),y=head+margin+row*(hh+margin);
  svg+=`<svg x="${x}" y="${y}" width="${ww}" height="${hh}" viewBox="0 0 ${ww} ${hh}"><rect width="100%" height="100%" fill="white"/>${img.svg}</svg>`;
  svg+=`<text x="${x+14}" y="${y+hh-14}" font-family="Arial" font-size="19" fill="#333">${name}</text>`;
}
svg+="</svg>";
const out=join(dirname(fileURLToPath(import.meta.url)),"saida","atlas-cranio");
mkdirSync(out,{recursive:true});const target=join(out,`atlas-${sexo}-${tipo}.svg`);
writeFileSync(target,svg,"utf8");console.log("  ok  atlas craniano: "+target+" ("+views.length+" vistas)");
