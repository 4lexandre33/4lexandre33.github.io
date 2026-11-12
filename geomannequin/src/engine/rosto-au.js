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
  ["teethClench", "Dentes cerrados (lábios abertos, dentes juntos)", 0, 1, "dentesCerrados"]
];
const AU_KEYS = AU.map(a => a[0]);
const AU_ZERO = Object.freeze(Object.fromEntries(AU_KEYS.map(k => [k, 0])));
const AU_ALIAS = Object.fromEntries(AU.map(a => [a[4], a[0]]));
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
  return { nose: clamp(n(p.noseWrinkle), 0, 1), press: clamp(n(p.lipPress), 0, 1), pout: clamp(n(p.pout), 0, 1), clench: clamp(n(p.teethClench), 0, 1) };
}
/* valor ao longo da boca: mistura contínua do lado direito (x = −w) para o esquerdo (x = +w) */
function aoLongo(vL, vR, x, w) { const t = clamp(x / Math.max(1e-6, w), -1, 1); return (vL + vR) / 2 + (vL - vR) / 2 * t; }

export { AU, AU_KEYS, AU_ZERO, AU_ALIAS, ladoRosto, rostoGeral, aoLongo };
