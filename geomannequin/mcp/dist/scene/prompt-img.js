/* GeoMannequin — PROMPT DE IMAGEM: a cena montada (manequins, objetos, animais, veículos, lugar, efeitos) + a câmera viram um
   texto para gerar a imagem numa IA (Google Flow e afins), com a POSIÇÃO CALCULADA pela projeção da câmera (onde cada um cai no
   quadro, em %; quem está na frente de quem; distâncias em metros; de frente/perfil/costas para a câmera; altura e inclinação da
   câmera; lente), CORES POR CÓDIGO (#RRGGBB + nome aproximado), proporção da imagem e GRADE (folha 3x3, 2x2, 3x5…: cada quadro
   do texto é uma célula; "variar lado frente, 3/4, perfil" preenche a grade).
   Texto (a linguagem do Name, com um bloco "prompt" no começo):
     prompt
       formato 16:9                      (proporção da imagem final: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9 ou "1200x800")
       grade 3x3                         (colunas x linhas; 1x1 = imagem única)
       estilo "anime, cel shading"       · idioma en|pt|ambos · situacao "…" · lugar "…" · luz "…" · hora "…" · clima "…"
       negativo "texto, marca d'água"    · detalhe "…" (vai no fim) · compacto (prompt curto)
       var jaqueta = #1F4E79              (variável: use ${jaqueta} em qualquer lugar)
       Kai = "rapaz de 20 anos, cabelo preto #111111, jaqueta ${jaqueta}"   (como a pessoa/objeto aparece)
       variar lado frente, 3/4, perfil   (também: angulo, plano, lente, pose, expressao)
   Saída: piGerar(texto) → { ok, erros, avisos, celulas[], prompt{en,pt}, paleta[], ... }; piArquivos(res) → arquivos do ZIP.
   Puro (sem página): o site, o MCP e a linha de comando usam o mesmo. */
import { SCN, P, corObjeto, instColors } from "./modelo.js";
import { sceneState, loadScene } from "./estado.js";
import { pMundo } from "./colisoes.js";
import { compilarName, fichaDoQuadro } from "./name-dsl.js";
import { renderizarQuadro, recorteQuadro } from "./quadros.js";
import { pdMiniatura, pdValoresPose, pdParams } from "./pose-dsl.js";
import { listaPosesExtras } from "./poses-extra.js";
import { acTexto } from "./autocompletar.js";
import { capsulas, telaDoMundo, cameraNoMundo, restGround, capsulasObjeto, partesDoObjeto, TIPOS_OBJETO, QD_ESPECIES } from "../engine/index.js";

const PI_M = 0.114, PI_D = 180 / Math.PI;
const piNorm = t => String(t == null ? "" : t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const piPc = v => Math.round(v * 100);
const piF1 = v => (Math.round(v * 10) / 10).toString(), piF2 = v => (Math.round(v * 100) / 100).toString();

/* ===== cores: nome aproximado (pt/en) + código ===== */
const PI_CORES = [["#000000", "preto", "black"], ["#1c1c1c", "preto suave", "soft black"], ["#3a3a3a", "cinza-chumbo", "charcoal grey"], ["#6b6b6b", "cinza", "grey"], ["#a8a8a8", "cinza-claro", "light grey"], ["#dcdcdc", "cinza-gelo", "pale grey"], ["#ffffff", "branco", "white"], ["#f5f0e1", "creme", "cream"],
  ["#8e1b1b", "vermelho-escuro", "dark red"], ["#c0392b", "vermelho", "red"], ["#e04848", "vermelho vivo", "bright red"], ["#ff6f61", "coral", "coral"], ["#f4a6a6", "rosa-claro", "light pink"], ["#e84a8a", "rosa", "pink"], ["#ff1f8f", "rosa-choque", "hot pink"], ["#7b1f4b", "vinho", "wine"],
  ["#5a2d0c", "marrom-escuro", "dark brown"], ["#8b5a2b", "marrom", "brown"], ["#c48a4a", "caramelo", "caramel"], ["#d2b48c", "bege", "beige"], ["#e8c39e", "pele clara", "light skin tone"], ["#a0673f", "pele morena", "tan skin tone"], ["#5c3a21", "pele escura", "dark skin tone"],
  ["#f08a24", "laranja", "orange"], ["#ff9e3d", "laranja-claro", "light orange"], ["#b35a00", "laranja queimado", "burnt orange"], ["#f2c230", "amarelo", "yellow"], ["#ffe066", "amarelo-claro", "light yellow"], ["#c9a227", "dourado", "gold"], ["#b5a642", "mostarda", "mustard"],
  ["#2e6b2e", "verde-escuro", "dark green"], ["#3aa655", "verde", "green"], ["#7ccf6a", "verde-claro", "light green"], ["#6b8e23", "verde-oliva", "olive green"], ["#2ec4a6", "verde-água", "teal green"], ["#1a5e5e", "petróleo", "deep teal"],
  ["#22b5c8", "ciano", "cyan"], ["#8fd3f4", "azul-claro", "light blue"], ["#bcd4e6", "azul-acinzentado claro", "pale blue-grey"], ["#c9e4f5", "azul-bebê", "baby blue"], ["#7a9cbf", "azul-acinzentado", "steel blue"], ["#3ba7ff", "azul-celeste", "sky blue"], ["#3f6fe0", "azul", "blue"], ["#1f4e79", "azul-marinho", "navy blue"], ["#0d1b3e", "azul-noite", "midnight blue"], ["#2e4a7d", "azul-jeans", "denim blue"],
  ["#9a4fd0", "roxo", "purple"], ["#5b2a86", "roxo-escuro", "dark purple"], ["#c9a0e8", "lilás", "lilac"], ["#6a5acd", "violeta", "violet"], ["#c0c0c0", "prata", "silver"]];
const piRgb = h => { const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(h || "").trim()); if (!m) return null; let x = m[1]; if (x.length === 3) x = x.split("").map(c => c + c).join(""); return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16)); };
const piHex = h => { const r = piRgb(h); return r ? "#" + r.map(v => v.toString(16).padStart(2, "0")).join("").toUpperCase() : null; };
function piDistCor(a, b) { const A = piRgb(a), B = piRgb(b); if (!A || !B) return 999; const rm = (A[0] + B[0]) / 2, d = A.map((v, i) => v - B[i]); return Math.sqrt((2 + rm / 256) * d[0] * d[0] + 4 * d[1] * d[1] + (2 + (255 - rm) / 256) * d[2] * d[2]); }
function piNomeCor(hex) { const h = piHex(hex); if (!h) return null; let m = PI_CORES[0], d = 1e9; for (const c of PI_CORES) { const e = piDistCor(h, c[0]); if (e < d) { d = e; m = c; } } return { hex: h, pt: m[1], en: m[2] }; }
/* "#1F4E79" dentro de um texto vira "azul-marinho (#1F4E79)" (en: "navy blue (#1F4E79)") */
const PI_PALAVRAS_COR = new Set(PI_CORES.flatMap(c => [c[1], c[2]]).flatMap(n => piNorm(n).split(/[\s-]+/)).concat(["rosa", "vermelha", "vermelho", "amarela", "amarelo", "branca", "preta", "roxa", "dourada", "prateado", "prateada", "escuro", "escura", "claro", "clara", "neon", "azul", "verde", "cinza", "marrom", "laranja"]).filter(w => w.length > 2 && !/^(de|tom|skin|tone)$/.test(w)));
function piCoresNoTexto(t, lingua) { return String(t || "").replace(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi, (h, at, str) => { const c = piNomeCor(h); if (!c) return h; const antes = piNorm(str.slice(Math.max(0, at - 24), at)).split(/[^a-z-]+/).filter(Boolean).slice(-1); if (antes.some(w => PI_PALAVRAS_COR.has(w))) return "(" + c.hex + ")"; return (lingua === "en" ? c.en : c.pt) + " (" + c.hex + ")"; }); }
const piHexesDe = t => (String(t || "").match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) || []).map(piHex);

/* ===== nomes de objetos, animais e poses em inglês (o que não estiver aqui vai como está) ===== */
const PI_EN = { mesa: "table", cadeira: "chair", banco: "bench", sofa: "sofa", cama: "bed", caixa: "box", cubo: "cube", cilindro: "cylinder", esfera: "sphere", parede: "wall", porta: "door", janela: "window", escada: "stairs", estante: "bookshelf", armario: "wardrobe", balcao: "counter",
  arvore: "tree", pedra: "rock", poste: "street lamp", carro: "car", onibus: "bus", caminhao: "truck", moto: "motorcycle", bicicleta: "bicycle", trem: "train", vagao: "train car", locomotiva: "locomotive", aviao: "airplane", helicoptero: "helicopter", barco: "boat", lancha: "speedboat", navio: "ship", canoa: "canoe", veleiro: "sailboat", carruagem: "carriage", submarino: "submarine",
  espada: "sword", pistola: "pistol", rifle: "rifle", varinha: "magic wand", escudo: "shield", lanca: "spear", arco: "bow", faca: "knife", livro: "book", copo: "cup", garrafa: "bottle", celular: "phone", mochila: "backpack", guarda: "umbrella", guardachuva: "umbrella", castelo: "castle", casteloMagico: "magic castle", floresta: "forest", torre: "tower", muro: "wall", portao: "gate", agua: "water", tapete: "rug", lampada: "lamp", computador: "computer", tv: "TV", geladeira: "fridge", fogao: "stove", pia: "sink", vaso: "vase", planta: "plant", corda: "rope",
  cavalo: "horse", cachorro: "dog", cao: "dog", gato: "cat", lobo: "wolf", urso: "bear", leao: "lion", tigre: "tiger", dragao: "dragon", aguia: "eagle", corvo: "crow", coruja: "owl", passaro: "bird", vaca: "cow", boi: "ox", porco: "pig", ovelha: "sheep", bode: "goat", cabra: "goat", raposa: "fox", coelho: "rabbit", rato: "rat", cobra: "snake", gorila: "gorilla", macaco: "monkey", elefante: "elephant", girafa: "giraffe", tubarao: "shark", golfinho: "dolphin", baleia: "whale", peixe: "fish", galinha: "chicken", pato: "duck", camelo: "camel", rinoceronte: "rhino", hipopotamo: "hippo", crocodilo: "crocodile", jacare: "alligator", tartaruga: "turtle", aranha: "spider", morcego: "bat" };
const PI_PAL = { empe: "standing", "em pe": "standing", parado: "standing still", andando: "walking", anda: "walking", correndo: "running", corre: "running", corrida: "running", sentado: "sitting", senta: "sitting", sentada: "sitting", deitado: "lying down", deitada: "lying down", ajoelhado: "kneeling", ajoelhada: "kneeling", agachado: "crouching", agachada: "crouching",
  pulando: "jumping", pulo: "jump", salto: "jump", voando: "flying", voo: "flight", caindo: "falling", queda: "fall", caido: "fallen", acenando: "waving", aceno: "wave", apontando: "pointing", aponta: "pointing", soco: "punch", socando: "punching", chute: "kick", chutando: "kicking", guarda: "guard stance", defesa: "block", esquiva: "dodge", golpe: "strike", ataque: "attack",
  bracos: "arms", braco: "arm", cruzados: "crossed", cruzado: "crossed", maos: "hands", mao: "hand", cintura: "waist", cabeca: "head", olhando: "looking", olha: "looking", cima: "up", baixo: "down", tras: "back", frente: "front", lado: "side", lateral: "side", esquerda: "left", direita: "right", alto: "high", baixa: "low",
  pensando: "thinking", pensativo: "thoughtful", triste: "sad", feliz: "happy", alegre: "cheerful", bravo: "angry", raiva: "anger", medo: "fear", surpreso: "surprised", cansado: "tired", exausto: "exhausted", vitoria: "victory", derrota: "defeat", heroica: "heroic", heroi: "hero", poder: "power", magia: "magic", feitico: "spell",
  segurando: "holding", segura: "holding", carregando: "carrying", empurrando: "pushing", puxando: "pulling", abraco: "hug", abracando: "hugging", lendo: "reading", escrevendo: "writing", comendo: "eating", bebendo: "drinking", dancando: "dancing", fugindo: "fleeing", fuga: "escape", perseguicao: "chase", escondido: "hiding", esconder: "hiding",
  meditando: "meditating", rezando: "praying", gritando: "shouting", chorando: "crying", rindo: "laughing", dormindo: "sleeping", nadando: "swimming", escalando: "climbing", montado: "riding", dirigindo: "driving", boxe: "boxing", karate: "karate", capoeira: "capoeira", kung: "kung", fu: "fu", espada: "sword", varinha: "wand", estocada: "thrust", corte: "slash",
  de: "", da: "", do: "", com: "with", e: "and", no: "on", na: "on", em: "in", para: "to", um: "one", uma: "one", dois: "two", relaxado: "relaxed", relaxada: "relaxed", confiante: "confident", timido: "shy", tímida: "shy", ombro: "shoulder", joelho: "knee", perna: "leg", pernas: "legs", pe: "foot", pes: "feet", chao: "floor" };
function piHumano(nome) { return String(nome || "").replace(/^am(?=[A-Z])/, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase().trim(); }
function piPose(nome) { if (!nome) return null; const pt = piHumano(nome); const en = pt.split(/\s+/).map(w => { const k = piNorm(w); return PI_PAL[k] !== undefined ? PI_PAL[k] : w; }).filter(Boolean).join(" ");
  let tag = null; try { const x = listaPosesExtras().find(p => p.nome === nome); tag = x ? x.tag : null; } catch (e) { } return { nome, pt, en: en || pt, tag }; }
function piObj(tipo) { const k = String(tipo || ""), pt = piHumano(k), n = piNorm(k); return { pt, en: PI_EN[k] || PI_EN[n] || pt }; }

/* ===== leitura do bloco "prompt" (e variáveis) ===== */
const PI_FORMATOS = { "1:1": 1, "16:9": 16 / 9, "9:16": 9 / 16, "4:3": 4 / 3, "3:4": 3 / 4, "3:2": 3 / 2, "2:3": 2 / 3, "21:9": 21 / 9, "4:5": 4 / 5, "5:4": 5 / 4, "2:1": 2, "1:2": 0.5, quadrado: 1, paisagem: 16 / 9, retrato: 9 / 16, horizontal: 16 / 9, vertical: 9 / 16 };
function piRazao(f) { const k = piNorm(f); if (PI_FORMATOS[k]) return PI_FORMATOS[k]; const m = /^(\d+(?:\.\d+)?)\s*[:x×]\s*(\d+(?:\.\d+)?)$/.exec(k); return m && +m[2] > 0 ? +m[1] / +m[2] : null; }
const PI_VARIAR = ["lado", "angulo", "plano", "lente", "pose", "expressao"];
function piLer(texto) {
  const erros = [], avisos = [], vars = {}, desc = {}, variar = [], o = { formato: "16:9", grade: [1, 1], idioma: "ambos", estilo: "", situacao: "", lugar: "", luz: "", hora: "", clima: "", negativo: "", detalhe: "", compacto: null };
  let linhas = String(texto || "").replace(/\r/g, "").split("\n");
  /* variáveis: "var nome = valor" (em qualquer lugar) */
  linhas = linhas.filter((l, i) => { const m = /^\s*var\s+([A-Za-zÀ-ÿ_][\wÀ-ÿ-]*)\s*=\s*(.*)$/.exec(l); if (!m) return true; vars[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1"); return false; });
  const sub = s => s.replace(/\$\{([\wÀ-ÿ-]+)\}|\{\{\s*([\wÀ-ÿ-]+)\s*\}\}/g, (a, x, y) => { const k = x || y; if (vars[k] === undefined) { avisos.push("variável ${" + k + "} não foi definida (var " + k + " = …)"); return a; } return vars[k]; });
  for (let n = 0; n < 4; n++) linhas = linhas.map(sub);
  /* bloco prompt: a linha "prompt …" e as recuadas logo abaixo */
  const resto = []; let dentro = false;
  const opcao = (l, num) => { const t = l.trim(); if (!t || t.startsWith("#")) return; let m;
    if ((m = /^([A-ZÀ-Ýa-zà-ÿ][\wÀ-ÿ-]*|"[^"]+")\s*=\s*"?(.*?)"?\s*$/.exec(t)) && !/^(formato|grade|estilo|idioma)$/i.test(m[1])) { desc[m[1].replace(/"/g, "")] = m[2]; return; }
    if ((m = /^variar\s+(\S+)\s+(.+)$/i.exec(t))) { const campo = piNorm(m[1]).replace("ângulo", "angulo").replace("expressão", "expressao"); if (!PI_VARIAR.includes(campo)) { erros.push({ linha: num, erro: "variar " + m[1] + ": use " + PI_VARIAR.join(", ") + "." }); return; } variar.push({ campo, valores: m[2].split(/\s*,\s*/).map(s => s.trim()).filter(Boolean) }); return; }
    const toks = t.match(/"[^"]*"|\S+/g) || []; for (let k = 0; k < toks.length; k++) { const w = piNorm(toks[k]), v = () => { const x = toks[++k]; if (x === undefined) { erros.push({ linha: num, erro: w + ": falta o valor." }); return ""; } return x.replace(/^"|"$/g, ""); };
      if (w === "formato" || w === "proporcao" || w === "proporção" || w === "tamanho") { const f = v(); if (!piRazao(f)) erros.push({ linha: num, erro: "formato “" + f + "”: use 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9 ou largura x altura (1200x800)." }); else o.formato = f; }
      else if (w === "grade") { const g = v(), mm = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(g); if (!mm || +mm[1] < 1 || +mm[2] < 1 || +mm[1] * +mm[2] > 64) erros.push({ linha: num, erro: "grade “" + g + "”: colunas x linhas, ex.: 3x3, 2x2, 3x5 (até 64 células)." }); else o.grade = [+mm[1], +mm[2]]; }
      else if (w === "idioma" || w === "lingua") { const x = piNorm(v()); o.idioma = /^(en|ingles|english)$/.test(x) ? "en" : /^(pt|portugues)$/.test(x) ? "pt" : "ambos"; }
      else if (w === "compacto" || w === "curto") o.compacto = true;
      else if (w === "detalhado" || w === "completo") o.compacto = false;
      else if (["estilo", "situacao", "situação", "lugar", "local", "luz", "iluminacao", "iluminação", "hora", "clima", "tempo", "negativo", "evitar", "detalhe", "extra", "camera-livre"].includes(w)) { const k0 = { situação: "situacao", local: "lugar", iluminacao: "luz", iluminação: "luz", tempo: "clima", evitar: "negativo", extra: "detalhe" }[w] || w; o[k0] = v(); }
      else if (k === 0 && w === "prompt") continue;
      else erros.push({ linha: num, erro: "prompt: “" + toks[k] + "” não é opção (formato, grade, estilo, idioma, situacao, lugar, luz, hora, clima, negativo, detalhe, compacto, variar, var, Nome = \"…\")." }); } };
  linhas.forEach((l, i) => { if (/^prompt\b/i.test(l)) { dentro = true; opcao(l, i + 1); resto.push(""); return; } if (dentro && /^\s+\S/.test(l)) { opcao(l, i + 1); resto.push(""); return; } if (dentro && /^\s*$/.test(l)) { resto.push(""); return; } dentro = false; resto.push(l); });
  return { o, vars, desc, variar, erros, avisos, name: resto.join("\n") };
}
/* completa a grade: copia o último quadro mudando lado/ângulo/plano/lente/pose/expressão; põe o formato de cada célula */
function piExpandir(name, L) {
  const C = L.o.grade[0], R = L.o.grade[1], N = C * R, razaoImg = piRazao(L.o.formato) || 16 / 9, razaoCel = razaoImg * R / C, fmt = (Math.round(razaoCel * 1000) / 1000) + ":1";
  const ls = name.split("\n"), blocos = []; let atual = null;
  ls.forEach((l, i) => { if (/^quadro\b/i.test(l)) { atual = { ini: i, fim: i }; blocos.push(atual); } else if (atual && (/^\s+\S/.test(l) || /^\s*$/.test(l))) atual.fim = i; else if (/^\S/.test(l)) atual = null; });
  const avisos = []; let out = ls.slice();
  /* cada quadro ganha o formato da célula (se não disse outro) */
  blocos.slice().reverse().forEach(b => { if (!/\bformato\b|\b\d+:\d+\b/.test(out[b.ini])) out[b.ini] = out[b.ini] + " formato " + fmt; });
  if (!blocos.length) return { texto: out.join("\n"), avisos: ["escreva pelo menos um quadro (quadro 1 … com as pessoas e objetos)"], n: 0, fmt, razaoCel };
  if (blocos.length > N) avisos.push("há " + blocos.length + " quadros e a grade " + C + "x" + R + " tem " + N + " células: " + (blocos.length - N === 1 ? "o último fica" : "os " + (blocos.length - N) + " últimos ficam") + " de fora");
  const extra = [];
  if (blocos.length < N) { const b = blocos[blocos.length - 1], cab = out[b.ini], corpo = out.slice(b.ini + 1, b.fim + 1).filter(l => l.trim() && !/^\s*(objeto|espalh[ae]|povo|multidao|multidão)\b/i.test(l)), quem = ((corpo.find(l => /^\s+[A-ZÀ-Ý"]/.test(l) && !/^\s+(objeto|efeito|camera|câmera|povo|espalha|grupo)\b/i.test(l)) || "").trim().match(/^("[^"]+"|\S+)/) || [])[1];
    if (!L.variar.length) avisos.push("a grade tem " + N + " células e só " + blocos.length + " quadro(s): use variar lado/angulo/plano/pose… para preencher (ou escreva mais quadros)");
    else for (let j = 0; j < N - blocos.length; j++) { let h = cab.replace(/^quadro\s+\d+/i, "quadro " + (blocos.length + j + 1)), corpo2 = corpo.slice();
      L.variar.forEach(v => { const val = v.valores[(j + 1) % v.valores.length];
        if (v.campo === "pose" || v.campo === "expressao") { if (quem) corpo2.push("  " + quem + " " + (v.campo === "pose" ? "pose " : "expressao ") + val); }
        else { h = h.replace(new RegExp("\\s" + v.campo + "\\s+\\S+", "i"), ""); h += " " + v.campo + " " + val; } });
      extra.push(h, ...corpo2, ""); } }
  /* a primeira célula também usa o primeiro valor de cada variação (se o quadro não disse) */
  if (L.variar.length && blocos.length < N) { const b = blocos[blocos.length - 1]; L.variar.forEach(v => { const val = v.valores[0]; if (v.campo === "pose" || v.campo === "expressao") return; if (!new RegExp("\\s" + v.campo + "\\s", "i").test(out[b.ini] + " ")) out[b.ini] += " " + v.campo + " " + val; }); }
  return { texto: out.join("\n") + (extra.length ? "\n" + extra.join("\n") : ""), avisos, n: Math.min(N, blocos.length + extra.filter(l => /^quadro\b/i.test(l)).length), fmt, razaoCel };
}

/* ===== análise de uma célula: projeção pela câmera ===== */
function piComEstado(q, fn) { const salvo = JSON.stringify(sceneState()); try { loadScene(JSON.parse(JSON.stringify(q.estado))); return fn(); } finally { loadScene(JSON.parse(salvo)); } }
function piCaixa(pts, rc) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y, r] of pts) { if (!isFinite(x) || !isFinite(y)) continue; x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); }
  if (x1 < x0) return null; const u0 = (x0 - rc.x) / rc.w, u1 = (x1 - rc.x) / rc.w, v0 = (y0 - rc.y) / rc.h, v1 = (y1 - rc.y) / rc.h, cu0 = Math.max(0, u0), cu1 = Math.min(1, u1), cv0 = Math.max(0, v0), cv1 = Math.min(1, v1);
  const area = (u1 - u0) * (v1 - v0), vis = cu1 > cu0 && cv1 > cv0 ? (cu1 - cu0) * (cv1 - cv0) / Math.max(1e-6, area) : 0; return { u0, u1, v0, v1, cu0, cu1, cv0, cv1, vis, cx: (Math.max(u0, Math.min(u1, (cu0 + cu1) / 2))), cy: (cv0 + cv1) / 2 }; }
function piPosTexto(b) { const h = b.cx < 0.36 ? ["esquerda", "left"] : b.cx > 0.64 ? ["direita", "right"] : ["centro", "center"], v = b.cy < 0.36 ? ["em cima", "upper"] : b.cy > 0.66 ? ["embaixo", "lower"] : ["no meio", "middle"]; return [h[0] === "centro" ? "no centro" + (v[0] === "no meio" ? "" : ", " + v[0]) : "à " + h[0] + (v[0] === "no meio" ? "" : ", " + v[0]), (v[1] === "middle" ? "" : v[1] + " ") + (h[1] === "center" ? "center" : h[1] + " side") + " of the frame"]; }
function piFace(ang) { const a = Math.abs(ang); return a < 22.5 ? ["de frente para a câmera", "facing the camera"] : a < 67.5 ? ["em três-quartos, quase de frente", "in three-quarter view, turned toward the camera"] : a < 112.5 ? ["de perfil", "in profile"] : a < 157.5 ? ["em três-quartos de costas", "in three-quarter back view"] : ["de costas para a câmera", "with the back to the camera"]; }
function piAnalisar(q, razao, o = {}) {
  return piComEstado(q, () => {
    const rc = recorteQuadro((Math.round(razao * 1000) / 1000) + ":1"), C = cameraNoMundo(P), g0 = restGround((SCN.list[0] || { params: {} }).params), itens = [], lst = SCN.list.filter(it => !it.oculto && it.name !== "__vazio__");
    const camPos = C.pos, camAlvo = C.alvo, fr = [camAlvo[0] - camPos[0], camAlvo[1] - camPos[1], camAlvo[2] - camPos[2]], frL = Math.hypot(...fr) || 1, frN = fr.map(v => v / frL), dirN = [frN[2], 0, -frN[0]];
    const ver = w => telaDoMundo(P, w), distCam = w => Math.hypot(w[0] - camPos[0], w[1] - camPos[1], w[2] - camPos[2]) * PI_M;
    const carta = (w) => { const d = [w[0] - camPos[0], w[2] - camPos[2]], hz = Math.hypot(frN[0], frN[2]) || 1; return { lado: (d[0] * frN[2] - d[1] * frN[0]) / hz * -1, prof: (d[0] * frN[0] + d[1] * frN[2]) / hz }; };
    for (const it of lst) { let L0 = []; try { const c = capsulas(pMundo(it)); L0 = c.caps || c; } catch (e) { continue; }
      const pts = []; L0.forEach(c => { for (const p of [c.a, c.b]) { const t = ver(p); pts.push([t[0], t[1], (c.r || 0) * t[3]]); } }); const b = piCaixa(pts, rc); if (!b) continue;
      const cab = L0.find(c => c.nome === "cabeca"), centro = cab ? [(cab.a[0] + cab.b[0]) / 2, (cab.a[1] + cab.b[1]) / 2, (cab.a[2] + cab.b[2]) / 2] : [it.params.wx || 0, g0 + 10, it.params.wz || 0], pos = [it.params.wx || 0, g0, it.params.wz || 0];
      const g = (it.params.wRot || 0) / PI_D, f = [Math.sin(g), Math.cos(g)], tc = [camPos[0] - pos[0], camPos[2] - pos[2]], ang = Math.atan2(f[0] * tc[1] - f[1] * tc[0], f[0] * tc[0] + f[1] * tc[1]) * PI_D;
      const gy = g + ((it.params.headYaw || 0) + (it.params.neckTwist || 0)) / PI_D, olhaP = ver([centro[0] + Math.sin(gy) * 8, centro[1], centro[2] + Math.cos(gy) * 8]), cP = ver(centro), du = (olhaP[0] - cP[0]) / rc.w;
      const cores = instColors(it, true), e = (o.desc || {})[it.name] || null, perto = Math.min(...L0.flatMap(c => [distCam(c.a), distCam(c.b)]));
      const angH = ang - ((it.params.headYaw || 0) + (it.params.neckTwist || 0)), olharT = Math.abs(du) < 0.02 ? (Math.abs(((angH + 540) % 360) - 180) < 90 ? ["para a câmera", "toward the camera"] : ["para longe da câmera", "away from the camera"]) : du < 0 ? ["para a esquerda do quadro", "toward frame left"] : ["para a direita do quadro", "toward frame right"];
      itens.push({ tipo: "pessoa", nome: it.name, caixa: b, dist: distCam(centro), alturaQuadro: b.cv1 - b.cv0, face: piFace(ang), anguloFace: Math.round(ang), olhar: olharT, perto, sentado: (it.params.hipFlexL || 0) > 50 && (it.params.hipFlexR || 0) > 50,
        pose: piPose(it.poseNome), expressao: it.exprNome || null, cor: piHex(cores.fill), descricao: e, mundo: [piF2(pos[0] * PI_M), piF2(pos[2] * PI_M)], giro: it.params.wRot || 0, carta: carta(pos), alturaM: piF2((Math.max(...L0.map(c => Math.max(c.a[1], c.b[1]) + (c.r || 0))) - Math.min(...L0.map(c => Math.min(c.a[1], c.b[1]) - (c.r || 0)))) * PI_M),
        noAr: Math.min(...L0.map(c => Math.min(c.a[1], c.b[1]) - (c.r || 0))) - g0 > 2.5, embarcado: it.embarcadoEm ? it.embarcadoEm : null, montado: it.montadoEm || null, apoio: Number.isInteger(it.apoioEm) || typeof it.apoioEm === "number" ? ((SCN.objetos || []).find(x => x.id === it.apoioEm) || {}).nome || null : null }); }
    for (const ob of SCN.objetos || []) { if (ob.chao) continue; let caps = [], partes = []; if (!ob.animal) { try { partes = partesDoObjeto(ob, g0).filter(b => b.h && b.e); } catch (e) { partes = []; } } if (!partes.length) { try { caps = capsulasObjeto(ob, g0); } catch (e) { caps = []; } }
      const pts = []; if (partes.length) partes.slice(0, 400).forEach(b => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const w = [0, 1, 2].map(k => b.c[k] + b.e[0][k] * b.h[0] * sx + b.e[1][k] * b.h[1] * sy + b.e[2][k] * b.h[2] * sz), t = ver(w); pts.push([t[0], t[1], 0]); } });
      else if (caps.length) caps.forEach(c => { for (const p of [c.a, c.b]) { const t = ver(p); pts.push([t[0], t[1], (c.r || 0) * t[3]]); } });
      else { const r = Math.hypot(ob.larg || 2, ob.prof || 2) / 2, y0 = g0 + (ob.base || 0); for (const [dx, dz] of [[-r, -r], [r, -r], [r, r], [-r, r]]) for (const y of [y0, y0 + (ob.alt || 2)]) { const t = ver([(ob.x || 0) + dx, y, (ob.z || 0) + dz]); pts.push([t[0], t[1], 0]); } }
      const pw = []; if (partes.length) partes.slice(0, 400).forEach(b => { for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) pw.push([0, 1, 2].map(k => b.c[k] + b.e[0][k] * b.h[0] * sx + b.e[1][k] * b.h[1] * sy + b.e[2][k] * b.h[2] * sz)); }); else caps.forEach(c => pw.push(c.a, c.b));
      const b = piCaixa(pts, rc); if (!b) continue; const anim = ob.animal, nm = anim ? piObj(anim.especie || ob.tipo) : piObj(ob.tipo), grupo = (TIPOS_OBJETO[ob.tipo] || {}).grupo || null, cor = piHex(anim ? ((QD_ESPECIES[anim.especie] || {}).cor || corObjeto(ob, true).fill) : corObjeto(ob, true).fill);
      const centro = [ob.x || 0, g0 + (ob.base || 0) + (ob.alt || 2) / 2, ob.z || 0], e = (o.desc || {})[ob.nome] || null;
      const gg = (ob.giro || 0) / PI_D, tc = [camPos[0] - (ob.x || 0), camPos[2] - (ob.z || 0)], ang = Math.atan2(Math.sin(gg) * tc[1] - Math.cos(gg) * tc[0], Math.sin(gg) * tc[0] + Math.cos(gg) * tc[1]) * PI_D;
      itens.push({ tipo: anim ? "animal" : (grupo === "veiculo" || /veic/.test(grupo || "") ? "veiculo" : "objeto"), nome: ob.nome || ob.tipo, especie: anim ? anim.especie : null, objeto: ob.tipo, nomeObj: nm, caixa: b, dist: distCam(centro), alturaQuadro: b.cv1 - b.cv0, cor, descricao: e, monstro: !!(anim && anim.monstro), face: anim ? piFace(ang) : null,
        perto: pw.length ? Math.min(...pw.map(distCam)) : null, tamanho: [piF2((ob.larg || 0) * PI_M), piF2((ob.prof || 0) * PI_M), piF2((ob.alt || 0) * PI_M)], mundo: [piF2((ob.x || 0) * PI_M), piF2((ob.z || 0) * PI_M)], giro: ob.giro || 0, carta: carta([ob.x || 0, 0, ob.z || 0]) }); }
    const visiveis = itens.filter(i => i.caixa.vis > 0.05).sort((a, b) => a.caixa.cx - b.caixa.cx);
    /* planos: o mais perto e grande = primeiro plano; o mais longe = fundo */
    const ds = visiveis.map(i => i.dist), dmin = Math.min(...ds), dmax = Math.max(...ds);
    visiveis.forEach(i => { i.plano = visiveis.length < 2 || dmax - dmin < 1.2 ? ["", ""] : i.dist - dmin < (dmax - dmin) * 0.3 ? ["em primeiro plano", "in the foreground"] : dmax - i.dist < (dmax - dmin) * 0.3 ? ["ao fundo", "in the background"] : ["no plano do meio", "in the midground"]; i.pos = piPosTexto(i.caixa); });
    /* quem tapa quem */
    const sobreposicoes = []; for (const a of visiveis) for (const b of visiveis) { const pa = a.perto != null ? a.perto : a.dist, pb = b.perto != null ? b.perto : b.dist; if (a === b || pa >= pb - 0.15) continue; const A = a.caixa, B = b.caixa, ix = Math.max(0, Math.min(A.cu1, B.cu1) - Math.max(A.cu0, B.cu0)), iy = Math.max(0, Math.min(A.cv1, B.cv1) - Math.max(A.cv0, B.cv0)), ab = Math.max(1e-6, (B.cu1 - B.cu0) * (B.cv1 - B.cv0)), fr2 = ix * iy / ab; if (fr2 > 0.12) sobreposicoes.push({ frente: a.nome, atras: b.nome, quanto: fr2 }); }
    /* distâncias e posição relativa (vista da câmera) entre os principais */
    const rel = []; const princ = visiveis.filter(i => i.tipo !== "objeto" || i.alturaQuadro > 0.15).slice(0, 6);
    for (let x = 0; x < princ.length; x++) for (let y = x + 1; y < princ.length; y++) { const a = princ[x], b = princ[y], d = Math.hypot(+a.mundo[0] - +b.mundo[0], +a.mundo[1] - +b.mundo[1]); const dl = b.carta.lado - a.carta.lado, dp = b.carta.prof - a.carta.prof; if (a.nome === b.nome || rel.some(r0 => (r0.a === a.nome && r0.b === b.nome) || (r0.a === b.nome && r0.b === a.nome))) continue; rel.push({ a: a.nome, b: b.nome, metros: piF1(d), bMaisLonge: dp > 8 ? piF1(dp * PI_M) : null, bAdireita: dl > 0 }); }
    /* câmera */
    const alturaCam = (camPos[1] - g0) * PI_M, hz = Math.hypot(fr[0], fr[2]), incl = Math.atan2(fr[1], hz) * PI_D, distAlvo = frL * PI_M, lente = Math.round(P.lens || 50), rol = P.roll || 0;
    const elev = incl < -70 ? ["zenital (de cima, a pino)", "top-down overhead shot"] : incl < -35 ? ["plongée forte (bem de cima)", "high-angle shot looking steeply down"] : incl < -10 ? ["plongée (de cima)", "high-angle shot looking down"] : incl <= 10 ? ["na altura dos olhos", "eye-level shot"] : incl < 35 ? ["contra-plongée (de baixo)", "low-angle shot looking up"] : incl < 70 ? ["contra-plongée forte", "very low-angle shot (worm's-eye)"] : ["nadir (de baixo, a pino)", "straight-up worm's-eye view"];
    const lenteT = lente <= 18 ? ["ultra grande-angular " + lente + " mm (distorção forte)", "ultra-wide " + lente + "mm lens with strong perspective distortion"] : lente <= 28 ? ["grande-angular " + lente + " mm", "wide-angle " + lente + "mm lens"] : lente <= 40 ? ["lente " + lente + " mm (natural, um pouco aberta)", lente + "mm lens, natural slightly wide perspective"] : lente <= 60 ? ["lente normal " + lente + " mm", "normal " + lente + "mm lens"] : lente <= 105 ? ["teleobjetiva curta " + lente + " mm (retrato, fundo comprimido)", lente + "mm portrait telephoto lens, compressed background"] : ["teleobjetiva " + lente + " mm (fundo bem comprimido)", lente + "mm telephoto lens, strongly compressed background"];
    const plano = q.plano || null; let enqT = { geral: ["plano geral", "extreme wide shot"], "grande plano geral": ["grande plano geral", "extreme long shot"], conjunto: ["plano de conjunto", "wide shot"], inteiro: ["plano inteiro (corpo inteiro)", "full shot (full body)"], americano: ["plano americano (dos joelhos para cima)", "medium-full shot (knees up)"], medio: ["plano médio (da cintura para cima)", "medium shot (waist up)"], "primeiro plano": ["primeiro plano (do peito para cima)", "medium close-up (chest up)"], close: ["close (rosto)", "close-up on the face"], detalhe: ["plano detalhe", "extreme close-up detail"], pov: ["ponto de vista (POV)", "point-of-view shot"] }[plano] || null;
    /* enquadramento MEDIDO na imagem (o que a câmera mostra de fato), pela pessoa maior no quadro */
    const gente = visiveis.filter(i => i.tipo === "pessoa"), maior = gente.slice().sort((x, y) => y.alturaQuadro - x.alturaQuadro)[0]; let enqM = null, planoM = null;
    if (maior) { const cx2 = maior.caixa, tot = Math.max(1e-6, cx2.v1 - cx2.v0), fv = (cx2.cv1 - cx2.cv0) / tot, alt = cx2.cv1 - cx2.cv0, topo = cx2.v0 >= -0.03;
      planoM = !topo && fv < 0.3 ? "detalhe" : fv >= 0.93 ? (alt < 0.12 ? "geral" : alt < 0.3 || gente.length > 2 ? "conjunto" : "inteiro") : fv >= 0.68 ? "americano" : fv >= 0.45 ? "medio" : fv >= 0.28 ? "primeiro plano" : fv >= 0.13 ? "close" : "detalhe";
      if (maior.sentado && planoM === "americano") planoM = "inteiro"; }
    const enqTab = { geral: ["plano geral", "extreme wide shot"], "grande plano geral": ["grande plano geral", "extreme long shot"], conjunto: ["plano de conjunto", "wide shot"], inteiro: ["plano inteiro (corpo inteiro)", "full shot (full body)"], americano: ["plano americano (dos joelhos para cima)", "medium-full shot (knees up)"], medio: ["plano médio (da cintura para cima)", "medium shot (waist up)"], "primeiro plano": ["primeiro plano (do peito para cima)", "medium close-up (chest up)"], close: ["close (rosto)", "close-up on the face"], detalhe: ["plano detalhe", "extreme close-up detail"], pov: ["ponto de vista (POV)", "point-of-view shot"] };
    if (planoM && plano !== "pov") enqT = enqTab[planoM];
    const camera = { alturaM: piF2(alturaCam), inclinacao: Math.round(incl), distanciaM: piF1(distAlvo), lente, holandes: Math.abs(rol) > 3 ? Math.round(rol) : 0, elev, lenteT, enq: enqT, plano, planoMedido: planoM, lado: q.lado != null ? q.lado : null };
    return { indice: q.indice, titulo: q.titulo || null, local: q.local || null, hora: q.hora || null, luz: q.luz || null, razao, camera, itens: visiveis, todos: itens, fora: itens.filter(i => i.caixa.vis <= 0.05).map(i => i.nome), sobreposicoes, relacoes: rel, efeitos: (SCN.efeitos || []).map(e => ({ tipo: e.tipo, cor: e.cor ? piHex(e.cor) : null })), legenda: q.legenda || null };
  });
}

/* ===== texto ===== */
function piItemTexto(i, lingua, compacto) { const en = lingua === "en", L = en ? 1 : 0, cx = i.caixa, ret = (en ? "occupying x " : "ocupando x ") + piPc(Math.max(0, cx.u0)) + "–" + piPc(Math.min(1, cx.u1)) + "%, y " + piPc(Math.max(0, cx.v0)) + "–" + piPc(Math.min(1, cx.v1)) + "%" + (en ? " of the frame" : " do quadro");
  const desc = i.descricao && !compacto ? piCoresNoTexto(i.descricao, lingua) : null, cor = i.cor && !compacto ? piNomeCor(i.cor) : null; const p = [];
  if (i.tipo === "pessoa") { p.push(i.nome + (desc ? " (" + desc + ")" : "")); if (i.pose) p.push(en ? "pose: " + i.pose.en : "pose: " + i.pose.pt); if (i.expressao) p.push((en ? "expression: " : "expressão: ") + piHumano(i.expressao));
    if (i.embarcado) p.push(en ? "inside the " + i.embarcado.veiculo + (i.embarcado.assento ? " (" + i.embarcado.assento + " seat)" : "") : "dentro de " + i.embarcado.veiculo + (i.embarcado.assento ? " (assento " + i.embarcado.assento + ")" : "")); if (i.montado) p.push(en ? "riding " + i.montado : "montado em " + i.montado); if (i.apoio) p.push(en ? "sitting on " + i.apoio : "sentado em " + i.apoio); if (i.noAr && !i.montado && !i.embarcado && !i.apoio) p.push(en ? "in mid-air" : "no ar");
    p.push(i.face[L] + ", " + (en ? "looking " : "olhando ") + i.olhar[L]); if (!desc && cor) p.push((en ? "main outfit color " : "roupa principal ") + (en ? cor.en : cor.pt) + " (" + cor.hex + ")"); }
  else { const nm = en ? i.nomeObj.en : i.nomeObj.pt; p.push((i.tipo === "animal" ? (i.monstro ? (en ? "giant monster " : "monstro gigante ") : "") : "") + (desc || nm) + (compacto ? "" : "") + (i.nome && piNorm(i.nome) !== piNorm(i.objeto || "") && piNorm(i.nome) !== piNorm(i.especie || "") ? " “" + i.nome + "”" : "")); if (cor && !desc) p.push((en ? "color " : "cor ") + (en ? cor.en : cor.pt) + " (" + cor.hex + ")");
    if (i.tipo !== "animal" && !compacto && i.tamanho) p.push((en ? "about " : "cerca de ") + i.tamanho[0] + " × " + i.tamanho[1] + " × " + i.tamanho[2] + " m"); if (i.face && i.tipo === "animal") p.push(i.face[L]); }
  p.push(i.pos[L] + (i.plano[L] ? ", " + i.plano[L] : "")); if (compacto) p.push("x " + piPc(Math.max(0, cx.u0)) + "–" + piPc(Math.min(1, cx.u1)) + "%, " + (en ? "height " : "altura ") + piPc(Math.min(1, i.alturaQuadro)) + "%"); else p.push(ret + ", " + (en ? "about " : "cerca de ") + piPc(Math.min(1.5, i.alturaQuadro)) + (en ? "% of the frame height" : "% da altura do quadro") + (i.caixa.vis < 0.85 ? (en ? ", partly outside the frame" : ", parte fora do quadro") : ""));
  return p.join(", "); }
function piCameraTexto(c, lingua) { const en = lingua === "en", L = en ? 1 : 0, p = []; if (c.enq) p.push(c.enq[L]); p.push(c.elev[L] + (Math.abs(c.inclinacao) > 2 ? " (" + Math.abs(c.inclinacao) + "°)" : ""));
  p.push(en ? "camera " + c.alturaM + " m above the ground, " + c.distanciaM + " m from the subject" : "câmera a " + c.alturaM + " m do chão, a " + c.distanciaM + " m do assunto"); p.push(c.lenteT[L]); if (c.holandes) p.push(en ? "Dutch tilt " + c.holandes + "°" : "câmera inclinada (holandês) " + c.holandes + "°"); return p.join(", "); }
function piCelulaTexto(a, L, lingua, cab) { const en = lingua === "en", comp = L.o.compacto === null ? L.o.grade[0] * L.o.grade[1] > 1 : L.o.compacto, p = [];
  if (cab) p.push(cab); p.push((en ? "Camera: " : "Câmera: ") + piCameraTexto(a.camera, lingua) + ".");
  if (a.itens.length) p.push((en ? "From left to right: " : "Da esquerda para a direita: ") + a.itens.map((i, k) => (k + 1) + ") " + piItemTexto(i, lingua, comp)).join("; ") + ".");
  if (a.sobreposicoes.length) p.push(a.sobreposicoes.map(s => en ? s.frente + " is closer to the camera than " + s.atras + (s.quanto > 0.5 ? " and partly blocks the view of " + s.atras : " and overlaps it a little") : s.frente + " está mais perto da câmera que " + s.atras + (s.quanto > 0.5 ? " e tapa parte de " + s.atras : " e se sobrepõe um pouco")).join("; ") + ".");
  if (a.relacoes.length && !comp) p.push((en ? "Distances: " : "Distâncias: ") + a.relacoes.slice(0, 6).map(r => en ? r.a + " ↔ " + r.b + " " + r.metros + " m" + (r.bMaisLonge ? " (" + r.b + " " + r.bMaisLonge + " m farther from the camera)" : "") : r.a + " ↔ " + r.b + " " + r.metros + " m" + (r.bMaisLonge ? " (" + r.b + " " + r.bMaisLonge + " m mais longe da câmera)" : "")).join("; ") + ".");
  if (a.efeitos.length) p.push((en ? "Effects: " : "Efeitos: ") + a.efeitos.map(e => piHumano(e.tipo) + (e.cor ? " " + (en ? piNomeCor(e.cor).en : piNomeCor(e.cor).pt) + " (" + e.cor + ")" : "")).join(", ") + ".");
  if (a.fora.length && !comp) p.push((en ? "Out of frame: " : "Fora do quadro: ") + a.fora.join(", ") + ".");
  return p.join(" "); }
function piMontar(L, cel, lingua) {
  const en = lingua === "en", C = L.o.grade[0], R = L.o.grade[1], N = C * R, o = L.o, linhas = [], tr = t => piCoresNoTexto(t, lingua);
  const pessoas = new Map(); cel.forEach(a => a.itens.forEach(i => { if (!pessoas.has(i.nome) && (i.tipo === "pessoa" || i.descricao || i.tipo === "animal" || i.tipo === "veiculo")) pessoas.set(i.nome, i); }));
  if (o.estilo) linhas.push(tr(o.estilo) + ".");
  linhas.push(N > 1 ? (en ? "A single " + o.formato + " image laid out as a " + C + "×" + R + " grid sprite sheet (" + C + " columns × " + R + " rows, " + N + " equal panels separated by thin white gutters, no borders, no text, no panel numbers). The SAME characters, outfits, colors and place in every panel." : "Uma única imagem " + o.formato + " organizada como folha em grade " + C + "×" + R + " (" + C + " colunas × " + R + " linhas, " + N + " painéis iguais separados por faixas brancas finas, sem bordas, sem texto, sem números). Os MESMOS personagens, roupas, cores e lugar em todos os painéis.")
    : (en ? "Image, aspect ratio " + o.formato + "." : "Imagem, proporção " + o.formato + "."));
  if (o.situacao) linhas.push((en ? "Situation: " : "Situação: ") + tr(o.situacao) + ".");
  const lugar = o.lugar || (cel[0] && cel[0].local); if (lugar) linhas.push((en ? "Place: " : "Lugar: ") + tr(lugar) + ".");
  const luz = [o.luz || (cel[0] && cel[0].luz), o.hora || (cel[0] && cel[0].hora), o.clima].filter(Boolean); if (luz.length) linhas.push((en ? "Light/time/weather: " : "Luz/hora/clima: ") + tr(luz.join(", ")) + ".");
  if (pessoas.size) linhas.push((en ? "Characters and key elements (keep identical everywhere): " : "Personagens e elementos (iguais em toda a imagem): ") + [...pessoas.values()].map(i => { const cor = i.cor ? piNomeCor(i.cor) : null; return i.nome + " = " + (i.descricao ? tr(i.descricao) : (i.tipo === "pessoa" ? (en ? "person" : "pessoa") : (en ? i.nomeObj.en : i.nomeObj.pt)) + (cor ? ", " + (en ? cor.en : cor.pt) + " (" + cor.hex + ")" : "")) + (i.tipo === "pessoa" && i.alturaM && !i.sentado && !i.noAr ? (en ? ", " + i.alturaM + " m tall" : ", " + i.alturaM + " m de altura") : ""); }).join("; ") + ".");
  if (N > 1) cel.forEach((a, k) => { const r = Math.floor(k / C) + 1, c = k % C + 1, onde = en ? "Panel " + (k + 1) + " (row " + r + ", column " + c + ")" : "Painel " + (k + 1) + " (linha " + r + ", coluna " + c + ")"; linhas.push(onde + ": " + piCelulaTexto(a, L, lingua, a.titulo ? "“" + a.titulo + "”." : "")); });
  else if (cel[0]) linhas.push(piCelulaTexto(cel[0], L, lingua, ""));
  const pal = piPaleta(L, cel); if (pal.length) linhas.push((en ? "Color palette (exact hex codes): " : "Paleta (códigos exatos): ") + pal.map(c => (en ? c.en : c.pt) + " " + c.hex + (c.usos.length ? " = " + c.usos.slice(0, 3).join("/") : "")).join(", ") + ".");
  if (o.detalhe) linhas.push(tr(o.detalhe) + ".");
  linhas.push((en ? "Keep the exact positions, sizes, facing directions and camera angle described. " : "Respeite as posições, tamanhos, direções e o ângulo da câmera descritos. ") + (en ? "Avoid: " : "Evite: ") + (o.negativo ? tr(o.negativo) + ", " : "") + (en ? "extra people, extra limbs, text, watermark, logos" + (N > 1 ? ", merged panels, uneven grid" : "") : "pessoas a mais, membros a mais, texto, marca d'água, logotipos" + (N > 1 ? ", painéis emendados, grade torta" : "")) + ".");
  return linhas.join("\n\n"); }
function piPaleta(L, cel) { const m = new Map(), add = (hex, uso) => { const h = piHex(hex); if (!h) return; for (const [k, v] of m) if (piDistCor(k, h) < 8) { if (uso && !v.usos.includes(uso)) v.usos.push(uso); return; } const c = piNomeCor(h); m.set(h, Object.assign(c, { usos: uso ? [uso] : [] })); };
  cel.forEach(a => a.itens.forEach(i => { const hs = i.descricao ? piHexesDe(i.descricao) : []; if (hs.length) hs.forEach(h => add(h, i.nome)); else if (i.cor) add(i.cor, i.nome); }));
  ["estilo", "situacao", "lugar", "luz", "detalhe"].forEach(k => piHexesDe(L.o[k]).forEach(h => add(h, k))); Object.entries(L.desc).forEach(([n, d]) => piHexesDe(d).forEach(h => add(h, n)));
  return [...m.values()]; }
function piCoresParecidas(L, cel) { const cru = []; cel.forEach(a => a.itens.forEach(i => { (i.descricao ? piHexesDe(i.descricao) : i.cor ? [piHex(i.cor)] : []).forEach(h => cru.push([h, i.nome])); })); Object.entries(L.desc).forEach(([n, d]) => piHexesDe(d).forEach(h => cru.push([h, n])));
  const out = new Set(); for (let i = 0; i < cru.length; i++) for (let j = i + 1; j < cru.length; j++) { if (cru[i][1] === cru[j][1]) continue; const d = piDistCor(cru[i][0], cru[j][0]); if (d < 45) { const par = [cru[i], cru[j]].sort((x, y) => (x[1] + x[0]).localeCompare(y[1] + y[0])); out.add(par[0][0] + " (" + par[0][1] + ") e " + par[1][0] + " (" + par[1][1] + ") são cores parecidas: a IA pode confundir os dois"); } } return [...out]; }

/* ===== tudo junto ===== */
function piGerar(texto, opts = {}) {
  const L = piLer(texto); if (L.erros.length) return { ok: false, erros: L.erros, avisos: L.avisos };
  const X = piExpandir(L.name, L), r = compilarName(X.texto, { semCache: true, salvar: false }); const avisos = L.avisos.concat(X.avisos);
  if (!r.ok) return { ok: false, erros: r.erros, avisos, textoName: X.texto };
  const N = L.o.grade[0] * L.o.grade[1]; let qs = r.quadros.slice(0, N);
  /* cena do PALCO: o estado vivo (poses, cores, câmera) vale para todas as células; o que varia (câmera, pose) vem do quadro compilado */
  if (opts.estado) { const camVaria = L.variar.some(v => /^(lado|angulo|plano|lente)$/.test(v.campo)), poseVaria = L.variar.some(v => /^(pose|expressao)$/.test(v.campo));
    qs = qs.map((q, k) => { const m = JSON.parse(JSON.stringify(opts.estado)); if (camVaria && q.estado && q.estado.camera) m.camera = JSON.parse(JSON.stringify(q.estado.camera));
      if (poseVaria && k > 0 && q.estado && q.estado.list && m.list) { const prim = (m.list.find(it => it.name && it.name !== "__vazio__") || {}).name, c = q.estado.list.find(it => it.name === prim), i = m.list.findIndex(it => it.name === prim); if (c && i >= 0) m.list[i] = JSON.parse(JSON.stringify(c)); }
      return Object.assign({}, q, { estado: m }); }); }
  const cel = qs.map(q => piAnalisar(q, X.razaoCel, { desc: L.desc }));
  cel.forEach((a, k) => { a.itens.forEach(i => { const c = i.caixa, fh = (c.cu1 - c.cu0) / Math.max(1e-6, c.u1 - c.u0); if (i.tipo === "pessoa" ? fh < 0.5 : c.vis < 0.5) avisos.push("célula " + (k + 1) + ": " + i.nome + " está mais da metade fora do quadro"); }); a.fora.forEach(n => avisos.push((cel.length > 1 ? "célula " + (k + 1) + ": " : "") + n + " está fora do quadro (a câmera não vê): mova a câmera ou a pessoa")); if (!a.itens.length) avisos.push((cel.length > 1 ? "célula " + (k + 1) + ": " : "") + "ninguém aparece no quadro"); });
  const pal = piPaleta(L, cel); avisos.push(...piCoresParecidas(L, cel));
  const en = L.o.idioma !== "pt" ? piMontar(L, cel, "en") : null, pt = L.o.idioma !== "en" ? piMontar(L, cel, "pt") : null;
  return { ok: true, erros: [], avisos: [...new Set(avisos)], opcoes: L.o, variaveis: L.vars, descricoes: L.desc, grade: { colunas: L.o.grade[0], linhas: L.o.grade[1], celulas: N }, formato: L.o.formato, razaoCelula: X.razaoCel, celulas: cel, quadros: qs, paleta: pal, prompt: { en, pt }, caracteres: { en: en ? en.length : 0, pt: pt ? pt.length : 0 }, textoName: X.texto, r };
}

/* ===== imagens de referência (SVG) ===== */
const piEsc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function piB64(t) { if (typeof Buffer !== "undefined") return Buffer.from(t, "utf8").toString("base64"); return btoa(unescape(encodeURIComponent(t))); }
/* mapa da composição: o quadro com a caixa de cada um na cor dele, nome e terços */
function piMapaSvg(a, larg = 900) { const W = larg, H = Math.round(larg / a.razao); let s = '<rect width="' + W + '" height="' + H + '" fill="#fafafa"/>' + [1, 2].map(k => '<line x1="' + W * k / 3 + '" y1="0" x2="' + W * k / 3 + '" y2="' + H + '" stroke="#ccc" stroke-dasharray="6 6"/><line x1="0" y1="' + H * k / 3 + '" x2="' + W + '" y2="' + H * k / 3 + '" stroke="#ccc" stroke-dasharray="6 6"/>').join("");
  a.itens.slice().sort((x, y) => y.dist - x.dist).forEach(i => { const c = i.caixa, x = Math.max(0, c.u0) * W, y = Math.max(0, c.v0) * H, w = (Math.min(1, c.u1) - Math.max(0, c.u0)) * W, h = (Math.min(1, c.v1) - Math.max(0, c.v0)) * H, cor = i.cor || "#888888", hx = piHexesDe(i.descricao || "")[0] || cor;
    s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" fill="' + hx + '" fill-opacity=".35" stroke="' + hx + '" stroke-width="3"/><text x="' + (x + 6).toFixed(1) + '" y="' + (y + 22).toFixed(1) + '" font-family="Arial" font-size="18" font-weight="700" fill="#111" stroke="#fff" stroke-width="4" paint-order="stroke">' + piEsc(i.nome + " " + hx) + "</text>"; });
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '">' + s + '<rect width="' + W + '" height="' + H + '" fill="none" stroke="#111" stroke-width="2"/></svg>'; }
/* a grade inteira montada com as imagens (cena ou mapa) de cada célula */
function piGradeSvg(res, svgs, larg = 1200) { const C = res.grade.colunas, R = res.grade.linhas, raz = piRazao(res.formato) || 1, W = larg, H = Math.round(W / raz), g = Math.round(W * 0.012), cw = (W - g * (C + 1)) / C, ch = (H - g * (R + 1)) / R; let s = "";
  svgs.forEach((sv, k) => { if (!sv) return; const x = g + (k % C) * (cw + g), y = g + Math.floor(k / C) * (ch + g); s += '<image x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + cw.toFixed(1) + '" height="' + ch.toFixed(1) + '" preserveAspectRatio="xMidYMid slice" href="' + (typeof sv === "object" && sv.png ? "data:image/png;base64," + sv.png : "data:image/svg+xml;base64," + piB64(sv)) + '"/>'; });
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '"><rect width="' + W + '" height="' + H + '" fill="#fff"/>' + s + "</svg>"; }
function piPaletaSvg(pal) { const W = 760, lh = 54, H = Math.max(1, pal.length) * lh + 20; let s = ""; pal.forEach((c, i) => { const y = 10 + i * lh; s += '<rect x="10" y="' + y + '" width="90" height="' + (lh - 10) + '" rx="6" fill="' + c.hex + '" stroke="#999"/><text x="114" y="' + (y + 20) + '" font-family="Arial" font-size="18" font-weight="700">' + c.hex + "  " + piEsc(c.pt + " / " + c.en) + '</text><text x="114" y="' + (y + 40) + '" font-family="Arial" font-size="14" fill="#555">' + piEsc(c.usos.join(", ")) + "</text>"; });
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '"><rect width="' + W + '" height="' + H + '" fill="#fff"/>' + s + "</svg>"; }
/* planta vista de cima: posições (m), cores, direção e a câmera */
function piPlantaSvg(res, k = 0) { const a = res.celulas[k]; if (!a) return ""; const q = res.quadros[k]; return piComEstado(q, () => { const C = cameraNoMundo(P), pts = (a.todos || a.itens).map(i => [+i.mundo[0], +i.mundo[1]]).concat([[C.pos[0] * PI_M, C.pos[2] * PI_M]]);
    const x0 = Math.min(...pts.map(p => p[0])) - 2, x1 = Math.max(...pts.map(p => p[0])) + 2, z0 = Math.min(...pts.map(p => p[1])) - 2, z1 = Math.max(...pts.map(p => p[1])) + 2, s0 = Math.min(700 / (x1 - x0), 700 / (z1 - z0)), W = Math.round((x1 - x0) * s0), H = Math.round((z1 - z0) * s0), mp = (x, z) => [(x - x0) * s0, (z - z0) * s0];
    let s = ""; for (let gx = Math.ceil(x0); gx <= x1; gx++) s += '<line x1="' + mp(gx, z0)[0] + '" y1="0" x2="' + mp(gx, z0)[0] + '" y2="' + H + '" stroke="#eee"/>'; for (let gz = Math.ceil(z0); gz <= z1; gz++) s += '<line x1="0" y1="' + mp(x0, gz)[1] + '" x2="' + W + '" y2="' + mp(x0, gz)[1] + '" stroke="#eee"/>';
    const [cx, cz] = mp(C.pos[0] * PI_M, C.pos[2] * PI_M), [ax, az] = mp(C.alvo[0] * PI_M, C.alvo[2] * PI_M); s += '<line x1="' + cx + '" y1="' + cz + '" x2="' + ax + '" y2="' + az + '" stroke="#3f6fe0" stroke-dasharray="6 4" stroke-width="2"/><circle cx="' + cx + '" cy="' + cz + '" r="9" fill="#3f6fe0"/><text x="' + (cx + 12) + '" y="' + (cz - 10) + '" font-family="Arial" font-size="15">câmera ' + a.camera.alturaM + ' m</text>';
    (a.todos || a.itens).forEach(i => { const [x, z] = mp(+i.mundo[0], +i.mundo[1]), hx = piHexesDe(i.descricao || "")[0] || i.cor || "#888", g = (i.giro || 0) / PI_D; s += '<line x1="' + x + '" y1="' + z + '" x2="' + (x + Math.sin(g) * 26) + '" y2="' + (z + Math.cos(g) * 26) + '" stroke="#111" stroke-width="3"/><circle cx="' + x + '" cy="' + z + '" r="10" fill="' + hx + '" stroke="#111"/><text x="' + (x + 13) + '" y="' + (z + 5) + '" font-family="Arial" font-size="15" font-weight="700">' + piEsc(i.nome) + " (" + i.mundo.join(", ") + ")</text>"; });
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '"><rect width="' + W + '" height="' + H + '" fill="#fff"/>' + s + "</svg>"; }); }
/* miniaturas do que foi usado: poses, câmera (lado/ângulo/plano/lente), objetos e animais */
function piMiniaturasUsadas(res) { const out = [], vistos = new Set(), mini = (pasta, nome, svg) => { const k = pasta + "/" + nome; if (vistos.has(k) || !svg) return; vistos.add(k); out.push({ nome: "miniaturas/" + pasta + "/" + String(nome).replace(/[^\w.-]+/g, "_") + ".svg", svg }); };
  const quadroSvg = t => { try { const r = compilarName(t, { semCache: true, salvar: false }); return r.quadros[0] ? renderizarQuadro(r.quadros[0], { passes: false }).svg : ""; } catch (e) { return ""; } };
  res.celulas.forEach((a, k) => { const q = res.quadros[k]; a.itens.forEach(i => { if (i.pose && i.pose.nome) { try { mini("poses", i.pose.nome, pdMiniatura(pdValoresPose(i.pose.nome, pdParams({}), null, 0).valores, { tam: 96, rotulo: i.pose.nome }).replace(/currentColor/g, "#222")); } catch (e) { } }
      if (i.tipo !== "pessoa") mini(i.tipo === "animal" ? "animais" : "objetos", i.especie || i.objeto, quadroSvg(i.tipo === "animal" ? acTexto({ tipo: "especie", v: i.especie }) : acTexto({ tipo: "objeto", v: i.objeto }))); });
    if (q.plano) mini("camera-plano", q.plano, quadroSvg(acTexto({ tipo: "enq", v: q.plano.replace(/ /g, "-") }))); if (q.angulo) mini("camera-angulo", q.angulo, quadroSvg(acTexto({ tipo: "ang", v: piNorm(q.angulo).replace(/ /g, "-") })));
    if (q.lado != null) { const nl = { 0: "frente", 40: "3/4", "-40": "3/4-direita", 90: "perfil", "-90": "perfil-direito", 180: "costas" }[q.lado] || "frente"; mini("camera-lado", nl, quadroSvg(acTexto({ tipo: "lado", v: nl }))); }
    if (a.camera.lente) { const ls = [14, 24, 35, 50, 85, 135, 200], l = ls.reduce((m, x) => Math.abs(x - a.camera.lente) < Math.abs(m - a.camera.lente) ? x : m); mini("camera-lente", l + "mm", quadroSvg(acTexto({ tipo: "lente", v: l }))); } });
  return out; }
/* arquivos do pacote (SVG; quem chama converte para PNG se quiser) */
function piArquivos(res, o = {}) { if (!res || !res.ok) return []; const arqs = [], cenas = [], mapas = [];
  res.quadros.forEach((q, k) => { const n = String(k + 1).padStart(2, "0"); let cena = ""; try { cena = renderizarQuadro(q, { passes: false }).svg; } catch (e) { } const mapa = piMapaSvg(res.celulas[k]); cenas.push(cena); mapas.push(mapa);
    if (cena) arqs.push({ nome: "referencias/celula-" + n + "-cena.svg", svg: cena }); arqs.push({ nome: "referencias/celula-" + n + "-mapa.svg", svg: mapa });
    if (o.fichas === true) { try { const f = fichaDoQuadro(q, { semLaterais: false }); if (f && f.svg) arqs.push({ nome: "referencias/celula-" + n + "-ficha.svg", svg: f.svg }); } catch (e) { } } });
  if (res.grade.celulas > 1) { arqs.push({ nome: "referencias/grade-cenas.svg", svg: piGradeSvg(res, cenas) }); arqs.push({ nome: "referencias/grade-mapas.svg", svg: piGradeSvg(res, mapas) }); }
  arqs.push({ nome: "referencias/planta.svg", svg: piPlantaSvg(res, 0) }); arqs.push({ nome: "paleta.svg", svg: piPaletaSvg(res.paleta) });
  if (o.miniaturas !== false) arqs.push(...piMiniaturasUsadas(res));
  if (res.prompt.en) arqs.push({ nome: "prompt-en.txt", texto: res.prompt.en }); if (res.prompt.pt) arqs.push({ nome: "prompt-pt.txt", texto: res.prompt.pt });
  arqs.push({ nome: "prompt.json", texto: JSON.stringify({ formato: res.formato, grade: res.grade, opcoes: res.opcoes, variaveis: res.variaveis, paleta: res.paleta, celulas: res.celulas.map(a => ({ indice: a.indice + 1, camera: a.camera, itens: a.itens.map(i => ({ nome: i.nome, tipo: i.tipo, caixa: { x0: +Math.max(0, i.caixa.u0).toFixed(3), x1: +Math.min(1, i.caixa.u1).toFixed(3), y0: +Math.max(0, i.caixa.v0).toFixed(3), y1: +Math.min(1, i.caixa.v1).toFixed(3) }, cor: i.cor, descricao: i.descricao, pose: i.pose && i.pose.nome, face: i.face && i.face[0], olhar: i.olhar && i.olhar[0], mundoM: i.mundo, distanciaCameraM: +i.dist.toFixed(2) })), sobreposicoes: a.sobreposicoes, relacoes: a.relacoes })), prompt: res.prompt, avisos: res.avisos }, null, 2) });
  arqs.push({ nome: "texto-da-cena.gm.txt", texto: o.texto || "" });
  arqs.push({ nome: "LEIA-ME.txt", texto: "Pacote de prompt do GeoMannequin\n\n1. Abra o Google Flow (ou outra IA de imagem) e cole o prompt-en.txt (o inglês costuma ser seguido melhor; o prompt-pt.txt é a mesma coisa em português).\n2. Proporção: " + res.formato + (res.grade.celulas > 1 ? " · grade " + res.grade.colunas + "x" + res.grade.linhas + " (folha com " + res.grade.celulas + " painéis)" : "") + ".\n3. Como referência de imagem, use referencias/" + (res.grade.celulas > 1 ? "grade-cenas" : "celula-01-cena") + " (composição e poses) e, se a IA aceitar mais de uma, o mapa (caixas e cores) e a paleta.\n4. Cores: sempre pelo código (#RRGGBB) — estão no prompt e em paleta.svg.\n5. miniaturas/ mostra cada pose, ângulo, enquadramento, lente, objeto e animal usados.\n6. texto-da-cena.gm.txt reabre esta cena no GeoMannequin (janela Prompt).\n" });
  return arqs; }
/* catálogo de ângulos (para autocomplete e miniaturas): elevação, lado, enquadramento, lente */
const PI_ANGULOS = { lado: { frente: "de frente", "3/4": "três-quartos (esquerda)", "3/4-direita": "três-quartos (direita)", perfil: "perfil (esquerdo)", "perfil-direito": "perfil (direito)", costas: "de costas" },
  angulo: { normal: "altura dos olhos", plongee: "de cima", "contra-plongee": "de baixo", zenital: "a pino, de cima", nadir: "a pino, de baixo", holandes: "inclinado" },
  plano: { geral: "o lugar todo", conjunto: "grupo e lugar", inteiro: "corpo inteiro", americano: "joelhos para cima", medio: "cintura para cima", "primeiro-plano": "peito para cima", close: "rosto", detalhe: "um detalhe" }, lente: { 14: "ultra grande-angular", 24: "grande-angular", 35: "natural aberta", 50: "normal", 85: "retrato", 135: "tele", 200: "super tele" } };
export { PI_CORES, PI_FORMATOS, PI_ANGULOS, PI_VARIAR, piNomeCor, piHex, piCoresNoTexto, piLer, piExpandir, piAnalisar, piGerar, piMontar, piPaleta, piMapaSvg, piGradeSvg, piPaletaSvg, piPlantaSvg, piArquivos, piMiniaturasUsadas, piPose, piObj, piRazao };
