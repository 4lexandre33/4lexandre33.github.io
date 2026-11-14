/* GeoMannequin — Manual da DSL do NAME (para a pessoa e para a IA que converte a narrativa) e os prompts prontos.
   As listas (poses, expressões, objetos, interações, pegadas, ações, efeitos) saem dos dados do app: estão sempre em dia. */
import { NM_CORES, NM_BORDA } from "./name-dsl.js";
import { todasPoses, EXPRESSOES } from "./poses.js";
import { INTERACOES } from "./interacoes.js";
import { ACOES } from "./pegadas.js";
import { ACOES_LUTA } from "./acoes-luta.js";
import { TIPOS_OBJETO, CATALOGO, QD_ESPECIES } from "../engine/index.js";
import { AM_POSES } from "./animais.js";
import { PD_JUNTAS, PD_PARTES, PD_DOC, pdFaixaMov, pdCodigoPose, pdCodigoAnimacao, pdValoresPose, pdParams } from "./pose-dsl.js";
import { posesSalvas } from "./pose-codigo.js";
import { AD_ACOES, AD_ESPERAS, adTipoDe } from "./acoes-dia.js";
import { LC_NADO, LC_PULOS } from "./locomocao.js";
import { GESTOS_CONVERSA, ATITUDES, TONS_FALA, PAPEIS_CONVERSA, CURVAS, AN_PARTES, bibliotecaAnimacoes } from "./animacao.js";

const mnLista = (a, n) => { const l = [...a]; return l.slice(0, n || l.length).join(", ") + (n && l.length > n ? "… (" + l.length + " no total)" : ""); };

const EXEMPLO_NAME = `semente 12
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
`;

const EXEMPLO_FILME = `filme "O Pedido" fps 24 legendas
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
`;
function manualName() {
  const P = todasPoses(), X = Object.keys(EXPRESSOES), O = Object.keys(TIPOS_OBJETO), I = Object.keys(INTERACOES), G = Object.keys(ACOES), A = Object.keys(ACOES_LUTA), F = Object.keys(CATALOGO);
  return `MANUAL DA DSL DO NAME — GeoMannequin
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
Cores dos relevantes, na ordem: ${NM_CORES.map(c => c[0]).join(", ")} (até 12). Figurantes: cinza.
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
Objetos: ${mnLista(O)}.
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
  Poses (${P.length}): ${mnLista(P)}. (com ou sem hífen: empe = em-pe)
  Expressões (${X.length}): ${mnLista(X)}.
  Ações com efeito (acao): ${mnLista(A)}.
  Interações a dois (${I.length}): ${mnLista(I)}.
  Pegadas (segura … como …): ${mnLista(G)}.
  Efeitos (efeito …): ${mnLista(F)}.

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
- Painel principal, borda VERDE (${NM_BORDA.verde}): o quadro na câmera real (perspectiva). É a referência da imagem final.
- Retângulo VERMELHO (${NM_BORDA.vermelho}) embaixo, texto BRANCO: a legenda de contexto (legível por OCR).
- Coluna da direita, em cima, borda AZUL (${NM_BORDA.azul}): planta (vista de cima) com paredes, objetos, pessoas nas cores, setas
  de direção e o cone da câmera.
- Coluna da direita, embaixo, borda AMARELA (${NM_BORDA.amarelo}): vista isométrica do local.
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
Gestos (${Object.keys(GESTOS_CONVERSA).length}): ${Object.entries(GESTOS_CONVERSA).map(([k, g]) => k + " [" + g.tag + "]").join(", ")}.
Atitudes (${Object.keys(ATITUDES).length}): ${Object.entries(ATITUDES).map(([k, g]) => k + " [" + g.tag + "]").join(", ")}.
Tons de fala: ${Object.keys(TONS_FALA).join(", ")}.
Papéis: ${Object.keys(PAPEIS_CONVERSA).join(", ")}.

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
Curvas: ${Object.keys(CURVAS).join(", ")}. Partes do corpo: ${Object.keys(AN_PARTES).join(", ")}.
Animações prontas (${bibliotecaAnimacoes().listar().length}): ${bibliotecaAnimacoes().listar().map(a => a.nome).join(", ")}.

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
${Object.entries(PD_JUNTAS).map(([j, J]) => "  " + j + (J.lado ? ".lado" : "") + (J.apelidos ? " (= " + J.apelidos.join(", ") + ")" : "") + ": " + Object.keys(J.mov).map(m => m + " " + pdFaixaMov(j, m, "R")).join(" · ")).join("\n")}
ATALHOS (numa pose, numa chave ou depois de "soma"):
  agacha [60%] · ajoelha direito|esquerdo|os-dois · senta chao|cadeira|calcanhares|cocoras · peso direito|esquerdo [70%] · inclina frente|tras|direita|esquerda [graus]
  olha baixo|cima|direita|esquerda|frente [graus] · sobe 30cm · deita costas|brucos|lado · espelha [PARTES] · mistura POSE 50% · copia PARTES de POSE · zera [PARTES]
  PARTES: ${Object.keys(PD_PARTES).join(", ")}.
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
  Kai pula [${Object.keys(LC_PULOS).join("|")}] [1m] [altura 40cm] [direita|esquerda]   (antecipação, voo no tempo da gravidade, aterrissagem amortecida)
  Kai mergulha [altura 0.5m] [fundo 1m]     (da borda, de cabeça)
  Kai nada [${Object.keys(LC_NADO).join("|")}] [3m]   (de costas ele se deita para trás e vai na direção da CABEÇA = para trás de onde estava virado:
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

  CABEÇALHO DO PLANO: plano 3 [corte|fusao 0.6s|escurece 0.8s|clareia] duracao 6s [plano close alvo Kai lado 3/4] [lento 50%] [sai escurece 1s]
    A transição é SEMPRE no cabeçalho do plano (não existe linha "transicao" dentro da cena). O enquadramento no cabeçalho é a câmera inicial
    quando o plano não tem linha "camera …"; com linha "camera", ela manda (e os avisos de composição do cabeçalho são ignorados).
  POSTURA NO TEMPO: 1s Kai senta · ajoelha · deita · agacha · levanta · levanta-se (do chão) · cai [frente|tras|lado]
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
    0s Mira espera [${Object.keys(AD_ESPERAS).join("|")}] [por 5s]
  TRANSIÇÃO de postura: senta, levanta, levanta-se, ajoelha, deita, agacha, cai (posturas mudam o corpo inteiro; "Kai anima ajoelhar" também vale).
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
${EXEMPLO_NAME}

EXEMPLO DE FILME
${EXEMPLO_FILME}

22. ANIMAIS QUADRÚPEDES E MONTARIA
  Manequim simplificado: tronco (cilindro com peito e anca), pescoço, cabeça com focinho, orelhas, rabo e 4 pernas de 3 segmentos com casco.
  Espécies: ${Object.keys(QD_ESPECIES).join(", ")} (também pônei, burro, dromedário, cabra, vaca, cão, lobo, gata…).
  ELENCO:   Trovão animal cavalo [sela] [escala 1.2] [cor #8a5a2b]        Rex animal cachorro        Duna animal camelo escala 0.9
  NO QUADRO OU PLANO (sem tempo = arruma; com tempo = acontece):
    Trovão em (0,0) gira 90 · Trovão vira-para Kai · Trovão olha Mira · Trovão escala 1.5 · Trovão sela
    Trovão pose ${Object.keys(AM_POSES).join("|")}   (ou os verbos: empina, deita, senta, come/pasta, levanta, atento)
    0s Trovão anda|trota|galopa|corre [15m] [para (x,z)|Kai]     0s Trovão galopa-ate (12,4)
    Os cascos ficam plantados: a passada sai do comprimento da perna (passo 4 tempos, trote em diagonais, galope com voo).
    Velocidades (escala 1): cavalo 0,9 / 2,7 / 5,9 m/s (passo/trote/galope) · camelo 1,1 / 3,2 / 7,1 · cachorro 0,5 / 1,5 / 3,3 · ovelha 0,4 / 1,2 / 2,8.
    Com escala, a passada cresce junto. Planeje: 15 m a galope ≈ 2,5 s.
  MONTARIA: Kai monta Trovão (senta na sela; com tempo: "1s Kai monta Trovão") · 4s Kai desmonta [direita|esquerda]
    Montado, a pessoa acompanha o balanço da sela, o giro e a andadura; os braços ficam livres para gestos (acena, aponta).
    "Kai monta Trovão" vale também sem tempo (arruma o começo do plano) e num quadro de name. O cavaleiro continua montado nos planos seguintes,
    mesmo que o cavalo seja reposicionado ("Trovão em (x,z)"), até "desmonta".
  CARGA E SEGUIR: Trovão carrega "mala" (objeto do local vai no lombo) · Rex segue Kai (anda atrás da pessoa, passo/trote/galope conforme a distância).
    "segue" só anda no FILME (quadro a quadro). Num quadro de name, que é um instante, ponha o animal onde quer ("Rex em (x,z)").
    Os animais não entram na legenda de cores das pessoas: cada espécie tem sua cor (troque com "cor #rrggbb").
  CÂMERA: os animais servem de alvo como pessoas: camera segue Trovão lado direita distancia 6m · camera plano inteiro alvo Trovão lado perfil.
  MCP: animais (espécies, poses, marchas e exemplo).

23. ESCALA, VOO E ORIENTAÇÃO (gigantes, anões, fadas; corpos e objetos em qualquer ângulo)
  ELENCO (tipo de corpo):  Golias gigante [4] · Atlas tita · Toco anao · Lumi fada · Pingo miniatura · Kai escala 0.5 · Kai tamanho 2
    O número depois do tipo É a escala (gigante 4 = 4×; sem número = 3,5×). Valem junto: relevante, cor, veste, corpo.
    gigante = 3,5×, titã = 10×, anão = 0,62× com pernas curtas e cabeça maior, fada = 0,12× pairando, miniatura = 0,2×. Faixa: 0,03× a 30×.
    Tudo acompanha a escala: passada e velocidade de andar, alcance, câmera (enquadramentos, distâncias e limites), chão e apoio.
  NO PLANO: Kai escala 3 (muda no meio da história) · Lumi paira 1.5m · Lumi voa (sobe 1 m) · 0s Lumi voa-ate Golias altura 6m · Lumi pousa
    Lumi sobre-mao Golias [esquerda] (a mão vira de palma para cima e a fada fica de pé nela) · Lumi sobre-ombro Golias · Lumi sobre-cabeca Golias
    O apoio vale naquele quadro/plano; nos seguintes ("continua") a fada fica onde estava. Se o gigante mudar de pose ou lugar, repita a linha
    (ex.: "Lumi sobre-ombro Golias" para trocar da mão para o ombro). Para ir voando até a mão: "0s Lumi voa-ate Golias altura 2m" e depois "sobre-mao".
  ORIENTAÇÃO DO CORPO: Kai inclina-corpo 30 [frente|tras] · Kai tomba-corpo 45 · Kai de-lado · Kai de-cabeca-para-baixo (gira o corpo inteiro)
  ORIENTAÇÃO DE OBJETOS (no local): caixa "c" em (2,2) inclina 30 · coluna "tronco" em (-2,2) tamanho 0.4x0.4x3 tomba 90 · deitado · de-pe
    (gira = em volta do eixo vertical; inclina = para a frente; tomba = de lado; a base é recalculada para o objeto encostar no chão).

24. PÁGINA, BALÕES E WEBTOON (mangá, comic, A4, quadrado; tira vertical)
  PÁGINA: pagina formato manga|comic|a4|quadrado|webtoon|livre [leitura japonesa|ocidental] [grade 2x3] [margem 40] [calha 14] [sangria] [dupla] [splash]
    manga = B5 (182×257), comic = 6,625×10,25", a4, quadrado. sangria = a arte vai até a borda; dupla = página dupla (spread); splash = 1 quadro na página toda.
  QUADRO (tudo no CABEÇALHO do quadro): quadro 3 … tamanho pequeno|normal|grande|largo|alto|inserto|splash · borda diagonal [12] | nenhuma | grossa
    "sem-borda" = "borda nenhuma". "tamanho" vale nas páginas; no webtoon a altura de cada quadro segue o formato da imagem.
    Diagonal = painel inclinado (ação); sem borda = quadro aberto (calma, memória). A ordem de leitura segue a leitura da página (japonesa: da direita para a esquerda).
  BALÕES (automáticos a partir das falas, com o rabicho apontando para a BOCA de quem fala e sem cobrir rostos):
    Kai fala "…" (oval) · Kai pensa "…" (nuvem com bolinhas) · Mira grita|berra "…" (estourado) · Kai sussurra|cochicha "…" (tracejado)
    Kai fala-radio|radio "…" (zigue-zague: telefone, rádio, TV) · narra "…" ou narrador "…" (caixa de narração no canto)
    Os balões ficam na ordem de leitura (o primeiro a falar mais acima e no começo da leitura) e perto de quem fala.
  WEBTOON: o espaço entre quadros é TEMPO. No CABEÇALHO do quadro: ritmo momento|acao|sujeito|aspecto|lugar|tempo|cena · respiro [1.5]
    Espaço ANTES do quadro (tira de 800 px): momento 50 px · acao 90 · sujeito 120 · aspecto 160 · lugar/tempo 420 · cena 520 · sem ritmo 110
    (420 depois de uma "transicao"). respiro N soma N × 260 px de vazio (pausa dramática; sem número = 1). Valor de ritmo errado dá erro.
    Exporta como tira de 800 px de largura em fatias de 1280 px.
  RITMO (McCloud): momento-a-momento (câmera lenta), ação-a-ação, sujeito-a-sujeito (conversa), cena-a-cena (salto), aspecto-a-aspecto (clima, mangá), non-sequitur.
  EXPORTAR: site → Texto → botões "Páginas PNG", "Páginas PDF", "Webtoon", "CBZ". MCP: paginas_hq (PNG/PDF/CBZ) e webtoon (tira e fatias).

25. DIRETOR AUTOMÁTICO E COMPOSIÇÃO
  diretor auto (linha solta no texto, vale para todos) ou "camera auto"/"diretor" no cabeçalho de um quadro ou plano. Também: cobertura auto.
    O diretor só decide o que você NÃO escreveu: plano/lado/ângulo escritos no cabeçalho ganham dele.
  EIXO DE 180°: "lado" conta a partir de para onde o ALVO está virado (frente = de frente para ele). Dois personagens frente a frente com o MESMO
    lado ficam filmados de lados opostos da linha entre eles (cruza o eixo). Na conversa use 3/4 para um e 3/4-direita para o outro (ou diretor auto).
    Escolhe plano, lado e ângulo pela FUNÇÃO e pelo conteúdo: estabelecimento/troca de local → geral; fala → sobre-o-ombro/médio alternando;
    emoção (surpresa, medo, grito) → close; clímax/ação → ângulo baixo; nunca repete o mesmo plano 3 vezes e respeita o EIXO de 180° entre os dois que conversam.
  ALTERNATIVAS: quadro 4 … alternativas 6 (ou MCP quadro_alternativas): 6 versões do mesmo quadro (médio 3/4, close contra-plongée, geral plongée, americano perfil,
    inteiro de costas, primeiro plano holandês) para escolher.
  AVISOS DE COMPOSIÇÃO (aparecem com os erros): cabeça cortada pela borda, olhar sem espaço à frente (lead room), três quadros seguidos no mesmo plano,
    câmera que cruza o eixo de 180°, mão na frente do corpo (silhueta).

26. VÍDEO AVANÇADO, PÉS NO CHÃO E AUDITOR
  CÂMERA: camera caminho (x,altura,z) (x,altura,z) (x,altura,z)… em 5s [olha Kai]   — percurso suave passando por todos os pontos (metros)
    Sem tempo na frente começa no início do plano; "2s camera caminho …" começa aos 2 s. As curvas (entra/sai/linear) valem para caminho, vertigo e os movimentos.
    0s camera vertigo aproxima|afasta 50 em 3s   — dolly zoom: a câmera anda e a lente compensa (o alvo fica do mesmo tamanho, o fundo estica)
    Curvas de tempo em qualquer movimento: … em 2s linear | entra (começa devagar) | sai (freia no fim) | suave (padrão)
  TEMPO DO PLANO: plano 2 duracao 3s lento 50% (câmera lenta: a tela dura 6 s) · acelera 200% · congela 1.5s por 1s (a imagem para 1 s nesse ponto)
    "duracao" é o tempo da AÇÃO escrita (as linhas 0s…3s); o vídeo dura duracao ÷ velocidade + congelamentos (a lista de planos mostra os dois).
  PERCURSO A PÉ: 0s Kai anda por (0,0) (3,1) (3,4) · corre por … (vira nos cantos, passadas do tamanho do corpo)
  PASSES EM VÍDEO: MCP exportar_filme passes ["contorno","openpose","profundidade"] → passes/*.mp4 no .zip (referência para ControlNet de vídeo).
  LINHA DO TEMPO (site → Texto → aba Filme): uma faixa por pessoa/animal e uma da câmera; clique numa barra para ir à linha; arraste para mudar o segundo.
  PÉS NO CHÃO: o ciclo de andar tem 4 poses por passo (contato, recepção, passagem, impulso) e o corpo avança no ritmo do pé de apoio (pé parado no chão).
    As animações prendem o pé de apoio automaticamente no filme (menos nado, rolar, cair, deitar, voo). Gestos passageiros voltam sozinhos à pose de antes.
    Para soltar o chão: "Kai paira 0.05m" (folga) ou animações de voo.
  AUDITOR: MCP auditar_animacoes (ou site → Texto → "Auditar animações") mede em cada animação quanto o corpo afunda no chão (cm), quanto o pé apoiado
    escorrega (cm/s) e se termina longe da pose de partida. Limites: afunda > 3,5 cm ou escorrega > 12 cm/s (corrida 40, transições 30) = problema.
  SOM: não há áudio; falas viram legendas e .srt e os tempos ficam na lista de planos.`;
}

/* ===================== CATÁLOGO DSL: todas as poses e animações em código (para mandar à IA de fora) ===================== */
const CAT_TIPO = { acao: "ação (acontece e segura)", ciclo: "ciclo (repete)", espera: "espera viva", transicao: "transição de postura" };
function catalogoItens() {
  const poses = [], vistas = new Set();
  for (const nome of todasPoses()) { if (vistas.has(nome)) continue; vistas.add(nome); try { poses.push({ nome, origem: "pronta", valores: pdValoresPose(nome, pdParams({}), null, 0).valores }); } catch (e) { } }
  for (const p of posesSalvas()) poses.push({ nome: p.nome, origem: "minha", valores: p.valores, tags: p.tags || [] });
  const lib = bibliotecaAnimacoes(), anims = lib.listar().map(x => { const a = lib.obter(x.nome || x); return a ? { nome: a.nome, anim: a, tipo: adTipoDe(a), origem: a.origem === "pronta" || a.versao === 0 ? "pronta" : "minha" } : null; }).filter(Boolean);
  return { poses, anims };
}
function catalogoDsl(o = {}) {
  const { poses, anims } = catalogoItens(), comCodigo = o.codigo !== false, cont = {}; anims.forEach(a => { cont[a.tipo] = (cont[a.tipo] || 0) + 1; });
  const data = o.data || new Date().toISOString().slice(0, 10), bloco = t => "```gm\n" + t.trimEnd() + "\n```", L = [];
  L.push("# Catálogo DSL do GeoMannequin", "", "Gerado em " + data + " · **" + poses.length + " poses** · **" + anims.length + " animações** (" + Object.entries(cont).map(([k, n]) => n + " " + ({ acao: "ações", ciclo: "ciclos", espera: "esperas vivas", transicao: "transições de postura" }[k] || k)).join(", ") + ") · " + Object.keys(AD_ACOES).length + " verbos do dia a dia · " + Object.keys(AD_ESPERAS).length + " estilos de espera · " + Object.keys(EXPRESSOES).length + " expressões · " + Object.keys(CATALOGO).length + " efeitos · " + Object.keys(TIPOS_OBJETO).length + " objetos.", "",
    "Como usar: cada bloco abaixo é texto da linguagem do GeoMannequin (a mesma do editor Texto e do MCP). Cole um bloco no Texto para editar; para USAR pelo nome numa cena: `Kai pose NOME` (pose) ou `0s Kai anima NOME` (animação, dentro de um plano de filme). Para criar uma variação: copie o bloco, troque o nome e mude as linhas. Ações seguram a pose final; ciclos repetem até o fim do plano (ou `por 3s`); esperas são vivas (respiram, olham em volta) e duram o que for preciso.", "",
    "Linguagem completa: peça o MANUAL (site → Texto → Manual, ou ferramenta `manual_name` do MCP). Parâmetros de câmera de cinema, planos e MP4 estão nos capítulos 15 a 20 do manual.", "");
  L.push("## Índice", "", "**Poses:** " + poses.map(p => "`" + p.nome + "`").join(", "), "");
  for (const t of ["acao", "ciclo", "espera", "transicao"]) { const g = anims.filter(a => a.tipo === t); if (g.length) L.push("**Animações — " + CAT_TIPO[t] + ":** " + g.map(a => "`" + a.nome + "`").join(", "), ""); }
  L.push("**Verbos do dia a dia (numa linha de plano: `1s Kai VERBO [para Mira]`):** " + Object.keys(AD_ACOES).map(v => "`" + v + "`").join(", "), "", "**Esperas (`0s Kai espera ESTILO`):** " + Object.keys(AD_ESPERAS).map(v => "`" + v + "`").join(", "), "",
    "**Expressões (`expressao NOME`):** " + Object.keys(EXPRESSOES).join(", "), "", "**Efeitos (`Kai efeito NOME em mao-direita`):** " + Object.keys(CATALOGO).join(", "), "", "**Objetos (no local: `copo \"copo\" em (1,0) sobre mesa`):** " + Object.keys(TIPOS_OBJETO).join(", "), "");
  L.push("## Animais quadrúpedes (capítulo 22)", "", "**Espécies (`Trovão animal cavalo [sela] [escala 1.2]`):** " + Object.keys(QD_ESPECIES).map(e => "`" + e + "`").join(", "), "", "**Poses (`Trovão pose NOME`):** " + Object.keys(AM_POSES).map(e => "`" + e + "`").join(", "), "",
    "**Marchas:** `anda` (passo), `trota` (trote), `galopa`/`corre` (galope) `[N m] [para X]` · `galopa-ate (x,z)` · `Kai monta Trovão` / `Kai desmonta` · `Trovão carrega \"mala\"` · `Rex segue Kai`", "",
    "## Tipos de corpo e escala (capítulo 23)", "", "`gigante [N]` (3,5×) · `tita` (10×) · `anao` (0,62×, pernas curtas) · `fada` (0,12×, paira) · `miniatura` (0,2×) · `escala N` (0,03–30×) · `paira 1.5m` · `voa-ate X altura 6m` · `pousa` · `sobre-mao|sobre-ombro|sobre-cabeca Outro` · `inclina-corpo 30` · `de-cabeca-para-baixo`", "");
  L.push("## Poses", "");
  for (const p of poses) { L.push("### " + p.nome + (p.origem === "minha" ? " · minha" : ""), ""); if (comCodigo) L.push(bloco(pdCodigoPose(p.valores, { nome: p.nome, tags: p.tags })), ""); }
  L.push("## Animações", "");
  for (const a of anims) { const A = a.anim; L.push("### " + a.nome + " — " + (CAT_TIPO[a.tipo] || a.tipo) + ", " + A.duracao.toFixed(2).replace(".", ",") + " s" + (A.loop ? ", loop" : "") + (a.origem === "minha" ? " · minha" : ""), "");
    if (A.descricao && A.descricao !== a.nome) L.push(A.descricao, ""); L.push("No filme: `0s Kai anima " + a.nome + "`" + (a.tipo === "ciclo" ? " (repete até o fim do plano ou `por 4s`)" : ""), "");
    if (comCodigo) { try { L.push(bloco(pdCodigoAnimacao(A, { nome: a.nome })), ""); } catch (e) { L.push("(não deu para escrever o código: " + e.message + ")", ""); } } }
  L.push("## Verbos do dia a dia", "", "| verbo | o que faz | duração |", "|---|---|---|");
  for (const v of Object.keys(AD_ACOES)) { try { const a = AD_ACOES[v](); L.push("| `" + v + "` | " + (a.descricao || a.nome) + (a.volta ? " (e volta)" : " (segura)") + " | " + a.duracao.toFixed(1).replace(".", ",") + " s |"); } catch (e) { } }
  L.push("", "Com alguém ou um ponto: `2s Kai aponta Mira` (vira, olha e aponta). Mão esquerda: `Kai acena mao-esquerda`. Objetos: `Kai pega copo`, `Kai entrega copo para Mira`, `Mira larga copo`, `Kai joga bola para Mira`.", "");
  return L.join("\n") + "\n";
}

const PROMPTS_NAME = {
  "História → filme": `Você vai transformar a história abaixo num FILME curto escrito na linguagem do GeoMannequin (manequins geométricos), que vira um vídeo MP4 de referência e uma lista de planos para uma IA de vídeo.
Siga o MANUAL (capítulos 15 a 20 e 22, 23, 26: filme, cena, plano, câmera de cinema, ações, princípios, falas, exportar; animais e montaria; escala e voo; vídeo avançado) À RISCA: só palavras, verbos, poses, expressões, efeitos e objetos das listas.
1) Liste o elenco (um por linha) e monte UM local com o que a história pede (objetos que alguém vai pegar: em cima de mesa/banco com "sobre").
2) Divida a história em CENAS e cada cena em PLANOS curtos (2 a 8 s). Um plano = um ponto de vista. Varie: plano geral para situar, sobre-o-ombro na conversa, close na emoção, POV para o que alguém vê, câmera fixa à frente para ver alguém chegar, segue para acompanhar.
3) Em cada plano: linhas sem tempo arrumam (posição, vira-para); linhas com tempo contam a ação ("0s", "1.5s", "depois", "junto"). Ações (oferece, aponta, pede…) seguram a pose; ciclos (anda, corre) e esperas (espera impaciente) duram até a próxima coisa.
4) Dê vida: quem não age espera (espera empe/olhando-em-volta), olhares ("olha Mira"), expressões no tempo, falas com "fala" (o filme com "legendas").
5) Use os princípios quando ajudarem: "exagera 130%" em momentos fortes, "sobreposicao" em gestos, transições "fusao 0.5s" para passagem de tempo e "escurece 0.8s" no fim.
6) Duração: a que a história pedir (ou cerca de 1 minuto). Responda SÓ com o código, num bloco de código, começando por: filme "Título" fps 24 legendas

HISTÓRIA:
`,
  "História → página de mangá/HQ": `Você vai transformar a história abaixo em PÁGINAS de mangá (ou HQ) escritas na linguagem do GeoMannequin, que viram páginas com quadros e balões.
Siga o MANUAL (capítulos 1 a 8, 22 a 25) À RISCA: só palavras, poses, expressões, objetos e animais das listas.
1) Elenco (um por linha; animais com "animal ESPECIE"; gigantes/anões/fadas com "gigante", "anao", "fada") e UM local geométrico por lugar.
2) "pagina formato manga leitura japonesa" (ou "comic leitura ocidental"). 5 a 7 quadros por página; um quadro "tamanho grande" ou "splash" no momento forte.
3) Varie os planos (geral para situar, médio na conversa, close na emoção; "borda diagonal" na ação; "sem-borda" em memória). Ou use "diretor auto".
4) Falas: "Kai fala", "Kai pensa", "Mira grita", "Kai sussurra", "radio", e "narra" para o narrador. Frases curtas (até ~12 palavras por balão).
5) Cada quadro: posições (em, vira-para), pose/gesto/expressão. Responda SÓ com o código num bloco.

HISTÓRIA:
`,
  "História → webtoon": `Você vai transformar a história abaixo num EPISÓDIO DE WEBTOON (tira vertical) escrito na linguagem do GeoMannequin.
Siga o MANUAL (capítulos 1 a 8, 22 a 25) À RISCA.
1) Elenco e locais como no name. "pagina formato webtoon".
2) 20 a 40 quadros. O ESPAÇO entre quadros é TEMPO: no cabeçalho do quadro use "ritmo momento" (colado, câmera lenta), "ritmo acao", "ritmo sujeito"
   (conversa), "ritmo lugar"/"ritmo tempo" (salto) e "ritmo cena" (troca de cena), e "respiro 1.5" para pausas dramáticas.
3) Comece com um quadro de estabelecimento (plano geral), alterne closes na emoção, termine num gancho (close + pausa).
4) Falas com fala/pensa/grita/sussurra/narra, curtas. Responda SÓ com o código num bloco.

HISTÓRIA:
`,
  "História → name": `Você vai converter a história abaixo em um NAME (storyboard de mangá) escrito na DSL do GeoMannequin.
Siga o "Manual da DSL do NAME" (abaixo ou anexado) À RISCA: só palavras, poses, expressões e objetos das listas.
1) Leia a história e liste: personagens relevantes (elenco, um por linha) e grupos de figurantes.
2) Para cada lugar, escreva um bloco "local" geométrico em metros (chão, paredes/salas, níveis, escadas, objetos grandes, marcas e regiões que a história usa).
3) Corte a história em quadros (um instante por quadro; 4 a 7 por página; "pagina" separa páginas). Para cada quadro:
   local/continua, plano, ângulo, lado, alvo, funcao, e as linhas dos personagens (posição, pose/ação, expressão, olhar, o que seguram, interações) e figurantes (quantidade, distribuição, para onde olham em %).
4) Use "transicao tempo|lugar|flashback" quando o tempo passar, o lugar mudar ou for lembrança.
5) Escreva "legenda" só quando a legenda automática não bastar (legenda visual, curta, sem falas). Falas: "fala".
Responda SÓ com o código, num bloco de código. Comece com "semente 1".

HISTÓRIA:
`,
  "Imagem → local": `Olhe a imagem anexada (foto, desenho ou planta) e descreva o CENÁRIO como um bloco "local" da DSL do GeoMannequin (veja o capítulo 9 do manual: origem, eixos, escala por referência, pixels → metros, alturas).
- Diga em um comentário qual ponto você escolheu como (0,0), para onde vão x e z, e qual referência deu a escala.
- Use metros. Comece pelo chão, depois paredes/salas (com portas e janelas), níveis e escadas, objetos grandes, objetos pequenos.
- Nomeie com "marca" e "regiao" os lugares onde personagens vão ficar.
- Só objetos da lista do manual (use "caixa"/"banco"/"mesa" com nome e tamanho para o que não existir).
Responda SÓ com o código do local, num bloco de código.`,
  "História + local salvo → name": `Converta a história abaixo num NAME na DSL do GeoMannequin, usando o(s) local(is) JÁ SALVO(S) abaixo (não redescreva o cenário: use "quadro local "Nome"" e as marcas/regiões que ele tem; para variações use "local "Nome à noite" herda "Nome"" com as peças novas).
Siga o manual à risca. Responda só com o código.

LOCAIS SALVOS (nome, marcas, regiões):
{locais}

HISTÓRIA:
`,
  "Pose em texto → código": `Escreva a pose descrita abaixo como um bloco "pose" da DSL do GeoMannequin (capítulo 14 do manual).
- Comece de uma pose pronta parecida (pose "nome" de passo / de guardaLuta / de empe …).
- Ajuste junta por junta: ombro.direito(frente 40, abre 10) · cotovelo.esquerdo(dobra 90) · quadril.direito(frente 30) · joelho.esquerdo(dobra 25) · tronco(gira-esquerda 10) · cabeca(baixa 15) · mao.direito(fecha 80%).
- Use os atalhos quando couber: agacha 50% · ajoelha direito · peso esquerdo · inclina frente 20 · olha baixo · espelha bracos.
- Lado = do PERSONAGEM (direito dele). Valor sozinho = fica nele; +10/-10 = soma. Respeite os limites da tabela de juntas.
- Termine o cabeçalho com "salvar" se a pose for para a biblioteca.
Responda SÓ com o código, num bloco de código.

POSE:
`,
  "Movimento em texto → animação": `Converta a descrição de movimento abaixo numa ANIMAÇÃO na DSL do GeoMannequin (capítulos 12 e 13 do manual).
- Se for virar ou girar, use as palavras prontas: "gira 360 passos direita", "vira-para Mira passos", "gira 360 pivo|luta|salto". Se for ir até alguém: "anda-ate Mira [correndo]". Para olhar: "olha Mira [so-cabeca|so-olhos|corpo]".
- Se for um movimento próprio, escreva um bloco: animacao "nome" duracao Xs [relativa] [fps 24] [em-dois] [velocidade 1] tags "Categoria/Sub" salvar
  com linhas "chave Ts …" (pose, gesto, atitude, expressao, ajustes como "pe direito 15cm para direita", move frente/lado/giro, olha, segurar 0.3s, fala).
- Pense na ordem do corpo: olhos e cabeça antes, depois ombros/tronco, pelve e pés; antecipação (um pouco para o lado contrário) antes do movimento grande e um pequeno exagero no fim.
- Para ciclos (andar, correr, engatinhar): faça UMA pose e "ciclo "nome" de POSE". Para variar uma animação existente: animacao "nova" de OUTRA + troca/soma/ate/trecho/espelha (capítulo 14). Pular/nadar/mergulhar/rolar: use as palavras prontas.
- Use "relativa" quando o movimento deve valer a partir de qualquer pose (ex.: abaixar a cabeça). Tags hierárquicas (Locomocao/Virar, Conversa/Explicar, Ajuste/Pe).
Responda SÓ com o código, num bloco de código.

MOVIMENTO:
`,
  "Explicar a ficha para a IA de imagem": `Cada imagem anexada é a FICHA de um quadro de mangá (storyboard). Leia assim:
- O painel com BORDA VERDE é o quadro: desenhe a cena final exatamente com este enquadramento, esta câmera, estas poses e posições. Os manequins coloridos são personagens: a mesma cor é sempre o mesmo personagem (veja a legenda de cores); manequins cinza são figurantes.
- O RETÂNGULO VERMELHO com texto branco é o contexto do momento (o que acontece). Não desenhe esse texto.
- O painel de BORDA AZUL é a planta vista de cima (onde está cada um, para onde olha, de onde a câmera vê).
- O painel de BORDA AMARELA é uma vista isométrica do lugar (volume das construções).
Não desenhe as bordas nem os painéis azul/amarelo: eles só explicam o espaço. Mantenha o estilo pedido e a continuidade entre os quadros.`
};

export { manualName, PROMPTS_NAME, EXEMPLO_NAME, EXEMPLO_FILME, catalogoDsl, catalogoItens };
