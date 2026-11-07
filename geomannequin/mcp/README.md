# GeoMannequin MCP

Servidor MCP que deixa o **Claude**, o **ChatGPT** e o **Gemini** montarem cenas do GeoMannequin conversando: adicionar manequins, posar, posicionar em perspectiva, mudar câmera, lente e luz, ligar sombras e horizonte, e devolver a **imagem** da cena e um **link** que abre a mesma cena no app:
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

## Instalar no computador (Claude Desktop, Claude Code, Gemini CLI)

Precisa só do [Node.js](https://nodejs.org) 18 ou mais novo. O servidor já vem pronto em `mcp/dist/server.mjs`, **sem `npm install`**.

1. Baixe este repositório (botão **Code → Download ZIP** no GitHub) e descompacte. O que importa é a pasta `geomannequin` (ela precisa do `index.html` ao lado da pasta `mcp`).
2. **Claude Desktop**: abra o arquivo de configuração (Configurações → Desenvolvedor → Editar configuração) e adicione:
   ```json
   {
     "mcpServers": {
       "geomannequin": {
         "command": "node",
         "args": ["C:/caminho/para/geomannequin/mcp/dist/server.mjs"]
       }
     }
   }
   ```
   Troque o caminho pelo da sua pasta (no Mac/Linux, algo como `/Users/voce/geomannequin/mcp/dist/server.mjs`) e reinicie o Claude Desktop.
3. **Claude Code**:
   ```
   claude mcp add geomannequin -- node /caminho/para/geomannequin/mcp/dist/server.mjs
   ```

## Gemini

### Gemini CLI — extensão (mais fácil)

```
gemini extensions install https://github.com/4lexandre33/4lexandre33.github.io
```

Confirme a pergunta de confiança. A extensão traz o servidor e um `GEMINI.md` que ensina o Gemini a usar as ferramentas. Confira com `gemini mcp list` (deve aparecer “geomannequin … Connected”) e peça, por exemplo: *“monte três manequins em fila com lente de 35 mm e desenhe”*. Para atualizar: `gemini extensions update geomannequin`.

Sem GitHub, a partir da pasta baixada: `gemini extensions install /caminho/para/a/pasta/do/repositorio`.

### Gemini CLI — configuração manual

Em `~/.gemini/settings.json` (ou `.gemini/settings.json` do projeto):

```json
{
  "mcpServers": {
    "geomannequin": {
      "command": "node",
      "args": ["/caminho/para/geomannequin/mcp/dist/server.mjs"]
    }
  }
}
```

Ou, usando o servidor na internet (seção abaixo):

```json
{
  "mcpServers": {
    "geomannequin": { "httpUrl": "https://geomannequin-mcp.onrender.com/mcp?token=SEU_GM_TOKEN" }
  }
}
```

O Gemini CLI só liga servidores MCP em pastas marcadas como confiáveis; se aparecer “Disabled” em `gemini mcp list`, confie na pasta quando ele perguntar.

### App Gemini (gemini.google.com)

O app aceita servidores MCP na internet como “apps personalizados”: **Configurações → Apps conectados → Apps personalizados → Adicionar** e cole o endereço do servidor da internet (seção abaixo), com o `?token=`. Segundo a documentação disponível, isso só é possível pelo site (não pelo celular) e, por enquanto, com o Gemini em inglês; depois de adicionado, aparece também no celular. Os nomes dos menus podem mudar.

### API do Gemini (seus próprios programas)

O exemplo `exemplos/gemini-api.mjs` liga o servidor e entrega as ferramentas ao Gemini pelo SDK oficial (`mcpToTool`):

```
cd geomannequin/mcp
npm install
npm install @google/genai
GEMINI_API_KEY=sua-chave node exemplos/gemini-api.mjs "duas pessoas conversando, vista de baixo"
```

Sem a chave, ele só lista as ferramentas no formato que o Gemini recebe.

As ferramentas usam só o formato de parâmetros que o Gemini aceita (sem tipos alternativos e sem objetos livres): cada ângulo de pose e medida do corpo é um campo próprio, com a faixa anatômica na descrição.

## Servidor na internet (claude.ai, ChatGPT e app Gemini)

O claude.ai, o ChatGPT e o app Gemini só se conectam a servidores com endereço público `https`. O GitHub Pages não roda servidores, então o MCP fica num serviço à parte. O repositório já traz a configuração para o **Render** (plano grátis):

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
npm install
npm test          # testa todas as ferramentas em stdio e HTTP (inclui checagem dos esquemas para o Gemini)
npm run build     # gera dist/ (servidor em arquivo único, usado pela extensão e pela instalação local)
npm run test:dist # testa o dist/
npm start         # servidor HTTP em http://localhost:8787/mcp
```

Depois de mudar o código em `lib/` ou o app, rode `npm run build` e envie o `dist/` junto.

As imagens PNG são geradas com o resvg em WebAssembly (funciona em qualquer sistema). A fonte DejaVu Sans (em `fonts/`) é usada nos textos das imagens; licença em `fonts/LICENSE-DejaVu.txt`.
