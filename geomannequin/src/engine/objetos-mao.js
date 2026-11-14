/* GeoMannequin — OBJETOS DE MÃO: armas (lâminas, contusão, haste, arremesso, distância, de fogo), escudos, objetos mágicos,
   instrumentos musicais e objetos do dia a dia. Mesmo formato dos compostos (partes sólidas + pegas), mais os PONTOS:
   marcos nomeados do objeto (ponta, lâmina, fio, cano, boca, chama, cabeça, corda…) em coordenadas locais, para os efeitos
   saírem do lugar certo (ponto A) e para o rastro do golpe. Pivô = centro da base; y local = eixo comprido (o cabo embaixo).
   1 R ≈ 11,4 cm. Toda parte é sólida: a mão encosta na superfície (pegadas) e o corpo não atravessa (colisão). */

const omU = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
const omX = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function omRot(d) { const Y = omU(d); let X = Math.abs(Y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; X = omX(X, Y); const k = X[0] * Y[0] + X[1] * Y[1] + X[2] * Y[2]; X = omU(X.map((v, i) => v - k * Y[i])); const Z = omX(X, Y); return [X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]]; }
const omTubo = (a, b, r, r1, extra) => { const d = b.map((v, i) => v - a[i]), L = Math.hypot(...d); return Object.assign({ cil: true, c: a.map((v, i) => (v + b[i]) / 2), r, hh: L / 2, R: omRot(d) }, r1 !== undefined && r1 !== null ? { r1 } : {}, extra || {}); };
const omCil = (y0, y1, r, r1, extra) => Object.assign({ cil: true, c: [0, (y0 + y1) / 2, 0], r, hh: (y1 - y0) / 2 }, r1 !== undefined && r1 !== null ? { r1 } : {}, extra || {});
const omCx = (c, h, extra) => Object.assign({ c, h }, extra || {});
const omEsf = (c, r, extra) => Object.assign({ esf: true, c, r: Array.isArray(r) ? r : [r, r, r] }, extra || {});
const omToro = (c, R, rt, eixo, extra) => Object.assign({ toro: true, c, Rm: R, rt, ra: rt, R: omRot(eixo) }, extra || {});
const omPega = (P, N, eixo) => ({ P, N: omU(N), eixo: omU(eixo) });
/* pega de cabo ao longo de y (palma vira para +z) */
const omCabo = y => omPega([0, y, 0], [0, 0, 1], [0, 1, 0]);
/* lâmina: caixas afinando até a ponta (fio = x, espessura = z) */
function omLamina(y0, y1, larg, esp, curva = 0, n = 6) { const out = []; for (let i = 0; i < n; i++) { const a = i / n, b = (i + 1) / n, ya = y0 + (y1 - y0) * a, yb = y0 + (y1 - y0) * b, w = larg * (1 - 0.85 * Math.pow(b, 3)), x = curva * (a + b) * (a + b) / 4;
  out.push(omCx([x, (ya + yb) / 2, 0], [w / 2, (yb - ya) / 2 + 0.01, esp / 2])); } return out; }

/* grupo: arma-lamina | arma-contusao | arma-haste | arma-arremesso | arma-distancia | arma-fogo | escudo | magico | instrumento | cotidiano */
const OBJ_MAO = {
  /* ===== lâminas ===== */
  katana: { nome: "katana", larg: 0.9, prof: 0.4, alt: 9, grupo: "arma-lamina", pega: "cabo", duasMaos: true,
    partes: o => [omCil(0, 2.2, 0.14), omCil(2.2, 2.3, 0.45, null, { R: omRot([0, 1, 0]) }), ...omLamina(2.3, o.alt, 0.32, 0.07, 0.35)],
    pegas: () => ({ cabo: omCabo(1.6), cabo2: omCabo(0.55) }), pontos: o => ({ ponta: [0.35, o.alt, 0], lamina: [0.15, (o.alt + 2.3) / 2, 0], base: [0, 2.35, 0], cabo: [0, 1.1, 0] }) },
  espadaLonga: { nome: "espada longa (montante)", larg: 2, prof: 0.4, alt: 11, grupo: "arma-lamina", pega: "cabo", duasMaos: true,
    partes: o => [omCil(0, 2.4, 0.15), omEsf([0, 0, 0], 0.3), omCx([0, 2.5, 0], [1, 0.12, 0.15]), ...omLamina(2.6, o.alt, 0.5, 0.09, 0, 5)],
    pegas: () => ({ cabo: omCabo(1.8), cabo2: omCabo(0.6) }), pontos: o => ({ ponta: [0, o.alt, 0], lamina: [0, (o.alt + 2.6) / 2, 0], base: [0, 2.7, 0], cabo: [0, 1.2, 0] }) },
  espadaCurta: { nome: "espada curta (gládio)", larg: 1.4, prof: 0.4, alt: 6, grupo: "arma-lamina", pega: "cabo",
    partes: o => [omCil(0, 1.2, 0.14), omEsf([0, 0, 0], 0.25), omCx([0, 1.3, 0], [0.7, 0.1, 0.14]), ...omLamina(1.4, o.alt, 0.5, 0.08, 0, 4)],
    pegas: () => ({ cabo: omCabo(0.6) }), pontos: o => ({ ponta: [0, o.alt, 0], lamina: [0, (o.alt + 1.4) / 2, 0], base: [0, 1.5, 0], cabo: [0, 0.6, 0] }) },
  sabre: { nome: "sabre", larg: 1.2, prof: 0.4, alt: 8, grupo: "arma-lamina", pega: "cabo",
    partes: o => [omCil(0, 1.2, 0.13), omToro([0.35, 0.7, 0], 0.5, 0.05, [0, 0, 1]), ...omLamina(1.3, o.alt, 0.3, 0.06, 0.6)],
    pegas: () => ({ cabo: omCabo(0.6) }), pontos: o => ({ ponta: [0.6, o.alt, 0], lamina: [0.25, (o.alt + 1.3) / 2, 0], base: [0, 1.4, 0], cabo: [0, 0.6, 0] }) },
  adaga: { nome: "adaga / faca", larg: 0.8, prof: 0.3, alt: 3.2, grupo: "arma-lamina", pega: "cabo",
    partes: o => [omCil(0, 1.1, 0.12), omCx([0, 1.15, 0], [0.4, 0.06, 0.1]), ...omLamina(1.2, o.alt, 0.32, 0.05, 0, 3)],
    pegas: () => ({ cabo: omCabo(0.55) }), pontos: o => ({ ponta: [0, o.alt, 0], lamina: [0, 2.2, 0], cabo: [0, 0.55, 0] }) },
  kunai: { nome: "kunai", larg: 0.6, prof: 0.2, alt: 2.4, grupo: "arma-arremesso", pega: "cabo",
    partes: o => [omToro([0, -0.25, 0], 0.22, 0.04, [0, 0, 1]), omCil(0, 0.9, 0.09), ...omLamina(0.9, o.alt, 0.4, 0.05, 0, 3)],
    pegas: () => ({ cabo: omCabo(0.45) }), pontos: o => ({ ponta: [0, o.alt, 0], argola: [0, -0.25, 0], cabo: [0, 0.45, 0] }) },
  shuriken: { nome: "shuriken (estrela)", larg: 1.0, prof: 0.1, alt: 1.0, grupo: "arma-arremesso", pega: "centro",
    partes: o => [0, 45].map(a => { const r = a * Math.PI / 180; return omCx([0, o.alt / 2, 0], [0.5, 0.12, 0.03], { R: [Math.cos(r), -Math.sin(r), 0, Math.sin(r), Math.cos(r), 0, 0, 0, 1] }); }).concat([0, 90].map(a => { const r = a * Math.PI / 180; return omCx([0, o.alt / 2, 0], [0.12, 0.5, 0.03], { R: [Math.cos(r), -Math.sin(r), 0, Math.sin(r), Math.cos(r), 0, 0, 0, 1] }); })),
    pegas: o => ({ centro: omPega([0, o.alt / 2, 0.05], [0, 0, 1], [1, 0, 0]) }), pontos: o => ({ ponta: [0, o.alt, 0], centro: [0, o.alt / 2, 0] }) },
  /* ===== contusão e haste ===== */
  martelo: { nome: "martelo de guerra", larg: 2, prof: 0.9, alt: 7, grupo: "arma-contusao", pega: "cabo", duasMaos: true,
    partes: o => [omCil(0, o.alt - 0.5, 0.15), omCx([0, o.alt - 0.5, 0], [1, 0.55, 0.45])], pegas: o => ({ cabo: omCabo(1.6), cabo2: omCabo(0.5) }),
    pontos: o => ({ cabeca: [0, o.alt - 0.5, 0], ponta: [1, o.alt - 0.5, 0], cabo: [0, 1.2, 0] }) },
  maca: { nome: "maça / clava", larg: 1.2, prof: 1.2, alt: 6, grupo: "arma-contusao", pega: "cabo",
    partes: o => [omCil(0, o.alt - 1, 0.14, 0.22), omEsf([0, o.alt - 0.6, 0], 0.6, { facetas: 8, semente: 4 })], pegas: () => ({ cabo: omCabo(0.8) }),
    pontos: o => ({ cabeca: [0, o.alt - 0.6, 0], ponta: [0, o.alt, 0], cabo: [0, 0.8, 0] }) },
  machadoDuplo: { nome: "machado duplo", larg: 3, prof: 0.4, alt: 8, grupo: "arma-contusao", pega: "cabo", duasMaos: true,
    partes: o => [omCil(0, o.alt, 0.15), omCx([0.8, o.alt - 1, 0], [0.75, 0.85, 0.06]), omCx([-0.8, o.alt - 1, 0], [0.75, 0.85, 0.06])], pegas: () => ({ cabo: omCabo(1.8), cabo2: omCabo(0.6) }),
    pontos: o => ({ cabeca: [0, o.alt - 1, 0], fio: [1.55, o.alt - 1, 0], ponta: [0, o.alt, 0], cabo: [0, 1.2, 0] }) },
  bastaoBo: { nome: "bastão bo", larg: 0.3, prof: 0.3, alt: 15, grupo: "arma-haste", pega: "meio", duasMaos: true,
    partes: o => [omCil(0, o.alt, 0.13)], pegas: o => ({ meio: omCabo(o.alt * 0.62), meio2: omCabo(o.alt * 0.38), cabo: omCabo(o.alt * 0.62) }),
    pontos: o => ({ ponta: [0, o.alt, 0], base: [0, 0, 0], meio: [0, o.alt / 2, 0] }) },
  foice: { nome: "foice", larg: 4, prof: 0.3, alt: 14, grupo: "arma-haste", pega: "cabo", duasMaos: true,
    partes: o => { const out = [omCil(0, o.alt, 0.14)], pt = t => [0.1 + 3.2 * t, o.alt - 0.35 - 1.5 * t * t, 0]; for (let i = 0; i < 6; i++) { const a = pt(i / 6), b = pt((i + 1) / 6), d = b.map((v, j) => v - a[j]), L = Math.hypot(...d), w = 0.42 * (1 - i / 7);
      out.push(omCx(a.map((v, j) => (v + b[j]) / 2).map((v, j) => j === 1 ? v - w * 0.6 : v), [w, L / 2 + 0.02, 0.04], { R: omRot(d) })); } return out; },
    pegas: o => ({ cabo: omCabo(o.alt * 0.55), cabo2: omCabo(o.alt * 0.2) }), pontos: o => ({ ponta: [3.3, o.alt - 1.85, 0], lamina: [1.6, o.alt - 1.0, 0], cabo: [0, o.alt * 0.4, 0] }) },
  tridente: { nome: "tridente", larg: 1.6, prof: 0.3, alt: 15, grupo: "arma-haste", pega: "cabo", duasMaos: true,
    partes: o => [omCil(0, o.alt - 1.4, 0.12), omCx([0, o.alt - 1.4, 0], [0.8, 0.1, 0.1]), ...[-0.7, 0, 0.7].map(x => omCil(o.alt - 1.4, o.alt, 0.07, 0.01, { c: [x, o.alt - 0.7, 0] }))],
    pegas: o => ({ cabo: omCabo(o.alt * 0.5), cabo2: omCabo(o.alt * 0.2) }), pontos: o => ({ ponta: [0, o.alt, 0], cabo: [0, o.alt * 0.4, 0] }) },
  nunchaku: { nome: "nunchaku", larg: 0.4, prof: 0.4, alt: 5.8, grupo: "arma-contusao", pega: "cabo",
    partes: o => [omCil(0, 2.6, 0.13), omTubo([0, 2.6, 0], [0, 3.2, 0], 0.03), omTubo([0, 3.2, 0], [0.3, 5.8, 0], 0.13)], pegas: () => ({ cabo: omCabo(1.2) }),
    pontos: o => ({ ponta: [0.3, 5.8, 0], corrente: [0, 2.9, 0], cabo: [0, 1.2, 0] }) },
  chicote: { nome: "chicote", larg: 4, prof: 0.2, alt: 12, grupo: "arma-contusao", pega: "cabo",
    partes: o => { const out = [omCil(0, 1.4, 0.13)]; let p = [0, 1.4, 0]; for (let i = 1; i <= 8; i++) { const q = [Math.sin(i * 0.4) * 1.6 + i * 0.25, 1.4 + i * (o.alt - 1.4) / 8, Math.cos(i * 0.5) * 0.3]; out.push(omTubo(p, q, 0.08 - i * 0.007)); p = q; } return out; },
    pegas: () => ({ cabo: omCabo(0.7) }), pontos: o => ({ ponta: [Math.sin(3.2) * 1.6 + 2, o.alt, Math.cos(4) * 0.3], cabo: [0, 0.7, 0] }) },
  /* ===== distância ===== */
  besta: { nome: "besta", larg: 4, prof: 1, alt: 5, grupo: "arma-distancia", pega: "punho", duasMaos: true,
    partes: o => [omCx([0, 2.5, 0], [0.2, 2.5, 0.25]), omCx([0, 4.6, 0], [2, 0.12, 0.12]), omTubo([-1.9, 4.5, 0], [0, 3.2, 0], 0.02), omTubo([1.9, 4.5, 0], [0, 3.2, 0], 0.02), omCx([0, 1.2, -0.45], [0.15, 0.5, 0.25])],
    pegas: () => ({ punho: omPega([0, 1.2, -0.7], [0, 0, -1], [0, 1, 0]), frente: omPega([0, 3.6, 0.3], [0, 0, 1], [0, 1, 0]), cabo: omPega([0, 1.2, -0.7], [0, 0, -1], [0, 1, 0]) }),
    pontos: o => ({ cano: [0, o.alt, 0], ponta: [0, o.alt, 0], corda: [0, 3.2, 0] }) },
  pistola: { nome: "pistola", larg: 0.4, prof: 2.4, alt: 1.8, grupo: "arma-fogo", pega: "punho",
    partes: o => [omCx([0, 0.65, -0.35], [0.16, 0.65, 0.28], { R: omRot([0, 1, -0.25]) }), omCx([0, 1.45, 0.45], [0.17, 0.25, 1.05])],
    pegas: () => ({ punho: omPega([0, 0.6, -0.33], [0, 0, -1], [0, 1, -0.25]), cabo: omPega([0, 0.6, -0.33], [0, 0, -1], [0, 1, -0.25]) }),
    pontos: () => ({ cano: [0, 1.5, 1.5], ponta: [0, 1.5, 1.5], gatilho: [0, 1.0, 0.1] }) },
  rifle: { nome: "rifle / fuzil", larg: 0.5, prof: 9, alt: 2, grupo: "arma-fogo", pega: "punho", duasMaos: true,
    partes: o => [omCx([0, 1.3, 0], [0.18, 0.3, 2.6]), omTubo([0, 1.45, 2.6], [0, 1.45, 5.4], 0.09), omCx([0, 1.05, -3.4], [0.16, 0.45, 1.0]), omCx([0, 0.6, -0.9], [0.14, 0.45, 0.22], { R: omRot([0, 1, -0.3]) }), omCx([0, 1.0, 1.4], [0.15, 0.25, 0.9])],
    pegas: () => ({ punho: omPega([0, 0.55, -0.88], [0, 0, -1], [0, 1, -0.3]), frente: omPega([0, 0.82, 1.4], [0, -1, 0], [0, 0, 1]), cabo: omPega([0, 0.55, -0.88], [0, 0, -1], [0, 1, -0.3]) }),
    pontos: () => ({ cano: [0, 1.45, 5.4], ponta: [0, 1.45, 5.4], coronha: [0, 1.05, -4.4] }) },
  /* ===== escudos (alça atrás, -z; frente +z) ===== */
  broquel: { nome: "broquel (escudo pequeno)", larg: 2.6, prof: 0.5, alt: 2.6, grupo: "escudo", pega: "alca",
    partes: o => [{ cil: true, c: [0, o.alt / 2, 0], r: o.larg / 2, hh: 0.12, R: omRot([0, 0, 1]) }, omEsf([0, o.alt / 2, 0.15], [0.4, 0.4, 0.3])],
    pegas: o => ({ alca: omPega([0, o.alt / 2, -0.35], [0, 0, -1], [0, 1, 0]) }), pontos: o => ({ frente: [0, o.alt / 2, 0.3], centro: [0, o.alt / 2, 0] }) },
  escudoCavaleiro: { nome: "escudo de cavaleiro (gota)", larg: 4.4, prof: 0.5, alt: 6.2, grupo: "escudo", pega: "alca", bracoEncosta: true,
    partes: o => Array.from({ length: 7 }, (_, i) => { const y = o.alt * (1 - (i + 0.5) / 7), w = o.larg / 2 * (i < 3 ? 1 : Math.max(0.12, 1 - (i - 2) / 5)); return omCx([0, y, 0], [w, o.alt / 14 + 0.01, 0.15]); }),
    pegas: o => ({ alca: omPega([0, o.alt * 0.58, -0.4], [0, 0, -1], [0, 1, 0]), braco: omPega([0, o.alt * 0.75, -0.3], [0, 0, -1], [1, 0, 0]) }), pontos: o => ({ frente: [0, o.alt * 0.6, 0.2], centro: [0, o.alt * 0.6, 0] }) },
  escudoTorre: { nome: "escudo torre (corpo inteiro)", larg: 5, prof: 0.6, alt: 11, grupo: "escudo", pega: "alca", bracoEncosta: true,
    partes: o => [omCx([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, 0.18]), omCx([0, o.alt / 2, 0.22], [0.5, o.alt / 2 - 0.4, 0.06])],
    pegas: o => ({ alca: omPega([0, o.alt * 0.5, -0.45], [0, 0, -1], [0, 1, 0]) }), pontos: o => ({ frente: [0, o.alt * 0.55, 0.3], centro: [0, o.alt * 0.55, 0] }) },
  /* ===== mágicos e luz ===== */
  varinha: { nome: "varinha mágica", larg: 0.2, prof: 0.2, alt: 3, grupo: "magico", pega: "cabo",
    partes: o => [omCil(0, 1, 0.08, 0.07), omCil(1, o.alt, 0.06, 0.025)], pegas: () => ({ cabo: omCabo(0.5) }), pontos: o => ({ ponta: [0, o.alt, 0], cabo: [0, 0.5, 0] }) },
  cajadoMagico: { nome: "cajado mágico (cristal)", larg: 1.2, prof: 1.2, alt: 15, grupo: "magico", pega: "cabo", duasMaos: true,
    partes: o => [omCil(0, o.alt - 1.2, 0.14, 0.12), omToro([0, o.alt - 0.7, 0], 0.55, 0.08, [0, 0, 1]), omEsf([0, o.alt - 0.7, 0], [0.35, 0.5, 0.35], { facetas: 6, semente: 2 })],
    pegas: o => ({ cabo: omCabo(o.alt * 0.6), cabo2: omCabo(o.alt * 0.35) }), pontos: o => ({ ponta: [0, o.alt - 0.7, 0], cristal: [0, o.alt - 0.7, 0], base: [0, 0, 0] }) },
  orbe: { nome: "orbe / esfera mágica", larg: 1.4, prof: 1.4, alt: 1.4, grupo: "magico", pega: "palma",
    partes: o => [omEsf([0, o.alt / 2, 0], o.alt / 2)], pegas: o => ({ palma: omPega([0, 0, 0], [0, -1, 0], [1, 0, 0]) }), pontos: o => ({ centro: [0, o.alt / 2, 0], ponta: [0, o.alt, 0] }) },
  tocha: { nome: "tocha", larg: 0.8, prof: 0.8, alt: 5, grupo: "magico", pega: "cabo",
    partes: o => [omCil(0, o.alt - 1, 0.12, 0.18), omCil(o.alt - 1.1, o.alt - 0.6, 0.3, 0.32)], pegas: () => ({ cabo: omCabo(1.2) }),
    pontos: o => ({ chama: [0, o.alt + 0.4, 0], ponta: [0, o.alt, 0], cabo: [0, 1.2, 0] }) },
  lanterna: { nome: "lanterna", larg: 0.5, prof: 0.5, alt: 2.4, grupo: "cotidiano", pega: "cabo",
    partes: o => [omCil(0, 1.7, 0.18), omCil(1.7, o.alt, 0.22, 0.3)], pegas: () => ({ cabo: omCabo(0.8) }), pontos: o => ({ luz: [0, o.alt, 0], ponta: [0, o.alt, 0] }) },
  /* ===== instrumentos ===== */
  violao: { nome: "violão", larg: 3.5, prof: 1.0, alt: 9, grupo: "instrumento", pega: "braco",
    partes: o => [omEsf([0, 1.5, 0], [1.7, 1.5, 0.45]), omEsf([0, 3.2, 0], [1.35, 1.2, 0.45]), omCx([0, 6, 0], [0.24, 2, 0.12]), omCx([0, 8.4, 0], [0.32, 0.6, 0.1])],
    pegas: () => ({ braco: omPega([0, 6.2, -0.15], [0, 0, -1], [0, 1, 0]), corpo: omPega([0, 2.4, 0.5], [0, 0, 1], [1, 0, 0]), cabo: omPega([0, 6.2, -0.15], [0, 0, -1], [0, 1, 0]) }),
    pontos: () => ({ boca: [0, 2.6, 0.5], cordas: [0, 3, 0.5], ponta: [0, 9, 0] }) },
  guitarra: { nome: "guitarra elétrica", larg: 3.2, prof: 0.5, alt: 8.5, grupo: "instrumento", pega: "braco",
    partes: o => [omEsf([0, 1.4, 0], [1.6, 1.4, 0.2]), omCx([0.6, 2.9, 0], [0.5, 0.6, 0.2]), omCx([0, 5.6, 0], [0.22, 2.2, 0.1]), omCx([0, 8.1, 0], [0.3, 0.45, 0.08])],
    pegas: () => ({ braco: omPega([0, 5.8, -0.12], [0, 0, -1], [0, 1, 0]), corpo: omPega([0, 1.8, 0.25], [0, 0, 1], [1, 0, 0]), cabo: omPega([0, 5.8, -0.12], [0, 0, -1], [0, 1, 0]) }),
    pontos: () => ({ boca: [0, 1.6, 0.25], cordas: [0, 2, 0.25], ponta: [0, 8.5, 0] }) },
  violino: { nome: "violino", larg: 1.8, prof: 0.6, alt: 5.2, grupo: "instrumento", pega: "braco",
    partes: o => [omEsf([0, 1.0, 0], [0.9, 0.9, 0.28]), omEsf([0, 2.3, 0], [0.75, 0.75, 0.28]), omCx([0, 3.9, 0], [0.12, 1.1, 0.08]), omEsf([0, 5.0, 0], [0.18, 0.22, 0.15])],
    pegas: () => ({ braco: omPega([0, 4.0, -0.12], [0, 0, -1], [0, 1, 0]), cabo: omPega([0, 4.0, -0.12], [0, 0, -1], [0, 1, 0]) }), pontos: () => ({ cordas: [0, 1.7, 0.3], boca: [0, 1.7, 0.3], ponta: [0, 5.2, 0] }) },
  arcoViolino: { nome: "arco de violino", larg: 0.2, prof: 0.4, alt: 6.4, grupo: "instrumento", pega: "cabo",
    partes: o => [omCil(0, o.alt, 0.04), omTubo([0, 0.6, 0.2], [0, o.alt - 0.2, 0.15], 0.02)], pegas: () => ({ cabo: omPega([0, 0.4, 0], [0, 0, -1], [0, 1, 0]) }), pontos: o => ({ ponta: [0, o.alt, 0] }) },
  flauta: { nome: "flauta transversal", larg: 0.3, prof: 0.3, alt: 6, grupo: "instrumento", pega: "cabo", duasMaos: true,
    partes: o => [omCil(0, o.alt, 0.1)], pegas: o => ({ cabo: omCabo(o.alt * 0.55), cabo2: omCabo(o.alt * 0.25) }), pontos: o => ({ boca: [0, o.alt * 0.92, 0.1], som: [0, 0, 0], ponta: [0, 0, 0] }) },
  trompete: { nome: "trompete", larg: 1.2, prof: 1.2, alt: 4.6, grupo: "instrumento", pega: "cabo",
    partes: o => [omCil(0, 3.4, 0.1), omCil(3.3, o.alt, 0.2, 0.6), omCx([0, 1.6, -0.35], [0.12, 0.6, 0.25]), omCil(-0.3, 0, 0.12, 0.08)],
    pegas: () => ({ cabo: omPega([0, 1.6, -0.62], [0, 0, -1], [0, 1, 0]) }), pontos: o => ({ som: [0, o.alt, 0], boca: [0, -0.3, 0], ponta: [0, o.alt, 0] }) },
  microfone: { nome: "microfone", larg: 0.5, prof: 0.5, alt: 2.3, grupo: "instrumento", pega: "cabo",
    partes: o => [omCil(0, 1.8, 0.14, 0.18), omEsf([0, 2.0, 0], 0.3)], pegas: () => ({ cabo: omCabo(0.8) }), pontos: () => ({ boca: [0, 2.2, 0], som: [0, 2.2, 0], ponta: [0, 2.3, 0] }) },
  baqueta: { nome: "baqueta", larg: 0.15, prof: 0.15, alt: 3.6, grupo: "instrumento", pega: "cabo",
    partes: o => [omCil(0, o.alt, 0.06, 0.04), omEsf([0, o.alt, 0], 0.07)], pegas: () => ({ cabo: omCabo(0.7) }), pontos: o => ({ ponta: [0, o.alt, 0] }) },
  /* ===== dia a dia ===== */
  celular: { nome: "celular", larg: 0.65, prof: 0.08, alt: 1.35, grupo: "cotidiano", pega: "palma",
    partes: o => [omCx([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, o.prof / 2])], pegas: o => ({ palma: omPega([0, o.alt * 0.35, -0.04], [0, 0, -1], [0, 1, 0]), cabo: omPega([0, o.alt * 0.35, -0.04], [0, 0, -1], [0, 1, 0]) }),
    pontos: o => ({ tela: [0, o.alt / 2, 0.05], ponta: [0, o.alt, 0] }) },
  livro: { nome: "livro", larg: 1.4, prof: 0.35, alt: 2.0, grupo: "cotidiano", pega: "palma",
    partes: o => [omCx([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, o.prof / 2])], pegas: o => ({ palma: omPega([0, o.alt / 2, -o.prof / 2], [0, 0, -1], [0, 1, 0]) }), pontos: o => ({ capa: [0, o.alt / 2, o.prof / 2] }) },
  xicara: { nome: "xícara / caneca", larg: 0.9, prof: 0.7, alt: 0.85, grupo: "cotidiano", pega: "alca",
    partes: o => [omCil(0, o.alt, 0.33, 0.36), omToro([0.45, o.alt * 0.5, 0], 0.22, 0.05, [0, 0, 1])], pegas: o => ({ alca: omPega([0.62, o.alt * 0.5, 0], [1, 0, 0], [0, 1, 0]) }), pontos: o => ({ boca: [0, o.alt, 0], vapor: [0, o.alt + 0.4, 0] }) },
  garrafa: { nome: "garrafa", larg: 0.6, prof: 0.6, alt: 2.6, grupo: "cotidiano", pega: "cabo",
    partes: o => [omCil(0, 1.7, 0.28), omCil(1.7, 2.1, 0.28, 0.1), omCil(2.1, o.alt, 0.1)], pegas: () => ({ cabo: omCabo(0.9), gargalo: omCabo(2.3) }), pontos: o => ({ boca: [0, o.alt, 0], ponta: [0, o.alt, 0] }) },
  guardaChuva: { nome: "guarda-chuva (aberto)", larg: 8, prof: 8, alt: 8, grupo: "cotidiano", pega: "cabo",
    partes: o => [omCil(0, o.alt - 0.6, 0.06), { cil: true, c: [0, o.alt - 0.9, 0], r: o.larg / 2, r1: 0.1, hh: 0.9 }, omToro([0.25, 0.1, 0], 0.25, 0.06, [0, 0, 1])],
    pegas: () => ({ cabo: omCabo(1.0) }), pontos: o => ({ ponta: [0, o.alt, 0], borda: [o.larg / 2, o.alt - 1.8, 0] }) },
  bandeira: { nome: "bandeira", larg: 5, prof: 0.2, alt: 15, grupo: "cotidiano", pega: "cabo", duasMaos: true,
    partes: o => [omCil(0, o.alt, 0.1), omCx([2.3, o.alt - 1.6, 0], [2.2, 1.4, 0.02])], pegas: o => ({ cabo: omCabo(o.alt * 0.42), cabo2: omCabo(o.alt * 0.2) }), pontos: o => ({ ponta: [0, o.alt, 0], pano: [2.3, o.alt - 1.6, 0] }) },
  vassoura: { nome: "vassoura", larg: 2.4, prof: 0.6, alt: 12, grupo: "cotidiano", pega: "cabo", duasMaos: true,
    partes: o => [omCil(0.8, o.alt, 0.1), omCx([0, 0.4, 0], [1.2, 0.4, 0.25])], pegas: o => ({ cabo: omCabo(o.alt * 0.75), cabo2: omCabo(o.alt * 0.45) }), pontos: () => ({ base: [0, 0, 0], ponta: [0, 0, 0] }) },
  carta: { nome: "carta / papel", larg: 1.8, prof: 0.02, alt: 2.4, grupo: "cotidiano", pega: "pinca",
    partes: o => [omCx([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, 0.01])], pegas: o => ({ cabo: omPega([0, 0.25, 0], [0, 0, 1], [1, 0, 0]) }), pontos: o => ({ centro: [0, o.alt / 2, 0] }) },
  chave: { nome: "chave", larg: 0.4, prof: 0.05, alt: 0.8, grupo: "cotidiano", pega: "pinca",
    partes: o => [omToro([0, 0.15, 0], 0.13, 0.04, [0, 0, 1]), omCx([0, 0.5, 0], [0.04, 0.25, 0.02]), omCx([0.07, 0.65, 0], [0.06, 0.06, 0.02])], pegas: () => ({ cabo: omPega([0, 0.15, 0], [0, 0, 1], [1, 0, 0]) }), pontos: o => ({ ponta: [0, o.alt, 0] }) },
  espelhoMao: { nome: "espelho de mão", larg: 1.3, prof: 0.15, alt: 2.6, grupo: "cotidiano", pega: "cabo",
    partes: o => [omCil(0, 1.1, 0.1), { cil: true, c: [0, 1.75, 0], r: 0.65, hh: 0.06, R: omRot([0, 0, 1]) }], pegas: () => ({ cabo: omCabo(0.5) }), pontos: () => ({ centro: [0, 1.75, 0.07], brilho: [0, 1.75, 0.07] }) },
  copoBebida: { nome: "copo de bebida", larg: 0.7, prof: 0.7, alt: 1.2, grupo: "cotidiano", pega: "copo",
    partes: o => [omCil(0, o.alt, 0.28, 0.34)], pegas: o => ({ copo: omPega([0.3, o.alt * 0.45, 0], [1, 0, 0], [0, 1, 0]), cabo: omPega([0.3, o.alt * 0.45, 0], [1, 0, 0], [0, 1, 0]) }), pontos: o => ({ boca: [0, o.alt, 0] }) }
};
const SINONIMOS_MAO = { espada: "espadaCurta", "espada longa": "espadaLonga", montante: "espadaLonga", gladio: "espadaCurta", "gládio": "espadaCurta", faca: "adaga", punhal: "adaga", "estrela ninja": "shuriken",
  "martelo de guerra": "martelo", clava: "maca", "maça": "maca", porrete: "maca", "machado duplo": "machadoDuplo", bo: "bastaoBo", "bastão bo": "bastaoBo", gadanha: "foice", arma: "pistola", revolver: "pistola", "revólver": "pistola",
  fuzil: "rifle", espingarda: "rifle", "escudo pequeno": "broquel", "escudo de cavaleiro": "escudoCavaleiro", "escudo torre": "escudoTorre", varinha: "varinha", "cajado mágico": "cajadoMagico", cajadoMagico: "cajadoMagico",
  "violão": "violao", "guitarra elétrica": "guitarra", "arco de violino": "arcoViolino", trompa: "trompete", microfone: "microfone", telefone: "celular", "guarda-chuva": "guardaChuva", "sombrinha": "guardaChuva", caneca: "xicara", "xícara": "xicara", papel: "carta", espelho: "espelhoMao" };
/* pontos (marcos) de um objeto em coordenadas locais; objetos sem lista: ponta = topo, centro = meio */
function pontosLocaisDoObjeto(o) { const t = OBJ_MAO[o.tipo]; const p = t && t.pontos ? t.pontos(o) : {}; const A = o.alt || 1;
  return Object.assign({ centro: [0, A / 2, 0], topo: [0, A, 0], base: [0, 0, 0], ponta: [0, A, 0] }, p); }
import { objectRigidPose, rigidPoint } from "./rigid-transform.js";
/* um ponto nomeado do objeto no MUNDO (R), com o objeto onde está (segurado, girado, no chão) */
function pontoDoObjeto(o, nome, ground = 0) { const L = pontosLocaisDoObjeto(o), q = L[nome] || L.ponta; return rigidPoint(objectRigidPose(o, ground), q); }
export { OBJ_MAO, SINONIMOS_MAO, pontosLocaisDoObjeto, pontoDoObjeto };
