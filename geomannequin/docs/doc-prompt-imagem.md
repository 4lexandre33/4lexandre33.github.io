# Prompt de imagem (Google Flow) — cena + câmera → texto, grade, cores, ZIP

Data: 2026-11-15 a 2026-11-20 · Manual: capítulo 60 · Tutorial: capítulo 10 ("Prompt de imagem")

## O que é
Uma janela nova do site (botão **Prompt**, tecla **G**) e duas ferramentas do MCP (`prompt_imagem`, `prompt_catalogo`). Elas transformam a cena montada (manequins, objetos, animais, veículos) e a câmera num prompt para IA de imagem. As posições não são adivinhadas: são **calculadas pela projeção da câmera**.

## Janela (site)
- **Esquerda:** o editor de texto, com autocompletar com miniaturas.
  - Mostra poses, objetos, lados, ângulos, planos, lentes, grades e formatos.
  - Com `#` mostra a tabela de cores com amostra; Ctrl+Espaço força as sugestões.
  - Seletores rápidos de formato, grade e idioma.
- **Direita:**
  - **Planta:** a mesma do Inspetor, trazida para a janela. Arrastar pessoas e a câmera refaz o prompt.
  - **Mapa:** as caixas calculadas, na cor de cada um, sobre os terços.
  - **Cenas:** o desenho de cada célula.
  - **Paleta.**
  - O prompt pronto (Inglês/Português), com Copiar e **Baixar ZIP**.
- Sem `quadro` no texto, vale a **cena do palco**, ao vivo: poses, cores e câmera de agora.
- "Trazer a cena para o texto" copia a cena como elenco + quadro.

## Bloco prompt
`formato` (16:9, 1:1, 9:16, 4:3, 3:4, 3:2, 2:3, 4:5, 21:9, a:b) · `grade CxL` (até 64 células) · `idioma en|pt|ambos` · `compacto/detalhado` · `estilo`, `situacao`, `lugar`, `luz`, `hora`, `clima`, `negativo`, `detalhe` · `var nome = valor` (usa-se como `${nome}`) · `Nome = "descrição"` · `variar lado|angulo|plano|lente|pose|expressao a, b, c` (preenche a grade).

## O que o prompt diz
Para cada pessoa ou objeto:
- onde está no quadro: esquerda/centro/direita e em cima/embaixo, em %;
- altura no quadro e plano (frente/meio/fundo);
- distância em metros;
- de frente, 3/4, perfil ou costas;
- para onde olha;
- quem tapa quem e quem está à esquerda de quem.

A câmera: altura, inclinação, distância, lente e holandês. A paleta com #hex exato.

Avisos aparecem quando:
- alguém está fora do quadro (ou mais da metade fora);
- ninguém aparece no quadro;
- há cores parecidas entre personagens;
- a grade tem quadros a mais ou a menos.

## ZIP
- `prompt-en.txt`, `prompt-pt.txt` e `prompt.json` (posições numéricas);
- `referencias/`: cena e mapa de cada célula, grade-cenas, grade-mapas, planta (PNG e SVG);
- `paleta`;
- `miniaturas/`: poses, objetos, plano, ângulo, lado e lente usados;
- `texto-da-cena.gm.txt` e `LEIA-ME.txt`.

## Arquivos
- `src/scene/prompt-img.js` (núcleo: piLer, piExpandir, piAnalisar, piMontar, piGerar, piArquivos…)
- `src/ui/prompt.js` (janela)
- `mcp/lib/tools-prompt.mjs` (MCP)
- `testes/prompt-imagem.mjs`
- Ajustes:
  - name-dsl: lado 3/4-costas, lado em graus e cor de objeto por nome ou hex no quadro;
  - recorteQuadro com formato a:b;
  - autocompletar: grade, idioma, variar e cores;
  - barra de comando: guarda o nome da pose;
  - planta: as linhas horizontais da grade voltaram;
  - planta: clicar numa pessoa que está no alvo da câmera pega a pessoa.

## Correções do teste cego
- Grade com close/detalhe não quebra mais (a grade de cenas do MCP é montada com os PNGs das células).
- Enquadramento medido na imagem, câmera nunca abaixo do chão (contra-plongée), alvo com objetos/veículos.
- "de costas" não diz mais "olhando para a câmera"; "mais perto da câmera" usa o ponto mais próximo de cada um (carro grande × pessoa).
- Paleta inclui todos os personagens; cores azul-acinzentadas com nome certo; aviso de cores parecidas sem repetição.

## Limitações
- A IA de imagem pode não obedecer às porcentagens à risca. A imagem de referência (grade-cenas) ajuda mais que o texto.
- O ZIP não leva a ficha completa do quadro: o conversor de PNG do MCP quebra com ela.
