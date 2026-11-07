/* GeoMannequin — cena descrita em português e cena montada a partir de uma lista.
   Exemplo: "manequim 1 sentado, manequim 2 deitado ao longo do eixo x, manequim 3 saltando orientado para o eixo y
   olhando para baixo, câmera no eixo z, elevação alta".
   Cada trecho começa num sujeito (“manequim N”, o nome de um manequim, “câmera”, “luz”); o que vem depois vale para ele. */
import { SCN } from "./modelo.js";
import { POSE_ALIAS, POSES_CORPO, BPOSES } from "./poses.js";
import { TIPOS_OBJETO } from "../engine/index.js";

const sem = t => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const NUMS = { um: 1, uma: 1, primeiro: 1, primeira: 1, dois: 2, duas: 2, segundo: 2, segunda: 2, tres: 3, terceiro: 3, terceira: 3, quatro: 4, quarto: 4, quarta: 4,
  cinco: 5, quinto: 5, seis: 6, sexto: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12 };
/* poses por palavra (sem acento), da mais longa para a mais curta, para “sentado no chão” vencer “sentado” */
const POSE_PALAVRAS = (() => {
  const m = {};
  Object.entries(POSE_ALIAS).forEach(([k, v]) => m[sem(k)] = v);
  Object.keys(POSES_CORPO).concat(Object.keys(BPOSES)).forEach(k => { if (k !== "maosNaCintura") m[sem(k).toLowerCase()] = k; });
  Object.assign(m, { "sentado": "sentado", "sentada": "sentado", "agachada": "agachar", "deitada": "deitadoCostas", "parado": "empe", "parada": "empe", "em pe": "empe",
    "correndo": "correndo", "corre": "correndo", "pulando": "saltando", "saltando": "saltando", "aterrissando": "aterrissando", "chutando": "chutando", "lutando": "socando",
    "de quatro": "engatinhando", "ajoelhado": "ajoelhado", "ajoelhada": "ajoelhado", "agachado": "agachar", "andando": "caminhando", "caminhando": "caminhando" });
  return Object.keys(m).sort((a, b) => b.length - a.length).map(k => [k, m[k]]);
})();
const EIXO = "([+-]?\\s*[xyz])\\b";

function acharPose(t) {
  for (const [k, v] of POSE_PALAVRAS) { const re = new RegExp("(^|[^a-z])" + k.replace(/\s+/g, "\\s+") + "($|[^a-z])"); if (re.test(t)) return v; }
  return null;
}
/* direção a partir do texto: eixo, “câmera”, “direita”…, nome de manequim */
function acharDirecao(t, verbos) {
  const re = new RegExp("(?:" + verbos + ")\\s+(?:para\\s+|pra\\s+|ao\\s+longo\\s+d[oa]\\s+|na\\s+direcao\\s+d[oa]\\s+|no\\s+sentido\\s+d[oa]\\s+)?(?:o\\s+|a\\s+)?(?:eixo\\s+" + EIXO + "|(camera|direita|esquerda|frente|tras|fundo)|(manequim\\s+\\w+))");
  const m = re.exec(t); if (!m) return null;
  if (m[1]) return m[1].replace(/\s/g, "");
  if (m[2]) return m[2] === "camera" ? "câmera" : m[2];
  if (m[3]) return manequimRef(m[3]);
  return null;
}
function manequimRef(s) { const m = /manequim\s+(\d+|\w+)/.exec(s); if (!m) return null; const n = /^\d+$/.test(m[1]) ? +m[1] : NUMS[m[1]]; return n ? { indice: n } : null; }

/* divide o texto em trechos, um por sujeito */
function trechos(txt) {
  const t = sem(txt).replace(/[“”"]/g, "");
  const nomes = SCN.list.map(it => sem(it.name)).filter(n => !/^manequim \d+$/.test(n)).sort((a, b) => b.length - a.length);
  const pats = ["manequim\\s+(?:\\d+|" + Object.keys(NUMS).join("|") + ")\\b", "(?:o\\s+|a\\s+)?(?:\\d+|" + Object.keys(NUMS).join("|") + ")[ºo°]?\\s+manequim\\b", "c[a]mera\\b|camara\\b", "\\bluz\\b", "\\bcena\\b"]
    .concat(nomes.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b"));
  const re = new RegExp(pats.join("|"), "g"), marcas = []; let m;
  /* “olhando para o manequim 2”, “virado para a câmera”: é referência, não sujeito */
  while ((m = re.exec(t))) { if (/(?:\b(?:para|pra|pro|do|da|no|na|ao|com|entre|ate|sobre|perto|de|em)\s+(?:o\s+|a\s+)?)$/.test(t.slice(0, m.index)) && !/^(?:o\s|a\s)/.test(m[0])) continue; marcas.push({ i: m.index, s: m[0] }); }
  if (!marcas.length) return [{ sujeito: { indice: 1 }, texto: t }];
  const out = [];
  if (marcas[0].i > 0 && /[a-z]/.test(t.slice(0, marcas[0].i))) out.push({ sujeito: { cena: true }, texto: t.slice(0, marcas[0].i) });
  marcas.forEach((k, j) => {
    const fim = j + 1 < marcas.length ? marcas[j + 1].i : t.length, s = k.s.trim(); let suj;
    if (/^c[a]m|^camara/.test(s)) suj = { camera: true };
    else if (s === "luz") suj = { luz: true };
    else if (s === "cena") suj = { cena: true };
    else if (/manequim/.test(s)) { const n = /(\d+)/.exec(s) ? +/(\d+)/.exec(s)[1] : NUMS[s.split(/\s+/).find(w => NUMS[w])]; suj = { indice: n || 1 }; }
    else suj = { nome: SCN.list.find(it => sem(it.name) === s).name };
    out.push({ sujeito: suj, texto: t.slice(k.i + k.s.length, fim) });
  });
  return out;
}
const numero = (re, t) => { const m = re.exec(t); return m ? parseFloat(m[1].replace(",", ".")) : null; };

/* aplica um trecho a um manequim (api m) */
function aplicarManequim(m, t, api, avisos, feito) {
  const ref = it => typeof it === "object" && it && it.indice ? api.manequim(it.indice).nome : it;
  /* objetos citados: “sentado no banco”, “sobre a caixa”, “encostado na parede” */
  const tipoObj = Object.keys(TIPOS_OBJETO).find(k => new RegExp("\\b(?:n[oa]s?|sobre\\s+[oa]|em\\s+cima\\s+d[oa]|d[oa])\\s+" + k + "s?\\b").test(t));
  const obj = tipoObj ? (api.cena.objetos().find(o => o.tipo === tipoObj) || api.cena.objeto(tipoObj, { x: m.info().x, z: m.info().z })) : null;
  let pose = acharPose(t);
  const deitado = /\bdeitad[oa]\b|\bde\s+brucos\b|\bde\s+bruços\b/.test(t);
  if (deitado) {
    const tipo = /bruc/.test(t) ? "bruços" : /de\s+lado|lateral/.test(t) ? (/direit/.test(t) ? "lado direito" : "lado") : "costas";
    const eixo = acharDirecao(t, "deitad[oa]|cabeca|orientad[oa]|apontad[oa]|virad[oa]|ao\\s+longo") || ((/ao\s+longo\s+d[oa]\s+eixo\s+([+-]?\s*[xyz])/.exec(t) || [])[1] || "").replace(/\s/g, "") || undefined;
    m.deitar(tipo, eixo ? ref(eixo) : undefined); feito.push(m.nome + ": deitado de " + tipo + (eixo ? " (cabeça para " + eixo + ")" : ""));
    pose = null;
  } else if (/\bsentad[oa]\b/.test(t) && obj && /^(banco|cadeira|caixa|degrau|mesa)$/.test(obj.tipo) && !/no\s+chao/.test(t)) { m.sentar(obj.nome); feito.push(m.nome + ": sentado em " + obj.nome); pose = null; }
  else if (/\bsentad[oa]\b/.test(t) && !/no\s+chao|pernas\s+cruzadas|calcanhar/.test(t)) { m.sentar(); feito.push(m.nome + ": sentado (com banco)"); pose = null; }
  else if (obj && /\bencostad[oa]\b/.test(t)) { m.encostar(obj.nome); feito.push(m.nome + ": encostado em " + obj.nome); pose = null; }
  if (pose) { const lado = /(?:mao|braco|perna|lado)\s+direit/.test(t) ? "dir" : undefined; m.poseRapida(pose, lado ? { lado } : undefined); feito.push(m.nome + ": " + pose); }
  /* acenar por cima de outra pose (“de cócoras acenando”) */
  if (/\bacenand/.test(t) && pose !== "acenando") { const l = /(?:mao|braco)\s+esquerd/.test(t) ? "esquerdo" : "direito"; m.articulacao("ombro " + l, { abrir: 150, frente: 10 }); m.articulacao("cotovelo " + l, { dobrar: 45 }); m.gesto(l.replace("o", "a"), "acenar"); feito.push(m.nome + ": acenando"); }
  if (obj && /\b(sobre|em\s+cima)\b/.test(t) && !/sentad/.test(t)) { m.subir(obj.nome); feito.push(m.nome + ": em cima de " + obj.nome); }
  /* altura do salto */
  const alt = numero(/(?:altura|salt\w*|pul\w*)\s+(?:de\s+)?(-?\d+(?:[.,]\d+)?)\s*(cm|m|r)?\b/, t);
  if (alt !== null) { const u = (/(?:altura|salt\w*|pul\w*)\s+(?:de\s+)?-?\d+(?:[.,]\d+)?\s*(cm|m|r)?\b/.exec(t) || [])[1]; m.altura(u === "cm" ? alt / 11.4 : u === "m" ? alt * 100 / 11.4 : alt); }
  else if (/salt\w*\s+alto|pul\w*\s+alto/.test(t)) m.altura(6);
  /* orientação no chão */
  if (!deitado) {
    const d = acharDirecao(t, "orientad[oa]|virad[oa]|de\\s+frente|olhando\\s+de\\s+frente|voltad[oa]|indo|correndo|andando|caminhando|saltando|pulando");
    if (d && !/^[+-]?y$/.test(d)) { m.orientar(ref(d)); feito.push(m.nome + ": orientado para " + (typeof d === "object" ? ref(d) : d)); }
    else if (d) {
      /* “orientado para o eixo y”: o corpo fica alinhado ao eixo vertical — em pé (+y) ou de cabeça para baixo (−y) */
      if (d === "-y") { m.inclinar(180); feito.push(m.nome + ": de cabeça para baixo (eixo −y)"); }
      else feito.push(m.nome + ": de pé, alinhado ao eixo y");
    }
    if (/de\s+costas\s+para\s+a\s+camera/.test(t)) { m.orientar("câmera"); m.girar(m.info().giro + 180); }
  }
  /* olhar */
  const o = /olhando\s+(?:para\s+(?:o\s+|a\s+)?|pra\s+)?(baixo|cima|frente|esquerda|direita|camera|manequim\s+\w+|o\s+chao|o\s+ceu)/.exec(t);
  if (o) { let a = o[1].replace("o chao", "baixo").replace("o ceu", "cima"); if (/^manequim/.test(a)) a = ref(manequimRef(a)); else if (a === "camera") a = "câmera"; m.olhar(a); feito.push(m.nome + ": olhando para " + a); }
  /* apontar */
  const ap = /apontando\s+(?:para\s+)?(?:o\s+|a\s+)?(?:eixo\s+)?([+-]?[xyz]\b|camera|cima|baixo|frente|direita|esquerda|manequim\s+\w+)/.exec(t);
  if (ap) { let a = ap[1]; if (/^manequim/.test(a)) a = ref(manequimRef(a)); else if (a === "camera") a = "câmera"; m.apontar(a, /esquerd/.test(t.slice(0, ap.index)) ? "esquerda" : "direita"); }
  /* gestos */
  const g = /\b(punho|mao\s+aberta|maos\s+abertas|pinca|joinha|paz|ok|garra|segurando)\b/.exec(t);
  if (g) { const gn = { "mao aberta": "aberta", "maos abertas": "aberta", segurando: "segurar" }[g[1]] || g[1]; m.gesto(/mao\s+esquerd/.test(t) ? "esquerda" : /mao\s+direit/.test(t) ? "direita" : "ambas", gn); }
  /* posição: “em x = 3”, “na posição 3, -2”, “à direita do manequim 1”, “atrás do 2” */
  const px = numero(/\bx\s*=\s*(-?\d+(?:[.,]\d+)?)/, t), pz = numero(/\bz\s*=\s*(-?\d+(?:[.,]\d+)?)/, t);
  const pp = /posi[cç]ao\s+(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)/.exec(t);
  if (pp) { m.posicao(parseFloat(pp[1].replace(",", ".")), parseFloat(pp[2].replace(",", "."))); m._posto = true; }
  else if (px !== null || pz !== null) { const i = m.info(); m.posicao(px ?? i.x, pz ?? i.z); m._posto = true; }
  const rel = /(a\s+direita|a\s+esquerda|atras|na\s+frente|ao\s+lado)\s+d[oa]\s+(manequim\s+\w+|\d+)/.exec(t);
  if (rel) {
    const r = /^\d+$/.test(rel[2]) ? { indice: +rel[2] } : manequimRef(rel[2]), b = api.manequim(r.indice).info(), dist = 7.5;
    const off = { "a direita": [dist, 0], "a esquerda": [-dist, 0], "atras": [0, -dist], "na frente": [0, dist], "ao lado": [dist, 0] }[rel[1].replace(/\s+/g, " ")];
    m.posicao(b.x + off[0], b.z + off[1]); m._posto = true;
  }
}
function aplicarCamera(cam, t, feito) {
  const e = /(?:no|sobre\s+o|ao\s+longo\s+do|pelo|olhando\s+(?:pelo|do|ao\s+longo\s+do))\s+eixo\s+([+-]?\s*[xyz])\b/.exec(t) || /^\s*(?:em\s+)?([+-]?\s*[xyz])\b/.exec(t);
  if (e) { cam.eixo(e[1].replace(/\s/g, "")); feito.push("câmera no eixo " + e[1].replace(/\s/g, "")); }
  const el = /eleva[cç]ao\s+(muito\s+alta|alta|media|baixa|muito\s+baixa|dos\s+olhos|nivel\s+dos\s+olhos|(-?\d+)\s*(?:graus|°)?)/.exec(t);
  if (el) { let v = el[1]; v = el[2] !== undefined ? +el[2] : v.replace("media", "média").replace(/^d?o?s?\s*olhos$|nivel dos olhos/, "olhos"); cam.elevacao(v); feito.push("elevação " + v); }
  else if (/de\s+cima|zenital|aerea/.test(t)) { cam.elevacao("de cima"); feito.push("câmera de cima"); }
  else if (/contra.?plonge|de\s+baixo|baixa/.test(t)) { cam.plano("contra-plongée"); feito.push("contra-plongée"); }
  else if (/plonge|\balta\b|\balto\b/.test(t)) { cam.elevacao("alta"); feito.push("elevação alta"); }
  else if (/olhos|nivel/.test(t)) { cam.elevacao("olhos"); feito.push("câmera na altura dos olhos"); }
  const ln = numero(/lente\s+(?:de\s+)?(\d+)/, t); if (ln !== null) { cam.lente(ln); cam.perspectiva(true); feito.push("lente " + ln + " mm"); }
  if (/perspectiva/.test(t)) cam.perspectiva(!/sem\s+perspectiva/.test(t));
  const gi = numero(/(?:girad[ao]|azimute|yaw)\s+(-?\d+)/, t); if (gi !== null) cam.girar(gi);
}

/* api: {cena, camera, manequim(i)} — dado por comandos.js (evita dependência circular) */
function descreverCena(texto, api) {
  const feito = [], avisos = [], usados = new Set();
  let enq = true;
  /* a câmera primeiro: “virado para a câmera” usa a câmera já posicionada */
  const tr = trechos(texto).sort((a, b) => (b.sujeito.camera ? 1 : 0) - (a.sujeito.camera ? 1 : 0));
  for (const { sujeito, texto: t } of tr) {
    try {
      if (sujeito.camera) { aplicarCamera(api.camera, t, feito); continue; }
      if (sujeito.luz) { const a = numero(/(-?\d+)/, t); if (a !== null) api.camera.luz(a); continue; }
      if (sujeito.cena) { if (/sem\s+enquadrar/.test(t)) enq = false; if (/sem\s+sombra/.test(t)) api.cena.sombras(false); continue; }
      let m;
      if (sujeito.nome) m = api.cena.obter(sujeito.nome);
      else {
        while (SCN.list.length < sujeito.indice) { const n = api.cena.adicionar(); feito.push("criado " + n.nome); }
        m = api.manequim(sujeito.indice);
      }
      usados.add(m.nome);
      aplicarManequim(m, t, api, avisos, feito);
    } catch (e) { avisos.push(String(e && e.message || e)); }
  }
  /* sem colisões entre os manequins (afasta quem não teve posição pedida) */
  try { api.cena.resolverColisoes({ preferir: "distancia" }); } catch (e) { avisos.push(String(e.message || e)); }
  if (enq) api.camera.enquadrar();
  return { feito, avisos };
}

/* lista: [{nome?, pose, x, z, giro, orientar, deitar:{tipo,eixo}, olhar, altura, sentar, gesto, articulacoes:{"cotovelo esquerdo":{dobrar:90}}}],
   opts: {camera:{eixo, elevacao, lente, plano}, limpar:true} */
function montarCena(lista, opts, api) {
  if (!Array.isArray(lista)) throw new Error("cena.montar espera uma lista de manequins: [{pose: \"sentado\"}, {deitar: {eixo: \"x\"}}].");
  if (lista.length > 12) throw new Error("No máximo 12 manequins.");
  opts = opts || {};
  if (opts.limpar !== false) api.cena.limpar();
  const ms = lista.map((o, i) => {
    o = o || {};
    const m = i === 0 ? api.manequim(1) : api.cena.adicionar();
    if (o.nome) m.renomear(o.nome);
    if (o.corpo) m.corpo(o.corpo);
    if (o.x !== undefined || o.z !== undefined) { const f = m.info(); m.posicao(o.x ?? f.x, o.z ?? f.z); }
    if (o.deitar) m.deitar(o.deitar.tipo || o.deitar, o.deitar.eixo);
    else if (o.sentar !== undefined) m.sentar(o.sentar === true ? undefined : o.sentar);
    else if (o.pose) m.pose(o.pose);
    if (o.orientar !== undefined) m.orientar(o.orientar);
    if (o.giro !== undefined) m.girar(o.giro);
    if (o.altura !== undefined) m.altura(o.altura);
    if (o.inclinar !== undefined) m.inclinar(o.inclinar, o.rolar);
    if (o.olhar !== undefined) m.olhar(o.olhar);
    if (o.gesto) m.gesto(o.gesto.lado || "ambas", o.gesto.nome || o.gesto);
    if (o.articulacoes) Object.entries(o.articulacoes).forEach(([k, v]) => m.articulacao(k, v));
    if (o.cor) m.cor(o.cor, o.contorno);
    return m;
  });
  const c = opts.camera || {};
  if (c.eixo) api.camera.eixo(c.eixo);
  if (c.elevacao !== undefined) api.camera.elevacao(c.elevacao);
  if (c.plano) api.camera.plano(c.plano);
  if (c.lente) { api.camera.perspectiva(true); api.camera.lente(c.lente); }
  if (opts.colisoes !== false) try { api.cena.resolverColisoes({ preferir: "distancia" }); } catch (e) { }
  if (opts.enquadrar !== false) api.camera.enquadrar();
  return ms;
}

export { descreverCena, montarCena };
