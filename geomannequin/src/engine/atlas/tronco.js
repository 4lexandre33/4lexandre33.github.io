/* GeoMannequin — atlas muscular do tronco (frente, lados e costas).
   Cada músculo é uma forma sobre a pele em um de três referenciais:
     "f"  frente:  (|x|, y)            — peitoral, abdômen
     "b"  costas:  (|x|, y)            — trapézio, escápula, eretores
     "a"  ângulo:  (ângulo × R, y)     — lados: grande dorsal, oblíquos (o ângulo vem da frente, 0°, até as costas, 180°)
   Da mesma forma saem o volume (relevo da pele) e as linhas de borda, com o tipo de traço:
     "dobra"    sobreposição de músculos / borda forte (traço firme)
     "divisao"  divisão interna (traço médio)
     "fibra"    direção das fibras (traço fino, só com músculo definido) */
import { D, clamp, gauss, sstep } from "../matematica.js";
import { scapTri } from "../corpo.js";
import { muscleDefs } from "../musculos.js";
import { dentro, volume, caixa, suave } from "./util.js";

const R_ANG = F => F.chestW;                       // raio de referência para medir distâncias no referencial angular
const graus = (F, a, yy) => [a * D * R_ANG(F), F.yJ + yy];

/* forças dos relevos conforme o corpo: músculo aparece mais, gordura e feminino suavizam */
function forca(F) {
  const B = F.B, mu = B.mus, fat = B.fat, fem = B.fem;
  return { mu, def: clamp(mu * (1 - fat) * (1 - 0.55 * fem), 0, 1.4), fat, fem };
}

/* formas e linhas de um lado (s = +1 esquerda do manequim, -1 direita) */
function lado(p, F, s) {
  const yJ = F.yJ, W = F.W, T = scapTri(p, F, s), tp = T.tp, k = forca(F);
  const formas = [], linhas = [];
  const forma = (nome, ref, poly, h, e) => { formas.push({ nome, ref, poly, h, e, bx: caixa(poly, e * 2) }); };
  const linha = (nome, tipo, ref, pts, n = 6, min = 0) => linhas.push({ nome, tipo, ref, s, min, pts: suave(pts, n) });
  const Y = yy => yJ + yy;

  /* ---------- COSTAS ---------- */
  /* espinha da escápula: da raiz (borda medial) ao acrômio */
  const sp0 = T.sp0, sp1 = T.sp1, spAt = t => [sp0[0] + (sp1[0] - sp0[0]) * t, sp0[1] + (sp1[1] - sp0[1]) * t];
  const t12 = [0.03, Y(-2.62)];
  /* trapézio em losango: base do crânio → acrômio → espinha da escápula → ponta em T12 */
  const trap = [[0.0, Y(0.95)], [0.2, Y(0.9)], [0.36, Y(0.5)], [0.62, Y(0.22)], [W - 0.32, Y(0.07)], sp1, spAt(0.6), spAt(0.25), sp0, [sp0[0] - 0.06, sp0[1] - 0.45], [0.2, Y(-1.85)], t12];
  forma("trapezio", "b", trap, 0.012 + 0.02 * k.mu, 0.12);
  /* bloco escapular: infraespinhoso (em cima) e redondo maior (embaixo, indo para a axila) */
  const infra = [[-0.3, 0.12], [0.05, 0.26], [0.36, 0.34], [0.6, 0.2], [0.66, 0.0], [0.3, -0.2], [-0.08, -0.4], [-0.27, -0.3], [-0.31, -0.05]].map(q => tp(q[0], q[1]));
  const redondo = [[-0.08, -0.4], [0.3, -0.2], [0.66, 0.0], [0.92, 0.08], [0.95, -0.06], [0.65, -0.3], [0.25, -0.55], [-0.17, -0.64]].map(q => tp(q[0], q[1]));
  forma("infraespinhoso", "b", infra, 0.012 + 0.02 * k.def, 0.16);
  forma("redondo", "b", redondo, 0.015 + 0.025 * k.def, 0.14);
  /* eretores da espinha: duas colunas ao lado do sulco, mais fortes na lombar */
  const eret = [[0.075, Y(-2.1)], [0.26, Y(-2.45)], [0.36, Y(-3.4)], [0.33, Y(-4.4)], [0.2, Y(-4.95)], [0.075, Y(-4.95)]];
  forma("eretores", "b", eret, 0.02 + 0.04 * k.mu, 0.12);

  /* ---------- LADOS ---------- */
  /* grande dorsal: da parede de trás da axila desce em V até a cintura e a crista ilíaca */
  const dors = [[99, -0.95], [116, -0.78], [138, -1.25], [158, -1.9], [174, -2.75], [176, -3.9], [150, -4.25], [118, -4.05], [100, -3.4], [94, -2.3], [94, -1.45]].map(([a, yy]) => graus(F, a, yy));
  forma("grande_dorsal", "a", dors, 0.035 + 0.055 * k.mu * (1 - 0.6 * k.fem), 0.26);
  /* oblíquo externo: flanco acima da crista ilíaca */
  const obl = [[60, -2.1], [92, -2.25], [100, -3.4], [96, -4.3], [74, -4.4], [58, -3.3]].map(([a, yy]) => graus(F, a, yy));
  forma("obliquo", "a", obl, 0.025 + 0.04 * k.mu * (1 - 0.5 * k.fem) + 0.02 * k.fat, 0.18);

  /* ---------- LINHAS ---------- */
  const back = "b", ang = "a", fr = "f";
  const aY = (a, yy) => [a * D, Y(yy)];
  /* costas */
  linha("trapezio_borda_inferior", "dobra", back, [sp0, [sp0[0] - 0.05, sp0[1] - 0.45], [0.2, Y(-1.85)], t12], 8);
  linha("trapezio_superior", "divisao", back, [[0.17, Y(0.85)], [0.36, Y(0.45)], [0.62, Y(0.2)], [W - 0.34, Y(0.05)]], 7);
  linha("espinha_escapula", "dobra", back, [sp0, spAt(0.35), spAt(0.7), sp1], 6);
  linha("infraespinhoso_redondo", "divisao", back, [tp(-0.08, -0.4), tp(0.3, -0.2), tp(0.66, 0.0), tp(0.9, 0.08)], 7, 0.16);
  linha("redondo_borda", "dobra", back, [tp(-0.17, -0.64), tp(0.25, -0.55), tp(0.65, -0.3), tp(0.95, -0.06)], 8);
  linha("eretores", "divisao", back, [[0.27, Y(-2.6)], [0.35, Y(-3.4)], [0.33, Y(-4.3)], [0.22, Y(-4.85)]], 6, 0.16);
  /* lados */
  linha("dorsal_borda_lateral", "dobra", ang, [aY(98, -1.0), aY(95, -1.8), aY(96, -2.7), aY(101, -3.5), aY(110, -4.05)], 8);
  linha("dorsal_borda_inferior", "divisao", ang, [aY(118, -4.05), aY(148, -4.2), aY(172, -3.6)], 6);
  linha("dorsal_borda_superior", "divisao", ang, [aY(138, -1.25), aY(158, -1.9), aY(173, -2.7)], 6);
  /* frente: peitoral, abdômen, serrátil, oblíquo */
  const Mu = muscleDefs(F), pec = Mu.pec, c = F.chestW, ms = F.B.breast < 0.35;
  const fy = Q => Q.map(([x, yy]) => [x, Y(yy)]);
  if (ms) linha("peitoral_borda_inferior", "dobra", fr, fy([[0.2, -1.36], [0.45, -1.33], [0.72 * c, -1.18], [0.92 * c, -0.92], [0.98 * c, -0.62]]), 7);
  else {
    /* Sulco inframamário discreto, com início gradual junto ao esterno e
       término lateral antes da axila: não duplicar o peitoral masculino. */
    linha("sulco_inframamario", "divisao", fr, fy([[0.16,-1.50],[0.32,-1.57],[0.48,-1.61],[0.64*c,-1.52],[0.82*c,-1.33]]), 8, 0.15);
  }
  /* sulco deltopeitoral: do terço lateral da clavícula descendo entre o deltoide anterior e o peitoral até a axila */
  linha("sulco_deltopeitoral", "divisao", fr, fy([[W - 0.62, 0.03], [W - 0.66, -0.3], [0.93 * c, -0.62]]), 6, 0.06);
  if (ms){
    linha("peitoral_esterno", "divisao", fr, fy([[0.06, -0.18], [0.07, -0.7], [0.06, -1.3]]), 6, 0.08);
    linha("peitoral_clavicular", "fibra", fr, fy([[0.12, -0.36], [0.45, -0.42], [0.85 * c, -0.48]]), 6, 0.3);
  }
  const ab = Mu.abs, aw = Mu.aw;
  linha("linha_alba", "divisao", fr, fy([[0.0, -1.55], [0.0, -2.6], [0.0, F.yNav - yJ + 0.06]]), 8);
  ab.forEach((P, i) => { if (i < 3) linha("abdomen_intersecao_" + (i + 1), "divisao", fr, fy([[0.035, P[3][1] + 0.02], [P[3][0] * 0.55, P[3][1] + 0.0], [P[3][0] + 0.01, P[3][1] - 0.03]]), 5, 0.16); });
  linha("linha_semilunar", "divisao", fr, fy([[aw + 0.01, -1.78], [aw + 0.04, -2.6], [aw + 0.03, F.yNav - yJ], [aw - 0.02, F.yHip - yJ + 0.3], [0.1, F.yCr - yJ + 0.7]]), 7, 0.16);
  linha("arco_costal", "divisao", fr, fy([[0.06, -1.55], [0.35, -1.95], [0.62, -2.35], [0.86 * c, -2.55]]), 7);
  for (let i = 0; i < 4; i++) { const a0 = 62 + 6 * i, yy = -1.25 - 0.3 * i; linha("serratil_" + (i + 1), "divisao", ang, [aY(a0 + 14, yy + 0.06), aY(a0 + 4, yy - 0.04), aY(a0 - 4, yy - 0.14)], 4, 0.2); }
  linha("obliquo_frente", "divisao", ang, [aY(56, -2.25), aY(54, -3.2), aY(60, -4.1), aY(78, -4.45)], 6, 0.16);
  /* fibras (camada opcional): direção das fibras no trapézio, grande dorsal e peitoral */
  for (let i = 1; i <= 5; i++) { const t = i / 6; linha("fibra_trapezio_" + i, "fibra", back, [[0.04, Y(0.6 - 3.0 * t * t)], [0.3 + 0.15 * t, Y(0.35 - 1.6 * t * t)], spAt(1 - 0.85 * t)], 4, 0.3); }
  for (let i = 1; i <= 5; i++) { const t = i / 6; linha("fibra_dorsal_" + i, "fibra", ang, [aY(100 + 4 * t, -1.1 - 0.4 * t), aY(125 + 25 * t, -1.9 - 1.2 * t), aY(150 + 22 * t, -2.6 - 1.4 * t)], 4, 0.3); }
  if(ms)for (let i = 1; i <= 5; i++) { const t = i / 6; linha("fibra_peitoral_" + i, "fibra", fr, fy([[0.09, -0.3 - 0.95 * t], [0.5, -0.5 - 0.55 * t], [0.88 * c, -0.62 - 0.12 * t]]), 4, 0.3); }
  /* pescoço: esternocleidomastoideo em V até a fúrcula */
  linha("esternocleidomastoideo", "divisao", ang, [aY(108, 0.62), aY(70, 0.4), aY(36, 0.2), aY(12, 0.03)], 7);
  return { formas, linhas };
}

export function atlasTronco(p, F) {
  if (F._atlas) return F._atlas;
  const L = lado(p, F, 1), R = lado(p, F, -1);
  F._atlas = { 1: L, "-1": R };
  return F._atlas;
}

/* relevo da pele (somado ao perfil do tronco) */
export function relevoTronco(x, y, th, p, F) {
  const at = atlasTronco(p, F), s = x >= 0 ? 1 : -1, ax = Math.abs(x), cs = Math.cos(th);
  const a = Math.abs(Math.atan2(Math.sin(th), cs)), am = a * R_ANG(F);
  const cf = sstep((cs - 0.02) / 0.25), cb = sstep((-cs - 0.02) / 0.25);
  let dz = 0;
  for (const f of at[s].formas) {
    let u, w;
    if (f.ref === "f") { if (cf <= 0) continue; u = ax; w = cf; }
    else if (f.ref === "b") { if (cb <= 0) continue; u = ax; w = cb; }
    else { u = am; w = 1; }
    const b = f.bx; if (u < b[0] || u > b[1] || y < b[2] || y > b[3]) continue;
    const d = dentro(u, y, f.poly);
    if (d > 0) dz += w * f.h * volume(d, f.e);
  }
  /* sulco da coluna entre os eretores e pequena sombra sob a borda do grande dorsal */
  dz -= cb * 0.012 * gauss(ax, 0, 0.06) * sstep((F.yJ - 2.2 - y) / 0.4) * sstep((y - (F.yHip - 0.2)) / 0.3);
  return dz;
}

/* converte um ponto de linha do atlas para (y, ângulo) sobre a pele */
export function linhaParaPele(l, q, bustTh, p, F) {
  if (l.ref === "a") return [q[1], l.s * q[0]];
  const y = q[1];
  return [y, bustTh(y, l.s * q[0], l.ref === "f", p, F)];
}
