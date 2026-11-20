/* GeoMannequin — MÃOS NO LUGAR CERTO: marcos do corpo (queixo, boca, testa, nuca, peito, braço oposto, cintura, bolso, costas…)
   e a cinemática inversa com braço natural (cotovelo para baixo e para fora) que leva o punho até o marco. As poses cujo nome
   diz onde está a mão (braços cruzados, mão no queixo, mãos nos bolsos…) passam por aqui depois de montadas (POSE_MAOS).
   Também serve aos comandos "Kai mao-dir no queixo" e à auditoria (testes/maos-pernas.mjs).
   Coordenadas dos marcos: em R, no corpo em pé (x = lado esquerdo do manequim, y = para cima, z = para a frente), no quadro da
   cabeça (A3), do tórax (A2) ou da pelve (Pel); "t" = lado da mão (1 esquerda, −1 direita). O ponto é o PUNHO. */
import { chainSetup, ikArm, applyA, shape, capsulas, autoColisoes, legPose, legDims, comp } from "../engine/index.js";

const MARCOS = {
  queixo: { f: "A3", p: t => [t * 0.25, -1.45, 1.2], pron: 70, curl: 0.55, wrist: 25, desc: "punho sob o queixo" },
  boca: { f: "A3", p: t => [t * 0.3, -1.0, 1.35], pron: 20, curl: 0.2, desc: "mão na frente da boca" },
  bochecha: { f: "A3", p: t => [t * 0.95, -1.1, 0.95], pron: 40, curl: 0.15, desc: "mão no rosto" },
  testa: { f: "A3", p: t => [t * 0.45, 0.15, 1.35], pron: 0, curl: 0.15, desc: "mão na testa" },
  olhos: { f: "A3", p: t => [t * 0.55, -0.45, 1.45], pron: 0, curl: 0.25, desc: "mão nos olhos" },
  orelha: { f: "A3", p: t => [t * 1.2, -0.75, 0.45], pron: 80, curl: 0.5, desc: "mão no ouvido (telefone)" },
  nuca: { f: "A3", p: t => [t * 0.45, -0.35, -1.15], pron: 0, curl: 0.3, desc: "mão atrás da cabeça" },
  cabeca: { f: "A3", p: t => [t * 0.35, 1.05, 0.05], pron: 0, curl: 0.35, desc: "mão no alto da cabeça" },
  peito: { f: "A2", p: t => [-t * 0.15, -3.45, 1.3], pron: 70, curl: 0.05, desc: "mão espalmada no peito" },
  coracao: { f: "A2", p: t => [t * 0.05, -3.4, 1.3], pron: 70, curl: 0.05, desc: "mão no coração (lado esquerdo do peito)" },
  cruzadoCima: { f: "A2", p: t => [-t * 1.85, -3.7, 1.35], pron: 40, curl: 0.35, desc: "braços cruzados: mão por cima, no braço oposto" },
  cruzadoBaixo: { f: "A2", p: t => [-t * 1.95, -4.5, 0.95], pron: 70, curl: 0.4, desc: "braços cruzados: mão por baixo do braço oposto" },
  abraco: { f: "A2", p: t => [-t * 1.75, -2.9, 0.95], pron: 60, curl: 0.45, desc: "abraçando a si mesmo (mão no ombro oposto)" },
  ombroOposto: { f: "A2", p: t => [-t * 1.6, -2.4, 0.75], pron: 60, curl: 0.3, desc: "mão no ombro do outro lado" },
  prece: { f: "A2", p: t => [t * 0.1, -3.2, 2.15], pron: -10, curl: 0, desc: "palmas juntas na frente do peito" },
  barriga: { f: "Pel", p: t => [t * 0.3, -5.1, 0.95], pron: 60, curl: 0.1, desc: "mão na barriga" },
  cintura: { f: "Pel", p: t => [t * 1.6, -5.25, -0.05], pron: 40, curl: 0.35, wrist: -45, desc: "mão na cintura (akimbo)" },
  bolso: { f: "Pel", p: t => [t * 1.8, -6.35, 0.4], pron: 10, curl: 0.5, wrist: 55, desc: "mão no bolso da frente" },
  bolsoTras: { f: "Pel", p: t => [t * 1.05, -6.9, -1.0], pron: 0, curl: 0.4, desc: "mão no bolso de trás" },
  costas: { f: "Pel", p: t => [t * 0.25, -5.7, -1.7], pron: 0, curl: 0.3, desc: "mãos atrás das costas" },
  lombar: { f: "Pel", p: t => [t * 1.0, -5.6, -1.85], pron: 0, curl: 0.1, desc: "mão na lombar (costas doendo)" },
  sobCotovelo: { f: "A2", p: t => [-t * 1.2, -4.6, 1.0], pron: 70, curl: 0.3, desc: "mão apoiando o cotovelo do outro braço" },
  colo: { f: "Pel", p: t => [t * 0.55, -5.1, 2.7], pron: 80, curl: 0.5, desc: "mãos no colo (segurando um livro, sentado)" },
  coxa: { f: "coxa", p: t => [0, 0.5, 0.3], pron: 0, curl: 0.25, desc: "mão na coxa / no joelho (segue a perna)" },
};
/* poses cujo nome diz onde está a mão: { L: marco, R: marco } (L = mão esquerda do manequim) */
const POSE_MAOS = {};
const pm = (lista, maos) => lista.split(/\s+/).filter(Boolean).forEach(n => { POSE_MAOS[n] = maos; });
pm("bracosCruzadosPeito cruzar viloesBracosCruzados rfViloaBracosCruzados hipHopBracosCruzados bracosCruzadosEmburrado bracosCruzadosOuvindo encostadoBracosCruzados segurancaBracosCruzados romCiumes", { L: "cruzadoCima", R: "cruzadoBaixo" });
pm("abracandoASiMesmo rfDespedidaAbracandoSi emoTremendoFrio", { L: "abraco", R: "abraco" });
pm("maosNosBolsos camMaosNoBolso", { L: "bolso", R: "bolso" });
pm("maoNoBolsoRelaxado", { R: "bolso" });
pm("maosAtrasDasCostas rfVergonhaMaosAtras", { L: "costas", R: "costas" });
pm("velhoCostasDoendo", { R: "lombar" });
pm("maosNaCinturaBravo rfProvedorMaosNaCintura modeloMaoNoQuadril", { L: "cintura", R: "cintura" });
pm("maoNoQueixo", { R: "queixo", L: "sobCotovelo" });
pm("maoAtrasDaCabeca emoCocandoNuca rfVergonhaMaoNaNuca", { R: "nuca" });
pm("cocandoACabeca", { R: "cabeca" });
pm("maoNaTesta", { R: "testa" });
pm("maoNoPeitoJuramento rfDespedidaMaoNoPeito gestoMaoNoPeitoSaudando cerimHinoMaoPeito rfProvedorMaoNoPeito", { R: "coracao" });
pm("emoAgarradoAoPeito rfDorPeito", { L: "peito", R: "peito" });
pm("rezando ajoelhadoRezando fePrecandoAjoelhado implorandoMaosJuntas maosEmPrece", { L: "prece", R: "prece" });
pm("hospSegurandoBarriga rfDorBarriga segurandoBarrigaRindo", { L: "barriga", R: "barriga" });
pm("cochichandoMaoNaBoca escCobrindoBoca rfVergonhaCobrindoBoca", { R: "boca" });
pm("dedoNosLabios infSinalSilencio", { R: "boca" });
pm("celularNoOuvido escrAoTelefone terTelefoneSemSinal", { R: "orelha" });
pm("chocadoMaosNaBoca", { L: "boca", R: "boca" });
pm("escolaEstudandoChao", { L: "colo", R: "colo" });

/* o ponto (mundo) de um marco para a mão do lado t */
function marcoNoMundo(Q, marco, t, ch, desl) { const m = MARCOS[marco]; if (!m) throw new Error("Marco “" + marco + "” não existe. Use: " + Object.keys(MARCOS).join(", ") + ".");
  const c = ch || chainSetup(Q, shape(Q)), d = desl || [0, 0, 0], p = m.p(t);
  /* marco na coxa: segue a coxa do mesmo lado (em pé, sentado, de pernas cruzadas) — p = [lado, ao longo da coxa (0 quadril … 1 joelho), acima] */
  if (m.f === "coxa") { const A = legDims(Q), Th = comp(c.Pel, legPose(Q, c.F, c, t).thigh); return applyA(Th, [p[0] * t + d[0], -A.L1 * p[1] + d[1], 0.55 * A.k + p[2] + d[2]]); }
  const fr = m.f === "A3" ? c.A3 : m.f === "Pel" ? c.Pel : c.A2; return applyA(fr, [p[0] + d[0], p[1] + d[1], p[2] + d[2]]); }
/* leva a mão do lado t (1 = esquerda, −1 = direita) ao marco; devolve o erro em R */
function maoNoMarco(Q, t, marco, o = {}) { const S = shape(Q), ch = chainSetup(Q, S), alvo = marcoNoMundo(Q, marco, t, ch, o.desl), r = ikArm(Q, S, t, alvo, null, true), L = t > 0 ? "L" : "R", m = MARCOS[marco];
  Object.assign(Q, { ["armAbd" + L]: Math.round(r.abd), ["armFlex" + L]: Math.round(r.flex), ["armRot" + L]: Math.round(r.rot), ["elbow" + L]: Math.round(r.elbow) });
  if (o.mao !== false) { if (m.pron !== undefined) Q["pron" + L] = m.pron; if (m.wrist !== undefined) Q["wrist" + L] = m.wrist; if (m.curl !== undefined && o.curl !== false) Q["handCurl" + L] = m.curl; }
  return r.err; }
/* aplica as mãos de uma pose (depois de montada); devolve os lados ajustados */
/* encostar pode, atravessar não: se um antebraço/mão entra no outro braço ou nas pernas mais que "lim", o punho de cima vai um
   pouco para a frente (e para cima) e a IK roda de novo */
function mbSeg(a, b, c, d) { const u = a.map((v, i) => b[i] - v), v = c.map((x, i) => d[i] - x), w = a.map((x, i) => x - c[i]), A = u[0] * u[0] + u[1] * u[1] + u[2] * u[2], B = u[0] * v[0] + u[1] * v[1] + u[2] * v[2], C = v[0] * v[0] + v[1] * v[1] + v[2] * v[2], Dd = u[0] * w[0] + u[1] * w[1] + u[2] * w[2], Ee = v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
  const den = A * C - B * B; let sN = den > 1e-9 ? Math.min(1, Math.max(0, (B * Ee - C * Dd) / den)) : 0, tN = C > 1e-9 ? Math.min(1, Math.max(0, (B * sN + Ee) / C)) : 0; sN = A > 1e-9 ? Math.min(1, Math.max(0, (B * tN - Dd) / A)) : 0;
  return Math.hypot(...[0, 1, 2].map(i => w[i] + sN * u[i] - tN * v[i])); }
function maosAtravessam(Q) { const out = { L: 0, R: 0 }; let lista = []; try { lista = autoColisoes(Q, 0.3) || []; } catch (e) { return out; }
  for (const c of lista) { const ps = [c.a, c.b], d = c.prof || 0; for (const [L, me] of [["L", "E"], ["R", "D"]]) if (ps.some(p => /^(antebraco|mao)/.test(p) && p.endsWith(me))) out[L] = Math.max(out[L], d); }
  return out; }
function aplicarMaosDaPose(Q, nome) { const d = POSE_MAOS[nome]; if (!d) return []; const lados = [], des = {};
  for (const [L, marco] of Object.entries(d)) { maoNoMarco(Q, L === "L" ? 1 : -1, marco); lados.push(L); des[L] = [0, 0, 0]; }
  for (let it = 0; it < 12; it++) { const at = maosAtravessam(Q), L = lados.length > 1 ? (at.L >= at.R ? "L" : "R") : lados[0]; if (!L || at[L] < 0.6) break;
    const fr = MARCOS[d[L]].p(1)[2] < 0 ? -1 : 1; des[L][2] += 0.2 * fr; des[L][1] += fr > 0 ? 0.14 : 0; maoNoMarco(Q, L === "L" ? 1 : -1, d[L], { desl: des[L] }); }
  return lados; }
export { MARCOS, POSE_MAOS, marcoNoMundo, maoNoMarco, aplicarMaosDaPose, maosAtravessam };
