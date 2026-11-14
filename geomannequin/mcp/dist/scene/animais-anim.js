/* GeoMannequin — ANIMAÇÕES DOS ANIMAIS quadrúpedes: locomoção (todas as andaduras, ré, de lado, esgueirar), transições entre
   andaduras (acelerar, frear, arrancar), viradas (no lugar, em curva, pivô, rodopio), saltos (no lugar, à frente, obstáculo,
   pulo de gato) e ações (empinar, coice, deitar, sentar, rolar, sacudir, espreguiçar, comer, beber, latir, uivar, abanar o rabo…).
   Cada animação é GERADA para a espécie e a escala (a passada sai do comprimento da perna: casco plantado não escorrega).
   Formato: { nome, duracao, loop, relativa, pico, marcha, chaves: [{ t, pose, mover: { frente, lado, giro } }] }.
   pose: pose completa do animal (ou, com relativa, só o que soma à pose atual). mover em metros e graus, no sistema do animal no
   começo (frente = para onde olha; lado + = direita; giro + = vira para a esquerda, como nas pessoas). */
import { AM_MARCHAS, amPose, amMisturar, amPoseMarcha, amPassada, amCiclo, amPerna, amParams, amParamsMix, amPoseGait } from "./animais.js";
import { QD_ESPECIES, qdEspecie, qdPosePadrao, qdEsqueleto, qdPartes } from "../engine/index.js";

const AMA_SM = u => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
const AMA_CP = o => JSON.parse(JSON.stringify(o));
/* pose = base + valores absolutos (pernas: substitui a perna dada) */
function amaPose(nome, extra) { const b = amPose(nome) || amPose("parado"); if (!extra) return b; const r = AMA_CP(b); for (const [k, v] of Object.entries(extra)) { if (k === "pernas") { r.pernas = Object.assign({}, r.pernas, AMA_CP(v)); } else r[k] = v; } return r; }
/* soma de pose (relativa) */
function amaSomar(base, d) { const r = AMA_CP(base || qdPosePadrao()); for (const [k, v] of Object.entries(d || {})) { if (k === "pernas") { r.pernas = r.pernas || {}; for (const [l, a] of Object.entries(v)) { const b = r.pernas[l] || [0, 0, 0]; r.pernas[l] = [0, 1, 2].map(i => (b[i] || 0) + (a[i] || 0)); } } else r[k] = (r[k] || 0) + v; } return r; }
function amaContexto(especie, escala = 1) { const esp = qdEspecie(especie) || "cavalo", E = QD_ESPECIES[esp]; return { esp, esc: escala, E, h: E.h * escala, c: E.c * escala, L: amPerna(esp, escala) }; }

/* ===== geradores ===== */
/* ciclo de uma andadura: sentido −1 = de ré; lado = passo lateral (+ direita) */
function amaCiclo(cx, marcha, o = {}) { const S = amPassada(cx.esp, cx.esc, marcha), T = amCiclo(cx.esp, cx.esc, marcha) * (o.lento || 1), base = o.base || amPose("parado"), n = 16, ch = [], sent = o.sentido || 1;
  for (let i = 0; i <= n; i++) { const u = i / n; ch.push({ t: +(u * T).toFixed(4), pose: amPoseMarcha(marcha, sent > 0 ? u % 1 : (1 - u) % 1, base, cx.esp), mover: { frente: o.lado ? 0 : sent * S * u, lado: (o.lado || 0) * S * 0.45 * u, giro: 0 } }); }
  return { duracao: T, loop: true, marcha, passada: S, chaves: ch }; }
/* transição entre andaduras (ou para/de parado): a fase segue, a velocidade e a pose misturam suave */
function amaTransicao(cx, m1, m2, ciclos = 2, baseDe) { const base = amPose("parado"), Lp = amPerna(cx.esp, cx.esc), Tm = m => amCiclo(cx.esp, cx.esc, m || m1 || m2) * (m ? 1 : 1.3);
  const dur = ciclos * (Tm(m1) + Tm(m2)) / 2, n = Math.round(16 * ciclos), ch = []; let fase = 0, x = 0, tAnt = 0; const P1 = m1 ? amParams(m1) : null, P2 = m2 ? amParams(m2) : null;
  for (let i = 0; i <= n; i++) { const t = dur * i / n, s = AMA_SM(t / dur), dt = t - tAnt; tAnt = t; const T = Tm(m1) + (Tm(m2) - Tm(m1)) * s, G = amParamsMix(P1, P2, s); fase += dt / T; x += dt * (2 * G.D / G.duty * Lp) / T;
    ch.push({ t: +t.toFixed(4), pose: amPoseGait(G, fase % 1, baseDe ? baseDe(t / dur) : base, cx.esp), mover: { frente: x, lado: 0, giro: 0 } }); }
  return { duracao: dur, loop: false, marcha: m2 || m1, chaves: ch }; }
/* curva andando: o corpo gira ang graus ao longo de "ciclos" passadas, seguindo um arco */
function amaCurva(cx, marcha, ang, ciclos = 2) { const c1 = amaCiclo(cx, marcha), dur = c1.duracao * ciclos, Ltot = c1.passada * ciclos, n = 16 * ciclos, ch = [], a = Math.abs(ang) * Math.PI / 180, R = Ltot / a, sg = Math.sign(ang);
  for (let i = 0; i <= n; i++) { const u = i / n, th = a * u; ch.push({ t: +(dur * u).toFixed(4), pose: amPoseMarcha(marcha, (u * ciclos) % 1, amPose("parado"), cx.esp), mover: { frente: R * Math.sin(th), lado: -sg * R * (1 - Math.cos(th)), giro: ang * u } }); }
  return { duracao: dur, loop: false, marcha, chaves: ch }; }
/* virar no lugar: passinhos com as patas enquanto o corpo gira */
function amaVira(cx, ang, o = {}) { const dur = o.dur || Math.max(0.8, Math.abs(ang) / 90 * 0.9), n = Math.max(12, Math.round(dur * 16)), ch = [], base = amPose("parado"), passos = Math.max(2, Math.round(Math.abs(ang) / 45));
  for (let i = 0; i <= n; i++) { const u = i / n, ps = amPoseMarcha("passo", (u * passos * 0.5) % 1, base, cx.esp), p = amMisturar(base, ps, Math.sin(Math.PI * u) * 0.55 + 0.15 * (u > 0 && u < 1));
    if (o.pivo) { for (const l of ["te", "td"]) p.pernas[l] = base.pernas[l].slice(); p.corpoInclina = 8 * Math.sin(Math.PI * u); }
    if (o.cabeca) { p.cabecaGiro = Math.sign(ang) * 45 * Math.sin(Math.PI * Math.min(1, u * 1.3)); p.raboLado = -Math.sign(ang) * 30 * Math.sin(Math.PI * u); }
    /* gira em volta da anca (as patas de trás quase não saem do lugar) */ const th = ang * AMA_SM(u) * Math.PI / 180, rp = o.cabeca ? 0 : 0.42 * cx.c;
    ch.push({ t: +(dur * u).toFixed(4), pose: p, mover: { frente: -rp + rp * Math.cos(th), lado: -rp * Math.sin(th), giro: ang * AMA_SM(u) } }); }
  return { duracao: dur, loop: !!o.loop, chaves: ch }; }
/* animação por chaves [t, pose, mover?] */
function amaChaves(lista, o = {}) { let mv = { frente: 0, lado: 0, giro: 0 }; const ch = lista.map(([t, pose, m]) => { if (m) mv = Object.assign({}, mv, m); return { t, pose, mover: Object.assign({}, mv) }; });
  return Object.assign({ duracao: lista[lista.length - 1][0], loop: false, chaves: ch }, o); }

/* ===== a biblioteca (gerada por espécie e escala) ===== */
const AMA = {};
const amaDef = (nome, tags, descricao, gerar, extra) => { AMA[nome] = Object.assign({ nome, tags, descricao, gerar }, extra || {}); };
/* locomoção */
for (const [m, d] of [["passo", "passo (4 tempos)"], ["andadura", "andadura (pares do mesmo lado juntos)"], ["trote", "trote (diagonais juntas)"], ["meio-galope", "meio-galope / cânter (3 tempos)"], ["galope", "galope (com voo)"], ["galope-fuga", "galope de fuga (o mais rápido)"], ["esgueirar", "esgueirar (baixo e devagar: gato, lobo à espreita)"]])
  amaDef(m, ["Animal/Locomocao/" + (m === "esgueirar" ? "Esgueirar" : m === "passo" || m === "andadura" ? "Andar" : m === "trote" ? "Trote" : "Galope")], d + " — ciclo", cx => amaCiclo(cx, m), { ciclo: true });
amaDef("re", ["Animal/Locomocao/Re"], "anda de ré (passo para trás, mais lento)", cx => amaCiclo(cx, "passo", { sentido: -1, lento: 1.3 }), { ciclo: true });
amaDef("passo-lateral-direita", ["Animal/Locomocao/Lateral"], "passo de lado para a direita", cx => amaCiclo(cx, "passo", { lado: 1 }), { ciclo: true });
amaDef("passo-lateral-esquerda", ["Animal/Locomocao/Lateral"], "passo de lado para a esquerda", cx => amaCiclo(cx, "passo", { lado: -1 }), { ciclo: true });
/* transições */
for (const [a, b, n] of [["passo", "trote", "passo-para-trote"], ["trote", "galope", "trote-para-galope"], ["passo", "galope", "passo-para-galope"], ["galope", "trote", "galope-para-trote"], ["trote", "passo", "trote-para-passo"], ["galope", "galope-fuga", "galope-para-fuga"]])
  amaDef(n, ["Animal/Transicao/" + (AM_MARCHAS[b].T < AM_MARCHAS[a].T ? "Acelerar" : "Frear")], "de " + a + " para " + b + " (suave, sem trocar o pé)", cx => amaTransicao(cx, a, b, 2));
amaDef("arrancar-trote", ["Animal/Transicao/Arrancar"], "parado → trote", cx => amaTransicao(cx, null, "trote", 2));
amaDef("arrancar-galope", ["Animal/Transicao/Arrancar"], "parado → galope (arrancada)", cx => amaTransicao(cx, null, "galope", 2.5));
amaDef("parar", ["Animal/Transicao/Parar"], "passo → parado", cx => amaTransicao(cx, "passo", null, 1.5));
amaDef("frear-galope", ["Animal/Transicao/Parar"], "galope → parado (freada, o corpo vai para trás)", cx => amaTransicao(cx, "galope", null, 2.2, u => amaPose("parado", { corpoInclina: -9 * Math.sin(Math.PI * u), pescoco: 12 * Math.sin(Math.PI * u) })));
/* viradas */
amaDef("vira-esquerda", ["Animal/Virar/NoLugar"], "vira 90° para a esquerda no lugar", cx => amaVira(cx, 90));
amaDef("vira-direita", ["Animal/Virar/NoLugar"], "vira 90° para a direita no lugar", cx => amaVira(cx, -90));
amaDef("meia-volta", ["Animal/Virar/NoLugar"], "meia-volta (180°) no lugar", cx => amaVira(cx, 180, { dur: 1.6 }));
amaDef("pivo-traseiro", ["Animal/Virar/Pivo"], "gira 180° sobre as patas de trás (as da frente cruzam)", cx => amaVira(cx, 180, { pivo: true, dur: 1.2 }));
amaDef("rodopio", ["Animal/Virar/Rodopio"], "rodopia correndo atrás do rabo (360°, cachorro)", cx => amaVira(cx, 360, { cabeca: true, dur: 1.1, loop: true }), { ciclo: true });
for (const [m, nm] of [["passo", "curva"], ["trote", "curva-trote"], ["galope", "curva-galope"]]) for (const [lado, g] of [["esquerda", 90], ["direita", -90]])
  amaDef(nm + "-" + lado, ["Animal/Virar/Curva"], m + " fazendo uma curva de 90° para a " + lado, cx => amaCurva(cx, m, g, m === "galope" ? 3 : 2));
/* saltos */
amaDef("pulo-no-lugar", ["Animal/Saltar/NoLugar"], "pulo no lugar (agacha, sobe, cai)", cx => { const P0 = amPose("parado"), ag = amaPose("agachado"), ar = amaPose("parado", { voo: cx.h * 0.35, pernas: { de: [30, -70, 25], dd: [30, -70, 25], te: [-10, 20, 0], td: [-10, 20, 0] }, rabo: 20 });
  return amaChaves([[0, P0], [0.25, ag], [0.45, ar], [0.62, ar], [0.82, ag], [1.1, P0]], { pico: 0.53 }); });
amaDef("salto-frente", ["Animal/Saltar/Frente"], "salto para a frente (cachorro, gato, cervo)", cx => { const P0 = amPose("parado"), ag = amaPose("agachado", { corpoInclina: -6 }), sobe = amaPose("parado", { voo: cx.h * 0.25, corpoInclina: 18, pernas: { de: [55, -100, 30], dd: [55, -100, 30], te: [-45, 10, 10], td: [-45, 10, 10] } }), ar = amaPose("parado", { voo: cx.h * 0.4, pernas: { de: [-35, 0, 0], dd: [-35, 0, 0], te: [-50, 20, 10], td: [-50, 20, 10] }, rabo: 25 }), cai = amaPose("parado", { voo: 0.05, corpoInclina: -14, pernas: { de: [-20, 0, 0], dd: [-15, 0, 0], te: [40, -60, 20], td: [40, -60, 20] } });
  const D = cx.c * 1.8; return amaChaves([[0, P0], [0.22, ag, { frente: 0 }], [0.38, sobe, { frente: D * 0.2 }], [0.58, ar, { frente: D * 0.6 }], [0.76, cai, { frente: D * 0.95 }], [1.0, ag, { frente: D }], [1.25, P0, { frente: D }]], { pico: 0.58 }); });
amaDef("salto-obstaculo", ["Animal/Saltar/Obstaculo"], "salto de obstáculo (cavalo): chega, levanta a frente, voa encolhido, pousa a frente e depois a traseira", cx => { const g = p => amPoseMarcha("galope", p, amPose("parado"), cx.esp);
  const imp = amaPose("parado", { corpoInclina: 24, pescoco: -10, voo: cx.h * 0.08, pernas: { de: [70, -125, 35], dd: [65, -120, 35], te: [-25, 15, 5], td: [-30, 15, 5] } }), topo = amaPose("parado", { corpoInclina: 2, voo: cx.h * 0.5, pescoco: -18, pernas: { de: [75, -130, 40], dd: [75, -130, 40], te: [-40, 30, 0], td: [-40, 30, 0] }, rabo: 15 });
  const desce = amaPose("parado", { corpoInclina: -20, voo: cx.h * 0.22, pescoco: 6, pernas: { de: [-30, 0, 0], dd: [-25, 0, 0], te: [55, -80, 20], td: [55, -80, 20] } }), pousa = amaPose("parado", { corpoInclina: -12, pernas: { de: [-15, 0, 0], dd: [-5, 0, 0], te: [35, -50, 15], td: [30, -45, 15] } });
  const D = cx.c * 3.2; return amaChaves([[0, g(0)], [0.3, g(0.55), { frente: D * 0.2 }], [0.55, imp, { frente: D * 0.35 }], [0.85, topo, { frente: D * 0.6 }], [1.12, desce, { frente: D * 0.82 }], [1.3, pousa, { frente: D * 0.95 }], [1.6, g(0.3), { frente: D * 1.15 }]], { pico: 0.85, marcha: "galope" }); });
amaDef("pulo-gato", ["Animal/Saltar/Alto"], "pulo bem alto (gato subindo num muro)", cx => { const P0 = amPose("parado"), ag = amaPose("agachado", { pernas: { de: [15, -40, 20], dd: [15, -40, 20], te: [35, -60, 25], td: [35, -60, 25] } }), est = amaPose("parado", { voo: cx.h * 0.5, corpoInclina: 35, pernas: { de: [-60, 0, 0], dd: [-60, 0, 0], te: [-40, 10, 10], td: [-40, 10, 10] } }), topo = amaPose("parado", { voo: cx.h * 1.4, corpoInclina: 10, pernas: { de: [-30, -20, 0], dd: [-30, -20, 0], te: [40, -70, 30], td: [40, -70, 30] } });
  return amaChaves([[0, P0], [0.3, ag], [0.45, est, { frente: cx.c * 0.3 }], [0.75, topo, { frente: cx.c * 0.8 }], [0.95, topo, { frente: cx.c * 0.9 }]], { pico: 0.75, final: "fica no alto (ponha algo embaixo para ele pousar)" }); });
amaDef("assustar", ["Animal/Saltar/Susto", "Animal/Reagir"], "pulo de susto para o lado (refugar)", cx => { const P0 = amPose("parado"), s = amaPose("parado", { voo: cx.h * 0.12, corpoInclina: 12, pescoco: 25, cabecaGiro: 30, rabo: 30, pernas: { de: [25, -50, 20], dd: [10, -30, 10] } });
  return amaChaves([[0, P0], [0.15, s, { lado: 0.1 }], [0.35, amaPose("parado", { pescoco: 20, cabecaGiro: 40 }), { lado: cx.c * 0.5, giro: -25 }], [0.9, amaPose("atento"), { lado: cx.c * 0.55, giro: -25 }]], { pico: 0.15 }); });
/* ações */
const amaAcao = (nome, tags, d, f, ex) => amaDef(nome, tags, d, f, ex);
amaAcao("empinar", ["Animal/Acao/Empinar"], "empina (sobe a frente, pedala no ar e desce)", cx => { const P0 = amPose("parado"), e = amPose("empinado"), e2 = amaPose("empinado", { pernas: Object.assign({}, amPose("empinado").pernas, { de: [55, -110, 20], dd: [40, -95, 20] }) });
  return amaChaves([[0, P0], [0.5, e], [0.75, e2], [1.0, e], [1.25, e2], [1.75, P0]], { pico: 0.75 }); });
amaAcao("coice", ["Animal/Acao/Coice", "Animal/Combate"], "coice com as patas de trás", cx => amaChaves([[0, amPose("parado")], [0.2, amaPose("parado", { corpoInclina: -8, pernas: { te: [20, -50, 10], td: [20, -50, 10] } })], [0.4, amPose("coice")], [0.9, amPose("parado")]], { pico: 0.4 }));
amaAcao("deitar", ["Animal/Postura/Deitar"], "deita (dobra a frente, depois a traseira)", cx => amaChaves([[0, amPose("parado")], [0.5, amaPose("parado", { corpoInclina: -12, pernas: { de: [60, -130, 40], dd: [60, -130, 40] } })], [1.0, amaPose("deitado", { corpoInclina: -5 })], [1.4, amPose("deitado")]], { final: "deitado" }));
amaAcao("levantar", ["Animal/Postura/Levantar"], "levanta de deitado (a frente primeiro)", cx => amaChaves([[0, amPose("deitado")], [0.45, amaPose("parado", { corpoInclina: 14, pernas: { te: [80, -120, 50], td: [80, -120, 50] } })], [0.9, amaPose("parado", { corpoInclina: 4 })], [1.2, amPose("parado")]]));
amaAcao("sentar", ["Animal/Postura/Sentar"], "senta (cachorro, gato)", cx => amaChaves([[0, amPose("parado")], [0.6, amaPose("sentado", { corpoInclina: 20 })], [1.0, amPose("sentado")]], { final: "sentado" }));
amaAcao("levantar-sentado", ["Animal/Postura/Levantar"], "levanta de sentado", cx => amaChaves([[0, amPose("sentado")], [0.5, amaPose("parado", { corpoInclina: 10 })], [0.8, amPose("parado")]]));
amaAcao("deitar-de-lado", ["Animal/Postura/Deitar"], "deita e vira de lado (descansando)", cx => amaChaves([[0, amPose("deitado")], [0.8, amaPose("deitado", { rolo: 50 })], [1.3, amaPose("deitado", { rolo: 88, pernas: { de: [20, -20, 0], dd: [30, -30, 0], te: [30, -40, 10], td: [40, -40, 10] } })]], { final: "de lado" }));
amaAcao("rolar", ["Animal/Acao/Rolar"], "rola no chão (deitado, vira de costas e volta)", cx => { const d = amPose("deitado"), pt = { de: [60, -100, 40], dd: [60, -100, 40], te: [70, -110, 40], td: [70, -110, 40] };
  return amaChaves([[0, d], [0.5, amaPose("deitado", { rolo: 90, pernas: pt })], [0.9, amaPose("deitado", { rolo: 175, pernas: pt })], [1.3, amaPose("deitado", { rolo: 180, pernas: { de: [50, -120, 30], dd: [70, -90, 30], te: [60, -120, 40], td: [80, -100, 40] } })], [1.8, amaPose("deitado", { rolo: 90, pernas: pt })], [2.3, d]], { pico: 1.1 }); });
amaAcao("sacudir", ["Animal/Acao/Sacudir"], "sacode o corpo (cachorro molhado)", cx => { const L = []; for (let i = 0; i <= 10; i++) L.push([i * 0.09, { rolo: (i % 2 ? 1 : -1) * (i && i < 10 ? 14 : 0), cabecaGiro: (i % 2 ? -1 : 1) * (i && i < 10 ? 30 : 0), raboLado: (i % 2 ? 1 : -1) * 30 }]); return amaChaves(L, { relativa: true, pico: 0.45 }); });
amaAcao("espreguicar", ["Animal/Acao/Espreguicar"], "espreguiça (estica a frente e abaixa o peito)", cx => amaChaves([[0, amPose("parado")], [0.7, amaPose("parado", { corpoInclina: -16, pescoco: -10, rabo: 30, pernas: { de: [-40, 10, 10], dd: [-40, 10, 10], te: [-10, 0, 0], td: [-10, 0, 0] } })], [1.6, amaPose("parado", { corpoInclina: -16, pescoco: -10, rabo: 30, pernas: { de: [-40, 10, 10], dd: [-40, 10, 10] } })], [2.2, amPose("parado")]], { pico: 1.0 }));
amaAcao("bocejar", ["Animal/Acao/Bocejar"], "boceja (cabeça para cima)", cx => amaChaves([[0, {}], [0.5, { pescoco: 15, cabeca: 35 }], [1.0, { pescoco: 15, cabeca: 35 }], [1.4, {}]], { relativa: true, pico: 0.7 }));
amaAcao("cheirar", ["Animal/Acao/Cheirar"], "cheira o chão (procura um rastro)", cx => { const L = [[0, {}]]; for (let i = 1; i <= 6; i++) L.push([i * 0.3, { pescoco: -60, cabeca: -20, cabecaGiro: (i % 2 ? 18 : -18) }]); L.push([2.1, {}]); return amaChaves(L, { relativa: true, pico: 0.9 }); }, { ciclo: true });
amaAcao("comer", ["Animal/Acao/Comer"], "come / pasta (abaixa e mastiga)", cx => amaChaves([[0, amPose("comendo")], [0.4, amaPose("comendo", { cabeca: -24 })], [0.8, amPose("comendo")], [1.2, amaPose("comendo", { cabeca: -24 })], [1.6, amPose("comendo")]], { loop: true }), { ciclo: true });
amaAcao("beber", ["Animal/Acao/Beber"], "bebe água (pescoço baixo, parado)", cx => amaChaves([[0, amPose("parado")], [0.8, amaPose("comendo", { pescoco: -85, cabeca: -40, pernas: { de: [-10, 0, 0], dd: [12, -20, 5] } })], [3.0, amaPose("comendo", { pescoco: -85, cabeca: -36, pernas: { de: [-10, 0, 0], dd: [12, -20, 5] } })]], { final: "bebendo" }));
amaAcao("uivar", ["Animal/Acao/Uivar", "Animal/Som"], "senta e uiva (lobo, cachorro)", cx => amaChaves([[0, amPose("parado")], [0.8, amPose("sentado")], [1.4, amPose("uivando")], [3.2, amaPose("uivando", { pescoco: 55 })]], { pico: 2.2, final: "uivando" }));
amaAcao("latir", ["Animal/Acao/Latir", "Animal/Som"], "late (cabeça dá trancos)", cx => amaChaves([[0, {}], [0.08, { cabeca: 16, pescoco: 6 }], [0.25, { cabeca: -4 }], [0.38, { cabeca: 16, pescoco: 6 }], [0.6, {}]], { relativa: true, loop: true, pico: 0.08 }), { ciclo: true });
amaAcao("relinchar", ["Animal/Acao/Relinchar", "Animal/Som"], "relincha (cabeça para cima, sacode)", cx => amaChaves([[0, {}], [0.35, { pescoco: 22, cabeca: 20, rabo: 20 }], [0.6, { pescoco: 22, cabeca: 20, cabecaGiro: 15, rabo: 20 }], [0.85, { pescoco: 22, cabeca: 20, cabecaGiro: -15, rabo: 20 }], [1.3, {}]], { relativa: true, pico: 0.6 }));
amaAcao("abanar-rabo", ["Animal/Acao/Rabo"], "abana o rabo (contente)", cx => amaChaves([[0, { rabo: 30, raboLado: 35 }], [0.15, { rabo: 30, raboLado: -35 }], [0.3, { rabo: 30, raboLado: 35 }]], { relativa: true, loop: true }), { ciclo: true });
amaAcao("cocar", ["Animal/Acao/Cocar"], "coça a orelha com a pata de trás (sentado)", cx => { const s = amPose("sentado"), L = [[0, s]]; for (let i = 1; i <= 6; i++) L.push([i * 0.14, amaPose("sentado", { cabecaGiro: 25, cabeca: -10, rolo: 8, pernas: Object.assign({}, s.pernas, { te: [i % 2 ? 110 : 90, i % 2 ? -100 : -80, 40] }) })]); L.push([1.1, s]); return amaChaves(L, { pico: 0.5 }); });
amaAcao("patear", ["Animal/Acao/Patear"], "bate a pata da frente no chão (impaciente)", cx => amaChaves([[0, {}], [0.2, { pernas: { de: [30, -70, 20] } }], [0.35, {}], [0.55, { pernas: { de: [30, -70, 20] } }], [0.7, {}]], { relativa: true, loop: true, pico: 0.2 }), { ciclo: true });
amaAcao("cabecada", ["Animal/Acao/Cabecada", "Animal/Combate"], "dá uma cabeçada para a frente (bode, boi)", cx => amaChaves([[0, amPose("parado")], [0.35, amaPose("parado", { pescoco: -30, cabeca: -15, corpoInclina: -4 }), { frente: -0.1 }], [0.55, amaPose("parado", { pescoco: -5, cabeca: -25, corpoInclina: -8, pernas: { te: [-25, 10, 0], td: [-25, 10, 0] } }), { frente: cx.c * 0.35 }], [0.95, amPose("parado"), { frente: cx.c * 0.3 }]], { pico: 0.55 }));
amaAcao("recuar-assustado", ["Animal/Reagir/Recuar"], "recua assustado (cabeça alta, dá passos para trás)", cx => { const r = amaPose("parado", { pescoco: 25, cabeca: 10, corpoInclina: 8, rabo: 25 }), g = p => amaSomar(r, { pernas: amPoseMarcha("passo", p, qdPosePadrao(), cx.esp).pernas });
  return amaChaves([[0, amPose("parado")], [0.25, r, { frente: -0.05 }], [0.5, g(0.75), { frente: -cx.c * 0.25 }], [0.75, g(0.5), { frente: -cx.c * 0.45 }], [1.0, g(0.25), { frente: -cx.c * 0.6 }], [1.3, r, { frente: -cx.c * 0.65 }]], { pico: 0.3 }); });
amaAcao("olhar-em-volta", ["Animal/Acao/Olhar"], "olha em volta (atento)", cx => amaChaves([[0, {}], [0.6, { pescoco: 10, cabecaGiro: -55 }], [1.3, { pescoco: 10, cabecaGiro: -55 }], [2.0, { pescoco: 10, cabecaGiro: 55 }], [2.6, { pescoco: 10, cabecaGiro: 55 }], [3.2, {}]], { relativa: true, pico: 1.0 }), { ciclo: true });
amaAcao("respirar", ["Animal/Espera"], "espera viva (respira, mexe o rabo e a cabeça)", cx => amaChaves([[0, {}], [1.2, { pescoco: 2, rabo: 4, raboLado: 6 }], [2.4, { pescoco: -1, cabecaGiro: 6, raboLado: -6 }], [3.6, {}]], { relativa: true, loop: true }), { ciclo: true });
amaAcao("ataque-mordida", ["Animal/Combate/Mordida"], "avança e morde (lobo, cachorro)", cx => amaChaves([[0, amaPose("agachado", { pescoco: -15 })], [0.25, amaPose("parado", { corpoInclina: 10, pescoco: -5, cabeca: 15, voo: cx.h * 0.15, pernas: { de: [-35, 0, 0], dd: [-35, 0, 0], te: [-40, 15, 5], td: [-40, 15, 5] } }), { frente: cx.c * 0.6 }], [0.45, amaPose("parado", { pescoco: -10, cabeca: -10 }), { frente: cx.c * 0.9 }], [0.8, amaPose("agachado", { pescoco: -15 }), { frente: cx.c * 0.9 }]], { pico: 0.25 }));
amaAcao("rosnar", ["Animal/Combate/Ameaca"], "rosna (agachado, cabeça baixa, pronto para atacar)", cx => amaChaves([[0, amPose("parado")], [0.5, amaPose("agachado", { pescoco: -20, cabeca: 5, rabo: -20 })], [1.5, amaPose("agachado", { pescoco: -22, cabeca: 8, rabo: -20 })]], { final: "ameaçando" }));

/* ===== usar ===== */
const AMA_CACHE = new Map();
function animacaoAnimal(nome, especie, escala = 1) { const d = AMA[nome]; if (!d) return null; const k = nome + "|" + (qdEspecie(especie) || "cavalo") + "|" + (+escala).toFixed(3); if (AMA_CACHE.has(k)) return AMA_CACHE.get(k);
  const cx = amaContexto(especie, escala), a = Object.assign({ nome, tags: d.tags, descricao: d.descricao, especie: cx.esp, escala }, d.gerar(cx)); a.relativa = !!a.relativa; if (d.ciclo) a.loop = a.loop !== false; AMA_CACHE.set(k, a); return a; }
function listaAnimacoesAnimal() { return Object.values(AMA).map(d => ({ nome: d.nome, tags: d.tags, descricao: d.descricao, ciclo: !!d.ciclo })); }
/* amostra no tempo t: { pose (completa se base dada), mover } — nos ciclos o deslocamento acumula a cada volta */
function amaAmostrar(a, t, base) { const D = a.duracao; let n = 0, tt = t; if (a.loop) { n = Math.floor(t / D); tt = t - n * D; } else tt = Math.max(0, Math.min(D, t));
  const ch = a.chaves; let i = 0; while (i < ch.length - 2 && ch[i + 1].t < tt) i++; const c0 = ch[i], c1 = ch[Math.min(ch.length - 1, i + 1)], u = c1.t > c0.t ? Math.max(0, Math.min(1, (tt - c0.t) / (c1.t - c0.t))) : 1, us = a.loop || a.ciclo ? u : AMA_SM(u);
  const mix = (p, q) => a.relativa ? amaMisturarDelta(p, q, us) : amMisturar(p, q, us);
  const pose = mix(c0.pose, c1.pose), fim = ch[ch.length - 1].mover, lerp = k => (c0.mover[k] || 0) + ((c1.mover[k] || 0) - (c0.mover[k] || 0)) * us;
  /* deslocamento acumulado das voltas: gira o sistema a cada volta (curvas em loop) */
  let fx = 0, lx = 0, g = 0; for (let k = 0; k < n; k++) { const r = g * Math.PI / 180; fx += fim.frente * Math.cos(r) + fim.lado * Math.sin(r); lx += -fim.frente * Math.sin(r) + fim.lado * Math.cos(r); g += fim.giro || 0; }
  const r = g * Math.PI / 180, f1 = lerp("frente"), l1 = lerp("lado"); const mover = { frente: fx + f1 * Math.cos(r) + l1 * Math.sin(r), lado: lx - f1 * Math.sin(r) + l1 * Math.cos(r), giro: g + lerp("giro") };
  return { pose: a.relativa ? amaSomar(base || amPose("parado"), pose) : pose, mover, delta: a.relativa ? pose : null }; }
function amaMisturarDelta(p, q, u) { const r = {}, ks = new Set([...Object.keys(p || {}), ...Object.keys(q || {})]); for (const k of ks) { if (k === "pernas") { r.pernas = {}; for (const l of new Set([...Object.keys((p || {}).pernas || {}), ...Object.keys((q || {}).pernas || {})])) { const a = ((p || {}).pernas || {})[l] || [0, 0, 0], b = ((q || {}).pernas || {})[l] || [0, 0, 0]; r.pernas[l] = [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * u); } } else r[k] = ((p || {})[k] || 0) + (((q || {})[k] || 0) - ((p || {})[k] || 0)) * u; } return r; }
/* sistema do animal → mundo (R): frente/lado em metros a partir de (x, z, giro) */
function amaNoMundo(de, mover, M) { const g = (de.giro || 0) * Math.PI / 180, f = [Math.sin(g), Math.cos(g)], dir = [-Math.cos(g), Math.sin(g)]; return { x: de.x + (f[0] * mover.frente + dir[0] * mover.lado) * M, z: de.z + (f[1] * mover.frente + dir[1] * mover.lado) * M, giro: (((de.giro || 0) + mover.giro) % 360 + 540) % 360 - 180 }; }
/* verbos do texto → animação */
const AMA_VERBOS = { pula: "pulo-no-lugar", pular: "pulo-no-lugar", salta: "salto-frente", saltar: "salto-frente", "salta-obstaculo": "salto-obstaculo", "pula-obstaculo": "salto-obstaculo", "pula-alto": "pulo-gato", "vira-esquerda": "vira-esquerda", "vira-direita": "vira-direita", "meia-volta": "meia-volta", "da-meia-volta": "meia-volta", pivota: "pivo-traseiro", rodopia: "rodopio", rola: "rolar", rolar: "rolar", sacode: "sacudir", "sacode-se": "sacudir", espreguica: "espreguicar", boceja: "bocejar", cheira: "cheirar", bebe: "beber", late: "latir", ladra: "latir", relincha: "relinchar", abana: "abanar-rabo", "abana-rabo": "abanar-rabo", coca: "cocar", "coca-se": "cocar", pateia: "patear", "da-cabecada": "cabecada", marra: "cabecada", recua: "recuar-assustado", "olha-em-volta": "olhar-em-volta", morde: "ataque-mordida", ataca: "ataque-mordida", rosna: "rosnar", assusta: "assustar", refuga: "assustar", "anda-de-re": "re", "da-re": "re", freia: "frear-galope", para: "parar", arranca: "arrancar-galope", "deita-de-lado": "deitar-de-lado" };
/* as poses-verbo viram animação no FILME (no quadro continuam pose) */
const AMA_POSE_ANIM = { empina: "empinar", deita: "deitar", senta: "sentar", come: "comer", pasta: "comer", uiva: "uivar", coice: "coice", "da-coice": "coice" };

/* auditor de cascos: casco apoiado (perto do chão) que anda na horizontal = escorrega (cm/s); casco abaixo do chão = afunda (cm) */
function amaAuditar(nome, especie = "cavalo", o = {}) { const a = animacaoAnimal(nome, especie, o.escala || 1); if (!a) throw new Error("Animação de animal “" + nome + "” não existe.");
  const M = 1 / 0.114, fps = o.fps || 60, dur = a.loop ? a.duracao * 2 : a.duracao, n = Math.max(2, Math.round(dur * fps)), de = { x: 0, z: 0, giro: 0, pose: amPose("parado") }; let prev = null, esc = 0, apoio = 0, afunda = 0;
  for (let i = 0; i <= n; i++) { const t = dur * i / n, sm = amaAmostrar(a, t, de.pose), p = amaNoMundo(de, sm.mover, M), ob = { tipo: "animal", x: p.x, z: p.z, giro: p.giro, animal: { especie, escala: o.escala || 1, pose: sm.pose } };
    if (sm.pose.voo || sm.pose.rolo || sm.pose.deitado || sm.pose.sentado) { prev = null; continue; }
    const S = qdEsqueleto(ob), dy = qdPartes(ob).dy || 0, g = p.giro * Math.PI / 180, c = Math.cos(g), sn = Math.sin(g);
    const cs = Object.fromEntries(Object.entries(S.pernas).map(([k, pts]) => { const v = pts[3]; return [k, [p.x + v[0] * c + v[2] * sn, v[1] + dy, p.z - v[0] * sn + v[2] * c]]; }));
    for (const v of Object.values(cs)) afunda = Math.min(afunda, (v[1] - 0.12) / M * 100);
    if (prev) for (const k of Object.keys(cs)) { const a1 = cs[k], a0 = prev[k]; const lim = 0.12 + Math.min(0.03 * M, 0.025 * S.Lp); if (a1[1] < lim && a0[1] < lim) { esc += Math.hypot(a1[0] - a0[0], a1[2] - a0[2]) / M * 100; apoio += 1 / fps; } }
    prev = cs; }
  return { nome, especie, escorregaCmS: apoio ? +(esc / apoio).toFixed(1) : 0, afundaCm: +afunda.toFixed(1) }; }
export { amaAuditar, AMA, AMA_VERBOS, AMA_POSE_ANIM, animacaoAnimal, listaAnimacoesAnimal, amaAmostrar, amaNoMundo, amaSomar, amaPose, amaContexto };
