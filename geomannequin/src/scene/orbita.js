/* GeoMannequin — órbita da câmera em volta de um pivô: um manequim, um grupo, um objeto, um ponto ou a cena inteira.
   O pivô vira o alvo da câmera; o azimute conta a partir da FRENTE do pivô (0 = frente, 90 = lado esquerdo dele,
   180 = costas, −90 = lado direito), e a elevação é o ângulo acima do horizonte. Também serve à arrastada na tela
   (que já gira em volta do alvo), aos botões das 8 vistas, ao giro 360° (turntable) e à ficha do personagem. */
import { P, SCN } from "./modelo.js";
import { acharObjeto } from "./cenario.js";
import { caixaManequimOrb, caixaObjetoOrb, normalizarAreaOrbita } from "./regioes-orbita.js";
import { CX, CY, D, H, W, clamp, effScale } from "../engine/index.js";
import {orientacaoAlvo,encontrarAlvoOrientacao} from "./orientacao-frames.js";

const semAcentoOrb = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
/* nomes das vistas (azimute em graus, a partir da frente do pivô; positivo = para o lado esquerdo DELE) */
const AZIMUTES = { frente: 0, frontal: 0, front: 0, "3/4": 45, "3/4 esquerda": 45, "tres quartos": 45, "tres quartos esquerda": 45, "3/4 direita": -45, "tres quartos direita": -45,
  esquerda: 90, "lado esquerdo": 90, perfil: 90, "perfil esquerdo": 90, left: 90, direita: -90, "lado direito": -90, "perfil direito": -90, right: -90,
  "3/4 costas esquerda": 135, "3/4 de costas esquerda": 135, "costas esquerda": 135, "3/4 costas direita": -135, "3/4 de costas direita": -135, "costas direita": -135, "3/4 costas": 135,
  costas: 180, tras: 180, atras: 180, "de costas": 180, back: 180 };
/* as 8 vistas, na ordem do giro (para os botões e a ficha) */
const VISTAS_8 = [["frente", 0], ["3/4 esquerda", 45], ["esquerda", 90], ["3/4 costas esquerda", 135], ["costas", 180], ["3/4 costas direita", -135], ["direita", -90], ["3/4 direita", -45]];
function azimuteDe(v) {
  if (typeof v === "number") { if (!isFinite(v)) throw new Error("Azimute: use graus ou um nome (frente, 3/4 esquerda, esquerda, costas…)."); return v; }
  const t = semAcentoOrb(v); if (t in AZIMUTES) return AZIMUTES[t];
  const n = parseFloat(t); if (isFinite(n)) return n;
  throw new Error("Azimute: use graus ou " + VISTAS_8.map(x => "\"" + x[0] + "\"").join(", ") + ".");
}
const ELEV_NOMES = { olhos: 0, "nivel dos olhos": 0, normal: 0, media: 15, alta: 35, "de cima": 60, zenital: 70, baixa: -15, "muito baixa": -30, chao: -30, "contra plongee": -20, plongee: 35 };
function elevacaoDe(v) { if (v === undefined) return null; if (typeof v === "number") return clamp(v, -70, 70); const t = semAcentoOrb(v); if (t in ELEV_NOMES) return ELEV_NOMES[t]; const n = parseFloat(t); if (isFinite(n)) return clamp(n, -70, 70); throw new Error("Elevação: graus (−70 a 70) ou olhos, média, alta, de cima, baixa."); }

/* O pivô pode ser cena, grupo, manequim, objeto por id, ou ponto 3D.
 * A opção 'area' seleciona uma SUB-REGIÃO do mesmo alvo e usa limites
 * reais de pose/objeto. Sem área, preserva a órbita histórica integral. */
function resolverAlvo(alvo,opts={}) {
  if(alvo===undefined||alvo===null||alvo==="ativo")alvo=SCN.list[SCN.active].name;
  const area=Object.prototype.hasOwnProperty.call(opts,"area")?opts.area:opts.regiao;
  if(Array.isArray(alvo)&&alvo.length===3&&alvo.every(Number.isFinite)){
    if(area)throw new Error("Área da órbita só pode ser usada com manequim ou objeto.");
    return {tipo:"ponto",nome:"ponto ("+alvo.join(", ")+")",c:alvo.slice(),meio:[0,0,0],frente:null,chave:alvo.slice(),area:null};
  }
  const itens=[],nomes=[];
  const um=a=>{
    if(a&&typeof a==="object"&&a.id!==undefined){
      const o=acharObjeto(a);if(!o)throw new Error("Pivô: objeto não encontrado (id "+a.id+").");
      itens.push(caixaObjetoOrb(o,area));nomes.push(o.nome||o.tipo);return;
    }
    if(a&&typeof a==="object"&&a.nome!==undefined)a=a.nome;
    if(typeof a==="number"){
      const it=SCN.list[a];if(!it)throw new Error("Pivô: manequim "+a+" não existe.");
      itens.push(caixaManequimOrb(it,area));nomes.push(it.name);return;
    }
    const t=semAcentoOrb(a);
    if(t==="cena"||t==="todos"||t==="tudo"){
      if(area)throw new Error("Área específica não disponível para cena inteira: selecione um manequim ou objeto.");
      SCN.list.forEach(it=>{if(!it.oculto)itens.push(caixaManequimOrb(it,null))});
      SCN.objetos.forEach(o=>itens.push(caixaObjetoOrb(o,null)));
      nomes.push("cena");return;
    }
    const it=SCN.list.find(x=>semAcentoOrb(x.name)===t);
    if(it){itens.push(caixaManequimOrb(it,area));nomes.push(it.name);return;}
    const o=acharObjeto(a);
    if(o){itens.push(caixaObjetoOrb(o,area));nomes.push(o.nome||o.tipo);return;}
    throw new Error("Pivô: “"+a+"” não é manequim, objeto, cena ou ponto [x,y,z].");
  };
  [].concat(alvo).forEach(um);
  if(!itens.length)throw new Error("Pivô: a cena está vazia.");
  const bb=[Infinity,-Infinity,Infinity,-Infinity,Infinity,-Infinity];
  itens.forEach(i=>{for(let k=0;k<6;k++)bb[k]=k%2?Math.max(bb[k],i.bb[k]):Math.min(bb[k],i.bb[k]);});
  if(bb.some(v=>!Number.isFinite(v)))throw new Error("Pivô sem limites tridimensionais válidos.");
  let frente=null;
  if(nomes[0]!=="cena"){
    const f=itens.reduce((a,i)=>[a[0]+i.frente[0],a[1]+i.frente[1]],[0,0]);
    const l=Math.hypot(...f)/itens.length;
    if(l>0.5)frente=[f[0]/(l*itens.length),f[1]/(l*itens.length)];
  }
  const reg=itens.length&&itens[0].area||null;
  return {tipo:nomes[0]==="cena"?"cena":itens.length>1?"grupo":"item",
    subtipo:itens.length===1?itens[0].tipo:null,nome:nomes.join(" + "),
    c:[(bb[0]+bb[1])/2,(bb[2]+bb[3])/2,(bb[4]+bb[5])/2],
    meio:[(bb[1]-bb[0])/2,(bb[3]-bb[2])/2,(bb[5]-bb[4])/2],
    frente,chave:alvo,area:reg};
}
/* tamanho na tela que faz o pivô caber (raio no chão e meia altura, iguais em qualquer azimute: o giro não "pulsa") */
function enquadrarPivo(A, elev, folga) {
  const minimo=A.area?0.12:0.5, rh=Math.max(minimo,Math.hypot(A.meio[0],A.meio[2])),hy=Math.max(minimo,A.meio[1]),e=Math.abs(elev)*D,ry=Math.hypot(hy*Math.cos(e),rh*Math.sin(e));
  const Hf = SCN.recorte ? SCN.recorte.h : H, Wf = SCN.recorte ? SCN.recorte.w : W, k = folga===undefined?1.08:clamp(+folga||1.08,.80,2.5);
  const S = Math.min(Hf * 0.86 / (2 * ry * k), Wf * 0.9 / (2 * rh * k));
  if (P.persp) { const raio = Math.hypot(rh, hy); let d = (W / 2) * (P.lens || 50) / (18 * S); const dmin = Math.max(6, raio * 1.25 + 2);
    if (d < dmin) { d = dmin; P.lens = Math.round(clamp(18 * S * d / (W / 2), 18, 200)); } P.camDist = +clamp(d, 4, 400).toFixed(2); }
  else P.zoom = +clamp(S / effScale(Object.assign({}, P, { persp: 0, zoom: 1 })), 0.05, A.area?12:3).toFixed(3);
}
/* o pivô no centro da foto */
function centrarPivo() { const Sx = effScale(P); P.panX = (W / 2 - CX) / Sx; P.panY = (CY - H / 2) / Sx; }
/* azimute e elevação atuais da câmera em relação ao pivô */
function vistaAtual(A) { const wr = A && A.frente ? Math.atan2(A.frente[0], A.frente[1]) / D : 0; let a = -(P.yaw || 0) - wr; a = ((a + 540) % 360) - 180; return { azimute: Math.round(a * 10) / 10, elevacao: -(P.pitch || 0) }; }
/* camera.pivo(alvo): o alvo da câmera passa a ser o centro do pivô (a câmera mantém direção e distância) */
function mesmaChaveOrb(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function pivoCamera(alvo,opts={}) {
  opts=opts||{};
  if(alvo===undefined||alvo===null)alvo="ativo";
  const explicito=Object.prototype.hasOwnProperty.call(opts,"area")||Object.prototype.hasOwnProperty.call(opts,"regiao");
  const area=explicito?(Object.prototype.hasOwnProperty.call(opts,"area")?opts.area:opts.regiao):
    (mesmaChaveOrb(SCN.pivo,alvo)?SCN.orbitaArea:null);
  const A=resolverAlvo(alvo,{area});
  P.tx=clamp(A.c[0],-400,400);P.ty=clamp(A.c[1],-20,60);P.tz=clamp(A.c[2],-400,400);
  if(opts.enquadrar)enquadrarPivo(A,-(P.pitch||0),opts.folga);
  centrarPivo();SCN.pivo=A.chave;SCN.orbitaArea=A.area;
  return A;
}
/* Segue o ponto anatômico quando o manequim muda de pose, sem resetar
 * a orientação, a elevação, o zoom manual ou a distância. */
function atualizarFocoOrbita(){
  if(SCN.seguirCamera){
    const q=SCN.seguirCamera;
    let ref;
    if(q.tipo==="manequim"){const it=SCN.list.find(x=>x.id===q.uid);ref=it?.name;}
    else {const o=SCN.objetos.find(x=>x.id===q.uid);ref=o?{id:o.id}:null}
    if(ref){
      try{
        verOrientadaCamera(ref,{...q.opts,enquadrar:false},true);
        return resolverAlvo(ref,{area:q.opts.area||null});
      }catch(e){SCN.seguirCamera=null;}
    }else SCN.seguirCamera=null;
  }
  if(SCN.pivo===undefined||SCN.pivo===null)return null;
  try{
    const A=resolverAlvo(SCN.pivo,{area:SCN.orbitaArea});
    P.tx=clamp(A.c[0],-400,400);P.ty=clamp(A.c[1],-20,60);P.tz=clamp(A.c[2],-400,400);
    return A;
  }catch(e){SCN.pivo=null;SCN.orbitaArea=null;return null;}
}
/* camera.orbitar(alvo, {azimute, elevacao, distancia, enquadrar, relativo, rolagem}) */
function orbitarCamera(alvo, opts) {
  SCN.ultimaVistaOrientada=null;
  opts = opts || {}; const A = pivoCamera(alvo,Object.assign({},opts,{enquadrar:false}));
  const az = opts.azimute === undefined ? vistaAtual(A).azimute : azimuteDe(opts.azimute), el = elevacaoDe(opts.elevacao), elev = el === null ? -(P.pitch || 0) : el;
  const base = opts.relativo === false || !A.frente ? 0 : Math.atan2(A.frente[0], A.frente[1]) / D;
  let yaw = -(base + az); yaw = ((yaw + 540) % 360) - 180;
  P.yaw = Math.round(yaw * 10) / 10; P.pitch = clamp(-elev, -70, 70); P.roll = opts.rolagem === undefined ? (A.area ? P.roll : 0) : clamp(+opts.rolagem || 0, -45, 45);
  if (opts.distancia !== undefined) { const d = +opts.distancia; if (!(d > 0)) throw new Error("Distância da órbita: um número em R."); if (P.persp) P.camDist = clamp(d, 4, 200); else P.zoom = clamp(6.2 / d, 0.05, 3); }
  else if (opts.enquadrar !== false) enquadrarPivo(A, elev, opts.folga);
  centrarPivo();
  return {pivo:A.nome,tipo:A.tipo,area:A.area,azimute:az,elevacao:elev,yaw:P.yaw,pitch:P.pitch,distancia:P.camDist,centro:A.c};
}
/* Elevação anatômica sem o antigo limite da câmera de órbita horizontal.
 * Preserva elevacaoDe() para scripts legados.
 */
function elevacaoRelativaDe(v){
 if(v===undefined||v===null)return 0;
 if(typeof v==="number"){if(!Number.isFinite(v))throw Error("Elevação não finita.");return clamp(v,-90,90)}
 const t=semAcentoOrb(v);
 if(t==="zenital"||t==="de cima exato")return 90;
 if(t==="nadir"||t==="de baixo exato")return -90;
 if(t in ELEV_NOMES)return ELEV_NOMES[t];
 const n=Number(t.replace(",","."));
 if(Number.isFinite(n))return clamp(n,-90,90);
 throw Error("Elevação inválida. Use graus de -90 a 90, zenital, nadir ou 'alta'.");
}
/* Versão matricial: orienta pelo eixo do próprio alvo/parte, e não pelos olhos.
 * Quando `vertical` = 'anatomico', a elevação acompanha inclusive atores deitados.
 * Para vistas anatômicas suporta pitch de ±90° com rolagem compensada,
 * mantendo as antigas restrições de sliders/órbita legadas.
 */
function verOrientadaCamera(alvo,opts={},interno=false){
  opts=opts||{};
  const lado=opts.lado??opts.azimute??"frente",a=azimuteDe(lado)*D;
  const referencia=opts.referencia??"tronco";
  const multi=Array.isArray(alvo)&&!(alvo.length===3&&alvo.every(Number.isFinite))||
    typeof alvo==="string"&&/^(cena|todos|tudo)$/.test(semAcentoOrb(alvo));
  if(multi&&!opts.lider)throw Error("Um grupo não tem frente única. Informe {lider:'Nome do manequim'}.");
  const frame=orientacaoAlvo(multi?opts.lider:alvo,referencia,{exigirFrente:opts.exigirFrente!==false});
  const space=opts.vertical??"anatomico";
  if(space!=="anatomico"&&space!=="mundo")throw Error("Vertical: use 'anatomico' ou 'mundo'.");
  const up=space==="mundo"?[0,1,0]:frame.cima;
  let F=frame.frente,L=frame.esquerda;
  if(space==="mundo"){
    const horiz=Math.hypot(F[0],F[2]);
    if(horiz<1e-6)throw Error("Frente do alvo é vertical: escolha vertical:'anatomico' para vistas de frente/costas.");
    F=[F[0]/horiz,0,F[2]/horiz];L=[F[2],0,-F[0]];
  }
  const elev=elevacaoRelativaDe(opts.elevacao??0)*D;
  const h=[0,1,2].map(i=>Math.cos(a)*F[i]+Math.sin(a)*L[i]);
  const v=[0,1,2].map(i=>Math.cos(elev)*h[i]+Math.sin(elev)*up[i]);
  const n=Math.hypot(...v);if(n<1e-8)throw Error("Orientação orbital degenerada.");
  const dir=v.map(x=>x/n);
  const pitchReal=-Math.atan2(dir[1],Math.hypot(dir[0],dir[2]))/D;
  if(!Number.isFinite(pitchReal))throw Error("Pitch anatômico inválido.");
  const A=pivoCamera(alvo,{area:multi?null:opts.area??opts.regiao??null,enquadrar:false});
  const dist=opts.distancia;
  const yawReal=-Math.atan2(dir[0],dir[2])/D;
  P.yaw=+(((yawReal+540)%360)-180).toFixed(4);
  // O renderizador usa matrizes trigonométricas e aceita visão vertical exata ±90°.
  P.pitch=clamp(pitchReal,-90,90);
  // Compensa o horizonte inclinado quando o ator se deita, vira de lado
  // ou fica invertido: o "cima" semântico da parte fica para cima na imagem.
  const desiredUp=space==="anatomico"?frame.cima:[0,1,0];
  const yw=P.yaw*D,pt=P.pitch*D;
  const xx=desiredUp[0]*Math.cos(yw)+desiredUp[2]*Math.sin(yw);
  const zz=-desiredUp[0]*Math.sin(yw)+desiredUp[2]*Math.cos(yw);
  const yy=desiredUp[1]*Math.cos(pt)+zz*Math.sin(pt);
  const autoRoll=Math.atan2(xx,yy)/D;
  const extra=opts.rolagem===undefined?0:Number(opts.rolagem);
  if(!Number.isFinite(extra))throw Error("Rolagem deve ser um número finito.");
  P.roll=((autoRoll+extra+540)%360)-180;
  if(dist!==undefined){
    const d=Number(dist);if(!Number.isFinite(d)||d<=0)throw Error("Distância deve ser positiva e finita (R).");
    if(P.persp)P.camDist=clamp(d,4,400);else P.zoom=clamp(6.2/d,.01,3);
  }else if(opts.enquadrar!==false)enquadrarPivo(A,-P.pitch,opts.folga);
  centrarPivo();
  if(!interno)SCN.seguirCamera=null;
  SCN.ultimaVistaOrientada={azimute:azimuteDe(lado),elevacao:elev/D,referencia:frame.referencia,vertical:space,limitado:false};
  return {pivo:A.nome,lider:multi?opts.lider:null,referencia:frame.referencia,lado:lado,
    frente:frame.frente,vetorCamera:dir,azimute:azimuteDe(lado),elevacao:elev/D,
    vertical:space,yaw:P.yaw,pitch:P.pitch,limitado:false,
    pitchSolicitado:+pitchReal.toFixed(4),centro:A.c,distancia:P.camDist};
}
function seguirOrientacaoCamera(alvo,opts={}){
  const q=encontrarAlvoOrientacao(alvo);
  if(q.tipo!=="manequim"&&q.tipo!=="objeto")throw Error("Seguimento exige manequim ou objeto identificado.");
  const uid=q.alvo.id,tipo=q.tipo;
  const o={lado:"costas",referencia:"tronco",vertical:"anatomico",...opts};
  verOrientadaCamera(alvo,o);
  SCN.seguirCamera={uid,tipo,opts:o};
  return {alvo:q.alvo.name||q.alvo.nome||q.alvo.tipo,tipo,...o};
}
function pararSeguimentoCamera(){const previous=SCN.seguirCamera;SCN.seguirCamera=null;return !!previous;}
function estadoSeguimentoCamera(){
 const q=SCN.seguirCamera;if(!q)return {ativo:false};
 const it=q.tipo==="manequim"?SCN.list.find(m=>m.id===q.uid):SCN.objetos.find(o=>o.id===q.uid);
 return {ativo:!!it,alvo:it?.name||it?.nome||it?.tipo||null,tipo:q.tipo,...q.opts};
}
/* um passo de órbita (arrastar, teclas, botões ←/→): gira em volta do alvo atual */
function passoOrbita(dAz, dEl) { SCN.seguirCamera=null;SCN.ultimaVistaOrientada=null; if (dAz) { let y = (P.yaw || 0) - dAz; y = ((y + 540) % 360) - 180; P.yaw = Math.round(y * 10) / 10; } if (dEl) P.pitch = clamp((P.pitch || 0) - dEl, -70, 70); }
/* azimutes de um giro de n vistas (começando na frente; sentido "horario" visto de cima = para a direita do pivô) */
function azimutesGiro(n, opts) { n = Math.max(2, Math.min(72, Math.round(n || 8))); const s = opts && /hor/.test(String(opts.sentido || "")) ? -1 : 1, a0 = opts && opts.inicio !== undefined ? azimuteDe(opts.inicio) : 0;
  return Array.from({ length: n }, (_, i) => { let a = a0 + s * 360 * i / n; a = ((a + 540) % 360) - 180; return Math.round(a * 100) / 100; }); }
function nomeVista(a) { const v = VISTAS_8.find(x => Math.abs(((x[1] - a + 540) % 360) - 180) < 0.5); return v ? v[0] : Math.round(a) + "°"; }

export { AZIMUTES, VISTAS_8, azimuteDe, elevacaoDe, elevacaoRelativaDe, resolverAlvo, enquadrarPivo, vistaAtual, pivoCamera, orbitarCamera, atualizarFocoOrbita, passoOrbita, azimutesGiro, nomeVista, verOrientadaCamera, seguirOrientacaoCamera, pararSeguimentoCamera, estadoSeguimentoCamera };
