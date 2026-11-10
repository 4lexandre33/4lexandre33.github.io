/* V4.2 — controles anatômicos e compatibilidade quantitativa.
 * 10 variantes, 3 LODs, avaliação de órbitas, nuca e orelhas.
 * Não é substituto da inspeção com a imagem de referência. */
import assert from "node:assert/strict";
import {DEF} from "../src/engine/padroes.js";
import {shape,buildHead,earSurf} from "../src/engine/cabeca.js";
import {pointV4,sectionV4,yAt,inspectHeadV4} from "../src/engine/head-v4/index.js";
import {earPointV41,earMetricsV41} from "../src/engine/head-v4/ear-anatomy.js";
import {NOMES_BIOTIPOS,aplicarBiotipo} from "../src/scene/biotipos.js";

let count=0,vertices=0;
for(const fem of [0,1])for(const tipo of NOMES_BIOTIPOS){
 const p={...DEF,headModel:"v4_anatomical"};
 aplicarBiotipo(p,tipo,fem);
 const S=shape(p);
 const plain={...p,v42OrbitalCavity:0},deep={...p,v42OrbitalCavity:1.6};
 const theta=Math.asin(.335),eyeY=yAt(.535,S);
 const z0=pointV4(eyeY,theta,plain,S)[2];
 const z1=pointV4(eyeY,theta,deep,S)[2];
 assert.ok(z1<z0-.03,"Órbita V4.2 não recuou na região ocular ("+tipo+")");
 const sec=v=>sectionV4(v,p,S);
 const before=sectionV4(.40,{...p,v42NapeRoundness:0},S);
 const after=sectionV4(.735,{...p,v42NapeRoundness:1},S);
 assert.ok(Number.isFinite(sec(.35).back)&&Number.isFinite(sec(.78).back));
 assert.ok(after.back>sectionV4(.735,{...p,v42NapeRoundness:0},S).back+.02,
  "Controle de arredondamento posterior não altera perfil");
 assert.ok(sec(.60).width>sec(.39).width*.87,"Constrição temporal");
 /* Orelha realmente EXTERNA ao volume lateral com controle próprio. */
 const base=earPointV41({...p,v42EarProjection:.025},S,1,0,0),
   projected=earPointV41({...p,v42EarProjection:.19},S,1,0,0);
 assert.ok(projected[0]>base[0]+.14,"Relevo lateral não projeta a orelha");
 const e=earPointV41(p,S,1,.55,.2),l=earPointV41(p,S,-1,.55,.2);
 assert.ok(Math.abs(e[0]+l[0])<1e-5&&Math.abs(e[1]-l[1])<1e-5);
 const metrics=earMetricsV41(p,S);
 assert.ok(metrics.top>metrics.bottom&&Math.abs(metrics.top-yAt(.468,S))<.07);
 for(let detail=0;detail<=2;detail++){
  const q={...p,headDetail:detail},mesh=buildHead(q,S);
  const d=inspectHeadV4(q,S,mesh);
  assert.equal(d.nonfinite,0);assert.equal(d.degenerate,0);
  vertices+=d.vertices;
 }
 count++;
}
assert.equal(count,10);
console.log("V4.2 GEOMETRY PASS:",count,"variantes, 30 malhas,",
 vertices,"vértices verificados.");
