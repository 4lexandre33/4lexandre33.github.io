/* GeoMannequin — CRIATURAS: manequins VERSÁTEIS por PLANO CORPORAL. Um plano (coluna + perfil do corpo + membros + asas,
   nadadeiras ou tentáculos) serve a muitas espécies, que só mudam medidas e detalhes:
     reptil (lagarto, iguana, crocodilo, jacaré, varano, camaleão, tartaruga, salamandra) · teropode (tiranossauro, raptor)
     serpente (cobra, píton, naja, enguia, minhoca) · peixe (peixe, tubarão, atum, salmão, peixe-palhaço)
     cetaceo (golfinho, baleia, orca, foca) · cefalopode (polvo, lula, kraken) · artropode (besouro, formiga, aranha, caranguejo, escorpião)
     anfibio (sapo) · dragao (dragão, wyvern, dragão oriental) · primata (macaco, gorila)
   Todas têm OSSOS (modo "ossos": crânio, vértebras, costelas, cintura, ossos dos membros, raios das asas e nadadeiras)
   e ESCALA livre (0,01× a 100×: um lagarto ×100 vira um lagarto gigante). Coordenadas em R (1 R ≈ 0,114 m); cabeça para +z. */
const CR_M = 1 / 0.114, CR_D = Math.PI / 180;
/* espécies: plano, L = comprimento (m), R = raio do corpo (m), cor e detalhes do plano */
const CR_ESPECIES = {
  lagarto: { plano: "reptil", L: 0.35, R: 0.025, cor: "#7a9a4a", cauda: 0.55 }, iguana: { plano: "reptil", L: 1.5, R: 0.07, cor: "#5aa060", cauda: 0.62, crista: 0.04 },
  crocodilo: { plano: "reptil", L: 4.5, R: 0.32, cor: "#5a6a3a", cauda: 0.45, focinho: 0.13, escamas: true }, jacare: { plano: "reptil", L: 3.2, R: 0.24, cor: "#4a5a34", cauda: 0.45, focinho: 0.13, escamas: true },
  varano: { plano: "reptil", L: 2.6, R: 0.16, cor: "#6a6a52", cauda: 0.5 }, camaleao: { plano: "reptil", L: 0.35, R: 0.04, cor: "#58b048", cauda: 0.5, caudaEnrola: true, alto: true },
  tartaruga: { plano: "reptil", L: 0.8, R: 0.2, cor: "#6f7a46", cauda: 0.1, casco: true }, salamandra: { plano: "reptil", L: 0.2, R: 0.012, cor: "#e07030", cauda: 0.5 },
  tiranossauro: { plano: "teropode", L: 12, R: 0.9, cor: "#6a7a52", cauda: 0.48, h: 3.8 }, raptor: { plano: "teropode", L: 2, R: 0.14, cor: "#8a7050", cauda: 0.5, h: 0.8, garraPe: true },
  cobra: { plano: "serpente", L: 1.5, R: 0.025, cor: "#6a8a3a" }, piton: { plano: "serpente", L: 5, R: 0.11, cor: "#8a7448" }, naja: { plano: "serpente", L: 1.8, R: 0.03, cor: "#7a6a40", capuz: true },
  enguia: { plano: "serpente", L: 1, R: 0.03, cor: "#5a6a6a", aquatico: true }, minhoca: { plano: "serpente", L: 0.15, R: 0.004, cor: "#c08070" },
  peixe: { plano: "peixe", L: 0.3, R: 0.05, cor: "#9ab0c0", aquatico: true }, tubarao: { plano: "peixe", L: 4, R: 0.4, cor: "#7a8a98", aquatico: true, dorsalAlta: true, tubarao: true },
  atum: { plano: "peixe", L: 2, R: 0.28, cor: "#4a6080", aquatico: true }, salmao: { plano: "peixe", L: 0.8, R: 0.1, cor: "#c08a78", aquatico: true }, peixePalhaco: { plano: "peixe", L: 0.1, R: 0.025, cor: "#ff8030", aquatico: true, alto: true },
  golfinho: { plano: "cetaceo", L: 2.5, R: 0.25, cor: "#8a98a8", aquatico: true, bico: true }, baleia: { plano: "cetaceo", L: 15, R: 1.6, cor: "#4a5a6a", aquatico: true },
  orca: { plano: "cetaceo", L: 7, R: 0.75, cor: "#202428", aquatico: true, dorsalAlta: true }, foca: { plano: "cetaceo", L: 1.6, R: 0.28, cor: "#7a7a70", aquatico: true, pinipede: true },
  polvo: { plano: "cefalopode", L: 1, R: 0.12, cor: "#c06050", aquatico: true, bracos: 8 }, lula: { plano: "cefalopode", L: 1.5, R: 0.09, cor: "#d8a0a0", aquatico: true, bracos: 10, manto: 2.2 },
  kraken: { plano: "cefalopode", L: 20, R: 2.4, cor: "#7a3a4a", aquatico: true, bracos: 8 },
  besouro: { plano: "artropode", L: 0.05, R: 0.012, cor: "#2a3a2a", pernas: 6 }, formiga: { plano: "artropode", L: 0.012, R: 0.0018, cor: "#3a2018", pernas: 6, cintura: true },
  aranha: { plano: "artropode", L: 0.06, R: 0.012, cor: "#3a3030", pernas: 8, aranha: true }, caranguejo: { plano: "artropode", L: 0.18, R: 0.07, cor: "#c04a2a", pernas: 8, pinças: true, largo: true },
  escorpiao: { plano: "artropode", L: 0.15, R: 0.012, cor: "#8a6a3a", pernas: 8, pinças: true, ferrao: true },
  sapo: { plano: "anfibio", L: 0.12, R: 0.035, cor: "#6aa04a" },
  dragao: { plano: "dragao", L: 12, R: 0.8, cor: "#8a2a2a", env: 16, chifres: true, patas: 4 }, wyvern: { plano: "dragao", L: 8, R: 0.55, cor: "#4a5a3a", env: 12, patas: 2 },
  dragaoOriental: { plano: "dragao", L: 18, R: 0.45, cor: "#c0a030", env: 0, patas: 4, oriental: true, chifres: true },
  macaco: { plano: "primata", L: 0.55, R: 0.09, cor: "#8a6a4a", cauda: 0.5, h: 0.5 }, gorila: { plano: "primata", L: 1.0, R: 0.28, cor: "#3a3634", cauda: 0, h: 1.0 }
};
const CR_SINONIMOS = { "jacaré": "jacare", "camaleão": "camaleao", komodo: "varano", "dragão-de-komodo": "varano", "t-rex": "tiranossauro", trex: "tiranossauro", dinossauro: "tiranossauro", velociraptor: "raptor",
  serpente: "cobra", "píton": "piton", jiboia: "piton", sucuri: "piton", cascavel: "cobra", "tubarão": "tubarao", "peixe-palhaço": "peixePalhaco", "peixe-palhaco": "peixePalhaco", palhaco: "peixePalhaco",
  "salmão": "salmao", baleiaAzul: "baleia", "escorpião": "escorpiao", "rã": "sapo", ra: "sapo", "dragão": "dragao", "dragão oriental": "dragaoOriental", "dragao-oriental": "dragaoOriental", serpe: "wyvern",
  chimpanze: "macaco", "chimpanzé": "macaco", lagartixa: "lagarto", "caranguejo-gigante": "caranguejo", tarantula: "aranha", "tarântula": "aranha" };
/* pose: tudo em graus/frações; pernas = { índice: [avança, levanta, dobra] } */
function crPosePadrao() { return { ondula: 0, fase: 0, ondas: 1, ondulaV: 0, curva: 0, pescoco: 0, cabeca: 0, cabecaGiro: 0, boca: 0, cauda: 0, caudaLado: 0, corpoInclina: 0, rolo: 0, voo: 0, agacha: 0, ereto: 0,
  asas: { abre: 0, bate: 0 }, pernas: {}, tentaculos: { enrola: 0.35, abre: 0.5, fase: 0 }, nadadeiras: 0, pincas: 0 }; }
const crA = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], crS = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], crMl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const crN = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); }, crX = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const crRot = (v, ax, a) => { const c = Math.cos(a), s = Math.sin(a); return ax === "x" ? [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c] : ax === "y" ? [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c] : [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; };
function crEixo(d, lado) { const L = Math.hypot(...d) || 1, Y = d.map(v => v / L); let X = lado || (Math.abs(Y[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]); const dt = X[0] * Y[0] + X[1] * Y[1] + X[2] * Y[2];
  X = crN([X[0] - dt * Y[0], X[1] - dt * Y[1], X[2] - dt * Y[2]]); const Z = crX(X, Y); return [X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]]; }
const crTubo = (a, b, r, r1, ex) => { const d = crS(b, a), L = Math.hypot(...d); return Object.assign({ cil: true, c: crMl(crA(a, b), 0.5), r: Math.max(0.005, r), r1: Math.max(0.003, r1 ?? r), hh: L / 2, R: crEixo(d) }, ex || {}); };
const crElip = (c, r, dir, lado, ex) => Object.assign({ esf: true, c, r: r.map(v => Math.max(0.005, v)), R: crEixo(dir || [0, 1, 0], lado) }, ex || {});
const crPlaca = (a, b, larg, esp, lado, ex) => { const d = crS(b, a), L = Math.hypot(...d); return Object.assign({ c: crMl(crA(a, b), 0.5), h: [Math.max(0.005, larg / 2), L / 2, Math.max(0.003, esp / 2)], R: crEixo(d, lado) }, ex || {}); };
/* perfil (raio relativo) ao longo do corpo, t = 0 focinho … 1 ponta da cauda */
const CR_PERFIL = {
  reptil: (t, E) => { const cf = 1 - (E.cauda || 0.5), cab = 0.13; if (t < cab) return 0.45 + 0.35 * Math.sin(t / cab * Math.PI / 2); if (t < cab + 0.05) return 0.62; if (t < cf) return 0.75 + 0.25 * Math.sin((t - cab) / (cf - cab) * Math.PI); return Math.max(0.06, 0.7 * (1 - (t - cf) / (1 - cf))); },
  teropode: (t, E) => { const cab = 0.14, pes = 0.24, cf = 1 - (E.cauda || 0.5); if (t < cab) return 0.5 + 0.3 * Math.sin(t / cab * Math.PI); if (t < pes) return 0.45; if (t < cf) return 0.7 + 0.3 * Math.sin((t - pes) / (cf - pes) * Math.PI); return Math.max(0.05, 0.75 * (1 - (t - cf) / (1 - cf))); },
  serpente: (t) => t < 0.04 ? 0.7 + 3 * t : t < 0.75 ? 0.85 + 0.15 * Math.sin((t - 0.04) / 0.71 * Math.PI) : Math.max(0.08, 0.9 * (1 - (t - 0.75) / 0.25)),
  peixe: (t) => t > 0.84 ? 0.12 : Math.max(0.1, Math.pow(Math.sin((t * 0.86 + 0.06) * Math.PI), 0.75)),
  cetaceo: (t) => t > 0.88 ? 0.1 : Math.max(0.12, Math.pow(Math.sin((t * 0.8 + 0.12) * Math.PI), 0.8)),
  dragao: (t, E) => E.oriental ? (t < 0.05 ? 0.9 : Math.max(0.12, 0.85 - 0.6 * t)) : t < 0.06 ? 0.55 : t < 0.3 ? 0.35 + (t - 0.06) * 1.2 : t < 0.55 ? 0.75 + 0.25 * Math.sin((t - 0.3) / 0.25 * Math.PI) : Math.max(0.05, 0.7 * (1 - (t - 0.55) / 0.45)),
  primata: (t, E) => { const cab = 0.18, cf = E.cauda ? 0.8 : 1; if (t < cab) return 0.7; if (t < cf) return 0.85 + 0.15 * Math.sin((t - cab) / (cf - cab) * Math.PI); return 0.12; },
  anfibio: (t) => t < 0.3 ? 0.75 + 0.25 * Math.sin(t / 0.3 * Math.PI / 2) : Math.max(0.3, Math.cos((t - 0.3) / 0.7 * Math.PI / 2)),
  artropode: () => 1, cefalopode: () => 1
};
/* membros de cada plano: t (posição na coluna), comprimentos (frações de L ou de R) e tipo (lateral = esparramado; sagital = embaixo do corpo) */
function crMembros(E, L, R) { const p = E.plano;
  if (p === "reptil") { if (E.casco) return [{ t: 0.3, seg: [R * 0.5, R * 0.55, R * 0.35], tipo: "lateral", e: [-10, -70, 0] }, { t: 0.72, seg: [R * 0.45, R * 0.5, R * 0.3], tipo: "lateral", e: [-10, -70, 0] }];
    const cf = 1 - (E.cauda || 0.5), lm = L * (E.alto ? 0.12 : 0.1); return [{ t: 0.2, seg: [lm * 0.9, lm * 0.85, lm * 0.4], tipo: "lateral", e: [E.alto ? -35 : -8, -75, 0] }, { t: cf - 0.04, seg: [lm, lm * 0.95, lm * 0.5], tipo: "lateral", e: [E.alto ? -35 : -8, -75, 0] }]; }
  if (p === "teropode") { const h = (E.h || 1) / 0.114 * (L / ((E.L || 1) / 0.114)); return [{ t: 0.4, seg: [h * 0.45, h * 0.45, h * 0.25], tipo: "sagital", e: [-60, -115, -60], perna: true }, { t: 0.2, seg: [R * 0.6, R * 0.5, R * 0.25], tipo: "lateral", e: [-50, -100, -60], braco: true }]; }
  if (p === "anfibio") return [{ t: 0.22, seg: [L * 0.18, L * 0.18, L * 0.12], tipo: "lateral", e: [-30, -80, 0] }, { t: 0.62, seg: [L * 0.35, L * 0.35, L * 0.2], tipo: "lateral", e: [10, -10, 0], salto: true }];
  if (p === "dragao") { const lm = L * (E.oriental ? 0.05 : 0.11), out = []; if (E.patas === 4 && !E.oriental) out.push({ t: 0.33, seg: [lm, lm * 0.9, lm * 0.35], tipo: "sagital", e: [-80, -100, -10], garra: true });
    if (E.oriental) out.push({ t: 0.15, seg: [lm, lm, lm * 0.4], tipo: "lateral", e: [-20, -70, 0], garra: true }, { t: 0.45, seg: [lm, lm, lm * 0.4], tipo: "lateral", e: [-20, -70, 0], garra: true });
    else out.push({ t: 0.54, seg: [lm * 1.15, lm * 1.05, lm * 0.45], tipo: "sagital", e: [-70, -125, -20], garra: true }); return out; }
  if (p === "primata") { const h = (E.h || 0.5) / 0.114 * (L / ((E.L || 1) / 0.114)); return [{ t: 0.22, seg: [h * 0.44, h * 0.42, h * 0.15], tipo: "sagital", e: [-114, -104, -50], braco: true }, { t: E.cauda ? 0.75 : 0.95, seg: [h * 0.32, h * 0.3, h * 0.2], tipo: "sagital", e: [-72, -122, -15] }]; }
  if (p === "cetaceo" && E.pinipede) return [{ t: 0.3, seg: [R * 0.5, R * 0.6, R * 0.5], tipo: "nadadeira" }];
  return []; }

/* ===================== esqueleto ===================== */
function crEsqueleto(o) {
  const A = o.animal || {}, esp = crEspecie(A.especie) || "lagarto", E = Object.assign({}, CR_ESPECIES[esp], A.p || {}), k = (A.escala || 1) * CR_M, P0 = crPosePadrao(), Pp = A.pose || {};
  const P = Object.assign({}, P0, Pp, { asas: Object.assign({}, P0.asas, Pp.asas || {}), pernas: Object.assign({}, Pp.pernas || {}), tentaculos: Object.assign({}, P0.tentaculos, Pp.tentaculos || {}) });
  const L = E.L * k, R = E.R * k, pl = E.plano, N = pl === "serpente" || (pl === "dragao" && E.oriental) ? 36 : pl === "artropode" || pl === "cefalopode" ? 6 : 22, perfil = CR_PERFIL[pl] || CR_PERFIL.reptil;
  /* coluna: x = ondulação + curva; y = pescoço, cauda e onda vertical; z = ao longo do corpo (cabeça em +L/2) */
  const tN = pl === "dragao" && !E.oriental ? 0.3 : pl === "teropode" ? 0.22 : pl === "primata" ? 0.18 : 0.13, tC = 1 - (E.cauda ?? (pl === "serpente" ? 0.2 : pl === "peixe" || pl === "cetaceo" ? 0.3 : 0.4));
  const env = t => pl === "serpente" ? 0.6 + 0.4 * t : pl === "peixe" || pl === "cetaceo" ? Math.pow(t, 2) : pl === "reptil" || pl === "dragao" ? 0.35 + 0.65 * t : t;
  const pts = []; let y = 0;
  for (let i = 0; i <= N; i++) { const t = i / N, z = L * (0.5 - t), lat = (P.ondula || 0) * L * 0.09 * env(t) * Math.sin(2 * Math.PI * (P.ondas || 1) * t - (P.fase || 0) * 2 * Math.PI) + (P.curva || 0) / 90 * L * 0.25 * Math.sin(Math.PI * t) + (t > tC ? (P.caudaLado || 0) / 90 * L * (t - tC) : 0) + (t < tN ? (P.cabecaGiro || 0) / 90 * L * 0.6 * (tN - t) : 0);
    let yy = (P.ondulaV || 0) * L * 0.06 * env(t) * Math.sin(2 * Math.PI * t - (P.fase || 0) * 2 * Math.PI);
    if (t < tN) yy += Math.sin((P.pescoco || 0) * CR_D) * L * (tN - t) * (pl === "dragao" ? 1 : 0.6); if (t > tC) yy += Math.sin((P.cauda || 0) * CR_D) * L * (t - tC);
    if (t < 0.3 && (P.ereto || 0) > 0) yy += P.ereto * L * 0.32 * Math.pow(1 - t / 0.3, 1.3);
    pts.push([lat, yy, z]); }
  /* inclinação do corpo (empinar, mergulhar) e rolar */
  const inc = ((P.corpoInclina || 0) + (pl === "primata" ? 28 : pl === "teropode" ? 6 : 0)) * CR_D, ro = (P.rolo || 0) * CR_D, tr = v => crRot(crRot(v, "x", -inc), "z", ro), sp = pts.map(tr);
  const raio = i => R * perfil(i / N, E) * (pl === "reptil" && E.casco && i / N > 0.15 && i / N < 0.85 ? 1.15 : 1);
  const tan = i => crN(crS(sp[Math.max(0, i - 1)], sp[Math.min(N, i + 1)])), up0 = tr([0, 1, 0]);
  const at = t => { const f = Math.max(0, Math.min(N, t * N)), i = Math.min(N - 1, Math.floor(f)), u = f - i; return crA(crMl(sp[i], 1 - u), crMl(sp[i + 1], u)); };
  const quadro = t => { const i = Math.max(0, Math.min(N, Math.round(t * N))), fw = tan(i), lat = crN(crX(up0, fw)), up = crN(crX(fw, lat)); return { fw, lat, up }; };
  return { E, esp, k, L, R, P, N, sp, raio, tan, at, quadro, tN, tC, pl, inc, up0 };
}
/* um membro: quadril/ombro → joelho → pé → dedos (pose: [avança, levanta, dobra]) */
function crMembro(S, m, sx, idx) { const { at, quadro, raio, N, P } = S, q = quadro(m.t), r = raio(Math.round(m.t * N)), pp = P.pernas[idx + (sx > 0 ? "e" : "d")] || P.pernas[idx] || [0, 0, 0];
  const lat = crMl(q.lat, sx), base = crA(crA(at(m.t), crMl(lat, m.tipo === "sagital" ? r * 0.55 : r * 0.8)), crMl(q.up, -r * (m.tipo === "sagital" ? 0.25 : 0.1)));
  const av = (pp[0] || 0) * CR_D, lv = (pp[1] || 0), db = (pp[2] || 0), ag = (P.agacha || 0) * 30;
  let dirs;
  if (m.salto) { const ex = Math.max(0, Math.min(1, (pp[1] || 0) / 60)); /* sapo: coxa para fora/frente, canela para trás, pé à frente; "levanta" estica (salto) */
    dirs = [crN(crA(crA(crMl(lat, 0.7), crMl(q.fw, 0.5 - ex * 1.2)), crMl(q.up, -0.25 - ex * 0.4))), crN(crA(crA(crMl(q.fw, -0.9), crMl(lat, 0.35)), crMl(q.up, -0.15 - ex * 0.5))), crN(crA(crA(crMl(q.fw, 1 - ex * 2), crMl(lat, 0.2)), crMl(q.up, -0.15 - ex * 0.6)))]; }
  else if (m.tipo === "lateral") { const o = crN(crA(crMl(lat, Math.cos(av)), crMl(q.fw, Math.sin(av)))); dirs = m.e.map((e, i) => { const ee = (e + (i === 0 ? lv + ag * 0.3 : i === 1 ? -db * 0.5 - ag * 0.4 : 0)) * CR_D; return i === 2 ? crN(crA(crMl(q.fw, 0.8), crMl(lat, 0.3))) : crN(crA(crMl(o, Math.cos(ee)), crMl(q.up, Math.sin(ee)))); }); }
  else if (m.tipo === "nadadeira") { const o = crN(crA(crMl(lat, 0.8), crMl(q.fw, -0.3 + Math.sin(av) * 0.5))); dirs = [crN(crA(o, crMl(q.up, -0.4 + lv / 90))), crN(crA(o, crMl(q.fw, -0.4))), crN(crA(o, crMl(q.fw, -0.6)))]; }
  else { /* sagital: no plano frente/trás, embaixo do corpo */ const o = q.fw; dirs = m.e.map((e, i) => { const ee = (e + (i === 0 ? (pp[0] || 0) + lv * 0.5 - ag * 0.3 - (P.corpoInclina || 0) : i === 1 ? -db - ag * 0.6 : i === 2 ? ag * 0.4 : 0)) * CR_D; const d = crN(crA(crMl(o, Math.cos(ee)), crMl(q.up, Math.sin(ee)))); return crN(crA(d, crMl(lat, 0.08 * (i + 1)))); }); }
  const j1 = crA(base, crMl(dirs[0], m.seg[0])), j2 = crA(j1, crMl(dirs[1], m.seg[1])), j3 = crA(j2, crMl(dirs[2], m.seg[2]));
  return { base, j1, j2, j3, dirs, lat, sx, m }; }
/* asas de membrana (dragão): úmero, rádio e 4 dedos com a membrana entre eles; abre 0 = dobrada nas costas, 1 = aberta; bate em graus */
function crAsa(S, sx) { const { at, quadro, raio, N, P, E, k } = S, t = 0.33, q = quadro(t), r = raio(Math.round(t * N)), lat = crMl(q.lat, sx), env = (E.env || 0) * k / 2, ab = Math.max(0, Math.min(1, P.asas.abre || 0)), bt = (P.asas.bate || 0) * CR_D;
  const ombro = crA(crA(at(t), crMl(lat, r * 0.55)), crMl(q.up, r * 0.75)); const sobe = d => crN(crA(crMl(d, Math.cos(bt)), crMl(q.up, Math.sin(bt))));
  const dob = crN(crA(crMl(q.fw, -0.6), crA(crMl(q.up, 0.7), crMl(lat, 0.25)))), abr = sobe(crN(crA(lat, crMl(q.fw, 0.15)))), d1 = crN(crA(crMl(dob, 1 - ab), crMl(abr, ab)));
  const dob2 = crN(crA(crMl(q.fw, 0.7), crA(crMl(q.up, 0.2), crMl(lat, 0.15)))), abr2 = sobe(crN(crA(lat, crMl(q.fw, -0.12)))), d2 = crN(crA(crMl(dob2, 1 - ab), crMl(abr2, ab)));
  const cot = crA(ombro, crMl(d1, env * 0.22)), punho = crA(cot, crMl(d2, env * 0.28)), dedos = [];
  for (let j = 0; j < 4; j++) { const a = (10 + j * 32) * CR_D, ab0 = sobe(crN(crA(crMl(lat, Math.cos(a)), crMl(q.fw, -Math.sin(a))))), fd = crN(crA(crMl(q.fw, -1), crMl(q.up, -0.15))), d = crN(crA(crMl(fd, 1 - ab), crMl(ab0, ab)));
    dedos.push(crA(punho, crMl(d, env * (0.55 - j * 0.08) * (0.55 + 0.45 * ab)))); }
  const flanco = crA(at(0.55), crMl(lat, r * 0.6)); return { ombro, cot, punho, dedos, flanco, lat }; }
/* asa genérica (para quadrúpedes alados: pégaso, grifo): ombro no mundo do animal, frente/cima/lado; penas = placas em leque; abre 0..1, bate em graus */
function crAsaQuadrupede(ombro, fw, up, lat0, sx, envMeia, abre, bate, cor, penas = true) { const lat = crMl(lat0, sx), ab = Math.max(0, Math.min(1, abre)), bt = bate * CR_D, out = [];
  const sobe = d => crN(crA(crMl(d, Math.cos(bt)), crMl(up, Math.sin(bt)))), dob = crN(crA(crMl(fw, -0.75), crA(crMl(up, 0.45), crMl(lat, 0.2)))), abr = sobe(crN(crA(lat, crMl(fw, 0.1))));
  const d1 = crN(crA(crMl(dob, 1 - ab), crMl(abr, ab))), d2 = crN(crA(crMl(crN(crA(crMl(fw, 0.6), crMl(up, 0.3))), 1 - ab), crMl(sobe(crN(crA(lat, crMl(fw, -0.15)))), ab)));
  const cot = crA(ombro, crMl(d1, envMeia * 0.28)), punho = crA(cot, crMl(d2, envMeia * 0.3)), dm = crN(crA(crMl(crMl(fw, -1), 1 - ab), crMl(sobe(crN(crA(lat, crMl(fw, -0.35)))), ab)));
  const rb = envMeia * 0.025; out.push(crTubo(ombro, cot, rb * 1.3, rb), crTubo(cot, punho, rb, rb * 0.8)); const esp = Math.max(0.01, envMeia * 0.008), corda = envMeia * 0.32;
  const atras = crN(crA(crMl(fw, -1), crMl(up, -0.1)));
  out.push(crPlaca(crA(ombro, crMl(atras, corda * 0.4)), crA(cot, crMl(atras, corda * 0.45)), corda * 0.8, esp, crN(crX(up, crS(cot, ombro))), { cor }), crPlaca(crA(cot, crMl(atras, corda * 0.5)), crA(punho, crMl(atras, corda * 0.45)), corda, esp, crN(crX(up, crS(punho, cot))), { cor }));
  for (let i = 0; i < 6; i++) { const f = i / 5, dir = crN(crA(crMl(dm, 1 - f * 0.55), crMl(atras, f * (0.4 + 0.6 * ab)))), L = envMeia * 0.42 * (1 - f * 0.25); out.push(crPlaca(punho, crA(punho, crMl(dir, L)), corda * 0.32, esp, crN(crX(up, dir)), { cor })); }
  return out; }
function crEspecie(nome) { const n = String(nome || "").trim(); if (CR_ESPECIES[n]) return n; const l = n.toLowerCase(); if (CR_ESPECIES[l]) return l; return CR_SINONIMOS[l] || CR_SINONIMOS[n] || null; }

/* ===================== partes (para desenhar) ===================== */
function crPartes(o) {
  const S = crEsqueleto(o), { E, k, L, R, P, N, sp, raio, tan, at, quadro, pl } = S, out = [], ossos = !!(o.animal && o.animal.ossos), esc = "escuro", mn = [], ob = Math.max(0.02, R * 0.08);
  const corpoSeg = (i0, i1, fat = 1, achata = 1, lat0 = 1) => { for (let i = i0; i < i1; i++) { const a = sp[i], b = sp[i + 1], r = (raio(i) + raio(i + 1)) / 2 * fat, Ls = Math.hypot(...crS(b, a)), q = quadro(i / N);
      out.push(crElip(crMl(crA(a, b), 0.5), [r * achata, Ls * 0.62 + r * 0.25, r * (lat0 || 1)], crS(b, a), q.up)); } };
  const cabCentro = at(0.04), qc = quadro(0.02);
  /* ---------- corpo por plano ---------- */
  if (pl === "artropode") {
    /* cabeça, cefalotórax e abdômen com medidas do comprimento (L) e da largura (R) */
    const q = quadro(0.5), fw = q.fw, up = q.up, lat = q.lat, Wd = R * (E.largo ? 2.2 : 1.2), cab = at(0.06), cef = at(E.largo ? 0.4 : 0.3), abd = at(E.aranha ? 0.72 : E.ferrao ? 0.55 : 0.7);
    const lC = L * (E.largo ? 0.3 : 0.17), lA = L * (E.aranha ? 0.25 : E.ferrao ? 0.16 : 0.24);
    if (!ossos) { if (!E.largo) out.push(crElip(cab, [R * 0.6, L * 0.06, R * 0.7], fw, up)); out.push(crElip(cef, [R * 0.75, lC, Wd], fw, up)); if (!E.largo) out.push(crElip(abd, [R * 0.85, lA, Wd * (E.aranha ? 1.1 : 0.9)], fw, up));
      if (E.cintura) out.push(crElip(at(0.48), [R * 0.3, L * 0.05, R * 0.3], fw, up));
      for (const sx of [1, -1]) out.push(crElip(crA(E.largo ? crA(cef, crMl(fw, lC * 0.8)) : cab, crA(crMl(lat, sx * R * 0.35), crMl(up, R * 0.4))), [R * 0.15, R * 0.15, R * 0.15], null, null, { cor: esc })); }
    else { out.push(crTubo(at(0.04), at(E.ferrao ? 0.7 : 0.9), ob, ob), crElip(cef, [R * 0.6, lC * 0.9, Wd * 0.9], fw, up)); if (!E.largo) out.push(crElip(abd, [R * 0.7, lA * 0.9, Wd * 0.8], fw, up)); }
    if (E.ferrao) { let p = crA(abd, crMl(fw, -lA)), d = crN(crA(crMl(fw, -1), crMl(up, 0.5))); const seg = L * 0.07; for (let j = 0; j < 5; j++) { const b = crA(p, crMl(d, seg)); out.push(crTubo(p, b, R * 0.35, R * 0.3)); p = b; d = crN(crA(crMl(d, 0.55), crMl(up, 0.35 + j * 0.1))); if (j > 2) d = crN(crA(d, crMl(fw, 0.5))); }
      out.push(crTubo(p, crA(p, crMl(crN(crA(crMl(fw, 1), crMl(up, -0.4))), seg * 0.8)), R * 0.3, 0.005, { cor: esc })); }
    /* patas articuladas: pares espalhados ao longo do cefalotórax */
    const np = (E.pernas || 6) / 2, Lp = Math.max(R * 3, L * (E.aranha ? 0.75 : E.largo ? 0.85 : 0.45));
    for (let j = 0; j < np; j++) for (const sx of [1, -1]) { const t0 = E.largo ? 0.4 : 0.3, t = t0 - lC / L * 0.6 + j * (lC / L * 1.2 / Math.max(1, np - 1)), pp = P.pernas[j + (sx > 0 ? "e" : "d")] || P.pernas[j] || [0, 0, 0], spread = ((j - (np - 1) / 2) * (E.aranha ? 38 : 30) + (pp[0] || 0)) * CR_D;
      const lt = crMl(lat, sx), o0 = crN(crA(crMl(lt, Math.cos(spread)), crMl(fw, -Math.sin(spread)))), b0 = crA(at(t), crMl(lt, Wd * 0.85)), lv = (pp[1] || 0) * CR_D;
      const j1 = crA(b0, crMl(crN(crA(crMl(o0, Math.cos(0.7 + lv)), crMl(up, Math.sin(0.7 + lv)))), Lp * 0.42)), j2 = crA(j1, crMl(crN(crA(crMl(o0, 0.5), crMl(up, -0.87))), Lp * 0.48)), j3 = crA(j2, crMl(crN(crA(crMl(o0, 0.35), crMl(up, -0.94))), Lp * 0.22));
      const rp = Math.max(ob * 0.6, R * 0.16); out.push(crTubo(b0, j1, rp, rp * 0.8), crTubo(j1, j2, rp * 0.8, rp * 0.6), crTubo(j2, j3, rp * 0.6, rp * 0.3)); mn.push(j3[1]); }
    if (E.pinças) for (const sx of [1, -1]) { const lt = crMl(lat, sx), base = E.largo ? crA(cef, crMl(fw, lC * 0.7)) : cab, b0 = crA(base, crMl(lt, R * 0.7)), Lb = L * (E.largo ? 0.35 : 0.22), j1 = crA(b0, crMl(crN(crA(crMl(fw, 0.6), crA(crMl(lt, 0.7), crMl(up, 0.2)))), Lb * 0.5)), j2 = crA(j1, crMl(crN(crA(crMl(fw, 1), crMl(lt, -0.15))), Lb * 0.45)), ab = (0.2 + 0.6 * (P.pincas || 0));
      out.push(crTubo(b0, j1, R * 0.28, R * 0.32), crTubo(j1, j2, R * 0.38, R * 0.55)); out.push(crTubo(j2, crA(j2, crMl(crN(crA(crMl(fw, 1), crMl(lt, ab))), Lb * 0.4)), R * 0.35, R * 0.06), crTubo(j2, crA(j2, crMl(crN(crA(crMl(fw, 1), crMl(lt, -ab * 0.6))), Lb * 0.32)), R * 0.28, R * 0.06)); }
  } else if (pl === "cefalopode") {
    const q = quadro(0.5), man = E.manto || 1.3, topo = crA(at(0.5), crMl(q.fw, 0)), corpoC = crA(topo, crMl(q.up, R * 1.3));
    if (!ossos) { out.push(crElip(corpoC, [R, R * man, R], q.up, q.lat)); for (const sx of [1, -1]) out.push(crElip(crA(crA(topo, crMl(q.lat, sx * R * 0.65)), crMl(q.up, R * 0.1)), [R * 0.22, R * 0.22, R * 0.22], null, null, { cor: esc })); }
    else out.push(crElip(corpoC, [R * 0.9, R * man * 0.9, R * 0.9], q.up, q.lat), crElip(crA(topo, crMl(q.up, R * 0.1)), [R * 0.55, R * 0.4, R * 0.55], null, null)); /* manto e o "bico" (o único duro) */
    const nb = E.bracos || 8, Lb = R * (E.bracos > 8 ? 5 : 4.2), T = P.tentaculos;
    for (let j = 0; j < nb; j++) { const a = j / nb * Math.PI * 2 + (T.fase || 0) * 0.3, out0 = crN(crA(crMl(q.lat, Math.cos(a)), crMl(q.fw, Math.sin(a)))); let p = crA(topo, crMl(out0, R * 0.55)), d = crN(crA(crMl(out0, 0.3 + 0.7 * (T.abre ?? 0.5)), crMl(q.up, -0.8)));
      const nseg = 8, ax = crN(crX(d, q.up)); for (let s = 0; s < nseg; s++) { const f = s / nseg, rr = R * 0.32 * (1 - f * 0.85), b = crA(p, crMl(d, Lb / nseg)); out.push(crTubo(p, b, rr, rr * 0.88)); p = b; mn.push(p[1] - rr);
        const curl = ((T.enrola ?? 0.35) * 22 + 6 * Math.sin((T.fase || 0) * 6.28 + j + s * 0.7)) * CR_D; const c = Math.cos(curl), s2 = Math.sin(curl); d = crN(crA(crA(crMl(d, c), crMl(crX(ax, d), s2)), crMl(ax, ax[0] * d[0] * (1 - c) + ax[1] * d[1] * (1 - c) + ax[2] * d[2] * (1 - c)))); } }
  } else {
    /* corpo segmentado ao longo da coluna (peixe e cetáceo achatados de lado / em cima) */
    const ach = pl === "peixe" ? (E.alto ? 1.5 : 1.15) : pl === "cetaceo" ? 1 : pl === "serpente" ? 0.85 : pl === "reptil" ? (E.casco ? 0.6 : 0.75) : pl === "anfibio" ? 0.8 : 0.95, latF = pl === "peixe" ? 0.55 : pl === "anfibio" ? 1.35 : 1;
    if (!ossos) { const i0 = pl === "primata" ? 3 : 1; corpoSeg(i0, N, 1, ach, latF);
      /* cabeça: crânio + focinho + mandíbula que abre */
      const fw = crN(crS(sp[0], sp[2])), up = quadro(0.02).up, lat = crN(crX(up, fw)), aq = pl === "peixe" || pl === "cetaceo", rc = raio(1) * (pl === "dragao" ? 1.5 : pl === "serpente" ? 1.15 : pl === "primata" ? 0.95 : pl === "teropode" ? 1.6 : pl === "anfibio" ? 1.15 : 1.05);
      const foc = aq || pl === "anfibio" ? (aq && E.bico ? 0.05 * E.L * k : 0) : (E.focinho ? E.focinho * E.L : (pl === "teropode" ? 0.1 : pl === "dragao" ? 0.06 : pl === "primata" ? 0.03 : pl === "serpente" ? 0.025 : 0.08) * E.L) * k;
      const cab = pl === "primata" ? crA(sp[2], crMl(up, rc * 0.5)) : sp[1];
      if (!aq) out.push(crElip(cab, pl === "anfibio" ? [rc * 0.55, rc * 0.9, rc * 1.25] : [rc * 0.78, rc * 1.15, rc * 0.92], fw, up));
      if (aq && E.bico) out.push(crTubo(sp[0], crA(sp[0], crMl(fw, foc)), raio(0) * 0.45, raio(0) * 0.3));
      if (!aq && foc > 0.01) { const pf = crA(cab, crMl(fw, rc + foc)); out.push(crTubo(crA(cab, crMl(fw, rc * 0.5)), pf, rc * 0.62, rc * 0.4)); const bo = Math.max(0, Math.min(1, P.boca || 0)) * 32 * CR_D, dmand = crN(crA(crMl(fw, Math.cos(bo)), crMl(up, -Math.sin(bo))));
        out.push(crTubo(crA(cab, crMl(up, -rc * 0.35)), crA(crA(cab, crMl(up, -rc * 0.35)), crMl(dmand, rc + foc * 0.95)), rc * 0.45, rc * 0.3));
        if (bo > 0.05 && (pl === "teropode" || pl === "dragao" || E.focinho)) for (let j = 0; j < 4; j++) out.push(crTubo(crA(pf, crMl(fw, -foc * (0.2 + j * 0.2))), crA(crA(pf, crMl(fw, -foc * (0.2 + j * 0.2))), crMl(up, -rc * 0.18)), rc * 0.05, 0.005, { cor: "#f4f0e0" })); }
      for (const sx of [1, -1]) out.push(crElip(crA(crA(cab, crMl(lat, sx * rc * 0.62)), crA(crMl(up, rc * 0.35), crMl(fw, rc * 0.35))), [rc * 0.17, rc * 0.17, rc * 0.17], null, null, { cor: esc }));
      if (E.chifres) for (const sx of [1, -1]) out.push(crTubo(crA(cab, crA(crMl(lat, sx * rc * 0.5), crMl(up, rc * 0.6))), crA(cab, crA(crMl(lat, sx * rc * 0.9), crA(crMl(up, rc * 1.4), crMl(fw, -rc * 1.6)))), rc * 0.18, 0.01, { cor: "#d8c8a0" }));
      if (E.crista) for (let i = 2; i < N * 0.7; i += 2) { const q = quadro(i / N); out.push(crPlaca(crA(sp[i], crMl(q.up, raio(i) * 0.8)), crA(sp[i], crMl(q.up, raio(i) * 0.8 + E.crista * k)), raio(i) * 0.4, raio(i) * 0.1, q.fw)); }
      if (E.capuz && (P.ereto || 0) > 0.2) { const q = quadro(0.1); out.push(crElip(at(0.1), [raio(3) * 0.5, raio(3) * 2.2, raio(3) * 3], q.fw, q.up)); }
      if (E.casco) { const q = quadro(0.5); out.push(crElip(crA(at(0.5), crMl(q.up, R * 0.25)), [R * 0.8, L * 0.4, R * 1.5], q.fw, q.up, { cor: "#5a4a2a" })); }
      if (pl === "dragao" && !E.oriental) for (let i = Math.round(N * 0.08); i < N - 1; i += 2) { const q = quadro(i / N); out.push(crPlaca(crA(sp[i], crMl(q.up, raio(i) * 0.85)), crA(sp[i], crMl(q.up, raio(i) * 0.85 + R * 0.35 * (1 - i / N))), raio(i) * 0.35, raio(i) * 0.08, q.fw, { cor: esc })); }
      if (E.oriental) { const q = quadro(0.03); for (const sx of [1, -1]) { let p = crA(sp[1], crMl(q.lat, sx * raio(1))), d = crN(crA(crMl(q.lat, sx), crMl(q.fw, 0.3))); for (let j = 0; j < 5; j++) { const b = crA(p, crMl(d, R * 0.9)); out.push(crTubo(p, b, R * 0.05, R * 0.04)); p = b; d = crN(crA(crMl(d, 0.8), crMl(q.fw, -0.5))); } } }
    } else {
      /* ===== OSSOS: crânio, vértebras, costelas, cinturas ===== */
      const fw = crN(crS(sp[0], sp[2])), up = quadro(0.02).up; out.push(crElip(sp[1], [raio(1) * 0.8, raio(1) * 0.65, raio(1) * 1.1], fw, up), crTubo(sp[0], crA(sp[1], crMl(up, -raio(1) * 0.4)), raio(1) * 0.15, raio(1) * 0.1));
      for (let i = 2; i < N; i++) { out.push(crTubo(sp[i], sp[i + 1], ob, ob), crElip(sp[i], [ob * 1.6, ob * 1.6, ob * 1.6])); }
      const t0 = pl === "serpente" ? 0.08 : pl === "dragao" ? 0.3 : 0.2, t1 = pl === "serpente" ? 0.8 : pl === "dragao" ? 0.55 : pl === "peixe" || pl === "cetaceo" ? 0.6 : 0.5;
      for (let i = Math.round(N * t0); i <= Math.round(N * t1); i += pl === "serpente" ? 1 : 1) { const q = quadro(i / N); out.push({ toro: true, c: crA(sp[i], crMl(q.up, -raio(i) * 0.3)), Rm: raio(i) * 0.75, rt: ob * 0.5, ra: ob * 0.5, R: crEixo(q.fw) }); }
    }
    /* nadadeiras (peixe/cetáceo) e cauda */
    if (pl === "peixe" || pl === "cetaceo") { const q = quadro(0.4), t = sp[N], qt = quadro(0.98), bat = Math.sin((P.fase || 0) * 6.28) * 15 * CR_D + (P.nadadeiras || 0) * CR_D;
      const vert = pl === "peixe" || E.tubarao, cauda = R * (pl === "cetaceo" ? 1.4 : 1.2), espF = Math.max(0.01, R * 0.06);
      if (!E.pinipede) for (const s of [1, -1]) { const dir = vert ? crN(crA(crMl(qt.up, s), crMl(qt.fw, -0.9))) : crN(crA(crMl(qt.lat, s), crMl(qt.fw, -0.6))); out.push(crPlaca(t, crA(t, crMl(dir, cauda)), cauda * 0.45, espF, qt.fw, { cor: ossos ? undefined : E.cor })); }
      else for (const s of [1, -1]) out.push(crPlaca(t, crA(t, crMl(crN(crA(crMl(qt.lat, s * 0.6), crMl(qt.fw, -1))), R * 1.0)), R * 0.5, espF, qt.up));
      if (!E.pinipede && (pl === "peixe" || E.dorsalAlta || pl === "cetaceo")) { const qd = quadro(0.42), h = R * (E.dorsalAlta ? 1.3 : pl === "cetaceo" ? 0.6 : 0.8); out.push(crPlaca(crA(at(0.42), crMl(qd.up, raio(Math.round(0.42 * N)) * 0.85)), crA(crA(at(0.5), crMl(qd.up, raio(Math.round(0.5 * N)) * 0.6 + h)), crMl(qd.fw, -h * 0.4)), R * 0.6, espF, qd.fw)); }
      for (const sx of [1, -1]) { const qp = quadro(0.3), b = crA(at(0.3), crA(crMl(qp.lat, sx * raio(Math.round(0.3 * N)) * 0.8), crMl(qp.up, -raio(Math.round(0.3 * N)) * 0.5))), d = crN(crA(crA(crMl(qp.lat, sx * Math.cos(bat)), crMl(qp.up, -0.5 + Math.sin(bat))), crMl(qp.fw, -0.6)));
        out.push(crPlaca(b, crA(b, crMl(d, R * (pl === "cetaceo" ? 0.9 : 0.7))), R * 0.4, espF, qp.fw)); } }
  }
  /* ---------- membros ---------- */
  const membros = crMembros(E, L, R);
  membros.forEach((m, idx) => { for (const sx of [1, -1]) { const J = crMembro(S, m, sx, idx), r0 = Math.max(ob, R * (pl === "primata" ? (m.braco ? 0.4 : 0.46) : m.tipo === "sagital" ? (m.perna ? 0.35 : 0.22) : 0.2)) * (m.salto ? 1.2 : 1);
      if (m.tipo === "nadadeira") { out.push(crPlaca(J.base, J.j2, R * 0.45, R * 0.08, crMl(J.lat, 1))); mn.push(J.j2[1]); continue; }
      if (!ossos) out.push(crTubo(J.base, J.j1, r0 * 1.15, r0 * 0.85), crTubo(J.j1, J.j2, r0 * 0.8, r0 * 0.55), crElip(J.j1, [r0 * 0.85, r0 * 0.85, r0 * 0.85]));
      else out.push(crTubo(J.base, J.j1, ob, ob), crTubo(J.j1, J.j2, ob * 0.9, ob * 0.8), crElip(J.j1, [ob * 1.5, ob * 1.5, ob * 1.5]), crElip(J.base, [ob * 1.8, ob * 1.8, ob * 1.8]));
      /* pé: dedos com garras */
      const nd = m.braco && S.pl === "teropode" ? 2 : 3, ld = Math.max(m.seg[2], r0);
      for (let d = 0; d < nd; d++) { const a = (d - (nd - 1) / 2) * 0.45, dir = crN(crA(crMl(J.dirs[2], Math.cos(a)), crMl(crN(crX([0, 1, 0], J.dirs[2])), Math.sin(a)))); const p1 = crA(J.j2, crMl(dir, ld)); out.push(crTubo(J.j2, p1, r0 * 0.35, r0 * 0.15, { cor: m.garra || E.garraPe ? undefined : undefined }));
        if (m.garra || E.garraPe || S.pl === "teropode") out.push(crTubo(p1, crA(p1, crMl(crN(crA(dir, [0, -0.8, 0])), ld * 0.35)), r0 * 0.15, 0.005, { cor: esc })); mn.push(p1[1] - r0 * 0.15); }
      mn.push(J.j2[1] - r0 * 0.4); } });
  if (pl === "reptil" || pl === "serpente" || pl === "dragao") for (let i = Math.round(N * 0.12); i <= N; i++) mn.push(sp[i][1] - raio(i) * (pl === "reptil" ? 0.75 : 0.85));
  if (pl === "cetaceo" || pl === "peixe") for (let i = 0; i <= N; i++) mn.push(sp[i][1] - raio(i));
  /* ---------- asas de membrana ---------- */
  if (pl === "dragao" && (E.env || 0) > 0) for (const sx of [1, -1]) { const W = crAsa(S, sx), rb = Math.max(ob, R * 0.12), espM = Math.max(0.01, R * 0.03);
    out.push(crTubo(W.ombro, W.cot, rb * 1.2, rb), crTubo(W.cot, W.punho, rb, rb * 0.8)); W.dedos.forEach(d => out.push(crTubo(W.punho, d, rb * 0.6, rb * 0.15)));
    if (!ossos) { const pts = [W.punho, ...W.dedos, W.flanco], cor = "#3a1818";
      for (let j = 1; j < pts.length - 1; j++) { const a = pts[j], b = pts[j + 1], m = crMl(crA(a, b), 0.5), larg = Math.hypot(...crS(a, b)) * 0.95; out.push(crPlaca(W.punho, m, larg * 0.62, espM, crN(crS(a, b)), { cor }), crPlaca(crMl(crA(W.punho, m), 0.5), m, larg, espM, crN(crS(a, b)), { cor })); }
      out.push(crPlaca(W.ombro, crMl(crA(W.punho, W.flanco), 0.5), Math.hypot(...crS(W.punho, W.flanco)) * 0.7, espM, crN(crS(W.punho, W.flanco)), { cor })); } }
  /* ---------- chão: o ponto mais baixo em y = 0 (ou "voo" metros acima; na água, a altura escolhida) ---------- */
  const pisa = mn.length ? Math.min(...mn) : Math.min(...sp.map((p, i) => p[1] - raio(i))), dy = -pisa + 0.02 + (P.voo || 0) * CR_M;
  out.forEach(b => { b.c = [b.c[0], b.c[1] + dy, b.c[2]]; }); out.dy = dy; out.pisa = pisa; return out;
}
/* um ponto no mundo: sela (costas), cabeca, boca, cauda, pes, frente, tras */
function crPontoMundo(o, ponto, g0 = 0) { const S = crEsqueleto(o), dy = crPartes(o).dy || 0, q = S.quadro(0.42), r = S.raio(Math.round(0.42 * S.N));
  let loc = ponto === "cabeca" ? S.sp[1] : ponto === "boca" || ponto === "frente" ? S.sp[0] : ponto === "cauda" || ponto === "tras" ? S.sp[S.N] : ponto === "pes" ? [S.sp[Math.round(S.N / 2)][0], -dy, S.sp[Math.round(S.N / 2)][2]] : crA(S.at(S.pl === "dragao" ? 0.38 : 0.42), crMl(q.up, r * 0.95));
  const g = (o.giro || 0) * CR_D, c = Math.cos(g), s = Math.sin(g), v = [loc[0], loc[1] + dy, loc[2]]; return [o.x + v[0] * c + v[2] * s, g0 + (o.base || 0) + v[1], o.z - v[0] * s + v[2] * c]; }
function crMedidas(especie, escala = 1) { const E = CR_ESPECIES[crEspecie(especie)] || CR_ESPECIES.lagarto, k = escala * CR_M;
  const alt = E.plano === "teropode" || E.plano === "primata" ? (E.h || 1) * 1.3 : E.plano === "cefalopode" ? E.R * 4 : E.plano === "artropode" ? E.R * 3 : E.R * (E.plano === "dragao" ? 4 : 2.4);
  return { larg: Math.max(E.R * 3, (E.env || 0) * 0.35, E.plano === "artropode" ? E.R * 8 : 0) * k, prof: E.L * k, alt: alt * k }; }
export { crAsaQuadrupede, CR_ESPECIES, CR_SINONIMOS, crEspecie, crPosePadrao, crEsqueleto, crPartes, crPontoMundo, crMedidas };
