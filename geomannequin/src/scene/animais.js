/* GeoMannequin — animais quadrúpedes na cena: criar (espécie, escala, cor), poses (parado, deitado, sentado, empinado, comendo…),
   marchas com os cascos plantados (passo, trote, galope: a passada sai do comprimento da perna), montaria (a pessoa senta na sela e
   acompanha o balanço), carga no lombo e seguir alguém. O animal é um objeto composto (tipo "animal") com o.animal = { especie,
   escala, pose, sela, cavaleiro, carga }. Ângulos em graus; distâncias em metros (1 R ≈ 0,114 m). */
import { SCN } from "./modelo.js";
import { adicionarObjeto } from "./cenario.js";
import { pMundo } from "./colisoes.js";
import { capsulas, QD_ESPECIES, QD_KT, qdEspecie, qdPosePadrao, qdPontoMundo, qdMedidas, qdEsqueleto, restGround, avPosePadrao, qdEhAve, crPosePadrao } from "../engine/index.js";

const AM_M = 1 / 0.114;
/* poses prontas do animal (somam à pose de descanso) */
const AM_POSES = {
  parado: {},
  atento: { pescoco: 12, cabeca: 8, rabo: 10 },
  comendo: { pescoco: -75, cabeca: -30, pernas: { de: [8, 0, 0], dd: [-4, 0, 0] } },
  "cabeca-baixa": { pescoco: -35, cabeca: -15 },
  deitado: { deitado: 1, pescoco: 5, pernas: { de: [75, -150, 40], dd: [70, -140, 30], te: [85, -120, 50], td: [80, -115, 45] } },
  sentado: { sentado: 1, corpoInclina: 38, pescoco: 6, pernas: { de: [-30, 0, 0], dd: [-30, 0, 0], te: [70, -150, 60], td: [70, -150, 60] } },
  empinado: { corpoInclina: 40, pescoco: 25, rabo: -20, pernas: { de: [40, -100, 20], dd: [55, -110, 20], te: [-34, 0, 0], td: [-30, 0, 0] } },
  "pata-levantada": { pernas: { de: [25, -80, 10] } },
  coice: { corpoInclina: -12, pescoco: -20, pernas: { te: [-60, 30, 0], td: [-65, 30, 0] } },
  agachado: { pernas: { de: [10, -25, 10], dd: [10, -25, 10], te: [20, -30, 10], td: [20, -30, 10] }, pescoco: -10 },
  "asas-abertas": { asaAbre: 1, asaBate: 25, pescoco: 15 }, voando: { asaAbre: 1, asaBate: 35, voo: 3, pernas: { de: [40, -90, 20], dd: [40, -90, 20], te: [-40, 20, 0], td: [-40, 20, 0] } },
  planando: { asaAbre: 1, asaBate: 5, voo: 4, pernas: { de: [40, -90, 20], dd: [40, -90, 20], te: [-45, 20, 0], td: [-45, 20, 0] } },
  uivando: { sentado: 1, corpoInclina: 32, pescoco: 50, cabeca: 45, pernas: { de: [-30, 0, 0], dd: [-30, 0, 0], te: [70, -150, 60], td: [70, -150, 60] } }
};
const AM_SIN_POSE = { "em-pe": "parado", empe: "parado", "em pé": "parado", deitada: "deitado", sentada: "sentado", empinada: "empinado", come: "comendo", pastando: "comendo", pasta: "comendo" };
/* poses de AVE (somam à pose de descanso da ave) */
const AV_POSES = {
  parado: {}, atento: { pescoco: 12, cabeca: 6, caudaAbre: 0.2 }, empoleirado: { agacha: 0.5, corpoInclina: 8 },
  ciscando: { pescoco: -45, cabeca: -40, corpoInclina: -25, pernas: { pd: [25, -10, 30, 0] } }, bicando: { pescoco: -70, cabeca: -55, corpoInclina: -35 },
  comendo: { pescoco: -60, cabeca: -45, corpoInclina: -30, bico: 0.4 }, cantando: { pescoco: 25, cabeca: 30, bico: 0.8, corpoInclina: 10 },
  "asas-abertas": { asaE: { abre: 1, bate: 20 }, asaD: { abre: 1, bate: 20 }, caudaAbre: 0.8, pescoco: 10 },
  "abrindo-asas": { asaE: { abre: 0.55, bate: 35 }, asaD: { abre: 0.55, bate: 35 }, caudaAbre: 0.4 },
  ameacando: { asaE: { abre: 0.7, bate: 10, varre: 20 }, asaD: { abre: 0.7, bate: 10, varre: 20 }, pescoco: -30, cabeca: 10, bico: 0.7, corpoInclina: -10, caudaAbre: 1 },
  "voando-cima": { asaE: { abre: 1, bate: 65 }, asaD: { abre: 1, bate: 65 }, recolhe: 1, voo: 2, corpoInclina: -15, caudaAbre: 0.5 },
  "voando-baixo": { asaE: { abre: 0.9, bate: -40, varre: -10 }, asaD: { abre: 0.9, bate: -40, varre: -10 }, recolhe: 1, voo: 2, corpoInclina: -15, caudaAbre: 0.5 },
  planando: { asaE: { abre: 1, bate: 6 }, asaD: { abre: 1, bate: 6 }, recolhe: 1, voo: 3, corpoInclina: -20, caudaAbre: 0.7 },
  pousando: { asaE: { abre: 1, bate: 45, varre: 15 }, asaD: { abre: 1, bate: 45, varre: 15 }, voo: 0.5, corpoInclina: 25, caudaAbre: 1, pernas: { pe: [35, 0, 0, 0], pd: [35, 0, 0, 0] } },
  decolando: { asaE: { abre: 0.9, bate: 60 }, asaD: { abre: 0.9, bate: 60 }, agacha: 0.7, corpoInclina: -10, caudaAbre: 0.6 },
  mergulho: { asaE: { abre: 0.25, bate: 20, varre: -30 }, asaD: { abre: 0.25, bate: 20, varre: -30 }, recolhe: 1, voo: 4, corpoInclina: -60, pescoco: -20 },
  garras: { asaE: { abre: 1, bate: 50 }, asaD: { abre: 1, bate: 50 }, voo: 1, corpoInclina: 30, caudaAbre: 1, pernas: { pe: [60, 20, 0, -30], pd: [60, 20, 0, -30] } },
  choco: { agacha: 1, corpoInclina: -5, pescoco: -10 }, dormindo: { agacha: 1, pescoco: -40, pescocoCurva: 60, cabecaGiro: 150, cabeca: -20 },
  "gira-cabeca": { cabecaGiro: 170 }, inclinando: { cabecaGiro: 20, cabeca: 25 }, "uma-perna": { pernas: { pd: [70, -60, 80, -40] } }
};
/* poses das CRIATURAS (um conjunto para todos os planos corporais: cada plano usa o que tem) */
const CR_POSES = {
  parado: {}, atento: { pescoco: 15, cabeca: 6 }, rugindo: { boca: 1, pescoco: 25, cabeca: 15 }, "boca-aberta": { boca: 0.8 }, mordendo: { boca: 0.5, pescoco: -10, corpoInclina: -6 },
  bote: { ereto: 1, pescoco: 30, boca: 1, curva: 15, cauda: -5 }, enrolado: { curva: 85, ondula: 1.4, ondas: 2 }, serpenteando: { ondula: 1, ondas: 1.5 }, "s": { ondula: 1.2, ondas: 1 },
  nadando: { ondula: 0.6, voo: 0.6 }, mergulhando: { corpoInclina: -30, voo: 1.2, ondula: 0.3 }, saltando: { corpoInclina: 35, voo: 1.5, cauda: -25 }, boiando: { voo: 0.1, rolo: 10 },
  deitado: { agacha: 1, pescoco: -8 }, descansando: { agacha: 0.7, pescoco: -15, curva: 25 }, "cauda-erguida": { cauda: 45 }, virando: { curva: 40, cabecaGiro: 20 }, "olhando-cima": { pescoco: 30, cabeca: 20 },
  "asas-abertas": { asas: { abre: 1, bate: 20 }, pescoco: 25, cabeca: 10 }, voando: { asas: { abre: 1, bate: 30 }, voo: 6, corpoInclina: -5, pernas: { 0: [-40, 30, 30], 1: [-50, 30, 40] } },
  planando: { asas: { abre: 1, bate: 5 }, voo: 8, corpoInclina: -3, pernas: { 0: [-40, 30, 30], 1: [-50, 30, 40] } }, "cuspindo-fogo": { pescoco: 12, cabeca: -8, boca: 1, asas: { abre: 0.6, bate: 25 } },
  empinado: { corpoInclina: 35, pescoco: 25, boca: 0.6, asas: { abre: 1, bate: 35 } }, "de-pe": { corpoInclina: 55, ereto: 1, pescoco: -45, pernas: { 0: [-75, 0, 10], 1: [-24, 0, -10] } }, agachado: { agacha: 1 },
  "tentaculos-abertos": { tentaculos: { abre: 1, enrola: 0.1 } }, "tentaculos-enrolados": { tentaculos: { abre: 0.2, enrola: 1 } }, "pincas-abertas": { pincas: 1, pescoco: 10 }, ameacando: { pincas: 1, boca: 0.8, cauda: 40, pescoco: 15, asas: { abre: 0.8, bate: 30 } }
};
const amEhCriatura = esp => !!((QD_ESPECIES[qdEspecie(esp) || ""] || {}).classe === "criatura");
const amEhAve = esp => !!((QD_ESPECIES[qdEspecie(esp) || ""] || {}).classe === "ave");
function amPose(nome, especie) { const n = String(nome || "parado").toLowerCase();
  if (especie && amEhAve(especie)) { const p = AV_POSES[n] || AV_POSES[AM_SIN_POSE[n]]; if (!p) return null; return amMisturar(avPosePadrao(), p, 1); }
  if (especie && amEhCriatura(especie)) { const p = CR_POSES[n] || CR_POSES[AM_SIN_POSE[n]]; if (!p) return null; return amMisturar(crPosePadrao(), p, 1); }
  const p = AM_POSES[n] || AM_POSES[AM_SIN_POSE[n]]; if (!p) return null; return amMisturar(qdPosePadrao(), p, 1); }
/* mistura de poses (para transições suaves): a + (b − a)·u, inclusive as pernas */
function amMisturar(a, b, u) { const r = JSON.parse(JSON.stringify(a)), cri = !!((a && "ondula" in a) || (b && "ondula" in b)), ave = !cri && !!((a && a.asaE) || (b && b.asaE)), P0 = cri ? crPosePadrao() : ave ? avPosePadrao() : qdPosePadrao();
  if (ave || cri) { /* ave: números misturam, listas por posição, objetos (asaE, asaD, pernas) por dentro; o que falta conta como o descanso */
    const mx = (x, y, d) => { if (typeof x === "number" || typeof y === "number" || typeof d === "number") { const va = typeof x === "number" ? x : (d || 0), vb = typeof y === "number" ? y : (typeof d === "number" ? d : va); return va + (vb - va) * u; }
      if (Array.isArray(x) || Array.isArray(y) || Array.isArray(d)) { const A = x || d || [], B = y || d || [], n = Math.max(A.length, B.length); return Array.from({ length: n }, (_, i) => (A[i] || 0) + ((B[i] || 0) - (A[i] || 0)) * u); }
      if ((x && typeof x === "object") || (y && typeof y === "object")) { const o = {}, X = x || {}, Y = y || {}, D = d || {}; for (const k of new Set([...Object.keys(X), ...Object.keys(Y), ...Object.keys(D)])) o[k] = mx(X[k], Y[k], D[k]); return o; }
      return y !== undefined ? (u > 0.5 ? y : x) : x; };
    for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {}), ...Object.keys(P0)])) r[k] = mx((a || {})[k], (b || {})[k], P0[k]); return r; }
  for (const k of Object.keys(P0)) { if (k === "pernas") continue; const va = a[k] ?? 0, vb = b[k] ?? P0[k] ?? 0; r[k] = va + (vb - va) * u; }
  r.pernas = {}; for (const l of ["de", "dd", "te", "td"]) { const pa = (a.pernas && a.pernas[l]) || [0, 0, 0], pb = (b.pernas && b.pernas[l]) || [0, 0, 0]; r.pernas[l] = [0, 1, 2].map(i => (pa[i] || 0) + ((pb[i] || 0) - (pa[i] || 0)) * u); }
  return r; }
/* ===== marchas: passo (4 tempos), trote (diagonais), galope (com voo) ===== */
const AM_MARCHAS = {
  passo: { fase: { te: 0, de: 0.25, td: 0.5, dd: 0.75 }, duty: 0.64, A: 16, K: 55, T: 1.1, balanco: 0 },
  trote: { fase: { de: 0, td: 0, dd: 0.5, te: 0.5 }, duty: 0.46, A: 22, K: 80, T: 0.72, balanco: 1.5 },
  galope: { fase: { te: 0, td: 0.1, de: 0.36, dd: 0.46 }, duty: 0.36, A: 30, K: 100, T: 0.55, balanco: 6 },
  /* andadura (pares do mesmo lado juntos: camelo, elefante, alguns cavalos), meio-galope (cânter, 3 tempos), galope de fuga, esgueirar (baixo, devagar) */
  andadura: { fase: { te: 0, de: 0, td: 0.5, dd: 0.5 }, duty: 0.52, A: 20, K: 70, T: 0.8, balanco: 1 },
  "meio-galope": { fase: { td: 0, te: 0.3, dd: 0.3, de: 0.6 }, duty: 0.42, A: 26, K: 90, T: 0.62, balanco: 4 },
  "galope-fuga": { fase: { te: 0, td: 0.08, de: 0.34, dd: 0.42 }, duty: 0.3, A: 34, K: 112, T: 0.48, balanco: 7 },
  esgueirar: { fase: { te: 0, de: 0.25, td: 0.5, dd: 0.75 }, duty: 0.72, A: 11, K: 38, T: 1.5, balanco: 0, baixo: true }
};
const AM_SIN_MARCHA = { anda: "passo", andar: "passo", caminha: "passo", trota: "trote", trotar: "trote", galopa: "galope", galopar: "galope", corre: "galope", correr: "galope",
  "anda-de-lado": "andadura", andadura: "andadura", amblea: "andadura", "meio-galope": "meio-galope", canter: "meio-galope", cantera: "meio-galope", dispara: "galope-fuga", foge: "galope-fuga", "galopa-rapido": "galope-fuga", esgueira: "esgueirar", "anda-agachado": "esgueirar", espreita: "esgueirar" };
/* comprimento da perna (m, do quadril ao casco) e passada por ciclo (m): o casco no chão anda para trás, em linha reta e na
   velocidade do corpo — então não escorrega. As pernas são posicionadas por IK (3 segmentos, o último quase de pé). */
function amPerna(especie, escala = 1) { const E = QD_ESPECIES[qdEspecie(especie) || "cavalo"]; return Math.max(0.1, (E.h - E.w * 0.45 - E.w * 0.275) * escala); }
const AM_DELTA = M => 0.95 * Math.sin(M.A * Math.PI / 180) * (M.baixo ? 0.8 : 1);
function amPassada(especie, escala, marcha) { const M = AM_MARCHAS[marcha] || AM_MARCHAS.passo; return 2 * AM_DELTA(M) / M.duty * amPerna(especie, escala); }
function amCiclo(especie, escala, marcha) { const M = AM_MARCHAS[marcha] || AM_MARCHAS.passo, E = QD_ESPECIES[qdEspecie(especie) || "cavalo"]; return M.T * Math.sqrt(Math.max(0.05, E.h * escala) / 1.6); }
/* IK de uma perna no plano lateral, em unidades do comprimento da perna (quadril = 0,0; y para baixo negativo):
   alvo do casco (z, y) e ângulo do último segmento → ângulos da pose (somam ao descanso da perna) */
const AM_PERNA = { d: { L: [0.42, 0.38, 0.2], rest: [0, 0, 0] }, t: { L: [0.42 * QD_KT, 0.38 * QD_KT, 0.2 * QD_KT], rest: [14, -38, 24] } };
const AM_Z0 = { d: 0, t: QD_KT * (0.42 * Math.sin(14 * Math.PI / 180) + 0.38 * Math.sin(-24 * Math.PI / 180)) };
function amIK(tipo, z, y, a3g) { const R = Math.PI / 180, { L, rest } = AM_PERNA[tipo], a3 = (a3g || 0) * R, jz = z - L[2] * Math.sin(a3), jy = y + L[2] * Math.cos(a3);
  const d = Math.max(Math.abs(L[0] - L[1]) + 1e-3, Math.min(L[0] + L[1] - 1e-4, Math.hypot(jz, jy))), phi = Math.atan2(jz, -jy);
  const al = Math.acos(Math.max(-1, Math.min(1, (L[0] * L[0] + d * d - L[1] * L[1]) / (2 * L[0] * d)))), be = Math.PI - Math.acos(Math.max(-1, Math.min(1, (L[0] * L[0] + L[1] * L[1] - d * d) / (2 * L[0] * L[1]))));
  const a1 = phi + al, a2 = a1 - be; return [a1 / R - rest[0], (a2 - a1) / R - rest[1], (a3 - a2) / R - rest[2]]; }
const AM_ERGUE = { passo: 0.12, andadura: 0.16, trote: 0.22, "meio-galope": 0.26, galope: 0.3, "galope-fuga": 0.34, esgueirar: 0.1 };
/* parâmetros de uma andadura (para misturar duas nas transições) */
function amParams(marcha) { const M = AM_MARCHAS[marcha] || AM_MARCHAS.passo; return { fase: Object.assign({}, M.fase), duty: M.duty, D: AM_DELTA(M), lift: AM_ERGUE[marcha] ?? 0.15, bal: /galope/.test(marcha) ? M.balanco || 0 : 0, Y: M.baixo ? -0.8 : -0.99, bob: marcha === "passo" ? 4 : 3, rabo: /galope/.test(marcha) ? 25 : marcha === "trote" || marcha === "andadura" ? 12 : 0, baixo: !!M.baixo }; }
/* mistura de parâmetros: b = null é "parado" (sem passada) */
function amParamsMix(a, b, s) { const Z = x => Object.assign({}, x, { D: 0, lift: 0, bal: 0, bob: 0, rabo: 0 }), A = a || Z(b), B = b || Z(a), L = (x, y) => x + (y - x) * s, f = {};
  for (const k of Object.keys(A.fase)) { let d = (B.fase[k] ?? A.fase[k]) - A.fase[k]; d = ((d + 0.5) % 1 + 1) % 1 - 0.5; f[k] = A.fase[k] + d * s; }
  return { fase: f, duty: L(A.duty, B.duty), D: L(A.D, B.D), lift: L(A.lift, B.lift), bal: L(A.bal, B.bal), Y: L(A.Y, B.Y), bob: L(A.bob, B.bob), rabo: L(A.rabo, B.rabo), baixo: s < 0.5 ? A.baixo : B.baixo }; }
/* pose a partir dos parâmetros: casco de apoio anda reto para trás na altura do chão; o de voo sobe num arco */
function amPoseGait(G, fase, base, especie) { const P = base ? JSON.parse(JSON.stringify(base)) : qdPosePadrao(); P.pernas = P.pernas || {};
  const E = QD_ESPECIES[qdEspecie(especie) || "cavalo"], cL = E.c / Math.max(0.2, E.h - E.w * 0.725);
  P.pescoco = (P.pescoco || 0) + Math.sin(fase * Math.PI * 4) * G.bob - (G.baixo ? 22 : 0);
  P.corpoInclina = (base && base.corpoInclina || 0) + Math.sin(fase * Math.PI * 2) * G.bal; P.rabo = (P.rabo || 0) + G.rabo - (G.baixo ? 15 : 0);
  for (const [l, f0] of Object.entries(G.fase)) { const p = ((fase + 1 - f0) % 1 + 1) % 1, tp = l[0] === "d" ? "d" : "t", z0 = AM_Z0[tp], dyHip = tp === "d" ? 0.84 * cL * Math.sin(P.corpoInclina * Math.PI / 180) : 0; let z, y, a3 = 0;
    if (p < G.duty) { z = z0 + G.D * (1 - 2 * p / G.duty); y = G.Y - dyHip; }
    else { const s = (p - G.duty) / (1 - G.duty), sm = s * s * (3 - 2 * s); z = z0 - G.D + 2 * G.D * sm; y = G.Y - dyHip + G.lift * Math.sin(Math.PI * s); a3 = (tp === "d" ? -35 : -20) * Math.sin(Math.PI * s) * Math.min(1, G.lift / 0.1); }
    const g = amIK(tp, z, y, a3); P.pernas[l] = [g[0] - P.corpoInclina, g[1], g[2]]; }
  P.alturaPerna = -G.Y; return P; }
/* pose da marcha numa fase do ciclo (0..1); especie: para compensar a inclinação do corpo no galope */
function amPoseMarcha(marcha, fase, base, especie) { return amPoseGait(amParams(marcha), fase, base, especie); }
/* ===== criar e achar ===== */
function amAchar(nome) { return SCN.objetos.find(o => o.tipo === "animal" && o.nome === nome) || null; }
function amCriar(nome, especie, o = {}) {
  const esp = qdEspecie(especie); if (!esp) throw new Error("Animal “" + especie + "” não existe. Há: " + Object.keys(QD_ESPECIES).join(", ") + ".");
  const escala = o.escala || 1, md = qdMedidas(esp, escala), E = QD_ESPECIES[esp];
  let q = amAchar(nome);
  if (!q) q = adicionarObjeto("animal", { x: o.x || 0, z: o.z || 0, giro: o.giro || 0, larg: Math.min(60000, md.larg), prof: Math.min(60000, md.prof), alt: Math.min(30000, md.alt), nome: String(nome).slice(0, 24) });
  q.animal = Object.assign({ especie: esp, escala, pose: amPose("parado", esp), sela: !!o.sela }, q.animal || {}, { especie: esp, escala });
  const cor = o.cor || E.cor; if (cor && /^#[0-9a-f]{6}$/i.test(cor)) q.col = { fill: cor, ink: "#2a2420" };
  q.emAr = true; q.base = 0; q.sobre = null; return q;
}
/* ===== montaria ===== */
/* pose de montado: sentado com as pernas abertas em volta do lombo, mãos à frente (rédeas) */
const AM_MONTADO = { hipFlexL: 72, hipFlexR: 72, hipAbdL: 28, hipAbdR: 28, kneeFlexL: 78, kneeFlexR: 78, ankleFlexL: -8, ankleFlexR: -8, armFlexL: 32, armFlexR: 32, elbowL: 62, elbowR: 62, armAbdL: 6, armAbdR: 6, handCurlL: 0.75, handCurlR: 0.75, spineFlex: 6 };
/* postura do cavaleiro por tipo de corpo: [inclinação do tronco, quadril, joelho, braços à frente, cotovelo, inclinação extra na velocidade] */
const AM_POSTURA = { quadrupede: [6, 72, 78, 32, 62, 1], alado: [24, 62, 98, 55, 45, 1.3], dragao: [30, 58, 104, 62, 40, 1.4], teropode: [16, 68, 90, 40, 55, 1.2], reptil: [20, 66, 96, 44, 50, 1],
  serpente: [26, 64, 104, 58, 40, 1], peixe: [52, 30, 40, 85, 25, 0.6], cetaceo: [48, 32, 44, 82, 28, 0.6], cefalopode: [18, 70, 95, 50, 50, 0.8], artropode: [22, 92, 112, 42, 58, 1], anfibio: [18, 74, 92, 40, 55, 1], primata: [8, 82, 70, 70, 80, 1], ave: [24, 64, 96, 50, 48, 1.2] };
function amPostura(o) { const E = QD_ESPECIES[qdEspecie(o.animal.especie)] || {}; if (E.classe === "criatura") return AM_POSTURA[E.plano] || AM_POSTURA.reptil; if (qdEhAve(o)) return AM_POSTURA.ave; return E.asas ? AM_POSTURA.alado : AM_POSTURA.quadrupede; }
/* quanto o animal anda/voa/nada agora (0 parado … 1 correndo/mergulhando): vem da andadura (quadrúpede) ou do nome da animação (criatura, ave) */
function amVelocidade(o) { const m = o.animal.marchaAtual || "", an = o.animal.animAtual || ""; if (/galope|fuga/.test(m) || /correr|galopa|mergulh|bote|investida/.test(an)) return 1; if (m === "trote" || m === "meio-galope" || /nadar|voar|planar|decolar|serpentear|rastejar|pousar/.test(an)) return 0.6; if (m || /andar|passo/.test(an)) return 0.3; return 0; }
function amAssentar(it, o, g0, soPernas) { /* põe a pessoa sentada na sela do animal (posição, giro e altura); soPernas = mantém os braços (acenar a cavalo) */
  const s = qdPontoMundo(o, "sela", g0), tam = it.params.tamanho || 1, [inc, hf, kf, af, el, kv] = amPostura(o);
  /* abertura das pernas pela largura do lombo (crocodilo, dragão e baleia abrem mais; cobra e cavalo menos) */
  const larg = Math.min(o.larg || 5, o.alt || 5) * 0.5 / tam, abd = Math.max(16, Math.min(70, Math.asin(Math.min(0.95, larg / 4.6)) * 180 / Math.PI + 10));
  const P = { hipFlexL: hf, hipFlexR: hf, hipAbdL: abd, hipAbdR: abd, kneeFlexL: kf, kneeFlexR: kf, ankleFlexL: -8, ankleFlexR: -8, armFlexL: af, armFlexR: af, elbowL: el, elbowR: el, armAbdL: 6, armAbdR: 6, handCurlL: 0.75, handCurlR: 0.75 };
  for (const [k, v] of Object.entries(P)) if (!soPernas || /^(hip|knee|ankle)/.test(k)) it.params[k] = v; it.params.wx = s[0]; it.params.wz = s[2]; it.params.wRot = o.giro || 0; it.params.ground = 0; it.params.bodyLift = 0;
  /* o cavaleiro reage à velocidade e ao animal: inclina à frente no galope, no mergulho e no voo, acompanha o empinar; balança com o passo */
  const pz = o.animal.pose || {}, v = amVelocidade(o), fase = (pz.fase || 0) * Math.PI * 2, lean = inc + v * 22 * kv + ((pz.voo || 0) > 0.05 ? 10 : 0) + Math.max(0, (pz.corpoInclina || 0)) * 0.6 + Math.sin(fase) * 4 * v;
  it.params.spineFlex = Math.min(70, lean); it.params.spineSide = Math.sin(fase) * 3 * v; it.params.neckFlex = -Math.min(70, lean) * 0.45; it.params.headPitch = -Math.min(70, lean) * 0.35;
  /* o assento (parte de baixo da pelve) encosta na sela (depois da postura: inclinar muda a altura da pelve) */
  try { const cs = capsulas(pMundo(it)), L = cs.caps || cs, pel = L.find(c => c.nome === "pelve"); const yA = pel ? Math.min(pel.a[1], pel.b[1]) - (pel.r || 0) * 0.7 : null; if (yA !== null) it.params.bodyLift = (s[1] - yA) / tam; } catch (e) { }
  it.apoioEm = o.id; it.montadoEm = o.nome; o.animal.cavaleiro = it.name; o.animal.sela = true; }
function amChao() { const it = SCN.list.find(x => x.name !== "__vazio__") || SCN.list[0]; try { return it ? restGround(SCN.list[0].params) : 0; } catch (e) { return 0; } }
/* depois de mexer nos animais: cavaleiros acompanham a sela, carga acompanha o lombo */
function amAtualizarMontaria() {
  const g0 = amChaoMundo();
  for (const o of SCN.objetos) { if (o.tipo !== "animal" || !o.animal) continue;
    if (o.animal.cavaleiro) { const it = SCN.list.find(x => x.name === o.animal.cavaleiro && x.montadoEm === o.nome); if (it) amAssentar(it, o, g0, true); else o.animal.cavaleiro = null; }
    if (o.animal.carga) { const c = SCN.objetos.find(x => x.nome === o.animal.carga); if (c) { const p = qdPontoMundo(o, "costas", g0); c.x = p[0]; c.z = p[2]; c.base = p[1] - g0; c.emAr = true; c.giro = o.giro || 0; c.sobre = null; } } } }
/* altura do chão do mundo (y) em R: onde os pés de uma pessoa em pé encostam */
function amChaoMundo() { try { const it = SCN.list.find(x => x.name !== "__vazio__" && !x.oculto) || SCN.list[0]; const p = Object.assign({}, it.params, { bodyLift: 0, ground: 1, bodyPitch: 0, bodyRoll: 0 }); const cs = capsulas(pMundo(it, p)), L = cs.caps || cs; return Math.min(...L.map(c => Math.min(c.a[1], c.b[1]) - (c.r || 0))); } catch (e) { return -15.1; } }
/* pontos do animal para a câmera (como cfPessoa): cabeça, olhos, centro, frente, chão */
function amPontos(nome) { const o = amAchar(nome); if (!o) return null; const g0 = amChaoMundo(), cab = qdPontoMundo(o, "cabeca", g0), sela = qdPontoMundo(o, "sela", g0), g = (o.giro || 0) * Math.PI / 180, fr = [Math.sin(g), Math.cos(g)];
  return { cabeca: cab, olhos: cab, olhar: [fr[0], 0, fr[1]], peito: sela, centro: sela, frente: fr, chao: g0, animal: true, tam: Math.max(o.alt || 0, o.larg || 0, o.prof || 0, (sela[1] - g0) * 1.6) }; }
/* dá para montar? a sela precisa estar a ≥ 0,55 m do chão (abaixo disso a pessoa esmaga o animal); devolve {ok, alturaSela (m), escalaMin} */
/* TAMANHO MONSTRO ("King Kong"): comprimento típico de um monstro de cada plano corporal, em metros — o humano vira um inseto ao lado */
const AM_MONSTRO_M = { serpente: 60, peixe: 30, cetaceo: 45, artropode: 15, cefalopode: 40, reptil: 30, teropode: 30, dragao: 60, primata: 18, anfibio: 12, ave: 15, quadrupede: 25 };
const AM_ESC_MAX = 5000;
function amEscalaMonstro(especie, metros) { const k = qdEspecie(especie), E = QD_ESPECIES[k] || {}, L = E.L || E.c || 1.5, pl = E.plano || (E.classe === "ave" ? "ave" : "quadrupede");
  return Math.max(0.01, Math.min(AM_ESC_MAX, (metros || AM_MONSTRO_M[pl] || 25) / L)); }
function amMontavel(o) { const g0 = amChaoMundo(), sela = qdPontoMundo(o, "sela", g0), h = (sela[1] - g0) * 0.114, esc = o.animal.escala || 1, min = qdEhAve(o) ? 0.85 : 0.55, E = QD_ESPECIES[qdEspecie(o.animal.especie)] || {}, Lm = (E.L || E.c || 1.5) * esc;
  /* também precisa ter COMPRIMENTO para a pessoa (pelo menos 1,1 m de lombo) */
  /* e LARGURA de lombo (raio do corpo): um bicho fino demais (lagarto, cobra, polvo) não dá apoio às pernas */
  const Rm = E.R ? E.R * esc : 1, Rmin = E.plano === "cefalopode" ? 0.3 : E.plano === "serpente" || E.plano === "artropode" ? 0.16 : 0.2;
  const Lmin = qdEhAve(o) ? 1.6 : 1.1, kH = h > 0 ? min / h : 99, kL = Lm > 0 ? Lmin / Lm : 99, kR = E.R ? Rmin / Rm : 0, k = Math.max(kH, kL, kR);
  return { ok: h >= min && Lm >= Lmin && (!E.R || Rm >= Rmin), alturaSela: h, escalaMin: Math.min(100, Math.ceil(esc * k * 1.08 * 10) / 10) }; }
export { amEscalaMonstro, AM_MONSTRO_M, AM_ESC_MAX, amMontavel, CR_POSES, amEhCriatura, AV_POSES, amEhAve, amParams, amParamsMix, amPoseGait, AM_POSES, AM_MARCHAS, AM_SIN_MARCHA, AM_MONTADO, amPose, amMisturar, amPoseMarcha, amPerna, amPassada, amCiclo, amAchar, amCriar, amAssentar, amAtualizarMontaria, amChaoMundo, amPontos, amChao };
void qdEsqueleto;
