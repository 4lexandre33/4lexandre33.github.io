/* GeoMannequin — BARRA DE COMANDO DO PALCO: uma linha do texto (a mesma linguagem do Name) aplicada direto na cena que está na tela.
   "Kai pose correndo" · "Kai em (2,3) gira 90" · "Mira senta-em Cadeira" · "objeto carro "Fusca" em (4,0) modelo hatch" ·
   "efeito feixe de Kai para Mira" · "Lua animal lobo em (1,2)" (quem não está na cena entra sozinho).
   Como funciona: a cena atual vira texto (dslDoPalco), o texto é compilado com e sem a linha e só o que a LINHA mudou
   passa para a cena (posição, pose, objetos novos, efeitos novos, embarques…). O resto da cena fica como estava. */
import { SCN, P } from "./modelo.js";
import { sceneState, loadScene } from "./estado.js";
import { POSEKEYS } from "./parametros.js";
import { compilarName } from "./name-dsl.js";

const BC_M = 0.114, bcN = v => +(+v * BC_M).toFixed(2);
const bcNome = s => /^[A-Za-zÀ-ÿ][\wÀ-ÿ]*$/.test(s) ? s : '"' + String(s).replace(/"/g, "") + '"';
/* a cena da tela em texto (elenco + um quadro com posições, giros e objetos) */
function dslDoPalco() {
  const gente = SCN.list.filter(it => it.name && it.name !== "__vazio__"), objs = SCN.objetos || [];
  const elenco = gente.map(it => "  " + bcNome(it.name)).concat(objs.filter(o => o.animal && o.nome).map(o => "  " + bcNome(o.nome) + " animal " + o.animal.especie + (o.animal.escala && Math.abs(o.animal.escala - 1) > 0.01 ? " escala " + (+o.animal.escala).toFixed(2) : "")));
  const linhas = [];
  for (const o of objs) { if (o.animal || o.chao || o.tipo === "corda") continue; const nm = o.nome || (o.tipo + o.id);
    linhas.push("  objeto " + o.tipo + ' "' + String(nm).replace(/"/g, "") + '" em (' + bcN(o.x || 0) + "," + bcN(o.z || 0) + ")" + (o.giro ? " gira " + Math.round(o.giro) : "") + (o.base ? " base " + bcN(o.base) : "") + (o.modelo ? " modelo " + o.modelo : "") + (o.vagoes !== undefined ? " vagoes " + o.vagoes : "")); }
  for (const o of objs) if (o.animal && o.nome) linhas.push("  " + bcNome(o.nome) + " em (" + bcN(o.x || 0) + "," + bcN(o.z || 0) + ")" + (o.giro ? " gira " + Math.round(o.giro) : ""));
  for (const it of gente) linhas.push("  " + bcNome(it.name) + " em (" + bcN(it.params.wx || 0) + "," + bcN(it.params.wz || 0) + ")" + (it.params.wRot ? " gira " + Math.round(it.params.wRot) : ""));
  for (const it of gente) { if (it.embarcadoEm && it.embarcadoEm.veiculo) linhas.push("  " + bcNome(it.name) + " embarca " + bcNome(it.embarcadoEm.veiculo) + " assento " + it.embarcadoEm.assento); else if (it.montadoEm) linhas.push("  " + bcNome(it.name) + " monta " + bcNome(it.montadoEm)); else if (it.apoioEm) { const q = objs.find(o => o.id === it.apoioEm); if (q && q.nome && /cadeira|banco|sofa|poltrona|cama|caixa|degrau|trono/.test(q.tipo) && (it.params.hipFlexL || 0) > 50) linhas.push("  " + bcNome(it.name) + " senta-em " + bcNome(q.nome)); } }
  return "elenco\n" + (elenco.length ? elenco.join("\n") : "  __ninguem__") + "\nquadro 1\n" + linhas.join("\n") + "\n";
}
/* nomes novos na linha (Capitalizados, que não são nada da cena) entram no elenco; "X animal especie …" também */
function bcNovos(linha, ctxNomes) { const out = []; const m = /^\s*(?:\d+(?:\.\d+)?s\s+)?([A-ZÀ-Ý][\wÀ-ÿ]*)\s+animal\s+(\S+)(.*)$/.exec(linha);
  if (m) return { animal: { nome: m[1], especie: m[2], resto: m[3] } };
  const w = /^\s*(?:\d+(?:\.\d+)?s\s+)?([A-ZÀ-Ý][\wÀ-ÿ]*)\b/.exec(linha); if (w && !ctxNomes.has(w[1])) out.push(w[1]); return { pessoas: out }; }
function aplicarLinhaNoPalco(linha, opts = {}) {
  linha = String(linha || "").trim(); if (!linha) return { ok: false, erros: ["Linha vazia."] };
  let antes = JSON.stringify(sceneState()); const nomes = new Set(SCN.list.map(x => x.name).concat((SCN.objetos || []).map(o => o.nome).filter(Boolean)));
  let base = dslDoPalco(), corpo = linha;
  const nv = /^\s*(camera|câmera|objeto|efeito)\b/i.test(linha) ? {} : bcNovos(linha, nomes);
  if (nv.animal) { const r0 = nv.animal.resto.trim(), i = r0.search(/\b(em|pose|gira|vira-para)\b/), opc = i < 0 ? r0 : r0.slice(0, i).trim(), resto = i < 0 ? "" : r0.slice(i); base = base.replace("elenco\n", "elenco\n  " + nv.animal.nome + " animal " + nv.animal.especie + (opc ? " " + opc : "") + "\n"); corpo = nv.animal.nome + " " + (resto || "em (0,2)"); }
  /* a primeira pessoa nova ocupa o "Manequim 1" padrão (intocado, no centro) em vez de ficar outro boneco em cima */
  if ((nv.pessoas || []).length || nv.animal) { const pad = SCN.list.filter(x => /^Manequim \d+$/.test(x.name)); if ((nv.pessoas || []).length && pad.length === 1 && SCN.list.filter(x => x.name !== "__vazio__").length === 1 && !(pad[0].params.wx) && !(pad[0].params.wz)) { pad[0].name = nv.pessoas[0]; nomes.add(nv.pessoas[0]); base = dslDoPalco(); nv.pessoas = []; antes = JSON.stringify(sceneState()); } }
  for (const n of nv.pessoas || []) base = base.replace("elenco\n", "elenco\n  " + n + "\n");
  base = base.replace("  __ninguem__\n", nv.animal || (nv.pessoas || []).length ? "" : "  __ninguem__\n");
  const camLinha = /^\s*(camera|câmera)\b/i.test(linha), comLinha = camLinha ? base.replace("\nquadro 1\n", "\nquadro 1 " + linha.trim() + "\n") : base + "  " + corpo.replace(/\n/g, "\n  ") + "\n";
  let rA, rB; try { rA = compilarName(base, { semCache: true, salvar: false }); rB = compilarName(comLinha, { semCache: true, salvar: false }); }
  finally { loadScene(JSON.parse(antes)); }
  if (!rB.ok) return { ok: false, erros: rB.erros.map(e => e.erro), avisos: rB.avisos };
  const A = rA.ok ? rA.quadros[0].estado : { list: [], objetos: [] }, B = rB.quadros[0].estado, mudou = [];
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b), palavras = new Set(linha.replace(/[^\wÀ-ÿ\s-]/g, " ").split(/\s+/)), citado = n => palavras.has(n) || (n && n.includes(" ") && linha.includes(n));
  /* pessoas: o que a linha mudou */
  for (const pb of B.list) { if (!pb.name || pb.name === "__vazio__" || pb.name === "__ninguem__") continue; const pa = A.list.find(x => x.name === pb.name), live = SCN.list.find(x => x.name === pb.name);
    if (!live) { const novo = JSON.parse(antes); novo.list.push(pb); loadScene(novo); mudou.push(pb.name + " entrou na cena"); continue; }
    if (!pa || !citado(pb.name)) continue; const pose = /\b(pose|senta|sentado|sentada|ajoelha|deita|agacha|anima|golpeia|acerta|ataca|dispara|monta|embarca|rema|segura|esgrima|sobre-\w+)\b/.test(linha) && Object.keys(pb.params).some(k => POSEKEYS.has(k) && pb.params[k] !== pa.params[k]);
    let mexeu = pose; for (const k of Object.keys(pb.params)) { if (pose && POSEKEYS.has(k)) live.params[k] = pb.params[k]; else if (!igual(pb.params[k], pa.params[k])) { live.params[k] = pb.params[k]; mexeu = true; } }
    if (Number.isInteger(pb.apoioEm) && B.objetos && B.objetos[pb.apoioEm] && !igual(pb.apoioEm, pa.apoioEm)) { const nm = B.objetos[pb.apoioEm].nome, q = (SCN.objetos || []).find(o => o.nome === nm); if (q) { live.apoioEm = q.id; mexeu = true; } }
    for (const k of ["embarcadoEm", "montadoEm", "oculto", "papel"]) if (!igual(pb[k], pa[k]) && pb[k] !== undefined) { live[k] = pb[k]; mexeu = true; }
    if (mexeu) mudou.push(pb.name + (pose ? ": pose" : ": posição")); }
  /* objetos e animais: novos entram; os que a linha mexeu mudam */
  const chave = o => o.nome || o.tipo;
  for (const ob of B.objetos || []) { if (ob.chao) continue; const oa = (A.objetos || []).find(x => chave(x) === chave(ob) && x.tipo === ob.tipo), live = (SCN.objetos || []).find(x => chave(x) === chave(ob) && x.tipo === ob.tipo);
    if (!oa || !live || (!citado(ob.nome) && oa)) { if (!live) { const novo = JSON.parse(JSON.stringify(sceneState())); novo.objetos = (novo.objetos || []).concat([ob]); loadScene(novo); mudou.push((ob.nome || ob.tipo) + " entrou na cena"); } continue; }
    let algum = false; for (const k of Object.keys(ob)) { if (k === "id") continue; if (!igual(ob[k], oa[k])) { live[k] = JSON.parse(JSON.stringify(ob[k])); algum = true; } } if (algum) mudou.push((ob.nome || ob.tipo) + " mudou"); }
  /* efeitos: os que a linha criou */
  const efA = (A.efeitos || []).length, efB = B.efeitos || []; if (efB.length > efA) { const novo = JSON.parse(JSON.stringify(sceneState())); const remap = a => { if (a && a.indice && Number.isInteger(a.alvo) && B.list[a.alvo]) { const j = novo.list.findIndex(x => x.name === B.list[a.alvo].name); if (j >= 0) a.alvo = j; } return a; };
    const novos = JSON.parse(JSON.stringify(efB.slice(efA))).map(e => { remap(e.ancora); if (e.direcao && e.direcao.alvo && typeof e.direcao.alvo === "object") remap(e.direcao.alvo); return e; }); novo.efeitos = (novo.efeitos || []).concat(novos); loadScene(novo); mudou.push((efB.length - efA) + " efeito(s)"); }
  /* câmera: só quando a linha é de câmera */
  if (camLinha && B.camera) { Object.assign(P, B.camera); mudou.push("câmera"); }
  return { ok: true, mudou, avisos: (rB.avisos || []).filter(a => !(rA.avisos || []).includes(a)) };
}
/* palavras para o autocompletar da barra (verbos e opções mais usados) */
const BC_SUGESTOES = ["pose", "em (x,z)", "gira", "vira-para", "olha", "senta-em", "embarca", "monta", "sobre-cabeca", "sobre-costas", "segura", "golpeia", "dispara", "anima", "anda-ate", "expressao", "gesto",
  "objeto carro", "objeto onibus", "objeto aviao", "objeto helicoptero", "objeto lancha", "objeto trem", "objeto porta", "objeto portaoTita", "objeto castelo", "objeto casteloMagico", "objeto floresta",
  "efeito feixe de", "efeito explosao em", "efeito aura em", "efeito raio_cadeia de", "efeito rugido em", "efeito pisada_gigante em", "efeito teia em", "efeito rasgo_dimensional em", "camera (x,y,z) olhando (x,y,z)", "animal cavalo", "animal dragao monstro"];
export { dslDoPalco, aplicarLinhaNoPalco, BC_SUGESTOES };
