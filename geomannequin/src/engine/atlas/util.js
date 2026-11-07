/* GeoMannequin — atlas muscular: utilidades de forma (curvas suaves e distância a polígonos) */
import { clamp, sstep } from "../matematica.js";

/* Catmull-Rom por pontos de controle 2D; n pontos por trecho */
export function suave(P, n = 6, fechado = false) {
  const Q = fechado ? P.concat([P[0]]) : P, m = Q.length, o = [];
  const at = i => fechado ? Q[(i + m - 1) % (m - 1)] : Q[clamp(i, 0, m - 1)];
  for (let i = 0; i < m - 1; i++) {
    const a = fechado ? Q[(i - 1 + m - 1) % (m - 1)] : at(i - 1), b = Q[i], c = Q[i + 1], d = fechado ? Q[(i + 2) % (m - 1)] : at(i + 2);
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      o.push([0, 1].map(k => 0.5 * (2 * b[k] + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3)));
    }
  }
  o.push(Q[m - 1]);
  return o;
}
/* distância com sinal a um polígono: positiva dentro */
export function dentro(px, py, P) {
  let d = 1e9, inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[j], b = P[i], ex = b[0] - a[0], ey = b[1] - a[1], wx = px - a[0], wy = py - a[1];
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1), dx = wx - ex * t, dy = wy - ey * t;
    d = Math.min(d, dx * dx + dy * dy);
    if (((a[1] > py) !== (b[1] > py)) && (px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0])) inside = !inside;
  }
  d = Math.sqrt(d); return inside ? d : -d;
}
/* volume de um músculo a partir da distância à borda: sobe suave na borda (e) e faz cúpula no meio (meio) */
export function volume(d, e, meio = 3.2) { return d <= 0 ? 0 : sstep(d / e) * (0.7 + 0.3 * sstep(d / (meio * e))); }
/* caixa delimitadora para descartar rápido */
export function caixa(P, m = 0.3) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y] of P) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0 - m, x1 + m, y0 - m, y1 + m];
}
