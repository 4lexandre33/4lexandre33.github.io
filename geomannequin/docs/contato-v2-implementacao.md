# GeoMannequin — Contact V2 (implementação experimental)

**Origem:** [Task graph de 177 tarefas](./task-graph-colisoes-interacoes-v2.md).  
**Versão:** V2 experimental, 10/11/2026.  
**Status:** implementada em branch de desenvolvimento; **não confundir com a conclusão das 177 tarefas**.  

## O que funciona no código desta etapa

- Diagnóstico físico separado de `permitirContato()`: liberar visualmente um abraço no motor antigo não desliga a verificação sólida detalhada.
- Malha de proximidade com colisores anatômicos por cápsulas, mais **30 cápsulas de falanges** (5 dedos, 3 segmentos, ambas as mãos) e duas palmas.
- Distância assinada, normal, pontos testemunha e penetração por contato entre cápsulas.
- Teste de cápsulas contra **caixa orientada (OBB)** e **cilindro** em mundo 3D, com SDF e minimização ao longo do segmento.
- Broadphase AABB por colisor e por corpo; filtro de peças adjacentes na autocolisão.
- Autocolisão **com inspeção e bloqueio de novos atravessamentos** via varredura amostrada/limitação da pose, em modo experimental ativado.
- Bloqueio progressivo de movimentos na edição de mãos, pés, ossos, posicionamento e sliders. Quando não há solução, usa pose válida anterior e limita o avanço.
- `cena.contatoV2()`, `cena.contatosFisicos()`, `m.contatosDetalhados()`, `m.tocar()`.
- Preensão inicial **cinemática**: `m.segurar()`, `m.soltar()`, `cena.segurarObjeto()`, `cena.soltarObjeto()`; objeto segue a âncora palmar, faz fechamento incremental dos 5 dedos até o primeiro toque detectável e mantém relação na gravação JSON.
- UI: checkbox **Colisão anatômica detalhada V2**, botão para inspecionar contatos e comandos de segurar/soltar objeto selecionado. Modo desligado por padrão.
- Testes de laboratório e CI adicionados. **A execução integral em GitHub Actions ainda não foi aprovada.**

## Como usar — editor

1. Abra a aplicação e encontre **Colisões**.
2. Marque **Colisão anatômica detalhada V2 (experimental)**.
3. Escolha **Bloquear ao arrastar** ou **Corrigir ao soltar**.
4. Arraste membro/manequim em direção a outro sólido. O movimento deverá parar antes de *introduzir* novas interpenetrações além do baseline do modelo.
5. Clique **Inspecionar contatos 3D detalhados** para ver número de pontos e maior profundidade de proxy.

Para segurar, selecione um objeto, aproxime uma mão e clique em **Segurar objeto selecionado**. A interface mostra quantos dedos encostaram efetivamente; se o número for zero, o vínculo ainda é apenas cinemático, **não é uma preensão física validada**. Ao soltar, sem física dinâmica, o objeto volta ao apoio no chão.

## API

```js
cena.contatoV2({enabled:true,level:"fine",tol:.07});
cena.colisao("bloquear");

// Dois manequins e objetos podem estar presentes.
const contatos = cena.contatosFisicos({auto:true,max:100});
// {tipo, pa, pb, distancia, prof, n, a, b, ponto, alvo, ...}

// "Tocar" move a mão em direção à superfície do colisor, com IK e bloqueio.
const a = cena.ativo;
const toque = a.tocar("Manequim 2",{mao:"direita",parte:"torax"});

// O copo deve estar próximo da mão para criar o vínculo.
const preso = cena.segurarObjeto("Copo 1",{mao:"direita",reach:2.5});
// preso.dedos: array de cinco entradas com {dedo,contato,distancia}.
cena.soltarObjeto("Copo 1");

// Pode desativar e voltar ao comportamento legado.
cena.contatoV2(false);
```

## Limites técnicos atuais — não ocultar

1. O volume real do corpo ainda é aproximado por **cápsulas**. Embora existam falanges finas e OBB/cilindro para objetos, NÃO existe teste contínuo triângulo×triângulo para toda a malha anatômica. Não afirmar que nunca há interpenetração visual.
2. O bloqueio de movimento usa **amostragem de trajetória + busca binária**, não CCD analítica plena; movimentos extremos entre passos ainda podem passar por obstáculos finos.
3. Contatos preexistentes no baseline são tolerados sem piora. Uma pose inicialmente inválida não é sempre corrigida automaticamente.
4. Colisão do chão ainda é tratada por subsistemas legados, não por um único conjunto de restrições.
5. A preensão é **cinemática**, sem cálculo de forças/torque de agarre, equilíbrio de contato, atrito ou massa. Um objeto grande/longe pode acabar vinculado apesar de poucos/nenhum dedo tocar; a interface relata isso.
6. Abraços, empurrões, agarramentos múltiplos e dinâmica realista continuam **pendentes** da fase SOL/SOC/DYN do task graph.
7. Modo detalhado desativado por padrão para preservar desempenho, poses históricas e compatibilidade.
8. O gate completo de render e CI é exigido para aprovação. Sem screenshot e teste headless da cena completa, considerar o recurso **experimental**.

## Arquivos envolvidos

```
src/engine/contact-v2.js        # cápsulas/falanges, broadphase e contatos geométricos
src/scene/contato-v2.js         # consultas, política, bloqueio transacional
src/scene/preensao-v2.js        # vínculo de palma + fechamento dos dedos
src/scene/toque-v2.js           # contato superficial por alvo e IK
src/scene/modelo.js             # sincronização de objetos segurados
src/scene/estado.js             # JSON com grips e configurações do motor
src/scene/comandos.js           # APIs em português
src/ui/colisoes.js              # controles no painel
src/ui/arrastar.js              # bloqueio em arraste
src/ui/controles.js             # bloqueio em sliders
testes/contato-v2.mjs           # regressões de geometria e cenas
.github/workflows/geomannequin-contact-v2.yml
```

## Evidências de implementação por tarefa (não aprovação final)

- **GEO-01, GEO-08, GEO-09**: proxies grossos preservados; palma e 30 falanges.
- **BRO-01, BRO-02, BRO-08**: AABB de colisores/corpos e contatos ordenados.
- **NAR-01, NAR-02, NAR-07, NAR-09**: cápsula-cápsula, OBB/cilindro e penetração com normal e pontos.
- **SEL-01, SEL-02, SEL-03**: autocolisão opcional, pares adjacentes e mão×tronco.
- **SOL-10, SOL-11**: rollback/limitação parcial com status.
- **GRP-01, GRP-04, GRP-06, GRP-10**: local de contato, fechamento geométrico, vínculo e soltura iniciais (sem forças).
- **UIX-01, UIX-07**: controle de modo e mensagens.
- **API-01, API-02, API-03, API-04, API-05, API-07, API-08**: interface inicial de comandos e JSON.
- **TST-01, TST-02, TST-05, TST-06, TST-07, TST-13**: cenários de teste escritos; execução completa e evidência visual pendentes.
- **REL-07**: workflow CI cadastrado; conclusão verde ainda pendente.

A ordem de trabalho restante segue o task graph. O próximo marco de qualidade deve ser um atlas renderizado e aprovado de mão×torso, mão×rosto, aperto de mão, dois braços cruzados e objeto na palma com cinco dedos.
