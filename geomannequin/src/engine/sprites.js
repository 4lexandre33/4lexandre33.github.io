/* GeoMannequin — FOLHAS DE CENAS (sprite sheets): acha a grade de uma folha pelas faixas de fundo (branco, ou a cor de fundo da folha)
   e corta as células. Funciona com grade regular (1×1, 2×2, 3×3, 3×5…) e irregular (cada linha com o seu número de colunas).
   Entrada: pixels RGBA {w, h, data}. Saída: { colunas, linhas, regular, codigo "3x3" (colunas × linhas), celulas:[{x,y,w,h,linha,coluna,indice}], fundo }.
   Puro: não depende da página. */

/* cor de fundo = a mais comum na moldura da folha (quantizada) */
function spFundo(px) { const { w, h, data } = px, conta = new Map(), passo = Math.max(1, Math.floor((w + h) / 800));
  const add = (x, y) => { const i = (y * w + x) * 4; if (data[i + 3] < 16) { conta.set("T", (conta.get("T") || 0) + 1); return; } const k = (data[i] >> 4) + "," + (data[i + 1] >> 4) + "," + (data[i + 2] >> 4); conta.set(k, (conta.get(k) || 0) + 1); };
  for (let x = 0; x < w; x += passo) { add(x, 0); add(x, h - 1); add(x, Math.min(h - 1, 2)); add(x, Math.max(0, h - 3)); } for (let y = 0; y < h; y += passo) { add(0, y); add(w - 1, y); add(Math.min(w - 1, 2), y); add(Math.max(0, w - 3), y); }
  let melhor = null, n = -1; for (const [k, v] of conta) if (v > n) { n = v; melhor = k; }
  if (melhor === "T") return { transparente: true, rgb: [255, 255, 255] };
  const [r, g, b] = melhor.split(",").map(v => +v * 16 + 8); return { transparente: false, rgb: [r, g, b] }; }
/* máscara de "fundo" por pixel (perto da cor de fundo, ou branco, ou transparente) */
function spMascara(px, fundo, tol) { const { w, h, data } = px, m = new Uint8Array(w * h), [fr, fg, fb] = fundo.rgb, t2 = tol * tol;
  for (let k = 0, i = 0; k < w * h; k++, i += 4) { if (data[i + 3] < 24) { m[k] = 1; continue; } const r = data[i], g = data[i + 1], b = data[i + 2];
    const dr = r - fr, dg = g - fg, db = b - fb; if (dr * dr + dg * dg + db * db <= t2 || (r > 238 && g > 238 && b > 238)) m[k] = 1; }
  return m; }
/* corridas de faixas "quase todas de fundo" ao longo de um eixo, dentro de um retângulo */
function spFaixas(m, w, x0, y0, x1, y1, eixo, frac) {
  const N = eixo === "y" ? y1 - y0 : x1 - x0, L = eixo === "y" ? x1 - x0 : y1 - y0, livre = new Uint8Array(N);
  for (let a = 0; a < N; a++) { let s = 0; if (eixo === "y") { const o = (y0 + a) * w; for (let b = x0; b < x1; b++) s += m[o + b]; } else { for (let b = y0; b < y1; b++) s += m[b * w + x0 + a]; } livre[a] = s >= L * frac ? 1 : 0; }
  return livre; }
/* bandas de conteúdo entre as faixas livres; descarta bandas finas (texto, ruído) */
function spBandas(livre, minGap, minBanda) { const N = livre.length, out = []; let a = 0;
  while (a < N) { while (a < N && livre[a]) a++; if (a >= N) break; let b = a; while (b < N) { if (livre[b]) { let c = b; while (c < N && livre[c]) c++; if (c - b >= minGap || c >= N) break; b = c; } else b++; } out.push([a, b]); a = b; }
  const grandes = out.filter(([p, q]) => q - p >= minBanda); return grandes.length ? grandes : out; }
/* grade regular: n divisões iguais cujas fronteiras caem em faixas livres (ou quase) */
function spRegular(livre, n, ini, fim) { const L = fim - ini, tol = Math.max(3, L * 0.035); let ok = 0;
  for (let k = 1; k < n; k++) { const c = ini + L * k / n; let achou = false; for (let d = -tol; d <= tol && !achou; d++) { const i = Math.round(c + d); if (i >= 0 && i < livre.length && livre[i]) achou = true; } if (achou) ok++; }
  return ok === n - 1; }
function spConteudo(m, w, x0, y0, x1, y1) { let a = x1, b = y1, c = x0, d = y0; for (let y = y0; y < y1; y++) { const o = y * w; for (let x = x0; x < x1; x++) if (!m[o + x]) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; } } return c < a ? null : [a, b, c + 1, d + 1]; }
/* acha a grade. o: { grade:"3x3" (força), tolerancia (cor), leitura "japonesa" (numera da direita), margem (px em volta do conteúdo) } */
function detectarGrade(px, o = {}) {
  const { w, h } = px, fundo = spFundo(px), m = spMascara(px, fundo, o.tolerancia || 28), minGap = Math.max(2, Math.round(Math.min(w, h) * 0.004)), frac = o.frac || 0.985;
  const box = spConteudo(m, w, 0, 0, w, h) || [0, 0, w, h], [X0, Y0, X1, Y1] = box, avisos = [];
  let linhas;
  if (o.grade) { const [c, l] = String(o.grade).split(/[x×]/i).map(Number); if (!(c > 0 && l > 0)) throw new Error("Grade inválida: use colunas x linhas, ex. 3x3."); const hl = (Y1 - Y0) / l, wc = (X1 - X0) / c;
    linhas = Array.from({ length: l }, (_, i) => ({ y: [Math.round(Y0 + i * hl), Math.round(Y0 + (i + 1) * hl)], cols: Array.from({ length: c }, (_, j) => [Math.round(X0 + j * wc), Math.round(X0 + (j + 1) * wc)]) })); }
  else {
    const livreY = spFaixas(m, w, X0, 0, X1, h, "y", frac); let bandasY = spBandas(livreY, minGap, Math.max(8, (Y1 - Y0) * 0.06)).map(([a, b]) => [Math.max(a, Y0), Math.min(b, Y1)]).filter(([a, b]) => b > a);
    /* bandas muito desiguais: tenta divisão regular (fundo branco dentro de uma célula pode criar falsa faixa) */
    const irregular = L => L.length > 1 && Math.max(...L.map(([a, b]) => b - a)) / Math.min(...L.map(([a, b]) => b - a)) > 1.7;
    if (irregular(bandasY)) for (let n = 2; n <= 8; n++) if (spRegular(livreY, n, Y0, Y1) && n !== bandasY.length && n <= bandasY.length + 1) { const hl = (Y1 - Y0) / n; bandasY = Array.from({ length: n }, (_, i) => [Math.round(Y0 + i * hl), Math.round(Y0 + (i + 1) * hl)]); avisos.push("linhas desiguais: usei " + n + " linhas iguais"); break; }
    linhas = bandasY.map(([ya, yb]) => { const livreX = spFaixas(m, w, 0, ya, w, yb, "x", frac); let cols = spBandas(livreX, minGap, Math.max(8, (X1 - X0) * 0.05)).map(([a, b]) => [Math.max(a, X0), Math.min(b, X1)]).filter(([a, b]) => b > a);
      if (irregular(cols)) for (let n = 2; n <= 8; n++) if (spRegular(livreX, n, X0, X1) && n !== cols.length && n <= cols.length + 1) { const wc = (X1 - X0) / n; cols = Array.from({ length: n }, (_, i) => [Math.round(X0 + i * wc), Math.round(X0 + (i + 1) * wc)]); break; }
      return { y: [ya, yb], cols }; });
  }
  const celulas = [], jp = o.leitura === "japonesa", mg = o.margem ?? 0;
  linhas.forEach((L, li) => { const cols = jp ? L.cols.slice().reverse() : L.cols; cols.forEach(([xa, xb], ci) => {
    const c = o.grade ? [xa, L.y[0], xb, L.y[1]] : (spConteudo(m, w, xa, L.y[0], xb, L.y[1]) || [xa, L.y[0], xb, L.y[1]]);
    const x = Math.max(0, c[0] - mg), y = Math.max(0, c[1] - mg), cw = Math.min(w, c[2] + mg) - x, ch = Math.min(h, c[3] + mg) - y;
    if (cw < 4 || ch < 4) return; celulas.push({ x, y, w: cw, h: ch, linha: li + 1, coluna: ci + 1, indice: celulas.length + 1 }); }); });
  const nCols = linhas.map(l => l.cols.length), regular = nCols.every(n => n === nCols[0]);
  /* desconfiança: uma faixa branca DENTRO das células (céu, parede) parece calha. Linhas = 2× colunas (ou o contrário) e as divisões
     da grade quadrada também caem em faixas livres: avisa para conferir (não troca sozinho; "grade 3x3" força) */
  if (!o.grade && regular) { const C = nCols[0], Lh = linhas.length; if (Lh !== C && Lh % C === 0 && spRegular(spFaixas(m, w, X0, 0, X1, h, "y", frac), C, Y0, Y1)) avisos.push("pode ser " + C + "x" + C + " (faixa branca dentro das células?): confira e use grade " + C + "x" + C + " se for o caso");
    if (Lh !== C && C % Lh === 0 && spRegular(spFaixas(m, w, 0, Y0, w, Y1, "x", frac), Lh, X0, X1)) avisos.push("pode ser " + Lh + "x" + Lh + ": confira e use grade " + Lh + "x" + Lh + " se for o caso"); }
  return { largura: w, altura: h, colunas: regular ? nCols[0] : Math.max(...nCols), linhas: linhas.length, porLinha: nCols, regular, codigo: regular ? nCols[0] + "x" + linhas.length : nCols.join("+"), celulas, fundo: fundo.transparente ? "transparente" : "rgb(" + fundo.rgb.join(",") + ")", avisos, grade: linhas.map(l => ({ y: l.y, cols: l.cols })) };
}
/* nome de cada célula: pacote-folha-célula (com zeros), em minúsculas e sem acento/espaço */
function spSlug(t) { return String(t || "pacote").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\.[a-z0-9]+$/i, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "pacote"; }
function nomeCelula(pacote, folha, celula, nFolhas = 99, nCel = 99) { const z = (n, t) => String(n).padStart(Math.max(2, String(t).length), "0"); return spSlug(pacote) + "-" + z(folha, nFolhas) + "-" + z(celula, nCel); }
/* recorta pixels (para o MCP; no navegador o recorte é feito no canvas) */
function recortarPixels(px, c) { const out = new Uint8Array(c.w * c.h * 4); for (let y = 0; y < c.h; y++) out.set(px.data.subarray(((c.y + y) * px.w + c.x) * 4, ((c.y + y) * px.w + c.x + c.w) * 4), y * c.w * 4); return { w: c.w, h: c.h, data: out }; }
/* ordem natural de nomes de arquivo (folha2 antes de folha10) */
function ordemNatural(a, b) { return String(a).localeCompare(String(b), "pt", { numeric: true, sensitivity: "base" }); }
export { detectarGrade, nomeCelula, spSlug, recortarPixels, ordemNatural };
