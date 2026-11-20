/* Gera src/scene/poses-mil.js: MAIS DE 1.000 POSES NOVAS por famílias (base do corpo × braços × variação), e depois PODA no mundo
   real: fica só a pose que difere ≥ 62° (soma de 28 juntas) de TODAS as outras (velhas e novas), sem o corpo atravessar e dentro
   dos limites. Uso: node ferramentas/gerar-poses-mil.mjs  (escreve o arquivo, carrega, poda e reescreve). */
import { writeFileSync } from "node:fs"; import { join, dirname } from "node:path"; import { fileURLToPath } from "node:url";
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), ".."), ARQ = join(RAIZ, "src/scene/poses-mil.js");
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const ler = c => { const m = new Map(); for (const t of c.trim().split(/\s+/)) { if (!t) continue; const mm = /^([a-z]+):?(.*)$/.exec(t); if (t.startsWith("m:") || t.startsWith("e:")) m.set(t.slice(0, 2), t.slice(2)); else m.set(/^[a-z]+/.exec(t)[0], t.replace(/^[a-z]+/, "")); } return m; };
const junta = (...cs) => { const m = new Map(); for (const c of cs) for (const [k, v] of ler(c || "")) m.set(k, v); return [...m].map(([k, v]) => k === "m:" || k === "e:" ? k + v : k + v).join(" "); };
const C = [];   /* candidatos: {nome, pt, en, cod, tag, maos?, pernas?} */
const add = (tag, nome, pt, en, cod, ex) => C.push(Object.assign({ tag, nome, pt, en, cod }, ex || {}));
/* família: bases × braços (× variações), expressões em rodízio */
const VARS3 = [["", "", "", ""], ["olhaLado", "olhando para o lado", "turned and looking to the side", "hy65 hz15 st25 pt12"], ["tronco", "tronco inclinado", "torso leaning and twisted the other way", "ss25 st-35 hp15 hy-25"]];
function fam(tag, id, bases, bracos, exprs, vars = VARS3) { let i = 0;
  for (const [bi, bpt, ben, bc] of bases) for (const [ai, apt, aen, ac] of bracos) for (const [vi, vpt, ven, vc] of vars) {
    const e = exprs[i++ % exprs.length]; add(tag, id + cap(bi) + cap(ai) + cap(vi), (apt + " " + bpt + (vpt ? " " + vpt : "")).trim() + "|" + (bpt + " " + apt).trim(), (aen + ", " + ben + (ven ? ", " + ven : "")), junta(bc, ac, vc, "e:" + e)); } }

/* ========== ANIME: LUTA ========== */
fam("Anime/Luta", "anLuta", [
  ["baseBaixa", "base baixa", "in a deep low stance", "sf10 hf65,-5 kf85,30 ha32,22 hr20,-10 af10,0 hp-6"],
  ["noAr", "saltando no ar", "leaping in mid-air", "bl3 hf75,20 kf115,45 ha15,10 af30,30 sf10"],
  ["investida", "em investida", "dashing forward low", "bp22 sf12 hf55,-30 kf70,15 ha12,8 af10,25"],
  ["aterrissagem", "aterrissagem de herói", "in a superhero landing", "sf35 hf110,-5 kf140,95 ha20,15 hr10,0 bp10"],
  ["guardaLado", "de lado", "standing sideways", "pt-30 st-25 hf28,-2 kf38,18 ha18,24"],
  ["ajoelhado", "com um joelho no chão", "kneeling on one knee", "hf95,-10 kf95,120 ha10,10 sf5"]
], [
  ["socoCarregado", "soco carregado", "charging a punch back", "fl95,-30 ab25,55 el0,120 ar0,40 m:punho,punho"],
  ["palmaDupla", "palmas de energia", "thrusting both palms forward", "fl85,85 ab10,10 el15,15 wr-60,-60 m:espalmada,espalmada"],
  ["kameLateral", "bolas de energia de lado", "cupping an energy ball at the hip", "fl20,25 ab-5,10 el110,100 st-35 pr60,-60 m:garra,garra"],
  ["espadaAlto", "espada de energia acima", "raising an energy blade overhead", "fl165,165 ab12,12 el25,25 m:punho,punho"],
  ["defesaX", "braços em X", "crossing forearms in an X guard", "fl95,95 ab-22,-22 el115,115 ar-55,-55 m:punho,punho"],
  ["apontaDesafio", "apontando o desafio", "pointing defiantly at the enemy", "fl90,15 ab12,35 el0,95 m:apontar,punho"],
  ["garras", "garras abertas", "spreading clawed hands", "fl60,60 ab55,55 el60,60 m:garra,garra"],
  ["ninjaRun", "braços para trás", "arms swept back like a ninja run", "fl-45,-45 ab22,22 el12,12 m:aberta,aberta"]
], ["determinacao", "furia", "gritoDeGuerra", "focoTotal", "sorrisoMaligno", "determinadoLuta", "iraFocada", "olharPenetrante"]);
fam("Anime/Golpe especial", "anGolpe", [
  ["giro", "girando", "spinning", "st40 pt20 hf30,-10 kf35,15 hy-30"],
  ["inclinado", "inclinado para trás", "leaning back", "sf-20 bp-10 hf20,-15 kf30,20"],
  ["agachadoMao", "agachado com mão no chão", "crouched with a hand on the ground", "sf40 hf115,60 kf140,120 ha20,30"],
  ["voando", "voando para a frente", "flying forward", "bl5 bp70 hf10,30 kf20,60"]
], [
  ["chuteAlto", "chute alto", "high kick", "hf110,-15 kf5,20 fl40,80 ab50,30 el60,90 m:punho,punho"],
  ["cotovelada", "cotovelada", "elbow strike", "fl80,40 ab60,20 el140,100 ar60,0 m:punho,punho"],
  ["socoDescendo", "soco para baixo", "hammer punch downward", "fl140,30 ab20,30 el20,100 m:punho,punho"],
  ["rajada", "rajada com uma mão", "one-handed energy blast", "fl90,-10 ab0,30 el5,30 wr-70,0 m:espalmada,punho"],
  ["dedosDuplos", "dedos na testa (teleporte)", "two fingers on the forehead", "fl150,10 ab-20,20 el140,20 m:apontar,aberta"]
], ["gritoDeGuerra", "furia", "focoTotal", "determinacao"]);

/* ========== ANIME: POSES ESTILOSAS ========== */
fam("Anime/Pose estilosa", "anEstilo", [
  ["torcido", "tronco torcido", "with a twisted torso", "st40 ss15 pt-10 hf15,-5 kf20,10 hr30,-20"],
  ["arqueado", "arqueado para trás", "arching back dramatically", "sf-25 ss-12 hf10,-10 kf15,5 hp-20"],
  ["joelhoAlto", "joelho para cima", "with one knee raised", "hf90,0 kf100,5 ss10"],
  ["pernasCruzadasPe", "pernas cruzadas em pé", "standing with legs crossed", "hf8,10 ha-12,-8 kf10,10 hr10,0"]
], [
  ["maoRosto", "mão no rosto", "hand framing the face", "fl130,20 ab-10,40 el150,40 wr40,0 m:garra,relaxada"],
  ["bracosAbertos", "braços abertos", "arms flung wide", "fl70,90 ab90,80 el10,20 m:espalmada,garra"],
  ["apontaCima", "apontando para cima", "pointing to the sky", "fl170,-10 ab10,20 el0,30 m:apontar,punho"],
  ["costasMao", "costas da mão", "back of the hand to the camera", "fl100,40 ab30,10 el130,120 pr90,0 m:garra,aberta"],
  ["cintura", "mão na cintura", "hand on the hip", "fl20,-15 ab30,40 el20,110 m:apontar,aberta"]
], ["sorrisoConfiante", "arrogante", "olharFrio", "orgulho", "malicia"]);

/* ========== ANIME: DANÇA / IDOL ========== */
fam("Anime/Dança e idol", "anIdol", [
  ["pulinho", "num pulinho", "in a little hop", "bl1 hf40,10 kf90,20 af30,20"],
  ["inclinada", "inclinada de lado", "leaning to the side", "ss25 hf10,-10 kf15,0 ha15,0"],
  ["pontaPe", "na ponta do pé", "on tiptoe", "hf0,30 kf0,50 af40,30"],
  ["joelhosJuntos", "joelhos juntos", "knees together", "hf25,25 kf40,40 ha-10,-10 hr-25,-25"],
  ["passo", "dando um passo", "mid-step", "hf35,-15 kf20,10"]
], [
  ["coracao", "coração com as mãos", "making a heart with the hands", "fl110,110 ab-10,-10 el120,120 m:garra,garra"],
  ["paz", "sinal de paz no olho", "peace sign by the eye", "fl140,10 ab-10,20 el150,30 m:paz,aberta"],
  ["acenoDuplo", "acenando com as duas", "waving both hands", "fl150,150 ab40,40 el30,30 m:espalmada,espalmada"],
  ["microfone", "microfone imaginário", "singing into an invisible mic", "fl90,20 ab-5,30 el140,40 m:punho,aberta"],
  ["bracosOndas", "braços em onda", "arms in a wave", "fl100,60 ab80,70 el40,10 wr30,-30 m:aberta,aberta"]
], ["alegria", "encantado", "gritoDeAlegria", "piscando", "olhosBrilhando"]);

/* ========== DANÇAS ========== */
const DANCAS = [
  ["hipHop", "Dança/Hip hop", "hip hop", [["hf30,10 kf50,30 ha20,15 sf15", "groove agachado", "low groove"], ["hf20,-10 kf20,10 pt20 st-20", "passo lateral", "side step"], ["bl1 hf50,30 kf80,60", "pulo", "jump"], ["hf10,10 kf10,10 ss-15", "ombro caído", "shoulder drop"]],
    [["fl90,90 ab40,40 el90,90 m:punho,punho", "braços em L", "arms bent in L"], ["fl-20,60 ab30,20 el30,100 m:apontar,punho", "apontando para baixo", "pointing down"], ["fl140,20 ab20,40 el40,90 m:aberta,punho", "mão para cima", "hand up"]]],
  ["kpop", "Dança/K-pop", "k-pop choreography", [["hf25,0 kf35,10 ha10,20", "base aberta", "open stance"], ["hf0,40 kf0,70 af30,20", "joelho dobrado", "bent knee"], ["pt30 st20 hf20,0 kf30,10", "quadril virado", "hips turned"]],
    [["fl120,40 ab-20,40 el80,30 m:aberta,aberta", "braço cruzando", "arm crossing"], ["fl90,90 ab0,0 el0,0 wr60,60 m:espalmada,espalmada", "palmas para a frente", "palms out"], ["fl160,-20 ab20,30 el20,20 m:punho,aberta", "punho no ar", "fist up"], ["fl40,40 ab70,70 el90,90 m:garra,garra", "garras no peito", "claws at chest"]]],
  ["samba", "Dança/Latina", "samba", [["hf35,-5 kf30,10 af0,30 pt15", "no pé", "samba step"], ["hf10,30 kf20,40 ss10 pt-15", "requebrando", "hip sway"]],
    [["fl100,40 ab70,40 el60,40 m:aberta,aberta", "braços para cima", "arms up"], ["fl60,60 ab90,90 el30,30 m:aberta,aberta", "braços abertos", "arms out"], ["fl30,140 ab40,30 el90,40 m:aberta,aberta", "um braço alto", "one arm high"]]],
  ["frevo", "Dança/Folclore e mundo", "frevo", [["hf90,-10 kf110,20 ha30,20", "perna para cima", "leg kicked up"], ["sf25 hf80,80 kf120,120 ha40,40", "agachadinho", "deep squat"], ["hf20,-20 kf30,10 hr-30,30", "tesoura", "scissor step"]],
    [["fl140,140 ab50,50 el20,20 m:segurar,segurar", "sombrinha alta", "umbrella held high"], ["fl90,30 ab80,60 el30,60 m:segurar,aberta", "equilibrando", "balancing"]]],
  ["ballet", "Dança/Balé", "ballet", [["hf0,0 kf0,0 hr40,40 af50,50", "primeira posição na ponta", "first position en pointe"], ["hf90,0 kf0,0 hr30,20 af50,40", "développé à frente", "développé to the front"], ["hf-25,0 kf5,0 bp20 hr30,20 af50,40", "arabesque", "arabesque"], ["hf0,60 kf0,110 ha0,40 af40,50", "passé", "passé"]],
    [["fl170,170 ab20,20 el40,40 m:aberta,aberta", "braços em quinta", "arms in fifth"], ["fl80,80 ab80,80 el20,20 m:aberta,aberta", "braços em segunda", "arms in second"], ["fl160,80 ab30,70 el40,20 m:aberta,aberta", "um braço em coroa", "one arm crowned"]]],
  ["salsa", "Dança/Salão e festa", "salsa", [["hf20,-10 kf20,10 pt20 st-15", "básico", "basic step"], ["st40 hf10,10 kf20,20 hr20,-20", "giro", "turn"]],
    [["fl100,50 ab40,50 el80,90 m:aberta,aberta", "braços de salsa", "salsa arms"], ["fl170,30 ab10,40 el10,90 m:aberta,aberta", "mão no alto girando", "hand up spinning"]]],
  ["breakdance", "Dança/Hip hop", "breakdance", [["sf40 hf110,40 kf140,60 bp30", "toprock agachado", "crouched toprock"], ["bp80 sf10 hf60,20 kf90,10", "freeze no braço", "arm freeze"], ["br40 hf50,90 kf60,120", "six step", "six step"]],
    [["fl-30,90 ab40,30 el20,90 m:aberta,punho", "mão no chão", "hand down"], ["fl120,120 ab30,30 el90,90 m:punho,punho", "braços dobrados", "arms bent"]]],
  ["vogue", "Dança/Contemporânea", "voguing", [["hf10,10 kf10,10 pt20", "em pé", "standing"], ["sf20 hf100,20 kf140,90 ha30,10", "dip", "dip"]],
    [["fl150,90 ab20,10 el150,120 m:aberta,aberta", "moldura no rosto", "framing the face"], ["fl90,90 ab0,0 el130,130 wr60,-60 m:aberta,aberta", "mãos em quadrado", "hands in a box"], ["fl170,-20 ab40,40 el0,20 m:aberta,aberta", "braço estendido", "arm extended"]]],
  ["contemporanea", "Dança/Contemporânea", "contemporary dance", [["sf40 ss20 hf40,10 kf60,30", "tronco caído", "collapsed torso"], ["sf-30 hf0,-20 kf0,20 hp-30", "tronco aberto", "open chest"], ["hf100,0 kf60,0 ss-20", "perna alta", "leg lifted"]],
    [["fl90,170 ab90,20 el30,10 m:aberta,aberta", "braços em diagonal", "arms on a diagonal"], ["fl20,20 ab-30,-30 el120,120 m:relaxada,relaxada", "abraçando o ar", "hugging the air"], ["fl150,150 ab-10,-10 el60,60 m:aberta,aberta", "mãos sobre a cabeça", "hands over the head"]]],
  ["forro", "Dança/Salão e festa", "forró", [["hf25,-10 kf25,10 pt15", "dois pra lá", "two-step"], ["hf10,25 kf10,30 pt-15", "dois pra cá", "back step"]],
    [["fl60,90 ab20,60 el90,60 m:segurar,aberta", "conduzindo", "leading"], ["fl40,40 ab20,20 el100,100 m:punho,punho", "braços colados", "arms tucked"]]],
  ["tango", "Dança/Salão e festa", "tango", [["hf50,-20 kf30,0 af0,40 sf-6", "passo largo", "long stride"], ["hf20,10 kf10,60 hr0,30 af40,40", "gancho", "gancho"]],
    [["fl90,40 ab90,40 el30,90 m:segurar,aberta", "braço de tango", "tango frame"], ["fl130,20 ab60,20 el60,110 m:aberta,aberta", "mão alta dramática", "dramatic hand"]]],
  ["shuffle", "Dança/Hip hop", "shuffle", [["hf40,-10 kf60,10 af30,0", "running man", "running man"], ["hf10,10 kf20,20 hr40,-40", "pés em V", "feet in V"]],
    [["fl70,-20 ab20,20 el90,40 m:punho,punho", "braços de corrida", "running arms"], ["fl110,110 ab50,50 el60,60 m:aberta,aberta", "mãos ao alto", "hands up"]]]
];
for (const [id, tag, en0, bases, bracos] of DANCAS) { let i = 0; for (const [bc, bpt, ben] of bases) for (const [ac, apt, aen] of bracos) for (const [vi, vpt, ven, vc] of VARS3) { const e = ["alegria", "encantado", "sorrisoConfiante", "focoTotal", "gritoDeAlegria"][i++ % 5];
  add(tag, "danca" + cap(id) + i, en0 + ": " + bpt + ", " + apt + (vpt ? ", " + vpt : "") + "|" + id + " " + bpt + " " + i, en0 + " — " + ben + ", " + aen + (ven ? ", " + ven : ""), junta(bc, ac, vc, "e:" + e)); } }

/* ========== MÚSICA (sem o instrumento; com ele: segura X / toca X) ========== */
fam("Música/Palco", "palco", [
  ["emPe", "em pé", "standing", "hf10,-5 kf10,5"],
  ["joelhos", "de joelhos", "on both knees", "hf10,10 kf120,120 sf-10"],
  ["arqueado", "arqueado para trás", "arched back", "sf-25 hf20,0 kf40,20 hp-25"],
  ["pulo", "pulando", "jumping", "bl2 hf60,40 kf110,90"]
], [
  ["guitarraAir", "solando guitarra no ar", "air guitar solo", "fl40,20 ab20,-10 el90,100 ar30,-40 m:garra,pinca"],
  ["cantandoAgudo", "cantando o agudo", "belting the high note, fist clenched", "fl90,40 ab-5,40 el140,80 m:punho,punho"],
  ["regendo", "regendo a orquestra", "conducting an orchestra", "fl110,90 ab40,60 el60,40 m:pinca,aberta"],
  ["djMixando", "DJ mixando", "DJing, one hand on headphones", "fl140,40 ab40,20 el140,90 m:aberta,aberta"],
  ["agradecendo", "agradecendo ao público", "thanking the crowd, arms out", "fl70,70 ab90,90 el10,10 m:espalmada,espalmada"],
  ["bateriaAir", "batera no ar", "air drumming", "fl60,80 ab20,30 el100,80 m:punho,punho"]
], ["gritoDeAlegria", "olhosBrilhando", "focoTotal", "alegria", "encantado"]);

/* ========== VEÍCULOS (o corpo: use com embarca) ========== */
fam("Veículo/Pilotando", "pilot", [
  ["motoCurva", "inclinado na curva de moto", "leaning into a motorcycle turn", "br-25 hf65,60 ha20,30 kf80,90 sf30"],
  ["motoEmpinando", "empinando a moto", "doing a wheelie", "sf10 bp-15 hf60,60 kf70,70 ha15,15"],
  ["bikeSprint", "pedalando em pé no sprint", "standing sprint on a bike", "bp30 sf20 hf40,70 kf40,100 ha8,8"],
  ["skateOllie", "ollie no skate", "skateboard ollie", "bl2 hf80,60 kf110,80 ha15,15 sf20"],
  ["surfeBase", "surfando de base", "surfing in stance", "pt-40 st-30 hf45,20 kf60,40 ha20,25 sf20"],
  ["snowboard", "descendo de snowboard", "snowboarding down", "pt-50 st-20 hf50,30 kf70,50 ha25,20 sf25"]
], [
  ["guidao", "mãos no guidão", "hands on the handlebars", "fl70,70 ab20,20 el50,50 m:segurar,segurar"],
  ["equilibrio", "braços de equilíbrio", "arms out for balance", "fl50,30 ab70,80 el30,20 m:aberta,aberta"],
  ["acenando", "acenando", "waving one hand", "fl70,150 ab20,40 el50,30 m:segurar,espalmada"]
], ["determinacao", "alegria", "focoTotal", "gritoDeAlegria", "esforco"]);

/* ========== ESPORTES EXTRA ========== */
fam("Esporte/Modalidades", "esp", [
  ["golfe", "no golfe", "golf", "sf30 hf25,25 kf20,20 ha12,12"],
  ["beisebol", "no beisebol", "baseball", "st-30 pt-20 hf30,10 kf35,20 ha20,10"],
  ["esgrima", "na esgrima", "fencing", "pt-60 hf60,-20 kf70,10 ha10,30 hr40,0"],
  ["hoquei", "no hóquei", "ice hockey", "sf35 hf50,20 kf60,40 ha20,20"],
  ["arqueria", "no tiro com arco", "archery", "pt-70 st-20 hf5,0 kf5,5 ha12,12"],
  ["futAmericano", "no futebol americano", "american football", "sf40 hf70,40 kf80,60 ha20,20"],
  ["handebol", "no handebol", "handball", "bl2 hf60,-10 kf80,20 sf-10"],
  ["escalada", "na escalada", "climbing", "hf80,20 kf100,30 ha40,30 sf10"]
], [
  ["preparando", "preparando o movimento", "preparing", "fl20,20 ab-20,-20 el20,20 m:segurar,segurar"],
  ["batendo", "no impacto", "at impact", "fl80,90 ab-10,10 el10,30 st20 m:segurar,segurar"],
  ["finalizando", "na finalização", "follow-through", "fl150,120 ab30,10 el80,90 st40 m:segurar,segurar"],
  ["comemorando", "comemorando", "celebrating", "fl160,160 ab30,30 el20,20 m:punho,punho"]
], ["focoTotal", "esforco", "determinacao", "gritoDeAlegria"]);

/* ========== EMOÇÕES EXTRA ========== */
fam("Emoção/Corpo inteiro", "emo", [
  ["emPe", "em pé", "standing", "hf5,-5 kf5,5"],
  ["sentadoChao", "sentado no chão", "sitting on the floor", "hf80,80 kf100,60 ha20,10 sf10"],
  ["ajoelhado", "ajoelhado", "kneeling", "hf5,5 kf125,125 sf10"],
  ["encolhido", "encolhido", "hunched over", "sf40 hf20,20 kf20,20 se0.4,0.4"],
  ["deCostasParede", "de costas, cabeça baixa", "back turned, head down", "sf20 hp30 hf5,0 kf5,10"]
], [
  ["maosRosto", "com as mãos no rosto", "hands over the face", "fl110,110 ab-15,-15 el140,140 m:aberta,aberta"],
  ["punhosCerrados", "com os punhos cerrados", "fists clenched at the sides", "fl10,10 ab15,15 el30,30 m:punho,punho"],
  ["abracandoSe", "abraçando o próprio corpo", "hugging himself", "fl70,70 ab-30,-30 el120,120 ar-50,-50 m:garra,garra"],
  ["bracosCaidos", "com os braços caídos", "arms hanging limp", "fl0,0 ab5,5 el5,5 m:relaxada,relaxada"],
  ["maoCabeca", "com a mão na cabeça", "hand on the head", "fl150,10 ab20,10 el130,20 m:aberta,relaxada"]
], ["tristeza", "raiva", "medo", "vergonha", "exausto", "choro", "decepcionado", "alivio", "surpresa", "frustrado"]);

/* ========== TRABALHO / PROFISSÕES ========== */
fam("Trabalho/Profissões", "prof", [
  ["emPe", "em pé", "standing", "hf5,-5 kf8,4"],
  ["agachado", "agachado", "crouched", "sf30 hf100,100 kf130,130 ha20,20"],
  ["inclinado", "inclinado sobre a bancada", "leaning over a workbench", "sf45 hf30,30 kf10,10"],
  ["naEscada", "no alto da escada", "on top of a ladder", "hf40,0 kf50,5 sf-5 hp-30"]
], [
  ["martelando", "martelando", "hammering", "fl120,50 ab20,30 el90,60 m:segurar,segurar"],
  ["anotando", "anotando na prancheta", "writing on a clipboard", "fl50,40 ab-10,10 el110,100 m:pinca,segurar"],
  ["apontandoPlanta", "apontando a planta", "pointing at a blueprint", "fl60,40 ab20,10 el20,80 m:apontar,segurar"],
  ["cozinhandoMexendo", "mexendo a panela", "stirring a pot", "fl50,40 ab10,20 el90,100 m:segurar,segurar"],
  ["examinando", "examinando com lupa", "examining with a magnifier", "fl80,40 ab10,20 el120,90 m:segurar,aberta"],
  ["carregandoCaixa", "carregando caixa", "carrying a box", "fl50,50 ab-5,-5 el80,80 m:segurar,segurar"]
], ["focoTotal", "esforco", "concentradoLingua", "serio", "pensativo"]);

/* ========== COTIDIANO: MÃOS NO LUGAR (marcos do corpo) ========== */
const MAOS = [["queixo", "sobCotovelo", "pensando com a mão no queixo", "thinking with a hand on the chin"], ["nuca", null, "mão na nuca", "hand behind the neck"], ["cintura", "cintura", "mãos na cintura", "hands on the hips"],
  ["bolso", "bolso", "mãos nos bolsos", "hands in the pockets"], ["bolso", null, "uma mão no bolso", "one hand in a pocket"], ["costas", "costas", "mãos atrás das costas", "hands behind the back"], ["testa", null, "mão na testa", "hand on the forehead"],
  ["boca", null, "mão na boca", "hand over the mouth"], ["orelha", null, "mão na orelha (ouvindo)", "hand cupped at the ear"], ["coracao", null, "mão no coração", "hand on the heart"], ["barriga", "barriga", "mãos na barriga", "hands on the belly"],
  ["cabeca", "cabeca", "mãos na cabeça", "both hands on the head"], ["bochecha", null, "mão no rosto", "hand on the cheek"], ["lombar", "lombar", "mãos na lombar", "hands on the lower back"], ["cruzadoCima", "cruzadoBaixo", "braços cruzados", "arms crossed"],
  ["olhos", null, "mão nos olhos", "hand over the eyes"], ["prece", "prece", "mãos juntas", "palms together"], ["coxa", "coxa", "mãos nos joelhos", "hands on the thighs"], ["ombroOposto", null, "mão no ombro", "hand on the opposite shoulder"], ["abraco", "abraco", "abraçando-se", "hugging himself"]];
const POSTURAS = [["pesoDir", "peso na perna direita", "weight on the right leg", "hf5,-5 kf15,0 pt8 ss-4 hp4"], ["pesoEsq", "peso na perna esquerda", "weight on the left leg", "hf-5,5 kf0,15 pt-8 ss4 hp4"],
  ["inclinadoFrente", "inclinado para a frente", "leaning forward", "sf15 hf10,10 kf8,8 hp10"], ["passo", "dando um passo", "taking a step", "hf25,-10 kf15,8 hy15"], ["encostado", "encostado", "leaning back", "sf-8 bp-6 hf0,-5 kf10,10 hp-6 hy-15"],
  ["sentadoCadeira", "sentado na cadeira", "seated on a chair", "hf90,90 kf90,90 sf4"], ["sentadoBorda", "sentado na beirada, inclinado", "seated on the edge, leaning forward", "hf95,95 kf100,80 sf22 hp8"], ["ajoelhado", "ajoelhado", "kneeling", "hf5,5 kf125,125 sf6"], ["agachado", "agachado", "crouching", "sf25 hf105,105 kf135,135 ha20,20"]];
{ let i = 0; for (const [L, R, pt, en] of MAOS) for (const [pi, ppt, pen, pc] of POSTURAS) { const nome = "maos" + cap(L) + (R ? cap(R) : "") + cap(pi); const e = ["pensativo", "serio", "curioso", "neutra", "sorrisoConfiante", "tedio"][i++ % 6];
  add("Cotidiano/Mãos no corpo", nome, pt + ", " + ppt + "|" + pt, en + ", " + pen, junta(pc, "e:" + e), { maos: R ? { R: L, L: R } : { R: L } }); } }

/* ========== SENTADO COM PERNAS CRUZADAS × MÃOS ========== */
const MODOS = [["perna", "perna sobre perna", "legs crossed knee over knee", "hf90,90 kf90,90"], ["figura4", "tornozelo no joelho", "ankle resting on the knee", "hf90,90 kf90,90"], ["tornozelos", "tornozelos cruzados", "ankles crossed, legs forward", "hf85,85 kf35,35 sf-8"],
  ["indio", "de pernas cruzadas no chão", "sitting cross-legged on the floor", "hf80,80 kf140,140 ground1"], ["lotus", "em lótus", "in lotus position", "hf80,80 kf140,140"], ["borboleta", "solas dos pés juntas", "soles of the feet together", "hf60,60 kf135,135"], ["lado", "pernas dobradas de lado", "legs folded to the side", "hf60,60 kf140,140"]];
const MAOS_SENT = [["coxa", "coxa", "mãos nas coxas", "hands on the thighs"], ["colo", "colo", "mãos no colo", "hands in the lap"], ["queixo", "sobCotovelo", "mão no queixo", "chin on the hand"], ["prece", "prece", "mãos em prece", "hands in prayer"], ["cruzadoCima", "cruzadoBaixo", "braços cruzados", "arms crossed"],
  ["nuca", "nuca", "mãos atrás da cabeça", "hands behind the head"], ["barriga", "barriga", "mãos na barriga", "hands on the belly"], ["orelha", "coxa", "falando ao telefone", "talking on the phone"], ["cabeca", "coxa", "mão na cabeça", "hand on the head"], ["coracao", "coxa", "mão no peito", "hand on the chest"],
  ["bochecha", "coxa", "rosto na mão", "cheek resting on the hand"], ["boca", "coxa", "mão na boca", "hand over the mouth"]];
{ let i = 0; for (const [m, mpt, men, mc] of MODOS) for (const [L, R, apt, aen] of MAOS_SENT) for (const s of [-1, 1]) { if ((i + (s > 0 ? 1 : 0)) % 3 === 2 && s > 0) { i++; continue; }
  const e = ["calmo", "pensativo", "sonhador", "tedio", "alegria", "serio", "curioso"][i++ % 7], nome = "sentado" + cap(m) + cap(L) + (s > 0 ? "Esq" : "");
  add("Descanso/Pernas cruzadas", nome, "sentado, " + mpt + (s > 0 ? " (esquerda por cima)" : "") + ", " + apt + "|" + mpt + " " + apt, "seated, " + men + ", " + aen, junta(mc.replace(" ground1", ""), (s > 0 ? "hy-12" : "hy12") + " hp" + (6 + (i % 4) * 4), "e:" + e), { maos: { R: L, L: R }, pernas: [m, s] }); } }

/* ========== DEITADO (cama, sofá, chão) ========== */
fam("Descanso/Deitado", "deit", [
  ["costas", "de costas", "lying on the back", "bp-90 hf10,30 kf10,50"],
  ["lado", "de lado", "lying on the side", "br90 hf40,60 kf60,80"],
  ["brucos", "de bruços", "lying face down", "bp90 hf0,20 kf60,10"],
  ["costasJoelhos", "de costas com joelhos dobrados", "on the back with knees up", "bp-90 hf60,60 kf100,100"]
], [
  ["lendo", "lendo um livro", "reading a book held up", "fl110,110 ab-10,-10 el80,80 m:segurar,segurar"],
  ["celular", "mexendo no celular", "scrolling a phone", "fl100,30 ab-15,20 el100,60 m:segurar,relaxada"],
  ["maosNuca", "mãos atrás da cabeça", "hands behind the head", "fl150,150 ab80,80 el140,140 m:aberta,aberta"],
  ["bracoOlhos", "braço sobre os olhos", "forearm over the eyes", "fl120,20 ab-20,30 el130,20 m:relaxada,relaxada"],
  ["espreguicando", "espreguiçando", "stretching", "fl170,170 ab20,20 el10,10 m:aberta,aberta"]
], ["sono", "calmo", "tedio", "sonhador", "alegria"]);

/* ========== INFÂNCIA, VELHICE, CERIMÔNIA, TERROR, COMÉDIA (extras) ========== */
fam("Comédia/Exagero", "comed", [
  ["pernaUmPe", "num pé só", "on one leg", "hf60,0 kf90,0 ha20,0"],
  ["escorregando", "escorregando", "slipping", "bp-30 hf80,-20 kf20,10 ha10,30"],
  ["naPontaPes", "na ponta dos pés", "tiptoeing", "sf20 hf40,10 kf50,30 af40,40"],
  ["pulandoSusto", "pulando de susto", "jumping in fright", "bl2 hf50,50 kf90,90 ha30,30"]
], [
  ["bracosHelice", "braços em hélice", "arms windmilling", "fl170,-20 ab60,100 el10,10 m:aberta,aberta"],
  ["maosBoca", "mãos na boca", "hands over the mouth", "fl110,110 ab-10,-10 el150,150 m:aberta,aberta"],
  ["dedoSilencio", "pedindo silêncio", "finger to the lips", "fl110,10 ab-10,10 el150,10 m:apontar,relaxada"],
  ["joinhaDuplo", "joinha duplo", "double thumbs up", "fl80,80 ab20,20 el60,60 m:joinha,joinha"]
], ["choqueComico", "riso", "panico", "envergonhadoSorrindo", "susto"]);
fam("Terror/Reação", "terr", [
  ["recuando", "recuando", "backing away", "bp-10 sf-10 hf-10,20 kf10,30"],
  ["encurralado", "encurralado", "cornered", "sf-5 hf10,10 kf20,20 ha10,10"],
  ["caidoArrastando", "caído, se arrastando", "fallen and crawling back", "bp-60 hf60,30 kf90,40"],
  ["espiando", "espiando", "peeking out", "ss20 hf20,0 kf30,10 hy30"]
], [
  ["bracosDefesa", "braços na frente", "arms up to shield", "fl100,100 ab10,10 el100,100 m:espalmada,espalmada"],
  ["lanterna", "segurando a lanterna", "holding a flashlight", "fl80,30 ab0,20 el20,90 m:segurar,aberta"],
  ["maoParede", "mão na parede", "hand against the wall", "fl80,10 ab60,10 el20,30 m:espalmada,relaxada"]
], ["horror", "medo", "panico", "susto", "choque"]);
fam("Infância/Brincadeira", "inf", [
  ["pulando", "pulando", "jumping", "bl2 hf40,40 kf80,80"],
  ["agachado", "agachado brincando", "squatting at play", "sf30 hf110,110 kf140,140 ha25,25"],
  ["correndo", "correndo", "running", "bp10 hf60,-20 kf80,40"]
], [
  ["aviao", "braços de avião", "arms out like a plane", "fl80,80 ab90,90 el5,5 ss15 m:espalmada,espalmada"],
  ["pegaPega", "pegando alguém", "reaching to tag someone", "fl100,30 ab10,30 el10,90 m:espalmada,punho"],
  ["dinossauro", "imitando dinossauro", "pretending to be a dinosaur", "fl70,70 ab10,10 el120,120 m:garra,garra"],
  ["superHeroi", "voando de super-herói", "flying like a superhero", "fl170,-10 ab10,15 el0,90 m:punho,punho"]
], ["alegria", "gritoDeAlegria", "encantado", "riso"]);
fam("Velhice/Movimento", "velho", [
  ["bengala", "com bengala", "with a cane", "sf25 hf20,10 kf25,20 hp-10"],
  ["sentandoDevagar", "sentando devagar", "lowering slowly", "sf30 hf70,70 kf70,70"],
  ["curvado", "curvado", "stooped", "sf40 hf15,15 kf20,20 hp-20"]
], [
  ["maoBengala", "mão na bengala", "hand on the cane", "fl40,10 ab10,10 el20,20 m:segurar,relaxada"],
  ["maoCostas", "mão nas costas", "hand on the back", "fl-30,40 ab20,10 el110,20 m:aberta,segurar"],
  ["acenando", "acenando", "waving", "fl130,30 ab30,10 el60,20 m:espalmada,segurar"]
], ["cansaco", "alegria", "dor", "calmo"]);
fam("Cerimônia e fé/Gestos", "cerim", [
  ["emPe", "em pé", "standing", "hf0,0 kf0,0"],
  ["ajoelhado", "ajoelhado", "kneeling", "hf5,5 kf125,125"],
  ["reverencia", "em reverência", "bowing", "sf50 hf20,20 kf5,5"]
], [
  ["bracosCeu", "braços ao céu", "arms raised to the sky", "fl160,160 ab30,30 el10,10 m:espalmada,espalmada"],
  ["maoPeito", "mão no peito", "hand on the chest", "fl30,0 ab-20,10 el120,10 m:espalmada,relaxada"],
  ["oferenda", "oferecendo", "offering with both hands", "fl70,70 ab0,0 el60,60 pr90,90 m:aberta,aberta"]
], ["calmo", "esperancoso", "admiracao", "choroContido"]);

/* ---------- escreve ---------- */
function escrever(lista) { const cats = {}; for (const p of lista) (cats[p.tag] = cats[p.tag] || []).push(p);
  let s = "/* GeoMannequin — MIL POSES NOVAS (geradas por ferramentas/gerar-poses-mil.mjs e podadas: cada uma difere ≥ 62° de todas as outras,\n" +
    "   sem o corpo atravessar e dentro dos limites). Famílias: anime (luta, golpes especiais, poses estilosas, dança e idol), 12 estilos de\n" +
    "   dança, palco e música, pilotando (moto, bicicleta, skate, surfe, snowboard), esportes, emoções, profissões, mãos no lugar do corpo\n" +
    "   (marcos), sentado de pernas cruzadas (resolvedor de pernas) × mãos, deitado, comédia, terror, infância, velhice e cerimônia.\n" +
    "   NÃO EDITE À MÃO: rode a ferramenta de novo. */\n" +
    "import { pn, pnC, pnRegistrar } from \"./poses-narrativas.js\";\nimport { POSE_MAOS } from \"./maos-alvo.js\";\nimport { POSE_PERNAS } from \"./pernas-cruzadas.js\";\n\n";
  for (const [t, ps] of Object.entries(cats)) { s += "pnC(" + JSON.stringify(t) + ");\n"; for (const p of ps) { s += "pn(" + [p.nome, p.pt, p.en, p.cod].map(x => JSON.stringify(x)).join(", ") + ");\n";
    if (p.maos) s += "POSE_MAOS[" + JSON.stringify(p.nome) + "] = " + JSON.stringify(p.maos) + ";\n"; if (p.pernas) s += "POSE_PERNAS[" + JSON.stringify(p.nome) + "] = " + JSON.stringify(p.pernas) + ";\n"; } }
  s += "pnRegistrar();\nconst POSES_MIL = " + JSON.stringify(lista.map(p => p.nome)) + ";\nexport { POSES_MIL };\n"; writeFileSync(ARQ, s); }
/* nomes únicos */
{ const vistos = new Set(); for (const p of C) { let n = p.nome.replace(/[^A-Za-z0-9]/g, ""), k = 2; while (vistos.has(n)) n = p.nome + k++; p.nome = n; vistos.add(n); } }
console.log("candidatos:", C.length);
escrever(C);
/* ---------- poda no mundo real ---------- */
const { createWorld } = await import(join(RAIZ, "mcp/lib/core.mjs") + "?t=" + Date.now());
const w = createWorld(), it = w.cena.ativo, P = () => w.SCN.list[w.SCN.active].params, novos = new Set(C.map(p => p.nome));
const K = ["spineFlex", "spineSide", "spineTwist", "pelvisTwist", "bodyPitch", "bodyRoll", "bodyLift", "headYaw", "headPitch", "headRoll"].concat(...["hipFlex", "hipAbd", "hipRot", "kneeFlex", "ankleFlex", "armAbd", "armFlex", "armRot", "elbow"].map(k => [k + "L", k + "R"]));
const vec = {}, ruim = {};
for (const n of w.todasPoses()) { try { it.poseRapida(n, { molejo: 0 }); } catch (e) { if (novos.has(n)) ruim[n] = "erro " + e.message; continue; } const p = P(); vec[n] = K.map(k => +(p[k] || 0) * (k === "bodyLift" ? 10 : 1));
  if (novos.has(n)) { it.poseRapida(n); const v = it.validarPose(), pr = Math.max(0, ...v.atravessa.map(a => a.profundidade)); if (pr > 0.72) ruim[n] = "atravessa " + pr; else if (v.limites.length) ruim[n] = "limites";
    /* deitado flutuando (a mesma conta da auditoria) */
    const p = P(); if (!ruim[n] && (p.bodyLift || 0) < 0.8) { const C = w.capsulas(Object.assign({}, p, { wx: 0, wz: 0, wRot: 0 })).caps; let g = 1e9; for (const c of C) g = Math.min(g, c.a[1] - c.r, c.b[1] - c.r);
      const mid = k => { const c = C.find(x => x.nome === k); return c.a.map((q, i) => (q + c.b[i]) / 2); }, pe = mid("pelve"), pc = mid("pescoco"), vv = pc.map((q, i) => q - pe[i]);
      const incl = Math.acos(Math.abs(vv[1]) / Math.hypot(...vv)) * 180 / Math.PI, tr = C.filter(c => /torax|abdomen|pelve/.test(c.nome)), alt = Math.min(...tr.map(c => Math.min(c.a[1], c.b[1]) - c.r)) - g;
      if (incl > 80 && alt > 2.0) ruim[n] = "flutua " + alt.toFixed(1); } } }
const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
const base = Object.keys(vec).filter(n => !novos.has(n)), aceitos = [];
for (const p of C) { if (ruim[p.nome] || !vec[p.nome]) continue; const v = vec[p.nome]; let m = 1e9; for (const o of base) m = Math.min(m, dist(v, vec[o])); for (const o of aceitos) m = Math.min(m, dist(v, vec[o.nome])); if (m >= 66) aceitos.push(p); }
console.log("ruins:", Object.keys(ruim).length, Object.entries(ruim).slice(0, 8).map(x => x.join(":")).join(" | "));
console.log("aceitos:", aceitos.length, "de", C.length, JSON.stringify(aceitos.reduce((a, p) => (a[p.tag] = (a[p.tag] || 0) + 1, a), {})));
escrever(aceitos);
