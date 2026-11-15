/* GeoMannequin — quadrinização: PÁGINA (mangá B5, comic, A4, quadrado; margem, calha, sangria, página dupla, splash), QUADROS
   com borda normal/diagonal/sem borda, BALÕES (fala, pensamento, grito, sussurro, rádio, narração) com o rabicho apontando para a boca
   de quem fala e sem cobrir rostos, na ordem de leitura, e a TIRA VERTICAL de WEBTOON (o espaço entre quadros é tempo de leitura).
   Entrada: r (compilarName) e fotos (renderizarQuadro de cada quadro: svg + cabecas na tela). Saída: SVGs prontos (rasterizam igual
   no navegador e no MCP). */

const HQ_FORMATOS = { manga: { razao: 257 / 182, margem: 0.05, calha: 0.018 }, comic: { razao: 10.188 / 6.625, margem: 0.055, calha: 0.02 }, a4: { razao: 297 / 210, margem: 0.05, calha: 0.018 }, quadrado: { razao: 1, margem: 0.05, calha: 0.02 }, livre: { razao: 1.414, margem: 0.04, calha: 0.016 } };
const hqEsc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function hqB64(t) { if (typeof Buffer !== "undefined") return Buffer.from(t, "utf8").toString("base64"); return btoa(unescape(encodeURIComponent(t))); }
function hqQuebrar(t, n) { const out = []; let l = ""; String(t).split(/\s+/).forEach(w => { if ((l + " " + w).trim().length > n && l) { out.push(l); l = w; } else l = (l + " " + w).trim(); }); if (l) out.push(l); return out; }
/* onde a imagem do quadro cai dentro da célula (preserveAspectRatio slice): para levar as cabeças (0..1 da imagem) para a página */
function hqEncaixe(svg, cel, cabecas, caber) { const m = /viewBox="([^"]+)"/.exec(svg), vb = m ? m[1].split(/\s+/).map(Number) : [0, 0, cel.w, cel.h], iw = vb[2], ih = vb[3], k = caber ? Math.min(cel.w / iw, cel.h / ih) : Math.max(cel.w / iw, cel.h / ih), w = iw * k, h = ih * k, alto = ih / iw > cel.h / cel.w;
  /* a imagem é maior que a célula num sentido: o recorte segue os rostos (cabeça inteira, um pouco acima do meio), senão centra */
  const cs = Object.values(cabecas || {}).filter(c => c.u > -0.1 && c.u < 1.1 && c.v > -0.2 && c.v < 1.2); let x = cel.x + (cel.w - w) / 2, y = alto ? cel.y + (cel.h - h) * 0.3 : cel.y + (cel.h - h) / 2;
  if (cs.length) { const v0 = Math.min(...cs.map(c => c.v - c.r)), v1 = Math.max(...cs.map(c => c.v + c.r)), u0 = Math.min(...cs.map(c => c.u - c.r)), u1 = Math.max(...cs.map(c => c.u + c.r));
    if (alto) { const meio = (v0 + v1) / 2 * h, alvoY = cel.h * (v1 - v0) * h > cel.h * 0.8 ? cel.h * 0.5 : cel.h * 0.42; y = cel.y + Math.min(0, Math.max(cel.h - h, alvoY - meio)); if (v0 * h + (y - cel.y) < 0) y = cel.y - Math.max(0, v0 * h - 4); y = Math.min(cel.y, Math.max(cel.y + cel.h - h, y)); }
    else { const meio = (u0 + u1) / 2 * w; x = cel.x + Math.min(0, Math.max(cel.w - w, cel.w / 2 - meio)); } }
  return { x, y, w, h, alto }; }
/* polígono da célula: retângulo, diagonal (um lado inclinado, alternando), triângulo (para cima/baixo/lado ou de canto),
   losango, trapézio, círculo, explosão (estrela) ou polígono livre (pontos 0..1 dentro da célula) */
function hqPoligono(c, q, i) { const { x, y, w, h } = c, b = q && q.borda;
  if (b === "diagonal") { const d = Math.min(c.w * 0.25, Math.tan(((q.bordaGraus || 12) * Math.PI) / 180) * c.h), dir = i % 2 ? 1 : -1;
    return dir > 0 ? [[c.x, c.y], [c.x + c.w, c.y], [c.x + c.w - d, c.y + c.h], [c.x, c.y + c.h]] : [[c.x, c.y], [c.x + c.w - d, c.y], [c.x + c.w, c.y + c.h], [c.x, c.y + c.h]]; }
  if (b === "triangulo") { const d = (q.bordaDir || "cima").replace("cima-esquerda", "sup-esq").replace("cima-direita", "sup-dir").replace("baixo-esquerda", "inf-esq").replace("baixo-direita", "inf-dir");
    return ({ cima: [[x + w / 2, y], [x + w, y + h], [x, y + h]], baixo: [[x, y], [x + w, y], [x + w / 2, y + h]], esquerda: [[x, y + h / 2], [x + w, y], [x + w, y + h]], direita: [[x, y], [x + w, y + h / 2], [x, y + h]],
      "sup-esq": [[x, y], [x + w, y], [x, y + h]], "sup-dir": [[x, y], [x + w, y], [x + w, y + h]], "inf-esq": [[x, y], [x + w, y + h], [x, y + h]], "inf-dir": [[x + w, y], [x + w, y + h], [x, y + h]] })[d] || [[x + w / 2, y], [x + w, y + h], [x, y + h]]; }
  if (b === "losango") return [[x + w / 2, y], [x + w, y + h / 2], [x + w / 2, y + h], [x, y + h / 2]];
  if (b === "trapezio") return q.bordaDir === "baixo" ? [[x, y], [x + w, y], [x + w * 0.85, y + h], [x + w * 0.15, y + h]] : [[x + w * 0.15, y], [x + w * 0.85, y], [x + w, y + h], [x, y + h]];
  if (b === "poligono" && q.bordaPts) return q.bordaPts.map(([u, v]) => [x + u * w, y + v * h]);
  if (b === "circulo") return Array.from({ length: 48 }, (_, k) => { const a = k / 48 * Math.PI * 2; return [x + w / 2 + Math.cos(a) * w / 2, y + h / 2 + Math.sin(a) * h / 2]; });
  if (b === "explosao") { const n = 14; return Array.from({ length: n * 2 }, (_, k) => { const a = k / (n * 2) * Math.PI * 2 - Math.PI / 2, f = k % 2 ? 0.74 : 1 - ((k * 7) % 5) * 0.025; return [x + w / 2 + Math.cos(a) * w / 2 * f, y + h / 2 + Math.sin(a) * h / 2 * f]; }); }
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
/* vários quadros na MESMA célula ("junto"): divisórias inclinadas (ou a diagonal de canto a canto, se o primeiro for triângulo) */
function hqDividir(c, qs, cal, jp) { const n = qs.length, { x, y, w, h } = c, g = cal / 2; if (n === 1) return null;
  const espelha = P => jp ? P.map(([px, py]) => [2 * x + w - px, py]) : P;
  if (n === 2 && qs[0].borda === "triangulo") { const k = h / w, d = (qs[0].bordaDir || "").replace("cima-esquerda", "sup-esq").replace("cima-direita", "sup-dir").replace("baixo-esquerda", "inf-esq").replace("baixo-direita", "inf-dir");
    const SE = [[x, y], [x + w - g * 1.4, y], [x, y + h - g * 1.4 * k]], ID = [[x + w, y + g * 1.4 * k], [x + w, y + h], [x + g * 1.4, y + h]], SD = [[x + g * 1.4, y], [x + w, y], [x + w, y + h - g * 1.4 * k]], IE = [[x, y + g * 1.4 * k], [x + w - g * 1.4, y + h], [x, y + h]];
    if (d === "sup-esq") return [SE, ID]; if (d === "inf-dir") return [ID, SE]; if (d === "sup-dir") return [SD, IE]; if (d === "inf-esq") return [IE, SD];
    return jp ? [SD, IE] : [SE, ID]; }
  const largo = w >= h, out = [], inc = 0.1;
  for (let j = 0; j < n; j++) { const a = j / n, b2 = (j + 1) / n, s0 = j === 0 ? 0 : (j % 2 ? inc : -inc), s1 = j === n - 1 ? 0 : ((j + 1) % 2 ? inc : -inc);
    if (largo) { const t0 = j === 0 ? x : x + w * (a + s0) + g, b0 = j === 0 ? x : x + w * (a - s0) + g, t1 = j === n - 1 ? x + w : x + w * (b2 + s1) - g, b1 = j === n - 1 ? x + w : x + w * (b2 - s1) - g; out.push(espelha([[t0, y], [t1, y], [b1, y + h], [b0, y + h]])); }
    else { const l0 = j === 0 ? y : y + h * (a + s0) + g, r0 = j === 0 ? y : y + h * (a - s0) + g, l1 = j === n - 1 ? y + h : y + h * (b2 + s1) - g, r1 = j === n - 1 ? y + h : y + h * (b2 - s1) - g; out.push([[x, l0], [x + w, r0], [x + w, r1], [x, l1]]); } }
  return out; }
/* retângulo dentro do polígono (para os balões não saírem de um painel triangular, losango ou explosão) */
function hqDentroPoli(P, x, y) { let d = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) d = !d; } return d; }
function hqInscrito(P) { const b = hqCaixa(P); let cx = 0, cy = 0; P.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= P.length; cy /= P.length;
  /* tenta vários centros (centróide e a caminho de cada canto) e fica com o maior retângulo (no triângulo: perto do ângulo reto) */
  const centros = [[cx, cy]]; P.concat([[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]).forEach(v => [0.3, 0.5, 0.65].forEach(u => centros.push([cx + (v[0] - cx) * u, cy + (v[1] - cy) * u]))); let melhor = null;
  for (const [ax, ay] of centros) { if (!hqDentroPoli(P, ax, ay)) continue; for (let s0 = 1; s0 > 0.15; s0 -= 0.04) { const w = b.w * s0, h = b.h * s0, x = ax - w / 2, y = ay - h / 2; if ([[x, y], [x + w, y], [x, y + h], [x + w, y + h], [ax, y], [ax, y + h], [x, ay], [x + w, ay]].every(q => hqDentroPoli(P, q[0], q[1]))) { if (!melhor || w * h > melhor.w * melhor.h) melhor = { x, y, w, h }; break; } } }
  return melhor || { x: cx - b.w * 0.1, y: cy - b.h * 0.1, w: b.w * 0.2, h: b.h * 0.2 }; }
const hqCaixa = P => { const xs = P.map(p => p[0]), ys = P.map(p => p[1]), x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; };
const hqPts = P => P.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");

/* ===== balões ===== */
function hqForma(tipo, x, y, w, h, sem) {
  const cx = x + w / 2, cy = y + h / 2, st = 'fill="#fff" stroke="#111" stroke-width="2.6"';
  if (tipo === "pensa") { let s = ""; const n = 11; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, r = 0.22 * Math.min(w, h) + ((sem + i) % 3) * 3; s += '<circle cx="' + (cx + Math.cos(a) * (w / 2 - r * 0.55)).toFixed(1) + '" cy="' + (cy + Math.sin(a) * (h / 2 - r * 0.55)).toFixed(1) + '" r="' + r.toFixed(1) + '" ' + st + "/>"; }
    return s + '<ellipse cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" rx="' + (w / 2 - 6).toFixed(1) + '" ry="' + (h / 2 - 6).toFixed(1) + '" fill="#fff"/>'; }
  if (tipo === "grita") { const n = 18, P = []; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, f = i % 2 ? 0.78 : 1.12 + ((sem + i) % 3) * 0.04; P.push([cx + Math.cos(a) * w / 2 * f, cy + Math.sin(a) * h / 2 * f]); } return '<polygon points="' + hqPts(P) + '" ' + st + ' stroke-linejoin="miter"/>'; }
  if (tipo === "narra") return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="#fffbe6" stroke="#111" stroke-width="2.2"/>';
  if (tipo === "radio") { const P = []; const n = 14; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; P.push([cx + Math.cos(a) * w / 2 * (i % 2 ? 0.94 : 1.04), cy + Math.sin(a) * h / 2 * (i % 2 ? 0.94 : 1.04)]); } return '<polygon points="' + hqPts(P) + '" ' + st + "/>"; }
  return '<ellipse cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" rx="' + (w / 2).toFixed(1) + '" ry="' + (h / 2).toFixed(1) + '" ' + st + (tipo === "sussurra" ? ' stroke-dasharray="7 5"' : "") + "/>";
}
function hqRabicho(tipo, b, alvo, raio = 20) { /* da borda do balão até perto da boca (para no meio do caminho para não cobrir o rosto) */
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = alvo[0] - cx, dy = alvo[1] - cy, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const ex = cx + ux * b.w / 2 * 0.9, ey = cy + uy * b.h / 2 * 0.9, pare = Math.min(L * 0.45, Math.max(14, raio * (tipo === "pensa" ? 1.4 : 0.75))), fim = [alvo[0] - ux * pare, alvo[1] - uy * pare], px = -uy, py = ux, lb = Math.min(b.w, b.h) * 0.16;
  if (tipo === "pensa") { let s = ""; for (let i = 1; i <= 3; i++) { const u = i / 4, r = 7 - i * 1.6; s += '<circle cx="' + (ex + (fim[0] - ex) * u).toFixed(1) + '" cy="' + (ey + (fim[1] - ey) * u).toFixed(1) + '" r="' + r.toFixed(1) + '" fill="#fff" stroke="#111" stroke-width="2"/>'; } return s; }
  if (tipo === "radio") { const P = [[ex + px * lb, ey + py * lb]]; for (let i = 1; i <= 4; i++) { const u = i / 5, s0 = i % 2 ? 1 : -1; P.push([ex + (fim[0] - ex) * u + px * lb * 0.6 * s0, ey + (fim[1] - ey) * u + py * lb * 0.6 * s0]); } P.push(fim, [ex - px * lb, ey - py * lb]); return '<polygon points="' + hqPts(P) + '" fill="#fff" stroke="#111" stroke-width="2.4"/>'; }
  return '<polygon points="' + hqPts([[ex + px * lb, ey + py * lb], fim, [ex - px * lb, ey - py * lb]]) + '" fill="#fff" stroke="#111" stroke-width="2.4"' + (tipo === "sussurra" ? ' stroke-dasharray="6 4"' : "") + "/>";
}
/* coloca os balões de um quadro na célula: na ordem de leitura, no alto, longe dos rostos, perto de quem fala */
function hqBaloes(falas, cabecas, cel, enc, o = {}) {
  const jp = o.leitura !== "ocidental", fs = o.fonte || Math.max(12, Math.min(22, cel.w / 26)), lh = fs * 1.22, pad = fs * 0.9, ocupados = [], out = [];
  const rostos = Object.entries(cabecas || {}).map(([n, c]) => ({ n, x: enc.x + c.u * enc.w, y: enc.y + c.v * enc.h, bx: enc.x + c.bu * enc.w, by: enc.y + c.bv * enc.h, r: Math.max(18, c.r * enc.h) }));
  const dentro = b => b.x >= cel.x + 6 && b.y >= cel.y + 6 && b.x + b.w <= cel.x + cel.w - 6 && b.y + b.h <= cel.y + cel.h - 6;
  const sobre = (a, b) => !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
  const custoRosto = b => rostos.reduce((s, r) => { const dx = Math.max(b.x - r.x, 0, r.x - (b.x + b.w)), dy = Math.max(b.y - r.y, 0, r.y - (b.y + b.h)), d = Math.hypot(dx, dy); return s + (d < r.r * 1.15 ? (r.r * 1.15 - d) * 40 : 0); }, 0);
  (falas || []).forEach((f, i) => {
    const tipo = f.quem ? (f.tipo || "fala") : "narra", txt = String(f.texto || ""), cw = tipo === "grita" ? 0.74 : 0.58;
    /* cabe na célula: quebra em linhas e, se não couber, diminui a letra (até 55%) */
    let fsb = fs, linhas, w, h, lhb, padb;
    for (const k of [1, 0.88, 0.76, 0.66, 0.55]) { fsb = fs * k; lhb = fsb * 1.22; padb = fsb * 0.9; const fe = tipo === "grita" ? fsb * 1.12 : fsb; linhas = hqQuebrar(txt, Math.max(6, Math.floor((cel.w * (tipo === "narra" ? 0.55 : 0.46)) / (fe * cw)))).slice(0, 7);
      w = Math.max(...linhas.map(t => t.length)) * fe * cw + padb * 2 + (tipo === "grita" ? fe * 1.8 : 0); h = linhas.length * lhb + padb * 1.6 + (tipo === "grita" ? fe * 1.4 : tipo === "pensa" ? fe * 0.8 : 0);
      if (w * (tipo === "grita" ? 1.2 : 1) <= cel.w * 0.86 && h * (tipo === "grita" ? 1.2 : 1) <= cel.h * 0.62) break; }
    w = Math.min(w, cel.w - 20); h = Math.min(h, cel.h - 20); const lh = lhb;
    const quem = f.quem && rostos.find(r => r.n === f.quem), alvo0 = quem ? (tipo === "pensa" ? [quem.x, quem.y - quem.r * 0.5] : [quem.bx, quem.by]) : null; let melhor = null;
    /* quem fala fora do quadro: o rabicho aponta para a borda, na direção dele */
    const alvo = alvo0 ? [Math.max(cel.x + 6, Math.min(cel.x + cel.w - 6, alvo0[0])), Math.max(cel.y + 6, Math.min(cel.y + cel.h - 6, alvo0[1]))] : null;
    for (let gy = 0; gy < 6; gy++) for (let gx = 0; gx < 7; gx++) {
      const b = { x: cel.x + 8 + (cel.w - w - 16) * (gx / 6), y: cel.y + 8 + (cel.h - h - 16) * (gy / 5) * 0.65, w, h }, mg = tipo === "grita" ? 0.1 : tipo === "pensa" ? 0.06 : 0;
      if (!dentro({ x: b.x - w * mg, y: b.y - h * mg, w: w * (1 + 2 * mg), h: h * (1 + 2 * mg) })) continue;
      let c = custoRosto(b) + (ocupados.some(o2 => sobre(b, o2)) ? 1e5 : 0) + gy * 18;
      const ordem = jp ? (cel.x + cel.w - (b.x + b.w)) : (b.x - cel.x); c += ordem * 0.12 * (1 - i * 0.15) + (ocupados.length && ocupados.some(o2 => (jp ? b.x > o2.x + 4 : b.x + b.w < o2.x + o2.w - 4) && b.y <= o2.y) ? 120 : 0);
      if (alvo) { const d = Math.hypot(b.x + w / 2 - alvo[0], b.y + h - alvo[1]); c += d * 0.9; const outro = rostos.find(r2 => r2 !== quem && Math.abs(r2.x - (b.x + w / 2)) < Math.abs(alvo[0] - (b.x + w / 2)) && Math.sign(r2.x - alvo[0]) === Math.sign(b.x + w / 2 - alvo[0])); if (outro) c += 400; const emCima = Math.abs(b.x + w / 2 - alvo[0]) < w / 2 + quem.r * 0.8; if (emCima && b.y + h > alvo[1] - 10) c += 600; else if (!emCima && b.y > alvo[1]) c += 150; }
      /* não cobre corpos: faixa embaixo de cada rosto (pescoço e tronco) */
      c += rostos.reduce((s0, r) => { const ox = Math.max(0, Math.min(b.x + w, r.x + r.r * 1.6) - Math.max(b.x, r.x - r.r * 1.6)), oy = Math.max(0, Math.min(b.y + h, r.y + r.r * 6) - Math.max(b.y, r.y + r.r)); return s0 + ox * oy * 0.08; }, 0);
      if (tipo === "narra") c = (gy * 50) + (jp ? (cel.x + cel.w - (b.x + b.w)) : (b.x - cel.x)) * 0.5 + (ocupados.some(o2 => sobre(b, o2)) ? 1e5 : 0) + custoRosto(b) * 0.5;
      if (!melhor || c < melhor.c) melhor = { b, c }; }
    if (!melhor) melhor = { b: { x: cel.x + 8, y: cel.y + 8 + i * (h + 6), w, h } };
    const b = melhor.b; ocupados.push(b);
    let s = hqForma(tipo, b.x, b.y, b.w, b.h, i);
    if (alvo && tipo !== "narra") s = hqRabicho(tipo, b, alvo, quem.r) + s + (tipo === "pensa" ? "" : '<rect x="0" y="0" width="0" height="0"/>');
    const cy0 = b.y + b.h / 2 - (linhas.length - 1) * lh / 2 + fsb * 0.35, peso = tipo === "grita" ? "800" : "500", ital = tipo === "sussurra" ? ' font-style="italic"' : "";
    s += linhas.map((t, j) => '<text x="' + (b.x + b.w / 2).toFixed(1) + '" y="' + (cy0 + j * lh).toFixed(1) + '" font-family="Comic Neue, Comic Sans MS, Arial, sans-serif" font-size="' + (tipo === "grita" ? fsb * 1.12 : tipo === "sussurra" ? fsb * 0.9 : fsb).toFixed(1) + '" font-weight="' + peso + '"' + ital + ' text-anchor="middle" fill="#111">' + hqEsc(tipo === "grita" ? t.toUpperCase() : t) + "</text>").join("");
    out.push(s); });
  return out.join("");
}
/* ===== grade da página ===== */
function hqGrade(qs, pg) { if (pg && pg.grade) { const g = String(pg.grade).split(/[x×]/).map(Number); if (g.length === 2 && g.every(n => n > 0)) return Array.from({ length: g[1] }, () => Array(g[0]).fill(1)); const n = +pg.grade; if (n > 0) return Array.from({ length: n }, () => [1]); }
  const g = []; let linha = []; qs.forEach(q => { const t = q.tamanho || 1; if (q.splash) { if (linha.length) g.push(linha); linha = []; g.push([{ splash: 1 }]); return; } if (t >= 1.6) { if (linha.length === 1 && t < 2.5 && linha[0] <= 1) { linha.push(t); g.push(linha); linha = []; } else { if (linha.length) { g.push(linha); linha = []; } g.push([1]); } } else { linha.push(t); if (linha.length === 2 || (t <= 0.7 && linha.length === 3)) { g.push(linha); linha = []; } } }); if (linha.length) g.push(linha); return g; }
/* páginas do name com balões */
function hqPaginas(r, fotos, o = {}) {
  const out = [];
  for (const pg of r.paginas || [{ quadros: r.quadros.map(q => q.indice) }]) {
    const qi = pg.quadros.map(i => r.quadros.findIndex(q => q.indice === i)).filter(k => k >= 0 && fotos[k]); if (!qi.length) continue;
    const F = HQ_FORMATOS[pg.formato || o.formato || "manga"] || HQ_FORMATOS.manga, base = o.largura || 1200, PW = base * (pg.dupla ? 2 : 1), PH = Math.round(base * F.razao);
    const m = pg.sangria ? 0 : (pg.margem ?? F.margem * base), cal = pg.calha ?? F.calha * base, jp = (pg.leitura || o.leitura || "japonesa") !== "ocidental";
    /* quadros "junto" dividem a célula do anterior */
    const grupos = []; qi.forEach(kk => { if (r.quadros[kk].junto && grupos.length) grupos[grupos.length - 1].push(kk); else grupos.push([kk]); });
    const qs = grupos.map(gq => r.quadros[gq[0]]), g = pg.splash ? [[1]] : hqGrade(qs, pg), pesoLinha = g.map(l => Math.max(...l.map((w, j) => { const q = qs[g.slice(0, g.indexOf(l)).reduce((s, x) => s + x.length, 0) + j]; return q ? Math.min(2.2, q.tamanho >= 1.4 ? q.tamanho * 0.8 : 1) : 1; })));
    const totP = pesoLinha.reduce((a, b) => a + b, 0), altUtil = PH - 2 * m - cal * (g.length - 1); let s = "", k = 0, y = m;
    g.forEach((lin, li) => { const ah = altUtil * pesoLinha[li] / totP, tot = lin.reduce((a, b) => a + (typeof b === "number" ? b : 1), 0), larg = PW - 2 * m - cal * (lin.length - 1); let x = m;
      /* leitura japonesa: o primeiro quadro da linha fica à direita (cada um com a SUA largura) */
      const cel = lin.map(w => { const cw0 = larg * (typeof w === "number" ? w : 1) / tot, c = { x: jp ? PW - x - cw0 : x, y, w: cw0, h: ah }; x += cw0 + cal; return c; });
      cel.forEach(c0 => { const gq = grupos[k] || []; k++; const partes = hqDividir(c0, gq.map(kk => r.quadros[kk]), cal, jp);
        gq.forEach((kk, j) => { const q = r.quadros[kk], f = fotos[kk]; if (!f) return; const id = "c" + out.length + "_" + k + "_" + j, poly = partes ? partes[j] : hqPoligono(c0, q, k), c = partes ? hqCaixa(poly) : (q && q.borda && q.borda !== "diagonal" && q.borda !== "normal" && q.borda !== "grossa" && q.borda !== "nenhuma" ? hqCaixa(poly) : c0), enc = hqEncaixe(f.svg, c, f.cabecas, q && q.recorteCel === "caber");
        s += '<clipPath id="' + id + '"><polygon points="' + hqPts(poly) + '"/></clipPath><g clip-path="url(#' + id + ')">' + (q && q.recorteCel === "caber" ? '<rect x="' + c.x.toFixed(1) + '" y="' + c.y.toFixed(1) + '" width="' + c.w.toFixed(1) + '" height="' + c.h.toFixed(1) + '" fill="#fff"/>' : "") + '<image x="' + enc.x.toFixed(1) + '" y="' + enc.y.toFixed(1) + '" width="' + enc.w.toFixed(1) + '" height="' + enc.h.toFixed(1) + '" preserveAspectRatio="none" href="' + (f.png || "data:image/svg+xml;base64," + hqB64(f.svg)) + '"/></g>';
        if (!q || q.borda !== "nenhuma") s += '<polygon points="' + hqPts(poly) + '" fill="none" stroke="#111" stroke-width="' + (q && q.borda === "grossa" ? 7 : 4) + '" stroke-linejoin="miter"/>';
        const ehRet = poly.length === 4 && !partes && (!q || !q.borda || /^(normal|grossa|nenhuma|diagonal)$/.test(q.borda)), cb = ehRet ? c : hqInscrito(poly);
        if (o.baloes !== false) s += '<g>' + hqBaloes((q && q.falas) || [], f.cabecas, cb, enc, { leitura: jp ? "japonesa" : "ocidental", fonte: o.fonte }) + "</g>";
        if (o.numeros) s += '<text x="' + (c.x + 8).toFixed(1) + '" y="' + (c.y + c.h - 8).toFixed(1) + '" font-family="Arial" font-size="14" fill="#c00">' + (q.indice + 1) + "</text>"; }); });
      y += ah + cal; });
    out.push({ svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + PW + " " + PH + '" width="' + PW + '" height="' + PH + '"><rect width="' + PW + '" height="' + PH + '" fill="#fff"/>' + s + "</svg>", quadros: qi.map(kk => r.quadros[kk].indice + 1), formato: pg.formato || o.formato || "manga", largura: PW, altura: PH }); }
  return out;
}
/* ===== webtoon: tira vertical; o espaço entre quadros é tempo (corte curto, "respiro", passagem de tempo, troca de cena) ===== */
function hqWebtoon(r, fotos, o = {}) {
  const W = o.largura || 800, m = o.margem ?? 0, items = []; let y = 60, s = "";
  r.quadros.forEach((q, k) => { const f = fotos[k]; if (!f) return; const vb = (/viewBox="([^"]+)"/.exec(f.svg) || [0, "0 0 16 9"])[1].split(/\s+/).map(Number), h = Math.round((W - 2 * m) * vb[3] / vb[2]);
    const gap = k === 0 ? 0 : (q.respiro ? 260 * q.respiro : 0) + ({ cena: 520, tempo: 420, lugar: 420, aspecto: 160, sujeito: 120, acao: 90, momento: 50 }[q.ritmo] ?? (q.tipoTransicao ? 420 : 110));
    y += gap; const cel = { x: m, y, w: W - 2 * m, h }, enc = hqEncaixe(f.svg, cel);
    const forma = q.borda && !/^(normal|grossa|nenhuma)$/.test(q.borda), poly = forma ? hqPoligono(cel, q, k) : null, idc = "wt" + k;
    if (poly) s += '<clipPath id="' + idc + '"><polygon points="' + hqPts(poly) + '"/></clipPath>';
    s += (poly ? '<g clip-path="url(#' + idc + ')">' : "") + '<image x="' + cel.x + '" y="' + y + '" width="' + cel.w + '" height="' + h + '" preserveAspectRatio="xMidYMid slice" href="' + (f.png || "data:image/svg+xml;base64," + hqB64(f.svg)) + '"/>' + (poly ? "</g>" : "");
    if (poly) s += '<polygon points="' + hqPts(poly) + '" fill="none" stroke="#111" stroke-width="4" stroke-linejoin="miter"/>'; else if (q.borda !== "nenhuma" && m > 0) s += '<rect x="' + cel.x + '" y="' + y + '" width="' + cel.w + '" height="' + h + '" fill="none" stroke="#111" stroke-width="3"/>';
    if (o.baloes !== false) s += hqBaloes(q.falas || [], f.cabecas, poly ? hqInscrito(poly) : cel, enc, { leitura: "ocidental", fonte: o.fonte || 22 });
    items.push({ quadro: q.indice + 1, y, h }); y += h; });
  y += 120; const fatias = [], maxH = o.alturaFatia || 1280; for (let y0 = 0; y0 < y; y0 += maxH) fatias.push({ y: y0, h: Math.min(maxH, y - y0) });
  return { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + y + '" width="' + W + '" height="' + y + '"><rect width="' + W + '" height="' + y + '" fill="' + (o.fundo || "#fff") + '"/>' + s + "</svg>", largura: W, altura: y, quadros: items, fatias };
}
/* recorte de uma fatia da tira (para subir em partes) */
function hqFatia(tira, f) { return tira.svg.replace(/viewBox="[^"]+" width="(\d+)" height="(\d+)"/, 'viewBox="0 ' + f.y + " " + tira.largura + " " + f.h + '" width="' + tira.largura + '" height="' + f.h + '"'); }
export { HQ_FORMATOS, hqBaloes, hqPaginas, hqWebtoon, hqFatia, hqEncaixe };
