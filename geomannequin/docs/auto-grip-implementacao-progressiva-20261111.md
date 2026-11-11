# GeoMannequin AutoGrip — implementação progressiva e validação pendente

**Data:** 11/11/2026. **Branch:** feat/geomannequin-grip-v3-hardening-20261110. **PR:** #20 (draft, não mesclada).

## Resumo técnico
Foi implementada uma versão **experimental/geométrica** do AutoGrip, orientada a coordenadas 3D do braço, pose de punho, cinco dedos e colisores de caixas/cilindros. O objetivo é recalcular uma pegada viável antes de criar ou substituir um vínculo Grip V3, mantendo o objeto onde está por padrão e evitando posições flagrantemente atravessadas. O sistema **não é ainda um solucionador completo de forças nem de movimento contínuo livre de obstáculos**. As 300 tarefas e 30 gates do master task graph não foram aprovados.

## Componentes de código adicionados ou modificados

| Componente | Conteúdo implementado |
|---|---|
| src/scene/grip-auto.js | \`medirMao\`, \`validarOpcoes\`, \`planejarAutoGrip\`, \`resumirAutoGrip\`, \`validarContatoAutoGrip\`, \`validarCenaAutoGrip\`; FK dos cinco dedos, dimensões derivadas de \`armDims\`, candidatos por GripSites, amostras de superfícies vizinhas, múltiplos estilos de pegada, IK de braço e punho, ajuste numérico por dedo e checagem de contato |
| src/scene/comandos.js | \`cena.planejarEncaixe\`, \`aplicarEncaixe\`, \`autoEncaixarObjeto\`, \`reajustarEncaixe\`, \`inspecionarAutoGrip\`; \`m.autoSegurar\`, \`m.medidasMao\`, \`m.inspecionarAutoGrip\`; \`obj.autoEncaixarPor\`, \`obj.reajustarEncaixe\`, \`obj.inspecionarAutoGrip\` |
| src/scene/estado.js | Preservação de \`gripV3.autoGrip\` ao salvar e restaurar JSON, incluindo referência de pose e qualidade |
| src/scene/index.js e ordem.json | Registro do AutoGrip em navegador e headless MCP |
| src/ui/colisoes.js e index.html | Botões **Prévia do encaixe**, **Autoencaixar e segurar** e **Verificar pegada atual**; configurações de mão/pegada e identificação de dono atual |
| mcp/lib/tools-control.mjs | \`preensao\` com ações **planejar, aplicar, auto_encaixar, reencaixar, verificar**; revisão para impedir aplicação de preview obsoleta; cálculo único em confirmar |
| mcp/lib/tools-storyboard.mjs | Operação tipada \`auto_encaixar\` em \`roteiro_declarativo\` e \`operacoes_lote\`, sem JavaScript remoto |
| mcp/widget/geomannequin.html | Seleção de estilo, mão automática/duas mãos, botão **Autoencaixar** e **Verificar contato**, retorno da qualidade |
| testes/grip-auto.mjs, mcp/test/control.mjs, mcp/test/run.mjs | Testes declarados para antropometria, prévia pura, cadeiras já seguras, rollback, contato, vínculo JSON, revisão MCP e widget |

### Fluxos implementados

1. **Objeto livre:** usuário escolhe manequim e objeto, planeja ou aperta Autoencaixar; o motor analisa os locais e gera candidatos; o melhor candidato geométrico passa pelo IK dos braços, pelos cinco dedos, por contatos e verificações de colisão; somente então cria Grip V3.
2. **Objeto já preso (Grip V2/V3):** a inspeção indica se o vínculo anterior tem certificado anatômico; ao reencaixar o motor sincroniza e preserva a pose atual, remove temporariamente o vínculo antigo e tenta uma nova pegada. Qualquer falha reverte tudo.
3. **Duas mãos:** busca pares de pontos distintos com espaçamento suficiente; combina os parâmetros de ambos os lados, vincula a segunda mão e revalida contatos e colisões da cena.
   - Refinamento posterior: os pontos escolhidos fora do centro de um GripSite são salvos no espaço local da cadeira; a segunda mão preserva referência local durante transporte e transferência, inclusive após JSON.
4. **Prévia sem commit:** entrega candidato, contato por dedo, score, desvio da palma, penetração, alterações de parâmetros, alternativas e revisão; aplicar exige revisão coerente com cena.
5. **Após movimentar o braço:** \`inspecionarAutoGrip\` permite verificar novamente o vínculo e solicitar \`reajustarEncaixe\` quando necessário.
6. **Microajuste autorizado:** a opção `permitirMoverObjeto:true` junto com `preservarObjeto:false` permite testar cópias deslocadas em X/Z. Prévia e falha não alteram a peça; o commit aplica com rollback. Sem força ou CCD.

### Exemplos de API (código implementado na branch)

\`\`\`js
// Para objeto solto OU já segurado por este manequim:
const r = cena.autoEncaixarObjeto("Cadeira 1", {
  manequim: "Manequim 1",
  mao: "auto",
  pegada: "auto",
  preservarObjeto: true,
  reach: 12
});

// Somente prévia, sem soltar o objeto ou mudar a mão:
const preview = cena.planejarEncaixe("Cadeira 1", {mao: "direita"});
if (preview.status === "planejado") cena.aplicarEncaixe(preview);

// Depois de mover o braço:
const check = cena.inspecionarAutoGrip("Cadeira 1");
if (check.necessitaAjuste) cena.reajustarEncaixe("Cadeira 1");
\`\`\`

MCP, ferramenta \`preensao\` (campos de chamada, não comando JavaScript):

\`\`\`json
{"acao":"auto_encaixar","objeto":"Cadeira 1","mao":"auto","pegada":"auto","preservarObjeto":true}
\`\`\`

\`\`\`json
{"acao":"verificar","objeto":"Cadeira 1"}
\`\`\`

\`\`\`json
{"acao":"reencaixar","objeto":"Cadeira 1","mao":"auto","pegada":"gancho"}
\`\`\`

## Etapa adicional: pinça e caminho de aproximação (11/11/2026)

- A checagem **pós-vínculo** agora guarda o melhor contato por dedo e usa a normal das superfícies para confirmar que polegar e indicador permanecem em oposição geométrica nas pegadas `pinca`, `tripode` e `lateral`. O inspetor de pegada também exige essa condição.
- O microajuste X/Z deixou de consultar apenas o destino. A função pura `verificarMicroDeslocamentoAutoGrip` testa passos intermediários contra móveis, outros manequins e o corpo protegido do proprietário. Retorna tipo de obstáculo, nome e primeiro passo bloqueado. Esse teste é discreto; pode não perceber um contato ocorrido exclusivamente entre amostras.
- A função `validarAproximacaoAutoGrip` interpola uma pose articular inicial e final em 3 a 8 amostras, verifica interpenetração e pode reprovar candidatos. `verificarTrajetoria:true` é **opt-in** (padrão desligado). Não há animação nem caminho articulado com CCD exato.
- Interfaces atualizadas: editor `cena.autoEncaixarObjeto(...,{verificarTrajetoria:true,passosTrajetoria:5})`; ferramenta MCP `preensao` em `planejar/auto_encaixar`; storyboard declarativo; checkboxes do painel e widget.
- **Verificação feita apenas em testes isolados:** injeção simulada de obstáculo intermediário X/Z detectou bloqueio no passo 2/4 e liberou a direção contrária; trajetória articular simulada detectou bloqueio no passo 3/6 e liberou uma pose sem colisão. Testes com o motor real foram escritos em `testes/grip-auto.mjs` e `mcp/test/control.mjs`, mas **não executados** no CI.

## Endurecimento adicional: importação, leitura pura e escala anatômica (11/11/2026)

- **Exportações ESM:** corrigida a lista pública de `grip-auto.js`, que não exportava duas funções já existentes (`verificarMicroDeslocamentoAutoGrip` e `validarAproximacaoAutoGrip`). O teste novo `testes/autogrip-exports.mjs` importa realmente o módulo, o barrel e o MCP headless, confirma dez funções públicas, APIs da cena e operações somente leitura.
- **Pureza da prévia:** `cena.planejarEncaixe`, `cena.inspecionarAutoGrip` e a verificação de revisão em `cena.aplicarEncaixe` não invocam mais `atualizarApoios()` durante consultas, para não movimentar objetos ou mãos sem autorização.
- **Mão e falanges por biotipo:** os cálculos de largura, espessura, raios de dedos e encaixe agora usam a escala das próprias malhas `buildPalm/buildFingers` (incluindo `armLen`). `Contact V2` passou a usar essa escala para os colisores finos, com raios diferenciados por dedo. O teste de regressão verifica crescimento de dimensões e colisores entre dois comprimentos de braço.
- **Orientação palmar:** corrigido o sinal da direção de fechamento (`-side*X` na FK real de `dirsDedo`) para não buscar contato pelo lado oposto. Teste de regressão de esquerda/direita adicionado.
- **Desempenho:** `pointContacts` agora aceita um índice de dedo; o refinamento de uma falange não precisa recalcular o contato dos cinco dedos em cada iteração.

Essas mudanças foram salvas no código-fonte, mas ainda **não tiveram execução integrada aprovada**. Testes reais foram adicionados e registrados no workflow, mas não se deve marcar gates concluídos com base apenas em parsing ou testes com stubs.

## Validações feitas e o que NÃO foi comprovado

- **APROVADO apenas em checagens isoladas:** parsing sintático por V8 de módulos alterados; execução do planejador em V8 com dependências simuladas para gesto gancho, seleção bilateral em sítios distintos, não mutação do modelo original, checagem simulada de colisão e rejeição de opções inválidas; parsing do JS do widget. Também foram executados testes isolados do round-trip de GripSites com rotação e do microajuste X/Z opt-in, usando colisores simulados; não substituem testes reais.
- **TESTES REAIS ADICIONADOS, NÃO CONFIRMADOS:** \`npm run testar:autogrip\`, \`npm test\` e \`npm run test:dist\`. O CI GitHub não forneceu logs de etapas executadas nos jobs investigados. Foi corrigido um nome de etapa YAML com dois-pontos sem aspas; o job passou a ter nome válido, mas ainda terminou em falha sem steps no momento da verificação.
- **MCP DISTRIBUÍDO AINDA ANTIGO:** \`mcp/dist\` não foi reconstruído e verificado neste ambiente. Não considerar as ações novas disponíveis no servidor publicado.
- **SEM ATLAS VISUAL REAL:** não foi executada validação integrada renderizando cadeiras/canecas/corpos em todos os ângulos.
- **SEM GARANTIA DE ÊXITO GERAL:** uma combinação de objeto e manequim pode não oferecer pegada viável; nesse caso o motor deve relatar inviabilidade ou reverter o vínculo.

## Escopo técnico que continua pendente — NÃO CONCLUÍDO

- IK global exato e simultâneo de dois braços, punhos e 10 dedos, incluindo jacobianos robustos, limites acoplados e escape de mínimos locais.
- Captura e contato a partir da malha visual exata em qualquer objeto arbitrário: os sólidos atuais são aproximações de caixas/cilindros, com suporte a sítios e amostras simples.
- Planejamento contínuo de aproximação com CCD/swept collision ao longo de todos os frames (atualmente valida principalmente pose final).
- Simulação dinâmica de força, peso, pressão, atrito, estabilidade, tecido e deformação da mão.
- **Microajuste do objeto:** existe microajuste horizontal opt-in de até 0,6 R (padrão 0,24 R), com checagem de colisão entre objetos. Continua pendente o ajuste **6DOF completo**, incluindo rotação, altura, inclinação, contato com piso e trajetória livre de obstáculos. O padrão não move a cadeira.
- Compatibilidade total de \`mcp/dist\`/servidor publicado e execução dos gates do master task graph.
- Testes de estresse e desempenho em navegador/hardware real, além de instrumentação de convergência e atlas visual.
- Verificação da continuidade de duas mãos após mudanças rápidas de pose: o Grip V3 usa IK secundária aproximada.

## Instruções locais para verificar e reconstruir

\`\`\`sh
cd geomannequin
npm ci
npm run testar:autogrip
npm run testar:grip-v3
npm run testar:contato-v2
npm run testar:headless-modulos
npm run construir
npm ci --prefix mcp
cd mcp
npm test
npm run build
npm run verify:dist
npm run test:dist
\`\`\`

Antes de mesclar a PR, exigir todos os testes reais acima, inspeção do widget e revisão das falhas em amostras de mão/objeto. Até lá, manter o novo recurso **experimental** e **não liberado em produção**.

## Correções da continuação — contato SDF, rollback e prevenção de loops (11/11/2026)

- **Falha real corrigida no refinamento de dedos:** a função `pointContacts` consultava `A.LH` sem instanciar `A` em seu escopo. Isso lançava `ReferenceError` durante a avaliação dos contatos. A função agora obtém `A=armDims(p)` localmente, mantendo a mesma origem anatômica de palma e punho.
- **Falhas internas distintas de inviabilidade:** um `ReferenceError` durante a busca de candidatos deixa de ser absorvido como simples pegada geometricamente inviável. A API propaga esse erro de programação para diagnóstico.
- **Microdeslocamento protegido contra entrada patológica:** o verificador público exige passo finito entre 0,01 e 0,5 R, tolerância entre 0 e 0,14 R, solo/posições finitos e percurso horizontal total de no máximo 1 R. Isso evita um loop infinito quando `passo=0` e uma quantidade impraticável de amostras quando o passo é ínfimo.
- **Atomicidade da confirmação:** em `cena.autoEncaixarObjeto`, `atualizarApoios()` foi movida para dentro do `try`, após o snapshot do estado e a validação das opções. Se o planejamento ou vínculo falhar, o rollback deve restaurar inclusive a posição anterior de objetos segurados que ainda não haviam sido sincronizados.
- **Regressões adicionadas:** `testes/grip-auto.mjs` agora requer evidência de execução da geometria real no planejador (rejeição com score ou candidato viável), impede mascarar `ReferenceError`, verifica rejeição de passos/tolerâncias/caminhos inválidos e testa não mutação antes da confirmação e rollback após erro num GripSite inexistente.

**Checagem executada nesta continuação:** parsing V8 das versões atuais de `src/scene/grip-auto.js`, `src/scene/comandos.js` e `testes/grip-auto.mjs`: **PASS** (com declarações `import/export` removidas somente para a análise sintática). **Não equivale a rodar os imports, o motor geométrico ou a suíte integrada.**

**CI ainda bloqueado:** no novo commit as 10 verificações do GeoMannequin falharam novamente antes de expor steps. O job Grip V3 não retornou etapas, e a tentativa de buscar os logs terminou em erro de objeto de log inexistente (`BlobNotFound`). A causa raiz das falhas de inicialização não pôde ser confirmada por esse diagnóstico. **Nenhum gate integrado foi aprovado; não reconstruir/declarar atualizada a distribuição MCP nem mesclar sem validação real.**
