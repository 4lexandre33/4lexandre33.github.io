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
4. **Prévia sem commit:** entrega candidato, contato por dedo, score, desvio da palma, penetração, alterações de parâmetros, alternativas e revisão; aplicar exige revisão coerente com cena.
5. **Após movimentar o braço:** \`inspecionarAutoGrip\` permite verificar novamente o vínculo e solicitar \`reajustarEncaixe\` quando necessário.

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

## Validações feitas e o que NÃO foi comprovado

- **APROVADO apenas em checagens isoladas:** parsing sintático por V8 de módulos alterados; execução do planejador em V8 com dependências simuladas para gesto gancho, seleção bilateral em sítios distintos, não mutação do modelo original, checagem simulada de colisão e rejeição de opções inválidas; parsing do JS do widget.
- **TESTES REAIS ADICIONADOS, NÃO CONFIRMADOS:** \`npm run testar:autogrip\`, \`npm test\` e \`npm run test:dist\`. O CI GitHub não forneceu logs de etapas executadas nos jobs investigados. Foi corrigido um nome de etapa YAML com dois-pontos sem aspas; o job passou a ter nome válido, mas ainda terminou em falha sem steps no momento da verificação.
- **MCP DISTRIBUÍDO AINDA ANTIGO:** \`mcp/dist\` não foi reconstruído e verificado neste ambiente. Não considerar as ações novas disponíveis no servidor publicado.
- **SEM ATLAS VISUAL REAL:** não foi executada validação integrada renderizando cadeiras/canecas/corpos em todos os ângulos.
- **SEM GARANTIA DE ÊXITO GERAL:** uma combinação de objeto e manequim pode não oferecer pegada viável; nesse caso o motor deve relatar inviabilidade ou reverter o vínculo.

## Escopo técnico que continua pendente — NÃO CONCLUÍDO

- IK global exato e simultâneo de dois braços, punhos e 10 dedos, incluindo jacobianos robustos, limites acoplados e escape de mínimos locais.
- Captura e contato a partir da malha visual exata em qualquer objeto arbitrário: os sólidos atuais são aproximações de caixas/cilindros, com suporte a sítios e amostras simples.
- Planejamento contínuo de aproximação com CCD/swept collision ao longo de todos os frames (atualmente valida principalmente pose final).
- Simulação dinâmica de força, peso, pressão, atrito, estabilidade, tecido e deformação da mão.
- **Movimento automático do objeto:** a API recusa \`permitirMoverObjeto:true\` ou \`preservarObjeto:false\` até existir verificação robusta do deslocamento, piso e móveis. O padrão mantém a cadeira no lugar.
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
