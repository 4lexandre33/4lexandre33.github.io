# GeoMannequin MCP

Servidor MCP que deixa o **Claude** e o **ChatGPT** montarem cenas do GeoMannequin conversando: adicionar manequins, posar, posicionar em perspectiva, mudar câmera, lente e luz, ligar sombras e horizonte, e devolver a **imagem** da cena e um **link** que abre a mesma cena no app:
<https://4lexandre33.github.io/geomannequin/>

O servidor usa o próprio app (`../index.html`) como motor de desenho, então qualquer melhoria no app vale também para o MCP.

## Ferramentas

| Ferramenta | O que faz |
|---|---|
| `nova_cena` | Começa do zero (tema claro/escuro, modo manequim/construção) |
| `adicionar_manequim` | Novo manequim com nome, posição `x`/`z`, giro, corpo, pose e cor (cores nunca se repetem) |
| `editar_manequim` | Muda posição, giro, pose, corpo, cor ou nome |
| `copiar_manequim` / `remover_manequim` | Copia ou remove |
| `camera` | Perspectiva, lente (18–200 mm), distância, giro, alvo, posição, altura dos olhos, enquadrar |
| `luz` | Direção e altura da luz |
| `aparencia_cena` | Tema noturno, modo, estilo, sombras, horizonte e pontos de fuga, atmosfera, camadas |
| `renderizar` | Desenha e devolve PNG + link do app (no ChatGPT aparece num quadro com botão “Abrir no GeoMannequin”) |
| `listar_cena`, `exportar_cena`, `carregar_cena` | Ver, salvar (JSON) e recarregar (JSON ou link) |
| `referencia` | Poses rápidas, tipos corporais, parâmetros e limites |
| `executar_codigo` | Roda o mesmo código do editor do app (`cena.adicionar(...)`, `camera.lente(35)`…). Ligado no modo local; desligado no servidor público |
| `search`, `fetch` | Pesquisa na documentação (exigidas pelo ChatGPT) |

Também há recursos (`geomannequin://referencia`, `geomannequin://cena/atual`) e prompts prontos (“Montar cena de referência para desenho”, “Estudo de perspectiva”).

Medidas: **R** = raio da cabeça; o manequim tem cerca de **16 R** de altura. No chão, `x` vai para os lados e `z` para frente (+) e para trás (−).

## Instalar no computador (Claude Desktop e Claude Code)

Precisa do [Node.js](https://nodejs.org) 18 ou mais novo.

1. Baixe a pasta `geomannequin` deste repositório (botão **Code → Download ZIP** no GitHub) e descompacte.
2. Num terminal, dentro de `geomannequin/mcp`, rode:
   ```
   npm install
   ```
3. **Claude Desktop**: abra o arquivo de configuração (Configurações → Desenvolvedor → Editar configuração) e adicione:
   ```json
   {
     "mcpServers": {
       "geomannequin": {
         "command": "node",
         "args": ["C:/caminho/para/geomannequin/mcp/server.mjs"]
       }
     }
   }
   ```
   Troque o caminho pelo da sua pasta (no Mac/Linux, algo como `/Users/voce/geomannequin/mcp/server.mjs`) e reinicie o Claude Desktop.
4. **Claude Code**:
   ```
   claude mcp add geomannequin -- node /caminho/para/geomannequin/mcp/server.mjs
   ```

## Servidor na internet (claude.ai e ChatGPT)

O claude.ai e o ChatGPT só se conectam a servidores com endereço público `https`. O GitHub Pages não roda servidores, então o MCP fica num serviço à parte. O repositório já traz a configuração para o **Render** (plano grátis):

1. Entre em <https://render.com> com sua conta do GitHub.
2. **New → Blueprint** e escolha o repositório `4lexandre33.github.io`. O Render lê o `render.yaml` da raiz e cria o serviço `geomannequin-mcp`.
3. Ao terminar, abra o serviço → **Environment** e copie o valor de `GM_TOKEN` (senha gerada automaticamente).
4. Seu endereço MCP será:
   ```
   https://geomannequin-mcp.onrender.com/mcp?token=SEU_GM_TOKEN
   ```
   (o nome pode variar; confira o endereço no topo da página do serviço).

No plano grátis o servidor “dorme” após uns 15 minutos sem uso; a primeira chamada depois disso demora cerca de 1 minuto.

**claude.ai**: Configurações → Conectores → Adicionar conector personalizado → cole o endereço acima.

**ChatGPT**: Configurações → Apps e Conectores → Avançado → ative o **modo desenvolvedor** → Criar conector → cole o endereço acima, autenticação “Sem autenticação” (a senha já vai no endereço). Os nomes dos menus podem mudar com atualizações do ChatGPT.

Outras hospedagens: o `Dockerfile` funciona em Railway, Fly.io, Google Cloud Run ou um servidor próprio (`docker build -f mcp/Dockerfile .` a partir da pasta `geomannequin`).

### Variáveis do servidor

| Variável | Padrão | Para quê |
|---|---|---|
| `PORT` | 8787 | Porta HTTP |
| `GM_TOKEN` | (vazio) | Senha: exige `?token=` no endereço ou `Authorization: Bearer` |
| `GM_ALLOW_CODE` | `0` no HTTP, ligado no local | `1` libera `executar_codigo` no servidor (só faça isso em servidor privado: o código roda no servidor) |
| `GM_APP_URL` | página do GitHub Pages | Endereço do app usado nos links |
| `GM_MAX_SESSIONS` | 200 | Conversas simultâneas |
| `GM_SESSION_TTL_MIN` | 45 | Minutos até uma conversa parada ser descartada |

Cada conversa tem a sua cena. Para continuar uma cena outro dia, peça o link (ou `exportar_cena`) e depois `carregar_cena` com ele.

## Exemplos de pedidos

- “Crie três manequins em fila se afastando, câmera na altura dos olhos com lente de 35 mm, com horizonte e sombras, e me mostre.”
- “Coloque a Ana agachada de costas para a câmera, vista de baixo, em modo noturno.”
- “Troque a lente para 135 mm e compare com 24 mm.”

## Desenvolvimento

```
npm test          # testa todas as ferramentas em stdio e HTTP
npm start         # servidor HTTP em http://localhost:8787/mcp
```

A fonte DejaVu Sans (em `fonts/`) é usada para os textos das imagens PNG; licença em `fonts/LICENSE-DejaVu.txt`.
