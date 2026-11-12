/* GeoMannequin — formas de segurar qualquer objeto (pegadas).
   Cada pegada decide, a partir do corpo do manequim: onde o objeto fica e em que orientação, onde vai cada palma,
   o gesto da mão e o giro do antebraço. Depois: IK dos braços até as palmas, objeto preso à mão (preensão V3, segue a
   mão quando a pose muda) e correção de colisão — o objeto (e a mão junto) é empurrado para fora do tronco, cabeça e
   pernas até não atravessar. Funciona com qualquer caixa/cilindro (inclusive placa, varinha, tora, caixa pequena). */
import { SCN } from "./modelo.js";
import { ossosDoCorpo, paraMundo, restGround, aplicarGesto, colliderRig, colliderObject, manifoldObject } from "../engine/index.js";
import { rigidFrame, setRigidObjectPose } from "../engine/rigid-transform.js";
import { alinharPalmaV3, beginRigidGrip, releaseRigidGrip } from "./grip-v3.js";

const PEGADAS = {
  forca: "Mão fechada em volta (bastão, espada, cabo, garrafa): objeto em pé no punho, ao lado do corpo",
  espada: "Duas mãos no cabo, à frente, ponta para cima e para a frente (espada, taco, vassoura)",
  pinca: "Pinça entre polegar e indicador (varinha, lápis, carta, flor)",
  gancho: "Dedos em gancho, braço esticado para baixo (mala, balde, sacola pela alça)",
  bandeja: "Palma para cima sustentando por baixo (bandeja, prato, livro aberto, caixa pequena)",
  duasMaos: "Duas mãos dos lados, à frente da cintura (caixa, cesto, objeto pesado)",
  abracado: "Abraçado contra o peito, braços em volta (caixa grande, ursinho, pacote)",
  acimaDaCabeca: "Erguido acima da cabeça com as duas mãos (mesa, pedra, tronco, outra pessoa)",
  noOmbro: "Apoiado no ombro, mão segurando na frente (tora, saco, bazuca, prancha)",
  debaixoDoBraco: "Preso debaixo do braço contra as costelas (livro, capacete, pasta, prancha)",
  noQuadril: "Apoiado no quadril com o braço em volta (balde, cesto de roupa, criança pequena)",
  empurrando: "Duas palmas empurrando à frente do peito (caixa, porta, parede móvel)"
};
const ALIAS_PEGADA = { "força": "forca", punho: "forca", cabo: "forca", "pinça": "pinca", alca: "gancho", "alça": "gancho", mala: "gancho", "palma": "bandeja", "por baixo": "bandeja",
  "duas maos": "duasMaos", "duas mãos": "duasMaos", carregar: "duasMaos", abraco: "abracado", "abraço": "abracado", "no peito": "abracado", "acima da cabeca": "acimaDaCabeca", "acima da cabeça": "acimaDaCabeca", erguer: "acimaDaCabeca",
  ombro: "noOmbro", "no ombro": "noOmbro", "debaixo do braco": "debaixoDoBraco", "debaixo do braço": "debaixoDoBraco", quadril: "noQuadril", "no quadril": "noQuadril", empurrar: "empurrando" };

const pgAdd = (a, b) => a.map((v, i) => v + b[i]), pgSub = (a, b) => a.map((v, i) => v - b[i]), pgMul = (a, k) => a.map(v => v * k);
const pgNorm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
const pgCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const pgComb = (...t) => t.reduce((acc, [v, k]) => pgAdd(acc, pgMul(v, k)), [0, 0, 0]);

/* pontos do corpo no mesmo mundo da preensão V3 + eixos do tronco (frente, esquerda dele, cima) */
function marcosDoCorpo(it, ground) {
  const p = it.params, W = paraMundo({ ...p, wy: ground - restGround(p) }), J = ossosDoCorpo(p).juntas;
  const g = (n, s = 0) => { const j = J.find(x => x.nome === n && x.s === s) || J.find(x => x.nome === n); return W(j.P); };
  const oE = g("ombro", 1), oD = g("ombro", -1), pel = g("pelve"), cab = g("cabeça (atlas)"), qE = g("quadril", 1), qD = g("quadril", -1);
  const esq = pgNorm(pgSub(oE, oD)), cima = [0, 1, 0], frente = pgNorm(pgCross(esq, cima)), largOmbro = Math.hypot(...pgSub(oE, oD));
  const peito = pgAdd(pgMul(pgAdd(oE, oD), 0.5), pgMul(cima, -1.0)), cintura = pgAdd(pel, pgMul(cima, 1.2));
  return { oE, oD, pel, cab, qE, qD, esq, cima, frente, peito, cintura, largOmbro, topo: pgAdd(cab, pgMul(cima, 2.3)), meiaProf: 0.95 };
}
/* pgMatriz (linhas) a partir das colunas: eixos locais do objeto X (largura), Y (altura), Z (profundidade) no mundo */
const pgMatriz = (X, Y, Z) => [X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]];
const pgEixos = (Y, F) => { Y = pgNorm(Y); const X = pgNorm(pgCross(Y, F)); return [X, Y, pgNorm(pgCross(X, Y))]; };

/* o plano de cada pegada: centro do objeto, eixos, palmas, gestos e giro do antebraço */
function planoDaPegada(tipo, o, B, s) {
  const larg = o.larg || 1, alt = o.alt || 1, prof = o.prof || 1, esp = Math.min(larg, prof);
  const { esq, cima, frente } = B, lado = pgMul(esq, s), ombro = s > 0 ? B.oE : B.oD, quadril = s > 0 ? B.qE : B.qD;
  const reto = pgEixos(cima, frente), deitadoFrente = pgEixos(frente, cima);
  switch (tipo) {
    case "forca": { const P = pgComb([B.cintura, 1], [lado, 1.35], [frente, 2.0], [cima, 0.6]);
      return { C: pgAdd(P, pgMul(cima, alt * 0.15)), ax: reto, maos: [{ s, P, gesto: "segurar", pron: -10 }] }; }
    case "espada": { const P = pgComb([B.cintura, 1], [frente, 2.3], [cima, 1.0]), d = pgNorm(pgComb([frente, 0.55], [cima, 0.83]));
      return { C: pgAdd(P, pgMul(d, alt * 0.3)), ax: pgEixos(d, pgMul(esq, -1)), maos: [{ s, P: pgAdd(P, pgMul(d, 0.45)), gesto: "segurar", pron: -30 }, { s: -s, P: pgAdd(P, pgMul(d, -0.45)), gesto: "segurar", pron: -30 }] }; }
    case "pinca": { const P = pgComb([B.peito, 1], [frente, 2.4], [lado, 0.9]), d = pgNorm(pgComb([frente, 0.75], [cima, 0.65]));
      return { C: pgAdd(P, pgMul(d, alt * 0.35)), ax: pgEixos(d, cima), maos: [{ s, P, gesto: "pinca", pron: -20 }] }; }
    case "gancho": { const P = pgComb([ombro, 1], [cima, -4.9], [lado, 0.55]);
      return { C: pgAdd(P, pgMul(cima, -(alt / 2 + 0.25))), ax: reto, maos: [{ s, P, gesto: "gancho", pron: 0 }] }; }
    case "bandeja": { const P = pgComb([B.cintura, 1], [cima, 0.3], [frente, 2.9], [lado, 1.0]);
      return { C: pgAdd(P, pgMul(cima, alt / 2 + 0.2)), ax: reto, maos: [{ s, P, gesto: "mesa", pron: 85 }] }; }
    case "duasMaos": { const C = pgComb([B.cintura, 1], [cima, 0.1], [frente, B.meiaProf + prof / 2 + 0.35]), w = Math.min(larg / 2, B.largOmbro * 0.9);
      return { C, ax: reto, maos: [{ s: 1, P: pgAdd(C, pgMul(esq, w)), gesto: "espalmada", pron: 0 }, { s: -1, P: pgAdd(C, pgMul(esq, -w)), gesto: "espalmada", pron: 0 }] }; }
    case "abracado": { const C = pgComb([B.peito, 1], [cima, -0.6], [frente, B.meiaProf + prof / 2 + 0.15]), w = Math.min(larg / 2 * 0.85, B.largOmbro);
      return { C, ax: reto, maos: [1, -1].map(t => ({ s: t, P: pgComb([C, 1], [esq, t * w], [frente, prof * 0.3]), gesto: "aberta", pron: 0 })) }; }
    case "acimaDaCabeca": { const C = pgComb([B.topo, 1], [cima, 1.7 + alt / 2]), w = Math.min(larg / 2, B.largOmbro * 0.75);
      return { C, ax: reto, maos: [1, -1].map(t => ({ s: t, P: pgComb([C, 1], [cima, -alt / 2 - 0.1], [esq, t * w]), gesto: "mesa", pron: 85 })) }; }
    case "noOmbro": { const C = pgComb([ombro, 1], [cima, esp / 2 + 0.45], [frente, -0.3], [lado, -0.2]);
      return { C, ax: deitadoFrente, maos: [{ s, P: pgComb([C, 1], [frente, Math.min(alt * 0.3, 2.4)], [cima, -esp / 2 - 0.1]), gesto: "garra", pron: -60 }] }; }
    case "debaixoDoBraco": { const C = pgComb([B.peito, 1], [cima, -0.9], [lado, B.largOmbro / 2 + esp / 2 + 0.05], [frente, 0.2]);
      const Z = lado, Y = cima, X = pgNorm(pgCross(Y, Z));
      return { C, ax: [X, Y, Z], maos: [{ s, P: pgComb([C, 1], [cima, -alt / 2 + 0.25], [frente, 0.6]), gesto: "garra", pron: 0 }] }; }
    case "noQuadril": { const C = pgComb([quadril, 1], [lado, 0.9 + larg / 2], [cima, 0.4]);
      return { C, ax: reto, maos: [{ s, P: pgComb([C, 1], [cima, alt / 2 + 0.05], [lado, -larg * 0.2]), gesto: "garra", pron: -40 }] }; }
    case "empurrando": { const C = pgComb([B.peito, 1], [frente, 3.1 + prof / 2]);
      return { C, ax: reto, maos: [1, -1].map(t => ({ s: t, P: pgComb([C, 1], [frente, -prof / 2 - 0.1], [esq, t * Math.min(larg / 2 * 0.7, 1.0)]), gesto: "espalmada", pron: -10, punho: -60 })) }; }
  }
  throw new Error("Pegada desconhecida: “" + tipo + "”.");
}
const pgPivoDoCentro = (C, ax, alt) => pgSub(C, pgMul(ax[1], alt / 2)); /* o pivô do objeto é o centro da base */
function pgColocar(o, plano, ground) { const [X, Y, Z] = plano.ax; setRigidObjectPose(o, rigidFrame(pgMatriz(X, Y, Z), pgPivoDoCentro(plano.C, plano.ax, o.alt || 1)), ground); o.emAr = true; delete o.sobre; delete o.sobreRel; }
/* penetração do objeto no corpo (tronco, cabeça, pernas e braços do próprio manequim, menos as mãos que seguram) */
function pgPenetracao(it, o, ground, maosQueSeguram) {
  const p = it.params, rig = colliderRig({ ...p, wy: ground - restGround(p) }, { level: "coarse" });
  const ignorar = new Set(maosQueSeguram.flatMap(s => s > 0 ? ["maoE", "antebracoE"] : ["maoD", "antebracoD"]));
  const corpo = { ...rig, caps: rig.caps.filter(c => !ignorar.has(c.nome)) };
  return manifoldObject(corpo, colliderObject(o, ground), { tol: 0.02, margin: 0.05, max: 24 });
}

/* m.segurarComo(objeto, tipo, {mao}) */
function segurarComo(it, o, tipo0, opts = {}) {
  const t0 = String(tipo0 || "").trim(), tipo = PEGADAS[t0] ? t0 : ALIAS_PEGADA[t0.toLowerCase()];
  if (!tipo) throw new Error("Pegada desconhecida: “" + tipo0 + "”. Opções: " + Object.keys(PEGADAS).join(", ") + ".");
  const ground = restGround(SCN.list[0].params), s = String(opts.mao || "direita").toLowerCase().startsWith("e") ? 1 : -1;
  if (o.gripV3) releaseRigidGrip(SCN.list.find(x => x.id === o.gripV3.mannequinId) || it, o, ground, { modo: "manter" });
  delete o.grip;
  /* outras coisas presas nas mãos que esta pegada usa são soltas antes */
  const plano0 = planoDaPegada(tipo, o, marcosDoCorpo(it, ground), s), lados = plano0.maos.map(h => h.s);
  SCN.objetos.forEach(q => { if (q !== o && q.gripV3?.mannequinId === it.id && (lados.includes(q.gripV3.side) || lados.includes(q.gripV3.secundaria?.side))) releaseRigidGrip(it, q, ground, { modo: "manter" }); });
  const antes = { ...it.params };
  try {
    let plano = plano0, desvio = 0, empurrado = 0;
    for (let volta = 0; volta < 8; volta++) {
      pgColocar(o, plano, ground);
      desvio = 0;
      for (const h of plano.maos) {
        const L = h.s > 0 ? "L" : "R";
        desvio = Math.max(desvio, alinharPalmaV3(it, h.s, h.P, ground));
        aplicarGesto(it.params, h.s, h.gesto); it.params["pron" + L] = h.pron; if (h.punho !== undefined) it.params["wrist" + L] = h.punho;
      }
      /* não atravessar: empurra objeto e palmas para fora na direção média de saída */
      const hits = pgPenetracao(it, o, ground, lados);
      if (!hits.length) break;
      const prof = Math.max(...hits.map(h => h.prof)), dir = pgNorm(hits.reduce((a, h) => pgAdd(a, pgMul(h.n, -(h.prof + 0.01))), [0, 0, 0]));
      const passo = pgMul(dir, prof + 0.12); empurrado += prof + 0.12;
      plano = { ...plano, C: pgAdd(plano.C, passo), maos: plano.maos.map(h => ({ ...h, P: pgAdd(h.P, passo) })) };
    }
    pgColocar(o, plano, ground);
    const restam = pgPenetracao(it, o, ground, lados);
    beginRigidGrip(it, o, plano.maos[0].s, ground, { modo: "preservar", reach: 100, objetos: SCN.objetos });
    if (plano.maos[1]) beginRigidGrip(it, o, plano.maos[1].s, ground, { modo: "preservar", reach: 100, segunda: true, preservarPoseSecundaria: true, objetos: SCN.objetos });
    return { objeto: o.nome || o.tipo, pegada: tipo, maos: plano.maos.map(h => h.s > 0 ? "esquerda" : "direita"), alcance: desvio <= 0.35 ? "ok" : "a mão ficou a " + Math.round(desvio * 11.4) + " cm do ponto",
      empurradoParaFora: Math.round(empurrado * 11.4), atravessa: restam.length ? restam.slice(0, 3).map(h => h.pa) : [] };
  } catch (e) { Object.assign(it.params, antes); throw e; }
}
function listaPegadas() { return Object.entries(PEGADAS).map(([tipo, descricao]) => ({ tipo, descricao, maos: ["duasMaos", "abracado", "acimaDaCabeca", "empurrando", "espada"].includes(tipo) ? 2 : 1 })); }
export { PEGADAS, ALIAS_PEGADA, segurarComo, listaPegadas, marcosDoCorpo };
