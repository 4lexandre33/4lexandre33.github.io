/* GeoMannequin — OBJETOS DO DIA A DIA em formas geométricas primitivas (caixa, cilindro, esfera, anel):
   sala e quarto, cozinha, banheiro e área de serviço, escritório e escola, rua e lazer, INSTRUMENTOS musicais (grandes, para tocar
   sentado ou em pé, e de mão) e VEÍCULOS por categoria (bicicleta, moto, caminhão, van, trator, carro de corrida, kart, skate,
   patinete, jet ski, quadriciclo).
   Mesmo formato dos compostos: partes em coordenadas locais (pivô = centro da base; x = largura, y = altura, z = frente).
   Extras que a cena usa:
     assento(o) → { y, encosto, lugares }   altura do assento (senta-em põe os ísquios aí; com encosto, as costas no encosto)
     deita(o)   → { y, eixo, cabeca }         superfície para deitar (deita-em): altura, eixo comprido ("x"|"z"), lado da cabeceira (±1)
     toca(o)    → { pe|banco:[x,y,z], maos:[[x,y,z],[x,y,z]], olhar:[x,y,z], pose }  onde fica quem toca e onde vão as mãos
     assentos(o) (veículos) → como no carro, mais: montado (pernas abertas no selim), pedais/pedaleiras [[x,y,z]×2], guidao {c, r},
                  inclina (graus para a frente), em-pe (skate, patinete, jet ski em pé)
   1 R ≈ 11,4 cm. */

const ccU = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
const ccX = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function ccRot(d) { const Y = ccU(d); let X = Math.abs(Y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; X = ccX(X, Y); const k = X[0] * Y[0] + X[1] * Y[1] + X[2] * Y[2]; X = ccU(X.map((v, i) => v - k * Y[i])); const Z = ccX(X, Y); return [X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]]; }
/* caixa pelo canto de baixo e pelo de cima: B([x0,y0,z0],[x1,y1,z1]) */
const B = (a, b, ex) => Object.assign({ c: a.map((v, i) => (v + b[i]) / 2), h: a.map((v, i) => Math.max(0.02, Math.abs(b[i] - v) / 2)) }, ex || {});
const C = (c, r, hh, ex) => Object.assign({ cil: true, c, r, hh }, ex || {});                         /* cilindro em pé */
const T = (a, b, r, ex) => { const d = b.map((v, i) => v - a[i]), L = Math.hypot(...d); return Object.assign({ cil: true, c: a.map((v, i) => (v + b[i]) / 2), r, hh: L / 2, R: ccRot(d) }, ex || {}); };
const E = (c, r, ex) => Object.assign({ esf: true, c, r: Array.isArray(r) ? r : [r, r, r] }, ex || {});
const A = (c, R, rt, eixo, ex) => Object.assign({ toro: true, c, Rm: R, rt, ra: rt, R: ccRot({ x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[eixo] || eixo) }, ex || {});
const ink = p => Object.assign(p, { cor: "ink" }), fundo = p => Object.assign(p, { cor: "fundo" });
const pega = (P, N, eixo) => ({ P, N: ccU(N), eixo: ccU(eixo) });
/* 4 pés de móvel (cilindros finos) */
const pes4 = (lx, lz, h, r = 0.22) => [-1, 1].flatMap(sx => [-1, 1].map(sz => C([sx * lx, h / 2, sz * lz], r, h / 2)));
/* roda de veículo (pneu + aro), eixo x */
const roda = (x, y, z, r, larg = 0.6) => [A([x, y, z], r - larg * 0.5, larg * 0.5, "x"), ink(C([x, y, z], r * 0.45, larg * 0.3, { R: ccRot([1, 0, 0]) }))];

const OBJ_CASA = {
  /* ======================= SALA E QUARTO ======================= */
  sofa: { nome: "sofá (3 lugares, encosto e braços)", larg: 17.5, prof: 8, alt: 7.5, grupo: "sala", corPadrao: "#7a6a8e",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, H = o.alt, s = H * 0.53, br = H * 0.76; return [B([-L, 0.6, -P], [L, s - 0.9, P]), ...[-1, 0, 1].map(k => B([k * (L - 1.4) / 1.5 - (L - 1.4) / 3 + 0.05, s - 0.9, -P + 1.6], [k * (L - 1.4) / 1.5 + (L - 1.4) / 3 - 0.05, s, P - 0.1])),
      B([-L, s - 0.9, -P], [L, H, -P + 1.6]), B([-L, s - 0.9, -P], [-L + 1.4, br, P]), B([L - 1.4, s - 0.9, -P], [L, br, P]), ...pes4(L - 0.6, P - 0.6, 0.6, 0.25)]; },
    assento: o => ({ y: o.alt * 0.53, encosto: true, lugares: Math.max(1, Math.round((o.larg - 2.8) / 5)) }), deita: o => ({ y: o.alt * 0.53, eixo: "x", cabeca: 1, larg: o.larg - 2.8 }) },
  poltrona: { nome: "poltrona (estofada, braços)", larg: 7.6, prof: 7.6, alt: 8.2, grupo: "sala", corPadrao: "#8e5a4a",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, H = o.alt, s = H * 0.5; return [B([-L, 0.6, -P], [L, s, P]), B([-L, s - 0.5, -P], [L, H, -P + 1.6]), B([-L, s - 0.5, -P], [-L + 1.4, H * 0.72, P]), B([L - 1.4, s - 0.5, -P], [L, H * 0.72, P]), ...pes4(L - 0.6, P - 0.6, 0.6, 0.25)]; },
    assento: o => ({ y: o.alt * 0.5, encosto: true, lugares: 1 }) },
  pufe: { nome: "pufe", larg: 4, prof: 4, alt: 3.8, grupo: "sala", corPadrao: "#b38b4d", partes: o => [C([0, o.alt / 2, 0], o.larg / 2, o.alt / 2)], assento: o => ({ y: o.alt, encosto: false, lugares: 1 }) },
  mesaCentro: { nome: "mesa de centro", larg: 9, prof: 5, alt: 3.8, grupo: "sala", corPadrao: "#7a5230",
    partes: o => [B([-o.larg / 2, o.alt - 0.4, -o.prof / 2], [o.larg / 2, o.alt, o.prof / 2]), B([-o.larg / 2 + 0.4, 0.8, -o.prof / 2 + 0.4], [o.larg / 2 - 0.4, 1.0, o.prof / 2 - 0.4]), ...pes4(o.larg / 2 - 0.5, o.prof / 2 - 0.5, o.alt - 0.4)] },
  rack: { nome: "rack de TV", larg: 14, prof: 3.6, alt: 4.4, grupo: "sala", corPadrao: "#5a4632",
    partes: o => [B([-o.larg / 2, 0.5, -o.prof / 2], [o.larg / 2, o.alt, o.prof / 2]), ink(B([-o.larg / 2 + 0.5, 1.2, o.prof / 2], [-0.2, o.alt - 0.6, o.prof / 2 + 0.05])), ink(B([0.2, 1.2, o.prof / 2], [o.larg / 2 - 0.5, o.alt - 0.6, o.prof / 2 + 0.05]))] },
  tv: { nome: "televisão (tela plana com base)", larg: 10.5, prof: 2, alt: 6.6, grupo: "sala", corPadrao: "#2b2b2e",
    partes: o => [B([-o.larg / 2, 1.0, -0.2], [o.larg / 2, o.alt, 0.2]), fundo(B([-o.larg / 2 + 0.25, 1.25, 0.2], [o.larg / 2 - 0.25, o.alt - 0.25, 0.22])), B([-0.4, 0.15, -0.3], [0.4, 1.0, 0.3]), B([-2, 0, -o.prof / 2], [2, 0.15, o.prof / 2])] },
  estante: { nome: "estante de livros", larg: 8, prof: 2.8, alt: 16, grupo: "sala", corPadrao: "#8b6a43",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, H = o.alt, out = [B([-L, 0, -P], [-L + 0.3, H, P]), B([L - 0.3, 0, -P], [L, H, P]), B([-L, 0, -P], [L, H, -P + 0.2])]; const n = Math.max(3, Math.round(H / 3.2));
      for (let k = 0; k <= n; k++) { const y = k * (H - 0.3) / n; out.push(B([-L, y, -P], [L, y + 0.3, P])); if (k < n) for (let j = 0; j < 5; j++) { const x0 = -L + 0.5 + j * (o.larg - 1) / 5; out.push(B([x0, y + 0.3, -P + 0.4], [x0 + (o.larg - 1) / 5 - 0.15, y + 0.3 + (H / n) * (0.55 + 0.25 * ((j * 7 + k * 3) % 4) / 3), P - 0.3])); } }
      return out; } },
  abajur: { nome: "abajur", larg: 2.4, prof: 2.4, alt: 4.6, grupo: "quarto", corPadrao: "#e4d6a7",
    partes: o => [C([0, 0.15, 0], 0.9, 0.15), C([0, 1.6, 0], 0.18, 1.45), C([0, o.alt - 1.0, 0], o.larg / 2, 1.0, { r1: o.larg * 0.3 })] },
  luminaria: { nome: "luminária de pé", larg: 3, prof: 3, alt: 15, grupo: "sala", corPadrao: "#d8cfb2",
    partes: o => [C([0, 0.15, 0], 1.2, 0.15), C([0, o.alt / 2, 0], 0.15, o.alt / 2 - 1), C([0, o.alt - 1.1, 0], o.larg / 2, 1.1, { r1: o.larg * 0.3 })] },
  lareira: { nome: "lareira", larg: 12, prof: 3.4, alt: 10, grupo: "sala", corPadrao: "#9b5c46",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, H = o.alt; return [B([-L, 0, -P], [-L + 2.6, H * 0.8, P]), B([L - 2.6, 0, -P], [L, H * 0.8, P]), B([-L, H * 0.6, -P], [L, H * 0.8, P]), B([-L - 0.6, H * 0.8, -P - 0.3], [L + 0.6, H * 0.86, P + 0.4]), fundo(B([-L + 2.6, 0, -P], [L - 2.6, H * 0.6, -P + 0.4])), B([-L + 2.6, 0, -P], [L - 2.6, 0.4, P])]; } },
  camaCasal: { nome: "cama de casal (colchão, travesseiros, cabeceira)", larg: 13.2, prof: 17.6, alt: 4.8, grupo: "quarto", corPadrao: "#8c6f56",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, H = o.alt; return [B([-L, 0.6, -P], [L, H - 1.8, P]), Object.assign(B([-L + 0.1, H - 1.8, -P + 0.1], [L - 0.1, H, P - 0.1]), { cor: "#eae6dc" }), B([-L, 0, -P - 0.5], [L, H + 4.6, -P]),
      ...[-1, 1].map(s => Object.assign(E([s * L * 0.48, H + 0.4, -P + 1.8], [L * 0.4, 0.55, 1.3]), { cor: "#f2f0ea" })), ...pes4(L - 0.4, P - 0.4, 0.6, 0.3)]; },
    assento: o => ({ y: o.alt, encosto: false, lugares: 2 }), deita: o => ({ y: o.alt, eixo: "z", cabeca: -1, larg: o.prof - 2 }) },
  beliche: { nome: "beliche", larg: 8.4, prof: 17.4, alt: 15, grupo: "quarto", corPadrao: "#6d7f99",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, out = []; for (const y of [1.6, 9.4]) out.push(B([-L, y, -P], [L, y + 0.5, P]), Object.assign(B([-L + 0.2, y + 0.5, -P + 0.2], [L - 0.2, y + 1.6, P - 0.2]), { cor: "#e8e4da" }));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(B([sx * L - 0.3, 0, sz * P - 0.3], [sx * L + 0.3, o.alt, sz * P + 0.3]));
      out.push(B([-L, 12.2, -P], [L, 12.6, -P + 0.3]), B([-L, 12.2, P - 0.3], [L, 12.6, P]), B([L - 0.3, 12.2, -P], [L, 12.6, P - 6])); for (let k = 0; k < 5; k++) out.push(T([L + 0.2, 1.8 + k * 2, P - 1.5], [L + 0.2, 1.8 + k * 2, P - 4], 0.15)); return out; },
    assento: () => ({ y: 3.2, encosto: false, lugares: 1 }), deita: () => ({ y: 3.2, eixo: "z", cabeca: -1, larg: 16 }) },
  berco: { nome: "berço", larg: 6.4, prof: 11.4, alt: 8.4, grupo: "quarto", corPadrao: "#f0e7d4",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, H = o.alt, out = [B([-L, 3, -P], [L, 3.6, P]), Object.assign(B([-L + 0.2, 3.6, -P + 0.2], [L - 0.2, 4.4, P - 0.2]), { cor: "#dfe8f2" })];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(B([sx * L - 0.25, 0, sz * P - 0.25], [sx * L + 0.25, H, sz * P + 0.25]));
      for (const sx of [-1, 1]) { out.push(B([sx * L - 0.15, H - 0.4, -P], [sx * L + 0.15, H, P])); for (let k = 1; k < 10; k++) out.push(C([sx * L, (H + 3.6) / 2, -P + k * o.prof / 10], 0.1, (H - 3.6) / 2)); }
      for (const sz of [-1, 1]) { out.push(B([-L, H - 0.4, sz * P - 0.15], [L, H, sz * P + 0.15])); for (let k = 1; k < 6; k++) out.push(C([-L + k * o.larg / 6, (H + 3.6) / 2, sz * P], 0.1, (H - 3.6) / 2)); } return out; } },
  criadoMudo: { nome: "criado-mudo (mesa de cabeceira)", larg: 4, prof: 3.6, alt: 5, grupo: "quarto", corPadrao: "#9c7a52",
    partes: o => [B([-o.larg / 2, 0.4, -o.prof / 2], [o.larg / 2, o.alt, o.prof / 2]), ink(B([-o.larg / 2 + 0.3, o.alt * 0.55, o.prof / 2], [o.larg / 2 - 0.3, o.alt * 0.56, o.prof / 2 + 0.03])), C([0, o.alt * 0.75, o.prof / 2 + 0.15], 0.15, 0.12, { R: ccRot([0, 0, 1]) })] },
  guardaRoupa: { nome: "guarda-roupa", larg: 13, prof: 5, alt: 18, grupo: "quarto", corPadrao: "#8a6a4a",
    partes: o => [B([-o.larg / 2, 0, -o.prof / 2], [o.larg / 2, o.alt, o.prof / 2]), ...[-1, 0, 1].map(k => ink(B([k * o.larg / 6 - 0.03, 0.6, o.prof / 2], [k * o.larg / 6 + 0.03, o.alt - 0.6, o.prof / 2 + 0.03]))), ...[-1, 1].map(s => C([s * 0.6, o.alt * 0.55, o.prof / 2 + 0.2], 0.12, 1, {}))],
    pegas: o => ({ macaneta: pega([0.6, o.alt * 0.55, o.prof / 2 + 0.2], [0, 0, 1], [0, 1, 0]) }) },
  comoda: { nome: "cômoda (gavetas)", larg: 9, prof: 4, alt: 7, grupo: "quarto", corPadrao: "#a07a50",
    partes: o => { const out = [B([-o.larg / 2, 0.5, -o.prof / 2], [o.larg / 2, o.alt, o.prof / 2])]; for (let k = 1; k < 4; k++) out.push(ink(B([-o.larg / 2 + 0.3, 0.5 + k * (o.alt - 0.5) / 4, o.prof / 2], [o.larg / 2 - 0.3, 0.55 + k * (o.alt - 0.5) / 4, o.prof / 2 + 0.03]))); return out; } },
  espelhoPe: { nome: "espelho de corpo inteiro", larg: 5, prof: 2, alt: 15, grupo: "quarto", corPadrao: "#c9b38a",
    partes: o => [B([-o.larg / 2, 0.5, -0.2], [o.larg / 2, o.alt, 0.2]), Object.assign(B([-o.larg / 2 + 0.35, 0.85, 0.2], [o.larg / 2 - 0.35, o.alt - 0.35, 0.24]), { cor: "#cfe2ec" }), T([0, o.alt * 0.6, -0.2], [0, 0, -o.prof], 0.2)] },
  rede: { nome: "rede de dormir (entre dois suportes)", larg: 4, prof: 30, alt: 9, grupo: "lazer", corPadrao: "#d0603a",
    partes: o => { const P = o.prof / 2, out = []; for (const s of [-1, 1]) out.push(B([-0.4, 0, s * P - 0.4], [0.4, o.alt, s * P + 0.4]));
      const n = 10; for (let k = 0; k < n; k++) { const t0 = k / n, t1 = (k + 1) / n, y = t => o.alt - 1 - 4.6 * Math.sin(Math.PI * t), z = t => -P + 2 + t * (o.prof - 4); out.push(Object.assign(T([0, y(t0), z(t0)], [0, y(t1), z(t1)], 1.6 * Math.sin(Math.PI * (t0 + t1) / 2) + 0.15), {})); } return out; },
    deita: o => ({ y: o.alt - 5.6, eixo: "z", cabeca: -1, larg: o.prof - 10 }) },

  /* ======================= COZINHA ======================= */
  geladeira: { nome: "geladeira (duas portas)", larg: 6.4, prof: 6, alt: 16, grupo: "cozinha", corPadrao: "#e7ebef",
    partes: o => [B([-o.larg / 2, 0.3, -o.prof / 2], [o.larg / 2, o.alt, o.prof / 2]), ink(B([-o.larg / 2, o.alt * 0.66, o.prof / 2], [o.larg / 2, o.alt * 0.665, o.prof / 2 + 0.03])), ...[0.8, 0.45].map(y => B([o.larg / 2 - 0.6, o.alt * y - 1.4, o.prof / 2], [o.larg / 2 - 0.35, o.alt * y + 1.4, o.prof / 2 + 0.45]))],
    pegas: o => ({ porta: pega([o.larg / 2 - 0.45, o.alt * 0.45, o.prof / 2 + 0.45], [0, 0, 1], [0, 1, 0]), freezer: pega([o.larg / 2 - 0.45, o.alt * 0.8, o.prof / 2 + 0.45], [0, 0, 1], [0, 1, 0]) }) },
  fogao: { nome: "fogão (4 bocas, forno)", larg: 6.6, prof: 5.6, alt: 7.8, grupo: "cozinha", corPadrao: "#d9dde2",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, H = o.alt; return [B([-L, 0.3, -P], [L, H, P]), ink(B([-L + 0.6, 1.2, P], [L - 0.6, H - 2.2, P + 0.04])), B([-L + 0.6, H - 1.9, P], [L - 0.6, H - 1.6, P + 0.4]), B([-L, H, -P], [L, H + 2.6, -P + 0.4]),
      ...[-1, 1].flatMap(sx => [-1, 1].map(sz => ink(A([sx * L * 0.48, H + 0.1, sz * P * 0.42], 0.9, 0.12, "y"))))]; },
    toca: o => ({ pe: [0, 0, o.prof / 2 + 2.2], olha: -1, maos: [[1.5, o.alt + 1.2, o.prof * 0.2], [-1.5, o.alt + 0.5, o.prof * 0.3]], olhar: [0, o.alt, 0], pose: "empe" }) },
  pia: { nome: "pia de cozinha (gabinete e cuba)", larg: 12, prof: 5.4, alt: 8, grupo: "cozinha", corPadrao: "#c7c2b8",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, H = o.alt; return [B([-L, 0.4, -P], [L, H - 0.4, P]), B([-L, H - 0.4, -P], [-1.8, H, P]), B([1.8, H - 0.4, -P], [L, H, P]), B([-1.8, H - 0.4, -P], [1.8, H, -P + 0.8]), B([-1.8, H - 0.4, P - 0.6], [1.8, H, P]),
      fundo(B([-1.8, H - 2.2, -P + 0.8], [1.8, H - 0.4, P - 0.6])), T([0, H, -P + 0.4], [0, H + 2.4, -P + 0.4], 0.18), T([0, H + 2.4, -P + 0.4], [0, H + 2.2, -P + 1.8], 0.15), ...[-1, 0, 1].map(k => ink(B([k * L * 0.6 - 0.03, 0.9, P], [k * L * 0.6 + 0.03, H - 1, P + 0.03])))]; },
    toca: o => ({ pe: [0, 0, o.prof / 2 + 2.2], olha: -1, maos: [[1.0, o.alt - 0.8, 0.4], [-1.0, o.alt - 0.8, 0.6]], olhar: [0, o.alt - 1, 0], pose: "empe" }) },
  balcao: { nome: "balcão / bancada", larg: 14, prof: 5.4, alt: 8, grupo: "cozinha", corPadrao: "#a58a6a",
    partes: o => [B([-o.larg / 2, 0.4, -o.prof / 2 + 0.6], [o.larg / 2, o.alt - 0.4, o.prof / 2]), B([-o.larg / 2 - 0.2, o.alt - 0.4, -o.prof / 2], [o.larg / 2 + 0.2, o.alt, o.prof / 2 + 0.3])] },
  armarioCozinha: { nome: "armário de cozinha (aéreo)", larg: 12, prof: 3, alt: 6, grupo: "cozinha", corPadrao: "#b9a283",
    partes: o => [B([-o.larg / 2, 0, -o.prof / 2], [o.larg / 2, o.alt, o.prof / 2]), ...[-1, 0, 1].map(k => ink(B([k * o.larg / 3 - 0.03, 0.3, o.prof / 2], [k * o.larg / 3 + 0.03, o.alt - 0.3, o.prof / 2 + 0.03])))] },
  microondas: { nome: "micro-ondas", larg: 4.2, prof: 3.2, alt: 2.6, grupo: "cozinha", corPadrao: "#2e3136",
    partes: o => [B([-o.larg / 2, 0, -o.prof / 2], [o.larg / 2, o.alt, o.prof / 2]), fundo(B([-o.larg / 2 + 0.3, 0.3, o.prof / 2], [o.larg / 2 - 1.2, o.alt - 0.3, o.prof / 2 + 0.03]))] },
  mesaJantar: { nome: "mesa de jantar (6 lugares)", larg: 15, prof: 8, alt: 6.6, grupo: "cozinha", corPadrao: "#7d5634",
    partes: o => [B([-o.larg / 2, o.alt - 0.45, -o.prof / 2], [o.larg / 2, o.alt, o.prof / 2]), ...pes4(o.larg / 2 - 0.7, o.prof / 2 - 0.7, o.alt - 0.45, 0.35)] },
  banquetaAlta: { nome: "banqueta alta (de balcão)", larg: 3.2, prof: 3.2, alt: 6.6, grupo: "cozinha", corPadrao: "#3b3b3b",
    partes: o => [C([0, o.alt - 0.3, 0], o.larg / 2, 0.3), C([0, o.alt / 2, 0], 0.25, o.alt / 2 - 0.3), A([0, o.alt * 0.35, 0], 1.1, 0.1, "y"), C([0, 0.1, 0], 1.3, 0.1)], assento: o => ({ y: o.alt, encosto: false, lugares: 1 }) },

  /* ======================= BANHEIRO E ÁREA DE SERVIÇO ======================= */
  vasoSanitario: { nome: "vaso sanitário (com caixa acoplada)", larg: 3.4, prof: 6, alt: 7, grupo: "banheiro", corPadrao: "#f3f3f1",
    partes: o => [C([0, 1.5, 0.8], 1.3, 1.5, { r1: 1.6 }), Object.assign(E([0, 3.4, 0.9], [1.7, 0.45, 2.1]), {}), fundo(E([0, 3.75, 0.9], [1.2, 0.08, 1.5])), B([-o.larg / 2, 3, -o.prof / 2], [o.larg / 2, o.alt, -o.prof / 2 + 1.6])],
    assento: () => ({ y: 3.85, encosto: false, lugares: 1 }) },
  banheira: { nome: "banheira", larg: 7, prof: 15, alt: 5, grupo: "banheiro", corPadrao: "#f1f1ef",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, H = o.alt, t = 0.6; return [B([-L, 0, -P], [L, 1.2, P]), B([-L, 0, -P], [-L + t, H, P]), B([L - t, 0, -P], [L, H, P]), B([-L, 0, -P], [L, H, -P + t]), B([-L, 0, P - t], [L, H, P]), Object.assign(B([-L + t, 1.2, -P + t], [L - t, H - 1.4, P - t]), { cor: "#bfe0ef" })]; },
    assento: () => ({ y: 1.2, encosto: false, lugares: 1 }), deita: o => ({ y: 1.2, eixo: "z", cabeca: -1, larg: o.prof - 3 }) },
  chuveiro: { nome: "box com chuveiro", larg: 8, prof: 8, alt: 20, grupo: "banheiro", corPadrao: "#b9c6cc",
    partes: o => { const L = o.larg / 2, P = o.prof / 2; return [B([-L, 0, -P], [L, 0.3, P]), B([-L, 0, -P], [L, o.alt, -P + 0.3]), Object.assign(B([-L, 0.3, P - 0.1], [L, o.alt * 0.9, P]), { cor: "#d6ebf2" }), T([0, o.alt - 2, -P + 0.3], [0, o.alt - 2, -P + 2.6], 0.15), C([0, o.alt - 2.4, -P + 2.6], 0.9, 0.2, { r1: 0.5 })]; } },
  lavatorio: { nome: "pia de banheiro (lavatório com espelho)", larg: 6, prof: 4, alt: 7.6, grupo: "banheiro", corPadrao: "#efefed",
    partes: o => [C([0, o.alt / 2 - 0.6, -0.6], 0.5, o.alt / 2 - 0.6), E([0, o.alt - 0.6, 0], [o.larg / 2, 0.7, o.prof / 2]), fundo(E([0, o.alt - 0.5, 0.1], [o.larg / 2 - 0.6, 0.3, o.prof / 2 - 0.6])), T([0, o.alt, -o.prof / 2 + 0.4], [0, o.alt + 1.4, -o.prof / 2 + 0.6], 0.15), Object.assign(B([-o.larg / 2, o.alt + 2.4, -o.prof / 2 - 0.2], [o.larg / 2, o.alt + 9, -o.prof / 2]), { cor: "#cfe2ec" })],
    toca: o => ({ pe: [0, 0, o.prof / 2 + 2], olha: -1, maos: [[0.8, o.alt - 0.2, 0.2], [-0.8, o.alt - 0.2, 0.2]], olhar: [0, o.alt + 5, -o.prof / 2], pose: "empe" }) },
  maquinaLavar: { nome: "máquina de lavar", larg: 5.4, prof: 5.4, alt: 7.6, grupo: "servico", corPadrao: "#eef0f2",
    partes: o => [B([-o.larg / 2, 0.2, -o.prof / 2], [o.larg / 2, o.alt, o.prof / 2]), A([0, o.alt * 0.45, o.prof / 2 + 0.1], 1.5, 0.3, "z"), Object.assign(C([0, o.alt * 0.45, o.prof / 2 + 0.05], 1.3, 0.05, { R: ccRot([0, 0, 1]) }), { cor: "#9cc2d4" }), ink(B([-o.larg / 2 + 0.4, o.alt - 1, o.prof / 2], [o.larg / 2 - 0.4, o.alt - 0.95, o.prof / 2 + 0.03]))] },
  tabuaPassar: { nome: "tábua de passar", larg: 3.4, prof: 11, alt: 7.8, grupo: "servico", corPadrao: "#7aa0c0",
    partes: o => [Object.assign(B([-o.larg / 2, o.alt - 0.3, -o.prof / 2], [o.larg / 2, o.alt, o.prof / 2 - 1.4]), {}), E([0, o.alt - 0.15, o.prof / 2 - 1.4], [o.larg / 2, 0.15, 1.4]), T([0, 0, -3], [0, o.alt - 0.3, 2], 0.15), T([0, 0, 2], [0, o.alt - 0.3, -3], 0.15)],
    toca: o => ({ pe: [o.larg / 2 + 2.2, 0, 0], olha: 0, maos: [[0.4, o.alt + 0.6, 0.5], [0.6, o.alt + 0.2, -1.6]], olhar: [0, o.alt, 0], pose: "empe" }) },
  lixeira: { nome: "lixeira (com tampa)", larg: 2.6, prof: 2.6, alt: 4, grupo: "servico", corPadrao: "#5f7a5a",
    partes: o => [C([0, o.alt / 2 - 0.2, 0], o.larg / 2 * 0.9, o.alt / 2 - 0.2, { r1: o.larg / 2 }), C([0, o.alt - 0.15, 0], o.larg / 2 + 0.1, 0.15)] },
  vassouraPe: { nome: "rodo de chão", larg: 3.4, prof: 0.6, alt: 11, grupo: "servico", corPadrao: "#3f6d9a",
    partes: o => [C([0, o.alt / 2 + 0.3, 0], 0.14, o.alt / 2 - 0.3), B([-o.larg / 2, 0, -0.25], [o.larg / 2, 0.6, 0.25])], pegas: o => ({ cabo: pega([0, o.alt * 0.7, 0], [0, 0, 1], [0, 1, 0]), cabo2: pega([0, o.alt * 0.45, 0], [0, 0, 1], [0, 1, 0]) }) },

  /* ======================= ESCRITÓRIO E ESCOLA ======================= */
  escrivaninha: { nome: "escrivaninha (mesa com gaveteiro)", larg: 12, prof: 5.6, alt: 6.6, grupo: "escritorio", corPadrao: "#8e7458",
    partes: o => [B([-o.larg / 2, o.alt - 0.4, -o.prof / 2], [o.larg / 2, o.alt, o.prof / 2]), B([o.larg / 2 - 3.6, 0, -o.prof / 2 + 0.2], [o.larg / 2 - 0.2, o.alt - 0.4, o.prof / 2 - 0.2]), B([-o.larg / 2 + 0.2, 0, -o.prof / 2 + 0.2], [-o.larg / 2 + 0.6, o.alt - 0.4, o.prof / 2 - 0.2]),
      ...[1, 2].map(k => ink(B([o.larg / 2 - 3.4, k * (o.alt - 0.4) / 3, o.prof / 2 - 0.2], [o.larg / 2 - 0.4, k * (o.alt - 0.4) / 3 + 0.05, o.prof / 2 - 0.15])))] },
  cadeiraEscritorio: { nome: "cadeira de escritório (giratória, rodinhas)", larg: 5.4, prof: 5.4, alt: 9.6, grupo: "escritorio", corPadrao: "#2f3338",
    partes: o => { const out = [B([-2.1, 3.6, -2.0], [2.1, 4.3, 2.0]), B([-2.0, 4.6, -2.2], [2.0, o.alt, -1.7]), C([0, 2.2, 0], 0.25, 1.4)]; for (let k = 0; k < 5; k++) { const a = k * 2 * Math.PI / 5, x = Math.sin(a) * 2.4, z = Math.cos(a) * 2.4; out.push(T([0, 0.7, 0], [x, 0.5, z], 0.18), E([x, 0.3, z], 0.3)); }
      for (const s of [-1, 1]) out.push(B([s * 2.2 - 0.2, 4.3, -1.2], [s * 2.2 + 0.2, 5.8, 1.2]), B([s * 2.2 - 0.3, 5.8, -1.4], [s * 2.2 + 0.3, 6.1, 1.4])); return out; },
    assento: () => ({ y: 4.3, encosto: true, lugares: 1 }) },
  computador: { nome: "computador (monitor, teclado e mouse)", larg: 6, prof: 3.4, alt: 4.4, grupo: "escritorio", corPadrao: "#25272b",
    partes: o => [B([-3, 1.0, -1.6], [3, o.alt, -1.3]), fundo(B([-2.8, 1.2, -1.3], [2.8, o.alt - 0.2, -1.27])), B([-0.3, 0, -1.7], [0.3, 1.0, -1.3]), B([-1.4, 0, -2.0], [1.4, 0.12, -1.1]), B([-2.4, 0, 0.3], [1.6, 0.25, 1.5]), E([2.5, 0.15, 0.9], [0.35, 0.15, 0.55])],
    toca: o => ({ banco: [-0.4, 0, 4.6], olha: -1, maos: [[0.5, 0.45, 0.9], [-1.4, 0.45, 0.9]], olhar: [0, 2.6, -1.4], pose: "sentado" }) },
  notebook: { nome: "notebook aberto", larg: 3.2, prof: 2.4, alt: 2.2, grupo: "escritorio", corPadrao: "#8f949a",
    partes: o => [B([-1.6, 0, -1.1], [1.6, 0.15, 1.1]), B([-1.6, 0.1, -1.15], [1.6, 2.2, -1.0], { R: ccRot([0, 1, -0.25]) }), fundo(B([-1.4, 0.35, -1.0], [1.4, 2.0, -0.97], { R: ccRot([0, 1, -0.25]) }))], pegas: () => ({ base: pega([0, 0.08, 1.1], [0, 0, 1], [1, 0, 0]) }) },
  arquivo: { nome: "arquivo de aço (gavetas)", larg: 4, prof: 5.4, alt: 11.4, grupo: "escritorio", corPadrao: "#8d949b",
    partes: o => [B([-o.larg / 2, 0, -o.prof / 2], [o.larg / 2, o.alt, o.prof / 2]), ...[1, 2, 3].map(k => ink(B([-o.larg / 2 + 0.2, k * o.alt / 4, o.prof / 2], [o.larg / 2 - 0.2, k * o.alt / 4 + 0.05, o.prof / 2 + 0.03]))), ...[0.5, 1.5, 2.5, 3.5].map(k => B([-0.6, k * o.alt / 4 - 0.1, o.prof / 2], [0.6, k * o.alt / 4 + 0.1, o.prof / 2 + 0.3]))] },
  quadroNegro: { nome: "quadro-negro / lousa (no cavalete)", larg: 22, prof: 4, alt: 18, grupo: "escola", corPadrao: "#2f4a3a",
    partes: o => [Object.assign(B([-o.larg / 2, 7, -0.25], [o.larg / 2, o.alt, 0.25]), {}), B([-o.larg / 2 - 0.4, 7, 0.25], [o.larg / 2 + 0.4, 7.4, 1.0]), ...[-1, 1].flatMap(s => [T([s * (o.larg / 2 - 1), 0, -o.prof / 2], [s * (o.larg / 2 - 1), o.alt, 0], 0.25), T([s * (o.larg / 2 - 1), 0, o.prof / 2], [s * (o.larg / 2 - 1), o.alt, 0], 0.25)])],
    toca: o => ({ pe: [-2.2, 0, 2.2], olha: -1, maos: [[0.4, 13.0, 0.5], [-1.2, 9.6, 0.8]], olhar: [0.4, 13, 0], pose: "empe" }) },
  carteiraEscolar: { nome: "carteira escolar (cadeira com braço-mesa)", larg: 4.4, prof: 5.6, alt: 7.6, grupo: "escola", corPadrao: "#c38a3a",
    partes: o => [B([-2, 3.7, -1.8], [2, 4.1, 1.6]), B([-2, 4.4, -2.2], [2, o.alt, -1.8]), B([0.6, 6.2, -1.2], [2.8, 6.45, 2.8]), T([2.4, 3.9, 0], [2.4, 6.2, 1], 0.15), ...pes4(1.7, 1.5, 3.7, 0.18)],
    assento: () => ({ y: 4.1, encosto: true, lugares: 1 }) },
  mesaProfessor: { nome: "mesa do professor", larg: 11, prof: 5.6, alt: 6.6, grupo: "escola", corPadrao: "#7a5a3a",
    partes: o => [B([-o.larg / 2, o.alt - 0.4, -o.prof / 2], [o.larg / 2, o.alt, o.prof / 2]), B([-o.larg / 2, 1, -o.prof / 2 + 0.3], [o.larg / 2, o.alt - 0.4, -o.prof / 2 + 0.6]), ...pes4(o.larg / 2 - 0.4, o.prof / 2 - 0.4, o.alt - 0.4, 0.3)] },
  bebedouro: { nome: "bebedouro", larg: 3, prof: 3, alt: 9, grupo: "escola", corPadrao: "#c7ccd1",
    partes: o => [B([-1.5, 0, -1.5], [1.5, o.alt - 1.2, 1.5]), Object.assign(C([0, o.alt - 0.6, 0], 1.3, 0.6), { cor: "#9fc7df" }), C([0, o.alt - 1.4, 1.6], 0.2, 0.2, { R: ccRot([0, 0, 1]) })],
    toca: o => ({ pe: [0, 0, 3.6], olha: -1, maos: [[1.0, o.alt - 1.6, 1.5], [-1.0, o.alt - 1.6, 1.5]], olhar: [0, o.alt - 1.2, 1.6], pose: "empe" }) },
  mochilaEscolar: { nome: "mochila escolar", larg: 2.6, prof: 1.4, alt: 3.6, grupo: "escola", corPadrao: "#3f6fb4",
    partes: o => [B([-1.3, 0, -0.7], [1.3, o.alt - 0.4, 0.7]), E([0, o.alt - 0.4, 0], [1.3, 0.4, 0.7]), B([-0.9, 0.4, 0.7], [0.9, 1.6, 1.0]), A([0, o.alt, 0], 0.4, 0.08, "z")],
    pegas: o => ({ alca: pega([0, o.alt + 0.4, 0], [0, 1, 0], [1, 0, 0]) }) },

  /* ======================= RUA E LAZER ======================= */
  bancoPraca: { nome: "banco de praça (ripas e encosto)", larg: 15, prof: 5, alt: 7.4, grupo: "rua", corPadrao: "#6f8b4a",
    partes: o => { const L = o.larg / 2, out = []; for (let k = 0; k < 4; k++) out.push(B([-L, 3.6, -1.9 + k], [L, 3.95, -1.25 + k])); for (let k = 0; k < 3; k++) out.push(B([-L, 4.6 + k * 0.95, -2.3], [L, 5.2 + k * 0.95, -1.95], { R: ccRot([0, 1, -0.18]) }));
      for (const s of [-1, 1]) out.push(B([s * (L - 1.2) - 0.2, 0, -2], [s * (L - 1.2) + 0.2, 3.6, 2]), B([s * (L - 1.2) - 0.2, 3.6, -2.4], [s * (L - 1.2) + 0.2, o.alt, -1.9]), B([s * (L - 0.6) - 0.2, 5, -1.8], [s * (L - 0.6) + 0.2, 5.3, 1.6])); return out; },
    assento: () => ({ y: 3.95, encosto: true, lugares: 3 }), deita: o => ({ y: 3.95, eixo: "x", cabeca: 1, larg: o.larg - 2.4 }) },
  posteLuz: { nome: "poste de luz", larg: 5, prof: 2, alt: 50, grupo: "rua", corPadrao: "#4a4f55",
    partes: o => [C([0, o.alt / 2, 0], 0.5, o.alt / 2, { r1: 0.3 }), T([0, o.alt - 0.5, 0], [0, o.alt + 0.8, 3.4], 0.25), Object.assign(E([0, o.alt + 0.4, 3.8], [1.0, 0.45, 1.6]), {}), Object.assign(E([0, o.alt + 0.1, 3.8], [0.7, 0.2, 1.2]), { cor: "#f5e9a8" })] },
  semaforo: { nome: "semáforo", larg: 2.4, prof: 2.4, alt: 32, grupo: "rua", corPadrao: "#3a3d40",
    partes: o => [C([0, (o.alt - 7) / 2, 0], 0.35, (o.alt - 7) / 2), B([-1.1, o.alt - 7, -0.9], [1.1, o.alt, 0.9]), ...[["#d84a3a", 5.7], ["#e6b33a", 3.5], ["#4aa35a", 1.3]].map(([c, y]) => Object.assign(C([0, o.alt - 7 + y, 0.95], 0.75, 0.08, { R: ccRot([0, 0, 1]) }), { cor: c }))] },
  hidrante: { nome: "hidrante", larg: 2.6, prof: 2, alt: 5.4, grupo: "rua", corPadrao: "#c8322c",
    partes: o => [C([0, 0.2, 0], 1.1, 0.2), C([0, 2.4, 0], 0.85, 2.0), E([0, 4.4, 0], [0.9, 0.9, 0.9]), C([0, 5.2, 0], 0.25, 0.3), ...[-1, 1].map(s => C([s * 1.1, 3.2, 0], 0.4, 0.35, { R: ccRot([1, 0, 0]) })), C([0, 3.2, 1.0], 0.5, 0.3, { R: ccRot([0, 0, 1]) })] },
  lixeiraRua: { nome: "lixeira de rua (poste com cesto)", larg: 3, prof: 3, alt: 9, grupo: "rua", corPadrao: "#3e6a4a",
    partes: o => [C([0, o.alt / 2, -1.6], 0.25, o.alt / 2), C([0, o.alt - 2.6, 0], 1.4, 2.4, { r1: 1.5 }), fundo(C([0, o.alt - 0.15, 0], 1.25, 0.05))] },
  pontoOnibus: { nome: "ponto de ônibus (cobertura e banco)", larg: 20, prof: 7, alt: 22, grupo: "rua", corPadrao: "#7a8a96",
    partes: o => { const L = o.larg / 2, P = o.prof / 2; return [B([-L, o.alt - 0.6, -P], [L, o.alt, P]), Object.assign(B([-L, 2, -P], [L, o.alt - 0.6, -P + 0.2]), { cor: "#cfe2ec" }), ...[-1, 1].map(s => B([s * (L - 0.3) - 0.3, 0, -P], [s * (L - 0.3) + 0.3, o.alt - 0.6, -P + 0.6])),
      B([-L + 2, 3.6, -P + 0.4], [L - 2, 4.0, -P + 3]), ...[-1, 1].map(s => B([s * (L - 3) - 0.2, 0, -P + 1], [s * (L - 3) + 0.2, 3.6, -P + 2.6])), B([L - 0.6, 6, -P + 0.2], [L, 18, -P + 0.4])]; },
    assento: o => ({ y: 4.0, encosto: false, lugares: 3, z: -o.prof / 2 + 1.7 }) },
  orelhao: { nome: "orelhão (telefone público)", larg: 7, prof: 7, alt: 20, grupo: "rua", corPadrao: "#e0a53a",
    partes: o => [C([0, 7, -2.6], 0.3, 7), Object.assign(E([0, 14.5, -0.6], [3.5, 4.4, 3.2]), {}), fundo(E([0, 13.5, 0.4], [2.8, 3.6, 2.4])), B([-1, 10, -1.8], [1, 13, -1.2]), ink(T([0.8, 12.2, -1.1], [0.8, 10.8, -1.1], 0.25))] },
  caixaCorreio: { nome: "caixa de correio", larg: 3.6, prof: 3.6, alt: 10, grupo: "rua", corPadrao: "#d0a63a",
    partes: o => [C([0, 3, 0], 0.4, 3), B([-1.8, 6, -1.8], [1.8, o.alt - 1.6, 1.8]), C([0, o.alt - 1.6, 0], 1.8, 1.8, { R: ccRot([1, 0, 0]), meio: [0, 1, 0] }), ink(B([-1.2, o.alt - 2.4, 1.8], [1.2, o.alt - 2.2, 1.83]))] },
  cadeiraPraia: { nome: "cadeira de praia (reclinada)", larg: 5, prof: 8, alt: 7, grupo: "lazer", corPadrao: "#d8574a",
    partes: o => [B([-2.2, 2.2, -1.2], [2.2, 2.4, 2.8], { R: ccRot([0, 1, 0.12]) }), B([-2.2, 2.8, -3.6], [2.2, 3.0, 2.6], { R: ccRot([0, 0.55, -1]) }), ...[-1, 1].flatMap(s => [T([s * 2.3, 0, 3.2], [s * 2.3, 2.4, 1.6], 0.15), T([s * 2.3, 0, -1.6], [s * 2.3, 2.4, 0], 0.15), T([s * 2.3, 2.3, -1.2], [s * 2.3, o.alt, -3.4], 0.15)])],
    assento: () => ({ y: 2.4, encosto: true, lugares: 1, reclina: 30 }) },
  guardaSol: { nome: "guarda-sol de praia", larg: 18, prof: 18, alt: 18, grupo: "lazer", corPadrao: "#e6b33a",
    partes: o => [C([0, o.alt / 2, 0], 0.2, o.alt / 2), C([0, o.alt - 1.6, 0], o.larg / 2, 1.6, { r1: 0.3, lados: 8 })] },
  churrasqueira: { nome: "churrasqueira", larg: 7, prof: 4, alt: 8, grupo: "lazer", corPadrao: "#3a3a3a",
    partes: o => [B([-3.2, 6, -1.8], [3.2, 7.2, 1.8]), ink(B([-3, 7.2, -1.6], [3, 7.3, 1.6])), ...pes4(2.9, 1.5, 6, 0.2), B([-3.2, 2, -1.6], [3.2, 2.2, 1.6])],
    toca: o => ({ pe: [0, 0, 4.2], olha: -1, maos: [[1.4, 8.2, 0.4], [-1.6, 7.8, 1.6]], olhar: [0, 7.2, 0], pose: "empe" }) },
  balanco: { nome: "balanço (estrutura e assento)", larg: 14, prof: 8, alt: 18, grupo: "lazer", corPadrao: "#b84a3a",
    partes: o => { const L = o.larg / 2, out = [T([-L, o.alt, 0], [L, o.alt, 0], 0.35)]; for (const s of [-1, 1]) out.push(T([s * L, o.alt, 0], [s * L, 0, -o.prof / 2], 0.3), T([s * L, o.alt, 0], [s * L, 0, o.prof / 2], 0.3));
      out.push(B([-2.2, 4.6, -1], [2.2, 5, 1]), T([-1.9, 5, 0], [-1.9, o.alt, 0], 0.08), T([1.9, 5, 0], [1.9, o.alt, 0], 0.08)); return out; },
    assento: () => ({ y: 5, encosto: false, lugares: 1 }), pegas: () => ({ correnteE: pega([1.9, 9, 0], [-1, 0, 0], [0, 1, 0]), correnteD: pega([-1.9, 9, 0], [1, 0, 0], [0, 1, 0]) }) },
  escorregador: { nome: "escorregador", larg: 5, prof: 22, alt: 14, grupo: "lazer", corPadrao: "#3a8ac8",
    partes: o => { const out = [B([-2, 11, -10], [2, 11.4, -7]), ...[-1, 1].flatMap(s => [B([s * 2 - 0.2, 0, -10.2], [s * 2 + 0.2, o.alt, -9.8]), B([s * 2 - 0.2, 0, -7.2], [s * 2 + 0.2, o.alt, -6.8])])];
      for (let k = 0; k < 6; k++) out.push(T([-2, 1.6 + k * 1.6, -10 - (6 - k) * 0.4], [2, 1.6 + k * 1.6, -10 - (6 - k) * 0.4], 0.15));
      out.push(B([-2, 11, -7], [2, 11.4, 9], { R: ccRot([0, 1, 0.65]) }), ...[-1, 1].map(s => B([s * 2 - 0.15, 11.4, -7], [s * 2 + 0.15, 12.4, 9], { R: ccRot([0, 1, 0.65]) }))); return out; },
    assento: () => ({ y: 11.4, encosto: false, lugares: 1, z: -8.5 }) },
  gangorra: { nome: "gangorra", larg: 3, prof: 20, alt: 4, grupo: "lazer", corPadrao: "#e0a53a",
    partes: o => [B([-1.4, 0, -1], [1.4, 2.4, 1]), B([-1, 2.4, -o.prof / 2], [1, 2.8, o.prof / 2], { R: ccRot([0, 1, 0.18]) }), ...[-1, 1].map(s => T([-0.8, 2.6 + s * 1.6 + 0.4, s * (o.prof / 2 - 2)], [0.8, 2.6 + s * 1.6 + 0.4, s * (o.prof / 2 - 2)], 0.15))],
    assento: () => ({ y: 4.4, encosto: false, lugares: 1, z: 8 }) },
  mesaPiquenique: { nome: "mesa de piquenique (bancos acoplados)", larg: 14, prof: 13, alt: 6.6, grupo: "lazer", corPadrao: "#8b6a43",
    partes: o => [B([-o.larg / 2, o.alt - 0.5, -2.6], [o.larg / 2, o.alt, 2.6]), ...[-1, 1].map(s => B([-o.larg / 2, 3.6, s * 4.6 - 1.3], [o.larg / 2, 4.0, s * 4.6 + 1.3])), ...[-1, 1].flatMap(s => [T([s * (o.larg / 2 - 1.5), 0, -6], [s * (o.larg / 2 - 1.5), o.alt - 0.5, 0], 0.3), T([s * (o.larg / 2 - 1.5), 0, 6], [s * (o.larg / 2 - 1.5), o.alt - 0.5, 0], 0.3)])],
    assento: () => ({ y: 4.0, encosto: false, lugares: 4, z: 4.6 }) },
  barraca: { nome: "barraca de acampamento", larg: 14, prof: 18, alt: 10, grupo: "lazer", corPadrao: "#d97a2a",
    partes: o => [{ cil: true, c: [0, o.alt / 2, 0], r: o.larg / 2, hh: o.prof / 2, lados: 3, R: ccRot([0, 0, 1]) }, fundo(C([0, o.alt * 0.3, o.prof / 2 + 0.02], o.alt * 0.3, 0.03, { R: ccRot([0, 0, 1]), lados: 3 }))] },
  fogueira: { nome: "fogueira (lenha e pedras)", larg: 5, prof: 5, alt: 2, grupo: "lazer", corPadrao: "#6b4a2b",
    partes: o => { const out = []; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; out.push(Object.assign(E([Math.sin(a) * 2.2, 0.4, Math.cos(a) * 2.2], [0.6, 0.45, 0.5], { facetas: 7, semente: k + 2 }), { cor: "#8a8478" })); }
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; out.push(T([Math.sin(a) * 1.6, 0.3, Math.cos(a) * 1.6], [-Math.sin(a) * 1.6, 1.2, -Math.cos(a) * 1.6], 0.28)); } return out; } },
  cercaMadeira: { nome: "cerca de madeira", larg: 20, prof: 0.6, alt: 6, grupo: "rua", corPadrao: "#a07a50",
    partes: o => { const L = o.larg / 2, out = [B([-L, o.alt * 0.35, 0.3], [L, o.alt * 0.45, 0.5]), B([-L, o.alt * 0.75, 0.3], [L, o.alt * 0.85, 0.5])]; const n = Math.max(3, Math.round(o.larg / 1.4)); for (let k = 0; k < n; k++) { const x = -L + (k + 0.5) * o.larg / n; out.push(B([x - 0.5, 0, -0.1], [x + 0.5, o.alt - 0.3, 0.3]), B([x - 0.5, o.alt - 0.3, -0.1], [x + 0.5, o.alt, 0.3], { R: ccRot([0, 1, 0]) })); } return out; } },
  placa: { nome: "placa (de rua ou aviso)", larg: 5, prof: 1, alt: 20, grupo: "rua", corPadrao: "#2f6fb4",
    partes: o => [C([0, (o.alt - 3) / 2, 0], 0.25, (o.alt - 3) / 2), B([-o.larg / 2, o.alt - 4, 0.25], [o.larg / 2, o.alt, 0.45])] },
  vasoPlanta: { nome: "vaso com planta", larg: 4, prof: 4, alt: 8, grupo: "sala", corPadrao: "#a05a3a",
    partes: o => [C([0, 1.5, 0], o.larg * 0.35, 1.5, { r1: o.larg / 2 }), Object.assign(E([0, o.alt * 0.62, 0], [o.larg / 2, o.alt * 0.4, o.prof / 2], { facetas: 9, semente: 4 }), { cor: "#4f7f4a" })] },
  carrinhoBebe: { nome: "carrinho de bebê", larg: 5, prof: 8, alt: 9, grupo: "rua", corPadrao: "#4a6a8a",
    partes: o => [B([-2.2, 3.2, -2.6], [2.2, 5.6, 2.2]), Object.assign(E([0, 5.8, -1.4], [2.3, 2.2, 1.6]), {}), T([0, 5.4, -2.6], [0, o.alt, -5], 0.15), T([-2, o.alt, -5], [2, o.alt, -5], 0.2), ...[-1, 1].flatMap(sx => [-1, 1].flatMap(sz => roda(sx * 2.3, 1.1, sz * 2.4, 1.1, 0.4)))],
    pegas: o => ({ alca: pega([0, o.alt, -5], [0, 0, -1], [1, 0, 0]) }) },
  carrinhoMercado: { nome: "carrinho de supermercado", larg: 5.4, prof: 8.4, alt: 9, grupo: "rua", corPadrao: "#9aa3ab",
    partes: o => { const out = [B([-2.4, 3, -3], [2.4, 3.2, 3.6])]; for (const s of [-1, 1]) out.push(B([s * 2.5 - 0.08, 3, -3], [s * 2.5 + 0.08, 8, 3.8])); out.push(B([-2.5, 3, 3.6], [2.5, 7.6, 3.8]), B([-2.5, 3, -3.2], [2.5, 8, -3]), T([-2.4, 8.4, -4.2], [2.4, 8.4, -4.2], 0.2), ...[-1, 1].flatMap(sx => [-1, 1].flatMap(sz => roda(sx * 1.8, 0.5, sz * 2.8, 0.5, 0.3)))); return out; },
    pegas: () => ({ alca: pega([0, 8.4, -4.2], [0, 0, -1], [1, 0, 0]) }) },

  /* ======================= INSTRUMENTOS GRANDES (tocar) ======================= */
  piano: { nome: "piano de armário (com banqueta)", larg: 13, prof: 5, alt: 11, grupo: "instrumento", corPadrao: "#1f1a18",
    partes: o => { const L = o.larg / 2; return [B([-L, 0.4, -2.5], [L, o.alt, -0.6]), B([-L, 5.6, -0.6], [L, 6.2, 1.6]), Object.assign(B([-L + 0.8, 6.2, 0], [L - 0.8, 6.45, 1.6]), { cor: "#f4f1e8" }), ...Array.from({ length: 18 }, (_, k) => ink(B([-L + 1.2 + k * (o.larg - 2.4) / 18, 6.45, 0], [-L + 1.2 + k * (o.larg - 2.4) / 18 + 0.25, 6.65, 0.9]))),
      ...[-1, 1].map(s => B([s * (L - 0.4) - 0.4, 0, -0.6], [s * (L - 0.4) + 0.4, 5.6, 1.6])), B([-3, 0, 3.4], [3, 4.2, 5.6]), B([-L + 0.6, 7.4, -0.7], [L - 0.6, 9.4, -0.55])]; },
    toca: o => ({ banco: [0, 4.2, 4.5], olha: -1, maos: [[2.6, 6.95, 0.7], [-2.6, 6.95, 0.7]], olhar: [0, 6.5, 0.5], pose: "sentado" }) },
  pianoCauda: { nome: "piano de cauda (tampa aberta, com banqueta)", larg: 13, prof: 24, alt: 13, grupo: "instrumento", corPadrao: "#151313",
    partes: o => { const out = [B([-6.5, 5.6, 3.6], [6.5, 6.2, 5.8]), Object.assign(B([-5.8, 6.2, 4.2], [5.8, 6.45, 5.8]), { cor: "#f4f1e8" })]; for (let k = 0; k < 18; k++) out.push(ink(B([-5.4 + k * 0.62, 6.45, 4.2], [-5.4 + k * 0.62 + 0.25, 6.65, 5.0])));
      for (let k = 0; k < 6; k++) { const z0 = 3.6 - k * 3.4, w = 6.5 * (1 - 0.1 * k * k / 6); out.push(B([-6.5, 6.2, z0 - 3.4], [-6.5 + 2 * w, 9.6, z0])); }
      out.push(B([-6.5, 13.4, -16], [6.5, 13.6, 2.4], { R: ccRot([-0.55, 1, 0]) }), T([4, 9.6, -2], [3, 14, -2], 0.15), ...[[-5.6, 3], [5.6, 3], [-3, -15]].map(([x, z]) => C([x, 2.8, z], 0.5, 2.8)), B([-3, 0, 7.8], [3, 4.2, 10])); return out; },
    toca: () => ({ banco: [0, 4.2, 8.9], olha: -1, maos: [[2.6, 6.95, 4.8], [-2.6, 6.95, 4.8]], olhar: [0, 6.5, 4.5], pose: "sentado" }) },
  teclado: { nome: "teclado musical (no suporte em X)", larg: 11, prof: 3.4, alt: 8.6, grupo: "instrumento", corPadrao: "#2b2b2e",
    partes: o => { const L = o.larg / 2, out = [B([-L, 7.6, -1.6], [L, o.alt, 1.6]), Object.assign(B([-L + 0.6, o.alt, -0.2], [L - 0.6, o.alt + 0.12, 1.5]), { cor: "#f4f1e8" })]; for (let k = 0; k < 16; k++) out.push(ink(B([-L + 0.9 + k * (o.larg - 1.8) / 16, o.alt + 0.12, -0.2], [-L + 0.9 + k * (o.larg - 1.8) / 16 + 0.2, o.alt + 0.3, 0.7])));
      for (const s of [-1, 1]) out.push(T([s * 3.4, 0, -2], [s * 3.4, 7.6, 2], 0.2), T([s * 3.4, 0, 2], [s * 3.4, 7.6, -2], 0.2)); return out; },
    toca: o => ({ pe: [0, 0, 3.4], olha: -1, maos: [[2.2, o.alt + 0.5, 0.9], [-2.2, o.alt + 0.5, 0.9]], olhar: [0, o.alt, 0.6], pose: "empe" }) },
  bateria: { nome: "bateria (bumbo, caixa, tons, pratos e banco)", larg: 14, prof: 12, alt: 10, grupo: "instrumento", corPadrao: "#b02a2a",
    partes: o => { const out = [C([0, 2.4, 1], 2.4, 1.6, { R: ccRot([0, 0, 1]) }), ink(C([0, 2.4, 2.65], 2.0, 0.05, { R: ccRot([0, 0, 1]) })), C([-2.2, 5.8, -0.6], 1.4, 0.6), T([-2.2, 0, -0.6], [-2.2, 5.2, -0.6], 0.12)];
      for (const s of [-1, 1]) out.push(C([s * 1.2, 5.6, 1.6], 0.9, 0.7, { R: ccRot([0, 1, 0.4]) })); out.push(C([2.8, 3.6, -0.4], 1.6, 1.4));
      for (const [x, y, z, r] of [[-4.4, 8.4, 1.4, 2.0], [4.2, 9.0, 1.6, 2.2], [-4.2, 5.8, -1.6, 1.3]]) { out.push(T([x, 0, z], [x, y, z], 0.1), Object.assign(C([x, y, z], r, 0.06, { r1: 0.3 }), { cor: "#d8b44a" })); }
      out.push(C([0, 3.4, -4.6], 1.4, 0.4), C([0, 1.5, -4.6], 0.15, 1.5)); return out; },
    toca: () => ({ banco: [0, 3.8, -4.6], olha: 1, maos: [[-2.2, 6.6, -0.4], [1.6, 7.4, 1.2]], olhar: [0, 6, 0.8], pose: "sentado", baquetas: true }) },
  harpa: { nome: "harpa", larg: 5, prof: 2, alt: 15, grupo: "instrumento", corPadrao: "#b58a3a",
    partes: o => { const out = [B([-1.2, 0, -1], [1.2, 0.8, 1]), T([-1, 0.8, 0], [-1.6, 14, 0], 0.5), T([-1.6, 14, 0], [2.4, 13, 0], 0.4), T([2.4, 13, 0], [0.8, 0.8, 0], 0.7)]; for (let k = 1; k < 9; k++) out.push(T([-1.1 + k * 0.42, 1.6, 0], [-1.6 + k * 0.48, 13.6 - k * 0.12, 0], 0.03)); return out; },
    toca: () => ({ banco: [-1.0, 4.2, -4.6], olha: 1, maos: [[0.8, 8.4, -0.3], [-0.6, 6.4, 0.3]], olhar: [0.4, 8, 0], pose: "sentado" }) },
  violoncelo: { nome: "violoncelo (apoiado no chão)", larg: 4, prof: 2, alt: 11, grupo: "instrumento", corPadrao: "#8a4a22",
    partes: o => [C([0, 0.6, 0], 0.08, 0.6), E([0, 2.8, 0], [1.9, 1.8, 0.8]), E([0, 5.2, 0], [1.6, 1.4, 0.8]), B([-0.25, 6.4, -0.15], [0.25, 10.2, 0.15]), E([0, 10.6, 0], [0.3, 0.45, 0.3])],
    toca: () => ({ banco: [0, 4.2, -3.4], olha: 1, maos: [[-0.2, 8.6, -0.4], [1.6, 4.2, 0.9]], olhar: [0, 6, 0], pose: "sentado" }) },
  contrabaixo: { nome: "contrabaixo acústico (em pé)", larg: 5, prof: 2.4, alt: 16, grupo: "instrumento", corPadrao: "#7a3f1c",
    partes: o => [C([0, 0.8, 0], 0.1, 0.8), E([0, 3.8, 0], [2.4, 2.4, 1.0]), E([0, 7.0, 0], [2.0, 1.8, 1.0]), B([-0.3, 8.6, -0.2], [0.3, 15, 0.2]), E([0, 15.5, 0], [0.35, 0.55, 0.35])],
    toca: () => ({ pe: [0.6, 0, -3.2], olha: 1, maos: [[-0.2, 12.2, -0.4], [1.8, 6.8, 1.0]], olhar: [0, 9, 0], pose: "empe" }) },
  microfonePedestal: { nome: "microfone no pedestal", larg: 3, prof: 3, alt: 13.6, grupo: "instrumento", corPadrao: "#2a2a2a",
    partes: o => [C([0, 0.1, 0], 1.4, 0.1, { lados: 3 }), C([0, o.alt / 2, 0], 0.12, o.alt / 2 - 0.5), T([0, o.alt - 0.6, 0], [0, o.alt, 0.6], 0.15), E([0, o.alt + 0.35, 0.95], [0.45, 0.45, 0.6])],
    pegas: o => ({ haste: pega([0, o.alt - 1, 0], [0, 0, 1], [0, 1, 0]), mic: pega([0, o.alt, 0.6], [0, 0, 1], [0, 1, 1]) }),
    toca: o => ({ pe: [0, 0, 2.4], olha: -1, maos: [[0.2, o.alt - 0.6, 0.15], [-0.4, o.alt - 1.4, 0.05]], olhar: [0, o.alt + 0.3, 1], pose: "empe", boca: [0, o.alt + 0.35, 0.95] }) },
  xilofone: { nome: "xilofone (no suporte)", larg: 10, prof: 4, alt: 7.4, grupo: "instrumento", corPadrao: "#a3743a",
    partes: o => { const out = [...pes4(4, 1.4, 6.6, 0.2), B([-4.6, 6.6, -1.8], [4.6, 6.9, 1.8])]; for (let k = 0; k < 14; k++) out.push(B([-4.4 + k * 0.63, 6.9, -1.6 + k * 0.05], [-4.4 + k * 0.63 + 0.5, 7.3, 1.6 - k * 0.05])); return out; },
    toca: o => ({ pe: [0, 0, 4.2], olha: -1, maos: [[1.6, o.alt + 1.2, 0.8], [-1.6, o.alt + 1.2, 0.8]], olhar: [0, o.alt, 0], pose: "empe", baquetas: true }) },
  amplificador: { nome: "amplificador / caixa de som", larg: 6, prof: 3.4, alt: 6.6, grupo: "instrumento", corPadrao: "#222",
    partes: o => [B([-3, 0, -1.7], [3, o.alt, 1.7]), ink(B([-2.6, 0.4, 1.7], [2.6, o.alt - 1.4, 1.75])), ...[0.3, 0.75].map(t => fundo(C([0, 0.4 + t * (o.alt - 1.8), 1.76], 1.2 * (1 - t * 0.4), 0.04, { R: ccRot([0, 0, 1]) }))), A([0, o.alt, 0], 0.7, 0.12, "x")] },

  /* ======================= INSTRUMENTOS DE MÃO (segura / toca) ======================= */
  saxofone: { nome: "saxofone", larg: 2, prof: 1.6, alt: 6.4, grupo: "instrumento", pega: "corpo",
    partes: o => [T([0, 0.9, 0.3], [0, 5.2, 0], 0.32, { r1: 0.22 }), A([0, 0.9, 0.8], 0.55, 0.3, "x"), C([0, 1.6, 1.3], 0.55, 0.7, { r1: 0.85 }), T([0, 5.2, 0], [0, 6.0, 0.5], 0.12), T([0, 6.0, 0.5], [0, 6.2, 1.0], 0.07)],
    pegas: () => ({ corpo: pega([0, 3.0, -0.15], [0, 0, -1], [0, 1, 0]), cabo: pega([0, 4.4, -0.1], [0, 0, -1], [0, 1, 0]) }), pontos: () => ({ boca: [0, 6.2, 1.0], campana: [0, 2.3, 1.3], ponta: [0, 6.2, 1.0] }) },
  clarinete: { nome: "clarinete", larg: 0.6, prof: 0.6, alt: 6, grupo: "instrumento", pega: "cabo",
    partes: o => [C([0, 0.5, 0], 0.45, 0.5, { r1: 0.18 }), C([0, 3.2, 0], 0.17, 2.3), C([0, 5.75, 0], 0.13, 0.25, { r1: 0.06 })],
    pegas: () => ({ cabo: pega([0, 3.8, -0.17], [0, 0, -1], [0, 1, 0]), cabo2: pega([0, 2.0, -0.17], [0, 0, -1], [0, 1, 0]) }), pontos: o => ({ boca: [0, o.alt, 0], ponta: [0, o.alt, 0], campana: [0, 0.3, 0] }) },
  ukulele: { nome: "ukulele", larg: 1.9, prof: 0.7, alt: 5.2, grupo: "instrumento", pega: "braco",
    partes: () => [E([0, 0.9, 0], [0.95, 0.9, 0.32]), E([0, 1.9, 0], [0.75, 0.7, 0.32]), B([-0.13, 2.5, -0.08], [0.13, 4.6, 0.08]), B([-0.18, 4.6, -0.06], [0.18, 5.2, 0.06])],
    pegas: () => ({ braco: pega([0, 3.6, -0.1], [0, 0, -1], [0, 1, 0]), corpo: pega([0, 1.4, 0.35], [0, 0, 1], [1, 0, 0]), cabo: pega([0, 3.6, -0.1], [0, 0, -1], [0, 1, 0]) }), pontos: () => ({ boca: [0, 1.5, 0.35], cordas: [0, 1.7, 0.35], ponta: [0, 5.2, 0] }) },
  cavaquinho: { nome: "cavaquinho", larg: 2.2, prof: 0.8, alt: 6, grupo: "instrumento", pega: "braco",
    partes: () => [E([0, 1.0, 0], [1.1, 1.0, 0.35]), E([0, 2.2, 0], [0.85, 0.8, 0.35]), B([-0.14, 2.9, -0.08], [0.14, 5.3, 0.08]), B([-0.2, 5.3, -0.06], [0.2, 6, 0.06])],
    pegas: () => ({ braco: pega([0, 4.1, -0.1], [0, 0, -1], [0, 1, 0]), corpo: pega([0, 1.6, 0.38], [0, 0, 1], [1, 0, 0]), cabo: pega([0, 4.1, -0.1], [0, 0, -1], [0, 1, 0]) }), pontos: () => ({ boca: [0, 1.7, 0.38], cordas: [0, 1.9, 0.38], ponta: [0, 6, 0] }) },
  baixo: { nome: "baixo elétrico", larg: 3.2, prof: 0.5, alt: 10, grupo: "instrumento", pega: "braco",
    partes: () => [E([0, 1.4, 0], [1.6, 1.4, 0.2]), B([0.2, 2.6, -0.2], [1.2, 3.6, 0.2]), B([-0.22, 2.8, -0.1], [0.22, 9.4, 0.1]), B([-0.32, 9.4, -0.08], [0.32, 10, 0.08])],
    pegas: () => ({ braco: pega([0, 6.6, -0.12], [0, 0, -1], [0, 1, 0]), corpo: pega([0, 1.8, 0.25], [0, 0, 1], [1, 0, 0]), cabo: pega([0, 6.6, -0.12], [0, 0, -1], [0, 1, 0]) }), pontos: () => ({ boca: [0, 1.6, 0.25], cordas: [0, 2, 0.25], ponta: [0, 10, 0] }) },
  pandeiro: { nome: "pandeiro", larg: 2.4, prof: 0.5, alt: 2.4, grupo: "instrumento", pega: "aro",
    partes: o => [A([0, o.alt / 2, 0], 1.1, 0.15, "z"), Object.assign(C([0, o.alt / 2, 0.15], 1.05, 0.03, { R: ccRot([0, 0, 1]) }), { cor: "#efe6d0" }), ...Array.from({ length: 5 }, (_, k) => { const a = k * 2 * Math.PI / 5 + 0.6; return Object.assign(C([Math.sin(a) * 1.15, o.alt / 2 + Math.cos(a) * 1.15, 0], 0.22, 0.05, { R: ccRot([Math.sin(a), Math.cos(a), 0]) }), { cor: "#d8b44a" }); })],
    pegas: o => ({ aro: pega([-1.15, o.alt / 2, 0], [-1, 0, 0], [0, 0, 1]), cabo: pega([-1.15, o.alt / 2, 0], [-1, 0, 0], [0, 0, 1]) }), pontos: o => ({ centro: [0, o.alt / 2, 0.15], ponta: [0, o.alt, 0] }) },
  gaita: { nome: "gaita de boca", larg: 1, prof: 0.3, alt: 0.35, grupo: "instrumento", pega: "corpo",
    partes: o => [B([-0.5, 0, -0.12], [0.5, 0.35, 0.12]), ink(B([-0.45, 0.1, 0.12], [0.45, 0.25, 0.14]))], pegas: () => ({ corpo: pega([0.5, 0.17, 0], [1, 0, 0], [0, 1, 0]), cabo: pega([0.5, 0.17, 0], [1, 0, 0], [0, 1, 0]) }), pontos: () => ({ boca: [0, 0.17, 0.14], ponta: [0, 0.35, 0] }) },
  acordeao: { nome: "acordeão / sanfona", larg: 4.2, prof: 1.8, alt: 3.6, grupo: "instrumento", pega: "fole",
    partes: o => [B([-2.1, 0, -0.9], [-1.4, o.alt, 0.9]), Object.assign(B([-1.4, 0.2, -0.85], [1.0, o.alt - 0.2, 0.85]), { cor: "#2b2b2e" }), ...[-0.9, -0.3, 0.3].map(x => ink(B([x, 0.2, -0.86], [x + 0.06, o.alt - 0.2, 0.86]))), B([1.0, 0, -0.9], [2.1, o.alt, 0.9]), Object.assign(B([2.1, 0.3, -0.5], [2.25, o.alt - 0.3, 0.6]), { cor: "#f4f1e8" })],
    pegas: o => ({ fole: pega([-2.15, o.alt / 2, 0], [-1, 0, 0], [0, 1, 0]), teclas: pega([2.25, o.alt / 2, 0], [1, 0, 0], [0, 1, 0]), cabo: pega([-2.15, o.alt / 2, 0], [-1, 0, 0], [0, 1, 0]) }), pontos: o => ({ centro: [0, o.alt / 2, 0], ponta: [0, o.alt, 0] }) },
  trombone: { nome: "trombone", larg: 1.6, prof: 2, alt: 9, grupo: "instrumento", pega: "cabo",
    partes: o => [T([0, -0.4, 0], [0, 0.2, 0], 0.07, { r1: 0.12 }), T([0, 0.2, 0], [0, 8.4, 0], 0.08), T([0, 0.2, -0.7], [0, 8.4, -0.7], 0.08), A([0, 8.4, -0.35], 0.35, 0.08, "x"), T([0, 0.2, 0], [0, 0.6, -1.3], 0.09), T([0, 0.6, -1.3], [0, 5.2, -1.3], 0.1), C([0, 6.0, -1.3], 0.35, 0.8, { r1: 1.0 })],
    pegas: () => ({ cabo: pega([0, 1.4, -0.95], [0, 0, -1], [0, 1, 0]), vara: pega([0, 5.4, -0.35], [0, -1, 0], [0, 0, 1]) }), pontos: () => ({ boca: [0, -0.4, 0], som: [0, 6.8, -1.3], campana: [0, 6.8, -1.3], ponta: [0, 8.4, 0] }) },

  /* ======================= VEÍCULOS POR CATEGORIA ======================= */
  bicicleta: { nome: "bicicleta (modelo urbana, speed, bmx, mountain)", larg: 5, prof: 15, alt: 9, grupo: "veiculo", veiculo: "terra", corPadrao: "#c8322c",
    partes: o => { const M = BIKES[o.modelo] || BIKES.urbana, r = M.r, zf = M.eixo / 2, zt = -M.eixo / 2, yc = 3.2 + (r - 3.2) * 0.4, sel = [0, M.selim, zt + 2.6], gui = [0, M.guidao, zf - 1.2], mov = [0, r * 0.75, zt + 4.2];
      const out = [...roda(0, r, zf, r, 0.38), ...roda(0, r, zt, r, 0.38), T(mov, [0, sel[1] - 0.8, sel[2]], 0.22), T(mov, [0, gui[1] - 1.6, zf - 0.6], 0.24), T([0, sel[1] - 1.2, sel[2] + 0.2], [0, gui[1] - 1.6, zf - 0.6], 0.2),
        T(mov, [0.5, r, zt], 0.12), T([0.5, r, zt], [0.3, sel[1] - 1.2, sel[2] + 0.2], 0.1), T([0, gui[1] - 1.6, zf - 0.6], [0, r, zf], 0.16), T([0, gui[1] - 1.6, zf - 0.6], [0, gui[1], gui[2]], 0.15),
        T([-M.gw, gui[1], gui[2]], [M.gw, gui[1], gui[2]], 0.13), Object.assign(E([0, sel[1], sel[2]], [0.6, 0.25, 1.1]), { cor: "ink" }), T([0, sel[1] - 1.2, sel[2]], [0, sel[1], sel[2]], 0.1), A([0, mov[1], mov[2]], 0.75, 0.1, "x"),
        T([-1.2, mov[1] - 1, mov[2] + 0.3], [1.2, mov[1] + 1, mov[2] - 0.3], 0.1)];
      if (M.cesta) out.push(B([-1.4, gui[1] - 1.6, zf - 0.2], [1.4, gui[1] - 0.2, zf + 2])); if (M.drop) for (const s of [-1, 1]) out.push(A([s * M.gw, gui[1] - 0.8, gui[2] + 0.4], 0.8, 0.12, "x")); return out; },
    assentos: o => { const M = BIKES[o.modelo] || BIKES.urbana, zt = -M.eixo / 2, zf = M.eixo / 2, r = M.r, mov = [0, r * 0.75, zt + 4.2];
      return { ciclista: { p: [0, M.selim + 0.2, zt + 2.3], olha: 1, montado: true, inclina: M.inclina, pedais: [[1.3, mov[1] + 0.9, mov[2] + 0.5], [-1.3, mov[1] - 0.9, mov[2] - 0.5]], guidao: { c: [0, M.guidao + (M.drop ? -0.8 : 0), zf - 1.2 + (M.drop ? 0.4 : 0)], r: M.gw * 0.9 } },
        "em-pe": { p: [0, M.selim + 0.6, zt + 3.4], olha: 1, montado: true, empe: true, inclina: M.inclina + 18, pedais: [[1.3, mov[1], mov[2] + 1.1], [-1.3, mov[1], mov[2] - 1.1]], guidao: { c: [0, M.guidao, zf - 1.2], r: M.gw * 0.9 } } }; } },
  moto: { nome: "moto (modelo esportiva, custom, scooter, trilha, policia)", larg: 7, prof: 19, alt: 10, grupo: "veiculo", veiculo: "terra", corPadrao: "#1f4f8a",
    partes: o => { const M = MOTOS[o.modelo] || MOTOS.esportiva, r = M.r, zf = M.eixo / 2, zt = -M.eixo / 2, out = [...roda(0, r, zf, r, 1.0), ...roda(0, r, zt, r, 1.2)];
      out.push(T([0, M.guidao - 1.2, zf - 2.4], [0, r, zf], 0.35), T([-M.gw, M.guidao, zf - 2.6], [M.gw, M.guidao, zf - 2.6], 0.18), B([-1.6, r + 0.3, zt + 3], [1.6, r + 3.2, zf - 3]), Object.assign(E([0, r + 1.8, zt + 7.6], [1.6, 1.6, 2.6]), { cor: "#7a7f86" }),
        B([-1.3, M.selim - 0.6, zt + 1.6], [1.3, M.selim, zt + 6.6]), Object.assign(E([0, M.tanque, zt + 8.8], [1.6, 1.2, 2.4]), {}), T([1.6, r * 0.7, zt + 5], [1.6, r * 0.9, zt - 1.6], 0.35), ink(T([1.6, r * 0.9, zt - 1.6], [1.6, r * 0.95, zt - 2.4], 0.4)));
      if (M.carenagem) out.push(Object.assign(E([0, M.guidao - 0.6, zf - 2.2], [1.8, 2.0, 2.2]), {}), Object.assign(B([-1.2, M.guidao + 0.6, zf - 2.4], [1.2, M.guidao + 1.8, zf - 2.2], { R: ccRot([0, 1, 0.6]) }), { cor: "ink" }));
      if (M.scooter) out.push(B([-1.6, r + 0.2, zt + 4], [1.6, r + 0.6, zf - 3.4]), B([-1.4, r + 0.6, zf - 3.6], [1.4, M.guidao - 1, zf - 2.6]));
      if (M.sirene) out.push(Object.assign(B([-1.6, M.guidao + 0.6, zf - 3.2], [1.6, M.guidao + 1.0, zf - 2.8]), { cor: "#3a6fd4" }));
      out.push(Object.assign(E([0, M.guidao - 0.3, zf - 1.8], [0.5, 0.5, 0.3]), { cor: "#f5e9a8" })); return out; },
    assentos: o => { const M = MOTOS[o.modelo] || MOTOS.esportiva, zt = -M.eixo / 2, zf = M.eixo / 2, r = M.r;
      const A0 = { piloto: { p: [0, M.selim + 0.1, zt + 5.2 + (M.scooter ? -0.6 : 0)], olha: 1, montado: true, inclina: M.inclina, pedais: M.scooter ? [[1.0, r + 0.6, zt + 8.6], [-1.0, r + 0.6, zt + 8.6]] : [[2.0, r + 0.2, zt + 6.6 + M.pe], [-2.0, r + 0.2, zt + 6.6 + M.pe]], guidao: { c: [0, M.guidao, zf - 2.6], r: M.gw * 0.92 } } };
      if (!M.solo) A0.garupa = { p: [0, M.selim + 0.6, zt + 2.6], olha: 1, montado: true, inclina: 6, pedais: [[2.1, r + 0.8, zt + 3.4], [-2.1, r + 0.8, zt + 3.4]], abraca: "piloto" }; return A0; } },
  caminhao: { nome: "caminhão (modelo bau, carroceria, tanque, cacamba, cegonha)", larg: 24, prof: 80, alt: 36, grupo: "veiculo", veiculo: "terra", corPadrao: "#c84a2a",
    partes: o => { const md = o.modelo || "bau", out = [], h = 40, w = 11.2, yc = 6;
      out.push(B([-w + 1, 4.6, -h + 2], [w - 1, 6.6, h - 2]));
      out.push(...cabine({ w, y0: yc, yp: yc + 1.4, yb: yc + 10, yt: yc + 21, z0: h - 15, z1: h - 1, t: 0.5 }), B([-w, yc - 2, h - 1], [w, yc + 4, h + 0.6]), ink(B([-w + 1, yc + 1, h + 0.6], [w - 1, yc + 3, h + 0.7])));
      for (const s of [-1, 1]) { for (const z of [h - 8, -h + 10, -h + 18]) out.push(...roda(s * (w - 1.2), 5.2, z, 5.2, 2.2)); out.push(Object.assign(E([s * (w - 2.4), yc + 2.6, h + 0.65], [1.3, 0.9, 0.2]), { cor: "#f5e9a8" }), B([s * w - 0.3, yc + 9, h - 2], [s * w + 1.4, yc + 12, h - 1.6])); }
      const z0 = -h, z1 = h - 16.5;
      if (md === "bau") out.push(B([-w, 7, z0], [w, 34, z1]));
      else if (md === "tanque") out.push(C([0, 18, (z0 + z1) / 2], 10, (z1 - z0) / 2, { R: ccRot([0, 0, 1]) }), C([0, 28.6, (z0 + z1) / 2], 2, 0.6));
      else if (md === "cacamba") out.push(B([-w, 7, z0], [w, 8, z1]), B([-w, 7, z0], [-w + 0.6, 18, z1]), B([w - 0.6, 7, z0], [w, 18, z1]), B([-w, 7, z0], [w, 18, z0 + 0.6]), B([-w, 7, z1 - 0.6], [w, 20, z1]), Object.assign(E([0, 16, (z0 + z1) / 2], [w - 1, 4, (z1 - z0) / 2 - 2], { facetas: 9, semente: 6 }), { cor: "#8a7a62" }));
      else if (md === "cegonha") out.push(B([-w, 7, z0], [w, 8, z1]), B([-w, 22, z0], [w, 23, z1 + 6]), ...[-1, 1].flatMap(s => [z0 + 1, (z0 + z1) / 2, z1 - 1].map(z => B([s * w - 0.4, 8, z - 0.4], [s * w + 0.4, 22, z + 0.4]))));
      else out.push(B([-w, 7, z0], [w, 8, z1]), ...[-1, 1].map(s => B([s * w - 0.4, 8, z0], [s * w + 0.4, 13, z1])), B([-w, 8, z0], [w, 13, z0 + 0.6]), B([-w, 8, z1 - 0.6], [w, 16, z1]));
      out.push(...vcBancoCasa(w * 0.5, yc + 6.4, h - 9.5, 2.6, 7, yc + 1.4), ...vcBancoCasa(-w * 0.5, yc + 6.4, h - 9.5, 2.6, 7, yc + 1.4), A([w * 0.5, yc + 10.4, h - 4.6], 2.1, 0.25, ccU([0, 0.5, 1]))); return out; },
    assentos: o => { const yc = 6, h = 40, w = 11.2, base = { olha: 1, dentro: true, chao: yc + 1.4, teto: yc + 21, pesFrente: 5.4, reclina: 6 };
      const A0 = { motorista: Object.assign({ p: [w * 0.5, yc + 6.4, h - 9.5], dirige: true, volante: { c: [w * 0.5, yc + 10.4, h - 4.6], r: 2.1 } }, base), carona: Object.assign({ p: [-w * 0.5, yc + 6.4, h - 9.5] }, base) };
      if ((o.modelo || "bau") !== "tanque") A0.carga = { p: [0, (o.modelo === "cacamba" ? 8 : o.modelo === "bau" ? 34 : 8), -10], olha: 1, pe: true }; return A0; } },
  van: { nome: "van / furgão (perua, ambulancia, escolar)", larg: 18, prof: 52, alt: 24, grupo: "veiculo", veiculo: "terra", corPadrao: "#e9e9e6",
    partes: o => { const h = 26, w = 9, out = [...cabine({ w, y0: 3.4, yp: 4.6, yb: 12, yt: 22.6, z0: -h, z1: h - 6, t: 0.45, jan: [[2, 18], [-20, -2]], portas: [{ lado: -1, za: -2, zb: 8 }] }), B([-w, 2, h - 6], [w, 11, h]), B([-w + 0.6, 11, h - 6.4], [w - 0.6, 15, h - 5], { R: ccRot([0, 1, 0.5]) })];
      for (const s of [-1, 1]) for (const z of [h - 9, -h + 8]) out.push(...roda(s * (w - 1), 3.6, z, 3.6, 1.8)); out.push(ocLuz(w, 7, h));
      if (o.modelo === "ambulancia") out.push(Object.assign(B([-4, 22.8, h - 9], [4, 24, h - 7]), { cor: "#d84a3a" }), Object.assign(B([-w - 0.05, 13, -12], [-w, 19, -6]), { cor: "#d84a3a" }));
      if (o.modelo === "escolar") out.push(Object.assign(B([-w - 0.05, 12.4, -h + 2], [-w, 13.4, h - 8]), { cor: "#d0a63a" }));
      for (const [x, z] of [[w * 0.45, 13.5], [-w * 0.45, 13.5], [w * 0.45, 3], [-w * 0.45, 3], [w * 0.45, -8], [-w * 0.45, -8]]) out.push(...vcBancoCasa(x, 8.6, z, 2.4, 6.4, 4.6));
      out.push(A([w * 0.45, 12.6, 18.4], 1.6, 0.22, ccU([0, 0.5, 1]))); return out; },
    assentos: () => { const b = { olha: 1, dentro: true, chao: 4.6, teto: 22.6, pesFrente: 5, reclina: 8 }; return { motorista: Object.assign({ p: [4.05, 8.6, 13.5], dirige: true, volante: { c: [4.05, 12.6, 18.4], r: 1.6 } }, b), carona: Object.assign({ p: [-4.05, 8.6, 13.5] }, b),
      banco1: Object.assign({ p: [4.05, 8.6, 3] }, b), banco2: Object.assign({ p: [-4.05, 8.6, 3] }, b), banco3: Object.assign({ p: [4.05, 8.6, -8] }, b), banco4: Object.assign({ p: [-4.05, 8.6, -8] }, b) }; } },
  trator: { nome: "trator (rodas grandes atrás, cabine aberta)", larg: 18, prof: 34, alt: 26, grupo: "veiculo", veiculo: "terra", corPadrao: "#3f8a3a",
    partes: () => { const out = [B([-4, 5, -2], [4, 12, 14]), B([-3.6, 12, 2], [3.6, 14, 14]), C([2, 18, 10], 0.5, 4), ...[-1, 1].flatMap(s => [...roda(s * 7.2, 7.6, -8, 7.6, 3.2), ...roda(s * 5.6, 4, 12, 4, 2), B([s * 7.2 - 1.8, 15.6, -13], [s * 7.2 + 1.8, 16, -3])]),
      B([-5, 6, -12], [5, 9, -2]), ...vcBancoCasa(0, 12.6, -6, 2.6, 5, 8.6), A([0, 16.4, -0.6], 1.6, 0.22, ccU([0, 1, 0.6])), ...[-1, 1].map(s => T([s * 4.6, 12, -10], [s * 4.6, 26, -10], 0.25)), B([-5.4, 26, -12], [5.4, 26.6, 0])]; return out; },
    assentos: () => ({ motorista: { p: [0, 12.6, -6], olha: 1, chao: 8.6, pesFrente: 5, dirige: true, volante: { c: [0, 16.4, -0.6], r: 1.6 } } }) },
  carroCorrida: { nome: "carro de corrida (modelo formula, kart)", larg: 16, prof: 46, alt: 8, grupo: "veiculo", veiculo: "terra", corPadrao: "#d0302a",
    partes: o => { const kart = o.modelo === "kart", Lh = kart ? 9 : 22, out = [];
      if (kart) { out.push(B([-4.4, 1.2, -Lh], [4.4, 1.8, Lh]), B([-3, 1.8, Lh - 3], [3, 3.4, Lh]), B([-4.4, 1.4, -Lh - 1], [4.4, 3, -Lh + 1]), C([0, 3.4, -5.6], 0.6, 1.6)); for (const s of [-1, 1]) for (const z of [Lh - 2.4, -Lh + 2.4]) out.push(...roda(s * 5.4, 1.8, z, 1.8, 1.8)); out.push(...vcBancoCasa(0, 2.6, -3.4, 2, 3.4, 1.8), A([0, 5.6, 2.8], 1.2, 0.2, ccU([0, 0.6, 1]))); }
      else { out.push(Object.assign(E([0, 3.2, 4], [3.2, 2.4, 20]), {}), B([-6.6, 1.4, -6], [6.6, 4.6, 4]), B([-8, 0.8, Lh - 1.4], [8, 1.4, Lh + 0.6]), B([-7, 6.4, -Lh], [7, 7.6, -Lh + 3]), ...[-1, 1].map(s => B([s * 6.6 - 0.2, 1.4, -Lh], [s * 6.6 + 0.2, 7.6, -Lh + 3])), ink(E([0, 5.2, -1.4], [2, 1.2, 3.4])), T([0, 6.8, -3.2], [0, 8, -4], 0.4));
        for (const s of [-1, 1]) for (const z of [Lh - 6, -Lh + 5]) out.push(...roda(s * 7.2, 3, z, 3, 3)); out.push(A([0, 5.8, 1.6], 1.0, 0.2, ccU([0, 0.5, 1]))); }
      return out; },
    assentos: o => o.modelo === "kart" ? { piloto: { p: [0, 2.6, -3.4], olha: 1, chao: 1.8, pesFrente: 9, reclina: 18, dirige: true, volante: { c: [0, 5.6, 2.8], r: 1.2 } } } : { piloto: { p: [0, 2.2, -2.6], olha: 1, chao: 1.6, pesFrente: 11, reclina: 34, dirige: true, volante: { c: [0, 5.8, 1.6], r: 1.0 } } } },
  skate: { nome: "skate", larg: 2.2, prof: 7.6, alt: 1.0, grupo: "veiculo", veiculo: "terra", corPadrao: "#c87a2a",
    partes: o => [B([-1.1, 0.75, -3.4], [1.1, 0.95, 3.4]), B([-1.1, 0.8, 3.4], [1.1, 1.0, 3.9], { R: ccRot([0, 1, -0.4]) }), B([-1.1, 0.8, -3.9], [1.1, 1.0, -3.4], { R: ccRot([0, 1, 0.4]) }), ...[-1, 1].flatMap(sz => [B([-0.9, 0.45, sz * 2.6 - 0.2], [0.9, 0.75, sz * 2.6 + 0.2]), ...[-1, 1].map(sx => C([sx * 0.95, 0.35, sz * 2.6], 0.35, 0.18, { R: ccRot([1, 0, 0]) }))])],
    assentos: () => ({ skatista: { p: [0, 1.0, 0], olha: 1, pe: true, emPeVeiculo: "lado", pesEm: [[0, 1.0, 2.2], [0, 1.0, -2.2]] } }) },
  patinete: { nome: "patinete (elétrico)", larg: 4, prof: 10, alt: 10.4, grupo: "veiculo", veiculo: "terra", corPadrao: "#2a2a2e",
    partes: o => [B([-1, 0.8, -3.8], [1, 1.2, 3.2]), ...roda(0, 1.0, 4.2, 1.0, 0.5), ...roda(0, 1.0, -4.2, 1.0, 0.5), T([0, 1.2, 3.6], [0, o.alt, 4.4], 0.22), T([-1.9, o.alt, 4.4], [1.9, o.alt, 4.4], 0.18)],
    assentos: o => ({ condutor: { p: [0, 1.2, -0.4], olha: 1, pe: true, emPeVeiculo: "frente", pesEm: [[0.5, 1.2, 0.8], [-0.5, 1.2, -1.6]], guidao: { c: [0, 10.4, 4.4], r: 1.7 } } }) },
  jetski: { nome: "jet ski", larg: 8, prof: 24, alt: 7, grupo: "veiculo", veiculo: "agua", corPadrao: "#e9e9e6",
    partes: o => [Object.assign(E([0, 2, 2], [3.8, 2, 11]), {}), B([-3.6, 0.6, -10], [3.6, 3, -2]), B([-1.4, 3, -8], [1.4, 4.4, 2]), B([-3.6, 2.8, -9.6], [-1.6, 3.2, 1]), B([1.6, 2.8, -9.6], [3.6, 3.2, 1]), Object.assign(E([0, 4.2, 5], [2.6, 1.6, 3]), { cor: "#d84a3a" }), T([0, 4.4, 4.6], [0, 6.2, 4.2], 0.3), T([-2.2, 6.2, 4.2], [2.2, 6.2, 4.2], 0.18)],
    assentos: () => ({ piloto: { p: [0, 4.6, -3], olha: 1, montado: true, inclina: 14, pedais: [[2.6, 3.2, -1.6], [-2.6, 3.2, -1.6]], guidao: { c: [0, 6.2, 4.2], r: 2 } }, garupa: { p: [0, 4.8, -7], olha: 1, montado: true, inclina: 6, pedais: [[2.6, 3.2, -6], [-2.6, 3.2, -6]], abraca: "piloto" } }) },
  quadriciclo: { nome: "quadriciclo", larg: 11, prof: 18, alt: 10, grupo: "veiculo", veiculo: "terra", corPadrao: "#c8a03a",
    partes: o => { const out = [B([-3, 3, -6], [3, 6, 6]), Object.assign(E([0, 6.4, 3.6], [2.6, 1.4, 2.6]), {}), B([-1.6, 6, -6], [1.6, 7, 0]), B([-5, 5.4, 5], [5, 6, 8.4]), B([-5, 5.4, -8.6], [5, 6, -5]), T([0, 6, 5], [0, 9, 4], 0.3), T([-3, 9, 4], [3, 9, 4], 0.2)];
      for (const s of [-1, 1]) { out.push(...roda(s * 4.6, 2.8, 6, 2.8, 2.6), ...roda(s * 4.6, 2.8, -6.6, 2.8, 2.6), B([s * 3, 3.6, -2], [s * 4.8, 4, 2])); } return out; },
    assentos: () => ({ piloto: { p: [0, 7.2, -2.8], olha: 1, montado: true, inclina: 10, pedais: [[3.9, 4.2, 0.2], [-3.9, 4.2, 0.2]], guidao: { c: [0, 9, 4], r: 2.8 } } }) }
};
/* modelos */
const BIKES = { urbana: { r: 3.0, eixo: 9.4, selim: 8.0, guidao: 9.2, gw: 2.2, inclina: 10, cesta: true }, speed: { r: 3.0, eixo: 8.8, selim: 8.4, guidao: 8.0, gw: 1.7, inclina: 34, drop: true },
  bmx: { r: 2.3, eixo: 8.0, selim: 6.0, guidao: 7.6, gw: 2.4, inclina: 20 }, mountain: { r: 3.1, eixo: 9.6, selim: 8.2, guidao: 8.8, gw: 2.8, inclina: 18 } };
const MOTOS = { esportiva: { r: 2.8, eixo: 12.4, selim: 7.0, guidao: 7.2, tanque: 7.4, gw: 2.2, inclina: 32, pe: -0.8, carenagem: true }, custom: { r: 2.9, eixo: 14, selim: 5.6, guidao: 9.4, tanque: 6.8, gw: 3.0, inclina: -6, pe: 5.4 },
  scooter: { r: 2.0, eixo: 11.4, selim: 6.4, guidao: 8.4, tanque: 5, gw: 2.4, inclina: 4, pe: 0, scooter: true }, trilha: { r: 3.2, eixo: 13, selim: 7.8, guidao: 8.6, tanque: 7.4, gw: 2.8, inclina: 16, pe: 0.6, solo: true }, policia: { r: 2.9, eixo: 13.6, selim: 6.6, guidao: 8.6, tanque: 7.2, gw: 2.8, inclina: 4, pe: 2, carenagem: true, sirene: true } };
/* banco com encosto (como o dos carros) e cabine oca */
function vcBancoCasa(x, y, z, L, enc, y0) { return [B([x - L, y0, z - 2.6], [x + L, y, z + 2.6]), B([x - L, y, z - 2.9], [x + L, y + enc, z - 2.1], { R: ccRot([0, 1, -0.22]) })]; }
function cabine(sp) { const out = [], t = sp.t || 0.4, w = sp.w, zc = (sp.z0 + sp.z1) / 2, hz = (sp.z1 - sp.z0) / 2;
  out.push(B([-w, sp.y0, sp.z0], [w, sp.yp, sp.z1]), B([-w, sp.yt, sp.z0], [w, sp.yt + t, sp.z1]));
  for (const sx of [-1, 1]) { const vaos = (sp.portas || []).filter(p => p.lado === sx).map(p => [p.za, p.zb]); const jan = (sp.jan || [[sp.z0 + 1.5, sp.z1 - 1.5]]).concat(vaos);
    out.push(...livres(sp.z0, sp.z1, vaos).map(([a, b]) => B([sx * w - t / 2, sp.yp, a], [sx * w + t / 2, sp.yb, b])), ...livres(sp.z0, sp.z1, jan).map(([a, b]) => B([sx * w - t / 2, sp.yb, a], [sx * w + t / 2, sp.yt, b]))); }
  for (const [z, s] of [[sp.z1, 1], [sp.z0, -1]]) { out.push(B([-w, sp.yp, z - s * t], [w, sp.yb, z])); if (s < 0) out.push(B([-w, sp.yb, z - s * t], [w, sp.yt, z])); else for (const sx of [-1, 1]) out.push(B([sx * (w - 0.6), sp.yb, z - t], [sx * w, sp.yt, z])); }
  return out; }
function livres(a, b, buracos) { const H = buracos.map(q => [Math.max(a, Math.min(q[0], q[1])), Math.min(b, Math.max(q[0], q[1]))]).filter(q => q[1] > q[0]).sort((p, q) => p[0] - q[0]), out = []; let c = a;
  for (const [p, q] of H) { if (p > c + 0.05) out.push([c, p]); c = Math.max(c, q); } if (b > c + 0.05) out.push([c, b]); return out; }
const ocLuz = (w, y, h) => Object.assign(B([-w + 1, y - 0.6, h], [w - 1, y + 0.6, h + 0.1]), { cor: "#f5e9a8" });

/* sinônimos em português */
const SINONIMOS_CASA = { "sofá": "sofa", sofa: "sofa", "sofá de 3 lugares": "sofa", divã: "sofa", poltrona: "poltrona", pufe: "pufe", puff: "pufe", "mesa de centro": "mesaCentro", rack: "rack", "televisão": "tv", televisao: "tv", tv: "tv", estante: "estante", "estante de livros": "estante",
  abajur: "abajur", "luminária": "luminaria", luminaria: "luminaria", lareira: "lareira", "cama de casal": "camaCasal", "cama casal": "camaCasal", beliche: "beliche", "berço": "berco", berco: "berco", "criado-mudo": "criadoMudo", "criado mudo": "criadoMudo", "mesa de cabeceira": "criadoMudo",
  "guarda-roupa": "guardaRoupa", "guarda roupa": "guardaRoupa", armario: "guardaRoupa", "armário": "guardaRoupa", "cômoda": "comoda", comoda: "comoda", espelho: "espelhoPe", "rede de dormir": "rede", rede: "rede",
  geladeira: "geladeira", refrigerador: "geladeira", "fogão": "fogao", fogao: "fogao", pia: "pia", "pia de cozinha": "pia", "balcão": "balcao", balcao: "balcao", bancada: "balcao", "armário de cozinha": "armarioCozinha", "micro-ondas": "microondas", microondas: "microondas",
  "mesa de jantar": "mesaJantar", "banqueta alta": "banquetaAlta", "vaso sanitário": "vasoSanitario", "vaso sanitario": "vasoSanitario", privada: "vasoSanitario", banheira: "banheira", chuveiro: "chuveiro", box: "chuveiro", "lavatório": "lavatorio", lavatorio: "lavatorio", "pia do banheiro": "lavatorio",
  "máquina de lavar": "maquinaLavar", "maquina de lavar": "maquinaLavar", "tábua de passar": "tabuaPassar", lixeira: "lixeira", "lixo": "lixeira", rodo: "vassouraPe",
  escrivaninha: "escrivaninha", "mesa de escritório": "escrivaninha", "cadeira de escritório": "cadeiraEscritorio", "cadeira giratória": "cadeiraEscritorio", computador: "computador", pc: "computador", monitor: "computador", notebook: "notebook", laptop: "notebook", arquivo: "arquivo",
  lousa: "quadroNegro", "quadro-negro": "quadroNegro", "quadro negro": "quadroNegro", carteira: "carteiraEscolar", "carteira escolar": "carteiraEscolar", "mesa do professor": "mesaProfessor", bebedouro: "bebedouro", "mochila escolar": "mochilaEscolar",
  "banco de praça": "bancoPraca", "banco de praca": "bancoPraca", "poste de luz": "posteLuz", poste: "posteLuz", "semáforo": "semaforo", semaforo: "semaforo", sinal: "semaforo", hidrante: "hidrante", "lixeira de rua": "lixeiraRua", "ponto de ônibus": "pontoOnibus", "ponto de onibus": "pontoOnibus",
  "orelhão": "orelhao", orelhao: "orelhao", "caixa de correio": "caixaCorreio", "cadeira de praia": "cadeiraPraia", espreguicadeira: "cadeiraPraia", "guarda-sol": "guardaSol", "guarda sol": "guardaSol", churrasqueira: "churrasqueira", "balanço": "balanco", balanco: "balanco",
  escorregador: "escorregador", "escorrega": "escorregador", gangorra: "gangorra", "mesa de piquenique": "mesaPiquenique", barraca: "barraca", tenda: "barraca", fogueira: "fogueira", "cerca de madeira": "cercaMadeira", placa: "placa", vaso: "vasoPlanta", planta: "vasoPlanta", "carrinho de bebê": "carrinhoBebe", "carrinho de bebe": "carrinhoBebe", "carrinho de supermercado": "carrinhoMercado",
  piano: "piano", "piano de cauda": "pianoCauda", teclado: "teclado", "teclado musical": "teclado", bateria: "bateria", harpa: "harpa", violoncelo: "violoncelo", cello: "violoncelo", contrabaixo: "contrabaixo", "microfone de pedestal": "microfonePedestal", pedestal: "microfonePedestal",
  xilofone: "xilofone", amplificador: "amplificador", "caixa de som": "amplificador", saxofone: "saxofone", sax: "saxofone", clarinete: "clarinete", ukulele: "ukulele", cavaquinho: "cavaquinho", baixo: "baixo", "baixo elétrico": "baixo", pandeiro: "pandeiro", gaita: "gaita", "gaita de boca": "gaita", harmonica: "gaita",
  "acordeão": "acordeao", acordeao: "acordeao", sanfona: "acordeao", trombone: "trombone",
  bicicleta: "bicicleta", bike: "bicicleta", "magrela": "bicicleta", moto: "moto", motocicleta: "moto", scooter: "moto", lambreta: "moto", "caminhão": "caminhao", caminhao: "caminhao", carreta: "caminhao", van: "van", furgao: "van", "furgão": "van", ambulancia: "van", "ambulância": "van", kombi: "van",
  trator: "trator", "carro de corrida": "carroCorrida", "fórmula 1": "carroCorrida", "formula 1": "carroCorrida", f1: "carroCorrida", kart: "carroCorrida", skate: "skate", patinete: "patinete", "jet ski": "jetski", jetski: "jetski", quadriciclo: "quadriciclo" };
/* modelo implícito no sinônimo */
const MODELO_SINONIMO = { scooter: ["moto", "scooter"], lambreta: ["moto", "scooter"], ambulancia: ["van", "ambulancia"], "ambulância": ["van", "ambulancia"], kart: ["carroCorrida", "kart"], carreta: ["caminhao", "bau"] };
export { OBJ_CASA, SINONIMOS_CASA, MODELO_SINONIMO, BIKES, MOTOS };
