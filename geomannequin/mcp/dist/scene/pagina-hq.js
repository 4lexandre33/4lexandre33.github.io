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
function hqEncaixe(svg, cel) { const m = /viewBox="([^"]+)"/.exec(svg), vb = m ? m[1].split(/\s+/).map(Number) : [0, 0, cel.w, cel.h], iw = vb[2], ih = vb[3], k = Math.max(cel.w / iw, cel.h / ih), w = iw * k, h = ih * k, alto = ih / iw > cel.h / cel.w;
  return { x: cel.x + (cel.w - w) / 2, y: alto ? cel.y : cel.y + (cel.h - h) / 2, w, h, alto }; }
/* polígono da célula (borda diagonal: um lado inclinado, alternando para dar movimento) */
function hqPoligono(c, q, i) { if (q && q.borda === "diagonal") { const d = Math.min(c.w * 0.25, Math.tan(((q.bordaGraus || 12) * Math.PI) / 180) * c.h), dir = i % 2 ? 1 : -1;
    return dir > 0 ? [[c.x, c.y], [c.x + c.w, c.y], [c.x + c.w - d, c.y + c.h], [c.x, c.y + c.h]] : [[c.x, c.y], [c.x + c.w - d, c.y], [c.x + c.w, c.y + c.h], [c.x, c.y + c.h]]; }
  return [[c.x, c.y], [c.x + c.w, c.y], [c.x + c.w, c.y + c.h], [c.x, c.y + c.h]]; }
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
    const tipo = f.quem ? (f.tipo || "fala") : "narra", txt = String(f.texto || ""), linhas = hqQuebrar(txt, Math.max(8, Math.floor((cel.w * (tipo === "narra" ? 0.55 : 0.42)) / (fs * 0.56)))).slice(0, 7);
    const w = Math.min(cel.w * 0.8, Math.max(...linhas.map(t => t.length)) * fs * 0.56 + pad * 2 + (tipo === "grita" ? fs * 1.6 : 0)), h = linhas.length * lh + pad * 1.6 + (tipo === "grita" ? fs * 1.2 : tipo === "pensa" ? fs * 0.8 : 0);
    const quem = f.quem && rostos.find(r => r.n === f.quem), alvo = quem ? (tipo === "pensa" ? [quem.x, quem.y - quem.r * 0.5] : [quem.bx, quem.by]) : null; let melhor = null;
    for (let gy = 0; gy < 6; gy++) for (let gx = 0; gx < 7; gx++) {
      const b = { x: cel.x + 8 + (cel.w - w - 16) * (gx / 6), y: cel.y + 8 + (cel.h - h - 16) * (gy / 5) * 0.65, w, h }; if (!dentro(b)) continue;
      let c = custoRosto(b) + (ocupados.some(o2 => sobre(b, o2)) ? 1e5 : 0) + gy * 18;
      const ordem = jp ? (cel.x + cel.w - (b.x + b.w)) : (b.x - cel.x); c += ordem * 0.12 * (1 - i * 0.15) + (ocupados.length && ocupados.some(o2 => (jp ? b.x > o2.x + 4 : b.x + b.w < o2.x + o2.w - 4) && b.y <= o2.y) ? 120 : 0);
      if (alvo) { const d = Math.hypot(b.x + w / 2 - alvo[0], b.y + h - alvo[1]); c += d * 0.9; const outro = rostos.find(r2 => r2 !== quem && Math.abs(r2.x - (b.x + w / 2)) < Math.abs(alvo[0] - (b.x + w / 2)) && Math.sign(r2.x - alvo[0]) === Math.sign(b.x + w / 2 - alvo[0])); if (outro) c += 400; if (b.y + h > alvo[1] - 10) c += 600; }
      if (tipo === "narra") c = (gy * 50) + (jp ? (cel.x + cel.w - (b.x + b.w)) : (b.x - cel.x)) * 0.5 + (ocupados.some(o2 => sobre(b, o2)) ? 1e5 : 0) + custoRosto(b) * 0.5;
      if (!melhor || c < melhor.c) melhor = { b, c }; }
    if (!melhor) melhor = { b: { x: cel.x + 8, y: cel.y + 8 + i * (h + 6), w, h } };
    const b = melhor.b; ocupados.push(b);
    let s = hqForma(tipo, b.x, b.y, b.w, b.h, i);
    if (alvo && tipo !== "narra") s = hqRabicho(tipo, b, alvo, quem.r) + s + (tipo === "pensa" ? "" : '<rect x="0" y="0" width="0" height="0"/>');
    const cy0 = b.y + b.h / 2 - (linhas.length - 1) * lh / 2 + fs * 0.35, peso = tipo === "grita" ? "800" : "500", ital = tipo === "sussurra" ? ' font-style="italic"' : "";
    s += linhas.map((t, j) => '<text x="' + (b.x + b.w / 2).toFixed(1) + '" y="' + (cy0 + j * lh).toFixed(1) + '" font-family="Comic Neue, Comic Sans MS, Arial, sans-serif" font-size="' + (tipo === "grita" ? fs * 1.12 : tipo === "sussurra" ? fs * 0.9 : fs).toFixed(1) + '" font-weight="' + peso + '"' + ital + ' text-anchor="middle" fill="#111">' + hqEsc(tipo === "grita" ? t.toUpperCase() : t) + "</text>").join("");
    out.push(s); });
  return out.join("");
}
/* ===== grade da página ===== */
function hqGrade(qs, pg) { if (pg && pg.grade) { const g = String(pg.grade).split(/[x×]/).map(Number); if (g.length === 2 && g.every(n => n > 0)) return Array.from({ length: g[1] }, () => Array(g[0]).fill(1)); const n = +pg.grade; if (n > 0) return Array.from({ length: n }, () => [1]); }
  const g = []; let linha = []; qs.forEach(q => { const t = q.tamanho || 1; if (q.splash) { if (linha.length) g.push(linha); linha = []; g.push([{ splash: 1 }]); return; } if (t >= 1.6) { if (linha.length) { g.push(linha); linha = []; } g.push([t >= 2 ? 1 : 1]); } else { linha.push(t); if (linha.length === 2 || (t <= 0.7 && linha.length === 3)) { g.push(linha); linha = []; } } }); if (linha.length) g.push(linha); return g; }
/* páginas do name com balões */
function hqPaginas(r, fotos, o = {}) {
  const out = [];
  for (const pg of r.paginas || [{ quadros: r.quadros.map(q => q.indice) }]) {
    const qi = pg.quadros.map(i => r.quadros.findIndex(q => q.indice === i)).filter(k => k >= 0 && fotos[k]); if (!qi.length) continue;
    const F = HQ_FORMATOS[pg.formato || o.formato || "manga"] || HQ_FORMATOS.manga, base = o.largura || 1200, PW = base * (pg.dupla ? 2 : 1), PH = Math.round(base * F.razao);
    const m = pg.sangria ? 0 : (pg.margem ?? F.margem * base), cal = pg.calha ?? F.calha * base, jp = (pg.leitura || o.leitura || "japonesa") !== "ocidental";
    const qs = qi.map(k => r.quadros[k]), g = pg.splash ? [[1]] : hqGrade(qs, pg), pesoLinha = g.map(l => Math.max(...l.map((w, j) => { const q = qs[g.slice(0, g.indexOf(l)).reduce((s, x) => s + x.length, 0) + j]; return q ? Math.min(2.2, q.tamanho >= 1.4 ? q.tamanho * 0.8 : 1) : 1; })));
    const totP = pesoLinha.reduce((a, b) => a + b, 0), altUtil = PH - 2 * m - cal * (g.length - 1); let s = "", k = 0, y = m;
    g.forEach((lin, li) => { const ah = altUtil * pesoLinha[li] / totP, tot = lin.reduce((a, b) => a + (typeof b === "number" ? b : 1), 0), larg = PW - 2 * m - cal * (lin.length - 1); let x = m;
      const cel = lin.map(w => { const c = { x, y, w: larg * (typeof w === "number" ? w : 1) / tot, h: ah }; x += c.w + cal; return c; }); if (jp) cel.reverse();
      cel.forEach(c => { const kk = qi[k], q = r.quadros[kk], f = fotos[kk]; k++; if (!f) return; const id = "c" + out.length + "_" + k, poly = hqPoligono(c, q, k), enc = hqEncaixe(f.svg, c);
        s += '<clipPath id="' + id + '"><polygon points="' + hqPts(poly) + '"/></clipPath><g clip-path="url(#' + id + ')"><image x="' + enc.x.toFixed(1) + '" y="' + enc.y.toFixed(1) + '" width="' + enc.w.toFixed(1) + '" height="' + enc.h.toFixed(1) + '" preserveAspectRatio="none" href="' + (f.png || "data:image/svg+xml;base64," + hqB64(f.svg)) + '"/></g>';
        if (!q || q.borda !== "nenhuma") s += '<polygon points="' + hqPts(poly) + '" fill="none" stroke="#111" stroke-width="' + (q && q.borda === "grossa" ? 7 : 4) + '" stroke-linejoin="miter"/>';
        if (o.baloes !== false) s += '<g>' + hqBaloes((q && q.falas) || [], f.cabecas, c, enc, { leitura: jp ? "japonesa" : "ocidental", fonte: o.fonte }) + "</g>";
        if (o.numeros) s += '<text x="' + (c.x + 8).toFixed(1) + '" y="' + (c.y + c.h - 8).toFixed(1) + '" font-family="Arial" font-size="14" fill="#c00">' + (q.indice + 1) + "</text>"; });
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
    s += '<image x="' + cel.x + '" y="' + y + '" width="' + cel.w + '" height="' + h + '" preserveAspectRatio="xMidYMid slice" href="' + (f.png || "data:image/svg+xml;base64," + hqB64(f.svg)) + '"/>';
    if (q.borda !== "nenhuma" && m > 0) s += '<rect x="' + cel.x + '" y="' + y + '" width="' + cel.w + '" height="' + h + '" fill="none" stroke="#111" stroke-width="3"/>';
    if (o.baloes !== false) s += hqBaloes(q.falas || [], f.cabecas, cel, enc, { leitura: "ocidental", fonte: o.fonte || 22 });
    items.push({ quadro: q.indice + 1, y, h }); y += h; });
  y += 120; const fatias = [], maxH = o.alturaFatia || 1280; for (let y0 = 0; y0 < y; y0 += maxH) fatias.push({ y: y0, h: Math.min(maxH, y - y0) });
  return { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + y + '" width="' + W + '" height="' + y + '"><rect width="' + W + '" height="' + y + '" fill="' + (o.fundo || "#fff") + '"/>' + s + "</svg>", largura: W, altura: y, quadros: items, fatias };
}
/* recorte de uma fatia da tira (para subir em partes) */
function hqFatia(tira, f) { return tira.svg.replace(/viewBox="[^"]+" width="(\d+)" height="(\d+)"/, 'viewBox="0 ' + f.y + " " + tira.largura + " " + f.h + '" width="' + tira.largura + '" height="' + f.h + '"'); }
export { HQ_FORMATOS, hqBaloes, hqPaginas, hqWebtoon, hqFatia, hqEncaixe };
