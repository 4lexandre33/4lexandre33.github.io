/* GeoMannequin — POSES EXTRAS para quadrinização: combate (guardas, socos, chutes, defesas, armas, impacto, vitória, energia),
   conversa (gestos de fala e escuta), cotidiano e emoção — e EXPRESSÕES novas (mangá e drama). Cada pose é escrita num código
   curto (duas letras + valores; "a,b" = lado esquerdo,direito; o lado ESQUERDO faz o movimento principal e "s = -1" espelha):
     sf spineFlex · ss spineSide · st spineTwist · pt pelvisTwist · bp bodyPitch · br bodyRoll · bl bodyLift
     hf hipFlex · ha hipAbd · hr hipRot · kf kneeFlex · af ankleFlex · ab armAbd · fl armFlex · ar armRot · el elbow · pr pron · wr wrist · hc handCurl
     hy headYaw · hp headPitch · hz headRoll · nf neckFlex · se shElev · sp shProt · m:gestoE,gestoD · e:expressão
   As poses entram no catálogo com etiqueta hierárquica (Combate/Ataque/Chute…) e apelidos em português. */
import { POSES_CORPO, POSE_GRUPOS, POSE_ALIAS, EXPRESSOES, NOMES_EXPRESSOES, BASE_ROSTO } from "./poses.js";
import { TAGS_POSES } from "./acoes-luta.js";
import { aplicarGesto } from "../engine/index.js";

const PX_K = { sf: "spineFlex", ss: "spineSide", st: "spineTwist", pt: "pelvisTwist", bp: "bodyPitch", br: "bodyRoll", bl: "bodyLift", hf: "hipFlex", ha: "hipAbd", hr: "hipRot", kf: "kneeFlex", af: "ankleFlex",
  ab: "armAbd", fl: "armFlex", ar: "armRot", el: "elbow", pr: "pron", wr: "wrist", hc: "handCurl", hy: "headYaw", hp: "headPitch", hz: "headRoll", nf: "neckFlex", se: "shElev", sp: "shProt", to: "toes" };
const PX_LADO = new Set(["hf", "ha", "hr", "kf", "af", "ab", "fl", "ar", "el", "pr", "wr", "hc", "se", "sp", "to"]);
/* "hf30,10 kf20 ..." → {hipFlexL:30, hipFlexR:10, kneeFlexL:20, kneeFlexR:20, ...}; m: gestos; e: expressão */
function pxLer(cod) { const o = {}, x = {}; for (const t of String(cod).trim().split(/\s+/)) { if (!t) continue; if (t.startsWith("m:")) { x.maos = t.slice(2).split(","); continue; } if (t.startsWith("e:")) { x.expr = t.slice(2); continue; }
    const m = /^([a-z]{2})(-?[\d.]+)(?:,(-?[\d.]+))?$/.exec(t); if (!m || !PX_K[m[1]]) throw new Error("pose extra: “" + t + "”"); const k = PX_K[m[1]], a = +m[2], b = m[3] !== undefined ? +m[3] : a;
    if (PX_LADO.has(m[1])) { o[k + "L"] = a; o[k + "R"] = b; } else o[k] = a; } return { o, x }; }
/* espelha: troca L/R e inverte giros e inclinações laterais */
function pxEspelhar(o) { const r = {}; for (const [k, v] of Object.entries(o)) { const m = /^(.*)(L|R)$/.exec(k); if (m && !/^(bodyRoll)$/.test(k)) r[m[1] + (m[2] === "L" ? "R" : "L")] = v; else r[k] = /Yaw|Twist|Side|Roll/.test(k) ? -v : v; } return r; }
const POSES_EXTRA = {}, POSES_EXTRA_INFO = {};
function px(nome, tag, apelidos, cod, desc) { const { o, x } = pxLer(cod);
  POSES_EXTRA[nome] = (Q, s) => { Object.assign(Q, s < 0 ? pxEspelhar(o) : o); if (x.maos) x.maos.forEach((g, i) => { if (g && g !== "-") { const lado = (i === 0 ? 1 : -1) * (s < 0 ? -1 : 1); try { aplicarGesto(Q, lado, g); } catch (e) { } } }); };
  POSES_EXTRA_INFO[nome] = { tag, apelidos: apelidos ? apelidos.split("|") : [], desc: desc || "", expr: x.expr || null }; }

/* ===================== COMBATE ===================== */
/* guardas e posturas */
px("guardaBoxe", "Combate/Guarda/Boxe", "guarda de boxe|guarda boxe", "sf8 hf18,-6 kf22,14 ha8,10 fl55,48 ab18,20 el118,125 ar-10,-10 hp8 nf6 st-12 pt8 m:punho,punho e:determinacao");
px("guardaKarate", "Combate/Guarda/Karatê", "guarda de karatê|kamae", "sf4 hf28,-14 kf34,20 ha10,12 hr-10,20 fl60,20 ab14,30 el40,110 pr-60,-60 hp4 st-20 pt14 m:espalmada,punho e:focoTotal");
px("guardaKungFuGarca", "Combate/Guarda/Kung fu", "garça|postura da garça|kung fu", "sf6 hf95,4 kf110,6 ha12,6 fl150,40 ab90,20 el40,90 wr60,40 hp4 m:gancho,espalmada e:focoTotal");
px("guardaMuayThai", "Combate/Guarda/Muay thai", "muay thai|guarda alta", "sf2 hf10,-4 kf14,10 af10,0 fl92,92 ab12,12 el135,135 ar-20,-20 hp10 m:punho,punho e:determinadoLuta");
px("guardaBaixaProvocando", "Combate/Guarda/Provocação", "guarda baixa|mãos baixas provocando", "sf-4 hf12,-4 kf10,6 fl20,15 ab25,25 el40,30 hp-8 hz-6 m:relaxada,relaxada e:malicia");
px("posturaSumo", "Combate/Guarda/Sumô", "sumô|shiko|base de sumô", "sf18 hf70,70 ha55,55 hr40,40 kf95,95 fl30,30 ab25,25 el20,20 pr-80,-80 hp-6 m:aberta,aberta e:determinacao");
px("guardaEsgrima", "Combate/Guarda/Esgrima", "esgrima|en garde", "sf2 hf40,-12 kf45,18 ha6,14 hr0,60 fl70,10 ab20,110 el40,95 st-55 pt40 hy50 m:segurar,ok e:focoTotal");
px("guardaCapoeira", "Combate/Guarda/Capoeira", "ginga|capoeira", "sf20 hf55,-20 kf70,30 ha20,24 fl80,30 ab40,60 el60,30 st15 hp-4 m:aberta,aberta");
px("guardaNinja", "Combate/Guarda/Ninja", "postura ninja|ninja", "sf30 hf75,35 kf110,80 ha22,30 fl95,45 ab20,25 el95,110 pr-30,0 hp-14 nf-10 m:paz,punho e:sombrio");
px("guardaLutaLivre", "Combate/Guarda/Agarrar", "luta livre|postura de agarre", "sf40 hf60,60 ha20,20 kf70,70 fl70,70 ab30,30 el70,70 hp-25 nf-15 m:garra,garra e:determinadoLuta");
/* socos */
px("jabBaixo", "Combate/Ataque/Soco", "jab no corpo", "sf18 hf40,-8 kf50,20 fl85,60 ab8,20 el5,125 ar-5,-10 st-10 hp12 m:punho,punho e:determinadoLuta");
px("diretoAoCorpo", "Combate/Ataque/Soco", "direto no corpo|soco no estômago", "sf22 hf45,-20 kf55,25 fl50,80 ab20,8 el120,5 st25 pt-15 hp14 m:punho,punho e:esforco");
px("cruzado", "Combate/Ataque/Soco", "soco cruzado|cross", "sf6 hf25,-10 kf30,15 fl60,90 ab20,60 el120,70 ar0,-50 st35 pt-20 hp6 hy-10 m:punho,punho e:furia");
px("ganchoBaixo", "Combate/Ataque/Soco", "gancho no fígado|gancho baixo", "sf20 hf35,-6 kf50,25 fl60,30 ab20,70 el125,90 ar0,-60 st30 ss-8 hp10 m:punho,punho e:esforco");
px("socoGiratorio", "Combate/Ataque/Soco", "backfist|soco girando", "sf4 hf20,-10 kf20,10 fl90,60 ab80,20 el10,125 ar-60,0 st-60 pt-30 hy60 m:punho,punho e:determinadoLuta");
px("socoMartelo", "Combate/Ataque/Soco", "martelada|punho martelo", "sf25 hf30,-10 kf40,20 fl170,40 ab20,20 el30,100 hp20 m:punho,punho e:furia");
px("socoSuperman", "Combate/Ataque/Soco aéreo", "superman punch|soco voador", "bl5 bp20 sf-6 hf-20,50 kf60,80 fl160,40 ab5,30 el5,120 hp-6 m:punho,punho e:gritoDeGuerra");
px("socoDuplo", "Combate/Ataque/Soco", "soco duplo|dois punhos", "sf12 hf35,-10 kf40,20 fl90,90 ab10,10 el5,5 hp6 m:punho,punho e:gritoDeGuerra");
px("socoNoChao", "Combate/Ataque/Soco aéreo", "soco no chão|impacto no solo", "sf55 hf100,30 kf120,90 ha20,30 fl60,40 ab20,40 el10,90 hp30 m:punho,aberta e:gritoDeGuerra");
/* chutes */
px("chuteFrontal", "Combate/Ataque/Chute", "chute frontal|mae geri", "sf-10 hf95,-6 kf20,10 af30,0 fl50,60 ab30,20 el100,110 hp-6 m:punho,punho e:determinadoLuta");
px("chuteEmpurrao", "Combate/Ataque/Chute", "teep|chute empurrão", "sf-22 bp-6 hf85,-4 kf5,15 af-10,0 fl40,70 ab40,20 el60,110 hp-10 m:punho,punho e:determinacao");
px("chuteCircularBaixo", "Combate/Ataque/Chute", "low kick|chute na perna", "sf-4 hf40,-4 ha55,8 hr30,0 kf20,15 fl50,80 ab50,10 el90,120 st-40 pt-45 hy30 m:punho,punho e:determinadoLuta");
px("chuteCircularMedio", "Combate/Ataque/Chute", "chute circular|mawashi", "sf-8 ss-25 hf60,-4 ha85,8 hr40,0 kf25,10 fl30,80 ab80,10 el60,120 st-40 pt-60 hy40 m:punho,punho e:gritoDeGuerra");
px("chuteGancho", "Combate/Ataque/Chute", "chute gancho|hook kick", "ss-35 bp-10 hf45,-2 ha95,6 hr-20,0 kf70,8 fl40,70 ab70,30 el80,110 st30 hy50 m:punho,punho e:focoTotal");
px("chuteCrescente", "Combate/Ataque/Chute", "chute crescente|meia-lua", "sf-6 hf130,-2 ha40,6 kf5,10 fl30,40 ab70,40 el30,80 hp-14 m:aberta,punho e:determinadoLuta");
px("chuteParaTras", "Combate/Ataque/Chute", "chute para trás|ushiro geri", "bp45 sf10 hf-60,40 kf20,40 af-30,10 fl40,60 ab40,30 el100,110 hy-150 hp-20 m:punho,punho e:focoTotal");
px("joelhadaVoadora", "Combate/Ataque/Golpe curto", "joelhada voadora|joelhada pulando", "bl6 sf10 hf120,-20 kf140,60 fl110,110 ab25,25 el110,110 hp10 m:garra,garra e:gritoDeGuerra");
px("pisao", "Combate/Ataque/Chute", "pisão|pisotear", "sf10 hf60,-4 kf40,10 af-20,0 fl40,40 ab30,30 el80,80 hp30 m:punho,punho e:furia");
/* defesas */
px("bloqueioAlto", "Combate/Defesa/Bloqueio", "bloqueio alto|age uke", "sf4 hf25,-8 kf30,14 fl140,50 ab40,20 el80,115 ar-40,0 hp6 m:punho,punho e:determinacao");
px("bloqueioBaixo", "Combate/Defesa/Bloqueio", "bloqueio baixo|gedan barai", "sf10 hf30,-10 kf40,15 fl20,60 ab40,20 el10,120 hp14 m:punho,punho e:focoTotal");
px("bloqueioInterno", "Combate/Defesa/Bloqueio", "bloqueio de antebraço", "sf6 hf20,-6 kf26,12 fl80,50 ab50,20 el100,120 ar-40,0 st-15 m:punho,punho e:determinacao");
px("aparar", "Combate/Defesa/Aparar", "aparar|desviar o golpe", "sf4 hf22,-6 kf26,10 fl80,40 ab40,30 el50,110 pr-60,0 st-25 hy10 m:espalmada,punho e:focoTotal");
px("cobertura", "Combate/Defesa/Cobertura", "fechar a guarda|tartaruga", "sf28 hf30,20 kf40,40 fl110,110 ab8,8 el145,145 ar-30,-30 hp25 nf20 m:punho,punho e:esforco");
px("esquivaParaTras", "Combate/Defesa/Esquiva", "esquiva para trás|matrix", "sf-35 bp-15 hf20,-10 kf45,30 fl40,40 ab50,50 el60,60 hp-25 m:aberta,aberta e:surpresa");
px("esquivaLateral", "Combate/Defesa/Esquiva", "pêndulo|esquiva de lado", "ss-28 sf10 hf30,10 kf40,25 ha10,20 fl70,60 ab20,20 el120,125 hp6 hz-10 m:punho,punho e:focoTotal");
px("rolamentoParaTras", "Combate/Defesa/Rolamento", "rolamento para trás", "bp-120 sf50 hf120,120 kf120,120 fl60,60 ab20,20 el90,90 hp30 m:punho,punho");
px("protegendoRosto", "Combate/Defesa/Cobertura", "protegendo o rosto|braços na frente", "sf20 hf15,15 kf20,20 fl100,100 ab-20,-20 el120,120 ar-50,-50 hp20 hy-20 m:aberta,aberta e:medo");
/* espada */
px("espadaGuardaMedia", "Combate/Armas/Espada", "guarda de espada|chudan", "sf4 hf25,-8 kf28,14 fl55,58 ab5,8 el45,50 ar-30,30 wr-30,-30 hp4 m:segurar,segurar e:focoTotal");
px("espadaGuardaAlta", "Combate/Armas/Espada", "jodan|espada acima da cabeça", "sf-4 hf25,-8 kf28,14 fl165,160 ab5,8 el60,60 wr-20,-20 hp-4 m:segurar,segurar e:determinadoLuta");
px("espadaEstocada", "Combate/Armas/Espada", "estocada|investida com espada", "sf14 hf70,-20 kf80,10 fl90,20 ab10,80 el5,40 hp0 st-20 m:segurar,aberta e:gritoDeGuerra");
px("espadaCorteDescendente", "Combate/Armas/Espada", "corte de cima|corte descendente", "sf30 hf55,-10 kf60,20 fl60,55 ab5,10 el10,15 wr30,30 hp14 m:segurar,segurar e:gritoDeGuerra");
px("espadaCorteHorizontal", "Combate/Armas/Espada", "corte horizontal|golpe lateral", "sf8 hf30,-10 kf35,15 fl90,30 ab80,40 el10,90 st50 pt-25 hy-30 m:segurar,aberta e:furia");
px("espadaDefesa", "Combate/Armas/Espada", "defesa com espada|aparar com lâmina", "sf8 hf28,-8 kf30,15 fl120,110 ab20,15 el70,75 ar-40,40 hp8 m:segurar,segurar e:esforco");
px("espadaSaque", "Combate/Armas/Espada", "iaido|saque da espada", "sf20 hf50,-10 kf60,20 fl40,30 ab30,10 el60,110 ar0,40 st35 hp10 m:segurar,segurar e:sombrio");
px("espadaEmbainhando", "Combate/Armas/Espada", "embainhar|guardar a espada", "sf2 fl20,30 ab25,15 el95,100 ar40,0 hp20 hy15 m:segurar,segurar e:determinacao");
px("espadaApoiadaNoChao", "Combate/Armas/Espada", "espada fincada|apoiado na espada", "sf4 fl35,35 ab5,5 el30,30 hp10 m:segurar,segurar e:orgulho");
/* lança, bastão, arco, arma de fogo */
px("lancaGuarda", "Combate/Armas/Lança", "guarda de lança|bastão em guarda", "sf6 hf30,-10 kf35,15 fl50,80 ab20,15 el80,30 ar0,-30 st-25 m:segurar,segurar e:focoTotal");
px("lancaEstocada", "Combate/Armas/Lança", "estocada de lança", "sf16 hf65,-20 kf75,10 fl80,95 ab15,10 el20,40 st-30 pt15 m:segurar,segurar e:gritoDeGuerra");
px("bastaoGirando", "Combate/Armas/Bastão", "girar o bastão|bastão acima", "sf2 hf20,-6 kf22,10 fl150,95 ab70,30 el20,60 hp-6 m:segurar,segurar e:malicia");
px("arcoPuxando", "Combate/Armas/Arco", "puxando o arco|arco armado", "hf10,-4 kf10,6 fl90,90 ab90,85 el0,150 ar0,-60 st-80 pt-30 hy85 hp4 m:segurar,pinca e:focoTotal");
px("arcoSacandoFlecha", "Combate/Armas/Arco", "pegando flecha", "fl60,150 ab20,30 el40,140 ar0,-60 hy-20 hp-10 m:segurar,pinca e:determinacao");
px("armaDuasMaos", "Combate/Armas/Arma de fogo", "mirando com as duas mãos|pistola duas mãos", "sf8 hf15,-6 kf20,12 fl90,90 ab25,30 el5,20 ar-30,30 hp6 m:segurar,segurar e:focoTotal");
px("armaUmaMao", "Combate/Armas/Arma de fogo", "mirando com uma mão", "hf8,-4 kf10,6 fl90,10 ab90,15 el0,20 st-60 pt-30 hy80 m:apontar,relaxada e:determinacao");
px("armaCoberturaParede", "Combate/Armas/Arma de fogo", "encostado com a arma|cobertura", "sf6 hf30,30 kf40,40 fl150,70 ab20,40 el140,130 hy60 m:segurar,aberta e:focoTotal");
px("armaRecarregando", "Combate/Armas/Arma de fogo", "recarregando", "sf20 fl60,50 ab20,30 el100,110 ar-30,30 hp30 m:segurar,segurar e:esforco");
/* impacto recebido */
px("atingidoCostas", "Combate/Impacto/Atingido", "atingido pelas costas", "sf-30 bp10 hf-20,30 kf20,40 fl-40,-30 ab50,50 el30,30 hp-40 m:aberta,aberta e:dor");
px("atingidoLado", "Combate/Impacto/Atingido", "golpe de lado|atingido no lado", "ss40 sf10 hf10,30 kf20,40 ha30,10 fl30,60 ab60,20 el40,90 hz30 hy-20 m:aberta,aberta e:dor");
px("caindoDeJoelhos", "Combate/Impacto/Queda", "cai de joelhos|joelhos no chão", "kf95,95 hf0,0 af45,45 sf20 fl20,20 ab20,20 el30,30 hp35 m:relaxada,relaxada e:dor");
px("nocauteadoSentado", "Combate/Impacto/Nocaute", "nocauteado|apagado encostado", "hf85,80 kf20,40 ha20,25 sf-20 fl0,10 ab30,20 el10,20 hp30 hz30 m:relaxada,relaxada e:olharVazio");
px("cuspindoSangue", "Combate/Impacto/Ferido", "ferido curvado|segurando a barriga", "sf55 hf25,15 kf30,25 fl50,30 ab20,20 el110,90 hp35 m:aberta,aberta e:dor");
px("arremessadoAlto", "Combate/Impacto/Arremessado", "lançado para o alto", "bl12 bp-40 sf-30 hf20,40 kf30,60 fl150,120 ab60,70 el20,30 hp-30 m:aberta,aberta e:choque");
/* entradas, vitória, vilão */
px("entradaHeroica", "Combate/Pose/Entrada", "entrada heroica|chegada do herói", "sf-4 hf8,-6 kf6,4 ha14,14 fl0,0 ab30,30 el10,10 hp-10 m:punho,punho e:orgulho");
px("apontandoInimigo", "Combate/Pose/Desafio", "apontando o inimigo|desafio", "sf6 hf25,-6 kf20,8 fl90,20 ab10,30 el0,90 hp4 st-15 m:apontar,punho e:determinadoLuta");
px("punhoAFrente", "Combate/Pose/Desafio", "punho à frente|promessa", "sf-2 hf20,-6 kf15,6 fl90,10 ab10,20 el20,30 hp-4 m:punho,punho e:determinacao");
px("viloesBracosCruzados", "Combate/Pose/Vilão", "vilão de braços cruzados|braços cruzados superior", "sf-8 hf4,-4 fl45,45 ab20,20 el120,120 ar60,60 hp-15 m:cruzados,cruzados e:desprezo");
px("risadaVila", "Combate/Pose/Vilão", "risada de vilão|ohohoho", "sf-25 fl130,70 ab20,40 el120,100 wr-40,0 hp-35 m:aberta,punho e:sorrisoManiaco");
px("transformacao", "Combate/Pose/Transformação", "transformação|power up de braços abertos", "sf-20 hf10,10 kf20,20 ha20,20 fl20,20 ab70,70 el40,40 hp-30 m:punho,punho e:gritoDeGuerra");
px("pousoAgachadoMaoNoChao", "Combate/Pose/Entrada", "pouso agachado|aterrissagem com mão no chão", "sf40 hf110,40 kf130,100 ha25,30 fl50,40 ab30,70 el10,20 hp-20 m:aberta,aberta e:determinadoLuta");
px("vitoriaPunhoErguido", "Combate/Pose/Vitória", "vitória punho para cima|campeão", "sf-10 hf5,-4 fl170,15 ab10,20 el10,30 hp-25 m:punho,relaxada e:riso");
px("vitoriaAjoelhada", "Combate/Pose/Vitória", "ajoelhado vitorioso", "kf95,20 hf0,90 af45,0 sf-15 fl160,160 ab10,10 el10,10 hp-35 m:punho,punho e:gritoDeGuerra");
px("costasParaCamera", "Combate/Pose/Silhueta", "de costas épico|olhando o horizonte", "hf4,-2 fl5,5 ab15,15 el10,10 hp-6 m:relaxada,punho e:determinacao");
/* energia */
px("energiaConchaLado", "Combate/Energia/Concha", "kamehameha carregando|mãos em concha", "sf10 hf40,-10 kf55,25 ha20,20 fl30,40 ab20,30 el100,90 ar60,-60 st-45 hy30 m:garra,garra e:gritoDeGuerra");
px("energiaRajadaUmBraco", "Combate/Energia/Rajada", "rajada de uma mão|disparo de energia", "sf4 hf30,-10 kf30,10 fl90,30 ab10,40 el0,100 wr-60,0 st-20 m:espalmada,punho e:furia");
px("energiaDuasMaosAFrente", "Combate/Energia/Rajada", "rajada com as duas mãos", "sf10 hf35,-10 kf40,20 fl90,90 ab10,10 el0,0 wr-70,-70 m:espalmada,espalmada e:gritoDeGuerra");
px("energiaAuraConcentrando", "Combate/Energia/Aura", "concentrando aura|punhos ao lado", "sf8 hf25,25 ha25,25 kf35,35 fl10,10 ab35,35 el80,80 hp-10 m:punho,punho e:esforco");
px("energiaEsferaUmaMao", "Combate/Energia/Esfera", "esfera na palma|rasengan", "sf10 hf35,-10 kf45,20 fl70,30 ab30,20 el60,120 pr-90,0 hp15 m:garra,punho e:focoTotal");
px("selosDeMao", "Combate/Energia/Selos", "selos de mão|jutsu", "sf4 fl60,60 ab10,10 el120,120 ar40,-40 hp10 m:paz,paz e:focoTotal");
/* saltos de combate */
px("saltoComEspada", "Combate/Salto/Espada", "salto com espada|ataque aéreo", "bl10 sf20 hf90,40 kf110,120 fl170,165 ab10,10 el50,50 hp-10 m:segurar,segurar e:gritoDeGuerra");
px("voadoraDupla", "Combate/Salto/Chute", "voadora|dois pés", "bl10 bp-40 sf-10 hf80,80 kf10,10 fl60,60 ab50,50 el90,90 hp10 m:punho,punho e:gritoDeGuerra");
px("cambalhotaNoAr", "Combate/Salto/Acrobacia", "cambalhota|mortal", "bl14 bp-160 sf70 hf130,130 ha30,30 kf140,140 fl80,80 ab10,10 el120,120 hp40 m:punho,punho");
px("saltoDesviando", "Combate/Salto/Esquiva", "pulando para trás desviando", "bl8 bp-20 sf-10 hf60,10 kf90,40 fl80,40 ab60,80 el40,40 hp10 m:aberta,aberta e:surpresa");

/* ===================== CONVERSA ===================== */
px("explicandoComMaos", "Conversa/Falar/Explicar", "explicando|gesticulando", "sf4 fl40,45 ab20,22 el90,85 pr-70,-60 hp4 hy6 m:aberta,aberta e:pensativo");
px("contandoNosDedos", "Conversa/Falar/Explicar", "contando nos dedos|enumerando", "sf6 fl35,45 ab15,15 el110,100 pr-30,-60 hp14 m:apontar,paz e:pensativo");
px("apontandoParaSi", "Conversa/Falar/Eu", "eu?|apontando para mim", "sf-4 fl30,5 ab5,15 el130,10 ar60,0 hp-4 m:apontar,relaxada e:surpresa");
px("maosAbertasSinceras", "Conversa/Falar/Sinceridade", "mãos abertas|sinceridade", "sf6 fl30,30 ab25,25 el80,80 pr-90,-90 hp6 m:aberta,aberta e:alivio");
px("encolhendoOmbros", "Conversa/Reação/Dúvida", "encolher os ombros|sei lá", "se0.8,0.8 fl20,20 ab25,25 el95,95 pr-90,-90 hz10 m:aberta,aberta e:confusao");
px("maoNoPeitoJuramento", "Conversa/Falar/Juramento", "mão no peito|eu juro", "sf-2 fl50,5 ab10,12 el130,10 ar40,0 hp-6 m:aberta,relaxada e:determinacao");
px("maoNoQueixo", "Conversa/Ouvir/Pensar", "pensando mão no queixo", "sf4 fl60,35 ab10,30 el140,120 ar30,60 hp8 hy10 m:punho,relaxada e:pensativo");
px("bracosCruzadosOuvindo", "Conversa/Ouvir/Fechado", "braços cruzados ouvindo|desconfiado", "sf-4 fl40,40 ab18,18 el125,125 ar55,55 hp4 hz6 m:relaxada,relaxada e:desconfianca");
px("inclinadoAtento", "Conversa/Ouvir/Atento", "ouvindo atento|inclinado para ouvir", "sf16 fl10,10 ab14,14 el30,30 hp10 hz-12 m:relaxada,relaxada e:focoTotal");
px("cochichandoMaoNaBoca", "Conversa/Falar/Segredo", "cochichando|segredo", "sf18 ss8 fl75,5 ab30,12 el135,10 ar-20,0 hp10 hz12 m:aberta,relaxada e:malicia");
px("dedoNosLabios", "Conversa/Falar/Silêncio", "shh|silêncio", "fl65,5 ab12,12 el140,10 ar20,0 hp4 m:apontar,relaxada e:malicia");
px("maoNaTesta", "Conversa/Reação/Frustração", "facepalm|mão na testa", "sf18 fl80,10 ab20,15 el145,10 hp30 m:aberta,relaxada e:cansaco");
px("cocandoACabeca", "Conversa/Reação/Sem graça", "coçando a cabeça|sem graça", "fl150,5 ab40,15 el130,10 hz12 hp6 m:garra,relaxada e:vergonha");
px("maosNaCinturaBravo", "Conversa/Falar/Bronca", "mãos na cintura bravo|bronca", "sf8 fl-10,-10 ab45,45 el110,110 ar-70,-70 hp10 m:punho,punho e:raiva");
px("apontandoAcusando", "Conversa/Falar/Acusação", "acusando|foi você", "sf10 hf15,-4 fl95,5 ab10,12 el0,20 hp6 st-10 m:apontar,punho e:raiva");
px("gesticulandoBravo", "Conversa/Falar/Discussão", "discutindo|brigando com palavras", "sf14 fl70,40 ab40,20 el70,100 pr-70,0 hp4 m:garra,punho e:furia");
px("pedindoMaoEstendida", "Conversa/Falar/Pedido", "mão estendida pedindo|me dá", "sf8 fl70,5 ab10,12 el25,10 pr-90,0 hp6 m:aberta,relaxada e:determinacao");
px("implorandoMaosJuntas", "Conversa/Falar/Pedido", "implorando|por favor", "sf20 fl60,60 ab5,5 el110,110 hp-10 kf20,20 m:aberta,aberta e:tristeza");
px("acenandoDeLonge", "Conversa/Saudação/Aceno", "acenando de longe|oi!", "fl10,160 ab15,30 el10,20 hp-6 m:relaxada,acenar e:alegria");
px("chamandoComAMao", "Conversa/Saudação/Chamar", "vem cá|chamando", "fl60,5 ab15,12 el90,10 pr-90,0 wr40,0 m:garra,relaxada e:malicia");
px("dispensandoComAMao", "Conversa/Reação/Desdém", "deixa pra lá|dispensando", "sf-4 fl40,5 ab40,12 el60,10 pr90,0 hy-20 hp-6 m:aberta,relaxada e:desprezo");
px("polegarParaCima", "Conversa/Reação/Aprovação", "joinha|beleza", "fl60,5 ab10,12 el90,10 hp-4 m:joinha,relaxada e:alegria");
px("sinalOk", "Conversa/Reação/Aprovação", "ok|tudo certo", "fl50,5 ab20,12 el120,10 m:ok,relaxada e:piscando");
px("maoNoBolsoRelaxado", "Conversa/Ouvir/Relaxado", "uma mão no bolso", "ss4 fl-5,40 ab14,20 el20,90 ar0,40 hz-4 m:relaxada,relaxada e:neutra");
px("maosNosBolsos", "Conversa/Ouvir/Relaxado", "mãos nos bolsos", "sf-2 fl-8,-8 ab12,12 el25,25 ar30,30 hp4 m:relaxada,relaxada e:tedio");
px("encostadoBracosCruzados", "Conversa/Ouvir/Fechado", "encostado de braços cruzados", "sf-8 hf20,0 kf35,0 hr40,0 fl40,40 ab18,18 el125,125 ar55,55 hp-4 hy15 m:relaxada,relaxada e:tedio");
px("celularNoOuvido", "Conversa/Telefone", "falando ao celular|telefone", "fl50,5 ab45,12 el145,10 ar-20,0 hz12 m:telefone,relaxada e:neutra");
px("olhandoOCelular", "Conversa/Telefone", "mexendo no celular|olhando o celular", "sf8 fl45,40 ab10,12 el100,95 pr-60,-40 hp35 m:segurar,apontar e:tedio");
px("maoAtrasDaCabeca", "Conversa/Reação/Sem graça", "mão atrás da cabeça|desculpa", "fl150,5 ab90,15 el150,10 hz10 m:aberta,relaxada e:vergonha");
px("maosAtrasDasCostas", "Conversa/Ouvir/Formal", "mãos para trás|formal", "sf-4 fl-25,-25 ab10,10 el50,50 ar40,40 hp-2 m:relaxada,segurar e:neutra");
px("reverenciaJaponesa", "Conversa/Saudação/Reverência", "reverência|ojigi", "sf55 fl-5,-5 ab8,8 el5,5 hp10 m:relaxada,relaxada e:neutra");
px("reverenciaLeve", "Conversa/Saudação/Reverência", "cumprimento com a cabeça|leve reverência", "sf18 hp20 fl0,0 ab10,10 m:relaxada,relaxada e:alegria");
px("continencia", "Conversa/Saudação/Continência", "continência|saudação militar", "fl80,0 ab70,8 el130,0 wr10,0 hp-2 m:espalmada,relaxada e:determinacao");
px("negandoComDedo", "Conversa/Reação/Negação", "não não|dedo negando", "fl60,5 ab15,12 el100,10 hz-8 m:apontar,relaxada e:malicia");
px("apresentandoBracoAberto", "Conversa/Falar/Apresentar", "apresentando|eis aqui", "fl40,10 ab60,14 el20,15 pr-80,0 hy25 m:aberta,relaxada e:orgulho");
px("discursando", "Conversa/Falar/Discurso", "orador|discurso", "sf-6 fl120,40 ab40,20 el40,90 pr-60,0 hp-12 m:aberta,punho e:determinacao");
px("olharDeLado", "Conversa/Ouvir/Desconfiança", "olhar de canto|desconfiado de lado", "fl0,30 ab14,15 el10,110 ar0,50 hy-35 hp6 m:relaxada,relaxada e:desconfianca");
px("maoEstendidaApertar", "Conversa/Saudação/Aperto", "estendendo a mão|prazer", "sf6 fl60,0 ab12,12 el25,10 pr10,0 m:aberta,relaxada e:alegria");
px("abracoAberto", "Conversa/Saudação/Abraço", "braços abertos para abraçar|vem aqui", "sf-4 fl50,50 ab60,60 el30,30 hp-6 m:aberta,aberta e:riso");

/* ===================== COTIDIANO E EMOÇÃO ===================== */
px("desesperoMaosNaCabeca", "Emoção/Desespero", "desespero|mãos na cabeça", "sf20 fl120,120 ab20,20 el140,140 hp20 m:garra,garra e:choro");
px("ajoelhadoChorando", "Emoção/Tristeza/Choro", "ajoelhado chorando", "kf95,95 hf0,0 af40,40 sf40 fl90,90 ab20,20 el145,145 hp45 m:aberta,aberta e:choro");
px("encolhidoComMedo", "Emoção/Medo", "encolhido de medo|tremendo", "sf35 hf40,40 kf60,60 fl90,90 ab10,10 el140,140 ar60,60 hp30 hy-20 m:punho,punho e:medo");
px("abracandoASiMesmo", "Emoção/Tristeza/Solidão", "abraçando a si mesmo|com frio", "sf15 fl45,45 ab20,20 el130,130 ar60,60 hp20 m:aberta,aberta e:tristeza");
px("cabisbaixoAndando", "Emoção/Tristeza/Derrota", "andando cabisbaixo", "sf18 hf20,-6 kf20,6 fl-5,10 ab8,8 el10,15 hp35 m:relaxada,relaxada e:tristeza");
px("bracosParaCimaAlegria", "Emoção/Alegria/Celebração", "braços para cima|viva!", "sf-15 fl170,170 ab20,20 el15,15 hp-30 m:aberta,aberta e:riso");
px("pulandoDeAlegria", "Emoção/Alegria/Celebração", "pulando de alegria", "bl6 sf-10 hf40,10 kf90,60 fl160,150 ab30,30 el20,20 hp-25 m:punho,punho e:riso");
px("dancandoAlegre", "Emoção/Alegria/Dança", "dançando|dancinha", "ss12 hf35,-4 kf40,10 fl110,40 ab40,40 el70,90 hz10 m:apontar,punho e:alegria");
px("cansadoMaosNosJoelhos", "Emoção/Cansaço", "ofegante|mãos nos joelhos", "sf55 hf35,35 kf30,30 fl60,60 ab10,10 el20,20 hp-10 m:aberta,aberta e:cansaco");
px("deitadoOlhandoOCeu", "Cotidiano/Descanso", "deitado olhando o céu|mãos atrás da cabeça", "bp-90 fl170,170 ab0,0 el130,130 kf40,0 hf35,0 hp-5 m:relaxada,relaxada e:alivio");
px("sentadoNaEscadaPensativo", "Cotidiano/Sentado/Pensativo", "sentado pensativo|cotovelos nos joelhos", "hf100,100 kf110,110 sf30 fl70,70 ab20,20 el120,120 hp15 m:punho,aberta e:pensativo");
px("sentadoLendo", "Cotidiano/Sentado/Ler", "sentado lendo|lendo livro", "hf90,90 kf90,90 sf20 fl50,50 ab18,18 el100,100 pr-60,-60 hp35 m:segurar,segurar e:focoTotal");
px("sentadoNoCelular", "Cotidiano/Sentado/Celular", "sentado no celular", "hf90,90 kf90,90 sf25 fl40,35 ab15,12 el110,100 pr-50,-40 hp40 m:segurar,apontar e:tedio");
px("espreguicando", "Cotidiano/Corpo", "espreguiçando|alongando", "sf-12 fl175,175 ab10,10 el10,10 hp-25 m:aberta,aberta e:sono");
px("bocejando", "Cotidiano/Corpo", "bocejando", "sf-6 fl120,5 ab30,12 el140,10 hp-20 m:aberta,relaxada e:sono");
px("olhandoORelogio", "Cotidiano/Tempo", "olhando o relógio|atrasado", "fl70,60 ab15,12 el100,90 ar0,-40 pr-60,0 hp30 hy5 m:relaxada,relaxada e:nervoso");
px("procurandoMaoNosOlhos", "Cotidiano/Procurar", "procurando ao longe|mão na testa olhando", "sf-4 fl120,5 ab45,12 el110,10 pr-90,0 hp-10 m:espalmada,relaxada e:focoTotal");
px("espiando", "Cotidiano/Esconder", "espiando|olhando escondido", "sf20 ss-20 hf20,20 kf30,30 fl80,60 ab20,20 el90,100 hp10 hz-15 m:garra,garra e:desconfianca");
px("escondidoAgachado", "Cotidiano/Esconder", "escondido agachado", "hf120,120 kf140,140 sf35 fl70,70 ab10,10 el140,140 hp20 m:aberta,aberta e:medo");
px("correndoAssustado", "Emoção/Medo/Fuga", "fugindo olhando para trás", "bp20 sf10 hf80,-30 kf80,40 fl-50,80 ab30,30 el60,90 hy-80 m:aberta,aberta e:choqueComico");
px("tropecando", "Cotidiano/Acidente", "tropeçando|caindo para a frente", "bp40 sf20 hf-20,60 kf20,70 fl140,120 ab40,40 el20,20 hp-30 m:aberta,aberta e:surpresaTotal");
px("escorregando", "Cotidiano/Acidente", "escorregando|perdendo o equilíbrio", "bp-30 hf80,-20 kf20,30 fl120,60 ab80,90 el20,20 hp-20 m:aberta,aberta e:choqueComico");
px("carregandoCaixa", "Cotidiano/Trabalho/Carregar", "carregando caixa", "sf-8 fl70,70 ab20,20 el80,80 pr-80,-80 hp-6 m:aberta,aberta e:esforco");
px("empurrandoPesado", "Cotidiano/Trabalho/Empurrar", "empurrando algo pesado", "bp30 sf10 hf50,-30 kf60,10 fl100,100 ab10,10 el40,40 wr-60,-60 hp-15 m:espalmada,espalmada e:esforco");
px("puxandoCorda", "Cotidiano/Trabalho/Puxar", "puxando a corda|cabo de guerra", "bp-25 sf-10 hf60,10 kf60,20 fl60,50 ab10,10 el30,40 hp10 m:segurar,segurar e:esforco");
px("varrendo", "Cotidiano/Casa", "varrendo", "sf20 fl40,60 ab20,15 el60,30 ar30,-30 st20 hp30 m:segurar,segurar e:neutra");
px("cozinhandoMexendo", "Cotidiano/Casa", "cozinhando|mexendo a panela", "sf15 fl50,40 ab20,15 el110,90 hp35 m:segurar,segurar e:alegria");
px("escrevendoEmPe", "Cotidiano/Trabalho/Escrever", "escrevendo de pé|anotando", "sf12 fl40,50 ab12,15 el110,90 pr-60,-30 hp35 m:segurar,pinca e:focoTotal");
px("digitandoSentado", "Cotidiano/Trabalho/Computador", "digitando|no computador", "hf90,90 kf90,90 sf12 fl40,40 ab12,12 el95,95 pr-80,-80 wr10,10 hp15 m:aberta,aberta e:focoTotal");
px("pintandoCavalete", "Cotidiano/Arte", "pintando|artista no cavalete", "sf6 fl90,30 ab30,15 el50,100 pr-30,0 hp10 hy-10 m:pinca,segurar e:focoTotal");
px("tocandoViolaoSentado", "Cotidiano/Música", "tocando violão", "hf90,90 kf90,90 sf15 fl40,50 ab30,20 el120,80 ar0,40 hp25 hy-15 m:garra,pinca e:encantado");
px("cantandoMicrofone", "Cotidiano/Música", "cantando|com microfone", "sf-10 fl75,120 ab15,60 el140,30 hp-15 m:segurar,aberta e:riso");
px("fotografando", "Cotidiano/Fotografar", "tirando foto|câmera no olho", "fl80,80 ab25,40 el130,140 hp5 m:segurar,segurar e:focoTotal");
px("bebendoGarrafa", "Cotidiano/Comer e beber", "bebendo|garrafa na boca", "sf-12 fl100,5 ab25,12 el130,10 hp-30 m:segurar,relaxada e:alivio");
px("comendoSanduiche", "Cotidiano/Comer e beber", "comendo|mordendo um sanduíche", "fl70,60 ab15,15 el140,130 hp5 m:segurar,segurar e:alegria");
px("dormindoSentado", "Cotidiano/Descanso", "cochilando sentado|dormindo sentado", "hf90,90 kf90,90 sf20 fl10,10 ab15,15 el30,30 hp40 hz20 m:relaxada,relaxada e:sono");
px("deitadoDeBrucosLendo", "Cotidiano/Descanso", "deitado de bruços lendo", "bp75 sf-30 fl90,90 ab10,10 el100,100 kf80,60 hp-25 m:segurar,segurar e:focoTotal");
px("rezando", "Cotidiano/Fé", "rezando|mãos juntas", "fl55,55 ab5,5 el120,120 hp30 m:aberta,aberta e:pensativo");
px("ajoelhadoRezando", "Cotidiano/Fé", "ajoelhado rezando", "kf95,95 hf0,0 af40,40 fl55,55 ab5,5 el120,120 hp30 m:aberta,aberta e:pensativo");
px("meditando", "Cotidiano/Fé", "meditando|lótus", "hf84,84 ha30,30 hr45,45 kf148,142 fl20,20 ab18,18 el30,30 pr-90,-90 hp5 m:ok,ok e:alivio");
px("tirandoSelfie", "Cotidiano/Fotografar", "selfie", "fl120,40 ab40,20 el20,100 pr-60,0 hy20 hz-12 m:segurar,paz e:piscando");
px("segurandoGuardaChuva", "Cotidiano/Clima", "guarda-chuva|na chuva", "fl60,5 ab20,12 el100,10 hp10 m:segurar,relaxada e:tedio");
px("acenandoAdeusTriste", "Emoção/Tristeza/Despedida", "adeus triste|despedida", "sf6 fl10,90 ab12,20 el10,60 hp15 m:relaxada,aberta e:tristeza");
px("maosNoVidro", "Cotidiano/Janela", "olhando pela janela|mãos no vidro", "sf10 fl110,110 ab25,25 el60,60 wr-70,-70 hp0 m:espalmada,espalmada e:tristeza");
px("saltitando", "Emoção/Alegria/Movimento", "saltitando|pulinhos", "bl3 hf50,-10 kf80,20 fl40,-20 ab30,20 el80,60 hp-10 m:punho,aberta e:alegria");
px("girandoBracosAbertos", "Emoção/Alegria/Liberdade", "girando de braços abertos", "sf-12 fl20,20 ab95,95 el5,5 hp-30 hz10 m:aberta,aberta e:encantado");
px("timidaPesParaDentro", "Emoção/Vergonha", "tímida|pés para dentro", "hr-25,-25 kf12,12 fl10,10 ab10,10 el60,60 ar60,60 hp25 hz10 m:segurar,segurar e:vergonha");
px("maosNoRostoVergonha", "Emoção/Vergonha", "mãos no rosto|que vergonha", "sf15 fl80,80 ab20,20 el150,150 hp20 m:aberta,aberta e:vergonha");
px("derrotadoOmbrosCaidos", "Emoção/Tristeza/Derrota", "derrotado|ombros caídos", "sf25 fl-5,-5 ab5,5 el5,5 se-0.5,-0.5 hp40 m:relaxada,relaxada e:olharVazio");
px("punhoCerradoDeterminado", "Emoção/Determinação", "punho cerrado|eu consigo", "sf8 fl60,5 ab15,12 el130,10 hp10 m:punho,punho e:determinacao");
px("modeloMaoNoQuadril", "Cotidiano/Pose/Modelo", "pose de modelo", "ss10 hf10,-4 kf15,0 hr0,30 fl-10,30 ab40,20 el110,40 ar-70,0 hz-8 m:punho,relaxada e:orgulho");
px("sentadoPernasCruzadas", "Cotidiano/Sentado/Cadeira", "sentado de pernas cruzadas", "hf90,105 kf90,90 ha5,-10 hr0,20 sf-4 fl10,30 ab15,15 el40,80 hp4 m:relaxada,relaxada e:neutra");
px("sentadoEncostadoParede", "Cotidiano/Sentado/Chão", "sentado no chão encostado", "hf85,60 kf100,20 sf-10 fl20,10 ab25,20 el60,30 hp20 m:relaxada,relaxada e:cansaco");
px("deitadoFetal", "Emoção/Tristeza/Solidão", "posição fetal|encolhido deitado", "br88 hf100,95 kf120,120 sf40 fl90,90 ab20,20 el140,140 hp30 m:punho,punho e:choro");
px("correndoBracosAbertos", "Emoção/Alegria/Reencontro", "correndo para abraçar|reencontro", "bp15 hf70,-20 kf80,30 fl60,60 ab60,60 el20,20 hp-15 m:aberta,aberta e:riso");
px("bracosCruzadosEmburrado", "Emoção/Raiva/Birra", "emburrado|birra", "sf-6 fl45,45 ab20,20 el125,125 ar55,55 hy-35 hp-10 m:relaxada,relaxada e:raiva");
px("chocadoMaosNaBoca", "Emoção/Surpresa", "mãos na boca|chocado", "sf6 fl80,80 ab10,10 el150,150 hp4 m:aberta,aberta e:choque");
px("apontandoRindo", "Emoção/Alegria/Riso", "rindo e apontando", "sf25 fl80,40 ab10,30 el10,120 hp10 m:apontar,punho e:riso");
px("segurandoBarrigaRindo", "Emoção/Alegria/Riso", "morrendo de rir", "sf40 fl40,40 ab20,20 el120,120 hp-10 m:aberta,aberta e:riso");
px("bocejandoSentado", "Cotidiano/Descanso", "sonolento sentado", "hf90,90 kf90,90 sf-10 fl150,10 ab30,15 el130,20 hp-20 m:aberta,relaxada e:sono");
px("esperandoImpaciente", "Emoção/Impaciência", "impaciente|batendo o pé", "fl45,45 ab18,18 el125,125 ar55,55 af0,25 hy-20 m:relaxada,relaxada e:tedio");
px("ofereceFlor", "Emoção/Romance", "oferecendo flor|presente", "sf10 fl70,10 ab10,12 el20,10 hp10 m:segurar,relaxada e:vergonha");
px("ajoelhadoPedido", "Emoção/Romance", "pedido de casamento|ajoelhado com anel", "kf95,90 hf0,90 af40,0 sf-4 fl80,10 ab10,12 el40,10 hp-15 m:segurar,relaxada e:encantado");
px("debrucadoNaMesa", "Emoção/Cansaço", "debruçado|cabeça na mesa", "hf90,90 kf90,90 sf55 fl90,90 ab30,30 el150,150 hp30 m:relaxada,relaxada e:cansaco");

px("maosAoAlto", "Combate/Rendição", "mãos ao alto|rendido", "fl160,160 ab0,0 el70,70 hp10 m:aberta,aberta e:medo");
px("ajoelhadoRendido", "Combate/Rendição", "ajoelhado rendido|mãos na nuca", "kf95,95 hf0,0 af40,40 fl120,120 ab20,20 el150,150 hp20 m:aberta,aberta e:medo");
px("estendendoAMaoAjuda", "Conversa/Ajuda", "oferecendo ajuda|pegue minha mão", "sf30 hf30,10 kf35,15 fl70,10 ab10,12 el20,10 hp10 m:aberta,relaxada e:determinacao");
/* registro: catálogo, grupos, etiquetas e apelidos */
Object.assign(POSES_CORPO, POSES_EXTRA);
for (const [n, i] of Object.entries(POSES_EXTRA_INFO)) { TAGS_POSES[n] = i.tag; for (const a of i.apelidos) POSE_ALIAS[a.toLowerCase()] = n; const g = i.tag.split("/")[0] + ": " + i.tag.split("/")[1]; (POSE_GRUPOS["Extras — " + g] = POSE_GRUPOS["Extras — " + g] || []).push(n); }

/* ===================== EXPRESSÕES NOVAS ===================== */
const EXPRESSOES_EXTRA = {
  apaixonado: [{ pupilSize: 0.8, eyeShine: 1, smile: 0.6, blush: 0.9, browUp: 0.3, browIn: -0.3, eyeLid: 0.2 }, "Apaixonado"],
  envergonhadoSorrindo: [{ blush: 1, smile: 0.4, eyeLid: 0.4, browIn: -0.3, eyeYaw: -0.5, eyePitch: -0.3 }, "Envergonhado sorrindo"],
  tsundere: [{ blush: 0.8, browIn: 0.6, browUp: -0.2, smile: -0.3, pout: 0.6, eyeYaw: 0.6, lidLoL: 0.3, lidLoR: 0.3 }, "Tsundere (brava e corada)"],
  bicudo: [{ pout: 1, browIn: 0.3, eyeLid: 0.2, blush: 0.3, smile: -0.1 }, "Bico (emburrado)"],
  gotaDeSuor: [{ sweatDrop: 1, smile: 0.2, browWave: 0.5, browIn: -0.3, eyeLid: 0.2 }, "Gota de suor (sem graça)"],
  veiaDeRaiva: [{ angerVein: 1, smile: 0.3, browIn: 0.7, eyeLid: 0.4, teethClench: 0.6 }, "Sorriso com veia (raiva contida)"],
  olhosBrilhando: [{ eyeShine: 1, pupilSize: 0.9, eyeWide: 0.6, smile: 0.5, browUp: 0.6, jawOpen: 0.2 }, "Olhos brilhando (empolgado)"],
  choroCascata: [{ tears: 1, jawOpen: 0.7, smile: -0.8, browIn: -1, browUp: 0.5, eyeLid: 0.6, mouthWobble: 0.8 }, "Choro em cascata"],
  choroContido: [{ tears: 0.5, lipPress: 0.8, browIn: -0.7, browUp: 0.2, eyeLid: 0.25, smile: -0.4, wrinkleChin: 0.6 }, "Choro contido"],
  sorrisoTriste: [{ smile: 0.3, browIn: -0.7, browUp: 0.2, eyeLid: 0.35, tears: 0.2 }, "Sorriso triste"],
  sorrisoConfiante: [{ smile: 0.55, mouthCornerL: 0.4, eyeLid: 0.25, browOuterR: 0.3, lidLoL: 0.25, lidLoR: 0.25 }, "Sorriso confiante"],
  sorrisoMaligno: [{ smile: 0.7, mouthCornerL: 0.5, mouthCornerR: 0.5, browIn: 0.8, browSharp: 0.8, eyeLid: 0.3, eyeShine: -0.6, teethShow: 0.5 }, "Sorriso maligno"],
  gargalhadaMaligna: [{ jawOpen: 0.9, smile: 1, mouthWide: 0.8, teethShow: 1, browIn: 0.7, browSharp: 0.8, eyeWide: 0.6, pupilSize: -0.8 }, "Gargalhada maligna"],
  olharMorto: [{ eyeShine: -1, eyeLid: 0.45, pupilSize: -0.3, smile: -0.1, browUp: -0.1, eyeBags: 0.6 }, "Olhar morto (sem esperança)"],
  olharFrio: [{ eyeShine: -0.5, eyeLid: 0.35, browIn: 0.3, lipPress: 0.4, lidLoL: 0.3, lidLoR: 0.3 }, "Olhar frio"],
  olharPenetrante: [{ eyeFocus: 1, eyeWide: 0.2, browIn: 0.7, browUp: -0.4, browSharp: 0.6, lidLoL: 0.4, lidLoR: 0.4 }, "Olhar penetrante"],
  susto: [{ eyeWide: 1, pupilSize: -0.9, jawOpen: 0.5, browUp: 1, mouthRound: 0.4, sweatDrop: 0.5 }, "Susto"],
  panico: [{ eyeWide: 1, pupilSize: -1, jawOpen: 0.8, mouthWide: 0.6, browUp: 1, browIn: -0.6, sweatDrop: 1, mouthWobble: 0.7 }, "Pânico"],
  horror: [{ eyeWide: 1, eyeShine: -0.8, pupilSize: -1, jawOpen: 0.6, browUp: 0.9, browIn: -0.4, wrinkleForehead: 0.8 }, "Horror"],
  nojoExtremo: [{ noseWrinkle: 1, upperLipL: 1, upperLipR: 1, tongueOut: 0.4, browIn: 0.6, eyeLid: 0.5, smile: -0.5 }, "Nojo extremo"],
  incredulo: [{ browOuterL: 1, browInnerR: -0.4, jawOpen: 0.25, mouthCornerR: -0.3, eyeWide: 0.3 }, "Incrédulo"],
  sarcastico: [{ smile: 0.3, mouthCornerL: 0.6, mouthCornerR: -0.2, eyeLid: 0.4, browOuterR: 0.5, eyeYaw: 0.4, eyePitch: 0.3 }, "Sarcástico (revirando os olhos)"],
  serio: [{ lipPress: 0.4, browIn: 0.2, eyeLid: 0.1, smile: -0.1 }, "Sério"],
  calmo: [{ eyeLid: 0.45, smile: 0.15, browIn: -0.1 }, "Calmo / sereno"],
  sonhador: [{ eyeLid: 0.3, smile: 0.4, eyeYaw: 0.4, eyePitch: 0.5, blush: 0.3, browUp: 0.3 }, "Sonhador"],
  curioso: [{ browUp: 0.5, browOuterL: 0.4, eyeWide: 0.3, jawOpen: 0.1, smile: 0.15 }, "Curioso"],
  esperancoso: [{ browUp: 0.4, browIn: -0.4, smile: 0.35, eyeShine: 0.6, eyePitch: 0.3 }, "Esperançoso"],
  decepcionado: [{ smile: -0.5, browIn: -0.5, eyeLid: 0.4, eyePitch: -0.4, lipPress: 0.3 }, "Decepcionado"],
  ciumes: [{ browIn: 0.7, eyeLid: 0.4, eyeYaw: 0.7, pout: 0.4, lidLoL: 0.4, lidLoR: 0.4, smile: -0.3 }, "Ciúmes"],
  arrogante: [{ eyeLid: 0.4, smile: 0.3, mouthCornerL: 0.3, eyePitch: -0.3, browUp: 0.2, lidLoL: 0.3, lidLoR: 0.3 }, "Arrogante (olhando de cima)"],
  frustrado: [{ browIn: 0.8, teethClench: 0.7, wrinkleFrown: 0.7, eyeLid: 0.3, smile: -0.4, nostrilFlare: 0.5 }, "Frustrado"],
  exausto: [{ eyeLid: 0.7, eyeBags: 1, jawOpen: 0.25, tongueOut: 0.2, sweatDrop: 0.8, browIn: -0.3 }, "Exausto"],
  tonto: [{ eyeBlank: 0.7, jawOpen: 0.3, smile: 0.1, mouthWobble: 0.5, eyeLid: 0.2 }, "Tonto / zonzo"],
  bebado: [{ blush: 0.8, eyeLid: 0.5, smile: 0.5, jawOpen: 0.15, mouthCornerL: 0.3 }, "Embriagado"],
  doente: [{ eyeLid: 0.4, eyeBags: 0.8, blush: 0.4, smile: -0.3, sweatDrop: 0.5, browIn: -0.4 }, "Doente / febril"],
  fome: [{ jawOpen: 0.4, tongueOut: 0.3, eyeShine: 0.8, pupilSize: 0.6, smile: 0.4, browUp: 0.4 }, "Com fome (babando)"],
  concentradoLingua: [{ tongueOut: 0.5, mouthCornerL: 0.3, browIn: 0.4, eyeLid: 0.3, eyeFocus: 0.6 }, "Concentrado (língua de fora)"],
  gritoDeDor: [{ jawOpen: 1, mouthWide: 0.6, browIn: 1, browUp: 0.3, eyeLid: 0.85, wrinkleNasolabial: 0.8, teethShow: 0.6, tears: 0.3 }, "Grito de dor"],
  gritoDeAlegria: [{ jawOpen: 1, smile: 1, mouthWide: 0.6, eyeLid: 0.9, browUp: 0.6, blush: 0.4 }, "Grito de alegria"],
  vitoriaSorriso: [{ smile: 1, teethShow: 0.8, eyeLid: 0.5, browUp: 0.3, eyeShine: 0.5 }, "Sorriso de vitória"]
};
for (const [k, [e, nome]] of Object.entries(EXPRESSOES_EXTRA)) { EXPRESSOES[k] = e; NOMES_EXPRESSOES[k] = nome; for (const kk of BASE_ROSTO) if (EXPRESSOES[k][kk] === undefined) EXPRESSOES[k][kk] = 0; }

/* lista para o catálogo e o MCP */
function listaPosesExtras() { return Object.entries(POSES_EXTRA_INFO).map(([nome, i]) => ({ nome, tag: i.tag, apelidos: i.apelidos, expressao: i.expr })); }
export { POSES_EXTRA, POSES_EXTRA_INFO, EXPRESSOES_EXTRA, listaPosesExtras, pxLer };
