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
import { LOG, camera, cena, tema, poseCmd } from "./comandos.js";
import { loadScene, sceneState } from "./estado.js";
import { L } from "./modos.js";
import { SCN, sceneList, instColors, corObjeto } from "./modelo.js";
import { pMundo } from "./colisoes.js";
import { azimutesGiro, nomeVista } from "./orbita.js";
import { B25_COCO, H, W, paraMundo, pontosDoCorpo, renderScene, renderCamadas, setFino, telaDoMundo, ultimaComposicao } from "../engine/index.js";

/* ===== formatos de quadro: recorte central da foto do palco (600 × 700) ===== */
const FORMATOS_QUADRO = { "16:9": 16 / 9, "4:3": 4 / 3, "3:2": 3 / 2, "2:1": 2, "21:9": 21 / 9, "1:1": 1, "3:4": 3 / 4, "2:3": 2 / 3, "9:16": 9 / 16,
  horizontal: 16 / 9, paisagem: 16 / 9, vertical: 2 / 3, retrato: 2 / 3, quadrado: 1, pagina: W / H, "página": W / H, palco: W / H };
function recorteQuadro(formato) {
  const r = FORMATOS_QUADRO[String(formato || "palco").toLowerCase()] || W / H;
  if (r >= W / H) { const h = W / r; return { x: 0, y: (H - h) / 2, w: W, h, razao: r }; }
  const w = H * r; return { x: (W - w) / 2, y: 0, w, h: H, razao: r };
}

/* ===== leitura do roteiro ===== */
const RX_MARCA = /^\s*#\s*(cena|prepara[cç][aã]o|quadro|frame|painel|cena\s*geral|[oó]rbita|orbitar|giro|turntable|ficha)\b(.*)$/i;
/* geradores: "#orbita "Ana" 8 elevacao 15" vira 8 quadros girando em volta da Ana; "#ficha "Ana"" vira a ficha do personagem
   (frente, 3/4, perfil e costas; "completa" = as 8 vistas). O código logo abaixo do marcador roda no primeiro deles. */
function lerGerador(tipo, resto) {
  let alvo = "ativo"; const q = /^\s*(?:"([^"]+)"|'([^']+)'|\[([^\]]+)\]|(\S+))/.exec(resto);
  if (q && !/^\d+$/.test(q[4] || "") && !/^(novo|nova|completa|orto|ortografica|ortográfica|elev|eleva)/i.test(q[4] || "")) { alvo = q[1] || q[2] || (q[3] ? JSON.parse("[" + q[3] + "]") : q[4]); resto = resto.slice(q[0].length); }
  const g = { alvo, n: /^fich/i.test(tipo) ? 4 : 8, elev: /^fich/i.test(tipo) ? 0 : null, area: null, orto: false, ficha: /^fich/i.test(tipo), sentido: "" };
  /* '#orbita "Ana" 8 area cabeca elevacao 25' e area "mao esquerda" */
  resto=resto.replace(/\b(?:area|regi[aã]o|foco)\s+(?:"([^"]+)"|'([^']+)'|(parte\s+(?:superior|inferior|central)|[\wÀ-ÿ-]+(?:\s+(?:esquerda|direita))?))/i,(m,a,b,c)=>{
    g.area=(a||b||c).trim();return " ";
  });
  resto = resto.replace(/\b(?:eleva[cç][aã]o|elev)\s*(-?\d+(?:[.,]\d+)?)/i, (m, v) => { g.elev = +v.replace(",", "."); return " "; })
    .replace(/\bcompleta\b/i, () => { g.n = 8; return " "; }).replace(/\b(orto|ortogr[aá]fica)\b/i, () => { g.orto = true; return " "; })
    .replace(/\b(hor[aá]rio|anti-?hor[aá]rio)\b/i, (m) => { g.sentido = /anti/i.test(m) ? "" : "horario"; return " "; });
  const n = /^\s*(\d+)\b/.exec(resto); if (n) { g.n = Math.max(2, Math.min(72, +n[1])); resto = resto.slice(n[0].length); }
  return { g, resto: resto.trim() };
}
function lerRoteiro(texto) {
  const linhas = String(texto || "").replace(/\r\n?/g, "\n").split("\n"), prep = { codigo: [], linha: 1, temMarca: false }, quadros = [];
  let atual = null, auto = 0;
  linhas.forEach((ln, i) => {
    const m = RX_MARCA.exec(ln);
    if (m && !/^\s*#\s*(cena|quadro|frame|painel)\s*[.(=]/i.test(ln)) {
      const tipo = m[1].toLowerCase();
      if (/^cena|^prepara/.test(tipo) && !/geral/.test(tipo)) { atual = prep; prep.temMarca = true; prep.linha = i + 2; return; }
      let resto = m[2].trim(), num = null, titulo = "", novo = false, formato = null, gerador = null;
      if (/^([oó]rbit|giro|turntable|ficha)/i.test(tipo)) { const G = lerGerador(tipo, resto); gerador = G.g; resto = G.resto; }
      const n = /^(\d+)\b(?![:.,]\d)/.exec(resto); if (n) { num = +n[1]; resto = resto.slice(n[0].length).trim(); }
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
      quadros.push(atual);
      if (gerador) { const G = gerador, azs = G.ficha ? (G.n >= 8 ? [0, 45, 90, 135, 180, -135, -90, -45] : [0, 45, 90, 180]) : azimutesGiro(G.n, { sentido: G.sentido }), base = titulo || (G.ficha ? "Ficha" : "Giro");
        const chamada = a => (G.orto ? "camera.perspectiva(false);\n" : "") + "camera.orbitar(" + JSON.stringify(G.alvo) + ", { azimute: " + a + (G.elev !== null ? ", elevacao: " + G.elev : "") + (G.area ? ", area: " + JSON.stringify(G.area) : "") + " });";
        azs.forEach((a, k) => { const q = k ? { n: ++auto, titulo: "", novo: false, formato, linha: i + 1, inicio: i + 1, codigo: [], falas: [], notas: [] } : atual;
          q.titulo = base + " — " + nomeVista(a); q.gerado = { alvo: G.alvo, area: G.area, azimute: a, elevacao: G.elev, ficha: G.ficha }; q.posCodigo = chamada(a); if (k) quadros.push(q); }); }
      return;
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
  return { preparacao: { codigo: prep.codigo.join("\n"), linha: prep.linha }, quadros: quadros.map(q => Object.assign(q, { codigo: q.codigo.join("\n") + (q.posCodigo ? "\n" + q.posCodigo : "") })), avisos };
}

/* ===== execução ===== */
const RX_LINHA = /(?:<anonymous>|Function|eval)[^:\n]*:(\d+):(\d+)/;
function rodarBloco(codigo, linhaInicial) {
  LOG.length = 0; const saida = [];
  const log = (...a) => saida.push(a.map(x => typeof x === "object" ? JSON.stringify(x) : String(x)).join(" "));
  try {
    if (codigo.trim()) new Function("cena", "camera", "tema", "log", "pose", "efeito", '"use strict";\n' + codigo)(cena, camera, tema, log, poseCmd, (t, o) => cena.efeito(t, o));
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
/* ===== OpenPose completo: corpo (BODY_25, e o COCO 18 derivado), mãos (21 + 21) e rosto (70), da mesma geometria do desenho ===== */
const OP_NOMES = ["nariz", "pescoço", "ombro direito", "cotovelo direito", "punho direito", "ombro esquerdo", "cotovelo esquerdo", "punho esquerdo", "meio do quadril", "quadril direito", "joelho direito", "tornozelo direito",
  "quadril esquerdo", "joelho esquerdo", "tornozelo esquerdo", "olho direito", "olho esquerdo", "orelha direita", "orelha esquerda", "dedão esquerdo", "dedo mínimo esquerdo", "calcanhar esquerdo", "dedão direito", "dedo mínimo direito", "calcanhar direito"];
const OP_NOMES_COCO = B25_COCO.map(i => OP_NOMES[i]);
/* ligações e cores do desenho do pré-processador (COCO 18), mais os pés do BODY_25 */
const OP_LIGA = [[1, 2], [1, 5], [2, 3], [3, 4], [5, 6], [6, 7], [1, 9], [9, 10], [10, 11], [1, 12], [12, 13], [13, 14], [1, 0], [0, 15], [15, 17], [0, 16], [16, 18]];
const OP_PES = [[14, 19], [19, 20], [14, 21], [11, 22], [22, 23], [11, 24]];
const OP_CORES = ["#ff0000", "#ff5500", "#ffaa00", "#ffff00", "#aaff00", "#55ff00", "#00ff00", "#00ff55", "#00ffaa", "#00ffff", "#00aaff", "#0055ff", "#0000ff", "#5500ff", "#aa00ff", "#ff00ff", "#ff00aa", "#ff0055"];
const OP_COR_PONTO = ["#ff0000", "#ff5500", "#ffaa00", "#ffff00", "#aaff00", "#55ff00", "#00ff00", "#00ff55", "#00ffaa", "#00ffff", "#00aaff", "#0055ff", "#0000ff", "#5500ff", "#aa00ff", "#ff00ff", "#ff00aa", "#ff0055", "#ff0055", "#aaaaff", "#8888ff", "#6666ff", "#ffaaaa", "#ff8888", "#ff6666"];
const OP_MAO = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [0, 9], [9, 10], [10, 11], [11, 12], [0, 13], [13, 14], [14, 15], [15, 16], [0, 17], [17, 18], [18, 19], [19, 20]];
/* parte do corpo que cobre cada ponto sem escondê-lo (1 cabeça, 2 tronco, 3–5 braço/antebraço/mão E, 6–8 D, 9–11 coxa/perna/pé E, 12–14 D) */
const OP_DONO = [[1], [1, 2], [2, 6], [6, 7], [7, 8], [2, 3], [3, 4], [4, 5], [2, 9, 12], [2, 12], [12, 13], [13, 14], [2, 9], [9, 10], [10, 11], [1], [1], [1], [1], [11], [11], [10, 11], [14], [14], [13, 14]];
/* pontos de um manequim na tela: [x, y, confiança] — 1 visível, 0,5 escondido atrás de algo, 0 fora da foto */
function pontosOpenPose(it, pcam, vis, rc) {
  const p = pMundo(it), M = paraMundo(p), P = pontosDoCorpo(p);
  const tela = (q, dono, tol) => { if (!q) return [0, 0, 0]; const t = telaDoMundo(pcam, M(q)); if (!t || !isFinite(t[0]) || !isFinite(t[1])) return [0, 0, 0];
    if (rc && (t[0] < rc.x || t[0] > rc.x + rc.w || t[1] < rc.y || t[1] > rc.y + rc.h)) return [0, 0, 0];
    return [t[0], t[1], vis ? vis(t, dono, tol) : 1]; };
  return { corpo: P.corpo25.map((q, i) => tela(q, OP_DONO[i], i >= 15 && i <= 18 ? 0.12 : 0.15)),
    maoE: P.maoE.map((q, i) => tela(q, i ? [5] : [4, 5], 0.15)), maoD: P.maoD.map((q, i) => tela(q, i ? [8] : [7, 8], 0.15)), rosto: P.rosto.map(q => tela(q, [], 0.08)) };
}
/* desenho no estilo do DWPose: membros em elipses translúcidas, pés, mãos em arco-íris e rosto em pontos brancos */
function openPoseSvg(pessoas, rc, opc) {
  opc = opc || {}; const k = Math.max(rc.w, rc.h) / 512, f = v => v.toFixed(1), ok = q => q && q[2] > 0;
  let s = "";
  const membro = (A, B, cor, lw) => { const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, len = Math.hypot(B[0] - A[0], B[1] - A[1]) / 2, ang = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI;
    return '<ellipse cx="' + f(mx) + '" cy="' + f(my) + '" rx="' + f(len) + '" ry="' + f(lw) + '" transform="rotate(' + f(ang) + " " + f(mx) + " " + f(my) + ')" fill="' + cor + '" fill-opacity=".6"/>'; };
  pessoas.forEach(P => {
    const c = P.corpo;
    OP_LIGA.forEach(([a, b], i) => { if (ok(c[a]) && ok(c[b])) s += membro(c[a], c[b], OP_CORES[i], 4 * k); });
    if (opc.pes !== false) OP_PES.forEach(([a, b], i) => { if (ok(c[a]) && ok(c[b])) s += membro(c[a], c[b], i < 3 ? "#5555ff" : "#ff5555", 3 * k); });
    c.forEach((q, i) => { if (ok(q) && (i < 19 || opc.pes !== false)) s += '<circle cx="' + f(q[0]) + '" cy="' + f(q[1]) + '" r="' + f(4 * k) + '" fill="' + OP_COR_PONTO[i] + '"/>'; });
    if (opc.maos !== false) [P.maoE, P.maoD].forEach(m => {
      OP_MAO.forEach(([a, b], i) => { if (ok(m[a]) && ok(m[b])) { const h = i / OP_MAO.length * 360; s += '<line x1="' + f(m[a][0]) + '" y1="' + f(m[a][1]) + '" x2="' + f(m[b][0]) + '" y2="' + f(m[b][1]) + '" stroke="hsl(' + h.toFixed(0) + ',100%,50%)" stroke-width="' + f(2 * k) + '" stroke-linecap="round"/>'; } });
      m.forEach(q => { if (ok(q)) s += '<circle cx="' + f(q[0]) + '" cy="' + f(q[1]) + '" r="' + f(2 * k) + '" fill="#0000ff"/>'; }); });
    if (opc.rosto !== false) P.rosto.forEach(q => { if (ok(q)) s += '<circle cx="' + f(q[0]) + '" cy="' + f(q[1]) + '" r="' + f(1.5 * k) + '" fill="#ffffff"/>'; });
  });
  return svgRecortado(s, rc, "#000000");
}
/* JSON no formato do OpenPose (pontos relativos ao recorte) */
function openPoseJson(pessoas, nomes, rc) {
  const lista = pts => pts.flatMap(t => t[2] > 0 ? [Math.round((t[0] - rc.x) * 10) / 10, Math.round((t[1] - rc.y) * 10) / 10, t[2]] : [0, 0, 0]);
  return { version: 1.3, canvas_width: Math.round(rc.w), canvas_height: Math.round(rc.h), modelo: "BODY_25 + mãos 21 + rosto 70",
    people: pessoas.map((P, i) => ({ person_id: [i], nome: nomes[i], pose_keypoints_2d: lista(P.corpo), pose_keypoints_2d_coco18: lista(B25_COCO.map(j => P.corpo[j])),
      hand_left_keypoints_2d: lista(P.maoE), hand_right_keypoints_2d: lista(P.maoD), face_keypoints_2d: lista(P.rosto) })),
    pontos: OP_NOMES, pontos_coco18: OP_NOMES_COCO, confianca: "1 visível · 0,5 escondido atrás de outra parte ou de outro item · 0 fora da foto" };
}
/* cor sólida e bem distinta de cada item para a máscara (a partir da cor exclusiva do item) */
function corMascara(h, i) { const hh = typeof h === "number" ? h : (i * 137.5) % 360, s = 0.85, l = 0.5, a = s * Math.min(l, 1 - l), f = n => { const k = (n + hh / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; }
/* segmentação por partes do corpo: nome e cor de cada parte (as mesmas para todos os manequins) */
const PARTES_SEG = [null, ["cabeça", [255, 85, 0]], ["tronco", [255, 0, 0]], ["braço esquerdo", [0, 255, 0]], ["antebraço esquerdo", [0, 170, 0]], ["mão esquerda", [170, 255, 85]],
  ["braço direito", [0, 0, 255]], ["antebraço direito", [0, 85, 170]], ["mão direita", [85, 170, 255]], ["coxa esquerda", [255, 255, 0]], ["perna esquerda", [170, 170, 0]], ["pé esquerdo", [255, 170, 85]],
  ["coxa direita", [255, 0, 255]], ["perna direita", [170, 0, 170]], ["pé direito", [255, 85, 170]], ["objeto", [128, 128, 128]]];
/* passes da cena em 1 px: profundidade, de quem é cada pixel e a parte do corpo */
function capturarPasses(list) {
  setFino(true);
  try { renderCamadas(list, Object.assign({}, L, { grid: false, floor: false, horizon: false }), false, 0, { canal: "quadros-z1", sombraEntre: false }); }
  finally { setFino(false); }
  const U = ultimaComposicao() || { cams: [] }, zt = new Float32Array(W * H).fill(-1e6), id = new Int16Array(W * H).fill(-1), pt = new Uint8Array(W * H);
  U.cams.forEach((c, k) => { const z = c.z; if (!z) return; const ehObj = c.membros[0] < 0;
    if (z.fino) { const F = z.fino, C = ehObj ? 1 : 1; for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) { const v = F.z[y * F.w + x]; if (v < -1e5) continue; const X = F.x0 + x, Y = F.y0 + y; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const o = Y * W + X; if (v > zt[o]) { zt[o] = v; id[o] = k; pt[o] = ehObj ? 15 : (F.parte ? F.parte[y * F.w + x] : 0); } } }
    else { const C = 2; for (let y = 0; y < z.h * C; y++) for (let x = 0; x < z.w * C; x++) { const v = z.z[((y / C) | 0) * z.w + ((x / C) | 0)]; if (v < -1e5) continue; const X = z.x0 * C + x, Y = z.y0 * C + y; if (X >= W || Y >= H) continue; const o = Y * W + X; if (v > zt[o]) { zt[o] = v; id[o] = k; pt[o] = ehObj ? 15 : 0; } } } });
  return { U, zt, id, pt };
}
/* ===== renderizar um quadro: SVG final, contorno, OpenPose (pontos + desenho), e os passes em 1 px: profundidade, normais, máscara, partes e bordas ===== */
const PASSES_QUADRO = ["contorno", "openpose", "profundidade", "mascara", "normal", "partes", "canny"];
function renderizarQuadro(q, opts) {
  opts = opts || {};
  return comEstado(q, () => {
    const rc = recorteQuadro(q.formato), exp = opts.tema !== "escuro", list = sceneList(exp,true), Lr = Object.assign({}, L, { grid: false });
    const r = renderScene(list, Lr, !!opts.rapido, Lr.floor ? 16 : 0, { canal: opts.rapido ? "quadros-previa" : "quadros" });
    const fundo = exp ? "#FFFFFF" : (list[0].p.bg || "#0F1620");
    const out = { n: q.n, titulo: q.titulo, formato: q.formato, recorte: rc, svg: svgRecortado(r.svg, rc, fundo) };
    if (opts.passes === false) return out;
    const passes = opts.passes || Object.fromEntries(PASSES_QUADRO.map(k => [k, true]));
    /* efeitos especiais ficam fora das referências do ControlNet (contorno, profundidade…), a não ser com opts.efeitosNasReferencias */
    const semFx = l => { if (!opts.efeitosNasReferencias) l.efeitos = []; return l; };
    if (passes.contorno) { const lst2 = semFx(sceneList(true)); lst2.forEach(o => { o.pal = Object.assign({}, o.pal, { fill: "#FFFFFF", shade1: "#FFFFFF", shade2: "#FFFFFF", shade3: "#FFFFFF", ink: "#111111" }); }); if (lst2.palObjetos) lst2.palObjetos = Object.assign({}, lst2.palObjetos, { fill: "#FFFFFF", shade1: "#FFFFFF", shade2: "#FFFFFF", shade3: "#FFFFFF", ink: "#111111" }); lst2.objetos = (lst2.objetos || []).map(o => Object.assign({}, o, { _cor: { fill: "#FFFFFF", ink: "#111111" } }));
      const rl = renderScene(lst2, Object.assign({}, L, { grid: false, floor: false, horizon: false, shadow: false, fill: true, shade: false, cel: false, rings: false, merid: false, girdle: false, prop: false, sphere: false, planes: false, hidden: false, ocultas: 0, ossos: false, fibras: false }), false, 0, { canal: "quadros-linha" }); out.contorno = svgRecortado(rl.svg, rc, "#FFFFFF"); }
    const precisaZ = ["openpose", "profundidade", "mascara", "normal", "partes", "canny"].some(k => passes[k]);
    if (!precisaZ) return comCena(out, list);
    const { U, zt, id, pt } = capturarPasses(semFx(sceneList(true)));
    const x0 = Math.max(0, Math.floor(rc.x)), y0 = Math.max(0, Math.floor(rc.y)), w = Math.min(W - x0, Math.round(rc.w)), h = Math.min(H - y0, Math.round(rc.h)), C = 1;
    const at = (x, y) => (y0 + y) * W + x0 + x;
    if (passes.openpose) {
      /* camada de cada manequim, para saber se quem cobre um ponto é ele mesmo ou outro item */
      const camDe = i => U.cams.findIndex(c => c.membros.includes(i));
      const pessoas = [], nomes = [];
      SCN.list.forEach((it, i) => { if (it.oculto) return; const kc = camDe(i);
        const vis = (t, dono, tol) => { const X = Math.floor(t[0]), Y = Math.floor(t[1]); if (X < 0 || Y < 0 || X >= W || Y >= H) return 1; const o = Y * W + X, z = zt[o]; if (z < -1e5 || z <= t[2] + tol) return 1;
          if (id[o] !== kc) return 0.5; const pc = pt[o]; if (dono.includes(pc) && z - t[2] < (dono[0] === 5 || dono[0] === 8 ? 0.35 : 1.3)) return 1; return 0.5; };
        pessoas.push(pontosOpenPose(it, list[i].p, vis, rc)); nomes.push(it.name); });
      out.openpose = { svg: openPoseSvg(pessoas, rc), svgCorpo: openPoseSvg(pessoas, rc, { maos: false, rosto: false, pes: false }), json: openPoseJson(pessoas, nomes, rc) };
    }
    let zmin = 1e9, zmax = -1e9;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = zt[at(x, y)]; if (v > -1e5) { if (v < zmin) zmin = v; if (v > zmax) zmax = v; } }
    const rgba = () => { const px = new Uint8ClampedArray(w * h * 4); for (let i = 3; i < px.length; i += 4) px[i] = 255; return px; };
    if (passes.profundidade) { const px = rgba();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = zt[at(x, y)], o = (y * w + x) * 4, g = v > -1e5 ? Math.round(40 + 215 * (zmax > zmin ? (v - zmin) / (zmax - zmin) : 1)) : 0; px[o] = px[o + 1] = px[o + 2] = g; }
      out.profundidade = { w, h, escala: C, rgba: px, perto: +zmax.toFixed(3), longe: +zmin.toFixed(3) }; }
    const cores = U.cams.map(c => { if (c.membros[0] >= 0) { const it = SCN.list[c.membros[0]]; return { cor: corMascara(it && it.hue, c.membros[0]), nome: it ? it.name : "?" }; } const ob = SCN.objetos[c.obj]; return { cor: corMascara(ob && ob.hue, 7 + (c.obj || 0)), nome: ob ? (ob.nome || ob.tipo) : "objeto" }; });
    const hex = c => "#" + c.map(v => v.toString(16).padStart(2, "0")).join("");
    if (passes.mascara) { const px = rgba();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = id[at(x, y)], o = (y * w + x) * 4; if (k >= 0) { const c = cores[k].cor; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; } }
      out.mascara = { w, h, escala: C, rgba: px, legenda: cores.map(c => ({ nome: c.nome, cor: hex(c.cor) })) }; }
    if (passes.partes) { const px = rgba(), usadas = new Set();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = at(x, y); if (id[o] < 0) continue; const P = PARTES_SEG[pt[o]] || PARTES_SEG[2], c = P[1], q = (y * w + x) * 4; px[q] = c[0]; px[q + 1] = c[1]; px[q + 2] = c[2]; usadas.add(pt[o] || 2); }
      out.partes = { w, h, escala: C, rgba: px, legenda: [...usadas].sort((a, b) => a - b).map(k => ({ nome: PARTES_SEG[k][0], cor: hex(PARTES_SEG[k][1]) })) }; }
    if (passes.normal || passes.canny) {
      /* profundidade suavizada (3×3, só dentro do mesmo item) → normais pela inclinação, em unidades da tela */
      const S0 = telaDoMundo(list[0].p, [list[0].p.tx || 0, list[0].p.ty || 0, list[0].p.tz || 0])[3] || 1, zs = new Float32Array(w * h).fill(-1e6);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = at(x, y), k = id[o]; if (k < 0) continue; let s = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; const oo = at(X, Y); if (id[oo] === k && Math.abs(zt[oo] - zt[o]) < 0.08) { s += zt[oo]; n++; } }
        zs[y * w + x] = s / n; }
      const nor = new Float32Array(w * h * 3);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, z = zs[i]; if (z < -1e5) continue; const k = id[at(x, y)];
        const lado = (dx, dy) => { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) return null; const j = Y * w + X; return zs[j] > -1e5 && id[at(X, Y)] === k && Math.abs(zs[j] - z) < 0.08 ? zs[j] : null; };
        const d = (a, b) => a !== null && b !== null ? (b - a) / 2 : a !== null ? z - a : b !== null ? b - z : 0;
        const gx = d(lado(-1, 0), lado(1, 0)) * S0, gy = d(lado(0, -1), lado(0, 1)) * S0, l = Math.hypot(gx, gy, 1);
        nor[i * 3] = -gx / l; nor[i * 3 + 1] = gy / l; nor[i * 3 + 2] = 1 / l; }
      if (passes.normal) { const px = rgba();
        for (let i = 0; i < w * h; i++) { if (zs[i] < -1e5) continue; px[i * 4] = Math.round((nor[i * 3] + 1) * 127.5); px[i * 4 + 1] = Math.round((nor[i * 3 + 1] + 1) * 127.5); px[i * 4 + 2] = Math.round((nor[i * 3 + 2] + 1) * 127.5); }
        out.normal = { w, h, escala: C, rgba: px, convencao: "R = direita, G = cima, B = para a câmera (fundo preto)" }; }
      if (passes.canny) { const px = rgba(), lim = 12 / S0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = at(x, y), i = y * w + x; let borda = false;
          for (const [dx, dy] of [[1, 0], [0, 1]]) { const X = x + dx, Y = y + dy; if (X >= w || Y >= h) continue; const oo = at(X, Y), j = Y * w + X;
            if (id[o] !== id[oo]) { borda = true; break; } if (id[o] < 0) continue;
            if (Math.abs(zt[o] - zt[oo]) > lim || pt[o] !== pt[oo] && Math.abs(zt[o] - zt[oo]) > lim * 0.25) { borda = true; break; }
            const dn = nor[i * 3] * nor[j * 3] + nor[i * 3 + 1] * nor[j * 3 + 1] + nor[i * 3 + 2] * nor[j * 3 + 2]; if (dn < 0.82) { borda = true; break; } }
          if (borda) { const q = i * 4; px[q] = px[q + 1] = px[q + 2] = 255; } }
        out.canny = { w, h, escala: C, rgba: px }; }
    }
    return comCena(out, list);
  });
}
function comCena(out, list) {
    out.cena = { camera: (() => { const P0 = list[0].p; return { yaw: P0.yaw, pitch: P0.pitch, roll: P0.roll, distancia: P0.camDist, lente: P0.lens, perspectiva: !!P0.persp, alvo: [P0.tx, P0.ty, P0.tz] }; })(),
      manequins: SCN.list.map(it => ({ nome: it.name, x: it.params.wx || 0, z: it.params.wz || 0, giro: it.params.wRot || 0, oculto: !!it.oculto })), objetos: SCN.objetos.map(o => ({ nome: o.nome || o.tipo, tipo: o.tipo, x: o.x, z: o.z, giro: o.giro || 0 })) };
    return out;
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
  const grade = Array.isArray(opts.grade) ? opts.grade : GRADES[opts.grade || ({ 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6" }[Math.min(fotos.length, 6)] || "6")] || GRADES["4"], jp = opts.leitura === "japonesa" || opts.leitura === "direita";
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
        s += f.png ? '<image x="' + c.x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + c.w.toFixed(2) + '" height="' + alt.toFixed(2) + '" preserveAspectRatio="' + (alto ? "xMidYMin slice" : "xMidYMid slice") + '" href="' + f.png + '"/>' : imagemSvg(f.svg, c.x, y, c.w, alt, opts.preparar, alto ? "xMidYMin slice" : "xMidYMid slice");
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
  fotos.forEach((f, i) => { const x = (i % cols) * cw, y = Math.floor(i / cols) * ch, vb = /viewBox="([^"]+)"/.exec(f.svg)[1].split(" ").map(Number), e = Math.min((cw - 16) / vb[2], (ch - 44) / vb[3]), dx = x + (cw - vb[2] * e) / 2 - vb[0] * e, dy = y + 8 + ((ch - 44) - vb[3] * e) / 2 - vb[1] * e;
    s += imagemSvg(f.svg, dx + vb[0] * e, dy + vb[1] * e, vb[2] * e, vb[3] * e, preparar) + '<rect x="' + (x + 8) + '" y="' + (y + 8) + '" width="' + (cw - 16) + '" height="' + (ch - 44) + '" fill="none" stroke="#bbb"/>' +
      '<text x="' + (x + 10) + '" y="' + (y + ch - 14) + '" font-family="sans-serif" font-size="14" fill="#111">' + (i + 1) + ". " + escXml(String(f.titulo || "").slice(0, 26)) + "</text>"; });
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + Wf + " " + Hf + '" width="' + Wf + '" height="' + Hf + '"><rect width="' + Wf + '" height="' + Hf + '" fill="#fff"/>' + s + "</svg>";
}
/* modelos prontos de roteiro */
const MODELOS_ROTEIRO = {
  "Página de luta (ações, efeitos e rostos)": `#cena
cena.limpar();
const ana = cena.ativo.renomear("Ana").posicao(-5, 0).girar(90);
const leo = cena.adicionar({ nome: "Leo", x: 5 }).girar(-90);
camera.perspectiva(true).lente(35);

#quadro 1 — Arrancada 16:9
cena.obter("Ana").acao("corridaSuperRapida");
camera.enquadramento("geral", "Ana");
// fala: Ana: Agora!

#quadro 2 — Soco carregado novo 3:4
cena.obter("Ana").posicao(-2, 0).acao("socoCarregado");
cena.obter("Leo").acao("defesaComBracos");
camera.enquadramento("medio", "Ana");

#quadro 3 — Impacto 4:3
cena.obter("Ana").acao("socando", { efeitos: false });
cena.efeitos.adicionar("explosao_estrelada", { em: { manequim: "Ana", parte: "maoDir" } });
cena.obter("Leo").acao("quedaDeCostas");
camera.enquadramento("geral");

#quadro 4 — Golpe especial (efeito montado por camadas) 16:9
cena.efeitos.limpar();
cena.obter("Ana").acao("lancandoMagia", { efeitos: false });
cena.efeitos.criar([
  { forma: "fita", caminho: { tipo: "helice", comprimento: 16, raio: 0.6, raioFim: 4, voltas: 4 }, traco: { largura: 1.3, perfil: "fuso" }, estilo: "cel" },
  { forma: "aneis", caminho: { tipo: "reta", comprimento: 16, raio: 0.5, raioFim: 6 }, repetir: { n: 7 }, traco: { largura: 0.6, perfil: "cheio" }, estilo: "contorno" }
], { em: { manequim: "Ana", parte: "maoDir" }, direcao: "Leo" });
camera.enquadramento("geral");
// fala: Ana: Tornado de fita!

#quadro 5 — Ajudando a levantar 3:4
cena.efeitos.limpar();
cena.interagir("Ana", "Leo", "ajudarALevantar");
cena.obter("Ana").expressao("alivio");
camera.enquadramento("geral");
`,
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
cena.obter("Mia").espelhar().mover(3, 0);`,
  "Giro 360° (turntable)": `#cena
cena.limpar();
cena.ativo.renomear("Ana").poseRapida("contrapposto");
camera.perspectiva(true).lente(50);

// 8 quadros girando em volta da Ana, a 10° acima do horizonte; troque o número para mais vistas
#orbita "Ana" 8 elevacao 10 1:1 — Giro`,
  "Ficha do personagem": `#cena
cena.limpar();
cena.ativo.renomear("Ana");
cena.ativo.expressao("neutra");

// frente, 3/4, perfil e costas, sem perspectiva (como numa folha de modelo); "completa" = as 8 vistas
#ficha "Ana" orto vertical — Ana

#quadro novo 1:1 — Rosto
cena.ativo.expressao("alegria");
camera.orbitar("Ana", { azimute: "3/4 esquerda", elevacao: 0 }).enquadramento("close", "Ana");`
};
export { FORMATOS_QUADRO, recorteQuadro, lerRoteiro, executarRoteiro, renderizarQuadro, pontosOpenPose, openPoseSvg, openPoseJson, OP_NOMES, PARTES_SEG, PASSES_QUADRO, manifestoQuadros, pastaQuadro, paginaQuadros, GRADES, folhaDeContato, MODELOS_ROTEIRO, chaveDe };
