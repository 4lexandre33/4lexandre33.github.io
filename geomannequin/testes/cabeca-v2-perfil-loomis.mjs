/* Regressão V2: testa linear + calota tangente, nuca em arco e Loomis ampliado. */
import assert from "node:assert/strict";
import {DEF} from "../src/engine/padroes.js";
import {shape,buildHead} from "../src/engine/cabeca.js";
import {sagittalProfile} from "../src/engine/head/profile.js";
import {ringV2} from "../src/engine/head/sections.js";
import {sidePlanesV2} from "../src/engine/head/side-planes.js";
import {triangleQuality} from "../src/engine/head/mesh.js";
import {NOMES_BIOTIPOS,aplicarBiotipo} from "../src/scene/biotipos.js";
const near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<tol,`${a} ≠ ${b}`);
const derivativeJump=(fn,y,h=1e-4)=>Math.abs((fn(y)-fn(y-h))/h-(fn(y+h)-fn(y))/h);
let count=0,meshes=0,planar=0;
for(const fem of [0,1])for(const type of NOMES_BIOTIPOS){
 const p={...DEF,headModel:"v2"};aplicarBiotipo(p,type,fem);
 const S=shape(p),[a,b]=sidePlanesV2(p,S);
 near(a.radius,b.radius);near(a.distance,b.distance);near(a.center[0],-b.center[0]);
 assert.ok(b.radius>=.65,"Loomis não alcança temporal/alto parietal");
 assert.ok(b.safeEnvelope>b.distance+.015,"Corte protrui para fora do crânio");
 assert.ok(b.center[1]+b.radius>.72&&b.center[1]-b.radius<-.52,"Disco não cobre o alcance craniano exigido");
 const f=y=>sagittalProfile(y,p,S).front,n=y=>sagittalProfile(y,p,S).back;
 const slope=(f(.46)-f(.25))/.21,slope2=(f(.58)-f(.46))/.12;
 near(slope,slope2,.003);
 for(const yy of [.045,.20,.67,-.28]){
  assert.ok(derivativeJump(f,yy)<.004,"Ponta ou descontinuidade frontal: "+yy);
  assert.ok(derivativeJump(n,yy)<.004,"Ponta ou descontinuidade occipital: "+yy);
 }
 near(f(1),0,1e-6);near(n(1),0,1e-6);
 assert.ok(n(.15)>n(-.4)&&n(-.4)>n(-.9)&&n(-.9)>n(S.chinY),"Nuca tem bico, esfera extra ou inversão");
 assert.ok(n(.1)>f(.1)*1.08,"Occipital excessivamente raso");
 assert.ok(ringV2(.82,p,S)[0]>ringV2(.92,p,S)[0]);
 for(const lod of [0,1,2]){
  p.headDetail=lod;const mesh=buildHead(p,S),q=triangleQuality(mesh);
  assert.equal(q.nonfinite,0);assert.equal(q.invalid,0);
  assert.ok(q.degenerate<=2*mesh.cols,"Triângulos degenerados em "+type+" LOD "+lod);
  for(const plane of [a,b]){
   let flat=0;
   for(let i=0;i<mesh.V.length;i+=3){
    const x=mesh.V[i],y=mesh.V[i+1],z=mesh.V[i+2],rho=Math.hypot(y-plane.center[1],z-plane.center[2]);
    if(Math.sign(x)!==plane.side||rho>plane.radius-.08)continue;
    near(x,plane.center[0],1e-4);flat++;
   }
   assert.ok(flat>25,"Plano bilateral incompleto: "+type+" LOD "+lod);
   planar+=flat;
  }
  meshes++;
 }
 count++;
}
assert.equal(count,10);assert.equal(meshes,30);
console.log("LOOMIS PERFIL PASS:",count,"biotipos,",meshes,"malhas,",planar,"pontos em planos reais.");