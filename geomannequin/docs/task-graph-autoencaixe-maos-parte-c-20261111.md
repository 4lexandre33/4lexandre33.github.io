# AutoGrip — Task Graph detalhado: Parte C (AG20–AG29)

**Status: planejamento.** Integração total: sequência um-clique, transporte, persistência, UI, editor de código, MCP e testes. Dependências AG00–AG19 referem-se às Partes A/B. Cada gate AGnn exige aceite de AG-nn.10. 100 tarefas.

## AG20 — Máquina de estados e sequência de pegar em uma ação (P1)

Dependências: AG15, AG17, AG19. Gate: AG20 após AG-20.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-20.01 | Definir estados idle, planejar, aproximar, abrir, tocar, fechar e segurar | AG15, AG17, AG19 | Transição legal é registrada e cancelamento respeita estado atual. |
| AG-20.02 | Implementar uma chamada planAutoGrip sem mutação global | AG-20.01 | Planejamento calcula alternativas e relatório de viabilidade. |
| AG-20.03 | Implementar uma chamada aplicarAutoGrip atômica sobre solução aprovada | AG-20.01 | Commit sincroniza braço, palma, dedos e vínculo no mesmo snapshot. |
| AG-20.04 | Adicionar progresso opcional e prévia de trajetórias | AG-20.01 | Usuário visualiza aproximação, fechamento e estado final. |
| AG-20.05 | Aplicar abertura prévia dos dedos antes de mover a mão | AG-20.01 | Mão não tenta atravessar encosto fechada durante abordagem. |
| AG-20.06 | Animar entrada da palma e fechamento coordenado dos dedos | AG-20.02, AG-20.03 | Trajetória respeita limites e converge para contatos validados. |
| AG-20.07 | Confirmar vínculo rígido somente após validação final | AG-20.04, AG-20.05 | Objeto nunca passa a seguir mão se contatos finais forem inválidos. |
| AG-20.08 | Adicionar tempo máximo, cancelamento e rollback | AG-20.06, AG-20.07 | Cancelar em qualquer etapa recupera estado consistente sem pose fantasma. |
| AG-20.09 | Expor modo instantaneo apenas como commit de pose já validada | AG-20.08 | One-click pode ser instantâneo mas não teleporta através de sólidos para calcular solução. |
| AG-20.10 | Validar sequências com objetos/parâmetros variados | AG-20.02, AG-20.03, AG-20.04, AG-20.05, AG-20.06, AG-20.07, AG-20.08, AG-20.09 | O estado final coincide com a solução e erros não deixam vínculos órfãos. |

## AG21 — Transporte, reencaixe contínuo e soltura (P1)

Dependências: AG18, AG20. Gate: AG21 após AG-21.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-21.01 | Preservar transformações relativas otimizadas no Grip V3 | AG18, AG20 | Wobj acompanha Wmao sem recapturar offset errado após planejar. |
| AG-21.02 | Integrar dedos autoajustados com movimento posterior do braço | AG-21.01 | Fechamento permanece coerente durante rotação e translação do móvel. |
| AG-21.03 | Verificar colisão contínua de objeto transportado com ambiente | AG-21.01 | Movimentos proibidos não atravessam outra cadeira, corpo ou parede. |
| AG-21.04 | Reavaliar contato dos dedos após grandes mudanças de orientação | AG-21.01 | Solver corrige dedos quando forma de contato varia ou relata deslizamento. |
| AG-21.05 | Evitar oscilação de ajustes e flicker visual na pose | AG-21.01 | Histerese e warm-start preservam continuidade entre frames. |
| AG-21.06 | Compatibilizar filhos apoiados, cadeiras, copos e hierarquias | AG-21.02, AG-21.03 | Objetos filhos mantêm matriz relativa ou soltam segundo regra explícita. |
| AG-21.07 | Suportar troca de mão principal durante transporte bilateral | AG-21.04, AG-21.05 | Transição mantém objeto no lugar e contatos alcançáveis. |
| AG-21.08 | Definir quando manter, relaxar ou soltar dedos automaticamente | AG-21.06, AG-21.07 | Pousar/chão/queda limpam estados de pegada sem travar a mão. |
| AG-21.09 | Manter tempo de física consistente com vínculo ativo e soltura | AG-21.08 | Simulação não disputa controle do objeto com a mão que ainda segura. |
| AG-21.10 | Validar transporte em 360 graus e mudança brusca de postura | AG-21.02, AG-21.03, AG-21.04, AG-21.05, AG-21.06, AG-21.07, AG-21.08, AG-21.09 | Não há salto do objeto, penetração proibida ou drift acumulativo acima do limite. |

## AG22 — Persistência, versionamento, transações e undo (P0)

Dependências: AG20, AG21. Gate: AG22 após AG-22.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-22.01 | Definir schema AutoGripState versionado sobre cena atual | AG20, AG21 | Vínculo armazena tipo, região, contatos, mãos, scores e parâmetros de solver. |
| AG-22.02 | Persistir dimensões derivadas somente como cache validável | AG-22.01 | Mudanças de biotipo invalidam cache sem perder dados autoritativos. |
| AG-22.03 | Persistir presets finos de dedos e offset SE(3) por mão | AG-22.01 | Salvar/carregar preserva pose final, dedos e orientação da cadeira. |
| AG-22.04 | Resolver nomes/IDs estáveis e migração de cenas antigas | AG-22.01 | Projetos V2/V3 continuam carregando sem AutoGrip obrigatório. |
| AG-22.05 | Aplicar transação total de mão, braço, objeto e GripState | AG-22.01 | Falha numérica reverte todos os parâmetros inclusive suporte e física. |
| AG-22.06 | Implementar snapshots e undo/redo de encaixe completo | AG-22.02, AG-22.03 | Desfazer one-click retorna exatamente a mão/objeto anteriores. |
| AG-22.07 | Adicionar revisão de estado, idempotência e controle concorrente | AG-22.04, AG-22.05 | Duas chamadas MCP simultâneas não aplicam soluções sobre cena alterada. |
| AG-22.08 | Incluir hashes de geometria e revisão de solver no resultado | AG-22.06, AG-22.07 | Solução de preview fica inválida se anatomia ou objeto mudarem. |
| AG-22.09 | Evitar JSON gigantes e ciclos no estado persistido | AG-22.08 | Limites de tamanho e serialização de contatos evitam estruturas recursivas. |
| AG-22.10 | Validar round-trip e rollback em cem cenas fixture | AG-22.02, AG-22.03, AG-22.04, AG-22.05, AG-22.06, AG-22.07, AG-22.08, AG-22.09 | Estado restaurado equivale aos parâmetros antes do erro e aos contatos após salvar. |

## AG23 — Botão único na aplicação e interação visual (P1)

Dependências: AG20, AG22. Gate: AG23 após AG-23.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-23.01 | Adicionar comando Autoencaixar nas ações da mão e do objeto | AG20, AG22 | Botão é visível quando há manequim e objeto selecionados. |
| AG-23.02 | Implementar escolha automática de mão e estilo de pegada | AG-23.01 | Sem preferências extras, ação usa modo auto com regras seguras. |
| AG-23.03 | Adicionar opções avançadas preserva objeto, mover objeto e duas mãos | AG-23.01 | Configuração padrão não altera a cena fora do necessário. |
| AG-23.04 | Exibir prévia opcional com rig, objeto e contatos-alvo | AG-23.01 | Usuário pode conferir resultado sem confirmar alterações. |
| AG-23.05 | Exibir progresso, cancelamento e resultado da otimização | AG-23.01 | Interface nunca fica sem resposta em caso de timeout ou falha. |
| AG-23.06 | Exibir erros por falta de alcance, dimensão ou obstáculo | AG-23.02, AG-23.03 | Mensagens indicam alternativa (mover alvo, outra mão, outro site). |
| AG-23.07 | Adicionar painel de qualidade da pegada e penetração | AG-23.04, AG-23.05 | Mostra score, dedos em contato, alertas e principais restrições. |
| AG-23.08 | Adicionar guias de ponto de pegada e direção de aproximação | AG-23.06, AG-23.07 | Guias não entram em PNG final a menos que solicitadas. |
| AG-23.09 | Manter atalhos de undo/redo e atualizar render automaticamente | AG-23.08 | Uma operação gera um snapshot e uma renderização coerente. |
| AG-23.10 | Testar uso de teclado, touch, mouse e estados de erro | AG-23.02, AG-23.03, AG-23.04, AG-23.05, AG-23.06, AG-23.07, AG-23.08, AG-23.09 | O botão funciona sem JS escrito pelo usuário e não duplica efeitos. |

## AG24 — API pública do editor para autoencaixe e simulação (P0)

Dependências: AG20, AG22. Gate: AG24 após AG-24.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-24.01 | Criar cena.autoEncaixarObjeto como fachada pública | AG20, AG22 | Aceita referência de objeto, manequim, mão e opções com validação. |
| AG-24.02 | Criar cena.planejarEncaixe que retorna alternativas e scores | AG-24.01 | Método somente leitura não muda parâmetros nem objeto. |
| AG-24.03 | Criar cena.aplicarEncaixe que confirma solução por revisão | AG-24.01 | Aplica candidato válido sem alterar estado se revisão expirou. |
| AG-24.04 | Criar m.autoSegurar e obj.autoEncaixarPor | AG-24.01 | Métodos delegam ao mesmo solucionador do motor em vez de regras duplicadas. |
| AG-24.05 | Permitir tipo auto, pinca, potencia, gancho, lateral, tripode e apoio | AG-24.01 | Todas as classes são verificadas por geometria antes do vínculo. |
| AG-24.06 | Expor modo manterObjeto, moverObjeto, aproximarBraco e modo combinado | AG-24.02, AG-24.03 | Mudanças de objeto e braço obedecem permissões e limites. |
| AG-24.07 | Expor relatório detalhado, score, contatos, fallbacks e trajetórias | AG-24.04, AG-24.05 | Resultado usa dados estruturados sem necessidade de interpretar texto de logs. |
| AG-24.08 | Validar opções sem estado global escondido e com rollback | AG-24.06, AG-24.07 | Chamada em código interrompida preserva cena e histórico. |
| AG-24.09 | Atualizar cena.comandos e cena.capacidades com estado experimental | AG-24.08 | Descoberta da API não anuncia perfeito/exato sem confirmação. |
| AG-24.10 | Testar paridade scripts do editor e clique em botão | AG-24.02, AG-24.03, AG-24.04, AG-24.05, AG-24.06, AG-24.07, AG-24.08, AG-24.09 | Mesma entrada gera mesmo resultado geométrico e mesmos erros. |

## AG25 — Ferramentas MCP tipadas e integração de agentes (P0)

Dependências: AG22, AG24. Gate: AG25 após AG-25.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-25.01 | Adicionar acao auto_encaixar em preensao MCP ou ferramenta dedicada | AG22, AG24 | Cliente pode solicitar encaixe com nomes/IDs de manequim e objeto. |
| AG-25.02 | Adicionar operacao planejar e listar candidatos como read-only | AG-25.01 | Chamada remota obtém preview sem executar mutação. |
| AG-25.03 | Adicionar acao aplicar por token de revisão da cena | AG-25.01 | Cliente não aplica solução para versão da cena alterada. |
| AG-25.04 | Adicionar schema de estilo, mãos, prioridade e tolerâncias | AG-25.01 | Entradas usam enums, limites e estruturas seguras compatíveis com Gemini. |
| AG-25.05 | Adicionar resposta de score e contatos por falange em JSON | AG-25.01 | Resposta indica quais dedos tocaram e profundidade residual. |
| AG-25.06 | Integrar com operacoes_lote e roteiro_declarativo sem eval | AG-25.02, AG-25.03 | Agente pode autoencaixar em quadros e batches apenas por ações tipadas. |
| AG-25.07 | Adicionar capacidades e exemplos na busca search/fetch | AG-25.04, AG-25.05 | Um agente descobre operações disponíveis sem adivinhar nomes. |
| AG-25.08 | Adicionar autorização, limites de CPU, tempo e tamanho de resultados | AG-25.06, AG-25.07 | HTTP não permite scripts, DoS por otimização nem estado vazado. |
| AG-25.09 | Testar stdio, Streamable HTTP e pacote dist com mesma geometria | AG-25.08 | Resultado comparado entre três distribuições, com resposta determinística. |
| AG-25.10 | Aprovar fluxo MCP integrado com uma única solicitação de agente | AG-25.02, AG-25.03, AG-25.04, AG-25.05, AG-25.06, AG-25.07, AG-25.08, AG-25.09 | Comando pega cadeira, encaixa dedos, move braço e renderiza relatório válido. |

## AG26 — Diagnósticos, visualização matemática e observabilidade (P1)

Dependências: AG19, AG23, AG25. Gate: AG26 após AG-26.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-26.01 | Criar visualização de palma, eixos e alvos dos dedos em 3D | AG19, AG23, AG25 | Exibe normais, tangentes, pontos e frames por mão. |
| AG-26.02 | Criar overlay de penetração por cor/intensidade | AG-26.01 | Regiões vermelhas correspondem a profundidade medida, não mero decalque. |
| AG-26.03 | Criar render de contatos por falange e painel de scores | AG-26.01 | Cada dedo/objeto possui identidade e distância exibida. |
| AG-26.04 | Mostrar candidatos descartados e seus motivos | AG-26.01 | Relatório explica reach, pinça estreita, obstáculo e falha IK. |
| AG-26.05 | Mostrar trajetória de aproximação e envelopes de colisão | AG-26.01 | Pode navegar entre waypoints e visualizar primeiro bloqueio. |
| AG-26.06 | Registrar iterações de otimização e convergência numérica | AG-26.02, AG-26.03 | Logs têm resíduo/tempo e não revelam dados privados. |
| AG-26.07 | Exibir diffs de pose de ombro, cotovelo, punho e dedos | AG-26.04, AG-26.05 | Antes/depois numérico se relaciona com o efeito visual. |
| AG-26.08 | Incluir exportação de relatório JSON e atlas de diagnóstico | AG-26.06, AG-26.07 | Teste pode anexar fotos, métricas e dump reprodutível. |
| AG-26.09 | Separar overlays de debug do render de produção | AG-26.08 | Camadas de depuração são opcionais e não vazam para imagem normal. |
| AG-26.10 | Validar interpretação visual dos indicadores e dos logs | AG-26.02, AG-26.03, AG-26.04, AG-26.05, AG-26.06, AG-26.07, AG-26.08, AG-26.09 | Todos os dados de debug reproduzem o resultado do solver. |

## AG27 — Suíte automática de geometria, IK, encaixe e regressão (P0)

Dependências: AG10, AG15, AG22, AG25. Gate: AG27 após AG-27.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-27.01 | Criar testes unitários para HandMetrics, HandFK e frames locais | AG10, AG15, AG22, AG25 | Ambos os lados e biotipos apresentam dimensões reproduzíveis. |
| AG-27.02 | Criar testes para signed distance e interpenetração | AG-27.01 | Casos toque/folga/penetração têm sinais e normais corretos. |
| AG-27.03 | Criar testes de alcance e limites de IK com várias sementes | AG-27.01 | Soluções que extrapolam braço são rejeitadas ou melhoradas sem NaN. |
| AG-27.04 | Criar teste de pinça polegar-indicador em copo fino | AG-27.01 | Polpas tocam faces opostas com espessura real e sem penetrar. |
| AG-27.05 | Criar teste de potência/gancho em encosto e caixa | AG-27.01 | Dedos distribuem ao redor da região sem falanges dentro do sólido. |
| AG-27.06 | Criar testes de pegada bilateral e colisão entre braços | AG-27.02, AG-27.03 | Manter duas mãos não atravessa torso nem desloca cadeira por salto. |
| AG-27.07 | Criar teste de rollback, preview e persistência | AG-27.04, AG-27.05 | Falhas/cancelamento não deixam marca no estado e round-trip mantém solução. |
| AG-27.08 | Criar testes de MCP, editor, UI e widget de autoencaixe | AG-27.06, AG-27.07 | A mesma cena tem resultados equivalentes em todas as interfaces. |
| AG-27.09 | Adicionar testes adversariais e fuzz determinístico | AG-27.08 | Nan, objetos extremos e combinações impraticáveis retornam erros seguros. |
| AG-27.10 | Exigir aprovação da matriz por integração contínua | AG-27.02, AG-27.03, AG-27.04, AG-27.05, AG-27.06, AG-27.07, AG-27.08, AG-27.09 | Falha em qualquer classe bloqueia marcação dos gates do AutoGrip. |

## AG28 — Desempenho, robustez numérica e qualidade perceptual (P0)

Dependências: AG17, AG20, AG27. Gate: AG28 após AG-28.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-28.01 | Definir orçamento de tempo por clique, preview e frame | AG17, AG20, AG27 | Benchmarks têm alvo de latência e limite duro explícitos por perfil. |
| AG-28.02 | Medir custo da matriz por número de dedos, sites e objetos | AG-28.01 | Relatório identifica escalabilidade por N candidatos e M colisores. |
| AG-28.03 | Implementar cache de geometria da mão, regiões e broadphase | AG-28.01 | Mudança de pose invalida apenas partes afetadas. |
| AG-28.04 | Aplicar poda por alcance e dimensão antes de IK fino | AG-28.01 | Candidatos obviamente impossíveis são rejeitados com custo baixo. |
| AG-28.05 | Aplicar warm-start e interrupção por qualidade mínima atingida | AG-28.01 | Encaixe simples usa orçamento curto sem sacrificar critério geométrico. |
| AG-28.06 | Implementar processamento assíncrono cancelável sem UI bloqueada | AG-28.02, AG-28.03 | Operação pesada tem progresso/cancelamento e nunca congela navegador. |
| AG-28.07 | Definir fallback hierárquico qualidade alta, média e falha | AG-28.04, AG-28.05 | Nenhum modo falha silenciosamente ou declara encaixe perfeito sem contato. |
| AG-28.08 | Testar determinismo em Node e navegadores suportados | AG-28.06, AG-28.07 | Diferenças de ponto flutuante não causam falhas ou escolhas instáveis. |
| AG-28.09 | Executar atlas visual de mão, dedos e objetos sob múltiplas câmeras | AG-28.08 | Nenhuma falha visual importante é ocultada por câmera frontal única. |
| AG-28.10 | Validar limite de memória, tempo e qualidade em hardware modesto | AG-28.02, AG-28.03, AG-28.04, AG-28.05, AG-28.06, AG-28.07, AG-28.08, AG-28.09 | Benchmarks/CI respeitam teto configurado e produzem relatório PASS/FAIL. |

## AG29 — Cenários finais, documentação e release controlado (P0)

Dependências: AG23, AG24, AG25, AG26, AG28. Gate: AG29 após AG-29.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-29.01 | Executar cenário ponta a ponta cadeira segurada pela mão direita | AG23, AG24, AG25, AG26, AG28 | Um botão posiciona palma/5 dedos e braço e comprova ausência de interpenetração. |
| AG-29.02 | Executar cenário caneta ou objeto fino segurado em pinça | AG-29.01 | Polegar-indicador tocam superfícies opostas sem cruzar falanges. |
| AG-29.03 | Executar cenário copo com pegada de potência ou tripode | AG-29.01 | Diâmetro compatível produz contato estável geometrico e visual coerente. |
| AG-29.04 | Executar cenário objeto largo demais ou fora de alcance | AG-29.01 | Sistema retorna inviavel sem distorcer mão ou teletransportar cadeira. |
| AG-29.05 | Executar cenário duas mãos transportando cadeira e soltando | AG-29.01 | Vínculos preservam peça, troca de mão e queda com continuidade. |
| AG-29.06 | Executar cenário objeto perto de peito, parede e mesa | AG-29.02, AG-29.03 | Solução evita obstáculo ou falha justificadamente sem interpenetração. |
| AG-29.07 | Executar cenários com diferentes biotipos, tamanhos de mão e lados | AG-29.04, AG-29.05 | Mesmos objetos exigem configuração de dedos derivada da anatomia individual. |
| AG-29.08 | Confirmar paridade entre botão, editor JS, MCP source/HTTP/dist | AG-29.06, AG-29.07 | Saída, score, contatos, erro e JSON são semanticamente iguais. |
| AG-29.09 | Publicar docs, presets, exemplos e política de limitações | AG-29.08 | Usuário sabe usar e entende que não há forças reais garantidas. |
| AG-29.10 | Aprovar gates de segurança, visual, performance e testes antes de merge | AG-29.02, AG-29.03, AG-29.04, AG-29.05, AG-29.06, AG-29.07, AG-29.08, AG-29.09 | Feature flag é liberada apenas com os 29 gates anteriores aprovados. |
