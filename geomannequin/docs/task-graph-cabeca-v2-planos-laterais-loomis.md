# GeoMannequin — Task Graph completo: planos laterais circulares de Loomis

**Data da especificação:** 10/11/2026  
**Projeto:** GeoMannequin — Cabeça V2  
**Prioridade:** **P0, requisito anatômico/visual obrigatório**  
**Estado deste documento:** especificação original com execução parcial em uma branch experimental. Consulte o **[relatório real da implementação](relatorio-execucao-planos-loomis.md)** para estados tarefa a tarefa, testes realizados e bloqueios de aprovação. A documentação, isoladamente, não comprova sucesso.  
**Referências visuais:** imagens de construção de cabeça estilo Loomis/GeoGebra enviadas na conversa; a imagem anexada não é uma malha 3D mensurável e ainda não está versionada como arquivo independente no repositório.

## 1. Objetivo visual obrigatório

A caixa craniana deve apresentar **dois cortes laterais circulares, bilaterais, simétricos e realmente planos**, como uma esfera/elipsoide craniano que teve as regiões temporoparietais removidas por dois planos verticais.

**O que deve existir em 3D:**

- um volume de abóbada craniana principal, não uma esfera homogênea;
- **plano lateral esquerdo** e **plano lateral direito**, com **área interna plana** no espaço tridimensional;
- **contorno aproximadamente circular e preferencialmente circular exato** em projeção lateral ortográfica no modelo de construção;
- **borda geométrica real** separando o disco lateral da superfície craniana convexa, com pequeno chanfro/fillet controlado;
- orelhas implantadas em relação ao plano, com conexão plausível ao temporal/mastoide;
- testa, arco supraorbital, maçã do rosto, mandíbula, occipital e nuca preservados;
- estabilidade dos discos durante **boca aberta, sorriso, piscar e rotação da cabeça**;
- compatibilidade com os **10 biotipos**, modo manequim, construção topográfica e écorché.

**Regra de aceite inegociável:** círculos pintados no SVG, discos soltos sobre uma esfera, texturas que simulam cortes, abaulamentos discretos da lateral ou uma malha achatada apenas por \`z\` **não** satisfazem este requisito. A existência do plano deve ser demonstrável medindo coordenadas 3D e normais.

> **Nota de anatomia:** a secção circular plana é uma **convenção construtiva do método Loomis**, não uma afirmação de que o crânio humano real apresenta dois discos ósseos planos. Ela deve ser implementada como parte do modelo didático/estético solicitado, sem confundir a representação geométrica com anatomia médica literal.

---

## 2. Diagnóstico do motor existente — confirmado em \`main\`

| Arquivo atual | Comportamento existente | Por que não resolve |
| --- | --- | --- |
| \`src/engine/head/sections.js\` | \`ringV2(y,p,S)\` devolve meia largura e seção sagital | Produz seção arredondada ao redor de toda a cabeça |
| \`src/engine/head/cranial-surface.js\` | \`pointV2\` usa \`sin(θ)\`, \`cos(θ)\` e \`lateral = 1 - 0.07 * gauss(...) * abs(sinθ)^14\` | Modifica levemente a **profundidade \`z\`**, sem criar faces planas \`x=constante\` |
| \`src/engine/head/ears.js\` | Implantação calculada a partir da largura da seção \`ringV2\` | Orelhas não estão ancoradas em discos planos independentes |
| \`src/engine/head/profile.js\` | Forma sagital anterior/posterior com taper da nuca | Precisa ser recalibrada junto ao recorte para evitar bico occipital |
| \`src/engine/head/landmarks.js\` | Orelha, ATM, temporal e mastoide usam âncoras simplificadas | Não conhece centro/raio/borda do novo plano |
| \`src/engine/head/iso-curves.js\` | Gera meridianos/paralelos sobre \`pointV2\` | Ainda não considera domínios de malha separados pelas duas bordas circulares |
| \`src/engine/head/mesh.js\` | \`meshFromGrid\` cria uma grade paramétrica tubular | Não oferece clipping/remalhagem, costura com loops ou patch de disco |
| \`src/engine/cabeca.js\` | Roteia \`headModel: "v1" | "v2"\` | V2 pode receber a nova construção sem alterar V1 |
| \`src/engine/montagem.js\` | Faz cache com parâmetros faciais e de biotipo | Exige novas chaves dos cortes e tratamentos de LOD |
| \`src/scene/biotipos.js\` | Contém 5 perfis masculinos + 5 femininos | Cortes devem permanecer em todos os perfis; diferença apenas de medidas |
| \`src/engine/desenho.js\` | Desenha malhas e linhas do atlas de cabeça | Precisará renderizar bordas/fillets respeitando profundidade e modo |

**Conclusão:** não se trata de aumentar o coeficiente de achatamento atual. É uma **modificação topológica da malha craniana V2**.

## 3. Contrato geométrico — não negociável

### 3.1 Coordenadas e simetria

Usar as coordenadas já convencionadas:

- \`x\`: esquerda/direita do personagem;
- \`y\`: vertical;
- \`z\`: anterior/posterior;
- \`s ∈ {-1,+1}\`: lado, com espelhamento exato no espaço local da cabeça;
- \`R\`: dimensão craniana normalizada de referência, derivada dos parâmetros do biotipo, **não medida anatômica absoluta**.

Definir para cada lado um plano:

\[
\Pi_s: x = s \cdot d,\qquad d>0
\]

Esse plano deve ser **vertical no eixo local da cabeça**; ele gira com a cabeça pela cadeia de transformações do personagem, mas **não muda com os movimentos da mandíbula**.

### 3.2 Disco geométrico obrigatório

Centro de cada plano:

\[
C_s=(s\,d,\ y_c,\ z_c)
\]

Disco de raio \(\rho\), com interior:

\[
D_s(r,\varphi)=\left(s\,d,\ y_c+r\cos\varphi,\ z_c+r\sin\varphi\right),\quad
0\le r\le \rho,\quad 0\le\varphi<2\pi
\]

**Invariantes obrigatórios:**

1. Todos os vértices do interior do disco atendem a \(\lvert x\rvert=d\), dentro da tolerância numérica.
2. A borda externa do disco é um círculo em coordenadas \((y,z)\):
   \((y-y_c)^2+(z-z_c)^2=\rho^2\).
3. Disco esquerdo e direito têm mesmo raio, altura e profundidade, com \((x,y,z)\to(-x,y,z)\).
4. A normal interna da face é predominantemente \((s,0,0)\).
5. Há **área plana positiva e visível**; não é aceitável produzir um plano que colapsa em linha ou vértice.
6. A cabeça não fica aberta na união do disco com a abóbada; não deve haver faces duplicadas no interior.
7. A malha deve permanecer válida sob LOD 0/1/2, expressões, poses e transições de biotipo.

### 3.3 Relação com a esfera cortada — ponto de partida

Para a esfera teórica de raio \(R\), cortada a \(x=\pm d\):

\[
\rho=\sqrt{R^2-d^2}
\]

Este vínculo dá uma **referência construtiva inicial**. Quando o neurocrânio é deformado para ficar anatomicamente plausível, a curva de interseção natural pode deixar de ser um círculo. **Não inferir** que qualquer elipsoide cortado por um plano sempre produz círculo perfeito.

Para satisfazer o requisito estético de **círculos planos reais**, há duas abordagens admissíveis:

- **A — Remalhagem explícita preferida:** recortar a abóbada por dois planos, reconstruir o loop externo e inserir a face plana circular com anel de adaptação, removendo faces antigas dentro do recorte.
- **B — Parametrização por múltiplos patches:** crânio convexo, anel de transição e disco plano compartilham loops de fronteira e uma topologia consistente. Deve passar pelos mesmos testes de malha.

**Proibido:** \`x=clamp(x,-d,d)\` aplicado a todos os vértices sem remalhagem; isso cria triângulos degenerados, superfícies sobrepostas e bordas mal definidas.

### 3.4 Borda, dureza e suavidade

O **interior do disco** deve ser matematicamente plano. A **transição externa** deve usar uma faixa de largura pequena \(\varepsilon\) (anel/fillet):

- limite interior: \(\partial D_s\), círculo de raio \(\rho\);
- anel de transição: \(\rho \le r\le\rho+\varepsilon\);
- conexão com abóbada: fronteira externa do anel.

Usar, por exemplo, curva **quintic smootherstep** \(q(t)=6t^5-15t^4+10t^3\) ou interpolação Hermite que respeite os pontos e tangentes do disco e da superfície externa.

**Decisão importante:** um corte geometricamente **vivo** tem continuidade de posição **C⁰**, com mudança proposital de normal na aresta; um corte com chanfro/fillet pode ter **C¹** nas bordas do anel. **Não exigir C² através de uma aresta que deve continuar visualmente perceptível.** O interior é plano em ambas as opções.

### 3.5 Parâmetros propostos (valores de partida, sujeitos a calibração)

\`\`\`js
// nomes propostos, NÃO existem no código atual
sidePlaneCenterY  // altura do centro do disco em unidades de cabeça
sidePlaneCenterZ  // deslocamento sagital do disco
sidePlaneDepth    // distância d do centro ao plano x=±d
sidePlaneRadius   // raio físico do círculo no plano YZ
sidePlaneBevel    // largura do chanfro/fillet de costura
sidePlaneEdge     // intensidade visual da aresta no modo construção
\`\`\`

Regras:

- \`sidePlaneRadius > 0\`, \`sidePlaneDepth > 0\`, \`sidePlaneBevel >= 0\`;
- o plano deve ficar **dentro** do envelope craniano adequado; não cruzar a linha mediana nem invadir nariz, cavidade ocular, maxila ou boca;
- as orelhas ficam relacionadas ao **quadrante inferior/anterior** do disco e à transição mastoide, não obrigatoriamente no centro do círculo;
- o tamanho acompanha \`headScale\`; o posicionamento deve considerar \`skull\`, \`cranialDepth\`, \`face\`, \`fem\`, \`fat\`, \`muscle\`, e \`earSize\` quando relevante;
- proporções iniciais para um **modelo esférico didático** podem usar \(d/R\approx0{,}70\text{–}0{,}82\) e \(\rho/R=\sqrt{1-(d/R)^2}\), mas **esses números não são medidas humanas certificadas nem limites imutáveis**;
- **não expor um seletor para remover os planos na Cabeça V2 aprovada**: os dois discos são parte obrigatória do modelo. A V1 continua como rollback.

---

## 4. Task graph de dependências

\`\`\`mermaid
flowchart TD
    L00["LP-00 Baseline e referências"] --> L01["LP-01 Contrato dos discos"]
    L01 --> L02["LP-02 Landmarks e centro"]
    L02 --> L03["LP-03 Envelopes cranianos"]
    L03 --> L04["LP-04 Interseção e recorte"]
    L04 --> L05["LP-05 Disco esquerdo"]
    L04 --> L06["LP-06 Disco direito"]
    L05 --> L07["LP-07 Topologia sem sobreposição"]
    L06 --> L07
    L07 --> L08["LP-08 Anel e fillet"]
    L08 --> L09["LP-09 Normais e bordas"]
    L09 --> L10["LP-10 Testes geométricos"]
    L02 --> L11["LP-11 Âncoras das orelhas"]
    L08 --> L11
    L02 --> L12["LP-12 Temporal e zigoma"]
    L08 --> L12
    L03 --> L13["LP-13 Frontal e testa"]
    L03 --> L14["LP-14 Occipital e nuca"]
    L14 --> L15["LP-15 Transição cervical"]
    L11 --> L16["LP-16 ATM e orelha"]
    L12 --> L16
    L13 --> L17["LP-17 Máscara facial e olhos"]
    L16 --> L18["LP-18 Boca/expressões sem deformar discos"]
    L10 --> L19["LP-19 Isolinhas reais"]
    L08 --> L19
    L19 --> L20["LP-20 LOD, UV e cache"]
    L15 --> L21["LP-21 Adaptação 10 biotipos"]
    L18 --> L21
    L20 --> L21
    L21 --> L22["LP-22 Integração v2/editor/MCP"]
    L22 --> L23["LP-23 Vistas ortográficas/perspectiva"]
    L23 --> L24["LP-24 Matriz visual"]
    L24 --> L25{"LP-25 Aprovação estética?"}
    L25 -->|não| L03
    L25 -->|sim| L26["LP-26 Performance e exportações"]
    L26 --> L27["LP-27 Regressão completa"]
    L27 --> L28["LP-28 Publicação controlada"]
\`\`\`

**Sequência crítica:** LP-00 → 01 → 02 → 03 → 04 → 05/06 → 07 → 08 → 09 → 10 → 19/20 → 21 → 22 → 23 → 24 → 25 → 26 → 27 → 28.

**Proibição de salto:** não refinar olhos, orelhas ou textura para esconder defeitos antes de os dois planos terem sido confirmados na **malha base**.

---

## 5. Backlog completo, por ordem e arquivo

**Estado inicial de todas as tasks abaixo:** **PENDENTE**. Tarefa “implementada” só depois de commit de código + testes + render de evidência.

| ID | Prioridade | Dependências | Alteração e arquivos previstos | Critério de conclusão |
| --- | --- | --- | --- | --- |
| **LP-00** | P0 | — | Congelar baseline da V2 e V1, prints com nuca pontuda e referência Loomis; \`docs/\`, \`testes/\` | Manifesto com revisão Git, parâmetros, vistas e imagens |
| **LP-01** | P0 | 00 | Definir contrato \`SidePlaneGeometry\` e parâmetros invariantes; \`head/constants.js\`, \`head/side-planes.js\` (novo) | API e eixos documentados, parâmetros validados |
| **LP-02** | P0 | 01 | Definir centro em cada lateral, largura das seções e âncoras do plano; \`head/landmarks.js\` | Centros esquerdo/direito espelhados e estáveis |
| **LP-03** | P0 | 02 | Recalibrar perfil frontal, parietal, temporal e occipital antes do corte; \`head/profile.js\`, \`head/sections.js\` | Frente e perfil sem redondeza homogênea nem ponta na nuca |
| **LP-04** | P0 | 03 | Algoritmo de recorte da abóbada com planos \(x=\pm d\); \`head/cranial-surface.js\`, \`head/mesh.js\` | Loops de fronteira consistentes, sem faces antigas dentro do corte |
| **LP-05** | P0 | 04 | Gerar patch de disco realmente plano esquerdo; \`head/side-planes.js\` | Todos os vértices internos no mesmo plano, borda circular |
| **LP-06** | P0 | 04 | Gerar patch de disco realmente plano direito; \`head/side-planes.js\` | Mesmo raio/centro sagital, \(x\) espelhado |
| **LP-07** | P0 | 05+06 | Triangular disco, ajustar winding e costurar os dois loops à abóbada; \`head/mesh.js\`, \`head/cranial-surface.js\` | Sem faces duplicadas, fissuras, inversão de triângulos ou buracos |
| **LP-08** | P0 | 07 | Criar anel de chanfro ou fillet que conecte o plano à abóbada; \`head/side-planes.js\` | Área plana preservada; transição externa controlada |
| **LP-09** | P0 | 08 | Normais corretas para \(\pm x\), bordas visíveis sem outline artificial; \`head/mesh.js\`, \`head/diagnostics.js\` | Normais interior ±x, contorno estável em 3/4 |
| **LP-10** | P0 | 09 | Testes unitários de planaridade, raio, simetria, áreas e manifold; \`testes/cabeca-v2-planos.mjs\` | Testes quantitativos obrigatórios passam |
| **LP-11** | P0 | 02+08 | Implantar orelha à área temporal do disco, atualizando helix/concha/lóbulo; \`head/ears.js\`, \`head/landmarks.js\` | Orelhas não flutuam, não atravessam o plano |
| **LP-12** | P0 | 02+08 | Recalibrar têmpora, zigoma e masseter em torno da borda anteroinferior; \`head/face-fields.js\` | Linha de zigoma não cruza centro do disco |
| **LP-13** | P0 | 03 | Reconstruir plano frontal/testa e arco supraorbital com boa silhueta; \`head/profile.js\`, \`head/face-fields.js\` | Testa visível no perfil e 3/4 |
| **LP-14** | P0 | 03 | Corrigir occipital e terminar a abóbada com transição mastoide sem ponta; \`head/profile.js\` | Sem protuberância em gancho ou vértice posterior |
| **LP-15** | P0 | 14 | Integrar nuca com pescoço sem formar protuberância e sem esconder cervical; \`head/neck.js\`, \`engine/corpo.js\` | Perfil posterior fluido do occipital até trapézio |
| **LP-16** | P0 | 11+12 | Reposicionar ATM/côndilo e ramo mandibular em relação ao disco e à orelha; \`head/jaw-rig.js\` | Boca aberta sem puxar plano nem orelha |
| **LP-17** | P1 | 13 | Integrar órbitas/olhos, glabela, testa e lateral anterior do plano; \`head/orbit.js\`, \`head/nose.js\` | Olhos não flutuam nem interferem no disco |
| **LP-18** | P0 | 16 | Fixar pesos de deformação da mandíbula/expressão para neurocrânio; \`head/jaw-rig.js\`, \`head/expressions.js\` | Os planos não deformam ao abrir boca, sorrir ou piscar |
| **LP-19** | P0 | 08+10 | Projetar círculo periférico e meridianos/paralelos sobre a topologia recortada; \`head/iso-curves.js\`, \`engine/desenho.js\` | Linhas respeitam o plano e o anel, sem atravessar vazios |
| **LP-20** | P0 | 19 | Preservar discos nos LOD 0/1/2 e atualizar UV/normais/caches; \`head/mesh.js\`, \`head/cranial-surface.js\`, \`engine/montagem.js\` | Disco permanece circular e plano em qualquer qualidade |
| **LP-21** | P0 | 15+18+20 | Adaptar d/raio/posição aos dez biotipos, mantendo cortes obrigatórios; \`head/biotypes.js\`, \`scene/biotipos.js\` | 10/10 perfis preservam planos simétricos e proporções |
| **LP-22** | P0 | 21 | Conectar à fachada V2, parâmetros/UI, serialização, storyboard e MCP; \`head/index.js\`, \`engine/cabeca.js\`, \`scene/parametros.js\`, \`scene/estado.js\`, \`scene/comandos.js\` | Alterações salvas/reabertas; render igual em UI/MCP; V1 intacta |
| **LP-23** | P0 | 22 | Criar folha comparativa frente/perfil/3/4/costas/topo/base, ortográfica e perspectiva; \`testes/atlas-planos-loomis.mjs\` | Discos visíveis e coerentes em ambas as laterais |
| **LP-24** | P0 | 23 | Matriz 10 biotipos × 9 vistas × 5 expressões × 3 modos; \`testes/matriz-cabeca-v2.mjs\` | 1.350 cenas geradas, manifesto completo de falhas |
| **LP-25** | P0 | 24 | Revisar a estética com a folha Loomis e screenshots anteriores; \`docs/\` | Aprovação visual documentada; caso reprove, voltar a LP-03/08 |
| **LP-26** | P1 | 25 | Medir custo no notebook/browser, desempenho do z-buffer, SVG, OpenPose, máscaras, depth; \`testes/\`, \`mcp/\` | Sem degradação não justificada e sem mudanças no enquadramento |
| **LP-27** | P0 | 26 | Executar regressão de biotipos, cabeça, mandíbula, cenas, quadro, MCP e HTML único; \`package.json\`, workflow | Testes automatizados sem erro, snapshots revisados |
| **LP-28** | P0 | 27 | Integrar PR e verificar GitHub Pages, manter opção de rollback V1 | Site efetivamente atualizado, screenshots e comparação finais registrados |

### Entregáveis mínimos por task

Cada tarefa fechada deve conter **ID + arquivos alterados + testes que passaram + SVG/PNG gerado pelo próprio motor + nota das limitações + commit/PR**. Não é suficiente “mudou o parâmetro”.

---

## 6. Modelagem e integração — requisitos detalhados

### LP-01 a LP-04: primeira base matemática

Criar em \`head/side-planes.js\`:

\`\`\`ts
// assinatura proposta; NÃO existe ainda no código
type SidePlane = {
  side: -1 | 1;
  center: [number, number, number];
  normal: [number, number, number];
  radius: number;
  cutDistance: number;
  bevelWidth: number;
  borderLoop: Float32Array;
  planarMesh: MeshData;
  transitionMesh: MeshData;
};

computeSidePlanes(params, landmarks): [SidePlane, SidePlane];
clipCraniumAgainstSidePlanes(craniumMesh, planes): TrimmedCranium;
buildCircularPatch(plane, resolution): MeshData;
stitchSidePlane(trimmed, patch, blend): MeshData;
\`\`\`

A fachada da cabeça deve preservar os métodos v1. \`pointV2\` pode continuar como amostrador **da abóbada sem corte**, mas a malha final resultante precisa incorporar os patches; portanto não basta deixar \`pointV2\` intacto e pintar discos no SVG. Se o amostrador público continuar sendo usado para picking/linhas/oclusão, ele deve expor um novo amostrador **por região** ou retornar pontos da superfície já recortada.

### LP-04 a LP-09: topologia sem falhas

Algoritmo recomendado:

1. Construir a superfície-base da abóbada com \`profile.js\` + \`sections.js\`.
2. Determinar posição e raio de cada disco em coordenadas cranianas.
3. Fazer o **clipping** das faces que ultrapassam cada plano, mantendo malha da parte central.
4. Extrair os **loops fechados** de interseção, preservando winding e ordenação.
5. Construir um **círculo planar exato** no nível de desenho; criar amostragem angular comum \(\varphi_i=2\pi i/N\).
6. Construir um **anel de transição** entre o círculo e a seção de malha recortada, com geometria regulada pelo fillet e normais corretas.
7. Preencher cada disco por **triângulos radiais/concêntricos**, evitando um vértice central duplicado por coluna que provoque triângulos de área zero.
8. Compartilhar índices das bordas para não gerar z-fighting entre cap, anel e casca externa.
9. Validar orientações, manifold, autointerseção e occlusão para todas as malhas.

**Atenção:** se o círculo exigido não coincidir com a interseção natural do crânio (que pode ser elíptica), é obrigatório criar a transição topológica em torno dele. Forçar “circularidade” em um loop já triangulado sem reconstruir as faces pode criar artefatos graves.

### LP-10: testes matemáticos mínimos (gates)

A nova suíte \`testes/cabeca-v2-planos.mjs\` deverá verificar:

\`\`\`js
// pseudocódigo do contrato, não implementação pronta
for (const biotipo of dezBiotipos) {
  for (const lod of [0, 1, 2]) {
    const head = buildHeadV2(params, shape, lod);
    assert(hasPlanarSide(head, -1));
    assert(hasPlanarSide(head, +1));
    assert(mirrorSymmetric(head.sidePlanes));
    assert(circularBorders(head.sidePlanes));
    assert(noDegenerateTriangles(head));
    assert(noDuplicateFaces(head));
    assert(noUnexpectedOpenBoundary(head));
  }
}
\`\`\`

Critérios numéricos **iniciais de projeto** (ajustar conforme \`R\` real e precisão \`Float32Array\`):

| Propriedade | Alvo sugerido |
| --- | --- |
| Planaridade interior | \(\max_i |x_i-sd|\le 10^{-4}R\) |
| Circularidade da borda | \(\max_i |\sqrt{(y_i-y_c)^2+(z_i-z_c)^2}-\rho|\le 10^{-3}R\) |
| Simetria L/R | Diferença de parâmetros normalizados \(\le 10^{-4}\) |
| Normal do disco | Ângulo em relação ao vetor \((s,0,0)\) ≤ 2° no interior |
| Área plana | \(\operatorname{area}(D_s) > 0\) e fração visível definida na inspeção visual |
| Triângulos degenerados | 0 fora de polos/limites expressamente tratados |
| Manifold | Sem buracos ou arestas compartilhadas por >2 faces em partes fechadas |
| V1 | Resultados idênticos ao baseline anterior para mesmos parâmetros |

**Não falsificar aceitação visual com testes numéricos.** Duas faces planas podem estar matematicamente perfeitas e continuar mal posicionadas na cabeça.

### LP-11, LP-12, LP-16: orelha, têmpora, zigoma e ATM

Derivar os landmarks da orelha e ATM **do centro do plano e da borda inferior/anterior**, não da largura \`ringV2\` isolada. Garantir:

- tragus, hélice, concha e lóbulo bem assentados;
- temporal **plano no disco**; zigoma emerge à frente e abaixo do círculo sem atravessar o cap;
- mastoide entra na região inferior/posterior do plano e faz transição para o pescoço;
- abertura mandibular não altera \`sidePlaneDepth\`, \`sidePlaneRadius\`, posição do centro nem orientação;
- a orelha acompanha rotação global de cabeça, mas **não** a rotação da mandíbula.

### LP-13 a LP-15: testa, occipital, nuca e cervical

Os dois planos não devem virar uma solução isolada. Em particular, a referência exige **testa bem definida** e **nuca sem ponta**.

- **Frontal:** ajustar curvatura sagital entre vértice → frontal → glabela → raiz nasal, independentemente do corte lateral.
- **Occipital:** eliminar a terminação posterior afilada criada por interpolação de perfil; usar curvas-guia com tangentes explícitas.
- **Nuca:** o perfil posterior deve transicionar por mastoide → cervical → trapézio sem criar bico ou gancho.
- **Pescoço:** a construção circular lateral pertence ao crânio, **não** ao pescoço; as bordas do plano terminam antes do trecho cervical.
- **Pose:** cabeça rotacionada em três eixos continua com o plano estrutural íntegro, mesmo com flexão da cervical.

### LP-18: travar a região neurocraniana

O novo cap e seu anel pertencem ao neurocrânio **rígido**. \`jawPoseV2\` não pode aplicar pesos locais apenas por \`y,z\` se isso atingir indevidamente o disco. Definir uma máscara semântica de **região anatômica** para crânio fixo, mandíbula móvel e tecidos moles.

Testar:

- 0%, 25%, 50%, 75%, 100% de abertura;
- sorriso, surpresa, olho fechado e franzimento;
- boca aberta e cabeça inclinada;
- orelhas e discos imóveis **no espaço local da cabeça**; em espaço global movimentam-se apenas com a cabeça.

### LP-19 e LP-23: linhas topográficas e projeção

Os círculos precisam aparecer estruturalmente, mas a representação visual deve ter dois níveis:

1. **Modo manequim:** superfície real, iluminação/contorno suave; a borda deve ser legível sem exagero.
2. **Modo construção:** círculo de perímetro + linhas meridianas/paralelas **seguindo os patches** (círculo interno e anel de transição); ocultar linhas atrás do volume e preservar profundidade.
3. **Écorché:** pavilhão auricular, temporal, arco zigomático e implantação do masseter seguem a geometria.

Evitar desenho bidimensional de “círculo decorativo” independente da malha. O contorno deve ser derivado dos vértices e da fronteira do cap. Testar:

| Vista | Expectativa |
| --- | --- |
| Perfil esquerdo ortográfico | Disco esquerdo circular, com centro e contorno bem posicionados |
| Perfil direito ortográfico | Disco direito espelhado e igualmente circular |
| Frente | Redução real da convexidade lateral e largura coerente; não parecem placas coladas |
| 3/4 esquerdo/direito | Planos evidentes e integrados ao frontal/occipital |
| Traseira | Corte bem costurado, sem buraco e sem quina no pescoço |
| Superior/inferior | Dois planos presentes sem achatamento global destrutivo |
| Boca aberta | Planos e orelhas não se movem com a mandíbula |
| Cabeça inclinada | Planos seguem a transformação da cabeça sem cisalhamento |

### LP-20 a LP-22: cache, parâmetros e cenas

Adicionar parâmetros ao esquema existente com migração segura:

- \`sidePlaneDepth\`, \`sidePlaneRadius\`, \`sidePlaneCenterY\`, \`sidePlaneCenterZ\`, \`sidePlaneBevel\`;
- incluir todos na **chave de cache** de malha e de linhas topográficas;
- preservar \`headModel: "v1" | "v2"\` e \`headDetail: 0 | 1 | 2\`;
- os controles editam **tamanho, posição e chanfro**, mas não removem a existência bilateral dos discos na V2;
- a mesma cena renderizada no navegador, storyboard e MCP deve produzir a mesma geometria dentro da tolerância numérica;
- manter cenas legadas, comandos e snapshots v1 sem alteração automática.

Ajustar \`head/biotypes.js\` para aplicar **os mesmos dois discos** em todos os biotipos. Não criar dez algoritmos diferentes; parametrizar o mesmo algoritmo central.

---

## 7. Matriz de regressão e aprovação

### 7.1 Matriz mínima antes da revisão visual

- **Geometria:** 10 biotipos × 3 LOD = **30 pares de planos**.
- **Articulação:** 10 biotipos × 5 aberturas = **50 estados com planos imóveis**.
- **Visão:** 10 biotipos × 9 ângulos × 5 expressões × 3 modos = **1.350 renderizações**, usando a matriz geral da Cabeça V2 já planejada.
- **Comparação bilateral:** esquerda/direita com câmera ortográfica igual e orientação espelhada.
- **Compatibilidade:** v1/v2, cenas antigas, modo de quadros, exportações SVG/PNG/OpenPose, máscaras e z-buffer.

### 7.2 Métricas de revisão artística

A revisão humana deve aprovar cada item, não apenas o SVG ser válido:

1. É possível identificar o **círculo lateral plano** sem que uma linha pintada crie a ilusão?
2. O plano parece **corte de uma esfera craniana**, não uma tampa sobreposta?
3. Frontal, parietal, temporal e occipital permanecem anatomicamente reconhecíveis?
4. O perfil mantém **testa visível** e silhueta craniana convincente?
5. O **occipital/nuca** deixou de formar uma ponta ou um gancho?
6. Orelhas e ATM têm posição coerente ao redor do plano?
7. Cabeça/pescoço permanecem proporcionais ao corpo em todos os biotipos?
8. O modelo em 3/4 se aproxima da **lógica construtiva Loomis** da referência?
9. Contornos e isolinhas não são excessivos ou repetidos na renderização?
10. O modelo funciona com **boca aberta** e expressões sem deformar o disco?

**Gates (revisão humana obrigatória):**

- **GL-0:** baseline e parâmetros documentados;
- **GL-1:** discos esquerdo/direito comprovadamente planos e circulares por testes;
- **GL-2:** costura/fillet/normais e crânio frontal/occipital aprovados geometricamente;
- **GL-3:** orelhas, têmpora, mandíbula, nuca/pescoço aprovados em perfil e 3/4;
- **GL-4:** dez biotipos + 1.350 renderizações produzidas, artefatos auditáveis;
- **GL-5:** comparação estética com referência aprovada;
- **GL-6:** testagem de compatibilidade, build, PR e GitHub Pages.

---

## 8. Distribuição em ondas de execução

| Onda | Tasks | Objetivo | Gate |
| --- | --- | --- | --- |
| **A — Base** | LP-00 a LP-03 | Referência, parâmetros e abóbada revisada | GL-0 |
| **B — Cirurgia geométrica** | LP-04 a LP-07 | Recortar malha e criar dois discos | GL-1 |
| **C — Acabamento estrutural** | LP-08 a LP-10 | Fillet, borda, normais, invariantes matemáticos | GL-2 |
| **D — Anatomia adjacente** | LP-11 a LP-18 | Orelhas, temporal, testa, occipital, nuca, ATM, expressões | GL-3 |
| **E — Sistema procedural** | LP-19 a LP-22 | Linhas, LOD, biotipos, cenas, editor e MCP | GL-3 + integração |
| **F — Auditoria visual** | LP-23 a LP-25 | Vistas, 1.350 cenas e aprovação estética | GL-4/GL-5 |
| **G — Entrega** | LP-26 a LP-28 | Performance, regressão total e publicação | GL-6 |

**WIP permitido:** trabalho paralelo apenas em arquivos diferentes. \`cranial-surface.js\`, \`mesh.js\`, \`landmarks.js\` e \`desenho.js\` devem ter um responsável por vez em cada onda para evitar conflito de geometria.

### Definition of Done geral

- [ ] DiscOS planos **reais** dos dois lados, e não traços decorativos.
- [ ] Bordas dos dois lados são circulares em coordenadas físicas \(y,z\).
- [ ] Simetria geométrica bilateral nos presets neutros.
- [ ] Abóbada não apresenta material indevido sob/por cima do disco.
- [ ] Borda/fillet não criam triângulos degenerados nem faces abertas.
- [ ] Testa existe e possui plano frontal anatômico.
- [ ] Nuca/occipital não terminam em ponta e se conectam à cervical.
- [ ] Orelhas ancoradas, sem flutuar nem penetrar a superfície.
- [ ] ATM e expressões não deformam o plano.
- [ ] Dez biotipos respeitam o mesmo algoritmo construtivo.
- [ ] Três LODs preservam o círculo real.
- [ ] Mode manequim/construção/écorché e exportações apresentam geometria coerente.
- [ ] Matriz de 1.350 cenas produzida e comparada visualmente.
- [ ] V1 e arquivos antigos permanecem compatíveis.
- [ ] Publicação só depois de GL-1 a GL-6.

---

## 9. Caminho concreto de implementação no repositório

Criar preferencialmente:

\`\`\`text
geomannequin/src/engine/head/
  side-planes.js       # distância, centro, raio, discos planos, anel/fillet
  mesh-clipping.js     # clipping de triângulos em x = ±d
  mesh-stitch.js       # loops, índices compartilhados, normais e fechamento
  ...                  # módulos V2 já existentes, não duplicar motor
geomannequin/testes/
  cabeca-v2-planos.mjs
  atlas-planos-loomis.mjs
  saida/cabeca-v2-planos/
geomannequin/docs/
  task-graph-cabeca-v2-planos-laterais-loomis.md
\`\`\`

Arquivos existentes a revisar na ordem: \`head/profile.js\`, \`head/sections.js\`, \`head/cranial-surface.js\`, \`head/mesh.js\`, \`head/landmarks.js\`, \`head/ears.js\`, \`head/jaw-rig.js\`, \`head/neck.js\`, \`head/iso-curves.js\`, \`head/biotypes.js\`, \`engine/cabeca.js\`, \`engine/montagem.js\`, \`engine/desenho.js\`, \`scene/parametros.js\`, \`scene/estado.js\`, \`mcp/lib/core.mjs\` apenas se necessário.

**Comandos existentes para estabelecer baseline** (antes de adicionar testes novos):

\`\`\`bash
cd geomannequin
npm ci
npm ci --prefix mcp
npm run testar:cranio
npm run testar:cabeca-v2
npm run matriz:cabeca-v2:rapida
\`\`\`

**Comandos propostos, a registrar só após criar os arquivos correspondentes**:

\`\`\`bash
npm run testar:planos-loomis
npm run atlas:planos-loomis
npm run matriz:cabeca-v2
\`\`\`

**Regra final para Claude/Codex:** executar por ondas; não considerar LP-05/LP-06 concluídos sem prova geométrica de \(\lvert x\rvert=d\) e círculos fechados; não considerar LP-28 concluído sem aprovação visual dos cortes, testa, nuca e orelhas. A imagem de referência do usuário determina o **resultado estético esperado**; o teste numérico determina se o requisito geométrico foi realmente implementado.

**Primeiro patch recomendado:** LP-00 → LP-01 → LP-02 → LP-03, seguido de um protótipo LP-04 a LP-10 **isolado da interface**. Somente depois integrar com as demais regiões faciais.
