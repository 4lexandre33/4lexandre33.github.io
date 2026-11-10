/* GeoMannequin — contrato público da câmera anatômica e APIs de código.
 * node testes/camera-orientacao-codigo.mjs
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {createWorld} from "../mcp/lib/core.mjs";

const w=createWorld(),m=w.cena.ativo,name=m.nome;
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const unit=x=>{const n=Math.hypot(...x);return x.map(v=>v/n)};
const close=(a,b,eps=1e-3)=>assert.ok(Math.abs(a-b)<=eps,a+" ≠ "+b);
const back=(ref,opts={})=>{
 w.camera.ver(ref,{lado:"costas",vertical:"anatomico",precisao:"estrita",...opts});
 const frame=w.camera.orientacaoDoAlvo(ref,opts.referencia??"tronco");
 const c=w.cameraNoMundo(w.P);
 const direction=unit(sub(c.pos,c.alvo));
 assert.ok(dot(direction,frame.frente)<-0.9999,
   "A câmera não está atrás do eixo escolhido: "+dot(direction,frame.frente));
 return direction;
};
for(const angle of [0,30,90,-90,135,-135,180]){
 m.girar(angle);
 const F=m.orientacao("tronco").frente;
 assert.ok(F.every(Number.isFinite));
 back(name);
}
m.girar(0);m.pose({headYaw:55});
const torso=m.orientacao("tronco").frente,head=m.orientacao("cabeca").frente;
assert.ok(dot(torso,head)<0.95,"Cabeça deveria olhar para direção independente");
const backHead=back(name,{referencia:"cabeca",area:"cabeca"});
assert.ok(dot(backHead,torso)>-0.95,"A vista traseira da cabeça não pode ser idêntica à do tronco");
const oldHead=m.orientacao("cabeca").frente;
m.olhos(0.9,.5);
assert.ok(dot(oldHead,m.orientacao("cabeca").frente)>.99999,"Olhos alteraram o eixo do crânio");
assert.ok(dot(oldHead,m.orientacao("olhar").frente)<.999,"Gaze deveria ser independente");
w.camera.costas(name,{referencia:"tronco",area:"cabeca"});
assert.equal(w.camera.vista().referencia,"tronco");
assert.equal(w.camera.vista().azimute,180);
w.camera.frente(name,{referencia:"cabeca",area:"cabeca"});
assert.equal(w.camera.vista().azimute,0);
assert.ok(w.camera.alvos().some(x=>x.nome===name));
assert.ok(w.camera.areas(name).some(x=>x.id==="cabeca"));
const beforeF=w.camera.orientacaoDoAlvo(name,"tronco");
w.camera.seguir(name,{lado:"costas",referencia:"tronco",elevacao:0});
assert.ok(w.camera.seguimento().ativo);
const d0=unit(sub(w.cameraNoMundo(w.P).pos,w.cameraNoMundo(w.P).alvo));
m.girar(70).posicao(4,2);
w.sceneList(true); // recomputar follow antes de desenhar
const Fnew=m.orientacao("tronco").frente,d1=unit(sub(w.cameraNoMundo(w.P).pos,w.cameraNoMundo(w.P).alvo));
assert.ok(dot(d1,Fnew)<-.9999,"Follow não manteve câmera atrás ao girar");
assert.ok(dot(d0,d1)<.99,"A direção da câmera não mudou durante follow");
assert.ok(w.camera.seguimento().ativo);
const saved=w.cena.estado();
assert.equal(saved.seguirCamera.tipo,"manequim");
w.cena.restaurar(saved);
assert.ok(w.camera.seguimento().ativo,"Follow perdido ao restaurar JSON");
w.camera.pararSeguir();
assert.equal(w.camera.seguimento().ativo,false);
const obj=w.cena.objeto("cubo",{nome:"Cubo referência",x:5,giro:45});
assert.throws(()=>w.camera.costas("Cubo referência"),/simétrico/i);
obj.orientacao({frenteLocal:[0,0,1],cimaLocal:[0,1,0]});
assert.throws(()=>obj.orientacao({frenteLocal:[0,2,0],cimaLocal:[0,1,0]}),/independentes/);
assert.equal(obj.orientacao().definida,true);
back("Cubo referência");
const objSaved=w.cena.estado();
w.cena.restaurar(objSaved);
assert.ok(w.cena.obterObjeto("Cubo referência").orientacao().definida,"Frente declarada não persistiu");
assert.ok(w.cena.estilos().includes("lapis"));
assert.equal(w.cena.estilo("azul"),"azul");
assert.equal(w.cena.estiloAtual(),"azul");
assert.equal(w.cena.camadaVisual("eyes",false),false);
assert.ok(w.cena.camadasVisuais().some(x=>x.chave==="eyes"&&!x.ativo));
const state=w.cena.estadoCompleto();
w.cena.camadaVisual("eyes",true);
w.cena.restaurarCompleto(state);
assert.equal(w.cena.camadaVisual("eyes"),false);
assert.ok(w.cena.exportarSVG({transparente:true}).startsWith("<svg"));
const json=w.cena.exportarJSON();
assert.equal(JSON.parse(json).style,"azul");
w.cena.importarJSON(json);
assert.ok(typeof w.cena.estudoAnatomico.svg==="function");
/* Corpo deitado: costas da CABEÇA significa dorso anatômico, não -Z do mundo. */
const lying=createWorld(),lm=lying.cena.ativo;
lm.deitar("costas");
const fL=lm.orientacao("cabeca");
lying.camera.costas(lm.nome,{referencia:"cabeca",area:"cabeca",precisao:"estrita"});
const camL=lying.cameraNoMundo(lying.P);
assert.ok(dot(unit(sub(camL.pos,camL.alvo)),fL.frente)<-.9999,"Costas do crânio deitado devem ser exatas");
assert.ok(dot(camL.cima,fL.cima)>.99,"A vista do crânio deitado deve manter o alto anatômico");
const reverse=createWorld(),rm=reverse.cena.ativo;
rm.inclinar(180,180);
const fR=rm.orientacao("tronco");
reverse.camera.costas(rm.nome,{referencia:"tronco",precisao:"estrita"});
const camR=reverse.cameraNoMundo(reverse.P);
assert.ok(dot(unit(sub(camR.pos,camR.alvo)),fR.frente)<-.9999,"Vista invertida também deve ser traseira");
assert.ok(dot(camR.cima,fR.cima)>.99,"Vista invertida deve respeitar roll anatômico");

const grp=createWorld(),g0=grp.cena.ativo.nome,g1=grp.cena.adicionar({nome:"Vizinho"}).nome;
assert.throws(()=>grp.camera.ver([g0,g1],{lado:"costas"}),/l[ií]der/);
const groupView=grp.camera.vistaExata([g0,g1],{lado:"costas",lider:g0,elevacao:90});
assert.equal(groupView.lider,g0);assert.ok(!groupView.limitado);
assert.equal(grp.camera.orientacaoDoAlvo(g0).definida,true);

const base=dirname(fileURLToPath(import.meta.url));
const html=readFileSync(join(base,"..","index.html"),"utf8");
for(const k of ["orbReferencia","orbVertical","orbSeguir","orbPivo","orbArea"])
 assert.ok(html.includes('id="'+k+'"'),"Ausente no painel: "+k);
close(w.camera.vista().elevacao,w.camera.vista().elevacao);
console.log("CÂMERA ANATÔMICA PASS: frente/costas, crânio, gaze, seguir rotação, objetos com frente declarada, estado, estilo, camadas, SVG e editor.");
