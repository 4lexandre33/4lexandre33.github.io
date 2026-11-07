/* GeoMannequin — apoio em vários pontos (cadeia fechada): mãos e/ou pés no chão ao mesmo tempo.
   Para ponte, parada de mão, engatinhar, prancha, quatro apoios: escolhe a inclinação do corpo e a altura que deixam
   todos os contatos ao alcance (com os membros quase esticados, sem o tronco ou a cabeça entrarem no chão) e leva
   cada membro ao chão por cinemática inversa, dentro dos limites do perfil de flexibilidade. */
import { D, applyA, clamp, comp, mv } from "./matematica.js";
import { shape } from "./cabeca.js";
import { chainSetup, ikArm, ikLeg, legPose } from "./cadeia.js";
import { armDims, armJoint, armPose } from "./bracos.js";
import { hipJoint, legDims } from "./pernas.js";
import { ampliar } from "./amplitude.js";

/* contatos: "maos", "pes", "mao esquerda", "pe direito"… → lista de {tipo: "mao"|"pe", s} */
function lerContatos(q) {
  const t = (Array.isArray(q) ? q.join(" ") : String(q || "maos pes")).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const out = [];
  const add = (tipo, s) => { if (!out.some(c => c.tipo === tipo && c.s === s)) out.push({ tipo, s }); };
  for (const m of t.matchAll(/(maos|mao|pes|pe|joelhos|joelho)(?:\s+(esquerd\w*|direit\w*))?/g)) {
    const tipo = /^m/.test(m[1]) ? "mao" : /^j/.test(m[1]) ? "joelho" : "pe", ss = m[2] ? [/^e/.test(m[2]) ? 1 : -1] : /s$/.test(m[1]) || !m[2] ? [1, -1] : [];
    ss.forEach(s => add(tipo, s));
  }
  if (!out.length) throw new Error("Contatos: use \"maos\", \"pes\", \"joelhos\", \"mao esquerda\", \"pe direito\"…");
  return out;
}
/* raiz (ombro/quadril), extremidade atual e alcance de cada contato, com o corpo solto (sem apoio no chão) */
function geometria(p, S, cs) {
  const ch = chainSetup(p, S), F = ch.F;
  return cs.map(c => {
    if (c.tipo === "mao") {
      const A = armDims(p), G = applyA(ch.A2, armJoint(p, F, c.s)), ap = armPose(p, F, c.s), W = comp(ch.A2, ap.hand).T;
      return { c, raiz: G, ponta: W, alcance: A.L1 + A.L2, folga: 0.22 * A.k };
    }
    const A = legDims(p), J = applyA(ch.Pel, hipJoint(F, c.s)), lp = legPose(p, F, ch, c.s);
    if (c.tipo === "joelho") return { c, raiz: J, ponta: comp(ch.Pel, lp.calf).T, alcance: A.L1, folga: 0.42 * A.k };
    /* folga do pé: altura do tornozelo acima do ponto mais baixo do pé (calcanhar, bola ou ponta), na orientação atual */
    const Af = comp(ch.Pel, lp.foot), f = A.f, cd = (c.s > 0 ? p.toesL : p.toesR) * D;
    const pts = [[0, -A.hA, -0.42 * f], [-c.s * 0.42 * f, -A.hA, 1.25 * f], [c.s * 0.4 * f, -A.hA, 1.12 * f], [-c.s * 0.29 * f, -0.47 * f - 0.48 * f * Math.sin(cd) - 0.11 * f, 1.36 * f + 0.48 * f * Math.cos(cd)]].map(v => applyA(Af, v)[1]);
    return { c, raiz: J, ponta: Af.T, alcance: A.L1 + A.L2, folga: Math.max(0.3, Af.T[1] - Math.min(...pts)) };
  });
}
function punhoPlano(p, S, s) {
  const L_ = s > 0 ? "L" : "R", q = Object.assign({}, p), ch = chainSetup(q, S), [mn] = ampliar("wrist", -70, 80, p.flex);
  let best = -60, bv = 1e9;
  for (let w = mn; w <= 20; w += 2) { q["wrist" + L_] = w; const M = comp(ch.A2, armPose(q, ch.F, s).hand).M, v = Math.abs(M[4]); if (v < bv) { bv = v; best = w; } }
  return best;
}
function apoiarContatos(p, quais, opts) {
  opts = opts || {};
  const a1 = resolver(p, quais, opts);
  /* segunda passada: com os membros já no lugar, a folga de cada pé e a inclinação ficam mais exatas */
  return resolver(p, quais, Object.assign({}, opts, { faixa: Math.min(opts.faixa || 60, 20) })) || a1;
}
function resolver(p, quais, opts) {
  const S = shape(p), cs = lerContatos(quais), A = legDims(p);
  const g0 = hipJoint(chainSetup(Object.assign({}, p, { ground: 0, bodyLift: 0, bodyPitch: 0, bodyRoll: 0 }), S).F, 1)[1] - A.L1 - A.L2 - A.hA;
  const base = Object.assign({}, p, { ground: 0, bodyLift: 0 }), th0 = p.bodyPitch || 0;
  /* para cada inclinação: a maior altura em que todos alcançam o chão com ~90% do comprimento */
  const avalia = th => {
    const q = Object.assign({}, base, { bodyPitch: th }), gs = geometria(q, S, cs);
    /* cada membro mantém a distância horizontal que já tem (a pose decide se ele vai esticado ou dobrado) */
    const vert = g => { const h = Math.min(0.9 * g.alcance, Math.hypot(g.ponta[0] - g.raiz[0], g.ponta[2] - g.raiz[2])); return Math.sqrt(Math.max(0, (0.96 * g.alcance) ** 2 - h * h)); };
    let dy = 1e9;
    gs.forEach(g => { dy = Math.min(dy, g0 + g.folga + vert(g) - g.raiz[1]); });
    /* corpo (sem os membros de contato) acima do chão: cabeça e tronco */
    const ch = chainSetup(q, S), cab = applyA(ch.A3, [0, 0, 0]), pel = applyA(ch.Pel, [0, ch.F.yHip - 0.3, -0.48]), pei = applyA(ch.A2, [0, ch.F.yJ - 1.3, -0.2]);
    const baixo = Math.min(cab[1] - 1.0, pel[1] - 1.0, pei[1] - 1.2);
    const minDy = g0 - baixo;
    /* uso do alcance: membros igualmente estendidos é melhor que um esticado e outro dobrado */
    let sobra = 0; gs.forEach(g => { sobra += Math.abs(g0 + g.folga + vert(g) - (g.raiz[1] + dy)); });
    /* equilíbrio: o centro de massa (aproximado) fica sobre a base de apoio (no plano do chão) */
    let eq = 0;
    if (opts.equilibrio !== false) {
      const lp = [-1, 1].map(t => legPose(q, ch.F, ch, t)), pts = [[pel, 0.42], [pei, 0.25], [cab, 0.08]];
      lp.forEach(l => { pts.push([comp(ch.Pel, l.calf).T, 0.07]); pts.push([comp(ch.Pel, l.foot).T, 0.03]); });
      let cx = 0, cz = 0, wsum = 0; pts.forEach(([v, w]) => { cx += v[0] * w; cz += v[2] * w; wsum += w; }); cx /= wsum; cz /= wsum;
      let bx = 0, bz = 0; gs.forEach(g => { bx += g.ponta[0]; bz += g.ponta[2]; }); bx /= gs.length; bz /= gs.length;
      /* base larga (mãos e pés longe um do outro) aguenta mais deslocamento */
      let lado = 0; gs.forEach(g => { lado = Math.max(lado, Math.hypot(g.ponta[0] - bx, g.ponta[2] - bz)); });
      eq = Math.max(0, Math.hypot(cx - bx, cz - bz) - lado - 0.6) * 2;
    }
    const custo = (dy < minDy ? 50 + (minDy - dy) * 10 : 0) + sobra + eq + 0.02 * Math.abs(th - th0);
    return { th, dy: Math.max(dy, minDy), custo };
  };
  let best = avalia(th0);
  if (opts.girar !== false) for (let d = -(opts.faixa || 60); d <= (opts.faixa || 60); d += 5) { const r = avalia(clamp(th0 + d, -180, 180)); if (r.custo < best.custo) best = r; }
  Object.assign(p, { bodyPitch: best.th, bodyLift: best.dy, ground: 0 });
  /* leva cada membro ao chão: mantém a direção horizontal atual e ajusta a distância para caber no alcance */
  const avisos = [], LR = s => s > 0 ? "L" : "R";
  geometria(p, S, cs).forEach(g => {
    const yAlvo = g0 + g.folga, v = g.raiz[1] - yAlvo, lim = 0.97 * g.alcance;
    let hx = g.ponta[0] - g.raiz[0], hz = g.ponta[2] - g.raiz[2], h = Math.hypot(hx, hz);
    const hMax = Math.sqrt(Math.max(0, lim * lim - v * v));
    if (h < 1e-3) { hx = 0; hz = 0.3; h = 0.3; }
    const hh = Math.min(h, hMax);
    const alvo = [g.raiz[0] + hx / h * hh, yAlvo, g.raiz[2] + hz / h * hh];
    const L_ = LR(g.c.s);
    if (g.c.tipo === "mao") {
      const r = ikArm(p, S, g.c.s, alvo);
      Object.assign(p, { ["armAbd" + L_]: r.abd, ["armFlex" + L_]: r.flex, ["armRot" + L_]: r.rot, ["elbow" + L_]: r.elbow });
      /* palma no chão: o punho estende até a mão ficar paralela ao chão (dentro do limite do perfil) */
      p["handCurl" + L_] = 0.1; p["wrist" + L_] = punhoPlano(p, S, g.c.s);
      if (r.err > 0.4) avisos.push("mão " + (g.c.s > 0 ? "esquerda" : "direita") + " não alcança o chão (faltam " + Math.round(r.err * 11.4) + " cm)");
    } else if (g.c.tipo === "pe") {
      const r = ikLeg(p, S, g.c.s, alvo);
      Object.assign(p, { ["hipFlex" + L_]: r.hipFlex, ["hipAbd" + L_]: r.hipAbd, ["hipRot" + L_]: r.hipRot, ["kneeFlex" + L_]: r.knee });
      /* pé em ponta (pose com o tornozelo estendido) fica como está; senão, a planta assenta no chão */
      if (!opts.ponta && (p["ankleFlex" + L_] || 0) < 15) p["ankleFlex" + L_] = r.ankle;
      if (r.err > 0.4) avisos.push("pé " + (g.c.s > 0 ? "esquerdo" : "direito") + " não alcança o chão (faltam " + Math.round(r.err * 11.4) + " cm)");
    }
  });
  /* com os contatos nos lugares, o apoio no chão volta a valer (a parte mais baixa encosta) */
  Object.assign(p, { ground: 1, bodyLift: 0 });
  return avisos;
}
export { lerContatos, apoiarContatos };
