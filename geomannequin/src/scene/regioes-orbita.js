/* GeoMannequin — regiões focais de órbita.
 * Reutiliza cápsulas anatômicas em coordenadas de MUNDO (seguem a pose)
 * e caixas 3D reais dos objetos. Nada de pivôs fixos em pixel ou altura. */
import { SCN } from "./modelo.js";
import { pMundo } from "./colisoes.js";
import { capsulas, partesDoObjeto, restGround, shape, chainSetup, applyA, paraMundo } from "../engine/index.js";

const AREAS_MAN_ORB = Object.freeze([
  ["", "Corpo inteiro"],
  ["cabeca", "Cabeça"], ["rosto", "Rosto"], ["pescoco", "Pescoço"],
  ["torso", "Torso completo"], ["torax", "Tórax"], ["abdomen", "Abdômen"], ["quadril", "Quadril"],
  ["ombros", "Ombros"], ["bracos", "Braços"], ["braco_esquerdo", "Braço esquerdo"],
  ["braco_direito", "Braço direito"], ["antebracos", "Antebraços"],
  ["antebraco_esquerdo", "Antebraço esquerdo"], ["antebraco_direito", "Antebraço direito"],
  ["maos", "Mãos"], ["mao_esquerda", "Mão esquerda"], ["mao_direita", "Mão direita"],
  ["pernas", "Pernas"], ["coxas", "Coxas"], ["canelas", "Canelas"],
  ["canela_esquerda", "Canela esquerda"], ["canela_direita", "Canela direita"],
  ["coxa_esquerda", "Coxa esquerda"], ["coxa_direita", "Coxa direita"],
  ["perna_esquerda", "Perna esquerda"], ["perna_direita", "Perna direita"],
  ["pes", "Pés"], ["pe_esquerdo", "Pé esquerdo"], ["pe_direito", "Pé direito"]
]);
const AREAS_OBJ_ORB = Object.freeze([
  ["", "Objeto inteiro"], ["superior", "Parte superior"], ["central", "Parte central"],
  ["inferior", "Parte inferior"], ["tampo", "Topo"], ["base", "Base"]
]);
const CAP_ORB = Object.freeze({
  cabeca: ["cabeca"], pescoco: ["pescoco"],
  torso: ["torax", "abdomen", "pelve"], torax: ["torax"], abdomen: ["abdomen"], quadril: ["pelve"],
  ombros: ["bracoE", "bracoD", "torax"],
  bracos: ["bracoE", "bracoD", "antebracoE", "antebracoD"],
  braco_esquerdo: ["bracoE", "antebracoE"], braco_direito: ["bracoD", "antebracoD"],
  antebracos: ["antebracoE", "antebracoD"],
  antebraco_esquerdo: ["antebracoE"], antebraco_direito: ["antebracoD"],
  maos: ["maoE", "maoD"], mao_esquerda: ["maoE"], mao_direita: ["maoD"],
  pernas: ["coxaE", "coxaD", "pernaE", "pernaD"],
  coxas: ["coxaE", "coxaD"], canelas: ["pernaE", "pernaD"],
  canela_esquerda: ["pernaE"], canela_direita: ["pernaD"],
  coxa_esquerda: ["coxaE"], coxa_direita: ["coxaD"],
  perna_esquerda: ["coxaE", "pernaE"],
  perna_direita: ["coxaD", "pernaD"],
  pes: ["peE", "peD"], pe_esquerdo: ["peE"], pe_direito: ["peD"]
});
const textoOrb=t=>String(t??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[-_]/g," ").replace(/\s+/g," ").trim();
const aliasOrb={
  "corpo":"", "corpo inteiro":"", "inteiro":"", "completo":"", "total":"",
  "cabeca":"cabeca","face":"rosto","facial":"rosto","pescoco":"pescoco",
  "tronco":"torso","peito":"torax","barriga":"abdomen","bacia":"quadril",
  "braco":"bracos","bracos":"bracos","maos":"maos","mao":"maos",
"braco esquerdo":"braco_esquerdo",
  "braco direito":"braco_direito", "antebraco":"antebracos",
  "antebracos":"antebracos","antebraco esquerdo":"antebraco_esquerdo","antebraco direito":"antebraco_direito",
  "mao esquerda":"mao_esquerda","mao direita":"mao_direita",
  "pernas":"pernas","perna":"pernas","coxas":"coxas","coxa":"coxas",
  "canelas":"canelas","canela":"canelas","canela esquerda":"canela_esquerda","canela direita":"canela_direita",
  "perna esquerda":"perna_esquerda","perna direita":"perna_direita",
  "coxa esquerda":"coxa_esquerda","coxa direita":"coxa_direita",
  "pes":"pes","pe":"pes","pe esquerdo":"pe_esquerdo","pe direito":"pe_direito",
  "parte superior":"superior","superior":"superior","cima":"superior","alto":"superior",
  "parte inferior":"inferior","inferior":"inferior","baixo":"inferior",
  "meio":"central","centro":"central","central":"central",
  "topo":"tampo","tampo":"tampo","base":"base"
};
function regioesDisponiveisOrbita(tipo){return tipo==="objeto"?AREAS_OBJ_ORB:AREAS_MAN_ORB}
function normalizarAreaOrbita(area,tipo){
 if(area===undefined||area===null||area==="")return null;
 const t=textoOrb(area),id=Object.prototype.hasOwnProperty.call(aliasOrb,t)?aliasOrb[t]:t.replace(/ /g,"_");
 if(!id)return null;
 if(!regioesDisponiveisOrbita(tipo).some(([k])=>k===id))
  throw new Error("Área de órbita indisponível para "+(tipo==="objeto"?"objeto":"manequim")+": “"+area+"”. Escolha: "+regioesDisponiveisOrbita(tipo).map(x=>x[1]).join(", ")+".");
 return id;
}
function caixaInicialOrb(){return [Infinity,-Infinity,Infinity,-Infinity,Infinity,-Infinity]}
function incluirOrb(bb,v,r=0){
 for(let i=0;i<3;i++){bb[2*i]=Math.min(bb[2*i],v[i]-r);bb[2*i+1]=Math.max(bb[2*i+1],v[i]+r)}
}
function caixaFinalOrb(bb){
 if(bb.some(v=>!Number.isFinite(v)))throw Error("Não foi possível calcular os limites da região orbital.");
 return bb;
}
function nomesDaRegiaoOrb(area){
 if(area==="perna_esquerda")return ["coxaE","pernaE"];
 return CAP_ORB[area]||[];
}
function caixaManequimOrb(it,area){
 const p=pMundo(it),reg=normalizarAreaOrbita(area,"manequim"),bb=caixaInicialOrb();
 if(reg==="rosto"){
  const S=shape(p),ch=chainSetup(p,S),M=paraMundo(p);
  for(const x of [-.60,.60])for(const y of [-.55,.45])for(const z of [.48,1.08])
   incluirOrb(bb,M(applyA(ch.A3,[x,y,z])));
 }else{
  const nomes=reg?nomesDaRegiaoOrb(reg):null;
  for(const c of capsulas(p).caps){
    if(nomes&&!nomes.includes(c.nome))continue;
    incluirOrb(bb,c.a,c.r);incluirOrb(bb,c.b,c.r);
  }
 }
 caixaFinalOrb(bb);
 const wr=(p.wRot||0)*Math.PI/180;
 return {bb,frente:[Math.sin(wr),Math.cos(wr)],tipo:"manequim",area:reg};
}
function caixaObjetoOrb(o,area){
 const reg=normalizarAreaOrbita(area,"objeto"),bb=caixaInicialOrb(),g0=restGround(SCN.list[0].params);
 for(const b of partesDoObjeto(o,g0)){
  for(let i=0;i<3;i++){
   const d=b.h.reduce((s,h,k)=>s+Math.abs(h*b.e[k][i]),0);
   bb[i*2]=Math.min(bb[i*2],b.c[i]-d);
   bb[i*2+1]=Math.max(bb[i*2+1],b.c[i]+d);
  }
 }
 caixaFinalOrb(bb);
 if(reg){
  const lo=bb[2],height=bb[3]-bb[2],part=height/3;
  if(reg==="superior"){bb[2]=lo+2*part}
  else if(reg==="inferior"){bb[3]=lo+part}
  else if(reg==="central"){bb[2]=lo+part;bb[3]=lo+2*part}
  else if(reg==="tampo"){bb[2]=bb[3]-Math.max(.10,height*.14)}
  else if(reg==="base"){bb[3]=bb[2]+Math.max(.10,height*.14)}
 }
 const ang=(o.giro||0)*Math.PI/180;
 return {bb,frente:[Math.sin(ang),Math.cos(ang)],tipo:"objeto",area:reg};
}
export {AREAS_MAN_ORB,AREAS_OBJ_ORB,normalizarAreaOrbita,regioesDisponiveisOrbita,caixaManequimOrb,caixaObjetoOrb};
