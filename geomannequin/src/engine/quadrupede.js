/* GeoMannequin — manequim de QUADRÚPEDE, simplificado (cavalo, pônei, burro, camelo, dromedário, bode, ovelha, boi, cachorro,
   lobo, gato, cervo, elefante): tronco em cilindro com peito e anca arredondados, pescoço em cilindro, cabeça e focinho em caixas,
   orelhas, chifres/corcova/tromba opcionais, rabo, e 4 pernas de 3 segmentos (caixas) com juntas.
   Coordenadas locais do objeto (R ≈ 11,4 cm): x = lado (+ esquerda do animal), y = cima, z = FRENTE (para onde ele olha).
   Proporções: o.animal.p (metros); pose: o.animal.pose (graus). Tudo é recalculado do zero a cada desenho. */
const QM = 1 / 0.114, QD = Math.PI / 180;
/* a perna de trás (dobrada no jarrete) é um pouco mais comprida, para o casco chegar no mesmo chão que o da frente */
const QD_KT = 1 / (0.42 * Math.cos(14 * Math.PI / 180) + 0.38 * Math.cos(24 * Math.PI / 180) + 0.2);
/* espécies: medidas em metros — cernelha (altura), corpo (comprimento), largura, pescoço, ângulo do pescoço, cabeça, focinho,
   orelha, rabo, perna (espessura), corcova (0/1/2), chifre, tromba */
const QD_ESPECIES = {
  cavalo: { raboAng: -78, h: 1.6, c: 1.65, w: 0.58, n: 0.8, na: 52, cab: 0.6, foc: 0.25, ore: 0.15, rabo: 0.75, perna: 0.11, cor: "#8b5a3c", montaria: true },
  ponei: { raboAng: -75, h: 1.15, c: 1.15, w: 0.46, n: 0.55, na: 50, cab: 0.45, foc: 0.18, ore: 0.12, rabo: 0.55, perna: 0.09, cor: "#a77b52", montaria: true },
  burro: { raboAng: -72, h: 1.2, c: 1.15, w: 0.44, n: 0.5, na: 42, cab: 0.5, foc: 0.18, ore: 0.3, rabo: 0.5, perna: 0.08, cor: "#8d8580", montaria: true },
  camelo: { raboAng: -70, h: 1.95, c: 1.55, w: 0.55, n: 1.05, na: 28, cab: 0.5, foc: 0.18, ore: 0.08, rabo: 0.45, perna: 0.1, corcova: 2, cor: "#c49a62", montaria: true },
  dromedario: { raboAng: -70, h: 1.95, c: 1.55, w: 0.55, n: 1.05, na: 28, cab: 0.5, foc: 0.18, ore: 0.08, rabo: 0.45, perna: 0.1, corcova: 1, cor: "#c9a06a", montaria: true },
  bode: { raboAng: 30, h: 0.78, c: 0.85, w: 0.32, n: 0.32, na: 55, cab: 0.3, foc: 0.1, ore: 0.12, rabo: 0.12, perna: 0.05, chifre: 0.28, cor: "#d8d2c8" },
  ovelha: { raboAng: -60, h: 0.72, c: 0.85, w: 0.48, n: 0.25, na: 40, cab: 0.28, foc: 0.08, ore: 0.1, rabo: 0.12, perna: 0.05, cor: "#efece4" },
  boi: { raboAng: -80, h: 1.45, c: 1.95, w: 0.72, n: 0.45, na: 15, cab: 0.55, foc: 0.18, ore: 0.15, rabo: 0.8, perna: 0.12, chifre: 0.35, cor: "#5e4a3e", montaria: true },
  cachorro: { raboAng: 20, h: 0.6, c: 0.72, w: 0.27, n: 0.25, na: 48, cab: 0.26, foc: 0.12, ore: 0.1, rabo: 0.35, perna: 0.05, cor: "#b08453" },
  cachorroPequeno: { raboAng: 30, h: 0.3, c: 0.38, w: 0.16, n: 0.13, na: 50, cab: 0.15, foc: 0.06, ore: 0.07, rabo: 0.18, perna: 0.03, cor: "#c8a073" },
  lobo: { raboAng: -35, h: 0.82, c: 1.0, w: 0.32, n: 0.32, na: 35, cab: 0.32, foc: 0.14, ore: 0.1, rabo: 0.45, perna: 0.06, cor: "#7d7a76" },
  gato: { raboAng: 40, h: 0.27, c: 0.45, w: 0.15, n: 0.1, na: 50, cab: 0.11, foc: 0.03, ore: 0.05, rabo: 0.42, perna: 0.025, cor: "#e0a050" },
  cervo: { raboAng: 20, h: 1.2, c: 1.2, w: 0.4, n: 0.55, na: 60, cab: 0.38, foc: 0.12, ore: 0.15, rabo: 0.12, perna: 0.06, chifre: 0.6, cor: "#9c6b45", montaria: true },
  elefante: { raboAng: -80, h: 2.9, c: 2.8, w: 1.5, n: 0.3, na: 10, cab: 1.0, foc: 0.2, ore: 0.8, rabo: 0.8, perna: 0.3, tromba: 1.6, cor: "#8f9196", montaria: true }
};
const QD_SINONIMOS = { "pônei": "ponei", pony: "ponei", jumento: "burro", mula: "burro", asno: "burro", "dromedário": "dromedario", cabra: "bode", carneiro: "ovelha", vaca: "boi", touro: "boi", "cão": "cachorro", cao: "cachorro", cachorrinho: "cachorroPequeno", "cachorro pequeno": "cachorroPequeno", gatinho: "gato", veado: "cervo", alce: "cervo", rena: "cervo", camela: "camelo" };
function qdEspecie(nome) { const n = String(nome || "cavalo").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); return QD_ESPECIES[n] ? n : QD_SINONIMOS[n] || QD_SINONIMOS[String(nome || "").toLowerCase()] || (Object.keys(QD_ESPECIES).find(k => k.toLowerCase() === n) || null); }
/* pose padrão (graus): pernas [ombro/quadril, joelho, boleto] (+ = para a frente), pescoço/cabeça (+ = para cima), rabo, corpo */
function qdPosePadrao() { return { pescoco: 0, cabeca: 0, cabecaGiro: 0, rabo: 0, raboLado: 0, rolo: 0, voo: 0, corpoInclina: 0, corpoAltura: 0, pernas: { de: [0, 0, 0], dd: [0, 0, 0], te: [0, 0, 0], td: [0, 0, 0] }, deitado: 0, sentado: 0 }; }
const qdRot = (v, ax, a) => { const c = Math.cos(a), s = Math.sin(a); return ax === "x" ? [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c] : ax === "y" ? [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c] : [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; };
const qdAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], qdMul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
function qdEixo(d, lado) { /* matriz cujo eixo y aponta para d (x fica de lado) */ const L = Math.hypot(...d) || 1, Y = d.map(v => v / L); let X = lado || [1, 0, 0]; const dt = X[0] * Y[0] + X[1] * Y[1] + X[2] * Y[2]; X = [X[0] - Y[0] * dt, X[1] - Y[1] * dt, X[2] - Y[2] * dt]; const lx = Math.hypot(...X) || 1; X = X.map(v => v / lx);
  const Z = [X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]]; return [X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]]; }
const qdCaixaEntre = (a, b, larg, esp, extra) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d); return Object.assign({ c: qdMul(qdAdd(a, b), 0.5), h: [larg / 2, L / 2, esp / 2], R: qdEixo(d) }, extra || {}); };
const qdTubo = (a, b, r, r1, extra) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d); return Object.assign({ cil: true, c: qdMul(qdAdd(a, b), 0.5), r, r1: r1 ?? r, hh: L / 2, R: qdEixo(d) }, extra || {}); };

/* esqueleto do animal (pontos-chave em R, locais) — usado para desenhar, para a sela e para quem olha */
function qdEsqueleto(o) {
  const A = o.animal || {}, E = Object.assign({}, QD_ESPECIES[qdEspecie(A.especie) || "cavalo"], A.p || {}), k = (A.escala || 1) * QM, P = Object.assign(qdPosePadrao(), A.pose || {}), pern = Object.assign(qdPosePadrao().pernas, (A.pose || {}).pernas || {});
  const h = E.h * k, c = E.c * k, w = E.w * k, r = w / 2, yb = h - r * 0.9, Lp = Math.max(0.2, yb - r * 0.55), L1 = Lp * 0.42, L2 = Lp * 0.38, L3 = Lp * 0.2;
  /* corpo: inclinação (empinar/sentar) em volta do quadril de trás */
  const piv = [0, yb, -c * 0.42], inc = (P.corpoInclina || 0) * QD, corpo = v => qdAdd(piv, qdRot([v[0] - piv[0], v[1] - piv[1], v[2] - piv[2]], "x", -inc));
  const quadris = { de: [r * 0.62, yb - r * 0.45, c * 0.42], dd: [-r * 0.62, yb - r * 0.45, c * 0.42], te: [r * 0.62, yb - r * 0.45, -c * 0.42], td: [-r * 0.62, yb - r * 0.45, -c * 0.42] };
  /* pernas: ângulos encadeados no plano lateral (0 = vertical para baixo, + = ponta para a frente); a de trás descansa dobrada
     (coxa para a frente, jarrete para trás, canela de pé) — a pose soma a isso */
  const pernas = {}; for (const [kk, q0] of Object.entries(quadris)) { const ang = pern[kk] || [0, 0, 0], tras = kk[0] === "t", rest = tras ? [14, -38, 24] : [0, 0, 0];
    const a1 = ((ang[0] || 0) + rest[0]) * QD + inc, a2 = a1 + ((ang[1] || 0) + rest[1]) * QD, a3 = a2 + ((ang[2] || 0) + rest[2]) * QD;
    const kl = tras ? QD_KT : 1, q = corpo(q0), dir = a => [0, -Math.cos(a), Math.sin(a)], j1 = qdAdd(q, qdMul(dir(a1), L1 * kl)), j2 = qdAdd(j1, qdMul(dir(a2), L2 * kl)), j3 = qdAdd(j2, qdMul(dir(a3), L3 * kl)); pernas[kk] = [q, j1, j2, j3]; }
  const frente = corpo([0, yb, c / 2]), tras = corpo([0, yb, -c / 2]), costas = corpo([0, yb + r, 0]);
  const na = (E.na + (P.pescoco || 0)) * QD - inc * 0, gy = (P.cabecaGiro || 0) * QD, nBase = corpo([0, yb + r * 0.35, c * 0.46]);
  const nDir = qdRot([0, Math.sin(na + inc), Math.cos(na + inc)], "y", gy), nTopo = qdAdd(nBase, qdMul(nDir, E.n * k));
  const ca = na + inc - (90 - 10 + (P.cabeca || 0) * -1) * QD + (E.na < 20 ? 40 * QD : 0), cDir = qdRot([0, Math.sin(ca), Math.cos(ca)], "y", gy), cFim = qdAdd(nTopo, qdMul(cDir, E.cab * k));
  return { E, k, h, c, w, r, yb, Lp, inc, corpo, pernas, frente, tras, costas, nBase, nTopo, nDir, cDir, cFim, P, sela: corpo([0, yb + r * 1.02, -c * 0.02]) };
}
/* partes desenháveis (caixas, cilindros, elipsoides) — com o chão automático: o casco mais baixo encosta em y = 0 */
function qdPartes(o) {
  const S = qdEsqueleto(o), { E, k, c, w, r, yb, corpo, pernas, nBase, nTopo, cDir, cFim, P, inc } = S, out = [], esc = "escuro";
  out.push(qdTubo(corpo([0, yb, -c * 0.45]), corpo([0, yb, c * 0.45]), r, r * 0.95));
  out.push({ esf: true, c: corpo([0, yb, c * 0.45]), r: [r * 0.98, r * 1.0, r * 0.75] }, { esf: true, c: corpo([0, yb, -c * 0.45]), r: [r * 0.98, r * 0.98, r * 0.7] });
  if (E.corcova) { const n = E.corcova; for (let i = 0; i < n; i++) { const z = n === 1 ? 0 : (i === 0 ? c * 0.15 : -c * 0.18); out.push({ esf: true, c: corpo([0, yb + r * 0.95, z]), r: [r * 0.6, r * 0.75, r * 0.7] }); } }
  out.push(qdTubo(nBase, nTopo, Math.max(r * 0.42, E.perna * k * 1.4), Math.max(r * 0.3, E.perna * k)));
  /* cabeça: caixa do crânio + focinho; orelhas; chifres; tromba */
  const hc = E.cab * k, cw = Math.max(hc * 0.42, r * 0.5), cabIni = nTopo, cabMeio = qdAdd(cabIni, qdMul(cDir, hc * 0.55)); out.push(qdCaixaEntre(cabIni, cabMeio, cw, cw * 1.05));
  if (E.foc) out.push(qdCaixaEntre(cabMeio, cFim, cw * 0.72, cw * 0.62));
  const lado = qdRot([1, 0, 0], "y", (P.cabecaGiro || 0) * QD), sobe = [0, 1, 0];
  for (const s of [1, -1]) { const base = qdAdd(qdAdd(cabIni, qdMul(lado, s * cw * 0.32)), qdMul(sobe, cw * 0.45)), oreL = E.ore * k;
    out.push(qdCaixaEntre(base, qdAdd(base, qdAdd(qdMul(sobe, oreL * (E.ore > 0.25 ? 0.4 : 0.9)), qdMul(lado, s * oreL * (E.ore > 0.25 ? 0.9 : 0.25)))), oreL * 0.35, oreL * 0.12));
    if (E.chifre) { const ch = qdAdd(base, qdMul(cDir, -cw * 0.1)); out.push(qdTubo(ch, qdAdd(ch, qdAdd(qdMul(sobe, E.chifre * k * 0.8), qdAdd(qdMul(lado, s * E.chifre * k * 0.45), qdMul(cDir, -E.chifre * k * 0.35)))), Math.max(0.12, cw * 0.11), 0.03, { cor: esc })); } }
  if (E.tromba) { const a = cFim, b = qdAdd(a, [0, -E.tromba * k * 0.85, E.tromba * k * 0.25]); out.push(qdTubo(a, b, cw * 0.18, cw * 0.1)); }
  /* rabo */
  const ra = ((E.raboAng ?? -60) + (P.rabo || 0)) * QD - inc, rb = corpo([0, yb + r * 0.5, -c * 0.52]), rd = qdRot([0, Math.sin(ra), -Math.cos(ra)], "y", -(P.raboLado || 0) * QD); out.push(qdTubo(rb, qdAdd(rb, qdMul(rd, E.rabo * k)), Math.max(0.1, E.perna * k * 0.5), 0.06));
  /* pernas: 3 caixas + casco */
  const pw = Math.max(0.12, E.perna * k * 2), mn = []; for (const [kk, pts] of Object.entries(pernas)) { const [q, j1, j2, j3] = pts;
    out.push(qdCaixaEntre(q, j1, pw * 1.35, pw * 1.6), qdCaixaEntre(j1, j2, pw, pw * 1.05), qdCaixaEntre(j2, j3, pw * 0.85, pw * 0.9), { c: qdAdd(j3, [0, pw * 0.25, pw * 0.15]), h: [pw * 0.55, pw * 0.25, pw * 0.65], cor: esc }); mn.push(j3[1]); }
  /* sela (montaria, com alguém em cima ou "com sela") e carga */
  if (o.animal && (o.animal.sela || o.animal.cavaleiro)) { const s = S.sela; out.push({ c: s, h: [r * 0.75, r * 0.12, r * 0.55], cor: esc }); }
  /* rolar o corpo (de lado, de costas): gira tudo em volta do eixo do corpo */
  if (P.rolo) { const a = P.rolo * QD, cz = Math.cos(a), sz = Math.sin(a), Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1], piv = [0, yb, 0];
    const mm = (A, B) => [0, 1, 2].flatMap(i => [0, 1, 2].map(j => A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]));
    out.forEach(b => { const v = qdRot([b.c[0] - piv[0], b.c[1] - piv[1], b.c[2] - piv[2]], "z", a); b.c = qdAdd(piv, v); b.R = mm(Rz, b.R || [1, 0, 0, 0, 1, 0, 0, 0, 1]); }); }
  /* chão automático: o ponto mais baixo (casco, barriga ou joelhos, deitado, ou o corpo todo se rolou) vai para y = 0; "voo" levanta (pulo) */
  const ext = b => { const R = b.R || [1, 0, 0, 0, 1, 0, 0, 0, 1]; if (b.cil) return Math.abs(R[4]) * b.hh + b.r * Math.hypot(R[3], R[5]); if (b.esf) return Array.isArray(b.r) ? b.r[1] : b.r; return Math.abs(R[3]) * b.h[0] + Math.abs(R[4]) * b.h[1] + Math.abs(R[5]) * b.h[2]; };
  /* andadura: a altura do corpo é a da perna de apoio (não cai no tempo de voo do galope) */
  const baixo = P.alturaPerna && !P.rolo ? (yb - r * 0.45) - P.alturaPerna * S.Lp : P.rolo ? Math.min(...out.map(b => b.c[1] - ext(b))) - 0.12 + 0.12 : Math.min(...mn, ...(P.deitado || P.sentado ? [yb - r * 1.0] : [])), dy = ((o.animal && o.animal.noAr) ? 0 : -baixo + 0.12) + (P.voo || 0) * QM;
  if (dy) out.forEach(b => { b.c = [b.c[0], b.c[1] + dy, b.c[2]]; });
  out.dy = dy; return out;
}
/* um ponto do animal no MUNDO (sela, cabeça, frente…) — o (x, z, base, giro) do objeto */
function qdPontoMundo(o, ponto, g0 = 0) {
  const S = qdEsqueleto(o), dy = qdPartes(o).dy || 0;
  let loc = ponto === "sela" ? S.sela : ponto === "cabeca" ? qdMul(qdAdd(S.nTopo, S.cFim), 0.5) : ponto === "frente" ? S.frente : ponto === "tras" ? S.tras : ponto === "costas" ? S.costas : S.sela;
  if (S.P.rolo) loc = qdAdd([0, S.yb, 0], qdRot([loc[0], loc[1] - S.yb, loc[2]], "z", S.P.rolo * QD));
  const g = (o.giro || 0) * QD, c = Math.cos(g), s = Math.sin(g), v = [loc[0], loc[1] + dy, loc[2]];
  return [o.x + v[0] * c + v[2] * s, g0 + (o.base || 0) + v[1], o.z - v[0] * s + v[2] * c];
}
function qdMedidas(especie, escala = 1) { const E = QD_ESPECIES[qdEspecie(especie) || "cavalo"], k = escala * QM; return { larg: Math.max(E.w * 1.2, (E.ore || 0) * 2) * k, prof: (E.c + E.n * 0.6 + E.cab) * k, alt: (E.h + E.n * 0.5) * k }; }
export { QD_KT, QD_ESPECIES, QD_SINONIMOS, qdEspecie, qdPosePadrao, qdEsqueleto, qdPartes, qdPontoMundo, qdMedidas };
