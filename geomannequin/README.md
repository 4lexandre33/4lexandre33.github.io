# GeoMannequin

Manequim anatômico paramétrico para referência de desenho.

- **App:** <https://4lexandre33.github.io/geomannequin/>
- **Arquivo único para baixar** (abre com dois cliques, sem internet para o desenho): [`dist/geomannequin.html`](dist/geomannequin.html)
- **MCP para Claude, ChatGPT e Gemini:** pasta [`mcp/`](mcp/README.md)

**Gerador de cenas em camadas:** com 2 ou mais manequins, cada um é desenhado sozinho, como uma foto .svg tirada pela câmera da cena, e as fotos são empilhadas. Mexer em um manequim refaz só a foto dele (numa cena de 8, cerca de 6× mais rápido); arrastar a tela e o zoom não redesenham nada até soltar; as outras camadas são desenhadas em paralelo em vários núcleos. Dá para congelar um manequim (a foto fica fixa), ocultar, mudar a ordem na pilha, fotografar um manequim só e exportar a cena com uma camada por manequim (Inkscape, Illustrator, Figma, Affinity) ou um .zip com as fotos separadas.

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
