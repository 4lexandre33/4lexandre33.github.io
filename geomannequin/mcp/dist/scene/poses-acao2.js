/* GeoMannequin — POSES DE AÇÃO 2: esquiva, defesa, pulo, flutuação, fuga, perseguição, parkour, quedas e impacto,
   escala (gigante / minúsculo), voo de herói, poder, surpresa de ação e poses de reação. Mesmo código curto de poses-extra
   (duas letras + "esquerda,direita"; o lado ESQUERDO faz o movimento principal; "s = -1" espelha).
   Com as armas, veja os GOLPES (pegadas.js): "Kai segura katana como kamaeJodan". */
import { POSES_CORPO, POSE_GRUPOS, POSE_ALIAS } from "./poses.js";
import { TAGS_POSES } from "./acoes-luta.js";
import { pxLer, POSES_EXTRA, POSES_EXTRA_INFO } from "./poses-extra.js";
import { aplicarGesto } from "../engine/index.js";

function pa2Espelhar(o) { const r = {}; for (const [k, v] of Object.entries(o)) { const m = /^(.*)(L|R)$/.exec(k); if (m && k !== "bodyRoll") r[m[1] + (m[2] === "L" ? "R" : "L")] = v; else r[k] = /Yaw|Twist|Side|Roll/.test(k) ? -v : v; } return r; }
const POSES_ACAO2 = {}, POSES_ACAO2_INFO = {};
function pa(nome, tag, apelidos, cod) { const { o, x } = pxLer(cod);
  POSES_ACAO2[nome] = (Q, s) => { Object.assign(Q, s < 0 ? pa2Espelhar(o) : o); if (x.maos) x.maos.forEach((g, i) => { if (g && g !== "-") { const lado = (i === 0 ? 1 : -1) * (s < 0 ? -1 : 1); try { aplicarGesto(Q, lado, g); } catch (e) { } } }); };
  POSES_ACAO2_INFO[nome] = { tag, apelidos: apelidos ? apelidos.split("|") : [], desc: "", expr: x.expr || null }; }

/* ===== ESQUIVA ===== */
pa("esquivaLateral", "Combate/Esquiva/Lateral", "esquiva lateral|desvio de lado", "ss-28 br-8 hf30,-10 ha30,10 kf50,10 fl60,40 ab30,40 el100,90 hy20 hz10 m:punho,punho e:focoTotal");
pa("esquivaParaTras", "Combate/Esquiva/Recuo", "esquiva para trás|recuo rápido", "bp-22 sf-14 hf50,-20 kf70,30 af20,0 fl70,60 ab20,30 el110,100 hp-10 m:punho,punho e:surpresaTotal");
pa("esquivaMatrix", "Combate/Esquiva/Matrix", "matrix|esquiva de bala|inclinado para trás", "bp-55 sf-20 hf70,60 kf90,80 fl40,40 ab70,70 el30,30 hp-20 m:aberta,aberta e:focoTotal");
pa("esquivaAbaixando", "Combate/Esquiva/Abaixar", "abaixando|esquiva por baixo|duck", "sf45 bp20 hf90,70 kf110,90 ha20,20 fl70,70 ab20,20 el120,120 hp-30 m:punho,punho e:focoTotal");
pa("esquivaPendulo", "Combate/Esquiva/Pêndulo", "pêndulo|bob and weave", "sf30 ss20 hf60,30 kf70,40 fl80,80 ab15,15 el120,120 hy-15 m:punho,punho e:determinadoLuta");
pa("esquivaGiro", "Combate/Esquiva/Giro", "esquiva girando|pião", "st-50 pt-30 hf40,-10 kf50,20 fl40,90 ab70,40 el60,100 hy-60 m:aberta,punho e:focoTotal");
pa("esquivaRolamento", "Combate/Esquiva/Rolamento", "rolamento|rolando no chão", "bp95 sf80 hf130,120 kf140,140 fl90,90 ab20,20 el130,130 hp40 m:punho,punho e:esforco");
pa("esquivaMergulho", "Combate/Esquiva/Mergulho", "mergulho para o lado|salto de proteção", "bl4 bp70 br-30 hf-10,40 kf10,60 fl170,150 ab20,30 el10,30 hp-20 m:aberta,aberta e:surpresaTotal");
pa("esquivaCambalhotaTras", "Combate/Esquiva/Acrobacia", "cambalhota para trás|mortal para trás", "bl6 bp-120 hf120,120 kf140,140 fl60,60 ab30,30 el90,90 hp30 m:punho,punho e:focoTotal");
pa("esquivaPorUmTriz", "Combate/Esquiva/Por um triz", "por um triz|quase acertou", "ss-18 bp-12 hf20,-10 kf30,10 fl80,10 ab90,20 el20,20 hy40 hp-4 m:aberta,aberta e:choqueComico");
pa("esquivaPuloLado", "Combate/Esquiva/Pulo", "pulo para o lado", "bl3 br-14 hf60,20 ha30,10 kf90,40 fl40,80 ab60,40 el60,40 hy30 m:aberta,aberta e:surpresaTotal");
pa("esquivaInclinarCabeca", "Combate/Esquiva/Cabeça", "desvia a cabeça|soco passando raspando", "ss-10 hf10,-4 kf14,8 fl70,70 ab15,15 el120,120 hz-25 hy25 nf-6 m:punho,punho e:focoTotal");
/* ===== DEFESA ===== */
pa("defesaCruzada", "Combate/Defesa/Braços", "braços cruzados na frente|bloqueio em X", "sf14 hf30,-6 kf40,15 fl95,95 ab10,10 el120,120 ar40,40 hp14 m:punho,punho e:esforco");
pa("defesaCoberto", "Combate/Defesa/Cobrir", "cobrindo a cabeça|protegendo o rosto", "sf30 hf40,20 kf60,40 fl120,120 ab20,20 el150,150 hp30 m:punho,punho e:medo");
pa("defesaEncolhido", "Combate/Defesa/Cobrir", "encolhido|apanhando", "sf50 bp20 hf80,70 kf110,100 fl110,110 ab25,25 el150,150 hp40 m:punho,punho e:dor");
pa("defesaEmpurrando", "Combate/Defesa/Afastar", "afastando|empurrando o rival", "bp10 hf40,-20 kf40,10 fl90,90 ab10,10 el20,20 wr-60,-60 hp4 m:espalmada,espalmada e:determinacao");
pa("defesaBarreira", "Combate/Defesa/Poder", "barreira|escudo de energia|mão aberta para frente", "sf6 hf30,-10 kf35,15 fl90,30 ab10,30 el10,90 wr-70,0 hp4 m:espalmada,punho e:determinacao");
pa("defesaBarreiraDupla", "Combate/Defesa/Poder", "barreira com as duas mãos|segurando o ataque", "bp8 hf45,-20 kf50,20 fl90,90 ab25,25 el15,15 wr-70,-70 hp6 m:espalmada,espalmada e:esforco");
pa("defesaChute", "Combate/Defesa/Perna", "bloqueio com a canela|check", "hf80,-4 hr-30,0 kf100,10 ha30,10 fl90,90 ab15,15 el125,125 hp6 m:punho,punho e:focoTotal");
pa("defesaAgarrandoPunho", "Combate/Defesa/Agarrar", "segurando o punho do rival|agarrou o soco", "st20 hf30,-10 kf40,15 fl90,60 ab20,30 el20,100 hp4 m:garra,punho e:furia");
pa("defesaDesviandoBraco", "Combate/Defesa/Desvio", "desviando o braço|aparar com a mão", "st-25 hf25,-10 kf30,15 fl80,50 ab50,20 el50,120 hy-10 m:espalmada,punho e:focoTotal");
pa("defesaProtegendoOutro", "Combate/Defesa/Proteger", "protegendo alguém|braço aberto na frente de outro", "sf4 hf30,-10 kf35,15 fl20,40 ab90,30 el10,90 hy-20 m:aberta,punho e:determinacao");
/* ===== PULO ===== */
pa("puloImpulso", "Movimento/Pulo/Impulso", "impulso|agachado para pular", "sf30 bp20 hf90,90 kf110,110 af30,30 fl-50,-50 ab20,20 el20,20 hp-20 m:aberta,aberta e:determinacao");
pa("puloDecolando", "Movimento/Pulo/Saída", "decolando|saindo do chão", "bl2 bp10 hf20,-10 kf20,10 af-30,-30 to-40,-40 fl160,160 ab15,15 el10,10 hp-20 m:aberta,aberta e:determinacao");
pa("puloEstrela", "Movimento/Pulo/Alegria", "pulo estrela|pulo de alegria", "bl5 ha40,40 kf10,10 fl150,150 ab90,90 el10,10 hp-20 m:aberta,aberta e:riso");
pa("puloEncolhido", "Movimento/Pulo/Alto", "pulo encolhido|joelhos no peito", "bl6 sf20 hf120,120 kf140,140 fl60,60 ab20,20 el100,100 hp-6 m:punho,punho e:determinacao");
pa("puloAltoEsticado", "Movimento/Pulo/Alto", "pulo alto esticado|alcançando no ar", "bl6 sf-10 hf10,-10 kf20,10 af-30,-20 fl175,40 ab10,30 el5,30 hp-30 m:aberta,aberta e:determinacao");
pa("puloEmDistancia", "Movimento/Pulo/Distância", "salto em distância|pulando um buraco", "bl5 bp20 hf80,-30 kf40,60 fl150,140 ab20,20 el20,20 hp-10 m:aberta,aberta e:esforco");
pa("puloTesoura", "Movimento/Pulo/Obstáculo", "pulando obstáculo|tesoura", "bl5 bp10 hf100,-20 kf10,90 fl90,-30 ab40,30 el30,60 hp-4 m:aberta,aberta e:determinacao");
pa("puloAterrissagem", "Movimento/Pulo/Aterrissar", "aterrissagem|caindo de pé|pouso de herói", "sf40 bp20 hf100,40 kf130,60 ha20,30 fl40,-30 ab30,60 el20,20 hp-10 m:espalmada,aberta e:determinacao");
pa("puloAterrissagemHeroi", "Movimento/Pulo/Aterrissar", "pouso de super-herói|três apoios", "sf50 bp25 hf110,20 kf130,110 af30,40 fl70,-20 ab10,50 el10,20 hp-20 m:punho,aberta e:determinacao");
pa("puloParede", "Movimento/Parkour/Parede", "pulo na parede|wall jump", "bl4 bp-10 hf90,20 kf100,40 fl140,60 ab40,60 el40,60 hy30 m:aberta,aberta e:focoTotal");
pa("puloCambalhota", "Movimento/Pulo/Acrobacia", "mortal|cambalhota no ar", "bl7 bp100 sf40 hf120,120 kf140,140 fl80,80 ab20,20 el100,100 hp30 m:punho,punho e:focoTotal");
pa("puloQueda", "Movimento/Pulo/Queda", "caindo do alto|em queda livre", "bl6 bp-20 hf30,10 kf50,20 fl150,130 ab60,70 el30,40 hp-20 m:aberta,aberta e:medo");
/* ===== FLUTUAR / LEVITAR / VOAR ===== */
pa("flutuandoMeditacao", "Movimento/Flutuar/Meditação", "levitando sentado|meditação flutuante", "bl6 hf84,84 ha30,30 hr45,45 kf148,142 fl20,20 ab18,18 el30,30 pr-90,-90 hp5 m:ok,ok e:alivio");
pa("flutuandoRelaxado", "Movimento/Flutuar/Relaxado", "flutuando|boiando no ar", "bl7 bp-30 hf20,30 kf30,40 fl30,40 ab40,50 el30,40 hp-14 hz10 m:relaxada,relaxada e:alivio");
pa("flutuandoBracosAbertos", "Movimento/Flutuar/Poder", "levitando de braços abertos|ascensão", "bl8 hf10,4 kf20,30 af-30,-30 fl20,20 ab70,70 el10,10 hp-20 m:aberta,aberta e:encantado");
pa("flutuandoAmeaca", "Movimento/Flutuar/Vilão", "vilão flutuando|pairando ameaçador", "bl8 sf6 hf10,20 kf20,40 af-30,-30 fl30,30 ab25,25 el60,60 hp6 m:garra,garra e:sombrio");
pa("flutuandoSubmerso", "Movimento/Flutuar/Água", "debaixo d'água|boiando submerso", "bl6 bp20 hf40,10 kf60,20 fl110,70 ab50,60 el40,50 hp-10 m:aberta,aberta e:surpresaTotal");
pa("flutuandoGravidadeZero", "Movimento/Flutuar/Espaço", "gravidade zero|astronauta", "bl7 bp25 br20 hf50,10 kf70,30 fl70,120 ab60,30 el40,60 hp-10 hz-10 m:aberta,aberta e:surpresaTotal");
pa("flutuandoAdormecido", "Movimento/Flutuar/Sonho", "dormindo no ar|sonho flutuante", "bl7 bp-70 hf30,40 kf50,60 fl20,30 ab30,40 el50,40 hp10 hz15 m:relaxada,relaxada e:sono");
pa("vooSuperHeroi", "Movimento/Voar/Herói", "voando como super-herói|punho à frente", "bl8 bp85 hf-5,10 kf10,30 fl170,10 ab5,10 el5,10 hp-60 m:punho,punho e:determinacao");
pa("vooDecolando", "Movimento/Voar/Decolar", "decolando para o céu|punho para cima", "bl6 hf0,30 kf0,60 af-30,-30 fl175,20 ab5,15 el5,20 hp-30 m:punho,punho e:gritoDeGuerra");
pa("vooPlanando", "Movimento/Voar/Planar", "planando|braços abertos voando", "bl8 bp80 hf-5,-5 kf10,10 fl20,20 ab85,85 el10,10 hp-55 m:aberta,aberta e:encantado");
pa("vooMergulho", "Movimento/Voar/Mergulho", "mergulhando no ar|descendo de cabeça", "bl8 bp130 hf-10,-10 kf5,5 fl170,170 ab10,10 el5,5 hp-40 m:aberta,aberta e:determinacao");
pa("vooPairando", "Movimento/Voar/Pairar", "pairando|parado no ar", "bl8 hf20,5 kf40,20 af-30,-30 fl40,40 ab30,30 el50,50 hp4 m:punho,punho e:determinacao");
/* ===== FUGA ===== */
pa("fugaOlhandoTras", "Movimento/Fuga/Olhar para trás", "fugindo olhando para trás|perseguido", "bp22 sf10 hf85,-30 kf90,40 af10,30 fl-60,80 ab25,25 el70,90 hy-110 hp-6 m:aberta,aberta e:medo");
pa("fugaDesesperada", "Movimento/Fuga/Desespero", "correndo desesperado|braços para cima", "bp15 hf80,-30 kf90,40 fl150,120 ab50,60 el40,50 hp-20 m:aberta,aberta e:panico");
pa("fugaEsgueirando", "Movimento/Fuga/Furtivo", "esgueirando|na ponta dos pés", "sf20 bp10 hf50,-10 kf60,20 af-20,0 to-30,-30 fl30,40 ab30,20 el80,60 hy30 m:aberta,aberta e:medo");
pa("fugaRastejando", "Movimento/Fuga/Rastejar", "rastejando|fugindo pelo chão", "bp85 sf-20 hf40,10 ha20,10 kf70,20 fl150,60 ab20,30 el40,110 hp-50 m:garra,garra e:medo");
pa("fugaTropecando", "Movimento/Fuga/Queda", "tropeçou fugindo", "bp50 sf20 hf-30,70 kf20,80 fl130,110 ab40,40 el20,20 hp-30 m:aberta,aberta e:panico");
pa("fugaPulandoMuro", "Movimento/Fuga/Obstáculo", "pulando o muro|escalando para fugir", "bl4 bp20 hf110,10 kf120,40 fl150,150 ab20,20 el40,40 hp-30 m:garra,garra e:esforco");
pa("fugaEscondendo", "Movimento/Fuga/Esconder", "escondido atrás|espiando do esconderijo", "sf20 hf80,80 kf110,110 ha20,20 fl40,80 ab30,15 el100,130 hy-30 hp-6 m:espalmada,aberta e:medo");
pa("fugaColadoParede", "Movimento/Fuga/Esconder", "colado na parede|prendendo a respiração", "sf-10 hp-10 hy-50 fl-10,-10 ab20,20 el10,10 wr-40,-40 m:espalmada,espalmada e:medo");
pa("fugaCarregandoAlguem", "Movimento/Fuga/Resgate", "fugindo de mãos dadas|puxando alguém", "bp18 hf80,-30 kf80,40 fl-40,60 ab20,30 el20,80 hy-60 m:segurar,aberta e:determinacao");
/* ===== PERSEGUIÇÃO ===== */
pa("perseguicaoSprint", "Movimento/Perseguição/Sprint", "perseguindo|sprint atrás", "bp30 sf6 hf95,-35 kf100,40 af15,35 fl-60,85 ab12,12 el95,100 hp-20 m:punho,punho e:determinadoLuta");
pa("perseguicaoAlcancando", "Movimento/Perseguição/Alcançar", "estendendo a mão para pegar|quase alcançando", "bp30 hf80,-30 kf80,40 fl160,-40 ab15,20 el5,80 hp-24 m:aberta,punho e:esforco");
pa("perseguicaoAgarrando", "Movimento/Perseguição/Agarrar", "agarrando o fugitivo|mergulho para agarrar", "bl3 bp70 hf-10,40 kf20,60 fl160,160 ab20,20 el10,10 hp-40 m:garra,garra e:gritoDeGuerra");
pa("perseguicaoApontando", "Movimento/Perseguição/Mandar", "pega ele!|apontando correndo", "bp20 hf75,-25 kf80,40 fl95,-40 ab15,20 el5,90 hp-14 m:apontar,punho e:furia");
pa("perseguicaoOfegante", "Movimento/Perseguição/Cansaço", "ofegante|mãos nos joelhos", "sf55 bp10 hf40,40 kf35,35 fl50,50 ab15,15 el20,20 hp-20 m:aberta,aberta e:cansaco");
pa("perseguicaoDerrapando", "Movimento/Perseguição/Curva", "derrapando na curva|freando", "bp-20 ss20 hf60,-10 ha30,10 kf70,30 fl40,100 ab60,40 el40,80 hy40 m:aberta,aberta e:esforco");
pa("perseguicaoProcurando", "Movimento/Perseguição/Procurar", "procurando|para onde ele foi", "sf6 hf20,-6 kf20,10 fl30,60 ab25,20 el60,110 hy-60 hp-4 m:aberta,punho e:raiva");
/* ===== PARKOUR / ESCALADA ===== */
pa("parkourVault", "Movimento/Parkour/Passar", "passando por cima|vault", "bl4 bp20 br-20 hf100,80 ha20,30 kf100,60 fl90,40 ab20,60 el10,40 hy20 m:espalmada,aberta e:focoTotal");
pa("parkourPendurado", "Movimento/Parkour/Pendurar", "pendurado na beirada|segurando no parapeito", "bl8 sf4 hf10,30 kf20,50 fl175,175 ab15,15 el20,20 hp-30 m:garra,garra e:esforco");
pa("parkourEscalando", "Movimento/Parkour/Escalar", "escalando|subindo a parede", "bl5 sf6 hf90,10 kf110,30 ha20,15 fl170,100 ab20,30 el20,90 hp-30 m:garra,garra e:esforco");
pa("parkourCorridaParede", "Movimento/Parkour/Parede", "correndo na parede", "bl4 br-40 bp20 hf90,-20 kf100,40 fl-40,80 ab20,40 el80,80 hy30 m:aberta,aberta e:focoTotal");
pa("parkourDeslizando", "Movimento/Parkour/Deslizar", "deslizando no chão|carrinho", "bp-50 hf90,20 kf10,100 fl70,-30 ab40,40 el30,20 hp20 m:aberta,espalmada e:focoTotal");
pa("parkourEquilibrio", "Movimento/Parkour/Equilíbrio", "equilibrando na corda|beirada", "hf10,-4 kf10,4 hr-30,30 fl10,10 ab90,90 el10,10 hp20 m:aberta,aberta e:focoTotal");
pa("parkourAgachadoBeirada", "Movimento/Parkour/Beirada", "agachado na beirada|gárgula", "sf40 hf120,120 kf150,150 ha30,30 fl40,40 ab20,20 el60,60 hp-30 m:aberta,aberta e:sombrio");
/* ===== QUEDA / IMPACTO / REAÇÃO ===== */
pa("impactoNoRosto", "Combate/Reação/Golpe no rosto", "levou um soco no rosto|cabeça para trás", "bp-14 sf-14 hf20,-10 kf20,10 fl30,20 ab40,60 el40,30 hy30 hp-30 hz20 m:aberta,aberta e:dor");
pa("impactoNoEstomago", "Combate/Reação/Golpe no corpo", "soco no estômago|dobrado ao meio", "sf55 bp10 hf40,30 kf40,30 fl50,50 ab10,10 el90,90 hp30 m:aberta,aberta e:dor");
pa("arremessadoParaTras", "Combate/Reação/Arremessado", "voando para trás|arremessado", "bl6 bp-50 sf-20 hf60,40 kf70,40 fl110,90 ab60,70 el30,30 hp20 m:aberta,aberta e:dor");
pa("caidoDeCostas", "Combate/Reação/No chão", "caído de costas|nocauteado", "bp-88 hf10,20 kf20,30 ha15,10 fl20,90 ab60,90 el20,30 hp-10 hz20 m:relaxada,relaxada e:olharVazio");
pa("caidoDeBrucos", "Combate/Reação/No chão", "caído de bruços|derrotado no chão", "bp88 hf0,10 kf20,10 fl170,30 ab30,40 el20,40 hp-50 hz-20 m:relaxada,relaxada e:dor");
pa("levantandoComEsforco", "Combate/Reação/Levantar", "levantando com esforço|ainda não acabou", "sf40 hf100,10 kf110,90 af30,20 fl60,10 ab20,20 el10,30 hp-20 m:espalmada,punho e:determinacao");
pa("ajoelhadoExausto", "Combate/Reação/Exausto", "ajoelhado exausto|apoiado no chão", "sf40 hf20,90 kf100,90 af40,0 fl60,10 ab20,10 el10,20 hp30 m:espalmada,relaxada e:cansaco");
pa("cambaleando", "Combate/Reação/Tonto", "cambaleando|tonto", "ss20 bp-6 hf20,-6 ha20,8 kf20,10 fl30,40 ab40,30 el30,40 hz25 hp10 m:relaxada,relaxada e:olharVazio");
pa("atordoadoEstrelinhas", "Combate/Reação/Tonto", "atordoado|vendo estrelas", "sf-6 ss-10 hf10,10 kf20,20 fl10,10 ab20,20 el20,20 hz-20 hp-14 m:relaxada,relaxada e:tonto");
pa("escorregaoComico", "Comédia/Queda", "escorregão cômico|casca de banana", "bl5 bp-75 hf120,40 kf10,30 fl130,60 ab60,80 el10,20 hp20 m:aberta,aberta e:choqueComico");
pa("quedaSentado", "Comédia/Queda", "caiu sentado|bunda no chão", "hf90,90 kf40,30 ha20,20 fl40,40 ab50,50 el20,20 hp10 m:espalmada,espalmada e:choqueComico");
/* ===== ATAQUE ESPECIAL / PODER ===== */
pa("poderCarregando", "Combate/Poder/Carregar", "carregando poder|concentrando energia", "sf10 hf60,60 kf80,80 ha30,30 fl40,40 ab30,30 el110,110 hp-4 m:garra,garra e:gritoDeGuerra");
pa("poderKamehameha", "Combate/Poder/Raio", "raio de energia com as duas mãos|disparo de energia", "bp10 st-20 hf50,-20 kf60,20 fl90,90 ab10,10 el10,10 wr-70,-70 hp4 m:espalmada,espalmada e:gritoDeGuerra");
pa("poderBolaPreparo", "Combate/Poder/Esfera", "esfera de energia ao lado|preparando bola de energia", "st-40 pt-20 hf50,-20 kf60,20 fl20,20 ab20,20 el90,90 ar60,-60 hy20 m:garra,garra e:focoTotal");
pa("poderAoCeu", "Combate/Poder/Invocar", "invocando do céu|mão erguida", "hf20,-6 kf20,10 fl175,40 ab10,20 el5,90 hp-35 m:espalmada,punho e:gritoDeGuerra");
pa("poderSocoChao", "Combate/Poder/Terremoto", "soco no chão com poder|onda de choque", "sf60 hf110,40 kf120,100 ha30,30 fl50,40 ab20,40 el10,90 hp30 m:punho,espalmada e:gritoDeGuerra");
pa("poderTelecinese", "Combate/Poder/Telecinese", "telecinese|mão estendida levantando algo", "sf4 hf20,-6 kf20,10 fl80,20 ab20,20 el20,60 wr40,0 hp-6 hz8 m:garra,relaxada e:focoTotal");
pa("poderTransformacao", "Combate/Poder/Transformar", "transformação|gritando com aura", "sf-20 hf30,30 kf40,40 ha30,30 fl40,40 ab45,45 el80,80 hp-35 m:punho,punho e:gritoDeGuerra");
pa("poderSelamento", "Combate/Poder/Selo", "selo de mãos|jutsu", "sf4 hf20,-4 kf20,10 fl70,70 ab5,5 el130,130 hp4 m:paz,paz e:focoTotal");
/* ===== ESCALA (gigante / minúsculo) ===== */
pa("giganteAgachando", "Escala/Gigante/Pegar", "gigante se abaixando|pegando algo pequeno do chão", "sf40 hf80,30 kf90,40 fl70,20 ab15,20 el20,60 hp30 m:pinca,relaxada e:curioso");
pa("gigantePisando", "Escala/Gigante/Pisar", "gigante pisando|esmagando", "sf10 hf80,-6 kf60,10 af-10,0 fl40,40 ab35,35 el80,80 hp35 m:punho,punho e:furia");
pa("giganteRugindo", "Escala/Gigante/Rugir", "gigante rugindo|monstro ameaçando", "sf-20 hf20,-10 kf30,10 ha20,20 fl70,70 ab60,60 el60,60 hp-30 m:garra,garra e:gritoDeGuerra");
pa("giganteOlhandoBaixo", "Escala/Gigante/Olhar", "gigante olhando para baixo|curioso com os pequenos", "sf25 hf10,10 kf10,10 fl20,20 ab15,15 el30,30 hp50 nf20 hz10 m:relaxada,relaxada e:curioso");
pa("giganteSegurandoNaPalma", "Escala/Gigante/Segurar", "gigante com alguém na palma|palma aberta para cima", "sf8 fl60,10 ab20,12 el80,20 ar60,0 pr90,0 hp35 m:aberta,relaxada e:curioso");
pa("giganteDerrubandoPredio", "Escala/Gigante/Destruir", "gigante derrubando|empurrando prédio", "bp20 hf40,-20 kf40,10 fl110,110 ab20,20 el20,20 wr-60,-60 hp-10 m:espalmada,espalmada e:furia");
pa("minusculoOlhandoCima", "Escala/Minúsculo/Olhar", "pequenino olhando para cima|maravilhado", "sf-20 hf10,-4 kf10,4 fl30,30 ab20,20 el60,60 hp-55 nf-20 m:aberta,aberta e:surpresaTotal");
pa("minusculoAcenando", "Escala/Minúsculo/Chamar", "pequenino acenando|ei, aqui embaixo", "sf-14 hf10,-4 kf10,4 fl170,20 ab30,15 el20,30 hp-45 m:aberta,relaxada e:alegria");
pa("minusculoEscalando", "Escala/Minúsculo/Escalar", "escalando o gigante|subindo pela roupa", "bl3 sf10 hf100,20 kf120,40 fl170,110 ab20,30 el30,90 hp-40 m:garra,garra e:esforco");
pa("minusculoEsmagado", "Escala/Minúsculo/Fugir", "fugindo do pisão|protegendo-se do gigante", "sf20 hf50,-20 kf60,20 fl150,150 ab30,30 el120,120 hp-40 m:aberta,aberta e:panico");
pa("minusculoNaPalma", "Escala/Minúsculo/Na mão", "sentado na palma|em cima da mão", "hf90,90 kf90,90 sf4 fl20,20 ab20,20 el30,30 pr-90,-90 hp-30 m:espalmada,espalmada e:encantado");
pa("minusculoEmpurrando", "Escala/Minúsculo/Força", "pequeno empurrando algo enorme", "bp35 sf10 hf60,-40 kf60,10 fl130,130 ab10,10 el30,30 wr-60,-60 hp-15 m:espalmada,espalmada e:esforco");
/* ===== ENTRADA / CONFRONTO ===== */
pa("entradaHeroica", "Narrativa/Apresentação/Entrada", "entrada heroica|chegou o herói", "sf-6 hf10,-4 kf8,4 ha10,12 fl10,20 ab25,30 el20,30 hp-6 m:punho,punho e:determinacao");
pa("entradaVilao", "Narrativa/Apresentação/Vilão", "entrada do vilão|mãos atrás das costas", "sf-4 fl-30,-30 ab10,10 el90,90 ar-40,-40 hp-8 hy10 m:relaxada,relaxada e:sombrio");
pa("encaraRival", "Narrativa/Oposição/Encarar", "encarando o rival|face a face", "sf10 bp4 hf10,-4 kf10,4 fl10,10 ab20,20 el30,30 hp-6 nf-8 m:punho,punho e:raiva");
pa("desafioChamando", "Narrativa/Oposição/Desafio", "vem!|chamando para a luta", "sf-6 hf20,-6 kf20,10 fl80,30 ab15,30 el20,110 wr40,0 hp-8 m:chamar,punho e:malicia");
pa("costasComCostas", "Narrativa/Cerco/Costas", "costas com costas|cercados", "sf4 hf30,-6 kf35,15 ha12,14 fl70,70 ab25,25 el110,110 hy40 m:punho,punho e:determinacao");
pa("cercadoOlhandoVolta", "Narrativa/Cerco/Olhar em volta", "cercado olhando em volta", "sf10 hf35,20 kf45,30 ha20,20 fl60,60 ab35,35 el90,90 hy-70 m:punho,punho e:medo");
pa("vitoriaPunhoAlto", "Narrativa/Desfecho/Vitória", "vitória com punho no alto", "sf-10 hf10,-4 kf10,4 fl175,10 ab10,10 el5,10 hp-30 m:punho,relaxada e:gritoDeGuerra");
pa("vitoriaCostasViradas", "Narrativa/Desfecho/Vitória", "indo embora de costas|vitória fria", "hf20,-10 kf20,10 fl-10,10 ab10,10 el20,20 hy-30 hp4 m:relaxada,relaxada e:sombrio");
pa("derrotaDeJoelhos", "Narrativa/Desfecho/Derrota", "derrota de joelhos|punhos no chão", "sf50 hf20,20 kf100,100 af40,40 fl60,60 ab15,15 el10,10 hp40 m:punho,punho e:choro");
pa("juramento", "Narrativa/Decisão/Juramento", "punho no peito|juramento", "sf2 fl60,5 ab30,10 el130,10 ar60,0 hp-4 m:punho,relaxada e:determinacao");
pa("estendendoMaoRival", "Narrativa/Reconciliação", "estendendo a mão ao rival|trégua", "sf10 fl70,5 ab12,10 el20,10 hp6 m:aberta,relaxada e:alivio");

/* registro */
Object.assign(POSES_CORPO, POSES_ACAO2); Object.assign(POSES_EXTRA, POSES_ACAO2); Object.assign(POSES_EXTRA_INFO, POSES_ACAO2_INFO);
for (const [n, i] of Object.entries(POSES_ACAO2_INFO)) { TAGS_POSES[n] = i.tag; for (const a of i.apelidos) POSE_ALIAS[a.toLowerCase()] = n; const g = i.tag.split("/")[0] + ": " + i.tag.split("/")[1]; (POSE_GRUPOS["Ação — " + g] = POSE_GRUPOS["Ação — " + g] || []).push(n); }
function listaPosesAcao2() { return Object.entries(POSES_ACAO2_INFO).map(([nome, i]) => ({ nome, tag: i.tag, apelidos: i.apelidos, expressao: i.expr })); }
export { POSES_ACAO2, POSES_ACAO2_INFO, listaPosesAcao2 };
