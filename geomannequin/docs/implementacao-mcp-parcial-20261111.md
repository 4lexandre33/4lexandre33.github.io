# GeoMannequin — execução técnica do plano MCP, revisão de 11/11/2026

**Branch:** feat/geomannequin-grip-v3-hardening-20261110  
**PR:** #20 (draft, NÃO mesclada)  
**Task graph:** task-graph-mcp-integral-20261111.md — 24 fases, 240 tarefas com critérios de aceite.  
**Situação:** avanço parcial significativo da implementação. Nenhum gate final está aprovado até rodar os testes e validar distribuição.

## Entregas implementadas no código-fonte

1. **Segurança HTTP:** executar_codigo remoto desativado independentemente de GM_ALLOW_CODE; roteiro_quadros com JS do usuário bloqueado no HTTP; stdio local continua sendo explicitamente confiável.
2. **Roteiro remoto seguro:** ferramenta roteiro_declarativo com até 8 quadros e ações enumeradas (criar/posicionar objetos e manequins, alterar rig, câmera, pegar, soltar, avançar física). Não invoca new Function, eval ou vm com entrada remota.
3. **Operações transacionais:** operacoes_lote com até 64 ações enumeradas, prévia opcional e rollback de cena em erro; histórico explícito para lote confirmado.
4. **Preensão:** ferramenta preensao com pegar, soltar, adicionar segunda mão, transferir mão principal, listar e inspecionar. grip_sites permite listar/consultar/criar pontos locais.
5. **Objetos 3D:** ferramenta objeto_3d com inspeção, posicionamento XYZ, yaw/pitch/roll e eixos locais frente/cima.
6. **Física aproximada:** ferramenta fisica com queda, passos, simulação, pouso, interrupção e consulta do estado.
7. **Câmera anatômica:** ferramenta camera_anatomica com frente, costas, perfis, seguimento, foco regional, orientação e até oito capturas de vista.
8. **Anatomia e aparência:** anatomia_mcp controla cabeça, gesto, dedos/articulações, expressão e exporta estudo de cabeça SVG; aparencia_mcp controla paletas, camadas, modos e efeitos.
9. **Utilitários:** capacidades_mcp descobre capacidades e métodos; rig_parametro controla parâmetros anatômicos; historico_mcp expõe snapshots, undo e redo; contato_fisico consulta/ajusta colisões; artefatos_mcp exporta SVG, PNG, JSON, OBJ de cabeça V3/V4 e ZIP.
10. **Widget ChatGPT:** adicionados campos e botões para pegar cadeira, segunda mão, trocar mão principal, soltar (inclusive queda) e avançar a física. O widget solicita operações MCP tipadas e renderização após mutações.
11. **Servidor HTTP:** GM_TOKEN obrigatório em HTTP publicado; GM_HTTP_LOCAL_DEV=1 habilita apenas loopback; CORS por origem permitida; rate limit por IP; SSE legado desativado por padrão.
12. **Dist e versionamento:** build passa a gerar fingerprint de origem; verify:dist confere arquivos, módulos, hashes e ferramentas incluídas. A automação CI testa MCP source e dist e reprova pacote desatualizado.
13. **Testes e docs:** suites do MCP alteradas para bloquear JS no HTTP; nova suite de contratos stdio/HTTP para grip/física/câmera/exportação/roteiro/dry-run. README e documentação pesquisável incluem as ferramentas e a segurança.

## Inventário do servidor pós-alterações na fonte

- **25 ferramentas MCP originais** mantidas.
- **14 novas ferramentas MCP** distribuídas entre tools-control, tools-anatomy e tools-storyboard.
- **Total esperado no servidor-fonte atualizado: 39 ferramentas.**
- **Recursos:** 3 recursos originais (referência, cena atual e widget). **Prompts:** 6 prompts originais.
- Não equivale a 39 ferramentas disponíveis em produção: a PR não foi mesclada e o bundle dist versionado ainda não foi reconstruído.

## Evidência obtida nesta execução

- Arquivos JS do servidor, ferramentas, build, verificação e testes **passaram por parsing sintático isolado** com V8 após remoção dos imports do texto usado para a verificação.
- **11 ferramentas do primeiro módulo** foram registradas e exercitadas por testes isolados com dependências simuladas, incluindo preensão, física, câmera e storyboard declarativo. Esses testes não representam uma execução headless real.
- O código JavaScript do widget com Grip V3 passou na checagem de sintaxe.
- Suite real de testes MCP integrada foi adicionada, mas **não foi executada com sucesso** neste ambiente.
- GitHub Actions da PR tem apresentado falhas/ausência de steps antes da execução dos testes. Não interpretar isso como confirmação do build.

## Pendências bloqueadoras e limitações funcionais

| Gate/área | Estado atual | Para concluir |
|---|---|---|
| G01 segurança | Parcial no HTTP | Revisão do isolamento em todos os caminhos de roteiros, importações, URLs e recursos; testes negativos reais |
| G02 DSL | Parcial | Mais ações, migração completa de roteiros antigos, expressões e iteração limitadas |
| G03 transações | Parcial | Controle de revisão, concorrência e idempotência também nos 25 endpoints antigos |
| G04 schemas | Parcial | Gerador de contrato único, cobertura automática completa |
| G05 servidor | Parcial | Stress, isolamento, proxy/origens e auth validados em produção |
| G06 dist | **Bloqueado** | Rodar npm run build, versionar dist atualizado e passar verify:dist |
| G07 testes | **Bloqueado** | npm test, npm run test:dist e suite do motor executarem com PASS |
| G08–G16 núcleo | Parcial | Cobrir todas as operações ainda não mapeadas e confirmar paridade real |
| G17 timeline | **Não implementado integralmente** | Keyframes, interpolação, seeking e persistência na aplicação |
| G18 storyboard | Parcial | Paridade com roteiros complexos antigos, páginas e passes do novo DSL |
| G19 referências IA | Legado existente | Paridade de todos os passes com novas ferramentas e schemas |
| G20 arquivos | Parcial | Revalidação de MIME, tamanhos, limites e downloads grandes |
| G21 widget | Parcial | Testes no cliente ChatGPT e atualização de estado/reconexão |
| G22 documentação | Parcial | Gerar documentação a partir de schema, exemplos de ponta a ponta |
| G23 produção | **Não iniciado** | Liberação só após todos os gates P0 e validação integrada |

## Regra de não superestimar o estado

Os 240 itens do task graph NÃO estão concluídos. As alterações descritas aqui correspondem a implementação de rotas e incrementos de alguns grupos e precisam passar por seus próprios critérios de aceite antes de marcar as tarefas como feitas. O pacote dist no repositório pode continuar com 18 módulos e sem as novas ferramentas até a reconstrução ser realizada. O servidor Render segue a versão publicada na branch principal, não a PR draft.

## Como verificar em um checkout completo

    cd geomannequin
    npm ci
    npm ci --prefix mcp
    npm run testar
    npm run construir
    cd mcp
    npm test
    npm run build
    npm run verify:dist
    npm run test:dist

Após testes, executar revisão de segurança, aprovar PR e publicar pacote dist/serviço remoto. A versão atual da PR não deve ser rotulada como pronta para produção.
