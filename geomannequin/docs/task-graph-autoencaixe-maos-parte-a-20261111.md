# AutoGrip — Task Graph detalhado: Parte A (AG00–AG09)

**Status: planejamento.** Nova funcionalidade: encaixe automático de mão, dedos, punho e braço em objetos. Base no código real da PR #20. Cada tarefa só muda para DONE com evidência de commit, testes e tolerâncias. Gates AGnn só fecham com AG-nn.10 aprovado. IDs estáveis, 10 tarefas por grupo. Esta Parte A tem 100 tarefas.

## AG00 — Auditoria de preensão atual e rastreabilidade (P0)

Dependências: nenhuma. Gate: AG00 após AG-00.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-00.01 | Catalogar o fluxo preensao/segurarObjeto do editor e do MCP | — | Inventário identifica entradas, efeitos, falhas e arquivos para todos os caminhos existentes. |
| AG-00.02 | Mapear preensao-v2, grip-v3, grip-sites e contato-v2 | AG-00.01 | Cada função pública possui dependência, dados lidos, gravados e responsabilidade descritos. |
| AG-00.03 | Mapear FK do braço, ikArm, braço, ombro, cotovelo e mão | AG-00.01 | Grafo funcional identifica limitações de posição versus orientação e obstáculos corporais. |
| AG-00.04 | Mapear handCurl, thumbOpp, fSpread e 5 dedos com falanges | AG-00.01 | Inventário associa cada campo SL à sua articulação, limite, gesto e malha. |
| AG-00.05 | Identificar forma das peças e colisores de cadeira, copo, caixa e cilindro | AG-00.01 | Lista inclui diferenças entre malha desenhada, caixas/cilindros analíticos e colisores aproximados. |
| AG-00.06 | Auditar casos atuais de mãos atravessando corpo e objeto | AG-00.02, AG-00.03 | Conjunto mínimo de cenas reproduz visualmente cada defeito com estado serializado. |
| AG-00.07 | Registrar unidades R, transformações e tolerâncias atuais | AG-00.04, AG-00.05 | Matriz cita conversão R-metro, frames e tolerâncias .35/.07 e modo fechar=false atual. |
| AG-00.08 | Estabelecer casos negativos sem alcance ou com objetos grandes | AG-00.06, AG-00.07 | Fixtures de falha são salvas antes da mudança, sem forçar movimento impossível. |
| AG-00.09 | Registrar pontos MCP, editor e widget que precisam de paridade | AG-00.08 | Matriz liga APIs atuais às novas ferramentas e aos testes de contrato. |
| AG-00.10 | Aprovar baseline reproduzível | AG-00.02, AG-00.03, AG-00.04, AG-00.05, AG-00.06, AG-00.07, AG-00.08, AG-00.09 | Auditoria contém links para fixtures e teste inicial com resultados comparáveis. |

## AG01 — Contrato funcional de autoencaixe e políticas (P0)

Dependências: AG00. Gate: AG01 após AG-01.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-01.01 | Definir autoencaixar como operação com 2 IDs e parâmetros opcionais | AG00 | Seleção mínima de manequim e objeto determina a mão ou retorna erro inequívoco. |
| AG-01.02 | Definir modos preservarObjeto, moverObjeto e hibrido | AG-01.01 | Cada modo especifica quais transformações podem sofrer alterações e seus limites. |
| AG-01.03 | Definir preferências de mão direita, esquerda, auto e ambas | AG-01.01 | Escolha auto evita mãos ocupadas e relata a mão realmente escolhida. |
| AG-01.04 | Definir tipos auto, pinca, potencia, gancho, lateral, tripode e apoio | AG-01.01 | Semântica de cada pegada descreve contatos e superfícies compatíveis. |
| AG-01.05 | Definir métricas de contato, penetração, orientação, estabilidade e conforto | AG-01.01 | Fórmula de aceite distingue falha geométrica de falha anatômica. |
| AG-01.06 | Definir tolerâncias configuráveis em R e graus | AG-01.02, AG-01.03 | Valores default e máximos são finitos, testados e independentes de DPI. |
| AG-01.07 | Definir resultado calculado, aplicado, parcial, impossivel e cancelado | AG-01.04, AG-01.05 | Nenhum resultado parcial vira vínculo permanente sem aceite explícito. |
| AG-01.08 | Definir política de fallback e autorização de movimento da cena | AG-01.06, AG-01.07 | Motor nunca move objeto, tronco ou mão além do permitido silenciosamente. |
| AG-01.09 | Definir modo preview sem commit, apply transacional e retry | AG-01.08 | Prévia inclui diferenças de estado e não altera a cena. |
| AG-01.10 | Fechar contrato público v1 do autoencaixe | AG-01.02, AG-01.03, AG-01.04, AG-01.05, AG-01.06, AG-01.07, AG-01.08, AG-01.09 | Testes de esquema validam escolhas, valores padrão, limites e erros em português. |

## AG02 — Frames 3D, escalas e determinismo matemático (P0)

Dependências: AG00. Gate: AG02 após AG-02.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-02.01 | Formalizar todos os frames mundo, tronco, ombro, punho, palma, dedo e objeto | AG00 | Cada frame informa origem, eixo frontal e ordem da matriz 3x3. |
| AG-02.02 | Reutilizar rigidFrame, rigidCompose, rigidInverse e objectRigidPose | AG-02.01 | A composição de ida e volta preserva tolerância numérica fixa. |
| AG-02.03 | Converter unidades paramétricas e comprimentos reais da mão | AG-02.01 | Escala individual deriva do modelo sem fixar mão média para todos. |
| AG-02.04 | Estabelecer transformações de dedos e superfícies sem espelhamento | AG-02.01 | Dedo direito e esquerdo mantêm quiralidade e eixos ortogonais. |
| AG-02.05 | Normalizar normais de pegada, plano tangente e ortonormalidade | AG-02.01 | Grip region define normal unitária e dois tangentes reproduzíveis. |
| AG-02.06 | Implementar quaternion ou rotação matricial estável nas otimizações | AG-02.02, AG-02.03 | A interpolação evita flips e matrizes inválidas e preserva orientação. |
| AG-02.07 | Implementar comparação angular e distância SE(3) ponderadas | AG-02.04, AG-02.05 | Rotação, translação e escala têm resíduos separados, sem soma adimensional. |
| AG-02.08 | Tratar alvo/infinito/NaN e casos degenerados | AG-02.06, AG-02.07 | Dados não finitos são rejeitados antes de mudar a cena. |
| AG-02.09 | Implementar ordenação de candidatos e desempate determinísticos | AG-02.08 | Mesma cena e configuração produzem mesma pegada e score. |
| AG-02.10 | Validar álgebra e regressões de espelhamento | AG-02.02, AG-02.03, AG-02.04, AG-02.05, AG-02.06, AG-02.07, AG-02.08, AG-02.09 | Testes numéricos cobrem R, ambos os lados e yaw ±180°. |

## AG03 — Antropometria individual e calibração da mão (P0)

Dependências: AG02. Gate: AG03 após AG-03.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-03.01 | Extrair largura, comprimento, espessura da palma por biotipo | AG02 | Medições mudam coerentemente com armLen, armK e configurações corporais. |
| AG-03.02 | Medir cada falange com os comprimentos efetivos de maos.js | AG-03.01 | Cinco dedos têm base, três segmentos, raios, eixos e pontas verificáveis. |
| AG-03.03 | Derivar abertura de pinça entre indicador e polegar | AG-03.01 | Pinch span calculado por FK depende de oposição, curl e abdução. |
| AG-03.04 | Derivar abertura máxima de mão e capacidade de envolver objetos | AG-03.01 | Intervalo útil depende da anatomia real e não de raio fixo arbitrário. |
| AG-03.05 | Medir normal, concavidade e superfície de contato palmar | AG-03.01 | Área de apoio usa amostra de superfície, com limites conhecidos. |
| AG-03.06 | Calcular envergadura e alcance dos dedos em 3D | AG-03.02, AG-03.03 | Endpoints extremos respeitam limites articulares e mãos espelhadas. |
| AG-03.07 | Criar HandMetrics individual e cache por assinatura anatômica | AG-03.04, AG-03.05 | Mudança de biotipo invalida cache, mas rotação do braço não muda escala intrínseca. |
| AG-03.08 | Gerar atlas antropométrico dos biotipos e tamanhos extremos | AG-03.06, AG-03.07 | Atlas apresenta mínimo, médio e máximo, mão esquerda/direita e pinça. |
| AG-03.09 | Garantir que resolver pegada não modifica dimensões corporais | AG-03.08 | Testes comprovam que nenhum alvo força scale do objeto ou mão sem opção explícita. |
| AG-03.10 | Validar medidas com FK e geometria renderizada | AG-03.02, AG-03.03, AG-03.04, AG-03.05, AG-03.06, AG-03.07, AG-03.08, AG-03.09 | Valores correspondem às malhas/segmentos com erro documentado em R. |

## AG04 — FK fino e superfícies de contato dos cinco dedos (P0)

Dependências: AG03. Gate: AG04 após AG-04.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-04.01 | Criar representação HandPose com todos os graus de liberdade reais | AG03 | handCurl, fTh/In/Me/An/Mi, Mcp, Ip, Abd, thumbOpp e fSpread são preservados. |
| AG-04.02 | Calcular frames mundiais MCP, IFP, IFD e ponta em ambos os lados | AG-04.01 | FK utiliza juntasDedos e world transforms sem divergência de desenho. |
| AG-04.03 | Extrair pontos de contato da polpa, ponta, lateral e falanges | AG-04.01 | Amostras têm raio, normal, dedo, segmento e posição mundial. |
| AG-04.04 | Definir colliders diferenciados de palma, polegar e cada dedo | AG-04.01 | Colisores seguem pose e espessura da superfície renderizada. |
| AG-04.05 | Adicionar adaptação de abdução e oposição sem perder limites | AG-04.01 | Valores propostos sofrem clamp biomecânico em uma fonte única. |
| AG-04.06 | Derivar jacobianos por dedo ou diferenças finitas estáveis | AG-04.02, AG-04.03 | Predição de deslocamento das polpas é finita e reproduzível. |
| AG-04.07 | Padronizar filtros de auto contato de juntas adjacentes | AG-04.04, AG-04.05 | Falanges conectadas não causam falso positivo e dedos cruzados são detectáveis. |
| AG-04.08 | Gerar mão aberta, pinça, gancho, tripode e fechada como fixtures | AG-04.06, AG-04.07 | Pose salva pode ser restaurada e comparada em 3D. |
| AG-04.09 | Verificar consistência entre malha e colisores finos | AG-04.08 | Erro de representação fica abaixo da margem calibrada do planejador. |
| AG-04.10 | Validar continuação da mão em deformações grandes | AG-04.02, AG-04.03, AG-04.04, AG-04.05, AG-04.06, AG-04.07, AG-04.08, AG-04.09 | Testes asseguram cinco dedos, sem espelhamento e sem NaN. |

## AG05 — Geometria de objetos e regiões agarráveis reais (P0)

Dependências: AG02. Gate: AG05 após AG-05.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-05.01 | Representar regiões nas superfícies em vez de GripSites isolados | AG02 | GripRegion retorna patches, contorno, normal, curvatura e espessura local. |
| AG-05.02 | Extrair pega nas barras/encosto/assento da cadeira | AG-05.01 | Regiões em arestas e barras evitam tratar assento sólido como alça oca. |
| AG-05.03 | Derivar perímetro, raio e altura útil de copos e cilindros | AG-05.01 | Preensão cilíndrica avalia diâmetro contra abertura da mão. |
| AG-05.04 | Derivar bordas, cantos, faces e alças opcionais de caixas | AG-05.01 | Faces sem espaço para polegar oposto não geram pegada de pinça válida. |
| AG-05.05 | Associar regiões a partes físicas de partesDoObjeto | AG-05.01 | A mesma geometria alimenta desenho, colisão e gerador de grip. |
| AG-05.06 | Definir materiais e atrito apenas quando disponíveis | AG-05.02, AG-05.03 | Estimativas sem coeficiente real não são anunciadas como estabilidade física. |
| AG-05.07 | Definir faces proibidas, quentes, cortantes ou frágeis como metadados opcionais | AG-05.04, AG-05.05 | Busca exclui regiões explicitamente marcadas pelo usuário. |
| AG-05.08 | Gerar amostras parametrizadas por malha de primitivas | AG-05.06, AG-05.07 | Posições e normais locais são estáveis mesmo após rotação 6DOF. |
| AG-05.09 | Manter GripSites antigos como âncoras candidatas compatíveis | AG-05.08 | Sites nomeados continuam válidos e podem direcionar a busca de regiões. |
| AG-05.10 | Validar regiões para todos os tipos de objeto existentes | AG-05.02, AG-05.03, AG-05.04, AG-05.05, AG-05.06, AG-05.07, AG-05.08, AG-05.09 | Cadeira, banco, mesa, caixa, copo e barril geram patches coerentes. |

## AG06 — Distância assinada, contato e refinamento geométrico (P0)

Dependências: AG04, AG05. Gate: AG06 após AG-06.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-06.01 | Separar broadphase AABB de narrowphase de contato | AG04, AG05 | Busca cara só roda em pares próximos; não se perde contato verdadeiro. |
| AG-06.02 | Reusar pointSolid de caixas orientadas e cilindros como base | AG-06.01 | Sinal positivo indica folga e negativo penetração, com normais coerentes. |
| AG-06.03 | Implementar distância cápsula-sólido com pontos testemunha | AG-06.01 | Cada candidato retorna profundidade, normal, contato e identificador de partes. |
| AG-06.04 | Refinar regiões finas da palma/dedos com amostragem robusta | AG-06.01 | A detecção distingue toque na superfície de atravessamento de falanges. |
| AG-06.05 | Definir tratamento de alças ocas e geometria composta | AG-06.01 | O interior do espaço vazio não é interpretado como peça sólida. |
| AG-06.06 | Oferecer retorno de todos os contatos relevantes do grip | AG-06.02, AG-06.03 | Resultado inclui pares dedo/objeto e área atingida, sem colapsar num único ponto. |
| AG-06.07 | Refinar distâncias por SDF de composição ou malha quando necessário | AG-06.04, AG-06.05 | Cenas incompatíveis com caixas proxy usam alternativa mais fina ou avisam limitação. |
| AG-06.08 | Implementar avaliação temporária de cena sem mutação global | AG-06.06, AG-06.07 | Milhares de candidatos podem ser avaliados sem atualizar estado definitivo. |
| AG-06.09 | Expor limites de tolerância de aproximação e penetração distintos | AG-06.08 | Contato intencional pode tocar a zero, mas penetração além do limiar reprova. |
| AG-06.10 | Validar geometrias inclinadas e testes de distância sinalizada | AG-06.02, AG-06.03, AG-06.04, AG-06.05, AG-06.06, AG-06.07, AG-06.08, AG-06.09 | Suíte cobre contatos de ponta, borda, interior, suporte e normal invertida. |

## AG07 — Políticas de colisão e zonas de contato permitido (P0)

Dependências: AG06. Gate: AG07 após AG-07.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-07.01 | Distinguir pares palma/dedo-objeto de outras colisões | AG06 | Contato de pegada não libera penetração de braço, antebraço, peito ou objeto. |
| AG-07.02 | Estabelecer máscara de contato por GripRegion e dedo | AG-07.01 | Só regiões planejadas permitem toque superficial com tolerância definida. |
| AG-07.03 | Manter autocolisões corporais e contato com outros manequins | AG-07.01 | Solucionador não atravessa cabeça, tronco ou terceiros para alcançar objeto. |
| AG-07.04 | Verificar dedos versus outros dedos fora de articulações adjacentes | AG-07.01 | Cruzamento impróprio e autopenetração geram penalidade/rejeição. |
| AG-07.05 | Verificar objeto contra chão, móveis e filhos do próprio objeto | AG-07.01 | Auto-interseção de hierarquia é ignorada, obstáculos externos não. |
| AG-07.06 | Manter baseline de colisões pré-existentes sem aumentar profundidade | AG-07.02, AG-07.03 | Autoencaixar não piora colisão anterior sem aprovação explícita. |
| AG-07.07 | Definir margem de segurança para abordagem, dedos e transporte | AG-07.04, AG-07.05 | Penetração máxima e folga são parametrizáveis por estágio. |
| AG-07.08 | Priorizar erro sólido em vez de reduzir arbitrariamente tolerância | AG-07.06, AG-07.07 | Motor falha quando nenhum candidato respeita colisão, não esconde contato. |
| AG-07.09 | Implementar avaliação de custo por corpo, mão, objeto e cenário | AG-07.08 | Relatório mostra cada grupo e partes causadoras de bloqueio. |
| AG-07.10 | Validar regressões Contact V2 e uso de máscara | AG-07.02, AG-07.03, AG-07.04, AG-07.05, AG-07.06, AG-07.07, AG-07.08, AG-07.09 | Cenários de cadeira perto do torso não autorizam sobreposições indevidas. |

## AG08 — Taxonomia de pegadas e compatibilidade anatômica (P1)

Dependências: AG03, AG05. Gate: AG08 após AG-08.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-08.01 | Definir pegada de potência de palma para volumes compatíveis | AG03, AG05 | Requer contato palmar e vários dedos na face/circunferência. |
| AG-08.02 | Definir pinça polpa-polpa e ponta-ponta | AG-08.01 | Exige contato oposto de polegar e indicador com espaço suficiente. |
| AG-08.03 | Definir tripode polegar-indicador-médio | AG-08.01 | Permite objetos pequenos sem fechamento obrigatório de anelar/mínimo. |
| AG-08.04 | Definir gancho para bordas e alças | AG-08.01 | Dedos se curvam sobre suporte com espaço real e sem atravessar o material. |
| AG-08.05 | Definir pegada lateral de chave e precisão | AG-08.01 | Polegar opõe a face lateral do indicador com normal consistente. |
| AG-08.06 | Definir apoio palmar, sustentação por baixo e mão aberta | AG-08.02, AG-08.03 | Distingue suporte de objeto de agarrar preso rigidamente. |
| AG-08.07 | Definir pegada de duas mãos e parâmetros de simetria | AG-08.04, AG-08.05 | Posições esquerda/direita podem diferir conforme geometria da cadeira. |
| AG-08.08 | Associar classe de pegada a limitações anatômicas | AG-08.06, AG-08.07 | Objetos grandes ou finos demais recebem restrições, não simples deformação. |
| AG-08.09 | Criar biblioteca de presets de dedos apenas como sementes | AG-08.08 | Preset inicial nunca substitui validação de colisão/contato final. |
| AG-08.10 | Validar classificação para cadeira, copo, caixa e barra | AG-08.02, AG-08.03, AG-08.04, AG-08.05, AG-08.06, AG-08.07, AG-08.08, AG-08.09 | O tipo auto escolhe pegada coerente ou declara nenhuma disponível. |

## AG09 — Reconhecimento e ordenação automática de regiões (P1)

Dependências: AG05, AG08. Gate: AG09 após AG-09.10.

| ID | Tarefa | Dependências | Critério de aceite |
|---|---|---|---|
| AG-09.01 | Criar busca de todas as regiões agarráveis de um objeto | AG05, AG08 | Sem ponto especificado, busca considera regiões e orientações relevantes. |
| AG-09.02 | Estimar visibilidade e acessibilidade da mão a cada região | AG-09.01 | Região escondida atrás de partes rígidas recebe penalidade ou exclusão. |
| AG-09.03 | Comparar dimensões da região à abertura de pinça e palma | AG-09.01 | Posição inviável por escala é descartada antes de IK custosa. |
| AG-09.04 | Gerar amostras de pontos de contato em superfícies extensas | AG-09.01 | A busca não fica limitada ao centro do GripSite nominal. |
| AG-09.05 | Combinar aproximações frontal, lateral, superior e inferior | AG-09.01 | Direções são relativas à normal real e ao corpo do manequim. |
| AG-09.06 | Identificar estratégia preferida por proximidade e intenção | AG-09.02, AG-09.03 | Manter cadeira parada tem prioridade quando preserveObjeto=true. |
| AG-09.07 | Permitir pinning de site específico e regiões proibidas | AG-09.04, AG-09.05 | Seleção do usuário fixa preferência mas ainda exige viabilidade física. |
| AG-09.08 | Gerar ranking de candidatos com razões de descarte | AG-09.06, AG-09.07 | O relatório separa alcance, dimensões, orientação, obstáculos e contato. |
| AG-09.09 | Criar cache por revisão de objeto, mão e cenário | AG-09.08 | Mudança de posição, anatomia ou colisão invalida os scores antigos. |
| AG-09.10 | Validar busca automática contra melhores sites manuais | AG-09.02, AG-09.03, AG-09.04, AG-09.05, AG-09.06, AG-09.07, AG-09.08, AG-09.09 | Cenários básicos selecionam site viável sem enviesamento pela ordem interna. |
