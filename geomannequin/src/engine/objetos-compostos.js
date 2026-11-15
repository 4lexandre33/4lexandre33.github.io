/* GeoMannequin — objetos compostos de formas geométricas (caixa, cilindro/cone, esfera/elipsoide, toro, pedra).
   Cada objeto é uma lista de PARTES em coordenadas locais (pivô = centro da base; x = largura, y = altura, z = profundidade)
   e uma lista de PEGAS: pontos onde a mão pode segurar, com a normal da superfície (para onde a palma encosta) e o eixo
   da pega (em volta do qual os dedos fecham). As mesmas partes servem para desenhar, colidir e encostar a mão.

   Tipos de parte:
     caixa      { c, h:[meia larg, meia alt, meia prof] }
     cilindro   { cil:true, c, r, hh }            (eixo = y local da parte)
     cone       { cil:true, c, r, r1, hh }        (r embaixo, r1 em cima)
     elipsoide  { esf:true, c, r:[rx, ry, rz] }   (facetas: n → pedra lapidada, com semente)
     toro       { toro:true, c, R, rt, ra }       (anel em volta do eixo y da parte; rt = meia espessura radial, ra = axial)
   Qualquer parte pode ter R (rotação 3×3, linhas) ou dir:[x,y,z] (o eixo y da parte aponta para dir). 1 R ≈ 11,4 cm. */

const ocUnit = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
const ocCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/* rotação que leva o eixo y da parte para d (e tenta manter x da parte perto de "lado") */
function rotParaEixo(d, lado) {
  const Y = ocUnit(d); let X = lado ? lado.slice() : (Math.abs(Y[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  if (!lado) X = ocCross(X, Y);
  const k = X[0] * Y[0] + X[1] * Y[1] + X[2] * Y[2]; X = ocUnit(X.map((v, i) => v - k * Y[i]));
  const Z = ocCross(X, Y);
  return [X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]];
}
const EIXO = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
/* cilindro entre dois pontos */
function ocTubo(a, b, r, extra) { const d = b.map((v, i) => v - a[i]), L = Math.hypot(...d); return Object.assign({ cil: true, c: a.map((v, i) => (v + b[i]) / 2), r, hh: L / 2, R: rotParaEixo(d) }, extra || {}); }
const ocCaixa = (c, h, R) => R ? { c, h, R } : { c, h };
const ocEsf = (c, r, extra) => Object.assign({ esf: true, c, r: Array.isArray(r) ? r : [r, r, r] }, extra || {});
const ocToro = (c, R, rt, eixo, ra, extra) => Object.assign({ toro: true, c, Rm: R, rt, ra: ra || rt, R: rotParaEixo(EIXO[eixo] || eixo) }, extra || {});
const ocPega = (P, N, eixo, extra) => Object.assign({ P, N: ocUnit(N), eixo: ocUnit(eixo) }, extra || {});
/* roda de carruagem/vagão: aro (toro no eixo x), raios e cubo — centro (x,y,z), raio r, n raios */
function vcRoda(x, y, z, r, n) { const out = [ocToro([x, y, z], r - 0.35, 0.35, "x", 0.5), ocEsf([x, y, z], [0.9, 0.9, 0.9])]; for (let k = 0; k < n / 2; k++) { const a = k * 2 * Math.PI / n; out.push(ocTubo([x, y - Math.cos(a) * (r - 0.4), z - Math.sin(a) * (r - 0.4)], [x, y + Math.cos(a) * (r - 0.4), z + Math.sin(a) * (r - 0.4)], 0.12)); } return out; }
/* roda de trem: disco com friso, contrapeso e cubo */
function vcRodaTrem(x, y, z, r) { const s = Math.sign(x) || 1; return [{ cil: true, c: [x, y, z], r, hh: 0.5, R: rotParaEixo([1, 0, 0]) }, { cil: true, c: [x - s * 0.55, y, z], r: r + 0.45, hh: 0.12, R: rotParaEixo([1, 0, 0]) }, Object.assign({ cil: true, c: [x + s * 0.55, y, z], r: r * 0.3, hh: 0.1, R: rotParaEixo([1, 0, 0]) }, { cor: "ink" })]; }
function vcLocomotiva(z0) { const out = [], Z = z => z + z0;
  out.push(ocCaixa([0, 6.6, Z(4)], [5.6, 1.6, 40]), ocCaixa([0, 6.6, Z(45.5)], [12, 1.2, 1.2]));
  for (const s of [-1, 1]) { for (const z of [-6, 8, 22]) out.push(...vcRodaTrem(s * 6.3, 7.8, Z(z), 6.4)); for (const z of [34, 40]) out.push(...vcRodaTrem(s * 6.3, 4.2, Z(z), 2.8));
    out.push(ocTubo([s * 7.4, 7.8, Z(-6)], [s * 7.4, 7.8, Z(22)], 0.45), ocCaixa([s * 9.5, 9.6, Z(36)], [2.0, 2.8, 4.2]), ocEsf([s * 6, 6.8, Z(46.8)], [1.4, 1.4, 0.6]), ocCaixa([s * 11.6, 15.0, Z(8)], [0.25, 0.8, 26])); }
  out.push({ cil: true, c: [0, 19.5, Z(14)], r: 8.6, hh: 20, R: rotParaEixo([0, 0, 1]) }, { cil: true, c: [0, 19.5, Z(36)], r: 9.2, hh: 3, R: rotParaEixo([0, 0, 1]) }, Object.assign({ cil: true, c: [0, 19.5, Z(39.1)], r: 7.8, hh: 0.15, R: rotParaEixo([0, 0, 1]) }, { cor: "ink" }));
  out.push({ cil: true, c: [0, 32, Z(34)], r: 2.6, hh: 4.5 }, { cil: true, c: [0, 37, Z(34)], r: 3.6, hh: 0.9 }, ocEsf([0, 28.4, Z(18)], [3.2, 3.0, 3.6]), { cil: true, c: [0, 28.8, Z(6)], r: 1.6, hh: 1.8 }, ocEsf([0, 25, Z(39.5)], [1.8, 1.8, 1.0]), Object.assign(ocEsf([0, 25, Z(40.3)], [1.3, 1.3, 0.3]), { cor: "fundo" }));
  for (let k = 0; k < 6; k++) { const x = -10 + k * 4; out.push(ocCaixa([x * 0.55, 4.0, Z(44.5 + Math.abs(x) * 0.18)], [1.4, 2.4, 0.3], rotParaEixo([0, 0.6, -1]))); }
  out.push(...vcCasca({ w: 11.4, y0: 9, yp: 9.6, yb: 20, yt: 34.2, z0: Z(-22.4), z1: Z(-5.6), t: 0.5, jan: [[Z(-19.6), Z(-11)]], frente: "janela", tras: "aberta", moldura: 3.2, teto: false }), ocCaixa([0, 35, Z(-13)], [12.4, 0.6, 10.2]));
  out.push(ocCaixa([0, 14, Z(-7)], [6, 4.4, 1.2]), ocTubo([4.6, 18.5, Z(-7.5)], [4.6, 21, Z(-9.5)], 0.25));
  /* tênder de carvão */
  out.push(ocCaixa([0, 7, Z(-35)], [10.5, 1.2, 11.5]), ocCaixa([0, 15, Z(-35)], [11, 7, 11.5]), Object.assign(ocCaixa([0, 22.4, Z(-35)], [10, 0.6, 10.5]), { cor: "ink" }));
  for (const s of [-1, 1]) for (const z of [-42, -28]) out.push(...vcRodaTrem(s * 6.3, 4.6, Z(z), 3.6));
  return out; }
/* ===== CASCA OCA de cabine (carro, ônibus, vagão, cabine de locomotiva, avião pequeno, helicóptero…): piso, paredes até a cintura,
   colunas entre as janelas (abertas, para ver quem está dentro), teto e as pontas (frente/trás com janela, fechada ou aberta).
   sp = { w meia largura, y0 fundo, yp topo do piso, yb cintura, yt teto (por baixo), z0 trás, z1 frente, t espessura,
          jan [[za,zb]…] janelas laterais, portas [{lado:±1, za, zb}] vãos do piso ao teto, frente/tras "janela"|"fechada"|"aberta" } ===== */
function vcLivres(a, b, buracos) { const H = buracos.map(q => [Math.max(a, Math.min(q[0], q[1])), Math.min(b, Math.max(q[0], q[1]))]).filter(q => q[1] > q[0]).sort((p, q) => p[0] - q[0]), out = []; let c = a;
  for (const [p, q] of H) { if (p > c + 0.05) out.push([c, p]); c = Math.max(c, q); } if (b > c + 0.05) out.push([c, b]); return out; }
function vcCasca(sp) { const out = [], t = sp.t || 0.4, w = sp.w, zc = (sp.z0 + sp.z1) / 2, hz = (sp.z1 - sp.z0) / 2, portas = sp.portas || [];
  out.push(ocCaixa([0, (sp.y0 + sp.yp) / 2, zc], [w, Math.max(0.1, (sp.yp - sp.y0) / 2), hz]));
  if (sp.teto !== false) out.push(ocCaixa([0, sp.yt + t / 2, zc], [w, t / 2, hz]));
  for (const sx of [-1, 1]) { const vaos = portas.filter(p => p.lado === sx).map(p => [p.za, p.zb]);
    for (const [a, b] of vcLivres(sp.z0, sp.z1, vaos)) out.push(ocCaixa([sx * (w - t / 2), (sp.yp + sp.yb) / 2, (a + b) / 2], [t / 2, (sp.yb - sp.yp) / 2, (b - a) / 2]));
    for (const [a, b] of vcLivres(sp.z0, sp.z1, (sp.jan || []).concat(vaos))) out.push(ocCaixa([sx * (w - t / 2), (sp.yb + sp.yt) / 2, (a + b) / 2], [t / 2, (sp.yt - sp.yb) / 2, (b - a) / 2]));
    for (const [a, b] of sp.jan || []) out.push(Object.assign(ocCaixa([sx * (w - t / 2), sp.yb + 0.08, (a + b) / 2], [t / 2 + 0.05, 0.08, (b - a) / 2]), { cor: "ink" })); }
  for (const [z, tipo, s] of [[sp.z1, sp.frente || "janela", 1], [sp.z0, sp.tras || "janela", -1]]) { if (tipo === "aberta") continue; const zz = z - s * t / 2, m = sp.moldura || 0.9;
    out.push(ocCaixa([0, (sp.yp + sp.yb) / 2, zz], [w, (sp.yb - sp.yp) / 2, t / 2]));
    if (tipo === "fechada") out.push(ocCaixa([0, (sp.yb + sp.yt) / 2, zz], [w, (sp.yt - sp.yb) / 2, t / 2]));
    else for (const sx of [-1, 1]) out.push(ocCaixa([sx * (w - m / 2), (sp.yb + sp.yt) / 2, zz], [m / 2, (sp.yt - sp.yb) / 2, t / 2])); }
  return out; }
const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }, rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
/* banco com encosto: y = topo do assento, (x,z) = onde fica o quadril; olha ±1; L = meia largura */
function vcBanco(x, y, z, olha, L, enc, alto) { const s = olha < 0 ? -1 : 1, h = enc || 6, y0 = alto === undefined ? y - 1.2 : alto;
  return [ocCaixa([x, (y + y0) / 2 - 0.05, z + s * 1.4], [L || 2.4, Math.max(0.3, (y - y0) / 2 - 0.05), 2.7]), ocCaixa([x, y + h / 2, z - s * 2.15 - s * h * 0.11], [L || 2.4, h / 2, 0.4], rotX(-s * 0.22))]; }
/* volante (toro inclinado) e painel */
function vcVolante(x, y, z, r) { return [ocToro([x, y, z], r || 1.6, 0.22, "z"), ocTubo([x, y, z], [x, y - 1.2, z + 2.4], 0.25)]; }
/* ===== CARRO PARAMÉTRICO: um só manequim para sedã, hatch, SUV, esportivo, caminhonete, táxi e polícia (o.modelo) ===== */
const VC_CARROS = { sedan: { L: 40, W: 16, H: 13.2, r: 2.8, cl: 1.4, c0: -0.28, c1: 0.18, cap: 5.6, cor: "#3b6ea5" }, hatch: { L: 35, W: 15.4, H: 13.4, r: 2.7, cl: 1.4, c0: -0.42, c1: 0.16, cap: 5.4, cor: "#5a9e6f" },
  suv: { L: 42, W: 17, H: 15.6, r: 3.3, cl: 2.2, c0: -0.42, c1: 0.2, cap: 7, cor: "#4a4f57" }, esportivo: { L: 39, W: 17, H: 11.2, r: 3, cl: 1, c0: -0.22, c1: 0.08, cap: 4.6, cor: "#c8202a" },
  caminhonete: { L: 47, W: 17, H: 16, r: 3.4, cl: 2.4, c0: -0.2, c1: 0.24, cap: 7.4, cacamba: true, cor: "#8a6a3c" }, taxi: { L: 40, W: 16, H: 13.2, r: 2.8, cl: 1.4, c0: -0.28, c1: 0.18, cap: 5.6, placa: true, cor: "#f2c318" },
  policia: { L: 40, W: 16, H: 13.2, r: 2.8, cl: 1.4, c0: -0.28, c1: 0.18, cap: 5.6, sirene: true, cor: "#dfe4ea" } };
const vcModelo = o => VC_CARROS[(o && o.modelo) || "sedan"] || VC_CARROS.sedan;
function vcCarro(o) { const M = vcModelo(o), L = M.L, W = M.W, h = M.L / 2, w = M.W / 2, y0 = M.cl, cin = y0 + M.cap, out = [], zc0 = M.c0 * L, zc1 = M.c1 * L, ink = b => Object.assign(b, { cor: "ink" });
  const yp = y0 + 0.9, zi1 = zc1 + 3.4, zi0 = zc0 - (M.cacamba ? 0.5 : 2.6), quatro = M.c1 - M.c0 > 0.3, A = vcAssentosCarro(o);
  /* capô e porta-malas maciços; no meio, a cabine oca: piso, portas (paredes), painel, colunas inclinadas e teto */
  out.push(ocCaixa([0, (y0 + cin) / 2 + 0.3, (zi1 + h) / 2], [w, (cin - y0) / 2 - 0.3, (h - zi1) / 2]));
  if (!M.cacamba) out.push(ocCaixa([0, (y0 + cin) / 2 + 0.3, (zi0 - h) / 2], [w, (cin - y0) / 2 - 0.3, (zi0 + h) / 2]));
  else { out.push(ocCaixa([0, y0 + 1.2, (zi0 - h) / 2], [w, 1.2, (zi0 + h) / 2]), ocCaixa([0, (yp + M.H) / 2, zi0 - 0.3], [w - 0.4, (M.H - yp) / 2, 0.3]), ocCaixa([0, (y0 + cin) / 2 + 1, -h + 0.25], [w - 0.2, (cin - y0) / 2, 0.25]));
    for (const sx of [-1, 1]) out.push(ocCaixa([sx * (w - 0.25), (y0 + cin) / 2 + 1, (zi0 - h) / 2], [0.25, (cin - y0) / 2, (zi0 + h) / 2])); }
  out.push(ocCaixa([0, (y0 + yp) / 2, (zi0 + zi1) / 2], [w - 0.1, (yp - y0) / 2, (zi1 - zi0) / 2]));
  for (const sx of [-1, 1]) { out.push(ocCaixa([sx * (w - 0.3), (yp + cin) / 2 + 0.15, (zi0 + zi1) / 2], [0.3, (cin - yp) / 2 + 0.15, (zi1 - zi0) / 2]));
    out.push(ocTubo([sx * (w - 0.7), cin + 0.2, zi1], [sx * (w - 1.1), M.H - 0.3, zc1], 0.42), ocTubo([sx * (w - 0.7), cin + 0.2, zi0], [sx * (w - 1.1), M.H - 0.3, zc0], 0.55));
    if (quatro) out.push(ocCaixa([sx * (w - 0.9), (cin + M.H) / 2, (zc0 + zc1) / 2 + 1.5], [0.35, (M.H - cin) / 2, 0.45]));
    out.push(ink(ocCaixa([sx * (w + 0.02), cin - 1.2, (zi0 + zi1) / 2], [0.04, 0.08, (zi1 - zi0) / 2])));
    for (const zr of [h - 7.2, -h + 7.4]) out.push({ cil: true, c: [sx * (w - 1.2), M.r, zr], r: M.r, hh: 1.1, R: rotParaEixo([1, 0, 0]) }, ink({ cil: true, c: [sx * (w - 0.05), M.r, zr], r: M.r * 0.55, hh: 0.08, R: rotParaEixo([1, 0, 0]) }));
    out.push(ocEsf([sx * (w - 2.4), cin - 1.4, h + 0.1], [1.6, 0.9, 0.3]), Object.assign(ocEsf([sx * (w - 2.2), cin - 1.2, -h - 0.1], [1.6, 0.8, 0.3]), { cor: "fundo" }), ocCaixa([sx * (w + 0.5), cin + 1.2, zi1 - 1.2], [0.6, 0.4, 0.5])); }
  out.push(ocCaixa([0, M.H - 0.18, (zc0 + zc1) / 2], [w - 1.0, 0.2, (zc1 - zc0) / 2 + 0.2]), ocTubo([-(w - 1.1), M.H - 0.3, zc1], [w - 1.1, M.H - 0.3, zc1], 0.35), ocTubo([-(w - 1.1), M.H - 0.3, zc0], [w - 1.1, M.H - 0.3, zc0], 0.35));
  out.push(ocCaixa([0, cin - 0.9, zi1 - 1.2], [w - 0.6, 1.1, 1.3]), ocCaixa([0, y0 + 1.6, h + 0.2], [w - 0.6, 0.9, 0.3]), ocCaixa([0, y0 + 1.6, -h - 0.2], [w - 0.6, 0.9, 0.3]));
  for (const [k, S] of Object.entries(A)) { if (k === "cacamba") continue; out.push(...vcBanco(S.p[0], S.p[1], S.p[2], 1, 2.5, M.H - S.p[1] - 3.2, yp)); if (S.volante) out.push(...vcVolante(...S.volante.c, S.volante.r)); }
  if (M.placa) out.push(ocCaixa([0, M.H + 1, (zc0 + zc1) / 2], [2.6, 1, 0.8]));
  if (M.sirene) out.push(ocCaixa([0, M.H + 0.6, (zc0 + zc1) / 2], [5, 0.6, 1.1]), Object.assign(ocCaixa([-2.6, M.H + 0.7, (zc0 + zc1) / 2], [2.2, 0.55, 1.15]), { cor: "fundo" }));
  return out; }
/* assentos do carro: quadril no banco (y = topo do assento), pés no piso (chao), cabeça abaixo do teto, mãos no volante */
function vcAssentosCarro(o) { const M = vcModelo(o), w = M.W / 2, yp = M.cl + 0.9, y = yp + (M.H < 12 ? 1.2 : M.H > 15 ? 2.6 : 1.9), zc1 = M.c1 * M.L, zc0 = M.c0 * M.L, zf = zc1 - 8.5, zt = zf - 8.2, zi0 = zc0 - (M.cacamba ? 0.5 : 2.6), x = w * 0.47;
  const base = { olha: 1, dentro: true, chao: yp, teto: M.H - 0.4, pesFrente: 5.8, reclina: 16 };
  const A = { motorista: Object.assign({ p: [x, y, zf], dirige: true, volante: { c: [x, y + 3.3, zf + 4.6], r: 1.6 } }, base), carona: Object.assign({ p: [-x, y, zf] }, base) };
  if (M.c1 - M.c0 > 0.3 && zt - 2.6 > zi0) { A.traseiro1 = Object.assign({ p: [x, y + 0.3, zt] }, base, { pesFrente: 4.6, reclina: 8 }); A.traseiro2 = Object.assign({ p: [-x, y + 0.3, zt] }, base, { pesFrente: 4.6, reclina: 8 }); }
  if (M.cacamba) A.cacamba = { p: [0, M.cl + 2.4 + 0.1, -M.L / 2 + 5], olha: 1, pe: true }; return A; }
/* avião grande (tipo Boeing), avião pequeno (tipo Cessna), helicóptero, lancha, bote inflável, pesqueiro, submarino */
function vcAviaoGrande(o) { const out = [], Lf = 560, r = 27, y = 40, n = 24, ink = b => Object.assign(b, { cor: "ink" });
  /* fuselagem oca: anel de painéis; o painel da altura dos olhos de cada lado vira fileira de janelas */
  for (let k = 0; k < n; k++) { const th = 2 * Math.PI * k / n, cx = r * Math.cos(th), cy = y + r * Math.sin(th), R = rotZ(th + Math.PI / 2);
    if (k % (n / 2) === 0) { for (let z = -232; z <= 236; z += 13) out.push(ocCaixa([cx, cy, z], [3.7, 0.5, 4.4], R)); out.push(ocCaixa([cx, cy, -256], [3.7, 0.5, 24], R), ocCaixa([cx, cy, 258], [3.7, 0.5, 22], R)); }
    else out.push(ocCaixa([cx, cy, 0], [3.7, 0.5, Lf / 2], R)); }
  out.push(ocCaixa([0, y - 12.4, 0], [24, 0.4, Lf / 2 - 2]), ocEsf([0, y, Lf / 2], [r, r, 40]), ocEsf([0, y + 4, -Lf / 2], [r * 0.6, r * 0.7, 50]), ocCaixa([-14.5, y - 4, Lf / 2 - 66], [11.5, 18, 0.5]), ocCaixa([14.5, y - 4, Lf / 2 - 66], [11.5, 18, 0.5]), ocCaixa([0, y - 4, 237], [24, 3, 2.5]));
  out.push(ink(ocCaixa([0, y + 14, Lf / 2 + 22], [10, 3, 4], rotParaEixo([0, 0.5, 1]))));
  for (const sx of [-1, 1]) { out.push(ocCaixa([sx * 135, y - 12, 10], [110, 2, 32])); out.push({ cil: true, c: [sx * 90, y - 28, 50], r: 13, hh: 28, R: rotParaEixo([0, 0, 1]) }, ink({ cil: true, c: [sx * 90, y - 28, 78.2], r: 11, hh: 0.3, R: rotParaEixo([0, 0, 1]) }));
    out.push(ocCaixa([sx * 55, y + 8, -250], [45, 1.5, 18])); for (const z of [-20, 200]) out.push({ cil: true, c: [sx * (z > 0 ? 0 : 40), 7, z], r: 7, hh: 3, R: rotParaEixo([1, 0, 0]) }); }
  out.push(ocCaixa([0, y + 55, -250], [1.6, 50, 22]), ocTubo([0, 7, 200], [0, y - r, 200], 1.6), ocTubo([40, 7, -20], [40, y - 15, -20], 2), ocTubo([-40, 7, -20], [-40, y - 15, -20], 2));
  const A = COMPOSTOS.aviao.assentos(o); for (const S of Object.values(A)) if (!S.pe) { out.push(...vcBanco(S.p[0], S.p[1], S.p[2], 1, S.dirige ? 3 : 5.6, 9, S.chao)); if (S.volante) out.push(...vcVolante(...S.volante.c, 1.4)); }
  return out; }
function vcAviaoPequeno(o) { const out = [], ink = b => Object.assign(b, { cor: "ink" });
  out.push(...vcCasca({ w: 4.8, y0: 4.4, yp: 5.2, yb: 10.4, yt: 16.2, z0: 1, z1: 16, t: 0.35, jan: [[3, 14.5]], frente: "janela", tras: "fechada", moldura: 1 }));
  out.push(ocCaixa([0, 17, 9], [48, 0.6, 7]), ocCaixa([0, 10.4, 20], [4.4, 4.2, 4]), ocEsf([0, 10.4, 24.5], [3.6, 3.4, 3]), ocCaixa([0, 10.4, 27.6], [0.6, 11, 1.2]), ocEsf([0, 10.4, 28.4], [1.2, 1.2, 1.4]));
  out.push(ocTubo([0, 11, 1.4], [0, 13.5, -42], 4.6, { r1: 1.2 }), ocCaixa([0, 20, -44], [0.5, 7, 5]), ocCaixa([0, 14, -44], [16, 0.5, 5]), ink(ocCaixa([0, 13.6, 16.2], [4.4, 2.6, 0.06])));
  for (const sx of [-1, 1]) out.push(ocTubo([sx * 4.8, 10.4, 9], [sx * 20, 16.4, 9], 0.45), ocTubo([sx * 3, 4.6, 8], [sx * 8, 2.4, 8], 0.5), { cil: true, c: [sx * 8, 2.4, 8], r: 2.4, hh: 0.8, R: rotParaEixo([1, 0, 0]) });
  out.push(ocTubo([0, 6.4, 21], [0, 2.4, 22], 0.5), { cil: true, c: [0, 2.4, 22], r: 2.2, hh: 0.8, R: rotParaEixo([1, 0, 0]) });
  const A = COMPOSTOS.aviaoPequeno.assentos(o); for (const S of Object.values(A)) { out.push(...vcBanco(S.p[0], S.p[1], S.p[2], 1, 1.9, 6, 5.2)); if (S.volante) out.push(...vcVolante(...S.volante.c, 1.1)); }
  out.push(ocCaixa([0, 11.4, 15.2], [4.4, 1.0, 0.7]));
  return out; }
function vcHelicoptero(o) { const out = [], a = ((o && o.rotor) || 0) * Math.PI / 180, yr = 25.4, ink = b => Object.assign(b, { cor: "ink" });
  out.push(...vcCasca({ w: 6.4, y0: 3.4, yp: 4.6, yb: 9.4, yt: 17.6, z0: -4, z1: 20, t: 0.35, jan: [[9, 18.6]], portas: [{ lado: 1, za: -2, zb: 8 }, { lado: -1, za: -2, zb: 8 }], frente: "janela", tras: "fechada", moldura: 1.1 }));
  out.push(ocEsf([0, 7, 20.5], [6.2, 3.6, 2.6]), ocCaixa([0, 19.6, 3], [4.2, 2, 8]), { cil: true, c: [0, 23.2, 4], r: 1.3, hh: 2.2 }, ocTubo([0, 13, -4], [0, 15, -60], 2.6, { r1: 1.1 }), ocCaixa([0, 19, -60], [0.6, 7, 4]), ocCaixa([0, 15, -56], [7, 0.5, 2.5]));
  for (const k of [0, 1]) { const b = a + k * Math.PI / 2; out.push(ocTubo([-Math.cos(b) * 55, yr, 4 - Math.sin(b) * 55], [Math.cos(b) * 55, yr, 4 + Math.sin(b) * 55], 0.6)); }
  for (const k of [0, 1]) { const b = a * 3 + k * Math.PI / 2; out.push(ocTubo([1.5, 19 - Math.cos(b) * 8, -60 - Math.sin(b) * 8], [1.5, 19 + Math.cos(b) * 8, -60 + Math.sin(b) * 8], 0.35)); }
  for (const sx of [-1, 1]) out.push(ocTubo([sx * 7, 0.6, -10], [sx * 7, 0.6, 26], 0.6), ocTubo([sx * 7, 0.6, 0], [sx * 5.6, 3.6, 0], 0.4), ocTubo([sx * 7, 0.6, 16], [sx * 5.6, 3.6, 16], 0.4));
  const A = COMPOSTOS.helicoptero.assentos(o); for (const S of Object.values(A)) if (!S.pe) { out.push(...vcBanco(S.p[0], S.p[1], S.p[2], 1, 2, 6.2, 4.6)); out.push(ocTubo([S.p[0], 4.8, S.p[2] + 4], [S.p[0], 8.6, S.p[2] + 4.6], 0.22)); }
  out.push(ocCaixa([0, 9.6, 18.2], [5.6, 1.2, 1.2]));
  return out; }
function vcCasco(L, W, H, n, extra, piso) { const out = [], pi = piso ?? H * 0.45; for (let i = 0; i < n; i++) { const z = -L / 2 + (i + 0.5) * L / n, t = (z + L / 2) / L, w = W / 2 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.2 + t * 0.9)), 0.6) + 0.3, h = H * (0.8 + 0.4 * t), tp = h + 1.1;
    out.push(ocCaixa([0, pi / 2, z], [w * 0.85, pi / 2, L / n / 2 + 0.05]), ocCaixa([w - 0.2, (pi + tp) / 2, z], [0.25, (tp - pi) / 2, L / n / 2 + 0.05]), ocCaixa([-(w - 0.2), (pi + tp) / 2, z], [0.25, (tp - pi) / 2, L / n / 2 + 0.05])); }
  out.push(ocCaixa([0, (pi + H * 0.8 + 1.1) / 2, -L / 2 + 0.25], [W / 2 * 0.62, (H * 0.8 + 1.1 - pi) / 2, 0.25])); return out.concat(extra || []); }
/* ===== TRILHO CURVO e TREM ARTICULADO ===== */
/* move peças: gira em volta de y (graus, mesmo sentido do "giro" dos objetos) e desloca em x,z */
function vcMover(parts, ang, tx, tz) { const g = ang * Math.PI / 180, c = Math.cos(g), s = Math.sin(g), M = [c, 0, s, 0, 1, 0, -s, 0, c];
  const mul = (A, B) => [0, 1, 2].flatMap(i => [0, 1, 2].map(j => A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]));
  return parts.map(b => { const q = Object.assign({}, b), C = b.c; q.c = [C[0] * c + C[2] * s + tx, C[1], -C[0] * s + C[2] * c + tz]; q.R = mul(M, b.R || [1, 0, 0, 0, 1, 0, 0, 0, 1]); return q; }); }
/* amostras do caminho do trilho (curva suave Catmull-Rom pelos pontos, em R, relativos ao objeto): [{x, z, s (comprimento), a (ângulo, graus)}] */
function vcTrilhoAmostras(o) { const P = (o && o.caminho && o.caminho.length >= 2) ? o.caminho : [[0, -(o && o.prof || 440) / 2], [0, (o && o.prof || 440) / 2]], out = [];
  const cr = (p0, p1, p2, p3, t) => [0, 1].map(i => 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t * t + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t * t * t));
  for (let i = 0; i < P.length - 1; i++) { const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)], n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 4));
    for (let k = i ? 1 : 0; k <= n; k++) out.push(cr(p0, p1, p2, p3, k / n)); }
  let S = 0; return out.map((q, i) => { if (i) S += Math.hypot(q[0] - out[i - 1][0], q[1] - out[i - 1][1]); const a = out[Math.min(out.length - 1, i + 1)], b = out[Math.max(0, i - 1)]; return { x: q[0], z: q[1], s: S, a: Math.atan2(a[0] - b[0], a[1] - b[1]) * 180 / Math.PI }; }); }
function vcTrilhoEm(A, s) { if (s <= 0) return A[0]; for (let i = 1; i < A.length; i++) if (A[i].s >= s) { const u = (s - A[i - 1].s) / Math.max(1e-6, A[i].s - A[i - 1].s); return { x: A[i - 1].x + (A[i].x - A[i - 1].x) * u, z: A[i - 1].z + (A[i].z - A[i - 1].z) * u, s, a: A[i].a }; } return A[A.length - 1]; }
function vcTrilhoPartes(o) { const A = vcTrilhoAmostras(o), out = [], off = (q, d) => { const g = q.a * Math.PI / 180; return [q.x + Math.cos(g) * d, q.z - Math.sin(g) * d]; };
  for (let i = 1; i < A.length; i++) for (const d of [-6.3, 6.3]) { const a = off(A[i - 1], d), b = off(A[i], d); out.push(ocTubo([a[0], 1.0, a[1]], [b[0], 1.0, b[1]], 0.42)); }
  const L = A[A.length - 1].s, n = Math.max(2, Math.floor(L / 5.4)); for (let k = 0; k <= n; k++) { const q = vcTrilhoEm(A, k * L / n), a = off(q, -11), b = off(q, 11); out.push(Object.assign(ocTubo([a[0], 0.3, a[1]], [b[0], 0.3, b[1]], 0.55), { r1: 0.55 })); }
  return out; }
/* trem: carros ao longo do trilho (o._carros = poses de cada carro no referencial do trem); sem trilho, em linha reta */
const VC_TREM_CENTROS = k => k === 0 ? 0 : -89 - (k - 1) * 82;
function vcTremPartes(o) { const n = Math.max(0, Math.min(6, Math.round(o.vagoes ?? 2))), C = o._carros;
  if (!C || C.length !== n + 1) { const out = vcLocomotiva(0); for (let k = 0; k < n; k++) out.push(...vcVagao(VC_TREM_CENTROS(k + 1), 74)); return out; }
  let out = vcMover(vcLocomotiva(0), C[0].a, C[0].x, C[0].z);
  for (let k = 1; k <= n; k++) { out = out.concat(vcMover(vcVagao(0, 74), C[k].a, C[k].x, C[k].z));
    /* sanfona entre os carros (a junção dobra na curva) */
    const p = C[k - 1], q = C[k], ga = p.a * Math.PI / 180, gb = q.a * Math.PI / 180, ra = k === 1 ? 47 : 39, A2 = [p.x - Math.sin(ga) * ra, p.z - Math.cos(ga) * ra], B2 = [q.x + Math.sin(gb) * 39, q.z + Math.cos(gb) * 39];
    out.push(Object.assign(ocTubo([A2[0], 18, A2[1]], [B2[0], 18, B2[1]], 9), { cor: "fundo" }), ocTubo([A2[0], 7, A2[1]], [B2[0], 7, B2[1]], 0.8)); }
  return out; }
/* ===== PORTAS E PORTÕES: o.aberto de 0 (fechada) a 1 (aberta); folhas giram na dobradiça, de correr deslizam, levadiça sobe ===== */
function vcMoverX(parts, ang, ty, tz) { const g = ang * Math.PI / 180, c = Math.cos(g), s = Math.sin(g), M = [1, 0, 0, 0, c, -s, 0, s, c];
  const mul = (A, B) => [0, 1, 2].flatMap(i => [0, 1, 2].map(j => A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]));
  return parts.map(b => { const q = Object.assign({}, b), C = b.c; q.c = [C[0], C[1] * c - C[2] * s + ty, C[1] * s + C[2] * c + tz]; q.R = mul(M, b.R || [1, 0, 0, 0, 1, 0, 0, 0, 1]); return q; }); }
const pAb = o => Math.max(0, Math.min(1, (o && o.aberto) || 0));
/* uma folha de porta com a dobradiça em x=0, largura w, altura h, espessura e (estilo: lisa | almofadas | tabuas | vidro) */
function vcFolhaPorta(w, h, e, estilo, sx) { const out = [ocCaixa([sx * w / 2, h / 2, 0], [w / 2, h / 2, e / 2])], ink = b => Object.assign(b, { cor: "ink" });
  if (estilo === "almofadas") for (const [y0, y1] of [[0.12, 0.45], [0.55, 0.9]]) for (const f of [-1, 1]) out.push(ink(ocCaixa([sx * w / 2, h * (y0 + y1) / 2, f * (e / 2 + 0.03)], [w * 0.36, h * (y1 - y0) / 2, 0.03])));
  if (estilo === "tabuas") { for (let i = 1; i < 6; i++) out.push(ink(ocCaixa([sx * w * i / 6, h / 2, e / 2 + 0.03], [0.05, h / 2 - 0.2, 0.03]))); for (const y of [0.18, 0.5, 0.82]) out.push(ink(ocCaixa([sx * w / 2, h * y, e / 2 + 0.08], [w / 2 - 0.2, 0.45, 0.08]))); for (let i = 0; i < 5; i++) for (const y of [0.18, 0.5, 0.82]) out.push(ink(ocEsf([sx * w * (i + 0.5) / 5, h * y, e / 2 + 0.2], [0.22, 0.22, 0.15]))); }
  if (estilo === "vidro") out.push(Object.assign(ocCaixa([sx * w / 2, h * 0.55, 0], [w * 0.38, h * 0.38, e / 2 + 0.02]), { cor: "claro" }));
  out.push(ocEsf([sx * (w - 0.9), h * 0.48, e / 2 + 0.35], [0.35, 0.35, 0.35]), ocEsf([sx * (w - 0.9), h * 0.48, -e / 2 - 0.35], [0.35, 0.35, 0.35]));
  return out; }
function vcBatente(w, h, t, e) { return [ocCaixa([-w / 2 - t / 2, h / 2, 0], [t / 2, h / 2, e]), ocCaixa([w / 2 + t / 2, h / 2, 0], [t / 2, h / 2, e]), ocCaixa([0, h + t / 2, 0], [w / 2 + t, t / 2, e])]; }
function vcPorta(o, w, h, estilo, dupla) { const a = pAb(o) * 92 * (o.paraDentro ? -1 : 1), e = Math.max(0.35, w * 0.05), out = vcBatente(w, h, Math.max(0.6, w * 0.08), e * 1.4);
  if (!dupla) return out.concat(vcMover(vcFolhaPorta(w, h, e, estilo, 1), -a, -w / 2, 0));
  return out.concat(vcMover(vcFolhaPorta(w / 2, h, e, estilo, 1), -a, -w / 2, 0), vcMover(vcFolhaPorta(w / 2, h, e, estilo, -1), a, w / 2, 0)); }
function vcPortaCastelo(o) { const w = 24, h = 32, a = pAb(o) * 88, out = [];
  for (const sx of [-1, 1]) out.push(ocCaixa([sx * (w / 2 + 3), (h + 8) / 2, 0], [3, (h + 8) / 2, 4]));
  out.push(ocToro([0, h, 0], w / 2 + 3, 3, "z", 4, { meio: [0, 1, 0, 0] }), ocCaixa([0, h + 9, 0], [w / 2 + 6, 3, 4]));
  const folha = sx => { const f = vcFolhaPorta(w / 2, h, 1.2, "tabuas", sx); f.push(ocToro([0, h, 0], w / 2 - 0.3, 0.6, "z", 0.6, { meio: [0, 1, 0, 0] })); return f; };
  return out.concat(vcMover(folha(1), -a, -w / 2, 0), vcMover(folha(-1), a, w / 2, 0)); }
function vcPortao(o, w, h, solido) { const a = pAb(o) * 95, out = [], barras = (L, sx) => { const f = [ocCaixa([sx * L / 2, 1.5, 0], [L / 2, 0.35, 0.35]), ocCaixa([sx * L / 2, h - 1, 0], [L / 2, 0.35, 0.35])], n = Math.max(3, Math.round(L / 1.4));
    for (let i = 0; i <= n; i++) { const x = sx * L * i / n; f.push(ocTubo([x, 0.6, 0], [x, h, 0], 0.22)); if (solido) f.push(ocEsf([x, h + 0.6, 0], [0.4, 0.9, 0.4])); }
    if (solido) { f.push(ocCaixa([sx * L / 2, h * 0.5, 0], [L / 2, 0.3, 0.3])); for (let i = 0; i < n; i++) f.push(ocToro([sx * L * (i + 0.5) / n, h * 0.72, 0], L / n * 0.35, 0.12, "z")); } return f; };
  for (const sx of [-1, 1]) out.push(ocCaixa([sx * (w / 2 + 1), (h + 2) / 2, 0], [1, (h + 2) / 2, 1]), ocEsf([sx * (w / 2 + 1), h + 2.6, 0], [1.2, 1.2, 1.2]));
  return out.concat(vcMover(barras(w / 2, 1), -a, -w / 2, 0), vcMover(barras(w / 2, -1), a, w / 2, 0)); }
function vcLevadica(o) { const w = 26, h = 30, up = pAb(o) * (h - 2), out = [];
  for (const sx of [-1, 1]) out.push(ocCaixa([sx * (w / 2 + 4), (h + 10) / 2, 0], [4, (h + 10) / 2, 5])); out.push(ocCaixa([0, h + 6, 0], [w / 2 + 8, 4, 5]));
  for (let i = 0; i <= 9; i++) { const x = -w / 2 + w * i / 9; out.push(ocTubo([x, up, 0], [x, up + h, 0], 0.35), ocEsf([x, up - 0.6, 0], [0.4, 1, 0.4])); }
  for (let j = 1; j <= 7; j++) out.push(ocTubo([-w / 2, up + h * j / 8, 0], [w / 2, up + h * j / 8, 0], 0.3));
  return out; }
function vcAlcapao(o) { const w = 8, d = 8, a = pAb(o) * 100, out = [ocCaixa([0, 0.08, -d / 2 - 0.4], [w / 2 + 0.8, 0.08, 0.4]), ocCaixa([0, 0.08, d / 2 + 0.4], [w / 2 + 0.8, 0.08, 0.4]), ocCaixa([-w / 2 - 0.4, 0.08, 0], [0.4, 0.08, d / 2]), ocCaixa([w / 2 + 0.4, 0.08, 0], [0.4, 0.08, d / 2]), Object.assign(ocCaixa([0, 0.02, 0], [w / 2, 0.02, d / 2]), { cor: "ink" })];
  const folha = [ocCaixa([0, 0.25, d / 2], [w / 2, 0.25, d / 2])]; for (let i = 1; i < 4; i++) folha.push(Object.assign(ocCaixa([-w / 2 + w * i / 4, 0.52, d / 2], [0.05, 0.03, d / 2 - 0.2]), { cor: "ink" })); folha.push(ocToro([0, 0.6, d * 0.8], 0.6, 0.12, "x"));
  return out.concat(vcMoverX(folha, -a, 0, -d / 2)); }
/* ===== PORTAS GIGANTES DE FANTASIA (kaiju, titãs, cidadelas, templos, masmorras): poucas peças grandes, para pesar pouco ===== */
function vcFolhaGigante(w, h, e, sx, faixas, rebites, ink2) { const out = [ocCaixa([sx * w / 2, h / 2, 0], [w / 2, h / 2, e / 2])], ink = b => Object.assign(b, { cor: "ink" });
  for (let i = 0; i < faixas; i++) { const y = h * (i + 0.6) / (faixas + 0.2); for (const f of [-1, 1]) out.push(ink(ocCaixa([sx * w / 2, y, f * (e / 2 + h * 0.004)], [w / 2 - h * 0.01, h * 0.018, h * 0.004])));
    for (let j = 0; j < rebites; j++) out.push(ocEsf([sx * w * (j + 0.5) / rebites, y, e / 2 + h * 0.012], h * 0.011)); }
  if (ink2) out.push(ink(ocCaixa([sx * 0.02 * w, h / 2, e / 2 + 0.1], [w * 0.01, h / 2, 0.1]))); return out; }
function vcPortaoTita(o) { const w = 220, h = 300, e = 10, a = pAb(o) * 80 * (o.paraDentro ? -1 : 1), out = [], ink = b => Object.assign(b, { cor: "ink" });
  for (const sx of [-1, 1]) out.push(ocCaixa([sx * (w / 2 + 20), (h + 60) / 2, 0], [20, (h + 60) / 2, 22]), ocCaixa([sx * (w / 2 + 20), h + 66, 0], [26, 6, 28]), ocEsf([sx * (w / 2 + 20), h + 84, 0], [14, 14, 14]));
  out.push(ocCaixa([0, h + 30, 0], [w / 2 + 2, 30, 18]), ink(ocCaixa([0, h + 30, 18.2], [w / 2 - 20, 14, 0.4])), ocToro([0, h + 30, 18.6], 10, 2, "z"));
  const folha = sx => { const f = vcFolhaGigante(w / 2, h, e, sx, 6, 6, true); f.push(ocToro([sx * (w / 2 - 22), h * 0.42, e / 2 + 4], 9, 1.6, "z"), ocEsf([sx * (w / 2 - 22), h * 0.42 + 9, e / 2 + 2], [4, 4, 3])); return f; };
  return out.concat(vcMover(folha(1), -a, -w / 2, 0), vcMover(folha(-1), a, w / 2, 0)); }
function vcPortaoCidadela(o) { const w = 70, h = 90, a = pAb(o) * 85, out = [], tw = 34, th = 170;
  for (const sx of [-1, 1]) { const x = sx * (w / 2 + tw / 2); out.push(ocCaixa([x, th / 2, 0], [tw / 2, th / 2, tw / 2]));
    for (let i = 0; i < 4; i++) for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]].slice(0, 4)) if ((i + (dx > 0 ? 1 : 0)) % 2 === 0) out.push(ocCaixa([x + dx * (tw / 2 - 3), th + 5, dz * (tw / 2 - 3)], [3, 5, 3]));
    out.push(Object.assign(ocCaixa([x, th * 0.7, tw / 2 + 0.1], [2, 8, 0.1]), { cor: "ink" })); }
  out.push(ocCaixa([0, (h + th) / 2 + 10, 0], [w / 2, (th - h) / 2 - 10, tw / 2 - 2]), ocToro([0, h, tw / 2 - 2], w / 2, 5, "z", 4, { meio: [0, 1, 0, 0] }));
  for (let i = 0; i < 6; i++) out.push(ocCaixa([-w / 2 + 6 + i * (w - 12) / 5, th + 5, tw / 2 - 5], [3, 5, 3]));
  const folha = sx => vcFolhaPorta(w / 2, h, 4, "tabuas", sx).concat(vcFolhaGigante(w / 2, h, 4, sx, 4, 4, false).slice(1));
  return out.concat(vcMover(folha(1), -a, -w / 2, tw / 2 - 6), vcMover(folha(-1), a, w / 2, tw / 2 - 6)); }
function vcPortaDungeon(o) { const w = 40, h = 56, up = pAb(o) * (h - 2), out = [], ink = b => Object.assign(b, { cor: "ink" });
  for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) out.push(ocCaixa([sx * (w / 2 + 6), 5 + i * 10.4, 0], [6 - (i % 2) * 0.6, 5, 8]));
  out.push(ocCaixa([0, h + 7, 0], [w / 2 + 12, 7, 8]), ink(ocCaixa([0, h + 7, 8.1], [w / 3, 2, 0.1])));
  const laje = [ocCaixa([0, up + h / 2, 0], [w / 2, h / 2, 2.6])]; for (let i = 0; i < 5; i++) laje.push(ink(ocCaixa([-w / 2 + 6 + i * (w - 12) / 4, up + h * 0.55, 2.7], [1.2, h * 0.3, 0.06])), ink(ocCaixa([-w / 2 + 6 + i * (w - 12) / 4, up + h * 0.55 + (i % 2 ? 6 : -6), 2.7], [3, 0.6, 0.06])));
  laje.push(ocToro([0, up + h * 0.3, 2.9], 3, 0.5, "z")); return out.concat(laje); }
function vcPortaTemplo(o) { const w = 60, h = 90, a = pAb(o) * 88, out = [], ink = b => Object.assign(b, { cor: "ink" });
  for (const sx of [-1, 1]) { out.push({ cil: true, c: [sx * (w / 2 + 9), (h + 14) / 2, 6], r: 5, hh: (h + 14) / 2 }, ocCaixa([sx * (w / 2 + 9), 2, 6], [7, 2, 7]), ocCaixa([sx * (w / 2 + 9), h + 15, 6], [7, 1.5, 7]), ocCaixa([sx * (w / 2 + 2), h / 2 + 6, 0], [2, h / 2 + 6, 4])); }
  out.push(ocCaixa([0, h + 19, 6], [w / 2 + 18, 3, 9]), ocCaixa([-(w / 4 + 7), h + 29, 6], [w / 4 + 13, 1.6, 9], rotZ(0.32)), ocCaixa([(w / 4 + 7), h + 29, 6], [w / 4 + 13, 1.6, 9], rotZ(-0.32)), ink(ocCaixa([0, h + 27, 15.1], [10, 3, 0.1])));
  const folha = sx => { const f = [ocCaixa([sx * w / 4, h / 2, 0], [w / 4, h / 2, 1.6])]; for (let i = 0; i < 4; i++) for (const f2 of [-1, 1]) f.push(ink(ocCaixa([sx * w / 4, h * (0.12 + i * 0.22), f2 * 1.65], [w / 4 - 3, h * 0.08, 0.05]))); f.push(ocToro([sx * 3, h * 0.48, 2.4], 2.2, 0.5, "z")); return f; };
  return out.concat(vcMover(folha(1), -a, -w / 2, 0), vcMover(folha(-1), a, w / 2, 0)); }
function vcPortaRaiz(o) { const w = 30, h = 46, a = pAb(o) * 92, out = [];
  for (let i = 0; i < 9; i++) { const t0 = Math.PI * i / 9, t1 = Math.PI * (i + 1) / 9, R = w / 2 + 3, P = t => [Math.cos(t) * R, h * 0.68 + Math.sin(t) * R * 1.1, 0]; out.push(ocTubo(P(t0), P(t1), 2.2 - (i % 3) * 0.4)); }
  for (const sx of [-1, 1]) { out.push(ocTubo([sx * (w / 2 + 3), 0, 0], [sx * (w / 2 + 3), h * 0.68, 0], 2.4), ocTubo([sx * (w / 2 + 3), 4, 0], [sx * (w / 2 + 10), 0, 3], 1.4), ocTubo([sx * (w / 2 + 3), 9, 0], [sx * (w / 2 + 9), 0, -4], 1.1)); }
  const folha = [ocCaixa([w / 2, h * 0.45, 0], [w / 2 - 1, h * 0.45, 1])]; for (let i = 0; i < 6; i++) folha.push(ocTubo([3 + i * (w - 6) / 5, 0.5, 1.2], [3 + i * (w - 6) / 5 + (i % 2 ? 1.5 : -1.5), h * 0.88, 1.2], 0.7)); folha.push(ocEsf([w - 4, h * 0.45, 1.8], 1.1));
  return out.concat(vcMover(folha, -a, -w / 2, 0)); }
function vcPortaCofre(o) { const R = 22, e = 6, a = pAb(o) * 100, out = [];
  for (const sx of [-1, 1]) out.push(ocCaixa([sx * (R + 5), R + 4, -1], [5, R + 4, 3])); out.push(ocCaixa([0, 2, -1], [R, 2, 3]), ocCaixa([0, 2 * R + 6, -1], [R, 2, 3]), ocToro([0, R + 4, 2], R + 0.6, 1, "z"));
  const porta = [{ cil: true, c: [R, R + 4, e / 2 + 1.5], r: R, hh: e / 2, R: rotParaEixo([0, 0, 1]) }, ocToro([R, R + 4, e + 2], R * 0.5, 0.8, "z"), { cil: true, c: [R, R + 4, e + 2], r: 2.4, hh: 1, R: rotParaEixo([0, 0, 1]) }];
  for (let k = 0; k < 3; k++) { const t = k * Math.PI / 3; porta.push(ocTubo([R - Math.cos(t) * R * 0.5, R + 4 - Math.sin(t) * R * 0.5, e + 2], [R + Math.cos(t) * R * 0.5, R + 4 + Math.sin(t) * R * 0.5, e + 2], 0.5)); }
  for (let k = 0; k < 8; k++) { const t = k * Math.PI / 4; porta.push(ocEsf([R + Math.cos(t) * R * 0.85, R + 4 + Math.sin(t) * R * 0.85, e + 1.6], 1.2)); }
  return out.concat(vcMover(porta, -a, -R, 0)); }
function vcAssentosVagao(z0, L) { const A = {}, h = L / 2, base = { dentro: true, chao: 8.6, teto: 30, pesFrente: 4.2, reclina: 4 }; [[-1, 1], [1, -1]].forEach(([s, ol], i) => { for (let r = 0; r < 3; r++) A["banco" + (i * 3 + r + 1)] = Object.assign({ p: [s * 7, 12.6, z0 - h + 12 + r * 14 + (ol < 0 ? 5 : 0)], olha: ol }, base); }); A["corredor"] = { p: [0, 8.6, z0], olha: 1, pe: true, dentro: true }; return A; }
function vcVagao(z0, L) { const h = L / 2, jan = [], ink = b => Object.assign(b, { cor: "ink" }); for (let k = 0; k < Math.floor((L - 8) / 7); k++) jan.push([z0 - h + 3.8 + k * 7, z0 - h + 8.2 + k * 7]);
  const out = vcCasca({ w: 12.4, y0: 7.6, yp: 8.6, yb: 17.6, yt: 30, z0: z0 - h, z1: z0 + h, t: 0.5, jan, frente: "fechada", tras: "fechada" });
  out.push(ocCaixa([0, 6.8, z0], [5.6, 1.0, h + 1.6]));
  for (const k of [-1, 0, 1]) out.push(ocCaixa([k * 7.6, 31.2 - Math.abs(k) * 1.0, z0], [4.2, 0.45, h + 0.4], k ? rotZ(k * 0.26) : undefined));
  for (const s of [-1, 1]) { out.push(Object.assign(ocCaixa([s * 12.45, 17.5, z0 + h - 3], [0.05, 8.2, 1.8]), { cor: "fundo" }));
    for (const zb of [-h + 9, h - 9]) { out.push(ocCaixa([0, 6.0, z0 + zb], [9, 0.8, 4.6])); for (const dz of [-3.2, 3.2]) out.push(...vcRodaTrem(s * 6.3, 4.4, z0 + zb + dz, 3.4)); }
    out.push(ocEsf([s * 6, 7.2, z0 + s * (h + 2.2)], [1.2, 1.2, 0.6])); }
  for (const S of Object.values(vcAssentosVagao(z0, L))) if (!S.pe) out.push(...vcBanco(S.p[0], S.p[1], S.p[2], S.olha, 4.2, 8.5, 8.6));
  return out; }

import { qdPartes, qdMedidas } from "./quadrupede.js";
import { OBJ_MAO, SINONIMOS_MAO } from "./objetos-mao.js";
/* ======== os objetos ======== */
const COMPOSTOS = {
  /* animal quadrúpede (cavalo, camelo, cachorro…): partes vindas do esqueleto (quadrupede.js) — o.animal = { especie, escala, pose, p } */
  animal: { nome: "animal quadrúpede", larg: 5, prof: 22, alt: 18, grupo: "animal", partes: o => qdPartes(o) },
  /* -- formas puras (medidas pela caixa envolvente) -- */
  /* cenário (plantas): árvore, palmeira, arbusto, poço, água, telhado plano */
  arvore: { nome: "árvore", larg: 8, prof: 8, alt: 24, grupo: "cenario",
    partes: o => { const A = o.alt, r = o.larg / 2; return [{ cil: true, c: [0, A * 0.28, 0], r: Math.max(0.35, r * 0.13), r1: Math.max(0.25, r * 0.09), hh: A * 0.28 }, ocEsf([0, A * 0.7, 0], [r, A * 0.3, o.prof / 2], { facetas: 11, semente: o.semente || 3 })]; } },
  palmeira: { nome: "palmeira", larg: 9, prof: 9, alt: 30, grupo: "cenario",
    partes: o => { const A = o.alt, r = o.larg / 2, out = [{ cil: true, c: [0, A * 0.45, 0], r: 0.55, r1: 0.4, hh: A * 0.45 }];
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, d = [Math.sin(a), -0.35, Math.cos(a)]; out.push(ocEsf([d[0] * r * 0.55, A * 0.9 + d[1] * r * 0.4, d[2] * r * 0.55], [1.0, r * 0.55, 0.3], { R: rotParaEixo(d) })); }
      return out; } },
  arbusto: { nome: "arbusto", larg: 4, prof: 4, alt: 3.5, grupo: "cenario",
    partes: o => [ocEsf([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, o.prof / 2], { facetas: 8, semente: o.semente || 5 })] },
  poco: { nome: "poço", larg: 7, prof: 7, alt: 4.5, grupo: "cenario",
    partes: o => { const r = o.larg / 2; return [ocToro([0, o.alt * 0.9, 0], r * 0.85, r * 0.15, "y"), { cil: true, c: [0, o.alt * 0.45, 0], r: r, hh: o.alt * 0.45 }, { cil: true, c: [0, o.alt * 0.92, 0], r: r * 0.7, hh: 0.05, cor: "fundo" }]; } },
  agua: { nome: "água (espelho)", larg: 10, prof: 6, alt: 0.3, grupo: "cenario",
    partes: o => [ocCaixa([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, o.prof / 2])] },
  predio: { nome: "prédio/casa (bloco)", larg: 20, prof: 20, alt: 26, grupo: "cenario",
    partes: o => [ocCaixa([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, o.prof / 2]), ocCaixa([0, o.alt + 0.3, 0], [o.larg / 2 + 0.2, 0.3, o.prof / 2 + 0.2])] },
  rampaDegraus: { nome: "escada de degraus", larg: 6, prof: 12, alt: 10, grupo: "cenario",
    partes: o => { const n = Math.max(2, Math.round(o.alt / 1.6)), out = []; for (let k = 0; k < n; k++) { const h = o.alt * (k + 1) / n, d = o.prof / n; out.push(ocCaixa([0, h / 2, -o.prof / 2 + d * (k + 0.5)], [o.larg / 2, h / 2, d / 2])); } return out; } },
  esfera: { nome: "esfera", larg: 3, prof: 3, alt: 3, grupo: "forma",
    partes: o => [ocEsf([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, o.prof / 2])] },
  cone: { nome: "cone", larg: 3, prof: 3, alt: 4, grupo: "forma",
    partes: o => [{ cil: true, c: [0, o.alt / 2, 0], r: o.larg / 2, r1: (o.topo ?? 0.06) * o.larg / 2, hh: o.alt / 2 }] },
  toro: { nome: "anel (toro)", larg: 4, prof: 1, alt: 4, grupo: "forma",
    partes: o => { const rt = Math.min(o.prof / 2, o.larg / 4); return [ocToro([0, o.alt / 2, 0], o.larg / 2 - rt, rt, "z", o.prof / 2)]; } },
  capsula: { nome: "cápsula", larg: 1.6, prof: 1.6, alt: 6, grupo: "forma",
    partes: o => { const r = Math.min(o.larg, o.prof) / 2, hh = Math.max(0.01, o.alt / 2 - r); return [{ cil: true, c: [0, o.alt / 2, 0], r, hh }, ocEsf([0, o.alt / 2 + hh, 0], r), ocEsf([0, o.alt / 2 - hh, 0], r)]; } },
  prisma: { nome: "prisma triangular", larg: 4, prof: 3, alt: 3, grupo: "forma",
    partes: o => [{ cil: true, c: [0, o.alt / 2, 0], r: o.larg / 2, hh: o.alt / 2, lados: 3 }] },

  /* -- carga -- */
  pedra: { nome: "pedra", larg: 4, prof: 3.6, alt: 3.2, grupo: "carga",
    partes: o => [ocEsf([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, o.prof / 2], { facetas: 9, semente: o.semente || 7 })] },
  pneu: { nome: "pneu", larg: 6.6, prof: 1.9, alt: 6.6, grupo: "carga",
    partes: o => { const rt = Math.min(o.larg * 0.1, o.prof * 0.5); return [ocToro([0, o.alt / 2, 0], o.larg / 2 - rt, rt, "z", o.prof / 2), { cil: true, c: [0, o.alt / 2, 0], r: o.larg / 2 - 2 * rt + 0.05, hh: o.prof * 0.12, R: rotParaEixo([0, 0, 1]), cor: "fundo" }]; },
    pegas: o => { const r = o.larg / 2, y = o.alt / 2; return { topo: ocPega([0, y + r, 0], [0, 1, 0], [0, 0, 1]), ladoE: ocPega([r, y, 0], [1, 0, 0], [0, 0, 1]), ladoD: ocPega([-r, y, 0], [-1, 0, 0], [0, 0, 1]), baixoE: ocPega([r * 0.7, y - r * 0.7, 0], [0.7, -0.7, 0], [0, 0, 1]), baixoD: ocPega([-r * 0.7, y - r * 0.7, 0], [-0.7, -0.7, 0], [0, 0, 1]) }; } },
  saco: { nome: "saco", larg: 3.6, prof: 2.8, alt: 5.2, grupo: "carga",
    partes: o => { const A = o.alt; return [ocEsf([0, A * 0.38, 0], [o.larg / 2, A * 0.38, o.prof / 2]), { cil: true, c: [0, A * 0.8, 0], r: o.larg * 0.18, r1: o.larg * 0.07, hh: A * 0.08 }, ocEsf([0, A * 0.91, 0], [o.larg * 0.11, A * 0.06, o.larg * 0.11])]; },
    pegas: o => ({ no: ocPega([0, o.alt * 0.9, 0], [0, 1, 0], [1, 0, 0]), ladoE: ocPega([o.larg / 2, o.alt * 0.38, 0], [1, 0, 0], [0, 0, 1]), ladoD: ocPega([-o.larg / 2, o.alt * 0.38, 0], [-1, 0, 0], [0, 0, 1]) }) },
  fardo: { nome: "fardo (saco de dormir)", larg: 4.6, prof: 2.6, alt: 2.6, grupo: "carga",
    partes: o => { const r = o.alt / 2, hh = Math.max(0.05, o.larg / 2 - r * 0.5); return [{ cil: true, c: [0, r, 0], r, hh, R: rotParaEixo([1, 0, 0]) }, ocEsf([hh, r, 0], [r * 0.5, r, r]), ocEsf([-hh, r, 0], [r * 0.5, r, r]),
      ocToro([hh * 0.55, r, 0], r + 0.02, 0.08, "x"), ocToro([-hh * 0.55, r, 0], r + 0.02, 0.08, "x")]; } },
  tapete: { nome: "tapete enrolado", larg: 7, prof: 1.6, alt: 1.6, grupo: "carga",
    partes: o => [{ cil: true, c: [0, o.alt / 2, 0], r: o.alt / 2, hh: o.larg / 2, R: rotParaEixo([1, 0, 0]) }, { cil: true, c: [o.larg / 2 + 0.01, o.alt / 2, 0], r: o.alt * 0.12, hh: 0.02, R: rotParaEixo([1, 0, 0]), cor: "ink" }] },
  tambor: { nome: "tambor (barril de metal)", larg: 5, prof: 5, alt: 7.6, grupo: "carga",
    partes: o => { const r = o.larg / 2, A = o.alt; return [{ cil: true, c: [0, A / 2, 0], r, hh: A / 2 }, ...[0.04, 0.36, 0.64, 0.96].map(t => ocToro([0, A * t, 0], r, 0.09, "y"))]; },
    pegas: o => ({ topoE: ocPega([o.larg / 2 * 0.8, o.alt, 0], [0.3, 1, 0], [0, 0, 1]), topoD: ocPega([-o.larg / 2 * 0.8, o.alt, 0], [-0.3, 1, 0], [0, 0, 1]), ladoE: ocPega([o.larg / 2, o.alt / 2, 0], [1, 0, 0], [0, 1, 0]), ladoD: ocPega([-o.larg / 2, o.alt / 2, 0], [-1, 0, 0], [0, 1, 0]) }) },
  barrilChope: { nome: "barril de chope", larg: 3.6, prof: 3.6, alt: 5, grupo: "carga",
    partes: o => { const r = o.larg / 2, A = o.alt; return [{ cil: true, c: [0, A / 2, 0], r: r * 0.96, hh: A / 2 - 0.4 }, ocToro([0, 0.2, 0], r * 0.9, 0.2, "y"), ocToro([0, A - 0.2, 0], r * 0.9, 0.2, "y"), ocToro([0, A * 0.33, 0], r, 0.1, "y"), ocToro([0, A * 0.67, 0], r, 0.1, "y")]; } },
  botijao: { nome: "botijão de gás", larg: 2.6, prof: 2.6, alt: 6, grupo: "carga",
    partes: o => { const r = o.larg / 2, A = o.alt; return [{ cil: true, c: [0, (A - r) / 2 + 0.2, 0], r, hh: (A - r) / 2 - 0.2 }, ocEsf([0, A - r - 0.05, 0], [r, r * 0.6, r]), { cil: true, c: [0, A - 0.25, 0], r: r * 0.55, hh: 0.25 }, ocToro([0, 0.15, 0], r * 0.85, 0.15, "y")]; },
    pegas: o => ({ colar: ocPega([o.larg * 0.27, o.alt - 0.2, 0], [1, 0, 0], [0, 0, 1]) }) },
  galao: { nome: "galão", larg: 3, prof: 1.5, alt: 4, grupo: "carga",
    partes: o => [ocCaixa([0, o.alt * 0.44, 0], [o.larg / 2, o.alt * 0.44, o.prof / 2]), ocToro([0, o.alt * 0.88, 0], o.larg * 0.22, 0.13, "z"), { cil: true, c: [o.larg * 0.36, o.alt * 0.95, 0], r: 0.25, hh: 0.15 }],
    pegas: o => ({ alca: ocPega([0, o.alt * 0.88 + o.larg * 0.22, 0], [0, 1, 0], [1, 0, 0]) }) },
  balde: { nome: "balde", larg: 2.8, prof: 2.8, alt: 2.8, grupo: "carga",
    partes: o => { const r = o.larg / 2, A = o.alt; return [{ cil: true, c: [0, A / 2, 0], r: r * 0.8, r1: r, hh: A / 2 }, ocToro([0, A, 0], r, 0.07, "y"), ocToro([0, A, 0], r, 0.05, "z", 0.05, { meio: [0, 1, 0] })]; },
    pegas: o => ({ alca: ocPega([0, o.alt + o.larg / 2, 0], [0, 1, 0], [1, 0, 0]) }) },
  mala: { nome: "mala", larg: 4.4, prof: 1.6, alt: 3.4, grupo: "viagem",
    partes: o => [ocCaixa([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, o.prof / 2]), ocToro([0, o.alt, 0], 0.55, 0.12, "z", 0.14, { meio: [0, 1, 0] }), ocCaixa([0, o.alt / 2, o.prof / 2 + 0.02], [o.larg / 2, 0.08, 0.04])],
    pegas: o => ({ alca: ocPega([0, o.alt + 0.55, 0], [0, 1, 0], [1, 0, 0]) }) },
  maleta: { nome: "maleta / caixa de ferramentas", larg: 3.8, prof: 1.8, alt: 2.2, grupo: "trabalho",
    partes: o => [ocCaixa([0, o.alt * 0.45, 0], [o.larg / 2, o.alt * 0.45, o.prof / 2]), ocCaixa([0, o.alt * 0.95, 0], [o.larg / 2, o.alt * 0.05, o.prof / 2 + 0.05]), ocToro([0, o.alt, 0], 0.6, 0.1, "z", 0.12, { meio: [0, 1, 0] })],
    pegas: o => ({ alca: ocPega([0, o.alt + 0.6, 0], [0, 1, 0], [1, 0, 0]) }) },
  malaRodinhas: { nome: "mala de rodinhas", larg: 3.6, prof: 2.2, alt: 5.4, grupo: "viagem",
    partes: o => { const A = o.alt, L = o.larg / 2, P = o.prof / 2; return [ocCaixa([0, A / 2 + 0.3, 0], [L, A / 2 - 0.3, P]), ...[-1, 1].map(s => ocToro([s * (L - 0.4), 0.3, -P + 0.3], 0.25, 0.1, "x")),
      ...[-1, 1].map(s => ocTubo([s * 0.7, A, -P + 0.15], [s * 0.7, A + 3.4, -P + 0.15], 0.07)), ocTubo([-0.8, A + 3.4, -P + 0.15], [0.8, A + 3.4, -P + 0.15], 0.12)]; },
    pegas: o => ({ alca: ocPega([0, o.alt + 3.4, -o.prof / 2 + 0.15], [0, 1, 0], [1, 0, 0]) }) },
  mochila: { nome: "mochila cargueira", larg: 3.6, prof: 2.4, alt: 6, grupo: "viagem",
    partes: o => { const A = o.alt, L = o.larg / 2, P = o.prof / 2; return [ocCaixa([0, A * 0.42, 0], [L, A * 0.42, P]), { cil: true, c: [0, A * 0.9, 0], r: P * 0.9, hh: L, R: rotParaEixo([1, 0, 0]) }, ocCaixa([0, A * 0.3, P + 0.25], [L * 0.7, A * 0.15, 0.25]),
      ...[-1, 1].map(s => ocToro([s * L * 0.55, A * 0.5, -P], A * 0.32, 0.12, "x", 0.2, { meio: [0, 0, -1] }))]; } },
  bigorna: { nome: "bigorna", larg: 4.4, prof: 1.6, alt: 2.8, grupo: "trabalho",
    partes: o => { const A = o.alt; return [ocCaixa([0, A * 0.12, 0], [1.2, A * 0.12, o.prof / 2]), ocCaixa([0, A * 0.45, 0], [0.6, A * 0.21, o.prof * 0.32]), ocCaixa([-0.2, A * 0.83, 0], [1.4, A * 0.17, o.prof / 2]),
      { cil: true, c: [1.9, A * 0.83, 0], r: o.prof * 0.42, r1: 0.05, hh: 0.8, R: rotParaEixo([1, -0.1, 0]) }]; },
    pegas: o => ({ chifre: ocPega([1.7, o.alt * 0.83, 0], [0, 1, 0], [1, 0, 0]), traseira: ocPega([-1.6, o.alt * 0.83, 0], [-1, 0, 0], [0, 0, 1]) }) },
  caixote: { nome: "caixote de madeira", larg: 4, prof: 3.2, alt: 3.2, grupo: "carga",
    partes: o => { const L = o.larg / 2, A = o.alt, P = o.prof / 2, t = 0.18; const out = [ocCaixa([0, A / 2, 0], [L - 0.02, A / 2 - 0.02, P - 0.02])];
      for (const s of [-1, 1]) for (const y of [t / 2, A - t / 2]) out.push(ocCaixa([0, y, s * P], [L, t / 2, t / 2]));
      for (const s of [-1, 1]) for (const x of [-L + t / 2, L - t / 2]) out.push(ocCaixa([x, A / 2, s * P], [t / 2, A / 2, t / 2]));
      { const a = Math.atan2(A, 2 * L); out.push(ocCaixa([0, A / 2, P], [Math.hypot(L, A / 2) - 0.1, t / 2, t / 2], [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1])); }
      return out; } },
  palete: { nome: "palete / trenó", larg: 4.4, prof: 4.4, alt: 0.9, grupo: "carga",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, A = o.alt, out = [ocCaixa([0, A - 0.1, 0], [L, 0.1, P])]; for (const x of [-L + 0.3, 0, L - 0.3]) out.push(ocCaixa([x, (A - 0.2) / 2, 0], [0.3, (A - 0.2) / 2, P])); return out; } },
  vigaI: { nome: "viga em I", larg: 22, prof: 1.2, alt: 1.6, grupo: "construção",
    partes: o => { const L = o.larg / 2, A = o.alt, P = o.prof / 2, t = 0.14; return [ocCaixa([0, t / 2, 0], [L, t / 2, P]), ocCaixa([0, A - t / 2, 0], [L, t / 2, P]), ocCaixa([0, A / 2, 0], [L, A / 2 - t, 0.09])]; },
    pegas: o => ({ meio: ocPega([0, o.alt / 2, o.prof / 2], [0, 0, 1], [1, 0, 0]) }) },
  cano: { nome: "cano / tora", larg: 16, prof: 1.1, alt: 1.1, grupo: "construção",
    partes: o => [{ cil: true, c: [0, o.alt / 2, 0], r: o.alt / 2, hh: o.larg / 2, R: rotParaEixo([1, 0, 0]) }] },
  tabua: { nome: "tábua / prancha", larg: 18, prof: 2, alt: 0.4, grupo: "construção",
    partes: o => [ocCaixa([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, o.prof / 2])] },
  escada: { nome: "escada de mão", larg: 20, prof: 3.6, alt: 0.5, grupo: "construção",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, A = o.alt, out = [ocCaixa([0, A / 2, P - 0.2], [L, A / 2, 0.2]), ocCaixa([0, A / 2, -P + 0.2], [L, A / 2, 0.2])];
      const n = Math.max(2, Math.round(o.larg / 2.4)); for (let i = 0; i < n; i++) { const x = -L + (i + 0.5) * o.larg / n; out.push({ cil: true, c: [x, A / 2, 0], r: 0.13, hh: P - 0.4, R: rotParaEixo([0, 0, 1]) }); } return out; } },
  trelica: { nome: "treliça", larg: 20, prof: 2.6, alt: 0.4, grupo: "construção",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, A = o.alt, out = [ocCaixa([0, A / 2, P - 0.15], [L, A / 2, 0.15]), ocCaixa([0, A / 2, -P + 0.15], [L, A / 2, 0.15])];
      const n = Math.max(2, Math.round(o.larg / 2.6)); for (let i = 0; i < n; i++) { const x0 = -L + i * o.larg / n, x1 = x0 + o.larg / n, s = i % 2 ? 1 : -1; out.push(ocTubo([x0, A / 2, s * (P - 0.3)], [x1, A / 2, -s * (P - 0.3)], 0.1)); } return out; } },
  barraPesos: { nome: "barra com anilhas", larg: 18, prof: 3.8, alt: 3.8, grupo: "esporte",
    partes: o => { const L = o.larg / 2, r = o.alt / 2; return [{ cil: true, c: [0, r, 0], r: 0.13, hh: L, R: rotParaEixo([1, 0, 0]) }, ...[-1, 1].flatMap(s => [{ cil: true, c: [s * (L - 2.4), r, 0], r, hh: 0.3, R: rotParaEixo([1, 0, 0]) }, { cil: true, c: [s * (L - 1.7), r, 0], r: r * 0.75, hh: 0.25, R: rotParaEixo([1, 0, 0]) }])]; },
    pegas: o => ({ maoE: ocPega([2.2, o.alt / 2 + 0.13, 0], [0, 1, 0], [1, 0, 0]), maoD: ocPega([-2.2, o.alt / 2 + 0.13, 0], [0, 1, 0], [1, 0, 0]) }) },
  pa: { nome: "pá", larg: 1.9, prof: 0.4, alt: 12, grupo: "ferramenta",
    partes: o => { const A = o.alt; return [{ cil: true, c: [0, A * 0.6, 0], r: 0.14, hh: A * 0.38 }, ocCaixa([0, A * 0.11, 0.1], [o.larg / 2, A * 0.11, 0.06], rotParaEixo([0, 1, 0.25])), { cil: true, c: [0, A * 0.22, 0], r: 0.22, r1: 0.14, hh: 0.4 }, ocToro([0, A - 0.45, 0], 0.45, 0.09, "z")]; },
    pegas: o => ({ cabo: ocPega([0, o.alt * 0.62, 0], [0, 0, 1], [0, 1, 0]), punho: ocPega([0, o.alt - 0.1, 0], [0, 1, 0], [1, 0, 0]) }) },
  marreta: { nome: "marreta", larg: 2.4, prof: 1, alt: 8.5, grupo: "ferramenta",
    partes: o => { const A = o.alt; return [{ cil: true, c: [0, A * 0.45, 0], r: 0.15, hh: A * 0.45 }, ocCaixa([0, A - 0.5, 0], [o.larg / 2, 0.5, 0.5])]; },
    pegas: o => ({ ponta: ocPega([0, 0.5, 0], [0, 0, 1], [0, 1, 0]), meio: ocPega([0, o.alt * 0.55, 0], [0, 0, 1], [0, 1, 0]) }) },
  alavanca: { nome: "alavanca / pé de cabra", larg: 0.6, prof: 0.3, alt: 11, grupo: "ferramenta",
    partes: o => { const A = o.alt; return [{ cil: true, c: [0, A / 2 + 0.2, 0], r: 0.13, hh: A / 2 - 0.2 }, ocTubo([0, 0.4, 0], [0, 0, 0.5], 0.12), ocTubo([0, A, 0], [0, A + 0.1, 0.35], 0.12)]; },
    pegas: o => ({ topo: ocPega([0, o.alt * 0.85, 0], [0, 0, 1], [0, 1, 0]), meio: ocPega([0, o.alt * 0.6, 0], [0, 0, 1], [0, 1, 0]) }) },
  carrinhoDeMao: { nome: "carrinho de mão", larg: 5.4, prof: 13, alt: 5.2, grupo: "rodas",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, A = o.alt, out = [];
      out.push(ocToro([0, 1.3, P - 1.4], 1.05, 0.25, "x", 0.3), { cil: true, c: [0, 1.3, P - 1.4], r: 0.2, hh: 0.35, R: rotParaEixo([1, 0, 0]) });
      for (const s of [-1, 1]) { out.push(ocTubo([s * 1.1, 1.3, P - 1.4], [s * (L - 0.3), 3.1, -P + 0.4], 0.13)); out.push(ocTubo([s * 1.6, 2.4, -P + 3.2], [s * 1.6, 0.05, -P + 3.4], 0.12)); }
      out.push({ cil: true, c: [0, 3.6, 0.6], r: 2.6, r1: 1.7, hh: 0.95, R: rotParaEixo([0, -1, 0.15]), lados: 4 });
      return out; },
    pegas: o => ({ alcaE: ocPega([o.larg / 2 - 0.35, 3.1, -o.prof / 2 + 0.6], [0, 1, 0], [0, 0.3, 1]), alcaD: ocPega([-o.larg / 2 + 0.35, 3.1, -o.prof / 2 + 0.6], [0, 1, 0], [0, 0.3, 1]) }) },
  carrinhoCarga: { nome: "carrinho de carga (diabo)", larg: 3.2, prof: 2.6, alt: 10.5, grupo: "rodas",
    partes: o => { const L = o.larg / 2, A = o.alt, out = [];
      for (const s of [-1, 1]) { out.push(ocTubo([s * (L - 0.3), 0.9, -0.6], [s * (L - 0.3), A - 0.3, -0.6], 0.12)); out.push(ocToro([s * (L + 0.15), 0.9, -0.9], 0.7, 0.2, "x", 0.22)); }
      out.push(ocTubo([-(L - 0.3), A - 0.3, -0.6], [L - 0.3, A - 0.3, -0.6], 0.12), ocCaixa([0, 0.08, 0.4], [L - 0.2, 0.08, 1.0]), ocTubo([-L, 0.9, -0.9], [L, 0.9, -0.9], 0.1));
      out.push(ocCaixa([0, 1.5, 0.4], [L - 0.4, 1.35, 1.0]), ocCaixa([0, 3.5, 0.3], [L - 0.6, 0.65, 0.8]));
      return out; },
    pegas: o => ({ alcaE: ocPega([0.7, o.alt - 0.3, -0.6], [0, 0, -1], [1, 0, 0]), alcaD: ocPega([-0.7, o.alt - 0.3, -0.6], [0, 0, -1], [1, 0, 0]) }) },
  carrinhoPlataforma: { nome: "carrinho plataforma", larg: 5, prof: 9, alt: 8, grupo: "rodas",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, A = o.alt, out = [ocCaixa([0, 1.2, 0], [L, 0.18, P])];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(ocToro([sx * (L - 0.6), 0.5, sz * (P - 0.8)], 0.32, 0.12, "x", 0.15));
      for (const s of [-1, 1]) out.push(ocTubo([s * (L - 0.3), 1.3, -P + 0.2], [s * (L - 0.3), A, -P + 0.2], 0.13));
      out.push(ocTubo([-(L - 0.3), A, -P + 0.2], [L - 0.3, A, -P + 0.2], 0.14), ocCaixa([0.4, 2.6, 0.5], [1.6, 1.2, 1.6]), ocCaixa([0.2, 4.5, 0.8], [1.2, 0.7, 1.0]));
      return out; },
    pegas: o => ({ alcaE: ocPega([1.0, o.alt, -o.prof / 2 + 0.2], [0, 0, -1], [1, 0, 0]), alcaD: ocPega([-1.0, o.alt, -o.prof / 2 + 0.2], [0, 0, -1], [1, 0, 0]) }) },
  cacamba: { nome: "caçamba com rodas", larg: 6, prof: 5, alt: 5.4, grupo: "rodas",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, A = o.alt, out = [{ cil: true, c: [0, A / 2 + 0.4, 0], r: Math.hypot(L, P), r1: Math.hypot(L, P) * 1.1, hh: A / 2 - 0.4, lados: 4, R: [Math.cos(Math.PI / 4), 0, Math.sin(Math.PI / 4), 0, 1, 0, -Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)] }];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(ocToro([sx * (L - 0.7), 0.4, sz * (P - 0.7)], 0.28, 0.12, "x", 0.12)); return out; } },
  ancora: { nome: "âncora", larg: 4.6, prof: 0.6, alt: 6, grupo: "carga",
    partes: o => { const A = o.alt, L = o.larg / 2; return [{ cil: true, c: [0, A * 0.5, 0], r: 0.22, hh: A * 0.42 }, ocToro([0, A - 0.35, 0], 0.38, 0.12, "z"), ocTubo([-1.2, A * 0.78, 0], [1.2, A * 0.78, 0], 0.16),
      ocToro([0, A * 0.42, 0], L * 0.8, 0.2, "z", 0.2, { meio: [0, -1, 0] }), ...[-1, 1].map(s => ({ cil: true, c: [s * L * 0.8, A * 0.5, 0], r: 0.5, r1: 0.03, hh: 0.45, R: rotParaEixo([s * 0.4, 1, 0]) }))]; },
    pegas: o => ({ argola: ocPega([0, o.alt - 0.35 + 0.38, 0], [0, 1, 0], [1, 0, 0]) }) },
  pilhaCaixas: { nome: "pilha de caixas", larg: 3.4, prof: 2.8, alt: 4.6, grupo: "carga",
    partes: o => { const L = o.larg / 2, P = o.prof / 2, A = o.alt; return [ocCaixa([0, A * 0.22, 0], [L, A * 0.22, P]), ocCaixa([0.1, A * 0.6, 0], [L * 0.86, A * 0.16, P * 0.9]), ocCaixa([-0.05, A * 0.88, 0], [L * 0.7, A * 0.12, P * 0.8])]; } },
  bola: { nome: "bola", larg: 2, prof: 2, alt: 2, grupo: "esporte",
    partes: o => [ocEsf([0, o.alt / 2, 0], [o.larg / 2, o.alt / 2, o.prof / 2])] },
  lanca: { nome: "lança", larg: 0.5, prof: 0.3, alt: 15, grupo: "arma",
    partes: o => [{ cil: true, c: [0, o.alt * 0.46, 0], r: 0.11, hh: o.alt * 0.46 }, { cil: true, c: [0, o.alt * 0.96, 0], r: 0.25, r1: 0.02, hh: o.alt * 0.04, lados: 4 }],
    pegas: o => ({ meio: ocPega([0, o.alt * 0.45, 0], [0, 0, 1], [0, 1, 0]), tras: ocPega([0, o.alt * 0.2, 0], [0, 0, 1], [0, 1, 0]) }) },
  machado: { nome: "machado", larg: 2.2, prof: 0.4, alt: 7, grupo: "ferramenta",
    partes: o => [{ cil: true, c: [0, o.alt * 0.47, 0], r: 0.14, hh: o.alt * 0.47 }, ocCaixa([0.7, o.alt - 0.6, 0], [0.8, 0.55, 0.08]), ocCaixa([1.45, o.alt - 0.6, 0], [0.25, 0.85, 0.06])],
    pegas: o => ({ ponta: ocPega([0, 0.4, 0], [0, 0, 1], [0, 1, 0]), meio: ocPega([0, o.alt * 0.55, 0], [0, 0, 1], [0, 1, 0]) }) },
  escudo: { nome: "escudo redondo", larg: 5, prof: 0.6, alt: 5, grupo: "arma",
    partes: o => [{ cil: true, c: [0, o.alt / 2, 0], r: o.larg / 2, hh: o.prof / 2, R: rotParaEixo([0, 0, 1]) }, ocEsf([0, o.alt / 2, o.prof / 2], [0.6, 0.6, 0.35]), ocToro([0, o.alt / 2, -o.prof / 2 - 0.2], 0.5, 0.1, "y", 0.1, { meio: [0, 0, -1] })],
    pegas: o => ({ alca: ocPega([0, o.alt / 2, -o.prof / 2 - 0.4], [0, 0, -1], [0, 1, 0]) }) },
  arco: { nome: "arco (arma)", larg: 2.4, prof: 0.4, alt: 12, grupo: "arma",
    partes: o => { const c = o.alt * 0.46, sg = 2, R = (c * c + sg * sg) / (2 * sg); return [ocToro([0.4 + R - sg, o.alt / 2, 0], R, 0.13, "z", 0.13, { meio: [-1, 0, 0, (R - sg) / R - 0.01] }), ocTubo([0.4, o.alt / 2 - c, 0], [0.4, o.alt / 2 + c, 0], 0.025)]; },
    pegas: o => ({ punho: ocPega([0.4 - 2, o.alt / 2, 0], [-1, 0, 0], [0, 1, 0]) }) }
,
  /* ===== VEÍCULOS (simplificados, mas com as peças que importam: rodas, eixo, varais para o animal, bancos, remos, mastro).
     Frente = +z. "assentos" = onde a pessoa senta (olha +1 = para a frente, −1 = para trás, como o remador); "atrelar" = onde fica o animal que puxa. ===== */
  carruagem: { nome: "carruagem (coche fechado com cocheiro, timão para 1, 2, 4 ou 6 cavalos)", larg: 20, prof: 46, alt: 23, grupo: "veiculo", veiculo: "terra", corPadrao: "#6b2737",
    partes: o => { const out = [];
      for (const s of [-1, 1]) { out.push(...vcRoda(s * 8.6, 6.2, -12, 6.2, 10), ...vcRoda(s * 8.0, 4.6, 7, 4.6, 8));
        out.push(ocCaixa([s * 8.2, 8.8, -12], [0.5, 0.35, 3.4]), ocCaixa([s * 7.6, 7.6, 7], [0.5, 0.3, 2.6]), ocTubo([s * 2.6, 7.2, -15], [s * 2.6, 7.2, 9], 0.32));
        out.push(ocCaixa([s * 7.3, 9.4, -0.8], [0.6, 0.18, 1.0]), ocCaixa([s * 7.3, 8.0, -0.8], [0.25, 1.2, 0.25]));
        out.push(Object.assign(ocCaixa([s * 7.42, 15.6, -4.2], [0.04, 4.9, 0.12]), { cor: "ink" }), Object.assign(ocCaixa([s * 7.42, 15.6, -2.4], [0.04, 4.9, 0.12]), { cor: "ink" }), ocEsf([s * 7.6, 14.8, -2.9], 0.3));
        out.push(ocCaixa([s * 7.6, 20.8, 4.3], [0.7, 1.0, 0.7]), Object.assign(ocCaixa([s * 7.6, 20.8, 5.0], [0.5, 0.7, 0.05]), { cor: "fundo" }), ocTubo([s * 7.6, 19.8, 4.3], [s * 7.0, 18.6, 4.3], 0.12)); }
      out.push(ocTubo([-9.2, 6.2, -12], [9.2, 6.2, -12], 0.38), ocTubo([-8.6, 4.6, 7], [8.6, 4.6, 7], 0.34), ocCaixa([0, 7.6, -3], [3, 0.4, 11]));
      out.push(...vcCasca({ w: 7.3, y0: 8.1, yp: 9.2, yb: 15.0, yt: 20.9, z0: -11.7, z1: 3.7, t: 0.35, jan: [[-1.1, 2.9], [-10.6, -6.2]], frente: "janela", tras: "fechada", moldura: 2.4, teto: false }), ...vcBanco(0, 12.2, 0.6, -1, 6.4, 6.8, 9.2), ...vcBanco(0, 12.2, -9.4, 1, 6.4, 6.8, 9.2), ocCaixa([0, 21.2, -4], [7.9, 0.35, 8.3]), ocCaixa([0, 21.75, -4], [7.3, 0.25, 7.6]),
        ocCaixa([0, 22.6, -7.5], [5.5, 0.9, 3.4]), ocTubo([-7.6, 22.2, -11.7], [7.6, 22.2, -11.7], 0.15), ocTubo([-7.6, 22.2, 3.7], [7.6, 22.2, 3.7], 0.15));
            out.push(ocCaixa([0, 13.2, 6.6], [5.4, 0.5, 2.1]), ocCaixa([0, 15.0, 4.7], [5.4, 1.8, 0.35]), ocCaixa([0, 10.6, 9.8], [5.0, 0.3, 2.0], rotParaEixo([0, 0.45, 1])), ocTubo([-4.6, 11.4, 4.6], [-4.6, 11.4, 9.6], 0.2), ocTubo([4.6, 11.4, 4.6], [4.6, 11.4, 9.6], 0.2));
      out.push(ocCaixa([0, 11.2, -13.4], [5.6, 1.7, 1.6]), ocCaixa([0, 8.6, -15], [6, 0.3, 1.2]));
      out.push(ocTubo([0, 6.4, 8.5], [0, 6.0, 30.5], 0.42), ocTubo([-6.2, 6.1, 26.5], [6.2, 6.1, 26.5], 0.32), ocTubo([-3.6, 6.4, 9.5], [-3.6, 6.2, 12.5], 0.22), ocTubo([3.6, 6.4, 9.5], [3.6, 6.2, 12.5], 0.22));
      return out; },
    assentos: () => ({ cocheiro: { p: [0, 13.75, 6.6], olha: 1 }, cocheiro2: { p: [2.6, 13.75, 6.6], olha: 1 }, passageiro: { p: [2.6, 12.2, 0.6], olha: -1, dentro: true, chao: 9.2, teto: 20.9, pesFrente: 4.4, reclina: 4 }, passageiro2: { p: [-2.6, 12.2, -9.4], olha: 1, dentro: true, chao: 9.2, teto: 20.9, pesFrente: 4.4, reclina: 4 }, teto: { p: [0, 23.5, -7.5], olha: 1 } }), atrelar: () => [0, 0, 22],
    pegas: () => ({ redeas: ocPega([0, 15, 10], [0, 0, 1], [1, 0, 0]) }) },
  carroca: { nome: "carroça (duas rodas, varais para o animal)", larg: 14, prof: 26, alt: 11, grupo: "veiculo", veiculo: "terra",
    partes: o => { const out = []; for (const s of [-1, 1]) { out.push(ocToro([s * 6.5, 5.3, -2], 5, 0.35, "x", 0.5)); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; out.push(ocTubo([s * 6.5, 5.3 - Math.cos(a) * 4.8, -2 - Math.sin(a) * 4.8], [s * 6.5, 5.3 + Math.cos(a) * 4.8, -2 + Math.sin(a) * 4.8], 0.13)); }
        out.push(ocTubo([s * 3.6, 6.2, 4], [s * 3.6, 6.8, 20], 0.3), ocCaixa([s * 5.6, 8.6, -2], [0.25, 1.5, 9])); }
      out.push(ocTubo([-7, 5.3, -2], [7, 5.3, -2], 0.35), ocCaixa([0, 7, -2], [5.8, 0.35, 9.2]), ocCaixa([0, 8.6, -11], [5.8, 1.5, 0.25]), ocCaixa([0, 9.6, 5.5], [4.8, 0.4, 1.3]));
      return out; },
    assentos: () => ({ condutor: { p: [0, 10, 5.5], olha: 1 }, carga: { p: [2.5, 7.4, -6], olha: -1 } }), atrelar: () => [0, 0, 15.5] },
  barcoRemo: { nome: "barco a remo", larg: 12, prof: 31, alt: 5, grupo: "veiculo", veiculo: "agua",
    partes: o => { const out = [], n = 9; for (let i = 0; i < n; i++) { const z = -15 + (i + 0.5) * 30 / n, t = (z + 15) / 30, w = 5.7 * Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.95)) + 0.4, h = 2.2 + 0.9 * Math.abs(t - 0.45);
        const pi = 0.8, tp = h + 2.3; out.push(ocCaixa([0, pi * 0.5, z], [w * 0.8, pi * 0.5, 30 / n / 2 + 0.05]), ocCaixa([w - 0.2, (pi + tp) / 2, z], [0.22, (tp - pi) / 2, 30 / n / 2 + 0.05]), ocCaixa([-(w - 0.2), (pi + tp) / 2, z], [0.22, (tp - pi) / 2, 30 / n / 2 + 0.05])); }
      out.push(ocCaixa([0, 2.4, -15.2], [3.6, 2.2, 0.25]), ocCaixa([0, 2.6, 15.2], [1.2, 2.4, 0.25]));
      out.push(ocCaixa([0, 3.2, 2], [5.3, 0.25, 1.1]), ocCaixa([0, 3.2, -9], [3.6, 0.25, 1.1]), ocCaixa([0, 3.2, 10], [3.6, 0.25, 1.0]));
      for (const s of [-1, 1]) out.push(ocTubo([s * 1.3, 4.6, -1.0], [s * 17, -0.6, 7.5], 0.17), ocCaixa([s * 16.4, -0.4, 7.2], [0.25, 0.8, 1.6], rotParaEixo([s * 1, -0.35, 0.5].map(v => v)) ), ocToro([s * 5.7, 4.7, 2.6], 0.35, 0.1, "y"));
      return out; },
    assentos: () => ({ remador: { p: [0, 3.45, 2], olha: -1, rema: true, chao: 0.8, pesFrente: 4.6 }, passageiro: { p: [0, 3.45, -9], olha: 1, chao: 0.8, pesFrente: 4 }, proa: { p: [0, 3.45, 10], olha: -1, chao: 0.8, pesFrente: 4 } }),
    pegas: () => ({ remoE: ocPega([1.3, 4.6, -1.0], [0, 1, 0], [1, 0, 0]), remoD: ocPega([-1.3, 4.6, -1.0], [0, 1, 0], [-1, 0, 0]) }) },
  canoa: { nome: "canoa", larg: 7.5, prof: 40, alt: 4.6, grupo: "veiculo", veiculo: "agua",
    partes: o => { const out = [], n = 12; for (let i = 0; i < n; i++) { const z = -20 + (i + 0.5) * 40 / n, t = (z + 20) / 40, w = 3.5 * Math.pow(Math.sin(Math.PI * t), 0.8) + 0.15, h = 1.8 + 1.6 * Math.pow(Math.abs(t - 0.5) * 2, 3);
        const pi = 0.6, tp = h * 1.3 + 0.6; out.push(ocCaixa([0, pi * 0.5, z], [w * 0.75, pi * 0.5, 40 / n / 2 + 0.05]), ocCaixa([w - 0.15, (pi + tp) / 2, z], [0.18, (tp - pi) / 2, 40 / n / 2 + 0.05]), ocCaixa([-(w - 0.15), (pi + tp) / 2, z], [0.18, (tp - pi) / 2, 40 / n / 2 + 0.05])); }
      out.push(ocCaixa([0, 2.3, 11], [2.8, 0.2, 0.9]), ocCaixa([0, 2.3, -11], [2.8, 0.2, 0.9])); return out; },
    assentos: () => ({ proa: { p: [0, 2.5, 11], olha: 1, rema: "pa", chao: 0.6, pesFrente: 5.5 }, popa: { p: [0, 2.5, -11], olha: 1, rema: "pa", chao: 0.6, pesFrente: 5.5 } }) },
  veleiro: { nome: "veleiro pequeno (mastro, retranca e vela)", larg: 15, prof: 44, alt: 56, grupo: "veiculo", veiculo: "agua",
    partes: o => { const out = [], n = 11; for (let i = 0; i < n; i++) { const z = -22 + (i + 0.5) * 44 / n, t = (z + 22) / 44, w = 7 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.85)), 0.7) + 0.3, h = 3 + 1.5 * t;
        const pi = 1.4, tp = h + 1.8; out.push(ocCaixa([0, pi * 0.5, z], [w * 0.8, pi * 0.5, 44 / n / 2 + 0.05]), ocCaixa([w - 0.2, (pi + tp) / 2, z], [0.22, (tp - pi) / 2, 44 / n / 2 + 0.05]), ocCaixa([-(w - 0.2), (pi + tp) / 2, z], [0.22, (tp - pi) / 2, 44 / n / 2 + 0.05])); }
      out.push(ocCaixa([0, -2.5, 0], [0.25, 3, 4]), ocTubo([0, 3, 6], [0, 56, 6], 0.4), ocTubo([0, 9, 6], [0, 9, -16], 0.3), ocCaixa([0, 2, -22.5], [0.25, 3.5, 1.2]), ocTubo([0, 5, -22], [0, 5.5, -16], 0.18));
      for (let k = 0; k < 16; k++) { const y0 = 9.5 + k * 2.85, f = 1 - (k + 0.5) / 16; out.push(ocCaixa([0, y0 + 1.42, 6 - 11 * f], [0.06, 1.45, 11 * f])); }
      out.push(ocCaixa([0, 4.4, -12], [5.6, 0.25, 1.2]), ocCaixa([0, 4.4, -2], [5.6, 0.25, 1.2])); return out; },
    assentos: () => ({ timoneiro: { p: [3.5, 4.65, -17], olha: 1, chao: 1.4, pesFrente: 4.4 }, tripulante: { p: [-4.2, 4.65, -2], olha: 1, chao: 1.4, pesFrente: 4.4 }, popa: { p: [4.2, 4.65, -12], olha: 1, chao: 1.4, pesFrente: 4.4 } }) },
  balsa: { nome: "balsa de toras", larg: 18, prof: 26, alt: 3, grupo: "veiculo", veiculo: "agua",
    partes: o => { const out = []; for (let i = 0; i < 8; i++) { const x = -7.9 + i * 2.25; out.push({ cil: true, c: [x, 1.1, (i % 2) * 0.6], r: 1.1, hh: 12.5 + (i % 3) * 0.5, R: rotParaEixo([0, 0, 1]) }); }
      for (const z of [-9, 0, 9]) out.push(ocTubo([-9, 2.3, z], [9, 2.3, z], 0.35)); out.push(ocTubo([5, 2.4, -11], [5, 26, -11], 0.25)); return out; },
    assentos: () => ({ "em-pe": { p: [0, 2.6, 0], olha: 1, pe: true }, borda: { p: [-6, 2.6, -6], olha: 1, beira: true } }) },
  balsaGrande: { nome: "balsa grande (de travessia: convés com grade, flutuadores, cabine e rampas)", larg: 70, prof: 120, alt: 26, grupo: "veiculo", veiculo: "agua", corPadrao: "#c8a165",
    partes: o => { const out = [];
      for (const x of [-27, -9, 9, 27]) out.push({ cil: true, c: [x, 2.2, 0], r: 4.2, hh: 52, R: rotParaEixo([0, 0, 1]) }, ocEsf([x, 2.2, 52], [4.2, 4.2, 5]), ocEsf([x, 2.2, -52], [4.2, 4.2, 5]));
      out.push(ocCaixa([0, 6.8, 0], [34, 0.7, 52]));
      for (let k = 0; k < 13; k++) out.push(Object.assign(ocCaixa([0, 7.55, -48 + k * 8], [33.6, 0.04, 0.12]), { cor: "ink" }));
      for (const s of [-1, 1]) { out.push(ocTubo([s * 33.5, 12.5, -50], [s * 33.5, 12.5, 50], 0.3), ocTubo([s * 33.5, 10, -50], [s * 33.5, 10, 50], 0.18)); for (let k = 0; k <= 10; k++) out.push(ocTubo([s * 33.5, 7.5, -50 + k * 10], [s * 33.5, 12.5, -50 + k * 10], 0.22));
        out.push(ocCaixa([0, 6.0, s * 60], [16, 0.5, 8], rotParaEixo([0, 1, s * 0.25]))); }
      out.push(...vcMover(vcCasca({ w: 9, y0: 7.2, yp: 7.5, yb: 15, yt: 25.6, z0: -8.5, z1: 8.5, t: 0.4, jan: [[-6, 6]], portas: [{ lado: -1, za: -7.5, zb: -2 }], frente: "janela", tras: "fechada", moldura: 2, teto: false }), 0, 22, -36), ocCaixa([22, 26.2, -36], [9.6, 0.6, 10.2]), { cil: true, c: [26, 30.4, -38], r: 1.1, hh: 4 });
      return out; },
    assentos: () => ({ "em-pe": { p: [0, 7.5, 0], olha: 1, pe: true }, proa: { p: [0, 7.5, 40], olha: 1, pe: true }, popa: { p: [-10, 7.5, -40], olha: -1, pe: true }, borda: { p: [-30, 7.5, 10], olha: 1, pe: true }, cabine: { p: [22, 7.5, -36], olha: 1, pe: true } }) },
  navio: { nome: "navio grande (galeão de três mastros, velas, castelo de popa, canhões)", larg: 62, prof: 280, alt: 270, grupo: "veiculo", veiculo: "agua", corPadrao: "#8b5a2b",
    partes: o => { const out = [], n = 18, Lh = 240;
      for (let i = 0; i < n; i++) { const z = -Lh / 2 + (i + 0.5) * Lh / n, t = (z + Lh / 2) / Lh, w = 30 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)), 0.55) + 1.5, fundo = 4 + 10 * Math.pow(Math.abs(t - 0.45) * 2, 2), topo = 34 + 10 * Math.pow(Math.max(0, 0.25 - t) * 4, 1.5) + 6 * Math.pow(Math.max(0, t - 0.85) * 6.6, 1.2);
        out.push(ocCaixa([0, (fundo + topo) / 2 - 2, z], [w * 0.82, (topo - fundo) / 2 + 2, Lh / n / 2 + 0.1]), ocCaixa([w - 0.8, topo + 2, z], [0.8, 2.5, Lh / n / 2 + 0.1]), ocCaixa([-(w - 0.8), topo + 2, z], [0.8, 2.5, Lh / n / 2 + 0.1]));
        if (i % 2 && t > 0.15 && t < 0.85) for (const s of [-1, 1]) out.push(Object.assign(ocCaixa([s * (w * 0.82 + 0.1), 26, z], [0.1, 1.6, 1.8]), { cor: "ink" }), ocTubo([s * (w * 0.82), 26, z], [s * (w * 0.82 + 3), 26.4, z], 0.6)); }
      out.push(ocCaixa([0, 2, 0], [1, 6, 100]), ocCaixa([0, 46, -100], [26, 10, 22]), ocCaixa([0, 56.6, -100], [27, 0.6, 23]), Object.assign(ocCaixa([0, 46, -122.1], [18, 4, 0.1]), { cor: "ink" }), ocCaixa([0, 42, 100], [20, 6, 16]));
      out.push(ocTubo([0, 40, 118], [0, 62, 160], 1.4), ocCaixa([0, 30, -121], [0.8, 14, 4]));
      const mastro = (z, H, vel) => { out.push(ocTubo([0, 30, z], [0, H, z], 2.0), { cil: true, c: [0, H * 0.62, z], r: 3.4, hh: 1 });
        for (let k = 0; k < 3; k++) { const y = 70 + k * (H - 80) / 2.4, wv = vel * (1 - k * 0.22); out.push(ocTubo([-wv, y + 30, z], [wv, y + 30, z], 0.8));
          for (let q = 0; q < 6; q++) out.push(Object.assign(ocCaixa([0, y + 30 - 4.6 - q * 4.4, z + 1.5 + Math.sin(Math.PI * (q + 0.5) / 6) * 4], [wv * (0.98 - q * 0.02), 2.25, 0.25]), { cor: "claro" })); } };
      mastro(55, 250, 44); mastro(-5, 270, 50); mastro(-70, 210, 36);
      for (const s of [-1, 1]) { out.push(ocTubo([s * 28, 40, 60], [0, 245, 55], 0.25), ocTubo([s * 30, 40, -10], [0, 265, -5], 0.25), ocTubo([s * 26, 48, -75], [0, 205, -70], 0.25)); }
      out.push(ocEsf([0, 64, -121.5], [1.6, 2.4, 1.6]), { cil: true, c: [0, 52, -84], r: 3.6, hh: 0.4, R: rotParaEixo([0, 0, 1]) });
      return out; },
    assentos: () => ({ "em-pe": { p: [0, 36.6, 10], olha: 1, pe: true }, leme: { p: [0, 57.2, -84], olha: 1, pe: true }, popa: { p: [10, 57.2, -110], olha: -1, pe: true }, proa: { p: [0, 48.2, 105], olha: 1, pe: true }, convés: { p: [-14, 36.6, -30], olha: 1, pe: true }, mastro: { p: [0, 36.6, -12], olha: 1, pe: true }, borda: { p: [24, 36.6, 30], olha: 1, pe: true } }) },
  locomotiva: { nome: "locomotiva a vapor (com tênder de carvão)", larg: 26, prof: 96, alt: 38, grupo: "veiculo", veiculo: "trilho", corPadrao: "#2c3e50",
    partes: o => vcLocomotiva(0), assentos: () => ({ maquinista: { p: [5, 9.6, -14], olha: 1, pe: true }, foguista: { p: [-5, 9.6, -16], olha: -1, pe: true } }) },
  vagao: { nome: "vagão de passageiros (janelas, bancos, porta no fim)", larg: 26, prof: 78, alt: 32, grupo: "veiculo", veiculo: "trilho", corPadrao: "#2e7d4f",
    partes: o => vcVagao(0, 74), assentos: () => vcAssentosVagao(0, 74) },
  trem: { nome: "trem (locomotiva + vagões; “vagoes N” de 0 a 6)", larg: 26, prof: 260, alt: 38, grupo: "veiculo", veiculo: "trilho", corPadrao: "#b03a2e",
    partes: o => vcTremPartes(o),
    assentos: o => { const n = Math.max(0, Math.min(6, Math.round((o && o.vagoes) ?? 2))), A = { maquinista: { p: [5, 9.6, -14], olha: 1, pe: true }, foguista: { p: [-5, 9.6, -16], olha: -1, pe: true } };
      for (let k = 0; k < n; k++) for (const [nm, a] of Object.entries(vcAssentosVagao(-48 - 4 - 37 - k * 82, 74))) A[(k ? "vagao" + (k + 1) + "-" : "") + nm] = a; return A; } },
  porta: { nome: "porta comum (batente, maçaneta; estilo almofadas)", larg: 9.4, prof: 1.2, alt: 19.2, grupo: "porta", porta: true, corPadrao: "#8b5e3c", partes: o => vcPorta(o, 8, 18.4, "almofadas") },
  portaPequena: { nome: "porta pequena (despensa, porão, toca)", larg: 7, prof: 1, alt: 14.6, grupo: "porta", porta: true, corPadrao: "#7a5230", partes: o => vcPorta(o, 6, 14, "tabuas") },
  portaDupla: { nome: "porta dupla (duas folhas)", larg: 15.6, prof: 1.2, alt: 20.4, grupo: "porta", porta: true, corPadrao: "#6f4a2e", partes: o => vcPorta(o, 14, 19.4, "almofadas", true) },
  portaVidro: { nome: "porta moderna de vidro", larg: 9.4, prof: 1, alt: 19.2, grupo: "porta", porta: true, corPadrao: "#5f6b78", partes: o => vcPorta(o, 8, 18.4, "vidro") },
  portaCorrer: { nome: "porta de correr (desliza para o lado)", larg: 17.4, prof: 1.4, alt: 19.2, grupo: "porta", porta: true, corPadrao: "#9a8a72",
    partes: o => vcBatente(8, 18.4, 0.6, 0.7).concat(vcMover(vcFolhaPorta(8, 18.4, 0.4, "almofadas", 1), 0, -4 + pAb(o) * 7.6, 0.9)) },
  portaCastelo: { nome: "porta de castelo (gigante, em arco, tábuas com ferragens e cravos)", larg: 36, prof: 8, alt: 44, grupo: "porta", porta: true, corPadrao: "#5b3a22", partes: o => vcPortaCastelo(o) },
  portaoGrade: { nome: "portão de grade (duas folhas de barras)", larg: 34, prof: 2, alt: 21, grupo: "porta", porta: true, corPadrao: "#3a3d42", partes: o => vcPortao(o, 32, 17, false) },
  portaoFerro: { nome: "portão de ferro (alto, lanças no topo, ornamentos)", larg: 38, prof: 2.4, alt: 26, grupo: "porta", porta: true, corPadrao: "#22262b", partes: o => vcPortao(o, 36, 21, true) },
  portaLevadica: { nome: "porta levadiça de castelo (grade que sobe)", larg: 42, prof: 10, alt: 44, grupo: "porta", porta: true, corPadrao: "#6d6a63", partes: o => vcLevadica(o) },
  portaoTita: { nome: "portão de titã (fantasia, ~34 m: duas folhas de ferro com faixas e rebites gigantes, pilares)", larg: 300, prof: 44, alt: 390, grupo: "porta", porta: true, corPadrao: "#3f3a36", partes: o => vcPortaoTita(o) },
  portaoCidadela: { nome: "portão de cidadela (fortaleza: duas torres com ameias, arco e portão de madeira com ferragens)", larg: 140, prof: 34, alt: 180, grupo: "porta", porta: true, corPadrao: "#7d7468", partes: o => vcPortaoCidadela(o) },
  portaDungeon: { nome: "porta de pedra de masmorra (laje com runas que sobe)", larg: 64, prof: 16, alt: 70, grupo: "porta", porta: true, corPadrao: "#5d5a55", partes: o => vcPortaDungeon(o) },
  portaTemplo: { nome: "portão de templo (colunas, frontão, folhas com relevos)", larg: 96, prof: 18, alt: 124, grupo: "porta", porta: true, corPadrao: "#b9a27a", partes: o => vcPortaTemplo(o) },
  portaRaiz: { nome: "porta de raízes (encantada/élfica: arco orgânico, folha de madeira viva)", larg: 54, prof: 12, alt: 66, grupo: "porta", porta: true, corPadrao: "#5b4a2f", partes: o => vcPortaRaiz(o) },
  portaCofre: { nome: "porta de cofre (redonda, aço, volante e trancas)", larg: 60, prof: 12, alt: 52, grupo: "porta", porta: true, corPadrao: "#7c8288", partes: o => vcPortaCofre(o) },
  alcapao: { nome: "alçapão (porta no chão)", larg: 10, prof: 10, alt: 1, grupo: "porta", porta: true, corPadrao: "#6b4a2b", partes: o => vcAlcapao(o) },
  carro: { nome: "carro (modelo sedan, hatch, suv, esportivo, caminhonete, taxi, policia)", larg: 17, prof: 47, alt: 16, grupo: "veiculo", veiculo: "terra", corPadrao: "#3b6ea5",
    partes: o => vcCarro(o), assentos: o => vcAssentosCarro(o) },
  onibus: { nome: "ônibus (12 m, janelas, portas, 2 fileiras de bancos, corredor)", larg: 22, prof: 105, alt: 28, grupo: "veiculo", veiculo: "terra", corPadrao: "#d9a520",
    partes: o => { const h = 52.5, jan = [], ink = b => Object.assign(b, { cor: "ink" }); for (let k = 0; k < 9; k++) jan.push([-h + 5 + k * 10.3, -h + 13.4 + k * 10.3]);
      const out = vcCasca({ w: 11, y0: 1.6, yp: 4.6, yb: 13.4, yt: 27, z0: -h, z1: h, t: 0.5, jan, portas: [{ lado: 1, za: h - 9.5, zb: h - 3 }, { lado: 1, za: -9, zb: -2 }], frente: "janela", tras: "fechada", moldura: 1.4 });
      out.push(ocCaixa([0, 27.6, 0], [10.6, 0.25, h - 0.6]), ocCaixa([0, 3.4, h + 0.3], [10.8, 2.2, 0.4]), ocCaixa([0, 3.4, -h - 0.3], [10.8, 2.2, 0.4]), ink(ocCaixa([0, 25.4, h + 0.08], [6, 1.2, 0.06])));
      for (const sx of [-1, 1]) { for (const z of [h - 14, -h + 16]) out.push({ cil: true, c: [sx * 9.4, 4.4, z], r: 4.4, hh: 1.6, R: rotParaEixo([1, 0, 0]) }, ink({ cil: true, c: [sx * 11.05, 4.4, z], r: 2.4, hh: 0.08, R: rotParaEixo([1, 0, 0]) })); out.push(ocEsf([sx * 8.4, 8, h + 0.4], [1.4, 1, 0.3])); }
      const A = COMPOSTOS.onibus.assentos(o); for (const [k, S] of Object.entries(A)) { if (S.pe) continue; out.push(...vcBanco(S.p[0], S.p[1], S.p[2], 1, k === "motorista" ? 2.6 : 2.4, 7, 4.6)); if (S.volante) out.push(ocToro(S.volante.c, 2.2, 0.25, "y"), ocTubo(S.volante.c, [S.volante.c[0], 6, S.volante.c[2] + 2], 0.3)); }
      out.push(ocCaixa([-5, 12.2, h - 3], [5.6, 1.2, 2.2]), ocTubo([0.6, 4.6, -h + 8], [0.6, 26.8, -h + 8], 0.18), ocTubo([0.6, 23.5, -h + 8], [0.6, 23.5, h - 12], 0.15));
      return out; },
    assentos: () => { const base = { olha: 1, dentro: true, chao: 4.6, teto: 26.8, pesFrente: 4.4, reclina: 6 }, A = { motorista: Object.assign({ p: [-6, 9.2, 43.5], dirige: true, volante: { c: [-6, 12.8, 47.4], r: 2.2 }, pesFrente: 6 }, base), corredor: { p: [0.6, 4.6, 10], olha: 1, pe: true, dentro: true } };
      for (let i = 0; i < 8; i++) for (const sx of [-1, 1]) A["banco" + (i * 2 + (sx > 0 ? 1 : 2))] = Object.assign({ p: [sx * 6.0, 9.0, 31 - i * 9.6] }, base); return A; } },
  aviao: { nome: "avião grande de passageiros (tipo Boeing: ~64 m, asas de ~60 m, 2 turbinas)", larg: 520, prof: 610, alt: 130, grupo: "veiculo", veiculo: "ar", corPadrao: "#dfe3ea",
    partes: o => vcAviaoGrande(o), assentos: () => { const b = { olha: 1, dentro: true, chao: 28, teto: 60, pesFrente: 4.6, reclina: 8 }, A = { piloto: Object.assign({ p: [-7, 32, 228], dirige: true, volante: { c: [-7, 35.4, 232.6], r: 1.4 } }, b), copiloto: Object.assign({ p: [7, 32, 228], dirige: true, volante: { c: [7, 35.4, 232.6], r: 1.4 } }, b), corredor: { p: [0, 28, 100], olha: 1, pe: true, dentro: true } };
      for (let i = 0; i < 12; i++) for (const sx of [-1, 1]) A["poltrona" + (i * 2 + (sx > 0 ? 1 : 2))] = Object.assign({ p: [sx * 13, 32, 186 - i * 30] }, b); return A; } },
  aviaoPequeno: { nome: "avião pequeno (tipo Cessna: 8 m, asa alta, hélice)", larg: 96, prof: 88, alt: 26, grupo: "veiculo", veiculo: "ar", corPadrao: "#e8e2d0",
    partes: o => vcAviaoPequeno(o), assentos: () => { const b = { olha: 1, dentro: true, chao: 5.2, teto: 16.2, pesFrente: 5.2, reclina: 10 }; return { piloto: Object.assign({ p: [-2.3, 7.8, 9.4], dirige: true, volante: { c: [-2.3, 11.2, 13.8], r: 1.1 } }, b), passageiro: Object.assign({ p: [2.3, 7.8, 9.4] }, b) }; } },
  helicoptero: { nome: "helicóptero (rotor principal e de cauda, esquis)", larg: 110, prof: 120, alt: 30, grupo: "veiculo", veiculo: "ar", corPadrao: "#3f5a3a",
    partes: o => vcHelicoptero(o), assentos: () => { const b = { olha: 1, dentro: true, chao: 4.6, teto: 17.6, pesFrente: 4.4, reclina: 8 }; return { piloto: Object.assign({ p: [-3, 7.6, 12], dirige: true, volante: { c: [-3, 9.4, 16.4], r: 0.8 } }, b), copiloto: Object.assign({ p: [3, 7.6, 12] }, b), traseiro: Object.assign({ p: [0, 7.6, 1] }, b), porta: { p: [7, 1.3, 4], olha: 1, pe: true } }; } },
  lancha: { nome: "lancha (casco em V, para-brisa, motor de popa)", larg: 22, prof: 62, alt: 10, grupo: "veiculo", veiculo: "agua", corPadrao: "#f2f2f2",
    partes: o => vcCasco(60, 22, 4.5, 12, [Object.assign(ocCaixa([0, 7.6, 5.4], [8, 2.2, 0.25], rotX(-0.6)), { cor: "ink" }), ocCaixa([0, 4.4, 14], [8.4, 2.2, 8]), ocCaixa([3.4, 6.6, 4.4], [2.2, 1.6, 1.2]), ...vcVolante(3.4, 9.2, 3.2, 1.1), ...vcBanco(3.4, 6.4, -1.4, 1, 2.3, 5, 2.2), ...vcBanco(-3.4, 6.4, -1.4, 1, 2.3, 5, 2.2), ...vcBanco(0, 6.4, -12, 1, 7, 5, 2.2), ocCaixa([0, 4, -31], [2, 4, 2])], 2.2),
    assentos: () => ({ piloto: { p: [3.4, 6.4, -1.4], olha: 1, chao: 2.2, pesFrente: 5, dirige: true, volante: { c: [3.4, 9.2, 3.2], r: 1.1 } }, passageiro: { p: [-3.4, 6.4, -1.4], olha: 1, chao: 2.2, pesFrente: 5 }, popa: { p: [0, 6.4, -12], olha: 1, chao: 2.2, pesFrente: 5 } }) },
  boteInflavel: { nome: "bote inflável (boias laterais, motor)", larg: 16, prof: 36, alt: 5, grupo: "veiculo", veiculo: "agua", corPadrao: "#d4632a",
    partes: o => { const out = [ocCaixa([0, 0.4, 0], [6, 0.3, 15])]; for (const sx of [-1, 1]) out.push({ cil: true, c: [sx * 6.5, 2, 0], r: 2, hh: 14, R: rotParaEixo([0, 0, 1]) }); out.push(ocEsf([0, 2, 14.5], [8.4, 2, 3]), { cil: true, c: [0, 2, -14], r: 2, hh: 7, R: rotParaEixo([1, 0, 0]) }, ocCaixa([0, 3.5, -17], [1.5, 3, 1.5])); return out; },
    assentos: () => ({ proa: { p: [4.8, 3.6, 8], olha: 1, beira: true, chao: 0.7, pesFrente: 3.6 }, popa: { p: [-4.8, 3.6, -9], olha: 1, beira: true, chao: 0.7, pesFrente: 3.6 } }) },
  barcoPesqueiro: { nome: "barco pesqueiro (cabine, mastro e redes)", larg: 32, prof: 112, alt: 40, grupo: "veiculo", veiculo: "agua", corPadrao: "#2f6d8a",
    partes: o => vcCasco(110, 32, 9, 14, [...vcCasca({ w: 9, y0: 9.4, yp: 10, yb: 16.6, yt: 28.6, z0: -5, z1: 15, t: 0.4, jan: [[-2, 13]], portas: [{ lado: 1, za: -4, zb: 1.5 }], frente: "janela", tras: "fechada", moldura: 1.6, teto: false }), ocCaixa([0, 29, 5], [10, 0.5, 11]), ...vcVolante(3, 17.4, 12.6, 1.4), ocTubo([0, 10, -20], [0, 40, -20], 0.6), ocTubo([0, 34, -20], [0, 12, -46], 0.3)], 9.4),
    assentos: () => ({ "em-pe": { p: [7, 9.4, -34], olha: -1, pe: true }, cabine: { p: [3, 10, 8], olha: 1, pe: true, dentro: true }, proa: { p: [0, 9.4, 40], olha: 1, pe: true } }) },
  submarino: { nome: "submarino (casco, torre, hélice; com “base -5” fica submerso)", larg: 40, prof: 310, alt: 52, grupo: "veiculo", veiculo: "agua", corPadrao: "#3a3f47",
    partes: o => [{ cil: true, c: [0, 16, 0], r: 16, hh: 130, R: rotParaEixo([0, 0, 1]) }, ocEsf([0, 16, 130], [16, 16, 24]), ocEsf([0, 16, -130], [16, 16, 30]), ocCaixa([0, 38, 40], [5, 10, 18]), ocCaixa([0, 42, 46], [16, 0.8, 4]), ocTubo([0, 48, 34], [0, 58, 34], 0.6), ocCaixa([0, 16, -160], [0.8, 14, 4]), ocCaixa([0, 16, -160], [14, 0.8, 4])],
    assentos: () => ({ torre: { p: [0, 48.6, 40], olha: 1, pe: true }, convés: { p: [6, 32.2, 80], olha: 1, pe: true } }) },
  trilho: { nome: "trilho (dois trilhos de aço sobre dormentes; “profundidade” = comprimento)", larg: 24, prof: 440, alt: 1.4, grupo: "veiculo", corPadrao: "#8a8378",
    partes: o => { if (o.caminho && o.caminho.length >= 2) return vcTrilhoPartes(o); const L = o.prof || 440, out = []; for (const s of [-1, 1]) out.push(ocCaixa([s * 6.3, 1.0, 0], [0.38, 0.45, L / 2]), ocCaixa([s * 6.3, 0.6, 0], [0.7, 0.1, L / 2]));
      const n = Math.max(2, Math.floor(L / 5.4)); for (let k = 0; k < n; k++) out.push(ocCaixa([0, 0.25, -L / 2 + 2.7 + k * (L - 5.4) / (n - 1)], [11, 0.25, 1.1])); return out; } }
};
Object.assign(COMPOSTOS, OBJ_MAO);
/* sinônimos em português para achar o objeto por nome */
const SINONIMOS_COMPOSTOS = { carruagem: "carruagem", coche: "carruagem", diligencia: "carruagem", "diligência": "carruagem", carroca: "carroca", "carroça": "carroca", charrete: "carroca", barco: "barcoRemo", "barco a remo": "barcoRemo", bote: "barcoRemo", canoa: "canoa", caiaque: "canoa", veleiro: "veleiro", "barco a vela": "veleiro", balsa: "balsa", jangada: "balsa", "balsa grande": "balsaGrande", ferry: "balsaGrande", navio: "navio", "galeao": "navio", "galeão": "navio", nau: "navio", trem: "trem", comboio: "trem", locomotiva: "locomotiva", "maria fumaca": "locomotiva", "maria-fumaça": "locomotiva", vagao: "vagao", "vagão": "vagao", trilho: "trilho", trilhos: "trilho", porta: "porta", "porta dupla": "portaDupla", "porta de vidro": "portaVidro", "porta de correr": "portaCorrer", "porta de castelo": "portaCastelo", portao: "portaoGrade", "portão": "portaoGrade", "portão de grade": "portaoGrade", "portao de ferro": "portaoFerro", "portão de ferro": "portaoFerro", grade: "portaoGrade", levadica: "portaLevadica", "levadiça": "portaLevadica", "porta levadiça": "portaLevadica", alcapao: "alcapao", "alçapão": "alcapao", "portão de titã": "portaoTita", "portao de tita": "portaoTita", "portão gigante": "portaoTita", "portao gigante": "portaoTita", "porta kaiju": "portaoTita", cidadela: "portaoCidadela", "portão de cidadela": "portaoCidadela", fortaleza: "portaoCidadela", masmorra: "portaDungeon", dungeon: "portaDungeon", "porta de pedra": "portaDungeon", templo: "portaTemplo", "portão de templo": "portaTemplo", "porta de raizes": "portaRaiz", "porta de raízes": "portaRaiz", "porta élfica": "portaRaiz", cofre: "portaCofre", "porta de cofre": "portaCofre", carro: "carro", automovel: "carro", "automóvel": "carro", sedan: "carro", suv: "carro", caminhonete: "carro", picape: "carro", taxi: "carro", "táxi": "carro", viatura: "carro", onibus: "onibus", "ônibus": "onibus", aviao: "aviao", "avião": "aviao", boeing: "aviao", jato: "aviao", "aviao pequeno": "aviaoPequeno", "avião pequeno": "aviaoPequeno", cessna: "aviaoPequeno", teco: "aviaoPequeno", helicoptero: "helicoptero", "helicóptero": "helicoptero", lancha: "lancha", "bote inflavel": "boteInflavel", "bote inflável": "boteInflavel", pesqueiro: "barcoPesqueiro", "barco pesqueiro": "barcoPesqueiro", submarino: "submarino", "linha de trem": "trilho", "ferrovia": "trilho", bola: "bola", "bola de praia": "esfera", rocha: "pedra", "pedregulho": "pedra", pneu: "pneu", roda: "pneu", saco: "saco", sacola: "saco", trouxa: "saco", "saco de dormir": "fardo", rolo: "fardo", tapete: "tapete",
  tambor: "tambor", "tonel": "tambor", chope: "barrilChope", keg: "barrilChope", botijao: "botijao", "botijão": "botijao", "cilindro de gas": "botijao", galao: "galao", "galão": "galao", "jerry can": "galao", balde: "balde",
  mala: "mala", maleta: "maleta", "caixa de ferramentas": "maleta", "mala de rodinhas": "malaRodinhas", mochila: "mochila", bigorna: "bigorna", caixote: "caixote", engradado: "caixote", palete: "palete", pallet: "palete", treno: "palete", "trenó": "palete",
  viga: "vigaI", "viga i": "vigaI", cano: "cano", tora: "cano", tronco: "cano", tubo: "cano", tabua: "tabua", "tábua": "tabua", prancha: "tabua", escada: "escada", trelica: "trelica", "treliça": "trelica",
  barra: "barraPesos", haltere: "barraPesos", "barra de pesos": "barraPesos", pa: "pa", "pá": "pa", marreta: "marreta", martelo: "marreta", alavanca: "alavanca", "pe de cabra": "alavanca", "pé de cabra": "alavanca",
  "carrinho de mao": "carrinhoDeMao", "carrinho de mão": "carrinhoDeMao", "carrinho de carga": "carrinhoCarga", diabo: "carrinhoCarga", "carrinho plataforma": "carrinhoPlataforma", cacamba: "cacamba", "caçamba": "cacamba",
  ancora: "ancora", "âncora": "ancora", "pilha de caixas": "pilhaCaixas", lanca: "lanca", "lança": "lanca", machado: "machado", escudo: "escudo", arco: "arco", cone: "cone", toro: "toro", anel: "toro", capsula: "capsula", "cápsula": "capsula", prisma: "prisma", esfera: "esfera", arvore: "arvore", "árvore": "arvore", palmeira: "palmeira", arbusto: "arbusto", poco: "poco", "poço": "poco", agua: "agua", "água": "agua", predio: "predio", "prédio": "predio", casa: "predio", rampa: "rampaDegraus", "escadaria": "rampaDegraus" };
Object.assign(SINONIMOS_COMPOSTOS, SINONIMOS_MAO);
function pegasDoObjeto(o) { const t = COMPOSTOS[o.tipo]; return t && t.pegas ? t.pegas(o) : {}; }
export { vcTrilhoAmostras, vcTrilhoEm, VC_TREM_CENTROS, VC_CARROS, COMPOSTOS, SINONIMOS_COMPOSTOS, pegasDoObjeto, rotParaEixo };
