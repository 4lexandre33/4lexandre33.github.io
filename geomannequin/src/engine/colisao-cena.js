/* GeoMannequin — colisão ENTRE manequins (e, no futuro, objetos da cena).
   Cada manequim vira ~20 cápsulas no espaço do mundo (um segmento de reta com raio: cabeça, pescoço, tórax,
   abdômen, pelve, braço, antebraço, mão, coxa, perna, pé). Duas cápsulas se atravessam quando
   distância(segmento A, segmento B) < raio A + raio B; a diferença é a profundidade, e a reta entre os dois
   pontos mais próximos dá a direção para sair.
   Este módulo só mede; quem corrige (afastar, girar, mexer na pose) é scene/colisoes.js. */
import { applyA, clamp, comp } from "./matematica.js";
import { shape } from "./cabeca.js";
import { chainSetup, legPose } from "./cadeia.js";
import { armDims, armPose } from "./bracos.js";
import { legDims } from "./pernas.js";
import { CX, CY } from "./matematica.js";
import { makeXf } from "./camera.js";
import { effScale } from "./projecao.js";

/* nomes das partes, para as mensagens */
const PARTES = {
  cabeca: "cabeça", pescoco: "pescoço", torax: "tórax", abdomen: "abdômen", pelve: "quadril",
  bracoE: "braço esquerdo", bracoD: "braço direito", antebracoE: "antebraço esquerdo", antebracoD: "antebraço direito", maoE: "mão esquerda", maoD: "mão direita",
  coxaE: "coxa esquerda", coxaD: "coxa direita", pernaE: "perna esquerda", pernaD: "perna direita", peE: "pé esquerdo", peD: "pé direito"
};
/* qual membro cada parte move (para corrigir pela pose) */
const MEMBRO = { bracoE: ["braco", 1], antebracoE: ["braco", 1], maoE: ["braco", 1], bracoD: ["braco", -1], antebracoD: ["braco", -1], maoD: ["braco", -1],
  coxaE: ["perna", 1], pernaE: ["perna", 1], peE: ["perna", 1], coxaD: ["perna", -1], pernaD: ["perna", -1], peD: ["perna", -1] };

/* corpo → mundo: giro no chão (wRot) e posição (wx, wy, wz) */
function paraMundo(p) {
  const wr = (p.wRot || 0) * Math.PI / 180, c = Math.cos(wr), s = Math.sin(wr), wx = p.wx || 0, wy = p.wy || 0, wz = p.wz || 0;
  return v => [v[0] * c + v[2] * s + wx, v[1] + wy, -v[0] * s + v[2] * c + wz];
}
function doMundo(p) {
  const wr = (p.wRot || 0) * Math.PI / 180, c = Math.cos(wr), s = Math.sin(wr), wx = p.wx || 0, wy = p.wy || 0, wz = p.wz || 0;
  return w => { const x = w[0] - wx, z = w[2] - wz; return [x * c - z * s, w[1] - wy, x * s + z * c]; };
}
/* cápsulas de um manequim (p com wx, wy, wz, wRot) */
function capsulas(p) {
  const S = shape(p), ch = chainSetup(p, S), F = ch.F, B = F.B, M = paraMundo(p), out = [];
  const cap = (nome, a, b, r) => out.push({ nome, a: M(a), b: M(b), r });
  const zc = -0.46;
  cap("cabeca", applyA(ch.A3, [0, 0.25, 0.1]), applyA(ch.A3, [0, -0.25, 0.15]), 0.95 * (p.skull || 0.82) / 0.82);
  cap("pescoco", applyA(ch.A3, [0, -0.9, -0.1]), applyA(ch.A2, [0, F.yJ + 0.3, zc]), 0.42 * (p.neck || 1));
  const cw = Math.max(0.2, B.chest * 0.5);
  cap("torax", applyA(ch.A2, [-cw, F.yJ - 1.1, zc]), applyA(ch.A2, [cw, F.yJ - 1.1, zc]), 0.9);
  cap("torax", applyA(ch.A2, [-cw * 0.7, F.yJ - 2.0, zc + 0.05]), applyA(ch.A2, [cw * 0.7, F.yJ - 2.0, zc + 0.05]), 0.85);
  cap("abdomen", applyA(ch.A2, [0, F.yJ - 2.5, zc + 0.05]), applyA(ch.Pel, [0, F.yHip + 0.55, -0.45]), Math.max(0.55, B.waist * 0.72));
  /* A cápsula lateral da pelve acompanha seu novo volume, em vez de usar raio fixo:
     melhora a detecção entre personagens sem confundir a bacia com uma cintura fina. */
  const hw = Math.max(0.2, B.hip * 0.42), raioPelve = Math.max(0.6, B.hip * 0.56);
  cap("pelve", applyA(ch.Pel, [-hw, F.yHip - 0.1, -0.48]), applyA(ch.Pel, [hw, F.yHip - 0.1, -0.48]), raioPelve);
  const Aarm = armDims(p), Aleg = legDims(p);
  [1, -1].forEach(s => {
    const L = s > 0 ? "E" : "D", ap = armPose(p, F, s), Aa = comp(ch.A2, ap.arm), Af = comp(ch.A2, ap.fore), Ah = comp(ch.A2, ap.hand), k = Aarm.k;
    cap("braco" + L, Aa.T, Af.T, 0.5 * k);
    cap("antebraco" + L, Af.T, Ah.T, 0.4 * k);
    cap("mao" + L, applyA(Ah, [0, -0.15, 0]), applyA(Ah, [0, -1.15 * Aarm.LH, 0.05]), 0.26 * k);
    const lp = legPose(p, F, ch, s), Th = comp(ch.Pel, lp.thigh), Cf = comp(ch.Pel, lp.calf), Ft = comp(ch.Pel, lp.foot), kk = Aleg.k, f = Aleg.f;
    cap("coxa" + L, applyA(Th, [0, -0.35, 0]), Cf.T, 0.62 * kk);
    cap("perna" + L, Cf.T, Ft.T, 0.42 * kk);
    cap("pe" + L, applyA(Ft, [0, -0.35, -0.1]), applyA(Ft, [0, -0.45, 1.45 * f]), 0.26);
  });
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  out.forEach(c => [c.a, c.b].forEach(q => { for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k] - c.r); hi[k] = Math.max(hi[k], q[k] + c.r); } }));
  return { caps: out, lo, hi };
}

/* pontos mais próximos entre os segmentos P0-P1 e Q0-Q1 (Ericson, "Real-Time Collision Detection") */
function segSeg(P0, P1, Q0, Q1) {
  const d1 = [P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]], d2 = [Q1[0] - Q0[0], Q1[1] - Q0[1], Q1[2] - Q0[2]], r = [P0[0] - Q0[0], P0[1] - Q0[1], P0[2] - Q0[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a < 1e-9 && e < 1e-9) { s = 0; t = 0; }
  else if (a < 1e-9) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = dot(d1, r);
    if (e < 1e-9) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = dot(d1, d2), den = a * e - b * b;
      s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const p = [P0[0] + d1[0] * s, P0[1] + d1[1] * s, P0[2] + d1[2] * s], q = [Q0[0] + d2[0] * t, Q0[1] + d2[1] * t, Q0[2] + d2[2] * t];
  return { p, q, d: Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) };
}
function caixasSeTocam(A, B, folga) { for (let k = 0; k < 3; k++) if (A.lo[k] > B.hi[k] + folga || B.lo[k] > A.hi[k] + folga) return false; return true; }

/* contatos entre dois corpos: [{pa, pb, prof, ponto, n (de B para A)}]; tol = quanto pode encostar sem contar */
function contatosEntre(CA, CB, tol) {
  tol = tol === undefined ? 0.04 : tol;
  const out = [];
  if (!caixasSeTocam(CA, CB, 0)) return out;
  for (const a of CA.caps) for (const b of CB.caps) {
    const r = segSeg(a.a, a.b, b.a, b.b), prof = a.r + b.r - r.d;
    if (prof <= tol) continue;
    let n = [r.p[0] - r.q[0], r.p[1] - r.q[1], r.p[2] - r.q[2]]; const L = Math.hypot(n[0], n[1], n[2]);
    n = L > 1e-6 ? n.map(v => v / L) : [1, 0, 0];
    const ponto = [(r.p[0] + r.q[0]) / 2, (r.p[1] + r.q[1]) / 2, (r.p[2] + r.q[2]) / 2];
    out.push({ pa: a.nome, pb: b.nome, prof, ponto, n });
  }
  /* mesma dupla de partes aparece uma vez só (a mais funda) */
  const m = new Map();
  for (const c of out) { const k = c.pa + "|" + c.pb, o = m.get(k); if (!o || c.prof > o.prof) m.set(k, c); }
  return [...m.values()].sort((x, y) => y.prof - x.prof);
}
/* todos os pares da cena: ps = lista de p (com posição no mundo); pular(i, j) → true para pares com contato permitido */
function detectarColisoes(ps, opts) {
  opts = opts || {};
  const C = ps.map(p => p ? capsulas(p) : null), out = [];
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    if (!C[i] || !C[j] || (opts.pular && opts.pular(i, j))) continue;
    const cs = contatosEntre(C[i], C[j], opts.tol);
    if (cs.length) out.push({ a: i, b: j, contatos: cs, prof: cs[0].prof });
  }
  return out;
}
/* penetração total de um manequim contra os outros (soma das profundidades) — usada para comparar soluções */
function penetracao(p, outros, tol) {
  const A = capsulas(p); let s = 0;
  for (const q of outros) { if (!q) continue; const B = q.caps ? q : capsulas(q); for (const c of contatosEntre(A, B, tol)) s += c.prof; }
  return s;
}
/* ponto do mundo → tela, pela câmera da cena (p traz câmera e enquadramento): [x, y, profundidade, px por R] */
function telaDoMundo(p, w) {
  const cam = makeXf(Object.assign({}, p, { wRot: 0 })), q = cam([w[0] - (p.tx || 0), w[1] - (p.ty || 0), w[2] - (p.tz || 0)]), S = effScale(p);
  const d = Math.max(3, p.camDist || 30), k = p.persp ? d / Math.max(0.2 * d, d - q[2]) : 1;
  return [CX + S * (q[0] * k + p.panX), CY - S * (q[1] * k + p.panY), q[2], S * k];
}

export { PARTES, MEMBRO, paraMundo, doMundo, capsulas, segSeg, contatosEntre, detectarColisoes, penetracao, telaDoMundo };
