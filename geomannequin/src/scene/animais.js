/* GeoMannequin — animais quadrúpedes na cena: criar (espécie, escala, cor), poses (parado, deitado, sentado, empinado, comendo…),
   marchas com os cascos plantados (passo, trote, galope: a passada sai do comprimento da perna), montaria (a pessoa senta na sela e
   acompanha o balanço), carga no lombo e seguir alguém. O animal é um objeto composto (tipo "animal") com o.animal = { especie,
   escala, pose, sela, cavaleiro, carga }. Ângulos em graus; distâncias em metros (1 R ≈ 0,114 m). */
import { SCN } from "./modelo.js";
import { adicionarObjeto } from "./cenario.js";
import { pMundo } from "./colisoes.js";
import { capsulas, QD_ESPECIES, qdEspecie, qdPosePadrao, qdPontoMundo, qdMedidas, qdEsqueleto, restGround } from "../engine/index.js";

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
  galope: { fase: { te: 0, td: 0.1, de: 0.36, dd: 0.46 }, duty: 0.36, A: 30, K: 100, T: 0.55, balanco: 6 }
};
const AM_SIN_MARCHA = { anda: "passo", andar: "passo", caminha: "passo", trota: "trote", trotar: "trote", galopa: "galope", galopar: "galope", corre: "galope", correr: "galope" };
/* comprimento da perna (m) e passada por ciclo (m): o casco no chão anda para trás o mesmo que o corpo anda para a frente */
function amPerna(especie, escala = 1) { const E = QD_ESPECIES[qdEspecie(especie) || "cavalo"]; return Math.max(0.1, (E.h - E.w * 0.45 - E.w * 0.28) * escala); }
function amPassada(especie, escala, marcha) { const M = AM_MARCHAS[marcha] || AM_MARCHAS.passo, L = amPerna(especie, escala); return 2 * L * Math.sin(M.A * Math.PI / 180) / M.duty; }
function amCiclo(especie, escala, marcha) { const M = AM_MARCHAS[marcha] || AM_MARCHAS.passo, E = QD_ESPECIES[qdEspecie(especie) || "cavalo"]; return M.T * Math.sqrt(Math.max(0.05, E.h * escala) / 1.6); }
/* pose da marcha numa fase do ciclo (0..1) */
function amPoseMarcha(marcha, fase, base) {
  const M = AM_MARCHAS[marcha] || AM_MARCHAS.passo, P = base ? JSON.parse(JSON.stringify(base)) : qdPosePadrao(); P.pernas = P.pernas || {};
  for (const [l, f0] of Object.entries(M.fase)) { const p = ((fase + 1 - f0) % 1 + 1) % 1, b = P.pernas[l] || [0, 0, 0]; let a, k = 0, h = 0;
    if (p < M.duty) a = M.A - 2 * M.A * (p / M.duty);
    else { const s = (p - M.duty) / (1 - M.duty), sm = s * s * (3 - 2 * s); a = -M.A + 2 * M.A * sm; k = M.K * Math.sin(Math.PI * s); h = k * 0.45; }
    P.pernas[l] = [b[0] + a, b[1] - k, b[2] + h]; }
  P.pescoco = (P.pescoco || 0) + Math.sin(fase * Math.PI * 4) * (marcha === "passo" ? 4 : 3);
  P.corpoInclina = (P.corpoInclina || 0) + Math.sin(fase * Math.PI * 2) * (M.balanco || 0) * (marcha === "galope" ? 1 : 0);
  P.rabo = (P.rabo || 0) + (marcha === "galope" ? 25 : marcha === "trote" ? 12 : 0);
  return P; }
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
export { AM_POSES, AM_MARCHAS, AM_SIN_MARCHA, AM_MONTADO, amPose, amMisturar, amPoseMarcha, amPerna, amPassada, amCiclo, amAchar, amCriar, amAssentar, amAtualizarMontaria, amChaoMundo, amPontos, amChao };
void qdEsqueleto;
