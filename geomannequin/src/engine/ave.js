/* GeoMannequin — manequim de AVE (bípede com asas): galinha, galo, pato, ganso, cisne, pombo, corvo, gaivota, coruja, águia,
   falcão, papagaio, flamingo, pinguim, avestruz, beija-flor — e qualquer uma em escala (águia gigante = roca, para montar).
   ESQUELETO: corpo (quilha/esterno) que inclina; pescoço em 3 segmentos (curva em S); cabeça que gira (coruja até 270°) com bico que
   abre; ASAS de 3 ossos (úmero → cotovelo → ulna → punho → mão) com penas secundárias (no antebraço) e primárias (na mão), que
   dobram em Z junto ao corpo ou abrem por inteiro, batem (para cima/baixo) e varrem (para a frente/trás); cauda em leque que abre;
   PERNAS: fêmur (escondido no corpo) → joelho → tibiotarso ("coxinha") → articulação intertarsal (o "joelho ao contrário") →
   tarsometatarso → dedos (3 para a frente e 1 para trás; papagaio/coruja 2+2; pato palmado; avestruz 2 dedos).
   Coordenadas locais (R ≈ 11,4 cm): x = esquerda da ave, y = cima, z = frente. Pose em graus; voo em metros. */
const AV_M = 1 / 0.114, AV_D = Math.PI / 180;
/* medidas em metros: h (altura em pé até o alto da cabeça), c (corpo), w (largura), env (envergadura), n (pescoço), na (ângulo do pescoço),
   cab (cabeça), bico, perna (tíbia+tarso), cauda, inc (inclinação do corpo em pé, + = frente para cima), dedos, cor */
const AV_ESPECIES = {
  galinha: { h: 0.45, c: 0.32, w: 0.2, env: 0.7, n: 0.12, na: 70, cab: 0.07, bico: 0.03, perna: 0.17, cauda: 0.13, inc: 10, dedos: "aniso", cor: "#c9874a", crista: 0.03, voa: 0.2 },
  galo: { h: 0.6, c: 0.36, w: 0.22, env: 0.8, n: 0.16, na: 72, cab: 0.08, bico: 0.035, perna: 0.22, cauda: 0.3, inc: 18, dedos: "aniso", cor: "#a8452c", crista: 0.06, voa: 0.2, caudaSobe: 40 },
  pato: { h: 0.45, c: 0.38, w: 0.2, env: 0.9, n: 0.14, na: 55, cab: 0.08, bico: 0.06, perna: 0.1, cauda: 0.08, inc: 5, dedos: "palmado", cor: "#e8e2d2", bicoChato: true, voa: 1 },
  ganso: { h: 0.8, c: 0.5, w: 0.26, env: 1.6, n: 0.35, na: 65, cab: 0.1, bico: 0.07, perna: 0.16, cauda: 0.1, inc: 8, dedos: "palmado", cor: "#d8d4cc", bicoChato: true, voa: 1 },
  cisne: { h: 1.1, c: 0.65, w: 0.32, env: 2.2, n: 0.6, na: 75, cab: 0.12, bico: 0.09, perna: 0.13, cauda: 0.12, inc: 2, dedos: "palmado", cor: "#f4f4f0", bicoChato: true, voa: 1, pescocoS: 30 },
  pombo: { h: 0.3, c: 0.22, w: 0.13, env: 0.65, n: 0.06, na: 60, cab: 0.05, bico: 0.018, perna: 0.06, cauda: 0.11, inc: 15, dedos: "aniso", cor: "#8a8f9e", voa: 1 },
  corvo: { h: 0.45, c: 0.3, w: 0.14, env: 1.0, n: 0.07, na: 50, cab: 0.07, bico: 0.06, perna: 0.12, cauda: 0.2, inc: 20, dedos: "aniso", cor: "#26262c", voa: 1 },
  gaivota: { h: 0.4, c: 0.32, w: 0.15, env: 1.4, n: 0.07, na: 50, cab: 0.07, bico: 0.05, perna: 0.1, cauda: 0.13, inc: 15, dedos: "palmado", cor: "#eeeeea", voa: 1 },
  coruja: { h: 0.5, c: 0.32, w: 0.24, env: 1.1, n: 0.04, na: 85, cab: 0.13, bico: 0.025, perna: 0.1, cauda: 0.13, inc: 60, dedos: "zigo", cor: "#9b7a55", face: true, orelhas: 0.04, voa: 1 },
  aguia: { h: 0.85, c: 0.6, w: 0.3, env: 2.1, n: 0.12, na: 60, cab: 0.12, bico: 0.07, perna: 0.22, cauda: 0.3, inc: 35, dedos: "aniso", cor: "#6b4a2c", cabecaCor: "#f2efe6", voa: 1, garras: true, montaria: true },
  falcao: { h: 0.45, c: 0.35, w: 0.18, env: 1.1, n: 0.06, na: 65, cab: 0.07, bico: 0.03, perna: 0.13, cauda: 0.18, inc: 40, dedos: "aniso", cor: "#7a6a5a", voa: 1, garras: true },
  papagaio: { h: 0.4, c: 0.25, w: 0.14, env: 0.7, n: 0.06, na: 75, cab: 0.08, bico: 0.045, perna: 0.06, cauda: 0.28, inc: 55, dedos: "zigo", cor: "#3aa04a", voa: 1, bicoCurvo: true },
  flamingo: { h: 1.3, c: 0.45, w: 0.22, env: 1.5, n: 0.65, na: 80, cab: 0.08, bico: 0.12, perna: 0.85, cauda: 0.12, inc: 5, dedos: "palmado", cor: "#f08aa0", voa: 1, pescocoS: 45, bicoCurvo: true },
  pinguim: { h: 0.75, c: 0.38, w: 0.3, env: 0.75, n: 0.05, na: 85, cab: 0.11, bico: 0.07, perna: 0.06, cauda: 0.05, inc: 80, dedos: "palmado", cor: "#22242c", barriga: "#f2f2ee", nadadeira: true, voa: 0 },
  avestruz: { h: 2.4, c: 1.0, w: 0.6, env: 1.8, n: 0.95, na: 80, cab: 0.13, bico: 0.1, perna: 1.1, cauda: 0.3, inc: 10, dedos: "dois", cor: "#2a2624", voa: 0, montaria: true, bicoChato: true },
  beijaflor: { h: 0.1, c: 0.07, w: 0.03, env: 0.12, n: 0.01, na: 60, cab: 0.018, bico: 0.03, perna: 0.01, cauda: 0.03, inc: 20, dedos: "aniso", cor: "#2c9a8c", voa: 1 }
};
const AV_SINONIMOS = { "beija-flor": "beijaflor", "beija flor": "beijaflor", colibri: "beijaflor", "águia": "aguia", "falcão": "falcao", gaviao: "falcao", "gavião": "falcao", arara: "papagaio", periquito: "papagaio", "pinguim": "pinguim", "pingüim": "pinguim",
  "pomba": "pombo", "corvo": "corvo", "gralha": "corvo", "galinha": "galinha", frango: "galinha", "garca": "flamingo", "garça": "flamingo", ema: "avestruz", "pássaro": "pombo", passaro: "pombo", ave: "pombo", roca: "aguia", "roc": "aguia", fenix: "aguia", "fênix": "aguia", "cisne": "cisne" };
const avEh = nome => !!AV_ESPECIES[nome];
/* pose padrão: asas {abre 0..1, bate (+ cima), varre (+ frente)}, pernas [fêmur, tibiotarso, tarso, dedos] (somam ao descanso) */
function avPosePadrao() { return { pescoco: 0, pescocoCurva: 0, cabeca: 0, cabecaGiro: 0, bico: 0, corpoInclina: 0, corpoAltura: 0, rolo: 0, voo: 0, cauda: 0, caudaAbre: 0, recolhe: 0, agacha: 0,
  asaE: { abre: 0, bate: 0, varre: 0 }, asaD: { abre: 0, bate: 0, varre: 0 }, pernas: { pe: [0, 0, 0, 0], pd: [0, 0, 0, 0] } }; }
const avAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], avMul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], avSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const avNorm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); }, avCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const avRot = (v, ax, a) => { const c = Math.cos(a), s = Math.sin(a); return ax === "x" ? [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c] : ax === "y" ? [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c] : [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; };
function avEixo(d, lado) { const L = Math.hypot(...d) || 1, Y = d.map(v => v / L); let X = lado || (Math.abs(Y[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]); const dt = X[0] * Y[0] + X[1] * Y[1] + X[2] * Y[2]; X = avNorm([X[0] - Y[0] * dt, X[1] - Y[1] * dt, X[2] - Y[2] * dt]); const Z = avCross(X, Y); return [X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]]; }
const avTubo = (a, b, r, r1, extra) => { const d = avSub(b, a), L = Math.hypot(...d); return Object.assign({ cil: true, c: avMul(avAdd(a, b), 0.5), r, r1: r1 ?? r, hh: L / 2, R: avEixo(d) }, extra || {}); };
/* pena/placa: caixa fina do ponto a ao b, larga "larg" na direção "lado" (no plano da asa), fina na normal */
const avPena = (a, b, larg, esp, lado, extra) => { const d = avSub(b, a), L = Math.hypot(...d); return Object.assign({ c: avMul(avAdd(a, b), 0.5), h: [larg / 2, L / 2, esp / 2], R: avEixo(d, lado) }, extra || {}); };

function avEsqueleto(o) {
  const A = o.animal || {}, E = Object.assign({}, AV_ESPECIES[A.especie] || AV_ESPECIES.pombo, A.p || {}), k = (A.escala || 1) * AV_M, P0 = avPosePadrao(), Pp = A.pose || {};
  const P = Object.assign({}, P0, Pp, { asaE: Object.assign({}, P0.asaE, Pp.asaE || {}), asaD: Object.assign({}, P0.asaD, Pp.asaD || {}), pernas: Object.assign({}, P0.pernas, Pp.pernas || {}) });
  const c = E.c * k, w = E.w * k, bh = Math.max(w * 0.9, c * 0.55), Lg = E.perna * k, env = E.env * k;
  /* altura do centro do corpo: a perna em descanso + meio corpo; agachar abaixa */
  const inc = (E.inc + (P.corpoInclina || 0)) * AV_D, ctr = [0, 0, 0], corpo = v => avRot(v, "x", -inc);
  /* pernas */
  const Lf = Math.min(Lg * 0.28, bh * 0.4), Lt = Lg * 0.55, Ls = Lg * 0.45, Ld = Math.max(Lg * 0.28, c * 0.18), rec = Math.max(0, Math.min(1, P.recolhe || 0)), ag = Math.max(0, Math.min(1, P.agacha || 0));
  const pernas = {}; for (const [kk, sx] of [["pe", 1], ["pd", -1]]) { const a = P.pernas[kk] || [0, 0, 0, 0], hip = corpo([sx * w * 0.28, -bh * 0.3, -c * 0.05]), dir = t => [0, -Math.cos(t), Math.sin(t)];
    /* descanso: fêmur para a frente, tibiotarso para trás, tarso para a frente (quase vertical), dedos na horizontal; recolhido (voando): tudo para trás */
    const a1 = (55 + 30 * ag - 20 * rec + (a[0] || 0)) * AV_D, a2 = a1 + (-85 - 40 * ag - 30 * rec + (a[1] || 0)) * AV_D, a3 = a2 + (45 + 55 * ag - 70 * rec + (a[2] || 0)) * AV_D, a4 = 90 * AV_D - rec * 120 * AV_D + (a[3] || 0) * AV_D;
    const j1 = avAdd(hip, avMul(dir(a1), Lf)), j2 = avAdd(j1, avMul(dir(a2), Lt)), j3 = avAdd(j2, avMul(dir(a3), Ls)), dedo = avAdd(j3, avMul(dir(a4), Ld));
    pernas[kk] = { hip, joelho: j1, intertarsal: j2, pe: j3, dedo, sx }; }
  /* pescoço em 3 segmentos (curva: S) e cabeça */
  const nBase = corpo([0, bh * 0.25, c * 0.42]), na = (E.na + (P.pescoco || 0)) * AV_D, curva = ((E.pescocoS || 0) + (P.pescocoCurva || 0)) * AV_D, gy = (P.cabecaGiro || 0) * AV_D;
  const pes = [nBase]; for (let i = 0; i < 3; i++) { const a = na + curva * (1 - i) * 0.9, d = [0, Math.sin(a), Math.cos(a)]; pes.push(avAdd(pes[i], avMul(d, (E.n * k) / 3))); }
  const nTopo = pes[3], ha = (E.na < 70 ? 0 : -10) * AV_D + (P.cabeca || 0) * AV_D - curva * 0.3, cDir = avRot([0, Math.sin(ha), Math.cos(ha)], "y", gy), rc = E.cab * k * 0.5, cab = avAdd(nTopo, avMul(cDir, rc * 0.3)), bicoBase = avAdd(cab, avMul(cDir, rc * 0.85));
  /* asas: ombro, cotovelo, punho, ponta */
  const sp = Math.max(c * 0.4, env / 2 - w / 2), Lh = sp * 0.27, Lu = sp * 0.31, Lm = sp * 0.42, asas = {};
  for (const [kk, sx] of [["asaE", 1], ["asaD", -1]]) { const W = P[kk], ab = Math.max(0, Math.min(1, W.abre ?? 0)), mix = (f, a) => avNorm(f.map((v, i) => v + (a[i] - v) * ab));
    let dh = mix([sx * 0.25, -0.2, -1], [sx * 1, 0.05, -0.12]), du = mix([sx * 0.18, 0.05, 1], [sx * 1, 0, 0.12]), dm = mix([sx * 0.12, 0.08, -1], [sx * 1, 0, -0.25]);
    const R = v => { let u = avRot(v, "z", sx * (W.bate || 0) * AV_D * Math.min(1, 0.3 + ab)); u = avRot(u, "y", sx * (W.varre || 0) * AV_D); return u; };
    dh = R(dh); du = R(du); dm = R(dm);
    const ombro = corpo([sx * w * 0.42, bh * 0.28, c * 0.18]), cot = avAdd(ombro, corpo(avMul(dh, Lh))), punho = avAdd(cot, corpo(avMul(du, Lu))), ponta = avAdd(punho, corpo(avMul(dm, Lm)));
    const N = corpo(avRot(avRot([0, 1, 0], "z", sx * (W.bate || 0) * AV_D * Math.min(1, 0.3 + ab)), "y", sx * (W.varre || 0) * AV_D));
    asas[kk] = { ombro, cot, punho, ponta, N, ab, sx }; }
  /* cauda em leque */
  const rabo = corpo([0, bh * 0.05, -c * 0.46]), ca = ((E.caudaSobe || 0) + (P.cauda || 0) + 8) * AV_D, cdir = corpo([0, Math.sin(ca), -Math.cos(ca)]);
  /* ponto de montar (costas) */
  const sela = corpo([0, bh * 0.52, 0]);
  return { E, k, c, w, bh, inc, corpo, pernas, asas, pes, nTopo, cDir, cab, rc, bicoBase, rabo, cdir, sela, P, Lg };
}
function avPartes(o) {
  const S = avEsqueleto(o), { E, k, c, w, bh, corpo, pernas, asas, pes, cDir, cab, rc, bicoBase, rabo, cdir, P } = S, out = [], esc = "escuro", ossos = !!(o.animal && o.animal.ossos);
  const espP = Math.max(0.02, w * 0.04), pr = Math.max(0.04, E.perna * k * 0.09 + w * 0.03);
  if (!ossos) {
    /* corpo (ovo) e peito; pinguim: barriga clara */
    out.push({ esf: true, c: corpo([0, 0, 0]), r: [w / 2, bh / 2, c / 2], R: avEixo(corpo([0, 1, 0])) });
    out.push({ esf: true, c: corpo([0, bh * 0.05, c * 0.25]), r: [w * 0.45, bh * 0.45, c * 0.3] });
    /* pescoço */
    for (let i = 0; i < 3; i++) out.push(avTubo(pes[i], pes[i + 1], Math.max(rc * 0.55, w * 0.32) * (1 - i * 0.15), Math.max(rc * 0.5, w * 0.28) * (1 - (i + 1) * 0.15)));
    /* cabeça, face (coruja), crista, bico (abre) */
    out.push({ esf: true, c: cab, r: [rc, rc * 1.05, rc * 1.1] });
    if (E.face) out.push({ cil: true, c: avAdd(cab, avMul(cDir, rc * 0.7)), r: rc * 0.85, hh: rc * 0.08, R: avEixo(cDir), cor: esc });
    if (E.orelhas) for (const sx of [1, -1]) out.push(avTubo(avAdd(cab, [sx * rc * 0.5, rc * 0.7, 0]), avAdd(cab, [sx * rc * 0.7, rc * 0.7 + E.orelhas * k, -rc * 0.2]), rc * 0.18, 0.02));
    if (E.crista) out.push({ c: avAdd(cab, [0, rc * 1.0, rc * 0.2]), h: [rc * 0.12, E.crista * k * 0.5, rc * 0.5], R: avEixo([0, 1, 0]), cor: "#d0302a" });
    const bL = E.bico * k, bo = Math.max(0, Math.min(1, P.bico || 0)), baixo = avNorm(avCross(avCross(cDir, [0, 1, 0]), cDir)), bAb = avNorm(avAdd(cDir, avMul(baixo, Math.tan(bo * 30 * AV_D))));
    const pontaB = E.bicoCurvo ? avAdd(avAdd(bicoBase, avMul(cDir, bL)), avMul(baixo, bL * 0.35)) : avAdd(bicoBase, avMul(cDir, bL));
    out.push(avTubo(bicoBase, pontaB, rc * (E.bicoChato ? 0.45 : 0.35), E.bicoChato ? rc * 0.25 : 0.01, { cor: E.bicoChato ? "#e0a020" : esc }));
    out.push(avTubo(avAdd(bicoBase, avMul(baixo, rc * 0.15)), avAdd(avAdd(bicoBase, avMul(baixo, rc * 0.15)), avMul(bAb, bL * 0.85)), rc * 0.25, 0.01, { cor: E.bicoChato ? "#e0a020" : esc }));
    /* asas: ossos com penas (secundárias no antebraço, primárias em leque na mão); pinguim: nadadeira */
    for (const A of Object.values(asas)) { const { ombro, cot, punho, ponta, N, ab, sx } = A;
      const atras = (a, b) => { const d = avNorm(avSub(b, a)); let t = avNorm(avCross(N, d)); if (t[2] > 0 === (sx > 0)) { } if (avCross(d, t)[1] * sx < 0) t = avMul(t, -1); return t[2] > 0.3 ? avMul(t, -1) : t; };
      if (E.nadadeira) { out.push(avPena(ombro, punho, c * 0.22, espP * 2, atras(ombro, punho)), avPena(punho, ponta, c * 0.16, espP * 2, atras(punho, ponta))); continue; }
      out.push(avTubo(ombro, cot, pr * 1.2, pr), avTubo(cot, punho, pr, pr * 0.8));
      const corda = Math.max(c * 0.28, (Math.hypot(...avSub(punho, ombro))) * 0.45), t1 = atras(cot, punho), t0 = atras(ombro, cot);
      out.push(avPena(avAdd(ombro, avMul(t0, corda * 0.35)), avAdd(cot, avMul(t0, corda * 0.4)), corda * 0.7, espP, avNorm(avCross(N, avSub(cot, ombro)))));
      out.push(avPena(avAdd(cot, avMul(t1, corda * 0.45)), avAdd(punho, avMul(t1, corda * 0.45)), corda * 0.9, espP, avNorm(avCross(N, avSub(punho, cot)))));
      /* primárias: 5 penas da mão, em leque (abrem com a asa) */
      const dm = avNorm(avSub(ponta, punho)), Lm = Math.hypot(...avSub(ponta, punho)); const tm = atras(punho, ponta);
      for (let i = 0; i < 5; i++) { const f = i / 4, dir = avNorm(avAdd(avMul(dm, 1 - f * (0.25 + 0.45 * ab)), avMul(tm, f * (0.35 + 0.6 * ab)))), base = avAdd(punho, avMul(dm, Lm * 0.15 * (1 - f))), L = Lm * (1 - f * 0.18);
        out.push(avPena(base, avAdd(base, avMul(dir, L)), corda * 0.28, espP * 0.8, avNorm(avCross(N, dir)))); } }
    /* cauda em leque */
    const nC = 5, abre = (0.15 + 0.85 * Math.max(0, Math.min(1, P.caudaAbre || 0))) * 55 * AV_D, lat = corpo([1, 0, 0]);
    for (let i = 0; i < nC; i++) { const a = (i / (nC - 1) - 0.5) * abre, d = avNorm(avAdd(avMul(cdir, Math.cos(a)), avMul(lat, Math.sin(a)))); out.push(avPena(rabo, avAdd(rabo, avMul(d, E.cauda * k)), Math.max(w * 0.18, E.cauda * k * 0.22), espP, lat)); }
  } else {
    /* ===== modo OSSOS ===== */
    const ob = Math.max(0.03, pr * 0.45), osso = (a, b, f = 1) => avTubo(a, b, ob * f, ob * f * 0.8), junta = (p, f = 1) => ({ esf: true, c: p, r: [ob * 1.5 * f, ob * 1.5 * f, ob * 1.5 * f] });
    out.push({ esf: true, c: corpo([0, -bh * 0.1, c * 0.12]), r: [w * 0.08, bh * 0.38, c * 0.3], R: avEixo(corpo([0, 1, 0])) }); /* quilha (esterno) */
    out.push(osso(corpo([0, bh * 0.25, c * 0.42]), corpo([0, bh * 0.2, -c * 0.4]), 1.4), osso(corpo([0, bh * 0.2, -c * 0.4]), rabo, 1)); /* coluna e pigóstilo */
    for (let i = 0; i < 4; i++) { const z = c * (0.3 - i * 0.12); out.push({ toro: true, c: corpo([0, 0, z]), Rm: Math.min(w, bh) * 0.42, rt: ob * 0.5, ra: ob * 0.5, R: avEixo(corpo([0, 0, 1])) }); }
    for (let i = 0; i < 3; i++) out.push(osso(pes[i], pes[i + 1], 1.1), junta(pes[i]));
    out.push({ esf: true, c: cab, r: [rc * 0.8, rc * 0.8, rc * 0.9] }, avTubo(bicoBase, avAdd(bicoBase, avMul(cDir, E.bico * k)), rc * 0.25, 0.01));
    for (const A of Object.values(asas)) out.push(osso(A.ombro, A.cot, 1.2), junta(A.cot), osso(A.cot, A.punho, 1), junta(A.punho), osso(A.punho, A.ponta, 0.8));
  }
  /* pernas e dedos (iguais nos dois modos, com ossos finos no modo ossos) */
  const ob2 = Math.max(0.03, pr * 0.5), mn = [];
  for (const L of Object.values(pernas)) { const { hip, joelho, intertarsal, pe, dedo, sx } = L;
    if (!ossos) { const Lt = Math.hypot(...avSub(intertarsal, joelho)), coxa = Math.min(w * 0.2, Lt * 0.22) + pr * 0.6; out.push({ esf: true, c: avAdd(joelho, avMul(avSub(intertarsal, joelho), 0.38)), r: [coxa, Lt * 0.42, coxa * 1.1], R: avEixo(avSub(intertarsal, joelho)) }, avTubo(avAdd(joelho, avMul(avSub(intertarsal, joelho), 0.6)), intertarsal, pr * 0.9, pr * 0.8)); }
    else out.push(avTubo(hip, joelho, ob2, ob2), avTubo(joelho, intertarsal, ob2, ob2));
    out.push(avTubo(intertarsal, pe, ob2 * 0.9, ob2 * 0.75, { cor: ossos ? undefined : "#d9a640" }), { esf: true, c: intertarsal, r: [ob2 * 1.2, ob2 * 1.2, ob2 * 1.2] });
    const fr = avNorm(avSub(dedo, pe)), Ld = Math.hypot(...avSub(dedo, pe)), lat = [sx, 0, 0], tipo = E.dedos;
    const dedos = tipo === "dois" ? [[0.1, 1], [-0.25, 0.7]] : tipo === "zigo" ? [[0.25, 1], [-0.15, 0.9], [2.6, 0.7], [-2.6, 0.65]] : [[0.45, 0.9], [0, 1], [-0.45, 0.85], [Math.PI, 0.5]];
    for (const [a, f] of dedos) { const d = avNorm(avAdd(avMul(fr, Math.cos(a)), avMul(lat, Math.sin(a) * sx))); out.push(avTubo(pe, avAdd(pe, avMul(d, Ld * f)), ob2 * 0.55, ob2 * 0.3, { cor: E.garras ? esc : undefined })); mn.push(pe[1] + d[1] * Ld * f); }
    if (tipo === "palmado") out.push(avPena(pe, avAdd(pe, avMul(fr, Ld * 0.85)), Ld * 0.8, ob2 * 0.4, lat, { cor: "#e0a020" }));
    mn.push(pe[1]); }
  /* rolar (inclinar de lado no voo) */
  if (P.rolo) { const a = P.rolo * AV_D, cz = Math.cos(a), sz = Math.sin(a), Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
    const mm = (A, B) => [0, 1, 2].flatMap(i => [0, 1, 2].map(j => A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]));
    out.forEach(b => { b.c = avRot(b.c, "z", a); b.R = mm(Rz, b.R || [1, 0, 0, 0, 1, 0, 0, 0, 1]); }); }
  /* chão: o dedo mais baixo em y = 0 (ou "voo" metros acima) */
  const pisa = Math.min(...mn) - 0.02, dy = -pisa + 0.06 + (P.voo || 0) * AV_M;
  out.forEach(b => { b.c = [b.c[0], b.c[1] + dy, b.c[2]]; }); out.dy = dy; out.pisa = pisa; return out;
}
/* um ponto da ave no mundo: sela (costas), cabeca, bico, asaE/asaD (pontas), cauda, pes */
function avPontoMundo(o, ponto, g0 = 0) { const S = avEsqueleto(o), dy = avPartes(o).dy || 0;
  let loc = ponto === "cabeca" ? S.cab : ponto === "bico" ? avAdd(S.bicoBase, avMul(S.cDir, S.E.bico * S.k)) : ponto === "asaE" ? S.asas.asaE.ponta : ponto === "asaD" ? S.asas.asaD.ponta : ponto === "cauda" ? S.rabo : ponto === "pes" ? S.pernas.pe.pe : ponto === "frente" ? S.corpo([0, 0, S.c / 2]) : ponto === "tras" ? S.rabo : S.sela;
  if (S.P.rolo) loc = avRot(loc, "z", S.P.rolo * AV_D);
  const g = (o.giro || 0) * AV_D, c = Math.cos(g), s = Math.sin(g), v = [loc[0], loc[1] + dy, loc[2]]; return [o.x + v[0] * c + v[2] * s, g0 + (o.base || 0) + v[1], o.z - v[0] * s + v[2] * c]; }
function avMedidas(especie, escala = 1) { const E = AV_ESPECIES[especie] || AV_ESPECIES.pombo, k = escala * AV_M; return { larg: Math.max(E.w, E.env * 0.5) * k, prof: (E.c + E.cauda + E.bico + 0.2 * E.n) * k, alt: E.h * k }; }
export { AV_ESPECIES, AV_SINONIMOS, avEh, avPosePadrao, avEsqueleto, avPartes, avPontoMundo, avMedidas };
