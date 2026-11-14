/* GeoMannequin — POSES e ANIMAÇÕES por TEXTO.
   - Juntas com nome de gente: ombro.direito(frente 40, abre 10) · joelho.esquerdo(dobra 30) · tronco(gira-esquerda 15).
     Valor sozinho = fica nesse valor; "+10"/"-10" = soma ao que já está. Graus, % (mão, olhos, boca) e cm (subir o corpo).
   - Atalhos de corpo inteiro: agacha 60% · ajoelha direito · peso esquerdo · inclina frente 20 · olha baixo · sobe 30cm ·
     deita costas · espelha bracos · mistura passo 50% · copia pernas de correndo · zera bracos.
   - Miniaturas (esqueleto em 3/4): da pose, da junta destacada, do movimento e a tirinha de 4 quadros da animação.
   - Operações sobre animações: derivar (troca parte por pose, soma, tira), trecho, até um ângulo, reverter, espelhar,
     repetir, vai-e-volta, amplitude, esticar, juntar (uma depois da outra) e camada (partes de uma + partes de outra).
   - Ciclo a partir de UMA pose: A → passagem → A espelhada → passagem → A (andar, correr, engatinhar…).
   - Autocompletar: o que pode vir depois do ponto ou da palavra (usado pelo editor do site e pelo MCP). */
import { SCN } from "./modelo.js";
import { SLK, POSEKEYS, faixa } from "./parametros.js";
import { todasPoses, nomePose, EXPRESSOES } from "./poses.js";
import { espelharValores, posesSalvas } from "./pose-codigo.js";
import { AN_PARTES, ATITUDES, GESTOS_CONVERSA, CURVAS, criarAnimacao, amostrar, anPoseValores, anEspelhar, bibliotecaAnimacoes, retimar, aplicarAtitude, anSemCamera } from "./animacao.js";
import { apoioNoTempo, pesDoManequim, mvDensificar, mvCalibrarMover } from "./movimento.js";
import { ossosDoCorpo } from "../engine/index.js";

const PD_M = 1 / 0.114; /* R por metro */
const pdNorm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_\s]+/g, "-");
function pdErro(msg, linha) { const e = new Error(msg); e.linha = linha; return e; }

/* ===================== juntas ===================== */
/* mov: palavra → [parâmetro (sem L/R), sinal, tipo]; tipo g = graus, p = 0–1 (aceita %), cm = centímetros (vira R), zero = volta a 0 */
const PD_JUNTAS = {
  ombro: { apelidos: ["braco", "braço"], lado: true, k: "ombro", regiao: "braco", desc: "o braço inteiro, a partir do ombro",
    mov: { frente: ["armFlex", 1], tras: ["armFlex", -1], abre: ["armAbd", 1], cruza: ["armAbd", -1], "gira-fora": ["armRot", 1], "gira-dentro": ["armRot", -1], sobe: ["shElev", 1, "p"], desce: ["shElev", -1, "p"], avanca: ["shProt", 1, "p"], recua: ["shProt", -1, "p"] } },
  cotovelo: { lado: true, k: "cotovelo", regiao: "braco", desc: "dobrar o braço", mov: { dobra: ["elbow", 1], estica: ["elbow", 0, "zero"] } },
  antebraco: { apelidos: ["antebraço"], lado: true, k: "cotovelo", regiao: "braco", desc: "virar a palma", mov: { "palma-cima": ["pron", 1], "palma-baixo": ["pron", -1] } },
  punho: { lado: true, k: "punho", regiao: "mao", desc: "a mão em relação ao antebraço", mov: { dobra: ["wrist", 1], levanta: ["wrist", -1], "lado-polegar": ["wristDev", 1], "lado-minimo": ["wristDev", -1] } },
  mao: { apelidos: ["mão"], lado: true, k: "punho", regiao: "mao", desc: "abrir, fechar e cada dedo (100% = fechado)",
    mov: { fecha: ["handCurl", 1, "p"], abre: ["handCurl", 0, "zero"], afasta: ["fSpread", 1, "p"], polegar: ["fTh", 1, "p"], indicador: ["fIn", 1, "p"], medio: ["fMe", 1, "p"], anelar: ["fAn", 1, "p"], minimo: ["fMi", 1, "p"], opoe: ["thumbOpp", 1, "p"] } },
  quadril: { apelidos: ["coxa", "perna"], lado: true, k: "quadril", regiao: "perna", desc: "a perna inteira, a partir do quadril",
    mov: { frente: ["hipFlex", 1], tras: ["hipFlex", -1], abre: ["hipAbd", 1], fecha: ["hipAbd", -1], "gira-fora": ["hipRot", 1], "gira-dentro": ["hipRot", -1] } },
  joelho: { lado: true, k: "joelho", regiao: "perna", desc: "dobrar a perna", mov: { dobra: ["kneeFlex", 1], estica: ["kneeFlex", 0, "zero"] } },
  canela: { lado: true, k: "joelho", regiao: "perna", desc: "girar a canela (com o joelho dobrado)", mov: { gira: ["tibiaRot", 1] } },
  tornozelo: { apelidos: ["pe", "pé"], lado: true, k: "tornozelo", regiao: "pe", desc: "o pé em relação à perna",
    mov: { aponta: ["ankleFlex", 1], "levanta-ponta": ["ankleFlex", -1], "sola-dentro": ["ankleTilt", 1], "sola-fora": ["ankleTilt", -1], "ponta-dentro": ["footAdd", 1], "ponta-fora": ["footAdd", -1] } },
  "dedos-pe": { apelidos: ["dedos-do-pe"], lado: true, k: "tornozelo", regiao: "pe", desc: "os dedos do pé", mov: { dobra: ["toes", 1], levanta: ["toes", -1] } },
  tronco: { apelidos: ["coluna"], k: "toracica", regiao: "tronco", desc: "a coluna inteira",
    mov: { frente: ["spineFlex", 1], tras: ["spineFlex", -1], direita: ["spineSide", 1], esquerda: ["spineSide", -1], "gira-esquerda": ["spineTwist", 1], "gira-direita": ["spineTwist", -1] } },
  lombar: { k: "lombar", regiao: "tronco", desc: "só a parte de baixo da coluna", mov: { frente: ["lumFlex", 1], tras: ["lumFlex", -1], direita: ["lumSide", 1], esquerda: ["lumSide", -1], "gira-esquerda": ["lumTwist", 1], "gira-direita": ["lumTwist", -1] } },
  peito: { apelidos: ["toracica", "torácica"], k: "toracica", regiao: "tronco", desc: "só a parte de cima da coluna", mov: { frente: ["thoFlex", 1], tras: ["thoFlex", -1], direita: ["thoSide", 1], esquerda: ["thoSide", -1], "gira-esquerda": ["thoTwist", 1], "gira-direita": ["thoTwist", -1] } },
  pelve: { apelidos: ["bacia"], k: "pelve", regiao: "tronco", desc: "a bacia", mov: { frente: ["pelvisTilt", 1], tras: ["pelvisTilt", -1], direita: ["pelvisSide", 1], esquerda: ["pelvisSide", -1], "gira-esquerda": ["pelvisTwist", 1], "gira-direita": ["pelvisTwist", -1] } },
  pescoco: { apelidos: ["pescoço"], k: "cervical", regiao: "cabeca", desc: "o pescoço", mov: { frente: ["neckFlex", 1], tras: ["neckFlex", -1], direita: ["neckSide", 1], esquerda: ["neckSide", -1], "gira-esquerda": ["neckTwist", 1], "gira-direita": ["neckTwist", -1] } },
  cabeca: { apelidos: ["cabeça"], k: "cabeca", regiao: "cabeca", desc: "a cabeça", mov: { baixa: ["headPitch", 1], sobe: ["headPitch", -1], "gira-esquerda": ["headYaw", 1], "gira-direita": ["headYaw", -1], "inclina-direita": ["headRoll", 1], "inclina-esquerda": ["headRoll", -1] } },
  olhos: { k: "rosto", regiao: "cabeca", desc: "para onde os olhos olham (100% = o máximo)", mov: { esquerda: ["eyeYaw", 1, "p"], direita: ["eyeYaw", -1, "p"], cima: ["eyePitch", 1, "p"], baixo: ["eyePitch", -1, "p"], fecha: ["eyeLid", 1, "p"] } },
  boca: { k: "rosto", regiao: "cabeca", desc: "boca", mov: { abre: ["jawOpen", 1, "p"], sorri: ["smile", 1, "p"], triste: ["smile", -1, "p"] } },
  corpo: { k: "pelve", regiao: "tronco", desc: "o corpo inteiro (deitar, rolar, subir do chão)", mov: { "deita-costas": ["bodyPitch", -1], "deita-brucos": ["bodyPitch", 1], rola: ["bodyRoll", 1], sobe: ["bodyLift", 1, "cm"] } }
};
const PD_JUNTA_DE = {}; for (const [k, j] of Object.entries(PD_JUNTAS)) { PD_JUNTA_DE[k] = k; (j.apelidos || []).forEach(a => { PD_JUNTA_DE[pdNorm(a)] = k; }); }
const PD_LADOS = { direito: "R", direita: "R", dir: "R", d: "R", r: "R", esquerdo: "L", esquerda: "L", esq: "L", e: "L", l: "L", ambos: "LR", "os-dois": "LR", dois: "LR" };
function pdJunta(nome) { return PD_JUNTA_DE[pdNorm(nome)] || null; }
/* a faixa (com unidade) de um movimento, para a ajuda dentro dos parênteses */
function pdFaixaMov(junta, mov, lado) {
  const j = PD_JUNTAS[junta], m = j && j.mov[mov]; if (!m) return "";
  const k = m[0] + (j.lado ? (lado === "L" ? "L" : "R") : ""), [a, b] = faixa(k, 0), u = m[2] || "g";
  if (u === "zero") return "volta a 0"; if (u === "cm") return "0–" + Math.round(b / PD_M * 100) + " cm";
  const lim = m[1] >= 0 ? b : -a; return u === "p" ? "0–" + Math.round(lim * 100) + "%" : "0–" + Math.round(lim) + "°";
}
/* "frente 40, abre +10, estica" → aplica nos parâmetros; devolve avisos (passou do limite…) */
function pdAplicarJunta(Q, junta0, lado0, args, linha) {
  const junta = pdJunta(junta0); if (!junta) throw pdErro("Junta “" + junta0 + "” não existe. Juntas: " + Object.keys(PD_JUNTAS).join(", ") + ".", linha);
  const J = PD_JUNTAS[junta], avisos = []; let lados = [""];
  if (J.lado) { const l = lado0 ? PD_LADOS[pdNorm(lado0)] : "LR"; if (!l) throw pdErro(junta + "." + lado0 + ": o lado é direito, esquerdo ou ambos.", linha); lados = l.split(""); }
  else if (lado0) throw pdErro("“" + junta + "” não tem lado (escreva só " + junta + "(…)).", linha);
  const pal = String(args || "").replace(/,/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!pal.length) throw pdErro(junta + "(…): diga o movimento, ex.: " + junta + (J.lado ? ".direito" : "") + "(" + Object.keys(J.mov)[0] + " 30).", linha);
  for (let i = 0; i < pal.length; i++) {
    const w = pdNorm(pal[i]), m = J.mov[w];
    if (!m) { let sug = null, bd = 1e9; for (const x of Object.keys(J.mov)) { const d = pdLev(w, x); if (d < bd) { bd = d; sug = x; } } if (bd > Math.max(2, w.length * 0.4)) sug = null; throw pdErro(junta + ": movimento “" + pal[i] + "” não existe." + (sug ? " Quis dizer “" + sug + "”?" : "") + " Movimentos: " + Object.keys(J.mov).join(", ") + ".", linha); }
    let num = null, rel = false, pct = false, cm = false;
    const nx = pal[i + 1], mm = nx && /^([+-]?)(\d+(?:[.,]\d+)?)(%|°|º|cm|m)?$/.exec(nx);
    if (mm) { num = parseFloat(mm[2].replace(",", ".")); rel = !!mm[1]; if (mm[1] === "-") num = -num; pct = mm[3] === "%"; cm = mm[3] === "cm" || mm[3] === "m"; if (mm[3] === "m") num *= 100; i++; }
    const tipo = m[2] || "g";
    for (const L of lados) {
      const k = m[0] + L; if (!(k in SLK) && !POSEKEYS.has(k)) continue;
      let v;
      if (tipo === "zero") { const ehP = /^(handCurl)$/.test(m[0]); v = num === null ? 0 : Math.max(0, (Q[k] || 0) - Math.abs(ehP ? (pct || Math.abs(num) > 1 ? num / 100 : num) : num)); }
      else {
        if (num === null) { if (tipo === "p") num = 1; else throw pdErro(junta + " " + w + ": diga quanto (ex.: " + w + " 30" + (tipo === "cm" ? "cm" : "") + ").", linha); }
        let x = tipo === "p" ? (pct || Math.abs(num) > 1 ? num / 100 : num) : tipo === "cm" ? num / 100 * PD_M : num;
        v = rel ? (Q[k] || 0) + m[1] * x : m[1] * x;
      }
      const [a, b] = faixa(k, Q.flex);
      if (v < a - 1e-6 || v > b + 1e-6) { avisos.push(junta + (J.lado ? "." + (L === "R" ? "direito" : "esquerdo") : "") + " " + w + ": passou do limite — fica em " + (v < a ? a : b).toFixed(tipo === "p" ? 2 : 0) + (tipo === "p" ? "" : "°")); v = Math.max(a, Math.min(b, v)); }
      Q[k] = v;
    }
  }
  return avisos;
}
/* tira "junta.lado(…)" de uma linha e põe marcadores §J0, §J1… (o resto da linha segue a gramática normal) */
const PD_RX_JUNTA = /(^|[\s,;])([A-Za-zÀ-ÿ-]+)(?:\.([A-Za-zÀ-ÿ-]+))?\(([^)]*)\)/g;
function pdExtrairJuntas(txt) {
  const juntas = []; const out = String(txt).replace(PD_RX_JUNTA, (m0, pre, j, l, a) => { if (!pdJunta(j)) return m0; juntas.push({ junta: j, lado: l || null, args: a }); return pre + "§J" + (juntas.length - 1) + " "; });
  return { txt: out, juntas };
}

/* ===================== poses: achar por nome (do próprio texto, salvas, prontas) ===================== */
function pdBase() { const b = SCN.list && SCN.list[0] ? anSemCamera(SCN.list[0].params) : {}; return anPoseValores("empe", b); }
/* valores de uma pose pronta com as proporções do corpo (anPoseValores precisa do corpo inteiro) */
const pdPose = n => anPoseValores(n, pdParams({}));
function pdTodasPoses(ctx) { return [...(ctx && ctx.poses ? [...ctx.poses.keys()] : []), ...posesSalvas().map(p => p.nome), ...todasPoses()]; }
function pdValoresPose(nome, base, ctx, linha) {
  const n = pdNorm(nome);
  if (ctx && ctx.poses) for (const [k, v] of ctx.poses) if (pdNorm(k) === n) return { nome: k, valores: Object.assign({}, v), origem: "texto" };
  const s = posesSalvas().find(p => pdNorm(p.nome) === n); if (s) return { nome: s.nome, valores: Object.assign(anPoseValores("empe", base || {}), s.valores), origem: "salva" };
  const ok = todasPoses(); let k = nomePose(nome); if (!ok.includes(k)) { const k2 = ok.find(x => pdNorm(x) === n || pdNorm(x) === n.replace(/-/g, "")); if (k2) k = k2; }
  if (ok.includes(k)) return { nome: k, valores: anPoseValores(k, base || {}), origem: "pronta" };
  const todas = pdTodasPoses(ctx); let melhor = null, bd = 1e9; for (const x of todas) { const d = pdLev(n, pdNorm(x)); if (d < bd) { bd = d; melhor = x; } }
  throw pdErro("Pose “" + nome + "” não existe." + (melhor && bd <= Math.max(2, n.length * 0.4) ? " Quis dizer “" + melhor + "”?" : ""), linha);
}
function pdLev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
/* partes por nome ("pernas", "braco-direito", "tudo"…) → chaves de AN_PARTES */
const PD_PARTES = { pernas: ["pernaDireita", "pernaEsquerda"], bracos: ["bracoDireito", "bracoEsquerdo", "ombros"], maos: ["maoDireita", "maoEsquerda"], tronco: ["tronco"], cabeca: ["cabeca"], ombros: ["ombros"], rosto: ["rosto"], corpo: ["corpo"], lugar: ["lugar"],
  "perna-direita": ["pernaDireita"], "perna-esquerda": ["pernaEsquerda"], "braco-direito": ["bracoDireito"], "braco-esquerdo": ["bracoEsquerdo"], "mao-direita": ["maoDireita"], "mao-esquerda": ["maoEsquerda"],
  "corpo-de-cima": ["tronco", "cabeca", "ombros", "bracoDireito", "bracoEsquerdo", "maoDireita", "maoEsquerda"], tudo: ["cabeca", "tronco", "ombros", "bracoDireito", "bracoEsquerdo", "maoDireita", "maoEsquerda", "pernaDireita", "pernaEsquerda", "corpo"] };
for (const k of Object.keys(AN_PARTES)) if (!PD_PARTES[pdNorm(k)]) PD_PARTES[pdNorm(k)] = [k]; /* também bracoDireito, pernaEsquerda… (os nomes do capítulo 11) */
const PD_EXTRA_PARTE = { pernaDireita: ["hipRotR", "footAddR", "tibiaRotR", "halluxR"], pernaEsquerda: ["hipRotL", "footAddL", "tibiaRotL", "halluxL"], corpo: ["ground"] };
function pdChavesDasPartes(lista, linha) {
  const out = new Set(); for (const p0 of lista) { const p = pdNorm(p0).replace(/ç/g, "c"), ps = PD_PARTES[p] || (AN_PARTES[p0] ? [p0] : null);
    if (!ps) throw pdErro("Parte “" + p0 + "” não existe. Partes: " + Object.keys(PD_PARTES).join(", ") + ".", linha);
    ps.forEach(q => { (AN_PARTES[q] || []).forEach(k => out.add(k)); (PD_EXTRA_PARTE[q] || []).forEach(k => out.add(k)); }); }
  return out;
}
/* lê "pernas e bracos" / "pernas, bracos" a partir de toks[k]; devolve [lista, próximo k] */
function pdLerPartes(toks, k) { const l = []; while (toks[k] && toks[k].t === "pal" && (PD_PARTES[pdNorm(toks[k].v)] || toks[k].v === "e")) { if (toks[k].v !== "e") l.push(toks[k].v); k++; if (toks[k] && toks[k].v === ",") k++; } return [l, k]; }

/* ===================== atalhos (dentro de pose, chave ou linha de quadro) ===================== */
const PD_ATALHOS = ["agacha", "ajoelha", "senta", "peso", "inclina", "olha", "sobe", "deita", "espelha", "mistura", "copia", "so", "zera"];
/* tenta ler um atalho em toks[k]; devolve o próximo k (ou -1 se não for atalho). Q = parâmetros que estão sendo montados */
function pdAtalho(Q, toks, k, linha, ctx) {
  const w = pdNorm(toks[k].v), nx = toks[k + 1], nw = nx ? pdNorm(nx.v) : "", num = t => t && t.t === "num" ? t : null;
  const misturar = (vals, f, chaves) => { for (const [kk, v] of Object.entries(vals)) if (!chaves || chaves.has(kk)) { if (Number.isFinite(v)) Q[kk] = (Q[kk] || 0) + (v - (Q[kk] || 0)) * f; } };
  const pct = t => t.u === "%" || t.v > 1 ? t.v / 100 : t.v;
  if (w === "agacha") { let f = 1, kk = k; if (num(nx)) { f = pct(nx); kk++; } misturar(anPoseValores("agachar", Q), f, pdChavesDasPartes(["pernas", "tronco", "corpo"])); return kk + 1; }
  if (w === "ajoelha") { let lado = "os-dois", kk = k; if (nx && /^(direito|esquerdo|direita|esquerda|os-dois|ambos)$/.test(nw)) { lado = nw; kk++; }
    let v = anPoseValores(/^(os-dois|ambos)$/.test(lado) ? "ajoelhado" : "umJoelho", Q);
    if (!/^(os-dois|ambos)$/.test(lado)) { const baixo = (v.hipFlexL || 0) < (v.hipFlexR || 0) ? "L" : "R", quer = /^dir/.test(lado) ? "R" : "L"; if (baixo !== quer) v = espelharValores(v); }
    misturar(v, 1, pdChavesDasPartes(["pernas", "tronco", "corpo"])); return kk + 1; }
  if (w === "senta") { let p = "sentadoChao", kk = k; if (nx && /^(chao|cadeira|calcanhares|cocoras)$/.test(nw)) { p = { chao: "sentadoChao", cadeira: "sentado", calcanhares: "sentadoCalcanhares", cocoras: "cocoras" }[nw]; kk++; } misturar(anPoseValores(p, Q), 1, pdChavesDasPartes(["pernas", "tronco", "corpo"])); return kk + 1; }
  if (w === "peso") { if (!nx || !/^(direito|esquerdo|direita|esquerda)$/.test(nw)) throw pdErro("peso: diga o lado (peso direito / peso esquerdo [70%]).", linha); let I = 1, kk = k + 1; if (num(toks[kk + 1])) { I = pct(toks[kk + 1]); kk++; }
    aplicarAtitude({ name: "_pd", params: Q }, /^dir/.test(nw) ? "pesoNaPernaDireita" : "pesoNaPernaEsquerda", { intensidade: I }); return kk + 1; }
  if (w === "inclina") { if (!nx || !/^(frente|tras|direita|esquerda)$/.test(nw)) throw pdErro("inclina: frente, tras, direita ou esquerda + graus (ex.: inclina frente 20).", linha); const v = num(toks[k + 2]) ? toks[k + 2].v : 15;
    if (nw === "frente") Q.spineFlex = (Q.spineFlex || 0) + v; else if (nw === "tras") Q.spineFlex = (Q.spineFlex || 0) - v; else Q.spineSide = (Q.spineSide || 0) + (nw === "direita" ? v : -v); return k + (num(toks[k + 2]) ? 3 : 2); }
  if (w === "olha" && nx && /^(baixo|cima|direita|esquerda|frente)$/.test(nw)) { const v = num(toks[k + 2]) ? toks[k + 2].v : 25;
    if (nw === "frente") { Q.headYaw = 0; Q.headPitch = 0; Q.eyeYaw = 0; Q.eyePitch = 0; }
    else if (nw === "baixo" || nw === "cima") { const s = nw === "baixo" ? 1 : -1; Q.headPitch = s * v; Q.neckFlex = s * v * 0.3; Q.eyePitch = -s * 0.4; }
    else { const s = nw === "esquerda" ? 1 : -1; Q.headYaw = s * v; Q.eyeYaw = s * 0.5; }
    return k + (num(toks[k + 2]) ? 3 : 2); }
  if (w === "sobe") { const t = num(nx); if (!t) throw pdErro("sobe: diga quanto (ex.: sobe 30cm).", linha); Q.bodyLift = (t.u === "m" ? t.v : t.u === "R" ? t.v / PD_M : t.v / 100) * PD_M; Q.ground = 0; return k + 2; }
  if (w === "deita") { const p = { costas: "deitadoCostas", brucos: "deBrucos", "de-brucos": "deBrucos", lado: "deitadoLado" }[nw]; if (!p) throw pdErro("deita: costas, brucos ou lado.", linha); Object.assign(Q, anPoseValores(p, Q)); return k + 2; }
  if (w === "espelha") { const [l, k2] = pdLerPartes(toks, k + 1), ch = l.length ? pdChavesDasPartes(l, linha) : null, esp = espelharValores(Object.fromEntries([...POSEKEYS].filter(kk => Number.isFinite(Q[kk])).map(kk => [kk, Q[kk]])));
    for (const [kk, v] of Object.entries(esp)) { const orig = kk.replace(/L$/, "R").replace(/R$/, "L"); if (!ch || ch.has(kk) || ch.has(orig)) Q[kk] = v; } return k2; }
  if (w === "mistura") { if (!nx) throw pdErro("mistura: mistura POSE 50%.", linha); const p = pdValoresPose(nx.v, Q, ctx, linha), f = num(toks[k + 2]) ? pct(toks[k + 2]) : 0.5; misturar(p.valores, f); return k + (num(toks[k + 2]) ? 3 : 2); }
  if (w === "copia" || w === "so") { const [l, k2] = pdLerPartes(toks, k + 1); if (!l.length || !toks[k2] || pdNorm(toks[k2].v) !== "de" || !toks[k2 + 1]) throw pdErro(w + ": " + w + " pernas de POSE (ex.: copia bracos de acenando).", linha);
    const p = pdValoresPose(toks[k2 + 1].v, Q, ctx, linha); misturar(p.valores, 1, pdChavesDasPartes(l, linha)); return k2 + 2; }
  if (w === "zera") { const [l, k2] = pdLerPartes(toks, k + 1); misturar(pdBase(), 1, pdChavesDasPartes(l.length ? l : ["tudo"], linha)); return k2; }
  return -1;
}

/* ===================== miniaturas (esqueleto em 3/4, leve) ===================== */
const PD_COR_HI = "#e8662c";
function pdOssos(params) { try { return ossosDoCorpo(params); } catch (e) { return null; } }
/* params completos de uma pose (valores por cima do corpo do primeiro manequim) */
function pdParams(valores) { const b = SCN.list && SCN.list[0] ? anSemCamera(SCN.list[0].params) : {}; return Object.assign({}, b, pdBase(), valores || {}); }
function pdProjetar(P, Q, yaw) { /* os ossos já vêm deitados/rolados (bodyPitch/bodyRoll); aqui só o giro da vista e a altura */
  const cy = Math.cos(yaw), sy = Math.sin(yaw), x = P[0], y = P[1], z = P[2];
  return [x * cy + z * sy, y + (Q.ground === 0 ? Q.bodyLift || 0 : 0), z * cy - x * sy];
}
/* o: {destaque: {regiao, s, k}, yaw (graus), tam, rotulo} */
function pdDesenho(params, o = {}) {
  const E = pdOssos(params); if (!E) return null;
  const yaw = (o.yaw ?? 32) * Math.PI / 180, hi = o.destaque || null, P = q => pdProjetar(q, params, yaw);
  const linhas = [], dots = []; let ymin = 1e9;
  for (const b of E.ossos) { if (b.tipo === "costela" || b.tipo === "dedo" || b.tipo === "curto" || (b.tipo === "plano" && b.nome !== "ílio")) continue;
    const a = P(b.a), c = P(b.b), h = hi && b.regiao === hi.regiao && (hi.s === undefined || b.s === hi.s || b.s === 0 && hi.regiao === "tronco");
    ymin = Math.min(ymin, a[1], c[1]); linhas.push({ a, c, h, cr: b.tipo === "cranio" ? b.r : 0, w: b.tipo === "coluna" ? 1.4 : /mão|metacarpo|metatarso/.test(b.nome) ? 1.2 : 2.1, z: (a[2] + c[2]) / 2 }); }
  if (hi && hi.k) for (const j of E.juntas) if (j.k === hi.k && (hi.s === undefined || j.s === hi.s || j.s === 0)) dots.push(P(j.P));
  return { linhas, dots, ymin };
}
function pdSvgCorpo(D, ox, oy, s, cls) {
  const X = p => (ox + p[0] * s).toFixed(1), Y = p => (oy - p[1] * s).toFixed(1);
  const ord = D.linhas.slice().sort((a, b) => a.z - b.z);
  return ord.map(l => l.cr ? '<circle cx="' + X(l.a) + '" cy="' + Y(l.a) + '" r="' + Math.max(2.2, l.cr * s * 0.95).toFixed(1) + '" fill="none" stroke="' + (l.h ? PD_COR_HI : "currentColor") + '" stroke-width="1.5"/>'
    : '<line x1="' + X(l.a) + '" y1="' + Y(l.a) + '" x2="' + X(l.c) + '" y2="' + Y(l.c) + '" stroke="' + (l.h ? PD_COR_HI : "currentColor") + '" stroke-width="' + (l.h ? l.w + 1 : l.w) + '" stroke-linecap="round" opacity="' + (l.z < -0.2 && !l.h ? 0.55 : 1) + '"/>').join("")
    + D.dots.map(p => '<circle cx="' + X(p) + '" cy="' + Y(p) + '" r="2.6" fill="' + PD_COR_HI + '"/>').join("");
}
/* miniatura de uma pose (valores) — 72×72, escala fixa (dá para comparar poses), chão embaixo */
function pdMiniatura(valores, o = {}) {
  const Q = pdParams(valores), D = pdDesenho(Q, o); if (!D) return "";
  const W = o.tam || 72, s = W / 18, chao = W - 5, xs = D.linhas.flatMap(l => [l.a[0], l.c[0]]), ys = D.linhas.flatMap(l => [l.a[1], l.c[1]]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, topo = Math.max(...ys), no_ar = Q.ground === 0 && (Q.bodyLift || 0) > 0.3;
  let oy = no_ar ? chao + (-15.3) * s : chao + D.ymin * s; oy = Math.max(oy, 3 + topo * s); /* o que sobe demais encosta no alto da caixa */
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + W + '" class="pd-mini" role="img" aria-label="' + String(o.rotulo || "miniatura").replace(/"/g, "'") + '"><line x1="4" y1="' + chao + '" x2="' + (W - 4) + '" y2="' + chao + '" stroke="currentColor" stroke-width="0.8" opacity="0.35"/>' + pdSvgCorpo(D, W / 2 - cx * s, oy, s) + "</svg>";
}
/* junta destacada (a junta e a região dela acesas) — com um movimento mostrado, se pedido */
function pdMiniaturaJunta(junta0, lado, mov) {
  const junta = pdJunta(junta0); if (!junta) return ""; const J = PD_JUNTAS[junta], L = lado ? PD_LADOS[pdNorm(lado)] : null, s = J.lado ? (L === "L" ? 1 : L === "R" ? -1 : undefined) : undefined;
  const v = {}; if (mov && J.mov[mov]) { const m = J.mov[mov], t = m[2] || "g", ks = J.lado ? (L === "LR" || !L ? ["L", "R"] : [L]) : [""];
    ks.forEach(x => { const k = m[0] + x, [a, b] = faixa(k, 0); v[k] = t === "zero" ? 0 : t === "cm" ? 30 / 100 * PD_M : m[1] * (m[1] > 0 ? b : -a) * 0.65; }); if (m[0] === "bodyLift") v.ground = 0; }
  return pdMiniatura(v, { destaque: { regiao: J.regiao, s, k: J.k }, yaw: J.lado && s === 1 ? -40 : 40, rotulo: junta + (lado ? "." + lado : "") + (mov ? " " + mov : "") });
}
/* tirinha da animação: 4 instantes lado a lado */
function pdMiniaturaAnimacao(a, o = {}) {
  if (!a || !a.chaves) return ""; const n = o.quadros || 4, W = 72, B = pdBase(), partes = [];
  for (let i = 0; i < n; i++) { const t = a.duracao * i / (n - 1), s = amostrar(a, t, B), v = Object.assign({}, B, s.valores); partes.push(pdMiniatura(v, { rotulo: a.nome + " " + t.toFixed(2) + "s" }).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")); }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W * n + " " + W + '" class="pd-mini pd-tira" role="img" aria-label="' + String(a.nome).replace(/"/g, "'") + '">' + partes.map((p, i) => '<g transform="translate(' + W * i + ',0)">' + p + "</g>").join("") + "</svg>";
}

/* ===================== operações sobre animações ===================== */
const PD_M0 = { frente: 0, lado: 0, giro: 0 };
/* deslocamento no sistema de outro instante (para recortar) e composição (para juntar) — mesma convenção do aplicarAnimacao */
function pdRebase(m, m0) { const g = (m0.giro || 0) * Math.PI / 180, x = (m.lado || 0) - (m0.lado || 0), y = (m.frente || 0) - (m0.frente || 0); return { frente: x * Math.sin(g) + y * Math.cos(g), lado: x * Math.cos(g) - y * Math.sin(g), giro: (m.giro || 0) - (m0.giro || 0) }; }
function pdCompor(m0, m) { const g = (m0.giro || 0) * Math.PI / 180, f = m.frente || 0, l = m.lado || 0; return { frente: (m0.frente || 0) + f * Math.cos(g) - l * Math.sin(g), lado: (m0.lado || 0) + f * Math.sin(g) + l * Math.cos(g), giro: (m0.giro || 0) + (m.giro || 0) }; }
const pdCopia = c => JSON.parse(JSON.stringify(c));
function pdNova(a, extra) { const b = Object.assign({}, a, { partes: null, versoes: undefined, versao: undefined, origem: undefined, data: undefined, _animBase: undefined }, extra); return criarAnimacao(b); }
/* base para amostrar: relativa → 0 (fica a diferença); absoluta → em pé */
function pdBaseDe(a, B) { if (a.modo !== "relativa") return B; const o = {}; (a.absolutos || []).forEach(k => { o[k] = B[k] || 0; }); return o; }
/* a chave completa no instante t (todos os parâmetros que a animação mexe) */
function pdChaveEm(a, t, B) { if (a.loop && t >= a.duracao - 1e-9) a = Object.assign({}, a, { loop: false }); /* em loop, o fim exato voltaria ao começo */
  const s = amostrar(a, t, pdBaseDe(a, B || pdBase())), c = { t, valores: Object.assign({}, s.valores) }; if (s.mover) c.mover = Object.assign({}, s.mover);
  const ap = apoioNoTempo(a, t); if (ap) c.apoio = ap;
  for (const k of a.chaves) { if (k.t > t + 1e-6) break; if (k.rosto) c.rosto = k.rosto; if (k.olha) { c.olha = k.olha; c.olhaModo = k.olhaModo; } }
  return c;
}
function pdTrecho(a, t0, t1, o = {}) {
  t0 = Math.max(0, Math.min(a.duracao, t0)); t1 = Math.max(t0 + 0.01, Math.min(a.duracao, t1));
  const B = pdBase(), ini = pdChaveEm(a, t0, B), fim = pdChaveEm(a, t1, B), meio = a.chaves.filter(c => c.t > t0 + 1e-4 && c.t < t1 - 1e-4).map(pdCopia), m0 = ini.mover;
  const ch = [ini, ...meio, fim]; ch.forEach(c => { c.t = +(c.t - t0).toFixed(4); delete c.fala; if (c.mover && m0) c.mover = pdRebase(c.mover, m0); });
  return pdNova(a, { nome: o.nome || a.nome + " (" + t0.toFixed(2) + "–" + t1.toFixed(2) + "s)", chaves: ch, duracao: t1 - t0, loop: false });
}
/* até um ângulo (nos giros): corta onde o giro chega ao ângulo e termina com os dois pés no chão */
function pdAteAngulo(a, graus, o = {}) {
  const alvo = Math.abs(graus), giro = t => { const s = amostrar(a, t, {}); return s.mover ? Math.abs(s.mover.giro || 0) : 0; }, N = 400;
  let t = null; for (let i = 1; i <= N; i++) { const u = a.duracao * i / N; if (giro(u) >= alvo - 1e-6) { let lo = a.duracao * (i - 1) / N, hi = u; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (giro(m) >= alvo) hi = m; else lo = m; } t = hi; break; } }
  if (t === null) { const max = giro(a.duracao); throw pdErro("“" + a.nome + "” só gira " + Math.round(max) + "° — não chega a " + alvo + "°.", o.linha); }
  const tr = pdTrecho(a, 0, t, { nome: o.nome || a.nome + " até " + alvo + "°" }), fim = tr.chaves[tr.chaves.length - 1], B = pdBase();
  const sg = Math.sign(fim.mover ? fim.mover.giro : 1) || 1; if (fim.mover) fim.mover.giro = sg * alvo;
  const ultimo = { t: +(tr.duracao + 0.3).toFixed(4), valores: {}, apoio: "ambos" }; for (const k of Object.keys(fim.valores)) ultimo.valores[k] = tr.modo === "relativa" && !(tr.absolutos || []).includes(k) ? 0 : (tr.chaves[0].valores[k] ?? B[k] ?? 0);
  if (fim.mover) ultimo.mover = Object.assign({}, fim.mover);
  return pdNova(tr, { chaves: [...tr.chaves, ultimo], duracao: ultimo.t });
}
/* completa as chaves do começo e do fim com todos os parâmetros (para reverter/juntar sem "voltar à base" no meio) */
function pdComPontas(a, B) { const ch = a.chaves.map(pdCopia), i0 = pdChaveEm(a, 0, B), i1 = pdChaveEm(a, a.duracao, B);
  if (ch[0].t > 1e-4) ch.unshift(i0); else ch[0] = Object.assign(ch[0], { valores: Object.assign({}, i0.valores, ch[0].valores) }, i0.mover && !ch[0].mover ? { mover: i0.mover } : {});
  const L = ch[ch.length - 1]; if (L.t < a.duracao - 1e-4) ch.push(Object.assign(i1, { t: a.duracao })); else Object.assign(L, { valores: Object.assign({}, i1.valores, L.valores) }, i1.mover && !L.mover ? { mover: i1.mover } : {});
  return ch; }
function pdReverter(a, o = {}) {
  const B = pdBase(), ch = pdComPontas(a, B), D = a.duracao, mFim = pdChaveEm(a, D, B).mover, troca = { entrada: "saida", saida: "entrada" }, out = [];
  for (let i = ch.length - 1; i >= 0; i--) { const c = pdCopia(ch[i]); c.t = +(D - c.t).toFixed(4); delete c.fala;
    if (c.mover && mFim) c.mover = pdRebase(c.mover, mFim);
    const ant = ch[i - 1]; c.curva = ant && ant.curva ? (troca[ant.curva] || ant.curva) : undefined; if (!c.curva) delete c.curva;
    c.apoio = ant ? apoioNoTempo(a, ant.t) || undefined : c.apoio; if (!c.apoio) delete c.apoio; out.push(c); }
  return pdNova(a, { nome: o.nome || a.nome + " (ao contrário)", chaves: out });
}
function pdEspelharAnim(a, o = {}) {
  const ap = { L: "R", R: "L" };
  const ch = a.chaves.map(c => { const n = pdCopia(c); n.valores = anEspelhar(c.valores); if (n.mover) n.mover = { frente: n.mover.frente || 0, lado: -(n.mover.lado || 0), giro: -(n.mover.giro || 0) }; if (n.apoio && ap[n.apoio]) n.apoio = ap[n.apoio]; return n; });
  return pdNova(a, { nome: o.nome || a.nome + " (espelhada)", chaves: ch, absolutos: (a.absolutos || []).map(k => /L$/.test(k) ? k.replace(/L$/, "R") : /R$/.test(k) ? k.replace(/R$/, "L") : k) });
}
function pdAbsoluta(a, B) { if (a.modo !== "relativa") return a; const ab = new Set(a.absolutos || []);
  return pdNova(a, { modo: "absoluta", absolutos: [], chaves: a.chaves.map(c => { const n = pdCopia(c); for (const k of Object.keys(n.valores)) if (!ab.has(k)) n.valores[k] = (B[k] || 0) + n.valores[k]; return n; }) }); }
/* juntar: uma depois da outra (o lugar e o giro continuam de onde a anterior parou); mistura = tempo de passagem entre elas */
function pdJuntar(lista, o = {}) {
  if (!lista.length) throw pdErro("Nada para juntar.", o.linha);
  const mis = o.mistura ?? 0.15, B = pdBase(), rel = lista.every(a => a.modo === "relativa" && !(a.absolutos || []).length), L2 = lista.map(a => a.loop ? Object.assign({}, a, { loop: false }) : a).map(a => rel ? a : pdAbsoluta(a, B));
  const temMov = L2.some(a => a.chaves.some(c => c.mover)), out = []; let T = 0, prev = rel ? {} : Object.assign({}, B), mPrev = Object.assign({}, PD_M0);
  L2.forEach((a, i) => {
    const t0 = T + (i ? mis : 0), base = Object.assign({}, prev), ch = pdComPontas(a, B), ini = amostrar(a, 0, {}), d0 = rel ? ini.valores : {}, m0 = ini.mover || PD_M0;
    /* relativa: cada uma continua de onde a anterior parou e soma só o que ELA muda (d(t) − d(0)) — repetir um ciclo não acumula */
    ch.forEach((c, j) => { const n = pdCopia(c), ponta = j === 0 || j === ch.length - 1; n.t = +(t0 + c.t).toFixed(4);
      if (rel) { const v = ponta ? amostrar(a, c.t, {}).valores : n.valores; n.valores = ponta ? Object.assign({}, base) : {}; for (const k of Object.keys(v)) n.valores[k] = (base[k] || 0) + v[k] - (d0[k] || 0); }
      else if (ponta) n.valores = Object.assign({}, base, amostrar(a, c.t, base).valores);
      if (temMov) { const mv = c.mover || (ponta ? amostrar(a, c.t, {}).mover || PD_M0 : null); if (mv) n.mover = pdCompor(mPrev, pdRebase(mv, m0)); else delete n.mover; }
      out.push(n); });
    const fim = out[out.length - 1]; prev = Object.assign({}, fim.valores); if (fim.mover) mPrev = Object.assign({}, fim.mover); T = t0 + a.duracao; });
  return criarAnimacao({ nome: o.nome || lista.map(a => a.nome).join(" + "), duracao: T, modo: rel ? "relativa" : "absoluta", curva: lista[0].curva || "suave", chaves: out, loop: false,
    travarPes: lista.some(a => a.travarPes), pesFixos: lista.every(a => a.pesFixos !== false), escalarPeloCorpo: true, tags: [...new Set(lista.flatMap(a => a.tags || []))], descricao: lista.map(a => a.nome).join(" → ") });
}
function pdRepetir(a, n, o = {}) { const k = Math.max(1, Math.min(50, Math.round(n))); return pdJuntar(Array(k).fill(a), { mistura: o.mistura ?? 0, nome: o.nome || a.nome + " ×" + k }); }
function pdVaiEVolta(a, o = {}) { return pdJuntar([a, pdReverter(a)], { mistura: o.mistura ?? 0, nome: o.nome || a.nome + " (vai e volta)" }); }
function pdAmplitude(a, f, o = {}) {
  const ch = a.chaves.map(pdCopia), ks = o.partes ? pdChavesDasPartes(o.partes, o.linha) : null, v0 = {};
  for (const c of ch) for (const [k, v] of Object.entries(c.valores)) { if (ks && !ks.has(k)) continue; const rel = a.modo === "relativa" && !(a.absolutos || []).includes(k); if (!(k in v0)) v0[k] = rel ? 0 : v; c.valores[k] = v0[k] + (v - v0[k]) * f; }
  if (!ks || ks.has("wx")) ch.forEach(c => { if (c.mover && o.lugar) c.mover = { frente: c.mover.frente * f, lado: c.mover.lado * f, giro: c.mover.giro * f }; });
  return pdNova(a, { chaves: ch, nome: o.nome || a.nome + " (" + Math.round(f * 100) + "%)" });
}
function pdEsticar(a, dur, o = {}) { return retimar(a, { velocidade: a.duracao / Math.max(0.05, dur), nome: o.nome || a.nome }); }
/* põe um parâmetro em todas as chaves (com o valor que ele tem naquele instante) — para trocar/somar sem buracos */
function pdDensificar(a, ks, B) { const ch = a.chaves; for (const c of ch) { let s = null; for (const k of ks) if (!(k in c.valores)) { s = s || amostrar(a, c.t, pdBaseDe(a, B)).valores; c.valores[k] = k in s ? s[k] : (a.modo === "relativa" && !(a.absolutos || []).includes(k) ? 0 : B[k] || 0); } } }
/* troca as partes pela pose; com o movimento por cima (padrão) ou fixo. Os parâmetros trocados ficam "absolutos" */
function pdTroca(a, partes, pose, o = {}) {
  const B = pdBase(), ks = pdChavesDasPartes(partes, o.linha), b = pdNova(a, { chaves: a.chaves.map(pdCopia) }); if (b.chaves[0].t > 1e-4) b.chaves.unshift(pdChaveEm(a, 0, B));
  /* o corpo inteiro da pose (deitar, altura) também vem junto quando a pose muda isso */
  for (const k of ["bodyPitch", "bodyRoll", "bodyLift", "ground"]) if (Math.abs((pose[k] || 0) - (B[k] || 0)) > 1e-3) ks.add(k);
  const usados = [...ks].filter(k => Number.isFinite(pose[k]) || b.chaves.some(c => k in c.valores)); pdDensificar(b, usados, B);
  const rel = b.modo === "relativa", ab = new Set(b.absolutos || []), v0 = {}; for (const k of usados) v0[k] = b.chaves[0].valores[k];
  for (const c of b.chaves) for (const k of usados) { const d = o.fixo ? 0 : (c.valores[k] - v0[k]); c.valores[k] = (Number.isFinite(pose[k]) ? pose[k] : (rel && !ab.has(k) ? B[k] || 0 : v0[k])) + d; }
  if (rel) usados.forEach(k => ab.add(k));
  const out = { chaves: b.chaves, absolutos: [...ab], nome: o.nome || a.nome };
  /* trocar as pernas: os pés da animação original não valem mais — sem “pés presos”, o corpo gira no lugar */
  if (["hipFlexL", "kneeFlexL"].some(k => ks.has(k)) && a.chaves.some(c => c.mover)) { const fim = pdChaveEm(a, a.duracao, B).mover || PD_M0;
    out.travarPes = false; out.chaves.forEach(c => { delete c.apoio; if (c.mover) { const u = c.t / Math.max(1e-6, a.duracao); c.mover = { frente: fim.frente * u, lado: fim.lado * u, giro: c.mover.giro }; } }); }
  return pdNova(b, out);
}
/* soma um ajuste em todas as chaves (ex.: tronco inclinado 20° a animação toda) */
function pdSoma(a, deltas, o = {}) { const B = pdBase(), b = pdNova(a, { chaves: a.chaves.map(pdCopia) }), ks = Object.keys(deltas); pdDensificar(b, ks, B); b.chaves.forEach(c => ks.forEach(k => { c.valores[k] = (c.valores[k] || 0) + deltas[k]; })); return pdNova(b, { nome: o.nome || a.nome }); }
function pdTira(a, partes, o = {}) { const ks = pdChavesDasPartes(partes, o.linha), lugar = partes.some(p => pdNorm(p) === "lugar"); return pdNova(a, { nome: o.nome || a.nome, chaves: a.chaves.map(c => { const n = pdCopia(c); for (const k of Object.keys(n.valores)) if (ks.has(k)) delete n.valores[k]; if (lugar) delete n.mover; return n; }) }); }
/* uma chave nova num instante (só os parâmetros ditos): os outros instantes guardam o valor que tinham */
function pdFixar(a, t, valores, o = {}) { const B = pdBase(), b = pdNova(a, { chaves: a.chaves.map(pdCopia) }), ks = Object.keys(valores); pdDensificar(b, ks, B);
  let c = b.chaves.find(x => Math.abs(x.t - t) < 1e-3); if (!c) { c = { t, valores: {} }; b.chaves.push(c); b.chaves.sort((x, y) => x.t - y.t); }
  const rel = b.modo === "relativa"; for (const k of ks) c.valores[k] = rel && !(b.absolutos || []).includes(k) ? valores[k] - (B[k] || 0) : valores[k];
  if (o.mover) c.mover = o.mover; return pdNova(b, { duracao: Math.max(b.duracao, t) }); }
/* camada: A por baixo, B por cima (B manda nas partes dele, ou nas partes pedidas) */
function pdCamada(A, pA, Bn, pB, o = {}) {
  const B = pdBase(), rel = A.modo === "relativa" && Bn.modo === "relativa", a1 = rel ? A : pdAbsoluta(A, B), b1 = rel ? Bn : pdAbsoluta(Bn, B), D = Math.max(a1.duracao, b1.duracao);
  const kA = pA && pA.length ? pdChavesDasPartes(pA, o.linha) : null, kB = pB && pB.length ? pdChavesDasPartes(pB, o.linha) : null;
  const ts = new Set([0, D]); a1.chaves.forEach(c => ts.add(c.t)); b1.chaves.forEach(c => ts.add(c.t)); for (let t = 0; t < D; t += 1 / 12) ts.add(+t.toFixed(4));
  const tt = (a, t) => a.loop && t > a.duracao ? t % a.duracao : Math.min(t, a.duracao);
  /* lugar de uma animação em loop: cada volta continua de onde a anterior terminou (andar em loop anda de verdade) */
  const lugar = (a, t) => { const m = s0 => amostrar(a, s0, {}).mover; if (!a.chaves.some(c => c.mover)) return null; if (!a.loop || t <= a.duracao) return m(Math.min(t, a.duracao));
    const fim = (a.chaves.filter(c => c.mover).pop() || {}).mover || PD_M0, k = Math.floor(t / a.duracao); /* (amostrar em loop volta ao começo no fim exato) */ let r = Object.assign({}, PD_M0); for (let i = 0; i < k; i++) r = pdCompor(r, fim); return pdCompor(r, m(t - k * a.duracao) || PD_M0); };
  const ch = [...ts].sort((x, y) => x - y).map(t => { const ca = pdChaveEm(a1, tt(a1, t), B), cb = pdChaveEm(b1, tt(b1, t), B), v = {};
    for (const [k, x] of Object.entries(ca.valores)) if (!kA || kA.has(k)) v[k] = x;
    for (const [k, x] of Object.entries(cb.valores)) if (!kB || kB.has(k)) v[k] = x;
    const c = { t, valores: v, curva: "linear" }; const mv = lugar(a1, t) || lugar(b1, t); if (mv) c.mover = mv; if (ca.apoio) c.apoio = ca.apoio; if (cb.rosto || ca.rosto) c.rosto = cb.rosto || ca.rosto; return c; });
  return criarAnimacao({ nome: o.nome || A.nome + " + " + Bn.nome, duracao: D, modo: rel ? "relativa" : "absoluta", curva: "linear", chaves: ch, absolutos: [...new Set([...(a1.absolutos || []), ...(b1.absolutos || [])])], travarPes: !!A.travarPes, pesFixos: A.pesFixos !== false, tags: [...new Set([...(A.tags || []), ...(Bn.tags || [])])], descricao: "camada: " + A.nome + " por baixo, " + Bn.nome + " por cima" });
}

/* ===================== ciclo a partir de UMA pose ===================== */
/* A → passagem → A espelhada → passagem espelhada → A (loop). Os pés: o da frente em A é o apoio até a passagem. */
function pdCiclo(A0, o = {}) {
  const B = pdBase(), A = Object.assign({}, B, A0), A2 = espelharValores(A), corre = !!o.corre;
  const medir = v => { try { const p = pesDoManequim({ name: "_ciclo", params: Object.assign(pdParams(v), { wx: 0, wz: 0, wRot: 0, bodyLift: 0, tamanho: 1 }) }); return p; } catch (e) { return null; } };
  const pe = medir(A), frenteA = pe && pe.L && pe.R ? (pe.L.z > pe.R.z ? "L" : "R") : ((A.hipFlexL || 0) > (A.hipFlexR || 0) ? "L" : "R"), tras = frenteA === "L" ? "R" : "L";
  const passo = o.passo ?? (pe && pe.L && pe.R ? Math.max(0.15, Math.abs(pe.L.z - pe.R.z) / PD_M) : 0.6);
  let P;
  if (o.passagem) P = Object.assign({}, B, o.passagem);
  else { P = {}; for (const k of new Set([...Object.keys(A), ...Object.keys(A2)])) if (Number.isFinite(A[k]) && Number.isFinite(A2[k])) P[k] = (A[k] + A2[k]) / 2;
    /* a perna de trás passa para a frente: joelho dobrado, ponta do pé para cima; a de apoio quase esticada */
    P["hipFlex" + tras] = (P["hipFlex" + tras] || 0) + (corre ? 25 : 12); P["kneeFlex" + tras] = Math.max(P["kneeFlex" + tras] || 0, corre ? 95 : 48); P["ankleFlex" + tras] = Math.min(P["ankleFlex" + tras] || 0, corre ? 10 : -6);
    /* em pé a perna de apoio estica; de quatro, agachado ou de joelhos ela fica como está (não levanta o corpo) */
    if ((P["kneeFlex" + frenteA] || 0) < 40) { P["kneeFlex" + frenteA] = corre ? 28 : Math.min(P["kneeFlex" + frenteA] || 0, 6); P["hipFlex" + frenteA] = (P["hipFlex" + frenteA] || 0) - (corre ? 5 : 2); } }
  const P2 = espelharValores(P), d = o.duracao || (corre ? 0.6 : 1.0), ida = o.anda !== undefined ? o.anda / 2 : passo;
  const ch = [{ t: 0, valores: A, apoio: frenteA, mover: { frente: 0, lado: 0, giro: 0 } }, { t: d / 4, valores: P, mover: { frente: ida / 2, lado: 0, giro: 0 } }, { t: d / 2, valores: A2, apoio: tras, mover: { frente: ida, lado: 0, giro: 0 } }, { t: 3 * d / 4, valores: P2, mover: { frente: 1.5 * ida, lado: 0, giro: 0 } }, { t: d, valores: A, apoio: frenteA, mover: { frente: 2 * ida, lado: 0, giro: 0 } }];
  ch.forEach(c => { c.curva = "suave"; });
  if (corre && o.voo !== 0) { const h = (o.voo ?? 0.05) * PD_M, mix = (x, y) => { const r = {}; for (const k of Object.keys(x)) r[k] = Number.isFinite(y[k]) ? (x[k] + y[k]) / 2 : x[k]; return r; };
    ch.push({ t: 3 * d / 8, valores: Object.assign(mix(P, A2), { bodyLift: h, ground: 0 }), mover: { frente: 0.75 * ida, lado: 0, giro: 0 }, curva: "suave" }, { t: 7 * d / 8, valores: Object.assign(mix(P2, A), { bodyLift: h, ground: 0 }), mover: { frente: 1.75 * ida, lado: 0, giro: 0 }, curva: "suave" });
    ch.forEach(c => { if (!("bodyLift" in c.valores) || c.valores.ground !== 0) { c.valores.bodyLift = 0; c.valores.ground = 1; } }); ch.sort((x, y) => x.t - y.t); }
  const cic = criarAnimacao({ nome: o.nome || "ciclo", duracao: d, modo: "absoluta", curva: "linear", loop: o.loop !== false, travarPes: !corre, pesFixos: true, escalarPeloCorpo: true, chaves: ch, tags: o.tags && o.tags.length ? o.tags : [corre ? "Locomocao/Correr/Ciclo" : "Locomocao/Andar/Ciclo"], descricao: "ciclo a partir de uma pose: " + (o.de || "") + " · " + (2 * ida).toFixed(2) + " m por ciclo" });
  /* o corpo anda o que o pé de apoio empurra (sem patinar); o cálculo pode ser desligado com calibrar: false */
  if (o.calibrar === false || o.anda !== undefined && o.calibrarAnda === false) return cic;
  /* o deslocamento é calibrado pelo pé de apoio (sem patinar); "calibrar denso" refaz o ciclo em 24 chaves seguindo o pé */
  try { if (o.calibrar === "denso") return Object.assign(mvDensificar(cic), { tags: cic.tags, descricao: cic.descricao }); return mvCalibrarMover(cic); } catch (e) { return cic; }
}

/* ===================== documentação de cada palavra (F1 no editor, manual, MCP) ===================== */
const PD_DOC = {
  pose: { s: 'pose "nome" [de outra-pose] [salvar] [substituir] [tags "A/B"]', d: "Bloco de pose: cada linha com recuo mexe numa junta ou usa um atalho. “salvar” manda para Minhas poses (com miniatura).", ex: 'pose "passo-largo" de empe salvar\n  ombro.direito(frente 40)\n  ombro.esquerdo(tras 30)\n  quadril.direito(frente 35)\n  joelho.esquerdo(dobra 25)' },
  ciclo: { s: 'ciclo "nome" de POSE [duracao 1s] [corre] [passagem POSE] [anda 1.4m] [voo 5cm] [salvar]', d: "Faz um ciclo (loop) a partir de UMA pose: A → passagem → A espelhada → passagem → A. Serve para andar, correr, engatinhar.", ex: 'ciclo "andar-largo" de passo-largo duracao 1s salvar' },
  animacao: { s: 'animacao "nome" [de OUTRA | junta A, B mistura 0.2s | camada A [partes] + B [partes]] [duracao] [salvar]', d: "Animação por chaves, ou nascida de outra (de), ou várias em sequência (junta), ou partes de duas ao mesmo tempo (camada).", ex: 'animacao "girar-ajoelhado" de girar360E salvar\n  troca pernas por pose ajoelhado' },
  chave: { s: "chave 0.5s [pose X] [junta(…)] [atalhos] [expressao] [gesto] [move frente 0.4] [olha Mira] [segurar 0.3s]", d: "Um instante da animação. As chaves se acumulam.", ex: "chave 0.4s ombro.direito(frente 90) cotovelo.direito(dobra 20)" },
  troca: { s: "troca PARTES por pose POSE [fixo]", d: "Na animação derivada: as partes passam a partir da pose, com o movimento original por cima (ou parado, com “fixo”).", ex: "troca pernas por pose ajoelhado" },
  soma: { s: "soma junta(…)", d: "Soma um ajuste na animação toda.", ex: "soma tronco(frente 20)" },
  tira: { s: "tira PARTES", d: "Tira as partes da animação (elas ficam como o personagem estiver).", ex: "tira bracos" },
  trecho: { s: "trecho 0.2s a 0.8s  ·  trecho 25% a 75%", d: "Fica só com um pedaço da animação (o lugar e o giro recomeçam dali).", ex: "trecho 0s a 0.5s" },
  ate: { s: "ate 90  ·  ate metade", d: "Nos giros: corta quando chega ao ângulo e pousa os dois pés (15, 30, 45, 60, 90, 180…). “ate metade” = primeira metade.", ex: "ate 45" },
  reverte: { s: "reverte", d: "Toca de trás para frente.", ex: "reverte" },
  espelha: { s: "espelha [PARTES]", d: "Na animação: troca esquerda e direita (gira para o outro lado). Na pose: troca os lados (todas as partes ou só as pedidas).", ex: "espelha bracos" },
  repete: { s: "repete 3", d: "Repete a animação, uma depois da outra, continuando do lugar onde parou.", ex: "repete 3" },
  "vai-e-volta": { s: "vai-e-volta", d: "Toca para frente e depois de volta.", ex: "vai-e-volta" },
  amplitude: { s: "amplitude 70% [PARTES]", d: "Movimento maior ou menor (100% = igual).", ex: "amplitude 60% bracos" },
  estica: { s: "estica 2s", d: "Muda a duração inteira (mais lenta ou mais rápida).", ex: "estica 2s" },
  agacha: { s: "agacha [60%]", d: "Agacha (pernas, tronco) a partir da pose.", ex: "agacha 50%" },
  ajoelha: { s: "ajoelha [direito|esquerdo|os-dois]", d: "Um joelho no chão (o lado dito) ou os dois.", ex: "ajoelha direito" },
  senta: { s: "senta [chao|cadeira|calcanhares|cocoras]", d: "Senta.", ex: "senta cadeira" },
  peso: { s: "peso direito|esquerdo [70%]", d: "Põe o peso numa perna (quadril sai para o lado).", ex: "peso esquerdo" },
  inclina: { s: "inclina frente|tras|direita|esquerda [graus]", d: "Inclina o tronco.", ex: "inclina frente 20" },
  olha: { s: "olha baixo|cima|direita|esquerda|frente [graus]  ·  olha Mira", d: "Direção da cabeça e dos olhos (ou para alguém).", ex: "olha baixo 30" },
  sobe: { s: "sobe 30cm", d: "Tira o corpo do chão (salto, flutuar).", ex: "sobe 40cm" },
  deita: { s: "deita costas|brucos|lado", d: "Deita.", ex: "deita brucos" },
  mistura: { s: "mistura POSE 50%", d: "Fica no meio do caminho entre a pose atual e outra.", ex: "mistura correndo 30%" },
  copia: { s: "copia PARTES de POSE", d: "Copia só algumas partes de outra pose.", ex: "copia bracos de guardaLuta" },
  zera: { s: "zera [PARTES]", d: "Volta as partes para em pé.", ex: "zera bracos" },
  pula: { s: "Kai pula [lugar|frente|alto|lado|corrida] [80cm] [altura 40cm]", d: "Pulo com antecipação, voo no tempo da gravidade e aterrissagem amortecida.", ex: "Kai pula frente 1m altura 40cm" },
  mergulha: { s: "Kai mergulha [altura 0.5m] [fundo 1m]", d: "Mergulho de cabeça: braços acima, salto, entrada na água e deslize.", ex: "Kai mergulha" },
  nada: { s: "Kai nada crawl|peito|costas|cachorrinho|boia|pernada [3m]", d: "Nado (corpo deitado na água). Dentro de uma peça “agua”, o corpo fica na linha da água.", ex: "Kai nada crawl 4m" },
  engatinha: { s: "Kai engatinha [2m]", d: "De quatro: mão e joelho do lado oposto juntos.", ex: "Kai engatinha 1.5m" },
  rasteja: { s: "Kai rasteja [2m]", d: "Rastejar (militar): cotovelos e um joelho.", ex: "Kai rasteja 2m" },
  "anda-agachado": { s: "Kai anda-agachado [2m]", d: "Andar agachado.", ex: "Kai anda-agachado 2m" },
  cai: { s: "Kai cai frente|tras|lado", d: "Cai no chão.", ex: "Kai cai tras" },
  "levanta-se": { s: "Kai levanta-se", d: "Do chão até em pé (passa por quatro apoios e um joelho).", ex: "Kai levanta-se" },
  rola: { s: "Kai rola direita|esquerda [2 voltas]", d: "Rola deitado no chão.", ex: "Kai rola direita 2" }
};
for (const [j, J] of Object.entries(PD_JUNTAS)) PD_DOC[j] = { s: j + (J.lado ? ".direito|esquerdo|ambos" : "") + "(" + Object.keys(J.mov).join(" | ") + " VALOR)", d: J.desc + ". Valor sozinho = fica nele; +10/-10 = soma. " + (J.lado ? "Sem lado = os dois lados." : ""), ex: j + (J.lado ? ".direito" : "") + "(" + Object.keys(J.mov)[0] + " 30)" };
/* trechos prontos (Tab depois da palavra, no começo da linha) */
const PD_TRECHOS = {
  pose: 'pose "minha-pose" de empe salvar\n  ombro.direito(frente 40)\n  ombro.esquerdo(tras 30)\n  quadril.direito(frente 30)\n  joelho.esquerdo(dobra 25)\n',
  ciclo: 'ciclo "meu-ciclo" de passo duracao 1s salvar\n',
  animacao: 'animacao "minha-animacao" duracao 1s salvar\n  chave 0s pose empe\n  chave 0.5s ombro.direito(frente 90)\n  chave 1s pose empe\n',
  derivar: 'animacao "nova" de girar360E salvar\n  troca pernas por pose ajoelhado\n',
  picotar: 'animacao "giro90" de girar360E salvar\n  ate 90\n',
  juntar: 'animacao "combo" junta acenarTchau, girar90E mistura 0.2s salvar\n',
  camada: 'animacao "andar-acenando" camada andarCiclo + acenarTchau bracos salvar\n'
};

/* ===================== autocompletar ===================== */
/* antes = texto até o cursor; info = {nomes, poses, animacoes} do texto compilado. Devolve {itens, de, ponto, ajuda} ou null */
/* ganchos para outros módulos (autocompletar do name/filme): listas por palavra-chave, casos especiais e miniaturas extras */
const PD_AC_EXTRA = {}, PD_AC_ANTES = [], PD_MINI_EXTRA = { fn: null };
function pdCompletar(antes, info = {}) {
  for (const f of PD_AC_ANTES) { try { const r = f(antes, info); if (r) return r; } catch (e) { } }
  const linha = antes.split("\n").pop(), item = (v, tipo, d, mini) => ({ v, r: v.trim().replace(/^"|"$/g, ""), tipo, d: d || "", mini: mini || null });
  const blocos = antes.split("\n").filter(l => /^\S/.test(l)), bloco = pdNorm((/^(\S+)/.exec(blocos[blocos.length - 1] || "") || [])[1] || ""), recuo = /^\s+/.test(linha);
  /* 1) dentro dos parênteses de uma junta: movimentos */
  let m = /([A-Za-zÀ-ÿ-]+)(?:\.([A-Za-zÀ-ÿ-]+))?\(([^)]*)$/.exec(linha);
  if (m && pdJunta(m[1])) { const j = pdJunta(m[1]), J = PD_JUNTAS[j], L = m[2] ? PD_LADOS[pdNorm(m[2])] : null, args = m[3], pref = (/([A-Za-zÀ-ÿ-]*)$/.exec(args) || ["", ""])[1], ultimo = args.trim().split(/[\s,]+/).pop();
    const ajuda = j + (m[2] ? "." + m[2] : "") + "( " + Object.keys(J.mov).map(x => x + " " + pdFaixaMov(j, x, L)).join(" · ") + " )";
    if (J.mov[pdNorm(ultimo)] && /\s$/.test(args)) return { itens: [], de: antes.length, ajuda };
    const usados = new Set(args.split(/[\s,]+/).slice(0, -1).map(pdNorm)); return { itens: Object.keys(J.mov).filter(x => x.startsWith(pdNorm(pref)) && !usados.has(x)).map(x => item(x + " ", "movimento", pdFaixaMov(j, x, L), { tipo: "mov", junta: j, lado: m[2] || null, mov: x })), de: antes.length - pref.length, ajuda }; }
  /* 2) junta + ponto: os lados */
  m = /([A-Za-zÀ-ÿ-]+)\.([A-Za-zÀ-ÿ-]*)$/.exec(linha);
  if (m && pdJunta(m[1])) { const J = PD_JUNTAS[pdJunta(m[1])]; if (!J.lado) return { itens: [item("(", "junta", "esta junta não tem lado")], de: antes.length - m[2].length - 1 };
    return { itens: ["direito", "esquerdo", "ambos"].filter(x => x.startsWith(pdNorm(m[2]))).map(x => item(x + "(", "lado", x === "ambos" ? "os dois lados" : "lado " + x + " do personagem", { tipo: "junta", junta: pdJunta(m[1]), lado: x })), de: antes.length - m[2].length }; }
  /* 3) palavra-chave + ponto ou espaço: listas com miniatura (o ponto vira espaço) */
  m = /(^|[\s(])([A-Za-zÀ-ÿ-]+)([. ])("[^"]*|[A-Za-zÀ-ÿ0-9_-]*)$/.exec(linha);
  if (!m && /^(animacao|animação)\b.*\b(junta|camada)\b.*[,+]\s*("[^"]*|[A-Za-zÀ-ÿ0-9_-]*)$/i.test(linha)) { const pre = /([A-Za-zÀ-ÿ0-9_-]*)$/.exec(linha)[1]; m = [null, " ", "junta", " ", pre]; }
  if (m) { const w = pdNorm(m[2]), pre = pdNorm(m[4].replace(/^"/, "")), de = antes.length - m[4].length - (m[3] === "." ? 1 : 0), pv = m[3] === "." ? " " : "", filtra = l => { const vistos = new Set(); return l.filter(x => { const k = pdNorm(x.r); if (vistos.has(k)) return false; vistos.add(k); return k.startsWith(pre) || k.includes(pre) && pre.length > 2; }).slice(0, 60); };
    const q = s => /[\s"]/.test(s) || !/^[\wÀ-ÿ-]+$/.test(s) ? '"' + s + '"' : s;
    const poses = () => filtra([...(info.poses || []).map(n => item(pv + q(n) + " ", "pose", "deste texto", { tipo: "pose", nome: n })), ...posesSalvas().map(p => item(pv + q(p.nome) + " ", "pose", "minha pose", { tipo: "pose", nome: p.nome, svg: p.miniatura })), ...todasPoses().map(n => item(pv + n + " ", "pose", "pronta", { tipo: "pose", nome: n }))]);
    const anims = () => filtra([...(info.animacoes || []).map(n => item(pv + q(n) + " ", "animacao", "deste texto", { tipo: "anim", nome: n })), ...bibliotecaAnimacoes().listar().map(a => item(pv + q(a.nome) + " ", "animacao", a.duracao.toFixed(1) + " s" + (a.descricao ? " · " + a.descricao : ""), { tipo: "anim", nome: a.nome }))]);
    const fix = (l, tipo, d) => filtra(l.map(x => item(pv + x + " ", tipo, typeof d === "function" ? d(x) : d || "")));
    const partes = () => fix(Object.keys(PD_PARTES), "parte", x => (PD_PARTES[x] || []).join(", "));
    const fixa = { pose: poses, mistura: poses, de: () => bloco === "animacao" ? anims() : poses(), por: () => poses(), anima: anims, junta: () => bloco === "animacao" ? anims() : null, camada: anims, "+": anims,
      expressao: () => fix(Object.keys(EXPRESSOES), "expressao"), gesto: () => fix(Object.keys(GESTOS_CONVERSA), "gesto", x => GESTOS_CONVERSA[x].desc), atitude: () => fix(Object.keys(ATITUDES), "atitude", x => ATITUDES[x].desc || ""), curva: () => fix(Object.keys(CURVAS), "curva"),
      troca: partes, tira: partes, copia: partes, so: partes, zera: partes, espelha: partes, amplitude: null,
      ajoelha: () => fix(["direito", "esquerdo", "os-dois"], "lado"), peso: () => fix(["direito", "esquerdo"], "lado"), inclina: () => fix(["frente", "tras", "direita", "esquerda"], "direcao"), deita: () => fix(["costas", "brucos", "lado"], "direcao"), senta: () => fix(["chao", "cadeira", "calcanhares", "cocoras"], "como"),
      nada: () => fix(Object.keys(PD_NADOS), "estilo", x => PD_NADOS[x]), pula: () => fix(["lugar", "frente", "alto", "lado", "corrida"], "estilo"), cai: () => fix(["frente", "tras", "lado"], "direcao"), rola: () => fix(["direita", "esquerda"], "direcao") };
    for (const [k, f] of Object.entries(PD_AC_EXTRA)) if (!(k in fixa) || !/^(pose|mistura|de|por|anima|junta|camada|\+)$/.test(k)) fixa[k] = () => { const l = f({ pv, item, linha, bloco, info }); return l ? filtra(l) : null; };
    if (w in fixa && fixa[w] && !(w === "olha" || (w === "de" && bloco !== "animacao" && bloco !== "pose" && bloco !== "ciclo"))) { const r = fixa[w](); if (r && (r.length || m[3] === ".")) return { itens: r, de, ponto: m[3] === "." }; } }
  /* 4) começo de linha com recuo dentro de pose / animação: juntas, atalhos, operações */
  if (recuo && /^\s+[A-Za-zÀ-ÿ-]*$/.test(linha)) { const pre = pdNorm(linha.trim()), de = antes.length - linha.trim().length;
    const juntas = Object.keys(PD_JUNTAS).map(j => item(j + (PD_JUNTAS[j].lado ? "." : "("), "junta", PD_JUNTAS[j].desc, { tipo: "junta", junta: j }));
    const at = PD_ATALHOS.map(a => item(a + " ", "atalho", (PD_DOC[a] || {}).s || ""));
    let l = null; if (bloco === "pose") l = [...juntas, ...at, item("pose ", "palavra", "recomeça de uma pose"), item("expressao ", "palavra"), item("gesto ", "palavra"), item("atitude ", "palavra")];
    else if (bloco === "animacao" || bloco === "animação") l = [item("chave ", "palavra", "chave 0.5s …"), ...["troca", "soma", "tira", "trecho", "ate", "reverte", "espelha", "repete", "vai-e-volta", "amplitude", "estica"].map(x => item(x + " ", "operacao", (PD_DOC[x] || {}).s || ""))];
    if (l) return { itens: l.filter(x => pdNorm(x.r).startsWith(pre)), de }; }
  /* 5) depois de "chave 0.5s ": juntas e atalhos */
  if (/^\s+chave\s+\S+\s+(.*\s)?[A-Za-zÀ-ÿ-]*$/.test(linha)) { const pre = (/([A-Za-zÀ-ÿ-]*)$/.exec(linha) || ["", ""])[1]; if (pre.length || /\s$/.test(linha)) { const juntas = Object.keys(PD_JUNTAS).filter(j => j.startsWith(pdNorm(pre))).map(j => item(j + (PD_JUNTAS[j].lado ? "." : "("), "junta", PD_JUNTAS[j].desc, { tipo: "junta", junta: j }));
      const at = PD_ATALHOS.filter(a => a.startsWith(pdNorm(pre))).map(a => item(a + " ", "atalho", (PD_DOC[a] || {}).s || "")); if (juntas.length + at.length && pre.length >= 1) return { itens: [...juntas, ...at], de: antes.length - pre.length }; } }
  return null;
}
const PD_NADOS = { crawl: "nado livre, braços alternados", peito: "braçada de peito e pernada de sapo", costas: "deitado de costas, braços alternados", cachorrinho: "cabeça fora, patinhas", boia: "boiando de costas", pernada: "braços à frente, só as pernas" };
/* miniatura de um item do autocompletar (gerada sob demanda, com cache) */
const PD_MINI_CACHE = new Map();
function pdMiniaturaItem(mini, ctx) {
  if (!mini) return ""; if (mini.svg) return mini.svg; const ch = JSON.stringify(mini); if (PD_MINI_CACHE.has(ch)) return PD_MINI_CACHE.get(ch);
  let s = ""; try {
    if (PD_MINI_EXTRA.fn && !/^(pose|junta|mov|anim)$/.test(mini.tipo)) s = PD_MINI_EXTRA.fn(mini, ctx) || ""; else
    if (mini.tipo === "pose") s = pdMiniatura(pdValoresPose(mini.nome, pdParams({}), ctx).valores, { rotulo: mini.nome });
    else if (mini.tipo === "junta") s = pdMiniaturaJunta(mini.junta, mini.lado);
    else if (mini.tipo === "mov") s = pdMiniaturaJunta(mini.junta, mini.lado || "direito", mini.mov);
    else if (mini.tipo === "anim") { const a = (ctx && ctx.animacoes && ctx.animacoes.get(mini.nome)) || bibliotecaAnimacoes().obter(mini.nome); s = a ? pdMiniaturaAnimacao(a) : ""; }
  } catch (e) { s = ""; }
  if (PD_MINI_CACHE.size > 400) PD_MINI_CACHE.clear(); if (s) PD_MINI_CACHE.set(ch, s); return s;
}

/* ===================== pose e animação → CÓDIGO (a mesma linguagem; ida e volta) ===================== */
const PD_ROSTO_K = /^(jawOpen|smile|eyeLid|browUp|browIn|eyeYaw|eyePitch|blush|tears)$/;
function pdQ(nome) { return /^[\wÀ-ÿ-]+$/.test(nome) ? '"' + nome + '"' : JSON.stringify(String(nome)); }
function pdN(v, d = 2) { const x = +(+v).toFixed(d); return Object.is(x, -0) ? "0" : String(x); }
/* comandos que levam o estado R (params) aos valores V; devolve as linhas e o novo estado */
function pdComandos(V, R, o = {}) {
  const tol = o.tol ?? 0.05, out = [], usados = new Set(), S = Object.assign({}, R), dif = k => Number.isFinite(V[k]) && Math.abs(V[k] - (S[k] ?? 0)) > (/^(handCurl|shElev|shProt)/.test(k) || PD_ROSTO_K.test(k) ? 0.004 : tol);
  if (dif("flex")) { out.push("valor flex " + pdN(V.flex)); S.flex = V.flex; usados.add("flex"); }
  for (const [jn, J] of Object.entries(PD_JUNTAS)) {
    const porLado = {};
    for (const L of J.lado ? ["R", "L"] : [""]) { const args = [];
      const bases = [...new Set(Object.values(J.mov).map(m => m[0]))];
      for (const b of bases) { const k = b + L; if (usados.has(k) || !dif(k) || (!(k in SLK) && !POSEKEYS.has(k))) continue;
        const v = V[k], movs = Object.entries(J.mov).filter(([, m]) => m[0] === b && (m[2] || "g") !== "zero"), sinal = v >= 0 ? 1 : -1, esc = movs.find(([, m]) => m[1] === sinal) || (Math.abs(v) < 1e-9 ? movs[0] : null);
        if (!esc) continue; const [nm, m] = esc, tipo = m[2] || "g", [a, z] = faixa(k, S.flex ?? V.flex ?? 0); if (v < a - 1e-6 || v > z + 1e-6) continue;
        const x = Math.abs(v); args.push(nm + " " + (tipo === "p" ? pdN(x * 100, 1) + "%" : tipo === "cm" ? pdN(x / PD_M * 100, 1) + "cm" : pdN(x, 1))); usados.add(k); S[k] = v; }
      if (args.length) porLado[L] = args.join(" "); }
    if (J.lado && porLado.R && porLado.R === porLado.L) out.push(jn + "(" + porLado.R + ")");
    else for (const [L, a] of Object.entries(porLado)) out.push(jn + (L === "R" ? ".direito" : L === "L" ? ".esquerdo" : "") + "(" + a + ")");
  }
  const resto = Object.keys(V).filter(k => !usados.has(k) && (POSEKEYS.has(k) || PD_ROSTO_K.test(k)) && dif(k));
  for (let i = 0; i < resto.length; i += 4) out.push("valor " + resto.slice(i, i + 4).map(k => { S[k] = V[k]; return k + " " + pdN(V[k], 3); }).join(" "));
  return { linhas: out, estado: S };
}
function pdNeutro() { return pdParams({}); }
/* pose → bloco "pose" (de empe) */
function pdCodigoPose(valores, o = {}) {
  const R = pdNeutro(); let deEmpe = R; try { deEmpe = Object.assign({}, R, pdValoresPose("empe", R, null, 0).valores); } catch (e) { }
  const { linhas } = pdComandos(valores, deEmpe, o);
  return (o.comentario ? "# " + o.comentario + "\n" : "") + "pose " + pdQ(o.nome || "minha-pose") + " de empe" + (o.salvar ? " salvar" : "") + (o.tags && o.tags.length ? " tags " + JSON.stringify(o.tags.join(", ")) : "") + "\n" + (linhas.length ? linhas.map(l => "  " + l).join("\n") : "  # (igual à pose em pé)") + "\n";
}
/* animação → bloco "animacao" com uma chave por chave original (valores completos, ida e volta) */
function pdCodigoAnimacao(a, o = {}) {
  const B = pdBase(), rel = a.modo === "relativa" && !(a.absolutos && a.absolutos.length), N = pdNeutro(), linhas = [];
  const cab = ["animacao " + pdQ(o.nome || a.nome || "animacao"), "duracao " + pdN(a.duracao, 3) + "s"]; if (rel) cab.push("relativa desde-neutra"); cab.push("mantem"); if (a.loop) cab.push("loop");
  const temMover = a.chaves.some(c => c.mover && (c.mover.frente || c.mover.lado || c.mover.giro));
  if (a.fps && a.fps !== 12) cab.push("fps " + a.fps); if (a.curva && a.curva !== "suave") cab.push("curva " + a.curva); if (a.travarPes) cab.push("travar-pes"); if (a.passo === 2) cab.push("em-dois"); else if (a.passo === 3) cab.push("em-tres");
  if (a.tags && a.tags.length) cab.push("tags " + JSON.stringify(a.tags.join(", "))); if (o.salvar) cab.push("salvar");
  let S = Object.assign({}, N);
  const tempos = [...new Set(a.chaves.map(c => +c.t.toFixed(4)))].sort((x, y) => x - y);
  for (const t of tempos) { const orig = a.chaves.find(c => Math.abs(c.t - t) < 1e-4) || {}, ck = pdChaveEm(Object.assign({}, a, { loop: false }), t, B), abs = {};
    for (const [k, v] of Object.entries(ck.valores || {})) abs[k] = a.modo === "relativa" && !(a.absolutos || []).includes(k) ? (rel ? (N[k] || 0) : (B[k] || 0)) + v : v;
    const r = pdComandos(abs, S, { tol: 0.05 }); S = r.estado; const extra = [];
    const mv = temMover ? (ck.mover || orig.mover) : null; if (mv && (mv.frente || mv.lado || mv.giro || t > 0)) extra.push("move" + (mv.frente ? " frente " + pdN(mv.frente, 3) : "") + (mv.lado ? " lado " + pdN(mv.lado, 3) : "") + (mv.giro ? " giro " + pdN(mv.giro, 1) : ""));
    if (orig.olha && typeof orig.olha === "string") extra.push("olha " + (/^camera$/.test(orig.olha) ? "camera" : pdQ(orig.olha)) + (orig.olhaModo ? " " + orig.olhaModo : ""));
    if (orig.curva) extra.push("curva " + orig.curva); if (orig.fala && orig.fala.texto) extra.push("fala " + JSON.stringify(orig.fala.texto) + (orig.fala.tom ? " tom " + orig.fala.tom : ""));
    linhas.push("  chave " + pdN(t, 3) + "s " + r.linhas.concat(extra).join(" ")); }
  const notas = []; if (a.modo === "relativa" && !rel) notas.push("tinha partes absolutas: exportada como absoluta");
  if (a.descricao) notas.unshift(a.descricao);
  return (notas.length ? "# " + notas.join(" · ") + "\n" : "") + cab.join(" ") + "\n" + linhas.join("\n") + "\n";
}

/* sobreposição (overlap / follow-through): cabeça, punhos, mãos e antebraços chegam um pouco DEPOIS do resto */
const PD_SOBRA = /^(head|neck|eye|wrist|hand|forearm|finger|thumb|fing)/;
function pdSobrepor(a, atraso = 0.1, o = {}) { const B = pdBase(), a0 = Object.assign({}, a, { loop: false }), ks = [...new Set(a.chaves.flatMap(c => Object.keys(c.valores)))];
  if (!ks.some(k => PD_SOBRA.test(k))) return a;
  const ts = [...new Set(a.chaves.flatMap(c => [+c.t.toFixed(4), +Math.min(a.duracao + atraso, c.t + atraso).toFixed(4)]))].sort((x, y) => x - y);
  const ch = ts.map(t => { const c0 = pdChaveEm(a0, Math.min(t, a.duracao), B), c1 = pdChaveEm(a0, Math.max(0, Math.min(a.duracao, t - atraso)), B), v = {}; ks.forEach(k => { const x = (PD_SOBRA.test(k) ? c1 : c0).valores[k]; if (Number.isFinite(x)) v[k] = x; }); const c = { t, valores: v }; if (c0.mover) c.mover = c0.mover; return c; });
  return Object.assign(criarAnimacao(Object.assign({}, a, { chaves: ch, duracao: a.duracao + atraso, versoes: undefined, origem: undefined })), { tipo: a.tipo, volta: a.volta, nome: o.nome || a.nome }); }

export { PD_AC_EXTRA, PD_AC_ANTES, PD_MINI_EXTRA, pdSobrepor, pdCodigoPose, pdCodigoAnimacao, pdComandos, PD_JUNTAS, PD_LADOS, PD_PARTES, PD_DOC, PD_TRECHOS, PD_ATALHOS, PD_NADOS, pdNorm, pdJunta, pdFaixaMov, pdAplicarJunta, pdExtrairJuntas, pdBase, pdTodasPoses, pdValoresPose, pdChavesDasPartes, pdLerPartes, pdAtalho,
  pdMiniatura, pdMiniaturaJunta, pdMiniaturaAnimacao, pdMiniaturaItem, pdParams, pdChaveEm, pdTrecho, pdAteAngulo, pdReverter, pdEspelharAnim, pdAbsoluta, pdJuntar, pdRepetir, pdVaiEVolta, pdAmplitude, pdEsticar, pdTroca, pdSoma, pdTira, pdFixar, pdCamada,
  pdCiclo, pdCompletar, pdRebase, pdCompor };
