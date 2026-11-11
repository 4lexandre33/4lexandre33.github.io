# Task Graphs GeoMannequin MCP — Parte B: operações avançadas e release (G12–G23)

**Status de todas as tarefas: PLANEJADO.** Esta entrega é um plano de implementação, não uma alegação de funcionalidade pronta. Dependências `G00`–`G11` apontam aos gates da Parte A. Cada gate `GNN` só fecha após `MCP-NN.10`, que verifica todas as tarefas `MCP-NN.02` a `MCP-NN.09`.

## G12 — Preensão V2/V3, GripSites e transporte bilateral [P1]

**Pré-requisitos:** G10, G11 · **Gate de saída:** G12, após MCP-12.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-12.01 | Expor pontos de agarre e candidatos por objeto | G10, G11 | Retorno identifica site, frame, distância e possibilidade real de alcance. |
| MCP-12.02 | Criar ferramenta MCP para iniciar preensão primária | MCP-12.01 | Mão escolhida e site criam vínculo 6DOF sem deslocamento inesperado. |
| MCP-12.03 | Expor encaixe por IK da palma e tolerância | MCP-12.01 | Modo encaixar aproxima mão e falha sem teleportar o móvel se não alcançar. |
| MCP-12.04 | Expor agarrar com segunda mão e diagnóstico bilateral | MCP-12.01 | Resíduo IK fica visível; exigirContato rejeita pega inacessível. |
| MCP-12.05 | Expor transferência da mão condutora sem salto | MCP-12.01 | A cadeira preserva pose ao trocar controle entre direita e esquerda. |
| MCP-12.06 | Expor soltar mão específica e todas as mãos | MCP-12.01 | Soltar secundária preserva primária; soltar última remove vínculo. |
| MCP-12.07 | Impedir posse duplicada, órfãos e conflitos | MCP-12.01 | Mesma mão não segura dois objetos; remoção não deixa vínculos inválidos. |
| MCP-12.08 | Preservar filhos apoiados durante o transporte | MCP-12.01 | Filhos seguem pose rigidamente e não geram auto-colisões artificiais. |
| MCP-12.09 | Expor inspeção, força suportada e limites verídicos do modelo | MCP-12.01 | API distingue cinemática 6DOF de física com torque não implementada. |
| MCP-12.10 | Executar testes de preensão, duas mãos e rollback | MCP-12.02, MCP-12.03, MCP-12.04, MCP-12.05, MCP-12.06, MCP-12.07, MCP-12.08, MCP-12.09 | Casos com cadeira, copo, sites inválidos e JSON passam no MCP real. |

## G13 — Física discreta, queda, contatos e tempo [P1]

**Pré-requisitos:** G11, G12 · **Gate de saída:** G13, após MCP-13.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-13.01 | Expor capacidades reais do motor físico e suas unidades | G11, G12 | Retorno descreve gravidade aproximada sem alegar rigid-body completo. |
| MCP-13.02 | Criar ferramenta para iniciar queda com parâmetros validados | MCP-13.01 | Velocidade, gravidade, atrito e restituição alteram estado observável. |
| MCP-13.03 | Expor avanço determinístico do relógio por passos | MCP-13.01 | Mesma cena e delta produzem estados equivalentes. |
| MCP-13.04 | Expor simulação por duração e tamanho de passo | MCP-13.01 | Execução devolve relatório e trajetória opcional com limite de frames. |
| MCP-13.05 | Expor colisão com piso e geometria de objeto | MCP-13.01 | Objeto não atravessa piso e informa ponto/tempo de contato. |
| MCP-13.06 | Expor bloqueio contra móveis e outros manequins | MCP-13.01 | Colisões proxy tratam prioridade, dono e hierarquia de suporte. |
| MCP-13.07 | Expor pousar vertical ou inclinado e cancelar queda | MCP-13.01 | Menor altura de OBB/cilindro toca apoio preservando opção de orientação. |
| MCP-13.08 | Expor consulta e redefinição de estados dinâmicos | MCP-13.01 | Ativo, velocidade, impactos e contato podem ser lidos e controlados. |
| MCP-13.09 | Implementar limites de subpassos, tempo e custos | MCP-13.01 | Pedidos inviáveis retornam erro previsível sem travar o processo. |
| MCP-13.10 | Validar determinismo, contato, serialização e desempenho | MCP-13.02, MCP-13.03, MCP-13.04, MCP-13.05, MCP-13.06, MCP-13.07, MCP-13.08, MCP-13.09 | Suite cobre queda de cadeira, mesa, piso, manequim e reconstrução JSON. |

## G14 — Câmera anatômica, ótica e orientação contextual [P1]

**Pré-requisitos:** G09, G11 · **Gate de saída:** G14, após MCP-14.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-14.01 | Expor orientação própria de manequins e objetos | G09, G11 | Frente/costas derivam de frames anatômicos ou transformações e não de olhos. |
| MCP-14.02 | Expor câmera na frente/costas exatas do alvo | MCP-14.01 | Azimute de costas e frente é relativo ao corpo/cabeça selecionados. |
| MCP-14.03 | Expor perfis e diagonais com convenção anatômica | MCP-14.01 | Direita/esquerda preservam orientação local ao girar o manequim. |
| MCP-14.04 | Expor foco regional no rosto, mão, pé e objeto | MCP-14.01 | Área disponível, posição do pivô e zoom são reproduzíveis. |
| MCP-14.05 | Expor seguir, parar seguimento e inspecionar alvo | MCP-14.01 | A câmera acompanha movimento e mantém deslocamentos configurados. |
| MCP-14.06 | Expor posição, olhar, yaw, pitch, roll e alvo 3D | MCP-14.01 | Camera pose é consultável e editável com validação de graus/unidades. |
| MCP-14.07 | Expor perspectiva, lente, distância, FOV e zoom | MCP-14.01 | Mudança de lente distingue zoom ótico de dolly e respeita limites. |
| MCP-14.08 | Expor enquadramento de quadrinhos, terços e ângulos | MCP-14.01 | Planos/ângulos funcionam para grupo ou indivíduo com reporte do recorte. |
| MCP-14.09 | Expor capturar vistas e órbita panorâmica declarativa | MCP-14.01 | Geração por API preserva cena original e retorna metadados completos. |
| MCP-14.10 | Testar matrizes de câmera frente/costas e regiões | MCP-14.02, MCP-14.03, MCP-14.04, MCP-14.05, MCP-14.06, MCP-14.07, MCP-14.08, MCP-14.09 | 3x3 por alvo e rotação de cabeça/tronco não sofre inversões espúrias. |

## G15 — Composição espacial, camadas, contato e blocking [P1]

**Pré-requisitos:** G09, G11, G14 · **Gate de saída:** G15, após MCP-15.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-15.01 | Expor planta, perfil e posições em profundidade | G09, G11, G14 | Dados e desenhos refletem exatamente a cena atual. |
| MCP-15.02 | Expor composição de grupos por eixo, altura e distância | MCP-15.01 | Arranjos em linha, triângulo e diagonais resultam em posições verificáveis. |
| MCP-15.03 | Expor camadas visuais e ordenação de sobreposição | MCP-15.01 | Mudança de ordem altera SVG esperado sem apagar entidades. |
| MCP-15.04 | Expor ocultar, congelar e visibilidade por parte | MCP-15.01 | Controle de cena mantém estado e diferencia visual de físico. |
| MCP-15.05 | Expor autocolisão de manequins e colisões entre atores | MCP-15.01 | Contatos retornam pares, distâncias e profundidade de proxy. |
| MCP-15.06 | Expor colisão entre manequins e objetos, incluindo Grip | MCP-15.01 | Não mascara interpenetrações fora da região permitida de pega. |
| MCP-15.07 | Expor resolução/permitir contato com política e exceções | MCP-15.01 | Ajustes indicam quem se moveu e nunca ocultam aproximações. |
| MCP-15.08 | Expor limites de movimentos varridos do Contact V2 | MCP-15.01 | Bloqueio amostra trajetória e comunica que não é CCD analítica. |
| MCP-15.09 | Expor composição, suporte, alinhamento e regras de cenário | MCP-15.01 | Câmera, objetos, apoios e colisões usam o mesmo sistema de coordenadas. |
| MCP-15.10 | Validar cenas múltiplas com colisão e hierarquias | MCP-15.02, MCP-15.03, MCP-15.04, MCP-15.05, MCP-15.06, MCP-15.07, MCP-15.08, MCP-15.09 | Testes impedem NaN, inversão de lados, penetração grave e regressões de camadas. |

## G16 — Aparência, iluminação e renderização [P1]

**Pré-requisitos:** G14, G15 · **Gate de saída:** G16, após MCP-16.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-16.01 | Expor presets construcao, manequim e ecorche | G14, G15 | Mudança de modo preserva pose e retorna camadas efetivas. |
| MCP-16.02 | Expor paletas, estilos, materiais e traços disponíveis | MCP-16.01 | Lista apresenta somente opções renderizáveis no motor atual. |
| MCP-16.03 | Expor luz direcional, elevacao, sombra e atmosfera | MCP-16.01 | Parâmetros mudam saída SVG/PNG de forma verificável. |
| MCP-16.04 | Expor horizonte, fuga, grade e guias | MCP-16.01 | Alternâncias de desenho respeitam parâmetros e enquadramento. |
| MCP-16.05 | Expor camadas geométricas de anatomia por nome | MCP-16.01 | Consulta/ativação desativa o que existe sem alterar o rig. |
| MCP-16.06 | Expor render SVG com tamanho, fundo e transparência | MCP-16.01 | Documento SVG válido contém identificadores e viewBox corretos. |
| MCP-16.07 | Expor render PNG pelo conversor headless | MCP-16.01 | PNG tem MIME, dimensões e pixels legíveis sem Canvas/browser. |
| MCP-16.08 | Expor render de partes, atores isolados e cena completa | MCP-16.01 | Fotos e layers obedecem oclusão/ordem e composição. |
| MCP-16.09 | Adicionar cache por hash de estado, estilo e câmera | MCP-16.01 | Cenas iguais reusam resultado sem contaminação entre sessões. |
| MCP-16.10 | Validar render visual, transparência e limites de recursos | MCP-16.02, MCP-16.03, MCP-16.04, MCP-16.05, MCP-16.06, MCP-16.07, MCP-16.08, MCP-16.09 | Artefatos OpenPose e de cena não contêm NaN e satisfazem tamanho máximo. |

## G17 — Linha do tempo, poses animadas e gravação de quadros [P1]

**Pré-requisitos:** G13, G16 · **Gate de saída:** G17, após MCP-17.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-17.01 | Definir timeline declarativa versionada por tempo e trilhas | G13, G16 | Esquema cobre animação de pose, objeto, câmera e física. |
| MCP-17.02 | Expor criação/remoção/listagem de keyframes | MCP-17.01 | Quadros-chave usam IDs, times e valores normalizados. |
| MCP-17.03 | Expor interpolação de juntas com limites anatômicos | MCP-17.01 | Transições não excedem amplitudes nem trocam eixo indevidamente. |
| MCP-17.04 | Expor interpolação contínua de objetos 6DOF | MCP-17.01 | Interpolação de rotação evita flips e preserva escala. |
| MCP-17.05 | Expor trilhas de preensão e eventos de soltar | MCP-17.01 | Estado de pegar/soltar muda no instante configurado sem vínculos órfãos. |
| MCP-17.06 | Expor trilhas de câmera e luz ao longo do tempo | MCP-17.01 | Posição, foco, lente e iluminação podem variar entre quadros. |
| MCP-17.07 | Expor play, pause, seek, step e reset determinísticos | MCP-17.01 | Mesmo tempo produz mesma imagem e físico simulado dentro do modelo. |
| MCP-17.08 | Expor prévia e renderização em lote de frames | MCP-17.01 | Retorna frames e manifesto sem bloquear sessão indefinidamente. |
| MCP-17.09 | Persistir timeline na cena com migrações | MCP-17.01 | Arquivo salvo/recarregado conserva ordem, easing e dependências. |
| MCP-17.10 | Testar continuidade temporal e sincronização multiplataforma | MCP-17.02, MCP-17.03, MCP-17.04, MCP-17.05, MCP-17.06, MCP-17.07, MCP-17.08, MCP-17.09 | Sequências com cadeira e câmera reproduzem frames em source, dist e MCP. |

## G18 — Roteiros, storyboards, quadrinhos e automação declarativa [P1]

**Pré-requisitos:** G02, G14, G17 · **Gate de saída:** G18, após MCP-18.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-18.01 | Definir schema do roteiro sem JavaScript remoto | G02, G14, G17 | Cada quadro suporta operações permitidas e não executa código do cliente. |
| MCP-18.02 | Expor #cena e etapas sequenciais com estado isolado | MCP-18.01 | Preparação não contamina cenas de outras sessões. |
| MCP-18.03 | Expor #quadro, continuação e reinício explícito | MCP-18.01 | Estado por quadro é serializado e reversível. |
| MCP-18.04 | Expor #orbita e #ficha como operadores declarativos | MCP-18.01 | Vistas geradas batem com câmera anatômica atual. |
| MCP-18.05 | Expor falas, notas e metadados de storyboard | MCP-18.01 | Texto fica em dados e não em código executável. |
| MCP-18.06 | Expor storyboard de câmera e rig por frame | MCP-18.01 | Pose, posição e foco de cada quadro são inspecionáveis. |
| MCP-18.07 | Expor montagem de página, grade e leitura japonesa | MCP-18.01 | Layout respeita ordem e retorna arquivos correspondentes. |
| MCP-18.08 | Expor validação, dry-run e relatório por linha/quadro | MCP-18.01 | Erros mostram localização e não produzem efeito parcial. |
| MCP-18.09 | Expor limites de páginas, quadros e trabalho cancelável | MCP-18.01 | Tarefas longas são limitadas e podem ser interrompidas. |
| MCP-18.10 | Testar roteiro legítimo, erro, isolamento e ataque | MCP-18.02, MCP-18.03, MCP-18.04, MCP-18.05, MCP-18.06, MCP-18.07, MCP-18.08, MCP-18.09 | Scripts remotos maliciosos falham e quadros legítimos renderizam. |

## G19 — Passes de IA e referências estruturadas [P1]

**Pré-requisitos:** G16, G18 · **Gate de saída:** G19, após MCP-19.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-19.01 | Expor lista de passes e formatos suportados | G16, G18 | Metadados distinguem contorno, OpenPose, profundidade, normal e máscaras. |
| MCP-19.02 | Expor OpenPose BODY_25 com confiança e frame | MCP-19.01 | Coordenadas e contagem de pontos seguem contrato publicado. |
| MCP-19.03 | Expor OpenPose de 21 pontos por mão | MCP-19.01 | Cinco dedos retornam landmarks e confiança coerentes com o rig. |
| MCP-19.04 | Expor OpenPose facial e pálpebras | MCP-19.01 | 70 landmarks previstos têm coordenadas e flags de oclusão. |
| MCP-19.05 | Expor profundidade normalizada consistente com câmera | MCP-19.01 | Valores finitos preservam ordem perto/longe. |
| MCP-19.06 | Expor mapa de normais com convenções RGB explícitas | MCP-19.01 | Vetores decodificados usam sistema de coordenadas documentado. |
| MCP-19.07 | Expor máscaras e legendas de instância/partes | MCP-19.01 | IDs de cores são estáveis por quadro e reproduzíveis. |
| MCP-19.08 | Expor canny/contorno com parâmetros e fundo | MCP-19.01 | Traçados seguem estilo/escala escolhidos sem artefatos arbitrários. |
| MCP-19.09 | Expor lotes com formatos, recorte e metadados | MCP-19.01 | Cada imagem traz MIME, tamanho, hash, câmera e ID do quadro. |
| MCP-19.10 | Validar passes, mapas, oclusão e regressões de IA | MCP-19.02, MCP-19.03, MCP-19.04, MCP-19.05, MCP-19.06, MCP-19.07, MCP-19.08, MCP-19.09 | Regras de contagem, coordenadas e consistência multi-frame passam. |

## G20 — Importação, exportação e artefatos de produção [P1]

**Pré-requisitos:** G08, G16, G19 · **Gate de saída:** G20, após MCP-20.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-20.01 | Unificar esquema de exportar/importar JSON de cena | G08, G16, G19 | Round-trip restaura cena, objeto, grip, física, câmera e camadas. |
| MCP-20.02 | Expor URLs de cena com limites e versionamento | MCP-20.01 | Links são reversíveis e rejeitam payload inválido/comprimido abusivo. |
| MCP-20.03 | Expor SVG da cena e por camada com metadados | MCP-20.01 | Arquivo tem viewBox e estrutura que softwares vetoriais conseguem importar. |
| MCP-20.04 | Expor PNG e recortes por ator, quadro e resolução | MCP-20.01 | Imagens retornam conteúdo verificável e respeitam limites de tamanho. |
| MCP-20.05 | Expor OBJ quando a malha estiver disponível | MCP-20.01 | Exporta geometria existente ou informa limitações honestamente. |
| MCP-20.06 | Expor ZIP de cena, passes, frames e manifestos | MCP-20.01 | Arquivo contém nomes estáveis, checksums e caminhos seguros. |
| MCP-20.07 | Expor formato de resposta por recurso ou artefato | MCP-20.01 | Clientes recebem URI/MIME/dados sem depender de clique no navegador. |
| MCP-20.08 | Implementar armazenamento temporário e download autorizado | MCP-20.01 | Artefatos têm TTL, tamanho e escopo de sessão. |
| MCP-20.09 | Implementar importação de arquivos e migração de versões | MCP-20.01 | JSON/ZIP maliciosos são rejeitados e versões antigas são testadas. |
| MCP-20.10 | Executar testes de integridade e round-trip de artefatos | MCP-20.02, MCP-20.03, MCP-20.04, MCP-20.05, MCP-20.06, MCP-20.07, MCP-20.08, MCP-20.09 | Hashes, MIME, tamanho, paths e reabertura validam as saídas. |

## G21 — Widget interativo e paridade com UI [P2]

**Pré-requisitos:** G12, G13, G14, G17, G20 · **Gate de saída:** G21, após MCP-21.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-21.01 | Criar painel de inventário e seleção no widget MCP | G12, G13, G14, G17, G20 | Usuário seleciona entidades estáveis na mesma sessão da conversa. |
| MCP-21.02 | Expor ajustes de câmera, vistas e foco regional no widget | MCP-21.01 | Controles geram operações MCP tipadas e atualizam prévia. |
| MCP-21.03 | Adicionar seleção de mão e GripSite com diagnóstico | MCP-21.01 | Escolha de ponto mostra erro de alcance, não estado fictício. |
| MCP-21.04 | Adicionar botões segurar, soltar e trocar mão condutora | MCP-21.01 | Widget aciona as mesmas operações do domínio e recebe revisão. |
| MCP-21.05 | Adicionar controles de queda, parâmetros e avanço de tempo | MCP-21.01 | Animação pode pausar e retomar sem alterar cena oculta. |
| MCP-21.06 | Adicionar controle de timeline com keyframes e seek | MCP-21.01 | A interface usa relógio determinístico e mostra tempo atual. |
| MCP-21.07 | Adicionar painel de colisões e resolução com prévia | MCP-21.01 | Usuário vê pares, ações propostas e confirma alterações. |
| MCP-21.08 | Adicionar prévia de imagens, passes e exportações | MCP-21.01 | Links e downloads respeitam permissões e metadados MIME. |
| MCP-21.09 | Garantir acessibilidade, teclado, responsividade e estados de erro | MCP-21.01 | Controles visíveis exibem progresso, rejeições e feedback verificável. |
| MCP-21.10 | Testar widget ChatGPT, isolamento e reconexão de sessão | MCP-21.02, MCP-21.03, MCP-21.04, MCP-21.05, MCP-21.06, MCP-21.07, MCP-21.08, MCP-21.09 | Interação não duplica ações nem recebe dados de sessão alheia. |

## G22 — Documentação, exemplos, busca e onboarding de agentes [P2]

**Pré-requisitos:** G04, G12, G14, G18, G19, G20 · **Gate de saída:** G22, após MCP-22.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-22.01 | Gerar referência MCP automaticamente a partir dos contratos | G04, G12, G14, G18, G19, G20 | Search/fetch e documentação refletem ferramentas instaladas de verdade. |
| MCP-22.02 | Descrever workflows completos em português para agentes | MCP-22.01 | Exemplos mostram criação, preensão, câmera, física e exportação. |
| MCP-22.03 | Atualizar seis prompts MCP existentes para contratos novos | MCP-22.01 | Nenhum prompt manda usar ferramenta ausente nem JavaScript inseguro. |
| MCP-22.04 | Adicionar prompts novos para Grip, animação e atlas visual | MCP-22.01 | Prompt gera sequência de operações tipadas validável. |
| MCP-22.05 | Documentar orientação local, unidades R, frames e limites | MCP-22.01 | Frente/costas não dependem de olhos, coordenadas não se confundem. |
| MCP-22.06 | Documentar modelos físico e anatômico como parciais | MCP-22.01 | IA recebe avisos de física aproximada e IK não exata. |
| MCP-22.07 | Documentar integração Claude Desktop, Claude Code, ChatGPT, Gemini | MCP-22.01 | Cada instalação mostra transporte, versão, autenticação e permissões. |
| MCP-22.08 | Publicar receitas passo a passo e troubleshooting de erro | MCP-22.01 | Exemplos de sucesso e falha reproduzem saídas de teste. |
| MCP-22.09 | Expor descoberta de capacidades e versões ao agente | MCP-22.01 | Cliente identifica função ausente e sugere alternativa segura. |
| MCP-22.10 | Verificar links, prompts, schemas e exemplos executáveis | MCP-22.02, MCP-22.03, MCP-22.04, MCP-22.05, MCP-22.06, MCP-22.07, MCP-22.08, MCP-22.09 | CI roda os exemplos e falha se citar comandos inexistentes. |

## G23 — Gate final: segurança, paridade 100%, release e rollback [P0/P2]

**Pré-requisitos:** G05, G06, G07, G08, G09, G10, G11, G12, G13, G14, G15, G16, G17, G18, G19, G20, G21, G22 · **Gate de saída:** G23, após MCP-23.10.

| ID | Tarefa | Dependências | Critério de aceite verificável |
|---|---|---|---|
| MCP-23.01 | Fixar matriz de versões, commit e feature flags | G05, G06, G07, G08, G09, G10, G11, G12, G13, G14, G15, G16, G17, G18, G19, G20, G21, G22 | Release de cada ambiente aponta para o mesmo motor e contrato. |
| MCP-23.02 | Auditar zero rotas de código remoto não confiável | MCP-23.01 | Segurança aprova HTTP, roteiro, importação e artefatos. |
| MCP-23.03 | Comprovar cobertura de 100% das operações elegíveis | MCP-23.01 | Inventário compara editor/DOM/engine com contratos MCP e exceções. |
| MCP-23.04 | Executar suites de regressão completas no source | MCP-23.01 | npm testar e casos de Grip/física/câmera terminam com PASS. |
| MCP-23.05 | Executar testes MCP em stdio, HTTP e pacote dist | MCP-23.01 | Ferramentas, recursos e prompts mantêm paridade e estado. |
| MCP-23.06 | Executar testes reais em Claude, Gemini e ChatGPT | MCP-23.01 | Cada cliente realiza criação, alteração, render e exportação. |
| MCP-23.07 | Medir stress, concorrência, latência e memória do servidor | MCP-23.01 | Publicação respeita budgets e não mistura sessões. |
| MCP-23.08 | Executar deploy staging, migração e plano de rollback | MCP-23.01 | Simulação de falha reverte versão sem perda de cenas exportadas. |
| MCP-23.09 | Atualizar changelog, README e manifesto de capacidades | MCP-23.01 | Usuários identificam limites, versão, instalação e mudanças. |
| MCP-23.10 | Assinar aceite final e liberar produção de modo controlado | MCP-23.02, MCP-23.03, MCP-23.04, MCP-23.05, MCP-23.06, MCP-23.07, MCP-23.08, MCP-23.09 | Segurança, testes, paridade, visual e artefatos aprovados antes de merge/deploy. |
