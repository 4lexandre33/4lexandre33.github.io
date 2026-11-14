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
];
function registrarAcao2() { const L = {}, base = Object.assign({}, SCN.list[0] ? SCN.list[0].params : {});
  for (const [nome, tag, desc, seq, curva, ex] of AA2) { try {
    const chaves = seq.map(([t, pose, mov]) => Object.assign({ t, valores: anPoseValores(pose, base) }, mov ? { mover: mov } : {}));
    L[nome] = Object.assign(criarAnimacao({ nome, duracao: seq[seq.length - 1][0], curva: curva || "saida", chaves }), { tags: [tag], descricao: desc + ((ex && ex.desc2) || ""), origem: "pronta", versao: 0 }, ex && ex.pesLivres ? { pesLivres: true } : {}, ex && ex.limite ? { limiteAuditoria: ex.limite } : {}); } catch (e) { /* pose que falta não derruba a biblioteca */ } }
  return L; }
registrarProntas(registrarAcao2);
function listaAnimAcao2() { return AA2.map(([nome, tag, desc, seq]) => ({ nome, tag, desc, duracao: seq[seq.length - 1][0], poses: seq.map(x => x[1]) })); }
export { AA2, listaAnimAcao2 };
