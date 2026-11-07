/* GeoMannequin — amplitude articular por perfil de flexibilidade.
   0 = normal (valores clínicos de uma pessoa comum), 1 = atleta, 2 = ginasta/bailarina, 3 = contorcionista.
   Cada perfil soma uma folga (graus) ao mínimo e ao máximo de cada articulação. */
const FLEX_NOMES = ["normal", "atleta", "ginasta", "contorcionista"];
const AMPLIA = {
  spineFlex: [[-10, 5], [-35, 15], [-60, 30]], lumFlex: [[-10, 0], [-25, 5], [-40, 10]], thoFlex: [[-5, 0], [-15, 5], [-25, 10]],
  spineSide: [[-5, 5], [-15, 15], [-25, 25]], lumSide: [[-3, 3], [-8, 8], [-12, 12]], thoSide: [[-3, 3], [-8, 8], [-12, 12]],
  spineTwist: [[-5, 5], [-10, 10], [-20, 20]], thoTwist: [[-5, 5], [-10, 10], [-15, 15]],
  pelvisTilt: [[-5, 5], [-15, 15], [-25, 25]],
  hipFlex: [[-5, 5], [-30, 35], [-50, 50]], hipAbd: [[0, 15], [0, 45], [0, 60]], hipRot: [[-5, 5], [-10, 10], [-20, 20]],
  kneeFlex: [[0, 0], [-3, 5], [-8, 8]], ankleFlex: [[-5, 10], [-10, 25], [-15, 35]], toes: [[-5, 5], [-10, 10], [-15, 15]],
  armFlex: [[-10, 0], [-20, 20], [-30, 40]], armAbd: [[0, 0], [-10, 10], [-15, 20]], armRot: [[-5, 5], [-10, 10], [-20, 20]],
  elbow: [[0, 0], [-5, 0], [-10, 5]], wrist: [[-10, 10], [-20, 15], [-30, 20]],
  neckFlex: [[-5, 5], [-20, 10], [-30, 15]], neckSide: [[-5, 5], [-10, 10], [-15, 15]], neckTwist: [[-5, 5], [-10, 10], [-15, 15]],
  headPitch: [[-5, 0], [-15, 5], [-20, 10]]
};
const nivelFlex = p => Math.max(0, Math.min(3, Math.round((p && p.flex) || 0)));
/* faixa [mín, máx] de um parâmetro (com ou sem L/R no fim) para o perfil */
function ampliar(k, mn, mx, flex) {
  const n = Math.max(0, Math.min(3, Math.round(flex || 0))); if (!n) return [mn, mx];
  const a = AMPLIA[k] || AMPLIA[k.replace(/[LR]$/, "")]; if (!a) return [mn, mx];
  return [mn + a[n - 1][0], mx + a[n - 1][1]];
}
/* isquiotibiais: quanto a coxa sobe com o joelho esticado */
const ISQUIO = [90, 110, 160, 175];
export { FLEX_NOMES, AMPLIA, ampliar, nivelFlex, ISQUIO };
