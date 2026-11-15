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
import { pontosLocaisDoObjeto, pontoDoObjeto } from "../engine/index.js";

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
  subirDegrauComCarga: { semAfastar: true, desc: "Subindo um degrau com a carga no ombro (saco, caixa, tábua)", grupo: "carregar", maos: 2, modo: "carregar", teste: ["saco", {}],
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

/* ===== objetos de MÃO (armas, escudos, mágicos, instrumentos, dia a dia): o objeto vai para a mão pela PEGA marcada ===== */
/* põe o objeto com a pega "nome" no ponto H, com o eixo y local ao longo de Y e o z local perto de F (ou eixos ax prontos) */
function pgPorPega(k, nome, H, Y, F, ax0) {
  const pgs = pegasDoObjeto(k.o), pg = pgs[nome] || pgs.cabo || pgs.punho || pgs.alca || Object.values(pgs)[0], ax = ax0 || pgEixos(Y, F);
  const cx = pgCaixaObjeto({ ...k.o, rot3: undefined, x: 0, z: 0, base: 0, giro: 0 }, 0).centroLocal, P = pg ? pg.P : [0, 0, 0], d = pgSub(cx, P);
  return { C: pgComb([H, 1], [ax[0], d[0]], [ax[1], d[1]], [ax[2], d[2]]), ax };
}
/* contato de força numa pega (cabo): ponto na superfície do lado da normal da pega */
function pgNaPega(k, s, nome, extra) { const q = [nome, "cabo", "punho", "alca", "copo", "palma", ...Object.keys(pegasDoObjeto(k.o))].reduce((a, n) => a || pgPega(k.o, k.g, n), null); if (!q) return pgC(s, "forca", pgMaisPerto(k.S, k.C), Object.assign({ eixo: k.ax[1], polegar: k.ax[1] }, extra || {})); const P = pgMaisPerto(k.S, pgAdd(q.P, pgMul(q.N, 0.6)));
  return pgC(s, "forca", { P: P.P || P, N: q.N }, Object.assign({ eixo: q.eixo, polegar: q.eixo, cotovelo: [0.8, -1, -0.2] }, extra || {})); }
/* contato com a palma num ponto local do objeto, vindo de fora pela direção "de" (mundo) */
function pgPalmaEm(k, s, local, de, extra) { const pose = objectRigidPose(k.o, k.g), Pw = rigidPoint(pose, local), r = pgRaio(k.S, pgAdd(Pw, pgMul(de, 4)), pgMul(de, -1)) || { P: Pw, N: de };
  return pgC(s, "palma", r, Object.assign({ dedos: UP, cotovelo: [0.6, -1, 0] }, extra || {})); }
const pgOmb = (k, s) => s > 0 ? k.B.oE : k.B.oD;
const pgMao1 = (desc, grupo, teste, H, Y, F, extra) => Object.assign({ desc, grupo, maos: 1, modo: "carregar", teste: [teste, {}], gesto: "segurar", fechar: "envolver",
  lugar: k => pgPorPega(k, (extra && extra.pega) || "cabo", H(k), Y(k), F(k)), contatos: k => [pgNaPega(k, k.s, (extra && extra.pega) || "cabo", extra && extra.contato)] }, extra || {});
Object.assign(ACOES, {
  /* ----- lâminas e armas de uma mão ----- */
  empunharGuarda: pgMao1("Uma mão no cabo, em guarda: ponta à frente e para cima (katana, espada curta, sabre, adaga, maça, machado, varinha)", "empunhar", "espadaCurta",
    k => pgComb([k.B.cintura, 1], [k.B.frenteChao, 2.3], [UP, 1.5], [k.B.esqChao, k.s * 0.9]), k => pgComb([k.B.frenteChao, 0.62], [UP, 0.78], [k.B.esqChao, -k.s * 0.12]), k => pgMul(k.B.esqChao, -k.s),
    { corpo: (Q, s) => { Object.assign(Q, { spineTwist: -s * 8, headPitch: -4 }); pgPasso(Q, s, 0.32, -0.3, 0.1, 0.13); } }),
  adagaReversa: pgMao1("Adaga/kunai em pegada invertida: lâmina para baixo, junto ao antebraço (ninja, assassino)", "empunhar", "adaga",
    k => pgComb([k.B.peito, 1], [k.B.frenteChao, 2.0], [UP, -0.4], [k.B.esqChao, k.s * 1.2]), k => pgComb([UP, -0.85], [k.B.frenteChao, -0.35]), k => pgMul(k.B.esqChao, k.s),
    { corpo: (Q, s) => { Object.assign(Q, { spineFlex: 10, bodyPitch: 5 }); pgAgachar(Q, 0.25, 0.26, [0.1, -0.12], [0.8, 0, 0.8]); } }),
  armaApontada: pgMao1("Braço esticado apontando o objeto para a frente (espada, varinha, lanterna, tocha, cajado, dedo acusador com arma)", "empunhar", "varinha",
    k => pgComb([pgOmb(k, k.s), 1], [k.B.frenteChao, 4.6], [UP, -0.3], [k.B.esqChao, -k.s * 0.4]), k => pgComb([k.B.frenteChao, 0.97], [UP, 0.1]), k => UP,
    { corpo: (Q, s) => { Object.assign(Q, { spineTwist: s * 10 }); pgPasso(Q, s, 0.3, -0.26, 0.05, 0.12); } }),
  armaErguida: pgMao1("Objeto erguido acima da cabeça com o braço esticado (tocha, espada da vitória, cajado, bandeira, orbe)", "empunhar", "tocha",
    k => pgComb([pgOmb(k, k.s), 1], [UP, 4.9], [k.B.frenteChao, 0.7], [k.B.esqChao, k.s * 0.4]), k => pgComb([UP, 0.95], [k.B.frenteChao, 0.25]), k => k.B.frenteChao,
    { corpo: (Q, s) => { Object.assign(Q, { headPitch: -14, spineFlex: -6 }); pgPasso(Q, -s, 0.22, -0.2, 0.03, 0.12); } }),
  cajadoAoLado: pgMao1("Cajado/lança/bandeira em pé ao lado do corpo, mão na altura do peito (guarda, mago parado)", "empunhar", "cajadoMagico",
    k => pgComb([pgOmb(k, k.s), 1], [k.B.frenteChao, 0.9], [k.B.esqChao, k.s * 0.9], [UP, -2.1]), k => UP, k => pgMul(k.B.esqChao, k.s),
    { corpo: (Q, s) => { pgPasso(Q, s, 0.1, -0.08, 0.01, 0.12, false); } }),
  /* ----- duas mãos ----- */
  lancaInvestida: { desc: "Duas mãos na haste, ponta para a frente na altura da cintura: investida (lança, tridente, bastão, foice, rifle com baioneta)", grupo: "empunhar", maos: 2, modo: "carregar", teste: ["tridente", {}], gesto: "segurar", fechar: "envolver",
    corpo: (Q, s) => { Object.assign(Q, { spineFlex: 10, bodyPitch: 6, spineTwist: s * 18 }); pgPasso(Q, s, 0.4, -0.38, 0.14, 0.13); },
    lugar: k => pgPorPega(k, "cabo", pgComb([k.B.cintura, 1], [k.B.frenteChao, 2.6], [UP, 0.5], [k.B.esqChao, -k.s * 0.2]), pgComb([k.B.frenteChao, 0.97], [UP, 0.12]), UP),
    contatos: k => [pgNaPega(k, -k.s, "cabo", { polegar: k.B.frenteChao }), pgNaPega(k, k.s, "cabo2", { polegar: k.B.frenteChao })] },
  bastaoGuarda: { desc: "Bastão na horizontal à frente, duas mãos afastadas (bastão bo, lança, vassoura): guarda de bastão", grupo: "empunhar", maos: 2, modo: "carregar", teste: ["bastaoBo", {}], gesto: "segurar", fechar: "envolver",
    corpo: (Q, s) => { Object.assign(Q, { spineFlex: 6 }); pgAgachar(Q, 0.18, 0.3, [0.08, -0.1], [0.6, 0, 0.6]); },
    lugar: k => pgPorPega(k, "meio", pgComb([k.B.cintura, 1], [k.B.frenteChao, 2.4], [UP, 1.6], [k.B.esqChao, -k.s * 1.4]), pgComb([k.B.esqChao, 0.95], [UP, 0.3]), k.B.frenteChao),
    contatos: k => [pgNaPega(k, -k.s, "meio", { polegar: k.B.esqChao }), pgNaPega(k, k.s, "meio2", { polegar: k.B.esqChao })] },
  /* ----- escudo ----- */
  escudoDefesa: { desc: "Escudo no antebraço à frente do corpo, defendendo (broquel, escudo redondo, de cavaleiro, torre)", grupo: "defender", maos: 1, modo: "carregar", teste: ["escudoCavaleiro", {}], gesto: "segurar", fechar: "envolver", bracoEncosta: true,
    corpo: (Q, s) => { Object.assign(Q, { spineFlex: 8, bodyPitch: 4, spineTwist: -s * 10, headPitch: 4 }); pgPasso(Q, s, 0.34, -0.32, 0.12, 0.14); },
    lugar: k => pgPorPega(k, "alca", pgComb([k.B.peito, 1], [k.B.frenteChao, 2.3], [UP, -0.3], [k.B.esqChao, k.s * 0.7]), pgComb([UP, 1], [k.B.frenteChao, -0.1]), pgComb([k.B.frenteChao, 1], [k.B.esqChao, k.s * 0.25])),
    contatos: k => [pgNaPega(k, k.s, "alca", { polegar: UP, cotovelo: [0.4, -1, 0.3], folga: 0.04 })] },
  /* ----- armas de fogo e de distância ----- */
  pistolaMirando: { desc: "Pistola com o braço esticado, mirando à frente na altura dos olhos", grupo: "mirar", maos: 1, modo: "carregar", teste: ["pistola", {}], gesto: "segurar", fechar: "envolver",
    corpo: (Q, s) => { Object.assign(Q, { headPitch: 2, spineTwist: s * 14 }); pgPasso(Q, -s, 0.24, -0.24, 0.04, 0.14); },
    lugar: k => pgPorPega(k, "punho", pgComb([pgOmb(k, k.s), 1], [k.B.frenteChao, 4.4], [UP, 0.1], [k.B.esqChao, -k.s * 0.5]), UP, k.B.frenteChao),
    contatos: k => [pgNaPega(k, k.s, "punho", { polegar: k.B.frenteChao })] },
  pistolaDuasMaos: { desc: "Pistola com as duas mãos (base Weaver/isósceles), braços à frente", grupo: "mirar", maos: 2, modo: "carregar", teste: ["pistola", {}], gesto: "segurar", fechar: "envolver",
    corpo: (Q, s) => { Object.assign(Q, { spineFlex: 6, bodyPitch: 4 }); pgPasso(Q, -s, 0.26, -0.26, 0.08, 0.15); },
    lugar: k => pgPorPega(k, "punho", pgComb([k.B.peito, 1], [k.B.frenteChao, 4.2], [UP, 1.0]), UP, k.B.frenteChao),
    contatos: k => [pgNaPega(k, k.s, "punho", { polegar: k.B.frenteChao }), pgPalmaEm(k, -k.s, [0, 0.6, -0.33], pgMul(k.B.esqChao, -k.s), { dedos: pgMul(k.B.esqChao, k.s) })] },
  rifleMirando: { desc: "Rifle/besta no ombro, mirando (coronha no ombro, mão da frente sob o cano)", grupo: "mirar", maos: 2, modo: "carregar", teste: ["rifle", {}], gesto: "segurar", fechar: "envolver",
    corpo: (Q, s) => { Object.assign(Q, { headRoll: s * 10, headPitch: 4, spineTwist: s * 22, spineFlex: 6 }); pgPasso(Q, -s, 0.3, -0.3, 0.08, 0.16); },
    lugar: k => pgPorPega(k, "punho", pgComb([pgOmb(k, k.s), 1], [k.B.frenteChao, 4.5], [UP, -0.75], [k.B.esqChao, -k.s * 0.25]), UP, k.B.frenteChao),
    contatos: k => [pgNaPega(k, k.s, "punho", { polegar: k.B.frenteChao }), pgNaPega(k, -k.s, "frente", { polegar: k.B.frenteChao, cotovelo: [0.3, -1, 0.3] })] },
  bestaMirando: { desc: "Besta no ombro, mirando (coronha no ombro, mão da frente sob a besta)", grupo: "mirar", maos: 2, modo: "carregar", teste: ["besta", {}], gesto: "segurar", fechar: "envolver",
    corpo: (Q, s) => { Object.assign(Q, { headRoll: s * 10, headPitch: 4, spineTwist: s * 22, spineFlex: 6 }); pgPasso(Q, -s, 0.3, -0.3, 0.08, 0.16); },
    lugar: k => pgPorPega(k, "punho", pgComb([pgOmb(k, k.s), 1], [k.B.frenteChao, 1.9], [UP, -0.7], [k.B.esqChao, -k.s * 0.35]), k.B.frenteChao, UP),
    contatos: k => [pgNaPega(k, k.s, "punho", { polegar: k.B.frenteChao }), pgNaPega(k, -k.s, "frente", { polegar: k.B.frenteChao, cotovelo: [0.3, -1, 0.3] })] },
  rifleDescansado: { desc: "Rifle com o cano para baixo, à frente do corpo (pronto baixo, patrulha)", grupo: "mirar", maos: 2, modo: "carregar", teste: ["rifle", {}], gesto: "segurar", fechar: "envolver",
    corpo: (Q, s) => { pgPasso(Q, s, 0.14, -0.12, 0.02, 0.12, false); },
    lugar: k => pgPorPega(k, "punho", pgComb([k.B.cintura, 1], [k.B.frenteChao, 1.8], [UP, 0.8], [k.B.esqChao, -k.s * 0.9]), UP, pgNorm(pgComb([k.B.frenteChao, 0.6], [UP, -0.55], [k.B.esqChao, k.s * 0.45]))),
    contatos: k => [pgNaPega(k, k.s, "punho"), pgNaPega(k, -k.s, "frente")] },
  arcoPuxando: { desc: "Arco com o braço esticado e a outra mão puxando a corda até o rosto (arqueiro)", grupo: "mirar", maos: 2, modo: "carregar", teste: ["arco", {}], gesto: "segurar", fechar: "envolver",
    corpo: (Q, s) => { Object.assign(Q, { headYaw: -s * 70, spineTwist: s * 12 }); pgPasso(Q, s, 0.26, -0.3, 0.04, 0.2); },
    lugar: k => { const lado = pgMul(k.B.esqChao, k.s); return pgPorPega(k, "punho", pgComb([pgOmb(k, k.s), 1], [lado, 4.6], [UP, 0.1]), UP, null, [lado, UP, pgNorm(pgCross(lado, UP))]); },
    contatos: k => { const lado = pgMul(k.B.esqChao, k.s), q = pgPega(k.o, k.g, "punho"); return [q ? pgC(k.s, "forca", { P: pgMaisPerto(k.S, pgAdd(q.P, pgMul(q.N, 0.6))).P || q.P, N: q.N }, { eixo: UP, polegar: UP, cotovelo: [0, -1, 0] }) : null,
      pgC(-k.s, "forca", { P: pgComb([k.B.cab, 1], [lado, 0.2], [UP, -0.9], [pgMul(lado, -1), 0.9]), N: pgMul(lado, -1) }, { eixo: UP, polegar: lado, cotovelo: [0, 0, -1] })]; } },
  /* ----- instrumentos ----- */
  violaoTocando: { desc: "Tocando violão/guitarra: braço do instrumento para o lado, uma mão no braço e a outra nas cordas", grupo: "tocar", maos: 2, modo: "carregar", teste: ["violao", {}], gesto: "segurar", fechar: "envolver",
    corpo: (Q, s) => { Object.assign(Q, { headPitch: 14, headRoll: s * 6, spineFlex: 6 }); pgPasso(Q, s, 0.12, -0.1, 0.02, 0.13, false); },
    lugar: k => pgPorPega(k, "corpo", pgComb([k.B.cintura, 1], [k.B.frenteChao, k.B.meiaProf + 1.1], [UP, 0.4], [k.B.esqChao, -k.s * 0.4]), pgComb([k.B.esqChao, k.s * 0.94], [UP, 0.33]), k.B.frenteChao),
    contatos: k => [pgNaPega(k, k.s, "braco", { polegar: UP, cotovelo: [0.2, -1, 0.3] }), pgPalmaEm(k, -k.s, [0, 2.6, 0.5], k.B.frenteChao, { dedos: DN, cotovelo: [0.6, -1, 0.3] })] },
  violinoTocando: { desc: "Tocando violino: instrumento no ombro sob o queixo, mão no braço, a outra arqueando", grupo: "tocar", maos: 2, modo: "carregar", teste: ["violino", {}], gesto: "segurar", fechar: "envolver", semColisao: true,
    corpo: (Q, s) => { Object.assign(Q, { headRoll: s * 14, headYaw: s * 20, headPitch: 10 }); pgPasso(Q, -s, 0.12, -0.12, 0.02, 0.14, false); },
    lugar: k => { const Y = pgNorm(pgComb([k.B.frenteChao, 0.82], [k.B.esqChao, k.s * 0.55], [UP, 0.12])); return pgPorPega(k, "braco", pgComb([pgOmb(k, k.s), 1], [Y, 4.2], [UP, 0.4]), Y, UP); },
    contatos: k => [pgNaPega(k, k.s, "braco", { polegar: UP, cotovelo: [0, -1, 0.3] }), pgC(-k.s, "forca", { P: pgComb([pgOmb(k, -k.s), 1], [k.B.frenteChao, 3.0], [UP, 0.2], [k.B.esqChao, k.s * 1.4]), N: UP }, { eixo: k.B.esqChao, polegar: k.B.esqChao, cotovelo: [0.5, 0.3, 0] })] },
  flautaTocando: { desc: "Tocando flauta transversal: na horizontal, para o lado, bocal na boca, duas mãos", grupo: "tocar", maos: 2, modo: "carregar", teste: ["flauta", {}], gesto: "segurar", fechar: "envolver", semColisao: true,
    corpo: (Q, s) => { Object.assign(Q, { headYaw: s * 12, headRoll: -s * 6 }); pgPasso(Q, -s, 0.1, -0.1, 0.01, 0.13, false); },
    lugar: k => { const Y = pgNorm(pgComb([k.B.esqChao, 1], [k.B.frenteChao, 0.25], [UP, 0.1])), boca = pgComb([k.B.cab, 1], [k.B.frenteChao, 1.45], [UP, -1.05]), L = k.o.alt || 6;
      return pgPorPega(k, "cabo", pgAdd(boca, pgMul(Y, -L * 0.37)), Y, UP); },
    contatos: k => [pgPalmaEm(k, 1, [0, (k.o.alt || 6) * 0.62, 0], pgMul(k.B.frenteChao, -1), { dedos: UP, cotovelo: [1, -1, 0] }), pgPalmaEm(k, -1, [0, (k.o.alt || 6) * 0.3, 0], pgMul(k.B.frenteChao, -1), { dedos: UP, cotovelo: [1, -1, 0] })] },
  trompeteTocando: { desc: "Tocando trompete: campana para a frente, bocal nos lábios, mão nos pistões", grupo: "tocar", maos: 2, modo: "carregar", teste: ["trompete", {}], gesto: "segurar", fechar: "envolver", semColisao: true,
    corpo: (Q, s) => { Object.assign(Q, { headPitch: -6, spineFlex: -6 }); pgPasso(Q, s, 0.12, -0.12, 0.02, 0.13, false); },
    lugar: k => { const Y = pgNorm(pgComb([k.B.frenteChao, 1], [UP, 0.12])), boca = pgComb([k.B.cab, 1], [k.B.frenteChao, 1.3], [UP, -1.0]);
      return pgPorPega(k, "cabo", pgComb([boca, 1], [Y, 1.9], [UP, -0.62]), Y, DN); },
    contatos: k => [pgNaPega(k, k.s, "cabo", { polegar: k.B.frenteChao }), pgPalmaEm(k, -k.s, [0, 2.4, 0], pgMul(k.B.esqChao, -k.s), { dedos: UP })] },
  microfoneCantando: pgMao1("Microfone na boca, cantando ou discursando", "tocar", "microfone",
    k => pgComb([k.B.cab, 1], [k.B.frenteChao, 2.4], [UP, -2.6]), k => pgNorm(pgComb([UP, 0.75], [k.B.frenteChao, -0.65])), k => pgMul(k.B.esqChao, -k.s),
    { semColisao: true, corpo: (Q, s) => { Object.assign(Q, { headPitch: -10, spineFlex: -4 }); pgPasso(Q, s, 0.14, -0.12, 0.02, 0.13, false); } }),
  baquetaTocando: pgMao1("Baqueta erguida, prestes a bater no tambor", "tocar", "baqueta",
    k => pgComb([k.B.peito, 1], [k.B.frenteChao, 2.2], [UP, 0.6], [k.B.esqChao, k.s * 1.4]), k => pgNorm(pgComb([k.B.frenteChao, 0.6], [UP, 0.4], [k.B.esqChao, -k.s * 0.6])), k => UP),
  /* ----- dia a dia ----- */
  celularOlhando: { desc: "Olhando o celular na frente do peito, tela para o rosto", grupo: "cotidiano", maos: 1, modo: "carregar", teste: ["celular", {}], gesto: "segurar", fechar: "envolver",
    corpo: (Q, s) => { Object.assign(Q, { headPitch: 24, neckFlex: 12 }); pgPasso(Q, s, 0.08, -0.06, 0.01, 0.12, false); },
    lugar: k => pgPorPega(k, "palma", pgComb([k.B.peito, 1], [k.B.frenteChao, 2.6], [UP, 0.2], [k.B.esqChao, k.s * 0.4]), pgComb([UP, 0.6], [k.B.frenteChao, 0.35]), pgNorm(pgComb([k.B.frenteChao, -0.6], [UP, 0.75]))),
    contatos: k => [pgPalmaEm(k, k.s, [0, 0.45, 0], pgMul(pgNorm(pgComb([k.B.frenteChao, -0.6], [UP, 0.75])), -1), { dedos: UP, cotovelo: [0.6, -1, -0.2] })] },
  celularNaOrelha: { desc: "Falando ao telefone, celular na orelha", grupo: "cotidiano", maos: 1, modo: "carregar", teste: ["celular", {}], gesto: "segurar", fechar: "envolver", semColisao: true,
    corpo: (Q, s) => { Object.assign(Q, { headRoll: s * 8 }); pgPasso(Q, s, 0.08, -0.06, 0.01, 0.12, false); },
    lugar: k => pgPorPega(k, "palma", pgComb([k.B.cab, 1], [k.B.esqChao, k.s * 1.25], [UP, -0.7], [k.B.frenteChao, 0.3]), pgComb([UP, 0.5], [k.B.frenteChao, 0.85]), pgMul(k.B.esqChao, -k.s)),
    contatos: k => [pgPalmaEm(k, k.s, [0, 0.45, 0], pgMul(k.B.esqChao, k.s), { dedos: UP, cotovelo: [1, -1, 0] })] },
  livroLendo: { desc: "Lendo um livro aberto à frente, duas mãos nas bordas", grupo: "cotidiano", maos: 2, modo: "carregar", teste: ["livro", {}], gesto: "segurar", fechar: "envolver",
    corpo: (Q, s) => { Object.assign(Q, { headPitch: 22 }); pgPasso(Q, s, 0.08, -0.06, 0.01, 0.12, false); },
    lugar: k => ({ C: pgComb([k.B.peito, 1], [k.B.frenteChao, 2.5], [UP, -0.2]), ax: pgEixos(pgComb([UP, 0.75], [k.B.frenteChao, 0.4]), pgNorm(pgComb([k.B.frenteChao, -0.55], [UP, 0.8]))) }),
    contatos: k => [1, -1].map(t => pgC(t, "palma", pgLado(k, t, 0, 0), { dedos: UP, cotovelo: [1, -1, 0] })) },
  bebendo: pgMao1("Bebendo: xícara/copo/garrafa levado à boca", "cotidiano", "copoBebida",
    k => pgComb([k.B.cab, 1], [k.B.frenteChao, 1.9], [UP, -1.6], [k.B.esqChao, k.s * 0.35]), k => pgNorm(pgComb([UP, 0.8], [k.B.frenteChao, -0.55])), k => pgMul(k.B.esqChao, k.s),
    { semColisao: true, pega: "cabo", corpo: (Q, s) => { Object.assign(Q, { headPitch: -18 }); pgPasso(Q, s, 0.08, -0.06, 0.01, 0.12, false); } }),
  guardaChuvaAberto: pgMao1("Segurando o guarda-chuva aberto acima da cabeça", "cotidiano", "guardaChuva",
    k => pgComb([k.B.peito, 1], [k.B.frenteChao, 1.6], [UP, 0.6], [k.B.esqChao, k.s * 0.5]), k => pgComb([UP, 0.97], [k.B.esqChao, -k.s * 0.15]), k => k.B.frenteChao,
    { corpo: (Q, s) => { pgPasso(Q, s, 0.2, -0.2, 0.02, 0.12); } })
});
Object.assign(ALIAS_PEGADA, { guarda: "empunharGuarda", "em guarda": "empunharGuarda", empunhar: "empunharGuarda", reversa: "adagaReversa", "pegada invertida": "adagaReversa", apontar: "armaApontada", apontando: "armaApontada", "apontar arma": "armaApontada",
  erguida: "armaErguida", erguer: "armaErguida", "ao lado": "cajadoAoLado", investida: "lancaInvestida", "guarda de bastão": "bastaoGuarda", defender: "escudoDefesa", escudo: "escudoDefesa", defesa: "escudoDefesa",
  mirar: "pistolaMirando", mirando: "pistolaMirando", "duas maos na pistola": "pistolaDuasMaos", "no ombro mirando": "rifleMirando", rifle: "rifleMirando", arqueiro: "arcoPuxando", "puxar arco": "arcoPuxando", atirar: "arcoPuxando",
  tocar: "violaoTocando", violao: "violaoTocando", "violão": "violaoTocando", guitarra: "violaoTocando", violino: "violinoTocando", flauta: "flautaTocando", trompete: "trompeteTocando", cantar: "microfoneCantando", microfone: "microfoneCantando",
  tambor: "baquetaTocando", celular: "celularOlhando", telefone: "celularNaOrelha", ler: "livroLendo", livro: "livroLendo", beber: "bebendo", "guarda-chuva": "guardaChuvaAberto" });
/* pegada padrão de cada objeto de mão (quando o texto diz só "segura katana") */
const PEGADA_PADRAO = { katana: "espada", espadaLonga: "espada", espadaCurta: "empunharGuarda", sabre: "empunharGuarda", adaga: "empunharGuarda", kunai: "adagaReversa", shuriken: "pinca", martelo: "golpeAcima", maca: "empunharGuarda",
  machadoDuplo: "espada", bastaoBo: "bastaoGuarda", foice: "lancaInvestida", tridente: "lancaInvestida", nunchaku: "empunharGuarda", chicote: "empunharGuarda", besta: "bestaMirando", pistola: "pistolaMirando", rifle: "rifleDescansado", revolver: "revolverMirando", submetralhadora: "smgDuasMaos", metralhadora: "metralhadoraQuadril", sniper: "sniperEmPe", escopeta: "escopetaMirando", lancaFoguetes: "bazucaNoOmbro",
  broquel: "escudoDefesa", escudo: "escudoDefesa", escudoCavaleiro: "escudoDefesa", escudoTorre: "escudoDefesa", varinha: "armaApontada", cajadoMagico: "cajadoAoLado", orbe: "bandeja", tocha: "armaErguida", lanterna: "armaApontada",
  violao: "violaoTocando", guitarra: "violaoTocando", violino: "violinoTocando", arcoViolino: "empunharGuarda", flauta: "flautaTocando", trompete: "trompeteTocando", microfone: "microfoneCantando", baqueta: "baquetaTocando",
  celular: "celularOlhando", livro: "livroLendo", xicara: "bebendo", garrafa: "bebendo", copoBebida: "bebendo", guardaChuva: "guardaChuvaAberto", bandeira: "cajadoAoLado", vassoura: "bastaoGuarda", carta: "pinca", chave: "pinca", espelhoMao: "armaApontada", lanca: "lancaInvestida", arco: "arcoPuxando" };

/* ===== GOLPES COM ARMAS: poses de luta já segurando a arma certa (a mão vai à pega pela IK; o objeto fica sólido) =====
   Cada golpe: classe (que armas servem), mãos, corpo (código curto: duas letras + "principal,outro"; P: passo
   frente,trás,queda,abre · A: agacha queda,abre · bl: corpo no ar), H = onde fica a pega principal
   [base o|c|p|h = ombro do lado da arma | cintura | peito | cabeça, frente, cima, lado (+ = lado da arma)],
   Y = para onde aponta o eixo comprido (ponta/cano) [frente, cima, lado], N = normal da face larga (lâmina/escudo).
   "de" = pose de preparação (o efeito de rastro vai de "de" até este golpe). */
const GL_K = { sf: "spineFlex", ss: "spineSide", st: "spineTwist", pt: "pelvisTwist", bp: "bodyPitch", br: "bodyRoll", bl: "bodyLift", hf: "hipFlex", ha: "hipAbd", hr: "hipRot", kf: "kneeFlex", af: "ankleFlex",
  ab: "armAbd", fl: "armFlex", ar: "armRot", el: "elbow", hy: "headYaw", hp: "headPitch", hz: "headRoll", nf: "neckFlex", to: "toes" };
const GL_LADO = new Set(["hf", "ha", "hr", "kf", "af", "ab", "fl", "ar", "el", "to"]);
function glCorpo(cod) { return (Q, s) => { const pr = s > 0 ? "L" : "R", ou = s > 0 ? "R" : "L", sg = s > 0 ? 1 : -1;
  for (const t of String(cod || "").trim().split(/\s+/)) { if (!t) continue;
    let m = /^P:(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)$/.exec(t); if (m) { pgPasso(Q, s, +m[1], +m[2], +m[3], +m[4]); continue; }
    m = /^R:(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)$/.exec(t); if (m) { pgPasso(Q, -s, +m[1], +m[2], +m[3], +m[4]); continue; }
    m = /^A:(-?[\d.]+),(-?[\d.]+)$/.exec(t); if (m) { pgAgachar(Q, +m[1], +m[2]); continue; }
    m = /^([a-z]{2})(-?[\d.]+)(?:,(-?[\d.]+))?$/.exec(t); if (!m || !GL_K[m[1]]) continue; const k = GL_K[m[1]], a = +m[2], b = m[3] !== undefined ? +m[3] : a;
    if (GL_LADO.has(m[1])) { Q[k + pr] = a; Q[k + ou] = b; } else Q[k] = /Yaw|Twist|Side|Roll/.test(k) ? a * sg : a; } }; }
const glV = (k, v) => pgNorm(pgComb([k.B.frenteChao, v[0]], [UP, v[1]], [k.B.esqChao, v[2] * k.s]));
function glBase(k, b) { return b === "o" ? pgOmb(k, k.s) : b === "c" ? k.B.cintura : b === "h" ? k.B.cab : k.B.peito; }
const GL_CLASSES = { lamina1: ["espadaCurta", "espada curta, sabre, katana numa mão, maça, machadinha, tocha, varinha"], lamina2: ["katana", "katana, espada longa, montante (duas mãos)"],
  pesada: ["martelo", "martelo de guerra, machado duplo (duas mãos)"], haste: ["tridente", "lança, tridente, bastão, foice, cajado (duas mãos)"], haste1: ["tridente", "lança, tridente, cajado numa mão"],
  adaga: ["adaga", "adaga, faca, kunai"], pistola: ["pistola", "pistola, revólver"], rifle: ["rifle", "rifle, fuzil, espingarda"], escudo: ["escudoCavaleiro", "broquel, escudo de cavaleiro, escudo torre"],
  magia: ["varinha", "varinha, cajado curto, tocha"], cajado: ["cajadoMagico", "cajado mágico, bastão de mago"], orbe: ["orbe", "orbe, esfera, bola de energia"], arremesso: ["kunai", "kunai, shuriken, faca de arremesso, pedra"],
  chicote: ["chicote", "chicote, corda"], arco: ["arco", "arco"],
  smg: ["submetralhadora", "submetralhadora (SMG, uzi)"], metralhadora: ["metralhadora", "metralhadora com bipé e caixa de munição"], sniper: ["sniper", "rifle de precisão com luneta e bipé"],
  escopeta: ["escopeta", "escopeta de bomba (pump)"], bazuca: ["lancaFoguetes", "lança-foguetes / bazuca"], revolver: ["revolver", "revólver"] };
/* classes de arma de fogo: punho na mão da arma; armas longas com a mão de apoio na pega "frente" */
const GL_FOGO = new Set(["pistola", "revolver", "rifle", "smg", "metralhadora", "sniper", "escopeta", "bazuca"]), GL_FOGO2 = new Set(["rifle", "smg", "metralhadora", "sniper", "escopeta", "bazuca"]);
const GOLPES = {};
function golpe(nome, classe, maos, tag, desc, corpo, H, Y, N, extra) { GOLPES[nome] = Object.assign({ classe, maos, tag, desc, corpo, H, Y, N }, extra || {}); }
/* --- lâmina numa mão --- */
golpe("espadaPreparaCorte", "lamina1", 1, "Combate/Arma/Espada/Preparação", "Espada erguida atrás da cabeça, pronta para o corte descendente", "st-10 sf-6 hp-4 fl40,40 ab30,30 el90,90 P:.32,-.32,.08,.14", ["o", -0.4, 4.0, 0.3], [-0.45, 0.8, 0.2], [0, 0, 1]);
golpe("espadaCorteDescendente", "lamina1", 1, "Combate/Arma/Espada/Ataque", "Corte de cima para baixo terminado: lâmina à frente e abaixo, corpo projetado", "st14 sf18 bp6 hp6 fl20,30 ab20,25 el40,60 P:.5,-.46,.22,.14", ["o", 3.8, -2.2, -0.6], [0.55, -0.8, -0.1], [0, 0, 1], { de: "espadaPreparaCorte" });
golpe("espadaPreparaHorizontal", "lamina1", 1, "Combate/Arma/Espada/Preparação", "Espada recolhida ao lado, ponta para trás, para o corte horizontal", "st-30 pt-10 sf4 fl30,60 ab20,30 el60,90 P:.3,-.34,.12,.16", ["o", 0.6, -0.8, 1.6], [-0.85, 0.15, 0.35], [0, 1, 0]);
golpe("espadaCorteHorizontal", "lamina1", 1, "Combate/Arma/Espada/Ataque", "Corte horizontal terminado: braço cruzou o corpo, lâmina na altura do peito", "st40 pt16 sf8 hy-10 fl20,10 ab15,40 el40,40 P:.42,-.4,.14,.16", ["o", 3.8, -1.2, -3.2], [0.3, 0.05, -0.95], [0, 1, 0], { de: "espadaPreparaHorizontal" });
golpe("espadaCorteAscendente", "lamina1", 1, "Combate/Arma/Espada/Ataque", "Corte diagonal de baixo para cima terminado: lâmina alta do outro lado", "st24 sf-8 hp-12 fl20,20 ab25,40 el50,40 P:.4,-.38,.1,.15", ["o", 2.8, 2.6, -1.4], [0.35, 0.8, -0.45], [0.3, 0, 0.8], { de: "espadaGuardaBaixa" });
golpe("espadaEstocada", "lamina1", 1, "Combate/Arma/Espada/Ataque", "Estocada: braço todo esticado, lâmina horizontal, avanço profundo", "st18 sf10 bp8 hp-2 fl-20,-30 ab20,40 el20,20 P:.6,-.55,.32,.13", ["o", 5.0, -0.6, -0.4], [1, 0.02, 0], [0, 1, 0], { de: "espadaGuardaMedia" });
golpe("espadaGuardaMedia", "lamina1", 1, "Combate/Arma/Espada/Guarda", "Guarda média: ponta à frente na altura do peito, braço meio dobrado", "st-8 sf6 hp2 fl20,40 ab20,30 el60,90 P:.34,-.32,.12,.14", ["o", 3.0, -1.6, -0.4], [0.85, 0.45, -0.1], [0, 0, 1]);
golpe("espadaGuardaAlta", "lamina1", 1, "Combate/Arma/Espada/Guarda", "Guarda alta (boi): mão ao lado da cabeça, ponta para o rival", "st-12 sf2 hp-2 fl60,60 ab30,40 el100,100 P:.3,-.3,.08,.14", ["o", 1.2, 1.4, 0.6], [0.9, -0.25, -0.2], [0, 0, 1]);
golpe("espadaGuardaBaixa", "lamina1", 1, "Combate/Arma/Espada/Guarda", "Guarda baixa: ponta para o chão à frente, convidando o ataque", "st-6 sf10 hp6 fl20,30 ab20,25 el30,60 P:.34,-.32,.14,.15", ["o", 2.2, -4.0, 0.2], [0.6, -0.8, 0], [0, 0, 1]);
golpe("espadaAparaAlto", "lamina1", 1, "Combate/Arma/Espada/Defesa", "Aparando por cima: lâmina deitada acima da cabeça", "sf-4 hp-10 fl60,50 ab30,40 el100,90 R:.28,-.3,.14,.16", ["o", 2.0, 2.2, -1.2], [0.05, 0.25, -0.97], [1, 0, 0]);
golpe("espadaAparaLado", "lamina1", 1, "Combate/Arma/Espada/Defesa", "Aparando de lado: lâmina vertical cobrindo o flanco", "st-14 sf6 fl30,40 ab20,30 el70,90 R:.26,-.3,.12,.16", ["o", 2.2, -0.6, 0.6], [0.15, 0.98, 0.1], [1, 0, 0]);
golpe("espadaSaudacao", "lamina1", 1, "Combate/Arma/Espada/Cerimônia", "Saudação: guarda-mão na altura do queixo, lâmina vertical diante do rosto", "hp2 fl5,5 ab10,10 el10,10", ["h", 1.6, -1.8, -0.9], [0.05, 1, 0], [0, 0, 1]);
golpe("espadaApontaChao", "lamina1", 1, "Combate/Arma/Espada/Pausa", "Espada baixa ao lado, ponta no chão: depois da luta, cansaço ou vitória calma", "sf4 hp6 fl5,5 ab10,10 el10,10", ["o", 1.2, -4.6, 0.5], [0.3, -0.95, 0.1], [0, 0, 1]);
golpe("espadaSacada", "lamina1", 1, "Combate/Arma/Espada/Sacar", "Acabou de sacar: braço estendido para o lado e à frente, lâmina horizontal", "st-20 sf2 hy10 fl20,40 ab20,30 el40,80 P:.3,-.34,.1,.18", ["o", 3.4, -0.6, 2.6], [0.6, 0.05, 0.8], [0, 1, 0]);
golpe("espadaZanshin", "lamina1", 1, "Combate/Arma/Espada/Ataque", "Depois do golpe (zanshin): lâmina baixa e atrás, corpo ainda de frente", "st10 sf12 hp4 fl20,20 ab20,30 el20,60 P:.46,-.42,.2,.15", ["o", 0.8, -3.6, 1.8], [-0.6, -0.55, 0.55], [0, 0, 1], { de: "espadaCorteHorizontal" });
golpe("espadaAereo", "lamina1", 1, "Combate/Arma/Espada/Aéreo", "Salto com a espada erguida para o golpe de cima", "bl5 hf80,20 kf100,70 sf-8 hp-14 fl60,60 ab30,40 el90,90", ["o", 0.2, 4.2, 0.2], [-0.25, 0.95, 0.1], [0, 0, 1]);
golpe("espadaGiro", "lamina1", 1, "Combate/Arma/Espada/Ataque", "Corte girando: braço aberto para o lado, lâmina varrendo à altura do peito", "st-40 pt-25 hy-20 fl10,30 ab20,30 el30,90 P:.34,-.36,.16,.2", ["o", 1.0, -0.4, 4.4], [0.1, 0.05, 1], [0, 1, 0]);
golpe("espadaNoOmbro", "lamina1", 1, "Combate/Arma/Espada/Pausa", "Espada apoiada no ombro (descanso, arrogância)", "sf-4 hp-4 ss4 fl5,5 ab10,10 el10,10", ["o", 1.4, -1.2, -0.2], [-0.62, 0.75, 0.15], [0, 0, 1]);
/* --- lâmina a duas mãos --- */
golpe("kamaeChudan", "lamina2", 2, "Combate/Arma/Katana/Guarda", "Guarda média (chūdan): duas mãos no cabo, ponta na altura da garganta do rival", "sf4 hp2 P:.3,-.34,.12,.12", ["c", 2.8, 1.0, -0.3], [0.8, 0.6, -0.05], [0, 0, 1]);
golpe("kamaeJodan", "lamina2", 2, "Combate/Arma/Katana/Guarda", "Guarda alta (jōdan): cabo acima da testa, lâmina para trás e para cima", "sf-6 hp-4 P:.32,-.32,.1,.12", ["h", 1.4, 1.8, -0.3], [-0.45, 0.85, 0.1], [0, 0, 1]);
golpe("kamaeHasso", "lamina2", 2, "Combate/Arma/Katana/Guarda", "Guarda hassō: cabo ao lado do rosto, lâmina vertical", "st-14 sf2 P:.3,-.3,.1,.13", ["h", 1.4, -1.2, 1.2], [-0.1, 1, 0.05], [1, 0, 0]);
golpe("kamaeWaki", "lamina2", 2, "Combate/Arma/Katana/Guarda", "Guarda waki: lâmina baixa e escondida atrás do quadril", "st-26 pt-10 sf6 R:.32,-.36,.14,.15", ["c", 0.8, -0.2, 1.8], [-0.85, -0.3, 0.4], [0, 0, 1]);
golpe("kamaeGedan", "lamina2", 2, "Combate/Arma/Katana/Guarda", "Guarda baixa (gedan): ponta para o joelho do rival", "sf10 hp6 P:.32,-.34,.16,.13", ["c", 2.6, -0.8, -0.2], [0.75, -0.62, 0], [0, 0, 1]);
golpe("katanaCorteDescendente", "lamina2", 2, "Combate/Arma/Katana/Ataque", "Corte vertical (men) terminado: braços esticados, lâmina à frente", "sf16 bp6 hp4 P:.52,-.48,.24,.12", ["c", 3.4, 0.4, -0.2], [0.85, -0.5, 0], [0, 0, 1], { de: "kamaeJodan" });
golpe("katanaKesa", "lamina2", 2, "Combate/Arma/Katana/Ataque", "Corte diagonal (kesa-giri) terminado: lâmina baixa do outro lado", "st26 sf16 hp6 P:.46,-.44,.22,.14", ["c", 2.6, -0.6, -2.0], [0.4, -0.55, -0.72], [0.4, 0, 0.6], { de: "kamaeHasso" });
golpe("katanaEstocada", "lamina2", 2, "Combate/Arma/Katana/Ataque", "Estocada a duas mãos (tsuki)", "sf8 bp6 P:.56,-.5,.26,.12", ["c", 3.6, 1.6, -0.3], [1, 0.05, 0], [0, 1, 0], { de: "kamaeChudan" });
golpe("katanaHorizontal", "lamina2", 2, "Combate/Arma/Katana/Ataque", "Corte horizontal (dō) terminado: lâmina varreu de lado", "st36 pt14 sf10 P:.44,-.42,.18,.15", ["c", 3.0, 0.8, -2.2], [0.25, 0, -0.97], [0, 1, 0], { de: "kamaeWaki" });
golpe("katanaBloqueioAlto", "lamina2", 2, "Combate/Arma/Katana/Defesa", "Bloqueio alto: lâmina deitada acima da cabeça, segurando o golpe", "sf-2 hp-10 R:.26,-.3,.16,.16", ["h", 1.6, 1.4, 1.0], [0.05, 0.15, -0.99], [1, 0, 0]);
golpe("katanaFincada", "lamina2", 2, "Combate/Arma/Katana/Pausa", "Duas mãos no cabo, ponta fincada no chão à frente (vigília, juramento)", "sf2 hp8", ["c", 2.0, 1.0, -0.2], [0.05, -1, 0], [0, 0, 1]);
golpe("katanaAerea", "lamina2", 2, "Combate/Arma/Katana/Aéreo", "Salto com a katana erguida acima da cabeça", "bl6 hf90,30 kf110,80 sf-10 hp-16", ["h", 0.8, 2.6, -0.2], [-0.3, 0.95, 0], [0, 0, 1]);
golpe("iaiPreparacao", "lamina2", 1, "Combate/Arma/Katana/Sacar", "Iaijutsu: mão no cabo ainda na cintura, prestes a sacar", "sf14 hp6 st-10 fl20,30 ab20,25 el60,110 A:.32,.3", ["c", 1.9, 0.4, -0.7], [0.8, 0.25, -0.5], [0, 1, 0]);
/* --- armas pesadas (martelo, machado) --- */
golpe("pesadaErguida", "pesada", 2, "Combate/Arma/Pesada/Preparação", "Martelo/machado erguido atrás da cabeça, tudo pronto para descer", "sf-12 bp-4 hp-8 P:.32,-.34,.1,.16", ["h", 0.4, 2.2, 0.2], [-0.55, 0.8, 0], [0, 0, 1]);
golpe("pesadaImpactoChao", "pesada", 2, "Combate/Arma/Pesada/Ataque", "Golpe no chão: cabeça do martelo bate à frente, corpo agachado", "sf34 bp10 hp10 P:.56,-.48,.4,.18", ["c", 2.8, -1.2, -0.2], [0.75, -0.65, 0], [0, 0, 1], { de: "pesadaErguida" });
golpe("pesadaVarrida", "pesada", 2, "Combate/Arma/Pesada/Ataque", "Varrida horizontal terminada (girando o corpo)", "st40 pt18 sf10 P:.42,-.42,.2,.18", ["c", 2.6, 0.6, -2.4], [0.3, 0.05, -0.95], [0, 1, 0], { de: "pesadaNoOmbro" });
golpe("pesadaNoOmbro", "pesada", 1, "Combate/Arma/Pesada/Pausa", "Martelo/machado no ombro, andando (guerreiro, lenhador)", "sf-2 hp-4 fl10,10 ab10,10 el10,10", ["o", 1.5, -3.0, 0.3], [-0.6, 0.78, 0.0], [0, 0, 1]);
golpe("pesadaApoiada", "pesada", 1, "Combate/Arma/Pesada/Pausa", "Martelo/machado pendurado ao lado do corpo, cabeça para baixo (descanso)", "ss-4 hp4 fl5,5 ab10,10 el10,10", ["o", 0.9, -4.4, 0.9], [0.1, -0.98, 0.15], [0, 0, 1]);
golpe("pesadaGuarda", "pesada", 2, "Combate/Arma/Pesada/Guarda", "Guarda com arma pesada: cabo na diagonal diante do corpo", "sf8 st-10 P:.34,-.34,.14,.16", ["c", 2.2, 0.8, -0.6], [0.35, 0.8, 0.45], [0, 0, 1]);
/* --- hastes (lança, tridente, bastão, foice, cajado) a duas mãos --- */
golpe("lancaAltaGolpe", "haste", 2, "Combate/Arma/Lança/Ataque", "Golpe de cima para baixo com a lança (cravando)", "sf18 bp6 hp6 P:.46,-.42,.22,.14", ["c", 2.8, 1.4, 0.2], [0.55, -0.82, 0], [0, 1, 0], { de: "lancaGuardaAlta" });
golpe("lancaGuardaAlta", "haste", 2, "Combate/Arma/Lança/Guarda", "Lança acima do ombro, ponta para o rival (falange)", "sf4 st-10 P:.34,-.34,.12,.14", ["o", 1.6, 0.2, -0.6], [0.95, -0.25, 0], [0, 1, 0]);
golpe("lancaVarredura", "haste", 2, "Combate/Arma/Lança/Ataque", "Varredura baixa com a haste (derrubar)", "st34 pt14 sf18 hp8 A:.32,.34", ["c", 2.4, -0.8, -1.4], [0.3, -0.35, -0.88], [0, 1, 0], { de: "lancaGuardaAlta" });
golpe("bastaoAcima", "haste", 2, "Combate/Arma/Bastão/Defesa", "Bastão deitado acima da cabeça, bloqueando o golpe de cima", "sf-4 hp-12 A:.18,.3", ["h", 1.2, 1.6, 1.6], [0.05, 0.12, -0.99], [1, 0, 0]);
golpe("bastaoDiagonal", "haste", 2, "Combate/Arma/Bastão/Guarda", "Bastão na diagonal diante do corpo (guarda de bastão)", "sf6 st-8 P:.3,-.32,.12,.15", ["c", 2.5, 2.0, 0.4], [0.15, 0.75, -0.65], [1, 0, 0]);
golpe("foiceCeifar", "haste", 2, "Combate/Arma/Foice/Ataque", "Ceifando: a lâmina passou rente ao chão de lado", "st30 pt14 sf22 hp8 P:.46,-.42,.3,.18", ["c", 2.4, -0.6, -1.6], [0.35, -0.3, -0.88], [0, 1, 0]);
golpe("cajadoErguidoDuas", "haste", 2, "Combate/Arma/Cajado/Magia", "Cajado erguido com as duas mãos acima da cabeça (invocação)", "sf-10 hp-20 P:.24,-.26,.04,.14", ["h", 1.0, 2.6, 0], [0.12, 0.99, 0], [1, 0, 0]);
/* --- haste numa mão --- */
golpe("lancaArremessoPrep", "haste1", 1, "Combate/Arma/Lança/Arremesso", "Preparando o arremesso: lança acima do ombro, braço atrás", "st-30 pt-14 sf-6 hy10 fl70,90 ab20,60 el20,20 R:.3,-.4,.08,.16", ["o", -1.2, 1.4, 0.8], [0.95, 0.2, 0], [0, 1, 0]);
golpe("lancaArremessada", "haste1", 1, "Combate/Arma/Lança/Arremesso", "Arremesso no fim do braço: a lança sai à frente", "st30 sf16 bp8 fl20,-30 ab20,20 el20,20 P:.5,-.5,.2,.14", ["o", 4.2, 0.6, -0.6], [0.95, 0.25, 0], [0, 1, 0], { de: "lancaArremessoPrep" });
golpe("lancaEmPe", "haste1", 1, "Combate/Arma/Lança/Pausa", "Lança vertical ao lado do corpo, base no chão (sentinela)", "hp2 fl5,5 ab8,8 el10,10", ["o", 1.0, -1.0, 1.2], [0.02, 1, 0], [1, 0, 0]);
/* --- adaga --- */
golpe("adagaFacada", "adaga", 1, "Combate/Arma/Adaga/Ataque", "Facada à frente na altura do estômago", "st16 sf14 bp6 fl30,60 ab25,30 el60,100 P:.44,-.4,.2,.14", ["o", 4.4, -2.4, -0.6], [1, 0.05, 0], [0, 1, 0]);
golpe("adagaGuardaFaca", "adaga", 1, "Combate/Arma/Adaga/Guarda", "Guarda de faca: agachado, lâmina à frente e mão livre protegendo", "sf20 hp-6 fl60,90 ab20,30 el90,110 A:.26,.3", ["o", 2.6, -2.0, -0.2], [0.85, 0.5, 0], [0, 0, 1]);
golpe("adagaApunhalar", "adaga", 1, "Combate/Arma/Adaga/Ataque", "Apunhalando de cima (pegada invertida, lâmina para baixo)", "sf20 bp6 hp8 fl40,60 ab20,30 el60,100 P:.36,-.36,.16,.14", ["o", 2.8, -1.0, -0.6], [0.3, -0.95, 0], [1, 0, 0]);
golpe("adagaArremessoPrep", "adaga", 1, "Combate/Arma/Adaga/Arremesso", "Faca segura pela ponta atrás da orelha, prestes a arremessar", "st-20 sf-4 fl60,60 ab20,30 el40,40 R:.28,-.34,.06,.14", ["o", 0.2, 1.8, 0.4], [-0.2, 0.98, 0], [1, 0, 0]);
/* --- pistola --- */
golpe("pistolaParaCima", "pistola", 1, "Combate/Arma/Pistola/Espera", "Pistola ao lado do rosto, cano para cima (encostado na parede, espião)", "ss4 hp-2 hy-20 fl20,10 ab20,10 el20,20", ["o", 1.2, 0.6, -0.2], [-0.95, 0.3, 0], [0.05, 1, 0]);
golpe("pistolaBaixa", "pistola", 1, "Combate/Arma/Pistola/Espera", "Pistola baixa, cano para o chão (atenção, sem mirar)", "hp6 fl20,10 ab12,10 el20,20", ["o", 1.8, -3.0, -0.2], [0, 0.7, 0.3], [0.5, -0.85, 0]);
golpe("pistolaDeLado", "pistola", 1, "Combate/Arma/Pistola/Mirar", "Mirando com a pistola deitada (estilo gângster)", "st18 sf2 fl20,10 ab12,10 el20,20 R:.24,-.24,.04,.14", ["o", 4.2, 0.2, -0.6], [0, 0.02, -1], [1, 0, 0]);
golpe("pistolaCorrendo", "pistola", 1, "Combate/Arma/Pistola/Movimento", "Correndo com a pistola erguida à frente do peito", "bp14 sf8 hf70,-20 kf80,40 af10,30 fl-40,60 ab15,20 el90,90", ["o", 2.0, -0.8, -0.8], [0.25, 0.97, 0], [0.97, -0.25, 0]);
/* --- rifle --- */
golpe("rifleQuadril", "rifle", 2, "Combate/Arma/Rifle/Mirar", "Rifle na cintura, atirando de quadril", "st10 sf4 R:.3,-.32,.1,.16", ["c", 1.6, 0.6, 0.8], [0.05, 0.99, 0], [1, 0, 0]);
golpe("rifleBaixo", "rifle", 2, "Combate/Arma/Rifle/Espera", "Rifle baixo à frente (posição de alerta)", "sf6 hp4 R:.26,-.28,.06,.15", ["p", 2.7, -1.8, 0.5], [0.1, 0.99, 0], [0.75, -0.65, 0]);
golpe("rifleNoOmbro", "rifle", 1, "Combate/Arma/Rifle/Pausa", "Rifle em pé junto ao ombro, cano para cima (marcha, sentinela)", "hp-2 fl10,10 ab10,10 el10,10", ["o", 1.4, -1.6, -0.2], [0.98, 0.15, 0], [0.15, 1, 0]);
/* --- armas de fogo: técnicas conhecidas (coronha no ombro, ajoelhado, deitado, de quadril, recarga, luneta) --- */
golpe("rifleOmbroMirando", "rifle", 2, "Combate/Arma/Rifle/Mirar", "Coronha no ombro, rosto na arma, mirando em pé (base de tiro)", "st22 sf6 hp4 hy-4 P:.3,-.32,.06,.16", ["o", 4.3, -0.72, -0.25], [0.02, 1, 0], [1, 0, 0]);
golpe("rifleAjoelhado", "rifle", 2, "Combate/Arma/Rifle/Mirar", "Ajoelhado num joelho, coronha no ombro (tiro ajoelhado)", "st22 sf8 hp4 P:.42,-.36,.42,.16", ["o", 4.3, -0.72, -0.25], [0.02, 1, 0], [1, 0, 0]);
golpe("rifleDeitado", "rifle", 2, "Combate/Arma/Rifle/Mirar", "Deitado de bruços mirando (tiro deitado)", "bp88 sf-16 hf-14,-10 ha10,16 kf4,10 af-30,-30 hp-40", ["o", 2.8, -0.25, 0.05], [0.05, 1, 0], [1, 0.12, 0]);
golpe("rifleRecarregando", "rifle", 2, "Combate/Arma/Rifle/Recarga", "Recarregando: arma inclinada no peito, mão de apoio no carregador", "sf10 hp14 st-6 P:.3,-.3,.06,.15", ["p", 2.0, -1.0, 0.4], [0.35, 0.85, -0.4], [0.85, -0.1, 0.5]);
golpe("rifleCoberturaCanto", "rifle", 2, "Combate/Arma/Rifle/Cobertura", "Saindo da quina de uma parede: corpo inclinado de lado, arma no ombro", "ss-6 st22 sf4 hz-6 P:.3,-.3,.06,.18", ["o", 4.4, -0.72, -0.1], [-0.15, 0.98, 0], [1, 0, 0]);
golpe("sniperDeitado", "sniper", 2, "Combate/Arma/Sniper/Mirar", "Franco-atirador deitado no bipé, olho na luneta", "bp88 sf-16 hf-14,-10 ha12,18 kf4,10 af-30,-30 hp-40", ["o", 2.8, -0.25, 0.45], [0.05, 1, 0], [1, 0.12, 0]);
golpe("sniperAjoelhado", "sniper", 2, "Combate/Arma/Sniper/Mirar", "Sniper ajoelhado, cotovelo no joelho, olho na luneta", "st22 sf12 hp6 P:.42,-.36,.44,.16", ["o", 4.7, -0.72, -0.2], [0.02, 1, 0], [1, 0, 0]);
golpe("sniperEmPe", "sniper", 2, "Combate/Arma/Sniper/Mirar", "Sniper em pé, mirando pela luneta (tiro sem apoio)", "st22 sf6 hp6 P:.3,-.32,.06,.16", ["o", 4.7, -0.72, -0.2], [0.02, 1, 0], [1, 0, 0]);
golpe("sniperDescanso", "sniper", 2, "Combate/Arma/Sniper/Pausa", "Sniper em pronto: rifle à frente na altura da cintura, pronto para erguer", "sf6 hp4 R:.26,-.28,.06,.15", ["p", 3.4, -2.2, 1.4], [0.1, 0.99, 0], [0.75, -0.65, 0]);
golpe("metralhadoraQuadril", "metralhadora", 2, "Combate/Arma/Metralhadora/Mirar", "Metralhadora pesada atirando de quadril, base larga, corpo para trás (Rambo)", "sf-8 st6 bp-4 P:.42,-.4,.12,.22", ["c", 2.6, 0.4, 1.8], [0.05, 0.99, 0], [1, 0.08, 0]);
golpe("metralhadoraDeitada", "metralhadora", 2, "Combate/Arma/Metralhadora/Mirar", "Metralhadora deitada no bipé (posição de apoio)", "bp88 sf-16 hf-14,-10 ha14,20 kf4,10 af-30,-30 hp-40", ["o", 2.8, -0.25, 0.05], [0.05, 1, 0], [1, 0.12, 0]);
golpe("metralhadoraOmbro", "metralhadora", 2, "Combate/Arma/Metralhadora/Mirar", "Metralhadora no ombro, em pé, inclinado para a frente contra o recuo", "st22 sf10 hp4 P:.4,-.38,.08,.18", ["o", 4.6, -0.72, -0.3], [0.02, 1, 0], [1, 0, 0]);
golpe("metralhadoraCarregando", "metralhadora", 2, "Combate/Arma/Metralhadora/Movimento", "Carregando a metralhadora baixa à frente, andando", "sf4 hp2 P:.3,-.3,.05,.15", ["c", 2.1, -0.4, 0.9], [0.1, 0.99, 0], [0.97, -0.2, 0]);
golpe("escopetaMirando", "escopeta", 2, "Combate/Arma/Escopeta/Mirar", "Escopeta no ombro, mirando (cano um pouco acima da linha)", "st22 sf2 hp2 P:.3,-.32,.06,.16", ["o", 4.5, -0.6, -0.1], [-0.2, 0.98, 0], [0.98, 0.2, 0]);
golpe("escopetaBombeando", "escopeta", 2, "Combate/Arma/Escopeta/Recarga", "Puxando a bomba depois do tiro (cano um pouco para cima)", "st22 sf2 hp2 P:.3,-.32,.06,.16", ["o", 4.5, -0.6, -0.1], [-0.25, 0.97, 0], [0.97, 0.25, 0]);
golpe("escopetaQuadril", "escopeta", 2, "Combate/Arma/Escopeta/Mirar", "Escopeta na cintura, atirando de quadril", "st8 sf4 P:.32,-.32,.1,.16", ["c", 2.4, 0.6, 1.3], [0.05, 0.99, 0], [1, 0, 0]);
golpe("escopetaBaixa", "escopeta", 2, "Combate/Arma/Escopeta/Espera", "Escopeta baixa à frente (alerta, entrando num cômodo)", "sf6 hp4 R:.26,-.28,.06,.15", ["c", 2.6, -0.2, 1.2], [0.1, 0.99, 0], [0.75, -0.65, 0]);
golpe("smgDuasMaos", "smg", 2, "Combate/Arma/SMG/Mirar", "Submetralhadora compacta no ombro, mirando", "st22 sf6 hp4 P:.3,-.32,.06,.16", ["o", 4.3, -0.72, -0.25], [0.02, 1, 0], [1, 0, 0]);
golpe("smgUmaMao", "smg", 1, "Combate/Arma/SMG/Mirar", "Submetralhadora numa mão, braço esticado (estilo filme de ação)", "st14 sf2 fl20,10 ab12,10 el20,20", ["o", 4.0, 0.0, -0.4], [0.05, 0.99, 0], [1, 0, 0]);
golpe("smgCorrendo", "smg", 2, "Combate/Arma/SMG/Movimento", "Correndo com a submetralhadora diante do peito", "bp14 sf8 hf70,-20 kf80,40 af10,30", ["p", 1.8, -0.6, 0.4], [0.2, 0.97, 0], [0.97, -0.2, 0]);
golpe("bazucaNoOmbro", "bazuca", 2, "Combate/Arma/Bazuca/Mirar", "Lança-foguetes no ombro, olho na mira lateral (o tubo passa por cima do ombro)", "st-6 sf4 hp6 hy-6 P:.36,-.36,.08,.18", ["o", 0.9, -1.0, -0.15], [0.02, 1, 0], [1, 0, 0]);
golpe("bazucaAjoelhado", "bazuca", 2, "Combate/Arma/Bazuca/Mirar", "Lança-foguetes ajoelhado (posição de disparo)", "st-6 sf8 hp6 P:.42,-.36,.42,.18", ["o", 0.9, -1.0, -0.15], [0.02, 1, 0], [1, 0, 0]);
golpe("revolverQuadril", "revolver", 1, "Combate/Arma/Revólver/Mirar", "Duelo de faroeste: revólver sacado na altura do quadril", "st10 sf2 fl10,10 ab12,10 el70,20 P:.3,-.3,.04,.2", ["c", 1.6, 0.2, 0.9], [0.05, 0.99, 0], [1, 0, 0]);
golpe("revolverMirando", "revolver", 1, "Combate/Arma/Revólver/Mirar", "Revólver com o braço esticado, mirando na altura dos olhos", "st18 sf2 fl20,10 ab12,10 el20,20 R:.24,-.24,.04,.14", ["o", 4.3, 0.2, -0.6], [0.02, 1, 0], [1, 0, 0]);
golpe("revolverDuelo", "revolver", 1, "Combate/Arma/Revólver/Espera", "Antes do saque: mão aberta perto do coldre, corpo tenso (duelo ao meio-dia)", "sf6 hp4 fl-10,10 ab20,10 el30,20 P:.3,-.3,.06,.24", ["c", 0.4, -1.0, 1.2], [0.1, -1, 0.1], [1, 0, 0]);
/* --- varinha: duelo de bruxos (base de lado, varinha à frente, estocada do feitiço, escudo, giro) --- */
golpe("varinhaDuelo", "magia", 1, "Combate/Arma/Magia/Duelo", "Base de duelo: corpo de lado, varinha à frente apontada para o rival, mão livre atrás", "st-30 pt-20 sf4 hp2 fl20,30 ab20,30 el50,60 P:.36,-.36,.1,.2", ["o", 3.4, 0.6, -0.4], [0.95, 0.25, 0], [0, 0, 1]);
golpe("varinhaEstocadaFeitico", "magia", 1, "Combate/Arma/Magia/Duelo", "Lançando o feitiço: estocada com o braço todo esticado (o raio sai da ponta)", "st18 sf10 bp6 fl-20,-30 ab20,40 el20,20 P:.56,-.5,.26,.16", ["o", 5.0, 0.2, -0.4], [1, 0.05, 0], [0, 0, 1], { de: "varinhaDuelo" });
golpe("varinhaGiroAcima", "magia", 1, "Combate/Arma/Magia/Duelo", "Giro acima da cabeça antes do feitiço forte", "st-14 sf-6 hp-8 fl60,30 ab30,40 el90,60 P:.3,-.3,.06,.16", ["o", 0.8, 3.6, 0.6], [0.25, 0.95, 0.2], [0, 0, 1]);
golpe("varinhaCorteDiagonal", "magia", 1, "Combate/Arma/Magia/Duelo", "Feitiço em corte diagonal terminado (varinha baixa do outro lado)", "st24 sf12 hp6 fl20,20 ab25,40 el50,40 P:.44,-.4,.18,.16", ["o", 3.4, -1.2, -1.6], [0.7, -0.3, -0.6], [0, 0, 1], { de: "varinhaGiroAcima" });
golpe("varinhaEscudo", "magia", 1, "Combate/Arma/Magia/Defesa", "Feitiço de escudo: varinha vertical diante do corpo, base firme", "st-10 sf2 hp-2 fl20,30 ab20,30 el70,60 P:.34,-.34,.08,.2", ["p", 2.4, 0.8, -0.3], [0.05, 1, 0], [1, 0, 0]);
golpe("varinhaSaudacao", "magia", 1, "Combate/Arma/Magia/Duelo", "Saudação antes do duelo: varinha erguida diante do rosto", "hp2 fl5,5 ab10,10 el10,10", ["h", 1.6, -1.4, -0.8], [0.05, 1, 0], [0, 0, 1]);
golpe("varinhaLuz", "magia", 1, "Combate/Arma/Magia/Feitiço", "Varinha erguida iluminando o caminho", "hp-6 fl20,10 ab10,10 el20,10", ["o", 2.4, 2.0, 0.2], [0.45, 0.88, 0], [0, 0, 1]);
golpe("varinhaRecuo", "magia", 1, "Combate/Arma/Magia/Defesa", "Atingido pelo feitiço: corpo jogado para trás, varinha ainda erguida", "sf-18 bp-8 hp-14 fl60,40 ab40,40 el60,40 R:.3,-.4,.08,.2", ["o", 2.0, 2.4, 0.8], [0.5, 0.85, 0.1], [0, 0, 1]);
/* --- ESGRIMA: as posições de um duelo (guarda, avanço, recuo, estocada, flecha, as 8 paradas, resposta, remessa, finta, batida, cortes de sabre,
   esquivas de florete). Cada uma existe para espada ("esgrima…") e para varinha ("varinha…": o mesmo gesto, o ataque sai à distância pela ponta). --- */
const ESGRIMA = [
  ["EnGarde", "Guarda de esgrima (en garde): de lado, joelhos dobrados, arma à frente apontada para o rival, mão livre erguida atrás", "Guarda", "st-40 pt-35 sf2 hp2 fl30,40 ab20,60 el60,100 P:.36,-.34,.14,.24", ["o", 2.6, -0.6, -0.2], [0.9, 0.4, 0], [0, 0, 1]],
  ["PassoFrente", "Avanço (marche): pé da frente adiantado, guarda mantida", "Movimento", "st-40 pt-35 sf2 fl30,40 ab20,60 el60,100 P:.46,-.30,.10,.24", ["o", 2.7, -0.6, -0.2], [0.9, 0.4, 0], [0, 0, 1]],
  ["Recuo", "Recuo (rompre): corpo para trás, guarda mantida", "Movimento", "st-40 pt-35 sf-2 fl30,40 ab20,60 el60,100 P:.26,-.44,.12,.24", ["o", 2.4, -0.4, -0.2], [0.85, 0.5, 0], [0, 0, 1]],
  ["Estocada", "Estocada (fente): braço esticado, perna da frente em avanço profundo, a de trás esticada", "Ataque", "st-30 pt-25 sf10 bp4 fl-10,-40 ab20,60 el10,60 P:.62,-.55,.34,.22", ["o", 5.2, -0.3, -0.3], [1, 0.05, 0], [0, 0, 1], "EnGarde"],
  ["EstocadaLonga", "Estocada longa: a fente mais funda, quase rente ao chão", "Ataque", "st-30 pt-25 sf12 bp10 fl-10,-40 ab20,70 el10,40 P:.75,-.65,.42,.22", ["o", 5.6, -0.6, -0.3], [1, -0.05, 0], [0, 0, 1], "EnGarde"],
  ["Flecha", "Flecha (flèche): ataque correndo, corpo lançado à frente, pernas cruzando", "Ataque", "bp18 sf8 hf70,-15 kf60,20 fl-10,30 ab20,40 el10,40", ["o", 5.4, -0.4, -0.2], [1, 0, 0], [0, 0, 1], "EnGarde"],
  ["Prima", "Parada de prima: mão alta do outro lado do rosto, ponta para baixo", "Defesa", "st-30 pt-30 sf2 fl80,40 ab20,60 el90,100 P:.36,-.34,.14,.24", ["p", 1.6, 0.6, -1.2], [0.3, -0.9, -0.3], [0, 0, 1]],
  ["Secunda", "Parada de segunda: mão baixa por fora, ponta para baixo e à frente", "Defesa", "st-40 pt-35 sf6 fl20,40 ab25,60 el40,100 P:.36,-.34,.16,.24", ["o", 2.4, -2.4, 0.4], [0.5, -0.8, 0.2], [0, 0, 1]],
  ["Tercia", "Parada de terça: mão por fora na altura do peito, ponta para cima", "Defesa", "st-40 pt-35 sf2 fl30,40 ab30,60 el70,100 P:.36,-.34,.14,.24", ["o", 2.6, -1.0, 0.6], [0.5, 0.85, 0.2], [0, 0, 1]],
  ["Quarta", "Parada de quarta: mão por dentro na altura do peito, ponta para cima", "Defesa", "st-30 pt-30 sf2 fl35,40 ab10,60 el80,100 P:.36,-.34,.14,.24", ["p", 2.4, 0, -0.8], [0.45, 0.85, -0.2], [0, 0, 1]],
  ["Quinta", "Parada de quinta: arma deitada acima da cabeça (contra golpe de cima)", "Defesa", "st-35 pt-30 sf-2 hp-6 fl90,40 ab30,60 el90,100 P:.36,-.34,.14,.24", ["h", 1.6, 1.4, 0.4], [0.1, 0.1, -1], [1, 0, 0]],
  ["Sexta", "Parada de sexta: mão por fora, ponta à frente e para cima (a guarda clássica do florete)", "Defesa", "st-40 pt-35 sf2 fl35,40 ab25,60 el60,100 P:.36,-.34,.14,.24", ["o", 2.8, -1.2, 0.3], [0.85, 0.5, 0.15], [0, 0, 1]],
  ["Setima", "Parada de sétima: mão baixa por dentro, ponta para baixo e à frente", "Defesa", "st-30 pt-30 sf6 fl20,40 ab10,60 el50,100 P:.36,-.34,.16,.24", ["p", 2.6, -1.6, -0.6], [0.7, -0.6, -0.3], [0, 0, 1]],
  ["Oitava", "Parada de oitava: mão baixa por fora, ponta para baixo e à frente", "Defesa", "st-40 pt-35 sf6 fl20,40 ab25,60 el50,100 P:.36,-.34,.16,.24", ["o", 2.8, -2.2, 0.4], [0.7, -0.6, 0.3], [0, 0, 1]],
  ["Resposta", "Resposta (riposte): estocada logo depois da parada de quarta", "Ataque", "st-30 pt-25 sf8 bp4 fl-10,-40 ab20,60 el10,60 P:.56,-.5,.3,.22", ["o", 5.0, -0.4, -0.4], [1, 0.05, -0.05], [0, 0, 1], "Quarta"],
  ["Remessa", "Remessa (remise): segunda estocada sem voltar à guarda", "Ataque", "st-30 pt-25 sf12 bp6 fl-10,-40 ab20,60 el10,60 P:.66,-.58,.38,.22", ["o", 5.3, -0.7, -0.3], [1, -0.08, 0], [0, 0, 1], "Estocada"],
  ["Finta", "Finta: braço estica como se fosse atacar, sem avançar", "Ataque", "st-40 pt-35 sf4 fl-10,40 ab20,60 el10,100 P:.36,-.34,.14,.24", ["o", 4.6, -0.4, -0.3], [1, 0.1, 0], [0, 0, 1], "EnGarde"],
  ["Batida", "Batida na lâmina (battement): golpe seco de lado na arma do rival", "Ataque", "st-34 pt-30 sf4 fl30,40 ab25,60 el50,100 P:.4,-.34,.14,.24", ["o", 3.4, -0.6, 0.6], [0.8, 0.3, 0.5], [0, 0, 1], "Quarta"],
  ["CorteVertical", "Corte de cabeça (sabre): de cima para baixo, braço estendido", "Ataque", "st-30 pt-25 sf10 bp4 fl20,-40 ab20,60 el20,60 P:.56,-.5,.28,.22", ["o", 3.6, 0.4, -0.4], [0.8, -0.5, 0], [0, 0, 1], "Quinta"],
  ["CorteHorizontal", "Corte de flanco (sabre): varre na horizontal", "Ataque", "st-10 pt-10 sf8 fl20,-40 ab20,60 el30,60 P:.5,-.46,.24,.22", ["o", 3.4, -0.8, -1.6], [0.4, 0, -0.9], [0, 1, 0], "Tercia"],
  ["CorteDiagonal", "Corte diagonal (sabre): do alto de um lado para o baixo do outro", "Ataque", "st-14 pt-14 sf10 fl20,-40 ab20,60 el30,60 P:.52,-.48,.26,.22", ["o", 3.6, -1.4, -1.0], [0.6, -0.6, -0.5], [0, 0, 1], "Quinta"],
  ["PassataSotto", "Passata sotto: abaixa quase ao chão e estoca por baixo do ataque", "Esquiva", "sf30 bp20 hp-20 fl-10,60 ab20,60 el10,60 P:.6,-.5,.45,.22", ["o", 4.8, -1.0, -0.4], [1, 0.15, 0], [0, 0, 1], "EnGarde"],
  ["Inquartata", "Inquartata: gira o corpo para fora da linha e estoca ao mesmo tempo", "Esquiva", "st-60 pt-50 sf6 fl-10,40 ab20,60 el10,100 P:.3,-.5,.12,.4", ["o", 4.8, -0.4, -0.2], [1, 0, 0], [0, 0, 1], "EnGarde"],
  ["SaltoTras", "Salto para trás (balestra para trás): os dois pés no ar, guarda mantida", "Movimento", "bl3 st-40 pt-35 sf-4 fl30,40 ab20,60 el60,100 hf20,10 kf30,40", ["o", 2.5, -0.4, -0.2], [0.85, 0.5, 0], [0, 0, 1]],
  ["Saudacao", "Saudação: guarda da arma junto ao queixo, lâmina vertical diante do rosto", "Cerimônia", "hp2 fl70,10 ab10,10 el130,20", ["p", 1.2, 1.2, -0.4], [0.1, 0.99, 0.05], [0, 0, 1]],
  ["SaudacaoBaixa", "Fim da saudação: arma baixa à frente, ponta para o chão", "Cerimônia", "hp4 fl20,5 ab10,10 el10,10", ["o", 2.6, -2.6, -0.2], [0.6, -0.8, 0], [0, 0, 1]],
  ["Vitoria", "Arma erguida depois do toque (vitória do duelo)", "Cerimônia", "sf-4 hp-8 fl150,20 ab20,20 el20,40", ["o", 0.4, 3.8, 0.2], [0.2, 0.98, 0], [0, 0, 1]]
];
for (const [n, desc, tg, corpo, H, Y, N, de] of ESGRIMA) {
  golpe("esgrima" + n, "lamina1", 1, "Combate/Arma/Esgrima/" + tg, desc + " (espada, florete, sabre)", corpo, H, Y, N, de ? { de: "esgrima" + de } : undefined);
  golpe("varinha" + n, "magia", 1, "Combate/Arma/Magia/Duelo/" + tg, desc.replace(/arma|lâmina/g, "varinha") + " — com varinha: o ataque sai à distância pela ponta", corpo, H, Y, N, de ? { de: "varinha" + de } : undefined); }
/* --- escudo --- */
golpe("escudoAoAlto", "escudo", 1, "Combate/Arma/Escudo/Defesa", "Escudo erguido acima da cabeça (chuva de flechas, pedras)", "sf6 hp-6 A:.3,.3", ["h", 1.2, 2.4, 0.2], [0.98, 0.2, 0], [0, 1, 0]);
golpe("escudoInvestida", "escudo", 1, "Combate/Arma/Escudo/Ataque", "Avançando com o escudo à frente (empurrão, investida)", "sf20 bp12 hp2 P:.52,-.48,.24,.14", ["p", 2.8, -0.6, 0.2], [0.05, 1, 0], [1, 0, 0.2]);
golpe("escudoAgachado", "escudo", 1, "Combate/Arma/Escudo/Defesa", "Agachado atrás do escudo, só os olhos aparecem", "sf26 hp-8 A:.5,.32", ["p", 2.4, -0.6, 0.3], [0.05, 1, 0], [1, 0, 0.1]);
golpe("escudoDescanso", "escudo", 1, "Combate/Arma/Escudo/Pausa", "Escudo baixo ao lado do corpo", "hp4 fl5,5 ab10,10 el10,10", ["o", 0.6, -4.6, 1.3], [0.15, 0.98, 0], [0.1, 0, 1]);
/* --- magia --- */
golpe("varinhaConjurando", "magia", 1, "Combate/Arma/Magia/Feitiço", "Varinha erguida no fim do movimento do feitiço", "st-10 sf-4 hp-8 fl60,30 ab20,40 el60,50 P:.28,-.3,.06,.15", ["o", 3.2, 2.0, 0.4], [0.7, 0.68, 0.15], [0, 0, 1]);
golpe("varinhaApontandoChao", "magia", 1, "Combate/Arma/Magia/Feitiço", "Varinha apontada para o chão (círculo mágico, invocação no solo)", "sf12 hp12 fl30,20 ab15,20 el30,40", ["o", 3.2, -2.4, -0.6], [0.55, -0.83, 0], [0, 0, 1]);
golpe("cajadoBatendoChao", "cajado", 1, "Combate/Arma/Magia/Cajado", "Cajado batendo no chão à frente (\"você não vai passar\")", "sf4 hp2 fl40,20 ab15,20 el30,40 P:.3,-.28,.06,.15", ["o", 2.6, 0.0, -0.6], [0.06, 1, 0], [1, 0, 0]);
golpe("cajadoApontado", "cajado", 2, "Combate/Arma/Magia/Cajado", "Cajado apontado para a frente com as duas mãos (raio)", "sf8 st-10 P:.4,-.38,.14,.15", ["c", 2.6, 1.6, -0.2], [0.97, 0.22, 0], [0, 1, 0]);
golpe("orbeErguido", "orbe", 1, "Combate/Arma/Magia/Orbe", "Orbe flutuando sobre a palma erguida", "sf-6 hp-14 fl40,20 ab15,20 el30,40", ["o", 2.6, 1.2, 0.9], [0, 1, 0], [1, 0, 0]);
golpe("orbeEmpurrado", "orbe", 1, "Combate/Arma/Magia/Orbe", "Orbe empurrado à frente com o braço esticado (disparo)", "st16 sf8 fl40,30 ab15,20 el30,40 P:.42,-.4,.14,.15", ["o", 4.4, -0.2, -0.6], [0, 1, 0], [1, 0, 0]);
/* --- arremesso --- */
golpe("arremessoCruzado", "arremesso", 1, "Combate/Arma/Arremesso/Preparação", "Shuriken/kunai na mão do outro lado do corpo, prestes a lançar de lado", "st30 pt10 sf6 fl60,60 ab20,40 el110,100 P:.3,-.32,.1,.15", ["p", 1.4, 0.2, -2.6], [0.2, 0.98, 0], [0, 0, 1]);
golpe("arremessoSoltou", "arremesso", 1, "Combate/Arma/Arremesso/Ataque", "Braço aberto para o lado depois de lançar (a arma já voou)", "st-28 pt-10 sf2 hy20 fl20,40 ab20,40 el60,90 P:.34,-.34,.12,.16", ["o", 2.6, -0.4, 3.4], [0.6, 0.1, 0.8], [0, 1, 0], { de: "arremessoCruzado" });
/* --- chicote --- */
golpe("chicoteErguido", "chicote", 1, "Combate/Arma/Chicote/Preparação", "Chicote erguido atrás, pronto para estalar", "st-20 sf-6 hp-6 fl40,40 ab20,30 el60,60 P:.3,-.34,.08,.15", ["o", -0.4, 3.2, 0.6], [-0.3, 0.95, 0], [0, 0, 1]);
golpe("chicoteEstalo", "chicote", 1, "Combate/Arma/Chicote/Ataque", "Estalo: braço à frente e abaixo, chicote estendido", "st16 sf14 bp6 fl30,30 ab20,30 el40,40 P:.44,-.42,.18,.15", ["o", 4.0, -1.6, -0.4], [0.85, -0.5, 0], [0, 0, 1], { de: "chicoteErguido" });
/* registra como pegadas (ACOES) */
for (const [nome, G] of Object.entries(GOLPES)) {
  const teste = GL_CLASSES[G.classe][0], corpo = glCorpo(G.corpo);
  const lugar = k => pgPorPega(k, G.maos === 2 && !GL_FOGO.has(G.classe) ? "cabo" : (GL_FOGO.has(G.classe) ? "punho" : G.classe === "escudo" ? "alca" : G.classe === "orbe" ? "palma" : "cabo"),
    pgComb([glBase(k, G.H[0]), 1], [k.B.frenteChao, G.H[1]], [UP, G.H[2]], [k.B.esqChao, G.H[3] * k.s]), glV(k, G.Y), glV(k, G.N));
  const pega1 = GL_FOGO.has(G.classe) ? "punho" : G.classe === "escudo" ? "alca" : G.classe === "orbe" ? "palma" : "cabo";
  const contatos = G.maos === 2 ? k => [pgNaPega(k, k.s, pega1, { polegar: glV(k, G.Y) }), pgNaPega(k, -k.s, GL_FOGO2.has(G.classe) ? "frente" : G.classe === "haste" && /bastao/.test(k.o.tipo) ? "meio2" : "cabo2", { polegar: glV(k, G.Y) })]
    : G.classe === "escudo" ? k => [pgNaPega(k, k.s, "alca", { polegar: UP, cotovelo: [0.4, -1, 0.3], folga: 0.04 })]
    : G.classe === "orbe" ? k => [pgPalmaEm(k, k.s, [0, 0, 0], DN)] : k => [pgNaPega(k, k.s, pega1, { polegar: glV(k, G.Y) })];
  ACOES[nome] = { desc: G.desc, grupo: "golpe", maos: G.maos, modo: "carregar", teste: [teste, {}], gesto: "segurar", fechar: "envolver", corpo, lugar, contatos, golpe: { classe: G.classe, tag: G.tag, de: G.de || null }, bracoEncosta: G.classe === "escudo" };
}
/* rastro do golpe: por onde a ponta da arma passou, da pose de preparação ("de") até a pose atual (pontos no mundo, R).
   A preparação é calculada num corpo de mentira (não mexe na cena); o caminho gira em volta do ombro. */
function trilhaDoGolpe(it, o, tipo, opts = {}) {
  const A = ACOES[tipo], de = A && A.golpe && A.golpe.de, P0 = de && ACOES[de]; if (!P0 || !P0.lugar) return null;
  const ground = restGround(SCN.list[0].params), s = String(opts.mao || "direita").toLowerCase().startsWith("e") ? 1 : -1;
  const ponto = opts.ponto || "ponta", loc = pontosLocaisDoObjeto(o), pl = loc[ponto] || loc.ponta;
  const tmp = Object.assign({}, it, { params: Object.assign({}, it.params) }); pgPoseBase(tmp.params); if (P0.corpo) P0.corpo(tmp.params, s, {});
  const k = { it: tmp, o, s, g: ground, opts: {} }, cx = pgCaixaObjeto(o, ground); k.S = cx.S; k.C = cx.centro; k.meia = cx.meia; k.ax = cx.eixos; k.B = marcosDoCorpo(tmp, ground);
  const L = P0.lugar(k), cl = pgCaixaObjeto(Object.assign({}, o, { rot3: undefined, x: 0, z: 0, base: 0, giro: 0 }), 0).centroLocal, d = pgSub(pl, cl);
  const p0 = pgComb([L.C, 1], [L.ax[0], d[0]], [L.ax[1], d[1]], [L.ax[2], d[2]]), p1 = pontoDoObjeto(o, ponto, ground);
  const B = marcosDoCorpo(it, ground), piv = s > 0 ? B.oE : B.oD, v0 = pgSub(p0, piv), v1 = pgSub(p1, piv), r0 = Math.hypot(...v0), r1 = Math.hypot(...v1), u0 = pgNorm(v0), u1 = pgNorm(v1);
  const ang = Math.acos(Math.max(-1, Math.min(1, pgDot(u0, u1)))), n = Math.max(6, Math.min(24, Math.round(ang * 8))), out = [];
  for (let i = 0; i <= n; i++) { const t = i / n, sa = Math.sin(ang); const u = sa < 1e-3 ? pgNorm(pgAdd(pgMul(u0, 1 - t), pgMul(u1, t))) : pgAdd(pgMul(u0, Math.sin((1 - t) * ang) / sa), pgMul(u1, Math.sin(t * ang) / sa));
    out.push(pgAdd(piv, pgMul(u, r0 + (r1 - r0) * t))); }
  return out;
}
function listaGolpes() { return Object.entries(GOLPES).map(([nome, G]) => ({ nome, classe: G.classe, armas: GL_CLASSES[G.classe][1], maos: G.maos, tag: G.tag, desc: G.desc, de: G.de || null, teste: GL_CLASSES[G.classe][0] })); }

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
/* DUAS MÃOS NO MESMO LUGAR: se os dois contatos caem a menos do espaço de uma mão, a segunda vai para onde uma pessoa poria:
   objeto comprido (haste, cabo, lâmina, cano) → desliza ao longo do eixo comprido (12 cm num cabo curto, até 55 cm numa haste);
   objeto largo (caixa, cadeira, mesa) → lado oposto do objeto. Os dedos e a normal são recalculados na superfície nova. */
function pgSepararMaos(k, cs) {
  if (cs.length !== 2 || !cs[0].P || !cs[1].P || cs[0].s === cs[1].s) return cs;
  const d = pgLen(pgSub(cs[0].P, cs[1].P)), m = k.meia, iL = m.indexOf(Math.max(...m)), L = m[iL] * 2, sec = [...m].sort((a, b) => b - a)[1] * 2, longo = L > sec * 2.2;
  const minimo = longo ? Math.max(0.9, Math.min(4.8, L * (L > 9 ? 0.32 : 0.36))) : Math.max(1.4, sec * 0.8); if (d >= Math.min(minimo, longo ? L * 0.7 : 99, 1.0) || (k.o && k.o.tipo === "corda")) return cs; /* só conserta mãos praticamente no mesmo ponto (< ~11 cm); pegadas já afastadas (rifle, arco, corda) ficam como estão */
  const dom = k.s, i2 = cs[0].s === dom ? 1 : 0, c1 = cs[1 - i2], c2 = cs[i2], ax = k.ax[iL];
  let P;
  if (longo) { const t1 = pgDot(pgSub(c1.P, k.C), ax), lim = m[iL] - 0.35, dir = Math.abs(t1 + minimo) <= lim && (t1 <= 0 || Math.abs(t1 - minimo) > lim) ? 1 : -1; let t2 = Math.max(-lim, Math.min(lim, t1 + dir * minimo)); if (Math.abs(t2 - t1) < minimo * 0.6) t2 = Math.max(-lim, Math.min(lim, t1 - dir * minimo));
    P = pgAdd(c1.P, pgMul(ax, t2 - t1)); }
  else { const lat = k.B && k.B.esqChao ? k.B.esqChao : [1, 0, 0], v = pgSub(c1.P, k.C), comp = pgDot(v, lat); P = pgSub(c1.P, pgMul(lat, 2 * comp || m[0] * 2)); }
  const r = pgMaisPerto(k.S, P), c2n = Object.assign({}, c2, { P: r.P, N: c2.como === "palma" ? r.N : (pgDot(r.N, c2.N || r.N) > 0.2 ? c2.N : r.N) });
  const out = cs.slice(); out[i2] = c2n; return out; }
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
    let res = [], dedos = [], empurrado = 0, aproximado = 0; const folgaExtra = {}; let afastes = 0;
    for (let volta = 0; volta < 10; volta++) {
      const cs = pgSepararMaos(k, A.contatos(k).filter(Boolean)).map(c => folgaExtra[c.s] ? Object.assign({}, c, { folga: (c.folga ?? (c.como === "forca" || c.como === "gancho" ? 0.02 : 0.03)) + folgaExtra[c.s] }) : c), alvos = cs.map(c => ({ c, a: pgAlvoDoContato(it, c) }));
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
      /* SÓLIDO: se algum dedo/palma ainda entra no objeto (> 1 cm), afasta a mão pela normal e refaz (até 4 vezes) */
      if (A.fechar !== "nao" && !A.semAfastar && afastes < 4) { let refaz = false; alvos.forEach(({ c }, i) => { const e = Math.max(0, ...(dedos[i] || []).map(d => d.entra)); if (e > 1.0 && (folgaExtra[c.s] || 0) < 0.45) { folgaExtra[c.s] = Math.min(0.45, (folgaExtra[c.s] || 0) + Math.min(0.45, e / 11.4 * 0.9)); refaz = true; } });
        if (refaz) { afastes++; volta--; continue; } }
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
export { ESGRIMA, trilhaDoGolpe, GOLPES, GL_CLASSES, listaGolpes, PEGADA_PADRAO, PEGADAS, ACOES, ALIAS_PEGADA, segurarComo, listaPegadas, marcosDoCorpo, atualizarCordas, pgResolverMao, pgAlvoDoContato, pgFecharDedos, pgSdf, pgRaio, pgMaisPerto };
