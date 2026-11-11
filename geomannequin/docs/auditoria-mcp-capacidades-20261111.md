# GeoMannequin — auditoria de capacidades do MCP (11/11/2026)

**Escopo:** comparação estática entre `mcp/lib/tools.mjs`, `mcp/server.mjs`,
`mcp/lib/core.mjs`, `mcp/lib/scene.mjs`, `mcp/test/run.mjs`,
`mcp/build.mjs`, `mcp/dist/scene/ordem.json` e `src/scene/*`
na branch `feat/geomannequin-grip-v3-hardening-20261110`.
Esta auditoria **não** é um teste do serviço remoto em produção nem comprova
a execução integrada da suíte MCP.

## Inventário de exposição

### Ferramentas MCP (25)

1. `nova_cena`: reiniciar cena;
2. `adicionar_manequim`: inserir com corpo, pose, aparência;
3. `editar_manequim`: pose, gestos, articulações, posição, olhar, expressões;
4. `copiar_manequim`;
5. `remover_manequim`;
6. `camera`: perspectiva, lente, distância, órbita, enquadramento, eixo, alvo;
7. `descrever_cena`: descrição livre;
8. `objetos`: adicionar, editar, copiar, remover, listar;
9. `luz`;
10. `aparencia_cena`: tema, camadas, sombras, horizonte;
11. `listar_cena`;
12. `renderizar`: PNG e SVG opcional;
13. `roteiro_quadros`: script de storyboard, passes, páginas, até 12 imagens por chamada;
14. `referencias_controlnet`: OpenPose, profundidade, normais, máscaras, partes, bordas;
15. `vistas_em_volta`: giro N, ficha 4/8, folha;
16. `estimar_poses`: Monte Carlo;
17. `planta_da_cena`: planta e perfil;
18. `camadas_da_cena`: camadas, foto, SVG;
19. `colisoes`: consultar, corrigir, permitir contato, desfazer correção;
20. `exportar_cena`: JSON e link;
21. `carregar_cena`: JSON e link;
22. `referencia`: documentação da API;
23. `executar_codigo`: executar script JavaScript quando permitido;
24. `search`: buscar documentação;
25. `fetch`: buscar documento por ID.

### Recursos MCP (3)

- `geomannequin://referencia`
- `geomannequin://cena/atual`
- `ui://widget/geomannequin.html`

### Prompts MCP (6)

- `cena_de_referencia`
- `estudo_de_perspectiva`
- `storyboard_manga`
- `ficha_de_personagem`
- `referencias_controlnet`
- `expressoes_e_maos`

### Comportamento por instalação

- **stdio (local):** `executar_codigo` ligado se `GM_ALLOW_CODE !== "0"`; a cena dura o processo.
- **HTTP (remoto):** `executar_codigo` desligado salvo `GM_ALLOW_CODE=1`; sessões independentes, TTL padrão de 45 min e limite padrão de 200 sessões.
- O widget ChatGPT mostra resultados de `renderizar`, `roteiro_quadros`,
  `referencias_controlnet`, `vistas_em_volta`, `planta_da_cena`.
  Apenas `camera` e `renderizar` estão marcados `widgetAccessible`.
- A UI do widget implementa órbita da câmera, galeria, passes e abertura no
  aplicativo, mas não controles próprios de preensão, física ou timeline.

## Diferenças entre motor/editor e ferramentas MCP dedicadas

| Área | API de cena | Ferramenta MCP tipada | Situação |
|---|---|---|---|
| Segurar/soltar | `cena.segurarObjeto`, `cena.soltarObjeto` | — | Ausente |
| Duas mãos | `segunda:true`, `exigirContato` | — | Ausente |
| Troca mão condutora | `cena.transferirMaoPrincipal` | — | Ausente |
| Diagnóstico vínculo | `cena.vinculos`, `cena.inspecionarPreensao` | — | Ausente |
| Pontos de pega | `obj.pontosDeAgarre`, `obj.criarPontoAgarre` | — | Ausente |
| Orientação e movimento 3D do objeto | `obj.posicao3D`, `obj.rotacao3D`, `obj.orientacao` | `objetos` tem só x,z,giro plano e medidas | Parcial |
| Gravidade/queda | `obj.cair`, `cena.avancarFisica`, `cena.simularQueda` | — | Ausente |
| Soltura/pouso | `obj.pousar`, `obj.pararQueda` | — | Ausente |
| Câmera anatômica precisa | `camera.ver`, `camera.costas`, `camera.frente`, `camera.seguir` | `camera.orbitar` genérico | Parcial |
| Foco/captura regional | `camera.area`, `camera.capturarVistas` | órbita/ficha existentes | Parcial |
| Contato preciso | `cena.contatoV2`, `cena.contatosFisicos`, `m.tocar` | `colisoes` legado | Parcial |
| Exportação SVG/OBJ/ZIP | `cena.exportarSVG/OBJ/ZIP` | `renderizar` SVG opcional; JSON | Parcial |
| Histórico | `cena.marcarEstado/desfazer/refazer` | — | Ausente |
| Inspeção de capacidades | `cena.comandos`, `cena.capacidades` | `referencia` textual | Parcial |

**Importante:** o `executar_codigo` local pode alcançar os métodos do motor
que foram compilados e incluídos no pacote; `roteiro_quadros` executa JS,
mas **não** deve ser tratado como alternativa segura de `executar_codigo`
no HTTP.

## Achados prioritários

### P0 — Segurança: JavaScript de roteiro executado sem isolamento

`mcp/lib/tools.mjs` permite chamar `roteiro_quadros` no HTTP com um
roteiro contendo JavaScript e chama `w.executarRoteiro(a.roteiro)`.
`src/scene/quadros.js`, em `rodarBloco`, executa esse JavaScript por
`new Function(...)`, sem timeout por bloco e sem um sandbox Node de
segurança. Portanto a proibição de `executar_codigo` no HTTP **não**
bloqueia esse outro caminho de execução. Não disponibilizar esse executor
para entrada pública não confiável antes de substituir por comandos
declarativos validados ou por isolamento forte em um processo separado,
com limites de CPU, memória e tempo, sem acesso ao host. Exigir
autenticação e limitação de requisições. Esta é uma vulnerabilidade
**identificada por leitura do código**, sem tentativa de exploração em produção.

### P0 — `dist/` está desatualizado

`src/scene/ordem.json` referencia **25** módulos. O
`mcp/dist/scene/ordem.json` versionado referencia apenas **18** e omite:

- `biotipos.js`, `contato-v2.js`, `preensao-v2.js`, `grip-v3.js`,
  `toque-v2.js`, `regioes-orbita.js`, `orientacao-frames.js`.

O `dist/scene/comandos.js` não contém `segurarObjeto`,
`avancarFisica`, `transferirMaoPrincipal` nem as novas câmeras.
Como `mcp/build.mjs` gera `dist/server.mjs` e copia `src/scene`,
o pacote distribuído só alcançará a API nova após reconstrução/testes.
Não presumir que um servidor remoto já recebeu a atualização.

### P1 — Paridade e descoberta de comandos

Criar ferramentas MCP tipadas para a preensão, física, câmera orientada e
gerenciamento 3D de objetos, sem exigir JavaScript remoto arbitrário.
Atualizar `README`, `referencia` e `search/fetch` para mencionar Grip V3.
Os testes do MCP (aproximadamente 72 chamadas `check`) cobrem recursos
antigos, mas **não citam Grip V3 nem dinâmica**.

### P1 — Ausência de cobertura de segurança/regressão

Adicionar testes MCP stdio e HTTP que verifiquem:
- `GM_ALLOW_CODE=0` não aceita nenhuma via de código não confiável;
- cena após erro: rollback; bloqueio de repetição de posse por mão;
- pegar cadeira com mão direita/esquerda, transferir, movimentar e soltar;
- `queda`, estado/tempo, determinismo e salvar/restaurar JSON;
- motor distribuído `dist` tem a mesma lista de módulos/comandos;
- sem quebra de OpenPose, imagens, links de cena, storyboard, widget.

### P2 — Exportação, widgets e documentação

Criar exportação MCP explícita de OBJ e ZIP, se o contrato/cliente aceitar
tamanho e tipo de arquivo; fornecer representação adequada para SVG, JSON,
passes e atlas. Expor botões de preensão e timeline no widget somente depois
de protocolos seguros. Distinguir operações dependentes de navegador, pois
`cena.exportarPNG` nativa falha no headless, enquanto `renderizar`
usa conversão SVG→PNG própria do servidor.

## Task graph recomendado

```text
MCP-00 Auditoria [concluído: inspeção estática]
  ├─ MCP-01 Isolar/remover execução JS não confiável em roteiro [P0]
  ├─ MCP-02 Autenticação e limites de recursos da API [P0]
  ├─ MCP-03 Reconstruir dist após atualizar a segurança [P0]
  ├─ MCP-04 Testar MCP stdio + HTTP + dist [P0]
  ├─ MCP-05 Ferramentas tipadas de preensão V3 e GripSites [P1]
  ├─ MCP-06 Ferramentas tipadas de gravidade/tempo/colisão [P1]
  ├─ MCP-07 Câmera anatômica, região e seguimento [P1]
  ├─ MCP-08 Inspeção/API de objetos 3D, cena e histórico [P1]
  ├─ MCP-09 Exportação OBJ/ZIP e entregáveis visuais [P2]
  ├─ MCP-10 Widget: pegar, soltar, trocar mão, animar [P2]
  ├─ MCP-11 Paridade editor/MCP e contrato de schemas Gemini [P1]
  ├─ MCP-12 Atualizar docs/resources/search/prompts [P1]
  └─ MCP-13 Validação visual, desempenho e rollout [P2]
```

## Como confirmar num checkout (Node 22 recomendado)

```sh
cd geomannequin
npm ci
npm ci --prefix mcp
npm run testar:grip-v3
npm run construir
cd mcp
npm test
npm run build
npm run test:dist
```

A execução integral destes comandos **não foi validada nesta auditoria**.
GitHub Actions da PR #20 retornou falhas imediatas, sem logs de etapas úteis.
A conectividade HTTP do serviço remoto não pôde ser confirmada por inspeção
externa. Esta auditoria não demonstra que o MCP remoto está disponível,
conectado ao ChatGPT ou atualizado.
