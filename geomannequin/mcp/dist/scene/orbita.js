/* GeoMannequin — órbita da câmera em volta de um pivô: um manequim, um grupo, um objeto, um ponto ou a cena inteira.
   O pivô vira o alvo da câmera; o azimute conta a partir da FRENTE do pivô (0 = frente, 90 = lado esquerdo dele,
   180 = costas, −90 = lado direito), e a elevação é o ângulo acima do horizonte. Também serve à arrastada na tela
   (que já gira em volta do alvo), aos botões das 8 vistas, ao giro 360° (turntable) e à ficha do personagem. */
import { P, SCN } from "./modelo.js";
import { pMundo } from "./colisoes.js";
import { acharObjeto } from "./cenario.js";
import { CX, CY, D, H, W, capsulas, clamp, effScale, partesDoObjeto, restGround } from "../engine/index.js";

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

/* caixa de um manequim (pelas cápsulas do corpo) e a frente dele no chão */
function caixaManequim(it) { const p = pMundo(it), bb = [1e9, -1e9, 1e9, -1e9, 1e9, -1e9];
  capsulas(p).caps.forEach(c => [c.a, c.b].forEach(q => { for (let k = 0; k < 3; k++) { bb[2 * k] = Math.min(bb[2 * k], q[k] - c.r); bb[2 * k + 1] = Math.max(bb[2 * k + 1], q[k] + c.r); } }));
  const wr = (p.wRot || 0) * D; return { bb, frente: [Math.sin(wr), Math.cos(wr)] }; }
function caixaObjeto(o) { const g0 = restGround(SCN.list[0].params), bb = [1e9, -1e9, 1e9, -1e9, 1e9, -1e9];
  partesDoObjeto(o, g0).forEach(b => { const hx = Math.hypot(b.h[0], b.h[2]), e = [hx, b.h[1], hx]; for (let k = 0; k < 3; k++) { bb[2 * k] = Math.min(bb[2 * k], b.c[k] - e[k]); bb[2 * k + 1] = Math.max(bb[2 * k + 1], b.c[k] + e[k]); } });
  const r = (o.giro || 0) * D; return { bb, frente: [Math.sin(r), Math.cos(r)] }; }
/* o que é o alvo: manequim (nome, índice, "ativo"), lista, objeto (nome ou tipo), ponto [x, y, z] ou "cena" */
function resolverAlvo(alvo) {
  if (alvo === undefined || alvo === null || alvo === "ativo") alvo = SCN.list[SCN.active].name;
  if (Array.isArray(alvo) && alvo.length === 3 && alvo.every(v => typeof v === "number")) return { tipo: "ponto", nome: "ponto (" + alvo.join(", ") + ")", c: alvo.slice(), meio: [0, 0, 0], frente: null, chave: alvo.slice() };
  const itens = [], nomes = [];
  const um = a => {
    if (a && typeof a === "object" && a.nome !== undefined) a = a.nome;
    if (typeof a === "number") { const it = SCN.list[a]; if (!it) throw new Error("Pivô: manequim " + a + " não existe."); itens.push(caixaManequim(it)); nomes.push(it.name); return; }
    const t = semAcentoOrb(a);
    if (t === "cena" || t === "todos" || t === "tudo") { SCN.list.forEach(it => { if (!it.oculto) itens.push(caixaManequim(it)); }); SCN.objetos.forEach(o => itens.push(Object.assign(caixaObjeto(o), { obj: true }))); nomes.push("cena"); return; }
    const it = SCN.list.find(x => semAcentoOrb(x.name) === t); if (it) { itens.push(caixaManequim(it)); nomes.push(it.name); return; }
    const o = acharObjeto(a); if (o) { itens.push(caixaObjeto(o)); nomes.push(o.nome || o.tipo); return; }
    throw new Error("Pivô: “" + a + "” não é um manequim, um objeto, \"cena\" nem um ponto [x, y, z].");
  };
  [].concat(alvo).forEach(um);
  if (!itens.length) throw new Error("Pivô: a cena está vazia.");
  const bb = [1e9, -1e9, 1e9, -1e9, 1e9, -1e9]; itens.forEach(i => { for (let k = 0; k < 6; k++) bb[k] = k % 2 ? Math.max(bb[k], i.bb[k]) : Math.min(bb[k], i.bb[k]); });
  /* frente: a do único item; num grupo, a média (se apontarem mais ou menos para o mesmo lado); na cena, o mundo (+z) */
  let frente = null; if (nomes[0] !== "cena") { const f = itens.reduce((s, i) => [s[0] + i.frente[0], s[1] + i.frente[1]], [0, 0]), l = Math.hypot(f[0], f[1]) / itens.length; if (l > 0.5) frente = [f[0] / (l * itens.length), f[1] / (l * itens.length)]; }
  return { tipo: nomes[0] === "cena" ? "cena" : itens.length > 1 ? "grupo" : "item", nome: nomes.join(" + "), c: [(bb[0] + bb[1]) / 2, (bb[2] + bb[3]) / 2, (bb[4] + bb[5]) / 2], meio: [(bb[1] - bb[0]) / 2, (bb[3] - bb[2]) / 2, (bb[5] - bb[4]) / 2], frente, chave: alvo };
}
/* tamanho na tela que faz o pivô caber (raio no chão e meia altura, iguais em qualquer azimute: o giro não "pulsa") */
function enquadrarPivo(A, elev, folga) {
  const rh = Math.max(0.5, Math.hypot(A.meio[0], A.meio[2])), hy = Math.max(0.5, A.meio[1]), e = Math.abs(elev) * D, ry = Math.hypot(hy * Math.cos(e), rh * Math.sin(e));
  const Hf = SCN.recorte ? SCN.recorte.h : H, Wf = SCN.recorte ? SCN.recorte.w : W, k = folga || 1.08;
  const S = Math.min(Hf * 0.86 / (2 * ry * k), Wf * 0.9 / (2 * rh * k));
  if (P.persp) { const raio = Math.hypot(rh, hy); let d = (W / 2) * (P.lens || 50) / (18 * S); const dmin = Math.max(6, raio * 1.25 + 2);
    if (d < dmin) { d = dmin; P.lens = Math.round(clamp(18 * S * d / (W / 2), 18, 200)); } P.camDist = +clamp(d, 4, 200).toFixed(2); }
  else P.zoom = +clamp(S / effScale(Object.assign({}, P, { persp: 0, zoom: 1 })), 0.05, 3).toFixed(3);
}
/* o pivô no centro da foto */
function centrarPivo() { const Sx = effScale(P); P.panX = (W / 2 - CX) / Sx; P.panY = (CY - H / 2) / Sx; }
/* azimute e elevação atuais da câmera em relação ao pivô */
function vistaAtual(A) { const wr = A && A.frente ? Math.atan2(A.frente[0], A.frente[1]) / D : 0; let a = -(P.yaw || 0) - wr; a = ((a + 540) % 360) - 180; return { azimute: Math.round(a * 10) / 10, elevacao: -(P.pitch || 0) }; }
/* camera.pivo(alvo): o alvo da câmera passa a ser o centro do pivô (a câmera mantém direção e distância) */
function pivoCamera(alvo, opts) {
  const A = resolverAlvo(alvo); opts = opts || {};
  P.tx = clamp(A.c[0], -30, 30); P.ty = clamp(A.c[1], -20, 20); P.tz = clamp(A.c[2], -30, 30);
  if (opts.enquadrar) enquadrarPivo(A, -(P.pitch || 0));
  centrarPivo(); SCN.pivo = A.chave; return A;
}
/* camera.orbitar(alvo, {azimute, elevacao, distancia, enquadrar, relativo, rolagem}) */
function orbitarCamera(alvo, opts) {
  opts = opts || {}; const A = pivoCamera(alvo);
  const az = opts.azimute === undefined ? vistaAtual(A).azimute : azimuteDe(opts.azimute), el = elevacaoDe(opts.elevacao), elev = el === null ? -(P.pitch || 0) : el;
  const base = opts.relativo === false || !A.frente ? 0 : Math.atan2(A.frente[0], A.frente[1]) / D;
  let yaw = -(base + az); yaw = ((yaw + 540) % 360) - 180;
  P.yaw = Math.round(yaw * 10) / 10; P.pitch = clamp(-elev, -70, 70); P.roll = opts.rolagem === undefined ? 0 : clamp(+opts.rolagem || 0, -45, 45);
  if (opts.distancia !== undefined) { const d = +opts.distancia; if (!(d > 0)) throw new Error("Distância da órbita: um número em R."); if (P.persp) P.camDist = clamp(d, 4, 200); else P.zoom = clamp(6.2 / d, 0.05, 3); }
  else if (opts.enquadrar !== false) enquadrarPivo(A, elev, opts.folga);
  centrarPivo();
  return { pivo: A.nome, tipo: A.tipo, azimute: az, elevacao: elev, yaw: P.yaw, pitch: P.pitch, distancia: P.camDist };
}
/* um passo de órbita (arrastar, teclas, botões ←/→): gira em volta do alvo atual */
function passoOrbita(dAz, dEl) { if (dAz) { let y = (P.yaw || 0) - dAz; y = ((y + 540) % 360) - 180; P.yaw = Math.round(y * 10) / 10; } if (dEl) P.pitch = clamp((P.pitch || 0) - dEl, -70, 70); }
/* azimutes de um giro de n vistas (começando na frente; sentido "horario" visto de cima = para a direita do pivô) */
function azimutesGiro(n, opts) { n = Math.max(2, Math.min(72, Math.round(n || 8))); const s = opts && /hor/.test(String(opts.sentido || "")) ? -1 : 1, a0 = opts && opts.inicio !== undefined ? azimuteDe(opts.inicio) : 0;
  return Array.from({ length: n }, (_, i) => { let a = a0 + s * 360 * i / n; a = ((a + 540) % 360) - 180; return Math.round(a * 100) / 100; }); }
function nomeVista(a) { const v = VISTAS_8.find(x => Math.abs(((x[1] - a + 540) % 360) - 180) < 0.5); return v ? v[0] : Math.round(a) + "°"; }

export { AZIMUTES, VISTAS_8, azimuteDe, elevacaoDe, resolverAlvo, enquadrarPivo, vistaAtual, pivoCamera, orbitarCamera, passoOrbita, azimutesGiro, nomeVista };
