# Cabeça V2 — registro real de implementação (10/11/2026)

**Resultado:** protótipo V2 opcional, ligado ao aplicativo e ao motor do MCP, sem substituir a V1. **Não significa que o realismo artístico da referência foi atingido.**

## Evidências verificadas

- Código V2 escrito em `src/engine/head/`, com superfície craniana por seções,
  perfil sagital, RBF faciais, campos para órbitas/zigoma/nariz, mandíbula articulada
  com influência apenas facial anterior, bocas, arcadas, língua, orelhas e pescoço paramétrico.
- Integração em `cabeca.js`, `montagem.js`, `desenho.js`, `engine/index.js`,
  `scene/comandos.js`, `scene/estado.js`, `ui/controles.js`.
- Modo ativado por `m.cabeca("v2")` ou seletor experimental. `headDetail`
  estabelece LOD sem mudar a câmera. V1 permanece padrão.
- Execução V8 com **53 módulos reais** carregados e quatro cenários de renderização
  do motor, incluindo boca aberta em masculino e feminino e perfil, sem
  NaN/Infinity/undefined.
- Auditoria de **10 biotipos e 50 estados mandibulares**, 0 vértices não finitos
  e 0 triângulos degenerados nas amostras com LOD 0 (6.120 vértices por cabeça).
- Comparação no ambiente V8: mesma cena V1 ~6,8 s, V2 com LOD 0 ~6,2 s;
  não é benchmark universal e não substitui profiling no navegador.
- Dois arquivos SVG foram efetivamente gerados pelo motor com
  **três vistas cada**: `testes/visuais-cabeca-v2/masculino-medio-3-vistas.svg`
  e `feminino-medio-3-vistas.svg`. Não houve aprovação estética.
- Testes Node, exportações de quadros e matriz de 1.350 cenas
  **foram escritos, mas ainda não executados integralmente**.

## Estado dos 27 itens do task graph

| ID | Estado | Evidência / limitação |
| --- | --- | --- |
| H2-00 | Parcial | Baselines SVG antigos disponíveis; anexos de referência não versionados como imagem |
| H2-01 | Feito | `head/index.js` e API modular; fachada preservada |
| H2-02 | Implementado | Landmarks 3D canônicos; aguardam calibração com a referência |
| H2-03 | Implementado | `profile.js` sagital, necessita refinamento estético |
| H2-04 | Implementado | `sections.js` semiesferas elípticas deformadas |
| H2-05 | Parcial | `cranial-surface.js`; sem análise manifold e certificação C² |
| H2-06 | Parcial | `face-fields.js`; máscara não é malha independente estanque |
| H2-07 | Parcial | `orbit.js`; globos 3D, pálpebras ainda dependem de traços antigos |
| H2-08 | Parcial | `nose.js`, campos nasais e zigomáticos |
| H2-09 | Parcial | `jaw-rig.js`, ATM paramétrica; sem mandíbula óssea volumétrica fechada |
| H2-10 | Parcial | `mouth-cavity.js`, casca oral + lábios; requer revisão da boca profunda |
| H2-11 | Parcial | `dentition.js`, dentes ellipsoidais volumétricos esquemáticos |
| H2-12 | Parcial | `tongue.js`; volume simplificado sem palato anatômico completo |
| H2-13 | Parcial | `ears.js`, reanexação e relevo; hélice detalhada pendente |
| H2-14 | Parcial | `neck.js` disponível; torso cervical v1 permanece no render final |
| H2-15 | Parcial | `expressions.js` e malha com deformação; sem solver completo de músculos |
| H2-16 | Parcial | `iso-curves.js`: isolinhas UV sobre a malha; linhas de curvatura principal pendentes |
| H2-17 | Implementado | Adaptação por `scene/biotipos.js`; 10 perfis avaliados numericamente |
| H2-18 | Feito | Compatibilidade V1/V2 em `cabeca.js` |
| H2-19 | Feito | Seletor/UI/JSON/cache e três resoluções de malha |
| H2-20 | Parcial | API `m.cabeca`, preservação por estado/quadros; teste Node planejado |
| H2-21 | Implementado | Render de malhas e traçados de topografia pelo motor |
| H2-22 | Parcial | V8 válido; novos testes Node ainda não executados em runner |
| H2-23 | Parcial | Matriz de 1.350 cenas criada, execução completa pendente |
| H2-24 | Pendente | Revisão estética contra folha matemática 3×3 |
| H2-25 | Implementado | Feature flag V2, com rollback à V1 |
| H2-26 | Pendente | Build standalone, teste completo Node, MCP e verificação visual GitHub Pages |

## Riscos restantes

1. As superfícies de mandíbula e cabeça ainda compartilham a malha externa;
   não foram feitas maxila, ATM, mandíbula e articulações completas como malhas
   individuais com topologia de escultura.
2. O volume extra da boca é aproximado, não odontológico; resultado visível
   precisa ser aprovado em vistas abertas, fechadas e de perfil.
3. Iso-linhas são paramétricas, não trajetórias de curvatura principal da superfície.
4. `neck.js` é uma malha diagnóstica; a seção final do pescoço utiliza o motor do torso.
5. O GitHub Pages carrega módulos diretamente. O arquivo único `dist/` precisa
   de rebuild e testes após aprovação.

## Próxima ordem inegociável

1. Revisar SVGs reais de frente, perfil e 3/4 versus a referência.
2. Ajustar o perfil sagital e o empilhamento crânio/máscara/mandíbula.
3. Substituir a cavidade oral simplificada e as pálpebras por superfícies distintas.
4. Integrar cervical V2 sem romper o tronco; validar 10 biotipos.
5. Executar `npm run testar:cabeca-v2`, matriz rápida (60) e longa (1350).
6. Regravar snapshots **somente com aprovação visual** e reconstruir `dist/`.
