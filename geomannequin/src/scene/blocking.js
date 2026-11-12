/* GeoMannequin — blocking: leitura e escrita da composição (vista de cima e lateral) DIRETO no estado da cena.
   Não há cópia: os manequins são SCN.list (wx, wz, wRot, bodyLift, pose), a câmera é P (tx/ty/tz, yaw, pitch, camDist,
   lens, persp) e os objetos são SCN.objetos. Cada edição escreve nesses campos, com os mesmos limites e o mesmo modo de
   colisão dos comandos; as vistas só leem. */
import { P, SCN, instColors, corObjeto, atualizarApoios } from "./modelo.js";
import { COL, bloquearMovimento, colisoesDaCena, pMundo, separarObjeto } from "./colisoes.js";
import { apoioSob, editarObjeto } from "./cenario.js";
import { resolverAlvo } from "./orbita.js";
import { D, M_R, TIPOS_OBJETO, ehCilindro, cameraNoMundo, caixasDoObjeto, capsulas, clamp, restGround, tamanhoNaFoto } from "../engine/index.js";

const chaoBlk = () => restGround(SCN.list[0].params);
/* tudo o que as vistas desenham, lido agora do estado da cena */
function leituraBlocking() {
  const C = cameraNoMundo(P), g0 = chaoBlk();
  const manequins = SCN.list.map((it, i) => {
    const cp = capsulas(pMundo(it)).caps;
    return { id: it.id, i, ativo: i === SCN.active, nome: it.name, cor: instColors(it, typeof document === "undefined"), caps: cp, x: it.params.wx || 0, z: it.params.wz || 0, giro: it.params.wRot || 0,
      altura: it.params.bodyLift || 0, sel: i === SCN.active && !SCN.objSel, oculto: !!it.oculto, foto: tamanhoNaFoto(C, cp) };
  });
  atualizarApoios();
  const objetos = SCN.objetos.map(o => ({ id: o.id, nome: o.nome || (TIPOS_OBJETO[o.tipo] || {}).nome || o.tipo, tipo: o.tipo, forma: ehCilindro(o) ? "cilindro" : "caixa", x: o.x, z: o.z, giro: o.giro || 0,
    larg: o.larg, prof: o.prof, alt: o.alt, raio: o.raio, base: o.base || 0, sobre: o.sobre || null, cor: corObjeto(o, typeof document === "undefined"), sel: SCN.objSel === o.id, caixas: caixasDoObjeto(o, g0) }));
  /* altura de uma pessoa em pé (do chão ao alto da cabeça), para as linhas de escala da perspectiva */
  const alturaPessoa = 1.0 - restGround(SCN.list[0].params);
  let colisoes = [];
  try { colisoes = colisoesDaCena().flatMap(c => (c.contatos || []).map(k => k.ponto)).filter(Boolean); } catch (e) { }
  /* pivô da órbita (se houver): nome; a câmera gira em volta do alvo, que é o centro dele */
  let pivo = null; if (SCN.pivo !== undefined && SCN.pivo !== null) { try { const A = resolverAlvo(SCN.pivo); pivo = { nome: A.nome, tipo: A.tipo }; } catch (e) { pivo = null; } }
  return { camera: C, chao: g0, manequins, objetos, alturaPessoa, colisoes, pivo };
}
const achar = id => SCN.list.find(it => it.id === id);
const r2 = v => Math.round(v * 20) / 20;
/* ===== manequins ===== */
function moverManequim(id, x, z) {
  const it = achar(id); if (!it) return;
  it.params.wx = r2(clamp(x, -30, 30)); it.params.wz = r2(clamp(z, -30, 30));
  if (COL.modo === "bloquear" && SCN.list.length > 1) bloquearMovimento(it);
}
function girarManequim(id, graus) { const it = achar(id); if (!it) return; let g = ((graus % 360) + 540) % 360 - 180; it.params.wRot = Math.round(g); }
/* virar para um ponto do chão */
function apontarManequim(id, x, z) { const it = achar(id); if (!it) return; girarManequim(id, Math.atan2(x - (it.params.wx || 0), z - (it.params.wz || 0)) / D); }
function alturaManequim(id, h) { const it = achar(id); if (!it) return; it.params.bodyLift = Math.round(clamp(h, 0, 30) * 20) / 20; }
/* ===== câmera: a posição no mundo vem do alvo + direção (yaw/pitch) + distância; mover a câmera mantém o alvo ===== */
function direcaoPara(pos, alvo) {
  const dx = pos[0] - alvo[0], dy = pos[1] - alvo[1], dz = pos[2] - alvo[2], d = Math.hypot(dx, dy, dz);
  return { yaw: -Math.atan2(dx, dz) / D, pitch: -Math.atan2(dy, Math.hypot(dx, dz)) / D, d };
}
function aplicarCameraBlk(pos, alvo) {
  const r = direcaoPara(pos, alvo); if (r.d < 1) return false;
  P.tx = clamp(alvo[0], -200, 200); P.ty = clamp(alvo[1], -20, 60); P.tz = clamp(alvo[2], -200, 200);
  P.yaw = Math.round(r.yaw * 10) / 10; P.pitch = clamp(Math.round(r.pitch * 10) / 10, -89, 89); P.roll = 0;
  if (P.persp) P.camDist = Math.round(clamp(r.d, 4, 200) * 100) / 100; else P.camDist = Math.round(clamp(r.d, 4, 200) * 100) / 100;
  return true;
}
function moverCamera(x, y, z) { const C = cameraNoMundo(P); aplicarCameraBlk([x, y === undefined ? C.pos[1] : y, z], C.alvo); }
/* mover o alvo (a retícula): a câmera fica onde está e passa a apontar para o novo alvo */
function moverAlvo(x, y, z) { SCN.pivo = null; const C = cameraNoMundo(P); aplicarCameraBlk(C.pos, [x, y === undefined ? C.alvo[1] : y, z]); }
/* abertura do campo de visão: ângulo horizontal → lente (filme de 36 mm) */
function abrirCone(grausH) { P.lens = Math.round(clamp(18 / Math.tan(clamp(grausH, 5, 120) / 2 * D), 18, 200)); if (!P.persp) P.persp = 1; }
function perspectivaBlk(on) { P.persp = on ? 1 : 0; }
/* zoom óptico: troca só a lente — posição da câmera e alvo ficam onde estão (a foto fecha ou abre a partir do centro) */
const LENTES = [18, 24, 28, 35, 50, 70, 85, 105, 135, 200];
function zoomLente(mm) { if (!P.persp) P.persp = 1; P.lens = Math.round(clamp(mm, 18, 200) * 10) / 10; return P.lens; }
function zoomFator(k) { return zoomLente((P.lens || 50) * k); }
/* próxima lente da lista (dir = +1 fecha / tele, −1 abre / grande-angular) */
function zoomPasso(dir) { const l = P.lens || 50, s = dir > 0 ? LENTES.find(v => v > l + 0.5) : [...LENTES].reverse().find(v => v < l - 0.5); return zoomLente(s || l); }
/* ===== objetos ===== */
const achaObj = id => SCN.objetos.find(q => q.id === id);
/* cabe em cima? (a base do objeto é menor que o tampo do outro) */
function cabeEmCima(o, s) { const a = ehCilindro(o) ? Math.PI * o.raio * o.raio : o.larg * o.prof, b = ehCilindro(s) ? Math.PI * s.raio * s.raio : s.larg * s.prof; return a < 0.8 * b; }
/* mover no chão; com "apoiar" (padrão ao arrastar), ao passar sobre um tampo maior o objeto sobe nele, ao sair desce */
function moverObjeto(id, x, z, apoiar) {
  const o = achaObj(id); if (!o) return;
  editarObjeto(o, { x: r2(clamp(x, -200, 200)), z: r2(clamp(z, -200, 200)) });
  if (apoiar !== false) { const s = apoioSob(o, o.x, o.z); o.sobre = s && cabeEmCima(o, s) ? s.id : null; atualizarApoios(); }
  if (COL.modo === "bloquear") separarObjeto(o, 6);
}
function girarObjeto(id, graus) { const o = achaObj(id); if (!o) return; editarObjeto(o, { giro: ((graus % 360) + 540) % 360 - 180 }); }
function medidasObjeto(id, m) { const o = achaObj(id); if (!o) return; editarObjeto(o, m); }
function selecionarObjeto(id) { SCN.objSel = id && achaObj(id) ? id : null; }
export { cabeEmCima, girarObjeto, medidasObjeto, selecionarObjeto };
export { LENTES, zoomLente, zoomFator, zoomPasso, chaoBlk, leituraBlocking, moverManequim, girarManequim, apontarManequim, alturaManequim, direcaoPara, aplicarCameraBlk, moverCamera, moverAlvo, abrirCone, perspectivaBlk, moverObjeto };
