/* GeoMannequin — traços em curvas de Bézier: cada caminho feito de segmentos retos (M/L) é simplificado
   (Ramer–Douglas–Peucker, erro ≤ 0,3 px) e redesenhado com cúbicas que passam pelos pontos (Catmull-Rom → Bézier).
   O traço fica liso em qualquer zoom e o SVG fica menor. */
const EPS = 0.3;
function rdp(P, a, b, eps, keep) {
  let mx = 0, idx = -1;
  const ax = P[a][0], ay = P[a][1], dx = P[b][0] - ax, dy = P[b][1] - ay, l = Math.hypot(dx, dy);
  /* extremos no mesmo lugar (contorno fechado de 0 a 2π): a "reta" vira um ponto e a distância é até ele —
     antes dava zero para todos e a elipse inteira sumia */
  for (let i = a + 1; i < b; i++) { const d = l < 1e-6 ? Math.hypot(P[i][0] - ax, P[i][1] - ay) : Math.abs((P[i][0] - ax) * dy - (P[i][1] - ay) * dx) / l; if (d > mx) { mx = d; idx = i; } }
  if (mx > eps) { keep[idx] = 1; rdp(P, a, idx, eps, keep); rdp(P, idx, b, eps, keep); }
}
const n1 = v => (Math.round(v * 10) / 10).toString();
function curvaDe(P, fechado) {
  const n = P.length;
  if (n < 3) return "M" + P.map(p => n1(p[0]) + " " + n1(p[1])).join("L") + (fechado ? "Z" : "");
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1; rdp(P, 0, n - 1, EPS, keep);
  let Q = P.filter((_, i) => keep[i]);
  if (fechado && Q.length > 2 && Math.hypot(Q[0][0] - Q[Q.length - 1][0], Q[0][1] - Q[Q.length - 1][1]) < 0.05) Q = Q.slice(0, -1);
  const m = Q.length;
  if (m < 3) return "M" + Q.map(p => n1(p[0]) + " " + n1(p[1])).join("L") + (fechado ? "Z" : "");
  /* cantos (mudança de direção > 70°) ficam retos: não arredonda a ponta de um dedo, por exemplo */
  const get = i => fechado ? Q[(i + m) % m] : Q[Math.max(0, Math.min(m - 1, i))];
  const canto = i => { if (!fechado && (i === 0 || i === m - 1)) return false; const a = get(i - 1), b = get(i), c = get(i + 1);
    const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - b[0], c[1] - b[1]], d = (u[0] * v[0] + u[1] * v[1]) / ((Math.hypot(...u) * Math.hypot(...v)) || 1); return d < 0.34; };
  let d = "M" + n1(Q[0][0]) + " " + n1(Q[0][1]);
  const last = fechado ? m : m - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const k1 = canto(i) ? 0 : 1 / 6, k2 = canto(i + 1) ? 0 : 1 / 6;
    const c1 = [p1[0] + (p2[0] - p0[0]) * k1, p1[1] + (p2[1] - p0[1]) * k1], c2 = [p2[0] - (p3[0] - p1[0]) * k2, p2[1] - (p3[1] - p1[1]) * k2];
    d += "C" + n1(c1[0]) + " " + n1(c1[1]) + " " + n1(c2[0]) + " " + n1(c2[1]) + " " + n1(p2[0]) + " " + n1(p2[1]);
  }
  return d + (fechado ? "Z" : "");
}
/* um atributo d só com M, L e Z */
function suavizarD(d) {
  const subs = d.split(/(?=M)/), out = [];
  for (const sp of subs) {
    if (!sp) continue;
    const fechado = /Z\s*$/.test(sp), nums = sp.replace(/[MLZ]/g, " ").trim().split(/[\s,]+/).map(Number);
    if (nums.length < 4 || nums.some(isNaN)) { out.push(sp); continue; }
    const P = []; for (let i = 0; i + 1 < nums.length; i += 2) P.push([nums[i], nums[i + 1]]);
    out.push(curvaDe(P, fechado));
  }
  return out.join("");
}
function suavizarSvg(svg) {
  return svg.replace(/ d="([MLZ0-9 .,\-]+)"/g, (m, d) => ' d="' + suavizarD(d) + '"');
}
export { suavizarSvg, suavizarD };
