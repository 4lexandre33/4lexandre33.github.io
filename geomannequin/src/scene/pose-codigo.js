/* GeoMannequin — pose como código: gerar o texto de uma pose, ler de volta (sem eval),
   aplicar inteira ou só uma parte do corpo, e a biblioteca "Minhas poses".

   O texto é o mesmo em todos os lugares: campo "Código da pose", editor de comandos,
   arquivo exportado, MCP. Exemplo:

     pose("Aceno", {
       // braço direito
       ombroDirAbrir: 95, cotoveloDir: 70,
     });

   As chaves são os nomes em português (ALIAS); os nomes internos (elbowR) também valem. */
import { SCN } from "./modelo.js";
import { ALIAS, SLK, POSEKEYS } from "./parametros.js";
import { DEF } from "../engine/index.js";

const FORMATO_POSE = 1;

/* ---- partes do corpo: cada chave de pose pertence a exatamente uma ---- */
const PARTES_POSE = {
  corpo: "Corpo inteiro (inclinar, rolar, altura, apoio)",
  tronco: "Coluna e pelve",
  cabeca: "Cabeça e pescoço",
  rosto: "Rosto (boca, olhos, sobrancelhas)",
  bracoEsq: "Braço esquerdo (ombro, escápula, cotovelo, punho)",
  bracoDir: "Braço direito (ombro, escápula, cotovelo, punho)",
  maoEsq: "Mão esquerda (dedos)",
  maoDir: "Mão direita (dedos)",
  pernaEsq: "Perna esquerda (quadril, joelho, tornozelo, pé)",
  pernaDir: "Perna direita (quadril, joelho, tornozelo, pé)"
};
const APELIDOS_PARTE = {
  braco: ["bracoEsq", "bracoDir"], bracos: ["bracoEsq", "bracoDir"], mao: ["maoEsq", "maoDir"], maos: ["maoEsq", "maoDir"],
  perna: ["pernaEsq", "pernaDir"], pernas: ["pernaEsq", "pernaDir"], dedos: ["maoEsq", "maoDir"],
  esquerda: ["bracoEsq", "maoEsq", "pernaEsq"], direita: ["bracoDir", "maoDir", "pernaDir"],
  "membros superiores": ["bracoEsq", "bracoDir", "maoEsq", "maoDir"], cabecaerosto: ["cabeca", "rosto"], tudo: Object.keys(PARTES_POSE)
};
function parteDaChave(k) {
  const lado = /L$/.test(k) ? "Esq" : /R$/.test(k) ? "Dir" : "";
  if (/^(bodyPitch|bodyRoll|bodyLift|ground)$/.test(k)) return "corpo";
  if (/^(spine|lum|tho|pelvis)/.test(k)) return "tronco";
  if (/^(head|neck)/.test(k)) return "cabeca";
  if (/^(jaw|smile|eye|brow|blush|tears|lid|cheek|nose|nostril|upperLip|lowerLip|mouth|lipPress|lipBite|pout|teethClench|teethShow|wrinkle|iris|pupil|lash|fang|tongueOut|angerVein|sweatDrop)/.test(k)) return "rosto";
  if (/^(sh|scap|arm|elbow|pron|wrist)/.test(k)) return k === "shTension" ? "tronco" : "braco" + (lado || "Esq");
  if (/^(f[A-Z]|fSpread|thumb|handCurl)/.test(k)) return "mao" + (lado || "Esq");
  if (/^(hip|knee|ankle|toes|hallux|foot|tibia)/.test(k)) return "perna" + (lado || "Esq");
  return "corpo";
}
function normalizarParte(p) {
  const t = String(p || "").trim(); if (!t) return null;
  const base = t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
  const k = Object.keys(PARTES_POSE).find(x => x.toLowerCase() === base.toLowerCase().replace(/ /g, ""));
  if (k) return [k];
  const a = APELIDOS_PARTE[base.toLowerCase()] || APELIDOS_PARTE[base.toLowerCase().replace(/ /g, "")];
  if (a) return a.slice();
  throw new Error("Parte “" + p + "”: use " + Object.keys(PARTES_POSE).join(", ") + " (ou bracos, maos, pernas, esquerda, direita, tudo).");
}
function partesPedidas(partes) {
  if (partes === undefined || partes === null || partes === "" || partes === "tudo") return null;
  const lista = Array.isArray(partes) ? partes : String(partes).split(/[,;+]/);
  const s = new Set(); lista.forEach(p => (normalizarParte(p) || []).forEach(x => s.add(x)));
  return s.size ? s : null;
}

/* nome legível de cada chave interna (o primeiro apelido em português) */
let _legivel = null;
function nomeLegivel(k) {
  if (!_legivel) { _legivel = {}; Object.entries(ALIAS).forEach(([a, k2]) => { if (!(k2 in _legivel)) _legivel[k2] = a; }); }
  return _legivel[k] || k;
}
function chaveInterna(nome) { return ALIAS[nome] || nome; }

/* ---- gerar ---- */
const ROTULO = k => { const d = SLK[k]; return d && d.label ? d.label : ""; };
function arred(v) { return Math.abs(v) >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 1000) / 1000; }
/* opts: nome, partes ("bracoDir", ["maos","rosto"]…), soMudancas (só o que difere da pose neutra), comentarios */
function codigoDaPose(params, opts = {}) {
  const sel = partesPedidas(opts.partes), so = !!opts.soMudancas, com = opts.comentarios !== false;
  const grupos = {};
  [...POSEKEYS].forEach(k => {
    const v = params[k]; if (typeof v !== "number" || !isFinite(v)) return;
    const parte = parteDaChave(k); if (sel && !sel.has(parte)) return;
    if (so && Math.abs(v - (DEF[k] ?? 0)) < 1e-6) return;
    (grupos[parte] = grupos[parte] || []).push([nomeLegivel(k), arred(v), k]);
  });
  const nome = String(opts.nome || "").replace(/["\\\n]/g, " ").trim();
  const cab = ["/* GeoMannequin · pose" + (nome ? " “" + nome + "”" : "") + " · formato " + FORMATO_POSE +
    (sel ? " · partes: " + [...sel].join(", ") : "") + (so ? " · só o que difere da pose neutra" : ""),
    (opts.expressao ? "   Rosto: partiu de “" + String(opts.expressao).replace(/\*\//g, "") + "” (os valores estão no grupo “rosto” abaixo)." : "   O rosto (expressão) vai junto, no grupo “rosto”; para só o rosto use m.rostoCodigo()."),
    "   Cole em “Código da pose”, no editor de comandos ou em Minhas poses › Importar. */"];
  const linhas = [];
  /* pose de atleta/ginasta: o perfil de flexibilidade vai na frente (sem ele os ângulos além do normal seriam cortados) */
  if (!sel && params.flex > 0) linhas.push("  flexibilidade: " + Math.round(params.flex) + ", // 0 normal · 1 atleta · 2 ginasta · 3 contorcionista");
  Object.keys(PARTES_POSE).forEach(p => {
    const g = grupos[p]; if (!g) return;
    if (com) linhas.push("  // " + PARTES_POSE[p].toLowerCase());
    for (let i = 0; i < g.length; i += 4) linhas.push("  " + g.slice(i, i + 4).map(([n, v]) => n + ": " + v).join(", ") + ",");
  });
  return cab.join("\n") + "\npose(" + (nome ? JSON.stringify(nome) + ", " : "") + "{\n" + linhas.join("\n") + "\n});\n";
}

/* ---- ler (sem executar nada) ---- */
function erroLinha(txt, pos, msg) {
  const linha = txt.slice(0, pos).split("\n").length;
  const e = new Error("Linha " + linha + ": " + msg); e.linha = linha; return e;
}
/* aceita: pose("Nome", {...}) · pose({...}) · m.pose({...}) · {...} · JSON; devolve {nome, valores, partes} */
function lerCodigoDePose(texto) {
  const txt = String(texto ?? "");
  if (!txt.trim()) throw new Error("O código da pose está vazio.");
  /* tira comentários preservando as posições (para o número da linha) */
  let limpo = "", i = 0, aspas = null;
  while (i < txt.length) {
    const c = txt[i], d = txt[i + 1];
    if (aspas) { limpo += c; if (c === "\\") { limpo += d || ""; i += 2; continue; } if (c === aspas) aspas = null; i++; continue; }
    if (c === '"' || c === "'") { aspas = c; limpo += c; i++; continue; }
    if (c === "/" && d === "/") { while (i < txt.length && txt[i] !== "\n") { limpo += " "; i++; } continue; }
    if (c === "/" && d === "*") { const f = txt.indexOf("*/", i + 2), fim = f < 0 ? txt.length : f + 2; for (; i < fim; i++) limpo += txt[i] === "\n" ? "\n" : " "; continue; }
    limpo += c; i++;
  }
  let nome = "";
  const mNome = /pose\s*\(\s*(["'])((?:\\.|(?!\1).)*)\1\s*,/.exec(limpo);
  if (mNome) nome = mNome[2].replace(/\\(.)/g, "$1");
  const a = limpo.indexOf("{");
  if (a < 0) throw new Error("Não achei o bloco { … } com os ângulos da pose.");
  let prof = 0, b = -1;
  for (let j = a; j < limpo.length; j++) { if (limpo[j] === "{") prof++; else if (limpo[j] === "}") { prof--; if (!prof) { b = j; break; } } }
  if (b < 0) throw erroLinha(txt, a, "falta fechar a chave “}” do bloco da pose.");
  const corpo = limpo.slice(a + 1, b), base = a + 1, valores = {}, partes = new Set();
  let flex = null;
  const ITEM = /^(["']?)([A-Za-z_$][\w$]*)\1\s*:\s*([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)$/;
  let ini = 0;
  for (const pedaco of corpo.split(",")) {
    const lead = pedaco.length - pedaco.trimStart().length, item = pedaco.trim(), pos = base + ini + lead;
    ini += pedaco.length + 1;
    if (!item) continue;
    const m = ITEM.exec(item);
    if (!m) throw erroLinha(txt, pos, "não entendi “" + item.split(/\s+/).slice(0, 3).join(" ") + "”. Use nome: número, separados por vírgula.");
    const k = chaveInterna(m[2]);
    /* perfil de flexibilidade (0 normal · 1 atleta · 2 ginasta · 3 contorcionista): vale antes dos ângulos */
    if (k === "flex" || m[2] === "flexibilidade") { flex = Math.max(0, Math.min(3, Math.round(Number(m[3])))); continue; }
    if (!POSEKEYS.has(k)) {
      const sug = Object.keys(ALIAS).filter(x => POSEKEYS.has(ALIAS[x]) && x.toLowerCase().startsWith(m[2].toLowerCase().slice(0, 4))).slice(0, 4);
      throw erroLinha(txt, pos, "“" + m[2] + "” não é um ângulo de pose." + (sug.length ? " Talvez: " + sug.join(", ") + "." : ""));
    }
    valores[k] = Number(m[3]); partes.add(parteDaChave(k));
  }
  if (!Object.keys(valores).length) throw new Error("O bloco da pose não tem nenhum ângulo.");
  /* a flexibilidade viaja junto dos valores (chave flex), para quem aplica ajustar a faixa antes */
  if (flex !== null) valores.flex = flex;
  return { nome, valores, partes: [...partes] };
}
/* recorte de um conjunto de valores para algumas partes */
function filtrarPartes(valores, partes) {
  const sel = partesPedidas(partes); if (!sel) return { ...valores };
  const o = {}; Object.entries(valores).forEach(([k, v]) => { if (k === "flex" || sel.has(parteDaChave(k))) o[k] = v; }); return o;
}
/* troca esquerda ↔ direita (para aplicar uma pose de mão direita na esquerda, por exemplo) */
const NEGA_ESPELHO = /^(headYaw|headRoll|neckSide|neckTwist|spineSide|spineTwist|lumSide|lumTwist|thoSide|thoTwist|pelvisSide|pelvisTwist|bodyRoll|jawSide|eyeYaw)$/;
function espelharValores(valores) {
  const o = {};
  Object.entries(valores).forEach(([k, v]) => {
    const k2 = /L$/.test(k) ? k.replace(/L$/, "R") : /R$/.test(k) ? k.replace(/R$/, "L") : k;
    o[POSEKEYS.has(k2) ? k2 : k] = NEGA_ESPELHO.test(k) ? -v : v;
  });
  return o;
}

/* ---- Minhas poses: na cena (salva com ela) e, no navegador, também guardadas entre sessões ---- */
const CHAVE_LOCAL = "geomannequin.minhasPoses";
function posesSalvas() { if (!SCN.minhasPoses) SCN.minhasPoses = []; return SCN.minhasPoses; }
function persistirPoses() { try { if (typeof localStorage !== "undefined") localStorage.setItem(CHAVE_LOCAL, JSON.stringify(posesSalvas())); } catch (e) { } }
function carregarPosesLocais() {
  try {
    if (typeof localStorage === "undefined") return;
    const t = localStorage.getItem(CHAVE_LOCAL); if (!t) return;
    const lista = JSON.parse(t); if (!Array.isArray(lista)) return;
    lista.forEach(p => { if (p && p.nome && p.valores && !posesSalvas().some(x => x.nome === p.nome)) posesSalvas().push(p); });
  } catch (e) { }
}
function nomeLivre(nome) {
  const base = String(nome || "").trim() || "Pose";
  if (!posesSalvas().some(p => p.nome === base)) return base;
  let i = 2; while (posesSalvas().some(p => p.nome === base + " " + i)) i++; return base + " " + i;
}
/* salva; com {substituir:true} troca a de mesmo nome, senão numera ("Aceno 2") */
function salvarPose(nome, valores, opts = {}) {
  if (!valores || !Object.keys(valores).length) throw new Error("Nada para salvar: a pose está vazia.");
  const lista = posesSalvas(), n0 = String(nome || "").trim() || "Pose";
  const i = lista.findIndex(p => p.nome === n0);
  const reg = { nome: i >= 0 && opts.substituir ? n0 : nomeLivre(n0), valores: { ...valores }, criada: new Date().toISOString(), ...(opts.miniatura ? { miniatura: opts.miniatura } : {}) };
  if (i >= 0 && opts.substituir) lista[i] = reg; else lista.push(reg);
  persistirPoses(); return reg;
}
function acharPoseSalva(nome) {
  const p = posesSalvas().find(x => x.nome === nome) || posesSalvas().find(x => x.nome.toLowerCase() === String(nome).toLowerCase());
  if (!p) throw new Error("Não há pose salva com o nome “" + nome + "”." + (posesSalvas().length ? " Salvas: " + posesSalvas().map(x => x.nome).join(", ") + "." : ""));
  return p;
}
function apagarPose(nome) { const p = acharPoseSalva(nome); SCN.minhasPoses = posesSalvas().filter(x => x !== p); persistirPoses(); return true; }
function renomearPose(nome, novo) {
  const p = acharPoseSalva(nome), n = String(novo || "").trim(); if (!n) throw new Error("Dê um nome novo.");
  if (n !== p.nome && posesSalvas().some(x => x.nome === n)) throw new Error("Já existe uma pose chamada “" + n + "”.");
  p.nome = n; persistirPoses(); return p;
}
function duplicarPose(nome) { const p = acharPoseSalva(nome); return salvarPose(p.nome + " (cópia)", p.valores, { miniatura: p.miniatura }); }
/* arquivo com várias poses: um texto com um bloco pose(...) por pose */
function exportarPoses(nomes) {
  const lista = nomes ? (Array.isArray(nomes) ? nomes : [nomes]).map(acharPoseSalva) : posesSalvas();
  return lista.map(p => codigoDaPose(p.valores, { nome: p.nome })).join("\n");
}
/* importa um texto com um ou mais blocos pose(...) (ou JSON exportado); devolve as poses salvas */
function importarPoses(texto) {
  const t = String(texto || "").trim(); if (!t) throw new Error("Nada para importar.");
  if (t[0] === "[") {
    let arr; try { arr = JSON.parse(t); } catch (e) { throw new Error("JSON inválido: " + e.message); }
    return arr.map(p => salvarPose(p.nome, lerCodigoDePose(JSON.stringify(p.valores || {})).valores));
  }
  const blocos = t.split(/(?=(?:\/\*[^]*?\*\/\s*)?\bpose\s*\()/).filter(b => /\{/.test(b));
  if (!blocos.length) return [salvarPose("Pose importada", lerCodigoDePose(t).valores)];
  return blocos.map((b, i) => { const r = lerCodigoDePose(b); return salvarPose(r.nome || "Pose importada " + (i + 1), r.valores); });
}

export {
  FORMATO_POSE, PARTES_POSE, parteDaChave, partesPedidas, nomeLegivel, codigoDaPose, lerCodigoDePose, filtrarPartes, espelharValores,
  posesSalvas, carregarPosesLocais, salvarPose, acharPoseSalva, apagarPose, renomearPose, duplicarPose, exportarPoses, importarPoses
};
