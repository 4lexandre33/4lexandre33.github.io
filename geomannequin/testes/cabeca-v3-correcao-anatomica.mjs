/* Cabeça V3 pós-correção: anatomia por seções, nuca, pescoço e
 * guias Loomis/Asaro sobre superfície real. Executar em Node 22. */
import assert from "node:assert/strict";
import {DEF} from "../src/engine/padroes.js";
import {shape,buildHead,headPt} from "../src/engine/cabeca.js";
import {getMeshes,newCache} from "../src/engine/montagem.js";
import {bustFrame,bustR,bustZc} from "../src/engine/corpo.js";
import {sectionV3,normalizedHeight,yAt,pointV3,anatomicalCurvesV3,landmarksV3,inspectHeadV3} from "../src/engine/head-v3/index.js";
import {watertightMeshV3,meshTopologyV3} from "../src/engine/head-v3/mesh-export.js";
import {NOMES_BIOTIPOS,aplicarBiotipo} from "../src/scene/biotipos.js";
const near=(x,y,eps=1e-4)=>assert.ok(Math.abs(x-y)<=eps,`${x} vs. ${y} (tol ${eps})`);
let variants=0,meshes=0,vertices=0,reference=0;
for(const fem of [0,1])for(const biotipo of NOMES_BIOTIPOS){
 const p={...DEF,headModel:"v3_microgeometry",fem};
 aplicarBiotipo(p,biotipo,fem);
 const S=shape(p),F=bustFrame(p,S);
 const sec=v=>sectionV3(v,p,S);
 /* Calota: curvatura/planos sem estreitamento côncavo temporal. */
 const top=sec(.33).width,side=sec(.60).width;
 assert.ok(side>top*.91,"Estrangulamento temporal: "+biotipo);
 assert.ok(sec(.40).back<sec(.67).back&&sec(.67).back<sec(.83).back,
   "Degrau/inversão na transição occipital: "+biotipo);
 assert.ok(Math.abs(sec(.33).front-sec(.46).front)<.055,"Testa convexa demais");
 /* O topo do pescoço precisa estar DENTRO do volume craniano. */
 const neckBack=bustZc(F.yTop,F)-bustR(F.yTop,Math.PI,p,F),
       headBack=sec(normalizedHeight(F.yTop,S)).back,
       jawWidth=sec(.83).width;
 assert.ok(neckBack>headBack+.08,
   "Nuca corta a caixa craniana na junção superior: "+biotipo);
 assert.ok(F.B.neck<jawWidth*.90,
   "Cilindro cervical mais largo que a mandíbula: "+biotipo);
 assert.ok(F.B.neck<sec(.65).width*.78,"Pescoço excede as maçãs do rosto");
 /* Brow externo acima da órbita e nariz anterior à maxila. */
 const theta=Math.asin(.35),pt=(v,th=0)=>pointV3(yAt(v,S),th,p,S);
 assert.ok(pt(.48,theta)[2]>pt(.54,theta)[2]+.028,"Órbita afundou a silhueta");
 assert.ok(pt(.744)[2]>pt(.86)[2]+.07,"Ponte/prisma nasal não projetam");
 assert.ok(pt(.86)[2]<pt(.95)[2]+.10,"Boca em bico comparada ao mento");
 /* Perfis opostos rigorosamente espelhados (sem materiais assimétricos). */
 for(const v of [.10,.28,.45,.6,.7,.85,.96]){
  const y=yAt(v,S),l=headPt(y,-.75,p,S),r=headPt(y,.75,p,S);
  near(l[0],-r[0]);near(l[1],r[1]);near(l[2],r[2]);
 }
 const guides=anatomicalCurvesV3(p,S),landmarks=landmarksV3(p,S);
 assert.ok(guides.length>=13&&landmarks.length>=17);
 assert.ok(guides.some(g=>g.kind==="temporal-ridge"));
 assert.ok(guides.some(g=>g.kind==="mandibular-angle"));
 assert.ok(guides.some(g=>g.kind==="nuchal-ridge"));
 assert.ok(guides.every(g=>g.pts.length>=16&&g.pts.every(q=>q.every(Number.isFinite))));
 assert.ok(landmarks.every(m=>m.point.every(Number.isFinite)));
 /* O occipital não deve acompanhar o deslocamento da mandíbula. */
 const jawOpen={...p,jawOpen:1};
 for(const v of [.3,.41,.61]){
  for(const theta of [Math.PI,2.25]){
   const a=pointV3(yAt(v,S),theta,p,S),b=pointV3(yAt(v,S),theta,jawOpen,S);
   for(let k=0;k<3;k++)near(a[k],b[k]);
  }
 }
 for(const lod of [0,1,2]){
  p.headDetail=lod;
  const mesh=buildHead(p,S),diag=inspectHeadV3(p,S,mesh);
  assert.equal(diag.nonfinite,0);assert.equal(diag.degenerate,0);
  vertices+=diag.vertices;meshes++;
 }
 p.headDetail=1;
 const topo=meshTopologyV3(watertightMeshV3(p,S));
 assert.equal(topo.boundary,0);
 assert.equal(topo.nonmanifold,0);
 assert.equal(topo.degenerate,0);
 assert.equal(topo.invalid,0);
 variants++;
 reference+=guides.length;
}
/* A escolha da V3 deve reconstruir o pescoço, não reaproveitar
 * a malha cervical larga que estava em cache na V1/V2. */
{
 const p={...DEF,headModel:"v1",_cache:newCache()},s=shape(p);
 const antes=getMeshes(p,s).bust;
 p.headModel="v3_microgeometry";
 const depois=getMeshes(p,s).bust;
 assert.notStrictEqual(antes,depois,"O cache impediu a atualização cervical V3.");
 assert.notEqual(antes.V[0],depois.V[0],"Sem alteração real na malha cervical.");
}
assert.equal(variants,NOMES_BIOTIPOS.length*2);
assert.equal(meshes,variants*3);
console.log("HEAD V3 RECONSTRUCAO PASS:",variants,"variantes,",meshes,
 "malhas,",vertices,"vertices processados,",reference,"guias anatômicas.");
