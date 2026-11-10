# Cabeça V4 · Análise dos 14 anexos de referência

**Origem:** 14 folhas de referência anatômica enviadas em 10/11/2026, abrangendo exercícios de Loomis/Asaro, line art, coloração plana azul, vistas frontais/laterais/posteriores, inclinações laterais, top-down e bottom-up. As folhas não especificam unidades nem medidas antropométricas padronizadas; usá-las como **objetivo estético de consistência**, não como dados clínicos.

## Padrões comuns a TODAS as folhas

| Área | Forma procurada | Erro observado nas versões antigas | Critério de avaliação V4 |
|---|---|---|---|
| Abóbada parietal | Oval amplo, sem inflar a parte superior nem fechar em ponta | Calota esférica e balão frontal | Silhueta frontal, topo e 3/4 consistentes |
| Testa | Plano frontal suave com mudança para temporal | Testa convexa esférica até os olhos | Segmento frontal reconhecível no perfil |
| Plano temporal / Loomis | Área lateral achatada integrada sem disco solto | Lateral em bola/achatamento artificial | Linha temporal acompanha superfície em todos os ângulos |
| Arco supraorbital | Reborde saliente, região ocular contida | Cavidade profunda que afundava a silhueta | Rebordo/brow acima da órbita sem “buraco” |
| Olhos e pálpebras | Abertura legível e espelhada, sem olho projetado | Linhas orbitais frágeis | Cantos e curvas superior/inferior projetados em 3D |
| Nariz | Raiz, dorso, ponta, asas/base em volumes pequenos | Prisma angular ou nariz ausente | Perfil e inferior mostram projeção e duas asas |
| Maçãs do rosto | Zigoma largo, plano malar ligado à lateral | Bochecha circular desorganizada | Plano em 3/4 e corte claro até mandíbula |
| Boca/maxila | Convexidade leve e volumes labiais discretos | Boca em bico, queixo deformado | Em perfil, boca não ultrapassa nariz nem mento indevidamente |
| Mandíbula | Ramo, gônio, corpo oblíquo e mento firme | Queixo triangular colado à malha | Gônio perceptível em perfil/3/4, linha contínua ao queixo |
| Orelha | Pavilhão simples conectado à ATM/mastoide | Orelha solta no crânio | Perfis espelhados, hélice/concha legíveis |
| Nuca/occipital | Arco posterior contínuo descendente | Degrau horizontal ao final da calota | Posterior/3/4 sem linha reta atravessando a nuca |
| Pescoço | Cilindro cervical menor que mandíbula, ECM em V e trapézio | Cilindro largo e cortado na parte superior | Encaixe nos perfis e costas sem abertura visível |
| Line art | Contorno grosso, planos leves, olhos/nariz bem definidos | Linhas genéricas do wireframe | 3 hierarquias de traço; sem wireframe desnecessário |
| Azul plano | 2–3 níveis discretos de luminância por planos | Sombreamento genérico do corpo | Separação da região temporal, malar, mandíbula, pescoço |

## Famílias visuais identificadas

1. **Loomis/Asaro simplificado** — crânio limpo com linha temporal, supraorbital e corte zigomático, ótimo para avaliar volume sem detalhes faciais supérfluos.
2. **Line art anatômica detalhada** — feições maiores (olhos, nariz, lábios) com mandíbula e pescoço mais realistas; serve como objetivo do modo `v4_lineart_clean`.
3. **Sombreamento azul didático** — o modelo precisa ser planar de verdade antes de preencher. Cor não substitui geometria.
4. **Sets de inclinação** — yaw, pitch e roll independentes; vistas extremas mostram falhas de maxila, base nasal, submento e mastoide que um frontal agradável esconderia.
5. **Vistas posteriores** — a testa não deve afetar o occipital, e a base craniana deve descer para a inserção cervical, evitando recorte de poste.

## Matriz de comparação (prioridades)

| Vista | Observação de alta prioridade | Estruturas |
|---|---|---|
| Frontal | proporção topo/temporal/mandíbula e simetria | olhos, sobrancelhas, nariz, boca, mento |
| 3/4 45° | volumetria dos planos | testa, órbita, malar, zigoma, maxila, mandíbula |
| Perfil 90° | ritmo de contorno | testa, nasion, nariz, lábios, queixo, occipital, nuca |
| 3/4 posterior 135° | continuidade occipital e abertura da orelha | temporais, mastoide, ECM |
| Posterior 180° | base craniana e pescoço mais estreito | occipital, trapézios |
| De cima | forma tridimensional da abóbada | frontal, parietal e occipital |
| De baixo | base nasal, mento e garganta | asa, septo simplificado, submento |
| Roll ±30° | landmarks e geometria preservados sem correção artística por câmera | toda a cabeça |
| Pitch ±60° | orelhas, maxila e nuca não se separam | toda a base craniana |

## Plano de calibração objetivo

Para cada vista, renderizar a V4 e a referência com a mesma projeção e escala; alinhar pelo eixo dos olhos, ponta nasal e mento. Após segmentar a silhueta e identificar os landmarks manualmente ou por método verificado:

`E = 0.40 E_silhueta + 0.25 E_landmarks + 0.15 E_planos + 0.10 E_continuidade + 0.10 E_simetria`

- **Silhueta:** erro de distância entre contornos (normalizado pelo tamanho da cabeça).
- **Landmarks:** erro de posição de gônio, orelha, olhos, nasal e mento entre vistas.
- **Planos:** continuidade de curvatura e contraste planar em pontos específicos.
- **Continuidade:** distância/suavidade de pescoço sob occipital, inclusive com rig.
- **Simetria:** frente e perfis espelhados antes de aplicar expressões assimétricas.

**Estado em 10/11/2026:** esse sistema de comparação numérica está **especificado, não executado**. A V4 de fundação foi avaliada matematicamente quanto a integridade de malha, mas não foi pareada a máscaras extraídas das referências. Não afirmar semelhança máxima ou aprovação antes dos atlas e da inspeção real.
