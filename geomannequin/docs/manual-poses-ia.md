# Manual do GeoMannequin para IA: como fazer qualquer pose
Este manual serve para qualquer IA (Gemini, ChatGPT, Claude…) montar e corrigir poses no GeoMannequin, um manequim anatômico 3D desenhado em SVG, controlado por código JavaScript em português. Não precisa de MCP: a IA responde com código; a pessoa cola no editor “Comandos da cena” do site e clica em Executar.

## 0. Regras para a IA (leia primeiro)
1. Você vai receber: este manual, o **ESTADO DA CENA** (texto e JSON com cada controle e o que cada parte do corpo está fazendo), uma **imagem** da cena (opcional) e o **pedido** da pessoa.
2. Responda com **um único bloco de código** ```js ... ``` com comandos do GeoMannequin. Antes do bloco, no máximo 2 frases dizendo o que vai mudar. Não invente comandos: use só os deste manual.
3. Comece por uma pose pronta parecida (`m.poseRapida("nome")`) e ajuste poucos controles com `m.pose({...})`. Os valores são **absolutos** (graus ou 0–1), não somam ao valor atual. Controle que você não mencionar fica como está.
4. **Esquerda/direita são sempre do manequim**, não da imagem. De frente para a câmera, a mão esquerda dele aparece à DIREITA da imagem. Confira no estado: `naImagem.maoEsq` dá a posição na foto.
5. Depois que a pessoa executar, ela manda o novo estado (e a imagem). Compare com o pedido, parte por parte (tronco, cabeça, cada braço, cada perna, mãos), e corrija só o que estiver errado. Repita até ficar certo.
6. Para movimentos com contato (mão no quadril, mão na parede, sentar numa cadeira) prefira os comandos de contato (`m.maoEm`, `m.sentar`, `m.apoiar`) em vez de adivinhar ângulos.
7. Se o estado mostrar **partes atravessando** (autoColisoes), afaste o membro (abra o braço, gire o tronco) ou mude o ângulo.

## 1. Mundo, eixos, unidades e lados
- Eixo **y** para cima. O chão fica em y = 0 (o apoio no chão acerta a altura sozinho: `apoio: 1`).
- Na cena nova, o manequim olha para **+z** (para a câmera inicial). A **esquerda dele é +x** (aparece à direita da imagem).
- `m.girar(graus)`: 0 = olha para +z; 90 = olha para +x; 180 = de costas para a câmera inicial; −90 = olha para −x.
- Unidades: o manequim padrão tem ≈ 16,5 de altura (a cabeça ≈ 2,2). Posição no chão: `m.posicao(x, z)` de −30 a 30. Dois manequins lado a lado: ~6 de distância; frente a frente lutando: 6 a 9.
- Controles com **Esq/Dir** no nome (ou **L/R** na chave interna) são do lado esquerdo/direito do manequim.
- Em `poseRapida(nome, {lado: "esq" | "dir"})` o lado escolhe o membro principal (padrão: "esq"). O que ele escolhe em cada pose está na seção 5 (ex.: em `direto`, lado = pé da frente e o soco sai com o braço do outro lado).
- `corpoInclinar`, `corpoRolar` e `altura` giram/levantam o corpo inteiro (pernas juntas) em volta da pelve; depois o apoio no chão (`apoio: 1`, sempre ligado) baixa ou sobe o corpo até a parte mais baixa encostar no chão. Os braços e as pernas são medidos em relação ao tronco/pelve, não ao mundo: com o corpo inclinado, `bracoFrente: 90` continua "à frente do peito".

## 2. Comandos essenciais
```js
const m = cena.ativo;                       // manequim ativo (ou cena.obter("Ana"))
const b = cena.adicionar({ nome: "Leo", x: 8, z: 0, giro: -90, corpo: "atletico" }); // novo manequim
m.poseRapida("guardaLuta", { lado: "dir" }); // pose pronta (lista na seção 5)
m.pose({ bracoDirFrente: 90, cotoveloDir: 0, antebracoDirGirar: -80 }); // controles (seção 3), valores absolutos
m.gesto("dir", "punho");                   // gesto pronto da mão (seção 4): "esq", "dir" ou "ambas"
m.expressao("raiva", 1.2);                 // expressão (seção 8); mistura: m.expressao("60% raiva + 40% medo")
m.olhar("câmera");                          // ou "cima" (céu), "baixo", "frente", "esquerda", "direita", o nome de outro manequim ("Leo") ou um ponto [x, y, z]; vira cabeça e pescoço (e o tronco se passar de ±80°)
m.girar(-90).posicao(6, 0);                 // girar no chão e posicionar
m.inclinar(-90);                            // corpo inteiro: −90 deitado de costas, 90 de bruços (2º número = tombar de lado)
m.saltar(4);                                // salto com 4 de altura (ou m.pose({ altura: 4 }))
m.deitar("costas" | "bruços" | "lado", "x" | "-z");  m.sentar("cadeira");
m.maoEm("dir", [x, y, z]);                   // leva a mão até um ponto do mundo (cinemática inversa)
m.apoiar("maos pes");                        // leva ao chão ao mesmo tempo: "maos", "pes", "joelhos", "mao esquerda", "pe direito", "joelho direito"… (combine com espaço: "maos joelhos")
m.flexibilidade(2);                         // 0 normal, 1 atleta, 2 ginasta, 3 contorcionista (amplia os limites)
m.espelhar();                               // troca esquerda e direita da pose
log(m.validarPose());                       // partes atravessando e limites acoplados
log(m.codigoPose({ soMudancas: true }));     // a pose atual como código
camera.orbitar("Ana", { azimute: "3/4 esquerda", elevacao: 10 }); camera.girar(30, 8); camera.enquadrar();
```

## 3. Todos os controles de pose
Use o nome em português em `m.pose({...})` (a chave interna em inglês também funciona). Faixa = limite humano no perfil normal (a flexibilidade amplia). Ângulos em graus; os marcados com % vão de 0 a 1 ou de −1 a 1.

### Corpo inteiro (no chão, deitar, saltar)
- `apoio` (= `ground`): 0 a 1 — Apoio no chão (0 = solto, 1 = a parte mais baixa encosta no chão)
- `corpoInclinar` (= `bodyPitch`): -180 a 180 ° — Corpo inteiro: deitar de costas (−) / de bruços (+). Negativo: inclina o corpo inteiro para trás (−90 = deitado de costas). Positivo: inclina o corpo inteiro para a frente (90 = de bruços, 180 = de cabeça para baixo).
- `corpoRolar` (= `bodyRoll`): -180 a 180 ° — Corpo inteiro: deitar de lado. Negativo: tomba o corpo inteiro para a ESQUERDA do manequim. Positivo: tomba o corpo inteiro para a DIREITA do manequim (90 = deitado de lado).
- `altura` (= `bodyLift`): -2 a 30 R — Altura (salto, flutuar). Positivo: levanta o corpo do chão (salto, flutuar), em unidades (o corpo tem ≈ 16,5).

### Coluna e pelve
- `colunaFrente` (= `spineFlex`): -30 a 80 ° — Coluna: estender (−) / flexionar (+). Negativo: arqueia o tronco para trás. Positivo: curva o tronco para a frente.
- `colunaLado` (= `spineSide`): -35 a 35 ° — Coluna: inclinar para o lado. Negativo: inclina o tronco para a ESQUERDA do manequim. Positivo: inclina o tronco para a DIREITA do manequim.
- `colunaTorcao` (= `spineTwist`): -45 a 45 ° — Coluna: girar o tronco. Negativo: gira o peito para a DIREITA do manequim (o ombro ESQUERDO vai para a frente). Positivo: gira o peito para a ESQUERDA do manequim (o ombro DIREITO vai para a frente).
- `pelveInclinar` (= `pelvisTilt`): -15 a 20 ° — Pelve: báscula. Negativo: pelve: báscula para trás (tronco recua). Positivo: pelve: báscula para a frente (tronco avança).
- `pelveLado` (= `pelvisSide`): -10 a 10 ° — Pelve: inclinação lateral. Negativo: pelve: inclina (o tronco vai para a esquerda). Positivo: pelve: inclina (o tronco vai para a direita).
- `pelveTorcao` (= `pelvisTwist`): -25 a 25 ° — Pelve: giro. Negativo: gira a pelve para a DIREITA do manequim. Positivo: gira a pelve para a ESQUERDA do manequim.
- `lombarFrente` (= `lumFlex`): -20 a 40 ° — Lombar: ajuste estender / flexionar. Negativo: lombar: arqueia para trás. Positivo: lombar: curva para a frente.
- `lombarLado` (= `lumSide`): -20 a 20 ° — Lombar: ajuste para o lado. Negativo: lombar: inclina para a esquerda. Positivo: lombar: inclina para a direita.
- `lombarTorcao` (= `lumTwist`): -10 a 10 ° — Lombar: ajuste de giro. Negativo: lombar: gira para a direita. Positivo: lombar: gira para a esquerda.
- `toracicaFrente` (= `thoFlex`): -20 a 40 ° — Torácica: ajuste estender / flexionar. Negativo: torácica: arqueia para trás. Positivo: torácica: curva para a frente.
- `toracicaLado` (= `thoSide`): -20 a 20 ° — Torácica: ajuste para o lado. Negativo: torácica: inclina para a esquerda. Positivo: torácica: inclina para a direita.
- `toracicaTorcao` (= `thoTwist`): -30 a 30 ° — Torácica: ajuste de giro. Negativo: torácica: gira para a direita. Positivo: torácica: gira para a esquerda.

### Cabeça e pescoço
- `cabecaGirar` (= `headYaw`): -80 a 80 ° — Girar o pescoço (rotação). Negativo: vira o rosto para a DIREITA do manequim. Positivo: vira o rosto para a ESQUERDA do manequim.
- `cabecaInclinar` (= `headPitch`): -60 a 50 ° — Baixar (+) / levantar (−) a cabeça. Negativo: levanta o queixo (olha para cima). Positivo: abaixa a cabeça (olha para baixo).
- `cabecaLado` (= `headRoll`): -45 a 45 ° — Inclinar para o ombro. Negativo: inclina a cabeça para o ombro ESQUERDO. Positivo: inclina a cabeça para o ombro DIREITO.
- `pescocoFrente` (= `neckFlex`): -40 a 40 ° — Pescoço (cervical): estender / flexionar. Negativo: pescoço: estende (olha para cima). Positivo: pescoço: flexiona (queixo para o peito).
- `pescocoLado` (= `neckSide`): -30 a 30 ° — Pescoço (cervical): para o lado. Negativo: pescoço: para a esquerda. Positivo: pescoço: para a direita.
- `pescocoGirar` (= `neckTwist`): -45 a 45 ° — Pescoço (cervical): girar. Negativo: pescoço: gira para a direita. Positivo: pescoço: gira para a esquerda.

### Ombros e escápulas
- `escapulaEsqTensao` (= `shTensL`): -1 a 1 % — Escápula esquerda: soltar − / tensionar + (trapézio). Negativo: solta a escápula. Positivo: tensiona a escápula (trapézio).
- `escapulaDirTensao` (= `shTensR`): -1 a 1 % — Escápula direita: soltar − / tensionar + (trapézio). Negativo: solta a escápula. Positivo: tensiona a escápula (trapézio).
- `escapulaEsqGirar` (= `scapRotL`): -1 a 1 % — Escápula esquerda: girar para baixo − / para cima +. Negativo: gira a escápula para baixo. Positivo: gira a escápula para cima.
- `escapulaDirGirar` (= `scapRotR`): -1 a 1 % — Escápula direita: girar para baixo − / para cima +. Negativo: gira a escápula para baixo. Positivo: gira a escápula para cima.
- `ombroEsqSubir` (= `shElevL`): -1 a 1 % — Ombro esquerdo: abaixar / elevar. Negativo: abaixa o ombro. Positivo: eleva o ombro (encolher).
- `ombroDirSubir` (= `shElevR`): -1 a 1 % — Ombro direito: abaixar / elevar. Negativo: abaixa o ombro. Positivo: eleva o ombro (encolher).
- `ombroEsqAvancar` (= `shProtL`): -1 a 1 % — Ombro esquerdo: para trás / à frente. Negativo: leva o ombro para trás (peito aberto). Positivo: leva o ombro para a frente.
- `ombroDirAvancar` (= `shProtR`): -1 a 1 % — Ombro direito: para trás / à frente. Negativo: leva o ombro para trás (peito aberto). Positivo: leva o ombro para a frente.
- `tensaoOmbros` (= `shTension`): 0 a 1 % — Ombros: relaxados (0) ↔ tensos (1)

### Braços e cotovelos
- `bracoEsqAbrir` (= `armAbdL`): -45 a 180 ° — Braço esquerdo: cruzar / abrir. Negativo: cruza o braço na frente do peito. Positivo: abre o braço para o lado (90 = horizontal, 180 = acima da cabeça).
- `bracoDirAbrir` (= `armAbdR`): -45 a 180 ° — Braço direito: cruzar / abrir. Negativo: cruza o braço na frente do peito. Positivo: abre o braço para o lado (90 = horizontal, 180 = acima da cabeça).
- `bracoEsqFrente` (= `armFlexL`): -60 a 180 ° — Braço esquerdo: trás / frente. Negativo: leva o braço para trás. Positivo: leva o braço para a frente (90 = horizontal à frente, 180 = acima da cabeça pela frente).
- `bracoDirFrente` (= `armFlexR`): -60 a 180 ° — Braço direito: trás / frente. Negativo: leva o braço para trás. Positivo: leva o braço para a frente (90 = horizontal à frente, 180 = acima da cabeça pela frente).
- `bracoEsqGirar` (= `armRotL`): -70 a 90 ° — Braço esquerdo: girar. Negativo: gira o braço para dentro (com o cotovelo dobrado, a mão vai para a barriga). Positivo: gira o braço para fora (com o cotovelo dobrado, a mão vai para fora e para trás).
- `bracoDirGirar` (= `armRotR`): -70 a 90 ° — Braço direito: girar. Negativo: gira o braço para dentro (com o cotovelo dobrado, a mão vai para a barriga). Positivo: gira o braço para fora (com o cotovelo dobrado, a mão vai para fora e para trás).
- `cotoveloEsq` (= `elbowL`): 0 a 150 ° — Cotovelo esquerdo: dobrar. Positivo: dobra o cotovelo (0 = esticado, 90 = ângulo reto, 150 = máximo).
- `cotoveloDir` (= `elbowR`): 0 a 150 ° — Cotovelo direito: dobrar. Positivo: dobra o cotovelo (0 = esticado, 90 = ângulo reto, 150 = máximo).

### Antebraço, punho e mão
- `antebracoEsqGirar` (= `pronL`): -80 a 90 ° — Antebraço esquerdo: virar a palma. Negativo: vira a palma para BAIXO (pronação; com o braço à frente, palma para o chão). Positivo: vira a palma para CIMA (supinação).
- `antebracoDirGirar` (= `pronR`): -80 a 90 ° — Antebraço direito: virar a palma. Negativo: vira a palma para BAIXO (pronação; com o braço à frente, palma para o chão). Positivo: vira a palma para CIMA (supinação).
- `punhoEsq` (= `wristL`): -70 a 80 ° — Punho esquerdo: estender / flexionar. Negativo: estende o punho (dorso da mão vai para o antebraço). Positivo: flexiona o punho (palma vai para o antebraço).
- `punhoDir` (= `wristR`): -70 a 80 ° — Punho direito: estender / flexionar. Negativo: estende o punho (dorso da mão vai para o antebraço). Positivo: flexiona o punho (palma vai para o antebraço).
- `punhoEsqDesvio` (= `wristDevL`): -30 a 20 ° — Punho esquerdo: desvio ulnar (−) / radial (+). Negativo: desvia o punho para o lado do dedo mínimo. Positivo: desvia o punho para o lado do polegar.
- `punhoDirDesvio` (= `wristDevR`): -30 a 20 ° — Punho direito: desvio ulnar (−) / radial (+). Negativo: desvia o punho para o lado do dedo mínimo. Positivo: desvia o punho para o lado do polegar.
- `maoEsq` (= `handCurlL`): 0 a 1 % — Mão esquerda: abrir / fechar. Positivo: fecha a mão (0 = aberta, 1 = punho fechado).
- `maoDir` (= `handCurlR`): 0 a 1 % — Mão direita: abrir / fechar. Positivo: fecha a mão (0 = aberta, 1 = punho fechado).

### Dedos da mão (geral)
- `polegarEsq` (= `fThL`): -1 a 1 % — Mão esquerda: polegar (abrir − / fechar +)
- `indicadorEsq` (= `fInL`): -1 a 1 % — Mão esquerda: indicador (abrir − / fechar +)
- `medioEsq` (= `fMeL`): -1 a 1 % — Mão esquerda: médio (abrir − / fechar +)
- `anelarEsq` (= `fAnL`): -1 a 1 % — Mão esquerda: anelar (abrir − / fechar +)
- `minimoEsq` (= `fMiL`): -1 a 1 % — Mão esquerda: mínimo (abrir − / fechar +)
- `dedosEsqAfastar` (= `fSpreadL`): 0 a 1 % — Mão esquerda: afastar os dedos
- `polegarEsqOpor` (= `thumbOppL`): 0 a 1 % — Mão esquerda: oposição do polegar
- `polegarDir` (= `fThR`): -1 a 1 % — Mão direita: polegar (abrir − / fechar +)
- `indicadorDir` (= `fInR`): -1 a 1 % — Mão direita: indicador (abrir − / fechar +)
- `medioDir` (= `fMeR`): -1 a 1 % — Mão direita: médio (abrir − / fechar +)
- `anelarDir` (= `fAnR`): -1 a 1 % — Mão direita: anelar (abrir − / fechar +)
- `minimoDir` (= `fMiR`): -1 a 1 % — Mão direita: mínimo (abrir − / fechar +)
- `dedosDirAfastar` (= `fSpreadR`): 0 a 1 % — Mão direita: afastar os dedos
- `polegarDirOpor` (= `thumbOppR`): 0 a 1 % — Mão direita: oposição do polegar

### Pernas e joelhos
- `coxaEsqFrente` (= `hipFlexL`): -30 a 125 ° — Coxa esquerda: trás / frente. Negativo: leva a coxa para trás. Positivo: leva a coxa para a frente (90 = horizontal).
- `coxaDirFrente` (= `hipFlexR`): -30 a 125 ° — Coxa direita: trás / frente. Negativo: leva a coxa para trás. Positivo: leva a coxa para a frente (90 = horizontal).
- `coxaEsqAbrir` (= `hipAbdL`): -30 a 45 ° — Coxa esquerda: fechar / abrir. Negativo: cruza a coxa para dentro. Positivo: abre a coxa para o lado.
- `coxaDirAbrir` (= `hipAbdR`): -30 a 45 ° — Coxa direita: fechar / abrir. Negativo: cruza a coxa para dentro. Positivo: abre a coxa para o lado.
- `coxaEsqGirar` (= `hipRotL`): -45 a 45 ° — Coxa esquerda: girar. Negativo: gira a coxa para dentro (joelho para dentro). Positivo: gira a coxa para fora (joelho para fora; sentado com joelhos dobrados, cruza as pernas).
- `coxaDirGirar` (= `hipRotR`): -45 a 45 ° — Coxa direita: girar. Negativo: gira a coxa para dentro (joelho para dentro). Positivo: gira a coxa para fora (joelho para fora; sentado com joelhos dobrados, cruza as pernas).
- `joelhoEsq` (= `kneeFlexL`): 0 a 150 ° — Joelho esquerdo: dobrar. Positivo: dobra o joelho (0 = esticado, 90 = ângulo reto, 150 = máximo).
- `joelhoDir` (= `kneeFlexR`): 0 a 150 ° — Joelho direito: dobrar. Positivo: dobra o joelho (0 = esticado, 90 = ângulo reto, 150 = máximo).
- `canelaEsqGirar` (= `tibiaRotL`): -30 a 40 ° — Perna esquerda: girar a canela (só com o joelho dobrado). Negativo: gira a canela para dentro. Positivo: gira a canela para fora.
- `canelaDirGirar` (= `tibiaRotR`): -30 a 40 ° — Perna direita: girar a canela (só com o joelho dobrado). Negativo: gira a canela para dentro. Positivo: gira a canela para fora.

### Tornozelos e pés
- `tornozeloEsq` (= `ankleFlexL`): -20 a 50 ° — Tornozelo esquerdo: levantar ponta / apontar. Negativo: levanta a ponta do pé. Positivo: aponta o pé (ponta para baixo, como na ponta dos pés).
- `tornozeloDir` (= `ankleFlexR`): -20 a 50 ° — Tornozelo direito: levantar ponta / apontar. Negativo: levanta a ponta do pé. Positivo: aponta o pé (ponta para baixo, como na ponta dos pés).
- `peEsqVirar` (= `ankleTiltL`): -15 a 35 ° — Pé esquerdo: virar sola para fora / dentro. Negativo: vira a sola para fora. Positivo: vira a sola para dentro.
- `peDirVirar` (= `ankleTiltR`): -15 a 35 ° — Pé direito: virar sola para fora / dentro. Negativo: vira a sola para fora. Positivo: vira a sola para dentro.
- `dedosPeEsq` (= `toesL`): -70 a 40 ° — Dedos do pé esquerdo: levantar / dobrar. Negativo: levanta os dedos do pé (apoio na bola do pé). Positivo: dobra os dedos do pé.
- `dedosPeDir` (= `toesR`): -70 a 40 ° — Dedos do pé direito: levantar / dobrar. Negativo: levanta os dedos do pé (apoio na bola do pé). Positivo: dobra os dedos do pé.
- `dedaoEsq` (= `halluxL`): -50 a 40 ° — Dedão do pé esquerdo (além dos outros): levantar − / dobrar +. Negativo: levanta o dedão do pé. Positivo: dobra o dedão do pé.
- `dedaoDir` (= `halluxR`): -50 a 40 ° — Dedão do pé direito (além dos outros): levantar − / dobrar +. Negativo: levanta o dedão do pé. Positivo: dobra o dedão do pé.
- `peEsqAduzir` (= `footAddL`): -20 a 25 ° — Pé esquerdo: ponta para fora − / para dentro +. Negativo: ponta do pé para fora. Positivo: ponta do pé para dentro.
- `peDirAduzir` (= `footAddR`): -20 a 25 ° — Pé direito: ponta para fora − / para dentro +. Negativo: ponta do pé para fora. Positivo: ponta do pé para dentro.

### Dedos (cada falange)
Cada dedo tem base (Mcp), meio/ponta (Ip) e afastar (Abd), de −1 a 1 (positivo dobra/afasta): `fInMcpL`, `fInIpL`, `fInAbdL` … para polegar (Th), indicador (In), médio (Me), anelar (An), mínimo (Mi), lados L e R. Prefira os gestos prontos.

### Posição e giro do manequim
- `m.posicao(x, z)`, `m.mover(dx, dz)`, `m.girar(graus)` (ou chaves `wx`, `wz`, `wRot`).

## 4. Mãos: gestos prontos
`m.gesto(lado, nome)` com nome: `aberta`, `relaxada`, `espalmada`, `punho`, `apontar`, `pinca`, `segurar`, `ok`, `joinha`, `paz`, `garra`, `acenar`, `chifres`, `telefone`, `gancho`, `mesa`, `vulcano`, `figa`, `cruzados`.
- Palma para baixo com o braço à frente: `antebraco…Girar: -80`. Palma para cima: `+80`. Polegar para cima (soco vertical): `0`.
- Palma para a frente, dedos para cima (empurrar, golpe de palma): `antebraco…Girar: -80` e `punho…: -70` (estender o punho), gesto `espalmada`.
- Punho fechado: gesto `punho` (ou `maoEsq: 1`). Mão relaxada: `relaxada`. Garra (energia): `garra`.

## 5. Biblioteca de poses prontas
Use `m.poseRapida("nome", {lado})`. Cada pose escreve o corpo inteiro a partir do neutro; depois ajuste com `m.pose`. Sem `lado`, vale "esq".
As poses simples `empe`, `contrapposto`, `caminhando`, `frente`, `torcao`, `passo`, `joelho`, `ponta`, `erguido`, `alcancar`, `lateral`, `agachar`, `cintura`, `cruzar`, `ombro` não usam `lado`: para trocar os lados use `m.espelhar()` depois.

- **Em pé e gestos**: `empe` (neutra, braços ao lado), `contrapposto` (peso numa perna, quadril e ombros em oposição), `caminhando` (passo de caminhada), `frente` (tronco inclinado à frente), `torcao` (tronco girado), `passo` (passo largo), `joelho` (joelho elevado), `ponta` (na ponta dos pés), `erguido` (um braço erguido), `alcancar` (braço esticado alcançando à frente), `lateral` (tronco inclinado para o lado, braço por cima), `cintura` (mão na cintura (cinemática inversa)), `cruzar` (braço cruzado no peito), `ombro` (mão no ombro oposto), `apontando` (apontando com o indicador; lado = o braço OUTRO aponta (lado = lado oposto ao que aponta)), `acenando` (acenando; lado = o braço OUTRO acena), `carregando` (carregando algo com as duas mãos), `empurrando` (empurrando com as duas palmas), `pensando` (mão no queixo; lado = o braço de apoio; a mão no queixo é a do outro lado), `encostado` (encostado numa parede, uma perna dobrada), `alongando` (braços esticados para cima), `vitoria` (punho erguido comemorando; lado = o braço que sobe).
- **Sentado, ajoelhado e no chão**: `agachar` (agachado), `sentado` (sentado (numa cadeira imaginária)), `sentadoChao` (sentado de pernas cruzadas), `pernasEsticadas` (sentado no chão com pernas esticadas e mãos atrás), `abracandoJoelhos` (sentado abraçando os joelhos), `deitadoCostas` (deitado de costas), `deitadoLado` (deitado de lado), `deBrucos` (de bruços), `apoiadoCotovelos` (de bruços apoiado nos cotovelos), `ajoelhado` (dois joelhos no chão), `sentadoCalcanhares` (ajoelhado sentado nos calcanhares), `umJoelho` (um joelho no chão; lado = o pé da frente (o outro joelho vai ao chão)), `cocoras` (de cócoras), `engatinhando` (de quatro engatinhando), `meditando` (pernas cruzadas, mãos nos joelhos), `agachamentoProfundo` (agachamento profundo), `prancha` (prancha (mãos e pés no chão)), `quatroApoios` (mãos e joelhos no chão).
- **Movimento**: `correndo` (corrida; lado = a perna que vai à frente), `impulso` (agachado tomando impulso para saltar), `saltando` (no ar, braços para cima), `aterrissando` (aterrissando com joelhos dobrados), `caindo` (caindo para trás), `saltoLongo` (salto com pernas e braços à frente), `saltoSobreCaixa` (apoio de uma mão, pernas de lado (vault); lado = a mão que apoia), `subindoDegrau` (pé alto num degrau; lado = o pé que sobe), `desviando` (passo lateral protegendo a cabeça; lado = o lado para onde dá o passo), `escalando` (uma mão no alto, um joelho para cima; lado = a perna que sobe; a mão no alto é a do outro lado).
- **Luta**: `guardaLuta` (guarda de boxe, punhos no queixo; lado = o pé e o braço da FRENTE (lado: "esq" = guarda com o pé esquerdo à frente)), `jab` (soco rápido do braço da frente; lado = o braço que soca e o pé da frente (os dois do mesmo lado)), `direto` (soco cruzado do braço de trás, girando o quadril; lado = o pé da frente; o soco sai com o braço do OUTRO lado (o de trás)), `gancho` (gancho do braço da frente (antebraço na horizontal); lado = o braço que dá o gancho e o pé da frente), `uppercut` (soco de baixo para cima; lado = o pé da frente; o uppercut sai com o braço de trás), `socando` (soco direto do braço de trás (palma para baixo); lado = o braço de guarda; o soco sai com o braço do OUTRO lado), `socoParaCima` (salto com o punho para o céu; lado = a perna dobrada; o punho que sobe é o do outro lado), `cotovelada` (golpe de cotovelo na horizontal; lado = o pé da frente; a cotovelada sai com o braço de trás), `joelhada` (joelho para cima, mãos puxando; lado = o joelho que sobe), `chutando` (chute frontal alto; lado = a perna que chuta), `chuteLateral` (chute de lado com o tronco tombado para o outro lado; lado = a perna que chuta), `chuteAlto` (chute circular alto; lado = a perna que chuta), `chuteGiratorio` (chute para trás com o corpo inclinado à frente; lado = a perna que chuta), `chuteVoador` (voadora no ar; lado = a perna esticada), `rasteira` (agachado baixo varrendo com a perna esticada; lado = a perna que varre (esticada)), `palma` (golpe de palma do braço de trás; lado = o pé da frente; a palma sai com o braço de trás), `palmaDupla` (as duas palmas à frente (rajada / kamehameha); lado = a perna da frente), `defesaCruzada` (antebraços cruzados na frente do rosto), `aterrissagemHeroi` (um joelho no chão, punho no chão, outro braço para trás; lado = o pé plantado à frente; o punho no chão é o do outro lado), `investida` (corrida inclinada com os braços para trás; lado = a perna da frente), `esquiva` (tronco arqueado para trás desviando; lado = "esq" inclina o tronco para a direita dele ("dir" para a esquerda)), `provocando` (chamando para a luta com a mão; lado = a mão que chama e o pé da frente).
- **Reação a golpe e queda**: `golpeRosto` (cabeça jogada para trás pelo soco), `golpeEstomago` (dobrado de dor), `recuando` (dando um passo para trás com as mãos à frente), `atordoado` (joelhos moles, cabeça tombada), `arremessadoCostas` (voando de costas depois do golpe), `atravessandoParede` (voando para trás encolhido), `girandoNoAr` (corpo de cabeça para baixo girando), `deCabecaParaBaixo` (caindo de cabeça), `caindoDeCostas` (no instante de bater as costas), `rolando` (encolhido em bola de lado), `deslizandoSentado` (sentado deslizando, mãos atrás), `estatelado` (deitado de costas, braços e pernas abertos), `levantandoDeQuatro` (levantando, um joelho e uma mão no chão; lado = o pé plantado; a mão no chão é a do outro lado), `ajoelhadoFerido` (ajoelhado, uma mão no chão e outra no peito; lado = a mão no peito; a outra vai ao chão).
- **Carga de energia / poder**: `concentrando` (punhos perto do peito, cabeça baixa), `baseGritando` (base larga (cavalo), punhos ao lado, cabeça para trás), `agachadoCerrando` (agachado tenso, punhos à frente), `bracosCruzadosPeito` (braços cruzados em X no peito), `maosEmPrece` (palmas juntas no peito), `esferaDeLado` (mãos em concha no quadril de trás (carregando a rajada); lado = o pé da frente; a energia fica no quadril do outro lado), `palmaDupla` (as duas palmas à frente (rajada / kamehameha); lado = a perna da frente), `bracoAosCeus` (um punho para o céu; lado = o braço que sobe), `cargaDuasMaos` (as duas mãos acima da cabeça (esfera gigante)), `bracosAbertosLevitando` (flutuando com os braços abertos e palmas para cima), `lotusFlutuando` (pernas cruzadas flutuando), `joelhoMaoNoChao` (um joelho e uma mão no chão, cabeça baixa; lado = o pé plantado; a mão no chão é a do outro lado).
- **Ginástica e flexibilidade**: `paradaDeMao` (parada de mão), `ponte` (ponte), `ponteUmaPerna` (ponte com uma perna no alto), `paradaAbertura` (parada de mão com as pernas abertas), `escorpiao` (escorpião), `arabesque` (arabesque de balé), `espacateSaltado` (salto em espacate), `camelo` (camelo (ajoelhado, arco para trás)).

## 6. Receitas (valores que funcionam)
Valores para o lado esquerdo; troque Esq↔Dir para o outro lado. Comece da pose indicada e ajuste.
- **Em pé natural**: `contrapposto`. Peso numa perna: `pelveLado: 7, colunaLado: -9, coxaDirFrente: 12`.
- **Andar**: `caminhando`. A perna da frente: `coxaEsqFrente: 24, joelhoEsq: 6`; a de trás: `coxaDirFrente: -14, joelhoDir: 28`; braços em oposição: `bracoEsqFrente: -22, bracoDirFrente: 25`.
- **Correr**: `correndo` (coxa da frente 60, joelho 95; coxa de trás −25; cotovelos 90; tronco 12 à frente). Mais rápido: `corpoInclinar: 20`.
- **Guarda de luta**: `guardaLuta` (pé esquerdo à frente, punhos já fechados). Mão de guarda perto do queixo: `bracoFrente: 42, bracoAbrir: 14, cotovelo: 135` (a da frente: `Frente: 62, cotovelo: 105`). Soco reto: braço `Frente: 88–90, cotovelo: 0–5, antebraco…Girar: -80` (palma para baixo).
- **Girar o tronco para dentro do soco**: `colunaTorcao` positivo = o ombro DIREITO vai para a frente (use com soco de direita, ≈ +25); negativo = o ombro ESQUERDO vai para a frente (soco de esquerda, ≈ −20). Some `pelveTorcao` no mesmo sentido (±10).
- **Gancho**: `bracoEsqAbrir: 82, bracoEsqFrente: 22, cotoveloEsq: 95, bracoEsqGirar: 0`. **Uppercut**: braço `Frente: 60, cotovelo: 100, antebraco…Girar: +70` (palma para o rosto), joelhos 38.
- **Chute frontal**: `chutando` (coxa 88, joelho 8, tornozelo 35 = pé apontado).
- **Chute lateral** (`chuteLateral`): perna ESQUERDA: `corpoRolar: +36, coxaEsqAbrir: 45, joelhoEsq: 2, coxaDirAbrir: +30` (abrir a perna de apoio a deixa na vertical). Perna DIREITA: `poseRapida("chuteLateral", {lado: "dir"})` = `corpoRolar: -36, coxaDirAbrir: 45, coxaEsqAbrir: +30`. Mais alto: aumente `corpoRolar` (até ±50) junto com a abertura da perna de apoio. Altura do pé ≈ altura do quadril com ±36; peito do adversário ≈ ±45.
- **Chute circular alto** (`chuteAlto`): `corpoRolar ±28, coxaFrente 82, coxaAbrir 45, coxaGirar -25` e a de apoio `Abrir +26`.
- **Mirar um alvo**: o chute/soco sai para o lado/frente do próprio manequim. Gire o manequim (`m.girar`) até o lado certo apontar para o alvo: para atingir quem está em +x com um chute lateral de DIREITA, a direita dele precisa apontar para +x → `m.girar(180)` (ele fica de costas para a câmera inicial). Então reposicione a câmera: `camera.orbitar("Ana", {azimute: "3/4 direita", elevacao: 10})`. Ou use a outra perna.
- **Saltar / voar**: `altura` (bodyLift) 3–7. No ar o apoio no chão continua ligado: a altura é medida a partir do chão.
- **Deitar**: `corpoInclinar: -90` (de costas) ou `90` (de bruços); de lado: `corpoRolar: ±90`. Cabeça para baixo: `corpoInclinar: 160–180`.
- **Sentar no chão**: `sentadoChao` (pernas cruzadas: coxas `Frente 84, Abrir 42, Girar +38`, joelhos 145). Numa cadeira: `m.sentar("cadeira")`.
- **Ajoelhar**: `ajoelhado` (dois joelhos) ou `umJoelho`. **Agachar**: `agachar` ou `agachamentoProfundo`.
- **Inclinar o tronco**: `colunaFrente` (+ à frente); muito: some `corpoInclinar` (o corpo todo gira na base).
- **Olhar**: `cabecaGirar` (+ para a esquerda dele), `cabecaInclinar` (+ para baixo), `cabecaLado` (+ ombro direito). Ou `m.olhar("câmera")`.
- **Mão no quadril**: `m.poseRapida("cintura")` ou `m.maoEm("esq", ponto)`. **Mão no queixo**: `pensando`. **Braços cruzados**: `cruzar` / `bracosCruzadosPeito`.
- **Levando golpe**: `golpeRosto` (cabeça e tronco jogados para trás, braços abertos: `cabecaInclinar: -45, pescocoFrente: -25, colunaFrente: -24`), `golpeEstomago` (`colunaFrente: 62`), `esquiva` (arqueado para trás de propósito, joelhos dobrados), voando para trás: `arremessadoCostas` (`corpoInclinar: -62, altura: 5`).
- **Sentado apoiado nas mãos atrás**: `pernasEsticadas` + `corpoInclinar: -25`, braços `Frente: -48, Abrir: 24, cotovelo: 8`, `punho: -70`, gesto `espalmada` (ou `deslizandoSentado`).
- **Carregando energia**: `baseGritando` (base larga: coxas `Abrir 45, Frente 50, Girar -25`, joelhos 72, punhos, cabeça para trás), `concentrando`, `esferaDeLado`, `cargaDuasMaos`, `lotusFlutuando`. Junte efeitos: aura_explosiva, pedras_levitando, ondas_chao (seção 9).
- **Linha de ação forte**: exagere a curva do tronco (`colunaFrente`/`colunaLado`) e a torção (`colunaTorcao` + `pelveTorcao` em sentidos opostos), afaste os pés, incline o corpo (`corpoInclinar`).

## 7. Limites, flexibilidade e contatos
- Cada controle tem o limite humano (seção 3). Valores fora são cortados e o comando avisa. Alguns limites dependem de outros (limites acoplados): ex. a coxa sobe menos com o joelho esticado. O app corrige sozinho e mostra o aviso.
- Para espacate, ponte, escorpião: `m.flexibilidade(2)` antes da pose.
- Colisão entre partes: `m.validarPose()` lista o que atravessa. Entre manequins: `cena.resolverColisoes()`.

## 8. Rosto e expressões
- Expressões prontas: `neutra`, `alegria`, `riso`, `surpresa`, `raiva`, `tristeza`, `choro`, `medo`, `grito`, `vergonha`, `sono`, `desconfianca`, `piscando`, `nojo`, `desprezo`, `determinacao`, `malicia`, `confusao`, `choque`, `tedio`, `dor`, `cansaco`, `admiracao`, `culpa`, `orgulho`, `pensativo`, `alivio`. Intensidade 0–1,5. Mistura (qualquer nome desta lista): `m.expressao("60% raiva + 40% medo")` ou `m.expressao({raiva: 0.6, medo: 0.4})`.
- Sem nome pronto? Combine: esforço = `"70% determinacao + 30% dor"` ou `raiva` com `bocaAbrir: 0.3`; grito de guerra = `grito`; susto = `choque`; cansado = `cansaco`.
- Controles do rosto (em `m.pose` ou `m.rosto`):
- `bocaAbrir` (= `jawOpen`): 0 a 1 % — Mandíbula: abrir a boca
- `mandibulaLado` (= `jawSide`): -1 a 1 % — Mandíbula: desviar para o lado
- `sorriso` (= `smile`): -1 a 1 % — Boca: cantos para baixo − / sorriso +
- `olharLado` (= `eyeYaw`): -1 a 1 % — Olhar: para a direita − / para a esquerda + (do manequim)
- `olharCima` (= `eyePitch`): -1 a 1 % — Olhar: para baixo − / para cima +
- `palpebras` (= `eyeLid`): 0 a 1 % — Pálpebras: abertas → fechadas
- `sobrancelhas` (= `browUp`): -1 a 1 % — Sobrancelhas: baixar − / levantar +
- `franzir` (= `browIn`): -1 a 1 % — Sobrancelhas: aflição − / franzir +
- `corar` (= `blush`): 0 a 1 % — Rosto corado (vergonha)
- `lagrimas` (= `tears`): 0 a 1 % — Lágrimas (choro)
- `olheiras` (= `eyeBags`): 0 a 1 % — Olheiras e bolsa sob os olhos (cansaço)
- Por lado (`m.rosto({...})`): `browInnerL`, `browInnerR`, `browOuterL`, `browOuterR`, `lidUpL`, `lidUpR`, `lidLoL`, `lidLoR`, `cheekL`, `cheekR`, `noseWrinkle`, `upperLipL`, `upperLipR`, `mouthCornerL`, `mouthCornerR`, `lipPress`, `pout`, `teethClench`.

## 9. Efeitos especiais (opcional)
Padrão em preto e branco (nanquim de mangá); `colorido: true` liga a cor. `nivel` 1–5. Presos a uma parte: `m.efeito("impacto_contato", { em: "peDir" })`; no chão: `cena.efeito("cratera", { em: { modo: "chao", x: 0, z: 0 } })`; na tela: `cena.efeito("concentracao")`; de outro manequim: `em: "Leo.peito"`. Direção: `para: "Leo"`.
- Partes para `em`: `corpo`, `centro`, `cabeca`, `topoCabeca`, `rosto`, `olhos`, `olhoEsq`, `olhoDir`, `pescoco`, `peito`, `cintura`, `pelve`, `pes`, `ombroEsq`, `ombroDir`, `cotoveloEsq`, `cotoveloDir`, `punhoEsq`, `punhoDir`, `maoEsq`, `maoDir`, `quadrilEsq`, `quadrilDir`, `joelhoEsq`, `joelhoDir`, `tornozeloEsq`, `tornozeloDir`, `peEsq`, `peDir`, `maos`.
- Tela (plano do quadro): `concentracao`, `velocidade`, `impacto_tela`, `flash`, `sombra_dramatica`, `onomatopeia`, `reticula`.
- Cena (no mundo, com perspectiva): `feixe`, `cone`, `espiral`, `tornado`, `explosao`, `barreira`, `circulo_magico`, `pilar`, `meteoro`, `chuva_meteoros`, `raio`, `onda_choque`, `cristais_chao`, `fogo_chao`, `fumaca`, `chama`.
- No personagem (golpe): `arco_movimento`, `rastro_membro`, `pos_imagem`, `energia_mao`, `velocidade_corpo`, `impacto_contato`, `emote`, `aneis_impacto`, `salpicos`, `aneis_orbitais`.
- Carga de energia / poder: `aura`, `aura_explosiva`, `aura_vento`, `esfera_energia`, `fios_energia`, `pedras_levitando`, `ondas_chao`, `carga_maos`, `redemoinho`.
- Destruição e queda: `cratera`, `rachaduras`, `destrocos`, `poeira`, `parede_quebrada`, `buraco_chao`, `objeto_quebrando`, `rastro_fumaca`, `sulco_poeira`.

## 10. Como ler o ESTADO e corrigir
- `geral`: em pé, deitado, no ar; inclinação do tronco (graus da vertical, para frente/trás e para o lado); `apoiadoEm` = o que toca o chão.
- `bracoEsquerdo/bracoDireito`: altura da mão (acima da cabeça, ombro, cintura…), se cruzou para o outro lado, direção do braço e do antebraço, **para onde a palma está virada**, dedos, cotovelo, mão aberta/fechada.
- `pernaEsquerda/pernaDireita`: pé no chão ou levantado, posição do pé, direção da coxa e da canela, joelho, ponta do pé.
- `controles`: cada controle fora do neutro, com o valor, a faixa e o que ele está fazendo.
- `naImagem`: onde cabeça, mãos, cotovelos, joelhos e pés aparecem na foto (0–1). Use para conferir a imagem com o estado.
- `codigo`: o código que recria a pose atual. Para corrigir, mude só os números necessários.
- **Erros comuns**: trocar esquerda/direita (lado do manequim ≠ lado da imagem); palma do soco para cima (use antebraço −80); tombar o corpo no chute sem abrir a perna de apoio; somar valores (são absolutos); esquecer `altura` em saltos; pedir mais que o limite (veja a faixa).

## 11. Exemplo de resposta
Pedido: “Ana dá um soco de direita em Leo, que se dobra de dor.”
```js
const ana = cena.obter("Ana"), leo = cena.obter("Leo");
ana.poseRapida("direto").expressao("raiva");
leo.poseRapida("golpeEstomago").expressao("dor");
ana.efeito("impacto_contato", { em: "maoDir", nivel: 4 });
cena.efeito("onomatopeia", { texto: "ドッ" });
```

## Apêndice: referência completa de comandos do app
```text
REFERÊNCIA
  cena.adicionar({nome, x, z, giro, corpo, pose, cor, contorno})  → novo manequim
  cena.copiar(m?) · cena.remover(m | "nome") · cena.limpar() · cena.lista()
  cena.obter(0 | "nome") · cena.ativo · cena.total · cena.enquadrar()
  
  m.posicao(x, z) · m.mover(dx, dz) · m.girar(graus) · m.renomear("nome")
  m.pose({joelhoEsq: 60, ...}) · m.poseRapida("caminhando") · m.corpo("musculoso" | {musculo: 0.8})
  m.cor("#preenchimento", "#contorno") · m.cor() = automática · m.copiar() · m.remover() · m.info()
  
  NOVO: camera.costas("Ana",{referencia:"tronco",area:"cabeca",elevacao:0}) — vista das costas do tronco
  camera.costas("Ana",{referencia:"cabeca",area:"cabeca"}) — nuca orientada pela cabeça, não pela presença de olhos
  camera.ver("Ana",{lado:"3/4 esquerda",referencia:"cabeca",vertical:"anatomico"})
  camera.seguir("Ana",{lado:"costas",referencia:"tronco"}) · camera.pararSeguir() · camera.seguimento()
  camera.orientacaoDoAlvo("Ana","cabeca") · camera.alvos() · camera.areas("Ana") · camera.vista()
  Objetos: cena.obterObjeto("cubo").orientacao({frenteLocal:[0,0,1],cimaLocal:[0,1,0]})
  Estilo: cena.estilos() · cena.estilo("lapis") · cena.estiloAtual()
  Camadas: cena.camadasVisuais() · cena.camadaVisual("grid",false) · cena.camadaVisual("eyes",true)
  Arquivos: cena.exportarSVG() · cena.exportarOBJ({modelo:"v4"}) · cena.exportarJSON() · cena.importarJSON(json)
  IA sem MCP (Gemini, ChatGPT, Claude): cena.manualIA() — manual completo de poses · cena.estadoIA() — como cada parte do corpo está (texto; {json:true} = objeto)
    cena.pacoteIA("o que eu quero") — manual + estado + pedido para colar na IA · m.estadoIA() — só este manequim · painel “Usar com uma IA” embaixo do editor
  Efeitos: padrão em preto e branco; {colorido: true} liga a cor · {nivel: 1..5} força · cena.efeitos.colorir(false) · cena.efeitos.tamanho(id) → alturas do corpo
    onomatopeia em katakana: cena.efeito("onomatopeia", {texto: "ドッ"}) · chão (cratera, círculo, rachaduras) fica abaixo dos manequins
  Exportação navegador: await cena.exportarPNG({escala:2}); await cena.baixar("cena.png",png,"image/png")
  Parâmetros: m.parametro("headYaw",45) · m.parametros() · camera.parametro("lens",85) · camera.parametros()
  Câmera sem alterar a ativa: camera.capturar("Ana",{lado:"costas"}) · camera.capturarVistas("Ana")
  Grupo: camera.ver(["Ana","Bruno"],{lider:"Ana",lado:"costas"}) (sem orientação média inventada)
  Seção da pega: obj.medidasDaBase() · obj.mostrarBase("guia") · obj.mostrarBase("modelo")
  Modelos na mão: cena.objetoNaMao("cadeira",{mao:"direita"}) · modelos mesa, bastao, cajado, espada, circular e retangular
  Roupa e cabelo: cena.referencia("paleto",{cor:"#354962"}) · cena.referencia("longo",{raizes:[{angulo:90,altura:.8,comprimento:2}]})
  Efeitos especiais: cena.efeito("explosao", {em: {chao: true, x: 4, z: 0}, elemento: "fogo", raio: 5}) · efeito(...) direto no editor e nos quadros
    m.efeito("aura", {elemento: "vazio"}) · m.efeito("feixe", {em: "maoDir", para: "Leo", elemento: "raio"}) · cena.efeito("concentracao") (centra no personagem)
    em: parte do manequim ("maoDir", "Ana.punhoEsq", "olhos", "pes"…) · {chao: true, x, z} · {x, y, z} (y = altura) · {objeto: "parede"} · {modo: "tela", x, y}
    para: (sem nada = pela pose) · "Leo" · {alvo: "auto"} (o mais perto) · [x, y, z] · graus na tela · "camera"
    opções: elemento (fogo, gelo, raio, vento, vazio, sagrado, prisma, cristal, terra, sombra, tinta) · cores · escala · intensidade · progresso 0–1 · reverso · camada (auto, atras, frente, fundo) · semente · inicio/duracao
    cena.efeitos.lista() · .editar(id, {...}) · .remover(id) · .duplicar(id) · .catalogo() · .salvarModelo(id, "nome") · .usarModelo("nome", {em: "maoEsq"}) · .converterAntigos()
    personalizado: cena.efeito("personalizado", {svg: "<circle r='30' fill='#f60'/>"}) · no app também {codigo: "return fx.forma(fx.circulo(fx.x, fx.y, 20), fx.cores[1])"}
  Efeitos antigos (PR #20): cena.referencia("impacto",{inicio:8,duracao:12}) · cena.amostrarRastro(indice,{mao:"direita"})
  Vento por quadro: cena.ventoChave(24,{x:1,z:0,rajada:.4}) · cena.ventoChave(48,{x:-1,z:0})
  Vento e tempo: cena.vento({x:1,z:0,rajada:.4}) · cena.quadroSimulado(12)
  Camadas de referência: cena.referencias() · cena.referencia("paleto",{indice:0,ativo:false}) · cena.removerReferencia(0)
  Preensão V3: m.segurar("Cadeira",{mao:"direita",ponto:"encostoTopo",reach:5}) — mão move cadeira em 3D
  m.maoEmSite("Cadeira","encostoTopo",{mao:"direita"}) — aproximar usando IK
  m.soltar("Cadeira",{modo:"manter"}) — deixar onde está, sem simular gravidade
  cena.vinculos() · cena.inspecionarPreensao() · obj.pontosDeAgarre() · obj.emPosseDe()
  Objetos: pontos 'encostoTopo', 'encostoEsquerdo', 'encostoDireito', 'assentoFrente'
  Compatibilidade: cena.segurarObjeto("Copo",{motor:"v2",mao:"direita"}) ativa a preensão antiga
  Duas mãos: segunda:true adiciona âncora auxiliar; solver bilateral exato continua pendente
  Arquivo ZIP: const zip=cena.exportarZIP(); await cena.baixar("camadas.zip",zip,"application/zip")
  Folha V4.2: cena.estudoAnatomico.svg() · cena.estudoAnatomico.abrir() · .atualizar() · .fechar()
  Descoberta: cena.comandos() · cena.capacidades() · cena.parametros()
  Histórico: cena.marcarEstado() · cena.desfazer() · cena.refazer() · cena.historico()
  Observação: o executor aceita await, mas não é um sandbox de segurança; execute scripts confiáveis.
  camera.posicao(x, y, z) · camera.mirar(x, y, z) · camera.girar(yaw, pitch, roll)
  camera.zoom(z) · camera.perspectiva(true, distância) · camera.distancia(R) · camera.luz(azimute, elevação) · camera.enquadrar()
  camera.lente(mm) — 18–35 grande-angular, 50 normal, 85–200 tele · camera.alturaOlhos(R acima do chão, inclinação?) — manequim ≈ 16 R
  cena.horizonte(true) · cena.sombras(true) · cena.atmosfera(0..1)
  cena.modo("ecorche" | "manequim" | "construcao") · cena.fibras(true)   — écorché: músculos com linhas de borda e tons planos
  Perspectiva: quem está longe fica menor, mais alto na tela (perto do horizonte), com traço mais fino e cor mais clara.
  Camadas (cada manequim é uma foto .svg na câmera da cena; só a que muda é refeita):
  m.congelar() · m.descongelar() · m.ocultar() · m.mostrar() · m.frente() · m.tras() · m.ordemAuto() · m.foto() → SVG só dele
  cena.camadas() → ordem e estado · cena.exportarCamadas() → SVG com uma camada por manequim · cena.exato(true) = todos juntos (mais lento)
  Colisões (um manequim atravessando outro):
  cena.colisoes() → lista · cena.resolverColisoes({preferir: "auto" | "distancia" | "giro" | "pose"}) · cena.desfazerColisao()
  cena.colisao("avisar" | "corrigir" | "bloquear" | "desligado", "auto" | "distancia" | "giro" | "pose")
  m.resolverColisoes("pose") — só este muda · m.permitirContato(outro, true) — abraço, aperto de mão
  cena.composicao(true) → avisa tangências e cabeças escondidas (só na tela) · cena.ajustarComposicao(0)
  Esqueleto e articulações (limites do corpo humano; acima do limite, ajusta e avisa):
  m.articulacao("cotovelo esquerdo", {dobrar: 90}) — nomes: ombro, cotovelo, punho, mao, quadril, joelho, tornozelo (+ esquerdo/direito),
    coluna, lombar, toracica, pescoco, cabeca, pelve, corpo; movimentos: dobrar, frente, abrir, girar, lado, inclinar, desvio, apontar, virar, subir
  m.gesto("direita" | "esquerda" | "ambas", "punho" | "apontar" | "pinca" | "joinha" | "paz" | "ok" | "garra" | "acenar" | …)
  m.dedos("esquerda", {polegar, indicador, medio, anelar, minimo, mao, afastar, opor}) · m.espelhar() · m.copiarPose(outro)
  pose({cotoveloDir: 70, bracoDirAbrir: 80}) · pose("Aceno", {...}) · pose("Aceno") — vale para o manequim ativo; é o mesmo texto do painel "Código da pose"
  m.codigoPose({partes: "bracoDir", soMudancas: true}) → texto · m.aplicarPose(texto | "nome salvo", {partes, espelhar}) · m.salvarPose("Aceno", {partes})
  cena.poses.lista() · .salvar(nome, {manequim, partes}) · .aplicar(nome, {manequim, partes, espelhar}) · .codigo(nome) · .exportar() · .importar(texto) · .renomear(n, novo) · .apagar(n) · .duplicar(n)
    partes: corpo, tronco, cabeca, rosto, bracoEsq, bracoDir, maoEsq, maoDir, pernaEsq, pernaDir (ou bracos, maos, pernas, esquerda, direita)
  m.flexibilidade("normal" | "atleta" | "ginasta" | "contorcionista") — amplia os limites (ponte, espacate, arabesque pedem "ginasta")
  m.apoiar("maos pes" | "maos" | "maos joelhos" | "mao esquerda pe direito") — vários pontos no chão ao mesmo tempo (ponte, parada de mão, prancha)
  Poses de ginasta: ponte, ponteUmaPerna, paradaAbertura, escorpiao, arabesque, espacateSaltado, camelo, agachamentoProfundo, prancha, quatroApoios
  Blocking (painel ao lado do palco): vista de cima (X/Z) e lateral sincronizadas com a cena — + Manequim / + Objeto (clique para colocar), arraste, gire, mude o tamanho
  cena.blocking() — posições em metros (manequins e objetos), profundidade, % da foto, cores e colisões · camera.posicaoMundo() · camera.colocar(x, y, z) (mantém o alvo)
  cena.blocking.abrir() · .fechar() · .recolher() · .destacar("painel" | "cima" | "lateral") · .flutuar() · .devolver() · .lateral("camera" | "frente" | "direita" | graus) · .inserir("mesa") · .estado()
  cena.selecionar("Ana" | 0 | "mesa") — o mesmo que clicar na lista do painel
  Zoom óptico (a câmera fica parada): camera.zoomLente(85) · camera.zoomLente("2x") · camera.campo(60) (graus) · camera.lenteInfo() — no painel: −/+, roda sobre o cone, teclas + e −; no palco: Alt + roda
  camera.lente(mm) muda a lente e afasta/aproxima para manter o tamanho; camera.lente(mm, false) = zoomLente
  cena.pontosDeFugaObjetos(true) — guias das arestas dos objetos até os pontos de fuga deles (objetos girados têm os próprios; com a câmera inclinada, o terceiro ponto)
  Quadros de mangá/quadrinhos: camera.enquadramento("detalhe" | "close" | "primeiro plano" | "medio" | "americano" | "inteiro" | "geral", "Ana" | ["Ana","Leo"] | "todos", {tercos: "esquerda"})
  camera.angulo("normal" | "plongée" | "contra-plongée" | "zenital" | "nadir" | "holandês", graus) · cena.estado() / cena.restaurar(estado)
  Roteiro de quadros (botão "Quadros"): #cena (preparação) · #quadro 1 — título · #quadro 2 novo 16:9 · // fala: Ana: Oi! — cada quadro continua do anterior;
    Renderizar monta e fotografa cada quadro, a fila guarda em ordem e "Baixar tudo" gera um .zip (quadro, contorno, OpenPose, profundidade, normais, máscara, partes, canny, cena.json)
    cena.quadros.abrir() · .texto("#quadro 1 …") · .renderizar() · .fila() · .baixar()
    No roteiro: #orbita "Ana" 8 elevacao 10 16:9 — 8 quadros girando em volta (turntable) · #ficha "Ana" [completa] [orto] — frente, 3/4, perfil e costas
    Passes de cada quadro (ControlNet): contorno, OpenPose completo (BODY_25 + mãos 21 + rosto 70, confiança 0,5 = escondido; openpose-corpo.png só o corpo),
    profundidade, normais, máscara por item, partes do corpo (14 cores + legenda) e bordas (canny) — profundidade/máscara/partes em 1 px
  Órbita (a câmera gira em volta de um pivô: manequim, grupo, objeto, ponto ou a cena):
  camera.orbitar("Ana", {azimute: "frente" | "3/4 esquerda" | "esquerda" | "3/4 costas esquerda" | "costas" | "3/4 costas direita" | "direita" | "3/4 direita" | graus, elevacao: graus | "olhos" | "alta", distancia?})
  camera.orbitar(["Ana","Leo"], "costas") · camera.orbitar("mesa", 45) · camera.orbitar("cena", {azimute: 30, elevacao: 25}) · camera.orbitar([0, -7, 0], 90)
  Foco local: camera.orbitar("Ana", {area:"cabeca", azimute:45, elevacao:20, folga:0.9}) · camera.orbitar("Ana", {area:"mao direita", azimute:-45, elevacao:10})
  Objetos: camera.focar("mesa", "superior", {azimute:60, elevacao:40}) · camera.focar("caixa", "inferior") · camera.area("torso")
  No roteiro: #orbita "Ana" 8 area "mao esquerda" elevacao 25 — oito ângulos, mesma região focal
  camera.pivo("Ana", {area:"cabeca", enquadrar:true}) — a cabeça é o centro da órbita · camera.vista() → {pivo, area, azimute, elevacao}
  camera.girarEmVolta(15, 0) · camera.giro(8) → azimutes; o alvo mantém o foco ao mudar de posição ou pose
  Rig fino: m.articulacao("indicador esquerdo", {base: 0.8, ponta: 0.5, afastar: -0.3}) · ("polegar direito", {base, ponta, afastar, opor}) — de −1 a 1
    ("dedão esquerdo", {dobrar: 30}) · ("canela direita", {girar: 20}) · ("pé esquerdo", {aduzir: 10}) · ("escápula esquerda", {girar: 0.5, tensao: 1})
    ("mandíbula", {abrir: 0.5, lado: 0.2}) · ("olhos", {lado: 0.6, cima: -0.2, fechar: 0.3}) · ("sobrancelhas", {subir: 0.5, franzir: 0.4})
  m.expressao(nome, intensidade) — neutra, alegria, riso, surpresa, raiva, tristeza, choro, medo, grito, vergonha, sono, desconfianca, piscando,
    nojo, desprezo, determinacao, malicia, confusao, choque, tedio, dor, cansaco, admiracao, culpa, orgulho, pensativo, alivio (intensidade 0 a 1.5)
  Misturar: m.expressao({raiva: 0.6, tristeza: 0.4}, 1) ou m.expressao("60% raiva + 40% tristeza") · m.olhos(x, y) · m.boca(abrir, sorriso)
  m.rosto({...}) — unidades de ação do rosto, cada lado separado (somam por cima da expressão): sobrancelhaDentroEsq/Dir e sobrancelhaForaEsq/Dir (−1 a 1),
    palpebraEsq/Dir (piscar um olho), palpebraBaixoEsq/Dir (apertar), bochechaEsq/Dir, narizFranzir, labioCimaEsq/Dir (nojo), cantoBocaEsq/Dir (−1 a 1, desprezo),
    labiosApertar, beicinho, dentesCerrados, olheiras (0 a 1) · m.piscar("esq" | "dir") · funcionam em m.pose({...}) e no código da pose; "espelhar" troca o lado
  Na V5 as sobrancelhas mudam de forma com a emoção (V na raiva, arco na surpresa, aflição na tristeza) e aparecem rugas estilo mangá com a intensidade
    (entre as sobrancelhas, testa, pés de galinha, sulco nariz-boca, nariz, queixo enrugado, olheiras); o exagero controla quanto
  m.cabeca("v3" | "v5" | "v1" | "v2" | "v4") — V3 é a padrão; V5 = anime/mangá (olhos e boca grandes, expressões exageradas)
  m.corpo({olhosAnime: 1.75, bocaAnime: 1.7, exagero: 1}) · m.pose({corar: 1, lagrimas: 1}) — corado e lágrimas (desenhados na V5)
  Teclado (articulação escolhida no palco ou nas vistas): ←/→ ↑/↓ giram, PgUp/PgDn torção, Shift grande, Alt fino, Tab próxima, [ ] pai/filho, R zera, M outro lado, F foco, Esc solta, Ctrl+Z/Ctrl+Y
  cena.blocking.mover("articulacoes" | "manequim") · cena.blocking.foco("maoDir" | "cabeca" | "corpo" …) — quatro vistas do esqueleto (frente, lado, cima, isométrica)
  m.validarPose() → {ok, atravessa: [{partes, profundidade}], limites: [...]} — partes do corpo atravessando umas às outras e limites acoplados
  Gestos novos: chifres, telefone, gancho, mesa, vulcano, figa, cruzados
  cena.linhasOcultas(0..1) — opacidade das linhas atrás do corpo · cena.rosto("completo" | "minimo" | "liso")
  Cena por código (eixos do mundo: x = lado, y = altura, z = profundidade; a câmera padrão olha de +z):
  m.orientar("+x" | "-z" | "câmera" | graus | "Ana") · m.deitar("costas" | "bruços" | "lado", eixo da cabeça)
  m.saltar(altura R) · m.altura(R) · m.inclinar(graus, rolar?) — corpo inteiro (−90 costas, 90 bruços, 180 de cabeça para baixo)
  m.sentar(objeto?) · m.subir(objeto) · m.encostar(objeto) · m.olhar("baixo" | "cima" | "câmera" | "Ana" | [x,y,z])
  m.maoEm("esquerda", [x, y, z]) · m.peEm("direita", [x, y, z]) · m.apontar(alvo, "direita")
  cena.objeto(tipo, {x, z, giro, largura, profundidade, altura, raio, cor, sobre}) — caixas: banco, cadeira, caixa, cubo, degrau, mesa, cama, parede; cilindros: cilindro, copo, coluna, barril, "mesa redonda"
  o.posicao(x, z) · o.mover(dx, dz) · o.girar(graus) · o.medidas({altura, raio…}) · o.cor("#RRGGBB" | "auto") (exclusiva) · o.sobre("mesa" | null | "auto") · o.duplicar() · o.renomear() · o.remover() · o.info()
  cena.objetos() · cena.obterObjeto("mesa") · cena.removerObjeto("mesa") · cena.tiposDeObjeto() — colisões de objeto × objeto e manequim × objeto em cena.colisoes()
  cena.montar([{pose: "sentado"}, {deitar: {tipo: "costas", eixo: "x"}}, {pose: "saltando", altura: 4, olhar: "baixo"}], {camera: {eixo: "z", elevacao: "alta"}})
  cena.descrever("manequim 1 sentado, manequim 2 deitado ao longo do eixo x, câmera no eixo z, elevação alta")
  camera.eixo("x" | "-x" | "z" | "-z" | "y") · camera.elevacao("alta" | "muito alta" | "média" | "olhos" | "baixa" | "muito baixa" | graus) · camera.plano("plongée" | "contra-plongée" | "de cima")
  tema("claro" | "escuro" | "sistema") · log(...)
  
  Poses rápidas: empe, contrapposto, caminhando, frente, torcao, passo, joelho, ponta, erguido, alcancar, lateral, agachar, cintura, cruzar, ombro, sentado, sentadoChao, pernasEsticadas, abracandoJoelhos, deitadoCostas, deitadoLado, deBrucos, apoiadoCotovelos, ajoelhado, sentadoCalcanhares, umJoelho, cocoras, correndo, impulso, saltando, aterrissando, chutando, socando, alongando, paradaDeMao, engatinhando, apontando, acenando, carregando, empurrando, pensando, encostado, caindo, ponte, ponteUmaPerna, paradaAbertura, escorpiao, arabesque, espacateSaltado, camelo, agachamentoProfundo, prancha, quatroApoios, meditando, guardaLuta, jab, direto, gancho, uppercut, socoParaCima, cotovelada, joelhada, chuteLateral, chuteAlto, chuteGiratorio, chuteVoador, rasteira, palma, palmaDupla, defesaCruzada, aterrissagemHeroi, investida, esquiva, provocando, golpeRosto, golpeEstomago, arremessadoCostas, girandoNoAr, deCabecaParaBaixo, rolando, deslizandoSentado, estatelado, levantandoDeQuatro, atordoado, recuando, ajoelhadoFerido, atravessandoParede, caindoDeCostas, lotusFlutuando, baseGritando, agachadoCerrando, bracosAbertosLevitando, maosEmPrece, bracosCruzadosPeito, joelhoMaoNoChao, esferaDeLado, bracoAosCeus, concentrando, cargaDuasMaos, saltoSobreCaixa, subindoDegrau, saltoLongo, desviando, escalando, vitoria
  Tipos corporais: magro, medio, atletico, musculoso, cheio
  Parâmetros de pose e corpo: cabecaGirar, cabecaInclinar, cabecaLado, colunaFrente, colunaLado, colunaTorcao, pelveInclinar, pelveLado, pelveTorcao, ombroEsqSubir, ombroDirSubir, ombroEsqAvancar, ombroDirAvancar, bracoEsqAbrir, bracoDirAbrir, bracoEsqFrente, bracoDirFrente, bracoEsqGirar, bracoDirGirar, cotoveloEsq, cotoveloDir, antebracoEsqGirar, antebracoDirGirar, punhoEsq, punhoDir, maoEsq, maoDir, coxaEsqFrente, coxaDirFrente, coxaEsqAbrir, coxaDirAbrir, coxaEsqGirar, coxaDirGirar, joelhoEsq, joelhoDir, tornozeloEsq, tornozeloDir, dedosPeEsq, dedosPeDir, musculo, gordura, feminino, ombros, cintura, quadril, gluteos, pescoco, alturaPescoco, lombarFrente, lombarLado, lombarTorcao, toracicaFrente, toracicaLado, toracicaTorcao, pescocoFrente, pescocoLado, pescocoGirar, punhoEsqDesvio, punhoDirDesvio, polegarEsq, indicadorEsq, medioEsq, anelarEsq, minimoEsq, polegarDir, indicadorDir, medioDir, anelarDir, minimoDir, dedosEsqAfastar, dedosDirAfastar, polegarEsqOpor, polegarDirOpor, peEsqVirar, peDirVirar, dedaoEsq, dedaoDir, peEsqAduzir, peDirAduzir, canelaEsqGirar, canelaDirGirar, tensaoOmbros, escapulaEsqTensao, escapulaDirTensao, escapulaEsqGirar, escapulaDirGirar, olhosAnime, bocaAnime, exagero, bocaAbrir, mandibulaLado, sorriso, olharLado, olharCima, palpebras, sobrancelhas, franzir, corar, lagrimas, sobrancelhaDentroEsq, sobrancelhaDentroDir, sobrancelhaForaEsq, sobrancelhaForaDir, palpebraEsq, palpebraDir, palpebraBaixoEsq, palpebraBaixoDir, bochechaEsq, bochechaDir, narizFranzir, labioCimaEsq, labioCimaDir, cantoBocaEsq, cantoBocaDir, labiosApertar, beicinho, dentesCerrados, olheiras, corpoInclinar, corpoRolar, altura, apoio, comprimentoPernas, flexibilidade, comprimentoBracos, coxas, espessuraBracos, seios
  (também valem os nomes internos, como kneeFlexL)
```