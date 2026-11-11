# GeoMannequin MCP

Servidor MCP que deixa o **Claude**, o **ChatGPT** e o **Gemini** montarem cenas do GeoMannequin conversando: adicionar manequins, posar, posicionar em perspectiva, mudar câmera, lente e luz, ligar sombras e horizonte, e devolver a **imagem** da cena e um **link** que abre a mesma cena no app:
<https://4lexandre33.github.io/geomannequin/>

O servidor usa os mesmos módulos do app durante o desenvolvimento; o pacote dist requer reconstrução e verificação de paridade após mudanças.

## Ferramentas MCP V3 na branch de desenvolvimento

O código-fonte desta branch registra 14 ferramentas tipadas adicionais às 25 antigas. Elas não devem ser tratadas como disponíveis no pacote dist ou no serviço remoto antes de reconstruir, testar e publicar.

| Ferramenta | Ações e finalidade |
|---|---|
| capacidades_mcp | Descobrir métodos, parâmetros, limites e capacidades |
| rig_parametro | Consultar e alterar ângulos e parâmetros do manequim |
| objeto_3d | Ler e alterar posição 3D, rotação e frente/cima |
| grip_sites | Consultar ou criar pontos de agarre |
| preensao | Segurar, segunda mão, transferir, soltar e inspecionar |
| fisica | Cair, avançar, simular, pousar, parar e consultar |
| camera_anatomica | Frente, costas, perfis, seguir, focar e capturar |
| historico_mcp | Marcar estado, desfazer, refazer e consultar |
| contato_fisico | Detectar e resolver contatos aproximados |
| artefatos_mcp | Exportar PNG, SVG, JSON, OBJ (cabeça) e ZIP |
| roteiro_declarativo | Storyboard seguro por quadros e ações tipadas |
| operacoes_lote | Executar até 64 ações com prévia e rollback |
| anatomia_mcp | Cabeça, expressão, dedos, articulações e estudo anatômico |
| aparencia_mcp | Camadas, estilo, modo, luz ambiente e visibilidade |

### Exemplo de preensão via ferramentas

- objetos: adicionar cadeira com nome Cadeira 1;
- grip_sites: listar pontos da Cadeira 1;
- preensao: segurar com mao direita, ponto encostoTopo, modo encaixar e reach 5;
- rig_parametro: definir armFlexR = 45;
- preensao: soltar a Cadeira 1 com modo queda;
- fisica: simular duracao 3, passo 1/60.

O IK pode não alcançar um GripSite. A física é aproximada por subpassos e não deve ser apresentada como solver bilateral e dinâmica de corpo rígido exatos.

### Segurança do servidor

- O HTTP nunca permite JavaScript arbitrário por executar_codigo, mesmo se GM_ALLOW_CODE=1.
- Roteiro legada com scripts JavaScript só existe no MCP stdio local confiável.
- Para HTTP, usar roteiro_declarativo com ações enumeradas e validadas.
- node:vm não constitui sandbox de segurança para código não confiável.
- GM_TOKEN é obrigatório em HTTP publicado. Exceção GM_HTTP_LOCAL_DEV=1 vincula somente ao loopback 127.0.0.1.
- CORS não usa mais origem universal. Configure GM_ALLOWED_ORIGINS com origens exatas se necessário.
- Prefira token em Authorization Bearer a token na URL, que pode aparecer em logs e históricos.
- As operações tipadas de mutação possuem snapshot e rollback. A segurança e desempenho precisam ser validados em execução real.

### Compilação e paridade source/dist

O pacote dist na auditoria continha 18 módulos, enquanto a fonte continha 25. Reconstruir e executar testes num checkout Node:

    cd geomannequin
    npm ci
    npm ci --prefix mcp
    npm run testar:grip-v3
    cd mcp
    npm test
    npm run build
    npm run verify:dist
    npm run test:dist

O build passa a gerar um arquivo source-manifest.json em dist com hash dos arquivos-fonte. O verificador compara os 25 módulos e o hash, detectando distribuições desatualizadas. Sem testes integrados e novo deploy, a atualização remota não é comprovada.

## Ferramentas

| Ferramenta | O que faz |
|---|---|
| `nova_cena` | Começa do zero (tema claro/escuro, modo manequim/construção) |
| `adicionar_manequim` | Novo manequim com nome, posição `x`/`z`, giro, corpo, pose e cor (cores nunca se repetem) |
| `editar_manequim` | Muda posição, giro, pose, corpo, cor ou nome; orientar por eixo, deitar, sentar/subir/encostar, saltar, olhar, apontar, mão/pé num ponto, gestos, articulações pelo nome (com limites anatômicos), espelhar, copiar pose, expressão do rosto, olhar, boca, cada falange dos dedos (via `articulacoes`), `validar` (partes atravessando / limites acoplados) |
| `descrever_cena` | Monta a cena a partir de uma frase: “manequim 1 sentado, manequim 2 deitado ao longo do eixo x, manequim 3 saltando olhando para baixo, câmera no eixo z, elevação alta” |
| `planta_da_cena` | Vista de cima e lateral da composição (blocking), com profundidade e % da altura da foto de cada manequim |
| `objetos` | Banco, cadeira, caixa, degrau, mesa e parede para os manequins se apoiarem |
| `copiar_manequim` / `remover_manequim` | Copia ou remove |
| `camera` | Eixo (x, −x, z, −z, de cima), elevação (alta, média, olhos, baixa), plano, perspectiva, lente (18–200 mm), distância, giro, alvo, posição, altura dos olhos, enquadrar, **órbita** em volta de um pivô (manequim, grupo, objeto, ponto ou cena: `orbitar: {alvo, azimute: "3/4 esquerda", elevacao}`) e `pivo`; planos de quadrinhos (`enquadramento`: detalhe, close, primeiro plano, médio, americano, inteiro, geral, com `quem` e `tercos`) e `angulo` (plongée, contra-plongée, zenital, nadir, holandês); `desenhar` devolve a imagem junto |
| `roteiro_quadros` | Storyboard por código (`#cena`, `#quadro 1 — título`, `#orbita "Ana" 8`, `#ficha "Ana"`): imagem de cada quadro, página de mangá e referências — contorno, OpenPose completo (BODY_25 + mãos + rosto, estilo DWPose) ou só corpo, profundidade, normais, máscara, partes do corpo, canny |
| `referencias_controlnet` | Passes da cena aberta, sem roteiro: contorno, OpenPose completo (corpo BODY_25 + mãos 21 + rosto 70, confiança 0,5 = escondido; estilo DWPose) ou só corpo, profundidade, normais, máscara, partes do corpo (com legenda) e canny, no formato pedido (16:9, 1:1, vertical…), com o JSON do OpenPose |
| `vistas_em_volta` | Giro 360° (N vistas) ou ficha do personagem (frente, 3/4, perfil, costas; completa = 8) em volta de manequim, grupo, objeto, ponto ou cena; elevação, orto, passes por vista e folha de contato |
| `estimar_poses` | Quantas poses o manequim consegue fazer (Monte Carlo): combinações, fração válida (sem partes atravessando nem limites acoplados), poses válidas com intervalo de 95% |
| `luz` | Direção e altura da luz |
| `aparencia_cena` | Tema noturno, modo, estilo, sombras, horizonte e pontos de fuga, atmosfera, camadas |
| `renderizar` | Desenha e devolve PNG + link do app. No ChatGPT abre o widget com botões para **girar a câmera em volta do pivô** (8 vistas, ±15°, ±10°) ali mesmo, tela cheia e “Abrir no GeoMannequin” |
| `camadas_da_cena` | Cena em camadas: ordem (de trás para a frente), congelados/ocultos, quem faz sombra em quem; SVG com uma camada por manequim e foto .svg/.png de um manequim só |
| `colisoes` | Lista quem atravessa quem e corrige (auto, distancia, giro, pose), permite contato proposital ou desfaz |
| `listar_cena`, `exportar_cena`, `carregar_cena` | Ver, salvar (JSON) e recarregar (JSON ou link) |
| `referencia` | Poses rápidas, tipos corporais, parâmetros e limites |
| `executar_codigo` | Roda o mesmo código do editor do app (`cena.adicionar(...)`, `camera.lente(35)`…). Ligado no modo local; desligado no servidor público |
| `search`, `fetch` | Pesquisa na documentação (exigidas pelo ChatGPT) |

Também há recursos (`geomannequin://referencia`, `geomannequin://cena/atual`) e prompts prontos: “Montar cena de referência para desenho”, “Estudo de perspectiva”, “Storyboard de mangá”, “Ficha de personagem e giro 360°”, “Referências para gerar a imagem com IA (ControlNet)” e “Estudo de expressões e mãos”. A `referencia` tem os assuntos `rig` (expressões, gestos, dedos, rosto, pés, limites), `camera` (órbita, planos, ângulos) e `controlnet` (passes e formato do OpenPose); o `search`/`fetch` do ChatGPT acha tudo isso.

**No ChatGPT:** as ferramentas visuais (`renderizar`, `roteiro_quadros`, `referencias_controlnet`, `vistas_em_volta`, `planta_da_cena`) abrem o widget do GeoMannequin: galeria dos quadros/vistas com abas para cada passe (OpenPose, profundidade, normais, máscara, partes com legenda, bordas), falas do quadro, página de mangá ou folha de contato, tela cheia e “Abrir no GeoMannequin”. Na imagem da cena, os botões de órbita giram a câmera e redesenham sem sair do chat (o widget chama `camera` com `desenhar`). Todas as ferramentas mostram o que estão fazendo enquanto rodam. O ChatGPT não deixa o widget baixar arquivos: o .zip completo (todos os passes de todos os quadros) é baixado no app pelo link.

Medidas: **R** = raio da cabeça; o manequim tem cerca de **16 R** de altura. No chão, `x` vai para os lados e `z` para frente (+) e para trás (−).

## Instalar no computador (Claude Desktop, Claude Code, Gemini CLI)

Precisa só do [Node.js](https://nodejs.org) 18 ou mais novo. O servidor já vem pronto em `mcp/dist/server.mjs`, **sem `npm install`**.

1. Baixe este repositório (botão **Code → Download ZIP** no GitHub) e descompacte. O servidor pronto é a pasta `geomannequin/mcp/dist` (ela já traz tudo o que precisa).
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
| `GM_ALLOW_CODE` | `0` no HTTP, ligado no local | Código local confiável pode ser desligado com 0. HTTP nunca permite JavaScript arbitrário. |
| `GM_APP_URL` | página do GitHub Pages | Endereço do app usado nos links |
| `GM_MAX_SESSIONS` | 200 | Conversas simultâneas |
| `GM_SESSION_TTL_MIN` | 45 | Minutos até uma conversa parada ser descartada |

Cada conversa tem a sua cena. Para continuar uma cena outro dia, peça o link (ou `exportar_cena`) e depois `carregar_cena` com ele.

## Exemplos de pedidos

- “Crie três manequins em fila se afastando, câmera na altura dos olhos com lente de 35 mm, com horizonte e sombras, e me mostre.”
- “Coloque a Ana agachada de costas para a câmera, vista de baixo, em modo noturno.”
- “Troque a lente para 135 mm e compare com 24 mm.”
- “Manequim 1 sentado numa cadeira olhando para a câmera, manequim 2 deitado de bruços ao longo do eixo z, manequim 3 saltando, câmera no eixo x em contra-plongée.”

## Desenvolvimento

```
npm install
npm test          # testa todas as ferramentas em stdio e HTTP (inclui checagem dos esquemas para o Gemini)
npm run build     # gera dist/ (servidor em arquivo único, usado pela extensão e pela instalação local)
npm run verify:dist # verifica módulos e hash de fonte no dist/
npm run test:dist   # testa o dist/
npm start         # servidor HTTP em http://localhost:8787/mcp
```

Depois de mudar o código em `lib/`, em `../src/engine` ou em `../src/scene`, rode `npm run build` e envie o `dist/` junto.

As imagens PNG são geradas com o resvg em WebAssembly (funciona em qualquer sistema). A fonte DejaVu Sans (em `fonts/`) é usada nos textos das imagens; licença em `fonts/LICENSE-DejaVu.txt`.
