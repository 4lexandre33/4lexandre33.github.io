# Pacotes de cenas, tabuleiro e tutorial interativo (2026-11-15)

## O que entrou

### Pacotes de cenas (sprite sheets → células)
- Janela **Pacotes** (tecla **P**). Solte um `.zip` ou várias imagens: cada imagem é uma *folha* com várias cenas em grade.
- **Grade achada pelo fundo.** A cor de fundo é a mais comum na moldura (branco, preto ou outra) e as faixas quase todas de fundo separam linhas e colunas.
  - Reconhece 1×1, 2×2, 3×3, 3×5 e irregular (3+2).
  - Quando as bandas ficam muito desiguais, tenta uma divisão regular.
  - Avisa quando pode ser NxN (faixa branca dentro da cena).
  - Correção manual: `grade 3x3` (colunas × linhas).
- **Nome de cada célula:** `pacote-folha-célula` (ex.: `acao-noturna-02-05`). A numeração segue a leitura ocidental ou japonesa.
- **Ficha da célula:**
  - função narrativa (25 funções com sinônimos: perseguição, fuga, luta, confronto, esconderijo, descanso, interação, reunião…);
  - ação, pessoas, plano, ângulo, clima, lugar, hora, intensidade, movimento, personagens, tags e descrição;
  - rostos `{u,v,r}`, para os balões apontarem.
- **Quem preenche a ficha:**
  - no site, "Classificar com IA" (Claude, capacidade sample com imagens, em lotes de 4);
  - pelo MCP (`celulas_ver` → `celulas_classificar`);
  - ou à mão.
- **Busca em texto livre:** "perseguição 2 pessoas noite", "grupo", "-chuva", "pacote x", "nao classificadas".
- **Onde guarda:**
  - navegador (IndexedDB, automático);
  - nuvem do artefato (fichas no banco + imagens nos arquivos do artefato);
  - Supabase (tabela `celulas` em `docs/supabase.sql`);
  - JSON (exportar/importar);
  - MCP local em `~/.geomannequin/celulas` (`GM_CELULAS`).

### Linguagem (Name)
- `quadro N celula <id>` ou `quadro N celula "busca"` (a busca não repete célula dentro do texto). `celulas a, b, c` vira uma sequência de quadros.
- `recorte caber|cheio`.
- **Balões na célula:** `fala esquerda|centro|direita|(u,v)|rostoN "…"`, `grita`, `pensa`, `sussurra`, `narra`.
- **Painéis:** `borda triangulo [cima|baixo|esquerda|direita|sup-esq|sup-dir|inf-esq|inf-dir]`, `losango`, `trapezio`, `circulo`, `explosao`, `poligono "x,y …"`.
  - `junto` divide a célula com o quadro anterior: com um triângulo antes, faz a diagonal de canto a canto; senão, faixas inclinadas.
  - Os balões ficam dentro do maior retângulo que cabe no painel.
- **Cena em lote:**
  - `espalha N pessoas|animal X|objeto X|efeito X em area (x,z) (x,z)`, com `olhando` / `gira` / `pose` (fixa, aleatória ou aleatória de uma categoria) / `distancia` / `semente` / `nome`;
  - `grupo A, B … pose | olha | gira | move | alinha fila|grade|circulo|arco`;
  - `apaga` e `duplica` (só no palco).
- Manual: capítulos 56 a 59.

### Palco e tabuleiro (mouse)
- **Palco:**
  - clique escolhe pessoa ou objeto (Shift/Ctrl soma);
  - arrastar objeto move no chão (o grupo todo, se houver vários escolhidos);
  - botão direito em alguém: orientar com seta, olhar para cá, pose, pose aleatória por categoria, olhar para uma pessoa, alinhar, virar, duplicar, apagar;
  - botão direito no vazio: levar a seleção para cá, virar para cá, câmera olha para cá, colocar algo;
  - tecla **O** liga a seta de orientação.
- **Planta (Inspetor → Posição):**
  - seleção por caixa; arrastar um escolhido move o grupo todo;
  - caixa vazia vira uma **área** → botão direito → Gerar (o quê, quantos, para onde olham, pose, distância, variação), mostrando o texto `espalha` equivalente;
  - câmera desenhada e arrastável (lugar e alvo);
  - setas e Delete;
  - Alt+arrastar desloca a vista.
- Cada ação de mouse escreve a linha equivalente no histórico da barra.

### Aprender (F1)
- 11 capítulos com cursor-fantasma que faz de verdade: palco, comando, inspetor, planta e grupos, área, efeitos, veículos e sentar, Name, pacotes, filme, nuvem e MCP.
- Modo automático, passos "agora você" e volta à cena de antes.

### MCP / linha de comando
- `celulas_importar`, `celulas_ver`, `celulas_classificar`, `celulas_buscar`, `celulas_catalogo`, `miniaturas` (poses por categoria, animações, células).
- `linha_no_palco` aceita `espalha`, `grupo`, `apaga` e `duplica`.
- `paginas_hq` e `webtoon` aceitam quadros de célula.

## Testes
- `testes/celulas-pacotes.mjs`: grade (6 formatos, irregular, fundo preto, forçada, japonesa), ZIP guardado e deflate, nomes, ficha, busca, DSL, página, exportar/importar e MCP de ponta a ponta, com persistência entre sessões.
- `testes/lote-palco.mjs`: espalha, grupo, apaga e duplica, no palco e no Name.
- Navegador (Playwright): janela Pacotes, planta com caixa, menu, círculo, seta e área, e o tutorial inteiro (11 capítulos, sem erros de página).

## Limites conhecidos
- Faixa branca que atravessa a folha inteira dentro das cenas pode virar falsa calha: há aviso e `grade NxM` resolve.
- A classificação vem da IA (o app sozinho não entende a imagem).
- Imagens na nuvem do artefato: até cerca de 20 MB cada; as células são guardadas com no máximo 1024 px de lado.
- O MCP remoto (HTTP) guarda o catálogo só durante a conversa (use exportar).
