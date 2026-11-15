/* GeoMannequin — ANIMAÇÕES DE AÇÃO 2: sequências de poses de ação (esquiva, defesa, pulo, fuga, perseguição, poder, queda,
   gigante/minúsculo) com antecipação → ação → recuperação, e deslocamento quando o corpo sai do lugar.
   "Kai anima esquivaLateralAnim" · "0s Kai anima puloCompleto". */
import { SCN } from "./modelo.js";
import { criarAnimacao, anPoseValores, registrarProntas } from "./animacao.js";

/* [nome, tag, descrição, [[t, pose, mover?{frente,lado,giro}], ...], curva?] */
const AA2 = [
  ["esquivaLateralAnim", "Combate/Esquiva/Lateral", "guarda → esquiva para o lado → volta à guarda", [[0, "guardaBoxe"], [0.18, "esquivaLateral", { lado: 0.35 }], [0.6, "guardaBoxe", { lado: 0.35 }]]],
  ["esquivaParaTrasAnim", "Combate/Esquiva/Recuo", "guarda → salto curto para trás → guarda", [[0, "guardaBoxe"], [0.2, "esquivaParaTras", { frente: -0.5 }], [0.6, "guardaBoxe", { frente: -0.6 }]]],
  ["esquivaAbaixandoAnim", "Combate/Esquiva/Abaixar", "abaixa sob o golpe e sobe", [[0, "guardaBoxe"], [0.2, "esquivaAbaixando"], [0.55, "guardaBoxe"]]],
  ["esquivaMatrixAnim", "Combate/Esquiva/Matrix", "inclina para trás em câmera lenta e volta", [[0, "empe"], [0.6, "esquivaMatrix"], [1.4, "esquivaMatrix"], [2.0, "empe"]], "suave"],
  ["esquivaRolamentoAnim", "Combate/Esquiva/Rolamento", "rola no chão e levanta mais à frente", [[0, "guardaBoxe"], [0.2, "esquivaAbaixando", { frente: 0.3 }], [0.5, "esquivaRolamento", { frente: 1.0 }], [0.85, "levantandoComEsforco", { frente: 1.6 }], [1.2, "guardaBoxe", { frente: 1.7 }]], null, { pesLivres: true }],
  ["esquivaMergulhoAnim", "Combate/Esquiva/Mergulho", "mergulho de proteção para o lado", [[0, "guardaBoxe"], [0.15, "puloImpulso"], [0.4, "esquivaMergulho", { lado: 1.0 }], [0.75, "caidoDeBrucos", { lado: 1.8 }]], null, { pesLivres: true }],
  ["defesaCruzadaAnim", "Combate/Defesa/Braços", "fecha os braços em X para segurar o golpe e recua um pouco", [[0, "guardaBoxe"], [0.12, "defesaCruzada"], [0.35, "defesaCruzada", { frente: -0.25 }], [0.8, "guardaBoxe", { frente: -0.25 }]]],
  ["defesaBarreiraAnim", "Combate/Defesa/Poder", "ergue a barreira de energia e segura", [[0, "empe"], [0.25, "defesaBarreira"], [0.6, "defesaBarreiraDupla", { frente: -0.1 }], [1.2, "defesaBarreiraDupla", { frente: -0.2 }]]],
  ["puloCompleto", "Movimento/Pulo/Completo", "agacha, decola, encolhe no alto e aterrissa", [[0, "empe"], [0.25, "puloImpulso"], [0.4, "puloDecolando"], [0.65, "puloEncolhido"], [0.9, "puloDecolando"], [1.05, "puloAterrissagem"], [1.45, "empe"]]],
  ["puloEmDistanciaAnim", "Movimento/Pulo/Distância", "corre, salta longe e aterrissa", [[0, "correndo"], [0.25, "puloImpulso", { frente: 0.6 }], [0.55, "puloEmDistancia", { frente: 2.0 }], [0.85, "puloAterrissagem", { frente: 3.2 }], [1.25, "empe", { frente: 3.4 }]], null, { limite: { escorrega: 20, afunda: -5 } }],
  ["pousoDeHeroi", "Movimento/Pulo/Aterrissar", "cai do alto e pousa em três apoios, depois se ergue", [[0, "puloQueda"], [0.3, "puloAterrissagemHeroi"], [1.1, "puloAterrissagemHeroi"], [1.6, "entradaHeroica"]]],
  ["mortalParaTras", "Movimento/Pulo/Acrobacia", "mortal para trás", [[0, "puloImpulso"], [0.2, "puloDecolando", { frente: -0.2 }], [0.45, "esquivaCambalhotaTras", { frente: -0.6 }], [0.7, "puloAterrissagem", { frente: -1.0 }], [1.0, "empe", { frente: -1.0 }]], null, { pesLivres: true }],
  ["levitar", "Movimento/Flutuar/Subir", "sai do chão devagar até flutuar de braços abertos", [[0, "empe"], [1.2, "flutuandoRelaxado"], [2.4, "flutuandoBracosAbertos"]], "suave", { pesLivres: true }],
  ["flutuarMeditando", "Movimento/Flutuar/Meditação", "senta no ar e sobe meditando", [[0, "meditando"], [2, "flutuandoMeditacao"]], "suave", { pesLivres: true }],
  ["decolarHeroi", "Movimento/Voar/Decolar", "agacha e decola com o punho para cima", [[0, "puloImpulso"], [0.3, "vooDecolando"], [0.9, "vooSuperHeroi", { frente: 1.5 }]], null, { pesLivres: true }],
  ["fugaOlhandoTrasAnim", "Movimento/Fuga/Olhar para trás", "corre olhando para trás", [[0, "correndo"], [0.4, "fugaOlhandoTras"], [0.8, "fugaDesesperada"], [1.2, "fugaOlhandoTras"]], null, { desc2: " (no lugar: junte com \"corre\" para andar)" }],
  ["fugaTropecaoAnim", "Movimento/Fuga/Queda", "foge, tropeça e cai", [[0, "fugaOlhandoTras"], [0.35, "fugaTropecando", { frente: 1.4 }], [0.7, "caidoDeBrucos", { frente: 2.4 }]], null, { limite: { escorrega: 15, afunda: -5 } }],
  ["esconderAnim", "Movimento/Fuga/Esconder", "corre, cola na parede e prende a respiração", [[0, "fugaEsgueirando"], [0.5, "fugaColadoParede", { lado: 0.3 }], [1.8, "fugaColadoParede", { lado: 0.3 }]]],
  ["perseguicaoAgarrao", "Movimento/Perseguição/Agarrar", "corre atrás e mergulha para agarrar", [[0, "perseguicaoSprint"], [0.4, "perseguicaoAlcancando", { frente: 2.0 }], [0.75, "perseguicaoAgarrando", { frente: 3.6 }], [1.1, "caidoDeBrucos", { frente: 4.2 }]], null, { pesLivres: true }],
  ["perseguicaoParouCansado", "Movimento/Perseguição/Cansaço", "corre, para e se curva ofegante", [[0, "perseguicaoSprint"], [0.5, "perseguicaoDerrapando", { frente: 1.6 }], [1.0, "perseguicaoOfegante", { frente: 1.9 }], [2.2, "perseguicaoProcurando", { frente: 1.9 }]]],
  ["parkourVaultAnim", "Movimento/Parkour/Passar", "corre e passa por cima do obstáculo", [[0, "correndo"], [0.3, "parkourVault", { frente: 1.4 }], [0.6, "puloAterrissagem", { frente: 2.6 }], [0.9, "correndo", { frente: 3.4 }]]],
  ["levarSocoNoRosto", "Combate/Reação/Golpe no rosto", "a cabeça vai para trás com o impacto e ele cambaleia", [[0, "guardaBoxe"], [0.1, "impactoNoRosto", { frente: -0.2 }], [0.6, "cambaleando", { frente: -0.5 }], [1.1, "guardaBoxe", { frente: -0.5 }]]],
  ["levarSocoNoEstomago", "Combate/Reação/Golpe no corpo", "dobra ao meio com o soco", [[0, "guardaBoxe"], [0.12, "impactoNoEstomago", { frente: -0.15 }], [0.9, "impactoNoEstomago", { frente: -0.2 }], [1.4, "guardaBoxe", { frente: -0.2 }]]],
  ["serArremessado", "Combate/Reação/Arremessado", "é jogado para trás e cai de costas", [[0, "impactoNoRosto"], [0.25, "arremessadoParaTras", { frente: -1.5 }], [0.7, "caidoDeCostas", { frente: -3.0 }]], null, { pesLivres: true }],
  ["nocaute", "Combate/Reação/No chão", "cambaleia e desaba", [[0, "atordoadoEstrelinhas"], [0.6, "cambaleando", { lado: 0.2 }], [1.1, "ajoelhadoExausto", { lado: 0.3 }], [1.6, "caidoDeBrucos", { lado: 0.3, frente: 0.4 }]]],
  ["levantarDoChaoLuta", "Combate/Reação/Levantar", "levanta do chão com esforço e volta à guarda", [[0, "caidoDeBrucos"], [0.6, "ajoelhadoExausto"], [1.2, "levantandoComEsforco"], [1.8, "guardaBoxe"]], null, { limite: { escorrega: 45, afunda: -5 } }],
  ["carregarPoder", "Combate/Poder/Carregar", "concentra e explode em aura", [[0, "empe"], [0.5, "poderCarregando"], [1.6, "poderCarregando"], [1.9, "poderTransformacao"]]],
  ["dispararRaio", "Combate/Poder/Raio", "prepara a esfera ao lado e dispara à frente", [[0, "poderBolaPreparo"], [0.9, "poderBolaPreparo"], [1.05, "poderKamehameha", { frente: -0.1 }], [1.8, "poderKamehameha", { frente: -0.3 }]], null, { limite: { escorrega: 25, afunda: -5 } }],
  ["socoNoChaoPoder", "Combate/Poder/Terremoto", "pula e soca o chão (onda de choque)", [[0, "puloImpulso"], [0.25, "puloEncolhido"], [0.55, "poderSocoChao"], [1.3, "poderSocoChao"]]],
  ["gigantePisao", "Escala/Gigante/Pisar", "o gigante ergue o pé e pisa", [[0, "empe"], [0.6, "gigantePisando"], [1.0, "empe", { frente: 0.4 }]], "suave"],
  ["giganteAbaixaPega", "Escala/Gigante/Pegar", "o gigante se abaixa para pegar algo pequeno", [[0, "giganteOlhandoBaixo"], [0.9, "giganteAgachando"], [1.6, "giganteSegurandoNaPalma"]], "suave"],
  ["minusculoFogePisao", "Escala/Minúsculo/Fugir", "o pequeno corre se protegendo do pisão", [[0, "minusculoOlhandoCima"], [0.3, "minusculoEsmagado", { frente: 0.3 }], [0.7, "fugaDesesperada", { frente: 0.5 }]], null, { limite: { escorrega: 25 } }],
  ["confrontoEncarar", "Narrativa/Oposição/Encarar", "dá um passo à frente e encara", [[0, "empe"], [0.5, "encaraRival", { frente: 0.4 }], [1.5, "encaraRival", { frente: 0.4 }]], "suave"],
  ["vitoriaAnim", "Narrativa/Desfecho/Vitória", "ergue o punho de vitória", [[0, "ajoelhadoExausto"], [0.8, "levantandoComEsforco"], [1.4, "vitoriaPunhoAlto"]]],
  ["derrotaAnim", "Narrativa/Desfecho/Derrota", "cai de joelhos derrotado", [[0, "cambaleando"], [0.7, "derrotaDeJoelhos"], [2.0, "derrotaDeJoelhos"]], "suave"],
  /* artes marciais */
  ["kataShaolinAnim", "Combate/Artes marciais/Shaolin", "saudação → cavalo → arco com soco → garra do tigre → garça → saudação", [[0, "amSaudacaoKungFu"], [0.6, "amMabu"], [1.2, "amGongbu", { frente: 0.4 }], [1.8, "amTigreGarra", { frente: 0.6 }], [2.5, "amGarcaUmPe", { frente: 0.6 }], [3.3, "amSaudacaoKungFu", { frente: 0.6 }]], "suave"],
  ["cincoAnimaisAnim", "Combate/Artes marciais/Shaolin", "os cinco animais em sequência: tigre, garça, serpente, louva-a-deus, macaco, dragão", [[0, "amTigreGarra"], [0.7, "amGarcaAsas"], [1.4, "amSerpenteBote", { frente: 0.3 }], [2.1, "amLouvaDeusGuarda", { frente: 0.3 }], [2.8, "amMacacoAgachado", { frente: 0.3 }], [3.5, "amDragaoSobe", { frente: 0.3 }], [4.2, "amDragaoGarra", { frente: 0.5 }]], "suave"],
  ["tigreAtacaAnim", "Combate/Artes marciais/Shaolin/Tigre", "garra baixa → salta à frente com as duas garras", [[0, "amTigreDefesa"], [0.25, "amTigreAtaque", { frente: 0.6 }], [0.7, "amTigreGarra", { frente: 0.6 }]]],
  ["garcaBicaAnim", "Combate/Artes marciais/Shaolin/Garça", "abre as asas, sobe num pé e bica", [[0, "amGarcaAsas"], [0.5, "amGarcaUmPe"], [0.8, "amGarcaBico", { frente: 0.2 }], [1.3, "amGarcaAsas", { frente: 0.2 }]]],
  ["serpenteBoteAnim", "Combate/Artes marciais/Shaolin/Serpente", "enrola, desce e dá o bote", [[0, "amSerpenteEnrola"], [0.4, "amSerpenteBaixa"], [0.7, "amSerpenteBote", { frente: 0.6 }]]],
  ["macacoAnim", "Combate/Artes marciais/Shaolin/Macaco", "agacha, espreita e rouba", [[0, "amMacacoAgachado"], [0.5, "amMacacoOlha"], [0.9, "amMacacoRouba", { frente: 0.4 }], [1.3, "amMacacoAgachado", { frente: 0.4 }]]],
  ["judoSeoiNageAnim", "Combate/Artes marciais/Judô", "pegada → gira e encaixa o ombro → projeta", [[0, "amJudoKumikata"], [0.35, "amJudoOGoshi", { giro: 90 }], [0.7, "amJudoIpponSeoi", { giro: 180 }], [1.1, "amJudoKumikata", { giro: 180 }]]],
  ["judoOSotoGariAnim", "Combate/Artes marciais/Judô", "pegada → avança → ceifa a perna por fora", [[0, "amJudoKumikata"], [0.3, "amJudoKumikata", { frente: 0.3 }], [0.6, "amJudoOSotoGari", { frente: 0.4 }], [1.0, "amJudoKumikata", { frente: 0.4 }]]],
  ["judoUkemiAnim", "Combate/Artes marciais/Judô", "cai rolando e bate o braço no chão", [[0, "amJudoKumikata"], [0.3, "amJudoUkemi", { frente: -0.4 }], [0.9, "amJudoUkemi", { frente: -0.6 }]], null, { pesLivres: true }],
  ["karateKihonAnim", "Combate/Artes marciais/Karatê", "kihon: defesa baixa → soco em avanço → defesa alta → soco reverso", [[0, "amKarateKata"], [0.5, "amKarateGedanBarai", { frente: 0.4 }], [1.0, "amKarateOiZuki", { frente: 0.9 }], [1.5, "amKarateAgeUke", { frente: 1.3 }], [2.0, "amKarateGyakuZuki", { frente: 1.3 }], [2.6, "amKarateKata", { frente: 1.3 }]]],
  ["karateChutesAnim", "Combate/Artes marciais/Karatê", "mae geri → yoko geri → volta à base", [[0, "amKarateZenkutsu"], [0.35, "amKarateMaeGeri"], [0.8, "amKarateZenkutsu", { frente: 0.4 }], [1.2, "amKarateYokoGeri", { frente: 0.4 }], [1.7, "amKarateKibaDachi", { frente: 0.6 }]]],
  ["aikidoIriminageAnim", "Combate/Artes marciais/Aikidô", "hanmi → entra girando → projeta", [[0, "amAikidoKamae"], [0.4, "amAikidoKamae", { frente: 0.4, giro: 90 }], [0.8, "amAikidoIriminage", { frente: 0.6, giro: 180 }], [1.3, "amAikidoKamae", { frente: 0.6, giro: 180 }]], "suave"],
  ["wingChunAnim", "Combate/Artes marciais/Wing chun", "tan sau → pak sau → socos em corrente", [[0, "amWingChunGuarda"], [0.3, "amWingChunTanSau"], [0.55, "amWingChunPakSau"], [0.75, "amWingChunSocoCorrente", { frente: 0.15 }], [0.9, "amWingChunGuarda", { frente: 0.25 }], [1.05, "amWingChunSocoCorrente", { frente: 0.35 }], [1.4, "amWingChunGuarda", { frente: 0.4 }]]],
  ["taekwondoAnim", "Combate/Artes marciais/Taekwondo", "guarda → chute circular → chute machado → guarda", [[0, "amTkdGuarda"], [0.35, "amTkdDollyoChagi"], [0.8, "amTkdGuarda", { frente: 0.3 }], [1.15, "amTkdNeryoChagi", { frente: 0.3 }], [1.6, "amTkdGuarda", { frente: 0.5 }]]],
  ["taekwondoVoadorAnim", "Combate/Artes marciais/Taekwondo", "corre e dá o chute lateral voador", [[0, "amTkdGuarda"], [0.25, "puloImpulso", { frente: 0.4 }], [0.55, "amTkdTwioYopChagi", { frente: 1.6 }], [0.9, "puloAterrissagem", { frente: 2.4 }], [1.3, "amTkdGuarda", { frente: 2.4 }]], null, { pesLivres: true }],
  ["capoeiraGingaAnim", "Combate/Artes marciais/Capoeira", "ginga → meia-lua → negativa → armada → ginga", [[0, "guardaCapoeira"], [0.5, "amCapoeiraMeiaLua"], [1.0, "amCapoeiraNegativa"], [1.5, "amCapoeiraArmada", { giro: 180 }], [2.0, "guardaCapoeira", { giro: 360 }]], "suave"],
  ["capoeiraAuAnim", "Combate/Artes marciais/Capoeira", "ginga → aú (estrela) → ginga", [[0, "guardaCapoeira"], [0.4, "amCapoeiraAu", { lado: 0.8 }], [0.9, "guardaCapoeira", { lado: 1.6 }]], null, { pesLivres: true }],
  ["jiuJitsuAnim", "Combate/Artes marciais/Jiu-jitsu", "guarda fechada → raspagem → montada", [[0, "amBjjGuardaFechada"], [0.6, "amBjjRaspagem"], [1.2, "amBjjMontada", { frente: 0.3 }]], "suave", { pesLivres: true }],

];
function registrarAcao2() { const L = {}, base = Object.assign({}, SCN.list[0] ? SCN.list[0].params : {});
  for (const [nome, tag, desc, seq, curva, ex] of AA2) { try {
    const chaves = seq.map(([t, pose, mov]) => Object.assign({ t, valores: anPoseValores(pose, base) }, mov ? { mover: mov } : {}));
    L[nome] = Object.assign(criarAnimacao({ nome, duracao: seq[seq.length - 1][0], curva: curva || "saida", chaves }), { tags: [tag], descricao: desc + ((ex && ex.desc2) || ""), origem: "pronta", versao: 0 }, ex && ex.pesLivres ? { pesLivres: true } : {}, ex && ex.limite ? { limiteAuditoria: ex.limite } : {}); } catch (e) { /* pose que falta não derruba a biblioteca */ } }
  return L; }
registrarProntas(registrarAcao2);
function listaAnimAcao2() { return AA2.map(([nome, tag, desc, seq]) => ({ nome, tag, desc, duracao: seq[seq.length - 1][0], poses: seq.map(x => x[1]) })); }
export { AA2, listaAnimAcao2 };
