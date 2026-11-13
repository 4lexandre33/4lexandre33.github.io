/* GeoMannequin — AÇÕES do dia a dia e CICLOS DE ESPERA.
   Ação = acontece e SEGURA a pose final (oferecer, pedir, apontar…); as passageiras (beber, acenar, bocejar…) voltam sozinhas.
   Espera = longa, sem repetir igual: respira, troca o peso, olha em volta, ajeita o braço (sorteado pela semente).
   Toda ação tem antecipação (um pouco para o lado contrário) e assentamento (passa um pouco e volta) — dá para regular. */
import { SCN } from "./modelo.js";
import { criarAnimacao, anPoseValores, registrarProntas } from "./animacao.js";
import { pdAplicarJunta, pdExtrairJuntas, pdBase, pdParams, pdEspelharAnim } from "./pose-dsl.js";
import { mdSorteio } from "./multidao.js";
import { EXPRESSOES } from "./poses.js";

/* valores de uma linha só de juntas ("ombro.direito(frente 60) cotovelo.direito(dobra 20)") sobre em pé */
function adJuntas(txt, base) { const Q = Object.assign({}, base || pdParams({})), ex = pdExtrairJuntas(txt); ex.juntas.forEach(j => pdAplicarJunta(Q, j.junta, j.lado, j.args, 0)); return Q; }
function adPoseDelta(nome) { const B = pdBase(), v = anPoseValores(nome, pdParams({})), d = {}; for (const k of Object.keys(v)) if (Math.abs((v[k] || 0) - (B[k] || 0)) > 0.01 && k !== "ground") d[k] = (v[k] || 0) - (B[k] || 0); return d; }
/* chaves [t, "juntas", {rosto, pose}] → animação relativa (diferenças para em pé), com antecipação e assentamento */
function adAcao(nome, chaves, o = {}) {
  const B = pdParams({}), E0 = pdBase(), lista = chaves.map(([t, txt, x]) => { let Q = adJuntas(txt || "", B); if (x && x.pose) { const d = adPoseDelta(x.pose); for (const [k, v] of Object.entries(d)) Q[k] = (E0[k] || 0) + v; Q = adJuntas(txt || "", Q); }
    const v = {}; for (const k of Object.keys(Q)) if (Number.isFinite(Q[k]) && Math.abs((Q[k] || 0) - (E0[k] || 0)) > 1e-3 && !/^(wx|wz|wRot)$/.test(k)) v[k] = Q[k] - (E0[k] || 0); return { t, v, x: x || {} }; });
  const ks = [...new Set(lista.flatMap(c => Object.keys(c.v)))]; lista.forEach(c => ks.forEach(k => { if (!(k in c.v)) c.v[k] = 0; }));
  let ch = lista.map(c => ({ t: c.t, valores: c.v, rosto: c.x.rosto ? { expressao: c.x.rosto, intensidade: c.x.intensidade || 0.8 } : undefined, curva: c.x.curva }));
  ch.forEach(c => { if (!c.rosto) delete c.rosto; if (!c.curva) delete c.curva; });
  /* antecipação: antes do primeiro movimento, um pouco ao contrário; assentamento: o último passa um pouco e volta */
  const ant = o.antecipa ?? 0.12, ass = o.assenta ?? 0.08;
  if (ant > 0 && ch.length >= 2) { const a0 = ch[0], a1 = ch[1], v = {}; for (const k of ks) v[k] = a0.valores[k] - (a1.valores[k] - a0.valores[k]) * ant; ch.splice(1, 0, { t: +(a1.t * 0.32).toFixed(3), valores: v, curva: "saida" }); }
  const fim = o.volta ? null : ch[ch.length - 1];
  if (ass > 0 && fim && ch.length >= 2) { const p = ch[ch.length - 2], v = {}; for (const k of ks) v[k] = fim.valores[k] + (fim.valores[k] - p.valores[k]) * ass; ch.splice(ch.length - 1, 0, { t: fim.t, valores: v, curva: "suave" }); fim.t = +(fim.t + 0.2).toFixed(3); }
  if (o.volta) { const u = ch[ch.length - 1]; ch.push({ t: +(u.t + (o.segura ?? 0.5)).toFixed(3), valores: Object.assign({}, u.valores) }, { t: +(u.t + (o.segura ?? 0.5) + (o.duracaoVolta ?? 0.55)).toFixed(3), valores: Object.fromEntries(ks.map(k => [k, 0])) }); }
  return criarAnimacao({ nome, duracao: ch[ch.length - 1].t, modo: "relativa", curva: "suave", pesFixos: true, chaves: ch, tipo: "acao", volta: !!o.volta, tags: o.tags || ["Acao/Dia"], descricao: o.desc || nome });
}
/* oscila (tremer, rir, palmas): repete pares de chaves */
function adOscila(base, t0, n, per, a, b) { const out = []; for (let i = 0; i < n; i++) { out.push([+(t0 + per * i).toFixed(3), base + " " + a]); out.push([+(t0 + per * i + per / 2).toFixed(3), base + " " + b]); } return out; }
const AD_ACOES = {
  oferece: () => adAcao("oferecer", [[0, ""], [0.75, "ombro.direito(frente 65 abre 12) cotovelo.direito(dobra 18) antebraco.direito(palma-cima 75) mao.direito(fecha 15%) tronco(frente 8) cabeca(baixa 6)"]], { desc: "estende a mão oferecendo (e fica)", tags: ["Acao/Dar/Oferecer"] }),
  pede: () => adAcao("pedir", [[0, ""], [0.8, "ombro.ambos(frente 38 abre 10) cotovelo.ambos(dobra 70) antebraco.ambos(palma-cima 80) mao.ambos(fecha 10%) cabeca(inclina-direita 8 baixa 4) tronco(frente 6)", { rosto: "tristeza", intensidade: 0.4 }]], { desc: "palmas para cima, pedindo", tags: ["Acao/Pedir"] }),
  entrega: () => adAcao("entregar", [[0, ""], [0.7, "ombro.direito(frente 78 abre 6) cotovelo.direito(dobra 10) antebraco.direito(palma-cima 35) mao.direito(fecha 45%) tronco(frente 10)"]], { desc: "estica o braço entregando algo", tags: ["Acao/Dar/Entregar"] }),
  recebe: () => adAcao("receber", [[0, ""], [0.6, "ombro.ambos(frente 55) cotovelo.ambos(dobra 35) antebraco.ambos(palma-cima 80) mao.ambos(abre)"], [1.05, "ombro.ambos(frente 38) cotovelo.ambos(dobra 75) antebraco.ambos(palma-cima 70) mao.ambos(fecha 45%) cabeca(baixa 10)"]], { desc: "recebe com as duas mãos e traz para si", tags: ["Acao/Receber"] }),
  aponta: () => adAcao("apontar", [[0, ""], [0.5, "ombro.direito(frente 85 abre 10) cotovelo.direito(dobra 4) antebraco.direito(palma-baixo 10) mao.direito(fecha 95% indicador -100% polegar 40%) cabeca(gira-direita 6)"]], { desc: "aponta para a frente", tags: ["Acao/Apontar"] }),
  acena: () => adAcao("acenar", [[0, ""], [0.45, "ombro.direito(abre 120 frente 20) cotovelo.direito(dobra 75) antebraco.direito(palma-baixo 0) mao.direito(abre)"], ...adOscila("ombro.direito(abre 120 frente 20) antebraco.direito(palma-baixo 0) mao.direito(abre)", 0.65, 3, 0.36, "cotovelo.direito(dobra 45)", "cotovelo.direito(dobra 80)")], { volta: true, segura: 0.2, desc: "acena (tchau / oi) e baixa a mão", tags: ["Acao/Cumprimento/Acenar"] }),
  cumprimenta: () => adAcao("cumprimentar", [[0, ""], [0.55, "ombro.direito(frente 45 abre 5) cotovelo.direito(dobra 35) antebraco.direito(palma-cima 10) mao.direito(fecha 40%) tronco(frente 6)"], ...adOscila("ombro.direito(frente 45 abre 5) cotovelo.direito(dobra 35) antebraco.direito(palma-cima 10) mao.direito(fecha 60%) tronco(frente 6)", 0.75, 3, 0.24, "punho.direito(dobra 12)", "punho.direito(levanta 12)")], { volta: true, segura: 0.15, desc: "aperto de mão", tags: ["Acao/Cumprimento/ApertoDeMao"] }),
  "abre-porta": () => adAcao("abrirPorta", [[0, ""], [0.55, "ombro.direito(frente 55) cotovelo.direito(dobra 30) mao.direito(fecha 75%) tronco(frente 8)"], [1.15, "ombro.direito(frente 25 abre 28) cotovelo.direito(dobra 85) mao.direito(fecha 75%) tronco(gira-direita 12)"]], { desc: "pega a maçaneta e puxa a porta", tags: ["Acao/Objeto/Porta"] }),
  bebe: () => adAcao("beber", [[0, ""], [0.7, "ombro.direito(frente 48 cruza 12) cotovelo.direito(dobra 132) antebraco.direito(palma-cima 20) mao.direito(fecha 70%)"], [1.0, "ombro.direito(frente 55 cruza 12) cotovelo.direito(dobra 128) antebraco.direito(palma-cima 20) mao.direito(fecha 70%) cabeca(sobe 18)"]], { volta: true, segura: 0.7, desc: "leva o copo à boca, bebe e baixa", tags: ["Acao/Comer/Beber"] }),
  le: () => adAcao("ler", [[0, ""], [0.8, "ombro.ambos(frente 40 cruza 6) cotovelo.ambos(dobra 100) antebraco.ambos(palma-cima 60) mao.ambos(fecha 35%) cabeca(baixa 25) olhos(baixo 40%)"]], { desc: "segura um livro/papel à frente e lê", tags: ["Acao/Ler"] }),
  atende: () => adAcao("atenderCelular", [[0, ""], [0.75, "ombro.direito(frente 28 abre 32) cotovelo.direito(dobra 145) antebraco.direito(palma-cima 40) mao.direito(fecha 60%) cabeca(inclina-direita 8)"]], { desc: "leva o celular ao ouvido", tags: ["Acao/Objeto/Celular"] }),
  "olha-relogio": () => adAcao("olharRelogio", [[0, ""], [0.55, "ombro.esquerdo(frente 42 cruza 12) cotovelo.esquerdo(dobra 110) antebraco.esquerdo(palma-baixo 60) cabeca(baixa 25 gira-esquerda 15) olhos(baixo 30%)"]], { volta: true, segura: 0.8, desc: "olha o relógio de pulso", tags: ["Acao/Tempo/Relogio"] }),
  "encolhe-ombros": () => adAcao("encolherOmbros", [[0, ""], [0.45, "ombro.ambos(sobe 80% abre 14) cotovelo.ambos(dobra 80) antebraco.ambos(palma-cima 85) mao.ambos(abre) cabeca(inclina-direita 8)", { rosto: "pensativo", intensidade: 0.6 }]], { volta: true, segura: 0.4, desc: "encolhe os ombros (sei lá)", tags: ["Acao/Conversa/Duvida"] }),
  chora: () => adAcao("chorar", [[0, ""], [0.7, "ombro.ambos(frente 62 cruza 16) cotovelo.ambos(dobra 140) mao.ambos(fecha 25%) cabeca(baixa 30) tronco(frente 16)", { rosto: "tristeza", intensidade: 1 }], ...adOscila("ombro.ambos(frente 62 cruza 16) cotovelo.ambos(dobra 140) mao.ambos(fecha 25%) cabeca(baixa 30) tronco(frente 16)", 0.95, 4, 0.42, "ombro.ambos(sobe 45%)", "ombro.ambos(sobe 0%)")], { desc: "mãos no rosto, soluçando", tags: ["Acao/Emocao/Chorar"] }),
  ri: () => adAcao("rir", [[0, ""], [0.35, "cabeca(sobe 14) tronco(tras 7)", { rosto: "alegria", intensidade: 1 }], ...adOscila("cabeca(sobe 14) tronco(tras 7)", 0.5, 4, 0.26, "ombro.ambos(sobe 40%)", "ombro.ambos(sobe 0%)")], { volta: true, segura: 0.1, desc: "ri (cabeça para trás, ombros sacudindo)", tags: ["Acao/Emocao/Rir"] }),
  "cai-de-joelhos": () => adAcao("cairDeJoelhos", [[0, ""], [0.7, "cabeca(baixa 22) ombro.ambos(desce 30%)", { pose: "ajoelhado", rosto: "tristeza", intensidade: 0.8 }]], { antecipa: 0, desc: "cai de joelhos, derrotado", tags: ["Acao/Emocao/Derrota"] }),
  "coca-cabeca": () => adAcao("cocarCabeca", [[0, ""], [0.5, "ombro.direito(frente 130 abre 45) cotovelo.direito(dobra 150) mao.direito(fecha 50%) cabeca(inclina-direita 8)"], ...adOscila("ombro.direito(frente 130 abre 45) cotovelo.direito(dobra 150) cabeca(inclina-direita 8)", 0.7, 3, 0.22, "mao.direito(fecha 70%)", "mao.direito(fecha 30%)")], { volta: true, segura: 0.1, desc: "coça a cabeça (sem graça / pensando)", tags: ["Acao/Conversa/Duvida"] }),
  "cruza-bracos": () => adAcao("cruzarBracos", [[0, ""], [0.7, "ombro.ambos(frente 25 abre 5 gira-dentro 65) cotovelo.ambos(dobra 115) antebraco.ambos(palma-cima 20) cabeca(sobe 5)"]], { desc: "cruza os braços (e fica)", tags: ["Acao/Atitude/Defensivo"] }),
  espreguica: () => adAcao("espreguicar", [[0, ""], [0.9, "ombro.ambos(abre 165) cotovelo.ambos(dobra 10) tronco(tras 12) cabeca(sobe 15) mao.ambos(abre)", { rosto: "alegria", intensidade: 0.3 }]], { volta: true, segura: 0.6, duracaoVolta: 0.8, desc: "espreguiça", tags: ["Acao/Corpo/Espreguicar"] }),
  boceja: () => adAcao("bocejar", [[0, ""], [0.8, "ombro.direito(frente 50 cruza 15) cotovelo.direito(dobra 135) mao.direito(abre) cabeca(sobe 18) boca(abre 90%) olhos(fecha 70%)"]], { volta: true, segura: 0.9, desc: "boceja cobrindo a boca", tags: ["Acao/Corpo/Bocejar"] }),
  comemora: () => adAcao("comemorar", [[0, ""], [0.45, "ombro.ambos(abre 150 frente 15) cotovelo.ambos(dobra 25) mao.ambos(fecha 95%) cabeca(sobe 15)", { rosto: "alegria", intensidade: 1 }]], { desc: "punhos para o alto, comemorando", tags: ["Acao/Emocao/Comemorar"] }),
  suspira: () => adAcao("suspirar", [[0, ""], [0.7, "ombro.ambos(sobe 50%) tronco(tras 4) cabeca(sobe 6)"], [1.6, "ombro.ambos(desce 30%) tronco(frente 8) cabeca(baixa 14)", { rosto: "tristeza", intensidade: 0.4 }]], { desc: "suspira e murcha", tags: ["Acao/Emocao/Suspirar"] }),
  "bate-palmas": () => adAcao("baterPalmas", [[0, ""], ...adOscila("ombro.ambos(frente 45 cruza 8) antebraco.ambos(palma-cima 0) mao.ambos(abre)", 0.35, 5, 0.3, "cotovelo.ambos(dobra 70) ombro.ambos(cruza 18)", "cotovelo.ambos(dobra 95) ombro.ambos(cruza 4)")], { volta: true, segura: 0.1, desc: "bate palmas", tags: ["Acao/Emocao/Palmas"] })
};
/* nome da biblioteca de cada ação (ex.: oferece → oferecer) */
function adAcaoPara(verbo, o = {}) { const g = AD_ACOES[verbo]; if (!g) return null; let a = g(); if (o.mao === "esquerda") a = Object.assign(pdEspelharAnim(a, { nome: a.nome + "Esq" }), { tipo: "acao", volta: a.volta }); return a; }

/* ===================== ciclos de espera ===================== */
const AD_ESPERAS = { empe: [null, "em pé esperando"], impaciente: [null, "impaciente (bate o pé, olha o relógio)"], "bracos-cruzados": ["cruza", "braços cruzados"], sentado: ["sentado", "sentado relaxado"], "sentado-inquieto": ["sentado", "sentado, inquieto"],
  deitado: ["deitadoCostas", "deitado, respirando"], guarda: ["guardaLuta", "em guarda (luta)"], "olhando-em-volta": [null, "olhando em volta"], pensando: ["pensando", "pensando"] };
function adEspera(estilo = "empe", dur = 6, o = {}) {
  if (!AD_ESPERAS[estilo]) throw new Error("Espera: " + Object.keys(AD_ESPERAS).join(", ") + ".");
  const B = pdParams({}), E0 = pdBase(), rnd = mdSorteio(String(o.semente ?? "espera") + estilo), base = Object.assign({}, E0), [pz] = AD_ESPERAS[estilo];
  if (pz === "cruza") Object.assign(base, adJuntas("ombro.ambos(frente 25 abre 5 gira-dentro 65) cotovelo.ambos(dobra 115) antebraco.ambos(palma-cima 20)", B)); else if (pz) Object.assign(base, anPoseValores(pz, B));
  const deitado = estilo === "deitado", sentado = /^sentado/.test(estilo), ch = []; let t = 0;
  const pega = l => l[Math.floor(rnd() * l.length)];
  while (t < dur) {
    const v = Object.assign({}, base), resp = Math.sin(t * 2 * Math.PI / 3.6);
    v.shElevL = (base.shElevL || 0) + 0.1 * resp; v.shElevR = (base.shElevR || 0) + 0.1 * resp; v.spineFlex = (base.spineFlex || 0) - 1.2 * resp;
    if (!deitado) { const lado = rnd() < 0.5 ? -1 : 1; v.pelvisSide = (base.pelvisSide || 0) + (sentado ? 0 : lado * (3 + rnd() * 4)); v.spineSide = (base.spineSide || 0) - lado * (sentado ? 1.5 : 3);
      if (!sentado && estilo !== "guarda") { v["kneeFlex" + (lado > 0 ? "L" : "R")] = (base["kneeFlex" + (lado > 0 ? "L" : "R")] || 0) + 6 + rnd() * 6; } }
    const olhar = estilo === "olhando-em-volta" ? 0.9 : estilo === "impaciente" ? 0.55 : 0.35;
    if (rnd() < olhar) { v.headYaw = (base.headYaw || 0) + (rnd() * 2 - 1) * (estilo === "olhando-em-volta" ? 55 : 28); v.headPitch = (base.headPitch || 0) + (rnd() * 2 - 1) * 10; v.eyeYaw = Math.sign(v.headYaw - (base.headYaw || 0)) * 0.4; }
    if (estilo === "impaciente") { if (rnd() < 0.5) { v.ankleFlexR = -15; v.toesR = -20; } if (rnd() < 0.3) Object.assign(v, adJuntas("ombro.esquerdo(frente 42 cruza 12) cotovelo.esquerdo(dobra 110) antebraco.esquerdo(palma-baixo 60) cabeca(baixa 25 gira-esquerda 15)", Object.assign({}, B, v))); }
    if (estilo === "sentado-inquieto" && rnd() < 0.5) { v.hipRotL = (base.hipRotL || 0) + (rnd() * 2 - 1) * 12; v.ankleFlexL = (base.ankleFlexL || 0) + 10; }
    if (estilo === "guarda") { v.kneeFlexL = (base.kneeFlexL || 0) + 4 * Math.sin(t * 3); v.kneeFlexR = (base.kneeFlexR || 0) + 4 * Math.sin(t * 3 + 1); }
    if (!deitado && !pz && rnd() < 0.25) { const m = pega(["L", "R"]); v["elbow" + m] = (base["elbow" + m] || 0) + 10 + rnd() * 15; v["armFlex" + m] = (base["armFlex" + m] || 0) + 5; }
    ch.push({ t: +t.toFixed(3), valores: v, curva: "suave" }); t += estilo === "guarda" ? 0.6 + rnd() * 0.4 : 1.1 + rnd() * 1.6;
  }
  ch.push({ t: +dur.toFixed(3), valores: Object.assign({}, ch[ch.length - 1].valores) });
  const ks = new Set(ch.flatMap(c => Object.keys(c.valores))); for (const c of ch) for (const k of ks) if (!(k in c.valores)) c.valores[k] = base[k] || 0;
  for (const c of ch) for (const k of Object.keys(c.valores)) if (!Number.isFinite(c.valores[k]) || /^(wx|wz|wRot|ground)$/.test(k)) delete c.valores[k];
  /* os valores valem por si (absolutos): quem está sentado continua sentado, quem está em pé fica em pé */
  return Object.assign(criarAnimacao({ nome: o.nome || "espera" + estilo.replace(/(^|-)(\w)/g, (m, a, b) => b.toUpperCase()), duracao: dur, modo: "absoluta", curva: "suave", pesFixos: true, chaves: ch, tipo: "espera", tags: ["Espera/" + estilo], descricao: "espera — " + AD_ESPERAS[estilo][1] + " (não repete igual)" }), { gerar: d => adEspera(estilo, d, o) });
}
/* tipo de cada animação da biblioteca: ação (segura no fim), ciclo (repete enquanto durar), transição, espera */
function adTipoDe(a) { if (!a) return "acao"; if (a.tipo) return a.tipo; if (a.loop) return "ciclo"; const t = (a.tags || []).join(" "); if (/Postura|Levantar|Sentar|Deitar|Agachar|Ajoelhar|Queda/.test(t)) return "transicao"; return "acao"; }
function registrarAcoesDia() { const L = {}; for (const v of Object.keys(AD_ACOES)) { const a = AD_ACOES[v](); L[a.nome] = Object.assign(a, { origem: "pronta", versao: 0 }); }
  for (const e of Object.keys(AD_ESPERAS)) { const a = adEspera(e, 8); L[a.nome] = Object.assign(a, { origem: "pronta", versao: 0 }); } return L; }
registrarProntas(registrarAcoesDia);
export { AD_ACOES, AD_ESPERAS, adAcao, adAcaoPara, adEspera, adTipoDe, adJuntas, registrarAcoesDia };
void SCN; void EXPRESSOES;
