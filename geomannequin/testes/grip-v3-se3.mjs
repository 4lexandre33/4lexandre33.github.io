/* GeoMannequin: invariantes das poses rígidas 3D e geometria da cadeira. */
import assert from "node:assert/strict";
import {rotM} from "../src/engine/matematica.js";
import {rigidFrame,rigidCompose,rigidInverse,rigidPoint,objectRigidPose,setRigidObjectPose} from "../src/engine/rigid-transform.js";
import {partesDoObjeto,colisaoEntreObjetos} from "../src/engine/objetos.js";
import {gripSites,gripSiteWorld} from "../src/engine/grip-sites.js";
const err=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
const E=[1,0,0,0,1,0,0,0,1],zero=[0,0,0];
for(let n=0;n<200;n++){
 const A=rigidFrame(rotM(n*.017,n*.041,-n*.029),[n*.1,n*.015,-n*.12]);
 const B=rigidCompose(A,rigidInverse(A));
 assert.ok(err(B.M,E)<1e-10&&err(B.T,zero)<1e-10,"SE3 compose/inverse drift");
 const C=rigidCompose(rigidInverse(A),A);
 assert.ok(err(C.M,E)<1e-10);
 const p=[1,-4,2],t=rigidPoint(rigidInverse(A),rigidPoint(A,p));
 assert.ok(err(t,p)<1e-10);
}
const chair={tipo:"cadeira",larg:4,prof:4,alt:4,encosto:4.2,x:0,z:0,giro:0,base:0,id:101};
const names=gripSites(chair).map(x=>x.id);
for(const name of ["encostoTopo","encostoEsquerdo","encostoDireito","assentoFrente"])
 assert.ok(names.includes(name),"Cadeira sem ponto "+name);
assert.throws(()=>gripSiteWorld(chair,"inexistente"),/desconhecido/);
for(const pose of [[0,0,0],[90,0,0],[20,90,0],[45,20,90],[180,-70,150]]){
 const M=rotM(...pose.map(v=>v*Math.PI/180)),T=[3,5,2];
 setRigidObjectPose(chair,{M,T},0);
 const actual=objectRigidPose(chair,0);
 assert.ok(err(actual.M,M)<1e-10&&err(actual.T,T)<1e-10,"Objeto perdeu rotação 3D");
 const parts=partesDoObjeto(chair,0);
 assert.equal(parts.length,6,"Cadeira deve possuir assento, 4 pernas e encosto");
 assert.ok(parts.every(p=>p.c.every(Number.isFinite)&&p.e.every(e=>e.every(Number.isFinite))));
 const site=gripSiteWorld(chair,"encostoTopo",0);
 assert.ok(site.mundo.every(Number.isFinite));
}
const a={...chair,rot3:rotM(0,Math.PI/2,0),base:6,x:0,z:0},
      b={...chair,rot3:rotM(0,-Math.PI/2,0),base:6,x:1,z:0,id:102};
const hits=colisaoEntreObjetos(a,b,0,0);
assert.ok(Array.isArray(hits)&&hits.every(x=>Number.isFinite(x.prof)));
console.log("GRIP V3 SE3 PASS: 200 inversas rígidas, cadeira 6DOF, 7 sites e colisão inclinada.");
