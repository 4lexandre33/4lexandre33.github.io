# GeoMannequin — Preensão V3: implementação, comandos, testes e limites

**Atualização:** 10/11/2026. **Branch:** `feat/geomannequin-grip-v3-hardening-20261110`.
**DAG original:** [239 tarefas / 20 fases](./task-graph-preensao-rigida-cadeira-objetos-v3-20261110.md).

## Já existente no main antes desta revisão

- Ancoragem rígida 6DOF (`T_WO = T_WH × T_HO`) com matrizes de rotação e translação;
- GripSites nomeados em cadeiras (encosto, lados, assento), caixas e cilindros;
- Atualização ao mover ombro, cotovelo, punho ou raiz do manequim;
- API `m.segurar`, `m.soltar`, `cena.segurarObjeto`, `cena.soltarObjeto`;
- Segunda mão como observação, suporte a filhos `sobreRel`, serialização JSON;
- Contact V2 experimental e testes iniciais de Grip V3.

## Implementado nesta PR

| Área | Alteração | Limite atual |
|---|---|---|
| Encaixar | `modo:"encaixar"` move a **palma** por IK até GripSite, sem teleportar a cadeira | IK geométrica aproximada; falha se inalcançável |
| Vínculo primário | Posição/rotação completas do objeto seguem o quadro 3D da mão | Sem resistência física à massa |
| Duas mãos | A secundária segue o GripSite; `exigirContato:true` rejeita pega inviável | Não há solução bilateral exata de seis restrições |
| Transferência | `cena.transferirMaoPrincipal` troca braço controlador sem salto | Apenas um braço governa a pose por vez |
| Exclusividade | Uma mão não pode conduzir dois objetos ao mesmo tempo | Vínculos entre múltiplos manequins ainda não suportados |
| Apoio | `pousar` preserva inclinação; `chao` endireita conforme geometria | Contato geométrico, sem solver de torque |
| Queda | `modo:"queda"` inicia gravidade com passo explícito ou animação pela UI | Física discreta aproximada, não Rapier/rigid body real |
| Colisões | Chão, objetos OBB/cilindros conservadores e outros manequins (proxy) | CCD discreta com subpassos, não malha exata |
| Transporte | Varredura Contact V2 mais densa para cadeiras grandes e giro de ±180° | Contact V2 precisa estar ativado em modo bloquear/corrigir |
| Suporte | Descendentes `sobreRel` seguem o pai; não colidem internamente com ele | Filhos apoiados são tratados como presos, não deslizam |
| Persistência | Estado de queda e pose 6DOF salvos/restaurados em JSON | Velocidades de outros motores físicos não são importadas |
| Interface | Captura, troca de mão principal, soltar, pousar e animar queda | Interface utiliza callbacks de animação do navegador |
| Testes | Arquivos `grip-v3-se3`, `grip-v3-cadeira`, `grip-v3-regressoes`, `grip-v3-fisica` e `grip-v3-duas-maos` | CI da PR ainda sem execução válida |
| Visual | `testes/atlas-grip-v3.mjs` gera atlas SVG 3×3 do motor real | Geração e revisão visual dependem de execução local |

### Unidades e comportamento da física

- Distância: `R`, aproximadamente 11,4 cm por unidade.
- Tempo: segundos. `gravidade=86` em `R/s²`, aproximadamente `9,8 m/s²`.
- Parâmetros `restituicao` e `atrito`: de 0 a 1.
- Velocidade linear: vetor `[vx,vy,vz]` em `R/s`.
- Velocidade angular: vetor em graus/segundo, aplicado como rotação local.
- Atualização por subpassos adaptativos: não equivale a dinâmica contínua de corpo rígido.
- Após `soltar(...,{modo:"queda"})`, use `cena.avancarFisica(dt)` ou o botão **Animar queda com gravidade**. A animação de UI usa `requestAnimationFrame`.
- O manequim que soltou o objeto é ignorado no teste de colisão da queda para evitar falso bloqueio imediato na palma. Colisões com outros manequins continuam sendo verificadas.

## Exemplo: agarrar, transferir, levantar e deixar cair

```js
const m = cena.ativo;
const cadeira = cena.objeto("cadeira", {nome:"Cadeira 1",x:0,z:0});
log(cadeira.pontosDeAgarre());

cena.segurarObjeto("Cadeira 1", {
  mao:"direita",ponto:"encostoTopo",modo:"encaixar",reach:5
});
m.parametro("armFlexR",45);
m.parametro("elbowR",70);

// Opcional: pegar a mesma cadeira com a outra mão:
cena.segurarObjeto("Cadeira 1", {
  mao:"esquerda",ponto:"encostoEsquerdo",
  segunda:true,reach:5,exigirContato:true
});
// Transferir condução para a mão esquerda:
cena.transferirMaoPrincipal("Cadeira 1",{mao:"esquerda"});
log(cena.inspecionarPreensao());

// Soltar todas as mãos e simular gravidade:
cena.soltarObjeto("Cadeira 1",{modo:"queda",restituicao:0.15});
const resultado=cena.simularQueda({duracao:3,passo:1/60});
log(resultado.ultimo);
log(cadeira.pose3D());
```

O modo de encaixe e a segunda mão podem falhar, corretamente, se não alcançarem o
GripSite. Recomenda-se posicionar a cadeira ao alcance real do corpo antes da captura.

### Comandos complementares

```js
cena.vinculos();                         // vínculos ativos
cena.inspecionarPreensao();             // desvio de preensão
cadeira.pontosDeAgarre();              // lista locais reais de pega
cadeira.pousar({endireitar:false});     // objeto livre: pousar inclinado
cadeira.cair({velocidade:[0,3,0]});     // objeto livre: iniciar queda
cena.avancarFisica(1/60);              // avançar um quadro por código
cadeira.fisica();                       // estado de movimento/contato
cadeira.pararQueda();                  // desativar dinâmica
```

## O que permanece pendente no DAG de 239 tarefas

1. Solver bilateral exato, incluindo orientação completa de ambas as palmas,
   limites anatômicos conjuntos e resposta com força/torque.
2. Solucionador físico contínuo com gravidade/atrito/torque, quique e repouso
   estável sob múltiplos contatos simultâneos.
3. CCD analítica e colisão detalhada de malhas para todos os pares, sem tunneling.
4. Dois ou mais manequins portando o mesmo móvel com sincronização entre corpos.
5. Dedos realmente abraçando a superfície com forças e contato detalhado.
6. Objetos apoiados que podem escorregar ou cair individualmente enquanto
   a cadeira é movida, e pessoas sentadas acompanhando suporte dinâmico.
7. Validação da performance, atlas visual renderizado e revisado, testes
   automatizados executados no projeto e cobertura total das 239 tarefas.

## Validação desta revisão

- Sintaxe dos módulos JavaScript alterados conferida por análise em V8.
- A lógica do novo motor de queda foi executada em teste isolado com dependências
  simplificadas: chão, bloqueio de mesa, bloqueio de outro manequim e limites.
- **A execução nativa integrada ainda não foi confirmada.** Os workflows
  do GitHub Actions retornaram `failure` muito rapidamente, sem etapas ou
  logs úteis disponíveis; outras workflows da mesma PR apresentaram o mesmo padrão.
- Não mesclar a PR na `main` sem executar o conjunto abaixo em Node 22:

```sh
cd geomannequin
npm ci
npm ci --prefix mcp
npm run testar:grip-v3
npm run construir
node testes/atlas-grip-v3.mjs
```

Esta PR amplia substancialmente a preensão geométrica e adiciona dinâmica
determinística aproximada, mas **não conclui as 239 tarefas nem equivale a um
motor de física completo**.
