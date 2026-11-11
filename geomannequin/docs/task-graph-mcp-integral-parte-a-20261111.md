# Task Graphs GeoMannequin MCP — Parte A: fundações e entidades (G00–G11)

**Status de todas as tarefas: PLANEJADO.** Esta entrega descreve tarefas, não implementações. Base: auditoria de 11/11/2026, PR #20. O formato `GNN` representa um gate que só fecha quando as 10 tarefas do grupo são aceitas. ID `MCP-NN.XX` é estável. Dependências são explícitas e sem ciclos. A tarefa 10 de cada grupo valida as tarefas 02–09; ela não pode passar antes delas.

## G00 — Inventário executável e definição de paridade [P0]

**Pré-requisitos:** Nenhum · **Gate de saída:** G00, após MCP-00.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-00.01 | Mapear métodos públicos de cena, câmera, manequim e objeto | — | Registro reproduzível inclui todos os métodos retornados por cena.comandos(). |
| MCP-00.02 | Registrar operações das 25 ferramentas MCP atuais | MCP-00.01 | Cada ferramenta possui contrato, versão e ligação à API do motor. |
| MCP-00.03 | Percorrer controles do DOM e handlers da interface | MCP-00.01 | Cada controle acionável aparece na matriz de cobertura ou como exceção justificada. |
| MCP-00.04 | Catalogar parâmetros anatômicos, unidades, limites e aliases | MCP-00.01 | Fonte única registra nomes, domínio, precisão e valores padrão. |
| MCP-00.05 | Distinguir capacidades completas, parciais, experimentais e ausentes | MCP-00.01 | Catálogo não anuncia solver/física inexistentes como prontos. |
| MCP-00.06 | Inventariar recursos de navegador e headless não equivalentes | MCP-00.01 | Cada dependência de DOM/Canvas/download tem alternativa MCP ou limitação formal. |
| MCP-00.07 | Conferir modelo de objetos, GripSites e versões de cena | MCP-00.01 | Mapa de tipos e migrações é consistente com serialização atual. |
| MCP-00.08 | Registrar vínculos entre métodos, UI, MCP e testes | MCP-00.01 | Matriz exportável contém origem e caso de teste para cada operação. |
| MCP-00.09 | Adicionar detector de deriva do inventário | MCP-00.01 | CI reprova método novo sem contrato de capacidade e cobertura. |
| MCP-00.10 | Auditar cobertura inicial e aprovar gate de inventário | MCP-00.02, MCP-00.03, MCP-00.04, MCP-00.05, MCP-00.06, MCP-00.07, MCP-00.08, MCP-00.09 | Relatório lista 100% das operações atuais sem classificações indefinidas. |

## G01 — Segurança: ameaça, isolamento e políticas [P0]

**Pré-requisitos:** G00 · **Gate de saída:** G01, após MCP-01.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-01.01 | Modelar ameaças de MCP HTTP, stdio, links e roteiros | G00 | Documento contempla execução arbitrária, DoS, SSRF, vazamento e sessões. |
| MCP-01.02 | Neutralizar caminho inseguro de new Function em roteiros remotos | MCP-01.01 | Entrada HTTP não confiável jamais alcança JavaScript arbitrário no processo do servidor. |
| MCP-01.03 | Revisar vm de executar_codigo e acesso a objetos do host | MCP-01.01 | Execução confiável local é explicitamente separada de execução remota. |
| MCP-01.04 | Criar autorização por ação e perfil de usuário | MCP-01.01 | Operações read/write/destructive/code possuem política testada e padrão restritivo. |
| MCP-01.05 | Fechar publicação anônima por padrão | MCP-01.01 | Servidor HTTP de produção recusa chamadas não autenticadas. |
| MCP-01.06 | Proteger token, URLs, logs e resumos | MCP-01.01 | Segredos não aparecem em links exportados, respostas, exceções nem telemetria. |
| MCP-01.07 | Estabelecer limites de CPU, memória, tempo, payload e imagens | MCP-01.01 | Excesso de recurso resulta em erro controlado e não derruba serviço. |
| MCP-01.08 | Definir governança de importação de JSON e SVG | MCP-01.01 | Arquivos malformados, recursivos ou gigantes são rejeitados. |
| MCP-01.09 | Criar trilha de eventos sem dados secretos | MCP-01.01 | Logs de auditoria contêm identidade, operação, duração e resultado redigidos. |
| MCP-01.10 | Aplicar testes negativos e autorizar gate de segurança | MCP-01.02, MCP-01.03, MCP-01.04, MCP-01.05, MCP-01.06, MCP-01.07, MCP-01.08, MCP-01.09 | Suite prova bloqueio de scripts, acesso não autorizado e abuso de recursos. |

## G02 — Linguagem declarativa de operações e roteiros [P0]

**Pré-requisitos:** G01 · **Gate de saída:** G02, após MCP-02.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-02.01 | Especificar AST/IR declarativa versionada para controle da cena | G01 | Documento formal define tipos, comandos, valores e ordenação sem eval. |
| MCP-02.02 | Construir parser e validador de AST JSON | MCP-02.01 | Comandos inválidos retornam caminho do campo e erro padronizado. |
| MCP-02.03 | Implementar interpretador baseado em allowlist de operações | MCP-02.01 | Nenhuma entrada de cliente vira código JavaScript. |
| MCP-02.04 | Definir expressões seguras para parâmetros numéricos | MCP-02.01 | Apenas operações aritméticas previstas são permitidas e limitadas. |
| MCP-02.05 | Suportar variáveis de cena e referências estáveis | MCP-02.01 | Etapas podem referenciar objetos criados sem executar scripts. |
| MCP-02.06 | Introduzir sequências e loops limitados declarativamente | MCP-02.01 | Quantidade máxima de iterações e passos é aplicada antes de executar. |
| MCP-02.07 | Migrar marcadores #cena, #quadro, #orbita e #ficha | MCP-02.01 | Roteiros legítimos têm equivalentes declarativos sem perda de semântica. |
| MCP-02.08 | Manter modo JavaScript apenas em ambiente explicitamente confiável | MCP-02.01 | Modo legado local tem aviso e isolamento de processo/limite documentado. |
| MCP-02.09 | Criar migrações e conversores de roteiros existentes | MCP-02.01 | Conversão preserva quadros suportados ou aponta instruções incompatíveis. |
| MCP-02.10 | Aprovar paridade sem eval e testes de scripts adversariais | MCP-02.02, MCP-02.03, MCP-02.04, MCP-02.05, MCP-02.06, MCP-02.07, MCP-02.08, MCP-02.09 | Roteiro remoto não alcança globals e exemplos antigos continuam equivalentes. |

## G03 — Camada de domínio única, estado e transações [P0]

**Pré-requisitos:** G02 · **Gate de saída:** G03, após MCP-03.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-03.01 | Definir DomainController como único ponto de mutação da cena | G02 | Editor, MCP e widget usam as mesmas operações em vez de lógica duplicada. |
| MCP-03.02 | Padronizar identidades, caminhos, nomes e referências de entidades | MCP-03.01 | IDs estáveis sobrevivem a edição, cópia, remoção e JSON. |
| MCP-03.03 | Implementar validação transacional antes do commit | MCP-03.01 | Mutação inválida não altera nenhum objeto, postura ou câmera. |
| MCP-03.04 | Implementar snapshots e rollback atômico | MCP-03.01 | Erro intermediário reverte estado, vínculos, parâmetros e dinâmica. |
| MCP-03.05 | Definir leitura isolada e mutações com revisão do estado | MCP-03.01 | Leituras não alteram cena; revisão impede sobrescrita concorrente. |
| MCP-03.06 | Adicionar operações em lote com prévia e confirmação | MCP-03.01 | Dry-run informa alterações e lote real é tudo-ou-nada. |
| MCP-03.07 | Estabelecer idempotência para ferramentas com repetição | MCP-03.01 | Mesmo request-id não duplica manequins, objetos ou ações. |
| MCP-03.08 | Serializar operações concorrentes por sessão | MCP-03.01 | Duas chamadas simultâneas não corrompem estados ou histórico. |
| MCP-03.09 | Propagar eventos de domínio para renderização e widget | MCP-03.01 | Modificação gera evento tipado com IDs e versão nova. |
| MCP-03.10 | Provar transações e identidade em casos de falha | MCP-03.02, MCP-03.03, MCP-03.04, MCP-03.05, MCP-03.06, MCP-03.07, MCP-03.08, MCP-03.09 | Testes concorrentes e de rollback cobrem todos os tipos de entidade. |

## G04 — Registro de comandos, contratos MCP e descoberta [P0]

**Pré-requisitos:** G03 · **Gate de saída:** G04, após MCP-04.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-04.01 | Definir fonte única de metadados das operações públicas | G03 | Cada operação tem ID, nome, entrada, saída, status, unidade e erro. |
| MCP-04.02 | Gerar JSON Schema estrito de parâmetros e retornos | MCP-04.01 | Sem any/union indevida em esquemas de ferramentas interoperáveis. |
| MCP-04.03 | Produzir descrições MCP em português sem ambiguidade | MCP-04.01 | Cada campo identifica limites, valores padrão e efeitos colaterais. |
| MCP-04.04 | Mapear permissões e impactos de cada operação | MCP-04.01 | Cliente identifica leitura, escrita, exclusão e processamento pesado. |
| MCP-04.05 | Separar ferramentas de domínio de métodos internos | MCP-04.01 | API pública não expõe funções internas perigosas ou temporárias. |
| MCP-04.06 | Padronizar envelopes de resultado, avisos e códigos de erro | MCP-04.01 | Respostas têm success, errors, diagnostics e revision estruturados. |
| MCP-04.07 | Implementar ferramenta de descoberta de operações e capacidades | MCP-04.01 | Inventário indica recursos suportados e limitações atuais. |
| MCP-04.08 | Gerar documentação e referência a partir do registro | MCP-04.01 | Não há descrições divergentes entre editor, MCP e README. |
| MCP-04.09 | Manter aliases estáveis e política de descontinuação | MCP-04.01 | Mudança de nome produz aviso e período de compatibilidade testado. |
| MCP-04.10 | Bloquear registro incompleto por teste de contrato | MCP-04.02, MCP-04.03, MCP-04.04, MCP-04.05, MCP-04.06, MCP-04.07, MCP-04.08, MCP-04.09 | CI falha se existir operação não documentada, não validada ou não testada. |

## G05 — Servidor MCP, sessões e autorização [P0]

**Pré-requisitos:** G01, G03, G04 · **Gate de saída:** G05, após MCP-05.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-05.01 | Consolidar transporte stdio e Streamable HTTP | G01, G03, G04 | Ambos expõem contratos equivalentes respeitando permissões. |
| MCP-05.02 | Obrigar autenticação no HTTP de produção | MCP-05.01 | Ausência de credencial resulta em rejeição inclusive de SSE legado. |
| MCP-05.03 | Isolar sessões, cenas e estado por usuário | MCP-05.01 | Sessão A não consegue ler, editar ou prever IDs da sessão B. |
| MCP-05.04 | Aplicar expiração, limitação e fechamento de sessões | MCP-05.01 | TTL, limite e encerramento liberam recursos de forma segura. |
| MCP-05.05 | Implementar proteção contra repetição e concorrência | MCP-05.01 | Escritas conflitantes recebem erro de revisão e não corrompem a cena. |
| MCP-05.06 | Revisar CORS, origens e uso de token na query | MCP-05.01 | Política restrita e migração para cabeçalhos sem exposição de segredo. |
| MCP-05.07 | Padronizar cancelamento e timeouts de operações longas | MCP-05.01 | Renderizações interrompidas soltam recursos e informam cancelamento. |
| MCP-05.08 | Adicionar health, versão do motor e manifesto de capacidades | MCP-05.01 | Endpoint anuncia build-hash, schemas e módulos efetivamente carregados. |
| MCP-05.09 | Limitar tamanho, frequência e custo de solicitações | MCP-05.01 | Requisições excessivas recebem erro conhecido com limites documentados. |
| MCP-05.10 | Executar integração HTTP/stdio e autorizar gate de servidor | MCP-05.02, MCP-05.03, MCP-05.04, MCP-05.05, MCP-05.06, MCP-05.07, MCP-05.08, MCP-05.09 | Autenticação, isolamento, expiração e concorrência passam sob teste. |

## G06 — Empacotamento, compilação e paridade do dist [P0]

**Pré-requisitos:** G03, G04 · **Gate de saída:** G06, após MCP-06.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-06.01 | Definir manifest único de módulos carregados pelo headless | G03, G04 | Nenhuma lista paralela manual diverge de src/scene/ordem.json. |
| MCP-06.02 | Reconstruir dist/server.mjs a partir de fonte atual | MCP-06.01 | Pacote inclui os 25 módulos atuais e as APIs da PR. |
| MCP-06.03 | Sincronizar engine, scene, widget, fontes e WASM | MCP-06.01 | Arquivos distribuídos têm hash e referências válidas. |
| MCP-06.04 | Introduzir verificador de hashes src versus dist | MCP-06.01 | Qualquer alteração sem rebuild provoca falha explícita no CI. |
| MCP-06.05 | Testar start local sem node_modules no artefato final | MCP-06.01 | Servidor empacotado inicia apenas com Node suportado. |
| MCP-06.06 | Verificar Node suportado e arquitetura Linux/Windows/macOS | MCP-06.01 | Smoke tests passam nas plataformas da matriz declarada. |
| MCP-06.07 | Publicar versão semântica e build-hash consultáveis | MCP-06.01 | Resposta do MCP identifica revisão exata do motor. |
| MCP-06.08 | Gerar artefato de release reproduzível e verificável | MCP-06.01 | Duas compilações do mesmo commit produzem conteúdo equivalente. |
| MCP-06.09 | Bloquear deploy quando teste do dist falhar | MCP-06.01 | Publicação exige lint, segurança, contrato e smoke dist. |
| MCP-06.10 | Conferir paridade binária antes de fechar gate | MCP-06.02, MCP-06.03, MCP-06.04, MCP-06.05, MCP-06.06, MCP-06.07, MCP-06.08, MCP-06.09 | dist não omite ferramentas, métodos, schemas, módulos ou testes críticos. |

## G07 — Harness automatizado e contratos mínimos [P0]

**Pré-requisitos:** G01, G03, G04, G05, G06 · **Gate de saída:** G07, após MCP-07.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-07.01 | Preparar fixtures determinísticas de cena e manequins | G01, G03, G04, G05, G06 | Testes iniciam com mesma geometria, câmera e IDs previsíveis. |
| MCP-07.02 | Criar driver MCP real para stdio e HTTP | MCP-07.01 | Testes chamam tools/list e tools/call como clientes externos. |
| MCP-07.03 | Conferir contratos de todas as ferramentas legadas | MCP-07.01 | 25 ferramentas iniciais preservam casos de uso conhecidos. |
| MCP-07.04 | Executar comparação de resultado editor versus MCP | MCP-07.01 | Mesma operação produz estado normalizado equivalente. |
| MCP-07.05 | Testar erros de parâmetros, limites e sugestões | MCP-07.01 | Entradas inválidas não geram NaN nem mutações parciais. |
| MCP-07.06 | Cobrir serialização, importação e idempotência | MCP-07.01 | Round-trip mantém entidades e repetição não duplica efeitos. |
| MCP-07.07 | Cobrir isolamento, timeout e payload malicioso | MCP-07.01 | Casos adversariais não executam código nem derrubam processo. |
| MCP-07.08 | Criar fixtures visuais SVG/PNG e tolerâncias explícitas | MCP-07.01 | Artefatos são comparados por geometria e regressão visual. |
| MCP-07.09 | Medir tempo, memória e limites por operação | MCP-07.01 | Benchmarks geram relatórios com thresholds configuráveis. |
| MCP-07.10 | Estabelecer gate central de testes executáveis | MCP-07.02, MCP-07.03, MCP-07.04, MCP-07.05, MCP-07.06, MCP-07.07, MCP-07.08, MCP-07.09 | CI reporta PASS/FAIL por contrato em source, dist, stdio e HTTP. |

## G08 — Cena, entidades, referências e histórico [P1]

**Pré-requisitos:** G04, G07 · **Gate de saída:** G08, após MCP-08.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-08.01 | Expor ferramenta tipada de gerenciamento da cena | G04, G07 | Reset, lista, seleção, resumo e estado têm respostas estruturadas. |
| MCP-08.02 | Expor adicionar/editar/copiar/remover manequim com IDs estáveis | MCP-08.01 | Todos os fluxos usam validação de entidade e undo. |
| MCP-08.03 | Padronizar rename, filtros, busca e resolução de referência | MCP-08.01 | Nome, ID e índice obedecem semântica única e erros claros. |
| MCP-08.04 | Expor estado completo, snapshot e revisão | MCP-08.01 | MCP retorna resumo e snapshot sem dados de outros usuários. |
| MCP-08.05 | Expor undo, redo e marcar estado com grupo transacional | MCP-08.01 | Histórico reverte também objetos segurados e física. |
| MCP-08.06 | Expor diff e dry-run de mutações | MCP-08.01 | Usuário vê quais campos mudariam sem executar. |
| MCP-08.07 | Expor importação de cena e restauração confiáveis | MCP-08.01 | JSON antigo é migrado ou rejeitado com diagnóstico. |
| MCP-08.08 | Expor configuração global, unidades e coordenadas | MCP-08.01 | Cliente recupera e ajusta apenas campos permitidos. |
| MCP-08.09 | Mapear operações visuais de seleção, arraste e duplicação | MCP-08.01 | Há comando correspondente ou exclusão documentada por natureza do navegador. |
| MCP-08.10 | Validar round-trip, IDs, histórico e paridade de cena | MCP-08.02, MCP-08.03, MCP-08.04, MCP-08.05, MCP-08.06, MCP-08.07, MCP-08.08, MCP-08.09 | Todos os fluxos da cena passam de editor para MCP e vice-versa. |

## G09 — Corpos, poses, cinemática e limites [P1]

**Pré-requisitos:** G08 · **Gate de saída:** G09, após MCP-09.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-09.01 | Expor tipos corporais e presets anatômicos | G08 | Lista e aplicação retornam parâmetros efetivamente usados. |
| MCP-09.02 | Expor parâmetros individuais e alterações por lote | MCP-09.01 | Leitura, min/max, passos e escrita validada cobrem corpo e pose. |
| MCP-09.03 | Expor ações posturais e poses rápidas | MCP-09.01 | Sentar, deitar, ajoelhar, correr e demais presets têm controle tipado. |
| MCP-09.04 | Expor articulação individual por nome ou chave | MCP-09.01 | Cliente consulta eixo, limite e mutação efetiva sem ambiguidade. |
| MCP-09.05 | Expor IK de mão e pé até ponto 3D | MCP-09.01 | Resultado informa erro residual e alcance possível. |
| MCP-09.06 | Expor translação/rotação do corpo e raiz | MCP-09.01 | Alterações respeitam convenção do mundo e limites conhecidos. |
| MCP-09.07 | Expor espelhar, copiar pose e perfis de flexibilidade | MCP-09.01 | Operações mantêm anatomia e lado coerentes. |
| MCP-09.08 | Expor validar pose e acoplamentos anatômicos | MCP-09.01 | Diagnóstico identifica colisões, restrições e correções sugeridas. |
| MCP-09.09 | Adicionar inspeção de juntas e frames mundiais | MCP-09.01 | Cliente consegue consultar posição/orientação de cada alvo suportado. |
| MCP-09.10 | Executar matriz de poses e regressões dos limites | MCP-09.02, MCP-09.03, MCP-09.04, MCP-09.05, MCP-09.06, MCP-09.07, MCP-09.08, MCP-09.09 | Cenários comuns e extremos concordam com motor e editor. |

## G10 — Anatomia fina, cabeça Loomis e expressão [P1]

**Pré-requisitos:** G09 · **Gate de saída:** G10, após MCP-10.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-10.01 | Expor configurações do modelo de cabeça e detalhe | G09 | Modelo V4 e variantes existentes são enumerados sem inventar novos. |
| MCP-10.02 | Expor landmarks anatômicos de crânio, mandíbula e face | MCP-10.01 | Pontos válidos retornam coordenadas e frames locais. |
| MCP-10.03 | Expor planos laterais Loomis e parâmetros cranianos reais | MCP-10.01 | Ajustes aceitos reproduzem cortes laterais e dimensões do motor. |
| MCP-10.04 | Expor orientação independente da cabeça e tronco | MCP-10.01 | Rotacionar pescoço não muda a noção de frente do tronco. |
| MCP-10.05 | Expor olhar, pálpebras, sobrancelhas, boca e mandíbula | MCP-10.01 | Cada propriedade usa faixas documentadas do rig. |
| MCP-10.06 | Expor dedos por falange, abertura e oposição de polegar | MCP-10.01 | Ambas as mãos retornam status de cinco dedos quando representados. |
| MCP-10.07 | Expor pés, dedos dos pés, canela e escápulas | MCP-10.01 | Campos anatômicos finos possuem comandos e validação. |
| MCP-10.08 | Expor gestos, expressões e personalização do biotipo | MCP-10.01 | Presets e alterações finas convivem sem reset indevido. |
| MCP-10.09 | Expor estudo anatômico e exportação de vistas por região | MCP-10.01 | Geração headless produz geometria/arquivo ou erro documentado. |
| MCP-10.10 | Testar atlas de cabeça, mãos, perfil e costas | MCP-10.02, MCP-10.03, MCP-10.04, MCP-10.05, MCP-10.06, MCP-10.07, MCP-10.08, MCP-10.09 | Comparação 3×3 e restrições anatômicas passam sem regressões. |

## G11 — Objetos 3D, hierarquias, apoio e geometria [P1]

**Pré-requisitos:** G08 · **Gate de saída:** G11, após MCP-11.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-11.01 | Expor inventário de tipos e geometrias disponíveis | G08 | Tipos, medidas e suporte a cilindro/cadeira são retornados pelo motor. |
| MCP-11.02 | Expor CRUD e identificação estável de objetos | MCP-11.01 | Adicionar, copiar, remover, renomear e listar preservam IDs. |
| MCP-11.03 | Expor posição 3D, quaternion/matriz e giro por eixo | MCP-11.01 | Transformação validada retorna posição e rotação atuais. |
| MCP-11.04 | Expor medidas, escala, cor, estilo e visibilidade | MCP-11.01 | Mudanças têm limites e não corrompem partes geométricas. |
| MCP-11.05 | Expor pivôs, frames locais e orientação frente/costas | MCP-11.01 | Referenciais do objeto independem de aparência de olhos. |
| MCP-11.06 | Expor hierarquia sobre, filhos e offsets rígidos | MCP-11.01 | Móvel pai move filhos com transformações consistentes. |
| MCP-11.07 | Expor pontos de ancoragem e superfícies elegíveis | MCP-11.01 | GripSites, apoios e assentos têm IDs e localizações mundiais. |
| MCP-11.08 | Expor colisores e dados de geometria disponíveis | MCP-11.01 | Consulta distingue mesh real de proxy OBB/cilindro. |
| MCP-11.09 | Expor duplicação em lote, agrupamento e seleção | MCP-11.01 | Operações preservam identidade e não criam ciclos em hierarquia. |
| MCP-11.10 | Validar matrizes, apoios e invariantes de objeto | MCP-11.02, MCP-11.03, MCP-11.04, MCP-11.05, MCP-11.06, MCP-11.07, MCP-11.08, MCP-11.09 | Testes cobrem rotação inclinada, pai/filho, remoção e JSON. |
