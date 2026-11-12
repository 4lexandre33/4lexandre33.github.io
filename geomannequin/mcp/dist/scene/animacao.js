/* GeoMannequin — linguagem corporal da conversa (gestos, atitudes, fala, papéis) e ANIMAÇÃO por quadros-chave.
   - Gestos de conversa: braços e mãos por cima da pose (intensidade 0–1), com tags de função (Conversa/Explicar…).
   - Atitudes: ajustes somados (pescoço, coluna, ombros, pernas) que valem a partir de qualquer pose.
   - Fala: boca de fala (vogais) misturada com o tom (calmo, raiva, pergunta…).
   - Papéis na conversa: falante, ouvinte, cético… escolhem gesto + atitude + rosto pelas tags (sorteio pela semente).
   - Animação: chaves {t, valores (absolutos ou somados), rosto, deslocamento}; curvas; amostrar em qualquer instante;
     pés plantados no chão; encadear; biblioteca com tags, partes do corpo, versões; ~60 mini animações prontas. */
import { SCN, P, CAMK } from "./modelo.js";
import { SLK, POSEKEYS, faixa } from "./parametros.js";
import { EXPRESSOES, chaveExpressao, misturarExpressoes, doBodyPose, nomePose, todasPoses, plantarPes, limitesAcoplados } from "./poses.js";
import { withInst, apiFor } from "./comandos.js";
import { mdSorteio } from "./multidao.js";
import { aplicarGesto, GESTOS } from "../engine/index.js";

const AN_M = 1 / 0.114; /* R por metro */
/* ===================== partes do corpo (para trilhas, filtros e animações parciais) ===================== */
const AN_PARTES = {
  cabeca: ["headYaw", "headPitch", "headRoll", "neckFlex", "neckSide", "neckTwist"],
  tronco: ["spineFlex", "spineSide", "spineTwist", "lumFlex", "lumSide", "lumTwist", "thoFlex", "thoSide", "thoTwist", "pelvisTilt", "pelvisSide", "pelvisTwist"],
  ombros: ["shElevL", "shElevR", "shProtL", "shProtR", "shTension"],
  bracoDireito: ["armAbdR", "armFlexR", "armRotR", "elbowR", "pronR", "wristR", "wristDevR"],
  bracoEsquerdo: ["armAbdL", "armFlexL", "armRotL", "elbowL", "pronL", "wristL", "wristDevL"],
  maoDireita: ["handCurlR", "fThR", "fInR", "fMeR", "fAnR", "fMiR", "fSpreadR", "thumbOppR"],
  maoEsquerda: ["handCurlL", "fThL", "fInL", "fMeL", "fAnL", "fMiL", "fSpreadL", "thumbOppL"],
  pernaDireita: ["hipFlexR", "hipAbdR", "hipRotR", "kneeFlexR", "ankleFlexR", "ankleTiltR", "toesR"],
  pernaEsquerda: ["hipFlexL", "hipAbdL", "hipRotL", "kneeFlexL", "ankleFlexL", "ankleTiltL", "toesL"],
  rosto: ["jawOpen", "jawSide", "smile", "eyeYaw", "eyePitch", "eyeLid", "browUp", "browIn", "blush", "tears", "eyeFocus"],
  corpo: ["bodyPitch", "bodyRoll", "bodyLift", "ground"],
  lugar: ["wx", "wz", "wRot"]
};
/* os parâmetros da câmera moram junto com os do manequim ativo: nunca copiar a câmera junto com a pose */
const anSemCamera = o => { const r = Object.assign({}, o); CAMK.forEach(k => delete r[k]); return r; };
const AN_DE_PARTE = {}; for (const [p, ks] of Object.entries(AN_PARTES)) ks.forEach(k => { AN_DE_PARTE[k] = p; });
const anNorm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_\s]+/g, "-");
const anClamp = (k, v, flex) => { const [a, b] = faixa(k, flex); return Math.max(a, Math.min(b, v)); };
function anSet(Q, k, v) { if (!Number.isFinite(v)) return; Q[k] = SLK[k] ? anClamp(k, v, Q.flex) : v; }
/* lado "direito" = R do manequim; "ambas" = os dois (espelhado) */
const anLados = l => { const n = anNorm(l || "direita"); return /amb|duas|os-dois|both/.test(n) ? ["R", "L"] : /esq|left|^l$/.test(n) ? ["L"] : ["R"]; };

/* ===================== gestos de conversa (braço + mão) ===================== */
/* valores do lado (sem o L/R no fim); "ambas": os dois braços; "outro": o braço do outro lado (opcional) */
const GESTOS_CONVERSA = {
  explicar: { tag: "Conversa/Explicar", ambas: true, v: { armFlex: 30, armAbd: 12, armRot: 5, elbow: 80, pron: 75, wrist: -10 }, mao: "aberta", desc: "palmas abertas à frente, como quem mostra" },
  oferecer: { tag: "Conversa/Explicar", v: { armFlex: 40, armAbd: 15, armRot: 15, elbow: 40, pron: 80, wrist: -15 }, mao: "aberta", desc: "uma palma para cima, oferecendo a ideia" },
  enfatizar: { tag: "Conversa/Enfatizar", v: { armFlex: 45, armAbd: 8, armRot: -5, elbow: 100, pron: 0 }, mao: "punho", desc: "punho à frente, batendo a ideia" },
  contarDedos: { tag: "Conversa/Explicar", v: { armFlex: 30, armAbd: 5, armRot: -25, elbow: 105, pron: 30 }, mao: "paz", outro: { v: { armFlex: 28, armAbd: 5, armRot: -30, elbow: 100, pron: 20 }, mao: "apontar" }, desc: "conta nos dedos" },
  apontar: { tag: "Conversa/Apontar", v: { armFlex: 85, armAbd: 12, armRot: 0, elbow: 5, pron: 70 }, mao: "apontar", desc: "aponta para frente" },
  dedoEmRiste: { tag: "Conversa/Discordar", v: { armFlex: 45, armAbd: 10, armRot: 10, elbow: 115, pron: 0, wrist: 0 }, mao: "apontar", desc: "dedo em riste (bronca, aviso)" },
  negarComMao: { tag: "Conversa/Discordar", v: { armFlex: 55, armAbd: 0, armRot: -10, elbow: 50, pron: 0, wrist: -60 }, mao: "espalmada", desc: "palma para frente: pare, não" },
  maoNoPeito: { tag: "Conversa/Sincero", v: { armFlex: 25, armAbd: 0, armRot: -60, elbow: 115, pron: 10 }, mao: "espalmada", desc: "mão no peito (sinceridade, eu)" },
  encolherOmbros: { tag: "Conversa/Duvida", ambas: true, v: { armFlex: 10, armAbd: 20, armRot: 30, elbow: 90, pron: 85, wrist: -15 }, mao: "aberta", soma: { shElevL: 0.8, shElevR: 0.8, headRoll: 8 }, desc: "encolhe os ombros, palmas para cima" },
  maoNoQueixo: { tag: "Conversa/Pensar", v: { armFlex: 30, armAbd: -10, armRot: -35, elbow: 150, pron: 60, wrist: 15 }, mao: "relaxada", outro: { v: { armFlex: 20, armAbd: -10, armRot: -55, elbow: 105, pron: 30 }, mao: "relaxada" }, soma: { headPitch: 6 }, desc: "mão no queixo, pensando" },
  bracosCruzados: { tag: "Conversa/Defensivo", ambas: true, v: { armFlex: 25, armAbd: 5, armRot: -65, elbow: 115, pron: 20 }, mao: "relaxada", desc: "braços cruzados" },
  maosNaCintura: { tag: "Conversa/Desafio", ambas: true, v: { armFlex: -21, armAbd: 37, armRot: -70, elbow: 106, pron: 40, wrist: -35 }, mao: "punho", desc: "mãos na cintura" },
  maosNoAr: { tag: "Conversa/Indignacao", ambas: true, v: { armFlex: 60, armAbd: 50, armRot: 20, elbow: 30, pron: 60 }, mao: "aberta", desc: "mãos para o alto (indignação, comemoração)" },
  maoNaNuca: { tag: "Conversa/Vergonha", v: { armFlex: 120, armAbd: 55, armRot: 20, elbow: 145, pron: 0 }, mao: "relaxada", soma: { headPitch: 10 }, desc: "mão na nuca (sem graça)" },
  cocarCabeca: { tag: "Conversa/Duvida", v: { armFlex: 130, armAbd: 45, armRot: 25, elbow: 150, pron: 0 }, mao: "garra", soma: { headRoll: 8 }, desc: "coça a cabeça" },
  maosJuntas: { tag: "Conversa/Suplica", ambas: true, v: { armFlex: 40, armAbd: -12, armRot: -30, elbow: 80, pron: -5 }, mao: "espalmada", desc: "mãos juntas (pedido, súplica)" },
  segurarCabeca: { tag: "Conversa/Desespero", ambas: true, v: { armFlex: 125, armAbd: 40, armRot: 30, elbow: 148, pron: 0 }, mao: "aberta", soma: { headPitch: 12 }, desc: "segura a cabeça (desespero)" },
  acenar: { tag: "Conversa/Cumprimento", v: { armFlex: 30, armAbd: 110, armRot: 60, elbow: 85, pron: 0, wrist: -10 }, mao: "acenar", desc: "acena" },
  joinha: { tag: "Conversa/Concordar", v: { armFlex: 35, armAbd: 10, armRot: -10, elbow: 95, pron: 0 }, mao: "joinha", desc: "joinha" },
  bracosAbertos: { tag: "Conversa/Acolher", ambas: true, v: { armFlex: 30, armAbd: 60, armRot: 0, elbow: 25, pron: 70 }, mao: "aberta", desc: "braços abertos (acolher, mostrar tudo)" },
  repouso: { tag: "Conversa/Neutro", ambas: true, v: { armFlex: 5, armAbd: 8, armRot: 0, elbow: 12, pron: 0, wrist: 0 }, mao: "relaxada", desc: "braços soltos" }
};
function aplicarGestoConversa(it, nome, o = {}) {
  const k = Object.keys(GESTOS_CONVERSA).find(x => anNorm(x) === anNorm(nome)); if (!k) throw new Error("Gesto de conversa “" + nome + "” não existe. Opções: " + Object.keys(GESTOS_CONVERSA).join(", ") + ".");
  const g = GESTOS_CONVERSA[k], I = Math.max(0, Math.min(1.2, o.intensidade ?? 1)), Q = it.params;
  const lados = g.ambas ? ["R", "L"] : anLados(o.mao || o.lado || "direita"), outro = lados.length === 1 ? (lados[0] === "R" ? "L" : "R") : null;
  const poe = (L, def) => { for (const [kk, v] of Object.entries(def.v)) { const key = kk + L; anSet(Q, key, (Q[key] || 0) + (v - (Q[key] || 0)) * I); } if (def.mao && GESTOS[def.mao] && I >= 0.4) aplicarGesto(Q, L === "L" ? 1 : -1, def.mao); };
  lados.forEach(L => poe(L, g)); if (outro && g.outro) poe(outro, g.outro);
  if (g.soma) for (const [kk, v] of Object.entries(g.soma)) anSet(Q, kk, (Q[kk] || 0) + v * I);
  it.gestoNome = k; return { gesto: k, tag: g.tag, lados };
}

/* ===================== atitudes (somadas à pose) ===================== */
const ATITUDES = {
  cabecaInclinada: { tag: "Atitude/Duvida", v: { headRoll: 14, neckSide: 8 }, desc: "cabeça inclinada (dúvida, interesse)" },
  cabecaBaixa: { tag: "Atitude/Tristeza", v: { headPitch: 22, neckFlex: 14 }, desc: "cabeça baixa (tristeza, vergonha, submissão)" },
  queixoErguido: { tag: "Atitude/Orgulho", v: { headPitch: -14, neckFlex: -6 }, desc: "queixo erguido (orgulho, desafio)" },
  troncoAFrente: { tag: "Atitude/Interesse", v: { spineFlex: 22, thoFlex: 6, headPitch: -12 }, desc: "tronco inclinado para frente (interesse, ameaça)" },
  troncoParaTras: { tag: "Atitude/Recuo", v: { spineFlex: -15, headPitch: 8 }, desc: "tronco para trás (recuo, desconfiança)" },
  inclinadoDeLado: { tag: "Atitude/Relaxado", v: { spineSide: 9, headRoll: -5 }, desc: "inclinado para um lado" },
  ombrosCaidos: { tag: "Atitude/Tristeza", v: { shElevL: -0.7, shElevR: -0.7, spineFlex: 9, headPitch: 10 }, desc: "ombros caídos (cansaço, derrota)" },
  ombrosTensos: { tag: "Atitude/Tensao", v: { shElevL: 0.6, shElevR: 0.6, shProtL: 0.3, shProtR: 0.3 }, desc: "ombros tensos, encolhidos" },
  pesoNaPernaDireita: { tag: "Atitude/Relaxado", v: { pelvisSide: -6, spineSide: 4, kneeFlexL: 16, hipFlexL: 8, hipAbdR: 3 }, plantar: true, desc: "peso na perna direita, a esquerda solta" },
  pesoNaPernaEsquerda: { tag: "Atitude/Relaxado", v: { pelvisSide: 6, spineSide: -4, kneeFlexR: 16, hipFlexR: 8, hipAbdL: 3 }, plantar: true, desc: "peso na perna esquerda, a direita solta" },
  joelhoDobrado: { tag: "Atitude/Relaxado", v: { kneeFlexR: 14, hipFlexR: 7 }, plantar: true, desc: "um joelho levemente dobrado" },
  peVirado: { tag: "Atitude/Timidez", v: { hipRotR: 18, footAddR: 15, kneeFlexR: 10 }, plantar: true, desc: "ponta do pé virada para dentro (timidez)" },
  pernasAfastadas: { tag: "Atitude/Firmeza", v: { hipAbdL: 9, hipAbdR: 9 }, plantar: true, desc: "pernas afastadas (firmeza)" },
  encolhido: { tag: "Atitude/Medo", v: { spineFlex: 16, shElevL: 0.5, shElevR: 0.5, headPitch: 12, kneeFlexL: 10, kneeFlexR: 10 }, plantar: true, desc: "encolhido (medo, frio)" },
  peito: { tag: "Atitude/Confianca", v: { spineFlex: -6, thoFlex: -6, shProtL: -0.4, shProtR: -0.4, headPitch: -5 }, desc: "peito aberto (confiança)" }
};
function aplicarAtitude(it, nome, o = {}) {
  const k = Object.keys(ATITUDES).find(x => anNorm(x) === anNorm(nome)); if (!k) throw new Error("Atitude “" + nome + "” não existe. Opções: " + Object.keys(ATITUDES).join(", ") + ".");
  const a = ATITUDES[k], I = Math.max(0, Math.min(1.5, o.intensidade ?? 1)), Q = it.params;
  for (const [kk, v] of Object.entries(a.v)) anSet(Q, kk, (Q[kk] || 0) + v * I);
  if (a.plantar && !Q.bodyLift) try { plantarPes(Q, 0); } catch (e) { }
  (it.atitudes = it.atitudes || []).push(k); return { atitude: k, tag: a.tag };
}
/* ajustes finos: "pescoco inclina 15", "coluna lado 5", "pe direito 15cm para direita"… (graus ou cm) */
function ajusteFino(it, parte, op, valor, dir) {
  const Q = it.params, p = anNorm(parte), o = anNorm(op), v = +valor || 0, perna = 0.86 * AN_M * (Q.tamanho || 1) * (Q.legLen || 1);
  const soma = (k, d) => anSet(Q, k, (Q[k] || 0) + d), deg = cm => Math.atan2(cm / 100 * AN_M, perna) * 180 / Math.PI;
  if (/^(pescoco|cabeca)$/.test(p)) { if (o === "inclina" || o === "lado") { soma("headRoll", v * 0.6); soma("neckSide", v * 0.4); } else if (o === "abaixa") { soma("headPitch", v * 0.6); soma("neckFlex", v * 0.4); } else if (o === "levanta" || o === "ergue") { soma("headPitch", -v * 0.6); soma("neckFlex", -v * 0.4); } else if (o === "gira") { soma("headYaw", v); } else throw new Error(parte + ": use inclina, abaixa, levanta ou gira."); }
  else if (/^(coluna|tronco)$/.test(p)) { if (o === "inclina" || o === "abaixa" || o === "flexiona") soma("spineFlex", v); else if (o === "estende" || o === "levanta") soma("spineFlex", -v); else if (o === "lado") soma("spineSide", v); else if (o === "torce" || o === "gira") soma("spineTwist", v); else throw new Error(parte + ": use inclina, estende, lado ou torce."); }
  else if (/^ombros?$/.test(p)) { const d = (o === "caidos" || o === "abaixa" ? -1 : 1) * (v || 0.5); soma("shElevL", d); soma("shElevR", d); }
  else if (/^ombro-(direito|esquerdo)$/.test(p)) { const L = /dir/.test(p) ? "R" : "L"; soma("shElev" + L, (o === "abaixa" || o === "caido" ? -1 : 1) * (v || 0.5)); }
  else if (/^perna-(direita|esquerda)$/.test(p)) { const L = /dir/.test(p) ? "R" : "L"; if (o === "afasta") soma("hipAbd" + L, deg(v)); else if (o === "junta") soma("hipAbd" + L, -deg(v)); else if (o === "joelho") soma("kneeFlex" + L, v); else if (o === "frente") soma("hipFlex" + L, deg(v)); else if (o === "tras") soma("hipFlex" + L, -deg(v)); else if (o === "gira") soma("hipRot" + L, v); else throw new Error(parte + ": use afasta, junta, joelho, frente, tras ou gira."); if (!Q.bodyLift) { if (o === "joelho") try { plantarPes(Q, 0, { so: L === "L" ? 1 : -1 }); } catch (e) { } else Q.ground = 1; } }
  else if (/^pe-(direito|esquerdo)$/.test(p)) { const L = /dir/.test(p) ? "R" : "L", d = anNorm(dir || o); const cm = v;
    if (/direita|esquerda/.test(d)) { const paraFora = (L === "R") === /direita/.test(d); soma("hipAbd" + L, (paraFora ? 1 : -1) * deg(cm)); }
    else if (/frente/.test(d)) soma("hipFlex" + L, deg(cm)); else if (/tras/.test(d)) soma("hipFlex" + L, -deg(cm)); else if (/gira|vira/.test(d)) soma("hipRot" + L, cm);
    else throw new Error("pé: use “pe direito 15cm para direita|esquerda|frente|tras”.");
    /* o corpo desce/sobe sozinho até o pé mais baixo tocar o chão (sem puxar o pé de volta) */
    if (!Q.bodyLift) Q.ground = 1; }
  else if (/^braco-(direito|esquerdo)$/.test(p)) { const L = /dir/.test(p) ? "R" : "L"; const m = { levanta: "armFlex", abre: "armAbd", gira: "armRot", cotovelo: "elbow", punho: "wrist" }[o]; if (!m) throw new Error(parte + ": use levanta, abre, gira, cotovelo ou punho."); soma(m + L, v); }
  else throw new Error("Ajuste: partes pescoco, coluna, ombros, ombro direito/esquerdo, perna direita/esquerda, pe direito/esquerdo, braco direito/esquerdo.");
  limitesAcoplados(Q); return true;
}

/* ===================== fala e tom ===================== */
const TONS_FALA = {
  calmo: { tag: "Fala/Calma", expr: { neutra: 1 }, int: 0.6, boca: 0.28 }, alegre: { tag: "Fala/Alegre", expr: { alegria: 1 }, int: 0.6, boca: 0.35 },
  raiva: { tag: "Fala/Raiva", expr: { raiva: 1 }, int: 0.8, boca: 0.45 }, triste: { tag: "Fala/Triste", expr: { tristeza: 1 }, int: 0.7, boca: 0.22 },
  pergunta: { tag: "Fala/Pergunta", expr: { surpresa: 1 }, int: 0.35, boca: 0.3, soma: { browUp: 0.3 } }, grito: { tag: "Fala/Grito", expr: { grito: 1 }, int: 1, boca: 0.85 },
  sussurro: { tag: "Fala/Sussurro", expr: { neutra: 1 }, int: 0.5, boca: 0.1 }, explicando: { tag: "Fala/Explicar", expr: { determinacao: 1 }, int: 0.35, boca: 0.32 },
  preocupado: { tag: "Fala/Preocupacao", expr: { medo: 1 }, int: 0.45, boca: 0.25 }, ironico: { tag: "Fala/Ironia", expr: { malicia: 1 }, int: 0.6, boca: 0.25 },
  tenso: { tag: "Fala/Tensao", expr: { desconfianca: 1 }, int: 0.6, boca: 0.3 }, carinhoso: { tag: "Fala/Carinho", expr: { alegria: 1 }, int: 0.35, boca: 0.22 }
};
const VISEMAS = { a: 1, e: 0.65, i: 0.4, o: 0.8, u: 0.5, m: 0, b: 0, p: 0, " ": 0.2 };
/* abre a boca da fala; "fase" escolhe a vogal do texto (para animar a fala) */
function falar(it, tom, texto, fase) {
  const t = TONS_FALA[anNorm(tom || "calmo")] || TONS_FALA.calmo, Q = it.params, ex = Object.keys(t.expr)[0];
  const k = chaveExpressao(ex); if (k && EXPRESSOES[k]) Object.assign(Q, misturarExpressoes({ [k]: 1 }, t.int));
  if (t.soma) for (const [kk, v] of Object.entries(t.soma)) anSet(Q, kk, (Q[kk] || 0) + v);
  const letras = anNorm(texto || "a").replace(/[^a-z ]/g, ""), c = letras[Math.abs(Math.round(fase || 0)) % Math.max(1, letras.length)] || "a", v = VISEMAS[c] ?? 0.35;
  anSet(Q, "jawOpen", Math.max(0.04, t.boca * (0.35 + 0.65 * v)));
  it.exprNome = "falando (" + (Object.keys(TONS_FALA).find(x => TONS_FALA[x] === t)) + ")"; return { tom: t.tag };
}

/* ===================== papéis na conversa ===================== */
const PAPEIS_CONVERSA = {
  falante: { gestos: ["explicar", "oferecer", "enfatizar", "contarDedos", "apontar"], atitudes: ["troncoAFrente", "cabecaInclinada", null], tom: "explicando", fala: true },
  explicando: { gestos: ["explicar", "contarDedos", "oferecer"], atitudes: ["troncoAFrente", null], tom: "explicando", fala: true },
  ouvinte: { gestos: [null, "maoNoQueixo", "repouso"], atitudes: ["cabecaInclinada", "pesoNaPernaDireita", "pesoNaPernaEsquerda"], expr: ["neutra", "pensativo"] },
  ouvinteCetico: { gestos: ["bracosCruzados", "maoNoQueixo"], atitudes: ["troncoParaTras", "queixoErguido", "pesoNaPernaEsquerda"], expr: ["desconfianca"] },
  interrompendo: { gestos: ["negarComMao", "dedoEmRiste"], atitudes: ["troncoAFrente"], tom: "pergunta", fala: true },
  discutindo: { gestos: ["enfatizar", "maosNoAr", "dedoEmRiste"], atitudes: ["troncoAFrente", "ombrosTensos"], tom: "raiva", fala: true },
  consolando: { gestos: ["oferecer", "maoNoPeito"], atitudes: ["cabecaInclinada", "troncoAFrente"], tom: "carinhoso", fala: true },
  perguntando: { gestos: ["encolherOmbros", "oferecer"], atitudes: ["cabecaInclinada"], tom: "pergunta", fala: true },
  concordando: { gestos: [null, "joinha"], atitudes: ["cabecaBaixa"], expr: ["alegria"], intAtitude: 0.35 },
  discordando: { gestos: ["negarComMao", "bracosCruzados"], atitudes: ["troncoParaTras", "queixoErguido"], expr: ["desprezo", "desconfianca"] },
  envergonhado: { gestos: ["maoNaNuca"], atitudes: ["cabecaBaixa", "peVirado"], expr: ["vergonha"] },
  pensando: { gestos: ["maoNoQueixo", "cocarCabeca"], atitudes: ["cabecaInclinada"], expr: ["pensativo"] },
  ameacando: { gestos: ["dedoEmRiste", "enfatizar"], atitudes: ["troncoAFrente", "queixoErguido"], tom: "raiva", fala: true },
  assustado: { gestos: ["maosJuntas", "negarComMao"], atitudes: ["encolhido", "troncoParaTras"], expr: ["medo"] },
  desesperado: { gestos: ["segurarCabeca"], atitudes: ["ombrosCaidos"], tom: "grito", fala: true }
};
function aplicarPapel(it, papel, o = {}) {
  const k = Object.keys(PAPEIS_CONVERSA).find(x => anNorm(x) === anNorm(papel)); if (!k) throw new Error("Papel na conversa “" + papel + "” não existe. Opções: " + Object.keys(PAPEIS_CONVERSA).join(", ") + ".");
  const pp = PAPEIS_CONVERSA[k], rnd = mdSorteio(String(o.semente ?? it.name) + k), pega = l => l[Math.floor(rnd() * l.length)], out = { papel: k };
  const at = o.atitude || pega(pp.atitudes); if (at) { aplicarAtitude(it, at, { intensidade: pp.intAtitude ?? 0.8 }); out.atitude = at; }
  const g = o.gesto || pega(pp.gestos); if (g) { aplicarGestoConversa(it, g, { intensidade: o.intensidade ?? 0.9, mao: rnd() < 0.7 ? "direita" : "esquerda" }); out.gesto = g; }
  if (pp.fala || o.fala) { falar(it, o.tom || pp.tom, o.texto || "", rnd() * 10); out.tom = o.tom || pp.tom; }
  else if (pp.expr) { const ex = pega(pp.expr); try { apiFor(it).expressao(ex, 0.8); } catch (e) { } out.expressao = ex; }
  return out;
}

/* ===================== animação ===================== */
const CURVAS = {
  linear: t => t, suave: t => t * t * (3 - 2 * t), entrada: t => t * t, saida: t => 1 - (1 - t) * (1 - t),
  segurar: t => (t < 1 ? 0 : 1), mola: t => { const c = 1.70158, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; }, rapida: t => 1 - Math.pow(1 - t, 3)
};
/* a pose (parâmetros) de uma pose pronta, sem mexer em ninguém */
function anPoseValores(nome, base) {
  const ok = todasPoses(), k = nomePose(nome); if (!ok.includes(k)) throw new Error("Pose “" + nome + "” não existe.");
  const tmp = { params: Object.assign({}, base || SCN.list[0].params) }; withInst(tmp, () => doBodyPose(k)); const out = {}; POSEKEYS.forEach(kk => { if (Number.isFinite(tmp.params[kk])) out[kk] = tmp.params[kk]; }); return out;
}
/* {nome, duracao, fps, modo: "absoluta"|"relativa", curva, pesFixos, loop, chaves:[{t, valores, rosto:{expressao,intensidade}|null, fala, mover:{frente, lado, giro}, curva}], tags, partes, descricao} */
function criarAnimacao(o) {
  const a = Object.assign({ nome: "animação", duracao: 1, fps: 12, modo: "absoluta", curva: "suave", pesFixos: true, loop: false, tags: [], descricao: "" }, o);
  a.chaves = (a.chaves || []).map(c => Object.assign({ t: 0, valores: {} }, c)).sort((x, y) => x.t - y.t);
  if (!a.chaves.length) throw new Error("A animação precisa de pelo menos uma chave.");
  a.duracao = Math.max(a.duracao, a.chaves[a.chaves.length - 1].t);
  a.partes = a.partes && a.partes.length ? a.partes : [...new Set(a.chaves.flatMap(c => Object.keys(c.valores).map(k => AN_DE_PARTE[k]).concat(c.rosto || c.fala ? ["rosto"] : []).concat(c.mover ? ["lugar"] : []).filter(Boolean)))];
  return a;
}
/* valores no instante t (só as chaves que a animação mexe); base = parâmetros do começo */
function amostrar(a, t, base) {
  const tt = a.loop ? ((t % a.duracao) + a.duracao) % a.duracao : Math.max(0, Math.min(a.duracao, t)), ch = a.chaves, out = {}, rel = a.modo === "relativa";
  const chavesUsadas = new Set(ch.flatMap(c => Object.keys(c.valores)));
  for (const k of chavesUsadas) {
    /* a chave anterior e a seguinte que têm este parâmetro */
    let i0 = -1, i1 = -1; for (let i = 0; i < ch.length; i++) if (k in ch[i].valores) { if (ch[i].t <= tt) i0 = i; else if (i1 < 0) i1 = i; }
    const v0 = i0 >= 0 ? ch[i0].valores[k] : (rel ? 0 : base[k] || 0), t0 = i0 >= 0 ? ch[i0].t : 0;
    let v; if (i1 < 0) v = v0; else { const v1 = ch[i1].valores[k], c = CURVAS[(i0 >= 0 && ch[i0].curva) || a.curva] || CURVAS.suave, u = c((tt - t0) / Math.max(1e-6, ch[i1].t - t0)); v = v0 + (v1 - v0) * u; }
    out[k] = rel ? (base[k] || 0) + v : v;
  }
  /* deslocamento no chão (frente/lado em metros, giro em graus, a partir da direção do começo) */
  let mv = null; if (ch.some(c => c.mover)) { const pega = f => { let i0 = -1, i1 = -1; for (let i = 0; i < ch.length; i++) if (ch[i].mover) { if (ch[i].t <= tt) i0 = i; else if (i1 < 0) i1 = i; }
      const m0 = i0 >= 0 ? ch[i0].mover : { frente: 0, lado: 0, giro: 0 }, t0 = i0 >= 0 ? ch[i0].t : 0; if (i1 < 0) return m0[f] || 0; const u = (CURVAS[a.curva] || CURVAS.suave)((tt - t0) / Math.max(1e-6, ch[i1].t - t0)); return (m0[f] || 0) + ((ch[i1].mover[f] || 0) - (m0[f] || 0)) * u; };
    mv = { frente: pega("frente"), lado: pega("lado"), giro: pega("giro") }; }
  /* rosto: a expressão da chave anterior, misturada com a seguinte */
  let rosto = null; { let i0 = -1, i1 = -1; for (let i = 0; i < ch.length; i++) if (ch[i].rosto) { if (ch[i].t <= tt) i0 = i; else if (i1 < 0) i1 = i; }
    if (i0 >= 0 || i1 >= 0) { const a0 = i0 >= 0 ? ch[i0].rosto : null, a1 = i1 >= 0 ? ch[i1].rosto : null, u = a0 && a1 ? (CURVAS.suave)((tt - ch[i0].t) / Math.max(1e-6, ch[i1].t - ch[i0].t)) : a0 ? 0 : 1; rosto = { a: a0, b: a1, u }; } }
  let fala = null; for (const c of ch) if (c.fala && c.t <= tt) fala = c.fala;
  return { valores: out, mover: mv, rosto, fala, t: tt };
}
/* põe o manequim no instante t (base = foto do começo, guardada pela primeira chamada) */
function aplicarAnimacao(it, a, t, o = {}) {
  const base = o.base || it._animBase || (it._animBase = { params: Object.assign({}, it.params) }).params, Q = it.params, s = amostrar(a, t, base.params || base);
  const B = base.params || base;
  /* rosto primeiro (as chaves de rosto do próprio "valores" ganham depois) */
  if (s.rosto) { const pesos = {}; if (s.rosto.a) pesos[chaveExpressao(s.rosto.a.expressao) || "neutra"] = (1 - s.rosto.u); if (s.rosto.b) pesos[chaveExpressao(s.rosto.b.expressao) || "neutra"] = (pesos[chaveExpressao(s.rosto.b.expressao) || "neutra"] || 0) + s.rosto.u;
    try { Object.assign(Q, misturarExpressoes(pesos, (s.rosto.a && s.rosto.a.intensidade) || (s.rosto.b && s.rosto.b.intensidade) || 1)); } catch (e) { } }
  for (const [k, v] of Object.entries(s.valores)) { if (k === "wx" || k === "wz" || k === "wRot") Q[k] = v; else anSet(Q, k, v); }
  if (s.fala) falar(it, s.fala.tom, s.fala.texto, Math.floor(s.t * 8));
  if (s.mover) { const g = (B.wRot || 0) * Math.PI / 180, f = [Math.sin(g), Math.cos(g)], d = [f[1], -f[0]]; Q.wx = (B.wx || 0) + (f[0] * s.mover.frente + d[0] * s.mover.lado) * AN_M; Q.wz = (B.wz || 0) + (f[1] * s.mover.frente + d[1] * s.mover.lado) * AN_M; Q.wRot = (B.wRot || 0) + s.mover.giro; }
  limitesAcoplados(Q);
  if (a.pesFixos && !Q.bodyLift && !/salto|pulo|voo/i.test((a.tags || []).join(" "))) { Q.ground = 1; }
  return s;
}
/* animação de uma pose para outra (ou de várias), com rosto opcional */
function animacaoDePoses(poses, o = {}) {
  const base = o.base || SCN.list[0].params, d = o.duracao || 1, n = poses.length;
  const chaves = poses.map((p, i) => { const pz = typeof p === "string" ? { pose: p } : p; const vals = pz.valores || anPoseValores(pz.pose, base); return { t: n > 1 ? d * i / (n - 1) : 0, valores: vals, rosto: pz.expressao ? { expressao: pz.expressao, intensidade: pz.intensidade || 1 } : null, curva: pz.curva }; });
  return criarAnimacao(Object.assign({ nome: o.nome || poses.map(p => typeof p === "string" ? p : p.pose).join(" → "), duracao: d, chaves, tags: o.tags || [] }, o.extra || {}));
}
/* uma animação a partir de duas fotos de parâmetros (antes → depois), só com o que mudou */
function animacaoDeFotos(antes, depois, o = {}) {
  const v0 = {}, v1 = {}; for (const k of Object.keys(depois)) { if (!(POSEKEYS.has(k) || AN_DE_PARTE[k]) || !Number.isFinite(depois[k])) continue; if (Math.abs((depois[k] || 0) - (antes[k] || 0)) > 1e-3) { v0[k] = o.relativa ? 0 : antes[k] || 0; v1[k] = o.relativa ? depois[k] - (antes[k] || 0) : depois[k]; } }
  return criarAnimacao({ nome: o.nome || "ajuste", duracao: o.duracao || 0.5, modo: o.relativa ? "relativa" : "absoluta", chaves: [{ t: 0, valores: v0 }, { t: o.duracao || 0.5, valores: v1 }], tags: o.tags || [] });
}
/* encadear: A depois B (B começa de onde A terminou, com transição) */
function encadear(lista, o = {}) {
  let t = 0; const chaves = [], tr = o.transicao ?? 0.15;
  lista.forEach((a, i) => { a.chaves.forEach(c => { if (a.modo === "relativa") chaves.push(Object.assign({}, c, { t: t + c.t, valores: c.valores, _rel: true })); else chaves.push(Object.assign({}, c, { t: t + c.t + (i && c.t === 0 ? tr : 0) })); }); t += a.duracao + (i < lista.length - 1 ? tr : 0); });
  const rel = lista.every(a => a.modo === "relativa");
  return criarAnimacao({ nome: o.nome || lista.map(a => a.nome).join(" + "), duracao: t, modo: rel ? "relativa" : "absoluta", chaves: chaves.map(c => { const x = Object.assign({}, c); delete x._rel; return x; }), tags: [...new Set(lista.flatMap(a => a.tags || []))] });
}
/* camadas: soma B (relativa) por cima de A */
function emCamadas(a, b, o = {}) { if (b.modo !== "relativa") throw new Error("A camada de cima precisa ser relativa (deltas)."); return { nome: o.nome || a.nome + " ⊕ " + b.nome, camadas: [a, b], duracao: Math.max(a.duracao, b.duracao), fps: a.fps, tags: [...new Set([...(a.tags || []), ...(b.tags || [])])] }; }
/* validação: juntas no limite, pé abaixo do chão, sobreposição entre pessoas (amostra a cada quadro) */
function validarAnimacao(a, it, o = {}) {
  const fps = o.fps || a.fps || 12, n = Math.max(2, Math.round(a.duracao * fps) + 1), avisos = [], salvo = Object.assign({}, it.params), base = { params: Object.assign({}, it.params) };
  try { for (let i = 0; i < n; i++) { const t = a.duracao * i / (n - 1); aplicarAnimacao(it, a, t, { base });
      for (const k of Object.keys(a.chaves[0] ? amostrar(a, t, base.params).valores : {})) { if (!SLK[k]) continue; const [mn, mx] = faixa(k, it.params.flex); if (it.params[k] <= mn + 0.01 || it.params[k] >= mx - 0.01) { avisos.push("t=" + t.toFixed(2) + "s: " + k + " no limite (" + it.params[k].toFixed(0) + ")"); } } } }
  finally { Object.assign(it.params, salvo); }
  return [...new Set(avisos)].slice(0, 20);
}

/* ===================== biblioteca de animações ===================== */
let anAoMudar = null;
function bibliotecaAnimacoes() {
  if (!SCN.animacoes) SCN.animacoes = {};
  const B = SCN.animacoes, avisar = () => { try { anAoMudar && anAoMudar(B); } catch (e) { } };
  const todas = () => Object.assign({}, ANIM_PRONTAS(), B);
  return {
    salvar(a, o = {}) { const an = criarAnimacao(a), nome = o.nome || an.nome; if (!nome) throw new Error("Dê um nome à animação."); const atual = B[nome], versao = atual ? atual.versao + 1 : 1;
      const reg = Object.assign({}, an, { nome, versao, data: new Date().toISOString(), tags: o.tags || (an.tags && an.tags.length ? an.tags : null) || (atual && atual.tags) || [], autor: o.autor || "", origem: o.origem || "usuario", corpo: o.corpo || an.corpo || "adulto" });
      reg.versoes = [...(atual ? atual.versoes : []), { versao, data: reg.data, chaves: reg.chaves, duracao: reg.duracao }].slice(-12); delete reg._animBase; B[nome] = reg; avisar(); return { nome, versao }; },
    obter(nome, versao) { const T = todas(), s = T[nome] || T[Object.keys(T).find(k => anNorm(k) === anNorm(nome))]; if (!s) return null; if (!versao || !s.versoes) return s; const v = s.versoes.find(x => x.versao === +versao); return v ? Object.assign({}, s, v) : s; },
    listar(f = {}) { const T = todas(), q = anNorm(f.busca || ""), tg = (f.tags || []).map(anNorm);
      return Object.values(T).filter(a => (!q || anNorm(a.nome).includes(q) || (a.tags || []).some(t => anNorm(t).includes(q)) || anNorm(a.descricao).includes(q)) && (!tg.length || tg.every(t => (a.tags || []).some(x => anNorm(x) === t || anNorm(x).startsWith(t + "/")))) && (!f.parte || (a.partes || []).includes(f.parte)) && (!f.maxDuracao || a.duracao <= f.maxDuracao))
        .map(a => ({ nome: a.nome, duracao: a.duracao, modo: a.modo, tags: a.tags, partes: a.partes, descricao: a.descricao, versao: a.versao || 0, origem: a.origem || "pronta", loop: !!a.loop })); },
    remover(nome) { delete B[nome]; avisar(); },
    exportar(nomes) { const sel = nomes ? Object.fromEntries(nomes.map(n => [n, this.obter(n)]).filter(x => x[1])) : B; return JSON.stringify({ app: "GeoMannequin", tipo: "animacoes", versao: 1, animacoes: sel }); },
    importar(json) { const d = typeof json === "string" ? JSON.parse(json) : json, L = d.animacoes || d; let n = 0; for (const [k, v] of Object.entries(L)) if (v && v.chaves) { B[k] = Object.assign({ versao: 1, versoes: [] }, v, { origem: v.origem === "pronta" ? "importada" : v.origem || "importada" }); n++; } avisar(); return n; },
    aoMudar(fn) { anAoMudar = fn; }
  };
}
/* mini animações prontas (geradas a partir das poses, gestos e atitudes) */
let AN_CACHE = null;
function ANIM_PRONTAS() {
  if (AN_CACHE) return AN_CACHE;
  const L = {}, base = Object.assign({}, SCN.list[0] ? SCN.list[0].params : {}), add = (nome, a, tags, desc) => { L[nome] = Object.assign(criarAnimacao(Object.assign({ nome }, a)), { tags, descricao: desc || "", origem: "pronta", versao: 0 }); };
  const rel = (nome, dur, vals, tags, desc, extra) => add(nome, Object.assign({ duracao: dur, modo: "relativa", chaves: [{ t: 0, valores: Object.fromEntries(Object.keys(vals).map(k => [k, 0])) }, { t: dur, valores: vals }] }, extra || {}), tags, desc);
  const ida = (nome, dur, vals, tags, desc) => add(nome, { duracao: dur, modo: "relativa", loop: false, chaves: [{ t: 0, valores: Object.fromEntries(Object.keys(vals).map(k => [k, 0])) }, { t: dur / 2, valores: vals }, { t: dur, valores: Object.fromEntries(Object.keys(vals).map(k => [k, 0])) }] }, tags, desc);
  const fotos = (fn) => { const it = { name: "_", params: Object.assign({}, base) }; fn(it); return it.params; };
  try {
    /* locomoção */
    const empe = anPoseValores("empe", base), passo = anPoseValores("passo", base), cam = anPoseValores("caminhando", base);
    add("passoFrente", { duracao: 0.7, chaves: [{ t: 0, valores: empe }, { t: 0.35, valores: passo, mover: { frente: 0.3 } }, { t: 0.7, valores: empe, mover: { frente: 0.6 } }] }, ["Locomocao/Passo/Frente"], "um passo à frente (60 cm)");
    add("passoTras", { duracao: 0.8, chaves: [{ t: 0, valores: empe }, { t: 0.4, valores: passo, mover: { frente: -0.2 } }, { t: 0.8, valores: empe, mover: { frente: -0.45 } }] }, ["Locomocao/Passo/Tras"], "um passo para trás");
    for (const [n, s] of [["passoLadoDireito", -1], ["passoLadoEsquerdo", 1]]) add(n, { duracao: 0.6, chaves: [{ t: 0, valores: empe }, { t: 0.3, valores: Object.assign({}, empe, s < 0 ? { hipAbdR: 14 } : { hipAbdL: 14 }), mover: { lado: s < 0 ? 0.2 : -0.2 } }, { t: 0.6, valores: empe, mover: { lado: s < 0 ? 0.4 : -0.4 } }] }, ["Locomocao/Passo/Lado"], "um passo para o lado");
    add("andarCiclo", { duracao: 1, loop: true, chaves: [{ t: 0, valores: cam }, { t: 0.5, valores: anEspelhar(cam), mover: { frente: 0.7 } }, { t: 1, valores: cam, mover: { frente: 1.4 } }] }, ["Locomocao/Andar"], "ciclo de caminhada (1,4 m por ciclo)");
    add("correrCiclo", { duracao: 0.6, loop: true, chaves: [{ t: 0, valores: anPoseValores("correndo", base) }, { t: 0.3, valores: anEspelhar(anPoseValores("correndo", base)), mover: { frente: 1.2 } }, { t: 0.6, valores: anPoseValores("correndo", base), mover: { frente: 2.4 } }] }, ["Locomocao/Correr"], "ciclo de corrida");
    for (const [n, g] of [["virarEsquerda", 90], ["virarDireita", -90], ["meiaVolta", 180]]) add(n, { duracao: 0.6, modo: "relativa", chaves: [{ t: 0, valores: {}, mover: { giro: 0 } }, { t: 0.3, valores: { hipFlexL: 12, kneeFlexL: 18 } }, { t: 0.6, valores: { hipFlexL: 0, kneeFlexL: 0 }, mover: { giro: g } }] }, ["Locomocao/Virar"], "vira no lugar");
    /* sentar, agachar, ajoelhar */
    for (const [n, a, b, tg] of [["sentarNoChao", "empe", "sentadoChao", "Postura/Sentar"], ["levantarDoChao", "sentadoChao", "empe", "Postura/Levantar"], ["agachar", "empe", "agachar", "Postura/Agachar"], ["levantarDeAgachado", "agachar", "empe", "Postura/Levantar"], ["ajoelhar", "empe", "umJoelho", "Postura/Ajoelhar"], ["deitar", "sentadoChao", "deitadoCostas", "Postura/Deitar"]])
      add(n, { duracao: 1.1, chaves: [{ t: 0, valores: anPoseValores(a, base) }, { t: 1.1, valores: anPoseValores(b, base) }] }, [tg], a + " → " + b);
    /* ajustes de pé (relativos, 15 cm) */
    for (const pe of ["direito", "esquerdo"]) for (const d of ["direita", "esquerda", "frente", "tras"]) { const it = { params: Object.assign({}, empe) }; const antes = Object.assign({}, it.params); ajusteFino(it, "pe " + pe, "pe", 15, d);
      const delta = {}; for (const k of Object.keys(it.params)) if (POSEKEYS.has(k) && Math.abs(it.params[k] - (antes[k] || 0)) > 0.05) delta[k] = it.params[k] - (antes[k] || 0);
      rel("pe" + (pe === "direito" ? "Direito" : "Esquerdo") + "15cm" + d[0].toUpperCase() + d.slice(1), 0.4, delta, ["Ajuste/Pe/" + (pe === "direito" ? "Direito" : "Esquerdo"), "Ajuste/15cm"], "move o pé " + pe + " 15 cm para " + (d === "tras" ? "trás" : d === "frente" ? "a frente" : "a " + d)); }
    /* cabeça e tronco */
    rel("inclinarCabecaDireita", 0.4, { headRoll: -14, neckSide: -8 }, ["Ajuste/Cabeca", "Atitude/Duvida"], "inclina a cabeça para a direita");
    rel("inclinarCabecaEsquerda", 0.4, { headRoll: 14, neckSide: 8 }, ["Ajuste/Cabeca", "Atitude/Duvida"], "inclina a cabeça para a esquerda");
    rel("abaixarCabeca", 0.5, { headPitch: 22, neckFlex: 14 }, ["Ajuste/Cabeca", "Atitude/Tristeza"], "abaixa a cabeça");
    rel("erguerQueixo", 0.4, { headPitch: -14, neckFlex: -6 }, ["Ajuste/Cabeca", "Atitude/Orgulho"], "ergue o queixo");
    add("acenarSim", { duracao: 0.8, modo: "relativa", chaves: [{ t: 0, valores: { headPitch: 0 } }, { t: 0.2, valores: { headPitch: 14 } }, { t: 0.4, valores: { headPitch: -3 } }, { t: 0.6, valores: { headPitch: 12 } }, { t: 0.8, valores: { headPitch: 0 } }] }, ["Gesto/Cabeca/Sim", "Conversa/Concordar"], "acena que sim");
    add("acenarNao", { duracao: 0.9, modo: "relativa", chaves: [{ t: 0, valores: { headYaw: 0 } }, { t: 0.2, valores: { headYaw: 25 } }, { t: 0.45, valores: { headYaw: -25 } }, { t: 0.7, valores: { headYaw: 18 } }, { t: 0.9, valores: { headYaw: 0 } }] }, ["Gesto/Cabeca/Nao", "Conversa/Discordar"], "balança a cabeça que não");
    rel("inclinarTroncoFrente", 0.5, { spineFlex: 14, thoFlex: 4, headPitch: -8 }, ["Ajuste/Tronco", "Atitude/Interesse"], "inclina o tronco para frente");
    rel("recuarTronco", 0.5, { spineFlex: -10, headPitch: 6 }, ["Ajuste/Tronco", "Atitude/Recuo"], "recua o tronco");
    ida("encolherOmbrosRapido", 0.8, { shElevL: 0.8, shElevR: 0.8, headRoll: 6 }, ["Gesto/Ombros", "Conversa/Duvida"], "encolhe e solta os ombros");
    for (const [n, at] of [["pesoParaDireita", "pesoNaPernaDireita"], ["pesoParaEsquerda", "pesoNaPernaEsquerda"], ["ombrosCairem", "ombrosCaidos"], ["encolher", "encolhido"]]) { const d = ATITUDES[at].v; rel(n, 0.6, d, [/peso/i.test(n) ? "Ajuste/Peso" : "Ajuste/Tronco", ATITUDES[at].tag], ATITUDES[at].desc); }
    /* gestos de conversa: de braços soltos até o gesto */
    const solto = fotos(it => aplicarGestoConversa(it, "repouso"));
    for (const g of Object.keys(GESTOS_CONVERSA)) { if (g === "repouso") continue; const fim = fotos(it => { Object.assign(it.params, solto); aplicarGestoConversa(it, g); }), v0 = {}, v1 = {};
      for (const k of Object.keys(fim)) if (POSEKEYS.has(k) && Math.abs((fim[k] || 0) - (solto[k] || 0)) > 0.01 && !/^(hip|knee|ankle|toes|pelvis)/.test(k)) { v0[k] = solto[k] || 0; v1[k] = fim[k]; }
      add("gesto" + g[0].toUpperCase() + g.slice(1), { duracao: 0.5, curva: "saida", chaves: [{ t: 0, valores: v0 }, { t: 0.5, valores: v1 }] }, [GESTOS_CONVERSA[g].tag, "Gesto/Braco"], GESTOS_CONVERSA[g].desc); }
    add("acenarTchau", { duracao: 1.2, modo: "absoluta", chaves: [{ t: 0, valores: { armAbdR: 115, armFlexR: 20, elbowR: 75, armRotR: -20 } }, { t: 0.3, valores: { elbowR: 45 } }, { t: 0.6, valores: { elbowR: 80 } }, { t: 0.9, valores: { elbowR: 45 } }, { t: 1.2, valores: { elbowR: 75 } }] }, ["Conversa/Cumprimento", "Gesto/Braco"], "acena tchau (balança o antebraço)");
    /* rosto */
    add("piscar", { duracao: 0.25, modo: "relativa", chaves: [{ t: 0, valores: { eyeLid: 0 } }, { t: 0.1, valores: { eyeLid: 0.95 } }, { t: 0.25, valores: { eyeLid: 0 } }] }, ["Rosto/Piscar"], "pisca os olhos");
    add("respirar", { duracao: 3, modo: "relativa", loop: true, chaves: [{ t: 0, valores: { shElevL: 0, shElevR: 0, spineFlex: 0 } }, { t: 1.4, valores: { shElevL: 0.12, shElevR: 0.12, spineFlex: -1.5 } }, { t: 3, valores: { shElevL: 0, shElevR: 0, spineFlex: 0 } }] }, ["Corpo/Respirar", "Ambiente/Ocioso"], "respiração em repouso (loop)");
    add("falarCiclo", { duracao: 1.2, modo: "relativa", loop: true, chaves: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.05, 1.2].map((t, i) => ({ t, valores: { jawOpen: [0, 0.3, 0.12, 0.35, 0.05, 0.25, 0.1, 0.3, 0][i] } })) }, ["Fala/Boca"], "boca falando (loop)");
    add("sorrir", { duracao: 0.6, chaves: [{ t: 0, rosto: { expressao: "neutra" }, valores: {} }, { t: 0.6, rosto: { expressao: "alegria" }, valores: {} }] }, ["Rosto/Expressao/Alegria"], "neutro → sorriso");
    add("ficarComRaiva", { duracao: 0.6, chaves: [{ t: 0, rosto: { expressao: "neutra" }, valores: {} }, { t: 0.6, rosto: { expressao: "raiva" }, valores: {} }] }, ["Rosto/Expressao/Raiva"], "neutro → raiva");
    add("assustar", { duracao: 0.35, curva: "rapida", chaves: [{ t: 0, rosto: { expressao: "neutra" }, valores: { spineFlex: 0, shElevL: 0, shElevR: 0 } }, { t: 0.35, rosto: { expressao: "surpresa" }, valores: { spineFlex: -8, shElevL: 0.7, shElevR: 0.7 } }] }, ["Rosto/Expressao/Surpresa", "Reacao/Susto"], "susto");
    /* luta e ação */
    for (const [n, a, b, tg] of [["socarJab", "guardaLuta", "jab", "Combate/Ataque/Soco"], ["socoDireto", "guardaLuta", "direto", "Combate/Ataque/Soco"], ["defender", "guardaLuta", "defesaCruzada", "Combate/Defesa"], ["esquivar", "guardaLuta", "esquiva", "Combate/Defesa/Esquiva"], ["chutar", "guardaLuta", "chuteLateral", "Combate/Ataque/Chute"], ["entrarEmGuarda", "empe", "guardaLuta", "Combate/Guarda"], ["apontarAlgo", "empe", "apontando", "Conversa/Apontar"], ["acenarPose", "empe", "acenando", "Conversa/Cumprimento"]]) {
      add(n, { duracao: /soc|jab|chut/.test(n) ? 0.45 : 0.6, curva: /soc|jab|chut/.test(n) ? "rapida" : "suave", chaves: [{ t: 0, valores: anPoseValores(a, base) }, { t: /soc|jab|chut/.test(n) ? 0.2 : 0.6, valores: anPoseValores(b, base) }].concat(/soc|jab|chut/.test(n) ? [{ t: 0.45, valores: anPoseValores(a, base) }] : []) }, [tg], a + " → " + b); }
    add("pular", { duracao: 0.9, chaves: [{ t: 0, valores: Object.assign({}, empe, { bodyLift: 0 }) }, { t: 0.2, valores: Object.assign({}, anPoseValores("agachar", base), { bodyLift: 0 }) }, { t: 0.45, valores: Object.assign({}, anPoseValores("saltando", base), { bodyLift: 6 }) }, { t: 0.7, valores: Object.assign({}, anPoseValores("aterrissando", base), { bodyLift: 0 }) }, { t: 0.9, valores: Object.assign({}, empe, { bodyLift: 0 }) }] }, ["Locomocao/Salto"], "pulo no lugar");
  } catch (e) { L._erro = { nome: "_erro", descricao: e.message, chaves: [{ t: 0, valores: {} }], duracao: 0, tags: [] }; }
  AN_CACHE = L; return L;
}
/* troca esquerda ↔ direita de um conjunto de parâmetros (para o outro passo do ciclo) */
function anEspelhar(v) { const o = {}; for (const [k, x] of Object.entries(v)) { const m = /^(.*)(L|R)$/.exec(k); if (m && SLK[m[1] + (m[2] === "L" ? "R" : "L")]) o[m[1] + (m[2] === "L" ? "R" : "L")] = x; else o[k] = /Side|Twist|Yaw|Roll/.test(k) ? -x : x; } return o; }

/* quadros da animação (estados de parâmetros) para desenhar: [{t, params}] — o manequim volta como estava */
function quadrosDaAnimacao(it, a, o = {}) {
  const fps = o.fps || a.fps || 12, n = Math.max(2, Math.round((o.duracao || a.duracao) * fps) + 1), salvo = anSemCamera(it.params), base = { params: anSemCamera(it.params) }, out = [];
  try { for (let i = 0; i < n; i++) { const t = (o.duracao || a.duracao) * i / (n - 1); Object.assign(it.params, base.params); if (a.camadas) a.camadas.forEach(c => aplicarAnimacao(it, c, t, { base: c.modo === "relativa" ? { params: Object.assign({}, it.params) } : base })); else aplicarAnimacao(it, a, t, { base }); out.push({ t, params: Object.assign({}, it.params) }); } }
  finally { Object.assign(it.params, salvo); delete it._animBase; }
  return out;
}

export { anSemCamera, AN_PARTES, GESTOS_CONVERSA, ATITUDES, TONS_FALA, PAPEIS_CONVERSA, CURVAS, aplicarGestoConversa, aplicarAtitude, ajusteFino, falar, aplicarPapel,
  criarAnimacao, amostrar, aplicarAnimacao, animacaoDePoses, animacaoDeFotos, encadear, emCamadas, validarAnimacao, bibliotecaAnimacoes, quadrosDaAnimacao, anPoseValores, anEspelhar, ANIM_PRONTAS };
