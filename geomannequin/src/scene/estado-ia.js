/* GeoMannequin — estado da pose para uma IA (Gemini, ChatGPT, Claude, qualquer uma).
   Descreve cada manequim em palavras e em números: o que cada controle está fazendo, para onde aponta cada braço,
   antebraço, palma, coxa e canela, o que está no chão, para onde olha, onde cada junta aparece na imagem e o
   código que reproduz a pose. Junto com o manual (manual-ia.js), a IA sabe o que ajustar para chegar no pedido.
   Convenções conferidas no próprio motor (testes/manual-ia.mjs mede cada sinal). */
import { SCN, sceneList } from "./modelo.js";
import { SL, ALIAS, POSEKEYS } from "./parametros.js";
import { POSE0 } from "./poses.js";
import { codigoDaPose } from "./pose-codigo.js";
import { pMundo } from "./colisoes.js";
import { codigoDoRosto, valoresDoRosto, expressaoParecida, GRUPOS_ROSTO } from "./rosto-codigo.js";
import { ossosDoCorpo, paraMundo, telaDoMundo, autoColisoes, W, H } from "../engine/index.js";

/* o que o valor negativo e o positivo de cada controle fazem (sem o L/R do lado) — medido no motor */
const IA_SENTIDO = {
  spineFlex: ["arqueia o tronco para trás", "curva o tronco para a frente"],
  spineSide: ["inclina o tronco para a ESQUERDA do manequim", "inclina o tronco para a DIREITA do manequim"],
  spineTwist: ["gira o peito para a DIREITA do manequim (o ombro ESQUERDO vai para a frente)", "gira o peito para a ESQUERDA do manequim (o ombro DIREITO vai para a frente)"],
  lumFlex: ["lombar: arqueia para trás", "lombar: curva para a frente"], lumSide: ["lombar: inclina para a esquerda", "lombar: inclina para a direita"], lumTwist: ["lombar: gira para a direita", "lombar: gira para a esquerda"],
  thoFlex: ["torácica: arqueia para trás", "torácica: curva para a frente"], thoSide: ["torácica: inclina para a esquerda", "torácica: inclina para a direita"], thoTwist: ["torácica: gira para a direita", "torácica: gira para a esquerda"],
  pelvisTilt: ["pelve: báscula para trás (tronco recua)", "pelve: báscula para a frente (tronco avança)"],
  pelvisSide: ["pelve: inclina (o tronco vai para a esquerda)", "pelve: inclina (o tronco vai para a direita)"],
  pelvisTwist: ["gira a pelve para a DIREITA do manequim", "gira a pelve para a ESQUERDA do manequim"],
  headYaw: ["vira o rosto para a DIREITA do manequim", "vira o rosto para a ESQUERDA do manequim"],
  headPitch: ["levanta o queixo (olha para cima)", "abaixa a cabeça (olha para baixo)"],
  headRoll: ["inclina a cabeça para o ombro ESQUERDO", "inclina a cabeça para o ombro DIREITO"],
  neckFlex: ["pescoço: estende (olha para cima)", "pescoço: flexiona (queixo para o peito)"], neckSide: ["pescoço: para a esquerda", "pescoço: para a direita"], neckTwist: ["pescoço: gira para a direita", "pescoço: gira para a esquerda"],
  shElev: ["abaixa o ombro", "eleva o ombro (encolher)"], shProt: ["leva o ombro para trás (peito aberto)", "leva o ombro para a frente"],
  shTens: ["solta a escápula", "tensiona a escápula (trapézio)"], scapRot: ["gira a escápula para baixo", "gira a escápula para cima"],
  armAbd: ["cruza o braço na frente do peito", "abre o braço para o lado (90 = horizontal, 180 = acima da cabeça)"],
  armFlex: ["leva o braço para trás", "leva o braço para a frente (90 = horizontal à frente, 180 = acima da cabeça pela frente)"],
  armRot: ["gira o braço para dentro (com o cotovelo dobrado, a mão vai para a barriga)", "gira o braço para fora (com o cotovelo dobrado, a mão vai para fora e para trás)"],
  elbow: ["", "dobra o cotovelo (0 = esticado, 90 = ângulo reto, 150 = máximo)"],
  pron: ["vira a palma para BAIXO (pronação; com o braço à frente, palma para o chão)", "vira a palma para CIMA (supinação)"],
  wrist: ["estende o punho (dorso da mão vai para o antebraço)", "flexiona o punho (palma vai para o antebraço)"],
  wristDev: ["desvia o punho para o lado do dedo mínimo", "desvia o punho para o lado do polegar"],
  handCurl: ["", "fecha a mão (0 = aberta, 1 = punho fechado)"],
  hipFlex: ["leva a coxa para trás", "leva a coxa para a frente (90 = horizontal)"],
  hipAbd: ["cruza a coxa para dentro", "abre a coxa para o lado"],
  hipRot: ["gira a coxa para dentro (joelho para dentro)", "gira a coxa para fora (joelho para fora; sentado com joelhos dobrados, cruza as pernas)"],
  kneeFlex: ["", "dobra o joelho (0 = esticado, 90 = ângulo reto, 150 = máximo)"],
  ankleFlex: ["levanta a ponta do pé", "aponta o pé (ponta para baixo, como na ponta dos pés)"],
  ankleTilt: ["vira a sola para fora", "vira a sola para dentro"],
  toes: ["levanta os dedos do pé (apoio na bola do pé)", "dobra os dedos do pé"],
  footAdd: ["ponta do pé para fora", "ponta do pé para dentro"], tibiaRot: ["gira a canela para dentro", "gira a canela para fora"],
  hallux: ["levanta o dedão do pé", "dobra o dedão do pé"],
  bodyPitch: ["inclina o corpo inteiro para trás (−90 = deitado de costas)", "inclina o corpo inteiro para a frente (90 = de bruços, 180 = de cabeça para baixo)"],
  bodyRoll: ["tomba o corpo inteiro para a ESQUERDA do manequim", "tomba o corpo inteiro para a DIREITA do manequim (90 = deitado de lado)"],
  bodyLift: ["", "levanta o corpo do chão (salto, flutuar), em unidades (o corpo tem ≈ 16,5)"]
};
const IA_LADO = k => /L$/.test(k) && !/^(fSpread|thumbOpp)/.test(k) ? "esquerdo" : /R$/.test(k) ? "direito" : "";
function iaBase(k) { const b = k.replace(/[LR]$/, ""); return IA_SENTIDO[b] ? b : null; }
const IA_ALIAS = (() => { const m = {}; Object.entries(ALIAS).forEach(([a, k]) => { if (!m[k]) m[k] = a; }); return m; })();
/* rótulo, faixa e sentido de um controle */
function iaControle(k) {
  const d = SL.find(q => q.k === k), b = iaBase(k), s = b ? IA_SENTIDO[b] : null;
  return { chave: k, nome: IA_ALIAS[k] || k, rotulo: d ? d.label : k, min: d ? d.min : null, max: d ? d.max : null, negativo: s ? s[0] : "", positivo: s ? s[1] : "" };
}
/* ---------- vetores ---------- */
const iaSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], iaAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], iaMul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const iaDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], iaCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const iaLen = a => Math.hypot(a[0], a[1], a[2]), iaNorm = a => { const l = iaLen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const iaGraus = r => Math.round(r * 180 / Math.PI);
const iaR = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
/* direção em palavras num referencial {f: frente, c: cima, e: esquerda} (do corpo ou do mundo) */
function iaDirecao(v, R) {
  const c = { frente: iaDot(v, R.f), cima: iaDot(v, R.c), esquerda: iaDot(v, R.e) };
  const partes = [];
  const add = (x, pos, neg) => { if (Math.abs(x) >= 0.35) partes.push({ p: Math.abs(x), t: x > 0 ? pos : neg }); };
  add(c.frente, "para a frente", "para trás"); add(c.cima, "para cima", "para baixo"); add(c.esquerda, "para a esquerda", "para a direita");
  partes.sort((a, b) => b.p - a.p);
  return { texto: partes.length ? partes.map(q => q.t).join(" e ") : "quase parado", frente: iaR(c.frente, 2), cima: iaR(c.cima, 2), esquerda: iaR(c.esquerda, 2) };
}
function iaVetorCamera(p0, w) { const a = telaDoMundo(p0, w); const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(e => telaDoMundo(p0, iaAdd(w, e))[2] - a[2]); return iaNorm(v); }

/* ---------- estado de um manequim ---------- */
function iaEstadoManequim(it, lst, idx, cam0) {
  const p = lst[idx].p, M = paraMundo(p), Jt = ossosDoCorpo(p).juntas, g0 = lst.chao !== undefined ? lst.chao : (lst[0].gy || 0);
  const J = (n, s = 0) => { const q = Jt.find(x => x.nome === n && x.s === s) || Jt.find(x => x.nome === n); return q ? M(q.P) : null; };
  const up = [0, 1, 0];
  /* referenciais: do mundo, da pelve e do tronco */
  const pe = J("pelve"), qE = J("quadril", 1), qD = J("quadril", -1), oE = J("ombro", 1), oD = J("ombro", -1), pesc = J("pescoço"), atlas = J("cabeça (atlas)"), rosto = J("rosto");
  const eP = iaNorm(iaSub(qE, qD)), cT = iaNorm(iaSub(pesc, pe)), eT = iaNorm(iaSub(oE, oD)), fT = iaNorm(iaCross(eT, cT)), cT2 = iaNorm(iaCross(fT, eT));
  const fP = iaNorm(iaCross(eP, cT)), Rt = { f: fT, c: cT2, e: eT };
  const fH = iaNorm([fP[0], 0, fP[2]]), eH = iaNorm(iaCross(up, fH)), Rm = { f: fH, c: up, e: eH }; /* "mundo" alinhado com a frente da pelve */
  /* postura geral */
  const incl = iaGraus(Math.acos(Math.max(-1, Math.min(1, iaDot(cT, up)))));
  const pitchT = iaGraus(Math.atan2(iaDot(cT, fH), iaDot(cT, up))), latT = iaGraus(Math.atan2(-iaDot(cT, eH), iaDot(cT, up)));
  const torcao = iaGraus(Math.atan2(iaDot(iaCross(eP, eT), up), iaDot(eP, eT)));
  const alturas = Jt.map(j => M(j.P)[1] - g0), baixo = Math.min(...alturas);
  /* o que encosta no chão: perto do ponto mais baixo (as juntas ficam dentro do corpo: o tornozelo fica ≈ 0,6 acima da sola) */
  const contatos = [], noAr = baixo > 2.2, ref = Math.max(baixo, 0.6), ehChao = (q, tol) => q && !noAr && q[1] - g0 < ref + tol;
  [["pé esquerdo", J("tornozelo", 1), 1.0], ["pé direito", J("tornozelo", -1), 1.0], ["mão esquerda", J("mão", 1), 1.4], ["mão direita", J("mão", -1), 1.4], ["joelho esquerdo", J("joelho", 1), 1.4], ["joelho direito", J("joelho", -1), 1.4], ["pelve/glúteos", pe, 3.0], ["cabeça", atlas, 1.2], ["costas (tórax)", J("coluna torácica"), 1.5]]
    .forEach(([n, q, tol]) => { if (!ehChao(q, tol)) return; if (/joelho/.test(n)) { const t = J("tornozelo", /esquerdo/.test(n) ? 1 : -1); if (t && q[1] > t[1] + 0.9) return; } contatos.push(n); });
  const hPel = pe[1] - g0, kd = Math.max(0.5, (atlas[1] - pe[1]) / 6);
  let geral = incl < 30 ? (contatos.includes("pelve/glúteos") ? "sentado no chão, tronco na vertical" : contatos.some(c => /joelho/.test(c)) ? "ajoelhado, tronco na vertical" : !noAr && hPel < 7.6 * kd ? "agachado / pernas bem dobradas, tronco na vertical" : "em pé, tronco na vertical") : incl < 65 ? "tronco bem inclinado" : incl < 115 ? "corpo na horizontal (deitado, de bruços ou de lado)" : "de cabeça para baixo";
  if (incl >= 65 && incl < 115) { const k = iaDot(fT, up); geral += k > 0.5 ? ", peito virado para cima (de costas)" : k < -0.5 ? ", peito virado para o chão (de bruços)" : ", de lado"; }
  if (noAr) geral += ", NO AR (" + iaR(baixo - 0.6) + " unidades acima do chão)";
  /* cabeça */
  const face = iaNorm(iaSub(rosto, atlas)), olhar = iaDirecao(face, Rt), camV = iaVetorCamera(cam0, atlas);
  const olhaCam = iaGraus(Math.acos(Math.max(-1, Math.min(1, iaDot(face, camV)))));
  /* braços */
  const braco = s => {
    const L = s > 0 ? "L" : "R", om = J("ombro", s), co = J("cotovelo", s), pu = J("punho", s), mo = J("mão", s), ind = J("dedo indicador", s), mi = J("dedo mínimo", s);
    const dedos = iaNorm(iaSub(mo, pu)), palma = iaNorm(iaMul(iaCross(dedos, iaNorm(iaSub(ind, mi))), s));
    const cab = J("cabeça (atlas)"), alt = iaDot(iaSub(mo, pe), Rt.c), hCab = iaDot(iaSub(cab, pe), Rt.c) + 1.2, hOmb = iaDot(iaSub(om, pe), Rt.c), hCin = iaDot(iaSub(J("coluna lombar"), pe), Rt.c);
    const nivel = alt > hCab + 0.6 ? "acima da cabeça" : alt > hOmb + 1.0 ? "na altura da cabeça" : alt > hOmb - 1.3 ? "na altura do ombro/peito" : alt > hCin - 0.6 ? "na altura da cintura" : alt > -1.2 ? "na altura do quadril" : "abaixo do quadril";
    const rel = iaSub(mo, pe), lado = iaDot(rel, Rt.e) * s;
    const curl = p["handCurl" + L], mao = curl >= 0.8 ? "punho fechado" : curl <= 0.15 ? "mão aberta" : curl >= 0.5 ? "mão quase fechada" : "mão relaxada / meio aberta";
    return {
      mao: mao + " (fechamento " + iaR(curl, 2) + ")", altura: nivel,
      posicao: { frenteDoCorpo: iaR(iaDot(rel, Rt.f)), lado: lado > 0.3 ? "do próprio lado" : lado < -0.3 ? "cruzou para o outro lado" : "no meio do corpo", alturaAcimaDaPelve: iaR(alt) },
      cotovelo: p["elbow" + L] < 12 ? "esticado" : p["elbow" + L] < 70 ? "pouco dobrado (" + Math.round(p["elbow" + L]) + "°)" : p["elbow" + L] < 115 ? "dobrado (" + Math.round(p["elbow" + L]) + "°)" : "bem dobrado (" + Math.round(p["elbow" + L]) + "°)",
      braco: iaDirecao(iaNorm(iaSub(co, om)), Rt), antebraco: iaDirecao(iaNorm(iaSub(pu, co)), Rm),
      palma: iaDirecao(palma, Rm), dedos: iaDirecao(dedos, Rm),
      noChao: ehChao(mo, 1.4)
    };
  };
  const perna = s => {
    const L = s > 0 ? "L" : "R", qu = J("quadril", s), jo = J("joelho", s), to = J("tornozelo", s), alt = to[1] - g0, rel = iaSub(to, pe);
    return { pe: ehChao(to, 1.0) ? (alt > 1.2 ? "no chão, com o calcanhar levantado" : "no chão") : "levantado (" + iaR(Math.max(0, alt - 0.6)) + " acima do chão)", tornozeloAcimaDoChao: iaR(alt),
      joelho: p["kneeFlex" + L] < 10 ? "esticado" : p["kneeFlex" + L] < 60 ? "pouco dobrado (" + Math.round(p["kneeFlex" + L]) + "°)" : p["kneeFlex" + L] < 110 ? "dobrado (" + Math.round(p["kneeFlex" + L]) + "°)" : "bem dobrado (" + Math.round(p["kneeFlex" + L]) + "°)",
      coxa: iaDirecao(iaNorm(iaSub(jo, qu)), Rm), canela: iaDirecao(iaNorm(iaSub(to, jo)), Rm),
      pePosicao: { frenteDaPelve: iaR(iaDot(rel, Rm.f)), paraFora: iaR(iaDot(rel, Rm.e) * s) },
      ponta: p["ankleFlex" + L] > 25 ? "pé apontado (ponta para baixo)" : p["ankleFlex" + L] < -8 ? "ponta do pé levantada" : "pé neutro" };
  };
  /* controles fora do neutro, com o que fazem */
  const mudados = [];
  POSEKEYS.forEach(k => { if (/^(jaw|smile|eye|brow|blush|tears|lid|cheek|nose|upperLip|mouthCorner|lipPress|pout|teethClench)/.test(k)) return; const v = p[k], z = POSE0[k] !== undefined ? POSE0[k] : 0; if (typeof v !== "number" || Math.abs(v - z) < (Math.abs(z) > 2 || /^(arm|hip|knee|elbow|ankle|spine|pelvis|head|neck|body|wrist|pron|lum|tho|toes|foot|tibia|hallux)/.test(k) ? 0.5 : 0.02)) return;
    const c = iaControle(k), b = iaBase(k), lado = IA_LADO(k); let sent = "";
    if (b) { sent = v < 0 ? c.negativo : c.positivo; if (lado && sent) sent = "(" + lado + ") " + sent; }
    mudados.push({ chave: k, nome: c.nome, valor: iaR(v, Math.abs(v) < 2 ? 2 : 0), faixa: [c.min, c.max], efeito: sent || c.rotulo }); });
  /* juntas na imagem (0 a 1 da largura/altura) */
  const naTela = {}; [["cabeca", atlas], ["peito", J("coluna torácica")], ["pelve", pe], ["maoEsq", J("mão", 1)], ["maoDir", J("mão", -1)], ["cotoveloEsq", J("cotovelo", 1)], ["cotoveloDir", J("cotovelo", -1)], ["joelhoEsq", J("joelho", 1)], ["joelhoDir", J("joelho", -1)], ["peEsq", J("tornozelo", 1)], ["peDir", J("tornozelo", -1)]]
    .forEach(([n, q]) => { if (!q) return; const t = telaDoMundo(cam0, q); naTela[n] = [iaR(t[0] / W, 3), iaR(t[1] / H, 3)]; });
  /* onde está a câmera em relação a este manequim */
  const cv = iaVetorCamera(cam0, pe), az = iaGraus(Math.atan2(iaDot(cv, eH), iaDot(cv, fH))), el = iaGraus(Math.asin(Math.max(-1, Math.min(1, cv[1]))));
  const vista = Math.abs(az) < 25 ? "de frente" : Math.abs(az) > 155 ? "de costas" : Math.abs(az) < 65 ? "3/4 pela " + (az > 0 ? "esquerda" : "direita") + " dele" : Math.abs(az) < 115 ? "de perfil (lado " + (az > 0 ? "esquerdo" : "direito") + " dele)" : "3/4 de costas pela " + (az > 0 ? "esquerda" : "direita") + " dele";
  let col = []; try { col = autoColisoes(pMundo(it)).slice(0, 8).map(c => (c.a || c[0] || "") + " × " + (c.b || c[1] || "")); } catch (e) { }
  return {
    nome: it.name, posicaoNoChao: { x: iaR(p.wx), z: iaR(p.wz) }, giroNoChao: Math.round(p.wRot || 0), ativo: SCN.list[SCN.active] === it,
    camera: { vista, azimute: az, elevacao: el, texto: "a câmera vê este manequim " + vista + (el > 25 ? ", de cima" : el < -15 ? ", de baixo" : "") },
    geral: { texto: geral, inclinacaoDoTronco: incl, troncoFrenteTras: pitchT, troncoLado: latT, torcaoPeitoSobrePelve: torcao, apoiadoEm: contatos, noAr },
    cabeca: { olhando: olhar.texto + " (em relação ao tronco)", olhandoParaCamera: olhaCam < 30, anguloAteACamera: olhaCam },
    bracoEsquerdo: braco(1), bracoDireito: braco(-1), pernaEsquerda: perna(1), pernaDireita: perna(-1),
    rosto: iaRosto(it, p),
    controles: mudados, autoColisoes: col, naImagem: naTela,
    codigo: codigoDaPose(p, { soMudancas: true })
  };
}
/* rosto: expressão de origem, a mais parecida, cada controle fora do neutro (com o que faz), olhar e código */
function iaRosto(it, p) {
  const v = valoresDoRosto(p), par = expressaoParecida(p), ctl = [];
  GRUPOS_ROSTO.forEach(([g, f]) => Object.keys(v).filter(k => f(k) && Math.abs(v[k]) > 1e-3).forEach(k => { const c = iaControle(k), b = IA_SENTIDO[k] ? k : iaBase(k), sn = b && IA_SENTIDO[b] ? IA_SENTIDO[b][v[k] < 0 ? 0 : 1] : "", lado = /L$/.test(k) ? "esquerdo" : /R$/.test(k) ? "direito" : "";
    ctl.push({ grupo: g, chave: k, nome: c.nome, valor: v[k], faixa: [c.min, c.max], efeito: (lado && sn ? "(" + lado + ") " : "") + (sn || c.rotulo) }); }));
  const ey = p.eyeYaw || 0, ep = p.eyePitch || 0;
  const olhos = Math.abs(ey) < 0.1 && Math.abs(ep) < 0.1 ? "olhos para a frente" : "olhos " + [Math.abs(ey) >= 0.1 ? (ey > 0 ? "para a esquerda dele" : "para a direita dele") : "", Math.abs(ep) >= 0.1 ? (ep > 0 ? "para cima" : "para baixo") : ""].filter(Boolean).join(" e ");
  return { expressaoDeOrigem: it.exprNome || null, parecida: par.texto, semelhanca: par.semelhanca === undefined ? 100 : par.semelhanca, olhos, cabeca: p.headModel || "v3_microgeometry",
    controles: ctl, codigo: codigoDoRosto(p, { origem: it.exprNome }) };
}
/* texto legível (Markdown) a partir do estado */
function iaTextoEstado(E) {
  const L = [];
  const lin = (t) => L.push(t);
  lin("## " + E.nome + (E.ativo ? " (manequim ativo)" : ""));
  lin("- Posição no chão: x = " + E.posicaoNoChao.x + ", z = " + E.posicaoNoChao.z + "; girado " + E.giroNoChao + "° no chão (0 = de frente para a câmera inicial, +90 = olhando para +x).");
  lin("- " + E.camera.texto + " (azimute " + E.camera.azimute + "°, elevação " + E.camera.elevacao + "°).");
  lin("- Postura: " + E.geral.texto + ". Tronco inclinado " + E.geral.inclinacaoDoTronco + "° da vertical (" + (E.geral.troncoFrenteTras >= 0 ? "para a frente " : "para trás ") + Math.abs(E.geral.troncoFrenteTras) + "°, " + (E.geral.troncoLado >= 0 ? "para a esquerda " : "para a direita ") + Math.abs(E.geral.troncoLado) + "°); peito girado " + E.geral.torcaoPeitoSobrePelve + "° sobre a pelve (+ = para a esquerda dele).");
  lin("- Apoiado em: " + (E.geral.apoiadoEm.length ? E.geral.apoiadoEm.join(", ") : "nada (solto no ar)") + ".");
  lin("- Cabeça: olhando " + E.cabeca.olhando + "; " + (E.cabeca.olhandoParaCamera ? "olha para a câmera" : "não olha para a câmera (" + E.cabeca.anguloAteACamera + "° fora)") + ".");
  for (const [n, b] of [["Braço esquerdo", E.bracoEsquerdo], ["Braço direito", E.bracoDireito]])
    lin("- " + n + ": mão " + b.altura + ", " + b.posicao.lado + ", " + (b.posicao.frenteDoCorpo >= 0 ? b.posicao.frenteDoCorpo + " à frente" : -b.posicao.frenteDoCorpo + " atrás") + " do corpo; braço (ombro→cotovelo) " + b.braco.texto + "; cotovelo " + b.cotovelo + "; antebraço " + b.antebraco.texto + "; palma virada " + b.palma.texto + "; dedos " + b.dedos.texto + "; " + b.mao + (b.noChao ? "; mão no chão" : "") + ".");
  for (const [n, q] of [["Perna esquerda", E.pernaEsquerda], ["Perna direita", E.pernaDireita]])
    lin("- " + n + ": pé " + q.pe + ", " + (q.pePosicao.frenteDaPelve >= 0 ? q.pePosicao.frenteDaPelve + " à frente" : -q.pePosicao.frenteDaPelve + " atrás") + " da pelve e " + q.pePosicao.paraFora + " para fora; coxa " + q.coxa.texto + "; joelho " + q.joelho + "; canela " + q.canela.texto + "; " + q.ponta + ".");
  lin("- Rosto: " + (E.rosto.controles.length ? "parece “" + E.rosto.parecida + "” (" + E.rosto.semelhanca + "% de semelhança)" : "neutro") + (E.rosto.expressaoDeOrigem ? "; partiu de “" + E.rosto.expressaoDeOrigem + "”" : "") + "; " + E.rosto.olhos + "; cabeça " + E.rosto.cabeca + ".");
  if (E.rosto.controles.length) { lin("  - Controles do rosto fora do neutro:"); E.rosto.controles.forEach(c => lin("    - " + c.grupo + ": " + c.nome + (c.nome !== c.chave ? " (" + c.chave + ")" : "") + " = " + c.valor + " [" + c.faixa[0] + " a " + c.faixa[1] + "] → " + c.efeito)); }
  lin("  - Código só do rosto (m.aplicarRosto(`…`) ou cola em “Código do rosto”):");
  lin("```js\n" + E.rosto.codigo.trim() + "\n```");
  if (E.autoColisoes.length) lin("- ATENÇÃO, partes atravessando: " + E.autoColisoes.join("; ") + ".");
  lin("- Controles do corpo fora do neutro (nome em português = chave interna: valor [faixa] → efeito):");
  E.controles.forEach(c => lin("  - " + c.nome + (c.nome !== c.chave ? " (" + c.chave + ")" : "") + " = " + c.valor + " [" + c.faixa[0] + " a " + c.faixa[1] + "] → " + c.efeito));
  lin("- Onde aparece na imagem (x, y de 0 a 1, a partir do canto de cima à esquerda): " + Object.entries(E.naImagem).map(([k, v]) => k + " " + v[0] + "," + v[1]).join("; ") + ".");
  lin("- Código que reproduz esta pose (aplique com cena.obter(\"" + E.nome + "\").pose({...}) ou cole no editor):");
  lin("```js\n" + E.codigo.trim() + "\n```");
  return L.join("\n");
}
/* estado da cena inteira (ou de um manequim) → { texto, json } */
function estadoParaIA(opts = {}) {
  const lst = sceneList(true), cam0 = lst[0] ? lst[0].p : null;
  if (!cam0) return { texto: "(cena vazia)", json: { manequins: [] } };
  const alvos = opts.manequim ? SCN.list.filter(it => it.name === opts.manequim || it.id === opts.manequim) : SCN.list.filter(it => !it.oculto);
  const manequins = alvos.map(it => iaEstadoManequim(it, lst, SCN.list.indexOf(it), cam0));
  /* relações entre manequins: distância e direção de um para o outro */
  const rel = [];
  for (let i = 0; i < manequins.length; i++) for (let j = 0; j < manequins.length; j++) if (i !== j) {
    const a = manequins[i], b = manequins[j], dx = b.posicaoNoChao.x - a.posicaoNoChao.x, dz = b.posicaoNoChao.z - a.posicaoNoChao.z, d = Math.hypot(dx, dz);
    const wr = a.giroNoChao * Math.PI / 180, fr = dx * Math.sin(wr) + dz * Math.cos(wr), es = dx * Math.cos(wr) - dz * Math.sin(wr);
    rel.push(a.nome + " → " + b.nome + ": " + iaR(d) + " unidades, " + (fr > 0.3 * d ? "à frente" : fr < -0.3 * d ? "atrás" : "ao lado") + (Math.abs(es) > 0.3 * d ? (es > 0 ? " e à esquerda" : " e à direita") : "") + " de " + a.nome);
  }
  const cab = "# Estado da cena (GeoMannequin)\nUnidades: o manequim padrão tem ≈ 16,5 de altura. Esquerda/direita são SEMPRE do próprio manequim (de frente para a câmera, a esquerda dele aparece à direita da imagem).\n";
  const texto = cab + (rel.length ? "\nRelações: " + rel.join("; ") + ".\n" : "") + "\n" + manequins.map(iaTextoEstado).join("\n\n");
  return { texto, json: { manequins, relacoes: rel } };
}
export { IA_SENTIDO, iaControle, estadoParaIA };
