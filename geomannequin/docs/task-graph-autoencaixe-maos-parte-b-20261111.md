# AutoGrip — Task Graph detalhado: Parte B (AG10–AG19)

**Status: planejamento.** Núcleo matemático: candidatos SE(3), IK de palma/braço/polegar/dedos, colisor, otimização conjunta, trajetória e bilateralidade. Dependências AG00–AG09 referem-se à Parte A. Cada AG-nn.10 fecha o gate da fase após verificar tarefas da fase. 100 tarefas.

## AG10 — Geração de candidatos de pegada SE(3) (P0)

Dependências: AG07, AG08, AG09. Gate: AG10 após AG-10.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-10.01 | Criar objeto GripCandidate com alvo, mão, região e pose 6DOF | AG07, AG08, AG09 | Candidato carrega frames, dedos iniciais, score e razões de rejeição. |
| AG-10.02 | Gerar orientação da palma a partir de normal e tangentes | AG-10.01 | Base da mão coincide com a direção de aproximação desejada sem espelhamento. |
| AG-10.03 | Gerar offsets palmares a partir da espessura do objeto | AG-10.01 | O volume da palma não entra no material ao alinhar a superfície. |
| AG-10.04 | Variar roll/pitch/yaw da mão em uma malha discreta controlada | AG-10.01 | Busca considera pegadas equivalentes e inclinações viáveis no mesmo site. |
| AG-10.05 | Gerar candidatos de pinça com dois contatos antagônicos | AG-10.01 | Polegar e indicador miram superfícies opostas e alcançáveis. |
| AG-10.06 | Gerar candidatos de potência, gancho, tripode e apoio | AG-10.02, AG-10.03 | Cada classe define contatos exigidos e posição de palma correspondente. |
| AG-10.07 | Gerar candidatos com o objeto fixo e modo mover objeto opcional | AG-10.04, AG-10.05 | O deslocamento proposto nunca excede a política de movimento. |
| AG-10.08 | Eliminar duplicatas por distância rotacional/translacional | AG-10.06, AG-10.07 | Candidatos redundantes reduzem custo sem perder diversidade de pegada. |
| AG-10.09 | Rankear com heurística barata antes de executar IK | AG-10.08 | Os N melhores vão para refinamento e justificam cortes do restante. |
| AG-10.10 | Validar geração em pares de mão e objetos com poses inclinadas | AG-10.02, AG-10.03, AG-10.04, AG-10.05, AG-10.06, AG-10.07, AG-10.08, AG-10.09 | Há candidatos admissíveis nos casos simples e rejeição explícita nos inviáveis. |

## AG11 — IK 6DOF do braço, ombro e cotovelo (P0)

Dependências: AG03, AG07, AG10. Gate: AG11 após AG-11.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-11.01 | Formalizar graus de liberdade do braço e seus limites individuais | AG03, AG07, AG10 | Jacobiano manipula armAbd, armFlex, armRot, elbow e demais DOFs disponíveis. |
| AG-11.02 | Acoplar posição e orientação desejada da palma ao problema IK | AG-11.01 | Resultado devolve resíduos translacional e angular separados. |
| AG-11.03 | Adicionar solver DLS ou otimização numérica com Jacobiano | AG-11.01 | Solução converge em testes de múltiplas sementes sem NaN. |
| AG-11.04 | Resolver prioridades de cotovelo, clavícula e escápula quando existentes | AG-11.01 | Escolha minimiza desconforto e usa apenas parâmetros representados pelo rig. |
| AG-11.05 | Respeitar limites anatômicos e acoplamentos aplicados em applyParams | AG-11.01 | Nenhuma solução final ultrapassa limites mesmo perto de singularidades. |
| AG-11.06 | Adicionar penalidade para atravessar torso, cabeça e pernas | AG-11.02, AG-11.03 | IK rejeita solução com mão no alvo mas antebraço dentro do corpo. |
| AG-11.07 | Procurar múltiplos polos de cotovelo e configurações de ombro | AG-11.04, AG-11.05 | Casos com obstáculos encontram alternativa sem dobrar o braço ao contrário. |
| AG-11.08 | Evitar saltos entre configurações vizinhas e mudanças súbitas de sinal | AG-11.06, AG-11.07 | Semente da pose atual preserva continuidade da articulação. |
| AG-11.09 | Retornar motivo fora de alcance e melhor pose parcial não aplicada | AG-11.08 | Distância residual não é mascarada por ampliação de limite ou teleporte. |
| AG-11.10 | Validar IK em 3D para mãos dos dois lados e biotipos extremos | AG-11.02, AG-11.03, AG-11.04, AG-11.05, AG-11.06, AG-11.07, AG-11.08, AG-11.09 | Erro final é medido em R/graus e respeita geometria corporal. |

## AG12 — Orientação de punho, pronação e alinhamento palmar (P0)

Dependências: AG04, AG11. Gate: AG12 após AG-12.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-12.01 | Extrair eixos reais de wrist, handFrameV3 e palma | AG04, AG11 | Matriz local condiz com os eixos do gesto e do volume do objeto. |
| AG-12.02 | Modelar controles de pronação, supinação e flexão do punho | AG-12.01 | Apenas parâmetros existentes são usados, com limites e fallback documentado. |
| AG-12.03 | Alinhar face útil da palma à região de contato selecionada | AG-12.01 | Normal palmar enfrenta superfície sem atravessá-la. |
| AG-12.04 | Resolver torção angular que preserva posição da mão | AG-12.01 | Erro de orientação não é ocultado pelo ajuste apenas do punho ao ponto. |
| AG-12.05 | Desviar o punho quando houver colisão com borda ou encosto | AG-12.01 | Variantes de orientação mantêm folga do dorso e ombro alcançável. |
| AG-12.06 | Compatibilizar esquerda/direita ao redor de cilindros e barras | AG-12.02, AG-12.03 | Normais e sinais de torque não trocam lado ao espelhar. |
| AG-12.07 | Planejar superfície de dedos aberta durante aproximação | AG-12.04, AG-12.05 | Mão começa com espaço livre para o objeto entrar entre os dedos. |
| AG-12.08 | Aplicar rotação incremental sem gimbal flip visível | AG-12.06, AG-12.07 | Perturbações pequenas da câmera/cadeira produzem ajuste contínuo. |
| AG-12.09 | Inspecionar diferença orientação desejada/obtida em graus | AG-12.08 | Diagnóstico mostra erro real e prioridades contrariadas. |
| AG-12.10 | Validar orientação em seis lados da cadeira e quatro vistas do copo | AG-12.02, AG-12.03, AG-12.04, AG-12.05, AG-12.06, AG-12.07, AG-12.08, AG-12.09 | Wrist/palm não ficam do lado avesso do objeto nem atravessam a superfície. |

## AG13 — IK independente do polegar e oposição (P0)

Dependências: AG04, AG12. Gate: AG13 após AG-13.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-13.01 | Definir contatos possíveis da polpa, ponta e lateral do polegar | AG04, AG12 | Ponta retorna centro, raio e normal da superfície de contato. |
| AG-13.02 | Variar thumbOpp e CMC abdução como graus de liberdade reais | AG-13.01 | Solução usa thumbOpp e fThAbd no intervalo anatômico disponível. |
| AG-13.03 | Resolver fThMcp e fThIp com alvo 3D de contato | AG-13.01 | Polegar aproxima superfície sem atravessar cilindro/encosto. |
| AG-13.04 | Manter coordenação do polegar com a direção da palma | AG-13.01 | Oposição é feita em direção aos dedos, não em direção aleatória. |
| AG-13.05 | Suportar pinça polpa-a-polpa e ponta-a-ponta | AG-13.01 | Contato alcança indicador sem exigir colisão entre falanges. |
| AG-13.06 | Suportar polegar sobre lateral da caixa ou barra | AG-13.02, AG-13.03 | Osso proximal não penetra volume enquanto a polpa toca a peça. |
| AG-13.07 | Aplicar limitação de movimento e desconforto do polegar | AG-13.04, AG-13.05 | Penalidades incluem hiperextensão e fechamento além do alcance. |
| AG-13.08 | Replanejar quando normal do contato for impossível | AG-13.06, AG-13.07 | Solucionador escolhe outra superfície ou retorna inviável. |
| AG-13.09 | Emitir contato do polegar com erro normal, tangencial e penetração | AG-13.08 | Resultados podem ser inspecionados sem ver a renderização. |
| AG-13.10 | Validar pinças de diâmetro pequeno, médio e impossível | AG-13.02, AG-13.03, AG-13.04, AG-13.05, AG-13.06, AG-13.07, AG-13.08, AG-13.09 | Caso impossível nunca deforma polegar nem insere dedos na peça. |

## AG14 — IK dos quatro dedos e fechamento adaptativo (P0)

Dependências: AG04, AG13. Gate: AG14 após AG-14.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-14.01 | Criar solver individual de indicador, médio, anelar e mínimo | AG04, AG13 | Cada dedo recebe alvo e pesos de contato independentes. |
| AG-14.02 | Resolver flexões MCP, PIP e DIP compatíveis com rig atual | AG-14.01 | Solver usa f*Mcp, f*Ip e handCurl sem assumir DOFs inexistentes. |
| AG-14.03 | Resolver abdução f*Abd e fSpread conforme largura do objeto | AG-14.01 | Dedos se distribuem ao redor de barras/arestas sem todos convergirem no mesmo ponto. |
| AG-14.04 | Fechar dedos até distância de contato e não até valor fixo | AG-14.01 | Primeiro contato válido interrompe compressão de cada falange. |
| AG-14.05 | Adicionar refinamento multiarticular em vez de varrer só fXX | AG-14.01 | Ponta e meio do dedo alcançam região com menor interpenetração. |
| AG-14.06 | Priorizar falanges e polpas relevantes por tipo de pegada | AG-14.02, AG-14.03 | Gancho usa falange média, pinça usa polpa e potência usa vários contatos. |
| AG-14.07 | Preservar relaxamento de dedos que não participam da pega | AG-14.04, AG-14.05 | Anelar e mínimo não fecham em pinças de precisão sem necessidade. |
| AG-14.08 | Checar entre dedos, palma, objeto e partes do próprio corpo | AG-14.06, AG-14.07 | Não há cruzamento indevido ou colisão proibida após fechamento. |
| AG-14.09 | Reportar quais dedos fizeram contato e erros por dedo | AG-14.08 | Resposta inclui polegar, indicador, médio, anelar e mínimo individualmente. |
| AG-14.10 | Validar mãos abertas, pinça, gancho, potência e tripode | AG-14.02, AG-14.03, AG-14.04, AG-14.05, AG-14.06, AG-14.07, AG-14.08, AG-14.09 | Atlas por biotipo demonstra contatos certos sem atravessar o objeto. |

## AG15 — Solucionador conjunto de braço, mão, objeto e contatos (P0)

Dependências: AG07, AG11, AG12, AG13, AG14. Gate: AG15 após AG-15.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-15.01 | Definir vetor de otimização com braço, punho, cinco dedos e objeto opcional | AG07, AG11, AG12, AG13, AG14 | Estado tem graus de liberdade explícitos e bloqueios por política. |
| AG-15.02 | Construir custo multiobjetivo com unidades e pesos calibrados | AG-15.01 | Mede erro de contato, profundidade, pose inicial, limites, conforto e movimento do objeto. |
| AG-15.03 | Separar restrições duras de custos suaves | AG-15.01 | Limites anatômicos, interpenetração crítica e mão ocupada nunca são compensados por score. |
| AG-15.04 | Usar múltiplas sementes, busca grossa e refinamento local | AG-15.01 | Busca escapa de mínimos locais típicos de cadeira sem custo explosivo. |
| AG-15.05 | Permitir otimização coordenada por blocos e refinamento simultâneo | AG-15.01 | Solução alterna corpo/palma/dedos/objeto até convergir ou atingir orçamento. |
| AG-15.06 | Tratar singularidades, impossibilidade e plateau numéricos | AG-15.02, AG-15.03 | Motor interrompe com motivo preciso sem estados não finitos. |
| AG-15.07 | Comparar vários tipos de pega para o mesmo par mão-objeto | AG-15.04, AG-15.05 | Modo auto escolhe solução com melhor score e requisitos cumpridos. |
| AG-15.08 | Aplicar checagem final de distância assinada em geometria fina | AG-15.06, AG-15.07 | Mão toca regiões planejadas e não apresenta penetração proibida acima do limiar. |
| AG-15.09 | Emitir certificado de pegada com residual e margens por restrição | AG-15.08 | Relatório contém score, profundidade, folga, contatos, iterações e fallback. |
| AG-15.10 | Validar otimização com objetos de escalas distintas e poses iniciais aleatórias | AG-15.02, AG-15.03, AG-15.04, AG-15.05, AG-15.06, AG-15.07, AG-15.08, AG-15.09 | Testes reproduzíveis alcançam a meta declarada ou retornam inviável. |

## AG16 — Correção automática controlada da pose do objeto (P1)

Dependências: AG11, AG15. Gate: AG16 após AG-16.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-16.01 | Definir prioridade preservarObjeto e penalidade de movimento de objeto | AG11, AG15 | Modo padrão mantém cadeira fixa e ajusta braço/mão sempre que possível. |
| AG-16.02 | Implementar opção moverObjeto com limites XYZ e angular | AG-16.01 | Rotação/translação propostas são finitas, limitadas e explícitas. |
| AG-16.03 | Projetar correção 6DOF sem deslocar peças ligadas indevidamente | AG-16.01 | Mover cadeira preserva filhos por rigid transform e checa apoios. |
| AG-16.04 | Escolher ponto de pivô útil para reduzir mudança visível | AG-16.01 | Correção de giro não cria salto arbitrário do centro de massa geométrico. |
| AG-16.05 | Buscar microajuste de aproximação para limpar interpenetração palmar | AG-16.01 | Afastar objeto da mão não perde contatos necessários. |
| AG-16.06 | Respeitar colisão com piso e outros objetos após a correção | AG-16.02, AG-16.03 | Pose nova não atravessa mesa ou chão para encaixar dedos. |
| AG-16.07 | Evitar alterar dimensões da mão e do objeto como correção | AG-16.04, AG-16.05 | Espessura e escala permanecem constantes durante a operação. |
| AG-16.08 | Combinar ajuste de objeto com IK do braço até limiar de solução | AG-16.06, AG-16.07 | Não cria degrau entre poses da mão e do móvel. |
| AG-16.09 | Reportar deslocamento e rotação propostos antes do commit | AG-16.08 | Prévia exibe delta XYZ, ângulos e qualidade obtida. |
| AG-16.10 | Validar cadeira inclinada, copo em mesa e caixa no chão | AG-16.02, AG-16.03, AG-16.04, AG-16.05, AG-16.06, AG-16.07, AG-16.08, AG-16.09 | Modo preservar/mover/híbrido produz estados previstos ou falha justificada. |

## AG17 — Planejamento livre de obstáculos e aproximação gradual (P1)

Dependências: AG07, AG15, AG16. Gate: AG17 após AG-17.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-17.01 | Calcular pregrasp afastado da superfície pela normal do alvo | AG07, AG15, AG16 | Posição inicial oferece espaço para dedos abertos antes do contato. |
| AG-17.02 | Planejar trajetória do braço do estado inicial até pregrasp | AG-17.01 | Ombro, cotovelo e punho transitam sem atravessar tronco e móveis. |
| AG-17.03 | Amostragem adaptativa e swept volumes no movimento da mão | AG-17.01 | Nenhuma amostra intermediária inclui penetração proibida acima da tolerância. |
| AG-17.04 | Planejar aproximação final com velocidade angular e translacional limitada | AG-17.01 | Palma não teleporta através do encosto ou assento. |
| AG-17.05 | Distinguir contato desejado no fim de colisão prematura no percurso | AG-17.01 | Superfície correta só é tocada no estágio de fechamento. |
| AG-17.06 | Adicionar planejamento alternativo quando a rota direta for bloqueada | AG-17.02, AG-17.03 | Altera polo do cotovelo ou usa caminho em segmentos. |
| AG-17.07 | Verificar obstáculos externos incluindo outro manequim | AG-17.04, AG-17.05 | Planejador rejeita rota que toca terceiro sem autorização. |
| AG-17.08 | Emitir caminho temporal e relatório do primeiro bloqueio | AG-17.06, AG-17.07 | Visualização exibe waypoints, etapa, segmento e colisores. |
| AG-17.09 | Permitir interromper e replanejar ao mover objeto/câmera/corpo | AG-17.08 | Trajetória cancelada não deixa mão ou cadeira em estado inválido. |
| AG-17.10 | Validar cenários com cadeira atrás do corpo, parede e mesa | AG-17.02, AG-17.03, AG-17.04, AG-17.05, AG-17.06, AG-17.07, AG-17.08, AG-17.09 | Rota viável desvia; rota impossível retorna causa sem teleporte. |

## AG18 — Duas mãos e solução simultânea bilateral (P1)

Dependências: AG15, AG17. Gate: AG18 após AG-18.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-18.01 | Gerar GripRegions para as duas mãos com zonas separadas | AG15, AG17 | Encosto da cadeira admite duas pegadas sem selecionar o mesmo espaço inadequado. |
| AG-18.02 | Estabelecer constraints simultâneas de ambas as palmas | AG-18.01 | Poses são resolvidas juntas em vez de IK secundária unilateral sem feedback. |
| AG-18.03 | Resolver quatro níveis: dois braços, duas palmas, dez dedos e objeto | AG-18.01 | Estado acoplado preserva um único objeto e os dois contatos. |
| AG-18.04 | Evitar braço esquerdo atravessar o direito ou tronco | AG-18.01 | Autocolisões interbraços entram como restrição dura. |
| AG-18.05 | Compatibilizar orientações da peça e os dois caminhos de aproximação | AG-18.01 | Objeto mantém pose consistente sem uma mão empurrar a outra. |
| AG-18.06 | Suportar pegada assimétrica e distribuição desigual dos dedos | AG-18.02, AG-18.03 | Uma mão pode sustentar a base e outra estabilizar encosto. |
| AG-18.07 | Definir regra de mão principal e troca sem salto | AG-18.04, AG-18.05 | Transferência recalcula referência mantendo pose e contato. |
| AG-18.08 | Definir fallback somente uma mão sem vínculo bilateral falso | AG-18.06, AG-18.07 | Se segunda mão não alcança, falha ou oferece pegada de uma mão. |
| AG-18.09 | Validar força/torque apenas se modelo físico suportar | AG-18.08 | Nenhuma alegação de estabilidade física vem de vínculo geométrico sozinho. |
| AG-18.10 | Validar bilateral em cadeira grande/pequena e diferentes biotipos | AG-18.02, AG-18.03, AG-18.04, AG-18.05, AG-18.06, AG-18.07, AG-18.08, AG-18.09 | Ambas as mãos têm contato real e não há deslocamento visível do objeto. |

## AG19 — Qualidade da pegada e critérios de estabilidade geométrica (P1)

Dependências: AG14, AG15, AG18. Gate: AG19 após AG-19.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-19.01 | Medir erro de contato da polpa e palma em cada região | AG14, AG15, AG18 | Distância, área e normal aparecem por dedo e por mão. |
| AG-19.02 | Medir penetração máxima e total por tipo de colisão | AG-19.01 | Falhas registram partes, profundidades e limiar excedido. |
| AG-19.03 | Medir qualidade geométrica de oposição de contatos | AG-19.01 | Pinça com normais não opostas é reprovada mesmo que pontas encostem. |
| AG-19.04 | Medir margem de alcance e conforto articular | AG-19.01 | Pegadas no limite de extensão recebem pontuação inferior. |
| AG-19.05 | Medir centragem do objeto em relação a contatos disponíveis | AG-19.01 | Cadeira pode ser estável geometricamente sem alegar equilíbrio dinâmico. |
| AG-19.06 | Definir score legível de 0 a 100 com componentes independentes | AG-19.02, AG-19.03 | Relatório detalha pesos e não oculta violações duras. |
| AG-19.07 | Calibrar tolerância de contato versus penetração por tipo de peça | AG-19.04, AG-19.05 | Defaults têm testes e escalas em R, não pixels. |
| AG-19.08 | Distinguir qualidade visual e sustentação física não simulada | AG-19.06, AG-19.07 | Estado geométrico válido não implica automaticamente resistência à gravidade. |
| AG-19.09 | Gerar justificativas de escolha, fallback e impossibilidade | AG-19.08 | Usuário vê por que pinça foi escolhida ou por que não serve. |
| AG-19.10 | Validar score contra atlas de poses boas e ruins | AG-19.02, AG-19.03, AG-19.04, AG-19.05, AG-19.06, AG-19.07, AG-19.08, AG-19.09 | Cenas obviamente atravessadas nunca recebem nota aprovada. |
