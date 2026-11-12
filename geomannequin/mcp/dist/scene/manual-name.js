/* GeoMannequin — Manual da DSL do NAME (para a pessoa e para a IA que converte a narrativa) e os prompts prontos.
   As listas (poses, expressões, objetos, interações, pegadas, ações, efeitos) saem dos dados do app: estão sempre em dia. */
import { NM_CORES, NM_BORDA } from "./name-dsl.js";
import { todasPoses, EXPRESSOES } from "./poses.js";
import { INTERACOES } from "./interacoes.js";
import { ACOES } from "./pegadas.js";
import { ACOES_LUTA } from "./acoes-luta.js";
import { TIPOS_OBJETO, CATALOGO } from "../engine/index.js";
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
  "tamanho LxPxA" = largura (x) × profundidade (z) × altura, em metros. "gira 90" gira no chão (graus, anti-horário visto de cima).
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
  Kai olha Mira so-cabeca       (o corpo NÃO vira; se não der, o quadro avisa e a legenda diz "tentando olhar")
  Kai olha Mira so-olhos        (só os olhos; bom para "olhar de canto")
  Kai olha Mira corpo           (o corpo todo vira para Mira)
  alvo: alguém do elenco, camera, um objeto ("olha Mesa"), ou (x,z) em metros.
Conferência automática: depois do quadro, cada olhar é medido; se faltar mais de 10° o aviso diz quanto falta e o que usar ("olha … corpo" ou "vira-para …").
Diálogo: "dialogo Kai, Mira [tom tenso] [de-frente|lado-a-lado|aberto|livre]"
  de-frente (padrão) = os corpos viram um para o outro · lado-a-lado = ombro a ombro (corpos para a frente, cabeças viradas) ·
  aberto = 3/4, meio virados para a frente da cena (teatro) · livre = não mexe nos corpos. Quem tem "vira-para", "gira" ou "anima" na linha não é virado.
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
  Sentido: esquerda = anti-horário visto de cima = para a esquerda DO PERSONAGEM; direita = horário. Sem sentido: o sinal do número (−90 = direita).
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
  segurar 0.3s (numa chave): pausa naquela pose.
LIMITES (o que ainda NÃO faz, para ninguém prometer):
  - o pé de apoio fica preso, mas o pé livre pode arrastar alguns cm rente ao chão no começo do passo (sai pelo calcanhar); salto: só o giro no ar, sem física;
  - "anda-ate" desvia de UM objeto (o primeiro no caminho), não de pessoas, e não sobe escada sozinho;
  - "olha" numa chave segue o alvo no lugar em que ele está no fim do quadro;
  - mão que segura objeto: o objeto acompanha, mas a pegada não se reajusta ao andar;
  - esbarrão é só aviso (centro a centro < 30 cm), não desvia;
  - boca: ritmo por letra (não é fonema de verdade), em português.

14. EXEMPLO COMPLETO
${EXEMPLO_NAME}`;
}

const PROMPTS_NAME = {
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
  "Movimento em texto → animação": `Converta a descrição de movimento abaixo numa ANIMAÇÃO na DSL do GeoMannequin (capítulos 12 e 13 do manual).
- Se for virar ou girar, use as palavras prontas: "gira 360 passos direita", "vira-para Mira passos", "gira 360 pivo|luta|salto". Se for ir até alguém: "anda-ate Mira [correndo]". Para olhar: "olha Mira [so-cabeca|so-olhos|corpo]".
- Se for um movimento próprio, escreva um bloco: animacao "nome" duracao Xs [relativa] [fps 24] [em-dois] [velocidade 1] tags "Categoria/Sub" salvar
  com linhas "chave Ts …" (pose, gesto, atitude, expressao, ajustes como "pe direito 15cm para direita", move frente/lado/giro, olha, segurar 0.3s, fala).
- Pense na ordem do corpo: olhos e cabeça antes, depois ombros/tronco, pelve e pés; antecipação (um pouco para o lado contrário) antes do movimento grande e um pequeno exagero no fim.
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

export { manualName, PROMPTS_NAME, EXEMPLO_NAME };
