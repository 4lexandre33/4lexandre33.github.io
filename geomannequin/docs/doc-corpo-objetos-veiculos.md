# Pernas cruzadas, mãos, objetos, instrumentos, veículos, efeitos e +1.000 poses

Data: 2026-11-20 · Manual: capítulo 63 · Tutorial: "Pernas cruzadas, mãos, objetos e veículos"

## Por que as pernas cruzadas e os braços ficavam ruins
Os ossos e a anatomia estavam certos. O defeito era a **cinemática**, em dois pontos:
- **Pernas:** a trava "as pernas não se atravessam" (`legClear`) só sabia **abrir as coxas**. Por isso, toda perna cruzada virava perna aberta. Além disso, as poses chutavam ângulos sem conferir onde o joelho e o pé paravam.
- **Braços:** a cinemática inversa escolhia soluções com o **braço por cima da cabeça** para chegar ao peito. Vários alvos também estavam errados: os braços cruzados miravam a altura do ombro, o que parecia uma guarda de boxe.

## O que mudou
- **Resolvedor de pernas cruzadas** (`src/scene/pernas-cruzadas.js`):
  - Busca a flexão, a abertura e o giro da coxa e a flexão do joelho de cada perna até o joelho e o tornozelo chegarem aos pontos certos.
  - Uma perna pode **apoiar** na outra, mas não atravessar.
  - A trava agora aceita encostar até −0,08 R. Por isso, ela não abre mais as pernas cruzadas.
  - Modos:
    - `perna`: perna sobre perna;
    - `figura4`: tornozelo sobre o joelho;
    - `tornozelos`: tornozelos cruzados;
    - `empe`: em pé, com um pé cruzado na frente do outro;
    - `indio`: sentado no chão de pernas cruzadas;
    - `lotus`: lótus;
    - `borboleta`: solas dos pés juntas;
    - `lado`: pernas dobradas para um lado.
  - No chão, nada da perna fica abaixo dos ísquios.
- **Mãos em marcos do corpo** (`src/scene/maos-alvo.js`):
  - 24 lugares: queixo, boca, testa, nuca, peito, coração, cruzado, abraço, prece, barriga, cintura, bolso, costas, lombar, coxa (segue a perna), colo, cotovelo…
  - O braço é natural: o cotovelo fica para baixo e para fora.
  - Se um braço entra no outro, a mão de cima se afasta.
  - 272 poses com o nome "mão em X" passam por aí.
- **Comandos de texto** (Name, barra do palco e MCP):
  - `Kai mao-dir no queixo` · `Kai maos nos bolsos`
  - `Kai cruza perna-dir sobre perna-esq` · `Kai cruza pernas indio` · `Kai cruza tornozelos` · `Kai cruza bracos`
  - `Kai naturaliza bracos`
  - `Kai deita-em Sofa [de-lado]` · `Kai toca Piano` · `Kai usa Fogao`
  - `Kai pose X efeitos [1|2|3]`

## Objetos novos (formas primitivas)
São mais de 80 objetos, todos com peças sólidas (desenho, colisão e contato), além dos 9 instrumentos de mão listados abaixo.
- **Sala e quarto:**
  - assentos e camas: sofá, poltrona, pufe, cama de casal, beliche, berço, rede;
  - móveis: mesa de centro, rack, TV, estante, criado-mudo, guarda-roupa, cômoda;
  - luz e decoração: abajur, luminária, lareira, espelho.
- **Cozinha:** geladeira, fogão, pia, balcão, armário, micro-ondas, mesa de jantar, banqueta alta.
- **Banheiro e serviço:** vaso sanitário, banheira, chuveiro, lavatório, máquina de lavar, tábua de passar, lixeira, rodo.
- **Escritório e escola:** escrivaninha, cadeira giratória, computador, notebook, arquivo, lousa, carteira escolar, mesa do professor, bebedouro, mochila.
- **Rua e lazer:**
  - rua: banco de praça, poste, semáforo, hidrante, lixeira de rua, ponto de ônibus, orelhão, caixa de correio, cerca, placa;
  - lazer: cadeira de praia, guarda-sol, churrasqueira, balanço, escorregador, gangorra, mesa de piquenique, barraca, fogueira;
  - outros: vaso com planta, carrinho de bebê, carrinho de mercado.
- **Instrumentos para tocar** (`toca`): piano, piano de cauda, teclado, bateria, harpa, violoncelo, contrabaixo, microfone no pedestal e xilofone. O amplificador vem junto, como objeto de cena.
- **Instrumentos de mão** (`segura`, já na pegada de tocar): saxofone, clarinete, ukulele, cavaquinho, baixo, pandeiro, gaita, acordeão, trombone.
- **Usar:**
  - `senta-em`: altura certa do assento; no sofá, cada pessoa fica no lugar mais perto;
  - `deita-em`: ao longo do lado comprido, em cima do objeto;
  - `usa` / `toca`: no lugar certo, com as mãos nos pontos de uso.
- As situações de sofá e de banco de praça agora usam o objeto de verdade.

## Veículos por categoria
- **bicicleta:** modelos urbana, speed, bmx, mountain; assentos ciclista e em pé.
- **moto:** esportiva, custom, scooter, trilha, polícia; piloto e garupa.
- **caminhão:** baú, carroceria, tanque, caçamba, cegonha.
- **van:** perua, ambulância, escolar.
- **trator.**
- **carro de corrida:** fórmula e kart.
- **skate:** de lado na prancha.
- **patinete.**
- **jet ski:** piloto e garupa.
- **quadriciclo.**

Também continuam os veículos que já existiam: carro, ônibus, trem, barcos, avião e helicóptero.

Quem pilota fica **montado**:
- pernas abertas no selim;
- pés nos pedais ou pedaleiras;
- mãos no guidão;
- tronco inclinado conforme o modelo.

A garupa abraça o piloto.

## Efeitos para todas as poses
- Cada pose (2.518) tem uma lista de efeitos sugeridos, do mais sutil ao mais forte. A lista sai da categoria, do nome, da descrição e da emoção da pose.
- `efeitos 1` põe só o principal; `efeitos 3` põe todos, com linhas de tela.
- No veículo, os efeitos são os de velocidade: linhas no corpo, rastro, poeira e linhas de tela.
- Também valem em `situacao … efeitos`, no Catálogo e no MCP (`efeitos_sugeridos`).

## +1.000 poses novas
São 1.218 poses, geradas por `ferramentas/gerar-poses-mil.mjs` e **podadas no mundo real**. Cada uma:
- difere ≥ 62° de todas as outras;
- não tem o corpo atravessando;
- fica dentro dos limites.

Famílias:
- **anime:** luta, golpes especiais, poses estilosas, dança e idol;
- **12 estilos de dança:** hip hop, k-pop, samba, frevo, balé, salsa, breakdance, vogue, contemporânea, forró, tango, shuffle;
- **palco e música;**
- **pilotando:** moto, bicicleta, skate, surfe, snowboard;
- **esportes;**
- **emoções;**
- **profissões;**
- **mãos no corpo × posturas;**
- **sentado de pernas cruzadas × mãos;**
- **deitado;**
- **comédia, terror, infância, velhice e cerimônia.**

## Câmeras prontas
- **Veículos:** `veiculo.moto|bicicleta|carro|caminhao|skate|kart.lateral|frontal|baixa-traseira|drone|holandes`
- **Música:** `musica.piano|bateria|teclado|microfone|guitarra|violao.palco|contra|maos|lateral`
- **Objetos:** `objeto.sofa-deitado|sofa-pernas|cama-lendo|cozinha-fogao|escritorio-pc|aula-lousa|praca-banco.geral|medio|alto`

O objeto e a ação vêm junto com a câmera.

## Catálogo e MCP
- **Catálogo:** o novo tipo "Objetos e veículos" tem 227 itens, cada um com a linha que cria o objeto e o uso.
- **MCP:**
  - nova ferramenta `ajustar_corpo` (mãos, pernas, naturalizar, usar objeto, efeitos);
  - `catalogo_poses` aceita `tipo: "objeto"` e devolve `efeitos_sugeridos`;
  - `objetos` aceita todos os tipos novos.
- **Prompt de imagem:** os nomes dos objetos saem em inglês.

## Testes
- `testes/corpo-objetos-veiculos.mjs` confere:
  - os 8 modos de pernas × 2 lados;
  - as mãos nos marcos;
  - os comandos;
  - as peças dos objetos;
  - sentar, deitar, tocar e usar;
  - 13 veículos com efeitos;
  - efeitos em todas as poses;
  - as poses novas com diferença ≥ 60°;
  - as câmeras prontas;
  - o catálogo.
- A suíte completa também roda.
- `poses-auditoria` passou a aceitar antebraço apoiado no outro só nas poses de braços cruzados ou de abraço.

## Limitações
- Os objetos são geométricos e simples: não têm textura nem detalhe fino.
- Nas poses de braços cruzados, o antebraço de cima fica a até ~2 R do marco, para não atravessar o outro braço.
- Em 8 das 272 poses com mão em marco, a mão fica a mais de 1,9 R do marco, porque a pose não deixa chegar mais perto.
- Lótus é aproximado: o giro do quadril vai até 45°, menos que o de um iogue.
- Tocar um instrumento deixa as mãos a 5–11 cm dos pontos de uso.
- A pose do instrumento de mão é a pegada genérica de sopro ou de cordas.
- As miniaturas do Catálogo ainda não mostram os objetos, só o nome.
- Algumas poses geradas (por exemplo, "moto na curva" sem a moto) só fazem sentido junto do veículo.
- Os efeitos sugeridos vêm de regras de texto e podem errar o tom; troque com `efeito X`.
