/* GeoMannequin — FUNÇÕES NARRATIVAS: uma biblioteca de receitas de cena (gatilho, apresentação, direcionamento, oposição, cerco,
   perseguição, fuga, esconderijo, revelação, clímax, desfecho…) que viram QUADROS de mangá, tiras de WEBTOON ou PLANOS de animação.
   Fontes: as 31 funções de Propp, as 36 situações de Polti, a Jornada do Herói (Campbell/Vogler), Save the Cat (Snyder),
   kishōtenketsu e as situações de gênero do mangá/anime de ação.

   Árvore: narrativa.FAMÍLIA.FUNÇÃO.VERSÃO.TOM   (ex.: perseguicao.telhados.suspense.tenso)
     · cada FUNÇÃO tem as batidas (beats) da encenação: preset de cena/câmera, poses, emoções, efeitos, falas, tamanho do quadro;
     · VERSÕES (5): direta · suspense (detalhe antes, reação depois) · impacto (poucos quadros, momento forte enorme) ·
       pov (o momento forte visto pelos olhos de alguém) · lenta (momento a momento);
     · TONS (8): epico · sombrio · comico · romantico · tenso · melancolico · leve · misterioso (expressões, ângulo, cor, efeitos);
     · FORMATOS: manga (página japonesa) · webtoon (tira vertical com ritmo) · animacao (filme com planos e tempos).
   Uso no texto do name (a linha vira quadros):
     narrativa perseguicao.telhados com Kai, Mira [suspense] [tom tenso] [formato manga|webtoon|animacao] [semente 3]
     historia jornada com Kai, Mira [formato manga] [tom epico] [quadros 24] [semente 7] [variacoes 4] [funcoes gatilho.chamado,cerco.encurralado,…]
   Batida (texto curto): P:preset (cena: arruma e põe a câmera) · C:preset (só câmera) · "/BA" troca os papéis do preset ·
     A:pose@emocao · fx:efeito[@B[.parte]] · t:tamanho · b:borda · r:ritmo · k (momento forte) · f:A.fala.CHAVE (fala|pensa|grita|sussurra|narra)
     an:A.animacao (no filme) · obj:A.objeto.pegada · sfx:CHAVE · d:segundos */
import { PRECONFIG, pcAchar } from "./preconfig.js";

/* ===================== falas (por chave; a semente escolhe) ===================== */
const NR_FALAS = {
  lugar: ["Aqui tudo começou.", "Ninguém volta igual deste lugar.", "A cidade dormia. Quase toda."], rotina: ["Mais um dia igual.", "Nada nunca acontece aqui."],
  ola: ["Ei! Chegou cedo.", "Você de novo?"], heroi: ["Deixa comigo.", "Cheguei."], vilao: ["Finalmente nos encontramos.", "Vocês demoraram."],
  equipe: ["Juntos, a gente consegue.", "Todo mundo pronto?"], chamado: ["Precisamos de você.", "Leia isto. Agora."], mensagem: ["Venha sozinho.", "O tempo está acabando."],
  susto: ["O quê?!", "Cuidado!"], descoberta: ["Isto... não pode ser.", "Onde você achou isso?"], perda: ["Não! Devolve!", "Ele levou tudo."],
  encontro: ["Desculpa, eu não te vi.", "A gente se conhece?"], socorro: ["Socorro!", "Me ajuda!"], visao: ["Eu vi o fim.", "Isso ainda vai acontecer."],
  conselho: ["A força não está nos punhos.", "Olhe antes de saltar."], recusa: ["Não é problema meu.", "Eu não sou herói."], aceita: ["Tá bom. Eu vou.", "Conte comigo."],
  plano: ["Entramos por aqui.", "Três minutos. Nem um a mais."], treino: ["De novo!", "Mais rápido!"], partida: ["Não olhe para trás.", "Vamos."],
  aliado: ["Preciso de alguém como você.", "Você vem comigo?"], presente: ["Isto era do seu pai.", "Use com cuidado."],
  ameaca: ["Último aviso.", "Dê mais um passo e acabou."], desafio: ["Me enfrente!", "Só você e eu."], provoca: ["É só isso?", "Vem."],
  rival: ["Eu não vou perder pra você.", "De novo você."], traicao: ["Desculpa. Não era pessoal.", "Você confiou na pessoa errada."],
  obstaculo: ["Não dá pra passar.", "Tem que ter outro jeito."], emboscada: ["Era uma armadilha!", "Estão por toda parte!"], interroga: ["Onde está?", "Fale!"],
  luta: ["Hah!", "Agora!"], virada: ["Ainda não acabou.", "Minha vez."], finalGolpe: ["ACABOU!", "Isto é por todos!"], protege: ["Fica atrás de mim!", "Não toque nela!"],
  encurralado: ["Acabou a corrida.", "Não tem para onde ir."], cercado: ["São muitos...", "Costas com costas."], semSaida: ["Beco sem saída!", "E agora?"],
  corre: ["Corre!", "Mais rápido!"], para: ["Pare aí!", "Volta aqui!"], quase: ["Quase!", "Peguei vo— ah!"], pula: ["Pula!", "Confia em mim!"],
  esconde: ["Shh!", "Não respira."], quaseVisto: ["Tem alguém aí?", "Achei que ouvi algo."], infiltra: ["Estou dentro.", "Ninguém me viu."],
  segredo: ["Eu nunca te contei...", "Tem uma coisa que você precisa saber."], identidade: ["Era você o tempo todo?!", "Eu sou seu irmão."],
  verdade: ["Tudo era mentira.", "Eles sabiam desde o começo."], flashback: ["Eu me lembro daquele dia.", "Foi assim que tudo começou."],
  consolo: ["Ei. Vai ficar tudo bem.", "Eu estou aqui."], declara: ["Eu gosto de você.", "Sempre foi você."], adeus: ["Até um dia.", "Não esquece de mim."],
  reencontro: ["Você voltou!", "Achei que nunca mais..."], discussao: ["Você não entende!", "Para de fugir!"], perdao: ["Me desculpa.", "Recomeçamos?"],
  luto: ["Por que você...", "Eu devia estar lá."], promessa: ["Eu prometo.", "Eu vou voltar."],
  derrota: ["Eu... perdi.", "Não consigo mais."], fundo: ["Acabou.", "Para que lutar?"], duvida: ["E se eu não for capaz?", "Eu errei tudo."], sacrificio: ["Vai! Eu seguro eles!", "Cuida deles por mim."],
  desperta: ["O que é esta força?", "Eu sinto... tudo."], transforma: ["Este é o meu verdadeiro poder!", "Não sou mais o mesmo."], carga: ["Só mais um pouco...", "Tudo... num golpe só!"],
  finalConfronto: ["Termina aqui.", "Só um de nós sai."], salva: ["Peguei você!", "Segura minha mão!"], chance: ["Agora ou nunca.", "Uma chance só."],
  vitoria: ["Conseguimos!", "Acabou."], festa: ["A gente conseguiu!", "Hoje a gente comemora!"], volta: ["Estou em casa.", "Nada mudou. Só eu."],
  novoDia: ["Amanhã é outro dia.", "E a vida segue."], gancho: ["Isso foi só o começo.", "Ele ainda está vivo."], vilaoFoge: ["Nos veremos de novo.", "Isto não acabou."],
  gag: ["Ai...", "Ninguém viu isso, né?"], malEntendido: ["Não é o que parece!", "Eu posso explicar!"], exagero: ["NÃÃÃO!", "COMO ASSIM?!"], silencio: ["...", "..."],
  espreita: ["Tem algo ali.", "Você ouviu isso?"], aparicao: ["...!", "Quem está aí?"], porta: ["Não abre essa porta.", "Estava fechada antes."],
  passagem: ["Três anos depois.", "Na manhã seguinte."], viagem: ["Ainda falta muito?", "A estrada parecia não ter fim."], montagem: ["Dia após dia.", "Mais forte a cada queda."],
  gigante: ["Que... tamanho é esse?", "Corre!!"], pequeno: ["Ei! Aqui embaixo!", "Tamanho não é documento."], voo: ["Segura firme!", "Lá vamos nós!"]
};
const NR_SFX = { impacto: ["BAM!", "KRAK!", "DOOM!"], corte: ["SHING!", "ZASH!"], corrida: ["TA-TA-TA", "VUUSH"], susto: ["!!", "?!"], silencio: ["...", "TIC TAC"], explosao: ["BOOOM!", "KABOOM!"], poder: ["GOGOGO", "ZZZT"], queda: ["TUM!", "PLOFT"], passos: ["TOC TOC", "PAC PAC"] };

/* ===================== emoções → expressões (por tom) ===================== */
const NR_EMO = { neutro: "neutra", alerta: "desconfianca", medo: "medo", raiva: "raiva", alegria: "alegria", triste: "tristeza", surpresa: "surpresa", determinado: "determinacao", dor: "dor",
  malicia: "malicia", amor: "apaixonado", alivio: "alivio", foco: "focoTotal", choque: "choque", cansado: "cansaco", grito: "gritoDeGuerra", frio: "olharFrio", pensa: "pensativo" };
const NR_TONS = {
  epico: { nome: "épico", cena: "quente", emo: { medo: "determinacao", raiva: "iraFocada", alerta: "focoTotal", grito: "gritoDeGuerra" }, angulo: "baixo", fx: "concentracao", borda: null, falaTom: null },
  sombrio: { nome: "sombrio", cena: "noite", emo: { raiva: "olharFrio", malicia: "sorrisoMaligno", alegria: "sorrisoTriste", determinado: "olharPenetrante", neutro: "serio" }, angulo: "holandes", fx: "sombra_dramatica", borda: "grossa", falaTom: null },
  comico: { nome: "cômico", cena: "vibrante", emo: { medo: "choqueComico", surpresa: "choqueComico", raiva: "veiaDeRaiva", triste: "choroCascata", dor: "gotaDeSuor", choque: "choqueComico", alerta: "nervoso" }, angulo: null, fx: "emote", borda: null, falaTom: null },
  romantico: { nome: "romântico", cena: "sonho", emo: { alegria: "envergonhadoSorrindo", surpresa: "olhosBrilhando", neutro: "calmo", amor: "apaixonado", triste: "choroContido" }, angulo: null, fx: null, borda: "nenhuma", falaTom: null },
  tenso: { nome: "tenso", cena: "vinheta", emo: { neutro: "serio", alerta: "nervoso", medo: "panico", surpresa: "susto" }, angulo: "holandes", fx: "reticula", borda: "diagonal", falaTom: null },
  melancolico: { nome: "melancólico", cena: "dessaturado", emo: { alegria: "sorrisoTriste", neutro: "olharVazio", triste: "choroContido", determinado: "decepcionado" }, angulo: "alto", fx: null, borda: "nenhuma", falaTom: null },
  leve: { nome: "leve", cena: null, emo: {}, angulo: null, fx: null, borda: null, falaTom: null },
  misterioso: { nome: "misterioso", cena: "noite", emo: { neutro: "serio", alerta: "desconfianca", surpresa: "incredulo", malicia: "sorrisoConfiante" }, angulo: "baixo", fx: "sombra_dramatica", borda: null, falaTom: null }
};
const NR_VERSOES = { direta: "como está: as batidas da função, em ordem", suspense: "detalhe antes do momento forte e a reação depois (segura o leitor)", impacto: "poucos quadros e o momento forte enorme (splash)", pov: "o momento forte visto pelos olhos de alguém", lenta: "momento a momento: o instante forte dividido em três" };
const NR_FORMATOS = { manga: "página de mangá (leitura japonesa, 4–7 quadros)", webtoon: "tira vertical (o espaço entre quadros é tempo)", animacao: "filme com planos, tempos e animações" };

/* ===================== FUNÇÕES (família → função) ===================== */
/* [id, nome, fonte, nº de papéis, intensidade 1–5, batidas] — papéis: A (protagonista), B (outro/antagonista), C (terceiro) */
const NR_DEF = [
  /* ---------- APRESENTAÇÃO ---------- */
  ["apresentacao.mundo", "Estabelecer o mundo", "Jornada: mundo comum", 1, 1, ["P:estabelecimento.panorama A:empe@neutro t:largo r:lugar f:narra.lugar", "P:estabelecimento.pequeno-no-mundo A:caminhando@pensa r:aspecto k", "C:um.medio.tres-quartos A:@neutro f:A.pensa.rotina"]],
  ["apresentacao.rotina", "Rotina (o status quo)", "Save the Cat: imagem de abertura", 1, 1, ["P:estabelecimento.janela A:espreguicando@cansado t:largo f:narra.rotina", "P:um.medio.tres-quartos A:bocejando@cansado", "C:objeto.relogio A:olhandoORelogio@neutro t:pequeno k", "P:movimento.lateral A:caminhando@neutro f:A.pensa.rotina"]],
  ["apresentacao.heroi", "Entrada do herói", "anime: chegada dramática", 1, 3, ["P:hq.passos A:caminhando@determinado t:largo sfx:passos", "P:hq.chegada-dramatica A:entradaHeroica@determinado t:grande k fx:concentracao", "C:um.close.contra-plongee A:@determinado f:A.fala.heroi"]],
  ["apresentacao.vilao", "Entrada do vilão", "Polti: o inimigo", 1, 3, ["P:suspense.sombra-na-porta/AA A:entradaVilao@malicia t:alto", "P:anime.sorriso-maligno A:viloesBracosCruzados@malicia k fx:sombra_dramatica", "C:um.olhos.frente A:@frio t:largo f:A.fala.vilao"]],
  ["apresentacao.dupla", "Apresentar a dupla", "buddy: dois opostos", 2, 1, ["P:dialogo.dois.lado.frontal A:maoNoBolsoRelaxado@alegria B:bracosCruzadosPeito@alerta t:largo", "P:dialogo.dois.frente.ombro-a-dir A:explicandoComMaos@alegria B:@alerta f:A.fala.ola", "P:dialogo.dois.frente.ombro-b-esq B:encolhendoOmbros@neutro k f:B.fala.rival"]],
  ["apresentacao.equipe", "Apresentar a equipe", "anime: line-up", 3, 2, ["P:grupo.equipe.frontal-baixo A:entradaHeroica@determinado B:bracosCruzadosPeito@foco C:polegarParaCima@alegria t:largo k", "P:dialogo.tres.linha.close-b B:@foco t:pequeno", "P:dialogo.tres.linha.close-a A:@determinado f:A.fala.equipe"]],
  ["apresentacao.lugar-perigoso", "O lugar proibido", "Propp: proibição", 1, 2, ["P:estabelecimento.horizonte-baixo A:empe@alerta t:largo r:lugar f:narra.lugar", "P:suspense.de-cima-canto A:espiando@medo k", "C:um.close.tres-quartos A:@alerta f:A.pensa.espreita"]],
  /* ---------- GATILHO ---------- */
  ["gatilho.chamado", "O chamado", "Jornada: chamado à aventura", 2, 2, ["P:dialogo.dois.frente.mestre-perfil A:empe@neutro B:pedindoMaoEstendida@medo", "P:dialogo.dois.frente.ombro-a-dir B:@medo f:B.fala.chamado", "P:dialogo.dois.frente.limpo-a A:@surpresa k t:grande"]],
  ["gatilho.mensagem", "A mensagem", "Propp: mediação", 1, 2, ["P:objeto.na-mao-pov A:@neutro t:largo f:narra.mensagem", "P:um.close.frente A:olhandoOCelular@choque k fx:velocidade", "P:movimento.corrida-baixo A:correndo@determinado r:acao"]],
  ["gatilho.ataque-subito", "Ataque súbito", "ação: cold open", 2, 4, ["P:dialogo.dois.lado.frontal A:caminhando@neutro B:caminhando@alegria", "P:combate.golpe.mestre A:socando@raiva B:golpeRosto@dor k fx:impacto_tela sfx:impacto b:diagonal", "P:combate.caido.baixo A:guardaLuta@raiva B:caindoDeCostas@dor f:B.grita.susto"]],
  ["gatilho.descoberta", "A descoberta", "Polti: descoberta", 1, 2, ["P:objeto.maos A:agachar@surpresa t:largo", "P:objeto.olhar-objeto A:carregando@choque k fx:concentracao", "C:um.close.contra-plongee A:@determinado f:A.pensa.descoberta"]],
  ["gatilho.perda", "A perda", "Propp: dano", 2, 3, ["P:dialogo.dois.distancia.mestre-perfil A:correndo@medo B:correndo@malicia", "P:hq.mao-estendida A:perseguicaoAlcancando@dor k t:grande f:A.grita.perda", "P:emocao.desespero A:desesperoMaosNaCabeca@triste r:momento"]],
  ["gatilho.encontro", "O encontro que muda tudo", "romance: meet-cute", 2, 2, ["P:dialogo.dois.andando.frontal A:caminhando@neutro B:olhandoOCelular@neutro", "P:combate.caido.mestre A:quedaSentado@surpresa B:quedaSentado@surpresa k sfx:queda f:A.fala.encontro", "P:dialogo.dois.perto.olhares-a/AB A:@surpresa B:@alegria"]],
  ["gatilho.sequestro", "O sequestro", "Propp: dano (rapto)", 2, 4, ["P:suspense.ameaca-atras A:empe@neutro B:maosAoAlto@malicia", "P:combate.golpe.ombro-b A:defesaCruzada@medo B:perseguicaoAgarrando@malicia k f:A.grita.socorro", "P:estabelecimento.vigilancia A:fugaOlhandoTras@medo r:cena"]],
  ["gatilho.profecia", "A visão / profecia", "Polti: enigma", 1, 3, ["P:emocao.pensativo A:meditando@pensa b:nenhuma", "P:anime.olho-perfil A:@choque k fx:flash f:narra.visao", "P:emocao.isolamento A:ajoelhadoExausto@medo"]],
  ["gatilho.acidente", "O acidente", "drama: virada do acaso", 1, 4, ["P:movimento.lateral A:caminhando@neutro", "P:anime.impacto-congelado/AA A:caindo@choque k fx:impacto_tela sfx:queda", "P:um.close.plongee A:caidoDeCostas@dor b:nenhuma"]],
  /* ---------- DIRECIONAMENTO ---------- */
  ["direcionamento.mentor", "O conselho do mentor", "Jornada: encontro com o mentor", 2, 1, ["P:dialogo.dois.sentado-em-pe.mestre-perfil A:sentado@neutro B:maosAtrasDasCostas@calmo", "P:dialogo.dois.sentado-em-pe.ombro-a-dir B:explicandoComMaos@pensa f:B.fala.conselho", "P:dialogo.dois.sentado-em-pe.limpo-a A:maoNoQueixo@pensa k"]],
  ["direcionamento.recusa", "Recusa do chamado", "Jornada: recusa", 2, 1, ["P:dialogo.dois.frente.ombro-b-esq A:dispensandoComAMao@raiva B:@triste f:A.fala.recusa", "P:dialogo.dois.costas.frontal A:cabisbaixoAndando@triste B:@triste k", "P:emocao.solidao-costas A:@triste r:aspecto"]],
  ["direcionamento.decisao", "A decisão", "Save the Cat: break into two", 1, 2, ["P:emocao.pensativo A:pensando@pensa", "P:um.olhos.frente A:@determinado t:largo", "P:emocao.determinacao A:punhoCerradoDeterminado@determinado k fx:concentracao f:A.fala.aceita"]],
  ["direcionamento.plano", "O plano", "heist: mapa na mesa", 3, 1, ["P:dialogo.tres.mesa.mestre A:inclinadoAtento@foco B:apontando@foco C:maoNoQueixo@pensa", "P:objeto.sobre-a-mesa A:@foco t:pequeno", "P:dialogo.tres.mesa.close-b B:contandoNosDedos@foco k f:B.fala.plano"]],
  ["direcionamento.treino", "Treino", "Jornada: preparação", 2, 2, ["P:combate.guardas.mestre A:guardaKarate@foco B:guardaBoxe@determinado", "P:combate.caido.mestre A:caidoDeCostas@dor B:empe@neutro f:B.grita.treino", "P:emocao.determinacao A:levantandoComEsforco@determinado k"]],
  ["direcionamento.partida", "A partida", "Jornada: travessia do limiar", 1, 2, ["P:estabelecimento.porta A:empe@pensa", "P:anime.costas-por-do-sol A:caminhando@determinado k t:largo f:A.fala.partida", "P:estabelecimento.pequeno-no-mundo A:caminhando@determinado r:lugar"]],
  ["direcionamento.aliado", "Recrutar um aliado", "Jornada: aliados", 2, 1, ["P:dialogo.dois.frente.dois-3-4-a A:estendendoAMaoAjuda@determinado B:bracosCruzadosPeito@alerta f:A.fala.aliado", "P:dialogo.dois.frente.limpo-b B:@pensa", "P:romance.maos/AB A:maoEstendidaApertar@alegria B:maoEstendidaApertar@determinado k"]],
  ["direcionamento.presente", "O presente mágico", "Propp: recepção do objeto mágico", 2, 2, ["P:dialogo.dois.frente.mestre-perfil A:empe@neutro B:pedindoMaoEstendida@calmo", "P:objeto.maos A:@surpresa k fx:energia_mao@A.maoDir f:B.fala.presente", "P:um.americano.contra-plongee A:obj:katana.armaErguida@determinado"]],
  /* ---------- OPOSIÇÃO ---------- */
  ["oposicao.ameaca", "A ameaça", "Polti: perigo", 2, 3, ["P:poder.olhando-de-cima A:encolhidoComMedo@medo B:maosNaCinturaBravo@malicia", "P:dialogo.dois.frente.ombro-a-dir B:apontandoAcusando@frio k f:B.fala.ameaca", "P:dialogo.dois.frente.limpo-a A:@medo t:pequeno"]],
  ["oposicao.desafio", "O desafio", "Polti: rivalidade", 2, 3, ["P:combate.confronto.mestre A:apontandoInimigo@determinado B:viloesBracosCruzados@malicia f:A.grita.desafio", "P:combate.confronto.olhos-b B:@malicia t:largo", "P:combate.confronto.baixo A:guardaLuta@determinado B:guardaLuta@raiva k"]],
  ["oposicao.provocacao", "A provocação", "anime: trash talk", 2, 2, ["P:combate.guardas.ombro-a A:guardaLuta@raiva B:desafioChamando@malicia f:B.fala.provoca", "P:combate.guardas.olhos-a A:@raiva k fx:veiaDeRaiva t:largo"]],
  ["oposicao.rivalidade", "Os rivais se encaram", "Polti: rivalidade de parentes/iguais", 2, 3, ["P:anime.rosto-a-rosto A:encaraRival@raiva B:encaraRival@raiva k fx:concentracao", "P:combate.confronto.olhos-a A:@determinado t:largo", "P:combate.confronto.olhos-b B:@frio t:largo f:B.fala.rival"]],
  ["oposicao.traicao", "A traição", "Polti: traição", 2, 4, ["P:dialogo.dois.lado.frontal A:maoNoBolsoRelaxado@alegria B:@neutro", "P:suspense.revelacao-ombro A:@surpresa B:empurrando@frio k f:B.fala.traicao", "P:emocao.choque A:caindo@choque b:diagonal"]],
  ["oposicao.obstaculo", "O obstáculo", "estrutura: complicação", 1, 2, ["P:estabelecimento.ponto-de-fuga A:caminhando@neutro", "P:um.inteiro.costas A:empe@surpresa k t:largo f:A.fala.obstaculo", "P:um.medio.tres-quartos A:maoNoQueixo@pensa"]],
  ["oposicao.emboscada", "Emboscada", "guerra: armadilha", 3, 4, ["P:dialogo.tres.linha.mestre A:caminhando@neutro B:caminhando@alerta C:caminhando@neutro", "P:grupo.cercado.aereo A:guardaLuta@surpresa B:guardaLuta@medo C:guardaLuta@raiva k f:A.grita.emboscada", "P:grupo.cercado.frontal-baixo A:costasComCostas@determinado B:costasComCostas@medo C:costasComCostas@raiva"]],
  ["oposicao.interrogatorio", "Interrogatório", "policial: sala fechada", 2, 3, ["P:poder.interrogatorio-mestre A:sentado@medo B:maosNaCinturaBravo@raiva", "P:poder.interrogatorio-alto B:@raiva f:B.grita.interroga", "P:poder.interrogatorio-baixo A:@medo k"]],
  /* ---------- CONFLITO / LUTA ---------- */
  ["conflito.duelo-espadas", "Duelo de espadas", "samurai: duelo ao amanhecer", 2, 4, ["P:combate.duelo.mestre A:obj:katana.kamaeChudan@foco B:obj:katana.kamaeJodan@frio t:largo", "P:combate.duelo.olhos-a A:@foco t:pequeno", "P:combate.duelo.baixo A:obj:katana.katanaKesa@grito B:obj:katana.katanaBloqueioAlto@raiva k fx:velocidade sfx:corte b:diagonal", "P:combate.duelo.ombro-b A:obj:katana.espadaZanshin@foco B:atingidoLado@dor"]],
  ["conflito.troca-socos", "Troca de socos", "ação: briga", 2, 4, ["P:combate.guardas.mestre A:guardaBoxe@raiva B:guardaBoxe@raiva", "P:combate.golpe.baixo A:direto@grito B:impactoNoRosto@dor k fx:impacto_contato@B.cabeca sfx:impacto", "P:combate.golpe.ombro-b A:defesaCruzada@dor B:cruzado@raiva fx:velocidade", "P:combate.caido.mestre A:guardaBoxe@determinado B:cambaleando@dor"]],
  ["conflito.luta-desigual", "Luta desigual", "Polti: luta desigual", 2, 4, ["P:escala.pequeno-olha-gigante A:guardaLuta@medo B:giganteRugindo@raiva t:alto", "P:escala.pes-do-gigante A:esquivaPuloLado@medo B:gigantePisando@raiva k fx:onda_choque sfx:impacto", "P:escala.de-longe A:punhoCerradoDeterminado@determinado"]],
  ["conflito.poder-contra-poder", "Poder contra poder", "shōnen: choque de raios", 2, 5, ["P:combate.energia.mestre A:poderKamehameha@grito B:poderKamehameha@grito t:largo fx:feixe@A", "P:combate.energia.baixo A:@grito k fx:impacto_tela b:diagonal sfx:poder", "P:combate.energia.olhos-a A:@determinado t:pequeno"]],
  ["conflito.virada", "A virada", "estrutura: reversão", 2, 4, ["P:combate.caido.mestre A:caidoDeBrucos@dor B:vitoriaPunhoAlto@malicia", "P:um.olhos.frente A:@determinado t:largo f:A.fala.virada", "P:combate.golpe.baixo A:socoCarregado@grito B:arremessadoParaTras@choque k fx:velocidade sfx:impacto b:diagonal"]],
  ["conflito.golpe-final", "O golpe final", "shōnen: técnica especial", 2, 5, ["P:anime.power-up A:poderCarregando@grito fx:aura", "P:combate.golpe.baixo A:socoSuperman@grito B:defesaCruzada@medo k fx:arco_movimento@A.maoDir sfx:impacto f:A.grita.finalGolpe t:splash", "P:combate.vitoria.mestre A:vitoriaPunhoAlto@determinado B:caidoDeCostas@dor"]],
  ["conflito.luta-em-grupo", "Luta em grupo", "wuxia: um contra todos", 3, 4, ["P:combate.um-contra-todos.heroi-baixo A:guardaKungFuGarca@foco B:guardaLuta@raiva C:guardaLuta@raiva t:largo", "P:combate.chute.mestre A:chuteGiratorio@grito B:arremessadoParaTras@dor k fx:velocidade sfx:impacto", "P:combate.golpe.ombro-a A:defesaDesviandoBraco@foco C:socando@raiva"]],
  ["conflito.defender-alguem", "Defender alguém", "Polti: salvação", 3, 4, ["P:suspense.vitima-de-baixo/CB A:empe@neutro B:pisao@malicia C:encolhidoComMedo@medo", "P:combate.golpe.mestre A:defesaProtegendoOutro@determinado B:socando@raiva k fx:impacto_contato@A.maoEsq f:A.grita.protege", "P:combate.confronto.baixo A:guardaLuta@raiva B:@surpresa"]],
  /* ---------- CERCO ---------- */
  ["cerco.encurralado", "Encurralado", "suspense: sem saída", 2, 4, ["P:movimento.perseguicao.perfil A:correndoAssustado@medo B:perseguicaoSprint@raiva", "P:suspense.de-cima-canto A:fugaColadoParede@medo k f:B.fala.encurralado", "P:suspense.vitima-de-baixo/AB A:@medo B:maosNaCinturaBravo@malicia t:alto"]],
  ["cerco.cercado", "Cercado pelo grupo", "ação: o anel de inimigos", 3, 4, ["P:grupo.cercado.aereo A:cercadoOlhandoVolta@alerta B:guardaLuta@malicia C:guardaLuta@malicia t:largo k", "P:grupo.cercado.frontal-baixo A:guardaLuta@determinado f:A.fala.cercado", "P:um.olhos.frente A:@foco t:largo"]],
  ["cerco.costas-com-costas", "Costas com costas", "anime: dupla cercada", 2, 4, ["P:grupo.costas.frontal A:costasComCostas@determinado B:costasComCostas@determinado t:largo k", "P:dialogo.dois.lado.close-a A:@determinado f:A.fala.cercado", "P:dialogo.dois.lado.close-b B:@malicia f:B.fala.provoca"]],
  ["cerco.sem-saida", "Beco sem saída", "perseguição: fim da linha", 1, 3, ["P:movimento.corrida-frente-close A:correndoAssustado@medo r:acao", "P:um.inteiro.costas A:perseguicaoDerrapando@choque k t:largo f:A.fala.semSaida", "P:um.close.holandes A:@medo"]],
  ["cerco.cerco-gigante", "Cercado por um gigante", "kaiju: a sombra enorme", 2, 5, ["P:escala.nuca-do-pequeno A:minusculoOlhandoCima@medo B:giganteOlhandoBaixo@malicia t:alto k", "P:escala.gigante-olha-pequeno A:minusculoEsmagado@medo B:giganteAgachando@malicia f:A.grita.gigante"]],
  /* ---------- PERSEGUIÇÃO ---------- */
  ["perseguicao.a-pe", "Perseguição a pé", "ação: chase", 2, 4, ["P:movimento.perseguicao.aereo A:correndoAssustado@medo B:perseguicaoSprint@raiva t:largo r:lugar", "P:movimento.perseguicao.olhando-para-tras A:fugaOlhandoTras@medo B:perseguicaoApontando@raiva k fx:velocidade f:B.grita.para", "P:movimento.perseguicao.baixo A:corridaSuperRapida@determinado B:perseguicaoSprint@raiva sfx:corrida"]],
  ["perseguicao.telhados", "Perseguição nos telhados", "anime: parkour", 2, 4, ["P:movimento.perseguicao.aereo A:parkourCorridaParede@determinado B:perseguicaoSprint@raiva t:largo", "P:movimento.perseguicao.perfil A:puloEmDistancia@determinado B:perseguicaoAlcancando@raiva k fx:velocidade t:grande b:diagonal f:A.grita.pula", "P:movimento.perseguicao.baixo A:puloAterrissagemHeroi@determinado B:perseguicaoDerrapando@surpresa fx:poeira_pes@A"]],
  ["perseguicao.quase-alcanca", "Quase alcança", "suspense: o dedo que roça", 2, 4, ["P:movimento.perseguicao.ombro-perseguidor A:correndoAssustado@medo B:perseguicaoAlcancando@raiva", "P:hq.mao-estendida/BA B:perseguicaoAlcancando@grito k t:largo f:B.grita.quase", "P:movimento.perseguicao.frente-fugitivo A:esquivaPuloLado@medo B:perseguicaoAgarrando@raiva fx:velocidade"]],
  ["perseguicao.a-cavalo", "Perseguição a cavalo", "faroeste: galope", 2, 4, ["P:movimento.perseguicao.aereo A:correndo@determinado B:correndo@raiva t:largo r:lugar", "P:movimento.perseguicao.olhando-para-tras A:fugaOlhandoTras@medo B:perseguicaoApontando@raiva k fx:velocidade sfx:corrida", "P:movimento.perseguicao.perfil A:corridaSuperRapida@determinado B:perseguicaoSprint@raiva"]],
  ["perseguicao.aerea", "Perseguição aérea", "super-herói: voo", 2, 5, ["P:movimento.drone-frente A:vooSuperHeroi@determinado t:largo", "P:movimento.perseguicao.perfil A:vooSuperHeroi@determinado B:vooMergulho@raiva k fx:velocidade b:diagonal", "P:movimento.perseguicao.baixo A:vooPlanando@foco B:vooSuperHeroi@raiva fx:rastro_fumaca@B"]],
  ["perseguicao.monstro", "Fugindo do monstro", "terror: o que corre atrás", 2, 5, ["P:escala.de-longe A:fugaDesesperada@medo B:giganteRugindo@raiva t:largo", "P:escala.pes-do-gigante A:minusculoEsmagado@medo B:gigantePisando@raiva k fx:onda_choque sfx:impacto", "P:movimento.corrida-frente-close A:correndoAssustado@medo f:A.grita.corre"]],
  /* ---------- FUGA ---------- */
  ["fuga.escapada", "A escapada", "Propp: fuga", 2, 3, ["P:suspense.espiando-escondido A:espiando@alerta B:empe@neutro", "P:movimento.corrida-perfil A:fugaEsgueirando@medo k r:acao", "P:estabelecimento.chegada A:correndo@alivio t:largo"]],
  ["fuga.por-um-triz", "Por um triz", "ação: a porta fecha", 2, 4, ["P:movimento.perseguicao.perfil A:correndoAssustado@medo B:perseguicaoSprint@raiva", "P:movimento.corrida-baixo A:esquivaMergulho@choque k fx:velocidade t:grande b:diagonal", "P:um.close.tres-quartos A:perseguicaoOfegante@alivio f:A.fala.quase"]],
  ["fuga.com-ferido", "Fuga carregando um ferido", "guerra: ninguém fica para trás", 2, 4, ["P:dialogo.dois.lado.frontal A:fugaCarregandoAlguem@determinado B:ajoelhadoFerido@dor", "P:dialogo.dois.lado.close-b B:@dor f:B.fala.sacrificio", "P:dialogo.dois.lado.close-a A:@determinado k f:A.fala.protege"]],
  ["fuga.salto-no-vazio", "Salto no vazio", "aventura: o penhasco", 1, 5, ["P:um.inteiro.costas A:perseguicaoDerrapando@medo t:largo", "P:um.close.frente A:@determinado f:A.fala.pula", "P:camera-movimento.eleva-plongee A:puloEmDistancia@grito k t:splash fx:velocidade"]],
  ["fuga.despiste", "Despistar o perseguidor", "espionagem: na multidão", 2, 3, ["P:movimento.perseguicao.ombro-perseguidor A:caminhando@alerta B:perseguicaoProcurando@raiva", "P:suspense.espiando-escondido A:fugaColadoParede@medo B:perseguicaoProcurando@raiva k", "P:um.medio.tres-quartos B:perseguicaoProcurando@raiva f:B.fala.quaseVisto"]],
  /* ---------- ESCONDERIJO ---------- */
  ["esconderijo.esconder", "Esconder-se", "suspense: atrás do muro", 2, 3, ["P:suspense.espiando-escondido A:fugaEscondendo@medo B:caminhando@frio", "P:um.close.tres-quartos A:dedoNosLabios@medo k f:A.sussurra.esconde", "P:suspense.pov-escondido-baixo B:perseguicaoProcurando@frio"]],
  ["esconderijo.prender-respiracao", "Prender a respiração", "terror: o silêncio", 2, 4, ["P:suspense.ameaca-atras A:fugaColadoParede@medo B:empe@frio", "P:um.olhos.frente A:@medo t:largo k r:momento sfx:silencio", "P:suspense.figura-no-fim B:caminhando@frio b:nenhuma"]],
  ["esconderijo.quase-descoberto", "Quase descoberto", "suspense: a lanterna passa", 2, 4, ["P:suspense.espiando-escondido A:escondidoAgachado@medo B:procurandoMaoNosOlhos@alerta", "P:suspense.sombra-na-porta/BA B:@alerta k f:B.fala.quaseVisto", "P:um.close.holandes A:@medo sfx:silencio"]],
  ["esconderijo.espiar", "Espiar", "noir: pela fresta", 2, 2, ["P:suspense.espiando-escondido A:espiando@alerta B:celularNoOuvido@malicia", "P:pov.outro/AB A:@foco B:@malicia k f:B.fala.segredo", "P:um.olhos.tres-quartos A:@choque t:largo"]],
  ["esconderijo.infiltracao", "Infiltração", "heist: entrar sem ser visto", 1, 3, ["P:estabelecimento.vigilancia A:fugaEsgueirando@foco t:largo", "P:movimento.pes A:fugaEsgueirando@foco r:momento", "P:um.medio.tres-quartos A:fugaColadoParede@determinado k f:A.sussurra.infiltra"]],
  /* ---------- REVELAÇÃO ---------- */
  ["revelacao.segredo", "O segredo", "Polti: revelação", 2, 3, ["P:dialogo.dois.perto.mestre-perfil A:@neutro B:olharDeLado@triste", "P:dialogo.dois.perto.ombro-a-dir B:@triste f:B.fala.segredo", "P:dialogo.dois.perto.limpo-a A:@choque k fx:flash t:grande"]],
  ["revelacao.identidade", "A identidade revelada", "Propp: reconhecimento", 2, 5, ["P:suspense.revelacao-ombro A:@alerta B:costasParaCamera@neutro", "P:suspense.figura-no-fim B:@malicia k t:splash fx:sombra_dramatica f:B.fala.identidade", "P:um.close.frente A:@choque fx:concentracao"]],
  ["revelacao.verdade", "A verdade chocante", "drama: o chão some", 1, 4, ["P:objeto.olhar-objeto A:sentadoLendo@neutro", "P:um.close.frente A:@choque k fx:flash f:A.pensa.verdade", "P:emocao.isolamento A:ajoelhadoChorando@triste r:aspecto b:nenhuma"]],
  ["revelacao.reviravolta", "Reviravolta", "estrutura: plot twist", 3, 5, ["P:dialogo.tres.triangulo.mestre A:@neutro B:@alegria C:@neutro", "P:dialogo.tres.triangulo.close-c C:sorrisoMaligno@malicia k fx:sombra_dramatica t:grande f:C.fala.traicao", "P:dialogo.tres.triangulo.dois-ab A:@choque B:@choque"]],
  ["revelacao.flashback", "Flashback", "memória: antes de tudo", 1, 2, ["P:emocao.pensativo A:pensando@pensa f:A.pensa.flashback", "P:anime.sekai A:empe@alegria k b:nenhuma t:largo f:narra.flashback", "P:emocao.pensativo A:@triste"]],
  /* ---------- RELAÇÃO / EMOÇÃO ---------- */
  ["relacao.consolo", "Consolo", "drama: o ombro amigo", 2, 2, ["P:emocao.vulneravel B:ajoelhadoChorando@triste", "P:dialogo.dois.perto.mestre-perfil A:estendendoAMaoAjuda@triste B:@triste f:A.fala.consolo", "P:romance.abraco-ombro A:abracoAberto@alivio B:@alivio k b:nenhuma"]],
  ["relacao.declaracao", "Declaração", "romance: confissão", 2, 3, ["P:romance.por-do-sol A:timidaPesParaDentro@amor B:@neutro t:largo", "P:romance.declaracao A:maoNoPeitoJuramento@amor k f:A.fala.declara", "P:romance.olhares-b B:maosNoRostoVergonha@surpresa t:pequeno"]],
  ["relacao.despedida", "Despedida", "drama: a estação", 2, 3, ["P:dialogo.dois.distancia.mestre-perfil A:acenandoAdeusTriste@triste B:acenandoAdeusTriste@triste t:largo", "P:dialogo.dois.distancia.limpo-a A:@triste f:A.fala.adeus", "P:emocao.solidao-costas A:cabisbaixoAndando@triste k b:nenhuma r:aspecto"]],
  ["relacao.reencontro", "Reencontro", "drama: de volta", 2, 3, ["P:dialogo.dois.distancia.mestre-perfil A:@surpresa B:@surpresa t:largo", "P:dialogo.dois.distancia.limpo-b B:correndoBracosAbertos@alegria f:B.grita.reencontro", "P:romance.abraco-ombro A:abracoAberto@alivio B:abracoAberto@alegria k"]],
  ["relacao.discussao", "Discussão", "drama: a briga", 2, 3, ["P:dialogo.dois.frente.mestre-perfil A:gesticulandoBravo@raiva B:bracosCruzadosEmburrado@raiva", "P:dialogo.dois.frente.ombro-b-esq A:apontandoAcusando@raiva k f:A.grita.discussao", "P:dialogo.dois.frente.ombro-a-dir B:@raiva f:B.grita.discussao"]],
  ["relacao.reconciliacao", "Reconciliação", "drama: as pazes", 2, 2, ["P:dialogo.dois.frente.dois-3-4-a A:@triste B:@triste", "P:dialogo.dois.frente.limpo-a A:estendendoMaoRival@alivio f:A.fala.perdao", "P:romance.maos A:maoEstendidaApertar@alegria B:maoEstendidaApertar@alegria k"]],
  ["relacao.luto", "Luto", "Polti: perda de entes queridos", 2, 4, ["P:combate.caido.aereo A:ajoelhadoChorando@triste B:caidoDeCostas@neutro t:largo", "P:emocao.desespero A:@triste k f:A.grita.luto b:nenhuma", "P:estabelecimento.entardecer-contraluz A:derrotaDeJoelhos@triste r:aspecto"]],
  ["relacao.promessa", "A promessa", "Jornada: o voto", 2, 2, ["P:dialogo.dois.perto.dois-3-4-a A:juramento@determinado B:@triste", "P:romance.maos A:@determinado B:@alivio k f:A.fala.promessa"]],
  /* ---------- PROVAÇÃO / CRISE ---------- */
  ["provacao.derrota", "A derrota", "Save the Cat: tudo está perdido", 2, 4, ["P:combate.golpe.baixo A:atingidoCostas@dor B:socoMartelo@malicia k fx:impacto_tela sfx:impacto", "P:combate.caido.aereo A:caidoDeBrucos@dor B:vitoriaCostasViradas@frio t:largo", "P:um.close.plongee A:@dor f:A.pensa.derrota"]],
  ["provacao.fundo-do-poco", "O fundo do poço", "Save the Cat: noite escura da alma", 1, 2, ["P:estabelecimento.pequeno-no-mundo A:sentadoEncostadoParede@triste t:largo r:aspecto", "P:emocao.desespero A:deitadoFetal@triste k b:nenhuma f:A.pensa.fundo", "P:um.olhos.frente A:@triste r:momento"]],
  ["provacao.duvida", "A dúvida", "Jornada: crise interna", 1, 2, ["P:emocao.pensativo A:sentadoNaEscadaPensativo@pensa", "P:um.close.tres-quartos A:maoNaTesta@triste k f:A.pensa.duvida"]],
  ["provacao.ferido", "Ferido", "ação: sangue e suor", 1, 3, ["P:um.inteiro.contra-plongee A:ajoelhadoFerido@dor fx:salpicos", "P:um.close.contra-plongee A:cuspindoSangue@dor k", "P:emocao.determinacao A:levantandoComEsforco@determinado f:A.fala.virada"]],
  ["provacao.sacrificio", "O sacrifício", "Polti: sacrifício por um ideal", 3, 5, ["P:dialogo.tres.dois-contra-um.mestre A:defesaBarreiraDupla@determinado B:@medo C:poderKamehameha@malicia", "P:dialogo.tres.dois-contra-um.close-a A:@determinado k f:A.grita.sacrificio t:grande fx:barreira@A", "P:dialogo.tres.dois-contra-um.close-b B:@choque f:B.grita.susto"]],
  /* ---------- PODER / TRANSFORMAÇÃO ---------- */
  ["poder.despertar", "O despertar", "anime: o poder oculto", 1, 4, ["P:emocao.desespero A:ajoelhadoExausto@dor", "P:um.olhos.frente A:@choque t:largo fx:flash", "P:anime.power-up A:poderTransformacao@grito k t:splash fx:aura_explosiva f:A.pensa.desperta"]],
  ["poder.transformacao", "Transformação", "mahō shōjo / tokusatsu", 1, 4, ["P:anime.transformacao A:flutuandoBracosAbertos@foco fx:aneis_orbitais", "P:anime.power-up A:poderTransformacao@grito k fx:pilar t:grande", "P:hq.splash-heroi A:entradaHeroica@determinado f:A.fala.transforma"]],
  ["poder.carregar", "Carregando o ataque", "shōnen: o tempo para", 1, 4, ["P:anime.power-up A:poderCarregando@grito fx:aura", "P:um.close.contra-plongee A:@grito k fx:pedras_levitando f:A.fala.carga", "P:camera-movimento.abaixa-heroi A:poderBolaPreparo@foco fx:energia_mao@A.maoDir"]],
  ["poder.aura", "A aura assusta o inimigo", "anime: pressão espiritual", 2, 4, ["P:combate.energia.mestre A:poderTransformacao@frio B:guardaLuta@medo fx:aura_explosiva@A", "P:combate.energia.olhos-b B:@medo k t:largo f:B.fala.gigante"]],
  /* ---------- CLÍMAX ---------- */
  ["climax.confronto-final", "Confronto final", "Jornada: provação suprema", 2, 5, ["P:combate.impasse.mestre A:guardaLuta@determinado B:guardaLuta@frio t:largo f:A.fala.finalConfronto", "P:combate.impasse.olhos-a A:@determinado t:largo", "P:combate.golpe.baixo A:socoCarregado@grito B:socoCarregado@grito k t:splash fx:impacto_tela b:diagonal sfx:explosao"]],
  ["climax.golpe-decisivo", "Golpe decisivo", "shōnen: técnica final", 2, 5, ["P:anime.power-up A:poderCarregando@grito fx:aura", "P:combate.energia.baixo A:poderKamehameha@grito B:defesaBarreiraDupla@medo k t:splash fx:feixe@A sfx:poder", "P:combate.vitoria.mestre A:ajoelhadoExausto@cansado B:caidoDeCostas@dor"]],
  ["climax.salvamento", "Salvamento no último segundo", "ação: a mão que segura", 2, 5, ["P:um.inteiro.plongee B:puloQueda@medo f:B.grita.socorro", "P:hq.mao-estendida A:perseguicaoAgarrando@grito k t:grande fx:velocidade f:A.grita.salva", "P:romance.abraco-ombro A:@alivio B:@alivio"]],
  ["climax.ultima-chance", "Última chance", "suspense: o relógio", 1, 5, ["P:objeto.relogio A:@foco t:pequeno sfx:silencio", "P:um.olhos.frente A:@determinado r:momento", "P:camera-movimento.vertigo A:arrancada@grito k t:grande fx:velocidade f:A.fala.chance"]],
  /* ---------- DESFECHO ---------- */
  ["desfecho.vitoria", "Vitória", "Propp: vitória", 2, 3, ["P:combate.vitoria.baixo A:vitoriaPunhoAlto@alegria B:caidoDeCostas@dor k t:grande f:A.grita.vitoria", "P:estabelecimento.entardecer-contraluz A:vitoriaCostasViradas@alivio t:largo"]],
  ["desfecho.celebracao", "Celebração", "Propp: casamento/festa", 3, 2, ["P:grupo.roda.frontal A:bracosParaCimaAlegria@alegria B:pulandoDeAlegria@alegria C:dancandoAlegre@alegria t:largo k f:A.grita.festa", "P:dialogo.tres.linha.close-c C:@alegria t:pequeno"]],
  ["desfecho.retorno", "O retorno", "Jornada: retorno com o elixir", 1, 2, ["P:estabelecimento.chegada A:caminhando@cansado t:largo", "P:estabelecimento.porta A:empe@alivio k f:A.fala.volta"]],
  ["desfecho.novo-dia", "Um novo dia", "Save the Cat: imagem final", 1, 1, ["P:anime.olhando-o-ceu A:espreguicando@alivio t:largo b:nenhuma k f:narra.novoDia", "P:estabelecimento.panorama A:caminhando@alegria r:lugar"]],
  ["desfecho.gancho", "Gancho (cliffhanger)", "série: continua…", 2, 4, ["P:estabelecimento.vigilancia A:caminhando@alivio", "P:suspense.figura-no-fim B:risadaVila@malicia k t:grande fx:sombra_dramatica f:narra.gancho"]],
  ["desfecho.vilao-escapa", "O vilão escapa", "série: nos veremos", 2, 3, ["P:combate.vitoria.mestre A:guardaLuta@raiva B:flutuandoAmeaca@malicia", "P:um.close.contra-plongee B:@malicia k f:B.fala.vilaoFoge", "P:emocao.isolamento A:@raiva t:largo"]],
  /* ---------- COMÉDIA ---------- */
  ["comedia.tombo", "O tombo", "gag: pastelão", 1, 2, ["P:movimento.lateral A:caminhando@alegria", "P:um.inteiro.tres-quartos A:escorregaoComico@choque k sfx:queda", "P:um.close.plongee A:quedaSentado@dor f:A.fala.gag"]],
  ["comedia.mal-entendido", "Mal-entendido", "sitcom: não é o que parece", 2, 2, ["P:dialogo.dois.perto.mestre-perfil A:@surpresa B:@surpresa", "P:dialogo.dois.perto.limpo-b B:chocadoMaosNaBoca@choque k fx:emote", "P:dialogo.dois.perto.limpo-a A:maosAoAlto@medo f:A.grita.malEntendido"]],
  ["comedia.reacao-exagerada", "Reação exagerada", "mangá: chibi", 1, 2, ["P:um.medio.frente A:@neutro", "P:anime.choque-comico A:desesperoMaosNaCabeca@choque k t:grande fx:concentracao f:A.grita.exagero"]],
  ["comedia.silencio", "Silêncio constrangedor", "timing: a pausa", 2, 1, ["P:dialogo.dois.lado.frontal A:@neutro B:@neutro f:A.fala.silencio", "P:dialogo.dois.lado.frontal A:@neutro B:@neutro k r:momento sfx:silencio", "P:dialogo.dois.lado.close-b B:encolhendoOmbros@neutro fx:emote@B"]],
  /* ---------- SUSPENSE / TERROR ---------- */
  ["suspense.algo-espreita", "Algo espreita", "terror: o vulto", 2, 3, ["P:suspense.nuca-olhando A:@alerta", "P:suspense.ameaca-atras A:empe@neutro B:espiando@frio k", "P:um.close.tres-quartos A:@medo f:A.sussurra.espreita"]],
  ["suspense.aparicao", "A aparição", "terror: jump scare", 2, 5, ["P:um.medio.costas A:empe@alerta r:momento", "P:suspense.olhos-arregalados A:@choque k fx:sombra_dramatica t:splash sfx:susto", "P:suspense.figura-no-fim B:flutuandoAmeaca@frio"]],
  ["suspense.porta", "A porta", "terror: o que há do outro lado", 1, 3, ["P:objeto.porta-macaneta A:@alerta t:pequeno", "P:suspense.algo-atras-da-porta A:@medo k f:A.sussurra.porta", "P:suspense.holandes-extremo A:@choque"]],
  ["suspense.olhos-no-escuro", "Olhos no escuro", "terror: a floresta", 1, 3, ["P:estabelecimento.horizonte-baixo A:caminhando@alerta t:largo", "P:suspense.de-cima-canto A:@medo k r:momento", "P:suspense.dolly-zoom A:@choque fx:concentracao"]],
  /* ---------- TRANSIÇÃO ---------- */
  ["transicao.passagem-tempo", "Passagem de tempo", "montagem: anos depois", 1, 1, ["P:estabelecimento.alto A:empe@neutro t:largo r:tempo f:narra.passagem", "P:um.medio.tres-quartos A:@determinado k"]],
  ["transicao.viagem", "A viagem", "road movie", 2, 1, ["P:anime.janela-do-trem A:@pensa t:largo r:lugar f:A.pensa.viagem", "P:dialogo.dois.andando.frontal A:caminhando@neutro B:caminhando@alegria k"]],
  ["transicao.montagem-treino", "Montagem de treino", "Rocky: dia após dia", 1, 2, ["P:um.medio.tres-quartos A:socando@esforco r:acao f:narra.montagem", "P:um.inteiro.perfil A:chuteAlto@foco r:acao", "P:um.close.frente A:@determinado k"]],
  ["transicao.mudanca-local", "Mudança de lugar", "corte de cena", 1, 1, ["P:estabelecimento.aereo A:caminhando@neutro t:largo r:cena", "P:estabelecimento.chegada A:empe@surpresa k"]],
  /* ---------- ESCALA / CRIATURAS ---------- */
  ["escala.gigante-aparece", "O gigante aparece", "kaiju: a revelação do tamanho", 2, 5, ["P:escala.nuca-do-pequeno A:minusculoOlhandoCima@choque B:giganteRugindo@raiva t:alto k sfx:impacto", "P:escala.de-longe A:fugaDesesperada@medo B:gigantePisando@raiva fx:poeira", "P:escala.pequeno-olha-gigante A:@choque f:A.grita.gigante"]],
  ["escala.pequeno-heroi", "O pequeno herói", "fábula: Davi e Golias", 2, 3, ["P:escala.gigante-olha-pequeno A:minusculoAcenando@determinado B:giganteOlhandoBaixo@surpresa f:A.grita.pequeno", "P:escala.pes-do-gigante A:minusculoEmpurrando@determinado k"]],
  ["escala.na-palma", "Na palma da mão", "fantasia: o gigante gentil", 2, 2, ["P:escala.fada-na-mao A:minusculoNaPalma@alegria B:giganteSegurandoNaPalma@alegria k t:grande", "P:escala.gigante-olha-pequeno A:@alegria B:@alegria"]]
];
/* índice e árvore */
const NR = new Map(); for (const [id, nome, fonte, papeis, intensidade, beats] of NR_DEF) NR.set(id, { id, nome, fonte, papeis, intensidade, beats, familia: id.split(".")[0] });
const NR_FAMILIAS = { apresentacao: "Apresentação", gatilho: "Gatilho / incidente", direcionamento: "Direcionamento (mentor, plano, decisão)", oposicao: "Oposição", conflito: "Conflito / luta", cerco: "Cerco", perseguicao: "Perseguição", fuga: "Fuga", esconderijo: "Esconderijo", revelacao: "Revelação", relacao: "Relação / emoção", provacao: "Provação / crise", poder: "Poder / transformação", climax: "Clímax", desfecho: "Desfecho", comedia: "Comédia", suspense: "Suspense / terror", transicao: "Transição", escala: "Escala / criaturas" };

/* ===================== sorte com semente ===================== */
function nrRnd(seed) { let s = (Math.abs(Math.floor(seed)) || 1) % 2147483647; return () => (s = s * 48271 % 2147483647) / 2147483647; }
const nrPega = (r, L) => L[Math.floor(r() * L.length) % L.length];

/* ===================== batida: texto → objeto ===================== */
function nrBeat(txt) { const b = { roles: {}, fx: [], falas: [], sfx: null, k: false };
  for (const t of txt.split(/\s+/)) { if (!t) continue; if (t === "k") { b.k = true; continue; }
    const m = /^([A-Za-z]+):(.*)$/.exec(t); if (!m) continue; const [, c, v] = m;
    if (c === "P" || c === "C") { const [id, ord] = v.split("/"); b.preset = id; b.cam = c === "C"; b.ordem = ord || null; }
    else if (/^[A-E]$/.test(c)) { const r = b.roles[c] = b.roles[c] || {}; const [pose, emo] = v.split("@"); if (pose.startsWith("obj:")) { const [, o, peg] = /^obj:([^.]+)\.(.+)$/.exec(pose) || []; r.obj = o; r.pegada = peg; } else if (pose) r.pose = pose; if (emo) r.emo = emo; }
    else if (c === "fx") b.fx.push(v); else if (c === "t") b.tam = v; else if (c === "b") b.borda = v; else if (c === "r") b.ritmo = v; else if (c === "sfx") b.sfx = v; else if (c === "d") b.dur = +v;
    else if (c === "f") { const p = v.split("."); if (p[0] === "narra") b.falas.push({ quem: null, modo: "narra", chave: p[1] }); else b.falas.push({ quem: p[0], modo: p[1], chave: p[2] }); }
    else if (c === "an") { const [q, a] = v.split("."); (b.anims = b.anims || []).push({ quem: q, anim: a }); } }
  return b; }
/* versões: transformações das batidas */
function nrVersao(beats, versao, papeis) { const bs = beats.map(nrBeat); let ki = bs.findIndex(b => b.k); if (ki < 0) ki = bs.length - 1;
  const quem = Object.keys(bs[ki].roles)[0] || "A", outro = papeis > 1 ? (quem === "A" ? "B" : "A") : null;
  if (versao === "suspense") { bs.splice(ki, 0, nrBeat("C:um.close.frente/" + quem + " " + quem + ":@alerta t:largo r:momento")); ki++; bs.splice(ki + 1, 0, nrBeat("C:um.close.tres-quartos/" + (outro || quem) + " " + (outro || quem) + ":@surpresa t:pequeno r:momento")); }
  else if (versao === "impacto") { const k = bs[ki]; k.tam = "splash"; if (!k.fx.some(f => /velocidade|concentracao/.test(f))) k.fx.push("concentracao"); return bs.filter((b, i) => i === 0 || i === ki).map((b, i, A) => (i === 0 && A.length > 1 && b === A[1]) ? b : b); }
  else if (versao === "pov") { const k = bs[ki]; if (outro && bs.slice(0, ki + 1).some(b => b.roles[outro] || (b.preset && !b.cam && pcAchar(b.preset) && pcAchar(b.preset).papeis.length > 1))) { k.preset = "pov.outro"; k.cam = true; k.ordem = outro + quem; } else { k.preset = "pov.frente"; k.cam = true; k.ordem = quem; } }
  else if (versao === "lenta") { bs.splice(ki, 0, nrBeat("C:um.close.frente/" + quem + " " + quem + ":@foco t:largo r:momento")); ki++; bs[ki].tam = "grande"; bs.splice(ki + 1, 0, nrBeat("C:um.medio.tres-quartos/" + quem + " b:nenhuma r:momento sfx:silencio")); }
  return bs; }

/* ===================== beat → texto do name ===================== */
const NR_ANGULO_TOM = { baixo: ["baixo", "contra-plongee", "frontal-baixo", "heroi-baixo"], holandes: ["holandes", "holandes-extremo"], alto: ["aereo", "plongee", "alto"] };
function nrPresetComTom(id, tom, ehK) { const T = NR_TONS[tom]; if (!ehK || !T || !T.angulo) return id; const p = id.split("."), base = p.slice(0, -1).join(".");
  for (const s of NR_ANGULO_TOM[T.angulo] || []) { const c = base + "." + s; if (pcAchar(c) && c !== id) return c; } return id; }
function nrExpr(emo, tom) { if (!emo) return null; const T = NR_TONS[tom] || NR_TONS.leve; return (T.emo && T.emo[emo]) || NR_EMO[emo] || emo; }
function nrFala(chave, r) { const L = NR_FALAS[chave]; return L ? nrPega(r, L) : "…"; }
const NR_MODO_FALA = { fala: "fala", pensa: "pensa", grita: "grita", sussurra: "sussurra", narra: "narra" };
/* nomes dos papéis → pessoas; o preset pode pedir outra ordem ("/BA") */
function nrComNomes(b, nomes, papeis) { const ord = (b.ordem || "ABCDE".slice(0, Math.max(1, pcAchar(b.preset) ? pcAchar(b.preset).papeis.length : papeis))).split(""); return ord.map(c => nomes["ABCDE".indexOf(c)] || nomes[0]); }
/* linhas de um quadro/plano (sem o cabeçalho) */
function nrLinhas(b, nomes, papeis, tom, r, fmt, t0 = 0) { const L = [], d = pcAchar(b.preset);
  if (d) { const pid = nrPresetComTom(d.id, tom, b.k); const ns = nrComNomes(Object.assign({}, b, { preset: pid }), nomes, papeis).slice(0, (pcAchar(pid) || d).papeis.length); L.push((b.cam ? "camera preset " : "cena preset ") + pid + " com " + ns.join(", ")); }
  for (const [c, R] of Object.entries(b.roles)) { const n = nomes["ABCDE".indexOf(c)]; if (!n) continue; const p = [];
    if (R.obj) p.push("segura " + R.obj + " como " + R.pegada); else if (R.pose) p.push("pose " + R.pose);
    const ex = nrExpr(R.emo, tom); if (ex) p.push("expressao " + ex);
    if (p.length) L.push((fmt === "animacao" && t0 ? t0.toFixed(1) + "s " : "") + n + " " + p.join(" ")); }
  const T = NR_TONS[tom] || NR_TONS.leve;
  for (const f of b.fx) { const [tipo, onde] = f.split("@"); if (onde) { const [q, parte] = onde.split("."), n = nomes["ABCDE".indexOf(q)]; if (n) L.push(n + " efeito " + tipo + (parte ? " em " + parte : "") + (T.cena && tom !== "melancolico" ? " colorido" : "")); }
    else if (tipo === "emote") { const n = nomes[0]; L.push(n + " efeito emote simbolo " + (tom === "comico" ? "gota" : "veia")); }
    else if (tipo === "veiaDeRaiva") L.push(nomes[0] + " efeito emote simbolo veia"); else L.push("efeito " + tipo); }
  if (b.k && T.fx && !b.fx.includes(T.fx)) { if (T.fx === "emote") L.push(nomes[0] + " efeito emote simbolo gota"); else L.push("efeito " + T.fx); }
  if (b.sfx) L.push("efeito onomatopeia texto \"" + nrPega(r, NR_SFX[b.sfx] || ["!"]) + "\"");
  let tt = t0 + 0.4; for (const f of b.falas) { const txt = nrFala(f.chave, r), m = NR_MODO_FALA[f.modo] || "fala";
    if (f.modo === "narra") L.push((fmt === "animacao" ? "" : "") + "narra \"" + txt + "\"");
    else { const n = nomes["ABCDE".indexOf(f.quem)]; if (n) L.push((fmt === "animacao" ? tt.toFixed(1) + "s " : "") + n + " " + m + " \"" + txt + "\""); tt += 1.2; } }
  for (const a of b.anims || []) { const n = nomes["ABCDE".indexOf(a.quem)]; if (n) L.push((fmt === "animacao" ? "0.2s " : "") + n + " anima " + a.anim); }
  return L; }

/* ===================== receita → texto ===================== */
function nrAchar(id) { const p = String(id || "").split("."); for (let n = p.length; n >= 1; n--) { const k = p.slice(0, n).join("."); if (NR.has(k)) return { def: NR.get(k), resto: p.slice(n) }; }
  const fim = p[p.length - 1], d = [...NR.values()].find(x => x.id.endsWith("." + fim) || x.id.split(".")[1] === fim); return d ? { def: d, resto: [] } : null; }
/* uma função narrativa vira quadros (manga/webtoon) ou planos (animação) */
function nrReceita(id, o = {}) { const a = nrAchar(id); if (!a) throw new Error("Função narrativa “" + id + "” não existe. Veja: " + [...NR.keys()].slice(0, 12).join(", ") + "…");
  const def = a.def, versao = o.versao || (a.resto.find(x => NR_VERSOES[x])) || "direta", tom = o.tom || (a.resto.find(x => NR_TONS[x])) || "leve", fmt = o.formato || "manga";
  const nomes = (o.nomes && o.nomes.length ? o.nomes : ["Kai", "Mira", "Leo", "Ana", "Rui"]).slice(), r = nrRnd((o.semente || 1) * 7919 + def.id.length * 31);
  const precisa = Math.max(def.papeis, ...def.beats.map(t => { const id = (/(?:^|\s)[PC]:([^\s/]+)/.exec(t) || [])[1], d = id && pcAchar(id); return d ? d.papeis.filter(x => x !== "M").length : 1; }));
  const extras = ["Leo", "Ana", "Rui", "Bia", "Teo"].filter(x => !nomes.includes(x)); while (nomes.length < precisa) nomes.push(extras.shift() || "Extra" + nomes.length);
  const beats = nrVersao(def.beats, versao, def.papeis);
  return { def, versao, tom, formato: fmt, nomes, beats, r }; }
function nrCabQuadro(b, tom, fmt, n) { const T = NR_TONS[tom] || NR_TONS.leve, h = ["quadro " + n];
  if (fmt === "manga" || fmt === "comic") { if (b.tam) h.push("tamanho " + b.tam); const bd = b.borda || (b.k && T.borda); if (bd) h.push("borda " + bd); }
  if (fmt === "webtoon") { if (b.ritmo) h.push("ritmo " + b.ritmo); if (b.k && (b.tam === "splash" || b.tam === "grande")) h.push("respiro 1"); const bd = b.borda || (b.k && T.borda); if (bd) h.push("borda " + bd); }
  if (T.cena) h.push("tom " + T.cena);
  return h.join(" "); }
/* texto do name para UMA receita (sem elenco) — n0 = número do primeiro quadro/plano */
function nrTexto(rc, n0 = 1, est = {}) { const { beats, tom, formato: fmt, nomes, def, r } = rc, out = [];
  if (fmt === "animacao") { let n = n0;
    for (const b of beats) { const dur = b.dur || (b.k ? 3 : b.tam === "pequeno" ? 1.5 : 2.2) + 1.1 * b.falas.filter(f => f.modo !== "narra").length; out.push("  plano " + n++ + " duracao " + dur.toFixed(1) + "s" + (NR_TONS[tom].cena ? " tom " + NR_TONS[tom].cena : ""));
      if (n === n0 + 1) nrSoltar(beats, nomes, def).forEach(l => out.push("    " + l));
      nrLinhas(b, nomes, def.papeis, tom, r, fmt, 0).forEach(l => out.push("    " + l));
      for (const [c, R] of Object.entries(b.roles)) { const nm = nomes["ABCDE".indexOf(c)]; if (!nm || !R.pose) continue; const an = NR_ANIM_POSE[R.pose]; if (an) out.push("    0.3s " + nm + " anima " + an); } }
    return { linhas: out, n: n }; }
  let n = n0; beats.forEach((b, i) => { out.push(nrCabQuadro(b, tom, fmt, n++)); if (i === 0) nrSoltar(beats, nomes, def).forEach(l => out.push("  " + l)); nrLinhas(b, nomes, def.papeis, tom, r, fmt).forEach(l => out.push("  " + l)); });
  return { linhas: out, n }; }
/* no começo de cada função: quem não vai segurar nada nela larga o que tinha (continuidade sem objetos esquecidos na mão) */
function nrSoltar(beats, nomes, def) { const out = [], segura = new Set(beats.flatMap(b => Object.entries(b.roles).filter(([, R]) => R.obj).map(([c]) => c)));
  const b0 = beats[0] || { roles: {} };
  "ABCDE".slice(0, Math.max(def.papeis, 1)).split("").forEach((c, i) => { if (!nomes[i]) return; const p = []; if (!segura.has(c)) p.push("guarda"); if (!b0.roles[c] || (!b0.roles[c].pose && !b0.roles[c].obj)) p.push("pose empe"); if (p.length) out.push(nomes[i] + " " + p.join(" ")); }); return out; }
/* pose → animação de ação (para o filme) */
const NR_ANIM_POSE = { esquivaLateral: "esquivaLateralAnim", esquivaParaTras: "esquivaParaTrasAnim", esquivaMergulho: "esquivaMergulhoAnim", impactoNoRosto: "levarSocoNoRosto", impactoNoEstomago: "levarSocoNoEstomago", arremessadoParaTras: "serArremessado", poderCarregando: "carregarPoder", poderKamehameha: "dispararRaio", puloEmDistancia: "puloEmDistanciaAnim", puloAterrissagemHeroi: "pousoDeHeroi", fugaOlhandoTras: "fugaOlhandoTrasAnim", perseguicaoAgarrando: "perseguicaoAgarrao", levantandoComEsforco: "levantarDoChaoLuta", vitoriaPunhoAlto: "vitoriaAnim", derrotaDeJoelhos: "derrotaAnim", encaraRival: "confrontoEncarar", gigantePisando: "gigantePisao", minusculoEsmagado: "minusculoFogePisao", parkourCorridaParede: "parkourVaultAnim", flutuandoBracosAbertos: "levitar" };

/* ===================== cabeçalhos de formato ===================== */
function nrCabFormato(fmt, titulo) { if (fmt === "webtoon") return ["pagina formato webtoon"]; if (fmt === "animacao") return ["filme \"" + (titulo || "história") + "\" fps 12", "cena \"" + (titulo || "história") + "\""]; return ["pagina formato manga leitura japonesa"]; }
const NR_PESO = { pequeno: 0.7, normal: 1, grande: 2, largo: 1.6, alto: 1.6, inserto: 0.5, splash: 6 };
/* quebra de página do mangá pelo peso dos quadros */
function nrPaginar(linhas) { const out = [], cab = "pagina formato manga leitura japonesa"; let peso = 0, nq = 0;
  for (const l of linhas) { const m = /^quadro \d+(.*)$/.exec(l); if (m) { const t = (/tamanho (\w+)/.exec(m[1]) || [])[1] || "normal", w = NR_PESO[t] || 1;
      if (t === "splash" && nq > 0 || peso + w > 7 || nq >= 6) { out.push(cab); peso = 0; nq = 0; } peso += w; nq++; } out.push(l); }
  return out; }

/* ===================== ESTRUTURAS DE HISTÓRIA ===================== */
/* cada passo: lista de funções possíveis (família inteira com "*"); a semente sorteia; a tensão ideal guia a nota */
const NR_ESTRUTURAS = {
  "tres-atos": { nome: "Três atos", fonte: "Syd Field", passos: ["apresentacao.*", "gatilho.*", "direcionamento.decisao|direcionamento.plano|direcionamento.partida", "oposicao.*", "perseguicao.*|cerco.*|fuga.*", "provacao.*", "poder.*|revelacao.*", "climax.*", "desfecho.*"] },
  jornada: { nome: "Jornada do Herói (12 etapas)", fonte: "Campbell / Vogler", passos: ["apresentacao.mundo|apresentacao.rotina|apresentacao.heroi", "gatilho.chamado|gatilho.mensagem|gatilho.descoberta|gatilho.profecia", "direcionamento.recusa", "direcionamento.mentor|direcionamento.presente", "direcionamento.partida", "oposicao.*|direcionamento.aliado|direcionamento.treino", "esconderijo.*", "provacao.derrota|provacao.ferido|provacao.sacrificio", "poder.*|revelacao.*", "perseguicao.*|fuga.*", "climax.*", "desfecho.retorno|desfecho.vitoria|desfecho.novo-dia"] },
  kishotenketsu: { nome: "Kishōtenketsu (4 tempos)", fonte: "narrativa clássica sino-japonesa", passos: ["apresentacao.*", "relacao.*|transicao.*|apresentacao.rotina", "revelacao.*|comedia.*|suspense.*", "desfecho.novo-dia|desfecho.retorno|relacao.reconciliacao|relacao.promessa"] },
  "save-the-cat": { nome: "Save the Cat (folha de batidas)", fonte: "Blake Snyder", passos: ["apresentacao.rotina|apresentacao.mundo", "apresentacao.heroi|apresentacao.dupla", "gatilho.*", "provacao.duvida|direcionamento.recusa", "direcionamento.decisao|direcionamento.partida", "relacao.*|direcionamento.aliado", "conflito.*|perseguicao.*", "revelacao.reviravolta|oposicao.traicao", "provacao.derrota", "provacao.fundo-do-poco", "poder.despertar|direcionamento.decisao", "climax.*", "desfecho.novo-dia|desfecho.vitoria"] },
  propp: { nome: "Morfologia do conto (Propp)", fonte: "Vladimir Propp", passos: ["apresentacao.lugar-perigoso", "gatilho.perda|gatilho.sequestro", "direcionamento.mentor", "direcionamento.presente", "direcionamento.partida", "conflito.*", "perseguicao.*|fuga.*", "revelacao.identidade", "desfecho.celebracao|desfecho.vitoria"] },
  acao: { nome: "Episódio de ação", fonte: "shōnen / blockbuster", passos: ["gatilho.ataque-subito|gatilho.sequestro|apresentacao.vilao", "perseguicao.*", "cerco.*", "conflito.*", "provacao.ferido|conflito.virada", "poder.*", "climax.golpe-decisivo|climax.confronto-final", "desfecho.vitoria|desfecho.gancho|desfecho.vilao-escapa"] },
  romance: { nome: "Romance", fonte: "comédia romântica", passos: ["apresentacao.rotina", "gatilho.encontro", "comedia.mal-entendido|comedia.silencio", "relacao.discussao", "relacao.despedida", "provacao.duvida", "relacao.declaracao|relacao.reencontro", "desfecho.novo-dia"] },
  terror: { nome: "Terror", fonte: "horror: aparição em escalada", passos: ["apresentacao.lugar-perigoso", "suspense.olhos-no-escuro|suspense.algo-espreita", "suspense.porta", "esconderijo.prender-respiracao|esconderijo.quase-descoberto", "suspense.aparicao", "perseguicao.monstro|fuga.por-um-triz", "desfecho.gancho"] },
  comedia: { nome: "Comédia", fonte: "sitcom em 3 gags", passos: ["apresentacao.dupla", "comedia.tombo", "comedia.mal-entendido", "relacao.discussao", "comedia.reacao-exagerada", "relacao.reconciliacao"] },
  misterio: { nome: "Mistério", fonte: "whodunit", passos: ["apresentacao.mundo", "gatilho.descoberta", "esconderijo.espiar", "oposicao.interrogatorio", "revelacao.verdade|revelacao.segredo", "revelacao.reviravolta", "desfecho.gancho|desfecho.vitoria"] }
};
/* curva de tensão ideal: sobe até ~80% e cai no fim */
const nrCurva = u => u < 0.8 ? 1 + 4 * Math.pow(u / 0.8, 1.3) : 5 - 3.5 * (u - 0.8) / 0.2;
function nrOpcoes(passo) { const out = []; for (const alt of passo.split("|")) { if (alt.endsWith(".*")) { const f = alt.slice(0, -2); for (const d of NR.values()) if (d.familia === f && !d.sub) out.push(d.id); } else if (NR.has(alt)) out.push(alt); } return out; }
/* nota de uma história: tensão perto da curva, variedade de presets e de versões, ninguém some, tamanho perto do pedido */
function nrNota(rcs, alvoQuadros) { const n = rcs.length; let erroT = 0; rcs.forEach((rc, i) => { const u = n > 1 ? i / (n - 1) : 1; erroT += Math.pow(rc.def.intensidade - nrCurva(u), 2); });
  const presets = rcs.flatMap(rc => rc.beats.map(b => b.preset).filter(Boolean)), fams = new Set(presets.map(p => p.split(".")[0])), rep = presets.filter((p, i) => i && p === presets[i - 1]).length;
  const nq = rcs.reduce((s, rc) => s + rc.beats.length, 0), versoes = new Set(rcs.map(rc => rc.versao)).size;
  const tensao = Math.max(0, 10 - 2 * Math.sqrt(erroT / n)), variedade = Math.min(10, fams.size * 1.2 + versoes * 0.6 - rep), ritmo = alvoQuadros ? Math.max(0, 10 - Math.abs(nq - alvoQuadros) * 0.6) : 7;
  return { total: +(tensao * 0.45 + variedade * 0.3 + ritmo * 0.25).toFixed(2), tensao: +tensao.toFixed(2), variedade: +variedade.toFixed(2), ritmo: +ritmo.toFixed(2), quadros: nq }; }
/* aproxima o número de quadros do pedido: encurta (versão impacto, depois tira passos do meio de menor tensão) ou alonga (suspense, lenta) */
function nrAjustarTamanho(rcs, alvo, o, sem) { const tot = () => rcs.reduce((s, rc) => s + rc.beats.length, 0), refaz = (i, versao) => { const rc = rcs[i]; rcs[i] = nrReceita(rc.def.id, { versao, tom: rc.tom, formato: rc.formato, nomes: o.nomes, semente: sem + i }); };
  for (let g = 0; g < 60; g++) { const t = tot(); if (Math.abs(t - alvo) <= 1) break;
    if (t > alvo) { const c = rcs.map((rc, i) => [rc, i]).filter(([rc]) => rc.versao !== "impacto" && rc.beats.length > 2).sort((a, b) => a[0].def.intensidade - b[0].def.intensidade)[0];
      if (c) { refaz(c[1], "impacto"); continue; } const d = rcs.map((rc, i) => [rc, i]).filter(([, i]) => i > 0 && i < rcs.length - 1).sort((a, b) => a[0].def.intensidade - b[0].def.intensidade)[0]; if (!d || rcs.length <= 3) break; rcs.splice(d[1], 1); continue; }
    const c = rcs.map((rc, i) => [rc, i]).filter(([rc]) => rc.versao === "direta" || rc.versao === "pov" || rc.versao === "impacto").sort((a, b) => b[0].def.intensidade - a[0].def.intensidade)[0];
    if (!c) break; refaz(c[1], t + 2 <= alvo ? "lenta" : "suspense"); } }
/* gera K variações de uma história e devolve da melhor para a pior */
function nrHistoria(o = {}) { const est = NR_ESTRUTURAS[o.estrutura || "tres-atos"]; if (!est) throw new Error("Estrutura “" + o.estrutura + "”: use " + Object.keys(NR_ESTRUTURAS).join(", ") + ".");
  const K = Math.max(1, Math.min(12, o.variacoes || 1)), sem0 = o.semente || 1, fmt = o.formato || "manga", tom = o.tom || null, out = [];
  const tomPorTensao = i => tom || (["leve", "misterioso", "tenso", "epico", "epico", "leve"][Math.min(5, i)]);
  for (let v = 0; v < K; v++) { const r = nrRnd(sem0 * 1009 + v * 7717), rcs = [], usados = new Set();
    const passos = o.funcoes && o.funcoes.length ? o.funcoes.map(f => f) : est.passos;
    passos.forEach((p, i) => { let ops = o.funcoes && o.funcoes.length ? [nrAchar(p) ? nrAchar(p).def.id : p] : nrOpcoes(p).filter(id => !usados.has(id) && NR.get(id).papeis <= Math.max(1, (o.nomes || []).length || 2)); if (!ops.length) ops = nrOpcoes(p); if (!ops.length) return;
      const id = nrPega(r, ops); usados.add(id); const def = NR.get(id), vers = def.intensidade >= 4 ? nrPega(r, ["direta", "impacto", "lenta", "suspense"]) : nrPega(r, ["direta", "direta", "suspense", "pov"]);
      rcs.push(nrReceita(id, { versao: vers, tom: tom || tomPorTensao(def.intensidade), formato: fmt, nomes: o.nomes, semente: sem0 * 13 + v * 101 + i })); });
    if (o.quadros) nrAjustarTamanho(rcs, o.quadros, o, sem0 * 13 + v * 101);
    out.push({ variacao: v + 1, semente: sem0 * 1009 + v * 7717, estrutura: o.estrutura || "tres-atos", funcoes: rcs.map(rc => rc.def.id + "." + rc.versao + "." + rc.tom), nota: nrNota(rcs, o.quadros), receitas: rcs }); }
  out.sort((a, b) => b.nota.total - a.nota.total); return out; }
/* texto completo (elenco + formato + quadros) de uma lista de receitas */
function nrMontarTexto(rcs, o = {}) { const fmt = o.formato || (rcs[0] && rcs[0].formato) || "manga", nomes = o.nomes || (rcs[0] && rcs[0].nomes) || ["Kai", "Mira"], L = [];
  if (o.elenco !== false) { L.push("elenco"); const todos = [...new Set(rcs.flatMap(rc => rc.nomes))]; todos.forEach((n, i) => L.push("  " + n + " relevante corpo " + (i % 2 ? "feminino" : "masculino"))); }
  L.push(...nrCabFormato(fmt, o.titulo)); let n = 1, corpo = [];
  for (const rc of rcs) { if (o.marcas !== false) corpo.push((fmt === "animacao" ? "  " : "") + "# " + rc.def.nome + " (" + rc.def.id + " · " + rc.versao + " · " + NR_TONS[rc.tom].nome + ")"); const t = nrTexto(rc, n); n = t.n; corpo.push(...t.linhas); }
  if (fmt === "manga") corpo = nrPaginar(corpo).filter((l, i, A) => !(i === 0 && l.startsWith("pagina")));
  return L.concat(corpo).join("\n") + "\n"; }

/* ===================== linhas "narrativa" e "historia" dentro do name ===================== */
function nrLerOpcoes(rest) { const o = { nomes: [] }; const m = /\bcom\s+(.+?)(?=\s+(?:formato|tom|semente|variacoes|variações|quadros|funcoes|funções|versao|versão|estrutura)\b|$)/i.exec(rest); if (m) { const ps = m[1].split(/\s*,\s*|\s+e\s+/).map(s => s.trim()).filter(Boolean); o.nomes = ps.map((x, i) => i === ps.length - 1 ? x.split(/\s+/)[0] : x.split(/\s+/)[0]); }
  const v = k => { const r = new RegExp("\\b" + k + "\\s+([\\w.,-]+)", "i").exec(rest); return r ? r[1] : null; };
  o.formato = v("formato"); o.tom = v("tom"); o.semente = +(v("semente") || 1); o.variacoes = +(v("variacoes") || v("variações") || 1); o.quadros = +(v("quadros") || 0) || null;
  const f = v("funcoes") || v("funções"); if (f) o.funcoes = f.split(",").filter(Boolean); o.versao = v("versao") || v("versão");
  for (const w of rest.split(/\s+/)) { if (NR_VERSOES[w] && !o.versao) o.versao = w; if (NR_TONS[w] && !o.tom) o.tom = w; if (NR_FORMATOS[w] && !o.formato) o.formato = w; }
  if (o.formato === "anime" || o.formato === "filme" || o.formato === "animação") o.formato = "animacao"; return o; }
/* expande as linhas de narrativa/historia num texto do name (o resto do texto fica como está) */
function nrExpandirTexto(texto) { const linhas = String(texto).split("\n"); if (!linhas.some(l => /^(narrativa|historia|história)\s/i.test(l))) return texto;
  const temElenco = linhas.some(l => /^elenco\b/i.test(l)), noElenco = new Set(); let emEl = false; for (const l of linhas) { if (/^elenco\b/i.test(l)) { emEl = true; continue; } if (/^\S/.test(l)) emEl = false; else if (emEl) { const n = (/^\s+(\S+)/.exec(l) || [])[1]; if (n) noElenco.add(n); } }
  const out = [], faltam = new Set(); let fmtAtual = null, n = 1;
  for (const l of linhas) { const m = /^(narrativa|historia|história)\s+(\S+)(.*)$/i.exec(l); if (!m) { out.push(l); continue; }
    const o = nrLerOpcoes(m[3]); o.nomes = o.nomes.length ? o.nomes : [...noElenco].slice(0, 3); if (!o.nomes.length) o.nomes = ["Kai", "Mira", "Leo"]; o.nomes.forEach(x => { if (!noElenco.has(x)) faltam.add(x); });
    let rcs; if (/^narrativa$/i.test(m[1])) rcs = [nrReceita(m[2], o)]; else { const hs = nrHistoria(Object.assign({}, o, { estrutura: m[2] })); rcs = hs[0].receitas; }
    rcs.forEach(rc => rc.nomes.forEach(x => { if (!noElenco.has(x)) faltam.add(x); }));
    const fmt = o.formato || "manga"; out.push("# " + l.trim()); if (fmt !== fmtAtual) { out.push(...nrCabFormato(fmt, rcs[0].def.nome)); fmtAtual = fmt; }
    let corpo = []; for (const rc of rcs) { rc.formato = fmt; const t = nrTexto(rc, n); n = t.n; corpo.push(...t.linhas); }
    if (fmt === "manga") corpo = nrPaginar(corpo).filter((x, i) => !(i === 0 && x.startsWith("pagina"))); out.push(...corpo); }
  if (faltam.size) { const add = [...faltam].map((x, i) => "  " + x + " relevante corpo " + (i % 2 ? "feminino" : "masculino")); if (temElenco) { const i = out.findIndex(l => /^elenco\b/i.test(l)); out.splice(i + 1, 0, ...add); } else out.unshift("elenco", ...add); }
  return out.join("\n"); }

/* ===================== VERIFICAÇÃO NARRATIVA → VISUAL (e correção automática) =====================
   Compila o texto e lê os avisos de composição: câmera que cruza o eixo de 180° (põe "espelhado" no preset daquele quadro),
   cabeça cortada no alto (abre o plano: olhos → close → primeiro-plano → médio), olhar sem espaço (espelha), três planos iguais
   seguidos (troca o do meio). Repete até 4 vezes. compilar = compilarName (passado por quem chama, sem ciclo de módulos). */
const NR_ABRE = { olhos: "close", close: "primeiro-plano", "primeiro-plano": "medio", medio: "americano", detalhe: "close" };
function nrVerificar(texto, compilar, o = {}) { let tx = texto, r = null; const log = [];
  for (let it = 0; it < (o.voltas || 6); it++) { r = compilar(tx, { semCache: true, salvar: false }); if (!r.ok && r.erros.length) break;
    const L = tx.split("\n"), idxQ = []; L.forEach((l, i) => { const m = /^\s*(quadro|plano)\s+(\d+)/.exec(l); if (m) idxQ.push([+m[2], i]); });
    const linhaPreset = n => { const q = idxQ.find(x => x[0] === n); if (!q) return -1; for (let i = q[1] + 1; i < L.length && !/^\s*(quadro|plano|pagina|cena\s+")/.test(L[i]); i++) if (/^\s*(cena|camera) preset /.test(L[i])) return i; return -1; };
    let mudou = false;
    for (const a of r.avisos) { const m = /^(?:quadro|plano)\s+(\d+)/i.exec(a); if (!m) continue; const n = +m[1], li = linhaPreset(n); if (li < 0) continue;
      if (/cruzou o eixo|borda mais perto/.test(a)) { L[li] = / espelhado\b/.test(L[li]) ? L[li].replace(/ espelhado\b/, "") : L[li] + " espelhado"; mudou = true; log.push("quadro " + n + ": espelhado (" + (/eixo/.test(a) ? "eixo de 180°" : "espaço do olhar") + ")"); }
      else if (/cortada no alto/.test(a)) { const k = /preset um\.([\w-]+)\./.exec(L[li]); if (k && NR_ABRE[k[1]]) { L[li] = L[li].replace("preset um." + k[1] + ".", "preset um." + NR_ABRE[k[1]] + "."); mudou = true; log.push("quadro " + n + ": " + k[1] + " → " + NR_ABRE[k[1]] + " (cabeça cortada)"); } }
      else if (/três quadros seguidos em plano/.test(a)) { const k = /preset um\.([\w-]+)\./.exec(L[li]); if (k && k[1] !== "medio") { L[li] = L[li].replace("preset um." + k[1] + ".", "preset um.medio."); mudou = true; log.push("quadro " + n + ": plano médio (variar)"); } } }
    tx = L.join("\n"); if (!mudou) break; }
  const restam = r ? r.avisos.filter(a => /cruzou o eixo|cortada|borda mais perto|três quadros/.test(a)) : [];
  return { texto: tx, correcoes: log, avisosRestantes: restam, ok: !!(r && r.ok), erros: r ? r.erros : [] }; }

/* ===================== catálogo, árvore, busca ===================== */
function nrListar() { return [...NR.values()].filter(d => !d.sub).map(d => ({ id: d.id, nome: d.nome, familia: d.familia, familiaNome: NR_FAMILIAS[d.familia], fonte: d.fonte, papeis: d.papeis, intensidade: d.intensidade, batidas: d.beats.length })); }
function nrTotalVariantes() { return NR.size * Object.keys(NR_VERSOES).length * Object.keys(NR_TONS).length; }
/* próximos níveis do caminho (autocomplete): "" → famílias; "perseguicao." → funções; "perseguicao.telhados." → versões; "…versao." → tons */
function nrProximos(prefixo) { const p = String(prefixo || "").replace(/\.$/, ""), parts = p ? p.split(".") : [];
  if (parts.length === 0) return Object.keys(NR_FAMILIAS).map(f => ({ nome: f, folha: false, desc: NR_FAMILIAS[f] + " · " + [...NR.values()].filter(d => d.familia === f).length + " funções", exemplo: [...NR.values()].find(d => d.familia === f).id }));
  if (parts.length === 1) return [...NR.values()].filter(d => d.familia === parts[0] && !d.sub).map(d => ({ nome: d.id.split(".")[1], folha: false, desc: d.nome + " · " + d.fonte, exemplo: d.id, id: d.id }));
  const ehSub = NR.has(parts.slice(0, 3).join(".")) && NR.get(parts.slice(0, 3).join(".")).sub, nv = parts.length - (ehSub ? 1 : 0);
  const subs = parts.length === 2 ? [...NR.values()].filter(d => d.sub && d.funcao === p).map(d => ({ nome: d.id.split(".")[2], folha: false, desc: "subfunção: " + d.nome.split(" — ")[1] + " (" + d.fonte.replace(/^subfunção: /, "") + ")", exemplo: d.id, id: d.id, sub: true })) : [];
  if (nv === 2) return subs.concat(Object.entries(NR_VERSOES).map(([v, ds]) => ({ nome: v, folha: false, desc: ds, exemplo: p, id: p + "." + v })));
  if (nv === 3) return Object.entries(NR_TONS).map(([t, T]) => ({ nome: t, folha: true, desc: "tom " + T.nome, exemplo: parts.slice(0, ehSub ? 3 : 2).join("."), id: p + "." + t }));
  return []; }
function nrBuscar(q, max = 40) { const t = String(q || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); return nrListar().filter(d => (d.id + " " + d.nome + " " + d.fonte + " " + d.familiaNome).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(t)).slice(0, max); }
/* texto curto para a miniatura: só o momento forte da função */
function nrDemoTexto(id) { const rc = nrReceita(id, { formato: "manga" }); const b = rc.beats.find(x => x.k) || rc.beats[rc.beats.length - 1];
  const el = ["elenco"].concat(rc.nomes.slice(0, rc.def.papeis).map((n, i) => "  " + n + " relevante corpo " + (i % 2 ? "feminino" : "masculino")));
  return el.join("\n") + "\nquadro 1\n" + nrLinhas(b, rc.nomes, rc.def.papeis, "leve", rc.r, "manga").filter(l => !/^\s*(narra|\S+ (fala|pensa|grita|sussurra) )/.test(l)).map(l => "  " + l).join("\n") + "\n"; }
export { NR, NR_DEF, NR_FAMILIAS, NR_TONS, NR_VERSOES, NR_FORMATOS, NR_ESTRUTURAS, NR_FALAS, nrReceita, nrTexto, nrHistoria, nrMontarTexto, nrExpandirTexto, nrListar, nrTotalVariantes, nrProximos, nrBuscar, nrDemoTexto, nrAchar, nrNota, nrVerificar };
