/* GeoMannequin — cenário a partir de imagem de planta (cores chapadas).
   Entrada: pixels RGBA {w, h, data} (canvas no navegador; PNG/JPEG decodificado no MCP).
   1) folha → células: as faixas de fundo separam linhas e colunas; texto (títulos) vira faixa fina e é descartado;
      em cada linha, as 3 células são: vista de cima, vista lateral, isométrica (a isométrica é só referência).
   2) cor → classe, pela legenda (editável): chão, parede/prédio, madeira/escada, vegetação, água, contorno, fundo e
      manequins (vermelho, azul, roxo).
   3) vista de cima → manchas por classe numa grade grossa → retângulos (fusão gulosa) → caixas na planta;
      manequins = manchinhas pequenas das cores de manequim → posição.
   4) vista lateral → escala (altura de um manequim = 1,75 m) e perfil de alturas ao longo de x → altura de cada caixa;
      escadas sobem até a parede vizinha.
   Tudo em R (1 R ≈ 11,4 cm; 1 m ≈ 8,77 R). Puro: não depende da página nem da cena. */

const M = 1 / 0.114;

/* ===== legenda: cores de referência por classe (RGB) e a tolerância (distância no espaço Lab aproximado) ===== */
const LEGENDA_PADRAO = {
  fundo: { cores: ["#f2f2f2", "#ffffff", "#ececec"], rotulo: "fundo (ignorado)" },
  contorno: { cores: ["#101010", "#2a2a2a"], rotulo: "contorno (ignorado)" },
  chao: { cores: ["#e8d070", "#e6c870", "#f0d890", "#d8c060", "#e8d8a0"], rotulo: "chão / areia / piso" },
  parede: { cores: ["#909090", "#a0a0a0", "#7a7a7a", "#b4b4b4", "#686868", "#c8c8c8"], rotulo: "parede / prédio / rocha" },
  madeira: { cores: ["#c87830", "#c08040", "#b06020", "#d08c48", "#8a5a2a", "#a86a30"], rotulo: "escada / madeira / móvel" },
  vegetacao: { cores: ["#2e8b2e", "#3ca03c", "#1f7a1f", "#52b052", "#60c060", "#20a060"], rotulo: "árvore / planta" },
  agua: { cores: ["#40c8d8", "#30b0c8", "#60d0e0"], rotulo: "água / poço" },
  vermelho: { cores: ["#d82020", "#e03030", "#c01818"], rotulo: "manequim (vermelho)", manequim: true },
  azul: { cores: ["#2040d0", "#1830b8", "#3050e0"], rotulo: "manequim (azul)", manequim: true },
  roxo: { cores: ["#8030b0", "#9040c0", "#7020a0"], rotulo: "manequim (roxo)", manequim: true }
};
const CLASSES = Object.keys(LEGENDA_PADRAO);
function hexRgb(h) { const n = parseInt(String(h).replace("#", ""), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
/* RGB → HSV (h em graus, s e v de 0 a 1) */
function hsv(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d > 0) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360;
  return [h, mx ? d / mx : 0, mx / 255]; }
/* classificador: regras de matiz/saturação (robustas a sombras e ruído de JPEG) + vizinho mais próximo na legenda */
function criarClassificador(legenda) {
  const L = legenda || LEGENDA_PADRAO, ref = [];
  for (const k of CLASSES) for (const c of (L[k] && L[k].cores) || []) ref.push([k, hexRgb(c)]);
  const cache = new Map();
  return (r, g, b) => {
    const key = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3); let v = cache.get(key); if (v !== undefined) return v;
    const [h, s, val] = hsv(r, g, b);
    if (val < 0.22) v = "contorno";
    else if (s < 0.13) v = val > 0.9 ? "fundo" : "parede";
    else if (s > 0.42 && (h < 14 || h > 345) && val > 0.45) v = "vermelho";
    else if (s > 0.45 && h > 205 && h < 252 && val > 0.35) v = "azul";
    else if (s > 0.3 && h > 255 && h < 310 && val > 0.3) v = "roxo";
    else if (h > 160 && h < 202 && s > 0.3) v = "agua";
    else if (h > 70 && h < 165 && s > 0.25) v = "vegetacao";
    else if (h >= 14 && h < 38 && s > 0.45) v = "madeira";
    else if (h >= 38 && h <= 70 && s > 0.2) v = val < 0.55 ? "madeira" : "chao";
    else { let best = "fundo", bd = 1e9; for (const [k, c] of ref) { const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2; if (d < bd) { bd = d; best = k; } } v = best; }
    cache.set(key, v); return v;
  };
}

/* ===== 1) células da folha ===== */
function ehFundo(d, i) { const r = d[i], g = d[i + 1], b = d[i + 2]; return r > 228 && g > 228 && b > 228 && Math.max(r, g, b) - Math.min(r, g, b) < 18; }
function faixas(perfil, minCheio, minVazio) {
  const out = []; let ini = -1, vaz = 0;
  for (let i = 0; i <= perfil.length; i++) { const cheio = i < perfil.length && perfil[i] > 0;
    if (cheio) { if (ini < 0) ini = i; vaz = 0; } else if (ini >= 0) { vaz++; if (vaz >= minVazio || i === perfil.length) { const fim = i - vaz; if (fim - ini + 1 >= minCheio) out.push([ini, fim]); ini = -1; vaz = 0; } } }
  return out;
}
/* devolve [{linha, coluna, x0, y0, x1, y1}] (só blocos de desenho; títulos finos ficam de fora) */
function celulasDaFolha(img, o = {}) {
  const { w, h, data } = img, lin = new Int32Array(h);
  for (let y = 0; y < h; y++) { let n = 0; for (let x = 0; x < w; x += 2) if (!ehFundo(data, (y * w + x) * 4)) n++; lin[y] = n > 2 ? n : 0; }
  const minV = Math.max(3, Math.round(h * 0.006));
  let bandas = faixas(lin, 2, minV);
  const altMax = Math.max(...bandas.map(b => b[1] - b[0] + 1), 1);
  /* títulos: faixas finas (texto) — ficam de fora */
  bandas = bandas.filter(b => b[1] - b[0] + 1 > Math.max(o.minAltura || 0, altMax * 0.3));
  const cels = [];
  bandas.forEach(([y0, y1], li) => {
    const col = new Int32Array(w); for (let x = 0; x < w; x++) { let n = 0; for (let y = y0; y <= y1; y += 2) if (!ehFundo(data, (y * w + x) * 4)) n++; col[x] = n > 1 ? n : 0; }
    let bl = faixas(col, Math.round(w * 0.04), Math.max(4, Math.round(w * 0.012)));
    bl = bl.filter(b => b[1] - b[0] > w * 0.06);
    /* folha de 3 vistas: um desenho com um vão interno se parte em dois — junta os vizinhos mais próximos até sobrarem 3 */
    while (bl.length > (o.colunas || 3)) { let k = 0, mg = 1e9; for (let i = 0; i < bl.length - 1; i++) { const gap = bl[i + 1][0] - bl[i][1]; if (gap < mg) { mg = gap; k = i; } } bl.splice(k, 2, [bl[k][0], bl[k + 1][1]]); }
    bl.forEach(([x0, x1], ci) => { /* aperta y ao conteúdo deste bloco */
      let ya = y1, yb = y0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x += 3) if (!ehFundo(data, (y * w + x) * 4)) { if (y < ya) ya = y; if (y > yb) yb = y; break; }
      cels.push({ linha: li, coluna: ci, x0, y0: ya, x1, y1: yb }); });
  });
  return cels;
}

/* ===== grade de classes de um retângulo da imagem (célula) ===== */
function gradeDeClasses(img, cel, passo, classificar) {
  const { w, data } = img, gw = Math.max(1, Math.floor((cel.x1 - cel.x0 + 1) / passo)), gh = Math.max(1, Math.floor((cel.y1 - cel.y0 + 1) / passo));
  const g = new Array(gw * gh), conta = {};
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const n = {}; let best = "fundo", bn = 0;
    for (let dy = 0; dy < passo; dy += Math.max(1, passo >> 1)) for (let dx = 0; dx < passo; dx += Math.max(1, passo >> 1)) {
      const x = cel.x0 + i * passo + dx, y = cel.y0 + j * passo + dy, k = (y * w + x) * 4, c = classificar(data[k], data[k + 1], data[k + 2]);
      n[c] = (n[c] || 0) + 1; }
    /* manequins são pequenos: qualquer amostra de cor de manequim ganha; contorno perde para o que estiver ao lado */
    for (const c of ["vermelho", "azul", "roxo"]) if (n[c]) { best = c; bn = 99; }
    if (bn < 99) for (const c in n) if (c !== "contorno" && n[c] > bn) { best = c; bn = n[c]; }
    if (bn === 0) best = "contorno";
    g[j * gw + i] = best; conta[best] = (conta[best] || 0) + 1;
  }
  return { gw, gh, g, passo, conta };
}
/* componentes ligados (4-vizinhos) de uma classe (ou de um conjunto de classes) */
function componentes(G, aceita) {
  const { gw, gh, g } = G, vis = new Uint8Array(gw * gh), out = [];
  for (let k = 0; k < gw * gh; k++) { if (vis[k] || !aceita(g[k])) continue;
    const pilha = [k], cel = []; vis[k] = 1;
    while (pilha.length) { const q = pilha.pop(); cel.push(q); const x = q % gw, y = (q / gw) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) { if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue; const j = ny * gw + nx; if (!vis[j] && aceita(g[j])) { vis[j] = 1; pilha.push(j); } } }
    let x0 = gw, y0 = gh, x1 = -1, y1 = -1, sx = 0, sy = 0; for (const q of cel) { const x = q % gw, y = (q / gw) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); sx += x; sy += y; }
    out.push({ n: cel.length, x0, y0, x1, y1, cx: sx / cel.length, cy: sy / cel.length, celulas: cel }); }
  return out;
}
/* mancha → retângulos (fusão gulosa: faixas horizontais que se empilham com a mesma largura viram um retângulo) */
function retangulos(G, comp, minLado = 1) {
  const { gw } = G, s = new Set(comp.celulas), usado = new Set(), out = [];
  const tem = (x, y) => s.has(y * gw + x) && !usado.has(y * gw + x);
  for (let y = comp.y0; y <= comp.y1; y++) for (let x = comp.x0; x <= comp.x1; x++) {
    if (!tem(x, y)) continue;
    let x2 = x; while (x2 + 1 <= comp.x1 && tem(x2 + 1, y)) x2++;
    let y2 = y; outer: while (y2 + 1 <= comp.y1) { for (let xx = x; xx <= x2; xx++) if (!tem(xx, y2 + 1)) break outer; y2++; }
    for (let yy = y; yy <= y2; yy++) for (let xx = x; xx <= x2; xx++) usado.add(yy * gw + xx);
    if (x2 - x + 1 >= minLado && y2 - y + 1 >= minLado) out.push({ x0: x, y0: y, x1: x2, y1: y2 });
  }
  return out;
}

/* ===== 4) vista lateral: chão, escala pelos manequins, perfil de altura das paredes ===== */
function lerLateral(img, cel, classificar) {
  const passo = Math.max(2, Math.round((cel.x1 - cel.x0) / 160)), G = gradeDeClasses(img, cel, passo, classificar), { gw, gh, g } = G;
  /* chão: a linha mais baixa com bastante "chao" ou o fim do desenho */
  let chao = gh - 1; for (let y = gh - 1; y >= 0; y--) { let n = 0; for (let x = 0; x < gw; x++) if (g[y * gw + x] === "chao") n++; if (n > gw * 0.3) { chao = y; break; } }
  /* manequins: componentes das cores de manequim → altura em células */
  /* um manequim desenhado com contorno preto se parte em pedaços (cabeça, tronco, pernas): junta os pedaços da mesma cor
     que estão na mesma coluna e mede a altura do conjunto (do alto da cabeça ao pé) */
  const pedacos = componentes(G, c => c === "vermelho" || c === "azul" || c === "roxo").filter(c => c.n >= 1), mq = [];
  pedacos.sort((a, b) => a.cx - b.cx).forEach(c => { const cor = g[c.celulas[0]], m = mq.find(q => q.cor === cor && Math.abs(q.cx - c.cx) < Math.max(3, (q.y1 - q.y0) * 0.35));
    if (m) { m.y0 = Math.min(m.y0, c.y0); m.y1 = Math.max(m.y1, c.y1); m.n += c.n; } else mq.push({ cor, cx: c.cx, y0: c.y0, y1: c.y1, n: c.n }); });
  mq.forEach(m => { m.x = m.cx; m.alt = m.y1 - m.y0 + 1; m.pe = m.y1; });
  for (let i = mq.length - 1; i >= 0; i--) if (mq[i].alt < 4 || mq[i].n < 4) mq.splice(i, 1);
  const altPessoa = mq.length ? mediana(mq.map(m => m.alt)) : null;
  /* perfil: para cada x, a altura (em células acima do chão) do ponto mais alto de parede/madeira */
  const perfil = new Float32Array(gw), perfilMad = new Float32Array(gw);
  for (let x = 0; x < gw; x++) { for (let y = 0; y < chao; y++) { const c = g[y * gw + x]; if (c === "parede" && !perfil[x]) perfil[x] = chao - y; if (c === "madeira" && !perfilMad[x]) perfilMad[x] = chao - y; } }
  return { G, chao, manequins: mq, altPessoa, perfil, perfilMad, largura: gw, passo };
}
function mediana(v) { const s = v.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; }

/* ===== 3) vista de cima → itens da planta ===== */
function lerPlanta(img, celCima, celLado, o = {}) {
  const classificar = criarClassificador(o.legenda);
  const larguraPx = celCima.x1 - celCima.x0 + 1, passo = Math.max(2, Math.round(larguraPx / (o.resolucao || 64)));
  const G = gradeDeClasses(img, celCima, passo, classificar), { gw, gh, g } = G;
  /* escala: pela lateral (altura do manequim = 1,75 m), senão pela largura dada (padrão 16 m) */
  let lado = null, mPorCel;
  if (celLado) { lado = lerLateral(img, celLado, classificar); }
  if (o.larguraMetros) mPorCel = o.larguraMetros / gw;
  else if (lado && lado.altPessoa) { const mPorCelLado = 1.75 / lado.altPessoa, larguraM = lado.largura * mPorCelLado; mPorCel = Math.min(1.2, Math.max(0.05, larguraM / gw)); }
  else mPorCel = 16 / gw;
  const R = mPorCel * M; /* R por célula da grade de cima */
  const cx = gw / 2, cz = gh / 2, mundo = (x, y) => [(x + 0.5 - cx) * R, (y + 0.5 - cz) * R];
  const altLado = (xFrac0, xFrac1, qual) => { if (!lado) return null; const P = qual === "madeira" ? lado.perfilMad : lado.perfil, a = Math.floor(xFrac0 * lado.largura), b = Math.ceil(xFrac1 * lado.largura); let mx = 0; for (let x = Math.max(0, a); x <= Math.min(lado.largura - 1, b); x++) mx = Math.max(mx, P[x]); if (!mx) return null; const h = mx * (lado.altPessoa ? 1.75 / lado.altPessoa : 0.05 * lado.passo) * M;
    /* as imagens geradas exageram a lateral: limita a 2,2 pessoas de altura (≈ 3,9 m; {alturaMaxPessoas}), salvo {alturasReais: true} */
    return o.alturasReais ? h : Math.min(h, (o.alturaMaxPessoas || 2.2) * 15.3); };
  const itens = [], minCel = Math.max(1, o.minCelulas || 2);
  /* paredes e prédios */
  for (const comp of componentes(G, c => c === "parede")) {
    if (comp.n < minCel * 2) continue;
    for (const r of retangulos(G, comp, minCel)) {
      const [x0, z0] = mundo(r.x0 - 0.5, r.y0 - 0.5), [x1, z1] = mundo(r.x1 + 0.5, r.y1 + 0.5), larg = x1 - x0, prof = z1 - z0;
      let alt = altLado((r.x0) / gw, (r.x1 + 1) / gw, "parede"); if (!alt) alt = Math.min(larg, prof) < 2.5 ? 22 : 26;
      itens.push({ classe: "parede", tipo: Math.min(larg, prof) < 3 ? "parede" : "predio", x: (x0 + x1) / 2, z: (z0 + z1) / 2, larg, prof, alt: Math.max(4, Math.min(110, alt)) });
    }
  }
  /* madeira: escadas (compridas e encostadas numa parede) ou móveis/bancas */
  for (const comp of componentes(G, c => c === "madeira")) {
    if (comp.n < minCel * 2) continue;
    for (const r of retangulos(G, comp, minCel)) {
      const [x0, z0] = mundo(r.x0 - 0.5, r.y0 - 0.5), [x1, z1] = mundo(r.x1 + 0.5, r.y1 + 0.5), larg = x1 - x0, prof = z1 - z0;
      /* lado mais alto: onde encosta parede (conta células de parede em volta de cada borda) */
      const borda = (xa, ya, xb, yb) => { let n = 0; for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) if (x >= 0 && y >= 0 && x < gw && y < gh && g[y * gw + x] === "parede") n++; return n; };
      const lados = { norte: borda(r.x0, r.y0 - 2, r.x1, r.y0 - 1), sul: borda(r.x0, r.y1 + 1, r.x1, r.y1 + 2), oeste: borda(r.x0 - 2, r.y0, r.x0 - 1, r.y1), leste: borda(r.x1 + 1, r.y0, r.x1 + 2, r.y1) };
      const melhor = Object.entries(lados).sort((a, b) => b[1] - a[1])[0];
      const comprido = Math.max(larg, prof) > 1.6 * Math.min(larg, prof);
      if (comprido && melhor[1] > 0) {
        let alt = altLado(r.x0 / gw, (r.x1 + 1) / gw, "madeira") || altLado(r.x0 / gw, (r.x1 + 1) / gw, "parede") || 14;
        /* o "fundo" (+z local) da rampa é o lado alto: giro aponta para lá */
        const giro = { norte: 180, sul: 0, oeste: -90, leste: 90 }[melhor[0]], aoLongoZ = giro === 0 || giro === 180;
        itens.push({ classe: "madeira", tipo: "rampaDegraus", x: (x0 + x1) / 2, z: (z0 + z1) / 2, larg: aoLongoZ ? larg : prof, prof: aoLongoZ ? prof : larg, alt: Math.max(3, Math.min(60, alt)), giro: giro === 0 ? 180 : giro === 180 ? 0 : giro });
      } else itens.push({ classe: "madeira", tipo: "caixa", x: (x0 + x1) / 2, z: (z0 + z1) / 2, larg, prof, alt: Math.max(2.5, Math.min(9, Math.min(larg, prof))) });
    }
  }
  /* vegetação: cada mancha = árvore (grande) ou arbusto */
  for (const comp of componentes(G, c => c === "vegetacao")) {
    if (comp.n < 2) continue;
    const [x, z] = mundo(comp.cx, comp.cy), d = Math.max(comp.x1 - comp.x0 + 1, comp.y1 - comp.y0 + 1) * R;
    itens.push({ classe: "vegetacao", tipo: d > 9 ? "arvore" : d > 5 ? "palmeira" : "arbusto", x, z, larg: d, prof: d, alt: d > 9 ? Math.min(60, d * 2.6) : d > 5 ? 28 : Math.max(2.5, d * 0.8) });
  }
  /* água: espelho/poço */
  for (const comp of componentes(G, c => c === "agua")) {
    if (comp.n < 6) continue; /* reflexos azulados dos ícones de manequim não são água */
    const [x0, z0] = mundo(comp.x0 - 0.5, comp.y0 - 0.5), [x1, z1] = mundo(comp.x1 + 0.5, comp.y1 + 0.5), larg = x1 - x0, prof = z1 - z0, [x, z] = [(x0 + x1) / 2, (z0 + z1) / 2];
    const redondo = Math.abs(larg - prof) < 0.3 * Math.max(larg, prof) && comp.n < 0.85 * (comp.x1 - comp.x0 + 1) * (comp.y1 - comp.y0 + 1);
    itens.push({ classe: "agua", tipo: redondo ? "poco" : "agua", x, z, larg, prof, alt: redondo ? 4.5 : 0.3 });
  }
  /* manequins: manchinhas de cor de manequim */
  const manequins = [];
  for (const cor of ["vermelho", "azul", "roxo"]) {
    /* o ícone com contorno se parte em pedaços: junta pedaços da mesma cor que quase se tocam (vão ≤ 1 célula) */
    const cs = componentes(G, c => c === cor).map(c => ({ ...c })), grupos = [];
    for (const c of cs) { const gq = grupos.find(q => c.x0 <= q.x1 + 2 && c.x1 >= q.x0 - 2 && c.y0 <= q.y1 + 2 && c.y1 >= q.y0 - 2);
      if (gq) { gq.sx += c.cx * c.n; gq.sy += c.cy * c.n; gq.n += c.n; gq.x0 = Math.min(gq.x0, c.x0); gq.x1 = Math.max(gq.x1, c.x1); gq.y0 = Math.min(gq.y0, c.y0); gq.y1 = Math.max(gq.y1, c.y1); }
      else grupos.push({ sx: c.cx * c.n, sy: c.cy * c.n, n: c.n, x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1 }); }
    for (const q of grupos) { const [x, z] = mundo(q.sx / q.n, q.sy / q.n); manequins.push({ cor, x, z, celulas: q.n }); }
  }
  /* olhar: para o centro de massa dos outros manequins (conversa) ou para o centro da planta */
  const cmx = manequins.reduce((s, m) => s + m.x, 0) / Math.max(1, manequins.length), cmz = manequins.reduce((s, m) => s + m.z, 0) / Math.max(1, manequins.length);
  manequins.forEach(m => { const ox = manequins.length > 1 ? (cmx * manequins.length - m.x) / (manequins.length - 1) : 0, oz = manequins.length > 1 ? (cmz * manequins.length - m.z) / (manequins.length - 1) : 0;
    m.giro = Math.round(Math.atan2(ox - m.x, oz - m.z) * 180 / Math.PI); });
  /* chão: área de piso (para enquadrar e para o tamanho do mundo) */
  const piso = { larg: gw * R, prof: gh * R, classes: G.conta };
  return { escala: { mPorCelula: mPorCel, RPorCelula: R, metrosLargura: gw * mPorCel, pelaLateral: !o.larguraMetros && !!(lado && lado.altPessoa), pelaLargura: !!o.larguraMetros }, piso, itens, manequins,
    lateral: lado ? { manequins: lado.manequins.length, altPessoaCelulas: lado.altPessoa } : null, grade: { gw, gh, passo } };
}

/* folha inteira: lê as células e devolve, por linha, a análise (cima + lateral) */
function analisarFolha(img, o = {}) {
  const cels = celulasDaFolha(img, o), linhas = {};
  cels.forEach(c => { (linhas[c.linha] = linhas[c.linha] || []).push(c); });
  const out = [];
  for (const k of Object.keys(linhas).map(Number).sort((a, b) => a - b)) {
    const row = linhas[k].sort((a, b) => a.x0 - b.x0);
    if (o.linha !== undefined && o.linha !== out.length) { out.push({ linha: out.length, celulas: row }); continue; }
    const cima = row[0], lado = row.length >= 2 ? row[1] : null;
    out.push({ linha: out.length, celulas: row, ...lerPlanta(img, cima, lado, o) });
  }
  return { celulas: cels, linhas: out };
}
/* uma imagem só (sem folha): tudo é a vista de cima */
function analisarImagemUnica(img, o = {}) { return lerPlanta(img, { x0: 0, y0: 0, x1: img.w - 1, y1: img.h - 1 }, null, o); }

export { LEGENDA_PADRAO, criarClassificador, celulasDaFolha, gradeDeClasses, componentes, retangulos, lerLateral, lerPlanta, analisarFolha, analisarImagemUnica };
