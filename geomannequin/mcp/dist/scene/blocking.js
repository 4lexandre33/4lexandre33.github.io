/* GeoMannequin — blocking: leitura e escrita da composição (vista de cima e lateral) DIRETO no estado da cena.
   Não há cópia: os manequins são SCN.list (wx, wz, wRot, bodyLift, pose), a câmera é P (tx/ty/tz, yaw, pitch, camDist,
   lens, persp) e os objetos são SCN.objetos. Cada edição escreve nesses campos, com os mesmos limites e o mesmo modo de
   colisão dos comandos; as vistas só leem. */
import { P, SCN, instColors } from "./modelo.js";
import { COL, bloquearMovimento, colisoesDaCena, pMundo } from "./colisoes.js";
import { D, M_R, cameraNoMundo, caixasDoObjeto, capsulas, clamp, restGround, tamanhoNaFoto } from "../engine/index.js";

const chaoBlk = () => restGround(SCN.list[0].params);
/* tudo o que as vistas desenham, lido agora do estado da cena */
function leituraBlocking() {
  const C = cameraNoMundo(P), g0 = chaoBlk();
  const manequins = SCN.list.map((it, i) => {
    const cp = capsulas(pMundo(it)).caps;
    return { id: it.id, i, nome: it.name, cor: instColors(it, typeof document === "undefined"), caps: cp, x: it.params.wx || 0, z: it.params.wz || 0, giro: it.params.wRot || 0,
      altura: it.params.bodyLift || 0, sel: i === SCN.active, oculto: !!it.oculto, foto: tamanhoNaFoto(C, cp) };
  });
  const objetos = SCN.objetos.map(o => ({ id: o.id, nome: o.nome || o.tipo, tipo: o.tipo, x: o.x, z: o.z, giro: o.giro || 0, caixas: caixasDoObjeto(o, g0) }));
  /* altura de uma pessoa em pé (do chão ao alto da cabeça), para as linhas de escala da perspectiva */
  const alturaPessoa = 1.0 - restGround(SCN.list[0].params);
  let colisoes = [];
  try { colisoes = colisoesDaCena().flatMap(c => (c.contatos || []).map(k => k.ponto)).filter(Boolean); } catch (e) { }
  return { camera: C, chao: g0, manequins, objetos, alturaPessoa, colisoes };
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
  P.tx = clamp(alvo[0], -30, 30); P.ty = clamp(alvo[1], -20, 20); P.tz = clamp(alvo[2], -30, 30);
  P.yaw = Math.round(r.yaw * 10) / 10; P.pitch = clamp(Math.round(r.pitch * 10) / 10, -89, 89); P.roll = 0;
  if (P.persp) P.camDist = Math.round(clamp(r.d, 4, 200) * 100) / 100; else P.camDist = Math.round(clamp(r.d, 4, 200) * 100) / 100;
  return true;
}
function moverCamera(x, y, z) { const C = cameraNoMundo(P); aplicarCameraBlk([x, y === undefined ? C.pos[1] : y, z], C.alvo); }
/* mover o alvo (a retícula): a câmera fica onde está e passa a apontar para o novo alvo */
function moverAlvo(x, y, z) { const C = cameraNoMundo(P); aplicarCameraBlk(C.pos, [x, y === undefined ? C.alvo[1] : y, z]); }
/* abertura do campo de visão: ângulo horizontal → lente (filme de 36 mm) */
function abrirCone(grausH) { P.lens = Math.round(clamp(18 / Math.tan(clamp(grausH, 5, 120) / 2 * D), 18, 200)); if (!P.persp) P.persp = 1; }
function perspectivaBlk(on) { P.persp = on ? 1 : 0; }
/* ===== objetos ===== */
function moverObjeto(id, x, z) { const o = SCN.objetos.find(q => q.id === id); if (!o) return; o.x = r2(clamp(x, -30, 30)); o.z = r2(clamp(z, -30, 30)); }
export { chaoBlk, leituraBlocking, moverManequim, girarManequim, apontarManequim, alturaManequim, direcaoPara, aplicarCameraBlk, moverCamera, moverAlvo, abrirCone, perspectivaBlk, moverObjeto };
