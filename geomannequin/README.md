# GeoMannequin

Manequim anatômico paramétrico para referência de desenho.

- **App:** <https://4lexandre33.github.io/geomannequin/>
- **Arquivo único para baixar** (abre com dois cliques, sem internet para o desenho): [`dist/geomannequin.html`](dist/geomannequin.html)
- **MCP para Claude, ChatGPT e Gemini:** pasta [`mcp/`](mcp/README.md)

**Gerador de cenas em camadas:** com 2 ou mais manequins, cada um é desenhado sozinho, como uma foto .svg tirada pela câmera da cena, e as fotos são empilhadas. Mexer em um manequim refaz só a foto dele (numa cena de 8, cerca de 6× mais rápido); arrastar a tela e o zoom não redesenham nada até soltar; as outras camadas são desenhadas em paralelo em vários núcleos. Dá para congelar um manequim (a foto fica fixa), ocultar, mudar a ordem na pilha, fotografar um manequim só e exportar a cena com uma camada por manequim (Inkscape, Illustrator, Figma, Affinity) ou um .zip com as fotos separadas.

**Colisões entre manequins:** cada corpo vira um conjunto de cápsulas; quando um manequim atravessa outro (mão no quadril do vizinho, braços cruzando), a tela marca o ponto e o painel "Colisões" lista o conflito. Você escolhe a correção de cada um — automática (muda o mínimo), afastar no chão, girar, ajustar só o braço/perna, ou permitir o contato (abraço) — e pode deixar o app só avisar, corrigir ao soltar ou bloquear ao arrastar.

**Esqueleto e cena por código:** o manequim tem ossos com nome anatômico (vértebras L5–C1, crânio, pelve, esterno, costelas, clavículas, escápulas, úmero, rádio/ulna, metacarpos e falanges, fêmur, patela, tíbia/fíbula, tálus, calcâneo, metatarsos) e articulações com os limites do corpo humano (amplitude clínica, limites acoplados como isquiotibiais e rotação do ombro, ritmo escápulo-umeral). Ligue “Mostrar ossos”, clique numa articulação e arraste para girá-la; a coluna é dividida em lombar, torácica e cervical, cada dedo dobra sozinho e o polegar faz oposição. O corpo inteiro pode deitar (costas, bruços, lado), ficar de cabeça para baixo ou saltar, sempre apoiado no chão ou num objeto (banco, cadeira, caixa, degrau, mesa, parede). Perfis de flexibilidade (normal, atleta, ginasta, contorcionista) liberam ponte, espacate, arabesque e parada com abertura; `m.apoiar("maos pes")` põe vários pontos no chão ao mesmo tempo, com equilíbrio. A coluna é uma curva contínua (sem quinas), o glúteo acompanha o fêmur, o pé é uma cunha escultural com só o dedão separado, os traços saem em curvas de Bézier com hierarquia de peso (silhueta, sobreposição, linhas internas) e as linhas ocultas têm opacidade regulável. Por código: `m.orientar("+x")`, `m.deitar("costas", "x")`, `m.olhar("baixo")`, `m.articulacao("cotovelo esquerdo", {dobrar: 90})`, `camera.eixo("z").elevacao("alta")`, ou uma frase só: `cena.descrever("manequim 1 sentado, manequim 2 deitado ao longo do eixo x, manequim 3 saltando olhando para baixo, câmera no eixo z, elevação alta")`.

**Roteiro de quadros (storyboard para mangá/quadrinhos):** o botão "Quadros" abre um editor onde cada quadro é um bloco de código — `#cena` (preparação comum), `#quadro 1 — título`, `#quadro 2 novo 16:9`… (também `# frame 1`), sem limite de quadros. Cada quadro continua do anterior (só se escreve o que muda); `novo` recomeça da preparação; `// fala: Ana: Oi!` vira balão. Enquanto se digita só aparece a prévia do quadro do cursor; **Renderizar** monta cada quadro numa cena separada (a cena aberta não muda), tira a "foto" e põe na fila, em ordem — dá para reordenar arrastando, duplicar, comparar dois, abrir um quadro no palco, ajustar à mão e gravar o ajuste de volta no roteiro. **Baixar tudo** gera um .zip com uma pasta por quadro: o desenho (PNG e SVG) e as referências para gerar a imagem final do personagem na mesma pose, ângulo e enquadramento (ControlNet e afins) — esqueleto OpenPose (PNG + JSON), profundidade, máscara com uma cor por personagem/objeto, contorno (line art) e `cena.json` — mais o roteiro, um manifesto e a folha de contato. Também monta páginas de mangá (grades, leitura ocidental ou japonesa, balões). Comandos novos para quadrinhos: `camera.enquadramento("close", "Ana")`, `camera.angulo("contra-plongée")`. No MCP: ferramenta `roteiro_quadros`.

**Câmera em órbita:** a câmera gira em volta de um **pivô** — um manequim, um grupo, um objeto, um ponto ou a cena inteira. No painel "Vista (câmera)" escolha o pivô e use as 8 vistas (frente, 3/4, perfil, 3/4 de costas, costas…) ou os passos de 15°; arrastar no palco gira em volta dele, e a vista de cima mostra o pivô e o círculo da órbita. Por código: `camera.orbitar("Ana", {azimute: "3/4 esquerda", elevacao: 15})` (o azimute conta a partir da frente do pivô), `camera.pivo("mesa")`, `camera.vista()`. No roteiro de quadros, `#orbita "Ana" 8 elevacao 10` vira 8 quadros girando (turntable) e `#ficha "Ana" orto` vira a ficha do personagem (frente, 3/4, perfil e costas; `completa` = 8 vistas). No MCP: `camera` com `orbitar` e `pivo`.

**Rig completo e referências de ControlNet:** além dos ossos do corpo, cada dedo tem base (MCF), ponta (IFP/IFD) e abertura próprias, o polegar tem oposição, o pé tem dedão separado, adução e giro da canela, a escápula tem rotação e tensão por lado, e o rosto tem mandíbula (abrir e desviar), olhar, pálpebras, sobrancelhas e 10 expressões (`m.expressao("surpresa")`). Limites acoplados seguem a anatomia (canela só gira com o joelho dobrado, dedo dobrado na base quase não abre, mandíbula aberta desvia menos) e `m.validarPose()` diz se alguma parte atravessa outra. Cada quadro sai com **OpenPose completo** (BODY_25 + mãos 21 + 21 + rosto 70, no JSON do OpenPose; confiança 0,5 nos pontos escondidos atrás de algo; desenho no estilo DWPose e uma versão só do corpo), **profundidade, normais, máscara por item, segmentação por partes do corpo e bordas (canny)** em 1 px.

**Quantas poses?** Estimativa por Monte Carlo (`npm run estimar-poses`, 20 000 poses sorteadas, perfil normal): o corpo tem 61 articulações de pose, ≈ 10^72 combinações em passos de 5°, das quais ≈ 18 % não atravessam o próprio corpo nem passam um limite acoplado → **≈ 10^71,7 poses de corpo válidas** (10^121 na resolução dos sliders). Com as 46 regulagens das mãos e as 8 do rosto: ≈ 10^139,6 (em passos de 5°/10 níveis). Mais 54 poses prontas, 19 gestos de mão e 10 expressões.

**Blocking:** o painel de blocking fica encaixado ao lado do palco (coluna própria, largura ajustável pela borda, recolhível) com a vista de cima (planta X/Z) e a vista lateral empilhadas. Dali se insere: "+ Manequim" e "+ Objeto" (cadeira, mesa, mesa redonda, cama, banco, caixa, cubo, degrau, parede, cilindro, copo, coluna, barril) — escolha o tipo, veja o contorno seguindo o ponteiro e clique para colocar. Cada objeto tem uma cor exclusiva (nenhum outro objeto ou manequim repete), aparece com volume e perspectiva no palco (cilindros com elipses e sombreado) e pode ser arrastado, girado pela alça, redimensionado pelo canto e, na lateral, ter a altura mudada; solto sobre um tampo maior, fica em cima dele e acompanha quando o de baixo se move. As colisões entre objetos e entre objetos e manequins são detectadas e marcadas nas vistas e no palco (avisar, bloquear ao arrastar ou corrigir ao soltar). O painel pode virar janela flutuante ou abrir numa janela separada do navegador (outro monitor); cada vista também pode ser destacada sozinha. As vistas leem e escrevem o mesmo estado da cena; nada é copiado. Com perspectiva, a profundidade é a distância ao longo do eixo da câmera e é ela que decide o tamanho na foto (linhas de 100%, 50% e 25%). O cone da câmera na vista de cima mostra exatamente o que a foto cobre no chão (os cantos da foto) e muda de cor com a lente (grande-angular, normal, tele); o zoom óptico (−/+, roda sobre o cone, Alt + roda no palco, `camera.zoomLente(85)`, `camera.campo(60)`) troca só a lente, sem mover a câmera. Com o horizonte ligado, as arestas dos objetos ganham guias até os pontos de fuga deles. Tudo também por código: `cena.objeto("copo", {sobre: "mesa", cor: "#E74C3C"})`, `cena.blocking.destacar("lateral")`, `cena.descrever("uma mesa azul à direita do manequim 1, copo sobre a mesa")`.

Recursos: três modos de desenho — **Manequim**, **Construção** e **Écorché** (anatomia limpa no estilo Bridgman/Loomis, com linhas de músculo em hierarquia de traço, tons planos e fibras opcionais); poses com limites anatômicos e cinemática inversa, vários manequins na mesma cena com cores exclusivas, perspectiva (lente, altura dos olhos, horizonte e pontos de fuga, sombras no chão, perspectiva atmosférica), modo noturno, editor de comandos em português, exportação SVG/JSON e link de cena.

## Organização

O código-fonte fica em pastas, um assunto por arquivo. A página carrega os módulos diretamente (`<script type="module">`).

```
geomannequin/
├─ index.html            só a marcação da página; carrega css/ e src/main.js
├─ css/
│  ├─ temas.css          cores (claro, escuro, automático) — todas as cores vêm daqui
│  ├─ base.css           página, cabeçalho, botões
│  ├─ layout.css         grade: camadas | palco | parâmetros
│  ├─ controles.css      sliders, camadas, abas, mensagens
│  ├─ cena.css           lista de manequins e cores
│  └─ editor.css         editor de comandos
├─ src/
│  ├─ main.js            ponto de entrada da página
│  ├─ engine/            MOTOR DE DESENHO — não usa a página; roda também no Node
│  │  ├─ index.js        reúne os módulos e prepara os buffers
│  │  ├─ matematica.js   constantes da tela, interpolação, matrizes
│  │  ├─ padroes.js      valores padrão (DEF), modos de camadas, estilos de traço
│  │  ├─ camera.js       rotação da câmera
│  │  ├─ cabeca.js       cabeça e orelhas
│  │  ├─ corpo.js        tipo corporal, perfil do tronco, escápula
│  │  ├─ musculos.js     peitoral, abdômen, oblíquos, serrátil
│  │  ├─ tronco.js       pele do tronco, ombros, clavícula, malha do busto
│  │  ├─ malhas.js       geradores de malha (tubo, faixa, dedo, blob)
│  │  ├─ bracos.js       braço, cotovelo, antebraço, deltoide
│  │  ├─ maos.js         palma e dedos
│  │  ├─ pernas.js       coxa, joelho, perna, pé, dedos, glúteo
│  │  ├─ cadeia.js       pelve → coluna → pescoço; cinemática inversa
│  │  ├─ colisao.js      braços e pernas não atravessam o corpo
│  │  ├─ montagem.js     cache de malhas e pose de cada parte
│  │  ├─ projecao.js     luz, perspectiva, escala na tela
│  │  ├─ zbuffer.js      visibilidade e mapa de sombra
│  │  ├─ campos.js       oclusão, meio-tom, sombra própria, luz de borda
│  │  ├─ sombra.js       sombra no chão
│  │  ├─ contornos.js    vetorização dos tons, silhueta, preenchimento
│  │  ├─ desenho.js      desenha um manequim (gera o SVG)
│  │  ├─ cena.js         vários manequins, chão, horizonte, pontos de fuga
│  │  ├─ colisao-cena.js colisão entre manequins: corpo em cápsulas, distância segmento–segmento, profundidade e direção de saída
│  │  ├─ esqueleto.js    ossos com nome anatômico e articulações (o que cada uma move)
│  │  ├─ amplitude.js    limites das articulações por perfil de flexibilidade
│  │  ├─ apoio.js        apoio em vários pontos (mãos e pés no chão), com equilíbrio
│  │  ├─ curvas.js       traços em curvas de Bézier (simplificação + Catmull-Rom)
│  │  ├─ planta.js       blocking: câmera no mundo, tamanho na foto, vista de cima e perfil em SVG
│  │  ├─ objetos.js      objetos (caixas e cilindros): partes, cápsulas, colisão entre objetos, cor e desenho em perspectiva
│  │  ├─ camadas.js      cena em camadas: cada manequim é uma "foto" .svg guardada (cache), compositor com recorte por profundidade
│  │  ├─ trabalhador.js  Web Worker: desenha camadas em paralelo, fora da thread da página
│  │  └─ atlas/          ATLAS MUSCULAR (écorché): cada músculo como forma na pele → volume + linhas
│  │     ├─ tronco.js    peitoral, abdômen, serrátil, oblíquos, grande dorsal, trapézio, escápula, eretores
│  │     ├─ bracos.js    deltoide (3 feixes), bíceps, braquial, tríceps, braquiorradial, flexores, extensores
│  │     ├─ pernas.js    sartório, reto femoral, vastos, trato iliotibial, adutores, isquiotibiais, tíbia, gastrocnêmio, sóleo, Aquiles
│  │     └─ util.js      curvas suaves, distância a polígonos, volume
│  ├─ scene/             CENA E COMANDOS — não usa a página; o MCP usa estes mesmos arquivos
│  │  ├─ index.js        reúne os módulos e cria a cena inicial
│  │  ├─ ambiente.js     ponte com a página (ganchos que a interface registra)
│  │  ├─ paletas.js      cores da tela e da exportação
│  │  ├─ parametros.js   faixas e rótulos dos parâmetros, nomes em português
│  │  ├─ modelo.js       manequins da cena, cores exclusivas
│  │  ├─ tema.js, modos.js, estado.js, enquadrar.js, poses.js
│  │  ├─ colisoes.js     detectar e corrigir colisões (afastar, girar, ajustar a pose, automático), modos avisar/corrigir/bloquear
│  │  ├─ cenario.js      objetos, orientar por eixo, deitar, olhar, mão/pé num ponto, apontar, sentar/subir/encostar
│  │  ├─ blocking.js     leitura e escrita da composição no estado da cena (sem cópia)
│  │  ├─ descrever.js    cena descrita em português e cena montada por lista
│  │  ├─ camadas-cena.js foto de um manequim, cena em camadas nomeadas, arquivos para remontar a cena
│  │  ├─ comandos.js     API em português: cena, camera, tema
│  │  ├─ ajuda.js        exemplos e referência da API
│  │  └─ ordem.json      ordem dos módulos (usada pelo MCP)
│  └─ ui/                INTERFACE — tudo que mexe na página
│     ├─ palco.js        desenha na tela
│     ├─ arrastar.js     girar, mover, alças, roda do mouse
│     ├─ controles.js    sliders, camadas, botões de pose/corpo/rosto
│     ├─ painel-cena.js  lista de manequins e cores
│     ├─ editor.js       editor de comandos
│     ├─ trabalhadores.js fila de Web Workers (um por núcleo, até 4); sem suporte, desenha na página
│     ├─ blocking.js     painel de blocking (encaixado, flutuante ou em outra janela), inserir, arrastar, lista e campos
│     ├─ articulacoes.js clicar e girar articulações, biblioteca de poses, gestos, espelhar/copiar/colar pose
│     ├─ colisoes.js     painel "Colisões": escolher a correção de cada colisão
│     ├─ zip.js          .zip simples para baixar as camadas
│     ├─ exportar.js, link.js, tema.js, modos.js, estilo.js, persistencia.js, inicio.js
├─ dist/                 versão em arquivo único (gerada — não edite à mão)
├─ ferramentas/          construir.mjs (gera dist/), servir.mjs (servidor local)
├─ testes/               motor.mjs, cenas.mjs (26 cenas), corpo.mjs (recortes do corpo), camadas.mjs (camadas × cena exata), desempenho.mjs (bancada)
└─ mcp/                  servidor MCP
```

Regras dos módulos:

- `engine/` e `scene/` nunca acessam elementos da página diretamente; quando a cena precisa avisar a tela (redesenhar, atualizar controles), chama os ganchos de `scene/ambiente.js`, que a interface registra em `src/main.js`.
- Cada módulo exporta o que declara. Variáveis que outro módulo precisa alterar têm uma função `setNome(valor)` no módulo dono.
- O que precisa rodar ao carregar (criar buffers, ligar botões) fica numa função `iniciarNome()` em cada módulo, chamada pelos arquivos `index.js` / `main.js` na ordem certa.

## Trabalhar no código

Precisa do [Node.js](https://nodejs.org) 18 ou mais novo.

```
cd geomannequin
npm install          # só na primeira vez (instala o esbuild)
npm run servir       # abre em http://localhost:8080 (módulos não abrem com dois cliques)
npm run testar       # motor + 26 cenas comparadas com a referência
npm run construir    # gera dist/geomannequin.html (arquivo único)
node testes/vistas.mjs ecorche atletico   # 6 vistas + comparação lado a lado com as referências (precisa de mcp/node_modules)
```

Depois de mudar o código: rode `npm run testar`. Se o desenho mudou de propósito, confira no navegador e grave a nova referência com `node testes/cenas.mjs --gravar`. Depois rode `npm run construir` e, se mexeu em `src/scene` ou `src/engine`, também `npm run build` dentro de `mcp/` (pacote usado pela extensão do Gemini).

## Biotipos anatômicos — masculino e feminino (novembro de 2026)

Há **10 presets adultos**: `magro`, `medio`, `atletico`, `musculoso`, `cheio` para cada sexo.
Cada combinação tem ombros, cintura, pelve, espessura de braços/coxas, volume de glúteos,
pescoço, musculatura e gordura calibrados independentemente em `src/scene/biotipos.js`.
O modelo inicial é **masculino médio** (`DEF.fem = 0`, `DEF._biotipo = "medio"`).

A troca de rosto masculino/feminino da interface também altera a morfologia corporal,
sem apagar ajustes manuais relativos. O controle contínuo de sexo (`fem`) interpola
entre os dois grupos. Os botões de biotipo selecionam o perfil completo correspondente
ao sexo atual e mantêm independentes a pose, a câmera e os parâmetros faciais.

Pela API de cenas / editor de frames:

```js
cena.ativo.corpo("masculino medio");
cena.ativo.corpo("feminino atletico");
cena.ativo.corpo("musculoso");        // conserva o sexo atual
cena.ativo.corpo({feminino: 0.5});   // transição morfológica contínua
cena.ativo.corpo({quadril: 1.1});    // personalização manual
```

O `_biotipo` escolhido é preservado na serialização JSON e nos quadros do storyboard,
para que a troca posterior de sexo não aplique medidas do perfil errado. A geometria-base
usa interpolação Hermite monotônica em alturas não uniformes, com continuidade C1 na
passagem de caixa torácica, cintura, crista ilíaca, pelve e virilha. Glúteos, quadris
e colisões seguem as medidas efetivas; o cache de malhas inclui `gluteVol`.

### Testes da anatomia

```bash
npm run testar:anatomia       # 10 biotipos, simetria, curvas, articulações, JSON e storyboard
npm run testar:matriz:rapida  # 10 × 6 vistas × 1 pose × 3 modos = 180 SVGs
npm run testar:matriz         # 10 × 6 vistas × 5 poses × 3 modos = 900 SVGs
```

A matriz completa também pode ser iniciada manualmente em **Actions → GeoMannequin — matriz anatômica**,
quando houver runner disponível na conta; exporta 20 referências SVG e recortes PNG.
Leia `docs/task-graph-harmonia-10-biotipos.md` para os critérios e o estado das verificações.

**Referências antigas:** `testes/referencia.json` contém hashes visuais anteriores.
É esperado que a geometria remodelada altere essas assinaturas. Não regenere os hashes
automaticamente antes de conferir os desenhos; use `node testes/cenas.mjs --gravar`
depois da inspeção visual e então execute `npm run testar`.

## Reconstrução anatômica de cabeça, ombros e pelve (novembro de 2026)

A auditoria das nove imagens de referência trouxe alterações nos dez biotipos.
A cabeça tem regiões parietal, frontal, temporal e occipital mais diferenciadas,
uma escala sutil por biotipo (`headScale`), relevo do masseter e zigomático,
linha mandibular no perfil, movimentos faciais associados a sorriso e pálpebras
e **atlas esquemático de 32 traçados musculares faciais** no modo écorché.
A boca aberta mostra cavidade escura, representação de dentes e língua.

Também foram corrigidos o salto geométrico na junção do deltoide, as pontes
peitoral/dorsal → axila, a suavidade da clavícula e das linhas das costas,
a forma e implantação dos seios femininos, a curva cintura–quadril–glúteos e
a transição da coxa proximal em diferentes biotipos. Pescoço e comprimento
de braços e pernas acompanham os dez presets.

**Precisão dos detalhes:** dentes e língua são projetados na superfície visível,
e a musculatura da face é um atlas gráfico. Não representam malhas volumétricas
internas de boca, dentes e músculos individuais.

### Inspeção visual de quatro cenas geradas pelo motor

- [Masculino musculoso — frente](testes/visuais-reconstrucao/masculino-musculoso-frente.svg)
- [Feminino médio — frente](testes/visuais-reconstrucao/feminino-medio-frente.svg)
- [Feminino cheio — costas em 3/4](testes/visuais-reconstrucao/feminino-cheio-costas-34.svg)
- [Masculino atlético — perfil e boca aberta](testes/visuais-reconstrucao/masculino-atletico-perfil-boca.svg)

A execução direta do motor gerou SVGs válidos para os dez biotipos e cenas
adicionais de braços elevados, flexão e perfil. Os testes geométricos das
dez famílias, da cintura, da pelve e da cabeça passaram. Isso não significa
aprovação estética em todas as poses.

```bash
cd geomannequin
npm ci
npm ci --prefix mcp
npm run testar:anatomia
npm run testar:face:rapida
npm run testar:face        # 300 casos, vistas e expressões
npm run testar:matriz      # 900 casos corporais
```

O [task graph detalhado](docs/task-graph-reconstrucao-anatomica.md) registra
TG-00 a TG-27, evidências e pendências. As 1.200 renderizações da matriz,
revisão visual humana, atualização das referências históricas e reconstrução
do `dist/geomannequin.html` precisam ser executadas/aprovadas separadamente.

## Reconstrução da cabeça pela referência anatômica 3×3 (10/11/2026)

A cabeça foi revisada a partir da referência de modelagem do usuário com
ênfase na vista de perfil: crânio mais ovalado, caixa parietal ampla,
têmpora/frontal menos esféricos e massa occipital posterior.
A **mandíbula gira na ATM** e a **nuca permanece fixa**; o pescoço fica
visível antes de se abrir para ombros e clavículas. Orelhas foram reposicionadas.

A boca deixa de usar uma grade frontal: a abertura segue um contorno
curvo, com lábios articulados, arcadas dentárias e língua desenhadas de
acordo com o parâmetro `jawOpen`. A malha do rosto ganha um rebaixo
suave no interior oral.

**Novo controle:** `cranialDepth` (0,90 a 1,12) ajusta o comprimento
posterior do crânio independentemente da largura `skull`, escala
`headScale` e extensão da face `face`. Cada um dos 10 biotipos possui
um valor próprio de profundidade.

Veja as folhas de 9 vistas:
[masculino médio](testes/visuais-cranio-3x3/masculino-medio.svg) e
[feminino médio](testes/visuais-cranio-3x3/feminino-medio.svg).

```bash
npm run testar:cranio
npm run atlas:cranio -- masculino medio
npm run atlas:cranio -- feminino medio
```

O [task graph de reconstrução craniana](docs/task-graph-cranio-referencia-3x3.md)
documenta as tarefas, 48 renderizações amostrais verificadas, regressões e
limitações. Os dentes e a língua **ainda não são malhas internas completas**
como em um modelo odontológico; a inspeção estética das vistas permanece necessária.

## Cabeça V2 experimental — topologia matemática (novembro de 2026)

Foi criada uma segunda implementação anatômica em
[`src/engine/head/`](src/engine/head/), paralela à cabeça V1. Ela usa
seções cranianas paramétricas, perfil sagital, campos de relevo,
mandíbula articulada, orelhas 3D, globos oculares, representação
volumétrica de cavidade oral, dentes e língua, linhas topográficas sobre
a malha, dez biotipos e três níveis de resolução.

**Como testar:** na aplicação, no painel de proporções, escolha
**Geometria da cabeça → Cabeça V2 — experimental**. Volte para V1
a qualquer momento. No editor de quadros ou no código:

```js
const m = cena.adicionar("Modelo V2");
m.cabeca("v2");
m.corpo("feminino medio");
m.boca(0.7, 0.4);
```

A escolha da geometria é salva no JSON e preservada por quadro.
A V1 continua sendo o **padrão**, inclusive para arquivos antigos.
`headDetail` controla LOD 0 (rápido), 1 (normal) e 2 (close).
Não modificar a geometria usando apenas a câmera não regenera a malha.

**Referências SVG geradas pelo motor:**
[masculino médio, 3 vistas](testes/visuais-cabeca-v2/masculino-medio-3-vistas.svg)
e [feminino médio, 3 vistas](testes/visuais-cabeca-v2/feminino-medio-3-vistas.svg).

```bash
cd geomannequin
npm ci
npm ci --prefix mcp
npm run testar:cabeca-v2
npm run matriz:cabeca-v2:rapida
# Matriz longa de 1350 cenas, somente quando houver runner
npm run matriz:cabeca-v2
```

**Limites reais:** esta V2 é um protótipo anatômico 3D integrado;
a mandíbula ainda usa uma deformação de pele parametrizada, os
dentes são aproximações volumétricas, as órbitas/orelhas/colo ainda
precisam de refinamento topológico e a revisão visual completa em 1350
combinações ainda não foi aprovada. O objetivo artístico da referência
anexada não deve ser tratado como já alcançado.
Veja [registro de implementação](docs/head-v2-implementacao.md) e
[task graph planejado](docs/task-graph-cabeca-v2-topologia-matematica.md).

## Planos laterais de Loomis na Cabeça V2 (10/11/2026)

Os dois círculos laterais foram incorporados à **malha craniana V2**, não
apenas às linhas do SVG. Cada lado possui um disco geométrico plano
(`x=±d`) com borda circular e faixa de transição suave com o crânio.

Controles no painel de proporções: **profundidade do corte, raio, altura,
posição anterior/posterior e suavidade da borda**. Eles atuam nos dois
lados de forma simétrica. Ocorre junto com ajustes da testa, do occipital,
da nuca, das orelhas e do pivô da ATM; a V1 continua disponível sem mudanças.

Folhas de nove vistas renderizadas pelo motor:

- [Masculino médio — Loomis 3×3](testes/visuais-loomis/masculino-medio-3x3.svg)
- [Feminino médio — Loomis 3×3](testes/visuais-loomis/feminino-medio-3x3.svg)

```bash
cd geomannequin
npm run testar:planos-loomis
npm run atlas:planos-loomis -- masculino medio
npm run atlas:planos-loomis -- feminino medio
```

O [relatório técnico](docs/relatorio-execucao-planos-loomis.md) documenta
30 malhas testadas (10 biotipos × 3 LOD), 41.084 pontos planos nas
malhas, zero triângulos degenerados nas amostras e 18 vistas SVG.
**Isso não constitui aprovação estética**: falta executar em Node,
revisar visualmente os dez biotipos, verificar exportações e completar
a matriz de 1.350 renderizações. O workflow do Actions terminou antes
de fornecer etapas ou logs; não foi contado como teste aprovado.

### Cabeça V2 — Loomis estendido, testa tangente e nuca em arco (10/11/2026)

A implementação experimental V2 ganhou **círculos laterais planos maiores** (raio padrão 0,73), uma calota superior menos esférica, **trecho frontal aproximadamente reto com continuidade de tangente** e um **perfil occipital circular/oval no corte sagital** que se liga à nuca por Hermite C1. O motor V1 foi preservado.

- [Task graph completo de 19 etapas, critérios e testes](docs/task-graph-cabeca-v2-perfil-loomis-20261110.md)
- Regressões: `npm run testar:planos-loomis`; atlas 3×3: `npm run atlas:planos-loomis -- masculino medio`
- A geometria precisa de revisão estética comparando as vistas geradas às referências. Testes geométricos isolados não equivalem a essa aprovação.

### Cabeça V3 experimental — microgeometria anatômica (10/11/2026)

A V3 cria uma nova cabeça a partir de seções anatômicas por spline e **mais de 2.000 microformas 2D sobrepostas**, convertidas em um único campo de relevo e malha 3D. As formas permanecem ocultas no modo manequim, mas podem ser inspecionadas no modo construção. No seletor **Geometria da cabeça**, escolha **Cabeça V3 — microgeometria anatômica** (V1/V2 continuam disponíveis). A nova exportação **Cabeça V3 (.obj)** gera uma malha fechada com normais.

- [Arquitetura, task graph de 42 tarefas, comandos e limites](docs/head-v3-microgeometry.md)
- Testes: `npm run testar:cabeca-v3`
- Atlas de nove vistas: `node testes/atlas-cabeca-v3.mjs masculino medio`

**Estado:** implementação funcional experimental; resultados da suíte integrada/CI, revisão estética e comparação com referência ainda precisam ser aprovados antes de chamar o modelo de anatomicamente fiel.


### Órbita focal por região anatômica e partes de objetos (10/11/2026)

A câmera continua orbitando cena, grupo, manequim, objeto ou ponto. Também pode escolher **qual parte do alvo** deve ser o pivô: cabeça, rosto, torso, braços, antebraços, mãos, pernas, coxas, canelas e pés (inclusive lado esquerdo/direito), ou superior/centro/inferior/topo/base de objetos. O alvo acompanha a pose e a posição do personagem. O painel **Vista (câmera)** oferece seletores de **Região do alvo**, **Elevação** e **Enquadramento**; os botões de ângulo e o arraste preservam a região.

```js
camera.orbitar("Ana", {area:"cabeca", azimute:"3/4 esquerda", elevacao:25, enquadrar:true});
camera.area("mao esquerda");
camera.focar("Caixa", "superior", {azimute:45, elevacao:60});
camera.orbitar(["Ana","Leo"], {area:"cabeca", azimute:90, elevacao:15});
```

No roteiro: `#orbita "Ana" 8 area "mao esquerda" elevacao 25`. A escolha do pivô e da região é salva no JSON da cena. **Criaturas com rigs não humanos exigem integração futura**: atualmente o motor dispõe de manequins humanos e objetos.

- [Task graph completo de 42 nós, arquivos, critérios e comandos](docs/task-graph-orbita-foco-regional-20261110.md).
- `npm run testar:camera-foco` — testes automatizados do motor.
- `node testes/atlas-camera-foco-regional.mjs` — folha visual 3×3 com nove enquadramentos.

**Portões de aceitação:** comparação visual das nove vistas, build do projeto e regressões antigas ainda precisam ser confirmadas; implementação de código isoladamente não garante aprovação visual do foco.
