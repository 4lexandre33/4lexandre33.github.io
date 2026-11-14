/* GeoMannequin — animais quadrúpedes na cena: criar (espécie, escala, cor), poses (parado, deitado, sentado, empinado, comendo…),
   marchas com os cascos plantados (passo, trote, galope: a passada sai do comprimento da perna), montaria (a pessoa senta na sela e
   acompanha o balanço), carga no lombo e seguir alguém. O animal é um objeto composto (tipo "animal") com o.animal = { especie,
   escala, pose, sela, cavaleiro, carga }. Ângulos em graus; distâncias em metros (1 R ≈ 0,114 m). */
import { SCN } from "./modelo.js";
import { adicionarObjeto } from "./cenario.js";
import { pMundo } from "./colisoes.js";
import { capsulas, QD_ESPECIES, QD_KT, qdEspecie, qdPosePadrao, qdPontoMundo, qdMedidas, qdEsqueleto, restGround } from "../engine/index.js";

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
  uivando: { sentado: 1, corpoInclina: 32, pescoco: 50, cabeca: 45, pernas: { de: [-30, 0, 0], dd: [-30, 0, 0], te: [70, -150, 60], td: [70, -150, 60] } }
};
const AM_SIN_POSE = { "em-pe": "parado", empe: "parado", "em pé": "parado", deitada: "deitado", sentada: "sentado", empinada: "empinado", come: "comendo", pastando: "comendo", pasta: "comendo" };
function amPose(nome) { const n = String(nome || "parado").toLowerCase(); const p = AM_POSES[n] || AM_POSES[AM_SIN_POSE[n]]; if (!p) return null; return amMisturar(qdPosePadrao(), p, 1); }
/* mistura de poses (para transições suaves): a + (b − a)·u, inclusive as pernas */
function amMisturar(a, b, u) { const r = JSON.parse(JSON.stringify(a)), P0 = qdPosePadrao();
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
  if (!q) q = adicionarObjeto("animal", { x: o.x || 0, z: o.z || 0, giro: o.giro || 0, larg: Math.min(6000, md.larg), prof: Math.min(6000, md.prof), alt: Math.min(3000, md.alt), nome: String(nome).slice(0, 24) });
  q.animal = Object.assign({ especie: esp, escala, pose: amPose("parado"), sela: !!o.sela }, q.animal || {}, { especie: esp, escala });
  const cor = o.cor || E.cor; if (cor && /^#[0-9a-f]{6}$/i.test(cor)) q.col = { fill: cor, ink: "#2a2420" };
  q.emAr = true; q.base = 0; q.sobre = null; return q;
}
/* ===== montaria ===== */
/* pose de montado: sentado com as pernas abertas em volta do lombo, mãos à frente (rédeas) */
const AM_MONTADO = { hipFlexL: 72, hipFlexR: 72, hipAbdL: 28, hipAbdR: 28, kneeFlexL: 78, kneeFlexR: 78, ankleFlexL: -8, ankleFlexR: -8, armFlexL: 32, armFlexR: 32, elbowL: 62, elbowR: 62, armAbdL: 6, armAbdR: 6, handCurlL: 0.75, handCurlR: 0.75, spineFlex: 6 };
function amAssentar(it, o, g0, soPernas) { /* põe a pessoa sentada na sela do animal (posição, giro e altura); soPernas = mantém os braços (acenar a cavalo) */
  const s = qdPontoMundo(o, "sela", g0), tam = it.params.tamanho || 1; for (const [k, v] of Object.entries(AM_MONTADO)) if (!soPernas || /^(hip|knee|ankle)/.test(k)) it.params[k] = v; it.params.wx = s[0]; it.params.wz = s[2]; it.params.wRot = o.giro || 0; it.params.ground = 0; it.params.bodyLift = 0;
  /* o assento (parte de baixo da pelve) encosta na sela */
  try { const cs = capsulas(pMundo(it)), L = cs.caps || cs, pel = L.find(c => c.nome === "pelve"); const yA = pel ? Math.min(pel.a[1], pel.b[1]) - (pel.r || 0) * 0.7 : null; if (yA !== null) it.params.bodyLift = (s[1] - yA) / tam; } catch (e) { }
  /* o cavaleiro reage à andadura: inclina à frente no galope (e mais no salto), acompanha o empinar */
  const pz = o.animal.pose || {}, m = o.animal.marchaAtual || "", lean = (/galope/.test(m) ? 22 : m === "trote" || m === "meio-galope" ? 10 : 0) + ((pz.voo || 0) > 0.05 ? 18 : 0) + Math.max(0, (pz.corpoInclina || 0)) * 0.6;
  it.params.spineFlex = 6 + lean; if (lean) { it.params.neckFlex = -lean * 0.4; it.params.headPitch = -lean * 0.3; }
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
  return { cabeca: cab, olhos: cab, olhar: [fr[0], 0, fr[1]], peito: sela, centro: sela, frente: fr, chao: g0, animal: true }; }
export { amParams, amParamsMix, amPoseGait, AM_POSES, AM_MARCHAS, AM_SIN_MARCHA, AM_MONTADO, amPose, amMisturar, amPoseMarcha, amPerna, amPassada, amCiclo, amAchar, amCriar, amAssentar, amAtualizarMontaria, amChaoMundo, amPontos, amChao };
void qdEsqueleto;
