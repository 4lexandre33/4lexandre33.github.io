# GeoMannequin — Relatório de implementação dos planos laterais Loomis
**Data:** 10/11/2026  
**Branch:** `feat/loomis-real-bilateral-cranial-planes-20261110`  
**Escopo:** task graph [LP-00 a LP-28](task-graph-cabeca-v2-planos-laterais-loomis.md).  
**Estado:** geometria implementada e testada por execução direta V8, mas **revisão estética integral, suíte Node e publicação final ainda não aprovadas**.

## 1. O que mudou de verdade

Antes, `head/cranial-surface.js` aplicava apenas um ajuste leve em `z` nas laterais, enquanto `engine/desenho.js` desenhava círculos simulados sobre a cabeça. Agora:

- `head/side-planes.js`: duas regiões planares simétricas `x=±d`, de contorno circular em `(y,z)`, com `radius`, `centerY`, `centerZ`, `distance`, `fillet`, cálculo seguro de distância e cache por formato.
- `head/mesh-clipping.js`: remapeamento geométrico contínuo da superfície craniana. O interior de cada disco é realmente plano na **malha V2**, e o anel externo é interpolado com `smootherstep` (C1).
- `head/mesh-stitch.js`: inspeção de fronteiras e residual da borda.
- `head/cranial-surface.js`: incorpora o recorte **antes** da deformação mandibular; não há uma segunda tampa que atravesse a superfície.
- `head/profile.js`: frontal menos arredondado; terminação posterior mais gradual em direção à cervical.
- `head/ears.js`, `landmarks.js`, `jaw-rig.js`: orelha e pivô da ATM referenciados na vizinhança anteroinferior do plano temporal.
- `engine/desenho.js`: o modo construção usa o círculo derivado da borda **da própria geometria**, em vez da marcação lateral decorativa da V1.
- `engine/padroes.js`, `scene/parametros.js`, `engine/montagem.js`, `head/biotypes.js`: parâmetros editáveis, defaults e invalidação do cache.
- `testes/cabeca-v2-planos.mjs`: testes de discos bilaterais, 3 LOD, 10 biotipos, olhos/orelhas indiretamente e 50 aberturas.
- `testes/atlas-planos-loomis.mjs`: atlas visual 3×3 do motor, sem IA generativa.
- CI de PR e comandos de teste registrados no `package.json`.

**A V1 permanece inalterada como modo-padrão.** A Cabeça V2 precisa ser selecionada explicitamente.

### Detalhe importante da técnica

A especificação recomendava recortar triângulos e reconstruir com uma tampa triangular independente. O motor atual opera com malhas em **grade regular UV**, inclusive em rasterização, sombreado e contornos. Para preservar compatibilidade, a implementação utiliza **remapeamento contínuo da mesma superfície**: a carta lateral do crânio é convertida em um disco geométrico plano, mantendo os mesmos índices dos triângulos, sem tampas sobrepostas ou nova borda aberta. É uma técnica de **recorte implícito de superfície** que resulta em área plana real, não em desenho no SVG. Isso não é um pipeline geral de booleanos/CSG e deve ser identificado como tal.

## 2. Verificações executadas e seus limites

| Verificação | Resultado | O que realmente prova |
| --- | --- | --- |
| Crânio nos 10 biotipos | **10/10** testes amostrais V8 passaram | Aplicação bilateral das regras geométricas |
| Amostras no interior dos discos | **13.582** posições, desvio `x=±d` de 0 | Planaridade matemática nas posições testadas |
| Malhas com LOD 0, 1 e 2 | **30/30** construções passaram | Geometria gerada nas três resoluções |
| Vértices planares identificados nas malhas | **41.084** verificações | Área plana integrada à malha real, não só linhas |
| Triângulos degenerados nas 30 malhas | **0** | Sem colapso de faces na amostra analisada |
| Abertura mandibular | **50** estados geométricos testados | Parâmetros dos dois planos não se movem com a mandíbula |
| Renderização real V1/V2 | **3** amostras finais de boca aberta, válidas | Motor renderiza V1 e V2 sem NaN/Infinity/undefined |
| Folhas artísticas | **18** vistas reais: 2 folhas × 9 | SVGs gerados, **não** aprovação estética |
| Workflow GitHub Actions | **Falhou sem etapas/logs disponíveis** | Não há execução Node confirmada |
| Matriz geral da V2 | **Não executada integralmente** (1350 prevista) | Ainda precisa de validação |
| Performance em navegador | Não medida | Não há orçamento validado de FPS/memória |
| Revisão humana contra referência Loomis | **Pendente** | A meta estética **não** pode ser afirmada como atingida |

**Nota:** os testes matemáticos foram executados diretamente sobre funções extraídas do código real do repositório em um ambiente V8. Os renders SVG foram gerados pelo motor real, com dependências carregadas por um harness de auditoria. Isso não equivale a executar `npm run testar` em Node ou abrir a aplicação em um navegador gráfico.

## 3. Referências geométricas / visuais geradas

- [Masculino médio — 9 vistas da construção Loomis](../testes/visuais-loomis/masculino-medio-3x3.svg)
- [Feminino médio — 9 vistas da construção Loomis](../testes/visuais-loomis/feminino-medio-3x3.svg)

Cada folha inclui frente, perfil esquerdo, 3/4 esquerdo, costas, perfil direito, 3/4 direito, ângulo superior, inferior e boca aberta. As duas folhas foram atualizadas após a correção do pivô mandibular.

## 4. Status real do task graph

| IDs | Estado | Notas |
| --- | --- | --- |
| LP-00 a LP-02 | Implementado / parcial | Referências descritas; imagens originais não versionadas como arquivos |
| LP-03 | Implementado, estética pendente | Perfil frontal e nuca atualizados |
| LP-04 a LP-08 | Implementado por remapeamento implícito | Discos reais planos na própria grade UV; não é booleano com nova malha |
| LP-09 | Parcial | Geometria sem degeneração; revisão visual de normais e borda ainda necessária |
| LP-10 | Implementado, Node pendente | Testes de planaridade/simetria e LOD preparados e parcialmente executados em V8 |
| LP-11 e LP-12 | Implementado / parcial | Orelhas ancoradas, região temporal da face ainda pode exigir refinamento |
| LP-13 e LP-14 | Implementado, revisão estética pendente | Testa e occipital recalibrados |
| LP-15 | Parcial | Nuca suavizada no perfil; conexão cervical do torso ainda depende da V1 |
| LP-16 | Implementado com modelo simplificado | ATM segue plano temporal mas não é articulação óssea médica |
| LP-17 | Parcial | Órbitas V2 preservadas; não houve remodelagem completa nesta rodada |
| LP-18 | Implementado no requisito dos planos | 50 estados mantiveram discos rígidos |
| LP-19 | Implementado no limite atual | Círculo e iso-linhas seguem a geometria; não são linhas de curvatura principal |
| LP-20 e LP-21 | Implementado | LOD e os 10 biotipos |
| LP-22 | Parcial | Integração nos módulos comuns; testes Node e fluxo UI/MCP completo pendentes |
| LP-23 | Implementado amostralmente | 18 vistas do motor geradas |
| LP-24 | Parcial | 18 de 1.350 cenas visuais; gerador de matriz existente |
| LP-25 | **Pendente** | Aprovação estética da referência enviada |
| LP-26 | Parcial | Render amostral executado; performance e exportações completas pendentes |
| LP-27 | Parcial | Testes V8 passam; CI Node terminou sem steps |
| LP-28 | **Pendente** até integração e verificação Pages | Não afirmar publicação antes do deploy efetivo |

## 5. Como reproduzir localmente

```bash
cd geomannequin
npm ci
npm ci --prefix mcp
npm run testar:planos-loomis
npm run testar:cabeca-v2
npm run atlas:planos-loomis -- masculino medio
npm run atlas:planos-loomis -- feminino medio
npm run matriz:cabeca-v2:rapida
# Matriz longa (1350): apenas em runner adequado e após checar a rápida
npm run matriz:cabeca-v2
npm run testar
npm run construir
npm run build --prefix mcp
```

**Próximas ações obrigatórias para aprovação final:** revisar os 18 SVGs, executar a suíte Node em runner funcional, comparar a nuca/testa/orelhas em close e nas dez variações, analisar os 1.350 cenários, validar exportação/versão standalone, conferir publicação no Pages.

**Regra final:** mesmo que a geometria dos discos seja matematicamente correta, a cabeça **não** está esteticamente concluída até aprovação humana da silhueta Loomis.
