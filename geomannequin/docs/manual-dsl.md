```text
MANUAL DA DSL DO NAME — GeoMannequin
=====================================
Para que serve: uma IA (ChatGPT, Claude, Gemini…) lê a sua narrativa e escreve este texto. O GeoMannequin transforma o texto
em quadros de name (storyboard de mangá): cenário geométrico, manequins posados, câmera e uma FICHA por quadro para a IA de
imagem fazer a arte final. Não há texto dentro dos quadros: o texto vai na legenda (retângulo vermelho) e no manifesto.

1. REGRAS GERAIS
- Um bloco começa numa linha SEM recuo; as linhas do bloco têm recuo (2 espaços).
- Blocos: semente · define · elenco · animacao · local · modelo · quadro · transicao · pagina.
- Comentários: "// texto", "-- texto" ou "# texto" (com espaço depois do #). Cores "#a1b2c3" não são comentário.
- Unidade padrão: METROS. Também: 30cm, 2.5m, 12R (R = unidade do manequim, 1 R ≈ 11,4 cm). Ângulos em graus.
- Coordenadas (x,z) vistas DE CIMA: x cresce para a DIREITA (leste), z cresce para CIMA na planta (norte, "para o fundo").
- Direção ("gira"): gira 0 = virado para o NORTE (+z); gira 90 = LESTE (+x); 180 = sul; -90 (ou 270) = oeste.
  Vale para pessoas e objetos (num objeto, gira 90 deita o comprimento dele ao longo de x).
  Altura é sempre separada (altura 3, base 1). Um ponto pode ser (x,z) ou (x,altura,z) quando a altura importa (câmera).
- Faixa sorteada: 3..6 (inteiro entre 3 e 6). Porcentagem: 60%. Texto com espaços: "entre aspas".
- Palavras-chave sem acento também valem (plongee, angulo, transicao). Nomes com espaço vão entre aspas.
- Tudo o que é sorteado depende da "semente": o mesmo texto com a mesma semente dá sempre os mesmos quadros.
- Erros dizem a linha e a palavra mais parecida ("Quis dizer …?"); um erro não impede os outros quadros.

2. ELENCO (quem é quem, por COR)
elenco
  Kai relevante corpo masculino atletico      ← cada relevante ganha uma cor fixa a história toda
  Mira relevante corpo feminino cor roxo       ← cor escolhida (opcional)
  Dom relevante corpo masculino veste "capuz preto"   ← aparência (vai para a legenda de cores e o manifesto)
  Tomo relevante corpo crianca                 ← crianca | menino | menina
  povo figurante                               ← TODOS os figurantes têm a mesma cor neutra (cinza)
  guardas figurante                            ← pode haver vários grupos (um por tipo de gente); cada um tem a sua linha no quadro
Cores dos relevantes, na ordem: vermelho, azul, verde, roxo, laranja, ciano, rosa, amarelo, marrom, lima, vinho, azul-marinho (até 12). Figurantes: cinza.
Corpos: masculino | feminino [magro | medio | atletico | musculoso | cheio] · crianca | menino | menina. "tamanho 0.9" muda a escala.
"apelido Kaizinho" deixa usar outro nome. Nomes podem ter acento (Téo); nomes com espaço vão entre aspas.
A legenda das cores (manifesto + cartão) diz "vermelho = Kai".

3. LOCAL (o cenário, descrito com geometria)
local "Nome" [unidade m|R] [origem (x,z)|auto] [norte -z] [herda "Outro local"] [planta "imagem" linha N largura 20]
  norte -z: inverte o eixo z (use quando o "para cima" da imagem for z negativo); o padrão é norte = +z.
  A origem: se a IA escolheu um ponto (0,0) na imagem, escreva "origem (0,0)" e use as MESMAS coordenadas para os
  personagens. "auto" (padrão) centraliza o desenho, mas os personagens continuam na mesma conta: tudo bate.
  herda "Rua": copia o outro local e acrescenta o que vier (ex.: a mesma rua à noite, com lixo e um carro).
  planta "p1" linha 2: monta a partir de uma imagem de planta colorida anexada (veja o capítulo 9).
  Um local SALVO na biblioteca é usado só com o nome: "local "Praça do mercado"" (sem linhas) ou direto no quadro.

Peças do local (uma por linha):
  chao retangulo x0,z0 a x1,z1 [classe areia|grama|pedra|piso|terra|madeira]
  chao circulo em (x,z) raio 8
  parede linha (x,z)-(x,z)-(x,z) [altura 3] [espessura 0.25] [vao porta (x,z) largura 1] [vao janela (x,z) largura 1.2]
       ("vao" pode repetir quantas vezes quiser na mesma linha)
  muro linha …   ·   cerca linha … (cerca = 1,1 m, fina, de madeira)
  sala "Cozinha" retangulo x0,z0 a x1,z1 [altura 3] [porta lado sul [em 2] [largura 1]] [janela lado norte] [telhado]
       (os lados são norte = z maior, sul = z menor, leste = x maior, oeste = x menor; "em 2" = a 2 m do canto de x menor
        nos lados norte/sul, ou do canto de z menor nos lados leste/oeste; sem "em", a porta fica no meio)
  casa "Casa do Kai" retangulo … altura 6     ·   predio "Torre" retangulo … altura 20   (bloco fechado)
  escada de (x,z) ate (x,z) sobe-para norte altura 3      (escadaria: sobe de A para B; a altura é a do topo)
  escada de (x,z) ate (x,z) sobe-para leste base 1.6 altura 3.2   (lanço que COMEÇA a 1,6 m: escada em L = dois lanços
       e um nivel "patamar" altura 1.6 entre eles; "nivel "Patamar"" no lugar de "base" também vale)
  escada em (x,z)                                          (escada de mão, objeto)
  rampa de (x,z) ate (x,z) altura 1
  nivel "Terraço" altura 2 retangulo x0,z0 a x1,z1         (plataforma, mezanino, palco; "terraco", "palco" também)
  marca "porta" em (x,z) [nivel "Terraço"]                 (ponto com nome, para usar nos quadros)
  regiao "feira" retangulo x0,z0 a x1,z1                   (área com nome: figurantes "em regiao "feira"")
  <objeto> ["nome"] em (x,z) [gira 30] [tamanho LxPxA] [raio r] [altura h] [base h] [classe madeira] [cor #8a5a2b] [nivel "Terraço"]
  <objeto> encostado-em "Cozinha" lado norte [aos 2]       (encosta na parede de dentro da sala/região)
  <objeto> centro-de "Cozinha"   ·   <objeto> entre (x,z) e (x,z)   ·   <objeto> em marca "fonte"
  fileira 6 banca de (x,z) ate (x,z) [tamanho …] [variar 0.2]   (N objetos em linha; aceita as mesmas opções de um objeto:
       altura, classe, cor, gira…)
  grade-de 3x4 coluna de (x,z) ate (x,z)                         (grade C colunas × L linhas)
  circulo-de 8 arvore em (x,z) raio 6                             (N objetos em roda, virados para o centro)
  repetir 5: arvore em (i*3, 8)                                   (i = 0, 1, 2…; contas simples valem)
Objetos: cadeiraVazada, mesaComAlca, baseRetangular, basePerfil, baseCircular, bastao, cajado, espada, banco, cadeira, caixa, cubo, degrau, mesa, cama, parede, cilindro, copo, coluna, barril, mesaRedonda, corda, animal, arvore, palmeira, arbusto, poco, agua, predio, rampaDegraus, esfera, cone, toro, capsula, prisma, pedra, pneu, saco, fardo, tapete, tambor, barrilChope, botijao, galao, balde, mala, maleta, malaRodinhas, mochila, bigorna, caixote, palete, vigaI, cano, tabua, escada, trelica, barraPesos, pa, marreta, alavanca, carrinhoDeMao, carrinhoCarga, carrinhoPlataforma, cacamba, ancora, pilhaCaixas, bola, lanca, machado, escudo, arco.
  Também valem: banca/balcão/barraca (caixas com nome), pilar (= coluna), "árvore", "poço".
  "tamanho LxPxA" = largura (x) × profundidade (z) × altura, em metros. "gira 90" gira no chão (graus; o mesmo sentido das pessoas: 0 = comprimento norte-sul, 90 = leste-oeste).
  Cores: por classe (parede, madeira, vegetacao, agua, pedra, areia, piso, grama, terra, tecido, metal, telhado) ou "cor #hex".
  Dois "chao" que se cobrem: o escrito DEPOIS fica por cima (ex.: piso de pedra e, depois, um tapete de grama).
  Limites: o palco vai até ±45 m do centro; uma peça tem no máximo 51 m de lado (divida um chão maior em partes).
  O que não existe (trem, trilho, carro, poste…): use caixa/cilindro/coluna com nome e tamanho ("caixa "vagão" em … tamanho 15x3x3.5").

4. QUADRO (um momento: um painel do name)
quadro [n] ["título"] [local "Nome" | continua | novo] [plano …] [angulo … [graus]] [alvo A, B] [lado …] [lente 35]
       [formato 16:9] [tamanho grande] [funcao "…"] [legenda "…"] [hora tarde] [camera (x,y,z) olhando (x,y,z)]
       [duracao 2s] [camera-move aproxima|afasta|panoramica-esquerda|panoramica-direita|orbita|sobe|desce|treme [quanto]]   (vídeo: cap. 12)
- local "X": troca de cenário (corte): tira personagens e figurantes do quadro anterior.
- continua (padrão): mesmo local, mesmas pessoas onde estavam (inclusive em cima de nível); escreva só o que muda.
  Figurantes também ficam; escrever de novo a linha de um grupo TROCA esse grupo ("mantem" acrescenta em vez de trocar).
- novo: mesmo local, mas começa vazio.
- plano: geral (o lugar todo) | conjunto | inteiro (corpo inteiro) | americano (joelhos para cima) | medio (cintura) |
         primeiro-plano (peito) | close (rosto) | detalhe | pov.
- angulo: normal | plongee (de cima) | contra-plongee (de baixo) | zenital | nadir | holandes [graus].
- lado (de onde a câmera vê o alvo): frente | 3/4 | 3/4-direita | perfil | perfil-direito | costas.
- alvo: em quem a câmera mira (padrão: quem está no quadro).
- formato: 16:9, 4:3, 3:4, 9:16, 1:1, 2:1, 21:9, vertical, horizontal, quadrado.
- tamanho (na página): grande | largo | alto | normal | pequeno | inserto. Função de clímax/impacto/revelação → grande.
- hora: manha | dia | meio-dia | tarde | entardecer | noite | interior (muda a luz e entra na legenda; vale até trocar de local).
- funcao: a função narrativa do quadro (estabelecimento, reação, ação, clímax, transição, detalhe, revelação…).
- A câmera foge sozinha de parede entre ela e o alvo (gira para o lado livre mais perto e avisa).

Personagem (uma linha por pessoa ou por grupo "Kai, Mira"):
  Nome [em (x,z) | em marca "m" | em centro | em fundo | em Outro]
       [frente-de | atras-de | ao-lado-de | esquerda-de | direita-de | perto-de Outro [distancia 1.5]]
       [nivel "Terraço" | sobre "mesa"]  [gira 90 | vira-para Outro | vira-para camera]
       [pose nome] [sentado | deitado | ajoelhado | agachado | correndo | caminhando | em-pe]
       [acao nome] [expressao nome [intensidade 0.7]] [olha Outro | olha (x,z) | olha camera]
       [segura objeto [como pegada]] [carrega | levanta | puxa | empurra | arrasta objeto]
       [interacao tipo com Outro] [efeito tipo [em maoDir]] [molejo 0.6] [fala "…" [tom raiva]] [sai]
       [gesto … ] [atitude … ] [papel … ] [ajustes finos] [anima … ]     (conversa e animação: cap. 11 e 12)
  "frente-de Kai" = na frente de Kai (para onde ele olha), virado para ele. frente-de/atras-de/ao-lado-de/perto-de aceitam
  pessoa, marca ou objeto pelo nome ("ao-lado-de "coluna 3"").
  Posição dentro de um "nivel" (plataforma, passarela) = a pessoa fica EM CIMA dele, sozinha.
  segura/empurra/carrega <objeto>: o nome dado no local (com aspas se tiver espaço) ou um TIPO da lista (aí um objeto novo,
  do tamanho da pessoa, aparece nas mãos). "como" escolhe a pegada (lista abaixo).
  interacao <tipo> com Outro: basta posicionar o primeiro; o outro vai para o ponto certo da interação.
  Se a posição cair dentro de parede/objeto, a pessoa sai pelo lado mais perto (aviso).
Figurantes (procedurais):
  povo 20..30 [multidao | grade | circulo | fila | arco] [em regiao "feira" | em fundo | em area (x,z) (x,z) | em (x,z) | em marca "m"]
       [perto-de Kai | em-volta-de Kai] [raio 8] [espacamento 0.8]
       olham: 60% Kai, 20% costas, 10% camera, resto aleatorio
       poses: empe:3 | caminhando:1        (peso depois dos dois-pontos)
       expressoes: alegria:2 | surpresa
       [mantem]   (mantem = não apaga os figurantes do quadro anterior)
  "povo em (3,4)" sem número = 1 figurante ali. Ninguém fica sobreposto (os figurantes se afastam).
Outras linhas do quadro:
  objeto caixa em (1,2)        (objeto só deste quadro em diante)
  legenda "Kai percebe a armadilha."   ·   fala "texto" (linha SOZINHA = narração, fica no manifesto; "Kai fala "…"" = Kai falando)
  dialogo Kai, Mira [tom tenso]   (cap. 11)
  escolha 60% Kai expressao raiva | 40% Kai expressao medo | nada
  repetir 3: povo em (1+i*2, 5)
  usar conversa(Kai, Mira)     (modelo definido antes: "modelo conversa(a, b)" + linhas com a e b)

Listas:
  Poses (122): empe, contrapposto, caminhando, frente, torcao, passo, joelho, ponta, erguido, alcancar, lateral, agachar, cintura, cruzar, ombro, sentado, sentadoChao, pernasEsticadas, abracandoJoelhos, deitadoCostas, deitadoLado, deBrucos, apoiadoCotovelos, ajoelhado, sentadoCalcanhares, umJoelho, cocoras, correndo, impulso, saltando, aterrissando, chutando, socando, alongando, paradaDeMao, engatinhando, apontando, acenando, carregando, empurrando, pensando, encostado, caindo, ponte, ponteUmaPerna, paradaAbertura, escorpiao, arabesque, espacateSaltado, camelo, agachamentoProfundo, prancha, quatroApoios, meditando, guardaLuta, jab, direto, gancho, uppercut, socoParaCima, cotovelada, joelhada, chuteLateral, chuteAlto, chuteGiratorio, chuteVoador, rasteira, palma, palmaDupla, defesaCruzada, aterrissagemHeroi, investida, esquiva, provocando, golpeRosto, golpeEstomago, arremessadoCostas, girandoNoAr, deCabecaParaBaixo, rolando, deslizandoSentado, estatelado, levantandoDeQuatro, atordoado, recuando, ajoelhadoFerido, atravessandoParede, caindoDeCostas, lotusFlutuando, baseGritando, agachadoCerrando, bracosAbertosLevitando, maosEmPrece, bracosCruzadosPeito, joelhoMaoNoChao, esferaDeLado, bracoAosCeus, concentrando, cargaDuasMaos, saltoSobreCaixa, subindoDegrau, saltoLongo, desviando, escalando, vitoria, corridaSuperRapida, corridaNinja, arrancada, puloAlto, saltoAtaque, socoCarregado, socoDescendente, investidaDeOmbro, chuteMachado, bloqueioAlto, defesaComBracos, esquivaBaixa, esquivaParaTras, quedaDeCostas, quedaDeFrente, lancandoMagia, disparoDuasMaos. (com ou sem hífen: empe = em-pe)
  Expressões (42): neutra, alegria, surpresa, raiva, tristeza, medo, grito, sono, desconfianca, piscando, riso, choro, vergonha, nojo, desprezo, determinacao, malicia, confusao, choque, tedio, dor, cansaco, admiracao, culpa, orgulho, pensativo, alivio, sorrisoManiaco, surpresaTotal, olharVazio, iraFocada, focoTotal, choqueComico, nervoso, mordendoLabio, provocando, furia, esforco, encantado, sombrio, determinadoLuta, gritoDeGuerra.
  Ações com efeito (acao): corridaSuperRapida, corridaNinja, arrancada, puloAlto, saltoAtaque, socoCarregado, socoDescendente, investidaDeOmbro, chuteMachado, bloqueioAlto, defesaComBracos, esquivaBaixa, esquivaParaTras, quedaDeCostas, quedaDeFrente, lancandoMagia, disparoDuasMaos, investida, chuteVoador, chuteGiratorio, socando, uppercut, aterrissagemHeroi, esquiva, cargaDuasMaos, baseGritando.
  Interações a dois (48): abracoFrente, abracoLado, abracoPorTras, ombroAOmbro, maoNoOmbro, apoiandoFerido, apertoDeMao, toqueDePunho, highFive, ajudarALevantar, bombeiro, noColo, cavalinho, arrastarPelasAxilas, arrastarPelosPulsos, levantarSentado, sustentarAjoelhado, primeirosSocorros, ajudarAEngatinhar, guardaContraGuarda, jabNaGuarda, diretoNoRosto, socoNaBarriga, empurraoNoPeito, chuteAltoBloqueado, segurarOChute, clinch, derrubada, montada, guardaNoChao, chaveDeBraco, rasteira, esquivaContragolpe, sentadosLadoALado, bracoNoOmbroSentados, cabecaNoOmbro, ajoelhadoConsolando, maoNasCostasDeQuatro, abracoSentado, costasComCostas, agachadosJuntos, maosDadasSentados, correrDeMaosDadas, puxarPeloPulso, guiarPeloOmbro, protegerACabeca, empurrarAFrente, apoioCorrendo.
  Pegadas (segura … como …): abracado, aFrente, porBaixo, bandeja, acimaDaCabeca, noOmbro, cargaNoOmbro, sacoNasCostas, nasCostas, debaixoDoBraco, pelaAlca, noQuadril, vigaNaCintura, arremessar, alcancarAlto, espada, forca, pinca, marretaNoOmbro, golpeAcima, levantarDoChao, levantamentoTerra, ajoelhadoLevantando, empurrar, empurrarCarrinho, carrinhoDeMao, carrinhoCarga, malaDeRodinhas, puxarCorda, puxarCordaNasCostas, arrastar, rolar, virarPneu, cavar, alavancar, subirDegrauComCarga.
  Efeitos (efeito …): concentracao, velocidade, impacto_tela, flash, sombra_dramatica, onomatopeia, reticula, feixe, cone, espiral, tornado, explosao, barreira, circulo_magico, pilar, meteoro, chuva_meteoros, raio, onda_choque, cristais_chao, fogo_chao, fumaca, chama, aura, arco_movimento, rastro_membro, pos_imagem, energia_mao, velocidade_corpo, impacto_contato, emote, cratera, rachaduras, destrocos, poeira, parede_quebrada, buraco_chao, objeto_quebrando, rastro_fumaca, sulco_poeira, aura_explosiva, aura_vento, esfera_energia, fios_energia, pedras_levitando, ondas_chao, carga_maos, redemoinho, aneis_impacto, salpicos, aneis_orbitais, personalizado, composto, raio_galhos, raio_cartoon, arvore_de_raios, cone_de_aneis, torrente_espiral, tunel_de_aneis, foice_de_energia, rajada_de_particulas, leque_de_flechas, enxame_de_flechas, laminas_crescentes, crescente_gigante, laminas_de_vento, onda_gigante, espinhos_do_chao, tentaculos, vinhas_de_espinhos, atomo, vortice_disco, cupula_de_arcos, esfera_jaula, laco_infinito, fita_em_s, serpente_de_energia, discos_serra, ondas_sonoras, explosao_estrelada, bolhas, circulo_magico_flechas, circulo_de_runas, dna, tranca, portais_e_feixes, feixe_com_aneis, cone_de_ondas, esfera_espiral, chamas_nanquim, respingos_de_nanquim, pilar_de_luz_nanquim, redemoinho_de_fumaca, linhas_de_impulso, impacto_com_detritos, anel_de_impacto_no_chao, chuva_de_estrelas, aura_de_espinhos, tornado_espiral, rastro_de_velocidade, arco_de_golpe.

5. TRANSIÇÃO, PÁGINA, SEMENTE, VARIÁVEIS, MODELOS
transicao tempo ["Mais tarde"] | lugar | corte | flashback   (vale para o quadro seguinte; entra na legenda e no manifesto;
          é informação para a montagem e para a IA de imagem: não muda a cena sozinha)
pagina [grade 2x2|3|4|…] [leitura ocidental|japonesa]       (os quadros seguintes vão para uma página nova; japonesa = da direita)
semente 12                                                   (sorteios reproduzíveis)
define altura 3   →  use $altura
modelo conversa(a, b)
  a em (3,3) olha b
  b frente-de a distancia 1.5 olha a

6. LEGENDA (o retângulo vermelho da ficha)
- "legenda "…"" no quadro (ou no cabeçalho) manda. Sem ela, a legenda é automática: transição, local, função, quem está
  (com a cor), pose/ação, o que segura, interação, expressão, para onde olha e os figurantes (quantos, para onde olham).
- Falas NÃO entram na legenda (elas vão no manifesto). Para a IA de imagem, escreva legendas visuais e curtas.

7. A FICHA DO QUADRO (o que a IA de imagem recebe)
- Painel principal, borda VERDE (#00b140): o quadro na câmera real (perspectiva). É a referência da imagem final.
- Retângulo VERMELHO (#e00000) embaixo, texto BRANCO: a legenda de contexto (legível por OCR).
- Coluna da direita, em cima, borda AZUL (#1060ff): planta (vista de cima) com paredes, objetos, pessoas nas cores, setas
  de direção e o cone da câmera.
- Coluna da direita, embaixo, borda AMARELA (#ffd400): vista isométrica do local.
- Só as bordas são coloridas; dentro de cada painel está a cena como ela é.

8. COMO CORTAR A HISTÓRIA EM QUADROS (para a IA que escreve o name)
- Um quadro = um instante. Uma ação com começo, meio e fim vira 2 ou 3 quadros (preparação, golpe, resultado).
- Abra cada cena (lugar novo) com um plano geral ou conjunto (funcao "estabelecimento").
- Diálogo: alterne planos médios/close dos dois, mantendo o mesmo lado (regra dos 180°: o app avisa se cruzar).
- Reação emocional: close com expressão forte; clímax: tamanho grande, ângulo contra-plongee ou holandes.
- Tempo passou? "transicao tempo". Mudou de lugar? "transicao lugar" + novo local. Lembrança? "transicao flashback".
- Relevantes sempre com o mesmo nome do elenco; multidões como figurantes (um grupo por tipo de gente).
- Pense em 4 a 7 quadros por página; use "pagina" para cortar.
- "tamanho" tem dois sentidos: no QUADRO é o tamanho na página (grande, pequeno…); num OBJETO é LxPxA em metros.
- O que a DSL não tem (roupa detalhada, chuva, expressão muito específica): escreva na "legenda" do quadro.

9. LER UMA IMAGEM E DESCREVER O CENÁRIO (para a IA que olha uma foto, desenho ou planta)
Objetivo: transformar a imagem num "local" com números. Passo a passo:
 a) ORIGEM: escolha um ponto fácil de achar (um canto do piso, o centro de uma praça, a porta) = (0,0). Diga qual foi.
 b) EIXOS: olhando a planta de cima, x para a direita e z para cima (fundo). Numa foto em perspectiva, x = largura do chão
    da esquerda para a direita, z = profundidade (para longe da câmera). Mantenha em todas as peças.
 c) ESCALA por referência: porta ≈ 0,9–1,0 m de largura e 2,1 m de altura; pessoa adulta ≈ 1,75 m; degrau ≈ 18 cm de
    altura e 28 cm de piso; cadeira ≈ 45 cm de assento; mesa ≈ 75 cm de altura; carro ≈ 4,5 × 1,8 m; vaga ≈ 2,5 × 5 m;
    calçada ≈ 2–3 m; pé-direito de casa ≈ 2,7–3 m; andar de prédio ≈ 3 m.
 d) PIXELS → METROS: meça em pixels algo de tamanho conhecido (ex.: a porta com 40 px = 1 m → 40 px/m). Divida as
    outras medidas por esse número. Numa planta, use a escala desenhada se houver.
 e) ALTURAS: conte andares, degraus ou compare com a pessoa. Escada: altura do topo = degraus × 0,18 m.
 f) POSIÇÃO RELATIVA: quando não der para medir, use encostado-em, centro-de, entre, fileira, a distância de uma marca.
 g) NOMEIE marcas e regiões que a história vai usar (porta, balcão, janela, "feira", "palco").
 h) Escreva primeiro o chão (retângulo do terreno), depois paredes/salas, níveis e escadas, depois os objetos grandes,
    por último os pequenos. Prefira poucas peças certas a muitas inventadas.
Exemplo 1 (foto de uma sala vista da porta): porta embaixo = (0,0); a sala tem 4 portas de largura (4 m) e 5 m de fundo.
  local "Sala da Mira" unidade m origem (0,0)
    chao retangulo -2,0 a 2,5 classe madeira
    sala "Sala" retangulo -2,0 a 2,5 altura 2.8 porta lado sul janela lado norte
    // não existe "sofa" na lista: um banco com nome e tamanho faz o papel
    banco "sofá" encostado-em "Sala" lado oeste tamanho 2x0.9x0.8
    mesa encostado-em "Sala" lado norte tamanho 1.2x0.7x0.75
    marca "janela" em (0,4.6)
Exemplo 2 (planta de uma praça com escada para um terraço): centro da praça = (0,0); 30 × 20 m pelo desenho (barra de 10 m = 120 px).
  local "Praça" unidade m origem (0,0)
    chao retangulo -15,-10 a 15,10 classe pedra
    nivel "Terraço" altura 2 retangulo 6,6 a 14,10
    escada de (8,2) ate (8,6) sobe-para norte altura 2
    poco em (0,0)
    fileira 4 banca de (-10,-8) ate (2,-8) tamanho 1.6x0.8x1
    regiao "feira" retangulo -12,-9.5 a 4,-4
Planta colorida (do próprio app): anexe a imagem e escreva  local "Quintal" planta "p1" linha 1 largura 18 .

10. BIBLIOTECA DE LOCAIS
- Todo local pode ser SALVO (nome, código, miniaturas, marcas, regiões, tags, versões). No name, basta o nome:
  quadro local "Praça do mercado" … · local "Praça à noite" herda "Praça do mercado" (+ peças novas).
- No site: aba Name → Locais (salvar, abrir no palco, duplicar, exportar/importar). Pela IA (MCP): salvar_local, listar_locais, abrir_local.

11. CONVERSA E LINGUAGEM CORPORAL (gestos, atitudes, fala)
Quem conversa gesticula, mexe a cabeça e muda o peso do corpo. Na linha do personagem:
  gesto explicar [mao direita|esquerda|ambas] [intensidade 0.8]
  atitude cabecaInclinada [intensidade 0.6]        (várias atitudes podem somar)
  fala "Você mentiu!" tom raiva                     (boca de fala no tom + um gesto sorteado, se não houver gesto)
  papel ouvinteCetico   ·   conversa com Mira papel falante   (escolhe gesto + atitude + rosto pelas tags)
  tom pergunta                                       (tom da fala/rosto)
Ajustes finos (graus; cm onde diz):
  pescoco inclina 15 abaixa 10 gira 5 · coluna inclina 8 lado 5 torce 10 · ombros caidos 0.5 · ombro direito abaixa 0.4
  perna esquerda afasta 10cm joelho 12 frente 5cm · pe direito 15cm para direita|esquerda|frente|tras · braco direito levanta 20 abre 10 cotovelo 30
No quadro: dialogo Kai, Mira [tom tenso] → quem fala (quem tem "fala" na linha dele, ou a vez, alternando) gesticula; os outros ouvem olhando para ele.
Quem manda (do mais forte para o mais fraco): gesto/atitude escritos na linha > papel > dialogo > gesto sorteado da fala. Quem já tem gesto ou papel na linha não é mexido pelo dialogo.
Unidades e sentidos: ângulos em graus; "ombros caidos 0.5" e "ombro direito abaixa 0.4" vão de 0 a 1 (fração do movimento máximo);
  "pescoco inclina" e "coluna lado": positivo = para o lado DIREITO do personagem, negativo = para o esquerdo; abaixa/inclina (coluna) positivo = para frente;
  "mao direita", "mao esquerda" ou "mao ambas" (lado do personagem). Ajustes somam à pose: escreva depois da pose.
Partes do corpo (para filtros e biblioteca): cabeca (pescoço e cabeça), tronco (coluna e pelve), ombros, bracoDireito/bracoEsquerdo, maoDireita/maoEsquerda,
  pernaDireita/pernaEsquerda, rosto, corpo (deitar, altura), lugar (posição e giro no chão).
Gestos (21): explicar [Conversa/Explicar], oferecer [Conversa/Explicar], enfatizar [Conversa/Enfatizar], contarDedos [Conversa/Explicar], apontar [Conversa/Apontar], dedoEmRiste [Conversa/Discordar], negarComMao [Conversa/Discordar], maoNoPeito [Conversa/Sincero], encolherOmbros [Conversa/Duvida], maoNoQueixo [Conversa/Pensar], bracosCruzados [Conversa/Defensivo], maosNaCintura [Conversa/Desafio], maosNoAr [Conversa/Indignacao], maoNaNuca [Conversa/Vergonha], cocarCabeca [Conversa/Duvida], maosJuntas [Conversa/Suplica], segurarCabeca [Conversa/Desespero], acenar [Conversa/Cumprimento], joinha [Conversa/Concordar], bracosAbertos [Conversa/Acolher], repouso [Conversa/Neutro].
Atitudes (15): cabecaInclinada [Atitude/Duvida], cabecaBaixa [Atitude/Tristeza], queixoErguido [Atitude/Orgulho], troncoAFrente [Atitude/Interesse], troncoParaTras [Atitude/Recuo], inclinadoDeLado [Atitude/Relaxado], ombrosCaidos [Atitude/Tristeza], ombrosTensos [Atitude/Tensao], pesoNaPernaDireita [Atitude/Relaxado], pesoNaPernaEsquerda [Atitude/Relaxado], joelhoDobrado [Atitude/Relaxado], peVirado [Atitude/Timidez], pernasAfastadas [Atitude/Firmeza], encolhido [Atitude/Medo], peito [Atitude/Confianca].
Tons de fala: calmo, alegre, raiva, triste, pergunta, grito, sussurro, explicando, preocupado, ironico, tenso, carinhoso.
Papéis: falante, explicando, ouvinte, ouvinteCetico, interrompendo, discutindo, consolando, perguntando, concordando, discordando, envergonhado, pensando, ameacando, assustado, desesperado.

12. ANIMAÇÃO (quadros-chave) E VÍDEO
Bloco de animação (sem recuo), chaves com recuo:
  animacao "chegar" duracao 1.4s [relativa] [loop] [curva suave] [tags "Locomocao/Chegar"] [salvar]
    chave 0s pose empe
    chave 0.7s pose passo move frente 0.4
    chave 1.4s pose empe gesto acenar move frente 0.8
  Numa chave: pose, expressao [intensidade], gesto [mao …] [intensidade], atitude [intensidade], ajustes finos (cap. 11), move frente/lado (m) giro (graus),
  curva (até a próxima chave), fala ["texto"] [tom raiva] (sem texto = boca falando genérica, reutilizável).
  As chaves se ACUMULAM: cada chave parte da anterior (só a "pose" recomeça do zero). "chave 0s" sozinha (vazia) vale: é o ponto de partida.
  "move" é a posição em relação ao COMEÇO (move frente 0.4 e depois move frente 0.8 = andou 40 cm e depois mais 40 cm).
  Só o que muda entre as chaves entra na animação (ela fica parcial e reutilizável).
  "relativa" = guarda as diferenças para a primeira chave (vale a partir de qualquer pose: "pe direito 15cm para direita" funciona em pé, agachado…).
  Numa relativa, pose/gesto/expressão também viram diferenças (ex.: o quanto o braço sobe do começo ao gesto).
  Repetir um trecho (acenar 3 vezes): escreva as chaves de ida e volta, ou use "loop" na animação inteira.
  "olha Mira [so-cabeca|so-olhos|corpo]" numa chave: dali em diante a cabeça (e os olhos) seguem Mira; a cabeça chega em ~0,3 s (padrão: so-cabeca, para não brigar com "move giro").
  "segurar 0.3s" numa chave: o corpo para naquela chave por 0,3 s (pausa dramática) e o resto anda para depois.
  Cabeçalho: fps 1–60 · velocidade 2 (duas vezes mais rápida; 0.5 = câmera lenta) · em-dois / em-tres (cada desenho fica 2 ou 3 quadros) · travar-pes (o pé de apoio não escorrega).
  "salvar" = vai para a biblioteca de animações.
No quadro:  Kai anima chegar [depois acenarSim] [instante 0.5s]   (o quadro mostra o fim, ou o instante; o vídeo toca tudo)
Cabeçalho do quadro:  duracao 2s  ·  camera-move aproxima|afasta|panoramica-esquerda|panoramica-direita|orbita 30|sobe|desce|treme
  (o número opcional é o quanto: aproxima 40 = 40% mais perto; orbita 30 = 30 graus; padrão: aproxima 40, afasta 60, panorâmica 20, orbita 30, sobe/desce 15)
Vídeo (animatic): cada quadro dura "duracao" (ou o tempo da animação mais longa / da fala mais longa); as animações tocam e a câmera se move → GIF/WebM/PNG (site: Animação → Vídeo do name; MCP: video_name).
  No topo do name:  video fps 24 [em-dois|em-tres] [velocidade 1.5] [sem-vida]
  Cabeçalho do quadro: velocidade 0.5 (só aquele quadro, ex.: câmera lenta no impacto).
  Câmera no tempo (dentro do quadro):  camera 1.5s plano close alvo Kai lado 60 [elevacao 10] [lente 85] [angulo plongee]
    a câmera do quadro é a do instante 0; ela vai suave até cada chave de câmera (pode ter várias).
  No vídeo, sozinho: a boca segue a fala letra a letra (~13 letras/s; vírgula fecha 0,25 s, ponto 0,45 s); todos piscam (~a cada 3,5 s) e respiram
    ("sem-vida" desliga); objetos seguros acompanham a mão; quem atravessa outra pessoa num quadro do vídeo vira aviso ("Kai e Mira se atravessam").
Curvas: linear, suave, entrada, saida, segurar, mola, rapida. Partes do corpo: cabeca, tronco, ombros, bracoDireito, bracoEsquerdo, maoDireita, maoEsquerda, pernaDireita, pernaEsquerda, rosto, corpo, lugar.
Animações prontas (144): passoFrente, passoTras, passoLadoDireito, passoLadoEsquerdo, andarCiclo, correrCiclo, virarEsquerda, virarDireita, meiaVolta, sentarNoChao, levantarDoChao, agachar, levantarDeAgachado, ajoelhar, deitar, peDireito15cmDireita, peDireito15cmEsquerda, peDireito15cmFrente, peDireito15cmTras, peEsquerdo15cmDireita, peEsquerdo15cmEsquerda, peEsquerdo15cmFrente, peEsquerdo15cmTras, inclinarCabecaDireita, inclinarCabecaEsquerda, abaixarCabeca, erguerQueixo, acenarSim, acenarNao, inclinarTroncoFrente, recuarTronco, encolherOmbrosRapido, pesoParaDireita, pesoParaEsquerda, ombrosCairem, encolher, gestoExplicar, gestoOferecer, gestoEnfatizar, gestoContarDedos, gestoApontar, gestoDedoEmRiste, gestoNegarComMao, gestoMaoNoPeito, gestoEncolherOmbros, gestoMaoNoQueixo, gestoBracosCruzados, gestoMaosNaCintura, gestoMaosNoAr, gestoMaoNaNuca, gestoCocarCabeca, gestoMaosJuntas, gestoSegurarCabeca, gestoAcenar, gestoJoinha, gestoBracosAbertos, acenarTchau, piscar, respirar, falarCiclo, sorrir, ficarComRaiva, assustar, socarJab, socoDireto, defender, esquivar, chutar, entrarEmGuarda, apontarAlgo, acenarPose, pular, girar45E, girar45D, girar90E, girar90D, girar180E, girar180D, girar360E, girar360D, girar360E_pivo, girar360D_pivo, girar360E_luta, girar360D_luta, girar360E_salto, girar360D_salto, girar720E_pivo, puloLugar, puloFrente, puloAlto, puloLado, puloCorrida, mergulhar, nadarCrawl, nadarPeito, nadarCostas, nadarCachorrinho, nadarBoia, nadarPernada, engatinhar, rastejar, andarAgachado, cairFrente, cairTras, cairLado, levantarDeBrucos, levantarDeCostas, rolarDireita, rolarEsquerda, oferecer, pedir, entregar, receber, pegar, jogar, largar, apontar, acenar, cumprimentar, abrirPorta, beber, ler, atenderCelular, olharRelogio, encolherOmbros, chorar, rir, cairDeJoelhos, cocarCabeca, cruzarBracos, espreguicar, bocejar, comemorar, suspirar, baterPalmas, esperaEmpe, esperaImpaciente, esperaBracosCruzados, esperaSentado, esperaSentadoInquieto, esperaDeitado, esperaGuarda, esperaOlhandoEmVolta, esperaPensando.

13. OLHAR, VIRAR E GIRAR (quem olha para quem, girar 360° com os pés)
Olhar de verdade é em cadeia: os OLHOS fazem até ~35° para os lados (~25° para cima/baixo), a CABEÇA até ~60°, o TRONCO ajuda e, se o alvo
estiver mais atrás que isso, o CORPO vira (fica ~35° do alvo e a cabeça/olhos fecham o resto).
  Kai olha Mira                 (natural: olhos → cabeça → tronco → corpo, o que precisar)
  Kai olha Mira so-cabeca       (os pés/corpo NÃO viram — cabeça, olhos e a torção do tronco alcançam ~150° para o lado; mais que isso o quadro avisa e a legenda diz "tentando olhar")
  Kai olha Mira so-olhos        (só os olhos; bom para "olhar de canto")
  Kai olha Mira corpo           (o corpo todo vira para Mira)
  alvo: alguém do elenco, camera, um objeto ("olha Mesa"), ou (x,z) em metros.
Conferência automática: depois do quadro, cada olhar (na linha do personagem, no dialogo e nas chaves "olha" das animações) é medido; se faltar mais de 10° o aviso diz quanto falta e o que usar ("olha … corpo" ou "vira-para …").
Diálogo: "dialogo Kai, Mira [tom tenso] [de-frente|lado-a-lado|aberto|livre]"
  de-frente (padrão) = os corpos viram um para o outro · lado-a-lado = ombro a ombro (corpos para a frente, cabeças viradas) ·
  aberto = 3/4, meio virados para o norte (teatro) · livre = não mexe nos corpos. "Frente" aqui = o norte (+z, o mesmo que gira 0): monte a câmera do lado norte (lado frente de quem olha para o norte) para ver os rostos.
  Quem tem "vira-para", "gira" ou "anima" na linha não é virado. Quem só tem "atitude" ganha também papel e gesto do dialogo (para não ganhar, escreva um gesto ou um papel na linha, ou use dialogo … livre só para os corpos).
SEQUÊNCIA NO QUADRO: várias animações da MESMA pessoa no mesmo quadro (gira, vira-para … passos, anda-ate, anima) tocam UMA DEPOIS DA OUTRA, na ordem escrita
  (ex.: "Kai anda-ate Mira" e na linha seguinte "Kai gira 360 pivo" = anda e depois gira). Pessoas diferentes tocam ao mesmo tempo. "anima A depois B" também encadeia.
VIRAR:
  Kai vira-para Mira            (instantâneo: o quadro mostra já virado)
  Kai vira-para Mira passos     (anima: vira com passos de verdade, entra no vídeo)
  Kai gira 90                   (instantâneo: fica virado a 90° — número = direção no mundo)
GIRAR NO LUGAR (anima, com os pés; até 360° e além, ex.: 720 pivo):
  Kai gira 360 passos [esquerda|direita]   — pisa em 4 passos (90° cada); o pé de apoio fica PRESO no chão e o corpo gira em volta dele;
                                              o pé livre sai pelo calcanhar, gira no ar e desce reto; a coxa gira ao contrário (até ~22°) e o resto é a bola do pé
  Kai gira 360 pivo             — pirueta na ponta de um pé, a outra perna recolhida (passé), a cabeça presa num ponto e virando de uma vez (spotting)
  Kai gira 360 luta             — base baixa (joelhos dobrados), 3 passos curtos e rápidos
  Kai gira 360 salto            — impulso, giro no ar, aterrissa dobrando os joelhos
  Ordem do corpo ao virar: olhos e cabeça ANTECIPAM → ombros/tronco → pelve → pés (a cabeça chega antes).
  Sentido: esquerda = para a esquerda DO PRÓPRIO PERSONAGEM (ângulo positivo; ele termina virado para o mesmo lado que "gira 90" absoluto, +x);
  pense sempre na esquerda/direita do PERSONAGEM, não na bússola da planta (a planta é vista de cima, e de cima a esquerda dele aparece do outro lado);
  direita = para a direita dele (negativo). Sem sentido escrito: vale o sinal do número (360 = esquerda, −360 = direita). Use sempre "esquerda/direita" do personagem, não "horário".
  Prontas na biblioteca: girar45E/D, girar90E/D, girar180E/D, girar360E/D, girar360E/D_pivo, girar720E_pivo, girar360E/D_luta, girar360E/D_salto.
ANDAR ATÉ:
  Kai anda-ate Mira [correndo] [parar 1.2]   (para a ~90 cm de uma pessoa/objeto; "parar" muda a distância em metros)
  Kai anda-ate (3,2) · Kai anda-ate marca "porta" · Kai corre-ate Mira
  Vira com passos se precisar, anda com passadas do tamanho do corpo (criança dá passos menores), desvia do primeiro objeto alto no caminho e, no fim, olha para quem foi encontrar.
TEMPO E QUADROS POR SEGUNDO (fps 1–60):
  fps | uso
   6–8  | animatic rápido (rascunho, leve)
   12   | animação limitada / mangá animado (padrão do editor)
   24   | cinema (com "em-dois" = 12 desenhos por segundo, o clássico)
   30   | vídeo
   60   | vídeo fluido / câmera lenta depois
  em-dois / em-tres: repete cada desenho 2 ou 3 quadros (mesmo fps, menos desenhos, aspecto de animação tradicional).
  velocidade: 2 = duas vezes mais rápido; 0.5 = metade (câmera lenta). Vale no cabeçalho da animação, do quadro, ou no "video" do topo.
  segurar 0.3s (numa chave): pausa naquela pose. A duração listada da animação já conta a velocidade e as pausas (1,6 s a velocidade 0.8 + segurar 0.4 s = 2,4 s).
LIMITES (o que ainda NÃO faz, para ninguém prometer):
  - o pé de apoio fica preso, mas o pé livre pode arrastar alguns cm rente ao chão no começo do passo (sai pelo calcanhar); salto: só o giro no ar, sem física;
  - "anda-ate" desvia de UM objeto (o primeiro no caminho), não de pessoas, e não sobe escada sozinho;
  - "olha" numa chave segue o alvo no lugar em que ele está no fim do quadro;
  - mão que segura objeto: o objeto acompanha, mas a pegada não se reajusta ao andar;
  - esbarrão é só aviso (centro a centro < 30 cm), não desvia;
  - boca: ritmo por letra (não é fonema de verdade), em português.

14. POSES E ANIMAÇÕES POR TEXTO (juntas, atalhos, ciclo, derivar, picotar, juntar, pular, nadar…)
EDITOR (site → Texto): digite uma junta e um PONTO (ombro.) → aparecem os lados com a junta acesa na miniatura; depois do "(" aparecem os movimentos com os limites;
  pose. / anima. / expressao. / gesto. → listas com miniatura: as poses e animações escritas no próprio texto e as já salvas no catálogo (Ctrl+S salva as marcadas com "salvar"). F1 = ajuda da palavra; Alt+↑/↓ = muda o número
  sob o cursor (Shift = passo maior); Tab no começo da linha (pose, ciclo, animacao, derivar, picotar, juntar, camada) = trecho pronto; Ctrl+S = salvar no catálogo.
  Com o cursor dentro de um bloco pose/ciclo/animacao a prévia ao lado mostra a pose em 3 vistas ou a animação tocando (barra de tempo, "Ver no boneco", "No palco").
POSE:
  pose "nome" [de OUTRA-POSE] [salvar] [tags "A/B"]
    junta.lado(movimento valor, movimento valor …)      (lado: direito | esquerdo | ambos; sem lado = os dois)
  Valor sozinho = a junta fica NESSE valor; "+10" / "-10" = soma ao que já estava. Graus; mão/olhos/boca em % (fecha 80%); corpo(sobe 30cm).
  Passou do limite da articulação → fica no limite e aparece um aviso. "salvar" = Minhas poses, com miniatura (usa em qualquer quadro: Kai pose nome).
JUNTAS (movimento: faixa):
  ombro.lado (= braco, braço): frente 0–180° · tras 0–60° · abre 0–180° · cruza 0–45° · gira-fora 0–90° · gira-dentro 0–70° · sobe 0–100% · desce 0–100% · avanca 0–100% · recua 0–100%
  cotovelo.lado: dobra 0–150° · estica volta a 0
  antebraco.lado (= antebraço): palma-cima 0–90° · palma-baixo 0–80°
  punho.lado: dobra 0–80° · levanta 0–70° · lado-polegar 0–20° · lado-minimo 0–30°
  mao.lado (= mão): fecha 0–100% · abre volta a 0 · afasta 0–100% · polegar 0–100% · indicador 0–100% · medio 0–100% · anelar 0–100% · minimo 0–100% · opoe 0–100%
  quadril.lado (= coxa, perna): frente 0–125° · tras 0–30° · abre 0–45° · fecha 0–30° · gira-fora 0–45° · gira-dentro 0–45°
  joelho.lado: dobra 0–150° · estica volta a 0
  canela.lado: gira 0–40°
  tornozelo.lado (= pe, pé): aponta 0–50° · levanta-ponta 0–20° · sola-dentro 0–35° · sola-fora 0–15° · ponta-dentro 0–25° · ponta-fora 0–20°
  dedos-pe.lado (= dedos-do-pe): dobra 0–40° · levanta 0–70°
  tronco (= coluna): frente 0–80° · tras 0–30° · direita 0–35° · esquerda 0–35° · gira-esquerda 0–45° · gira-direita 0–45°
  lombar: frente 0–40° · tras 0–20° · direita 0–20° · esquerda 0–20° · gira-esquerda 0–10° · gira-direita 0–10°
  peito (= toracica, torácica): frente 0–40° · tras 0–20° · direita 0–20° · esquerda 0–20° · gira-esquerda 0–30° · gira-direita 0–30°
  pelve (= bacia): frente 0–20° · tras 0–15° · direita 0–10° · esquerda 0–10° · gira-esquerda 0–25° · gira-direita 0–25°
  pescoco (= pescoço): frente 0–40° · tras 0–40° · direita 0–30° · esquerda 0–30° · gira-esquerda 0–45° · gira-direita 0–45°
  cabeca (= cabeça): baixa 0–50° · sobe 0–60° · gira-esquerda 0–80° · gira-direita 0–80° · inclina-direita 0–45° · inclina-esquerda 0–45°
  olhos: esquerda 0–100% · direita 0–100% · cima 0–100% · baixo 0–100% · fecha 0–100%
  boca: abre 0–100% · sorri 0–100% · triste 0–100%
  corpo: deita-costas 0–180° · deita-brucos 0–180° · rola 0–180° · sobe 0–34200 cm
ATALHOS (numa pose, numa chave ou depois de "soma"):
  agacha [60%] · ajoelha direito|esquerdo|os-dois · senta chao|cadeira|calcanhares|cocoras · peso direito|esquerdo [70%] · inclina frente|tras|direita|esquerda [graus]
  olha baixo|cima|direita|esquerda|frente [graus] · sobe 30cm · deita costas|brucos|lado · espelha [PARTES] · mistura POSE 50% · copia PARTES de POSE · zera [PARTES]
  PARTES: pernas, bracos, maos, tronco, cabeca, ombros, rosto, corpo, lugar, perna-direita, perna-esquerda, braco-direito, braco-esquerdo, mao-direita, mao-esquerda, corpo-de-cima, tudo, bracodireito, bracoesquerdo, maodireita, maoesquerda, pernadireita, pernaesquerda.
  Exemplo:
    pose "pedido" de empe salvar
      ajoelha direito
      ombro.direito(frente 70) cotovelo.direito(dobra 20)
      olha cima 15
CHAVES COM JUNTAS:  chave 0.4s ombro.direito(frente 90) cotovelo.direito(dobra 20) agacha 30%
  "move frente/lado/giro" numa chave: frente + = para onde ele olha; lado + = para a ESQUERDA dele; giro + = vira para a esquerda dele (metros e graus).
  Um atalho ou junta escrito depois de outro na mesma pose vale por cima (ex.: cabeca(gira-esquerda 30) e depois "olha frente" = a cabeça volta à frente).
CICLO A PARTIR DE UMA POSE (andar, correr, engatinhar…):
  ciclo "nome" de POSE [duracao 1s] [corre] [passagem POSE|auto] [anda 1.4m] [voo 5cm] [salvar]
    (linhas com recuo ajustam a pose antes, como num bloco pose)
  Faz A → passagem → A ESPELHADA → passagem espelhada → A, em loop. "troca pernas por pose X" leva junto a altura do corpo da pose (ajoelhado fica no chão). A passagem automática: a perna de trás passa dobrada, a de apoio estica (em pé).
  O pé da frente de A é o apoio até a passagem (pés presos). "anda" = metros por ciclo (padrão: a distância entre os pés da pose × 2).
ANIMAÇÃO A PARTIR DE OUTRA (derivar):
  animacao "nova" de OUTRA [salvar]        e, com recuo, uma operação por linha (valem em ordem):
    troca PARTES por pose POSE [fixo]      as partes partem da pose, com o movimento original por cima ("fixo" = paradas). Trocar as pernas tira os pés presos e gira no lugar.
    troca PARTES por anima OUTRA           as partes vêm de outra animação
    soma junta(…) | soma ATALHO             soma um ajuste na animação toda (soma tronco(frente 25))
    tira PARTES                             tira partes (ficam como o personagem estiver)
    chave 0.5s junta(…)                     uma chave nova só com o que for dito
    trecho 0.2s a 0.8s | trecho 25% a 75%   fica só com um pedaço (lugar e giro recomeçam dali)
    ate 90 | ate metade | ate 0.5s          nos giros: corta no ângulo exato (15, 30, 45, 60, 90, 180…) e pousa os dois pés
    reverte · espelha · repete 3 · vai-e-volta · amplitude 70% [PARTES] · estica 2s · velocidade 1.5
  Exemplos:
    animacao "girar-ajoelhado" de girar360E salvar
      troca pernas por pose ajoelhado
    animacao "giro45" de girar360D
      ate 45
JUNTAR E CAMADA (no cabeçalho):
  animacao "combo" junta A, B, C [mistura 0.2s]          uma depois da outra; o lugar e o giro continuam de onde a anterior parou
  animacao "andar-acenando" camada A [PARTES] + B [PARTES]  ao mesmo tempo: B manda nas partes dele (ou nas pedidas), A no resto
  Animação relativa + absoluta juntas: tudo vira absoluto a partir de em pé. Um ciclo em loop (andarCiclo) dentro de "camada" continua andando enquanto a outra toca.
  PARTES valem com hífen ou juntas: braco-direito = bracoDireito. Nos modelos de sintaxe, [colchetes] = opcional (não se escreve o colchete).
  Uma animação pode usar outra escrita mais abaixo no texto (é lida numa segunda volta).
MOVIMENTOS PRONTOS (no quadro, como "gira" e "anda-ate"):
  Kai pula [lugar|frente|alto|lado|corrida] [1m] [altura 40cm] [direita|esquerda]   (antecipação, voo no tempo da gravidade, aterrissagem amortecida)
  Kai mergulha [altura 0.5m] [fundo 1m]     (da borda, de cabeça)
  Kai nada [crawl|peito|costas|cachorrinho|boia|pernada] [3m]   (de costas ele se deita para trás e vai na direção da CABEÇA = para trás de onde estava virado:
    para nadar de costas rumo ao norte, vire-o para o sul antes — "gira 180 nada costas 4m"). Ele parte em pé (deitar é com ele); se terminar fora da água, aviso.
  Kai engatinha [2m] · Kai rasteja [2m] · Kai anda-agachado [2m] · Kai cai frente|tras|lado · Kai levanta-se [de costas|brucos] · Kai rola direita|esquerda [2 voltas]
  Na biblioteca: puloLugar, puloFrente, puloAlto, puloLado, puloCorrida, mergulhar, nadarCrawl…, engatinhar, rastejar, andarAgachado, cairFrente…, levantarDeBrucos, levantarDeCostas, rolarDireita, rolarEsquerda.
ÁGUA: no local, a peça "agua" (ex.: agua "piscina" em (0,0) tamanho 6x10x1.4) tem a superfície no TOPO dela. Quem "nada" dentro dela fica na linha da água;
  a legenda diz até onde a água chega (tornozelos, joelhos, cintura, peito, pescoço, submerso, nadando, boiando). Nadar fora da água vira aviso.
LIMITES: a água é só desenho (sem respingo físico nem empuxo); nado e mergulho são ciclos animados; rolar e engatinhar não desviam de nada;
  "troca pernas" numa animação com pés presos gira no lugar (os joelhos não ficam presos no chão como os pés).

15. FILME: filme → cena → plano (vídeo longo por texto)
Um FILME é uma sequência de PLANOS (shots). Cada plano tem duração, câmera e linhas com TEMPO. O fim de um plano é o começo do
seguinte (continuidade): quem andou continua onde parou; quem foi cortado no meio de uma ação começa o próximo plano do ponto do corte.
  filme "O Pedido" fps 24 [16:9] [legendas] [ouvintes fixos] [em-dois] [sem-vida]
  elenco / local …                       (como no name)
  cena "Praça" local "Praça" hora tarde
    plano 1 [corte | fusao 0.5s | escurece 0.8s | clareia 0.6s] [duracao 6s]
      Kai em (0,-6)                       linhas SEM tempo = arrumação do começo do plano (posição, pose, vira-para…)
      camera …                            câmera do plano (capítulo 16)
      0s Kai anda-ate Mira                linha com TEMPO = acontece nesse segundo do plano
      1.5s-3s Mira expressao alegria      intervalo: a mudança dura de 1,5 s a 3 s
      depois Kai oferece para Mira        começa quando a anterior (do mesmo personagem) termina
      junto Mira olha Kai                 começa junto com a linha anterior
      4s Mira fala "Obrigada!"            fala com boca no tempo (e legenda, se o filme tiver "legendas")
      marca "virada" 5s                   marca de tempo (vai para a lista de planos)
  Sem "duracao": o plano dura até a última coisa terminar + 0,6 s. Com "duracao" e uma ação mais longa: o plano corta no meio (aviso) e o
  PLANO SEGUINTE CONTINUA a ação de onde parou (Teo corre no plano 2 e segue correndo no plano 3), a não ser que nele essa pessoa receba outra
  ordem antes de terminar ou seja reposicionada ("Teo em (x,z)"). Não repita a ação no plano seguinte: ela já continua.
  Saída: "plano 9 sai escurece 1s" (o fim do plano vai para o preto; clareia = branco). Fim do filme: "filme … fim escurece 1.5s".
  Comandos instantâneos (expressao, olha, vira-para, pose) viram transições suaves de 0,45 s; "lento" (0,8 s), "rapido" (0,25), "seco" (0,15).
  Transições entre planos: corte (seco), fusao (um plano some sobre o outro), escurece (sai e entra pelo preto), clareia (pelo branco).
  Tudo que existe no name também vale numa linha de plano (gesto, atitude, segura, efeito, pula, nada, cai, levanta-se…).

16. CÂMERA DE CINEMA (no plano: a câmera do plano e mudanças no meio dele)
  BASES (onde a câmera está):
    camera plano medio alvo Kai [lado 3/4] [elevacao 10] [lente 50]   enquadramento clássico, parado (close, medio, americano, inteiro, geral, detalhe…)
    camera segue Kai [atras|frente|esquerda|direita] [distancia 3m] [altura 1.7m] [suave 0.4]   acompanha (com atraso natural)
    camera fixa frente-de Kai 12m [altura 1.6m] [olha Kai]           fixa LONGE na frente dele: vê-lo chegar
    camera fixa em (x,altura,z) olha Kai                              fixa num ponto do local (metros)
    camera pov Mira [olha Kai]                                        visão de Mira (dos olhos dela; ela some do quadro); "olha" fixa o olhar
    camera sobre-o-ombro Kai alvo Mira [lado esquerdo]                plano e contraplano de conversa
    camera presa-em Kai                                               presa no corpo (câmera de ação)
  ENQUADRAMENTO ("camera plano …"): é calculado com as pessoas no começo do plano (ou no instante da linha "Ns camera …"); quem anda pode sair
  do quadro — para acompanhar use "segue". "lado frente|3/4|perfil|costas" conta a partir de para onde o alvo está virado nesse instante.
  MUDANÇAS NO TEMPO (numa linha "camera Ns …" ou "Ns camera …"; "em 2s" = quanto dura):
    orbita 90 · eleva 20 · abaixa 15 · sobe 1m · desce 0.5m · grua 2m · aproxima 30 · afasta 40 · travelling frente|tras|esquerda|direita 2m
    panoramica 30 · inclina 10 · lente 85 · zoom 2 · tremida 0.6 · alvo Mira (troca o foco) · corte (troca de uma vez, sem movimento)
  UNIDADES: orbita/eleva/panoramica/inclina em GRAUS (eleva + = câmera mais alta olhando para baixo; inclina + = aponta mais para cima, − = mais para baixo;
    orbita e panoramica: + e − giram em sentidos opostos); sobe/desce/grua em metros (grua sobe a câmera e meio tanto o alvo); aproxima/afasta em %
    da distância; zoom = fator da lente (2 = dobra os mm); lente em mm (24 aberta, 50 normal, 85 retrato); tremida 0 a 1. Bases aceitam "lente N" (camera pov Mira lente 24).
  Exemplos:
    camera fixa frente-de Kai 12m altura 1.6m olha Kai        (Kai vem andando em direção à câmera)
    2s camera orbita 180 em 3s                                 (dá meia volta em torno do alvo durante 3 s)
    4s camera corte plano close alvo Mira                       (corte seco para o close de Mira)
    camera 3s eleva 30 em 1s                                    (sobe o ângulo: vira plongée)
  A câmera nunca entra num corpo: se fosse entrar, é puxada para fora (e avisa). Na POV, aproxima/afasta viram zoom de lente.
  Uma base em 0 s sem "em" é corte (a câmera do plano começa nela); bases depois de 0 s vão suavemente, a não ser com "corte".

17. AÇÕES, CICLOS E ESPERAS (o que se repete e o que segura)
  AÇÃO acontece uma vez e SEGURA a pose final até a próxima coisa: oferece, pede, entrega, recebe, aponta, cruza-bracos, cai-de-joelhos…
  As passageiras voltam sozinhas: acena, cumprimenta, bebe, le, atende, olha-relogio, encolhe-ombros, chora, ri, coca-cabeca, espreguica, boceja, comemora, suspira, bate-palmas.
    1s Kai oferece para Mira        (vira para Mira, olha e oferece)
    Kai acena mao-esquerda · Kai aponta (3,4) · Kai acena volta (força a voltar) · Kai aponta segura (força a segurar)
  ANDAR E CORRER (deslocam a pessoa): Kai anda [4m] [para (x,z)|Mira|marca "x"] · Kai corre [8m] [para …] · Kai anda-ate Mira · Kai corre-ate (0,10) parar 1.2
    sem "para": anda para a frente dele. Velocidade: andar ≈ 1,3 m/s, correr ≈ 2,1 m/s (10 m correndo ≈ 5 s; planos curtos cortam e o seguinte continua).
  CICLO no lugar repete até o fim do plano, até a próxima animação da pessoa ou "por 3s": Kai anima correrCiclo por 3s (corre parado: esteira), nada, engatinha…
  ESPERA é viva (respira, troca o peso, olha em volta, nunca igual) e dura o que precisar:
    0s Mira espera [empe|impaciente|bracos-cruzados|sentado|sentado-inquieto|deitado|guarda|olhando-em-volta|pensando] [por 5s]
  TRANSIÇÃO de postura: senta, levanta-se, ajoelha, deita, cai (posturas mudam o corpo inteiro).
  OBJETOS NO TEMPO:
    0s Kai pega copo                 estica o braço e segura (o copo vem para a mão no meio do gesto; ponha o objeto a até ~0,8 m, na frente dele —
                                     o "pega" não anda até o objeto: use antes "anda-ate copo")
    2s Kai entrega copo para Mira    passa de mão: Mira recebe com as duas mãos
    4s Mira larga copo               cai no chão (com gravidade)
    1s Kai joga bola para Mira       voa em arco; se for para alguém, ele pega. "joga bola para (3,2)" = cai no ponto
    3s Kai efeito energia_mao em mao-direita     efeito aparece no tempo dele (efeitos: catálogo)
  Objetos no local: copo "copo" em (0.8,0) sobre mesa (fica em cima da mesa).

18. PRINCÍPIOS DE ANIMAÇÃO (o que o texto faz por você e o que você pode pedir)
  Já automático: ANTECIPAÇÃO (as ações vão um pouco para trás antes de ir), ASSENTAMENTO (passam um pouco e voltam), TEMPO e
  ESPAÇAMENTO (curvas suaves, saída/entrada), ARCOS (cada junta gira: mãos e pés andam em arco naturalmente), ENCAIXE entre ações
  (0,25 s de mistura), VIDA (respiração, piscar, peso), QUEM ESCUTA OLHA para quem fala.
  Você pede no fim da linha:
    exagera 140%      mais amplitude (cartoon); 70% = contido
    sobreposicao      cabeça, punhos e mãos chegam ~0,1 s depois do resto (follow-through); "solto" = 0,16 s
    lento · rapido · seco · pesado      ritmo (pesado = mais lento e assentado)
    volta · segura · por 3s             volta para a pose de antes / fica / dura isso
  SILHUETA: se uma mão ficar na frente do corpo vista desta câmera, aparece aviso com a sugestão (orbita 30 ou abrir o braço).
  LIMITE HONESTO: o manequim é rígido — não há squash & stretch (esticar/achatar o corpo). Use exagera e poses mais abertas.

19. FALAS, ROSTO E SOM
  4s Mira fala "Você veio!" [tom alegre]     boca no ritmo das letras; quem escuta vira a cabeça para quem fala (desliga: filme … ouvintes fixos)
  1s-2s Kai expressao surpresa intensidade 0.8 · 2s Kai olha Mira · 3s Kai olha camera
  "legendas" no cabeçalho do filme: a fala aparece embaixo do vídeo. O pacote leva falas.srt (tempo de cada fala) para dublar ou pôr áudio.
  Som de verdade não é gerado: o vídeo é mudo; o .srt e a lista de planos dão o tempo exato para quem fizer o áudio.

20. EXPORTAR: MP4, PACOTE PARA A IA DE VÍDEO E CÓDIGO
  Site → Texto → aba Filme: o plano onde está o cursor, animado, com a lista do que acontece. Botões: "Filme → MP4" (H.264),
  "MP4 do plano", "Pacote para IA" (.zip com filme.mp4, um MP4 por plano, roteiro-de-planos.md, planos.json, prompts.txt, falas.srt, folha).
  Navegador sem WebCodecs (ou página fora de https): baixa os quadros em PNG com o comando ffmpeg para juntar.
  MCP: filme_texto (compila e mostra os planos), plano_previa (tira de quadros de um plano), exportar_filme (MP4 ou pacote; usa o ffmpeg do computador).
  Tempo: cada quadro leva ~0,1–0,3 s; 1 minuto a 24 fps ≈ 1440 quadros. Para rascunho: fps 12 e largura 640.
  CÓDIGO: toda pose e animação (prontas e suas) vira texto desta linguagem e volta igual:
    site → Texto → aba Biblioteca → "Ver código" / "Copiar" / "Catálogo .md" (tudo num arquivo, sempre atualizado)
    MCP: catalogo_dsl, codigo_de_pose, codigo_de_animacao.   Comandos que aparecem no código gerado:
    valor PARAM N [PARAM N…]   (um parâmetro direto, quando não há junta para ele) · animacao … relativa desde-neutra mantem
    (desde-neutra = os deltas contam a partir da pose neutra; mantem = guarda também o que fica parado)
  VÁRIAS DE UMA VEZ: escreva vários blocos pose/animacao no mesmo texto e "Salvar no catálogo" (Ctrl+S) grava todos os marcados com "salvar".

21. EXEMPLO COMPLETO
semente 12
elenco
  Kai relevante corpo masculino atletico
  Mira relevante corpo feminino
  Tomo relevante corpo crianca
  povo figurante

local "Praça do mercado" unidade m origem (0,0)
  chao retangulo -15,-10 a 15,10 classe pedra
  sala "Padaria" retangulo -14,4 a -6,9 altura 3 porta lado sul janela lado leste
  nivel "Terraço" altura 2 retangulo 6,6 a 14,10
  escada de (8,2) ate (8,6) sobe-para norte altura 2
  poco "Poço" em (0,0)
  fileira 4 banca de (-10,-8) ate (2,-8) tamanho 1.6x0.8x1 classe madeira
  arvore em (11,-6) raio 1.5 altura 5
  marca "fonte" em (0,1.5)
  regiao "feira" retangulo -12,-9.5 a 4,-4

quadro 1 local "Praça do mercado" plano geral funcao "estabelecimento"
  povo 20..28 multidao em regiao "feira" olham: 50% Kai, 20% costas, resto aleatorio poses: caminhando:2 | empe:3
  Kai em (2,2) pose empe expressao determinacao
  Mira frente-de Kai distancia 2 olha Kai expressao surpresa

quadro 2 continua plano medio alvo Kai, Mira lado 3/4-direita
  Kai expressao raiva olha Mira
  Mira expressao medo

transicao tempo "Mais tarde"
quadro 3 local "Praça do mercado" plano inteiro alvo Tomo angulo plongee funcao "revelação"
  Tomo em marca "fonte" sentado expressao tristeza
  povo 6 fila em fundo olham: resto aleatorio mantem

quadro 4 continua plano close alvo Tomo lado frente tamanho grande
  Tomo expressao choro intensidade 0.8


EXEMPLO DE FILME
filme "O Pedido" fps 24 legendas
elenco
  Kai relevante corpo masculino
  Mira relevante corpo feminino
local "Praça" unidade m
  chao retangulo -15,-15 a 15,15 classe pedra
  banco "banco" em (3,4)
  mesa "mesinha" em (-0.45,-5.5) tamanho 0.5x0.5x0.8
  caixa "presente" em (-0.4,-5.55) tamanho 0.2x0.2x0.15 sobre mesinha
cena "Praça" local "Praça" hora tarde
  plano 1 duracao 9s
    Kai em (0,-6) vira-para (0,4)
    Mira em (1.2,4) vira-para Kai
    camera fixa frente-de Kai 14m altura 1.6m olha Kai
    0s Kai pega presente
    1s Kai anda-ate Mira
    0s Mira espera impaciente
  plano 2 corte duracao 5s
    camera sobre-o-ombro Kai alvo Mira
    0s Kai oferece para Mira sobreposicao
    0.4s Mira expressao surpresa
    1.2s Mira fala "Para mim?"
    3s Kai entrega presente para Mira
  plano 3 fusao 0.5s duracao 4s
    camera pov Mira olha Kai
    0s camera aproxima 30 em 2s
    1s Kai expressao alegria
    2s Kai acena


22. ANIMAIS QUADRÚPEDES E MONTARIA
  Manequim simplificado: tronco (cilindro com peito e anca), pescoço, cabeça com focinho, orelhas, rabo e 4 pernas de 3 segmentos com casco.
  Espécies: cavalo, ponei, burro, camelo, dromedario, bode, ovelha, boi, cachorro, cachorroPequeno, lobo, gato, cervo, elefante (também pônei, burro, dromedário, cabra, vaca, cão, lobo, gata…).
  ELENCO:   Trovão animal cavalo [sela] [escala 1.2] [cor #8a5a2b]        Rex animal cachorro        Duna animal camelo escala 0.9
  NO QUADRO OU PLANO (sem tempo = arruma; com tempo = acontece):
    Trovão em (0,0) gira 90 · Trovão vira-para Kai · Trovão olha Mira · Trovão escala 1.5 · Trovão sela
    Trovão pose parado|atento|comendo|cabeca-baixa|deitado|sentado|empinado|pata-levantada|coice|agachado|uivando   (ou os verbos: empina, deita, senta, come/pasta, levanta, atento)
    0s Trovão anda|trota|galopa|corre [15m] [para (x,z)|Kai]     0s Trovão galopa-ate (12,4)
    Os cascos ficam plantados: a passada sai do comprimento da perna (passo 4 tempos, trote em diagonais, galope com voo).
  MONTARIA: Kai monta Trovão (senta na sela; com tempo: "1s Kai monta Trovão") · 4s Kai desmonta [direita|esquerda]
    Montado, a pessoa acompanha o balanço da sela, o giro e a andadura; os braços ficam livres para gestos (acena, aponta).
  CARGA E SEGUIR: Trovão carrega "mala" (objeto do local vai no lombo) · Rex segue Kai (anda atrás da pessoa, passo/trote/galope conforme a distância).
  CÂMERA: os animais servem de alvo como pessoas: camera segue Trovão lado direita distancia 6m · camera plano inteiro alvo Trovão lado perfil.
  MCP: animais (espécies, poses, marchas e exemplo).

23. ESCALA, VOO E ORIENTAÇÃO (gigantes, anões, fadas; corpos e objetos em qualquer ângulo)
  ELENCO (tipo de corpo):  Golias gigante [4] · Atlas tita · Toco anao · Lumi fada · Pingo miniatura · Kai escala 0.5 · Kai tamanho 2
    gigante = 3,5×, titã = 10×, anão = 0,62× com pernas curtas e cabeça maior, fada = 0,12× pairando, miniatura = 0,2×. Faixa: 0,03× a 30×.
    Tudo acompanha a escala: passada e velocidade de andar, alcance, câmera (enquadramentos, distâncias e limites), chão e apoio.
  NO PLANO: Kai escala 3 (muda no meio da história) · Lumi paira 1.5m · Lumi voa (sobe 1 m) · 0s Lumi voa-ate Golias altura 6m · Lumi pousa
    Lumi sobre-mao Golias [esquerda] (a mão vira de palma para cima e a fada fica de pé nela) · Lumi sobre-ombro Golias · Lumi sobre-cabeca Golias
  ORIENTAÇÃO DO CORPO: Kai inclina-corpo 30 [frente|tras] · Kai tomba-corpo 45 · Kai de-lado · Kai de-cabeca-para-baixo (gira o corpo inteiro)
  ORIENTAÇÃO DE OBJETOS (no local): caixa "c" em (2,2) inclina 30 · coluna "tronco" em (-2,2) tamanho 0.4x0.4x3 tomba 90 · deitado · de-pe
    (gira = em volta do eixo vertical; inclina = para a frente; tomba = de lado; a base é recalculada para o objeto encostar no chão).

24. PÁGINA, BALÕES E WEBTOON (mangá, comic, A4, quadrado; tira vertical)
  PÁGINA: pagina formato manga|comic|a4|quadrado|webtoon|livre [leitura japonesa|ocidental] [grade 2x3] [margem 40] [calha 14] [sangria] [dupla] [splash]
    manga = B5 (182×257), comic = 6,625×10,25", a4, quadrado. sangria = a arte vai até a borda; dupla = página dupla (spread); splash = 1 quadro na página toda.
  QUADRO: quadro 3 … tamanho pequeno|medio|grande|splash · borda diagonal [12] | nenhuma | grossa · sem-borda
    Diagonal = painel inclinado (ação); sem borda = quadro aberto (calma, memória). A ordem de leitura segue a leitura da página (japonesa: da direita para a esquerda).
  BALÕES (automáticos a partir das falas, com o rabicho apontando para a BOCA de quem fala e sem cobrir rostos):
    Kai fala "…" (oval) · Kai pensa "…" (nuvem com bolinhas) · Mira grita|berra "…" (estourado) · Kai sussurra|cochicha "…" (tracejado)
    Kai fala-radio|radio "…" (zigue-zague: telefone, rádio, TV) · narra "…" ou narrador "…" (caixa de narração no canto)
    Os balões ficam na ordem de leitura (o primeiro a falar mais acima e no começo da leitura) e perto de quem fala.
  WEBTOON: o espaço entre quadros é TEMPO. No quadro: ritmo momento|acao|sujeito|aspecto|lugar|tempo|cena · respiro [1.5] (espaço vazio, pausa).
    Momento → quase colado; troca de cena → espaço grande. Exporta como tira de 800 px de largura em fatias de 1280 px.
  RITMO (McCloud): momento-a-momento (câmera lenta), ação-a-ação, sujeito-a-sujeito (conversa), cena-a-cena (salto), aspecto-a-aspecto (clima, mangá), non-sequitur.
  EXPORTAR: site → Texto → botões "Páginas PNG", "Páginas PDF", "Webtoon", "CBZ". MCP: paginas_hq (PNG/PDF/CBZ) e webtoon (tira e fatias).

25. DIRETOR AUTOMÁTICO E COMPOSIÇÃO
  diretor auto (linha solta no texto, vale para todos) ou "camera auto"/"diretor" no cabeçalho de um quadro ou plano. Também: cobertura auto.
    Escolhe plano, lado e ângulo pela FUNÇÃO e pelo conteúdo: estabelecimento/troca de local → geral; fala → sobre-o-ombro/médio alternando;
    emoção (surpresa, medo, grito) → close; clímax/ação → ângulo baixo; nunca repete o mesmo plano 3 vezes e respeita o EIXO de 180° entre os dois que conversam.
  ALTERNATIVAS: quadro 4 … alternativas 6 (ou MCP quadro_alternativas): 6 versões do mesmo quadro (médio 3/4, close contra-plongée, geral plongée, americano perfil,
    inteiro de costas, primeiro plano holandês) para escolher.
  AVISOS DE COMPOSIÇÃO (aparecem com os erros): cabeça cortada pela borda, olhar sem espaço à frente (lead room), três quadros seguidos no mesmo plano,
    câmera que cruza o eixo de 180°, mão na frente do corpo (silhueta).

26. VÍDEO AVANÇADO, PÉS NO CHÃO E AUDITOR
  CÂMERA: camera caminho (x,altura,z) (x,altura,z) (x,altura,z)… em 5s [olha Kai]   — percurso suave passando por todos os pontos (metros)
    0s camera vertigo aproxima|afasta 50 em 3s   — dolly zoom: a câmera anda e a lente compensa (o alvo fica do mesmo tamanho, o fundo estica)
    Curvas de tempo em qualquer movimento: … em 2s linear | entra (começa devagar) | sai (freia no fim) | suave (padrão)
  TEMPO DO PLANO: plano 2 duracao 3s lento 50% (câmera lenta: a tela dura 6 s) · acelera 200% · congela 1.5s por 1s (a imagem para 1 s nesse ponto)
  PERCURSO A PÉ: 0s Kai anda por (0,0) (3,1) (3,4) · corre por … (vira nos cantos, passadas do tamanho do corpo)
  PASSES EM VÍDEO: MCP exportar_filme passes ["contorno","openpose","profundidade"] → passes/*.mp4 no .zip (referência para ControlNet de vídeo).
  LINHA DO TEMPO (site → Texto → aba Filme): uma faixa por pessoa/animal e uma da câmera; clique numa barra para ir à linha; arraste para mudar o segundo.
  PÉS NO CHÃO: o ciclo de andar tem 4 poses por passo (contato, recepção, passagem, impulso) e o corpo avança no ritmo do pé de apoio (pé parado no chão).
    As animações prendem o pé de apoio automaticamente no filme (menos nado, rolar, cair, deitar, voo). Gestos passageiros voltam sozinhos à pose de antes.
    Para soltar o chão: "Kai paira 0.05m" (folga) ou animações de voo.
  AUDITOR: MCP auditar_animacoes (ou site → Texto → "Auditar animações") mede em cada animação quanto o corpo afunda no chão (cm), quanto o pé apoiado
    escorrega (cm/s) e se termina longe da pose de partida. Limites: afunda > 3,5 cm ou escorrega > 12 cm/s (corrida 40, transições 30) = problema.
  SOM: não há áudio; falas viram legendas e .srt e os tempos ficam na lista de planos.
```
