# GeoMannequin — Grip V3: implementação e pendências

**Data:** 10/11/2026  
**Branch de revisão:** `feat/geomannequin-grip-v3-hardening-20261110`  
**Plano de referência:** [Task Graph original, 239 tarefas](./task-graph-preensao-rigida-cadeira-objetos-v3-20261110.md).

## Já presente em `main` antes desta revisão

- Pose 6DOF por matriz de rotação 3×3 e posição, com composição/inversão;
- Frame mundial da palma e GripSites nomeados na cadeira, caixa, copo e outros objetos;
- Grip V3 primário, seguindo braço e punho com pose rígida;
- Segundo vínculo observacional, serialização JSON e objetos apoiados sobre a cadeira;
- Contato V2 experimental, com aproximações de cápsulas e sólidos;
- `cena.segurarObjeto`, `cena.soltarObjeto`, `m.segurar`, `m.soltar`,
  `obj.pontosDeAgarre`, `cena.vinculos`, `cena.inspecionarPreensao`.

## Alterado nesta branch

1. `modo:"encaixar"` não translada mais a cadeira: aproxima a palma ao GripSite por IK.
   A captura falha, com restauração dos parâmetros, se o ponto for inacessível.
2. O refinamento IK passa a visar o centro da palma, corrigindo o desvio do alvo
   do solver legado que mirava no punho.
3. Para duas mãos, a primária determina a transformação do objeto; a secundária
   tenta seguir o seu GripSite por IK. O desvio fica disponível em
   `cena.inspecionarPreensao()`. Se `exigirContato:true`, a adição da
   segunda mão falha e desfaz a tentativa caso não alcance a tolerância de 0,35 R.
4. Uma mão não pode segurar simultaneamente dois objetos diferentes.
5. `modo:"pousar"` preserva a rotação 3D e coloca a menor altura da geometria
   transformada no piso. `modo:"chao"` endireita. `modo:"queda"`
   é uma aterrissagem cinemática INSTANTÂNEA, não um simulador de gravidade.
6. `obj.pousar({endireitar:false})` pousa um objeto já solto.
7. A verificação hipotética de colisões evita modificar os ângulos da mão
   secundária ao atualizar o objeto candidato.
8. Painel visual passou a usar a mesma API do editor; ganhou opção de
   captura e todos os modos de soltura.
9. Regressões em `testes/grip-v3-regressoes.mjs` foram adicionadas ao
   `npm run testar:grip-v3` e à workflow existente.

## Exemplo de uso no editor

```js
const boneco = cena.ativo;
const cadeira = cena.objeto("cadeira",{nome:"Cadeira 1",x:0,z:0});
log(cadeira.pontosDeAgarre());

// Coloque a mão no encosto (sem mover o objeto).
const retorno = cena.segurarObjeto("Cadeira 1",{
  mao:"direita",ponto:"encostoTopo",modo:"encaixar",reach:5
});
boneco.parametro("armFlexR",35);
boneco.parametro("elbowR",70);

// Para inspecionar a transformação e a restrição da mão secundária:
log(cena.inspecionarPreensao());
// Liberação mantendo altura/rotação:
cena.soltarObjeto("Cadeira 1",{modo:"manter"});
// Ou pousar o sólido inclinado:
cadeira.pousar({endireitar:false});
```

Observação: esse exemplo depende da cadeira estar ao alcance do braço do
manequim. O IK falha explicitamente quando não alcança o GripSite.

## Ainda não considerado concluído no DAG de 239 tarefas

- Solução de restrições bilateral **exata** de duas mãos com ajuste da mão
  primária e secundária e rollback global em todas as operações de pose;
- Colisões contínuas (CCD analítica/exata) de cadeiras transportadas;
- Contato de dedos com todas as superfícies reais de preensão;
- Simulação dinâmica de peso, gravidade, atrito, torque e impacto;
- Colisões perfeitas de malha (o sistema atual usa proxies);
- Dois manequins carregando o mesmo objeto com restrições compartilhadas;
- Manipulação dinâmica de cadeiras, corpos sentados e suportes não rígidos;
- Interpolação física da soltura, quique, rotação e atrito ao tocar o chão;
- Benchmark completo, cobertura visual de todo o DAG e liberação de produção.

**Estado de validação:** CI da PR foi acionada, porém o GitHub Actions
registrou falha antes de apresentar passos/logs úteis. Não há teste executado
confirmado nesta revisão. Para testar num checkout com Node 22:

```bash
cd geomannequin
npm ci
npm ci --prefix mcp
npm run testar:grip-v3
npm run construir
```

Esta implementação amplia a preensão cinemática V3; não deve ser descrita como
execução de todas as 239 tarefas do plano nem como física realista completa.
