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
import { ladoRosto, rostoGeral, aoLongo } from "../rosto-au.js";

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
/* s = +1 olho esquerdo do manequim, −1 direito: pálpebras, bochecha e canto da boca de cada lado */
function geoOlhoAnime(p, sh, ringAt, eyeY, s = 1) {
  const R = ladoRosto(p, s), aperto = clamp(R.lidLo + 0.55 * R.cheek, 0, 1);
  const e = emo(p), X = e.X, k = e.k, ey0 = eyeY - 0.025, r0 = ringAt(ey0, p, sh)[0];
  const w = Math.min(0.3 * (p.eyeSize || 1.25) * Math.pow(k, 0.5), 0.62 * r0);
  const surpresa = Math.max(0, e.bU) * X, raiva = Math.max(0, e.bI) * X, tristeza = Math.max(0, -e.bI) * X, alegria = Math.max(0, R.smile) * X;
  /* pálpebra: abre com a surpresa, fecha com eyeLid; a de baixo sobe com o sorriso (bochecha) */
  const abre = (p.eyeOpen || 1) * (1 + 0.28 * surpresa) * (1 - 0.95 * R.lid);
  const hu = 0.088 * (p.eyeSize || 1.25) * k * abre, hl0 = 0.05 * (p.eyeSize || 1.25) * k * (1 - 0.7 * R.lid);
  const hl = hl0 * (1 - 0.55 * clamp(alegria - 0.2, 0, 1)) * (1 - 0.45 * aperto);
  const xc = clamp(r0 * Math.sin((p.eyeGap || 22) * D) + 0.1 * (k - 1), w / 2 + 0.06, r0 * 0.7);
  /* q: 0 = canto de dentro, 1 = de fora */
  const up = q => {
    q = clamp(q, 0, 1);
    let y = hu * Math.sin(Math.PI * Math.pow(q, 0.62)) + 0.02 * k * (q - 0.4);
    y -= raiva * 0.75 * hu * Math.pow(1 - q, 1.2);            /* raiva: canto de dentro desce (olhar duro) */
    y -= tristeza * 0.45 * hu * Math.pow(q, 1.6);             /* tristeza: canto de fora cai */
    y -= aperto * 0.18 * hu * Math.sin(Math.PI * q);          /* olho apertado: a de cima também desce um pouco */
    return y;
  };
  const lo = q => { q = clamp(q, 0, 1); return -hl * Math.sin(Math.PI * Math.pow(q, 1.1)) + 0.012 * k * (q - 0.5) + 0.35 * hl0 * clamp(alegria - 0.2, 0, 1) * Math.sin(Math.PI * q) + 0.4 * hl0 * aperto * Math.sin(Math.PI * q); };
  const gY = clamp(p.eyeYaw || 0, -1, 1), gP = clamp(p.eyePitch || 0, -1, 1);
  return { e, R, aperto, X, k, ey0, r0, w, hu, hl0, hl, xc, up, lo, abre, surpresa, raiva, tristeza, alegria, gx: s => s * gY * 0.22 * w, gy: gP * 0.25 * hu - 0.12 * hu,
    fechado: R.lid > 0.86 || abre < 0.12 };
}
function olhosAnime(ctx) {
  const { p, sh, ringAt, curve, fillP, arr, pal, eyeY } = ctx, hp = (y, th, off) => ctx.hp(y, th, (off || 0) + LEVANTA);
  const X = emo(p).X, Gm = [geoOlhoAnime(p, sh, ringAt, eyeY, 1), geoOlhoAnime(p, sh, ringAt, eyeY, -1)];
  const alegriaMedia = (Gm[0].alegria + Gm[1].alegria) / 2;
  /* corar (vergonha, riso): mancha rosada e riscos diagonais na bochecha; lágrimas: poça na pálpebra
     de baixo e dois filetes descendo pelo rosto */
  const corar = clamp(Math.max(p.blush || 0, 0.35 * clamp(alegriaMedia - 0.6, 0, 1)) * (0.6 + 0.4 * X), 0, 1), choro = clamp((p.tears || 0) * (0.6 + 0.4 * X), 0, 1);
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
    const G = Gm[s > 0 ? 0 : 1], { e, k, ey0, w, hu, hl0, hl, xc, up, lo, abre, surpresa, alegria } = G;
    const Xq = q => (q - 0.5) * w;
    const E = (ex, ey, off) => { const y = ey0 + ey; return hp(y, s * Math.asin(clamp((xc + ex) / ringAt(y, p, sh)[0], 0, 0.99)), off || 0.012); };
    /* rugas do olho, estilo mangá (aparecem com a intensidade):
       pés de galinha no riso / bochecha / olho apertado; bochecha subindo; olheira e bolsa (cansaço) */
    { const R = G.R, bg = rostoGeral(p).bags;
      const pg = clamp(1.3 * (alegria - 0.55) + 0.8 * R.cheek + 0.5 * R.lidLo, 0, 1);
      if (pg > 0.12) for (let i = 0, nL = pg > 0.6 ? 3 : 2; i < nL; i++) {
        const a0 = (nL === 3 ? -28 + 28 * i : -16 + 32 * i) * D, L = (0.025 + 0.045 * pg) * k;
        curve("fibra", arr(u => E(Xq(1) + 0.012 * k + L * u * Math.cos(a0), 0.008 * k + L * u * Math.sin(a0), 0.011), 0, 1, 4)); }
      const ch = clamp(1.3 * (alegria - 0.5) + R.cheek, 0, 1);
      if (ch > 0.15) curve("fibra", arr(q => E(Xq(q), lo(q) - (0.075 - 0.025 * ch) * k - 0.01 * k * Math.sin(Math.PI * q), 0.011), 0.22, 0.86, 10));
      if (bg > 0.05) {
        fillP(arr(q => E(Xq(q), lo(q) - 0.006, 0.0105), 0.08, 0.95, 16).concat(arr(q => E(Xq(q), lo(q) - 0.006 - (0.018 + 0.03 * bg) * k * Math.sin(Math.PI * Math.pow(q, 0.9)), 0.0105), 0.95, 0.08, 16)), pal.shade2, +(0.12 + 0.3 * bg).toFixed(3));
        if (bg > 0.3) curve("fibra", arr(q => E(Xq(q), lo(q) - (0.03 + 0.03 * bg) * k * Math.sin(Math.PI * q), 0.011), 0.2, 0.85, 10));
      } }
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
    /* com a sobrancelha baixa (raiva) a faixa encolhe para não pintar por cima dela */
    const rvO = Math.min(1, G.raiva), opO = 0.42 * (1 - rvO);
    if (opO > 0.04) fillP(arr(q => E(Xq(q), up(q) + 0.016 * k, 0.009), -0.1, 1.1, 20)
      .concat(arr(q => E(Xq(q), up(q) + (0.05 - 0.03 * rvO) * k, 0.009), 1.1, -0.1, 20)), pal.shade1, +opO.toFixed(3));
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
  const e = emo(p), X = e.X, my = sh.mouthY, RL = ladoRosto(p, 1), RR = ladoRosto(p, -1), Q = rostoGeral(p);
  /* lábios apertados fecham a boca; nojo (lábio de cima) e dentes cerrados afastam os lábios mesmo com a mandíbula fechada */
  const a0 = Math.max(clamp(e.jo * (0.85 + 0.3 * X), 0, 1.25) * (1 - 0.9 * Q.press), 0.3 * Q.round, 0.14 * Q.lowerLip);
  const ulM = Math.max(RL.upperLip, RR.upperLip), fenda = clamp(Math.max(Q.clench, 0.75 * ulM) * (1 - Q.press), 0, 1);
  const a = Math.max(a0, fenda > 0.12 ? 0.05 + 0.06 * fenda : 0);
  const smM = (RL.smile + RR.smile) / 2, ss = Math.max(0, smM) * X, br = Math.max(0, -smM) * X;
  const meia = ringAt(my, p, sh)[0];
  const largura = Math.min(0.1 + 0.105 * e.kb * (0.62 * a0 + 0.55 * ss + 0.15 * br) + 0.06 * Q.clench, 0.72 * meia) * (1 - 0.3 * Q.press - 0.4 * Q.pout) * (1 + 0.35 * Q.wide) * (1 - 0.2 * Q.round);
  /* altura da cavidade: a mandíbula abre, o queixo limita (lábio inferior e mento continuam); em "O" quase tão alta quanto larga */
  const altura = Math.min(Math.max(0.03 + 0.15 * e.kb * a0 + 0.045 * fenda, 1.6 * largura * Q.round), (my - sh.chinY) * 0.72);
  const c = x => Math.sqrt(Math.max(0, 1 - Math.pow(clamp(x / largura, -1, 1), 2)));
  const r = x => Math.abs(clamp(x / largura, -1, 1));
  /* cada canto segue o seu lado (desprezo: um canto só); o lábio de cima sobe ao lado do meio (nojo) */
  const smX = x => aoLongo(RL.smile, RR.smile, x, largura), ssX = x => Math.max(0, smX(x)) * X, brX = x => Math.max(0, -smX(x)) * X;
  const ulX = x => aoLongo(RL.upperLip, RR.upperLip, x, largura) * Math.exp(-0.5 * Math.pow((r(x) - 0.45) / 0.28, 2));
  /* borda de cima quase reta (cantos sobem no sorriso, descem na raiva/tristeza) */
  const cima = x => my + 0.045 * ssX(x) * Math.pow(r(x), 2) - 0.04 * brX(x) * Math.pow(r(x), 1.5) + 0.012 * brX(x) * c(x) + 0.03 * X * ulX(x);
  /* borda de baixo: "D" cheio no sorriso, mais rasa e reta na raiva */
  const baixo = x => cima(x) - altura * Math.pow(c(x), ss > 0.2 ? 0.75 : br > 0.2 ? 1.6 : 1.05);
  const denteSup = x => cima(x) - Math.min(0.045, altura * (0.24 + 0.3 * fenda)) * c(x);
  const denteInf = x => baixo(x) + Math.max(Math.min(0.03, altura * 0.16), 0.024 * Q.lowerLip) * c(x);
  const linguaSup = x => baixo(x) + altura * (0.18 + 0.2 * c(x)) * c(x);
  /* boca fechada: a linha dos lábios (o OpenPose usa a mesma) */
  /* o que um canto tem a mais que o outro sobe/desce em rampa (sorriso de um lado só fica legível na boca pequena) */
  const linha = x => my + 0.03 * smX(x) * X * Math.pow(Math.abs(x / largura), 2) - 0.008 * smM * X * (1 - Math.pow(x / largura, 2)) + 0.028 * X * (smX(x) - smM) * Math.abs(x / largura);
  const cerrado = Q.clench > 0.15 && a0 < 0.3;
  return { aberto: a, largura, altura, cima, baixo, denteSup, denteInf, linguaSup, linha, c, my, ss, br, cerrado, Q, dx: 0.06 * Q.shift, dentesBaixo: Q.lowerLip > 0.25 };
}
function feicoesAnime(ctx) {
  const { p, sh, ringAt, curve, fillP, poly, arr, pal, eyeY } = ctx, e = emo(p), X = e.X, k = e.k, t = sh.t, hp = (y, th, off) => ctx.hp(y, th, (off || 0) + LEVANTA);
  const surfX = (y, x) => Math.asin(clamp(x / ringAt(y, p, sh)[0], -0.99, 0.99));
  let H = (x, y, off = 0.015) => hp(y, surfX(y, x), off);
  /* sobrancelhas: forma e posição exageradas por emoção (v5Exagero controla quanto)
     raiva: "V" — a ponta de dentro desce muito, chega perto do nariz e engrossa;
     surpresa: arco alto e mais fino; tristeza/aflição: ponta de dentro sobe e a de fora cai;
     desprezo/desconfiança: uma só, pelas unidades de cada lado (ponta de dentro / de fora) */
  [-1, 1].forEach(s => {
    const R = ladoRosto(p, s), sup = Math.max(0, e.bU) * X, baixa = Math.max(0, -e.bU) * X,
      rv = Math.max(0, e.bI) * X, tr = Math.max(0, -e.bI) * X, iI = R.browInner * X, iO = R.browOuter * X;
    const th0 = 8 - 3 * Math.min(1, rv);
    const pt = (u, dy) => {
      const arco = (0.035 + 0.045 * sup - 0.02 * Math.min(1, rv)) * Math.sin(Math.PI * Math.pow(u, 0.7));
      const y = eyeY + 0.13 + 0.07 * (k - 1) + arco - 0.02 * u + dy + 0.07 * e.bU * X
        - 0.15 * rv * Math.pow(1 - u, 1.25) + 0.03 * rv * Math.pow(u, 2)
        + 0.11 * tr * Math.pow(1 - u, 1.5) - 0.035 * tr * Math.pow(u, 1.5)
        + 0.085 * iI * Math.pow(1 - u, 1.4) + 0.085 * iO * Math.pow(u, 1.4);
      return hp(y, s * (th0 + (40 + 2 * Math.min(1, rv)) * u) * D, 0.012);
    };
    /* espessura: mais grossa por dentro na raiva, mais fina na surpresa */
    const esp = u => (0.026 * (1 - 0.75 * u) + 0.004) * (1 + 0.55 * Math.min(1.3, rv) * (1 - u) + 0.15 * baixa) * (1 - 0.28 * Math.min(1, sup));
    const up = [], lo = [];
    for (let i = 0; i <= 22; i++) { const u = i / 22, th = esp(u); up.push(pt(u, th / 2)); lo.push(pt(u, -th / 2)); }
    fillP(up.concat(lo.reverse()), pal.ink);
  });
  /* nariz: só a ponta (sombra pequena de um lado) */
  { const nz = rostoGeral(p).nose, yt = -0.8 * t + 0.018 * nz;
    fillP(arr(a => H(-0.02 + 0.03 * Math.cos(a), yt + 0.012 * Math.sin(a), 0.01), 0, 2 * Math.PI, 10), pal.shade2, 0.9);
    curve("feat", arr(u => H(0.012 - 0.03 * u, yt - 0.005 - 0.015 * Math.sin(Math.PI * u), 0.012), 0, 1, 6));
    /* nariz franzido: a ponta sobe e aparecem dobras curtas na raiz do nariz */
    if (nz > 0.1) [-1, 1].forEach(s => { for (let i = 0; i < (nz > 0.55 ? 3 : 2); i++) {
      const y0 = yt + 0.12 + 0.035 * i; curve("fibra", arr(u => H(s * (0.022 + 0.035 * u), y0 + 0.012 * Math.sin(Math.PI * u) - 0.012 * u, 0.012), 0, 1, 5)); } }); }
  /* boca */
  const B = bocaAnime(p, sh, ringAt), w = B.largura;
  /* rugas do rosto, estilo mangá, que aparecem com a intensidade: entre as sobrancelhas (franzir, nojo),
     testa (surpresa, aflição), sulco nariz-boca (sorriso, nojo, bochecha) e queixo enrugado (choro contido) */
  { const Qg = B.Q, RL = ladoRosto(p, 1), RR = ladoRosto(p, -1), yt = -0.8 * t;
    const fr = Math.max(clamp(Math.max(0, e.bI) * X + 0.6 * Qg.nose - 0.15, 0, 1), Qg.rugas.franzido);
    if (fr > 0.08) [-1, 1].forEach(s => { for (let i = 0; i < (fr > 0.55 ? 2 : 1); i++) {
      const x0 = s * (0.026 + 0.02 * i), L = (0.05 + 0.06 * fr) * (1 - 0.25 * i);
      curve(fr > 0.45 ? "divisao" : "fibra", arr(u => H(x0 + s * 0.008 * u, eyeY + 0.075 + 0.02 * i + L * u, 0.012), 0, 1, 4)); } });
    const testa = Math.max(clamp(Math.max(0, e.bU) * X + 0.6 * Math.max(0, (RL.browInner + RR.browInner) / 2) * X + 0.4 * Math.max(0, -e.bI) * X - 0.35, 0, 1), Qg.rugas.testa);
    if (testa > 0.05) for (let i = 0, nT = testa > 0.6 ? 3 : 2; i < nT; i++) {
      const y0 = eyeY + 0.36 + 0.065 * i, xs = 0.13 + 0.04 * i - 0.04 * (1 - testa);
      curve(testa > 0.45 ? "divisao" : "fibra", arr(x => H(x, y0 + 0.006 * Math.sin(x * 40 + i) - 0.03 * Math.pow(x / xs, 2), 0.012), -xs, xs, 14)); }
    [[1, RL], [-1, RR]].forEach(([s, R]) => {
      const v = Math.max(clamp(1.3 * (Math.max(0, R.smile) * X - 0.35) + 0.9 * R.upperLip + 0.4 * Qg.nose + 0.5 * R.cheek, 0, 1), Qg.rugas.boca);
      if (v < 0.1) return;
      const P0 = [s * 0.075, yt - 0.03], P2 = [s * (w + 0.035), B.my - 0.005], P1 = [s * (w + 0.075), (P0[1] + P2[1]) / 2 + 0.02], fim = 0.5 + 0.5 * v;
      curve("fibra", arr(u => { const a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u; return H(a * P0[0] + b * P1[0] + c * P2[0], a * P0[1] + b * P1[1] + c * P2[1], 0.014); }, 0.08, fim, 12)); });
    const smM = (RL.smile + RR.smile) / 2, cq = clamp(1.4 * (Math.max(0, -smM) * X - 0.4) * (1 - 2.5 * e.jo) + 0.7 * Qg.press, 0, 1);
    if (cq > 0.12) { const yc = sh.chinY + 0.09;
      [-0.045, 0, 0.045].forEach(xc => curve("fibra", arr(a => H(xc + 0.017 * Math.cos(a), yc + 0.012 * Math.sin(a), 0.014), Math.PI * 0.15, Math.PI * 0.85, 5)));
      if (cq > 0.45) curve("fibra", arr(x => H(x, yc - 0.03 + 0.01 * Math.pow(x / 0.07, 2), 0.014), -0.065, 0.065, 8)); } }
  /* pés de galinha, linhas na bochecha, bochechas infladas/chupadas e narinas dilatadas (pedidos à mão) */
  { const Qg = B.Q, rg = Qg.rugas;
    if (rg.olhos > 0.06) [-1, 1].forEach(s => { for (let i = 0; i < (rg.olhos > 0.5 ? 3 : 2); i++) { const a = (-0.4 + 0.4 * i); curve(rg.olhos > 0.45 ? "divisao" : "fibra", arr(u => H(s * (0.66 + (0.04 + 0.06 * rg.olhos) * u * Math.cos(a)), eyeY - 0.01 + (0.04 + 0.06 * rg.olhos) * u * Math.sin(a), 0.012), 0, 1, 4)); } });
    if (rg.bochecha > 0.1) [-1, 1].forEach(s => { for (let i = 0; i < (rg.bochecha > 0.6 ? 3 : 2); i++) curve("fibra", arr(u => H(s * (0.3 + 0.05 * u + 0.03 * i), eyeY - 0.2 - 0.04 * u - 0.035 * i, 0.013), 0, 1, 6)); });
    if (Math.abs(Qg.puff) > 0.08) [-1, 1].forEach(s => {
      if (Qg.puff > 0) curve("divisao", arr(u => { const a = Math.PI * (0.15 + 0.7 * u); return H(s * (0.36 + 0.08 * Qg.puff * Math.sin(a)), eyeY - 0.22 + (B.my - eyeY + 0.18) * u, 0.02 + 0.025 * Qg.puff * Math.sin(a)); }, 0, 1, 16));
      else curve("divisao", arr(u => H(s * (0.3 + 0.035 * Math.sin(Math.PI * u)), eyeY - 0.24 + (B.my - eyeY + 0.22) * u, 0.012), 0, 1, 14)); });
    if (Qg.flare > 0.1) [-1, 1].forEach(s => curve("fibra", arr(a => H(s * (0.035 + 0.02 * Qg.flare) + s * 0.022 * (1 + Qg.flare) * Math.cos(a), -0.8 * t - 0.008 + 0.014 * Math.sin(a), 0.012), Math.PI * 0.1, Math.PI * 0.9, 7))); }
  /* daqui em diante a boca pode estar puxada para um lado */
  { const H0 = H; H = (x, y, off) => H0(x + B.dx, y, off); }
  if (B.aberto < 0.04) {
    /* fechada: traço pequeno; sorriso curva para cima, tristeza para baixo; covinhas no sorriso grande */
    const y = B.linha, Q = B.Q;
    curve("feat", arr(x => H(x, y(x), 0.02), -w, w, 24));
    /* lábios apertados: linha dupla e sem volume; beicinho: lábio de cima arredondado para fora */
    if (Q.press > 0.2) curve("feat", arr(x => H(x, y(x) - 0.007, 0.02), -w * 0.85, w * 0.85, 16));
    /* lábios apertados: dobrinhas de compressão nos cantos */
    if (Q.press > 0.4) [-1, 1].forEach(s => curve("fibra", [H(s * (w + 0.008), y(s * w) + 0.014, 0.02), H(s * (w + 0.012), y(s * w) - 0.016, 0.02)]));
    if (Q.pout > 0.15) curve("fibra", arr(x => H(x, y(x) + 0.012 + 0.016 * Q.pout * (1 - Math.pow(x / w, 2)), 0.021), -w * 0.9, w * 0.9, 14));
    if (B.ss > 0.5) [-1, 1].forEach(s => curve("fibra", arr(u => H(s * (w + 0.012 * u), y(s * w) + 0.01 - 0.02 * u, 0.018), 0, 1, 4)));
    /* leve volume do lábio de baixo e comissuras, também com a boca fechada */
    if (Q.press < 0.8) fillP(arr(x => H(x, y(x) - 0.006, 0.019), -w * 0.78, w * 0.78, 16).concat(arr(x => H(x, y(x) - 0.006 - 0.022 * (1 + 1.6 * Q.pout) * (1 - 0.7 * Q.press) * Math.sqrt(Math.max(0, 1 - Math.pow(x / (w * 0.78), 2))), 0.019), w * 0.78, -w * 0.78, 16)), pal.coral, 0.22 * (1 + 0.8 * Q.pout) * (1 - Q.press) + 0.01);
    [-1, 1].forEach(s => fillP(arr(a => H(s * (w + 0.004) + 0.008 * Math.cos(a), y(s * w) + 0.006 * Math.sin(a), 0.021), 0, 2 * Math.PI, 8), pal.shade2, 0.45));
    curve("fibra", arr(x => H(x, B.my - 0.05, 0.016), -w * 0.35, w * 0.35, 8));
    return;
  }
  const cav = arr(x => H(x, B.cima(x), 0.03), -w, w, 40).concat(arr(x => H(x, B.baixo(x), 0.03), w, -w, 40));
  fillP(cav, pal.ink, 0.97);
  if (B.cerrado) {
    /* dentes cerrados: arcadas encostadas no meio, sem língua; linha entre elas e separação dos dentes */
    const dw = w * 0.86, meio = x => (B.cima(x) + B.baixo(x)) / 2;
    fillP(arr(x => H(x, B.cima(x) - 0.002, 0.036), -dw, dw, 30).concat(arr(x => H(x, meio(x), 0.036), dw, -dw, 30)), "#F4EFE6", 0.98);
    fillP(arr(x => H(x, meio(x), 0.036), -dw * 0.92, dw * 0.92, 30).concat(arr(x => H(x, B.baixo(x) + 0.002, 0.036), dw * 0.92, -dw * 0.92, 30)), "#ECE4D8", 0.96);
    curve("fibra", arr(x => H(x, meio(x), 0.037), -dw * 0.9, dw * 0.9, 20));
    for (let i = -3; i <= 3; i++) { const x = i * dw / 4.2; curve("fibra", [H(x, B.cima(x) - 0.004, 0.037), H(x, B.baixo(x) + 0.004, 0.037)]); }
    fillP(arr(x => H(x, B.cima(x) - 0.002, 0.037), -dw * 0.96, dw * 0.96, 24).concat(arr(x => H(x, B.cima(x) - 0.002 - 0.3 * (B.cima(x) - meio(x)), 0.037), dw * 0.96, -dw * 0.96, 24)), pal.shade2, 0.45);
    curve("feat", cav);
    [-1, 1].forEach(s => fillP(arr(a => H(s * (w + 0.004) + 0.009 * Math.cos(a), B.cima(s * w) - 0.004 + 0.007 * Math.sin(a), 0.033), 0, 2 * Math.PI, 8), pal.shade2, 0.5));
    fillP(arr(x => H(x, B.baixo(x) - 0.004, 0.02), -w * 0.78, w * 0.78, 20).concat(arr(x => H(x, B.baixo(x) - 0.03, 0.02), w * 0.78, -w * 0.78, 20)), pal.coral, 0.22);
    return;
  }
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
  if (B.aberto > 0.6 || B.dentesBaixo) { const di = w * 0.6; fillP(arr(x => H(x, B.denteInf(x), 0.036), -di, di, 24).concat(arr(x => H(x, B.baixo(x) + 0.002, 0.036), di, -di, 24)), "#ECE4D8", 0.95); }
  curve("feat", cav);
  /* comissuras: dobra pequena e escura em cada canto */
  [-1, 1].forEach(s => fillP(arr(a => H(s * (w + 0.004) + 0.009 * Math.cos(a), B.cima(s * w) - 0.004 + 0.007 * Math.sin(a), 0.033), 0, 2 * Math.PI, 8), pal.shade2, 0.5));
  /* leve preenchimento do lábio de baixo e sombra sob a boca */
  fillP(arr(x => H(x, B.baixo(x) - 0.004, 0.02), -w * 0.78, w * 0.78, 20).concat(arr(x => H(x, B.baixo(x) - 0.03, 0.02), w * 0.78, -w * 0.78, 20)), pal.coral, 0.22);
  curve("fibra", arr(x => H(x, B.baixo(0) - 0.045, 0.016), -w * 0.35, w * 0.35, 8));
}

export { olhosAnime, feicoesAnime, bocaAnime, geoOlhoAnime, LEVANTA as LEVANTA_V5 };
