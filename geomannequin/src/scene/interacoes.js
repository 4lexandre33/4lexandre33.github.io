/* GeoMannequin — interações entre dois manequins: abraços (de frente, de lado, por trás), ombro a ombro,
   mão no ombro e apoiar o ferido. A fica onde está; B é posto ao lado/à frente/atrás de A. Cada mão vai por IK até um
   ponto do corpo do outro (costas, ombro, cintura); o contato entre os dois passa a ser permitido; braços que entram no
   tronco do outro são puxados para a superfície. */
import { SCN } from "./modelo.js";
import { restGround, aplicarGesto, ikArm, armDims, shape, doMundo } from "../engine/index.js";
import { manifoldRig, colliderRig } from "../engine/contact-v2.js";
import { alinharPalmaV3, handFrameV3 } from "./grip-v3.js";
import { marcosDoCorpo } from "./pegadas.js";

const INTERACOES = {
  abracoFrente: "Abraço de frente: os dois se abraçam, mãos nas costas do outro",
  abracoLado: "Abraço de lado: lado a lado olhando para a frente, braço de dentro em volta do outro",
  abracoPorTras: "Abraço por trás: A atrás de B, braços em volta da cintura de B",
  ombroAOmbro: "Ombro a ombro (camaradas): lado a lado, braços por cima dos ombros um do outro",
  maoNoOmbro: "Mão no ombro: de frente, A põe a mão no ombro de B",
  apoiandoFerido: "Apoiando o ferido: B (ferido) com o braço por cima dos ombros de A, A segura B pela cintura"
};
const ALIAS_INTERACAO = { abraco: "abracoFrente", "abraço": "abracoFrente", frente: "abracoFrente", lado: "abracoLado", "por tras": "abracoPorTras", "por trás": "abracoPorTras", tras: "abracoPorTras",
  camaradas: "ombroAOmbro", ombro: "maoNoOmbro", "mao no ombro": "maoNoOmbro", "mão no ombro": "maoNoOmbro", ferido: "apoiandoFerido", apoiar: "apoiandoFerido", apoiado: "apoiandoFerido" };

const itAddX = (a, b) => a.map((v, i) => v + b[i]), itMulX = (a, k) => a.map(v => v * k), itSubX = (a, b) => a.map((v, i) => v - b[i]);
const itCombX = (...t) => t.reduce((acc, [v, k]) => itAddX(acc, itMulX(v, k)), [0, 0, 0]);
const frenteDe = it => { const r = (it.params.wRot || 0) * Math.PI / 180; return [Math.sin(r), 0, Math.cos(r)]; };
const esqDe = it => { const f = frenteDe(it); return [f[2], 0, -f[0]]; }; /* esquerda do manequim (de frente para +z, esquerda = +x) */
function porB(itA, itB, ond, giroRel) {
  const pA = [itA.params.wx || 0, 0, itA.params.wz || 0], v = itAddX(pA, ond);
  itB.params.wx = Math.max(-30, Math.min(30, v[0])); itB.params.wz = Math.max(-30, Math.min(30, v[2]));
  itB.params.wRot = (((itA.params.wRot || 0) + giroRel + 540) % 360) - 180;
}
/* o plano: onde B fica e para onde cada mão vai (alvos no corpo do outro) */
function planoInteracao(tipo, A, B, ground) {
  const fA = frenteDe(A), eA = esqDe(A), u = [0, 1, 0];
  switch (tipo) {
    case "abracoFrente": porB(A, B, itMulX(fA, 2.5), 180); break;
    case "abracoLado": case "ombroAOmbro": porB(A, B, itAddX(itMulX(eA, 3.8), itMulX(fA, 0.5)), 0); break;
    case "abracoPorTras": porB(A, B, itMulX(fA, 2.3), 0); break;
    case "maoNoOmbro": porB(A, B, itMulX(fA, 4.6), 180); break;
    case "apoiandoFerido": porB(A, B, itMulX(eA, 3.8), 0); break;
  }
  const MA = marcosDoCorpo(A, ground), MB = marcosDoCorpo(B, ground);
  const costas = M => itAddX(M.peito, itMulX(M.frente, -(M.meiaProf + 0.25)));
  const h = (it, s, P, gesto, pron = 0, cot = null) => ({ it, s, P, gesto, pron, cot });
  const SOBRE = [0.3, 1, -0.7]; /* cotovelo para cima e para trás: braço por cima dos ombros do outro */
  switch (tipo) {
    case "abracoFrente": return [
      h(A, 1, itCombX([costas(MB), 1], [eA, 0.75], [u, 0.3]), "aberta", -40), h(A, -1, itCombX([costas(MB), 1], [eA, -0.8], [u, -1.3]), "aberta", -40),
      h(B, 1, itCombX([costas(MA), 1], [MB.esq, 0.75], [u, -1.2]), "aberta", -40), h(B, -1, itCombX([costas(MA), 1], [MB.esq, -0.8], [u, 0.35]), "aberta", -40)];
    case "abracoLado": return [
      h(A, 1, itCombX([MB.oE, 1], [u, 0.45], [MB.frente, -0.6]), "garra", -60, SOBRE), h(B, -1, itCombX([MA.cintura, 1], [eA, -1.0], [MA.frente, -0.55]), "aberta", -30, [0.4, -0.3, -0.9])];
    case "ombroAOmbro": return [
      h(A, 1, itCombX([MB.oE, 1], [u, 0.45], [MB.frente, -0.6]), "garra", -60, SOBRE), h(B, -1, itCombX([MA.oD, 1], [u, 0.45], [MA.frente, -0.6]), "garra", -60, SOBRE)];
    case "abracoPorTras": return [
      h(A, 1, itCombX([MB.cintura, 1], [MB.frente, MB.meiaProf + 0.3], [MB.esq, 0.35], [u, 0.3]), "aberta", -80), h(A, -1, itCombX([MB.cintura, 1], [MB.frente, MB.meiaProf + 0.3], [MB.esq, -0.35], [u, 0.6]), "aberta", -80),
      h(B, 1, itCombX([MB.cintura, 1], [MB.frente, MB.meiaProf + 0.65], [MB.esq, 0.25], [u, 0.45]), "aberta", -80)];
    case "maoNoOmbro": return [h(A, -1, itCombX([MB.oE, 1], [u, 0.3], [MB.frente, 0.15]), "garra", -70)];
    case "apoiandoFerido": return [
      h(B, -1, itCombX([MA.oD, 1], [u, 0.15], [MA.frente, -0.15], [MA.esq, 0.2]), "garra", -70, SOBRE), h(A, 1, itCombX([MB.cintura, 1], [MB.esq, 1.0], [MB.frente, -0.5]), "aberta", -30, [0.4, -0.3, -0.9])];
  }
  throw new Error("Interação desconhecida: “" + tipo + "”.");
}

/* palma até o alvo com o cotovelo apontando para "cotovelo" (referencial do tronco: [lado para fora, cima, frente]) */
function palmaComCotovelo(it, s, alvo, ground, cotovelo) {
  if (!cotovelo) return alinharPalmaV3(it, s, alvo, ground);
  const p = it.params, L = s > 0 ? "L" : "R", meia = 0.5 * armDims(p).LH; let resto = Infinity;
  for (let i = 0; i < 5; i++) {
    const F = handFrameV3(it, s, ground), punho = alvo.map((v, k) => v + meia * F.M[k * 3 + 1]);
    const r = ikArm(p, shape(p), s, doMundo({ ...p, wy: ground - restGround(p) })(punho), [s * cotovelo[0], cotovelo[1], cotovelo[2]]);
    Object.assign(p, { ["armAbd" + L]: r.abd, ["armFlex" + L]: r.flex, ["armRot" + L]: r.rot, ["elbow" + L]: r.elbow });
    const H = handFrameV3(it, s, ground); resto = Math.hypot(...alvo.map((v, k) => v - H.T[k])); if (resto <= 0.035) break;
  }
  return resto;
}
const BRACO = /^(braco|antebraco|mao)([ED])$/, TRONCO = /^(torax|abdomen|pelve|pescoco|cabeca)$/;
function wMundo(it, ground) { return { ...it.params, wy: ground - restGround(it.params) }; }

/* cena.interagir("Ana", "Leo", "abracoFrente") */
function interagir(A, B, tipo0, opts = {}) {
  if (!A || !B || A === B) throw new Error("Escolha dois manequins diferentes.");
  const t0 = String(tipo0 || "").trim(), tipo = INTERACOES[t0] ? t0 : ALIAS_INTERACAO[t0.toLowerCase()];
  if (!tipo) throw new Error("Interação desconhecida: “" + tipo0 + "”. Opções: " + Object.keys(INTERACOES).join(", ") + ".");
  const ground = restGround(SCN.list[0].params), antesA = { ...A.params }, antesB = { ...B.params };
  try {
    /* ponto de partida limpo para quem vai mexer os braços (o resto da pose fica) */
    if (tipo === "apoiandoFerido") Object.assign(B.params, { spineSide: 12, spineFlex: 14, headRoll: 18, headPitch: 18, kneeFlexR: 25, hipFlexR: 18 });
    if (tipo === "abracoFrente") { A.params.headYaw = 30; B.params.headYaw = 30; A.params.spineFlex = 6; B.params.spineFlex = 6; }
    let maos = planoInteracao(tipo, A, B, ground), desvio = 0;
    for (let volta = 0; volta < 6; volta++) {
      desvio = 0;
      for (const m of maos) { const L = m.s > 0 ? "L" : "R"; desvio = Math.max(desvio, palmaComCotovelo(m.it, m.s, m.P, ground, m.cot)); aplicarGesto(m.it.params, m.s, m.gesto); m.it.params["pron" + L] = m.pron; }
      /* braço de um dentro do tronco do outro: puxa o alvo daquela mão para fora (para longe do centro do outro) */
      const hits = manifoldRig(wMundo(A, ground), wMundo(B, ground), { tol: 0.04, level: "coarse" });
      let mexeu = false;
      for (const c of hits) {
        const [braco, tronco, dono, outro] = BRACO.test(c.pa) && TRONCO.test(c.pb) ? [c.pa, c.pb, A, B] : BRACO.test(c.pb) && TRONCO.test(c.pa) ? [c.pb, c.pa, B, A] : [];
        if (!braco) continue;
        const s = braco.endsWith("E") ? 1 : -1, m = maos.find(q => q.it === dono && q.s === s); if (!m) continue;
        /* n aponta do corpo b para o corpo a: o braço sai na direção de n se ele é "a", ao contrário se é "b" */
        const n = braco === c.pa ? c.n : itMulX(c.n, -1), saida = [n[0], Math.max(0, n[1]), n[2]], l = Math.hypot(...saida) || 1;
        m.P = itAddX(m.P, itMulX(saida.map(v => v / l), c.prof + 0.1)); mexeu = true;
      }
      if (!mexeu) break;
    }
    /* os dois podem encostar um no outro sem contar como colisão */
    const ids = x => (x.contato || (x.contato = []));
    if (!ids(A).includes(B.id)) A.contato.push(B.id); if (!ids(B).includes(A.id)) B.contato.push(A.id);
    const restam = manifoldRig(wMundo(A, ground), wMundo(B, ground), { tol: 0.06, level: "coarse" }).filter(c => (BRACO.test(c.pa) && TRONCO.test(c.pb)) || (BRACO.test(c.pb) && TRONCO.test(c.pa)));
    return { interacao: tipo, a: A.name, b: B.name, alcance: desvio <= 0.4 ? "ok" : "uma mão ficou a " + Math.round(desvio * 11.4) + " cm do ponto", bracoAtravessando: restam.slice(0, 3).map(c => c.pa + " × " + c.pb) };
  } catch (e) { Object.assign(A.params, antesA); Object.assign(B.params, antesB); throw e; }
}
function listaInteracoes() { return Object.entries(INTERACOES).map(([tipo, descricao]) => ({ tipo, descricao })); }
export { INTERACOES, interagir, listaInteracoes };
