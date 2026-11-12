/* GeoMannequin — Cabeça V5 (anime/mangá): mesma geometria da V3 (crânio, mandíbula,
   pescoço, orelhas); muda o desenho do rosto:
   · olhos grandes (íris alta, pupila, dois brilhos, linha de cílios grossa, pálpebras que
     mudam de forma com a emoção: ^^ alegria, olhar duro na raiva, canto caído na tristeza,
     pupila pequena na surpresa e no medo);
   · boca pequena em repouso e grande ao abrir ou sorrir, com cavidade anatômica: dentes de
     cima presos à maxila, de baixo à mandíbula, língua no assoalho, altura limitada pelo queixo;
   · nariz reduzido à ponta; sobrancelhas finas e expressivas.
   Parâmetros: v5Olhos (tamanho), v5Boca (quanto a boca cresce), v5Exagero (intensidade). */
import { clamp, lerp } from "../matematica.js";

const D = Math.PI / 180;
/* tudo que a função precisa do desenhador vem em ctx:
   {p, sh, hp(y,θ,off), ringAt(y,p,sh), curve(k,pts), fillP(pts,cor,op), arr(fn,a,b,n), pal, eyeY, mouthY} */
function emo(p) {
  const X = clamp(p.v5Exagero ?? 1, 0, 1.6);
  return {
    X, k: clamp(p.v5Olhos ?? 1.75, 1, 2.4), kb: clamp(p.v5Boca ?? 1.7, 1, 2.4),
    sm: clamp(p.smile || 0, -1, 1), jo: clamp(p.jawOpen || 0, 0, 1), lid: clamp(p.eyeLid || 0, 0, 1),
    bU: clamp(p.browUp || 0, -1, 1), bI: clamp(p.browIn || 0, -1, 1)
  };
}

/* ---------- olhos ---------- */
/* a superfície da V3 é mais saliente que o modelo de anéis que posiciona os traços: levanta o desenho do rosto */
const LEVANTA = 0.04;
/* geometria dos olhos da V5 (usada pelo desenho e pelos 70 pontos do OpenPose do rosto) */
function geoOlhoAnime(p, sh, ringAt, eyeY) {
  const e = emo(p), X = e.X, k = e.k, ey0 = eyeY - 0.025, r0 = ringAt(ey0, p, sh)[0];
  const w = Math.min(0.3 * (p.eyeSize || 1.25) * Math.pow(k, 0.5), 0.62 * r0);
  const surpresa = Math.max(0, e.bU) * X, raiva = Math.max(0, e.bI) * X, tristeza = Math.max(0, -e.bI) * X, alegria = Math.max(0, e.sm) * X;
  /* pálpebra: abre com a surpresa, fecha com eyeLid; a de baixo sobe com o sorriso (bochecha) */
  const abre = (p.eyeOpen || 1) * (1 + 0.28 * surpresa) * (1 - 0.95 * e.lid);
  const hu = 0.088 * (p.eyeSize || 1.25) * k * abre, hl0 = 0.05 * (p.eyeSize || 1.25) * k * (1 - 0.7 * e.lid);
  const hl = hl0 * (1 - 0.55 * clamp(alegria - 0.2, 0, 1));
  const xc = clamp(r0 * Math.sin((p.eyeGap || 22) * D) + 0.1 * (k - 1), w / 2 + 0.06, r0 * 0.7);
  /* q: 0 = canto de dentro, 1 = de fora */
  const up = q => {
    q = clamp(q, 0, 1);
    let y = hu * Math.sin(Math.PI * Math.pow(q, 0.62)) + 0.02 * k * (q - 0.4);
    y -= raiva * 0.75 * hu * Math.pow(1 - q, 1.2);            /* raiva: canto de dentro desce (olhar duro) */
    y -= tristeza * 0.45 * hu * Math.pow(q, 1.6);             /* tristeza: canto de fora cai */
    return y;
  };
  const lo = q => { q = clamp(q, 0, 1); return -hl * Math.sin(Math.PI * Math.pow(q, 1.1)) + 0.012 * k * (q - 0.5) + 0.35 * hl0 * clamp(alegria - 0.2, 0, 1) * Math.sin(Math.PI * q); };
  const gY = clamp(p.eyeYaw || 0, -1, 1), gP = clamp(p.eyePitch || 0, -1, 1);
  return { e, X, k, ey0, r0, w, hu, hl0, hl, xc, up, lo, abre, surpresa, raiva, tristeza, alegria, gx: s => s * gY * 0.22 * w, gy: gP * 0.25 * hu - 0.12 * hu,
    fechado: e.lid > 0.86 || abre < 0.12 };
}
function olhosAnime(ctx) {
  const { p, sh, ringAt, curve, fillP, arr, pal, eyeY } = ctx, hp = (y, th, off) => ctx.hp(y, th, (off || 0) + LEVANTA);
  const G = geoOlhoAnime(p, sh, ringAt, eyeY), { e, X, k, ey0, w, hu, hl0, hl, xc, up, lo, abre, surpresa, alegria } = G;
  const Xq = q => (q - 0.5) * w;
  /* corar (vergonha, riso): mancha rosada e riscos diagonais na bochecha; lágrimas: poça na pálpebra
     de baixo e dois filetes descendo pelo rosto */
  const corar = clamp(Math.max(p.blush || 0, 0.35 * clamp(alegria - 0.6, 0, 1)) * (0.6 + 0.4 * X), 0, 1), choro = clamp((p.tears || 0) * (0.6 + 0.4 * X), 0, 1);
  const bochechaELagrimas = (E, Xq, lo, k, s) => {
    if (corar > 0.05) {
      const cy = lo(0.5) - 0.11 * k, cx = Xq(0.5);
      fillP(arr(a => E(cx + 0.13 * k * Math.cos(a), cy + 0.05 * k * Math.sin(a), 0.01), 0, 2 * Math.PI, 20), pal.coral, 0.35 * corar);
      const n = corar > 0.6 ? 4 : 3;
      for (let i = 0; i < n; i++) curve("fibra", arr(u => E(cx - 0.08 * k + 0.055 * k * i + 0.03 * k * u, cy + 0.03 * k - 0.05 * k * u, 0.013), 0, 1, 3));
    }
    if (choro > 0.05) {
      const y0 = lo(0.75);
      fillP(arr(q => E(Xq(q), lo(q) + 0.012, 0.016), 0.15, 0.95, 16).concat(arr(q => E(Xq(q), lo(q) - 0.02 * choro, 0.016), 0.95, 0.15, 16)), pal.cobalt, 0.55 * choro);
      [0.62, 0.84].forEach((q0, i) => {
        const L = (0.32 + 0.12 * i) * choro;
        const fio = arr(u => E(Xq(q0) + 0.012 * Math.sin(5 * u + i), y0 - L * u, 0.016), 0, 1, 12), esp = 0.012 + 0.008 * i;
        fillP(fio.concat(arr(u => E(Xq(q0) + esp + 0.012 * Math.sin(5 * u + i), y0 - L * u, 0.016), 1, 0, 12)), pal.cobalt, 0.6 * choro);
      });
    }
  };
  [-1, 1].forEach(s => {
    const E = (ex, ey, off) => { const y = ey0 + ey; return hp(y, s * Math.asin(clamp((xc + ex) / ringAt(y, p, sh)[0], 0, 0.99)), off || 0.012); };
    /* olho fechado: ^^ (alegria) ou traço caído (sono, tristeza) */
    if (G.fechado) {
      const feliz = alegria > 0.15;
      const arco = q => (feliz ? 1 : -0.5) * 0.06 * k * Math.sin(Math.PI * q) - (feliz ? 0 : 0.01);
      const pts = arr(q => E(Xq(q), arco(q), 0.012), -0.02, 1.02, 26);
      curve("eyeU", pts); curve("eyeU", arr(q => E(Xq(q), arco(q) + 0.006, 0.013), 0.1, 0.95, 20));
      if (!feliz) curve("feat", arr(q => E(Xq(1) + 0.02 * q, -0.012 - 0.02 * q, 0.012), 0, 1, 4));
      bochechaELagrimas(E, Xq, q => arco(q) - 0.02, k, s);
      return;
    }
    /* cavidade da órbita: sombra entre a pálpebra de cima e a sobrancelha, dá recuo ao globo */
    fillP(arr(q => E(Xq(q), up(q) + 0.016 * k, 0.009), -0.1, 1.1, 20)
      .concat(arr(q => E(Xq(q), up(q) + 0.05 * k, 0.009), 1.1, -0.1, 20)), pal.shade1, 0.42);
    /* esclera */
    fillP(arr(q => E(Xq(q), up(q), 0.01), 0, 1, 30).concat(arr(q => E(Xq(q), lo(q), 0.01), 1, 0, 30)), pal.fill);
    /* esclera mais escura nas bordas (globo curvo): cantos de dentro e de fora */
    const cornerShade = (q0, q1) => fillP(arr(q => E(Xq(q), up(q), 0.0105), q0, q1, 10)
      .concat(arr(q => E(Xq(q), lo(q), 0.0105), q1, q0, 10)), pal.shade1, 0.4);
    cornerShade(0, 0.13); cornerShade(0.87, 1);
    /* sombra da pálpebra de cima sobre o branco do olho */
    fillP(arr(q => E(Xq(q), up(q), 0.0112), 0.04, 0.96, 24)
      .concat(arr(q => E(Xq(q), up(q) - 0.03 * k, 0.0112), 0.96, 0.04, 24)), pal.shade1, 0.5);
    /* íris alta e pupila: o olhar desloca; surpresa/medo encolhem a pupila */
    const rix = 0.36 * w, riy = Math.min(0.62 * (hu + hl0), 0.95 * hu + hl);
    const gx = G.gx(s), gy = G.gy;
    const dentro = (ex, ey) => { const q = clamp(ex / w + 0.5, 0, 1); return clamp(ey, lo(q) * 0.97, up(q) * 0.97); };
    const irisPts = (rx, ry, off) => arr(a => { const ex = gx + rx * Math.cos(a), ey = gy + ry * Math.sin(a); return E(ex, dentro(ex, ey), off); }, 0, 2 * Math.PI, 40);
    /* anel externo escuro (limbo) por baixo, íris um pouco menor por cima */
    fillP(irisPts(rix, riy, 0.0135), pal.ink, 0.9);
    fillP(irisPts(rix * 0.84, riy * 0.84, 0.014), pal.shade3, 0.95);
    /* faixa clara embaixo: luz refletida de baixo na parte inferior da íris */
    fillP(arr(a => { const ex = gx + rix * 0.72 * Math.cos(a), ey = gy + riy * 0.72 * Math.sin(a); return E(ex, dentro(ex, ey), 0.0142); }, Math.PI * 1.08, Math.PI * 1.92, 16), pal.shade1, 0.5);
    /* sombra da pálpebra de cima sobre a íris (metade superior mais escura) */
    fillP(arr(a => { const ex = gx + rix * Math.cos(a), ey = gy + riy * 0.15 + riy * 0.85 * Math.abs(Math.sin(a)); return E(ex, dentro(ex, ey), 0.0145); }, 0, Math.PI, 20)
      .concat(arr(q => E(gx + rix * (1 - 2 * q), dentro(gx + rix * (1 - 2 * q), gy + riy * 0.15), 0.0145), 0, 1, 8)), pal.ink, 0.35);
    const rp = (0.5 - 0.28 * clamp(surpresa + 0.6 * Math.max(0, e.bU) * Math.max(0, -e.bI), 0, 1)) * rix;
    fillP(arr(a => { const ex = gx + rp * Math.cos(a), ey = gy + 1.25 * rp * Math.sin(a); return E(ex, dentro(ex, ey), 0.015); }, 0, 2 * Math.PI, 20), pal.ink);
    /* brilhos: um grande em cima, um pequeno embaixo (do lado da luz) */
    const bx = gx + 0.32 * rix, by = gy + 0.42 * riy;
    fillP(arr(a => E(bx + 0.24 * rix * Math.cos(a), dentro(bx, by + 0.24 * rix * Math.sin(a)), 0.016), 0, 2 * Math.PI, 14), "#fff");
    fillP(arr(a => E(gx - 0.3 * rix + 0.1 * rix * Math.cos(a), dentro(gx - 0.3 * rix, gy - 0.45 * riy + 0.1 * rix * Math.sin(a)), 0.016), 0, 2 * Math.PI, 10), "#fff", 0.9);
    /* linha de cílios de cima: faixa grossa, mais grossa e com ponta no canto de fora */
    const esp = q => (0.011 + 0.022 * Math.pow(clamp(q, 0, 1), 1.3)) * k;
    fillP(arr(q => E(Xq(q), up(q), 0.017), -0.04, 1.06, 30).concat(arr(q => E(Xq(q) + 0.018 * k * Math.max(0, q - 0.85) / 0.15, up(q) + esp(q), 0.017), 1.1, -0.04, 30)), pal.ink);
    /* pálpebra de baixo: traço curto na metade de fora; prega da pálpebra acima */
    curve("feat", arr(q => E(Xq(q), lo(q), 0.013), 0.45, 1, 14));
    curve("fibra", arr(q => E(Xq(q), up(q) + esp(q) + 0.03 * k, 0.012), 0.2, 0.9, 16));
    /* prega dupla: segunda dobra, mais alta e mais curta */
    curve("fibra", arr(q => E(Xq(q), up(q) + esp(q) + 0.058 * k, 0.012), 0.3, 0.82, 14));
    bochechaELagrimas(E, Xq, lo, k, s);
  });
}

/* ---------- sobrancelhas, nariz e boca ---------- */
function bocaAnime(p, sh, ringAt) {
  const e = emo(p), X = e.X, my = sh.mouthY;
  const a = clamp(e.jo * (0.85 + 0.3 * X), 0, 1.25), ss = Math.max(0, e.sm) * X, br = Math.max(0, -e.sm) * X;
  const meia = ringAt(my, p, sh)[0];
  const largura = Math.min(0.1 + 0.105 * e.kb * (0.62 * a + 0.55 * ss + 0.15 * br), 0.72 * meia);
  /* altura da cavidade: a mandíbula abre, o queixo limita (lábio inferior e mento continuam) */
  const altura = Math.min(0.03 + 0.15 * e.kb * a, (my - sh.chinY) * 0.72);
  const c = x => Math.sqrt(Math.max(0, 1 - Math.pow(clamp(x / largura, -1, 1), 2)));
  const r = x => Math.abs(clamp(x / largura, -1, 1));
  /* borda de cima quase reta (cantos sobem no sorriso, descem na raiva/tristeza) */
  const cima = x => my + 0.045 * ss * Math.pow(r(x), 2) - 0.04 * br * Math.pow(r(x), 1.5) + 0.012 * br * c(x);
  /* borda de baixo: "D" cheio no sorriso, mais rasa e reta na raiva */
  const baixo = x => cima(x) - altura * Math.pow(c(x), ss > 0.2 ? 0.75 : br > 0.2 ? 1.6 : 1.05);
  const denteSup = x => cima(x) - Math.min(0.045, altura * 0.24) * c(x);
  const denteInf = x => baixo(x) + Math.min(0.03, altura * 0.16) * c(x);
  const linguaSup = x => baixo(x) + altura * (0.18 + 0.2 * c(x)) * c(x);
  return { aberto: a, largura, altura, cima, baixo, denteSup, denteInf, linguaSup, c, my, ss, br };
}
function feicoesAnime(ctx) {
  const { p, sh, ringAt, curve, fillP, poly, arr, pal, eyeY } = ctx, e = emo(p), X = e.X, k = e.k, t = sh.t, hp = (y, th, off) => ctx.hp(y, th, (off || 0) + LEVANTA);
  const surfX = (y, x) => Math.asin(clamp(x / ringAt(y, p, sh)[0], -0.99, 0.99));
  const H = (x, y, off = 0.015) => hp(y, surfX(y, x), off);
  /* sobrancelhas: finas e longas, sobem na surpresa, ponta de dentro desce na raiva e sobe na tristeza */
  [-1, 1].forEach(s => {
    const bU = e.bU * X, bI = e.bI * X;
    const pt = (u, dy) => {
      const y = eyeY + 0.13 + 0.07 * (k - 1) + 0.035 * Math.sin(Math.PI * Math.pow(u, 0.7)) - 0.02 * u + dy + 0.07 * bU - 0.13 * Math.max(0, bI) * Math.pow(1 - u, 1.3) + 0.075 * Math.max(0, -bI) * Math.pow(1 - u, 1.6);
      return hp(y, s * (8 + 40 * u) * D, 0.012);
    };
    const up = [], lo = [];
    for (let i = 0; i <= 22; i++) { const u = i / 22, th = 0.026 * (1 - 0.75 * u) + 0.004; up.push(pt(u, th / 2)); lo.push(pt(u, -th / 2)); }
    fillP(up.concat(lo.reverse()), pal.ink);
  });
  /* nariz: só a ponta (sombra pequena de um lado) */
  { const yt = -0.8 * t; fillP(arr(a => H(-0.02 + 0.03 * Math.cos(a), yt + 0.012 * Math.sin(a), 0.01), 0, 2 * Math.PI, 10), pal.shade2, 0.9);
    curve("feat", arr(u => H(0.012 - 0.03 * u, yt - 0.005 - 0.015 * Math.sin(Math.PI * u), 0.012), 0, 1, 6)); }
  /* boca */
  const B = bocaAnime(p, sh, ringAt), w = B.largura;
  if (B.aberto < 0.04) {
    /* fechada: traço pequeno; sorriso curva para cima, tristeza para baixo; covinhas no sorriso grande */
    const y = x => B.my + 0.03 * (B.ss - B.br) * Math.pow(Math.abs(x / w), 2) - 0.008 * (B.ss - B.br) * (1 - Math.pow(x / w, 2));
    curve("feat", arr(x => H(x, y(x), 0.02), -w, w, 24));
    if (B.ss > 0.5) [-1, 1].forEach(s => curve("fibra", arr(u => H(s * (w + 0.012 * u), y(s * w) + 0.01 - 0.02 * u, 0.018), 0, 1, 4)));
    /* leve volume do lábio de baixo e comissuras, também com a boca fechada */
    fillP(arr(x => H(x, y(x) - 0.006, 0.019), -w * 0.78, w * 0.78, 16).concat(arr(x => H(x, y(x) - 0.028, 0.019), w * 0.78, -w * 0.78, 16)), pal.coral, 0.22);
    [-1, 1].forEach(s => fillP(arr(a => H(s * (w + 0.004) + 0.008 * Math.cos(a), y(s * w) + 0.006 * Math.sin(a), 0.021), 0, 2 * Math.PI, 8), pal.shade2, 0.45));
    curve("fibra", arr(x => H(x, B.my - 0.05, 0.016), -w * 0.35, w * 0.35, 8));
    return;
  }
  const cav = arr(x => H(x, B.cima(x), 0.03), -w, w, 40).concat(arr(x => H(x, B.baixo(x), 0.03), w, -w, 40));
  fillP(cav, pal.ink, 0.97);
  /* fundo da boca mais escuro: o vão entre as arcadas, mais estreito que os dentes */
  const bw = w * 0.62, fundo = x => B.aberto > 0.6 ? B.denteInf(x) : B.baixo(x);
  /* oval: as pontas fecham no dente de cima, sem bordas laterais retas */
  fillP(arr(x => H(x, B.denteSup(x), 0.029), -bw, bw, 20).concat(arr(x => {
    const t = Math.sqrt(Math.max(0, 1 - (x / bw) ** 2)); return H(x, B.denteSup(x) + (fundo(x) - B.denteSup(x)) * 0.85 * t, 0.029); }, bw, -bw, 20)), pal.ink);
  /* língua no assoalho, com sulco central e brilho de volume */
  if (B.aberto > 0.18) {
    const tw = w * 0.62;
    fillP(arr(x => H(x, B.linguaSup(x), 0.034), -tw, tw, 24).concat(arr(x => H(x, B.baixo(x) + 0.004, 0.034), tw, -tw, 24)), pal.coral, 0.85);
    fillP(arr(x => H(x, B.linguaSup(x) - 0.004, 0.0345), -tw * 0.5, tw * 0.5, 12).concat(arr(x => H(x, B.linguaSup(x) - 0.016, 0.0345), tw * 0.5, -tw * 0.5, 12)), "#F2B8B8", 0.45);
    curve("fibra", arr(u => H(0.004 * Math.sin(3 * u), B.linguaSup(0) - 0.004 - (B.linguaSup(0) - B.baixo(0)) * 0.7 * u, 0.036), 0, 1, 6));
  }
  /* dentes de cima (maxila) sempre que abre; de baixo (mandíbula) com a boca bem aberta ou no grito */
  const dw = w * 0.82;
  fillP(arr(x => H(x, B.cima(x) - 0.002, 0.036), -dw, dw, 30).concat(arr(x => H(x, B.denteSup(x), 0.036), dw, -dw, 30)), "#F4EFE6", 0.98);
  /* sombra do lábio de cima sobre os dentes */
  fillP(arr(x => H(x, B.cima(x) - 0.002, 0.037), -dw * 0.96, dw * 0.96, 24).concat(arr(x => H(x, B.cima(x) - 0.002 - 0.45 * (B.cima(x) - B.denteSup(x)), 0.037), dw * 0.96, -dw * 0.96, 24)), pal.shade2, 0.45);
  if (B.aberto > 0.6) { const di = w * 0.6; fillP(arr(x => H(x, B.denteInf(x), 0.036), -di, di, 24).concat(arr(x => H(x, B.baixo(x) + 0.002, 0.036), di, -di, 24)), "#ECE4D8", 0.95); }
  curve("feat", cav);
  /* comissuras: dobra pequena e escura em cada canto */
  [-1, 1].forEach(s => fillP(arr(a => H(s * (w + 0.004) + 0.009 * Math.cos(a), B.cima(s * w) - 0.004 + 0.007 * Math.sin(a), 0.033), 0, 2 * Math.PI, 8), pal.shade2, 0.5));
  /* leve preenchimento do lábio de baixo e sombra sob a boca */
  fillP(arr(x => H(x, B.baixo(x) - 0.004, 0.02), -w * 0.78, w * 0.78, 20).concat(arr(x => H(x, B.baixo(x) - 0.03, 0.02), w * 0.78, -w * 0.78, 20)), pal.coral, 0.22);
  curve("fibra", arr(x => H(x, B.baixo(0) - 0.045, 0.016), -w * 0.35, w * 0.35, 8));
}

export { olhosAnime, feicoesAnime, bocaAnime, geoOlhoAnime, LEVANTA as LEVANTA_V5 };
