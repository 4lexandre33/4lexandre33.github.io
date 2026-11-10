/* V4.1 — crânio compacto, V facial 3D, mento estreito e orelhas.
 * Provas geométricas e regressão em dez biotipos × três resoluções. */
import assert from "node:assert/strict";
import {DEF} from "../src/engine/padroes.js";
import {shape,headPt,earSurf,buildHead} from "../src/engine/cabeca.js";
import {newCache,getMeshes} from "../src/engine/montagem.js";
import {bustFrame,bustR,bustZc} from "../src/engine/corpo.js";
import {sectionV4,pointV4,anatomicalCurvesV4,inspectHeadV4,yAt} from "../src/engine/head-v4/index.js";
import {earPointV41,buildEarV41,earCurvesV41,earMetricsV41} from "../src/engine/head-v4/ear-anatomy.js";
import {watertightMeshV4,meshTopologyV4} from "../src/engine/head-v4/mesh-export.js";
import {NOMES_BIOTIPOS,aplicarBiotipo} from "../src/scene/biotipos.js";
const near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<=tol,a+" != "+b);
const allFinite=a=>a.every(Number.isFinite);
let variants=0,vertices=0,curves=0;
for(const sex of [0,1])for(const kind of NOMES_BIOTIPOS){
 const p={...DEF,headModel:"v4_anatomical",_cache:newCache()};
 aplicarBiotipo(p,kind,sex);
 const S=shape(p),sec=v=>sectionV4(v,p,S);
 const baseline={...p,v41OccipitalReduction:0,v41CranialCompactness:0,v41PosteriorArcTightness:0,
   v41MandibleConvergence:0,v41ChinTaper:0,v41ChinPointedness:0};
 /* Profundidade occipital é encurtada, mas o plano frontal e a testa não
  * deslocam: compressão exclusivamente posterior. */
 for(const v of [.27,.40,.53,.64]){
   assert.ok(sec(v).back>sectionV4(v,baseline,S).back+.16,
     "Occipital não reduziu o suficiente: "+kind+" "+v);
   near(sec(v).front,sectionV4(v,baseline,S).front);
 }
 assert.ok(sec(.60).width>sec(.39).width*.88,"Estreitamento temporal");
 assert.ok(Math.abs(sec(.39).front-sec(.47).front)<.05,"Testa inflada");
 const maxillary=sec(.64).width,gonion=sec(.86).width,menton=sec(.985).width;
 assert.ok(gonion<maxillary*.82,"Mandíbula sem convergência V");
 assert.ok(menton<maxillary*.23&&menton>maxillary*.045,
   "Mento sem cunha estreita ou degenerado");
 assert.ok(menton<sectionV4(.985,baseline,S).width*.64,
   "Queixo não se afunilou em relação à V4 base");
 /* É uma mudança 3D: o volume no plano lateral também varia, não
  * apenas a largura projetada na visão frontal. */
 const v=.925,theta=.95,y=yAt(v,S);
 const side=pointV4(y,theta,p,S),before=pointV4(y,theta,baseline,S);
 assert.ok(side[0]<before[0]-.02&&side[2]<before[2]-.012,
   "V não existe nos dois eixos X/Z");
 const neg=pointV4(y,-theta,p,S);
 near(side[0],-neg[0]);near(side[1],neg[1]);near(side[2],neg[2]);
 /* Altura da orelha próxima ao arco superciliar/base nasal, ajustada
  * proporcionalmente pelo tipo corporal; testa e mandíbula mantidas. */
 const m=earMetricsV41(p,S),brow=yAt(.468,S),nose=yAt(.785,S);
 assert.ok(Math.abs(m.top-brow)<.065&&Math.abs(m.bottom-nose)<.065,
   "Orelha desalinhada: "+kind);
 const metricsL=earPointV41(p,S,-1,0,0),metricsR=earPointV41(p,S,1,0,0);
 near(metricsL[0],-metricsR[0]);near(metricsL[1],metricsR[1]);near(metricsL[2],metricsR[2]);
 const shell=buildEarV41(p,S,1);
 assert.ok(shell.rows>=20&&shell.cols>=50&&allFinite(shell.V));
 for(const c of earCurvesV41(p,S,1))assert.ok(c.pts.length>=19&&c.pts.every(allFinite));
 const low=earPointV41({...p,v41EarRelief:.5},S,1,.90,0),
   high=earPointV41({...p,v41EarRelief:1.55},S,1,.90,0);
 assert.ok(high[0]>low[0]+.022,"O controle de relevo auricular não funciona");
 const setback=earPointV41({...p,v41EarSetback:.14},S,1,0,0);
 assert.ok(setback[2]>metricsR[2]+.10,"Controle de posição auricular não funciona");
 const guideKinds=new Set(anatomicalCurvesV4(p,S).map(g=>g.kind));
 for(const k of ["facial-v-plane","chin-wedge","mandibular-angle","zygomatic"])
   assert.ok(guideKinds.has(k),"Falta guia anatômica "+k);
 curves+=anatomicalCurvesV4(p,S).length;
 const F=bustFrame(p,S),neckBack=bustZc(F.yTop,F)-bustR(F.yTop,Math.PI,p,F);
 assert.ok(neckBack>sec(Math.min(1,Math.max(0,(1-F.yTop)/(1-S.chinY)))).back+.08,
   "Pescoço atravessa a nuca na junção");
 for(const lod of [0,1,2]){
   p.headDetail=lod;const mesh=buildHead(p,S),d=inspectHeadV4(p,S,mesh);
   assert.equal(d.nonfinite,0);assert.equal(d.degenerate,0);
   vertices+=d.vertices;
 }
 p.headDetail=1;
 const topo=meshTopologyV4(watertightMeshV4(p,S));
 assert.equal(topo.invalid,0);assert.equal(topo.degenerate,0);
 assert.equal(topo.boundary,0);assert.equal(topo.nonmanifold,0);
 variants++;
}
assert.equal(variants,10);
{
 const p={...DEF,headModel:"v4_anatomical",_cache:newCache()},S=shape(p);
 const m0=getMeshes(p,S).head,e0=getMeshes(p,S).earR;
 p.v41OccipitalReduction=.20;p.v41ChinPointedness=.25;p.v41EarSetback=.13;
 const m1=getMeshes(p,S).head,e1=getMeshes(p,S).earR;
 assert.notStrictEqual(m0,m1,"Cache não atualizou cabeça após novos sliders");
 assert.notStrictEqual(e0,e1,"Cache não atualizou orelha após novos sliders");
 p.headModel="v3_microgeometry";
 const m2=getMeshes(p,S).head;
 assert.notStrictEqual(m1,m2,"A V4 alterou a malha legada V3");
}
console.log("V4.1 ANATOMIA PASS:",variants,"biotipos, 30 LOD,",vertices,"vértices,",curves,"curvas.");
