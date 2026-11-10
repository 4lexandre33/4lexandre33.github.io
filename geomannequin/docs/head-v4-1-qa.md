# Cabeça V4.1 — Matriz de controle de qualidade visual

**Status:** pontos quantitativos isolados validados; avaliação de semelhança com as 14 folhas enviadas e renderização do SVG real ainda pendentes. Este documento não contém capturas inventadas.

## Imagens de referência: famílias identificadas

| Conjunto | Papel na revisão | O que deve ser observado |
|---|---|---|
| R01–R03 | Line art Asaro com vários ângulos | crânio, V facial, mandíbula/mento, planos em 3/4 |
| R04–R06 | Vistas dinâmicas e pescoço | occipital reduzido, ligamento ao trapézio, ECM, inclinação |
| R07–R08 | Frontal e perfis ortogonais | proporções, simetria, posição e relevo de orelhas |
| R09–R10 | Folhas Asaro em perspectivas extremas | pálpebras, base nasal, queixo e submento de baixo |
| R11–R12 | Figura azul e planos preenchidos | separação temporal/malar/mandibular por sombreado |
| R13–R14 | Estudos de rotação e inclinação | ângulos de 15–75°, pitch/roll mantendo anatomia |

*Os identificadores acima agrupam as referências por função visual; não pretendem ser uma indexação automática dos pixels anexados.*

## Verificações quantitativas disponíveis

| Métrica | Alvo | Situação |
|---|---|---|
| Profundidade posterior na seção v≈0.41 | Encurtar de forma clara sem alterar a testa | Verificação isolada: cerca de 32% na configuração padrão |
| Largura do mento v≈0.985 / largura facial v≈0.645 | 0.045 a 0.23, cunha quase pontuda | Verificação isolada: 0.142 |
| Distância do plano lateral em Z no V facial | Recuo real no 3/4 | Verificação isolada: ~0.05 unidades no ponto de teste |
| Orelha superior/inferior | Aproximadamente brow → base nasal, com variação de tamanho | Amostras isoladas dentro de tolerância |
| Orelha E/D | Espelhamento dos pontos | Verificado em amostras |
| Pescoço inserido no occipital | Sem topo do cilindro projetado para fora da cabeça | Verificado matematicamente; a costura visual ainda precisa inspeção |
| Malha da cabeça (10 biotipos × 3 LOD) | Finita, sem triângulos degenerados na verificação realizada | Verificação isolada satisfatória |
| Malha OBJ fechada | 0 bordas abertas e arestas não-manifold | Verificação isolada satisfatória |
| Equivalência estética com 14 anexos | Atingir o estilo construtivo | PENDENTE |
| Build e deploy GitHub Pages | Executar e inspecionar UI | PENDENTE |

## Roteiro de revisão multivista

- [ ] Frontal: topo sem balão, laterais temporais sem cintura, largura facial em V e mento fino porém com volume.
- [ ] Perfil esquerdo: crânio posterior reduzido, testa reta, base nasal projetada, boca discreta, mandíbula/queixo.
- [ ] Perfil direito: espelhamento do perfil esquerdo, aurícula anatomicamente legível.
- [ ] 3/4 esquerdo: quebra do plano malar, convergência facial lateral, gônio e orelha não flutuantes.
- [ ] 3/4 direito: mesmos critérios com simetria.
- [ ] 3/4 posterior: curva occipital, orelha e ECM coerentes.
- [ ] Traseira: pescoço mais estreito, arco occipital sem tampa reta.
- [ ] Top-down: largura parietal, orelhas, linha frontal e pescoço.
- [ ] Bottom-up: base do nariz, maxila, mento quase pontudo, plano submentoniano.
- [ ] Roll 15/30/45°, pitch ±55°: anatomia preservada sem trucagem por câmera.
- [ ] Cor e line art: hierarquia de linha, preenchimento e visibilidade dos planos conforme as referências.
- [ ] Diferentes biotipos e parâmetros extremos: nenhuma orelha atravessando face/pescoço, nenhuma autointerseção evidente.

## Atlas lado a lado

```bash
cd geomannequin
npm run comparar:cabeca-v4-1
npm run atlas:cabeca-v4-1 -- masculino medio
npm run atlas:cabeca-v4-1 -- feminino medio
```

Geram, respectivamente:
- `testes/saida/cabeca-v4-1/comparativo-cranio-queixo-v4-v41.svg`
- `testes/saida/cabeca-v4/masculino-medio-3x3.svg`
- `testes/saida/cabeca-v4/feminino-medio-3x3.svg`

**Atenção:** a V4 inicial no comparativo é reconstruída por controles geométricos zerados da V4.1; não é um snapshot visual imutável do commit antigo. Em ambas as linhas a orelha é do módulo V4.1. A comparação serve especificamente para crânio e queixo.

Somente marcar como aprovada a V4.1 após inspecionar o SVG real e o projeto rodando no navegador, com a V3 ainda disponível.
