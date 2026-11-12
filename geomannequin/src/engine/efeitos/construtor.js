/* GeoMannequin — desenho do construtor de efeitos por camadas (ver camadas-vfx.js).
   Tudo nasce em 3D (referencial da âncora e da direção), é projetado pela câmera da cena e partido em
   "atrás" e "na frente" do corpo do dono pela profundidade. O traço é uma fita de espessura variável
   (como a caneta Bézier: grossa num trecho, fina no outro), suavizada por curvas de Bézier. */
import { f1 } from "../matematica.js";
import { rng, suave, caminho, circulo, estrela, faisca, labareda, cristal, lasca, misturar, corEm, forma, PERFIS } from "./primitivas.js";

const INK = "#141414", PAPEL = "#FFFFFF";
const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], vMul = (a, k) => [a[0] * k, a[1] * k, a[2] * k], vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vNorm = a => { const l = Math.hypot(...a) || 1; return a.map(x => x / l); };
const D2R = Math.PI / 180;
/* rotação de um ponto local [a, b, c] em volta de um eixo local (0 = a, 1 = b, 2 = c) */
function girarLocal(p, eixo, g) { if (!g) return p; const c = Math.cos(g * D2R), s = Math.sin(g * D2R), [i, j] = [[1, 2], [2, 0], [0, 1]][eixo], q = p.slice(); q[i] = p[i] * c - p[j] * s; q[j] = p[i] * s + p[j] * c; return q; }

/* ---------- referencial ---------- */
function referencial(fx, plano) {
  const UP = fx.UP || [0, 1, 0];
  let u = fx.D && fx.D.mundo ? vNorm(fx.D.mundo) : [1, 0, 0];
  if (plano === "chao") { /* eixo para cima; b = frente no chão; c = lado */
    let f = vSub(u, vMul(UP, vDot(u, UP))); if (Math.hypot(...f) < 1e-3) f = [1, 0, 0]; f = vNorm(f); return { a: UP, b: f, c: vNorm(vCross(UP, f)) };
  }
  let v = vSub(UP, vMul(u, vDot(UP, u))); if (Math.hypot(...v) < 1e-3) v = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1]; v = vNorm(v);
  const w = vNorm(vCross(u, v));
  return plano === "horizontal" ? { a: u, b: w, c: v } : { a: u, b: v, c: w };
}

/* ---------- caminhos (pontos locais [a, b, c] para t de 0 a 1) ---------- */
function caminhosDe(k, r, n = 48) {
  const L = k.comprimento, R0 = k.raio, R1 = k.raioFim === null ? R0 : k.raioFim, Rt = t => R0 + (R1 - R0) * t, f0 = k.inicioAng * D2R;
  const amostra = fn => { const out = []; for (let i = 0; i <= n; i++) out.push(fn(i / n)); return out; };
  const chao = k.plano === "chao";
  switch (k.tipo) {
    case "reta": return [amostra(t => chao ? [0, L * t, k.curva * Math.sin(Math.PI * t)] : [L * t, k.curva * Math.sin(Math.PI * t), 0])];
    case "arco": { const ab = k.abertura * D2R, a0 = f0 - ab / 2;
      return [amostra(t => { const th = a0 + ab * t, R = Rt(t); return k.plano === "frente" ? [0, R * Math.cos(th), R * Math.sin(th)] : [R * Math.cos(th), R * Math.sin(th), k.subir * (t - 0.5)]; })]; }
    case "helice": return [amostra(t => { const th = 2 * Math.PI * k.voltas * t + f0, R = Rt(t); return [L * t, R * Math.cos(th), R * Math.sin(th)]; })];
    case "espiral": return [amostra(t => { const th = 2 * Math.PI * k.voltas * t + f0, R = R0 * (0.06 + 0.94 * t); return [L * t, R * Math.cos(th), R * Math.sin(th)]; })];
    case "onda": return [amostra(t => { const th = 2 * Math.PI * k.frequencia * t + f0, A = k.amplitude * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, t * 1.2))); return [L * t, A * Math.sin(th) + k.curva * t * t, A * k.torcao * 0.6 * Math.cos(th)]; })];
    case "zigue": { const m = Math.max(2, Math.round(k.frequencia * 2)), pts = [];
      for (let i = 0; i <= m; i++) { const t = i / m, s = i === 0 || i === m ? 0 : (i % 2 ? 1 : -1) * k.amplitude * (0.6 + 0.6 * r()); pts.push([L * t + (i && i < m ? (r() - 0.5) * L / m * 0.4 : 0), s, (r() - 0.5) * k.amplitude * 0.3]); }
      return [pts]; }
    case "raio": {
      const div = (p, q, d, nv) => { if (!nv) return [p, q]; const m = p.map((v, i) => (v + q[i]) / 2), l = Math.hypot(...vSub(q, p)), o = [0, (r() - 0.5) * 2 * d * l, (r() - 0.5) * 2 * d * l * 0.6], mm = vAdd(m, o); return div(p, mm, d, nv - 1).slice(0, -1).concat(div(mm, q, d, nv - 1)); };
      const tronco = div([0, 0, 0], [L, (r() - 0.5) * L * 0.2, 0], k.desvio, 6), out = [tronco];
      for (let i = 0; i < k.ramos; i++) { const j = Math.floor((0.12 + 0.7 * r()) * (tronco.length - 1)), s = tronco[j], l = L * (0.18 + 0.3 * r()), ang = (r() < 0.5 ? -1 : 1) * (0.35 + 0.6 * r());
        out.push(div(s, vAdd(s, [l * Math.cos(ang), l * Math.sin(ang), (r() - 0.5) * l * 0.5]), k.desvio * 1.15, 4)); }
      return out; }
    case "s": return [amostra(t => [L * t, k.amplitude * Math.sin(2 * Math.PI * t), k.amplitude * 0.35 * Math.sin(Math.PI * t)])];
    case "laco": return [amostra(t => { const tau = 2 * Math.PI * t + Math.PI / 2, d = 1 + Math.sin(tau) ** 2; return [L / 2 + L / 2 * Math.cos(tau) / d, k.amplitude * Math.sin(tau) * Math.cos(tau) / d, k.amplitude * 0.45 * Math.sin(tau)]; })];
    case "circulo": return [amostra(t => { const th = 2 * Math.PI * t + f0; return [L, R0 * Math.cos(th), R0 * Math.sin(th)]; })];
    case "pontos": { const P = k.pontos, out = []; /* Catmull-Rom em 3D: a curva passa pelos pontos */
      for (let i = 0; i < P.length - 1; i++) { const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(P.length - 1, i + 2)];
        for (let s = 0; s < 8; s++) { const t = s / 8, t2 = t * t, t3 = t2 * t; out.push([0, 1, 2].map(q => 0.5 * (2 * b[q] + (-a[q] + c[q]) * t + (2 * a[q] - 5 * b[q] + 4 * c[q] - d[q]) * t2 + (-a[q] + 3 * b[q] - 3 * c[q] + d[q]) * t3))); } }
      out.push(P[P.length - 1]); return [out]; }
  }
  return [amostra(t => [L * t, 0, 0])];
}
/* ponto e tangente no caminho em t (por comprimento de arco aproximado pelo índice) */
function noCaminho(pts, t) { const x = Math.max(0, Math.min(1, t)) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(x)), f = x - i, a = pts[i], b = pts[i + 1]; return { p: a.map((v, q) => v + (b[q] - v) * f), d: vNorm(vSub(b, a)) }; }

/* ---------- cópias (repetir) ---------- */
function copias(rep, r) {
  const n = rep.n, out = [], md = rep.modo;
  if (md === "nenhum" || DISTRIBUIDAS.has(rep._forma)) return [{ f: p => p, k: 1, i: 0 }];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1), j = () => (r() - 0.5) * 2 * rep.espalhar;
    if (md === "leque") { const al = (u - 0.5) * rep.abertura + j() * rep.abertura * 0.15, be = j() * rep.abertura * 0.5; out.push({ f: p => girarLocal(girarLocal(p, 2, al), 1, be), k: 1 + j() * 0.3, i }); }
    else if (md === "anel") { const g = 360 * i / n + rep.girar; out.push({ f: p => girarLocal(vAdd(p, [0, rep.raio, 0]), 0, g), k: 1 + j() * 0.3, i }); }
    else if (md === "aoLongo") { const s = 1 + (rep.escalaFim - 1) * u; out.push({ f: p => vAdd(vMul(p, s), [rep.passo * i, 0, 0]), k: s, i }); }
    else if (md === "paralelo") { const a = r() * 2 * Math.PI, d = Math.sqrt(r()) * rep.raio, off = [j() * 3, d * Math.cos(a), d * Math.sin(a)]; out.push({ f: p => vAdd(p, off), k: 0.7 + 0.5 * r(), i }); }
    else if (md === "aleatorio") { const g1 = j() * 180, g2 = j() * 180, off = [r() * rep.raio, (r() - 0.5) * 2 * rep.raio, (r() - 0.5) * 2 * rep.raio]; out.push({ f: p => vAdd(girarLocal(girarLocal(p, 0, g1), 2, g2), off), k: 0.6 + 0.6 * r(), i }); }
    else if (md === "fases") { const g = rep.girar ? rep.girar * i : 360 * i / n; out.push({ f: p => rep.girar ? girarLocal(p, 1, g) : girarLocal(p, 0, g), k: 1, i }); }
  }
  return out;
}
const DISTRIBUIDAS = new Set(["aneis", "particulas", "gotas", "estrelas", "bolhas", "espinhos", "degraus", "esfera", "cupula", "chamas"]);

/* ---------- perfis de espessura ---------- */
function perfilDe(tr) {
  if (tr.perfil === "lista" && tr.larguras) { const L = tr.larguras; return t => { const x = t * (L.length - 1), i = Math.min(L.length - 2, Math.floor(x)); return L[i] + (L[i + 1] - L[i]) * (x - i); }; }
  if (tr.perfil === "base") return t => Math.min(1, t / 0.04) * Math.pow(1 - t, 0.75) + 0.02;
  if (tr.perfil === "onda") return t => (0.55 + 0.45 * Math.sin(6 * Math.PI * t)) * Math.min(1, t / 0.05, (1 - t) / 0.05);
  return PERFIS[tr.perfil] || PERFIS.pincel;
}

/* ---------- cores e estilos ---------- */
function paleta(fx, cor) {
  const C = fx.cores, claro = C[0], escuro = C[C.length - 1];
  const medio = typeof cor === "string" ? cor : corEm(C, 0.15 + 0.7 * cor);
  return { claro: fx.ink ? PAPEL : misturar(claro, medio, 0.3), medio: fx.ink ? (cor > 0.6 ? "#7A7A7A" : "#C9C9C9") : medio, escuro: fx.ink ? INK : misturar(escuro, "#120A20", 0.35), branco: PAPEL };
}
/* fita na tela: centro, larguras e lado → polígono */
function fitaTela(pts, larg, deslocar = 0, agudo = false) {
  const n = pts.length; if (n < 2) return "";
  const esq = [], dir = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const h = Math.max(0, larg[i]) / 2, o = deslocar * larg[i];
    esq.push([pts[i][0] - ty * (h - o), pts[i][1] + tx * (h - o)]); dir.push([pts[i][0] + ty * (h + o), pts[i][1] - tx * (h + o)]);
  }
  return agudo ? caminho(esq.concat(dir.reverse()), true) : suave(esq.concat(dir.reverse()), true);
}
/* pinta uma fita no estilo pedido */
function pintarFita(fx, pts, larg, estilo, P, extra = "", agudo = false) {
  const media = larg.reduce((s, v) => s + v, 0) / Math.max(1, larg.length), sw = Math.max(0.7, Math.min(2.6, 0.1 * media + 0.6)), d = fitaTela(pts, larg, 0, agudo);
  if (!d) return "";
  switch (estilo) {
    case "linha": return forma(d, PAPEL, { stroke: INK, sw: Math.max(0.6, sw * 0.75) }) + extra;
    case "chapado": return forma(d, P.medio, { stroke: P.escuro, sw }) + extra;
    case "nanquim": return forma(d, INK) + forma(fitaTela(pts, larg.map(v => v * 0.16), -0.18), PAPEL, { op: 0.9 }) + extra;
    case "brilho": return (fx.ink ? "" : forma(fitaTela(pts, larg.map(v => v * 1.7)), P.medio, { op: 0.5, filtro: fx.filtro })) + forma(d, P.claro, { stroke: fx.ink ? INK : P.medio, sw: sw * 0.7 }) + forma(fitaTela(pts, larg.map(v => v * 0.42)), PAPEL) + extra;
    case "cel": return forma(d, P.medio) + forma(fitaTela(pts, larg.map(v => v * 0.55), 0.28), fx.ink ? "#8E8E8E" : misturar(P.medio, P.escuro, 0.45)) + forma(fitaTela(pts, larg.map(v => v * 0.2), -0.22), P.branco, { op: 0.85 }) + forma(d, "none", { stroke: P.escuro, sw }) + extra;
    default: /* contorno */ return forma(d, P.claro, { stroke: INK === P.escuro || fx.ink ? INK : P.escuro, sw }) + forma(fitaTela(pts, larg.map(v => v * 0.12), 0.2), P.medio, { op: 0.8 }) + extra;
  }
}
function pintarForma(fx, d, estilo, P) {
  if (!d) return "";
  switch (estilo) {
    case "linha": return forma(d, PAPEL, { stroke: INK, sw: 0.9 });
    case "chapado": case "cel": return forma(d, P.medio, { stroke: P.escuro, sw: 1 });
    case "nanquim": return forma(d, INK);
    case "brilho": return (fx.ink ? "" : forma(d, P.medio, { op: 0.5, filtro: fx.filtro })) + forma(d, P.claro, { stroke: fx.ink ? INK : P.medio, sw: 0.8 });
    default: return forma(d, P.claro, { stroke: INK, sw: 1 });
  }
}

/* ---------- uma camada → pedaços {atras, frente, meio, chao} ---------- */
function desenharCamada(fx, c, ctx) {
  const out = { atras: "", frente: "", meio: "" }, r = rng(c.semente + fx.e.semente * 31), est = c.estilo || ctx.estilo, P = paleta(fx, c.cor);
  const Ref = referencial(fx, c.caminho.plano), S = ctx.S * c.tamanho, O = vAdd(fx.A.mundo, [0, 1, 2].reduce((acc, q) => vAdd(acc, vMul([Ref.a, Ref.b, Ref.c][q], c.deslocar[q] * ctx.S)), [0, 0, 0]));
  const paraMundo = p => { let q = p; if (c.girar[0]) q = girarLocal(q, 0, c.girar[0]); if (c.girar[1]) q = girarLocal(q, 1, c.girar[1]); if (c.girar[2]) q = girarLocal(q, 2, c.girar[2]); return vAdd(O, vAdd(vAdd(vMul(Ref.a, q[0] * S), vMul(Ref.b, q[1] * S)), vMul(Ref.c, q[2] * S))); };
  const proj = w => fx.proj(w), zc = ctx.zc, lado = z => zc === null ? "meio" : z < zc ? "atras" : "frente";
  const tFim = c.inicio + (c.fim - c.inicio) * Math.max(0.02, fx.t), op = c.opacidade * (fx.ink ? 1 : 1);
  const rep = { ...c.repetir, _forma: c.forma };
  const caminhos = caminhosDe(c.caminho, r);
  const empurra = (onde, s) => { if (s) out[onde] += op < 0.999 ? '<g opacity="' + op.toFixed(3) + '">' + s + "</g>" : s; };
  const perfil = perfilDe(c.traco);

  if (c.forma === "fita") {
    for (const cp of copias(rep, r)) caminhos.forEach((pts0, ci) => {
      const pts = pts0.filter((_, i) => i / (pts0.length - 1) <= tFim + 1e-9), m = pts.length; if (m < 2) return;
      const W = pts.map(p => proj(paraMundo(cp.f(p)))), larg = W.map((q, i) => { const t = i / (pts0.length - 1); return Math.max(0.2, c.traco.largura * S * cp.k * (ci ? 0.55 : 1) * perfil(t) * (1 + c.traco.variacao * 0.6 * Math.sin(t * 17 + c.semente)) * (q[3] || 1)); });
      /* corta em trechos atrás/na frente do corpo (anéis e hélices passam por trás) */
      let ini = 0;
      for (let i = 1; i <= m; i++) {
        if (i === m || lado(W[i][2]) !== lado(W[ini][2])) { const seg = W.slice(ini, Math.min(m, i + 1)), lg = larg.slice(ini, Math.min(m, i + 1));
          let ext = "";
          if (i === m && c.traco.ponta !== "nenhuma" && tFim >= c.fim - 1e-6) ext = pontaFita(fx, seg, lg, c.traco.ponta, est, P);
          if (seg.length >= 2) empurra(lado(W[ini][2]), pintarFita(fx, seg.map(q => [q[0], q[1]]), lg, est, P, ext, c.caminho.tipo === "zigue")); ini = i; }
      }
    });
    return out;
  }
  /* formas distribuídas ao longo do caminho (ou num anel, num leque, no volume) */
  const n = Math.max(1, Math.round(c.repetir.n * (fx.dens || 1))), pts0 = caminhos[0];
  const lugares = [];
  for (let i = 0; i < n; i++) {
    const t = c.forma === "aneis" || c.forma === "degraus" ? (n === 1 ? 1 : i / (n - 1)) : r();
    if (t > tFim + 1e-9) continue;
    let { p, d } = noCaminho(pts0, c.inicio + (c.fim - c.inicio) * (c.forma === "aneis" || c.forma === "degraus" ? t : t));
    const j = c.repetir.espalhar;
    if (c.repetir.modo === "anel") { const g = 2 * Math.PI * i / n + r() * j, R = c.repetir.raio * (0.6 + 0.6 * r()); p = vAdd(p, [0, R * Math.cos(g), R * Math.sin(g)]); d = vNorm([0.2, Math.cos(g), Math.sin(g)]); }
    else if (c.repetir.modo === "leque") { const al = (r() - 0.5) * c.repetir.abertura, L = c.caminho.comprimento * (0.3 + 0.7 * r()); p = girarLocal([L, 0, 0], 2, al); p = girarLocal(p, 1, (r() - 0.5) * c.repetir.abertura * 0.5); d = vNorm(p); }
    else if (c.repetir.modo === "aleatorio") p = vAdd(p, [(r() - 0.5) * c.repetir.raio, (r() - 0.5) * c.repetir.raio, (r() - 0.5) * c.repetir.raio]);
    else if (j > 0 && c.forma !== "aneis" && c.forma !== "degraus") { const esc = (c.caminho.raio || 1) * 0.5 + c.caminho.comprimento * 0.08; p = vAdd(p, [(r() - 0.5) * j * esc, (r() - 0.5) * 2 * j * esc, (r() - 0.5) * 2 * j * esc]); }
    lugares.push({ t, p, d, i });
  }
  const Pt = p => proj(paraMundo(p)), escPx = q => S * (q[3] || 1);
  for (const L of lugares) {
    const q = Pt(L.p), onde = lado(q[2]), k = escPx(q);
    switch (c.forma) {
      case "aneis": { /* anel em volta do caminho, no plano perpendicular a ele */
        const R = (c.caminho.raio + ((c.caminho.raioFim ?? c.caminho.raio) - c.caminho.raio) * L.t), e1 = Math.abs(L.d[1]) < 0.9 ? vNorm(vCross(L.d, [0, 1, 0])) : vNorm(vCross(L.d, [0, 0, 1])), e2 = vCross(L.d, e1);
        const anel = []; for (let s = 0; s <= 40; s++) { const a = s / 40 * 2 * Math.PI; anel.push(Pt(vAdd(L.p, vAdd(vMul(e1, R * Math.cos(a)), vMul(e2, R * Math.sin(a)))))); }
        const lg = anel.map(w => Math.max(0.3, c.traco.largura * S * (w[3] || 1) * (0.75 + 0.25 * Math.sin(anel.indexOf(w) / 40 * 2 * Math.PI * 2 + L.i))));
        let ini = 0;
        for (let s = 1; s <= anel.length; s++) if (s === anel.length || lado(anel[s][2]) !== lado(anel[ini][2])) { const seg = anel.slice(ini, Math.min(anel.length, s + 1)); if (seg.length >= 2) empurra(lado(anel[ini][2]), pintarFita(fx, seg.map(w => [w[0], w[1]]), lg.slice(ini, Math.min(anel.length, s + 1)), est, P)); ini = s; }
        break; }
      case "particulas": case "gotas": case "estrelas": case "bolhas": {
        const tipo = c.forma === "gotas" ? "gota" : c.forma === "estrelas" ? "faisca" : c.forma === "bolhas" ? "bolha" : c.particula || "ponto";
        const tam = k * 0.22 * (0.5 + r()), t2 = Pt(vAdd(L.p, vMul(L.d, 0.5))), ang = Math.atan2(t2[1] - q[1], t2[0] - q[0]);
        empurra(onde, particula(fx, tipo, q[0], q[1], tam, ang, r, c.forma === "gotas" && est === "nanquim" ? "nanquim" : c.estilo || (tipo === "gota" || tipo === "ponto" ? "chapado" : est), P));
        break; }
      case "espinhos": { /* cristal saindo da superfície: no chão para cima, no caminho para os lados */
        const up = c.caminho.plano === "chao" ? [1, 0, 0] : vNorm([0, r() < 0.5 ? 1 : -1, (r() - 0.5)]), comp = (0.8 + 0.8 * r()) * (c.caminho.plano === "chao" ? 0.6 + 0.8 * L.t : 1), topo = Pt(vAdd(L.p, vMul(up, comp * 2.2)));
        const ux = topo[0] - q[0], uy = topo[1] - q[1], l = Math.hypot(ux, uy) || 1, larg = l * 0.38;
        const dd = cristal(q[0], q[1], ux / l, uy / l, l, larg);
        let s = pintarForma(fx, dd, est, P);
        if (est === "cel" || est === "chapado") s += forma(caminho([[q[0], q[1]], [q[0] + ux * 0.32 - uy / l * larg / 2, q[1] + uy * 0.32 + ux / l * larg / 2], [topo[0], topo[1]]], true), fx.ink ? "#8E8E8E" : misturar(P.medio, P.escuro, 0.45), { op: 0.9 });
        empurra(onde, s); break; }
      case "degraus": { /* travessas entre duas hélices opostas (DNA) */
        const th = 2 * Math.PI * c.caminho.voltas * L.t + c.caminho.inicioAng * D2R, R = c.caminho.raio, a = c.caminho.comprimento * L.t;
        const p1 = Pt([a, R * Math.cos(th), R * Math.sin(th)]), p2 = Pt([a, -R * Math.cos(th), -R * Math.sin(th)]);
        empurra(lado((p1[2] + p2[2]) / 2), pintarFita(fx, [[p1[0], p1[1]], [p2[0], p2[1]]], [c.traco.largura * k, c.traco.largura * k], est, P)); break; }
      case "chamas": { const L0 = k * (1.4 + r()), up = Pt(vAdd(L.p, [0, 0, 0].map((_, i) => Ref.a[i] === undefined ? 0 : 0))), dirUp = fx.proj(vAdd(paraMundo(L.p), [0, 1, 0]));
        const ang = Math.atan2(dirUp[1] - q[1], dirUp[0] - q[0]) + (r() - 0.5) * 0.4; void up;
        let s = pintarForma(fx, labareda(q[0], q[1], ang, L0 * 2.2, L0 * 0.9, r), est, P);
        if (est === "nanquim") s += forma(labareda(q[0], q[1], ang, L0 * 1.2, L0 * 0.35, r), PAPEL, { op: 0.9 });
        empurra(onde, s); break; }
      case "cupula": case "esfera": {
        if (L.i > 0) break; /* desenha uma vez, com n arcos */
        const R = c.caminho.raio, C0 = [c.caminho.comprimento, 0, 0], arcos = Math.max(3, c.repetir.n), cheia = c.forma === "esfera", thMax = cheia ? Math.PI : Math.PI / 2;
        const pt3 = (th, ph) => vAdd(C0, [R * Math.cos(th), R * Math.sin(th) * Math.cos(ph), R * Math.sin(th) * Math.sin(ph)]);
        const linha = pts => { const W = pts.map(Pt), lg = W.map((w, i) => Math.max(0.3, c.traco.largura * S * (w[3] || 1) * perfil(i / (W.length - 1)))); let ini = 0;
          for (let s = 1; s <= W.length; s++) if (s === W.length || lado(W[s][2]) !== lado(W[ini][2])) { const seg = W.slice(ini, Math.min(W.length, s + 1)); if (seg.length >= 2) empurra(lado(W[ini][2]), pintarFita(fx, seg.map(w => [w[0], w[1]]), lg.slice(ini, Math.min(W.length, s + 1)), est, P)); ini = s; } };
        for (let a = 0; a < arcos; a++) { const ph = a / arcos * Math.PI * (cheia ? 1 : 2), pts = []; for (let s = 0; s <= 30; s++) pts.push(pt3((cheia ? -Math.PI / 2 : 0) + thMax * s / 30 + (cheia ? Math.PI / 2 : 0), ph)); linha(pts); }
        for (const th of cheia ? [0.5, 1.0, 1.57, 2.1, 2.6] : [0.5, 1.0, 1.4]) { const pts = []; for (let s = 0; s <= 40; s++) pts.push(pt3(th, s / 40 * 2 * Math.PI)); linha(pts); }
        break; }
    }
  }
  if (c.forma === "circuloMagico") {
    const R = c.caminho.raio, C0 = c.caminho.plano === "chao" ? [0.05, 0, 0] : [c.caminho.comprimento, 0, 0];
    const plano = (rr, th) => c.caminho.plano === "chao" ? vAdd(C0, [0, rr * Math.cos(th), rr * Math.sin(th)]) : vAdd(C0, [0, rr * Math.cos(th), rr * Math.sin(th)]);
    const traco = (pts, w) => { const W = pts.map(Pt), lg = W.map(q2 => Math.max(0.35, w * S * (q2[3] || 1))); empurra(c.caminho.plano === "chao" ? "chao" : lado(W[0][2]), pintarFita(fx, W.map(q2 => [q2[0], q2[1]]), lg, est, P)); };
    const aro = (rr, w) => { const pts = []; for (let s = 0; s <= 64; s++) pts.push(plano(rr, s / 64 * 2 * Math.PI)); traco(pts, w); };
    aro(R, 0.16); aro(R * 0.9, 0.08); aro(R * 0.62, 0.1);
    /* pentagrama {5/2} */
    const v5 = [0, 1, 2, 3, 4].map(i => plano(R * 0.62, -Math.PI / 2 + i * 2 * Math.PI / 5));
    for (let i = 0; i < 5; i++) traco([v5[i], v5[(i + 2) % 5]], 0.07);
    /* runas entre os aros: pequenos traços com a semente */
    const nR = c.texto ? c.texto.length * 2 : 18;
    for (let i = 0; i < nR; i++) { const th = i / nR * 2 * Math.PI, rr = R * 0.95 - R * 0.1 * 0.5, g = rng(c.semente + i * 13);
      const pts = [plano(rr - R * 0.03, th), plano(rr + R * 0.03 * (g() - 0.5) * 2, th + 0.06 * (g() - 0.5)), plano(rr + R * 0.03, th + 0.05)]; traco(pts, 0.05); }
    if (out.chao) { out.chao = out.chao; }
  }
  if (c.forma === "nuvem" || c.forma === "estouro") {
    const { p } = noCaminho(pts0, Math.min(tFim, c.inicio)), q = Pt(p), k = escPx(q);
    const lista = c.forma === "estouro" && c.repetir.modo !== "nenhum" ? copias(rep, r).map(cp => Pt(cp.f(p))) : [q];
    for (const qq of lista) {
      if (c.forma === "estouro") { const R1 = k * 1.0 * (0.7 + 0.5 * r()), d1 = estrela(qq[0], qq[1], R1, R1 * 0.45, 14, r() * 6, r, 0.3), d2 = estrela(qq[0], qq[1], R1 * 0.55, R1 * 0.28, 10, r() * 6, r, 0.3);
        empurra(lado(qq[2]), pintarForma(fx, d1, est, P) + forma(d2, est === "nanquim" ? PAPEL : P.claro, { op: 0.95 })); }
      else { const circs = []; for (let i = 0; i < 8; i++) { const a = r() * 6.28, dd = k * 0.9 * r(); circs.push([qq[0] + Math.cos(a) * dd, qq[1] + Math.sin(a) * dd * 0.7, k * (0.45 + 0.4 * r())]); }
        let a = "", b = "", cachos = ""; const sw = Math.max(1, k * 0.06);
        circs.forEach(([x, y, rr]) => { a += circulo(x, y, rr + sw / 2); b += circulo(x, y, rr); if (r() < 0.6) { const pts = []; for (let s = 0; s <= 8; s++) { const g = 3.4 + 1.2 * s / 8; pts.push([x + Math.cos(g) * rr * 0.65, y + Math.sin(g) * rr * 0.65]); } cachos += suave(pts, false); } });
        const fundo = est === "nanquim" ? INK : P.claro, linha = est === "nanquim" ? PAPEL : INK;
        empurra(lado(qq[2]), forma(a, est === "nanquim" ? INK : P.escuro) + forma(b, fundo) + forma(cachos, "none", { stroke: linha, sw: sw * 0.6, op: 0.9 })); }
    }
  }
  return out;
}
/* ponta da fita: seta, bola ou gota */
function pontaFita(fx, seg, lg, tipo, est, P) {
  const m = seg.length, a = seg[Math.max(0, m - 3)], b = seg[m - 1], ux = b[0] - a[0], uy = b[1] - a[1], l = Math.hypot(ux, uy) || 1, w = Math.max(lg[Math.max(0, m - 6)], 2) * 2.4;
  const x = ux / l, y = uy / l, nx = -y, ny = x;
  if (tipo === "seta") return pintarForma(fx, caminho([[b[0] + nx * w / 2, b[1] + ny * w / 2], [b[0] + x * w * 1.3, b[1] + y * w * 1.3], [b[0] - nx * w / 2, b[1] - ny * w / 2], [b[0] + x * w * 0.25, b[1] + y * w * 0.25]], true), est === "linha" ? "linha" : est === "nanquim" ? "nanquim" : "chapado", P);
  if (tipo === "bola") return pintarForma(fx, circulo(b[0], b[1], w * 0.45), est, P);
  return pintarForma(fx, labareda(b[0], b[1], Math.atan2(y, x), w * 1.2, w * 0.7, null), est, P);
}
/* partícula na tela */
function particula(fx, tipo, x, y, r0, ang, r, est, P) {
  switch (tipo) {
    case "gota": { const L = r0 * 3, ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux, pts = [];
      for (let i = 0; i <= 10; i++) { const a = Math.PI * i / 10; pts.push([x - ux * r0 * Math.sin(a) + nx * r0 * Math.cos(a), y - uy * r0 * Math.sin(a) + ny * r0 * Math.cos(a)]); }
      pts.push([x + ux * L, y + uy * L]); return pintarForma(fx, suave(pts, true), est, P); }
    case "faisca": return forma(faisca(x, y, r0 * 2.2, r() * 0.8), est === "nanquim" || fx.ink ? INK : P.medio, fx.ink ? {} : { stroke: P.escuro, sw: 0.5 });
    case "estrela": return pintarForma(fx, estrela(x, y, r0 * 2, r0 * 0.8, 5, -Math.PI / 2, null), est, P);
    case "bolha": return forma(circulo(x, y, r0 * 2.2), fx.ink ? PAPEL : P.claro, { stroke: fx.ink ? INK : P.escuro, sw: 0.9, op: 0.85 }) + forma(circulo(x - r0 * 0.8, y - r0 * 0.8, r0 * 0.5), PAPEL);
    case "lasca": return pintarForma(fx, lasca(x, y, r0 * 2, r), est === "brilho" ? "chapado" : est, P);
    case "seta": { const ux = Math.cos(ang), uy = Math.sin(ang); return pintarForma(fx, caminho([[x - uy * r0, y + ux * r0], [x + ux * r0 * 2.5, y + uy * r0 * 2.5], [x + uy * r0, y - ux * r0]], true), est, P); }
    default: return pintarForma(fx, circulo(x, y, r0), est, P);
  }
}

/* ---------- todas as camadas ---------- */
function desenharCamadas(fx, camadas, ctx0 = {}) {
  const est = fx.e.estilo && fx.e.estilo !== "auto" ? fx.e.estilo : fx.ink ? "contorno" : "cel";
  const S = fx.e.escala * (fx.kd || 1) * (fx.plano ? 10 : 1) * (fx.P && fx.P.tamanho ? fx.P.tamanho : 1);
  const ctx = { estilo: est, S, zc: ctx0.zc === undefined ? null : ctx0.zc };
  const out = { atras: "", frente: "", meio: "", chao: "" };
  const qtd = fx.P && fx.P.quantidade ? fx.P.quantidade : 1, esp = fx.P && fx.P.espessura ? fx.P.espessura : 1;
  camadas.forEach(c0 => {
    const c = { ...c0, repetir: { ...c0.repetir, n: Math.max(1, Math.round(c0.repetir.n * qtd)) }, traco: { ...c0.traco, largura: c0.traco.largura * esp } };
    const r = desenharCamada(fx, c, ctx);
    for (const k of Object.keys(r)) out[k] = (out[k] || "") + r[k];
  });
  if (ctx.zc === null && (out.atras || out.frente)) { out.meio += out.atras + out.frente; out.atras = out.frente = ""; }
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}
export { desenharCamadas, caminhosDe, referencial };
void f1;
