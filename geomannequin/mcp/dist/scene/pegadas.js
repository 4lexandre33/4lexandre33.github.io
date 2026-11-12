/* GeoMannequin — pegadas v2: carregar, levantar, sustentar, puxar, empurrar, arrastar e usar objetos de qualquer forma.

   Como funciona (para qualquer objeto: caixa, cilindro, cone, esfera, toro, pedra, compostos):
   1. O CORPO assume a base da ação (agachado, passo, inclinado para trás puxando…), com assimetria natural.
   2. O OBJETO vai para o lugar da ação em relação ao corpo (modo "carregar") — ou o corpo vai até o objeto, que fica
      onde está (modo "ir": empurrar, puxar com corda, carrinho, levantar do chão).
   3. Cada MÃO encontra a superfície de verdade: um raio sai do corpo em direção ao objeto (ou usa uma pega marcada:
      alça, cabo, nó do saco) e acha o ponto e a normal da superfície. A palma é posta POR FORA dela (meia espessura da
      mão), virada para ela; os dedos apontam ao longo da superfície (ou em volta do cabo, com o polegar do lado certo).
   4. O BRAÇO inteiro é resolvido junto (ombro, cotovelo, giro do antebraço, punho e desvio): posição e orientação da
      palma, sem o antebraço entrar no tronco. Se o ponto está além do comprimento do braço, o objeto chega mais perto
      (carregar) ou o corpo chega mais perto (ir) — o braço nunca estica até "furar".
   5. Os DEDOS fecham um a um até encostar (envolvem o cabo, acompanham a curva da esfera, ficam retos na face plana).
   6. Nada atravessa: objeto × corpo é verificado; se entra, o objeto (ou o corpo) é afastado e tudo é refeito.
   7. Corda e corrente ligam a mão ao objeto (puxar, arrastar) e acompanham a pose. */
import { SCN, novoIdObjeto, nextHue } from "./modelo.js";
import { ossosDoCorpo, paraMundo, doMundo, restGround, aplicarGesto, colliderRig, colliderObject, manifoldObject, partesDoObjeto, pointSolid, pegasDoObjeto, shape, chainSetup, armPose, armDims, comp, applyA, ikArm, bodyProxies, proxyDepth, juntasDedos, objectRigidPose, rigidPoint, rigidDirection, TIPOS_OBJETO } from "../engine/index.js";
import { rigidFrame, setRigidObjectPose } from "../engine/rigid-transform.js";
import { beginRigidGrip, releaseRigidGrip, handFrameV3, pousarObjetoRigido } from "./grip-v3.js";
import { medirMao } from "./grip-auto.js";
import { faixa } from "./parametros.js";
import { pesEm, POSE0 } from "./poses.js";

/* ---------- vetores ---------- */
const pgAdd = (a, b) => a.map((v, i) => v + b[i]), pgSub = (a, b) => a.map((v, i) => v - b[i]), pgMul = (a, k) => a.map(v => v * k);
const pgDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], pgLen = a => Math.hypot(...a);
const pgNorm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
const pgCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const pgComb = (...t) => t.reduce((acc, [v, k]) => pgAdd(acc, pgMul(v, k)), [0, 0, 0]);
const pgPerp = (v, n) => pgNorm(pgSub(v, pgMul(n, pgDot(v, n))));
const pgRot = (v, eixo, g) => { const a = g * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), k = pgNorm(eixo); return pgComb([v, c], [pgCross(k, v), s], [k, pgDot(k, v) * (1 - c)]); };
const pgMatriz = (X, Y, Z) => [X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]];
/* eixos do objeto: Y (altura local) e uma direção para a frente F → [X, Y, Z] ortonormais */
const pgEixos = (Y, F) => { Y = pgNorm(Y); const X = pgNorm(pgCross(Y, F)); return [X, Y, pgNorm(pgCross(X, Y))]; };
/* eixos com a LARGURA (x local) ao longo de L e a altura perto de U */
const pgEixosLargura = (L, U) => { const X = pgNorm(L), Y = pgPerp(U, X); return [X, Y, pgNorm(pgCross(X, Y))]; };

/* ---------- pontos do corpo ---------- */
function marcosDoCorpo(it, ground) {
  const p = it.params, W = paraMundo({ ...p, wy: ground - restGround(p) }), J = ossosDoCorpo(p).juntas;
  const g = (n, s = 0) => { const j = J.find(x => x.nome === n && x.s === s) || J.find(x => x.nome === n); return W(j.P); };
  const oE = g("ombro", 1), oD = g("ombro", -1), pel = g("pelve"), cab = g("cabeça (atlas)"), qE = g("quadril", 1), qD = g("quadril", -1);
  const esq = pgNorm(pgSub(oE, oD)), cima = [0, 1, 0], frente = pgNorm(pgCross(esq, cima)), largOmbro = Math.hypot(...pgSub(oE, oD));
  const peito = pgAdd(pgMul(pgAdd(oE, oD), 0.5), pgMul(cima, -1.0)), cintura = pgAdd(pel, pgMul(cima, 1.2));
  const r = (it.params.wRot || 0) * Math.PI / 180, frenteChao = [Math.sin(r), 0, Math.cos(r)];
  return { oE, oD, pel, cab, qE, qD, esq, cima, frente, frenteChao, esqChao: [frenteChao[2], 0, -frenteChao[0]], peito, cintura, largOmbro, topo: pgAdd(cab, pgMul(cima, 2.3)), meiaProf: 0.95, chao: ground };
}

/* ---------- a superfície do objeto ---------- */
function pgSolidos(o, ground) { return partesDoObjeto(o, ground); }
function pgSdf(S, q) { let best = null; for (const b of S) { const r = pointSolid(q, b); if (!best || r.d < best.d) best = r; } return best; }
/* raio da origem na direção dir até a superfície → {P, N} (null se não acerta) */
function pgRaio(S, O, dir, maxT = 60) {
  const d = pgNorm(dir); let t = 0, r = pgSdf(S, O);
  if (r.d < 0) { for (let k = 0; k < 40 && r.d < 0; k++) { t -= Math.max(0.05, -r.d); r = pgSdf(S, pgAdd(O, pgMul(d, t))); } }
  for (let k = 0; k < 160; k++) {
    const q = pgAdd(O, pgMul(d, t)); r = pgSdf(S, q);
    if (r.d < 0.004) { const P = pgSub(q, pgMul(r.n, r.d)); return { P, N: pgNorm(pgSdf(S, pgAdd(P, pgMul(r.n, 0.02))).n), t }; }
    t += Math.max(0.006, r.d * 0.9); if (t > maxT) return null;
  }
  return null;
}
/* ponto da superfície mais perto de q */
function pgMaisPerto(S, q) { let P = q; for (let k = 0; k < 6; k++) { const r = pgSdf(S, P); P = pgSub(P, pgMul(r.n, r.d)); if (Math.abs(r.d) < 0.002) break; } const r = pgSdf(S, pgAdd(P, pgMul(pgSdf(S, P).n, 0.02))); return { P, N: pgNorm(r.n) }; }
/* centro e meias medidas (no referencial do objeto) */
function pgCaixaObjeto(o, ground) {
  const S = pgSolidos(o, ground), pose = objectRigidPose(o, ground), inv = v => { const d = pgSub(v, pose.T); return [0, 1, 2].map(k => d[0] * pose.M[k] + d[1] * pose.M[3 + k] + d[2] * pose.M[6 + k]); };
  let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const b of S) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const w = b.c.map((c, q) => c + sx * b.h[0] * b.e[0][q] + sy * b.h[1] * b.e[1][q] + sz * b.h[2] * b.e[2][q]), l = inv(w);
    for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], l[k]); hi[k] = Math.max(hi[k], l[k]); }
  }
  const cl = lo.map((v, k) => (v + hi[k]) / 2), meia = hi.map((v, k) => (v - lo[k]) / 2);
  return { S, pose, centro: rigidPoint(pose, cl), centroLocal: cl, meia, eixos: [0, 1, 2].map(k => [pose.M[k], pose.M[3 + k], pose.M[6 + k]]) };
}
/* pega marcada do objeto (alça, cabo, nó…) no mundo */
function pgPega(o, ground, nome) {
  const P = pegasDoObjeto(o)[nome]; if (!P) return null;
  const pose = objectRigidPose(o, ground);
  return { P: rigidPoint(pose, P.P), N: pgNorm(rigidDirection(pose, P.N)), eixo: pgNorm(rigidDirection(pose, P.eixo)), nome };
}

/* ---------- a mão no alvo: braço inteiro + orientação da palma ---------- */
const PG_MAO = ["armAbd", "armFlex", "armRot", "elbow", "pron", "wrist", "wristDev"];
/* o alvo: Pc (centro da palma), X e Y desejados (eixos da mão no mundo); palma = −s·X, dedos = −Y */
function pgResolverMao(it, s, alvo, ground) {
  const p = it.params, L = s > 0 ? "L" : "R", Sh = shape(p), ch = chainSetup(p, Sh), A = armDims(p), toB = doMundo({ ...p, wy: ground - restGround(p) });
  const Pc = toB(alvo.Pc), Xd = pgNorm(pgSub(toB(pgAdd(alvo.Pc, alvo.X)), Pc)), Yd = pgNorm(pgSub(toB(pgAdd(alvo.Pc, alvo.Y)), Pc));
  const PX = bodyProxies(p, Sh), pad = 0.1 * A.k, lim = PG_MAO.map(k => faixa(k + L, p.flex));
  /* obstáculos (o corpo de outro manequim): cápsulas no referencial do corpo */
  const obst = (alvo.obst || []).map(c => ({ a: toB(c.a), b: toB(c.b), r: c.r + 0.08 }));
  const distSeg = (q, c) => { const ab = pgSub(c.b, c.a), t = Math.max(0, Math.min(1, pgDot(pgSub(q, c.a), ab) / (pgDot(ab, ab) || 1))); return pgLen(pgSub(q, pgAdd(c.a, pgMul(ab, t)))); };
  /* começo: a IK de posição para o punho, com o cotovelo para onde o alvo pede */
  const pulso = pgAdd(Pc, pgMul(Yd, 0.5 * A.LH)), r0 = ikArm(p, Sh, s, pulso, alvo.cotovelo ? [s * alvo.cotovelo[0], alvo.cotovelo[1], alvo.cotovelo[2]] : undefined);
  const x = [r0.abd, r0.flex, r0.rot, r0.elbow, p["pron" + L] || 0, p["wrist" + L] || 0, p["wristDev" + L] || 0].map((v, i) => Math.max(lim[i][0], Math.min(lim[i][1], v)));
  const q = { ...p }, wx = alvo.pesoX ?? 3, wy = alvo.pesoY ?? 1.8;
  const avaliar = v => {
    PG_MAO.forEach((k, i) => q[k + L] = v[i]);
    const ap = armPose(q, ch.F, s), H = comp(ch.A2, ap.hand), T = applyA(H, [0, -0.5 * A.LH, 0]);
    const HX = pgSub(applyA(H, [1, -0.5 * A.LH, 0]), T), HY = pgSub(applyA(H, [0, 1 - 0.5 * A.LH, 0]), T);
    const Aa = comp(ch.A2, ap.arm), Af = comp(ch.A2, ap.fore);
    const pen = proxyDepth([applyA(Aa, [0, -A.L1 * 0.55, 0]), Af.T, applyA(Af, [0, -A.L2 * 0.5, 0]), applyA(Af, [0, -A.L2 * 0.9, 0])], PX, pad);
    const e = pgLen(pgSub(T, Pc));
    let po = 0; if (obst.length) { const amostras = [applyA(Aa, [0, -A.L1 * 0.5, 0]), Af.T, applyA(Af, [0, -A.L2 * 0.35, 0]), applyA(Af, [0, -A.L2 * 0.7, 0])]; for (const q0 of amostras) for (const c of obst) po += Math.max(0, c.r - distSeg(q0, c)); }
    return { c: e * 6 + (1 - pgDot(HX, Xd)) * wx + (1 - pgDot(HY, Yd)) * wy + pen * 10 + po * 6 + 0.00002 * (v[5] * v[5] + v[6] * v[6]), e, ang: Math.acos(Math.max(-1, Math.min(1, pgDot(HX, Xd)))) * 180 / Math.PI };
  };
  const descer = x0 => { const x = x0.slice(); let best = avaliar(x), passo = 16;
    for (let volta = 0; volta < 160 && passo > 0.08; volta++) {
      let melhorou = false;
      for (let i = 0; i < 7; i++) for (const sg of [1, -1]) {
        const y = x.slice(); y[i] = Math.max(lim[i][0], Math.min(lim[i][1], y[i] + sg * passo)); if (y[i] === x[i]) continue;
        const r = avaliar(y); if (r.c < best.c - 1e-7) { best = r; x[i] = y[i]; melhorou = true; }
      }
      if (!melhorou) passo *= 0.5;
    }
    return { x, best }; };
  /* vários começos para o giro do antebraço e o punho (o mínimo local é o problema clássico) */
  let sol = null;
  for (const pr of [x[4], -60, 0, 60]) for (const rot of [x[2], x[2] - 40, x[2] + 40]) {
    const x0 = x.slice(); x0[4] = Math.max(lim[4][0], Math.min(lim[4][1], pr)); x0[2] = Math.max(lim[2][0], Math.min(lim[2][1], rot)); x0[5] = 0; x0[6] = 0;
    const r = descer(x0); if (!sol || r.best.c < sol.best.c) sol = r;
    if (sol.best.e < 0.05 && sol.best.ang < 8) break;
  }
  x.splice(0, 7, ...sol.x); const best = sol.best;
  PG_MAO.forEach((k, i) => p[k + L] = Math.round(x[i] * 10) / 10);
  return { erro: best.e, angulo: best.ang };
}
/* cabo: a palma pode girar em volta do cabo e o polegar pode ir para qualquer lado — tenta as variações e fica com a melhor */
function pgMelhorMao(it, c, a, ground) {
  const p = it.params, L = c.s > 0 ? "L" : "R", base = Object.fromEntries(PG_MAO.map(k => [k + L, p[k + L]]));
  if (!(c.como === "forca" || c.como === "gancho") || c.fixo) return { s: c.s, ...pgResolverMao(it, c.s, a, ground) };
  let melhor = null;
  for (const g of [0, -35, 35]) for (const pol of [1, -1]) {
    Object.assign(p, base);
    const N = g ? pgRot(c.N, c.eixo || UP, g) : c.N, cc = { ...c, N, polegar: pgMul(c.polegar || UP, pol) }, aa = pgAlvoDoContato(it, cc), r = pgResolverMao(it, c.s, aa, ground);
    const nota = r.erro * 6 + r.angulo / 25 + (pol < 0 ? 0.15 : 0) + Math.abs(g) / 400;
    if (!melhor || nota < melhor.nota) melhor = { nota, r, v: Object.fromEntries(PG_MAO.map(k => [k + L, p[k + L]])) };
    if (r.erro < 0.05 && r.angulo < 10 && pol > 0) break;
  }
  Object.assign(p, melhor.v); return { s: c.s, ...melhor.r };
}
/* fecha os dedos um a um até encostar na superfície (sem entrar). modo "envolver" (cabo, alça, esfera) ou "apoiar" (face) */
function pgFecharDedos(it, s, S, ground, modo) {
  const p = it.params, L = s > 0 ? "L" : "R", M = medirMao(p, s), meio = armDims(p).LH / 2, H = handFrameV3(it, s, ground);
  const mundo = q => rigidPoint(H, [q[0], q[1] + meio, q[2]]), dist = q => pgSdf(S, q).d;
  const nomes = ["Th", "In", "Me", "An", "Mi"], base = p["handCurl" + L] || 0; p["handCurl" + L] = 0;
  const resultado = [];
  nomes.forEach((f, i) => {
    const k = "f" + f + L, raio = M.dedos[i].raio, v0 = Math.max(0, Math.min(1, base + (p[k] || 0)));
    const custo = v => {
      p[k] = v; const pts = juntasDedos(p, s)[i].pts.map(mundo); let pen = 0, ponta = Infinity;
      for (let j = 1; j < pts.length; j++) for (let a = 1; a <= 3; a++) { const qq = pgAdd(pts[j - 1], pgMul(pgSub(pts[j], pts[j - 1]), a / 3)), d = dist(qq); pen = Math.max(pen, raio * 0.85 - d); if (j === pts.length - 1) ponta = Math.min(ponta, d - raio); }
      return { c: 40 * Math.max(0, pen) + (modo === "envolver" ? Math.abs(ponta) : 0.4 * Math.abs(ponta) + 0.6 * Math.abs(v - v0)), pen, ponta };
    };
    let melhor = { v: v0, ...custo(v0) };
    for (let v = 0; v <= 1.0001; v += 0.05) { const r = custo(v); if (r.c < melhor.c) melhor = { v, ...r }; }
    p[k] = Math.round(melhor.v * 100) / 100; resultado.push({ dedo: f, fecha: p[k], encosta: Math.round(melhor.ponta * 114) / 10, entra: Math.round(Math.max(0, melhor.pen) * 114) / 10 });
  });
  return resultado;
}
/* do contato (P na superfície, N para fora) ao alvo da mão */
function pgAlvoDoContato(it, c) {
  const s = c.s, p = it.params, M = medirMao(p, s), LH = armDims(p).LH, N = pgNorm(c.N), esp = M.espessuraPalma;
  let X = pgMul(N, s), Y, Pc;
  if (c.como === "forca" || c.como === "gancho") {
    /* cabo com eixo E: os dedos dão a volta (⟂ ao eixo), o polegar vai para o lado "polegar" */
    const E = pgPerp(c.eixo || [0, 1, 0], N), pol = c.polegar || [0, 1, 0], sig = -s * Math.sign(pgDot(E, pol) || 1), d = pgMul(pgNorm(pgCross(E, N)), sig);
    Y = pgMul(d, -1); Pc = pgComb([c.P, 1], [N, esp * 0.5 + (c.folga ?? 0.02)], [Y, (c.como === "gancho" ? 0.3 : 0.18) * LH]);
  } else {
    /* palma na superfície: dedos ao longo da superfície, na direção pedida */
    const d = pgPerp(c.dedos || [0, 1, 0], N); Y = pgMul(d, -1); Pc = pgComb([c.P, 1], [N, esp * 0.5 + (c.folga ?? 0.03)]);
  }
  return { Pc, X, Y, cotovelo: c.cotovelo, pesoX: c.pesoX, pesoY: c.pesoY };
}

/* ---------- posição do objeto e do corpo ---------- */
/* põe o objeto com o CENTRO da caixa envolvente em C e os eixos ax=[X,Y,Z] (colunas) */
function pgColocar(o, C, ax, ground) {
  const [X, Y, Z] = ax, cx = pgCaixaObjeto({ ...o, rot3: undefined, x: 0, z: 0, base: 0, giro: 0 }, 0).centroLocal;
  const T = pgSub(C, pgComb([X, cx[0]], [Y, cx[1]], [Z, cx[2]]));
  setRigidObjectPose(o, rigidFrame(pgMatriz(X, Y, Z), T), ground); o.emAr = true; delete o.sobre; delete o.sobreRel;
}
/* o objeto fica, o manequim anda: põe a frente (no chão) olhando para "olhar" e o ponto da pelve em (x, z) */
function pgMoverManequim(it, x, z, olhar) {
  const p = it.params; if (olhar) p.wRot = Math.round(Math.atan2(olhar[0], olhar[2]) * 180 / Math.PI * 10) / 10;
  p.wx = Math.max(-40, Math.min(40, x)); p.wz = Math.max(-40, Math.min(40, z));
}
/* base do corpo: zera só o corpo (o rosto fica) */
const PG_CORPO = /^(spine|pelvis|hip|knee|ankle|toes|hallux|tibia|arm|elbow|pron|wrist|handCurl|f(Th|In|Me|An|Mi)|fSpread|thumbOpp|head|neck|lum|tho|sh(Elev|Prot)|body)/;
function pgPoseBase(p) { for (const [k, v] of Object.entries(POSE0)) if (PG_CORPO.test(k)) p[k] = v; for (const k of Object.keys(p)) if (/^f(Th|In|Me|An|Mi)(Mcp|Ip|Abd)[LR]$/.test(k)) p[k] = 0; p.ground = 1; p.bodyLift = 0; }
const pgL = (s, k) => k + (s > 0 ? "L" : "R"), pgO = (s, k) => k + (s > 0 ? "R" : "L");
/* passo: pé do lado s à frente; queda = quanto o quadril desce; abre = afastamento lateral */
function pgPasso(Q, s, frente = 0.32, tras = -0.3, queda = 0.05, abre = 0.12, ponta = true) {
  if (ponta) { Q[pgO(s, "ankleFlex")] = 16; Q[pgO(s, "toes")] = -35; }
  pesEm(Q, { [pgL(s, "")]: [abre, frente], [pgO(s, "")]: [abre + 0.02, tras] }, queda);
}
function pgAgachar(Q, queda, abre = 0.22, frente = [0.06, -0.04], joelho) { pesEm(Q, { L: [abre, frente[0]], R: [abre + 0.02, frente[1]] }, queda, joelho); }

/* ---------- as ações ----------
   Cada ação: desc, grupo (para que serve), objeto de teste, mãos (1 ou 2), modo, corpo(Q,s,k), lugar(k) → {C, ax} (carregar)
   ou ir(k) (o corpo vai até o objeto), contatos(k) → [{s, como, P, N, eixo, polegar, dedos, cotovelo}], gesto. */
const pgRaioDe = (k, O, dir) => pgRaio(k.S, O, dir);
/* contato pelo lado: raio horizontal vindo de fora (lado ld) na altura h, à profundidade f do centro */
function pgLado(k, ld, h = 0, f = 0, dirExtra) {
  const { C } = k, dir = dirExtra ? pgNorm(pgAdd(pgMul(k.B.esqChao, -ld), dirExtra)) : pgMul(k.B.esqChao, -ld);
  const O = pgComb([C, 1], [k.B.esqChao, ld * 30], [[0, 1, 0], h], [k.B.frenteChao, f]);
  return pgRaio(k.S, O, dir) || pgMaisPerto(k.S, pgComb([C, 1], [[0, 1, 0], h], [k.B.frenteChao, f]));
}
/* contato por baixo (bandeja, acima da cabeça): raio de baixo para cima */
function pgBaixo(k, lat = 0, f = 0) { const O = pgComb([k.C, 1], [k.B.esqChao, lat], [k.B.frenteChao, f], [[0, 1, 0], -30]); return pgRaio(k.S, O, [0, 1, 0]) || pgMaisPerto(k.S, pgComb([k.C, 1], [[0, 1, 0], -k.meia[1]])); }
/* contato por cima */
function pgCima(k, lat = 0, f = 0) { const O = pgComb([k.C, 1], [k.B.esqChao, lat], [k.B.frenteChao, f], [[0, 1, 0], 30]); return pgRaio(k.S, O, [0, -1, 0]) || pgMaisPerto(k.S, pgComb([k.C, 1], [[0, 1, 0], k.meia[1]])); }
/* contato vindo do corpo (de trás para a frente) */
function pgFrente(k, lat = 0, h = 0, de = -1) { const O = pgComb([k.C, 1], [k.B.esqChao, lat], [[0, 1, 0], h], [k.B.frenteChao, 30 * de]); return pgRaio(k.S, O, pgMul(k.B.frenteChao, -de)) || pgMaisPerto(k.S, pgComb([k.C, 1], [k.B.esqChao, lat], [[0, 1, 0], h])); }
/* abraço: contato do outro lado do objeto, num ângulo a (0 = lado de cá, 90 = lado, 180 = lado de lá) */
function pgVolta(k, ld, a, h = 0) {
  const r = a * Math.PI / 180, dir = pgNorm(pgComb([k.B.frenteChao, -Math.cos(r)], [k.B.esqChao, ld * Math.sin(r)]));
  const O = pgComb([k.C, 1], [dir, 30], [[0, 1, 0], h]); return pgRaio(k.S, O, pgMul(dir, -1)) || pgMaisPerto(k.S, pgComb([k.C, 1], [[0, 1, 0], h]));
}
const UP = [0, 1, 0], DN = [0, -1, 0];
const pgC = (s, como, r, extra) => r ? Object.assign({ s, como, P: r.P, N: r.N }, extra || {}) : null;
/* um objeto comprido: o eixo mais longo (local) e seu tamanho */
function pgEixoLongo(o) { const m = [o.larg || 1, o.alt || 1, o.prof || 1], i = m.indexOf(Math.max(...m)); return { i, L: m[i] }; }
/* eixos para pôr o eixo mais longo do objeto ao longo de d (e o "menor" perto de cima) */
function pgAxLongo(o, d, up = UP) {
  const { i } = pgEixoLongo(o), D = pgNorm(d), U = pgPerp(up, D);
  if (i === 0) return [D, U, pgNorm(pgCross(D, U))];
  if (i === 1) return [U, D, pgNorm(pgCross(U, D))];
  return [pgNorm(pgCross(U, D)), U, D];
}
function pgAxRetoDe(B, giro = 0) { const F = pgRot(B.frenteChao, UP, giro); return pgEixos(UP, F); }

const ACOES = {
  /* ===== levar junto ao corpo ===== */
  abracado: { desc: "Abraçado contra o peito, braços em volta (fardo, pedra, barril, botijão, saco, caixa grande)", grupo: "carregar", maos: 2, modo: "carregar", teste: ["fardo", {}],
    corpo: (Q, s) => { Object.assign(Q, { spineFlex: -8, bodyPitch: -3, headPitch: 6, headRoll: s * 4, pelvisTilt: 4 }); pgPasso(Q, s, 0.22, -0.18, 0.06, 0.1); },
    lugar: k => { const d = k.meia[2] || 1; return { C: pgComb([k.B.peito, 1], [UP, -0.9 - Math.max(0, k.meia[1] - 2) * 0.35], [k.B.frenteChao, k.B.meiaProf + d + 0.2]), ax: k.orient === "deitado" ? pgAxLongo(k.o, k.B.esqChao) : pgAxRetoDe(k.B) }; },
    contatos: k => [1, -1].map(t => pgC(t, "palma", pgVolta(k, t, k.meia[0] > 2.2 ? 115 : 135, 0.15 + t * 0.1), { dedos: pgComb([k.B.frenteChao, -0.6], [UP, t > 0 ? 0.4 : -0.2]), cotovelo: [1, -0.4, 0.2], pesoY: 0.5 })), gesto: "aberta", fechar: "envolver" },
  aFrente: { desc: "Duas mãos dos lados, à frente da cintura (caixa, caixote, pilha de caixas, cesto)", grupo: "carregar", maos: 2, modo: "carregar", teste: ["caixote", {}],
    corpo: (Q, s) => { Object.assign(Q, { spineFlex: -4, bodyPitch: -2, headPitch: 8 }); pgPasso(Q, s, 0.2, -0.16, 0.04, 0.1); },
    lugar: k => ({ C: pgComb([k.B.cintura, 1], [UP, 0.2 + k.meia[1] * 0.2], [k.B.frenteChao, k.B.meiaProf + k.meia[2] + 0.35]), ax: k.orient === "deitado" ? pgAxLongo(k.o, k.B.esqChao) : pgAxRetoDe(k.B, k.orient === "diagonal" ? 30 : 0) }),
    contatos: k => [1, -1].map(t => pgC(t, "palma", pgLado(k, t, -k.meia[1] * 0.3, -k.meia[2] * 0.1), { dedos: pgComb([k.B.frenteChao, 0.6], [DN, 0.8]), cotovelo: [1, -0.6, -0.3] })), gesto: "espalmada", fechar: "envolver" },
  porBaixo: { desc: "Sustentado por baixo, com as palmas para cima (caixote raso, bandeja grande, tábua, criança)", grupo: "sustentar", maos: 2, modo: "carregar", teste: ["caixa", { larg: 3.6, prof: 2.6, alt: 1.4 }],
    corpo: (Q, s) => { Object.assign(Q, { spineFlex: -6, bodyPitch: -3, headPitch: 10 }); pgPasso(Q, s, 0.2, -0.18, 0.05, 0.1); },
    lugar: k => ({ C: pgComb([k.B.cintura, 1], [UP, 0.9 + k.meia[1]], [k.B.frenteChao, k.B.meiaProf + k.meia[2] + 0.5]), ax: pgAxRetoDe(k.B) }),
    contatos: k => [1, -1].map(t => pgC(t, "palma", pgBaixo(k, t * Math.min(k.meia[0] * 0.75, k.B.largOmbro * 0.6), 0), { dedos: k.B.frenteChao, cotovelo: [0.6, -1, 0] })), gesto: "espalmada", fechar: "apoiar" },
  bandeja: { desc: "Uma mão por baixo, palma para cima (bandeja, prato, caixa pequena)", grupo: "sustentar", maos: 1, modo: "carregar", teste: ["caixa", { larg: 3, prof: 3, alt: 0.25 }],
    corpo: (Q, s) => { Object.assign(Q, { pelvisSide: -s * 3, spineSide: s * 3 }); pgPasso(Q, s, 0.12, -0.1, 0.02, 0.1); },
    lugar: k => ({ C: pgComb([k.B.cintura, 1], [UP, 1.6 + k.meia[1]], [k.B.frenteChao, 2.6 + k.meia[2] * 0.4], [k.B.esqChao, k.s * 1.2]), ax: pgAxRetoDe(k.B) }),
    contatos: k => [pgC(k.s, "palma", pgBaixo(k, 0, 0), { dedos: k.B.frenteChao, cotovelo: [0.5, -1, -0.2] })], gesto: "espalmada", fechar: "apoiar" },
  acimaDaCabeca: { desc: "Erguido acima da cabeça com os braços esticados (caixa, pedra, barril, pneu, viga, barra)", grupo: "levantar", maos: 2, modo: "carregar", teste: ["pedra", {}],
    corpo: (Q, s) => { Object.assign(Q, { spineFlex: -6, headPitch: -12, bodyPitch: -2 }); pgAgachar(Q, 0.05, 0.24, [0.04, -0.03], [0.7, 0, 0.7]); },
    lugar: k => { const longo = pgEixoLongo(k.o).L > 7; return { C: pgComb([k.B.topo, 1], [UP, 2.5 + k.meia[1] * (longo ? 1 : 0.9)], [k.B.frenteChao, 0.35]), ax: longo ? pgAxLongo(k.o, k.B.esqChao) : pgAxRetoDe(k.B) }; },
    contatos: k => { const longo = pgEixoLongo(k.o).L > 7, w = Math.min(k.meia[0] * 0.8, k.B.largOmbro * 1.05);
      return [1, -1].map(t => longo ? pgC(t, "forca", pgBaixo(k, t * k.B.largOmbro * 0.95, 0), { eixo: k.B.esqChao, polegar: k.B.frenteChao.map(v => -v), cotovelo: [1, 0, 0] })
        : pgC(t, "palma", k.meia[0] > 1.6 ? pgBaixo(k, t * w, 0) : pgLado(k, t, -k.meia[1] * 0.2, 0), { dedos: k.meia[0] > 1.6 ? pgMul(k.B.esqChao, -t) : UP, cotovelo: [1, 0, 0] })); }, gesto: "espalmada", fechar: "envolver" },
  noOmbro: { desc: "Comprido no ombro, mão segurando na frente (viga, cano, tora, escada, treliça, tábua)", grupo: "carregar", maos: 2, modo: "carregar", teste: ["vigaI", {}],
    corpo: (Q, s) => { Object.assign(Q, { headRoll: -s * 8, headYaw: -s * 6, spineSide: -s * 4, [pgL(s, "shElev")]: 0.5, bodyPitch: 3 }); pgPasso(Q, s, 0.3, -0.28, 0.06, 0.11); },
    lugar: k => { const sh = k.s > 0 ? k.B.oE : k.B.oD, d = pgNorm(pgComb([k.B.frenteChao, 1], [UP, -0.12], [k.B.esqChao, -k.s * 0.08])), esp = Math.min(k.meia[1], k.meia[2], k.meia[0]);
      return { C: pgComb([sh, 1], [UP, esp + 0.55], [k.B.esqChao, -k.s * 0.15], [d, pgEixoLongo(k.o).L * 0.12]), ax: pgAxLongo(k.o, d, pgAdd(UP, pgMul(k.B.esqChao, k.s * 0.2))) }; },
    contatos: k => { const d = k.ax[pgEixoLongo(k.o).i], at = (t, de) => pgMaisPerto(k.S, pgComb([k.C, 1], [d, t], [k.B.esqChao, k.s * de], [UP, -1.2]));
      return [pgC(k.s, "forca", at(-pgEixoLongo(k.o).L * 0.12 + 2.4, 0.4), { eixo: d, polegar: UP, cotovelo: [0.6, -1, 0], pesoX: 1.2 }), pgC(-k.s, "forca", at(-pgEixoLongo(k.o).L * 0.12 + 0.9, -0.5), { eixo: d, polegar: UP, cotovelo: [0.2, -1, 0.3], pesoX: 1.0 })]; }, gesto: "segurar", fechar: "envolver" },
  cargaNoOmbro: { desc: "Carga apoiada em cima do ombro, cabeça de lado, mãos segurando na frente (saco, barril, caixa, pneu, galão)", grupo: "carregar", maos: 2, modo: "carregar", teste: ["saco", {}], bracoEncosta: true,
    corpo: (Q, s) => { Object.assign(Q, { headRoll: -s * 16, headPitch: 6, neckSide: -s * 6, spineSide: -s * 8, spineFlex: 10, bodyPitch: 6, [pgL(s, "shElev")]: 0.8 }); pgPasso(Q, s, 0.28, -0.26, 0.08, 0.11); },
    lugar: k => { const sh = k.s > 0 ? k.B.oE : k.B.oD, meiaV = k.o.tipo === "saco" ? Math.min(k.meia[0], k.meia[2]) : k.meia[1];
      return { C: pgComb([sh, 1], [UP, meiaV + 0.45], [k.B.esqChao, k.s * 0.15], [k.B.frenteChao, -0.2]), ax: k.o.tipo === "saco" ? pgEixos(pgComb([k.B.frenteChao, 1], [UP, 0.15]), pgMul(k.B.esqChao, -k.s)) : pgAxRetoDe(k.B, 90) }; },
    contatos: k => [pgC(k.s, "palma", pgFrente(k, k.s * 0.3, 0.1, -1), { dedos: pgComb([UP, 0.7], [k.B.esqChao, k.s * 0.3]), cotovelo: [0.6, -1, 0.2] }),
      pgC(-k.s, "palma", pgFrente(k, -k.s * 0.4, -0.5, -1), { dedos: pgComb([UP, 0.5], [k.B.esqChao, k.s]), cotovelo: [0.2, -1, 0.3] })], gesto: "garra", fechar: "envolver" },
  sacoNasCostas: { desc: "Saco jogado por cima do ombro, nas costas, as duas mãos no nó na frente (inclinado para a frente)", grupo: "carregar", maos: 2, modo: "carregar", teste: ["saco", { alt: 6 }],
    corpo: (Q, s) => { Object.assign(Q, { spineFlex: 24, bodyPitch: 12, headPitch: -16, headRoll: -s * 6, spineSide: -s * 4 }); pgPasso(Q, s, 0.32, -0.3, 0.12, 0.12); },
    lugar: k => { const sh = k.s > 0 ? k.B.oE : k.B.oD; return { C: pgComb([sh, 1], [k.B.frenteChao, -k.meia[2] * 0.9 - 0.4], [UP, 0.9], [k.B.esqChao, -k.s * 0.3]), ax: pgEixos(pgComb([k.B.frenteChao, 1], [UP, 0.35], [k.B.esqChao, k.s * 0.1]), UP) }; },
    contatos: k => { const n = pgPega(k.o, k.g, "no") || pgFrente(k, 0, 0, 1); return [pgC(k.s, "forca", n, { eixo: pgNorm(pgCross(n.N, UP)), polegar: UP, cotovelo: [0.5, -1, 0.2] }), pgC(-k.s, "forca", { P: pgAdd(n.P, pgComb([UP, -0.6], [k.B.frenteChao, 0.2])), N: n.N }, { eixo: pgNorm(pgCross(n.N, UP)), polegar: UP, cotovelo: [0.3, -1, 0.2] })]; }, gesto: "segurar", fechar: "envolver" },
  nasCostas: { desc: "Mochila nas costas, mãos nas alças na frente do peito", grupo: "carregar", maos: 2, modo: "carregar", teste: ["mochila", {}],
    corpo: (Q, s) => { Object.assign(Q, { spineFlex: 10, bodyPitch: 5, headPitch: -6 }); pgPasso(Q, s, 0.26, -0.24, 0.06, 0.1); },
    lugar: k => ({ C: pgComb([k.B.peito, 1], [k.B.frenteChao, -(k.B.meiaProf + k.meia[2] + 0.05)], [UP, -0.2]), ax: pgEixos(UP, k.B.frenteChao.map(v => -v)) }),
    contatos: k => [1, -1].map(t => { const sh = t > 0 ? k.B.oE : k.B.oD, P = pgComb([sh, 1], [k.B.frenteChao, 0.75], [UP, -1.3], [k.B.esqChao, -t * 0.5]); return pgC(t, "forca", { P, N: pgNorm(pgComb([k.B.frenteChao, 1], [k.B.esqChao, -t * 0.3])) }, { eixo: UP, polegar: UP, cotovelo: [1, -1, 0], folga: 0.05 }); }), gesto: "segurar", fechar: "nao", semColisao: true },
  debaixoDoBraco: { desc: "Preso debaixo do braço contra as costelas (caixa pequena, tapete enrolado, prancha, capacete)", grupo: "carregar", maos: 1, modo: "carregar", teste: ["caixa", { larg: 2.4, prof: 1.8, alt: 2 }], bracoEncosta: true,
    corpo: (Q, s) => { Object.assign(Q, { spineSide: s * 4, pelvisSide: -s * 3, [pgO(s, "armFlex")]: -8, [pgO(s, "elbow")]: 12 }); pgPasso(Q, s, 0.26, -0.22, 0.03, 0.1); },
    lugar: k => { const longo = pgEixoLongo(k.o).L > 4.5, w = longo ? Math.min(k.meia[1], k.meia[2]) : k.meia[2];
      return { C: pgComb([k.B.peito, 1], [UP, -1.2], [k.B.esqChao, k.s * (k.B.largOmbro * 0.42 + w + 0.12)], [k.B.frenteChao, longo ? pgEixoLongo(k.o).L * 0.22 : 0.45]), ax: longo ? pgAxLongo(k.o, pgComb([k.B.frenteChao, 1], [UP, -0.12])) : pgAxRetoDe(k.B, 90) }; },
    contatos: k => [pgC(k.s, "palma", pgBaixo(k, k.s * 0.1, Math.max(0.2, (pgEixoLongo(k.o).L > 4.5 ? 1.2 : k.meia[0]) * 0.55)), { dedos: pgComb([k.B.esqChao, -k.s], [k.B.frenteChao, 0.4]), cotovelo: [1, -0.5, -0.6] })], gesto: "garra", fechar: "envolver" },
  pelaAlca: { desc: "Pela alça, braço esticado ao lado do corpo (mala, maleta, galão, balde, bigorna); o corpo inclina para o outro lado", grupo: "carregar", maos: 1, modo: "carregar", teste: ["mala", {}],
    corpo: (Q, s) => { Object.assign(Q, { spineSide: -s * 7, pelvisSide: s * 5, headRoll: -s * 3, [pgO(s, "armAbd")]: 30, [pgO(s, "elbow")]: 18, [pgL(s, "shElev")]: -0.4 }); pgPasso(Q, s, 0.24, -0.22, 0.03, 0.1); },
    lugar: k => { const sh = k.s > 0 ? k.B.oE : k.B.oD, a = pgPega(k.o, k.g, "alca"), alto = a ? (pgDot(pgSub(a.P, k.C), UP)) : k.meia[1];
      return { C: pgComb([sh, 1], [UP, -(armDims(k.it.params).L1 + armDims(k.it.params).L2 + 0.45 * armDims(k.it.params).LH) + 0.2 - alto], [k.B.esqChao, k.s * 0.75], [k.B.frenteChao, 0.15]), ax: pgAxRetoDe(k.B, 0) }; },
    contatos: k => { const a = pgPega(k.o, k.g, "alca") || pgCima(k); return [pgC(k.s, "gancho", { P: pgAdd(a.P, pgMul(UP, 0.12)), N: pgMul(k.B.esqChao, k.s) }, { eixo: a.eixo || k.B.frenteChao, polegar: k.B.frenteChao, cotovelo: [1, -1, 0], folga: 0.0, pesoX: 0.6 })]; }, gesto: "gancho", fechar: "envolver" },
  noQuadril: { desc: "Apoiado no quadril com o braço em volta (balde, cesto, galão)", grupo: "carregar", maos: 1, modo: "carregar", teste: ["balde", {}],
    corpo: (Q, s) => { Object.assign(Q, { pelvisSide: s * 8, spineSide: -s * 9, headRoll: s * 4 }); pgPasso(Q, s, 0.12, -0.14, 0.03, 0.12); },
    lugar: k => { const q = k.s > 0 ? k.B.qE : k.B.qD; return { C: pgComb([q, 1], [k.B.esqChao, k.s * (0.9 + k.meia[0])], [UP, 0.5 + k.meia[1] * 0.3]), ax: pgAxRetoDe(k.B) }; },
    contatos: k => [pgC(k.s, "palma", pgVolta(k, k.s, 30, 0.2), { dedos: pgComb([k.B.esqChao, -k.s], [DN, 0.4]), cotovelo: [1, 0, -0.5] })], gesto: "garra", fechar: "envolver" },
  vigaNaCintura: { desc: "Comprido na horizontal à frente da cintura, uma mão por cima e outra por baixo (viga, cano, tora, tapete)", grupo: "carregar", maos: 2, modo: "carregar", teste: ["cano", { larg: 12 }],
    corpo: (Q, s) => { Object.assign(Q, { spineFlex: 6, bodyPitch: 2, headPitch: 4 }); pgPasso(Q, s, 0.24, -0.2, 0.08, 0.13); },
    lugar: k => ({ C: pgComb([k.B.cintura, 1], [UP, -0.2], [k.B.frenteChao, k.B.meiaProf + Math.min(k.meia[1], k.meia[2]) + 0.7], [k.B.esqChao, -k.s * 1.0]), ax: pgAxLongo(k.o, pgComb([k.B.esqChao, 1], [UP, -0.05])) }),
    contatos: k => { const d = k.ax[pgEixoLongo(k.o).i], at = (t, l) => pgMaisPerto(k.S, pgComb([k.C, 1], [d, t], l)); const hb = pgComb([UP, 0], [k.B.frenteChao, -1.5]);
      return [pgC(k.s, "forca", at(k.s * 1.2 + k.s * 1.0, [UP, -1.4]), { eixo: d, polegar: k.B.frenteChao, cotovelo: [0.6, -1, -0.2] }), pgC(-k.s, "forca", at(-k.s * 1.2 + k.s * 1.0, [k.B.frenteChao, -1.4]), { eixo: d, polegar: UP, cotovelo: [0.6, -1, -0.3] })]; }, gesto: "segurar", fechar: "envolver" },
  arremessar: { desc: "Preparando para arremessar, objeto atrás da cabeça com as duas mãos (saco, caixa, bola, pedra)", grupo: "arremessar", maos: 2, modo: "carregar", teste: ["saco", { alt: 4 }],
    corpo: (Q, s) => { Object.assign(Q, { spineFlex: -14, spineTwist: s * 22, pelvisTwist: s * 10, headPitch: -10, headYaw: -s * 10, bodyPitch: -4 }); pgPasso(Q, s, 0.34, -0.34, 0.1, 0.12); },
    lugar: k => ({ C: pgComb([k.B.topo, 1], [k.B.frenteChao, -1.4], [UP, 0.3 + k.meia[1] * 0.4], [k.B.esqChao, -k.s * 0.6]), ax: pgAxRetoDe(k.B, 25 * k.s) }),
    contatos: k => [1, -1].map(t => pgC(t, "palma", pgLado(k, t, 0, 0), { dedos: UP, cotovelo: [1, 0.6, 0] })), gesto: "garra", fechar: "envolver" },
  alcancarAlto: { desc: "Na ponta dos pés pegando ou guardando uma caixa no alto (prateleira)", grupo: "alcançar", maos: 2, modo: "carregar", teste: ["caixa", { larg: 2.6, prof: 2.2, alt: 2 }],
    corpo: (Q, s) => { Object.assign(Q, { ankleFlexL: 30, ankleFlexR: 30, toesL: -45, toesR: -45, spineFlex: -10, headPitch: -26 }); pesEm(Q, { L: [0.1, 0.02], R: [0.1, -0.04] }, -0.04); },
    lugar: k => ({ C: pgComb([k.B.topo, 1], [UP, 2.6 + k.meia[1]], [k.B.frenteChao, 2.2]), ax: pgAxRetoDe(k.B, -15) }),
    contatos: k => [1, -1].map(t => pgC(t, "palma", pgLado(k, t, -k.meia[1] * 0.25, -k.meia[2] * 0.2), { dedos: pgComb([UP, 0.6], [k.B.frenteChao, 0.8]), cotovelo: [1, -0.3, 0] })), gesto: "espalmada", fechar: "envolver" },
  espada: { desc: "Duas mãos no cabo, à frente, ponta para cima e para a frente (espada, taco, bastão)", grupo: "empunhar", maos: 2, modo: "carregar", teste: ["espada", {}],
    corpo: (Q, s) => { Object.assign(Q, { spineFlex: 8, bodyPitch: 4, headPitch: -8 }); pgPasso(Q, -s, 0.34, -0.3, 0.12, 0.13); },
    lugar: k => { const d = pgNorm(pgComb([k.B.frenteChao, 0.55], [UP, 0.83])), P = pgComb([k.B.cintura, 1], [k.B.frenteChao, 2.4], [UP, 1.0]); return { C: pgAdd(P, pgMul(d, k.meia[1] - 0.9)), ax: pgEixos(d, pgMul(k.B.esqChao, -1)) }; },
    contatos: k => { const d = k.ax[1], base = pgSub(k.C, pgMul(d, k.meia[1])), em = t => pgMaisPerto(k.S, pgComb([base, 1], [d, t], [k.B.frenteChao, -0.3]));
      return [pgC(k.s, "forca", em(1.0), { eixo: d, polegar: d, cotovelo: [0.8, -1, 0] }), pgC(-k.s, "forca", em(0.4), { eixo: d, polegar: d, cotovelo: [0.8, -1, 0] })]; }, gesto: "segurar", fechar: "envolver" },
  forca: { desc: "Uma mão fechada em volta, ao lado do corpo (bastão, espada, garrafa, lança, cabo)", grupo: "empunhar", maos: 1, modo: "carregar", teste: ["lanca", {}],
    corpo: (Q, s) => { Object.assign(Q, { [pgO(s, "armAbd")]: 10 }); pgPasso(Q, s, 0.08, -0.06, 0.01, 0.1, false); },
    lugar: k => ({ C: pgComb([k.B.cintura, 1], [k.B.esqChao, k.s * 1.4], [k.B.frenteChao, 1.9], [UP, 0.4 + k.meia[1] * 0.25]), ax: pgAxRetoDe(k.B) }),
    contatos: k => [pgC(k.s, "forca", pgMaisPerto(k.S, pgComb([k.C, 1], [UP, -k.meia[1] * 0.25], [k.B.esqChao, k.s * 0.5])), { eixo: k.ax[1], polegar: UP, cotovelo: [0.8, -1, -0.3] })], gesto: "segurar", fechar: "envolver" },
  pinca: { desc: "Pinça entre polegar e indicador (varinha, lápis, carta, flor)", grupo: "empunhar", maos: 1, modo: "carregar", teste: ["cilindro", { raio: 0.06, alt: 2.6 }],
    corpo: (Q, s) => { pgPasso(Q, s, 0.08, -0.06, 0.01, 0.1, false); },
    lugar: k => { const d = pgNorm(pgComb([k.B.frenteChao, 0.75], [UP, 0.65])), P = pgComb([k.B.peito, 1], [k.B.frenteChao, 2.6], [k.B.esqChao, k.s * 0.9]); return { C: pgAdd(P, pgMul(d, k.meia[1] * 0.5)), ax: pgEixos(d, UP) }; },
    contatos: k => [pgC(k.s, "forca", pgMaisPerto(k.S, pgComb([k.C, 1], [k.ax[1], -k.meia[1] * 0.75], [k.B.esqChao, k.s * 0.3])), { eixo: k.ax[1], polegar: k.ax[1], cotovelo: [0.8, -1, -0.2] })], gesto: "pinca", fechar: "nao" },
  marretaNoOmbro: { desc: "Ferramenta de cabo no ombro, cabeça atrás (marreta, machado, pá, enxada)", grupo: "carregar", maos: 1, modo: "carregar", teste: ["marreta", {}],
    corpo: (Q, s) => { Object.assign(Q, { headRoll: -s * 5, [pgO(s, "armAbd")]: 14 }); pgPasso(Q, s, 0.24, -0.22, 0.03, 0.1); },
    lugar: k => { const sh = k.s > 0 ? k.B.oE : k.B.oD, d = pgNorm(pgComb([k.B.frenteChao, -0.82], [UP, 0.5], [k.B.esqChao, k.s * 0.1])); return { C: pgComb([sh, 1], [UP, 0.45], [d, k.meia[1] * 0.45]), ax: pgEixos(d, pgMul(k.B.esqChao, k.s)) }; },
    contatos: k => { const d = k.ax[1], base = pgSub(k.C, pgMul(d, k.meia[1])); return [pgC(k.s, "forca", pgMaisPerto(k.S, pgComb([base, 1], [d, 0.6], [UP, -0.4])), { eixo: d, polegar: d, cotovelo: [0.5, -1, 0] })]; }, gesto: "segurar", fechar: "envolver" },
  golpeAcima: { desc: "Golpe por cima da cabeça com as duas mãos no cabo (marreta, machado, picareta)", grupo: "usar ferramenta", maos: 2, modo: "carregar", teste: ["marreta", {}],
    corpo: (Q, s) => { Object.assign(Q, { spineFlex: -16, headPitch: -6, bodyPitch: -4 }); pgPasso(Q, -s, 0.3, -0.3, 0.1, 0.16); },
    lugar: k => { const d = pgNorm(pgComb([k.B.frenteChao, -0.4], [UP, 0.92])); return { C: pgComb([k.B.topo, 1], [UP, 0.6], [k.B.frenteChao, 0.4], [d, k.meia[1] * 0.5]), ax: pgEixos(d, pgMul(k.B.esqChao, -1)) }; },
    contatos: k => { const d = k.ax[1], base = pgSub(k.C, pgMul(d, k.meia[1])); return [pgC(k.s, "forca", pgMaisPerto(k.S, pgComb([base, 1], [d, 1.2], [k.B.frenteChao, 0.4])), { eixo: d, polegar: d, cotovelo: [1, 0.5, 0] }), pgC(-k.s, "forca", pgMaisPerto(k.S, pgComb([base, 1], [d, 0.5], [k.B.frenteChao, 0.4])), { eixo: d, polegar: d, cotovelo: [1, 0.5, 0] })]; }, gesto: "segurar", fechar: "envolver" },

  /* ===== o corpo vai até o objeto (o objeto fica onde está) ===== */
  levantarDoChao: { desc: "Agachado, levantando do chão com as duas mãos (caixa, pedra, barril deitado, saco, pneu)", grupo: "levantar", maos: 2, modo: "ir", teste: ["caixote", {}],
    corpo: (Q, s, k) => { const baixo = Math.max(0, 1.6 - k.alto) * 0.08; Object.assign(Q, { spineFlex: 26, bodyPitch: 18, headPitch: -26, pelvisTilt: -6, hipAbdL: 18, hipAbdR: 22 }); pgAgachar(Q, 0.36 + baixo, 0.26, [0.02, -0.12], [0.7, 0, 0.7]); },
    ir: k => ({ dist: rf => k.B.meiaProf + rf + 1.5 }),
    contatos: k => [1, -1].map(t => pgC(t, "palma", pgLado(k, t, -k.meia[1] * 0.25, 0), { dedos: pgComb([DN, 1], [k.B.frenteChao, 0.4]), cotovelo: [1, -0.6, -0.2] })), gesto: "espalmada", fechar: "envolver" },
  levantamentoTerra: { desc: "Levantamento terra: agachado, costas retas, mãos por cima da barra (barra com anilhas, tora, cano)", grupo: "levantar", maos: 2, modo: "ir", teste: ["barraPesos", {}],
    corpo: (Q, s) => { Object.assign(Q, { spineFlex: 16, bodyPitch: 30, headPitch: -32, hipAbdL: 14, hipAbdR: 14 }); pgAgachar(Q, 0.38, 0.17, [0.02, -0.02], [0.7, 0, 0.7]); },
    ir: k => ({ dist: 1.3, frente: "largura" }),
    contatos: k => [1, -1].map(t => pgC(t, "forca", pgCima(k, t * k.B.largOmbro * 0.62, 0), { eixo: k.B.esqChao, polegar: k.B.esqChao.map(v => -v * t), cotovelo: [1, 0, -0.5] })), gesto: "segurar", fechar: "envolver" },
  ajoelhadoLevantando: { desc: "Um joelho no chão, mãos dos lados da caixa (caixa, caixote, tambor)", grupo: "levantar", maos: 2, modo: "ir", teste: ["caixote", {}],
    corpo: (Q, s) => { Object.assign(Q, { [pgL(s, "hipFlex")]: 92, [pgL(s, "kneeFlex")]: 95, [pgL(s, "ankleFlex")]: -6, [pgO(s, "hipFlex")]: -4, [pgO(s, "kneeFlex")]: 95, [pgO(s, "ankleFlex")]: 12, [pgO(s, "toes")]: -55, spineFlex: 26, headPitch: -18 }); },
    ir: k => ({ dist: rf => k.B.meiaProf + rf + 1.6 }),
    contatos: k => [1, -1].map(t => pgC(t, "palma", pgLado(k, t, 0, 0), { dedos: pgComb([DN, 1], [k.B.frenteChao, 0.5]), cotovelo: [1, -0.6, -0.2] })), gesto: "espalmada", fechar: "envolver" },
  empurrar: { desc: "Empurrando com as palmas, corpo inclinado, perna de trás esticada (caixote alto, pedra, pneu, armário, carro)", grupo: "empurrar", maos: 2, modo: "ir", teste: ["caixa", { larg: 4, prof: 3, alt: 8 }],
    corpo: (Q, s) => { Object.assign(Q, { bodyPitch: 34, spineFlex: 6, headPitch: -30, [pgO(s, "ankleFlex")]: 22, [pgO(s, "toes")]: -45 }); pesEm(Q, { [pgL(s, "")]: [0.12, 0.32], [pgO(s, "")]: [0.14, -0.62] }, 0.12); },
    ir: k => ({ dist: rf => k.B.meiaProf + rf + 4.4, alturaMao: 9.2 }),
    contatos: k => [1, -1].map(t => pgC(t, "palma", pgFrente(k, t * 0.95, k.hMao, -1), { dedos: pgComb([UP, 1], [k.B.esqChao, -t * 0.2]), cotovelo: [0.6, -1, 0], pesoY: 0.6 })), gesto: "espalmada", fechar: "apoiar" },
  empurrarCarrinho: { desc: "Empurrando um carrinho pela barra (carrinho plataforma, caçamba, carrinho de supermercado)", grupo: "empurrar", maos: 2, modo: "ir", teste: ["carrinhoPlataforma", {}],
    corpo: (Q, s) => { Object.assign(Q, { bodyPitch: 22, spineFlex: 6, headPitch: -18, [pgO(s, "ankleFlex")]: 20, [pgO(s, "toes")]: -40 }); pesEm(Q, { [pgL(s, "")]: [0.11, 0.18], [pgO(s, "")]: [0.13, -0.5] }, 0.08); },
    ir: k => ({ alca: true, dist: 3.4 }),
    contatos: k => { const a = [pgPega(k.o, k.g, "alcaE"), pgPega(k.o, k.g, "alcaD")]; return [1, -1].map((t, i) => { const q = a[pgDot(pgSub(a[0].P, a[1].P), k.B.esqChao) * t > 0 ? 0 : 1]; return pgC(t, "forca", { P: q.P, N: pgMul(k.B.frenteChao, -1) }, { eixo: k.B.esqChao, polegar: k.B.esqChao.map(v => -v * t), cotovelo: [0.8, -1, 0], folga: 0.12 }); }); }, gesto: "segurar", fechar: "envolver" },
  carrinhoDeMao: { desc: "Carrinho de mão: as duas alças erguidas na altura do quadril, andando", grupo: "empurrar", maos: 2, modo: "ir", teste: ["carrinhoDeMao", {}],
    corpo: (Q, s) => { Object.assign(Q, { bodyPitch: 12, spineFlex: 8, headPitch: -10, [pgO(s, "ankleFlex")]: 16, [pgO(s, "toes")]: -35 }); pesEm(Q, { [pgL(s, "")]: [0.13, 0.22], [pgO(s, "")]: [0.15, -0.36] }, 0.06); },
    ir: k => ({ alca: true, levantar: 18, dist: 1.3 }),
    contatos: k => { const a = [pgPega(k.o, k.g, "alcaE"), pgPega(k.o, k.g, "alcaD")]; return [1, -1].map(t => { const q = a[pgDot(pgSub(a[0].P, a[1].P), k.B.esqChao) * t > 0 ? 0 : 1]; return pgC(t, "forca", { P: q.P, N: UP }, { eixo: q.eixo, polegar: k.B.frenteChao, cotovelo: [1, -1, 0], folga: 0.12 }); }); }, gesto: "segurar", fechar: "envolver" },
  carrinhoCarga: { desc: "Carrinho de carga inclinado para trás sobre as rodas, puxado pelas alças", grupo: "puxar", maos: 2, modo: "ir", teste: ["carrinhoCarga", {}],
    corpo: (Q, s) => { Object.assign(Q, { bodyPitch: 10, spineFlex: 4, headPitch: -6, [pgO(s, "ankleFlex")]: 14, [pgO(s, "toes")]: -35 }); pesEm(Q, { [pgL(s, "")]: [0.12, 0.25], [pgO(s, "")]: [0.14, -0.28] }, 0.05); },
    ir: k => ({ alca: true, inclinar: -38, dist: 1.6 }),
    contatos: k => { const a = [pgPega(k.o, k.g, "alcaE"), pgPega(k.o, k.g, "alcaD")]; return [1, -1].map(t => { const q = a[pgDot(pgSub(a[0].P, a[1].P), k.B.esqChao) * t > 0 ? 0 : 1]; return pgC(t, "forca", { P: q.P, N: pgMul(k.B.frenteChao, -1) }, { eixo: k.B.esqChao, polegar: UP, cotovelo: [1, -1, 0], folga: 0.12 }); }); }, gesto: "segurar", fechar: "envolver" },
  malaDeRodinhas: { desc: "Puxando a mala de rodinhas inclinada, braço para trás", grupo: "puxar", maos: 1, modo: "ir", teste: ["malaRodinhas", {}],
    corpo: (Q, s) => { Object.assign(Q, { spineTwist: s * 6, headYaw: s * 4 }); pgPasso(Q, -s, 0.26, -0.24, 0.03, 0.1); },
    ir: k => ({ alca: true, atras: true, inclinar: 32, dist: 1.4 }),
    contatos: k => { const a = pgPega(k.o, k.g, "alca"); return [pgC(k.s, "forca", { P: a.P, N: UP }, { eixo: a.eixo, polegar: k.B.frenteChao, cotovelo: [0.6, -1, 0], folga: 0.1 })]; }, gesto: "segurar", fechar: "envolver" },
  puxarCorda: { desc: "Puxando por uma corda, de frente para o objeto, corpo inclinado para trás (caixote, trenó, âncora, cabo de guerra)", grupo: "puxar", maos: 2, modo: "ir", teste: ["caixote", {}], corda: true,
    corpo: (Q, s) => { Object.assign(Q, { bodyPitch: -26, spineFlex: -2, headPitch: 12, [pgL(s, "ankleFlex")]: -14, [pgL(s, "toes")]: 10 }); pesEm(Q, { [pgL(s, "")]: [0.13, 0.42], [pgO(s, "")]: [0.13, -0.18] }, 0.12, [0.6, 0, 0.8]); },
    ir: k => ({ dist: 12, olhar: true }),
    contatos: k => { const d = pgNorm(pgSub(k.C, k.B.peito)), dH = pgPerp(d, UP); return [k.s, -k.s].map((t, i) => { const P = pgComb([k.B.cintura, 1], [UP, 0.8], [dH, 2.2 + i * 1.3], [k.B.esqChao, t * 0.1]); return pgC(t, "forca", { P, N: pgNorm(pgComb([UP, 1], [k.B.esqChao, t * 0.6])) }, { eixo: d, polegar: d, cotovelo: [0.7, -1, -0.2], folga: 0.14 }); }); }, gesto: "segurar", fechar: "nao" },
  puxarCordaNasCostas: { desc: "Puxando com a corda por cima do ombro, de costas para o objeto, inclinado para a frente (saco, âncora, palete)", grupo: "puxar", maos: 2, modo: "ir", teste: ["palete", {}], corda: true,
    corpo: (Q, s) => { Object.assign(Q, { bodyPitch: 30, spineFlex: 12, headPitch: -26, [pgO(s, "ankleFlex")]: 24, [pgO(s, "toes")]: -45 }); pesEm(Q, { [pgL(s, "")]: [0.12, 0.34], [pgO(s, "")]: [0.14, -0.55] }, 0.12); },
    ir: k => ({ dist: 11, deCostas: true }),
    contatos: k => { const sh = k.s > 0 ? k.B.oE : k.B.oD; return [k.s, -k.s].map((t, i) => { const P = pgComb([sh, 1], [k.B.frenteChao, 1.2 + i * 0.6], [UP, -1.1 - i * 0.9], [k.B.esqChao, -k.s * 0.4 * i]); return pgC(t, "forca", { P, N: pgNorm(pgComb([k.B.frenteChao, 1], [k.B.esqChao, -t * 0.5])) }, { eixo: pgNorm(pgComb([UP, 1], [k.B.frenteChao, -0.6])), polegar: UP, cotovelo: [0.6, -1, 0.2], folga: 0.12 }); }); }, gesto: "segurar", fechar: "nao" },
  arrastar: { desc: "Arrastando pelo nó ou pela borda, andando de costas e inclinado (saco, corpo, fardo)", grupo: "arrastar", maos: 2, modo: "ir", teste: ["saco", {}],
    corpo: (Q, s) => { Object.assign(Q, { bodyPitch: 20, spineFlex: 18, headPitch: -10, [pgL(s, "ankleFlex")]: -6 }); pesEm(Q, { [pgL(s, "")]: [0.14, 0.2], [pgO(s, "")]: [0.14, -0.38] }, 0.2, [0.6, 0, 0.8]); },
    ir: k => ({ deitar: true, dist: 3.4 }),
    contatos: k => { const n = pgPega(k.o, k.g, "no") || pgFrente(k, 0, 0); return [k.s, -k.s].map((t, i) => pgC(t, "forca", { P: pgAdd(n.P, pgMul(pgNorm(pgSub(k.B.peito, n.P)), i * 0.45)), N: UP }, { eixo: k.B.esqChao, polegar: k.B.frenteChao.map(v => -v), cotovelo: [0.5, -1, 0], folga: 0.1 })); }, gesto: "segurar", fechar: "envolver" },
  rolar: { desc: "Rolando pelo chão, mãos em cima e na frente (pneu em pé, barril deitado, pedra redonda)", grupo: "empurrar", maos: 2, modo: "ir", teste: ["pneu", {}],
    corpo: (Q, s) => { Object.assign(Q, { bodyPitch: 28, spineFlex: 10, headPitch: -22, [pgO(s, "ankleFlex")]: 22, [pgO(s, "toes")]: -45 }); pesEm(Q, { [pgL(s, "")]: [0.12, 0.3], [pgO(s, "")]: [0.14, -0.56] }, 0.12); },
    ir: k => ({ dist: rf => k.B.meiaProf + rf + 2.4, deLado: true }),
    contatos: k => [1, -1].map(t => pgC(t, "palma", pgVolta(k, t, 20, k.meia[1] * 0.55), { dedos: pgComb([UP, 0.4], [k.B.frenteChao, 1]), cotovelo: [0.8, -1, 0] })), gesto: "espalmada", fechar: "envolver" },
  virarPneu: { desc: "Virando pneu deitado: agachado, mãos por baixo da borda", grupo: "levantar", maos: 2, modo: "ir", teste: ["pneu", { larg: 8, alt: 8, prof: 2.4 }],
    corpo: (Q, s) => { Object.assign(Q, { spineFlex: 22, bodyPitch: 24, headPitch: -30, hipAbdL: 20, hipAbdR: 20 }); pgAgachar(Q, 0.4, 0.24, [0.0, -0.08], [0.7, 0, 0.7]); },
    ir: k => ({ deitar: true, dist: rf => k.B.meiaProf + 0.6 + rf }),
    contatos: k => [1, -1].map(t => pgC(t, "palma", pgBaixo(k, t * 1.3, -k.meia[0] * 0.75), { dedos: k.B.frenteChao, cotovelo: [1, -0.8, 0] })), gesto: "garra", fechar: "envolver" },
  cavar: { desc: "Cavando com a pá: mão de cima no punho, a outra no meio do cabo, lâmina no chão", grupo: "usar ferramenta", maos: 2, modo: "carregar", teste: ["pa", {}],
    corpo: (Q, s) => { Object.assign(Q, { spineFlex: 26, bodyPitch: 16, headPitch: -22 }); pgPasso(Q, s, 0.3, -0.24, 0.2, 0.15); },
    lugar: k => { const d = pgNorm(pgComb([k.B.frenteChao, -0.62], [UP, 0.78])), ponta = pgComb([k.B.cintura, 1], [k.B.frenteChao, 4.6], [UP, -(k.B.cintura[1] - k.g) + 0.05], [k.B.esqChao, -k.s * 0.3]); return { C: pgAdd(ponta, pgMul(d, k.meia[1])), ax: pgEixos(d, pgMul(k.B.frenteChao, -1)) }; },
    contatos: k => { const a = pgPega(k.o, k.g, "punho"), b = pgPega(k.o, k.g, "cabo"); return [pgC(-k.s, "forca", { P: a.P, N: UP }, { eixo: a.eixo, polegar: k.B.frenteChao, cotovelo: [0.6, -1, 0] }), pgC(k.s, "forca", { P: b.P, N: pgMul(k.B.frenteChao, -1) }, { eixo: b.eixo, polegar: UP, cotovelo: [0.8, -1, 0] })]; }, gesto: "segurar", fechar: "envolver" },
  alavancar: { desc: "Fazendo força numa alavanca fincada no chão, corpo pendurado no cabo (pé de cabra, alavanca, remo)", grupo: "usar ferramenta", maos: 2, modo: "carregar", teste: ["alavanca", {}],
    corpo: (Q, s) => { Object.assign(Q, { bodyPitch: 16, spineFlex: 12, headPitch: -16, [pgO(s, "ankleFlex")]: 18, [pgO(s, "toes")]: -40 }); pesEm(Q, { [pgL(s, "")]: [0.14, 0.24], [pgO(s, "")]: [0.14, -0.4] }, 0.16); },
    lugar: k => { const d = pgNorm(pgComb([k.B.frenteChao, -0.55], [UP, 0.83])), ponta = pgComb([k.B.cintura, 1], [k.B.frenteChao, 5.4], [UP, -(k.B.cintura[1] - k.g) + 0.2]); return { C: pgAdd(ponta, pgMul(d, k.meia[1])), ax: pgEixos(d, pgMul(k.B.esqChao, -1)) }; },
    contatos: k => { const a = pgPega(k.o, k.g, "topo"), b = pgPega(k.o, k.g, "meio"); return [pgC(k.s, "forca", { P: a.P, N: pgMul(k.B.frenteChao, -1) }, { eixo: a.eixo, polegar: UP, cotovelo: [0.6, -1, 0] }), pgC(-k.s, "forca", { P: pgAdd(a.P, pgMul(a.eixo, -0.9)), N: pgMul(k.B.frenteChao, -1) }, { eixo: a.eixo, polegar: UP, cotovelo: [0.6, -1, 0] })]; }, gesto: "segurar", fechar: "envolver" },
  subirDegrauComCarga: { desc: "Subindo um degrau com a carga no ombro (saco, caixa, tábua)", grupo: "carregar", maos: 2, modo: "carregar", teste: ["saco", {}],
    corpo: (Q, s) => { Object.assign(Q, { headRoll: -s * 10, spineFlex: 16, bodyPitch: 10, spineSide: -s * 6, [pgL(s, "hipFlex")]: 62, [pgL(s, "kneeFlex")]: 72, [pgL(s, "ankleFlex")]: -6, [pgO(s, "ankleFlex")]: 18, [pgO(s, "toes")]: -40, [pgO(s, "hipFlex")]: -10 }); },
    lugar: k => ACOES.cargaNoOmbro.lugar(k), contatos: k => ACOES.cargaNoOmbro.contatos(k), gesto: "garra", fechar: "envolver" }
};
const ALIAS_PEGADA = { "força": "forca", punho: "forca", cabo: "forca", "pinça": "pinca", alca: "pelaAlca", "alça": "pelaAlca", "pela alca": "pelaAlca", "pela alça": "pelaAlca", mala: "pelaAlca", gancho: "pelaAlca", balde: "pelaAlca",
  palma: "bandeja", "por baixo": "porBaixo", "duas maos": "aFrente", "duas mãos": "aFrente", duasMaos: "aFrente", carregar: "aFrente", abraco: "abracado", "abraço": "abracado", "no peito": "abracado", abracar: "abracado", "abraçar": "abracado",
  "acima da cabeca": "acimaDaCabeca", "acima da cabeça": "acimaDaCabeca", erguer: "acimaDaCabeca", levantar: "levantarDoChao", "do chao": "levantarDoChao", "do chão": "levantarDoChao", agachar: "levantarDoChao",
  ombro: "noOmbro", "no ombro": "noOmbro", "carga no ombro": "cargaNoOmbro", "nas costas": "sacoNasCostas", costas: "sacoNasCostas", mochila: "nasCostas", "debaixo do braco": "debaixoDoBraco", "debaixo do braço": "debaixoDoBraco",
  quadril: "noQuadril", "no quadril": "noQuadril", empurrando: "empurrar", empurrar: "empurrar", puxar: "puxarCorda", corda: "puxarCorda", "cabo de guerra": "puxarCorda", rebocar: "puxarCordaNasCostas", arrastar: "arrastar",
  rolar: "rolar", "levantamento terra": "levantamentoTerra", terra: "levantamentoTerra", "carrinho de mao": "carrinhoDeMao", "carrinho de mão": "carrinhoDeMao", carrinho: "empurrarCarrinho", diabo: "carrinhoCarga", rodinhas: "malaDeRodinhas",
  arremessar: "arremessar", jogar: "arremessar", "pegar no alto": "alcancarAlto", prateleira: "alcancarAlto", cavar: "cavar", "pá": "cavar", alavanca: "alavancar", golpe: "golpeAcima", marretada: "golpeAcima", "na cintura": "vigaNaCintura", degrau: "subirDegrauComCarga", ajoelhado: "ajoelhadoLevantando", "virar pneu": "virarPneu" };
/* nomes antigos (v1) continuam valendo */
Object.assign(ALIAS_PEGADA, { empurrando: "empurrar", duasmaos: "aFrente", gancho: "pelaAlca" });
const PEGADAS = Object.fromEntries(Object.entries(ACOES).map(([k, a]) => [k, a.desc]));

/* ---------- penetrações ---------- */
function pgPenetracao(it, o, ground, lados, bracoTodo) {
  const p = it.params, rig = colliderRig({ ...p, wy: ground - restGround(p) }, { level: "coarse" });
  const ignorar = new Set(lados.flatMap(s => s > 0 ? ["maoE", "antebracoE"].concat(bracoTodo ? ["bracoE"] : []) : ["maoD", "antebracoD"].concat(bracoTodo ? ["bracoD"] : [])));
  const corpo = { ...rig, caps: rig.caps.filter(c => !ignorar.has(c.nome)) };
  return manifoldObject(corpo, colliderObject(o, ground), { tol: 0.03, margin: 0.05, max: 24 });
}
/* gira o objeto em volta de um eixo (no mundo) que passa por "pivo" e assenta no chão */
function pgGirarObjeto(o, ground, eixo, ang, pivo) {
  const pose = objectRigidPose(o, ground), cols = [0, 1, 2].map(i => pgRot([pose.M[i], pose.M[3 + i], pose.M[6 + i]], eixo, ang));
  const T = pgAdd(pivo, pgRot(pgSub(pose.T, pivo), eixo, ang));
  setRigidObjectPose(o, rigidFrame(pgMatriz(...cols), T), ground); o.emAr = true; delete o.sobre; pousarObjetoRigido(o, ground); o.emAr = true;
}
/* o corpo vai até o objeto: posição e orientação do manequim (e o objeto deitado/inclinado quando a ação pede) */
function pgIrAte(it, k, a) {
  const p = it.params, plan = a.ir(k), o = k.o, ground = k.g, sem = k.opts.manterObjeto;
  const de = () => { const d = pgPerp(pgSub(k.C, [p.wx || 0, k.C[1], p.wz || 0]), UP); return pgLen(pgSub([k.C[0], 0, k.C[2]], [p.wx || 0, 0, p.wz || 0])) > 0.2 ? d : pgMul(k.B.frenteChao, 1); };
  if (plan.deitar && !sem) { /* deita: y local na horizontal (apontando para o manequim), z local para cima */
    const Y = pgMul(de(), -1), Z = UP, X = pgNorm(pgCross(Y, Z));
    setRigidObjectPose(o, rigidFrame(pgMatriz(X, Y, Z), [k.C[0], ground + 3, k.C[2]]), ground); delete o.sobre; pousarObjetoRigido(o, ground); o.emAr = true; k.atualizar();
  }
  const rf = d => [0, 1, 2].reduce((acc, i) => acc + Math.abs(pgDot(k.ax[i], d)) * k.meia[i], 0);
  const dist = d => typeof plan.dist === "function" ? plan.dist(rf(d)) : plan.dist;
  let pose = objectRigidPose(o, ground), F = pgPerp(rigidDirection(pose, [0, 0, 1]), UP), olhar, pos;
  if (plan.alca) {
    const pg = pegasDoObjeto(o), alcas = () => { const ps = objectRigidPose(o, ground), al = [pg.alcaE, pg.alcaD, pg.alca].filter(Boolean).map(q => rigidPoint(ps, q.P)); return pgMul(al.reduce((acc, q) => pgAdd(acc, q), [0, 0, 0]), 1 / al.length); };
    const atras = pgPerp(pgSub(alcas(), k.C), UP); /* das alças para fora do objeto */
    if ((plan.inclinar || plan.levantar) && !sem) {
      const X = pgNorm(pgPerp(rigidDirection(pose, [1, 0, 0]), UP)), Zw = pgNorm(pgCross(X, UP)), sg = pgDot(Zw, atras) > 0 ? 1 : -1;
      if (plan.levantar) pgGirarObjeto(o, ground, X, -sg * plan.levantar, rigidPoint(pose, [0, 1.3, (o.prof || 13) / 2 - 1.4]));
      else pgGirarObjeto(o, ground, X, sg * Math.abs(plan.inclinar), pose.T);
      k.atualizar();
    }
    const m = alcas();
    if (plan.atras) { olhar = atras; pos = pgComb([m, 1], [atras, dist(atras)], [pgNorm([atras[2], 0, -atras[0]]), -k.s * 0.9]); }
    else { olhar = pgMul(atras, -1); pos = pgAdd(m, pgMul(atras, dist(atras))); }
    pgMoverManequim(it, pos[0], pos[2], olhar); k.atualizar();
    return;
  }
  if (plan.olhar || plan.deCostas) { const d = de(); pos = pgSub(k.C, pgMul(d, dist(d))); olhar = plan.deCostas ? pgMul(d, -1) : d; }
  else {
    let d = de();
    if (plan.frente === "largura") { const X = pgPerp(rigidDirection(pose, [1, 0, 0]), UP), Z = pgNorm(pgCross(X, UP)); d = pgDot(Z, d) >= 0 ? Z : pgMul(Z, -1); }
    if (plan.deLado) { const Zo = pgPerp(rigidDirection(pose, [0, 0, 1]), UP), lado = pgNorm(pgCross(UP, Zo)); d = pgDot(lado, d) >= 0 ? lado : pgMul(lado, -1); }
    pos = pgSub(k.C, pgMul(d, dist(d))); olhar = d;
  }
  pgMoverManequim(it, pos[0], pos[2], olhar);
  k.atualizar(); k.hMao = plan.alturaMao ? Math.min(ground + plan.alturaMao, k.C[1] + k.alto / 2 - 0.9) - k.C[1] : 0;
}

/* m.segurarComo(objeto, ação, {mao, orientacao, manterCorpo, manterObjeto}) */
function segurarComo(it, o, tipo0, opts = {}) {
  const t0 = String(tipo0 || "").trim(), tipo = ACOES[t0] ? t0 : ALIAS_PEGADA[t0.toLowerCase()] || Object.keys(ACOES).find(k => k.toLowerCase() === t0.toLowerCase());
  if (!tipo) throw new Error("Pegada desconhecida: “" + tipo0 + "”. Opções: " + Object.keys(ACOES).join(", ") + ".");
  const A = ACOES[tipo], ground = restGround(SCN.list[0].params), s = String(opts.mao || "direita").toLowerCase().startsWith("e") ? 1 : -1;
  if (o.gripV3) releaseRigidGrip(SCN.list.find(x => x.id === o.gripV3.mannequinId) || it, o, ground, { modo: "manter" });
  delete o.grip; pgSoltarToques(o); pgRemoverCordasDe(it, o);
  const lados = A.maos === 2 ? [1, -1] : [s];
  SCN.objetos.forEach(q => { if (q !== o && q.gripV3?.mannequinId === it.id && (lados.includes(q.gripV3.side) || lados.includes(q.gripV3.secundaria?.side))) releaseRigidGrip(it, q, ground, { modo: "manter" }); });
  const antes = { ...it.params }, antesO = { x: o.x, z: o.z, base: o.base, giro: o.giro, rot3: o.rot3, emAr: o.emAr, sobre: o.sobre };
  try {
    const Q = it.params;
    if (!opts.manterCorpo) pgPoseBase(Q);
    const k = { it, o, s, g: ground, opts, orient: opts.orientacao ? String(opts.orientacao).toLowerCase().replace("é", "e").replace(" ", "") === "empe" ? "empe" : String(opts.orientacao).toLowerCase() : null };
    k.atualizar = () => { const cx = pgCaixaObjeto(o, ground); k.S = cx.S; k.C = cx.centro; k.meia = cx.meia; k.ax = cx.eixos; k.B = marcosDoCorpo(it, ground);
      k.alto = [0, 1, 2].reduce((acc, i) => acc + Math.abs(k.ax[i][1]) * k.meia[i], 0) * 2; };
    k.atualizar();
    if (!opts.manterCorpo && A.corpo) A.corpo(Q, s, k);
    k.atualizar();
    if (A.modo === "ir") { pgIrAte(it, k, A); k.atualizar(); }
    else { const pl = A.lugar(k); pgColocar(o, pl.C, pl.ax, ground); k.atualizar(); }
    const Ad = armDims(Q), alcance = Ad.L1 + Ad.L2 + 0.5 * Ad.LH - 0.25;
    let res = [], dedos = [], empurrado = 0, aproximado = 0;
    for (let volta = 0; volta < 7; volta++) {
      const cs = A.contatos(k).filter(Boolean), alvos = cs.map(c => ({ c, a: pgAlvoDoContato(it, c) }));
      /* alcance: mais longe que o braço → aproxima (o objeto ou o corpo) */
      let falta = 0, dirF = [0, 0, 0];
      for (const { c, a } of alvos) { const sh = c.s > 0 ? k.B.oE : k.B.oD, v = pgSub(a.Pc, sh), d = pgLen(v); if (d > alcance) { falta = Math.max(falta, d - alcance); dirF = pgAdd(dirF, pgMul(pgNorm(v), d - alcance)); } }
      if (falta > 0.05 && volta < 5) {
        const passo = pgMul(pgNorm(dirF), falta + 0.05); aproximado += falta;
        if (A.modo === "ir") {
          /* alvo baixo: primeiro curva mais o tronco; só anda se ainda faltar */
          if (passo[1] < -0.25 && !opts.manterCorpo && (Q.spineFlex || 0) < 55) Q.spineFlex = Math.min(55, (Q.spineFlex || 0) + 9);
          else { const h = pgPerp(passo, UP), L = Math.hypot(passo[0], passo[2]); Q.wx = (Q.wx || 0) + h[0] * L; Q.wz = (Q.wz || 0) + h[2] * L; } }
        else { const pose = objectRigidPose(o, ground); setRigidObjectPose(o, rigidFrame(pose.M, pgSub(pose.T, passo)), ground); }
        k.atualizar(); continue;
      }
      res = alvos.map(({ c, a }) => pgMelhorMao(it, c, a, ground));
      for (const { c } of alvos) aplicarGesto(Q, c.s, A.gesto || "segurar");
      dedos = A.fechar === "nao" ? [] : alvos.map(({ c }) => pgFecharDedos(it, c.s, k.S, ground, c.como === "palma" && A.fechar === "apoiar" ? "apoiar" : "envolver"));
      if (A.semColisao || volta >= 5) break;
      const hits = pgPenetracao(it, o, ground, alvos.map(x => x.c.s), A.bracoEncosta).filter(h => !/^mao/.test(h.pa));
      if (!hits.length) break;
      const prof = Math.max(...hits.map(h => h.prof)), dir = pgNorm(hits.reduce((acc, h) => pgAdd(acc, pgMul(h.n, -(h.prof + 0.01))), [0, 0, 0]));
      let dirH = pgPerp(dir, UP); if (Math.hypot(dir[0], dir[2]) < 0.3) dirH = A.modo === "ir" ? pgMul(k.B.frenteChao, -1) : k.B.frenteChao;
      const passo = pgMul(A.empurrarVertical ? dir : dirH, prof + 0.1); empurrado += prof + 0.1;
      if (A.modo === "ir") { Q.wx = (Q.wx || 0) - passo[0]; Q.wz = (Q.wz || 0) - passo[2]; }
      else { const pose = objectRigidPose(o, ground); setRigidObjectPose(o, rigidFrame(pose.M, pgAdd(pose.T, passo)), ground); }
      k.atualizar();
    }
    const restam = A.semColisao ? [] : pgPenetracao(it, o, ground, lados, A.bracoEncosta).filter(h => !/^mao/.test(h.pa));
    /* vínculo: carregar → o objeto segue a mão; ir → a mão encosta (contato permitido) */
    if (A.modo === "carregar" && !opts.soltar) {
      beginRigidGrip(it, o, res[0].s, ground, { modo: "preservar", reach: 100, objetos: SCN.objetos });
      if (res[1]) beginRigidGrip(it, o, res[1].s, ground, { modo: "preservar", reach: 100, segunda: true, preservarPoseSecundaria: true, objetos: SCN.objetos });
    } else { o.toques = res.map(r => ({ mannequinId: it.id, side: r.s })); }
    if (A.corda) pgCriarCorda(it, o, k, A);
    const pior = res.reduce((m, r) => Math.max(m, r.erro), 0), dentro = dedos.flat().reduce((m, d) => Math.max(m, d.entra), 0);
    return { objeto: o.nome || o.tipo, pegada: tipo, grupo: A.grupo, maos: res.map(r => r.s > 0 ? "esquerda" : "direita"),
      alcance: pior <= 0.35 ? "ok" : "a palma ficou a " + Math.round(pior * 11.4) + " cm do ponto", palmaGiro: res.map(r => Math.round(r.angulo)),
      dedosEntram: dentro, aproximado: Math.round(aproximado * 11.4), empurradoParaFora: Math.round(empurrado * 11.4), atravessa: restam.slice(0, 3).map(h => h.pa) };
  } catch (e) { Object.assign(it.params, antes); Object.assign(o, antesO); if (!antesO.rot3) delete o.rot3; throw e; }
}
function pgSoltarToques(o) { delete o.toques; }

/* ---------- corda / corrente entre a mão e o objeto ---------- */
function pgCriarCorda(it, o, k, A) {
  const ground = k.g, pose = objectRigidPose(o, ground), C = k.C, mao = A.maos === 2 ? -k.s : k.s;
  /* ponto de amarra: a pega (argola, nó…) ou a face do objeto voltada para o manequim */
  const pg = pegasDoObjeto(o), nomeP = ["argola", "no", "alca"].find(n => pg[n]);
  let local;
  if (nomeP) local = pg[nomeP].P.slice();
  else { const hand = handFrameV3(it, mao, ground), r = pgRaio(k.S, pgAdd(C, pgMul(pgPerp(pgSub(hand.T, C), UP), 30)), pgPerp(pgSub(C, hand.T), UP)); const P = r ? pgAdd(r.P, [0, Math.min(0.6, k.meia[1] * 0.6) - k.meia[1] * 0.3, 0]) : C; const d = pgSub(P, pose.T); local = [0, 1, 2].map(i => d[0] * pose.M[i] + d[1] * pose.M[3 + i] + d[2] * pose.M[6 + i]); }
  const corda = { tipo: "corda", nome: "corda de " + (o.nome || TIPOS_OBJETO[o.tipo]?.nome || o.tipo), x: 0, z: 0, giro: 0, larg: 0.2, prof: 0.2, alt: 0.2, raioCorda: o.tipo === "ancora" ? 0.07 : 0.09, corrente: o.tipo === "ancora",
    corda: { manequim: it.id, maos: A.maos === 2 ? [k.s, -k.s] : [k.s], objeto: o.id, local, sobra: 3.5 }, pontosCorda: [[0, 0, 0], [0, 0.1, 0]] };
  if (!SCN.objetos.some(q => q.corda && q.corda.objeto === o.id && q.corda.manequim === it.id)) {
    corda.id = novoIdObjeto(); SCN.objetos.push(corda); corda.hue = nextHue(corda);
  }
  atualizarCordas();
}
function pgRemoverCordasDe(it, o) { for (let i = SCN.objetos.length - 1; i >= 0; i--) { const q = SCN.objetos[i]; if (q.corda && (q.corda.objeto === o.id)) SCN.objetos.splice(i, 1); } }
/* recalcula todas as cordas: catenária da mão até a amarra, passando pelas duas mãos, e uma sobra no chão atrás */
function atualizarCordas() {
  if (!SCN.list.length) return;
  const ground = restGround(SCN.list[0].params);
  for (const q of SCN.objetos) {
    if (!q.corda) continue;
    const it = SCN.list.find(m => m.id === q.corda.manequim), o = SCN.objetos.find(x => x.id === q.corda.objeto);
    if (!it || !o) continue;
    const amarra = rigidPoint(objectRigidPose(o, ground), q.corda.local), maos = q.corda.maos.map(s => handFrameV3(it, s, ground).T);
    const pts = [amarra];
    /* catenária simples entre a amarra e a primeira mão (curva para baixo) */
    const a = maos[maos.length - 1], n = 14, L = pgLen(pgSub(a, amarra)), sag = Math.min(1.4, 0.05 * L);
    for (let i = 1; i <= n; i++) { const t = i / n, P = pgComb([amarra, 1 - t], [a, t]); pts.push(pgAdd(P, [0, -4 * sag * t * (1 - t), 0])); }
    for (let i = maos.length - 2; i >= 0; i--) pts.push(maos[i]);
    /* a sobra: cai da última mão até o chão e enrola um pouco */
    const ult = pts[pts.length - 1], dir = pgPerp(pgSub(ult, amarra), UP), chao = ground + 0.1, sobra = q.corda.sobra || 3;
    const quebra = pgAdd([ult[0], chao, ult[2]], pgMul(dir, 0.9));
    for (let i = 1; i <= 6; i++) { const t = i / 6; pts.push(pgAdd(pgComb([ult, 1 - t], [quebra, t]), [0, Math.sin(t * Math.PI) * 0.3, 0])); }
    for (let i = 1; i <= 10; i++) { const ang = i / 10 * Math.PI * 1.6, r = 0.9 - i * 0.04; pts.push(pgComb([quebra, 1], [dir, sobra * 0.35 + Math.sin(ang) * r], [pgNorm([dir[2], 0, -dir[0]]), Math.cos(ang) * r - r])); pts[pts.length - 1][1] = chao; }
    q.x = 0; q.z = 0; q.base = 0; q.giro = 0; delete q.rot3; q.emAr = true; q.sobre = null;
    q.pontosCorda = pts.map(P => [P[0], P[1] - ground, P[2]]).map(P => P.map(v => Math.round(v * 1000) / 1000));
  }
}
SCN.aposApoios = (SCN.aposApoios || []).filter(f => f.name !== "atualizarCordas").concat([atualizarCordas]);

function listaPegadas() { return Object.entries(ACOES).map(([tipo, a]) => ({ tipo, descricao: a.desc, grupo: a.grupo, maos: a.maos, modo: a.modo === "ir" ? "o corpo vai até o objeto" : "o objeto vem para a mão", teste: a.teste[0], testeMedidas: a.teste[1] })); }
export { PEGADAS, ACOES, ALIAS_PEGADA, segurarComo, listaPegadas, marcosDoCorpo, atualizarCordas, pgResolverMao, pgAlvoDoContato, pgFecharDedos, pgSdf, pgRaio, pgMaisPerto };
