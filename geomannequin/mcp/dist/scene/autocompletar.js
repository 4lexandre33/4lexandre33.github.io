/* GeoMannequin — AUTOCOMPLETAR com MINIATURA para o editor de texto do name e do filme.
   Depois de uma palavra-chave e de "." (ou espaço) aparece a lista com uma miniatura de cada opção:
     câmera: plano/enquadramento, angulo, lado, lente, movimentos (camera …), curvas, transições, ritmo
     página: formato, borda, tamanho, tipos de balão
     gente: expressao, gesto, atitude, interacao, efeito, objeto, corpo, tom
     animais: animal (espécies), pose do animal, anima (animações de animal), marchas
     pré-configurações: "preset " e depois "." desce na árvore (dialogo. → dois. → frente. → ombro-a-dir)
   As miniaturas de câmera, gente, animais e presets são DESENHOS DE VERDADE (um quadro pequeno compilado e renderizado, com cache);
   movimentos, curvas, transições, ritmo e página são diagramas. */
import { PD_AC_EXTRA, PD_AC_ANTES, PD_MINI_EXTRA, pdNorm } from "./pose-dsl.js";
import { EXPRESSOES } from "./poses.js";
import { INTERACOES } from "./interacoes.js";
import { GESTOS_CONVERSA, ATITUDES, CURVAS, TONS_FALA } from "./animacao.js";
import { AM_POSES, AM_MARCHAS } from "./animais.js";
import { listaAnimacoesAnimal } from "./animais-anim.js";
import { PRECONFIG, pcProximos, pcAchar, pcDemoTexto } from "./preconfig.js";
import { TONS_CENA, renderizarQuadro } from "./quadros.js";
import { compilarName } from "./name-dsl.js";
import { CATALOGO, TIPOS_OBJETO, QD_ESPECIES, TONS, ELEMENTOS } from "../engine/index.js";

const AC_ENQ = { geral: "o lugar todo", conjunto: "o grupo e o lugar", inteiro: "corpo inteiro", americano: "dos joelhos para cima", medio: "da cintura para cima", "primeiro-plano": "do peito para cima", close: "o rosto", detalhe: "um pedaço (olhos, mão)" };
const AC_ANG = { normal: "na altura dos olhos", plongee: "de cima (diminui)", "contra-plongee": "de baixo (engrandece)", zenital: "a pino, de cima", nadir: "a pino, de baixo", holandes: "inclinado (tensão)" };
const AC_LADO = { frente: "de frente", "3/4": "três quartos", "3/4-direita": "três quartos pela direita", perfil: "de lado", "perfil-direito": "de lado (direita)", costas: "de costas" };
const AC_LENTE = { 14: "ultra grande-angular", 24: "grande-angular", 35: "natural aberta", 50: "normal", 85: "retrato", 135: "tele", 200: "super tele" };
const AC_MOV = { aproxima: "dolly in", afasta: "dolly out", orbita: "gira em volta", grua: "sobe / desce", travelling: "anda de lado", panoramica: "gira no lugar (pan)", inclina: "tilt", tremida: "câmera na mão", zoom: "zoom da lente", vertigo: "dolly zoom", eleva: "sobe para plongée", abaixa: "desce para contra-plongée", segue: "acompanha alguém", fixa: "parada", pov: "pelos olhos", "sobre-o-ombro": "OTS", caminho: "percurso por pontos", preset: "pré-configuração" };
const AC_TRANS = { corte: "corte seco", fusao: "uma imagem dissolve na outra", escurece: "fade para preto", clareia: "fade para branco" };
const AC_RITMO = { momento: "momento a momento", acao: "ação a ação", sujeito: "sujeito a sujeito", aspecto: "aspecto a aspecto", lugar: "troca de lugar", tempo: "passagem de tempo", cena: "cena a cena", "non-sequitur": "sem relação" };
const AC_FORMATO = { manga: "B5 182×257", comic: "6,625×10,25\"", a4: "A4", quadrado: "1:1", webtoon: "tira vertical", livre: "sem página", "16:9": "cinema/TV", "2.39:1": "scope", "4:3": "TV antiga", "9:16": "celular", "1:1": "quadrado" };
const AC_BORDA = { normal: "borda comum", diagonal: "painel inclinado (ação)", nenhuma: "sem borda (memória)", grossa: "borda grossa" };
const AC_TAM = { pequeno: "70%", normal: "100%", grande: "2×", largo: "largo", alto: "alto", inserto: "inserto", splash: "página toda" };
const AC_BALAO = { fala: "oval", pensa: "nuvem", grita: "estourado", sussurra: "tracejado", radio: "zigue-zague", narra: "caixa de narração" };
const AC_CORPO = { masculino: "", feminino: "", crianca: "", menino: "", menina: "", magro: "biotipo", atletico: "biotipo", musculoso: "biotipo", cheio: "biotipo", gigante: "3,5×", anao: "0,62×", fada: "0,12×", tita: "10×", miniatura: "0,2×" };

/* ===== miniaturas desenhadas (quadro pequeno de verdade), com cache ===== */
const AC_CACHE = new Map();
const acImg = svg => '<img alt="" src="data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) + '">';
function acQuadro(texto) { if (AC_CACHE.has(texto)) return AC_CACHE.get(texto); let s = "";
  try { const r = compilarName(texto, { semCache: true, salvar: false }); const q = r.quadros[0]; if (q) s = acImg(renderizarQuadro(q, { passes: false, semFundo: false }).svg); } catch (e) { s = ""; }
  if (AC_CACHE.size > 300) AC_CACHE.clear(); AC_CACHE.set(texto, s); return s; }
const AC_EL1 = "elenco\n  Kai relevante corpo masculino\n", AC_EL2 = AC_EL1 + "  Mira relevante corpo feminino\n";
function acTexto(m) {
  switch (m.tipo) {
    case "enq": return AC_EL1 + "quadro 1 " + m.v + " alvo Kai lado 3/4\n  Kai em (0,0)\n";
    case "ang": return AC_EL1 + "quadro 1 americano alvo Kai lado 3/4 angulo " + m.v + "\n  Kai em (0,0)\n";
    case "lado": return AC_EL1 + "quadro 1 americano alvo Kai lado " + m.v + "\n  Kai em (0,0)\n";
    case "lente": return AC_EL2 + "quadro 1 americano alvo Kai lado 3/4 lente " + m.v + "\n  Kai em (0,0)\n  Mira em (1.5,-4)\n";
    case "tom": return AC_EL2 + "quadro 1 medio alvo Kai, Mira tom " + m.v + "\n  Kai em (0,0) gira 30\n  Mira em (1,1) gira -150\n";
    case "expr": return AC_EL1 + "quadro 1 close alvo Kai lado frente\n  Kai em (0,0) expressao " + m.v + "\n";
    case "gesto": return AC_EL1 + "quadro 1 medio alvo Kai lado 3/4\n  Kai em (0,0) gesto " + m.v + "\n";
    case "atitude": return AC_EL1 + "quadro 1 inteiro alvo Kai lado 3/4\n  Kai em (0,0) atitude " + m.v + "\n";
    case "interacao": return AC_EL2 + "quadro 1 inteiro alvo Kai, Mira lado perfil\n  Kai em (0,0) interacao " + m.v + " com Mira\n";
    case "efeito": return AC_EL1 + "quadro 1 inteiro alvo Kai lado 3/4\n  Kai em (0,0) efeito " + m.v + " colorido\n";
    case "objeto": return AC_EL1 + "quadro 1 conjunto alvo Kai lado 3/4\n  Kai em (-0.6,0)\n  objeto " + m.v + ' "o" em (0.5,0.3)\n';
    case "corpo": return "elenco\n  Kai relevante corpo " + (/^(magro|atletico|musculoso|cheio)$/.test(m.v) ? "masculino " + m.v : m.v) + "\nquadro 1 inteiro alvo Kai lado 3/4\n  Kai em (0,0)\n";
    case "especie": return "elenco\n  Trovao animal " + m.v + "\nquadro 1 alvo Trovao\n  Trovao em (0,0) gira 90\n";
    case "apose": return "elenco\n  Trovao animal cavalo\nquadro 1 alvo Trovao\n  Trovao em (0,0) gira 90 pose " + m.v + "\n";
    case "aanim": return "elenco\n  Trovao animal cavalo\nquadro 1 alvo Trovao\n  Trovao em (0,0) gira 90\n  Trovao anima " + m.v + "\n";
    case "preset": { const d = pcAchar(m.v); return d ? pcDemoTexto(d) : ""; }
    case "ramo": { const d = pcAchar(m.exemplo); return d ? pcDemoTexto(d) : ""; }
  } return ""; }
/* ===== miniaturas prontas (atlas gerados por ferramentas/miniaturas.mjs): instantâneas; sem atlas, desenha na hora ===== */
const AC_ATLAS = { indice: null, base: "img/miniaturas/", pedido: false };
function acCarregarAtlas() { if (AC_ATLAS.pedido || typeof fetch === "undefined" || typeof document === "undefined") return; AC_ATLAS.pedido = true;
  /* arquivo único: os atlas vêm embutidos (data: URI) */
  if (typeof window !== "undefined" && window.GM_MINIATURAS) { const G = window.GM_MINIATURAS; AC_ATLAS.indice = G.indice; AC_ATLAS.urls = G.arquivos; return; }
  fetch(AC_ATLAS.base + "indice.json").then(r => r.ok ? r.json() : null).then(j => { AC_ATLAS.indice = j; }).catch(() => { }); }
function acSprite(m) { acCarregarAtlas(); const I = AC_ATLAS.indice; if (!I) return ""; const tipo = m.tipo === "ramo" ? "preset" : m.tipo, v = m.tipo === "ramo" ? m.exemplo : m.v, A = I[tipo]; if (!A || A.itens[v] === undefined) return "";
  const i = A.itens[v], c = i % A.cols, r = Math.floor(i / A.cols), rows = Math.ceil(A.n / A.cols);
  return '<i class="ac-sp" style="background-image:url(' + (AC_ATLAS.urls ? AC_ATLAS.urls[A.arquivo] : AC_ATLAS.base + A.arquivo) + ");background-size:" + A.cols * 100 + "% " + rows * 100 + "%;background-position:" + (A.cols > 1 ? c / (A.cols - 1) * 100 : 0) + "% " + (rows > 1 ? r / (rows - 1) * 100 : 0) + '%"></i>'; }
acCarregarAtlas();
/* todas as miniaturas desenháveis (para gerar os atlas) */
function acTodas() { const out = {}, add = (t, ks) => { out[t] = [...new Set(ks)]; };
  add("enq", Object.keys(AC_ENQ)); add("ang", Object.keys(AC_ANG)); add("lado", Object.keys(AC_LADO)); add("lente", Object.keys(AC_LENTE)); add("tom", Object.keys(TONS_CENA));
  add("expr", Object.keys(EXPRESSOES)); add("gesto", Object.keys(GESTOS_CONVERSA)); add("atitude", Object.keys(ATITUDES)); add("interacao", Object.keys(INTERACOES)); add("efeito", Object.keys(CATALOGO));
  add("objeto", Object.keys(TIPOS_OBJETO)); add("corpo", Object.keys(AC_CORPO)); add("especie", Object.keys(QD_ESPECIES)); add("apose", Object.keys(AM_POSES));
  add("aanim", listaAnimacoesAnimal().map(a => a.nome || a).concat(Object.keys(AM_MARCHAS))); add("preset", PRECONFIG.map(d => d.id)); return out; }

/* ===== diagramas (sem render) ===== */
const AC_V = (c, w = 120, h = 68) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '"><rect width="' + w + '" height="' + h + '" rx="6" fill="#f4f1ea"/>' + c + "</svg>";
const AC_S = 'stroke="#333" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"', AC_A = 'stroke="#d0452f" stroke-width="2.5" fill="none" marker-end="url(#ac-p)"';
const AC_MK = '<defs><marker id="ac-p" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#d0452f"/></marker></defs>';
const acCam = (x, y, a = 0) => '<g transform="translate(' + x + " " + y + ") rotate(" + a + ')"><rect x="-9" y="-6" width="14" height="12" rx="2" fill="#333"/><path d="M5 -4L12 -8V8L5 4z" fill="#333"/></g>';
const acBoneco = (x, y, s = 1) => '<g transform="translate(' + x + " " + y + ") scale(" + s + ')"><circle cx="0" cy="-22" r="5" fill="#4a7bd0"/><path d="M0 -17V2M0 2L-6 16M0 2L6 16M0 -12L-8 -2M0 -12L8 -2" stroke="#4a7bd0" stroke-width="3" fill="none" stroke-linecap="round"/></g>';
function acDiagrama(m) { const v = m.v;
  if (m.tipo === "cmov") { const b = acBoneco(70, 50, 0.9); const d = {
      aproxima: acCam(20, 34) + '<path d="M32 34H52" ' + AC_A + "/>", afasta: acCam(46, 34, 180) + '<path d="M34 34H14" ' + AC_A + "/>", orbita: '<ellipse cx="70" cy="40" rx="40" ry="14" ' + AC_S + ' stroke-dasharray="3 3"/>' + acCam(32, 46) + '<path d="M36 54Q70 62 104 48" ' + AC_A + "/>",
      grua: acCam(24, 50) + '<path d="M24 40V12" ' + AC_A + "/>", travelling: acCam(20, 58, -90) + '<path d="M30 60H100" ' + AC_A + "/>", panoramica: acCam(30, 34) + '<path d="M44 20Q56 34 44 48" ' + AC_A + "/>", inclina: acCam(30, 34) + '<path d="M46 46Q56 34 46 20" ' + AC_A + "/>",
      tremida: acCam(30, 34) + '<path d="M14 18l6 -4 6 6 6 -6 6 6" ' + AC_A + "/>", zoom: acCam(24, 34) + '<path d="M36 26L56 18M36 42L56 50" ' + AC_S + '/><path d="M40 34H54" ' + AC_A + "/>", vertigo: acCam(22, 34) + '<path d="M34 34H50" ' + AC_A + '/><path d="M36 20L60 10M36 48L60 58" ' + AC_S + "/>",
      eleva: acCam(22, 50) + '<path d="M26 44Q30 20 44 14" ' + AC_A + "/>", abaixa: acCam(22, 18) + '<path d="M26 26Q30 50 44 56" ' + AC_A + "/>", segue: acCam(22, 50) + '<path d="M34 50H52" ' + AC_A + '/><path d="M80 50H100" ' + AC_A + "/>",
      fixa: acCam(26, 34) + '<path d="M26 44V58M20 58H32" ' + AC_S + "/>", pov: '<circle cx="24" cy="30" r="8" ' + AC_S + '/><circle cx="24" cy="30" r="3" fill="#333"/><path d="M34 30H54" ' + AC_A + "/>", "sobre-o-ombro": '<circle cx="34" cy="28" r="10" fill="#d0452f" opacity=".7"/>' + acCam(14, 22),
      caminho: acCam(16, 54) + '<path d="M24 52Q44 10 70 30T112 16" ' + AC_A + ' stroke-dasharray="4 3"/>', preset: '<rect x="10" y="12" width="44" height="44" rx="4" ' + AC_S + '/><path d="M18 24H46M18 34H40M18 44H44" ' + AC_S + "/>" + acCam(80, 34) }[v] || acCam(30, 34);
    return AC_V(AC_MK + d + (/^(pov|sobre-o-ombro|preset|zoom)$/.test(v) ? "" : b)); }
  if (m.tipo === "curva") { const f = { linear: u => u, entra: u => u * u, sai: u => 1 - (1 - u) * (1 - u), suave: u => u * u * (3 - 2 * u), elastico: u => 1 - Math.cos(u * 9) * (1 - u), salto: u => Math.min(1, Math.abs(Math.sin(u * 6)) * (1 - u) * 0.6 + u), passo: u => Math.floor(u * 4) / 4 }[v] || (u => u * u * (3 - 2 * u));
    const pts = Array.from({ length: 31 }, (_, i) => { const u = i / 30; return (12 + u * 96).toFixed(1) + "," + (58 - f(u) * 46).toFixed(1); }).join(" "); return AC_V('<path d="M12 58H108M12 58V10" stroke="#bbb"/><polyline points="' + pts + '" ' + AC_S + ' stroke="#d0452f"/>'); }
  if (m.tipo === "trans") { const g = { corte: '<rect x="10" y="14" width="46" height="40" fill="#4a7bd0"/><rect x="64" y="14" width="46" height="40" fill="#d0452f"/>', fusao: '<rect x="10" y="14" width="60" height="40" fill="#4a7bd0"/><rect x="50" y="14" width="60" height="40" fill="#d0452f" opacity=".55"/>', escurece: '<defs><linearGradient id="ac-e"><stop offset="0" stop-color="#4a7bd0"/><stop offset="1" stop-color="#000"/></linearGradient></defs><rect x="10" y="14" width="100" height="40" fill="url(#ac-e)"/>', clareia: '<defs><linearGradient id="ac-c"><stop offset="0" stop-color="#4a7bd0"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect x="10" y="14" width="100" height="40" fill="url(#ac-c)" stroke="#ccc"/>' }[v] || ""; return AC_V(g); }
  if (m.tipo === "ritmo") { const gap = { momento: 4, acao: 8, sujeito: 12, aspecto: 16, lugar: 28, tempo: 28, cena: 34, "non-sequitur": 22 }[v] || 10; return AC_V('<rect x="30" y="4" width="60" height="' + ((60 - gap) / 2) + '" ' + AC_S + '/><rect x="30" y="' + (4 + (60 - gap) / 2 + gap) + '" width="60" height="' + ((60 - gap) / 2) + '" ' + AC_S + "/>"); }
  if (m.tipo === "formato") { const r = { manga: 182 / 257, comic: 6.625 / 10.25, a4: 210 / 297, quadrado: 1, webtoon: 0.3, livre: 1.5, "16:9": 16 / 9, "2.39:1": 2.39, "4:3": 4 / 3, "9:16": 9 / 16, "1:1": 1 }[v] || 1, h = r >= 1.76 ? 56 / (r / 1.76) : 56, w = h * r; return AC_V('<rect x="' + (60 - w / 2) + '" y="' + (34 - h / 2) + '" width="' + w + '" height="' + h + '" fill="#fff" ' + AC_S + "/>"); }
  if (m.tipo === "borda") { const g = { normal: '<rect x="20" y="10" width="80" height="48" fill="#fff" ' + AC_S + "/>", diagonal: '<path d="M20 14L100 8L100 58L20 62z" fill="#fff" ' + AC_S + "/>", nenhuma: '<rect x="20" y="10" width="80" height="48" fill="#fff" stroke="#bbb" stroke-dasharray="3 3"/>', grossa: '<rect x="20" y="10" width="80" height="48" fill="#fff" stroke="#111" stroke-width="5"/>' }[v]; return AC_V(g || ""); }
  if (m.tipo === "tam") { const k = { pequeno: [36, 26], normal: [52, 34], grande: [90, 50], largo: [100, 30], alto: [40, 58], inserto: [30, 22], splash: [110, 62] }[v] || [52, 34]; return AC_V('<rect x="' + (60 - k[0] / 2) + '" y="' + (34 - k[1] / 2) + '" width="' + k[0] + '" height="' + k[1] + '" fill="#fff" ' + AC_S + "/>"); }
  if (m.tipo === "balao") { const g = { fala: '<ellipse cx="60" cy="28" rx="42" ry="18" fill="#fff" ' + AC_S + '/><path d="M48 44L40 60L60 45" fill="#fff" ' + AC_S + "/>", pensa: '<ellipse cx="60" cy="26" rx="42" ry="17" fill="#fff" ' + AC_S + ' stroke-dasharray="1 0"/><circle cx="40" cy="50" r="5" fill="#fff" ' + AC_S + '/><circle cx="32" cy="60" r="3" fill="#fff" ' + AC_S + "/>",
      grita: '<path d="M20 30L32 22L30 10L48 18L60 6L70 18L90 10L88 24L104 30L90 38L96 52L76 44L62 58L52 44L32 52L36 38z" fill="#fff" ' + AC_S + "/>", sussurra: '<ellipse cx="60" cy="28" rx="42" ry="18" fill="#fff" ' + AC_S + ' stroke-dasharray="4 3"/>', radio: '<path d="M20 28L28 14L40 20L52 8L64 18L78 8L90 20L102 16L98 30L104 42L88 44L76 52L62 44L46 52L36 42L22 42z" fill="#fff" ' + AC_S + "/>", narra: '<rect x="14" y="12" width="92" height="36" fill="#fff8d8" ' + AC_S + "/>" }[v]; return AC_V(g || ""); }
  return ""; }
PD_MINI_EXTRA.fn = (m) => { const sp = acSprite(m); if (sp) return sp; if (/^(cmov|curva|trans|ritmo|formato|borda|tam|balao)$/.test(m.tipo)) return acDiagrama(m); if (typeof document !== "undefined" && !AC_ATLAS.indice && AC_ATLAS.pedido) return ""; const t = acTexto(m); return t ? acQuadro(t) : ""; };

/* ===== as listas por palavra-chave ===== */
const acL = (obj, tipo, desc) => ({ pv, item }) => Object.keys(obj).map(k => item(pv + k + " ", tipo, typeof desc === "function" ? desc(k) : (obj[k] || desc || ""), { tipo, v: k }));
Object.assign(PD_AC_EXTRA, {
  plano: acL(AC_ENQ, "enq"), enquadramento: acL(AC_ENQ, "enq"), angulo: acL(AC_ANG, "ang"), "ângulo": acL(AC_ANG, "ang"), lado: acL(AC_LADO, "lado"), vista: acL(AC_LADO, "lado"), lente: acL(AC_LENTE, "lente"),
  camera: acL(AC_MOV, "cmov"), "câmera": acL(AC_MOV, "cmov"), curva: acL(Object.fromEntries(Object.keys(CURVAS).map(k => [k, ""])), "curva"),
  transicao: acL(AC_TRANS, "trans"), "transição": acL(AC_TRANS, "trans"), ritmo: acL(AC_RITMO, "ritmo"), formato: acL(AC_FORMATO, "formato"), borda: acL(AC_BORDA, "borda"), tamanho: acL(AC_TAM, "tam"),
  tom: a => /\b(fala|grita|pensa|sussurra|dialogo|diálogo|conversa)\b/i.test(a.linha) ? Object.keys(TONS_FALA).map(k => a.item(a.pv + k + " ", "tom", "tom da fala")) : /\befeito\b/i.test(a.linha) ? Object.keys(TONS).map(k => a.item(a.pv + k + " ", "tom", "tom do efeito")) : acL(Object.fromEntries(Object.keys(TONS_CENA).map(k => [k, "tom da cena"])), "tom")(a),
  elemento: a => Object.keys(ELEMENTOS).map(k => a.item(a.pv + k + " ", "elemento", "paleta do efeito")),
  expressao: acL(Object.fromEntries(Object.keys(EXPRESSOES).map(k => [k, ""])), "expr"), "expressão": acL(Object.fromEntries(Object.keys(EXPRESSOES).map(k => [k, ""])), "expr"),
  gesto: acL(Object.fromEntries(Object.keys(GESTOS_CONVERSA).map(k => [k, GESTOS_CONVERSA[k].desc || ""])), "gesto"), atitude: acL(Object.fromEntries(Object.keys(ATITUDES).map(k => [k, ATITUDES[k].desc || ""])), "atitude"),
  interacao: acL(Object.fromEntries(Object.keys(INTERACOES).map(k => [k, (INTERACOES[k] && INTERACOES[k].desc) || ""])), "interacao"), "interação": acL(Object.fromEntries(Object.keys(INTERACOES).map(k => [k, ""])), "interacao"),
  efeito: acL(Object.fromEntries(Object.keys(CATALOGO).map(k => [k, (CATALOGO[k] && CATALOGO[k].nome) || ""])), "efeito"), objeto: acL(Object.fromEntries(Object.keys(TIPOS_OBJETO).map(k => [k, ""])), "objeto"),
  corpo: acL(AC_CORPO, "corpo"), animal: acL(Object.fromEntries(Object.keys(QD_ESPECIES).map(k => [k, "espécie"])), "especie"), balao: acL(AC_BALAO, "balao")
});
/* "pose" de animal e "anima" de animal: só quando a linha começa com um animal do elenco (o resto continua com as poses de gente) */
const acEhAnimal = (linha, info, antes) => { const n = (/^\s*(\S+)/.exec(linha) || [])[1]; if (!n) return false; if ((info.animais || []).includes(n)) return true; return new RegExp("^\\s+" + n.replace(/[^\wÀ-ÿ-]/g, "") + "\\s+animal\\b", "m").test(antes); };
PD_AC_ANTES.push((antes, info) => { const linha = antes.split("\n").pop();
  /* "corpo." no elenco = tipos de corpo (em pose/animação continua sendo a junta) */
  { const k = /(^|\s)(corpo)([. ])([\w-]*)$/.exec(linha), blocos = antes.split("\n").filter(l => /^\S/.test(l)), bloco = pdNorm((/^(\S+)/.exec(blocos[blocos.length - 1] || "") || [])[1] || "");
    if (k && !/^(pose|animacao|animação|ciclo)$/.test(bloco)) { const pv = k[3] === "." ? " " : "", pre = pdNorm(k[4]);
      const itens = Object.keys(AC_CORPO).filter(x => x.startsWith(pre)).map(x => ({ v: pv + x + " ", r: x, tipo: "corpo", d: AC_CORPO[x], mini: { tipo: "corpo", v: x } }));
      if (itens.length) return { itens, de: antes.length - k[4].length - (k[3] === "." ? 1 : 0), ponto: k[3] === "." }; } }
  /* pré-configurações: preset + caminho com pontos */
  let m = /\bpreset\s+([\w.-]*)$/i.exec(linha);
  if (m) { const cam = m[1], i = cam.lastIndexOf("."), pref = i >= 0 ? cam.slice(0, i) : "", resto = pdNorm(i >= 0 ? cam.slice(i + 1) : cam);
    const itens = pcProximos(pref).filter(n => n.nome.startsWith(resto) || (resto.length > 2 && n.nome.includes(resto))).slice(0, 80).map(n => { const d = n.folha ? pcAchar(n.id) : null;
      return { v: n.nome + (n.folha ? " com " : "."), r: n.nome, tipo: n.folha ? "preset" : "ramo", d: n.folha ? d.nome + " · " + d.tecnico + " · papéis " + d.papeis.join(", ") : n.total + " pré-configurações", mini: n.folha ? { tipo: "preset", v: n.id } : { tipo: "ramo", exemplo: n.exemplo } }; });
    if (itens.length) return { itens, de: antes.length - (i >= 0 ? cam.length - i - 1 : cam.length), ponto: false }; }
  m = /^\s*(\S+)\s+.*\b(pose|anima)([. ])([\w-]*)$/i.exec(linha) || /^\s*\S+\s+(pose|anima)([. ])([\w-]*)$/i.exec(linha);
  if (m && acEhAnimal(linha, info, antes)) { const w = pdNorm(m[m.length - 3]), sep = m[m.length - 2], pre = pdNorm(m[m.length - 1]), pv = sep === "." ? " " : "";
    const nomes = w === "pose" ? Object.keys(AM_POSES) : listaAnimacoesAnimal().map(a => a.nome || a).concat(Object.keys(AM_MARCHAS));
    const itens = [...new Set(nomes)].filter(n => pdNorm(n).startsWith(pre)).slice(0, 70).map(n => ({ v: pv + n + " ", r: n, tipo: w === "pose" ? "pose-animal" : "animacao-animal", d: w === "pose" ? "pose de animal" : "animação de animal", mini: { tipo: w === "pose" ? "apose" : "aanim", v: n } }));
    if (itens.length) return { itens, de: antes.length - m[m.length - 1].length - (sep === "." ? 1 : 0), ponto: sep === "." }; }
  return null; });
function acListas() { return { total: Object.keys(PD_AC_EXTRA).length, palavras: Object.keys(PD_AC_EXTRA), presets: PRECONFIG.length }; }
export { acTodas, acSprite, AC_ATLAS, acQuadro, acListas, acTexto, acDiagrama, AC_ENQ, AC_ANG, AC_LADO, AC_LENTE, AC_MOV };
void TONS;
