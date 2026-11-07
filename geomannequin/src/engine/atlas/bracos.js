/* GeoMannequin — atlas muscular do braço e do antebraço.
   Pontos em (t, θ): t = fração do comprimento (braço: L1, antebraço: L2), θ = ângulo em volta do osso
   (0 = frente/bíceps, π = trás/tríceps, s·π/2 = lado de fora). "off" afasta a linha da pele (para ficar sobre o deltoide). */
import { deltV, deltR, armRadius } from "../bracos.js";

const arr = (fn, a0, a1, n) => { const o = []; for (let i = 0; i <= n; i++) o.push(fn(a0 + (a1 - a0) * i / n)); return o; };

export function atlasBraco(A, s) {
  const L = [], k = A.k, L1 = A.L1;
  const linha = (nome, tipo, parte, pts, min = 0, off) => L.push({ nome, tipo, parte, pts, min, off });
  /* ponto sobre o deltoide (a linha precisa ficar na superfície dele, que é mais alta que o braço) */
  const sobreDelt = (t, th) => { const v = t * L1, r = deltR(v, th, A, s), ra = armRadius(v, th, A, s); return [t, th, Math.max(0.012, r - ra + 0.012)]; };
  const lat = s * Math.PI / 2;
  /* deltoide: borda da gota (sobreposição sobre bíceps e tríceps) e as divisões entre os 3 feixes */
  const borda = arr(ph => { const t = deltV(ph) / 2.9 * 0.97; return sobreDelt(t, lat + ph); }, -1.85, 1.85, 44);
  L.push({ nome: "deltoide_borda", tipo: "dobra", parte: "braco", pts3: borda });
  /* divisões dos feixes: nascem separadas no alto (clavícula / acrômio / espinha) e convergem para a inserção */
  const tIns = deltV(0) / 2.9 * 0.9;
  [-0.95, 0.95].forEach((ph, i) => L.push({ nome: i ? "deltoide_feixe_posterior" : "deltoide_feixe_anterior", tipo: "divisao", min: 0.12, parte: "braco",
    pts3: arr(q => sobreDelt(0.04 + (tIns - 0.04) * q, lat + ph * (1 - q) * (1 - 0.15 * q)), 0, 0.92, 12) }));
  /* fibras do deltoide (camada opcional) */
  for (let i = -3; i <= 3; i++) { const ph = i * 0.42; L.push({ nome: "fibra_deltoide", tipo: "fibra", parte: "braco", min: 0.3, pts3: arr(t => sobreDelt(t, lat + ph * (1 - 0.35 * t / (deltV(ph) / 2.9))), 0.03, deltV(ph) / 2.9 * 0.85, 8) }); }
  /* bíceps (dois lados), braquial (lado de fora, entre bíceps e tríceps), tríceps (ferradura e divisão das cabeças) */
  [-0.62, 0.62].forEach(a => linha("biceps_borda", "divisao", "braco", arr(t => [t, a * (1 + 0.15 * Math.sin(Math.PI * t))], 0.42, 0.88, 16), 0.1));
  linha("braquial", "divisao", "braco", arr(t => [t, s * (Math.PI / 2 + 0.2 - 0.35 * (t - 0.5))], 0.5, 0.9, 12), 0.14);
  linha("triceps_ferradura", "dobra", "braco", arr(q => [0.72 - 0.34 * Math.pow(Math.abs(2 * q - 1), 1.6), Math.PI + (q - 0.5) * 1.2], 0, 1, 22), 0.08);
  linha("triceps_cabecas", "divisao", "braco", arr(t => [t, Math.PI - s * 0.38], 0.36, 0.66, 10), 0.2);
  /* antebraço: braquiorradial (sai acima do cotovelo, por fora), flexores e extensores; linha do punho */
  linha("braquiorradial", "divisao", "ante", arr(t => [t, s * (0.75 + 0.25 * t)], 0.04, 0.7, 16), 0.06);
  linha("flexores", "divisao", "ante", arr(t => [t, -s * 0.55], 0.12, 0.55, 12), 0.12);
  linha("extensores", "divisao", "ante", arr(t => [t, s * (1.95 - 0.2 * t)], 0.1, 0.62, 12), 0.16);
  linha("punho", "fibra", "ante", arr(th => [0.95, th], 0, 2 * Math.PI, 28));
  return L;
}
