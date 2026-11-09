/* GeoMannequin — roteiro de quadros (storyboard por código).
   Um roteiro é texto com blocos:
     #cena                       preparação: roda antes do quadro 1 (e de todo quadro marcado "novo")
     #quadro 1 — título          ou "# frame 1"; número e título opcionais
       … código (a mesma API do editor: cena, camera, tema, log) …
       // fala: Ana: Oi!          anotações que ficam com o quadro (fala, nota)
     #quadro 2 novo 16:9         opções no marcador: "novo" (recomeça da preparação), formato (16:9, 4:3, 3:4, 9:16,
                                 1:1, 2:1, 21:9, horizontal, vertical, quadrado, página)
   Por padrão cada quadro CONTINUA do anterior (como animação): só se escreve o que muda.
   O roteiro roda sobre a própria cena (mesmo motor e mesmas regras), mas a cena aberta é guardada antes e devolvida
   depois: renderizar não muda o que está no palco. Este módulo não usa a página (roda também no MCP). */
import { LOG, camera, cena, tema } from "./comandos.js";
import { loadScene, sceneState } from "./estado.js";
import { L } from "./modos.js";
import { SCN, sceneList, instColors, corObjeto } from "./modelo.js";
import { pMundo } from "./colisoes.js";
import { H, W, ossosDoCorpo, paraMundo, renderScene, renderCamadas, telaDoMundo, ultimaComposicao } from "../engine/index.js";

/* ===== formatos de quadro: recorte central da foto do palco (600 × 700) ===== */
const FORMATOS_QUADRO = { "16:9": 16 / 9, "4:3": 4 / 3, "3:2": 3 / 2, "2:1": 2, "21:9": 21 / 9, "1:1": 1, "3:4": 3 / 4, "2:3": 2 / 3, "9:16": 9 / 16,
  horizontal: 16 / 9, paisagem: 16 / 9, vertical: 2 / 3, retrato: 2 / 3, quadrado: 1, pagina: W / H, "página": W / H, palco: W / H };
function recorteQuadro(formato) {
  const r = FORMATOS_QUADRO[String(formato || "palco").toLowerCase()] || W / H;
  if (r >= W / H) { const h = W / r; return { x: 0, y: (H - h) / 2, w: W, h, razao: r }; }
  const w = H * r; return { x: (W - w) / 2, y: 0, w, h: H, razao: r };
}

/* ===== leitura do roteiro ===== */
const RX_MARCA = /^\s*#\s*(cena|prepara[cç][aã]o|quadro|frame|painel|cena\s*geral)\b(.*)$/i;
function lerRoteiro(texto) {
  const linhas = String(texto || "").replace(/\r\n?/g, "\n").split("\n"), prep = { codigo: [], linha: 1, temMarca: false }, quadros = [];
  let atual = null, auto = 0;
  linhas.forEach((ln, i) => {
    const m = RX_MARCA.exec(ln);
    if (m && !/^\s*#\s*(cena|quadro|frame|painel)\s*[.(=]/i.test(ln)) {
      const tipo = m[1].toLowerCase();
      if (/^cena|^prepara/.test(tipo) && !/geral/.test(tipo)) { atual = prep; prep.temMarca = true; prep.linha = i + 2; return; }
      let resto = m[2].trim(), num = null, titulo = "", novo = false, formato = null;
      const n = /^(\d+)\b/.exec(resto); if (n) { num = +n[1]; resto = resto.slice(n[0].length).trim(); }
      /* opções: palavras antes do título */
      for (;;) {
        const o = /^(novo|nova|reiniciar|do\s+zero|\d+(?:[.,]\d+)?:\d+(?:[.,]\d+)?|horizontal|vertical|quadrado|paisagem|retrato|p[aá]gina|palco)\b\s*/i.exec(resto);
        if (!o) break;
        const t = o[1].toLowerCase(); if (/^(novo|nova|reiniciar|do\s+zero)$/.test(t)) novo = true; else formato = t.replace(",", ".");
        resto = resto.slice(o[0].length);
      }
      titulo = resto.replace(/^[—–\-:|·]+\s*/, "").trim();
      auto = num !== null ? num : auto + 1; if (num === null) num = auto;
      atual = { n: num, titulo, novo, formato, linha: i + 1, inicio: i + 2, codigo: [], falas: [], notas: [] };
      quadros.push(atual); return;
    }
    if (!atual) { atual = prep; prep.linha = 1; }
    atual.codigo.push(ln);
    const f = /^\s*\/\/\s*(fala|balão|balao|dialogo|diálogo)\s*:\s*(.+)$/i.exec(ln), nt = /^\s*\/\/\s*(nota|obs|descrição|descricao)\s*:\s*(.+)$/i.exec(ln);
    if (atual !== prep && f) { const t = f[2].trim(), q = /^([^:]{1,30}):\s*(.+)$/.exec(t); atual.falas.push(q ? { quem: q[1].trim(), texto: q[2].trim() } : { quem: "", texto: t }); }
    if (atual !== prep && nt) atual.notas.push(nt[2].trim());
  });
  /* números repetidos: avisa (a ordem é a do texto) */
  const vistos = new Set(), avisos = [];
  quadros.forEach(q => { if (vistos.has(q.n)) avisos.push("Quadro " + q.n + " aparece mais de uma vez (linha " + q.linha + "); vale a ordem do texto."); vistos.add(q.n); });
  return { preparacao: { codigo: prep.codigo.join("\n"), linha: prep.linha }, quadros: quadros.map(q => Object.assign(q, { codigo: q.codigo.join("\n") })), avisos };
}

/* ===== execução ===== */
const RX_LINHA = /(?:<anonymous>|Function|eval)[^:\n]*:(\d+):(\d+)/;
function rodarBloco(codigo, linhaInicial) {
  LOG.length = 0; const saida = [];
  const log = (...a) => saida.push(a.map(x => typeof x === "object" ? JSON.stringify(x) : String(x)).join(" "));
  try {
    if (codigo.trim()) new Function("cena", "camera", "tema", "log", '"use strict";\n' + codigo)(cena, camera, tema, log);
    return { ok: true, saida, avisos: LOG.filter(x => x[0] === "aviso").map(x => x[1]) };
  } catch (err) {
    /* a linha do erro dentro do bloco: o quadro do código do usuário (função criada em rodarBloco) */
    let rel = null;
    for (const ln of String(err.stack || "").split("\n")) { if (/rodarBloco|> Function|anonymous>/.test(ln) && /rodarBloco|> Function/.test(ln)) { const m = /:(\d+):(\d+)\)?\s*$/.exec(ln); if (m) { rel = Number(m[1]) - 3; break; } } }
    if (rel === null) { const m = RX_LINHA.exec(err.stack || ""); if (m) rel = Number(m[1]) - 3; }
    return { ok: false, saida, erro: err.message || String(err), linha: rel !== null && rel >= 1 ? linhaInicial + rel - 1 : null, avisos: [] };
  }
}
const copiaL = () => JSON.parse(JSON.stringify(L));
function aplicarL(l) { if (l) { Object.keys(L).forEach(k => { if (!(k in l)) delete L[k]; }); Object.assign(L, l); } }
/* roda o roteiro: devolve o estado completo de cada quadro (a cena aberta volta como estava) */
function executarRoteiro(texto, opts) {
  opts = opts || {};
  const R = lerRoteiro(texto), salvo = JSON.stringify(sceneState()), salvoL = copiaL(), salvoSel = SCN.objSel, out = [];
  let prep = null;
  try {
    const rp = rodarBloco(R.preparacao.codigo, R.preparacao.linha);
    prep = { estado: JSON.stringify(sceneState()), L: copiaL() };
    const erroPrep = rp.ok ? null : { erro: rp.erro, linha: rp.linha };
    let anterior = prep;
    const so = opts.somente ? new Set([].concat(opts.somente)) : null;
    R.quadros.forEach((q, k) => {
      if (q.novo || k === 0) { loadScene(JSON.parse(prep.estado)); aplicarL(prep.L); }
      else { loadScene(JSON.parse(anterior.estado)); aplicarL(anterior.L); }
      /* o formato do quadro vale para o enquadramento automático e para camera.enquadramento() dentro dele */
      const fq = q.formato || opts.formato; SCN.recorte = fq && fq !== "palco" ? recorteQuadro(fq) : null;
      const r = rodarBloco(q.codigo, q.inicio);
      SCN.recorte = null;
      if (!r.ok) { loadScene(JSON.parse((q.novo || k === 0 ? prep : anterior).estado)); }
      const estado = JSON.stringify(sceneState()), l = copiaL();
      anterior = { estado, L: l };
      if (so && !so.has(k)) return void out.push(null);
      out.push({ indice: k, n: q.n, titulo: q.titulo, novo: q.novo, formato: q.formato || opts.formato || "palco", linha: q.linha, falas: q.falas, notas: q.notas,
        estado: JSON.parse(estado), L: l, erro: r.ok ? null : r.erro, linhaErro: r.ok ? null : r.linha, avisos: r.avisos.concat(erroPrep ? ["A preparação (#cena) falhou na linha " + erroPrep.linha + ": " + erroPrep.erro] : []),
        saida: r.saida, chave: chaveDe(estado, l, q.formato || opts.formato || "palco") });
    });
  } finally {
    SCN.recorte = null; loadScene(JSON.parse(salvo)); aplicarL(salvoL); SCN.objSel = salvoSel;
  }
  return { quadros: out, avisos: R.avisos, total: R.quadros.length, preparacao: !!R.preparacao.codigo.trim() };
}
/* chave curta (hash) do estado: renderizar de novo só o que mudou */
function chaveDe(estado, l, formato) { const s = estado + "§" + JSON.stringify(l) + "§" + formato; let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + s.length.toString(36); }

/* ===== montar um quadro e tirar a "foto" (SVG) e os passes de referência =====
   Carrega o estado do quadro, desenha e devolve a cena aberta. */
function comEstado(q, fn) {
  const salvo = JSON.stringify(sceneState()), salvoL = copiaL();
  try { loadScene(JSON.parse(JSON.stringify(q.estado))); aplicarL(q.L); return fn(); }
  finally { loadScene(JSON.parse(salvo)); aplicarL(salvoL); }
}
function svgRecortado(corpo, rc, fundo) {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [rc.x, rc.y, rc.w, rc.h].map(v => Math.round(v * 100) / 100).join(" ") + '" width="' + Math.round(rc.w) + '" height="' + Math.round(rc.h) + '">' +
    (fundo ? '<rect x="' + rc.x + '" y="' + rc.y + '" width="' + rc.w + '" height="' + rc.h + '" fill="' + fundo + '"/>' : "") + corpo + "</svg>";
}
/* pontos do corpo no padrão OpenPose (COCO, 18 pontos), na tela; null = fora da foto */
const OP_NOMES = ["nariz", "pescoço", "ombro direito", "cotovelo direito", "punho direito", "ombro esquerdo", "cotovelo esquerdo", "punho esquerdo", "quadril direito", "joelho direito", "tornozelo direito",
  "quadril esquerdo", "joelho esquerdo", "tornozelo esquerdo", "olho direito", "olho esquerdo", "orelha direita", "orelha esquerda"];
const OP_LIGA = [[1, 2], [1, 5], [2, 3], [3, 4], [5, 6], [6, 7], [1, 8], [8, 9], [9, 10], [1, 11], [11, 12], [12, 13], [1, 0], [0, 14], [14, 16], [0, 15], [15, 17]];
const OP_CORES = ["#ff0000", "#ff5500", "#ffaa00", "#ffff00", "#aaff00", "#55ff00", "#00ff00", "#00ff55", "#00ffaa", "#00ffff", "#00aaff", "#0055ff", "#0000ff", "#5500ff", "#aa00ff", "#ff00ff", "#ff00aa", "#ff0055"];
function pontosOpenPose(it, pcam) {
  const p = pMundo(it), o = ossosDoCorpo(p), M = paraMundo(p), J = (nome, s) => { const j = o.juntas.find(x => x.nome === nome && (s === undefined || x.s === s)); return j ? j.P : null; };
  /* cabeça: rosto no sistema do crânio (A3) — aproximado a partir do crânio desenhado */
  const cr = o.ossos.find(x => x.nome === "crânio"), mand = o.ossos.filter(x => x.nome === "mandíbula");
  const queixo = mand.length ? mand[0].b : cr.a, atlas = J("cabeça (atlas)");
  /* eixos da cabeça: frente = do atlas ao queixo projetado; cima = do atlas ao crânio */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k], nrm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
  const cima = nrm(sub(cr.a, atlas)), fr0 = sub(queixo, atlas), fr = nrm(add(fr0, cima, -(fr0[0] * cima[0] + fr0[1] * cima[1] + fr0[2] * cima[2]))), lado = nrm([cima[1] * fr[2] - cima[2] * fr[1], cima[2] * fr[0] - cima[0] * fr[2], cima[0] * fr[1] - cima[1] * fr[0]]);
  const rr = cr.r, rosto = (x, y, z) => add(add(add(cr.a, lado, x * rr), cima, y * rr), fr, z * rr);
  const ombE = J("ombro", 1), ombD = J("ombro", -1);
  const loc = [rosto(0, -0.35, 1.05), ombE && ombD ? [0, 1, 2].map(k => (ombE[k] + ombD[k]) / 2) : J("pescoço"), ombD, J("cotovelo", -1), J("punho", -1), ombE, J("cotovelo", 1), J("punho", 1),
    J("quadril", -1), J("joelho", -1), J("tornozelo", -1), J("quadril", 1), J("joelho", 1), J("tornozelo", 1), rosto(-0.36, 0.02, 0.88), rosto(0.36, 0.02, 0.88), rosto(-0.98, -0.1, 0.0), rosto(0.98, -0.1, 0.0)];
  /* o "lado" calculado aponta para a esquerda do manequim? confere com os ombros e corrige */
  if (ombE && ombD) { const l2 = sub(ombE, ombD); if (l2[0] * lado[0] + l2[1] * lado[1] + l2[2] * lado[2] < 0) [14, 15, 16, 17].forEach(i => { const v = sub(loc[i], cr.a), dl = v[0] * lado[0] + v[1] * lado[1] + v[2] * lado[2]; loc[i] = add(loc[i], lado, -2 * dl); }); }
  return loc.map(q => { if (!q) return null; const w = M(q), t = telaDoMundo(pcam, w); return t && isFinite(t[0]) && isFinite(t[1]) ? [t[0], t[1]] : null; });
}
function openPoseSvg(pessoas, rc) {
  let s = "";
  pessoas.forEach(pts => {
    OP_LIGA.forEach(([a, b], i) => { const A = pts[a], B = pts[b]; if (!A || !B) return; s += '<line x1="' + A[0].toFixed(1) + '" y1="' + A[1].toFixed(1) + '" x2="' + B[0].toFixed(1) + '" y2="' + B[1].toFixed(1) + '" stroke="' + OP_CORES[i] + '" stroke-opacity=".6" stroke-width="' + (rc.w / 150).toFixed(2) + '" stroke-linecap="round"/>'; });
    pts.forEach((q, i) => { if (q) s += '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="' + (rc.w / 160).toFixed(2) + '" fill="' + OP_CORES[i] + '"/>'; });
  });
  return svgRecortado(s, rc, "#000000");
}
/* cor sólida e bem distinta de cada item para a máscara (a partir da cor exclusiva do item) */
function corMascara(h, i) { const hh = typeof h === "number" ? h : (i * 137.5) % 360, s = 0.85, l = 0.5, a = s * Math.min(l, 1 - l), f = n => { const k = (n + hh / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; }
/* ===== renderizar um quadro: SVG final, contorno, OpenPose (pontos + desenho), profundidade e máscara (RGBA em grade de 2 px) ===== */
function renderizarQuadro(q, opts) {
  opts = opts || {};
  return comEstado(q, () => {
    const rc = recorteQuadro(q.formato), exp = opts.tema !== "escuro", list = sceneList(exp), Lr = Object.assign({}, L, { grid: false });
    const r = renderScene(list, Lr, !!opts.rapido, Lr.floor ? 16 : 0, { canal: opts.rapido ? "quadros-previa" : "quadros" });
    const fundo = exp ? "#FFFFFF" : (list[0].p.bg || "#0F1620");
    const out = { n: q.n, titulo: q.titulo, formato: q.formato, recorte: rc, svg: svgRecortado(r.svg, rc, fundo) };
    if (opts.passes === false) return out;
    const passes = opts.passes || { contorno: true, openpose: true, profundidade: true, mascara: true };
    if (passes.contorno) { const lst2 = sceneList(true); lst2.forEach(o => { o.pal = Object.assign({}, o.pal, { fill: "#FFFFFF", shade1: "#FFFFFF", shade2: "#FFFFFF", shade3: "#FFFFFF", ink: "#111111" }); }); if (lst2.palObjetos) lst2.palObjetos = Object.assign({}, lst2.palObjetos, { fill: "#FFFFFF", shade1: "#FFFFFF", shade2: "#FFFFFF", shade3: "#FFFFFF", ink: "#111111" }); lst2.objetos = (lst2.objetos || []).map(o => Object.assign({}, o, { _cor: { fill: "#FFFFFF", ink: "#111111" } }));
      const rl = renderScene(lst2, Object.assign({}, L, { grid: false, floor: false, horizon: false, shadow: false, fill: true, shade: false, cel: false, rings: false, merid: false, girdle: false, prop: false, sphere: false, planes: false, hidden: false, ocultas: 0, ossos: false, fibras: false }), false, 0, { canal: "quadros-linha" }); out.contorno = svgRecortado(rl.svg, rc, "#FFFFFF"); }
    if (passes.openpose) {
      const pessoas = [], nomes = [];
      SCN.list.forEach((it, i) => { if (it.oculto) return; const pts = pontosOpenPose(it, list[i].p).map(t => t && t[0] >= rc.x && t[0] <= rc.x + rc.w && t[1] >= rc.y && t[1] <= rc.y + rc.h ? t : null); pessoas.push(pts); nomes.push(it.name); });
      out.openpose = { svg: openPoseSvg(pessoas, rc), json: { version: 1.3, canvas_width: Math.round(rc.w), canvas_height: Math.round(rc.h),
        people: pessoas.map((pts, i) => ({ person_id: [i], nome: nomes[i], pose_keypoints_2d: pts.flatMap(t => t ? [Math.round((t[0] - rc.x) * 10) / 10, Math.round((t[1] - rc.y) * 10) / 10, 1] : [0, 0, 0]) })), pontos: OP_NOMES } };
    }
    if (passes.profundidade || passes.mascara) {
      /* camadas separadas (uma por manequim e por objeto) guardam a profundidade de cada ponto da tela */
      renderCamadas(sceneList(true), Object.assign({}, L, { grid: false, floor: false, horizon: false }), false, 0, { canal: "quadros-z", sombraEntre: false });
      const U = ultimaComposicao() || { cams: [] }, C = 2, gw = Math.ceil(W / C), gh = Math.ceil(H / C), zt = new Float32Array(gw * gh).fill(-1e6), id = new Int16Array(gw * gh).fill(-1);
      U.cams.forEach((c, k) => { const z = c.z; if (!z) return; for (let y = 0; y < z.h; y++) for (let x = 0; x < z.w; x++) { const v = z.z[y * z.w + x]; if (v < -1e5) continue; const X = z.x0 + x, Y = z.y0 + y; if (X < 0 || Y < 0 || X >= gw || Y >= gh) continue; const o = Y * gw + X; if (v > zt[o]) { zt[o] = v; id[o] = k; } } });
      let zmin = 1e9, zmax = -1e9; for (let i = 0; i < zt.length; i++) if (zt[i] > -1e5) { zmin = Math.min(zmin, zt[i]); zmax = Math.max(zmax, zt[i]); }
      const x0 = Math.floor(rc.x / C), y0 = Math.floor(rc.y / C), w = Math.round(rc.w / C), h = Math.round(rc.h / C);
      const cores = U.cams.map(c => { if (c.membros[0] >= 0) { const it = SCN.list[c.membros[0]]; return { cor: corMascara(it && it.hue, c.membros[0]), nome: it ? it.name : "?" }; } const ob = SCN.objetos[c.obj]; return { cor: corMascara(ob && ob.hue, 7 + (c.obj || 0)), nome: ob ? (ob.nome || ob.tipo) : "objeto" }; });
      if (passes.profundidade) { const px = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = zt[(y0 + y) * gw + x0 + x], o = (y * w + x) * 4, g = v > -1e5 ? Math.round(40 + 215 * (zmax > zmin ? (v - zmin) / (zmax - zmin) : 1)) : 0; px[o] = px[o + 1] = px[o + 2] = g; px[o + 3] = 255; }
        out.profundidade = { w, h, escala: C, rgba: px }; }
      if (passes.mascara) { const px = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = id[(y0 + y) * gw + x0 + x], o = (y * w + x) * 4; if (k >= 0) { const c = cores[k].cor; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; } px[o + 3] = 255; }
        out.mascara = { w, h, escala: C, rgba: px, legenda: cores.map(c => ({ nome: c.nome, cor: "#" + c.cor.map(v => v.toString(16).padStart(2, "0")).join("") })) }; }
    }
    out.cena = { camera: (() => { const P0 = list[0].p; return { yaw: P0.yaw, pitch: P0.pitch, roll: P0.roll, distancia: P0.camDist, lente: P0.lens, perspectiva: !!P0.persp, alvo: [P0.tx, P0.ty, P0.tz] }; })(),
      manequins: SCN.list.map(it => ({ nome: it.name, x: it.params.wx || 0, z: it.params.wz || 0, giro: it.params.wRot || 0, oculto: !!it.oculto })), objetos: SCN.objetos.map(o => ({ nome: o.nome || o.tipo, tipo: o.tipo, x: o.x, z: o.z, giro: o.giro || 0 })) };
    return out;
  });
}
/* manifesto (o que vai no .zip) */
function manifestoQuadros(quadros, roteiro) {
  return { app: "GeoMannequin", tipo: "roteiro de quadros", versao: 1, criado: new Date().toISOString(), total: quadros.length,
    quadros: quadros.map((q, i) => ({ ordem: i + 1, n: q.n, titulo: q.titulo, formato: q.formato, pasta: pastaQuadro(q, i), falas: q.falas, notas: q.notas, erro: q.erro || null, cena: q.estado })), roteiro };
}
function pastaQuadro(q, i) { const t = String(q.titulo || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 32); return "quadro-" + String(i + 1).padStart(3, "0") + (t ? "_" + t : ""); }

/* ===== página de mangá/quadrinhos: os quadros numa grade, com calhas e balões ===== */
const GRADES = { "1": [[1]], "2": [[1], [1]], "2h": [[1, 1]], "3": [[1], [1, 1]], "3b": [[1, 1], [1]], "4": [[1, 1], [1, 1]], "5": [[1, 1], [1], [1, 1]], "6": [[1, 1], [1, 1], [1, 1]], "6b": [[1, 1, 1], [1, 1, 1]], "8": [[1, 1], [1, 1], [1, 1], [1, 1]] };
function paginaQuadros(fotos, opts) {
  opts = opts || {};
  const PW = opts.largura || 1200, PH = opts.altura || Math.round(PW * 1.414), m = opts.margem === undefined ? 40 : opts.margem, cal = opts.calha === undefined ? 18 : opts.calha;
  const grade = GRADES[opts.grade || ({ 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6" }[Math.min(fotos.length, 6)] || "6")] || GRADES["4"], jp = opts.leitura === "japonesa" || opts.leitura === "direita";
  const porPag = grade.reduce((s, l) => s + l.length, 0), paginas = [];
  for (let p0 = 0; p0 < fotos.length; p0 += porPag) {
    const fs = fotos.slice(p0, p0 + porPag), alt = (PH - 2 * m - cal * (grade.length - 1)) / grade.length; let s = "", k = 0;
    grade.forEach((lin, li) => {
      const tot = lin.reduce((a, b) => a + b, 0), larg = PW - 2 * m - cal * (lin.length - 1); let x = m;
      const cel = lin.map(w => { const c = { x, w: larg * w / tot }; x += c.w + cal; return c; });
      if (jp) cel.reverse();
      cel.forEach(c => {
        const f = fs[k++]; if (!f) return; const y = m + li * (alt + cal), id = "q" + (p0 + k);
        /* o quadro cobre o painel (corta o que sobra): pelo centro, ou por cima quando o quadro é mais alto que o painel (cabeças) */
        const vb = /viewBox="([^"]+)"/.exec(f.svg)[1].split(" ").map(Number), alto = vb[3] / vb[2] > alt / c.w;
        s += imagemSvg(f.svg, c.x, y, c.w, alt, opts.preparar, alto ? "xMidYMin slice" : "xMidYMid slice");
        s += '<rect x="' + c.x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + c.w.toFixed(1) + '" height="' + alt.toFixed(1) + '" fill="none" stroke="#111" stroke-width="4"/>';
        /* balões de fala (a partir de "// fala:") */
        (f.falas || []).slice(0, 3).forEach((fl, j) => {
          const txt = (fl.quem ? fl.quem + ": " : "") + fl.texto, linhas = quebrarTexto(txt, Math.max(12, Math.floor(c.w / 22))), lh = 22, bw = Math.min(c.w * 0.7, Math.max(...linhas.map(t => t.length)) * 11 + 30), bh = linhas.length * lh + 20;
          const bx = jp ? c.x + c.w - bw - 14 - j * 12 : c.x + 14 + j * 12, by = y + 14 + j * (bh + 10);
          s += '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh + '" rx="' + (bh / 2.4).toFixed(1) + '" fill="#fff" stroke="#111" stroke-width="2.5"/>';
          linhas.forEach((t, li2) => { s += '<text x="' + (bx + bw / 2).toFixed(1) + '" y="' + (by + 10 + lh * (li2 + 0.78)).toFixed(1) + '" font-family="Comic Sans MS, Comic Neue, sans-serif" font-size="18" text-anchor="middle" fill="#111">' + escXml(t) + "</text>"; });
        });
      });
    });
    paginas.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + PW + " " + PH + '" width="' + PW + '" height="' + PH + '"><rect width="' + PW + '" height="' + PH + '" fill="#fff"/>' + s + "</svg>");
  }
  return paginas;
}
/* cada quadro entra como imagem (data URI): ids internos não colidem e o resultado rasteriza igual no navegador e no MCP */
function base64Texto(t) { if (typeof Buffer !== "undefined") return Buffer.from(t, "utf8").toString("base64"); return btoa(unescape(encodeURIComponent(t))); }
function imagemSvg(svg, x, y, w, h, preparar, ajuste) { const s = preparar ? preparar(svg) : svg; return '<image x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + w.toFixed(2) + '" height="' + h.toFixed(2) + '"' + (ajuste ? ' preserveAspectRatio="' + ajuste + '"' : "") + ' href="data:image/svg+xml;base64,' + base64Texto(s) + '"/>'; }
function quebrarTexto(t, n) { const out = []; let l = ""; String(t).split(/\s+/).forEach(w => { if ((l + " " + w).trim().length > n && l) { out.push(l); l = w; } else l = (l + " " + w).trim(); }); if (l) out.push(l); return out; }
const escXml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/* folha de contato: todos os quadros pequenos numa imagem, numerados */
function folhaDeContato(fotos, colunas, preparar) {
  const cols = colunas || Math.min(5, Math.max(1, Math.ceil(Math.sqrt(fotos.length)))), cw = 240, ch = 280, lin = Math.ceil(fotos.length / cols), Wf = cols * cw, Hf = lin * ch;
  let s = "";
  fotos.forEach((f, i) => { const x = (i % cols) * cw, y = Math.floor(i / cols) * ch, vb = /viewBox="([^"]+)"/.exec(f.svg)[1].split(" ").map(Number), e = Math.min((cw - 16) / vb[2], (ch - 44) / vb[3]), dx = x + (cw - vb[2] * e) / 2 - vb[0] * e, dy = y + 8 - vb[1] * e;
    s += imagemSvg(f.svg, dx + vb[0] * e, dy + vb[1] * e, vb[2] * e, vb[3] * e, preparar) + '<rect x="' + (x + 8) + '" y="' + (y + 8) + '" width="' + (cw - 16) + '" height="' + (ch - 44) + '" fill="none" stroke="#bbb"/>' +
      '<text x="' + (x + 10) + '" y="' + (y + ch - 14) + '" font-family="sans-serif" font-size="14" fill="#111">' + (i + 1) + ". " + escXml(String(f.titulo || "").slice(0, 26)) + "</text>"; });
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + Wf + " " + Hf + '" width="' + Wf + '" height="' + Hf + '"><rect width="' + Wf + '" height="' + Hf + '" fill="#fff"/>' + s + "</svg>";
}
/* modelos prontos de roteiro */
const MODELOS_ROTEIRO = {
  "Diálogo entre dois": `#cena
cena.limpar();
const ana = cena.ativo.renomear("Ana").posicao(-3, 0).girar(90);
const leo = cena.adicionar({ nome: "Leo", x: 3 }).girar(-90);
camera.perspectiva(true).lente(50);

#quadro 1 — Plano geral
camera.eixo("z").elevacao("olhos");
camera.enquadrar();
// nota: os dois se encontram

#quadro 2 — Ana fala
cena.obter("Ana").poseRapida("acenando").olhar("Leo");
camera.enquadramento("medio", "Ana");
// fala: Ana: Oi, Leo!

#quadro 3 — Reação do Leo
cena.obter("Leo").olhar("Ana");
camera.enquadramento("close", "Leo").angulo("contra-plongée");
// fala: Leo: Você por aqui?`,
  "Briga em três tempos": `#cena
cena.limpar();
cena.ativo.renomear("Kai").posicao(-3, 0).girar(90);
cena.adicionar({ nome: "Rui", x: 3 }).girar(-90);
camera.perspectiva(true).lente(35);

#quadro 1 — Guarda
cena.obter("Kai").poseRapida("passo").gesto("punho");
cena.obter("Rui").poseRapida("passo").gesto("punho");
camera.eixo("z").elevacao("media"); camera.enquadrar();

#quadro 2 16:9 — Soco
cena.obter("Kai").poseRapida("socando");
camera.angulo("holandes").enquadramento("americano", "Kai");

#quadro 3 — Queda
cena.obter("Rui").poseRapida("caindo");
camera.angulo("plongée"); camera.enquadrar();`,
  "Caminhada (quadros seguidos)": `#cena
cena.limpar();
cena.ativo.renomear("Mia").poseRapida("empe").girar(90);
camera.perspectiva(true).eixo("z").elevacao("olhos");

#quadro 1
cena.obter("Mia").poseRapida("caminhando").posicao(-6, 0);
camera.enquadrar();

#quadro 2
cena.obter("Mia").espelhar().mover(3, 0);

#quadro 3
cena.obter("Mia").espelhar().mover(3, 0);`
};
export { FORMATOS_QUADRO, recorteQuadro, lerRoteiro, executarRoteiro, renderizarQuadro, pontosOpenPose, openPoseSvg, OP_NOMES, manifestoQuadros, pastaQuadro, paginaQuadros, GRADES, folhaDeContato, MODELOS_ROTEIRO, chaveDe };
