/* GeoMannequin — unidades de ação do rosto (inspiradas no FACS), com lado próprio.
   Todas valem 0 por padrão e SOMAM por cima dos controles gerais (smile, eyeLid, browUp, browIn):
   cenas e expressões antigas continuam iguais.
   Lado: L = esquerdo do manequim (s = +1 no desenho, x > 0), R = direito (s = −1, x < 0). */
import { clamp } from "./matematica.js";

/* [chave, rótulo, mínimo, máximo, nome em português para código] */
const AU = [
  ["browInnerL", "Sobrancelha esquerda, ponta de dentro: baixar − / subir +", -1, 1, "sobrancelhaDentroEsq"],
  ["browInnerR", "Sobrancelha direita, ponta de dentro: baixar − / subir +", -1, 1, "sobrancelhaDentroDir"],
  ["browOuterL", "Sobrancelha esquerda, ponta de fora: baixar − / subir +", -1, 1, "sobrancelhaForaEsq"],
  ["browOuterR", "Sobrancelha direita, ponta de fora: baixar − / subir +", -1, 1, "sobrancelhaForaDir"],
  ["lidUpL", "Pálpebra de cima esquerda: fechar (piscar só este olho)", 0, 1, "palpebraEsq"],
  ["lidUpR", "Pálpebra de cima direita: fechar (piscar só este olho)", 0, 1, "palpebraDir"],
  ["lidLoL", "Pálpebra de baixo esquerda: subir (apertar o olho)", 0, 1, "palpebraBaixoEsq"],
  ["lidLoR", "Pálpebra de baixo direita: subir (apertar o olho)", 0, 1, "palpebraBaixoDir"],
  ["cheekL", "Bochecha esquerda: subir", 0, 1, "bochechaEsq"],
  ["cheekR", "Bochecha direita: subir", 0, 1, "bochechaDir"],
  ["noseWrinkle", "Nariz: franzir", 0, 1, "narizFranzir"],
  ["upperLipL", "Lábio de cima, lado esquerdo: subir (nojo)", 0, 1, "labioCimaEsq"],
  ["upperLipR", "Lábio de cima, lado direito: subir (nojo)", 0, 1, "labioCimaDir"],
  ["mouthCornerL", "Canto esquerdo da boca: baixar − / subir +", -1, 1, "cantoBocaEsq"],
  ["mouthCornerR", "Canto direito da boca: baixar − / subir +", -1, 1, "cantoBocaDir"],
  ["lipPress", "Lábios: apertar", 0, 1, "labiosApertar"],
  ["pout", "Lábios: beicinho", 0, 1, "beicinho"],
  ["teethClench", "Dentes cerrados (lábios abertos, dentes juntos)", 0, 1, "dentesCerrados"],
  /* boca: forma geral */
  ["mouthWide", "Boca: estreitar − / alargar (esticar) +", -1, 1, "bocaLargura"],
  ["mouthRound", "Boca em “O” (redonda; abre um pouco sozinha)", 0, 1, "bocaRedonda"],
  ["lowerLipDown", "Lábio de baixo: descer (mostra os dentes de baixo)", 0, 1, "labioBaixoDescer"],
  ["mouthShift", "Boca: puxar para a direita − / esquerda + (do manequim)", -1, 1, "bocaLado"],
  /* bochechas e nariz */
  ["cheekPuff", "Bochechas: chupar − / inflar +", -1, 1, "bochechasInflar"],
  ["nostrilFlare", "Narinas: dilatar (raiva, esforço, cheirar)", 0, 1, "narinas"],
  /* linhas de expressão (rugas): somam com as que a expressão já desenha sozinha */
  ["wrinkleForehead", "Rugas: testa (linhas horizontais)", 0, 1, "rugasTesta"],
  ["wrinkleFrown", "Rugas: entre as sobrancelhas (franzido)", 0, 1, "rugasFranzido"],
  ["wrinkleCrow", "Rugas: pés de galinha (canto de fora dos olhos)", 0, 1, "rugasOlhos"],
  ["wrinkleNasolabial", "Rugas: sulco nariz-boca (bigode chinês)", 0, 1, "rugasBoca"],
  ["wrinkleCheek", "Linhas na bochecha (careta, esforço, bochecha subindo)", 0, 1, "rugasBochecha"],
  ["wrinkleChin", "Rugas: queixo enrugado (choro contido, esforço)", 0, 1, "rugasQueixo"],
  ["wrinkleNoseBridge", "Rugas: raiz do nariz (linhas de esforço entre os olhos)", 0, 1, "rugasNariz"],
  /* olhos: íris, pupila, brilho, arregalar */
  ["eyeWide", "Olhos: arregalar (branco aparece em volta da íris)", 0, 1, "olhosArregalar"],
  ["irisSize", "Íris: pequena − / grande +", -1, 1, "irisTamanho"],
  ["pupilSize", "Pupila: minúscula (choque, medo) − / enorme (encanto, escuro) +", -1, 1, "pupilaTamanho"],
  ["eyeShine", "Brilho do olho: sem brilho (olhar vazio, tristeza) − / brilho extra (emoção) +", -1, 1, "olhosBrilho"],
  ["pupilSlit", "Pupila em fenda (felina, ameaça)", 0, 1, "pupilaFenda"],
  ["eyeBlank", "Olhos brancos (choque cômico de mangá: sem íris)", 0, 1, "olhosBrancos"],
  /* sobrancelhas e cílios estilizados */
  ["browThick", "Sobrancelhas: finas − / grossas +", -1, 1, "sobrancelhaGrossura"],
  ["browArch", "Sobrancelhas: retas − / bem arqueadas +", -1, 1, "sobrancelhaArco"],
  ["browSharp", "Sobrancelhas: quebra angular (expressão dura, determinação)", 0, 1, "sobrancelhaQuebra"],
  ["browWave", "Sobrancelhas tremidas (nervoso, aflição cômica)", 0, 1, "sobrancelhaTremida"],
  ["lashLen", "Cílios: pontas compridas (de cima)", 0, 1, "ciliosComprimento"],
  ["lashThick", "Linha dos cílios: fina − / grossa +", -1, 1, "ciliosGrossura"],
  ["lashLower", "Cílios de baixo", 0, 1, "ciliosBaixo"],
  /* boca: mais formas */
  ["teethShow", "Mostrar os dentes (sorriso maníaco, careta, rosnado)", 0, 1, "dentesMostrar"],
  ["lipBite", "Morder o lábio de baixo", 0, 1, "morderLabio"],
  ["mouthWobble", "Boca tremida (nervoso, choro, susto)", 0, 1, "bocaTremida"],
  ["fang", "Presa (canino pontudo de mangá)", 0, 1, "presa"],
  ["tongueOut", "Língua de fora (provocação)", 0, 1, "linguaFora"],
  /* sinais de mangá */
  ["angerVein", "Veia de raiva (marca de mangá na testa)", 0, 1, "veiaRaiva"],
  ["sweatDrop", "Gota de suor (constrangimento, nervoso)", 0, 1, "gotaSuor"]
];
const AU_KEYS = AU.map(a => a[0]);
/* estados do rosto que não são músculos (também resetados por cada expressão) */
const ESTADO_ROSTO = [["eyeBags", "Olheiras e bolsa sob os olhos (cansaço)", 0, 1, "olheiras"]];
const ESTADO_KEYS = ESTADO_ROSTO.map(a => a[0]);
const AU_ZERO = Object.freeze(Object.fromEntries([...AU_KEYS, ...ESTADO_KEYS].map(k => [k, 0])));
const AU_ALIAS = Object.fromEntries([...AU, ...ESTADO_ROSTO].map(a => [a[4], a[0]]));
const n = v => (Number.isFinite(v) ? v : 0);

/* valores efetivos de um lado do rosto */
function ladoRosto(p, s) {
  const L = s > 0 ? "L" : "R", g = k => n(p[k + L]);
  return {
    lid: clamp(n(p.eyeLid) + g("lidUp"), 0, 1),
    lidLo: clamp(g("lidLo"), 0, 1),
    cheek: clamp(g("cheek"), 0, 1),
    smile: clamp(n(p.smile) + g("mouthCorner"), -1, 1),
    browInner: clamp(g("browInner"), -1, 1),
    browOuter: clamp(g("browOuter"), -1, 1),
    upperLip: clamp(g("upperLip"), 0, 1)
  };
}
/* unidades sem lado */
function rostoGeral(p) {
  return { bags: clamp(n(p.eyeBags), 0, 1), nose: clamp(n(p.noseWrinkle), 0, 1), press: clamp(n(p.lipPress), 0, 1), pout: clamp(n(p.pout), 0, 1), clench: clamp(n(p.teethClench), 0, 1),
    wide: clamp(n(p.mouthWide), -1, 1), round: clamp(n(p.mouthRound), 0, 1), lowerLip: clamp(n(p.lowerLipDown), 0, 1), shift: clamp(n(p.mouthShift), -1, 1),
    puff: clamp(n(p.cheekPuff), -1, 1), flare: clamp(n(p.nostrilFlare), 0, 1),
    rugas: { testa: clamp(n(p.wrinkleForehead), 0, 1), franzido: clamp(n(p.wrinkleFrown), 0, 1), olhos: clamp(n(p.wrinkleCrow), 0, 1), boca: clamp(n(p.wrinkleNasolabial), 0, 1), bochecha: clamp(n(p.wrinkleCheek), 0, 1),
      queixo: clamp(n(p.wrinkleChin), 0, 1), nariz: clamp(n(p.wrinkleNoseBridge), 0, 1) },
    olho: { arregalar: clamp(n(p.eyeWide), 0, 1), iris: clamp(n(p.irisSize), -1, 1), pupila: clamp(n(p.pupilSize), -1, 1), brilho: clamp(n(p.eyeShine), -1, 1), fenda: clamp(n(p.pupilSlit), 0, 1), branco: clamp(n(p.eyeBlank), 0, 1) },
    sobrancelha: { grossa: clamp(n(p.browThick), -1, 1), arco: clamp(n(p.browArch), -1, 1), quebra: clamp(n(p.browSharp), 0, 1), onda: clamp(n(p.browWave), 0, 1) },
    cilios: { comp: clamp(n(p.lashLen), 0, 1), grossa: clamp(n(p.lashThick), -1, 1), baixo: clamp(n(p.lashLower), 0, 1) },
    dentes: clamp(n(p.teethShow), 0, 1), morder: clamp(n(p.lipBite), 0, 1), tremer: clamp(n(p.mouthWobble), 0, 1), presa: clamp(n(p.fang), 0, 1), lingua: clamp(n(p.tongueOut), 0, 1),
    veia: clamp(n(p.angerVein), 0, 1), suor: clamp(n(p.sweatDrop), 0, 1) };
}
/* valor ao longo da boca: mistura contínua do lado direito (x = −w) para o esquerdo (x = +w) */
function aoLongo(vL, vR, x, w) { const t = clamp(x / Math.max(1e-6, w), -1, 1); return (vL + vR) / 2 + (vL - vR) / 2 * t; }

export { AU, AU_KEYS, ESTADO_ROSTO, ESTADO_KEYS, AU_ZERO, AU_ALIAS, ladoRosto, rostoGeral, aoLongo };
