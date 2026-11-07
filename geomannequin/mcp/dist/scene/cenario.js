/* GeoMannequin — cenário e posicionamento por código (sem depender da página; o MCP usa este arquivo):
   objetos (banco, cadeira, caixa, degrau, mesa, parede), sentar/subir/encostar, orientar o corpo por eixo,
   deitar ao longo de um eixo, olhar para algo, mão/pé em um ponto, apontar. Eixos do mundo: x (lado), y (altura),
   z (profundidade; a câmera padrão olha de +z). 1 R ≈ 11,4 cm. */
import { SCN, novoIdObjeto, P, setP } from "./modelo.js";
import { doBodyPose, guardArms, POSE0 } from "./poses.js";
import { pMundo } from "./colisoes.js";
import { TIPOS_OBJETO, objetoPadrao, D, applyA, chainSetup, clamp, comp, doMundo, ikArm, ikLeg, legPose, mT, mv, paraMundo, restGround, shape, armJoint, armDims, aplicarGesto } from "../engine/index.js";

const chaoY = () => restGround(SCN.list[0].params);
/* roda uma função de pose com este manequim como ativo (as poses usam P) */
function comP(it, fn) { const prev = P; setP(it.params); try { return fn(); } finally { setP(prev); } }

/* ===== objetos ===== */
function adicionarObjeto(tipo, o) {
  if (SCN.objetos.length >= 24) throw new Error("Limite de 24 objetos na cena.");
  const t = String(tipo || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const q = objetoPadrao(t, {}); q.id = novoIdObjeto();
  editarObjeto(q, o || {});
  SCN.objetos.push(q); return q;
}
function editarObjeto(q, o) {
  const n = (v, mn, mx) => typeof v === "number" && isFinite(v) ? clamp(v, mn, mx) : undefined;
  [["x", -40, 40], ["z", -40, 40], ["giro", -180, 180], ["larg", 0.3, 40], ["prof", 0.3, 40], ["alt", 0.2, 40], ["encosto", 0.5, 12]].forEach(([k, a, b]) => {
    const v = n(o[k] !== undefined ? o[k] : o[{ larg: "largura", prof: "profundidade", alt: "altura" }[k]], a, b); if (v !== undefined) q[k] = v;
  });
  if (typeof o.nome === "string") q.nome = o.nome.slice(0, 24);
  return q;
}
function removerObjeto(q) {
  const i = SCN.objetos.indexOf(q); if (i < 0) return;
  SCN.objetos.splice(i, 1); SCN.list.forEach(it => { if (it.apoioEm === q.id) it.apoioEm = null; });
}
function acharObjeto(ref) {
  if (ref && typeof ref === "object" && ref.id) return SCN.objetos.find(o => o.id === ref.id) || null;
  if (typeof ref === "number") return SCN.objetos[ref] || null;
  const s = String(ref || "").toLowerCase();
  return SCN.objetos.find(o => (o.nome || "").toLowerCase() === s) || SCN.objetos.find(o => o.tipo === s) || null;
}

/* ===== orientação ===== */
/* ângulo no chão (graus) de um vetor do mundo: 0 = +z, 90 = +x */
const angXZ = v => Math.atan2(v[0], v[2]) / D;
const DIRS = { "+x": [1, 0, 0], "x": [1, 0, 0], "-x": [-1, 0, 0], "+z": [0, 0, 1], "z": [0, 0, 1], "-z": [0, 0, -1], "+y": [0, 1, 0], "y": [0, 1, 0], "-y": [0, -1, 0],
  "direita": [1, 0, 0], "esquerda": [-1, 0, 0], "frente": [0, 0, 1], "trás": [0, 0, -1], "tras": [0, 0, -1], "fundo": [0, 0, -1], "cima": [0, 1, 0], "baixo": [0, -1, 0] };
/* direção no mundo a partir de: "+x", "câmera", graus, [x, y, z], {x, z}, nome de outro manequim */
function direcaoMundo(it, alvo) {
  if (typeof alvo === "number") return [Math.sin(alvo * D), 0, Math.cos(alvo * D)];
  if (Array.isArray(alvo)) { const p = pMundo(it); return [alvo[0] - p.wx, (alvo[1] ?? 0) - 0, alvo[2] - p.wz]; }
  if (alvo && typeof alvo === "object" && "x" in alvo) { const p = pMundo(it); return [alvo.x - p.wx, 0, (alvo.z || 0) - p.wz]; }
  const s = String(alvo || "").toLowerCase().trim().replace(/^eixo\s*/, "").replace("câmera", "camera").replace("camara", "camera");
  if (s === "camera") { const yaw = P.yaw * D; return [Math.sin(yaw), 0, Math.cos(yaw)]; }
  if (DIRS[s]) return DIRS[s];
  const o = SCN.list.find(x => x.name.toLowerCase() === s) || acharObjeto(s);
  if (o) { const a = o.params ? o.params : o, p = pMundo(it); return [a.wx !== undefined ? a.wx - p.wx : a.x - p.wx, 0, a.wz !== undefined ? a.wz - p.wz : a.z - p.wz]; }
  throw new Error("Direção desconhecida: “" + alvo + "”. Use +x, -x, +z, -z, câmera, graus ou o nome de um manequim/objeto.");
}
/* vira o corpo (frente do peito) para a direção, só girando no chão */
function orientar(it, alvo) {
  const d = direcaoMundo(it, alvo); if (Math.hypot(d[0], d[2]) < 1e-6) throw new Error("Para orientar no chão use uma direção horizontal (x ou z).");
  const ch = chainSetup(it.params, shape(it.params)), f = mv(ch.A2.M, [0, 0, 1]);
  const fv = Math.hypot(f[0], f[2]) > 0.2 ? angXZ(f) : angXZ(mv(ch.A2.M, [0, 1, 0]).map(x => -x));
  it.params.wRot = ((angXZ(d) - fv + 540) % 360) - 180;
}
/* deita o manequim (costas, bruços, lado) com a cabeça apontando para o eixo pedido */
function deitar(it, tipo, eixo) {
  const t = String(tipo || "costas").toLowerCase();
  const pose = /bru/.test(t) ? "deBrucos" : /lado|direit|esquerd/.test(t) ? "deitadoLado" : "deitadoCostas";
  comP(it, () => doBodyPose(pose, { lado: /direit/.test(t) ? "dir" : "esq" }));
  if (eixo !== undefined) {
    const d = direcaoMundo(it, eixo), ch = chainSetup(it.params, shape(it.params)), cab = applyA(ch.A3, [0, 0, 0]), pe = applyA(ch.Pel, [0, ch.F.yHip, 0]), v = [cab[0] - pe[0], 0, cab[2] - pe[2]];
    it.params.wRot = ((angXZ(d) - angXZ(v) + 540) % 360) - 180;
  }
}
/* olhar: "baixo", "cima", "esquerda", "direita", "frente", "câmera", ponto [x,y,z] ou outro manequim */
function olharPara(it, alvo) {
  const Q = it.params, s = String(alvo === undefined ? "frente" : alvo).toLowerCase();
  const simples = { baixo: [0, 38, 18], cima: [0, -45, -15], frente: [0, 0, 0], esquerda: [65, 0, 0], direita: [-65, 0, 0] };
  if (typeof alvo === "string" && simples[s]) { const [y, pt, nf] = simples[s]; Object.assign(Q, { headYaw: y, headPitch: pt, neckFlex: nf }); return; }
  /* ponto no mundo: direção da cabeça até ele, no sistema do tórax */
  let W;
  if (Array.isArray(alvo)) W = alvo;
  else if (s === "camera" || s === "câmera") { const yaw = P.yaw * D, pit = P.pitch * D, d = Math.max(3, P.camDist || 30); W = [P.tx + Math.sin(yaw) * Math.cos(pit) * d, P.ty - Math.sin(pit) * d, P.tz + Math.cos(yaw) * Math.cos(pit) * d]; }
  else { const o = SCN.list.find(x => x.name.toLowerCase() === s); if (!o) throw new Error("Não sei para onde olhar: “" + alvo + "”."); const po = pMundo(o), ch = chainSetup(o.params, shape(o.params)); W = paraMundo(po)(applyA(ch.A3, [0, 0, 0])); }
  const pw = pMundo(it), ch = chainSetup(Q, shape(Q)), cab = applyA(ch.A3, [0, 0, 0]), alvoC = doMundo(pw)(W);
  const dl = mv(mT(ch.A2.M), [alvoC[0] - cab[0], alvoC[1] - cab[1], alvoC[2] - cab[2]]);
  let yaw = Math.atan2(dl[0], dl[2]) / D, pit = -Math.atan2(dl[1], Math.hypot(dl[0], dl[2])) / D;
  /* além do pescoço (±80°), o tronco gira junto */
  const tw = clamp(yaw - clamp(yaw, -75, 75), -40, 40);
  Object.assign(Q, { headYaw: clamp(yaw - tw, -80, 80), headPitch: clamp(pit * 0.7, -60, 50), neckFlex: clamp(pit * 0.3, -40, 40), spineTwist: clamp((Q.spineTwist || 0) + tw, -45, 45) });
}
/* mão (lado 1 = esquerda, −1 = direita) num ponto do mundo [x, y, z] */
function maoEm(it, lado, W) {
  const Q = it.params, S = shape(Q), pw = pMundo(it), alvo = doMundo(pw)(W), r = ikArm(Q, S, lado, alvo), L_ = lado > 0 ? "L" : "R";
  Object.assign(Q, { ["armAbd" + L_]: r.abd, ["armFlex" + L_]: r.flex, ["armRot" + L_]: r.rot, ["elbow" + L_]: r.elbow });
  return r.err;
}
function peEm(it, lado, W) {
  const Q = it.params, S = shape(Q), pw = pMundo(it), alvo = doMundo(pw)(W), r = ikLeg(Q, S, lado, alvo), L_ = lado > 0 ? "L" : "R";
  Object.assign(Q, { ["hipFlex" + L_]: r.hipFlex, ["hipAbd" + L_]: r.hipAbd, ["hipRot" + L_]: r.hipRot, ["kneeFlex" + L_]: r.knee });
}
/* aponta o braço esticado para um alvo (mundo) ou direção */
function apontarPara(it, alvo, lado) {
  lado = lado || -1;
  const Q = it.params, pw = pMundo(it), ch = chainSetup(Q, shape(Q)), G = paraMundo(pw)(applyA(ch.A2, armJoint(Q, ch.F, lado)));
  let d;
  if (Array.isArray(alvo)) d = [alvo[0] - G[0], alvo[1] - G[1], alvo[2] - G[2]];
  else { d = direcaoMundo(it, alvo); if (typeof alvo === "string" && SCN.list.some(x => x.name.toLowerCase() === String(alvo).toLowerCase())) d[1] = -2; }
  const L = Math.hypot(...d) || 1, A = armDims(Q), alc = (A.L1 + A.L2) * 0.98;
  maoEm(it, lado, [G[0] + d[0] / L * alc, G[1] + d[1] / L * alc, G[2] + d[2] / L * alc]);
  aplicarGesto(Q, lado, "apontar"); Q["pron" + (lado > 0 ? "L" : "R")] = 70;
}

/* ===== apoio em objetos ===== */
/* ponto dos ísquios (onde se senta) no mundo */
function isquios(it) {
  const Q = it.params, ch = chainSetup(Q, shape(Q)), F = ch.F, M = paraMundo(pMundo(it));
  const a = M(applyA(ch.Pel, [0.4, F.yHip - 0.55, -0.7])), b = M(applyA(ch.Pel, [-0.4, F.yHip - 0.55, -0.7]));
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.5, (a[2] + b[2]) / 2];
}
/* senta no objeto (ou cria um banco do tamanho certo, se nenhum for dado) */
function sentar(it, ref) {
  comP(it, () => doBodyPose("sentado"));
  let q = ref === undefined || ref === null ? null : acharObjeto(ref);
  if (ref !== undefined && ref !== null && !q) throw new Error("Objeto não encontrado: “" + ref + "”.");
  const g0 = chaoY();
  if (q) {
    /* ajusta os joelhos para o assento ficar na altura dos ísquios (pés no chão) */
    const alvo = g0 + q.alt; let best = null;
    for (let k = 40; k <= 135; k += 3) {
      Object.assign(it.params, { kneeFlexL: k, kneeFlexR: k - 3, ankleFlexL: clamp(90 - k, -20, 40), ankleFlexR: clamp(93 - k, -20, 40) });
      const e = Math.abs(isquios(it)[1] - alvo); if (!best || e < best.e) best = { e, k };
    }
    Object.assign(it.params, { kneeFlexL: best.k, kneeFlexR: best.k - 3, ankleFlexL: clamp(90 - best.k, -20, 40), ankleFlexR: clamp(93 - best.k, -20, 40) });
    comP(it, () => guardArms());
    it.params.wRot = q.giro || 0;
    if (best.e > 0.25) it.params.bodyLift = (it.params.bodyLift || 0) + (alvo - isquios(it)[1]);
  } else {
    q = adicionarObjeto("banco", { x: it.params.wx, z: it.params.wz, giro: it.params.wRot });
    q.alt = clamp(isquios(it)[1] - g0, 1.5, 8);
  }
  /* coloca os ísquios sobre o meio do assento, um pouco à frente */
  const r = (q.giro || 0) * D, alvoXZ = [q.x + Math.sin(r) * q.prof * 0.08, q.z + Math.cos(r) * q.prof * 0.08], is = isquios(it);
  it.params.wx += alvoXZ[0] - is[0]; it.params.wz += alvoXZ[1] - is[2];
  it.apoioEm = q.id;
  return q;
}
/* sobe em cima de uma caixa/degrau/mesa (em pé) */
function subirEm(it, ref) {
  const q = acharObjeto(ref); if (!q) throw new Error("Objeto não encontrado: “" + ref + "”.");
  it.params.bodyLift = q.alt; it.params.wx = q.x; it.params.wz = q.z; it.apoioEm = q.id; return q;
}
/* encosta as costas numa parede (ou objeto): fica de frente para longe dela */
function encostarEm(it, ref) {
  const q = acharObjeto(ref); if (!q) throw new Error("Objeto não encontrado: “" + ref + "”.");
  comP(it, () => doBodyPose("encostado"));
  const r = (q.giro || 0) * D, n = [Math.sin(r), 0, Math.cos(r)], d = q.prof / 2 + 1.25;
  it.params.wx = q.x + n[0] * d; it.params.wz = q.z + n[2] * d; it.params.wRot = (q.giro || 0);
  it.apoioEm = q.id; return q;
}

export { adicionarObjeto, editarObjeto, removerObjeto, acharObjeto, direcaoMundo, orientar, deitar, olharPara, maoEm, peEm, apontarPara, isquios, sentar, subirEm, encostarEm, DIRS };
