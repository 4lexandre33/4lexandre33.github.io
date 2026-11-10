/* Regressão de órbita regional, sem browser e sem mocks no motor real.
 * node testes/camera-foco-regional.mjs */
import assert from "node:assert/strict";
import {createWorld} from "../mcp/lib/core.mjs";
import {readFileSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";

const w=createWorld(),name=w.SCN.list[0].name;
const same=(a,b,tol=1e-4)=>assert.ok(Math.abs(a-b)<=tol, a+" != "+b);
const inside=x=>x.every(Number.isFinite);
const whole=w.resolverAlvo(name),head=w.resolverAlvo(name,{area:"cabeça"});
assert.equal(head.area,"cabeca");
assert.ok(head.meio[1]<whole.meio[1]);
assert.ok(head.c[1]>whole.c[1]);
assert.ok(inside(head.c)&&inside(head.meio));
const torso=w.resolverAlvo(name,{area:"torso"}),handL=w.resolverAlvo(name,{area:"mao esquerda"}),handR=w.resolverAlvo(name,{area:"mão direita"});
assert.ok(torso.c[1]<head.c[1]);
assert.ok(handL.c[0]>handR.c[0],"Lados das mãos invertidos");
for(const area of ["bracos","pernas","pes","pe esquerdo","braco direito","ombros","quadril"]){
 const a=w.resolverAlvo(name,{area});
 assert.ok(a.area&&inside(a.c)&&inside(a.meio),"Região inválida: "+area);
}
assert.throws(()=>w.resolverAlvo(name,{area:"base"}),/indisponível/);
assert.throws(()=>w.resolverAlvo("cena",{area:"cabeca"}),/não disponível/);

/* Mesmo ângulo e elevação, mas enquadramento específico mais próximo. */
w.camera.perspectiva(false);
w.camera.orbitar(name,{azimute:45,elevacao:25,area:null,enquadrar:true});
const zFull=w.P.zoom;
w.camera.orbitar(name,{azimute:45,elevacao:25,area:"cabeca",enquadrar:true});
assert.ok(w.P.zoom>zFull,"Cabeça não foi aproximada em relação ao corpo inteiro");
assert.equal(w.camera.vista().area,"cabeca");
same(w.camera.vista().azimute,45);same(w.camera.vista().elevacao,25);
const tx=w.P.tx;
w.SCN.list[0].params.wx+=3;
w.sceneList(true);
same(w.P.tx,tx+3);
w.camera.area("mao esquerda");
assert.equal(w.camera.vista().area,"mao_esquerda");
w.camera.focar(name,"cabeca",{azimute:-45,elevacao:50,folga:.90});
same(w.camera.vista().azimute,-45);
same(w.camera.vista().elevacao,50);
assert.equal(w.camera.vista().area,"cabeca");
w.camera.girarEmVolta(15,-10);
same(w.camera.vista().azimute,-30);
same(w.camera.vista().elevacao,40);

/* Área superior/inferior de objeto rotacionado: bounding box real. */
w.cena.objeto("caixa",{nome:"Bloco focal",x:5,z:3,alt:6,giro:35});
const o=w.SCN.objetos[0];
const objAll=w.resolverAlvo({id:o.id}),objUp=w.resolverAlvo({id:o.id},{area:"superior"}),objDown=w.resolverAlvo({id:o.id},{area:"parte inferior"});
assert.ok(objUp.c[1]>objAll.c[1]&&objDown.c[1]<objAll.c[1]);
assert.ok(objUp.meio[1]<objAll.meio[1]);
w.camera.focar({id:o.id},"superior",{azimute:90,elevacao:60});
assert.equal(w.camera.vista().area,"superior");
same(w.camera.vista().elevacao,60);
w.camera.pivo({id:o.id},{area:"inferior",enquadrar:true});
assert.equal(w.camera.vista().area,"inferior");
assert.throws(()=>w.resolverAlvo({id:o.id},{area:"mao esquerda"}),/indisponível/);

/* Estado e restauração preservam ID do objeto por índice. */
const oldId=o.id,estado=w.cena.estado();
assert.equal(estado.orbita.area,"inferior");
assert.equal(estado.orbita.alvo.tipo,"objeto");
w.cena.restaurar(estado);
assert.equal(w.camera.vista().area,"inferior");
assert.equal(w.SCN.pivo.id,w.SCN.objetos[0].id);
w.sceneList(true);
assert.ok(Number.isFinite(w.P.ty));

/* Atlas / storyboard: região declarada vira parâmetro de cada vista. */
const story=w.lerRoteiro('#orbita "'+name+'" 8 area "mao esquerda" elevacao 25 — Giro das mãos');
const storyText=JSON.stringify(story);
assert.ok(storyText.includes("mao esquerda"),"Gerador perdeu a área de foco");
assert.ok(storyText.includes("camera.orbitar"),"Gerador não criou a câmera orbital");

/* O HTML torna a configuração explicitamente selecionável. */
const root=join(dirname(fileURLToPath(import.meta.url)),".."),html=readFileSync(join(root,"index.html"),"utf8");
for(const id of ["orbPivo","orbArea","orbElev","orbFolga","orbEnq"])
 assert.ok(html.includes('id="'+id+'"'),"Controle não encontrado: "+id);
console.log("FOCO REGIONAL PASS: cabeça/torso/membros, aproximação, rastreamento, objetos, JSON, storyboard e painel.");
