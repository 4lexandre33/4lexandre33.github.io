/* GeoMannequin — auditor de animações: roda cada animação num plano de filme (como ela aparece no vídeo) e mede, quadro a quadro,
   se o corpo AFUNDA no chão, se o pé APOIADO ESCORREGA, e se a animação TRAVA (termina longe da pose de partida e fica lá).
   Serve de teste automático e de ferramenta (site e MCP) para achar o que precisa de conserto. Unidades: cm e cm/s. */
import { SCN } from "./modelo.js";
import { loadScene, sceneState } from "./estado.js";
import { pMundo } from "./colisoes.js";
import { capsulas } from "../engine/index.js";
import { bibliotecaAnimacoes } from "./animacao.js";
import { compilarName, videoDoFilme } from "./name-dsl.js";

const AA_M = 0.114;
/* animações em que o pé não é o apoio (nado, rolar, engatinhar, cair, deitar): não se mede o escorregar do pé */
const AA_SEM_PES = /^(nadar|mergulh|engatinh|rastej|rolar|levantarDe(Brucos|Costas)|cair(Frente|Tras|Lado)|esperaDeitado|deitar)/;
function aaMedir(nome, o = {}) {
  const lib = bibliotecaAnimacoes(), a = lib.obter(nome); if (!a) throw new Error("Animação “" + nome + "” não existe.");
  const fps = o.fps || 20, dur = Math.min(o.duracaoMax || 6, a.duracao + 1.8);
  const r = compilarName('filme "auditoria" fps ' + fps + '\nelenco\n  Kai relevante\nlocal "A" unidade m\n  chao retangulo -30,-30 a 30,30\ncena "A" local "A"\n  plano 1 duracao ' + dur.toFixed(2) + 's\n    Kai em (0,0)\n    camera plano inteiro alvo Kai\n    0s Kai anima ' + nome + "\n", { semCache: true, salvar: false });
  if (r.erros.length) return { nome, erro: r.erros[0].erro };
  const v = videoDoFilme(r, { fps, vida: false }), salvo = JSON.stringify(sceneState());
  let afunda = 0, escorrega = 0, apoiado = 0, pico = 0, prev = null, fimPose = null, iniPose = null, chao0 = null;
  const semPes = AA_SEM_PES.test(nome) || /nado|agua|rolar|queda/i.test((a.tags || []).join(" "));
  try {
    v.frames.forEach((f, i) => {
      loadScene(JSON.parse(JSON.stringify(f.estado))); const it = SCN.list.find(x => x.name === "Kai"); if (!it) return;
      const cs = capsulas(pMundo(it)), Lc = cs.caps || cs, baixo = Math.min(...Lc.map(c => Math.min(c.a[1], c.b[1]) - (c.r || 0)));
      if (chao0 === null) chao0 = baixo; /* o chão = onde a pessoa em pé encosta no quadro 0 (antes da animação) */
      const chao = chao0; afunda = Math.min(afunda, (baixo - chao) * AA_M * 100);
      const pes = Lc.filter(c => c.nome === "peE" || c.nome === "peD").map(c => ({ x: (c.a[0] + c.b[0]) / 2, z: (c.a[2] + c.b[2]) / 2, y: (Math.min(c.a[1], c.b[1]) - (c.r || 0) - chao) * AA_M * 100 }));
      if (prev && pes.length === 2 && !semPes) { const ib = pes[0].y <= pes[1].y ? 0 : 1, p = pes[ib], q = prev[ib];
        if (p.y < 2.5 && q.y < 2.5) { const d = Math.hypot(p.x - q.x, p.z - q.z) * AA_M * 100; apoiado += 1 / fps; if (d > 0.6) { escorrega += d; pico = Math.max(pico, d * fps); } } }
      prev = pes;
      const pose = Object.fromEntries(["kneeFlexL", "kneeFlexR", "hipFlexL", "hipFlexR", "armFlexL", "armFlexR", "elbowL", "elbowR", "spineFlex", "headPitch"].map(k => [k, it.params[k] || 0]));
      if (i === 0) iniPose = pose; fimPose = pose;
    });
  } finally { loadScene(JSON.parse(salvo)); }
  const difFim = iniPose && fimPose ? Math.max(...Object.keys(iniPose).map(k => Math.abs(fimPose[k] - iniPose[k]))) : 0;
  return { nome, duracao: +a.duracao.toFixed(2), afundaCm: +afunda.toFixed(1), escorregaCmS: apoiado ? +(escorrega / apoiado).toFixed(1) : 0, picoCmS: +pico.toFixed(0), terminaLonge: +difFim.toFixed(0), loop: !!a.loop, tipo: a.tipo || null };
}
/* todas (ou as escolhidas): lista com o que está fora do limite */
function auditarAnimacoes(o = {}) {
  const lib = bibliotecaAnimacoes(), nomes = o.nomes && o.nomes.length ? o.nomes : lib.listar().map(x => x.nome || x), lim = Object.assign({ afunda: -3.5, escorrega: 12 }, o.limites || {});
  const itens = nomes.map(n => { try { return aaMedir(n, o); } catch (e) { return { nome: n, erro: e.message }; } });
  /* limites próprios: mergulho é para água (no seco atravessa o chão); corrida e transições de postura toleram mais (aterrissagem e o corpo descendo) */
  const limDe = x => ({ afunda: /^mergulh/.test(x.nome) ? -99 : lim.afunda, escorrega: /^puloCorrida/.test(x.nome) ? 70 : /^(correr|passo(Frente|Tras|Lado))/.test(x.nome) ? 40 : /^(sentar|levantar|agachar|ajoelhar|defender)/.test(x.nome) ? 30 : lim.escorrega });
  itens.forEach(x => { if (!x.erro) x.limite = limDe(x); });
  const ruins = itens.filter(x => x.erro || x.afundaCm < x.limite.afunda || x.escorregaCmS > x.limite.escorrega);
  return { total: itens.length, ruins: ruins.length, limites: lim, itens, problemas: ruins.map(x => x.erro ? x.nome + ": " + x.erro : x.nome + (x.afundaCm < x.limite.afunda ? " afunda " + -x.afundaCm + " cm" : "") + (x.escorregaCmS > x.limite.escorrega ? " pé escorrega " + x.escorregaCmS + " cm/s" : "")) };
}
export { auditarAnimacoes, aaMedir };
