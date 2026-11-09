/* GeoMannequin — blocking: vista de cima (planta X/Z) e vista lateral (perfil), desenhadas a partir do MESMO estado da cena.
   Nada aqui guarda posição: tudo vem dos parâmetros dos manequins (wx, wz, wRot, wy + pose) e da câmera (tx/ty/tz, yaw,
   pitch, camDist, lens, persp, panX/panY), com as mesmas contas do desenho — a câmera é a mesma makeXf, o tamanho na foto é
   o mesmo telaDoMundo. Profundidade = distância ao longo do eixo da câmera: é ela que, com perspectiva, decide a escala
   de cada manequim na foto (sem perspectiva, a escala não muda com a distância). Unidade: R (1 R ≈ 11,4 cm; 1 m ≈ 8,77 R). */
import { CX, CY, D, H, W, clamp, f1 } from "./matematica.js";
import { makeXf } from "./camera.js";
import { effScale } from "./projecao.js";

const M_R = 1 / 0.114;
/* câmera da cena no mundo: posição, eixos, raios dos cantos da foto (inclui o deslocamento panX/panY) */
function cameraNoMundo(p) {
  const cam = makeXf(Object.assign({}, p, { wRot: 0 })), ex = cam([1, 0, 0]), ey = cam([0, 1, 0]), ez = cam([0, 0, 1]);
  /* R tem colunas cam(eᵢ); o inverso (câmera → mundo) é a transposta */
  const paraMundo = q => [q[0] * ex[0] + q[1] * ex[1] + q[2] * ex[2], q[0] * ey[0] + q[1] * ey[1] + q[2] * ey[2], q[0] * ez[0] + q[1] * ez[1] + q[2] * ez[2]];
  const t = [p.tx || 0, p.ty || 0, p.tz || 0], d = Math.max(3, p.camDist || 30), S = effScale(p), persp = !!p.persp;
  const off = paraMundo([0, 0, d]), pos = [t[0] + off[0], t[1] + off[1], t[2] + off[2]];
  const frente = paraMundo([0, 0, -1]), cima = paraMundo([0, 1, 0]), dir = paraMundo([1, 0, 0]);
  /* raio que sai da câmera por um ponto da foto: com perspectiva, origem na câmera; sem, raios paralelos */
  const raio = (sx, sy) => {
    const a = (sx - CX) / S - (p.panX || 0), b = (CY - sy) / S - (p.panY || 0);
    if (persp) { const v = paraMundo([a / d, b / d, -1]); return { o: pos, v }; }
    const o = paraMundo([a, b, d]); return { o: [t[0] + o[0], t[1] + o[1], t[2] + o[2]], v: frente };
  };
  /* escala na foto (px por R) de um ponto do mundo e a profundidade dele (ao longo do eixo da câmera) */
  const tela = w => {
    const q = cam([w[0] - t[0], w[1] - t[1], w[2] - t[2]]), prof = d - q[2], k = persp ? d / Math.max(0.2 * d, prof) : 1;
    return { x: CX + S * (q[0] * k + (p.panX || 0)), y: CY - S * (q[1] * k + (p.panY || 0)), prof, escala: S * k, atras: persp && prof < 0.15 * d };
  };
  return { pos, alvo: t, frente, cima, dir, d, S, persp, lente: p.lens || 50, raio, tela,
    cantos: [raio(0, 0), raio(W, 0), raio(W, H), raio(0, H)], fovH: 2 * Math.atan(18 / (p.lens || 50)) / D };
}
/* tamanho de cada manequim na foto: altura do contorno (cápsulas projetadas) dividida pela altura da foto */
function tamanhoNaFoto(C, caps) {
  let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9, atras = false, prof = 0, n = 0;
  caps.forEach(c => [c.a, c.b].forEach(w => { const s = C.tela(w), r = c.r * s.escala; if (s.atras) atras = true; prof += s.prof; n++;
    y0 = Math.min(y0, s.y - r); y1 = Math.max(y1, s.y + r); x0 = Math.min(x0, s.x - r); x1 = Math.max(x1, s.x + r); }));
  const dentro = !atras && x1 > 0 && x0 < W && y1 > 0 && y0 < H, inteiro = !atras && x0 >= 0 && x1 <= W && y0 >= 0 && y1 <= H;
  return { frac: atras ? 0 : (y1 - y0) / H, dentro, inteiro, prof: prof / Math.max(1, n), atras };
}

/* ===== desenho ===== */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/* vista: {cx, cy, s (px por R), w, h}; m: mundo → tela da vista */
function cabecalho(v, extra) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + v.w + " " + v.h + '" class="blk-svg"' + (extra || "") + ">"; }
/* cápsulas como traço grosso: contorno escuro por baixo, cor do manequim por cima — dá a silhueta da pose naquela vista */
function silhueta(caps, proj, s, cor, id, op) {
  let a = "", b = "";
  caps.forEach(c => { const p = proj(c.a), q = proj(c.b), w = Math.max(1.2, 2 * c.r * s);
    const d = "M" + f1(p[0]) + " " + f1(p[1]) + "L" + f1(q[0] + 0.01) + " " + f1(q[1]);
    a += '<path d="' + d + '" style="stroke-width:' + f1(w + 2.2) + '"/>'; b += '<path d="' + d + '" style="stroke-width:' + f1(w) + '"/>'; });
  return '<g data-k="m:' + id + '" class="blk-man" style="opacity:' + (op || 1) + '"><g style="fill:none;stroke:' + cor.ink + ';stroke-linecap:round;stroke-linejoin:round">' + a +
    '</g><g style="fill:none;stroke:' + cor.fill + ';stroke-linecap:round;stroke-linejoin:round">' + b + "</g></g>";
}
function grade(v, mapa, passoR, eixo) {
  /* grade de 1 m e régua */
  const o = [], pm = M_R, x0 = v.cx - v.w / 2 / v.s, x1 = v.cx + v.w / 2 / v.s, y0 = v.cy - v.h / 2 / v.s, y1 = v.cy + v.h / 2 / v.s;
  let d = "";
  for (let x = Math.ceil(x0 / pm) * pm; x <= x1; x += pm) { const p = mapa([x, y0]), q = mapa([x, y1]); d += "M" + f1(p[0]) + " " + f1(p[1]) + "L" + f1(q[0]) + " " + f1(q[1]); }
  if (eixo !== "perfil") for (let y = Math.ceil(y0 / pm) * pm; y <= y1; y += pm) { const p = mapa([x0, y]), q = mapa([x1, y]); d += "M" + f1(p[0]) + " " + f1(p[1]) + "L" + f1(q[0]) + " " + f1(q[1]); }
  o.push('<path d="' + d + '" class="blk-grade"/>');
  return o.join("");
}

/* faixa da lente: grande-angular (até 35 mm), normal (35–70), tele (acima de 70) — muda a cor do cone */
function faixaLente(mm) { return mm < 35 ? "grande-angular" : mm <= 70 ? "normal" : "tele"; }
function classeLente(C) { return C.persp ? "lente-" + { "grande-angular": "grande", normal: "normal", tele: "tele" }[faixaLente(C.lente)] : "lente-orto"; }
/* onde um raio da câmera toca o chão (ou, se não toca, um ponto longe na direção dele, na altura do chão) */
function tocaChao(r, g0, L) {
  if (r.v[1] < -1e-6) { const t = (g0 - r.o[1]) / r.v[1], h = Math.hypot(r.v[0], r.v[2]) * t;
    if (h <= L) return [r.o[0] + r.v[0] * t, g0, r.o[2] + r.v[2] * t]; }
  const h = Math.hypot(r.v[0], r.v[2]) || 1; return [r.o[0] + r.v[0] / h * L, g0, r.o[2] + r.v[2] / h * L];
}
/* pegada da foto no chão, na ordem: alto-esq., alto-dir., baixo-dir., baixo-esq. */
function pegadaNoChao(C, g0, L) { return C.cantos.map(r => tocaChao(r, g0, L)); }
/* distância no chão (ao longo da mira) em que uma pessoa em pé ocupa a fração f da altura da foto — pela profundidade
   real (distância ao longo do eixo da câmera, que com a câmera inclinada não é a distância no chão) */
function distEscala(C, g0, alt, f) {
  const prof = alt * C.S * C.d / (f * H), hl = Math.hypot(C.frente[0], C.frente[2]); if (hl < 0.05) return null;
  const s = (prof - (g0 + alt / 2 - C.pos[1]) * C.frente[1]) / hl; return s > 0 ? s : null;
}
/* reta (ponto a, direção n) cortada por um polígono convexo no plano: os dois pontos de entrada e saída */
function cortaPoligono(poly, a, n) {
  let t0 = 1e9, t1 = -1e9;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], e = [q[0] - p[0], q[1] - p[1]], den = n[0] * e[1] - n[1] * e[0]; if (Math.abs(den) < 1e-9) continue;
    const w = [p[0] - a[0], p[1] - a[1]], t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * n[1] - w[1] * n[0]) / den;
    if (u >= -1e-6 && u <= 1 + 1e-6) { t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
  }
  return t1 > t0 ? [[a[0] + n[0] * t0, a[1] + n[1] * t0], [a[0] + n[0] * t1, a[1] + n[1] * t1]] : null;
}
/* ----- vista de cima: x para a direita, z para baixo (o lado da câmera padrão fica embaixo) ----- */
function svgPlanta(dados, v, opts) {
  opts = opts || {};
  const C = dados.camera, mp = w => [v.w / 2 + (w[0] - v.cx) * v.s, v.h / 2 + (w[1] - v.cy) * v.s], m3 = w => mp([w[0], w[2]]);
  const o = [cabecalho(v)];
  o.push(grade(v, mp));
  /* eixos do mundo (x vermelho, z azul, como no chão do palco) */
  { const a = mp([v.cx - 1e3, 0]), b = mp([v.cx + 1e3, 0]), c = mp([0, v.cy - 1e3]), e = mp([0, v.cy + 1e3]);
    o.push('<path d="M' + f1(a[0]) + " " + f1(a[1]) + "L" + f1(b[0]) + " " + f1(b[1]) + '" class="blk-eixo-x"/><path d="M' + f1(c[0]) + " " + f1(c[1]) + "L" + f1(e[0]) + " " + f1(e[1]) + '" class="blk-eixo-z"/>'); }
  /* campo de visão: o que a foto cobre no chão (os 4 raios dos cantos até tocarem o chão, ou até longe se passam do
     horizonte), as linhas da câmera até esses pontos e, no eixo da mira, as distâncias em que uma pessoa ocupa 100/50/25% */
  const L = Math.max(60, 3 * C.d), g0 = dados.chao, cls = classeLente(C);
  const hz = r => { const h = Math.hypot(r.v[0], r.v[2]) || 1; return [r.v[0] / h, r.v[2] / h]; };
  const fh = hz({ v: C.frente });
  { const pe = pegadaNoChao(C, g0, L), P4 = pe.map(q => m3(q)), c = m3(C.pos);
    o.push('<path d="M' + P4.map(q => f1(q[0]) + " " + f1(q[1])).join("L") + 'Z" class="blk-cone ' + cls + (C.persp ? "" : " orto") + '"/>');
    /* linhas da câmera aos 4 cantos (com perspectiva saem do olho; sem, são paralelas) */
    if (C.persp) o.push('<path d="' + P4.map(q => "M" + f1(c[0]) + " " + f1(c[1]) + "L" + f1(q[0]) + " " + f1(q[1])).join("") + '" class="blk-raio ' + cls + '"/>');
    /* bordas esquerda e direita (arrastáveis: funilam ou abrem a lente) */
    const ini = C.persp ? "M" + f1(c[0]) + " " + f1(c[1]) + "L" : "M";
    o.push('<path d="' + ini + f1(P4[3][0]) + " " + f1(P4[3][1]) + "L" + f1(P4[0][0]) + " " + f1(P4[0][1]) + '" class="blk-cone-borda ' + cls + '" data-k="cone:l"/>');
    o.push('<path d="' + ini + f1(P4[2][0]) + " " + f1(P4[2][1]) + "L" + f1(P4[1][0]) + " " + f1(P4[1][1]) + '" class="blk-cone-borda ' + cls + '" data-k="cone:r"/>');
    if (C.persp && dados.alturaPessoa) [1, 0.5, 0.25].forEach(f => {
      const s = distEscala(C, g0, dados.alturaPessoa, f); if (s === null || s > L) return;
      const pa = [C.pos[0] + fh[0] * s, C.pos[2] + fh[1] * s], n = [-fh[1], fh[0]], cut = cortaPoligono(pe.map(q => [q[0], q[2]]), pa, n); if (!cut) return;
      const a1 = mp(cut[0]), a2 = mp(cut[1]);
      o.push('<path d="M' + f1(a1[0]) + " " + f1(a1[1]) + "L" + f1(a2[0]) + " " + f1(a2[1]) + '" class="blk-escala"/><text x="' + f1(a2[0] + 4) + '" y="' + f1(a2[1]) + '" class="blk-txt blk-escala-txt">' + Math.round(f * 100) + "%</text>");
    });
  }
  /* objetos: cada um na sua cor; partes mais baixas primeiro (o tampo cobre as pernas); alças de girar e de tamanho no selecionado */
  [...(dados.objetos || [])].sort((a, b) => (a.base || 0) - (b.base || 0)).forEach(ob => {
    const cor = ob.cor || { fill: "#E4E4EB", ink: "#586577" }, st = ' style="fill:' + cor.fill + ";stroke:" + cor.ink + '"';
    let g = '<g data-k="o:' + ob.id + '" class="blk-obj-g' + (ob.sel ? " sel" : "") + '">';
    [...ob.caixas].sort((a, b) => (a.c[1] + a.h[1]) - (b.c[1] + b.h[1])).forEach(b => {
      if (b.cil) { const c = m3(b.c); g += '<circle cx="' + f1(c[0]) + '" cy="' + f1(c[1]) + '" r="' + f1(Math.max(1.5, b.r * v.s)) + '" class="blk-obj"' + st + "/>"; return; }
      const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => m3([b.c[0] + i * b.h[0] * b.e[0][0] + j * b.h[2] * b.e[2][0], 0, b.c[2] + i * b.h[0] * b.e[0][2] + j * b.h[2] * b.e[2][2]]));
      g += '<path d="M' + pts.map(q => f1(q[0]) + " " + f1(q[1])).join("L") + 'Z" class="blk-obj"' + st + "/>";
    });
    o.push(g + "</g>");
    const c = m3([ob.x, 0, ob.z]);
    if (ob.sel) {
      const r = (ob.giro || 0) * D, ex = [Math.cos(r), -Math.sin(r)], ez = [Math.sin(r), Math.cos(r)], hl = ob.larg / 2, hp = ob.prof / 2;
      const contorno = ob.forma === "cilindro" ? '<circle cx="' + f1(c[0]) + '" cy="' + f1(c[1]) + '" r="' + f1(ob.raio * v.s + 4) + '" class="blk-sel"/>'
        : '<path d="M' + [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => m3([ob.x + i * hl * ex[0] + j * hp * ez[0], 0, ob.z + i * hl * ex[1] + j * hp * ez[1]])).map(q => f1(q[0]) + " " + f1(q[1])).join("L") + 'Z" class="blk-sel"/>';
      const fr = m3([ob.x + ez[0] * (hp + 1.2), 0, ob.z + ez[1] * (hp + 1.2)]), canto = ob.forma === "cilindro" ? m3([ob.x + ex[0] * ob.raio, 0, ob.z + ex[1] * ob.raio]) : m3([ob.x + hl * ex[0] + hp * ez[0], 0, ob.z + hl * ex[1] + hp * ez[1]]);
      o.push(contorno + '<path d="M' + f1(c[0]) + " " + f1(c[1]) + "L" + f1(fr[0]) + " " + f1(fr[1]) + '" class="blk-mira"/><circle cx="' + f1(fr[0]) + '" cy="' + f1(fr[1]) + '" r="6" class="blk-alca" data-k="orot:' + ob.id + '"><title>Girar</title></circle>' +
        '<rect x="' + f1(canto[0] - 5) + '" y="' + f1(canto[1] - 5) + '" width="10" height="10" class="blk-alca" data-k="otam:' + ob.id + '"><title>' + (ob.forma === "cilindro" ? "Raio" : "Largura e profundidade") + "</title></rect>");
    }
    o.push('<text x="' + f1(c[0]) + '" y="' + f1(c[1] + 3) + '" class="blk-txt blk-obj-txt" style="fill:' + cor.ink + '">' + esc(ob.nome) + "</text>");
  });
  /* colisões: marcas nos pontos de contato */
  (dados.colisoes || []).forEach(q => { const c = m3(q); o.push('<circle cx="' + f1(c[0]) + '" cy="' + f1(c[1]) + '" r="6" class="blk-col"/>'); });
  /* manequins: silhueta de cima, seta de orientação (alça para girar), nome e tamanho na foto */
  dados.manequins.forEach(mq => {
    o.push(silhueta(mq.caps, m3, v.s, mq.cor, mq.id, mq.oculto ? 0.35 : 1));
    const c = m3([mq.x, 0, mq.z]), fx = Math.sin(mq.giro * D), fz = Math.cos(mq.giro * D), r0 = 1.6 * v.s + 6, tip = [c[0] + fx * (r0 + 9), c[1] + fz * (r0 + 9)], b0 = [c[0] + fx * r0, c[1] + fz * r0], n = [-fz, fx];
    o.push('<path d="M' + f1(tip[0]) + " " + f1(tip[1]) + "L" + f1(b0[0] + n[0] * 6) + " " + f1(b0[1] + n[1] * 6) + "L" + f1(b0[0] - n[0] * 6) + " " + f1(b0[1] - n[1] * 6) + 'Z" class="blk-seta" style="fill:' + mq.cor.ink + '" data-k="rot:' + mq.id + '"/>');
    if (mq.sel) o.push('<circle cx="' + f1(c[0]) + '" cy="' + f1(c[1]) + '" r="' + f1(r0 + 13) + '" class="blk-sel"/>');
    /* nome e, ao lado, quanto da altura da foto o manequim ocupa (a perspectiva em número) */
    const info = mq.foto && opts.tamanhos !== false ? (mq.foto.atras ? "atrás da câmera" : !mq.foto.dentro ? "fora da foto" : Math.round(mq.foto.frac * 100) + "%" + (mq.foto.inteiro ? "" : " cortado")) : "";
    o.push('<text x="' + f1(c[0]) + '" y="' + f1(c[1] - r0 - 6) + '" class="blk-txt blk-nome">' + esc(mq.nome) + (info ? '<tspan class="blk-info-t"> · ' + esc(info) + "</tspan>" : "") + "</text>");
  });
  /* órbita: círculo por onde a câmera passa ao girar em volta do pivô (centro = alvo) */
  if (dados.pivo) { const t = m3(C.alvo), r = Math.hypot(C.pos[0] - C.alvo[0], C.pos[2] - C.alvo[2]) * v.s;
    o.push('<circle cx="' + f1(t[0]) + '" cy="' + f1(t[1]) + '" r="' + f1(r) + '" class="blk-orbita"/><text x="' + f1(t[0]) + '" y="' + f1(t[1] + 26) + '" class="blk-txt blk-info blk-pivo-txt">pivô: ' + esc(dados.pivo.nome) + "</text>"); }
  /* câmera: ícone apontando para a frente, linha até o alvo, retícula no alvo */
  { const c = m3(C.pos), t = m3(C.alvo), a = Math.atan2(fh[1], fh[0]) / D;
    o.push('<path d="M' + f1(c[0]) + " " + f1(c[1]) + "L" + f1(t[0]) + " " + f1(t[1]) + '" class="blk-mira"/>');
    o.push('<g data-k="alvo" class="blk-alvo" transform="translate(' + f1(t[0]) + " " + f1(t[1]) + ')"><circle r="7"/><circle r="2"/><path d="M-12 0H-4M4 0H12M0 -12V-4M0 4V12"/></g>');
    o.push('<g data-k="cam" class="blk-cam" transform="translate(' + f1(c[0]) + " " + f1(c[1]) + ") rotate(" + f1(a) + ')"><rect x="-13" y="-8" width="18" height="16" rx="3"/><path d="M5 -5L12 -8V8L5 5Z"/></g>');
    o.push('<text x="' + f1(c[0]) + '" y="' + f1(c[1] + 22) + '" class="blk-txt blk-info blk-lente-txt ' + classeLente(C) + '">' + (C.persp ? faixaLente(C.lente) + " · " + Math.round(C.lente) + " mm · " + Math.round(C.fovH) + "°" : "sem perspectiva") + "</text>");
  }
  o.push("</svg>");
  return o.join("");
}

/* ----- vista lateral: eixo horizontal r (no chão), altura y para cima -----
   modo "camera": r = frente da câmera no chão (a câmera fica à esquerda e o eixo horizontal é a profundidade — a distância
   que decide a escala na foto); modo fixo: r vem de uma direção do mundo */
function eixoPerfil(dados, modo) {
  const C = dados.camera;
  if (!modo || modo === "camera") { const h = Math.hypot(C.frente[0], C.frente[2]) || 1; return { r: [C.frente[0] / h, 0, C.frente[2] / h], o: C.pos }; }
  const a = (+modo) * D; return { r: [Math.cos(a), 0, -Math.sin(a)], o: [0, 0, 0] };
}
function svgPerfil(dados, v, modo) {
  const C = dados.camera, E = eixoPerfil(dados, modo), g0 = dados.chao;
  const u = w => (w[0] - E.o[0]) * E.r[0] + (w[2] - E.o[2]) * E.r[2], vd = [E.r[2], 0, -E.r[0]], fundo = w => w[0] * vd[0] + w[2] * vd[2];
  const mp = q => [v.w / 2 + (q[0] - v.cx) * v.s, v.h / 2 - (q[1] - v.cy) * v.s], m3 = w => mp([u(w), w[1]]);
  const o = [cabecalho(v)];
  o.push(grade(v, q => mp([q[0], q[1]]), 0, "perfil"));
  /* chão e régua de altura (metros) */
  { const a = mp([v.cx - 1e3, g0]), b = mp([v.cx + 1e3, g0]), base = mp([v.cx, g0 - 1e3]);
    o.push('<path d="M' + f1(a[0]) + " " + f1(a[1]) + "L" + f1(b[0]) + " " + f1(b[1]) + "V" + f1(base[1]) + "H" + f1(a[0]) + 'Z" class="blk-chao"/><path d="M' + f1(a[0]) + " " + f1(a[1]) + "L" + f1(b[0]) + " " + f1(b[1]) + '" class="blk-chao-linha"/>');
    for (let m = 0; m <= 4; m += 0.5) { const p = mp([0, g0 + m * M_R]); p[0] = 0; o.push('<path d="M2 ' + f1(p[1]) + "H" + (m % 1 ? 8 : 14) + '" class="blk-regua"/>' + (m % 1 ? "" : '<text x="17" y="' + f1(p[1] + 3) + '" class="blk-txt blk-regua-txt">' + m + " m</text>")); } }
  /* campo de visão vertical: raios do alto e de baixo da foto (no meio da largura), recortados no chão */
  { const L = Math.max(60, 3 * C.d), cls = classeLente(C), top = C.raio(W / 2, 0), bot = C.raio(W / 2, H);
    const fim = r => { if (r.v[1] < -1e-6) { const t = (g0 - r.o[1]) / r.v[1], h = Math.hypot(r.v[0], r.v[2]) * t; if (h <= L) return { p: [r.o[0] + r.v[0] * t, g0, r.o[2] + r.v[2] * t], chao: true }; }
      const h = Math.hypot(r.v[0], r.v[1], r.v[2]) || 1, k = L / Math.max(0.05, Math.hypot(r.v[0], r.v[2]) / h); return { p: [r.o[0] + r.v[0] / h * k, r.o[1] + r.v[1] / h * k, r.o[2] + r.v[2] / h * k], chao: false }; };
    const ft = fim(top), fb = fim(bot), pts = [top.o, ft.p];
    /* se os dois raios tocam o chão, o fundo do cone é o trecho de chão entre eles */
    pts.push(fb.p, bot.o);
    const ps = pts.map(m3);
    o.push('<path d="M' + ps.map(q => f1(q[0]) + " " + f1(q[1])).join("L") + 'Z" class="blk-cone ' + cls + (C.persp ? "" : " orto") + '"/>');
    o.push('<path d="M' + f1(ps[0][0]) + " " + f1(ps[0][1]) + "L" + f1(ps[1][0]) + " " + f1(ps[1][1]) + "M" + f1(ps[3][0]) + " " + f1(ps[3][1]) + "L" + f1(ps[2][0]) + " " + f1(ps[2][1]) + '" class="blk-raio ' + cls + '"/>');
    [ft, fb].forEach(q => { if (q.chao) { const c = m3(q.p); o.push('<circle cx="' + f1(c[0]) + '" cy="' + f1(c[1]) + '" r="3" class="blk-toque ' + cls + '"/>'); } });
    /* profundidade × escala (modo câmera): onde uma pessoa em pé ocupa 100/50/25% da altura da foto */
    if (C.persp && dados.alturaPessoa && (!modo || modo === "camera")) [1, 0.5, 0.25].forEach(f => {
      const sd = distEscala(C, g0, dados.alturaPessoa, f); if (sd === null || sd > L) return;
      const p = mp([sd, g0]), q = mp([sd, g0 + dados.alturaPessoa]);
      o.push('<path d="M' + f1(p[0]) + " " + f1(p[1]) + "V" + f1(q[1]) + '" class="blk-escala"/><text x="' + f1(q[0]) + '" y="' + f1(q[1] - 3) + '" class="blk-txt blk-escala-txt">' + Math.round(f * 100) + "%</text>");
    });
  }
  /* objetos e manequins, do mais distante (mais claro) para o mais próximo de quem olha */
  const itens = [];
  (dados.objetos || []).forEach(ob => itens.push({ f: fundo([ob.x, 0, ob.z]), svg: () => {
    const cor = ob.cor || { fill: "#E4E4EB", ink: "#586577" }, st = ' style="fill:' + cor.fill + ";stroke:" + cor.ink + '"';
    let topo = -1e9, g = '<g data-k="o:' + ob.id + '" class="blk-obj-g' + (ob.sel ? " sel" : "") + '">';
    ob.caixas.forEach(b => {
      let x0, x1; const y0 = mp([0, b.c[1] + b.h[1]])[1], y1 = mp([0, b.c[1] - b.h[1]])[1]; topo = Math.max(topo, b.c[1] + b.h[1]);
      if (b.cil) { const uc = m3(b.c)[0]; x0 = uc - b.r * v.s; x1 = uc + b.r * v.s; }
      else { const ps = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, k]) => m3([b.c[0] + i * b.h[0] * b.e[0][0] + k * b.h[2] * b.e[2][0], 0, b.c[2] + i * b.h[0] * b.e[0][2] + k * b.h[2] * b.e[2][2]])[0]); x0 = Math.min(...ps); x1 = Math.max(...ps); }
      g += '<rect x="' + f1(x0) + '" y="' + f1(y0) + '" width="' + f1(Math.max(1, x1 - x0)) + '" height="' + f1(Math.max(1, y1 - y0)) + '"' + (b.cil ? ' rx="' + f1(Math.min(3, (x1 - x0) / 4)) + '"' : "") + ' class="blk-obj"' + st + "/>";
    });
    g += "</g>";
    const c = mp([u([ob.x, 0, ob.z]), topo]);
    if (ob.sel) g += '<rect x="' + f1(c[0] - 5) + '" y="' + f1(c[1] - 5) + '" width="10" height="10" class="blk-alca" data-k="oalt:' + ob.id + '"><title>Altura</title></rect>';
    return g + '<text x="' + f1(c[0]) + '" y="' + f1(c[1] - 9) + '" class="blk-txt blk-obj-txt" style="fill:' + cor.ink + '">' + esc(ob.nome) + "</text>";
  } }));
  const fs = dados.manequins.map(mq => fundo([mq.x, 0, mq.z])), fmin = Math.min(...fs, 0), fmax = Math.max(...fs, 1);
  dados.manequins.forEach((mq, i) => itens.push({ f: fs[i], svg: () => {
    const op = (mq.oculto ? 0.35 : 1) * (0.55 + 0.45 * (fmax > fmin ? (fs[i] - fmin) / (fmax - fmin) : 1));
    let topo = -1e9; mq.caps.forEach(c => topo = Math.max(topo, c.a[1] + c.r, c.b[1] + c.r));
    const c = mp([u([mq.x, 0, mq.z]), topo]);
    return silhueta(mq.caps, m3, v.s, mq.cor, mq.id, op) + (mq.sel ? '<path d="M' + f1(c[0] - 8) + " " + f1(c[1] - 16) + "L" + f1(c[0] + 8) + " " + f1(c[1] - 16) + "L" + f1(c[0]) + " " + f1(c[1] - 8) + 'Z" class="blk-sel-seta"/>' : "") +
      '<text x="' + f1(c[0]) + '" y="' + f1(c[1] - 20) + '" class="blk-txt blk-nome">' + esc(mq.nome) + "</text>";
  } }));
  itens.sort((a, b) => b.f - a.f).forEach(it => o.push(it.svg()));
  (dados.colisoes || []).forEach(q => { const c = m3(q); o.push('<circle cx="' + f1(c[0]) + '" cy="' + f1(c[1]) + '" r="6" class="blk-col"/>'); });
  /* câmera, linha até o alvo e altura dos olhos */
  { const c = m3(C.pos), t = m3(C.alvo), fr = [u([C.pos[0] + C.frente[0], 0, C.pos[2] + C.frente[2]]) - u([C.pos[0], 0, C.pos[2]]), C.frente[1]];
    const a = Math.atan2(-fr[1], fr[0]) / D, gch = mp([u(C.pos), g0]);
    o.push('<path d="M' + f1(c[0]) + " " + f1(c[1]) + "V" + f1(gch[1]) + '" class="blk-prumo"/><path d="M' + f1(c[0]) + " " + f1(c[1]) + "L" + f1(t[0]) + " " + f1(t[1]) + '" class="blk-mira"/>');
    o.push('<g data-k="alvo" class="blk-alvo" transform="translate(' + f1(t[0]) + " " + f1(t[1]) + ')"><circle r="7"/><circle r="2"/><path d="M-12 0H-4M4 0H12M0 -12V-4M0 4V12"/></g>');
    o.push('<g data-k="cam" class="blk-cam" transform="translate(' + f1(c[0]) + " " + f1(c[1]) + ") rotate(" + f1(a) + ')"><rect x="-13" y="-8" width="18" height="16" rx="3"/><path d="M5 -5L12 -8V8L5 5Z"/></g>');
    o.push('<text x="' + f1(c[0] + 18) + '" y="' + f1(c[1] - 12) + '" class="blk-txt blk-info" style="text-anchor:start">olhos a ' + ((C.pos[1] - g0) / M_R).toFixed(2).replace(".", ",") + " m</text>");
  }
  o.push("</svg>");
  return o.join("");
}
/* enquadramento automático de uma vista: tudo (manequins, objetos, câmera e alvo) com margem */
function encaixar(pts, w, h, margem) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; pts.forEach(q => { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
  const m = margem || 30, s = clamp(Math.min((w - 2 * m) / Math.max(4, x1 - x0), (h - 2 * m) / Math.max(4, y1 - y0)), 0.5, 60);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s, w, h };
}
/* folha de estilo fixa (tema claro) para usar as vistas fora do app (MCP, exportação) */
const CSS_PLANTA = "<style>.blk-orbita{fill:none;stroke:#E0603A;stroke-width:1.2;stroke-dasharray:5 4;opacity:.8}.blk-pivo-txt{fill:#B4432A}.blk-grade{fill:none;stroke:#CBD4DF;stroke-width:.7}.blk-eixo-x{stroke:#CF4A27;opacity:.55}.blk-eixo-z{stroke:#2B63D9;opacity:.55}.blk-cone{fill:#2B63D9;fill-opacity:.08;stroke:none}.blk-cone-borda{fill:none;stroke:#2B63D9;stroke-width:1.6;stroke-dasharray:7 4}.blk-raio{fill:none;stroke:#2B63D9;stroke-width:.7;opacity:.5}.blk-toque{fill:#2B63D9}.lente-grande.blk-cone{fill:#0E9F8A}.lente-grande.blk-cone-borda,.lente-grande.blk-raio{stroke:#0E9F8A}.lente-tele.blk-cone{fill:#C2410C}.lente-tele.blk-cone-borda,.lente-tele.blk-raio{stroke:#C2410C}.lente-grande.blk-toque{fill:#0E9F8A}.lente-tele.blk-toque{fill:#C2410C}.blk-lente-txt.lente-grande{fill:#0E9F8A}.blk-lente-txt.lente-tele{fill:#C2410C}.blk-lente-txt.lente-normal{fill:#2B63D9}.blk-escala{stroke:#586577;stroke-width:.8;stroke-dasharray:2 4}.blk-txt{font:10px sans-serif;fill:#586577;text-anchor:middle}.blk-nome{fill:#15212F;font-weight:bold}.blk-escala-txt{text-anchor:start;fill:#2B63D9}.blk-info-t{font-weight:normal;fill:#586577}.blk-regua-txt{text-anchor:start}.blk-obj{fill:#E4E4EB;stroke:#586577;stroke-width:1.2}.blk-alca{fill:#fff;stroke:#2B63D9;stroke-width:1.5}.blk-col{fill:#CF4A27;fill-opacity:.2;stroke:#CF4A27;stroke-width:1.6}.blk-obj-txt{font-weight:bold}.blk-seta{stroke:#fff}.blk-sel{fill:none;stroke:#2B63D9;stroke-width:1.4;stroke-dasharray:4 3}.blk-sel-seta{fill:#2B63D9}.blk-mira{stroke:#586577;stroke-width:.8}.blk-alvo{fill:none;stroke:#CF4A27;stroke-width:1.5}.blk-cam rect,.blk-cam path{fill:#CF4A27;stroke:#15212F;stroke-width:1.2}.blk-chao{fill:#EAEFF4}.blk-chao-linha{stroke:#15212F;stroke-width:1.4}.blk-regua{stroke:#586577}.blk-prumo{stroke:#586577;stroke-dasharray:3 3}</style>";
function comFundo(svg, w, h) { return svg.replace('class="blk-svg">', 'class="blk-svg" width="' + w + '" height="' + h + '">' + CSS_PLANTA + '<rect width="' + w + '" height="' + h + '" fill="#F9FBFD"/>'); }
export { faixaLente, classeLente, pegadaNoChao, distEscala, CSS_PLANTA, comFundo, M_R, cameraNoMundo, tamanhoNaFoto, svgPlanta, svgPerfil, eixoPerfil, encaixar };
