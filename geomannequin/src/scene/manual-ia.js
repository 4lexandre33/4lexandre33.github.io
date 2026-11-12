/* GeoMannequin — manual completo para uma IA fazer poses (Gemini, ChatGPT, Claude, qualquer uma), mesmo sem MCP.
   Gerado a partir do próprio código: os nomes, as faixas e a lista de poses nunca ficam desatualizados.
   Use junto com o estado da cena (estado-ia.js): o manual ensina; o estado diz como o manequim está agora. */
import { SL, POSEKEYS } from "./parametros.js";
import { POSE_GRUPOS, NOMES_EXPRESSOES, BPOSES, EXPRESSOES } from "./poses.js";
import { GRUPOS_ROSTO, chavesRosto, chavesFormato } from "./rosto-codigo.js";
import { REF } from "./ajuda.js";
import { iaControle, estadoParaIA } from "./estado-ia.js";
import { GESTOS, AU, CATALOGO, CATEGORIAS, PARTES_EFEITO, MODELOS_CABECA } from "../engine/index.js";

const MAN_GRUPOS = [
  ["Corpo inteiro (no chão, deitar, saltar)", k => /^(bodyPitch|bodyRoll|bodyLift|ground)$/.test(k)],
  ["Coluna e pelve", k => /^(spine|pelvis|lum|tho)/.test(k)],
  ["Cabeça e pescoço", k => /^(head|neck)/.test(k)],
  ["Ombros e escápulas", k => /^(shElev|shProt|shTens|scapRot)/.test(k)],
  ["Braços e cotovelos", k => /^(armAbd|armFlex|armRot|elbow)/.test(k)],
  ["Antebraço, punho e mão", k => /^(pron|wrist|handCurl)/.test(k)],
  ["Dedos da mão (geral)", k => /^(fTh|fIn|fMe|fAn|fMi|fSpread|thumbOpp)[LR]$/.test(k)],
  ["Pernas e joelhos", k => /^(hipFlex|hipAbd|hipRot|kneeFlex|tibiaRot)/.test(k)],
  ["Tornozelos e pés", k => /^(ankle|toes|hallux|footAdd)/.test(k)]
];
const MAN_POSE_NOTAS = {
  empe: "neutra, braços ao lado", contrapposto: "peso numa perna, quadril e ombros em oposição", caminhando: "passo de caminhada", correndo: "corrida", socando: "soco direto do braço de trás (palma para baixo)",
  chutando: "chute frontal alto", guardaLuta: "guarda de boxe, punhos no queixo", jab: "soco rápido do braço da frente", direto: "soco cruzado do braço de trás, girando o quadril", gancho: "gancho do braço da frente (antebraço na horizontal)",
  uppercut: "soco de baixo para cima", socoParaCima: "salto com o punho para o céu", cotovelada: "golpe de cotovelo na horizontal", joelhada: "joelho para cima, mãos puxando", chuteLateral: "chute de lado com o tronco tombado para o outro lado",
  chuteAlto: "chute circular alto", chuteGiratorio: "chute para trás com o corpo inclinado à frente", chuteVoador: "voadora no ar", rasteira: "agachado baixo varrendo com a perna esticada", palma: "golpe de palma do braço de trás",
  palmaDupla: "as duas palmas à frente (rajada / kamehameha)", defesaCruzada: "antebraços cruzados na frente do rosto", aterrissagemHeroi: "um joelho no chão, punho no chão, outro braço para trás", investida: "corrida inclinada com os braços para trás",
  esquiva: "desvio de boxe: abaixa e inclina o tronco para o lado, guarda alta", provocando: "chamando para a luta com a mão", golpeRosto: "cabeça jogada para trás pelo soco", golpeEstomago: "dobrado de dor", recuando: "dando um passo para trás com as mãos à frente",
  atordoado: "joelhos moles, cabeça tombada", arremessadoCostas: "voando de costas depois do golpe", atravessandoParede: "voando para trás encolhido", girandoNoAr: "corpo de cabeça para baixo girando", deCabecaParaBaixo: "caindo de cabeça",
  caindoDeCostas: "no instante de bater as costas", rolando: "encolhido em bola de lado", deslizandoSentado: "sentado deslizando, mãos atrás", estatelado: "deitado de costas, braços e pernas abertos", levantandoDeQuatro: "levantando, um joelho e uma mão no chão",
  ajoelhadoFerido: "ajoelhado, uma mão no chão e outra no peito", concentrando: "punhos perto do peito, cabeça baixa", baseGritando: "base larga (cavalo), punhos ao lado, cabeça para trás", agachadoCerrando: "agachado tenso, punhos à frente",
  bracosCruzadosPeito: "braços cruzados em X no peito", maosEmPrece: "palmas juntas no peito", esferaDeLado: "mãos em concha no quadril de trás (carregando a rajada)", bracoAosCeus: "um punho para o céu", cargaDuasMaos: "as duas mãos acima da cabeça (esfera gigante)",
  bracosAbertosLevitando: "flutuando com os braços abertos e palmas para cima", lotusFlutuando: "pernas cruzadas flutuando", joelhoMaoNoChao: "um joelho e uma mão no chão, cabeça baixa", saltoLongo: "salto com pernas e braços à frente",
  saltoSobreCaixa: "apoio de uma mão, pernas de lado (vault)", subindoDegrau: "pé alto num degrau", desviando: "passo lateral protegendo a cabeça", escalando: "uma mão no alto, um joelho para cima", vitoria: "punho erguido comemorando",
  frente: "tronco inclinado à frente", torcao: "tronco girado", passo: "passo largo", joelho: "joelho elevado", ponta: "na ponta dos pés", erguido: "um braço erguido", alcancar: "braço esticado alcançando à frente",
  lateral: "tronco inclinado para o lado, braço por cima", agachar: "agachado", cintura: "mão na cintura (cinemática inversa)", cruzar: "braço cruzado no peito", ombro: "mão no ombro oposto",
  apontando: "apontando com o indicador", acenando: "acenando", carregando: "carregando algo com as duas mãos", empurrando: "empurrando com as duas palmas", pensando: "mão no queixo", encostado: "encostado numa parede, uma perna dobrada",
  alongando: "braços esticados para cima", sentado: "sentado (numa cadeira imaginária)", pernasEsticadas: "sentado no chão com pernas esticadas e mãos atrás", abracandoJoelhos: "sentado abraçando os joelhos",
  apoiadoCotovelos: "de bruços apoiado nos cotovelos", sentadoCalcanhares: "ajoelhado sentado nos calcanhares", cocoras: "de cócoras", engatinhando: "de quatro engatinhando", agachamentoProfundo: "agachamento profundo",
  prancha: "prancha (mãos e pés no chão)", quatroApoios: "mãos e joelhos no chão", impulso: "agachado tomando impulso para saltar", saltando: "no ar, braços para cima", aterrissando: "aterrissando com joelhos dobrados", caindo: "caindo para trás",
  paradaDeMao: "parada de mão", ponte: "ponte", ponteUmaPerna: "ponte com uma perna no alto", paradaAbertura: "parada de mão com as pernas abertas", escorpiao: "escorpião", arabesque: "arabesque de balé", espacateSaltado: "salto em espacate", camelo: "camelo (ajoelhado, arco para trás)",
  sentadoChao: "sentado de pernas cruzadas", meditando: "pernas cruzadas, mãos nos joelhos", umJoelho: "um joelho no chão", ajoelhado: "dois joelhos no chão", deitadoCostas: "deitado de costas", deBrucos: "de bruços", deitadoLado: "deitado de lado"
};
const BPOSES_LISTA_F = () => Object.keys(BPOSES).concat(["cintura", "cruzar", "ombro"]);
const manLinhaControle = k => {
  const c = iaControle(k), d = SL.find(q => q.k === k), u = d && d.u ? d.u.trim() : "";
  let s = "- `" + c.nome + "`" + (c.nome !== k ? " (= `" + k + "`)" : "") + ": " + (d ? d.min + " a " + d.max + (u ? " " + u : "") : "") + " — " + (d ? d.label : "");
  if (c.negativo || c.positivo) s += ". " + (c.negativo ? "Negativo: " + c.negativo + ". " : "") + (c.positivo ? "Positivo: " + c.positivo + "." : "");
  return s;
};
/* o que {lado} escolhe em cada pose (padrão: "esq") */
const MAN_LADO = {
  guardaLuta: "o pé e o braço da FRENTE (lado: \"esq\" = guarda com o pé esquerdo à frente)", jab: "o braço que soca e o pé da frente (os dois do mesmo lado)", direto: "o pé da frente; o soco sai com o braço do OUTRO lado (o de trás)",
  gancho: "o braço que dá o gancho e o pé da frente", uppercut: "o pé da frente; o uppercut sai com o braço de trás", cotovelada: "o pé da frente; a cotovelada sai com o braço de trás", palma: "o pé da frente; a palma sai com o braço de trás",
  provocando: "a mão que chama e o pé da frente", joelhada: "o joelho que sobe", chutando: "a perna que chuta", chuteLateral: "a perna que chuta", chuteAlto: "a perna que chuta", chuteGiratorio: "a perna que chuta",
  chuteVoador: "a perna esticada", rasteira: "a perna que varre (esticada)", socando: "o braço de guarda; o soco sai com o braço do OUTRO lado", socoParaCima: "a perna dobrada; o punho que sobe é o do outro lado",
  aterrissagemHeroi: "o pé plantado à frente; o punho no chão é o do outro lado", investida: "a perna da frente", palmaDupla: "a perna da frente", esquiva: "o pé da frente; \"esq\" desvia inclinando o tronco para a direita dele (\"dir\": para a esquerda)",
  umJoelho: "o pé da frente (o outro joelho vai ao chão)", correndo: "a perna que vai à frente", apontando: "o braço OUTRO aponta (lado = lado oposto ao que aponta)", acenando: "o braço OUTRO acena",
  pensando: "o braço de apoio; a mão no queixo é a do outro lado", esferaDeLado: "o pé da frente; a energia fica no quadril do outro lado", bracoAosCeus: "o braço que sobe", vitoria: "o braço que sobe",
  levantandoDeQuatro: "o pé plantado; a mão no chão é a do outro lado", joelhoMaoNoChao: "o pé plantado; a mão no chão é a do outro lado", ajoelhadoFerido: "a mão no peito; a outra vai ao chão",
  saltoSobreCaixa: "a mão que apoia", subindoDegrau: "o pé que sobe", desviando: "o lado para onde dá o passo", escalando: "a perna que sobe; a mão no alto é a do outro lado"
};
/* ---------- capítulo do rosto: tudo para ler, ajustar e CRIAR um rosto novo ---------- */
const manNumR = v => String(Math.round(v * 100) / 100);
function manLinhaRosto(k) {
  const c = iaControle(k), d = SL.find(q => q.k === k);
  let s = "- `" + c.nome + "`" + (c.nome !== k ? " (`" + k + "`)" : "") + ": " + (d ? manNumR(d.min) + " a " + manNumR(d.max) : "");
  if (c.negativo && c.positivo) s += ". **−** " + c.negativo + "; **+** " + c.positivo + ".";
  else if (c.positivo) s += ". " + c.positivo.charAt(0).toUpperCase() + c.positivo.slice(1) + ".";
  else if (d) s += ". " + d.label + ".";
  return s;
}
function manReceita(nome) {
  const v = EXPRESSOES[nome]; if (!v) return "";
  const pares = chavesRosto().filter(k => Math.abs(v[k] || 0) > 1e-4).map(k => iaControle(k).nome + ": " + manNumR(v[k]));
  return "- `" + nome + "` (" + NOMES_EXPRESSOES[nome] + "): " + (pares.length ? "`" + pares.join(", ") + "`" : "tudo 0");
}
function manualRosto(add) {
  add("## 8. Rosto e expressões (inclusive rostos NOVOS)");
  add("O rosto é independente da pose do corpo. Há três jeitos de mexer nele, do mais rápido ao mais preciso:");
  add("1. **Expressão pronta** (com intensidade 0–1,5): `m.expressao(\"raiva\")`, `m.expressao(\"tristeza\", 0.6)`.");
  add("2. **Mistura** de duas ou mais (prontas ou guardadas): `m.expressao(\"60% raiva + 40% medo\")` ou `m.expressao({raiva: 0.6, medo: 0.4})`.");
  add("3. **Rosto por código** (controle a controle): `m.aplicarRosto('rosto({ sorriso: 0.4, palpebraBaixoEsq: 0.5 })')`. É assim que se cria um rosto que não existe na lista.");
  add("");
  add("### 8.1 O código do rosto");
  add("```js\nrosto(\"Sorriso cínico\", {\n  // boca e mandíbula\n  sorriso: 0.15, cantoBocaEsq: 0.6, cantoBocaDir: -0.2,\n  // olhos e pálpebras\n  palpebraBaixoEsq: 0.4,\n  // sobrancelhas\n  sobrancelhaForaEsq: 0.5, franzir: 0.2,\n}, { formato: { eyeSize: 1.1 }, cabeca: \"v5\" });\n```");
  add("- O nome (1º argumento) é opcional; serve para guardar. O 1º bloco `{…}` é a **expressão**; o 2º bloco é **opcional**: `formato` (feições do personagem, seção 8.6) e `cabeca` (modelo, seção 8.7).");
  add("- **O rosto é COMPLETO**: tudo que não aparece no código volta a 0 (neutro). Assim o mesmo código sempre dá o mesmo rosto. Não precisa escrever controles em 0.");
  add("- **Valores são absolutos**, não somam. `sorriso: 0.4` duas vezes continua 0.4.");
  add("- Só números (ponto decimal), nomes da lista abaixo (em português ou a chave interna). Comentários `//` são permitidos. Nome errado = erro com o nome que falhou.");
  add("- Onde usar o código: no app (painel **Código do rosto e Minhas expressões**, colar → Aplicar), no editor de comandos (`m.aplicarRosto('rosto({ … })')`), via MCP (ferramenta `rosto`, acao `aplicar_codigo`). O **código da pose** também leva o rosto (grupo `rosto`), então copiar a pose copia a expressão junto.");
  add("- Ajuste fino sem zerar o resto: `m.rosto({ palpebraEsq: 1 })` muda só esses controles e mantém o resto do rosto atual. `m.piscar(\"esq\")` fecha um olho.");
  add("");
  add("### 8.2 Lados e direções (medido no desenho)");
  add("- **Esq/Dir são do MANEQUIM**, não da tela. Com o manequim de frente para você, o lado ESQUERDO dele aparece à DIREITA da imagem. `cantoBocaEsq` sobe o canto que você vê à direita.");
  add("- `olharLado` + = os olhos vão para a esquerda DO MANEQUIM (sua direita, se ele está de frente). `olharCima` + = para cima. Para olhar para alguém, prefira virar a cabeça (`cabecaGirar`) e use o olhar para o resto.");
  add("- Controles gerais (`sorriso`, `palpebras`, `sobrancelhas`, `franzir`) valem para os dois lados. Os de lado **somam** por cima e o total é cortado na faixa: canto da boca = `sorriso + cantoBoca*` (−1 a 1); pálpebra de cima = `palpebras + palpebra*` (0 a 1). Ex.: `sorriso: 0.3, cantoBocaDir: -0.5` dá um sorriso torto. As pontas das sobrancelhas (`sobrancelhaDentro*`, `sobrancelhaFora*`) se somam ao desenho de `sobrancelhas`/`franzir`.");
  add("- **A cabeça não faz parte do rosto.** Virar, inclinar ou abaixar a cabeça (`cabecaGirar`, `cabecaInclinar`, `cabecaLado`, `pescoco*`) são controles da POSE: use `m.pose({ cabecaGirar: -30 })` (− = para a direita do manequim, + = para a esquerda). Eles vão no código da pose, não no `rosto(...)`. Para “olhar para alguém à direita dele”: `cabecaGirar` negativo + `olharLado` negativo.");
  add("- Olhos **arregalados**: não há valor abaixo de 0 em `palpebras`; use `palpebras: 0` + `sobrancelhas: 0.3–0.6` e, para exagerar, a feição `eyeOpen: 1.2–1.4` no bloco `formato`. Olhar **fulminante**: `palpebraBaixo*: 0.4–0.6` + `sobrancelhas` negativo + `franzir` positivo.");
  add("- Mandíbula **travada**/boca fechada com força: `labiosApertar` (0.6–1). `dentesCerrados` é OUTRA coisa: abre os lábios e mostra os dentes juntos (rosnar, dor); não use os dois juntos no máximo.");
  add("");
  add("### 8.3 Todos os controles do rosto (faixa e sinal)");
  for (const [titulo, f] of GRUPOS_ROSTO) { const ks = chavesRosto().filter(f); if (!ks.length) continue; add("**" + titulo.charAt(0).toUpperCase() + titulo.slice(1) + "**"); ks.forEach(k => add(manLinhaRosto(k))); }
  add("- Faixas: 0 a 1 = de nada a máximo; −1 a 1 = os dois sentidos. Valores fora são cortados.");
  add("");
  add("### 8.4 Receitas: os valores de cada expressão pronta");
  add("Use como ponto de partida para um rosto novo (copie, mude 1–3 números). Valores com intensidade 1:");
  Object.keys(EXPRESSOES).filter(n => n !== "neutra").forEach(n => add(manReceita(n)));
  add("");
  add("### 8.5 Como CRIAR um rosto novo (passo a passo)");
  add("1. **Descreva a emoção em partes**: boca (cantos, abertura, lábios), olhos (pálpebras de cima e de baixo, olhar), sobrancelhas (ponta de dentro, ponta de fora, franzir), bochechas/nariz, estado (corar, lágrimas).");
  add("2. **Parta da expressão mais parecida** (8.4) ou de uma mistura. Ex.: “esperança tímida” = `alivio` com o olhar para baixo e corado: `bocaAbrir: 0.05, sorriso: 0.3, palpebras: 0.3, franzir: -0.4, olharCima: -0.3, corar: 0.4`.");
  add("3. **Regras de leitura** (o que o olho de quem vê entende):");
  add("   - Sorriso VERDADEIRO sobe bochechas e pálpebras de baixo (`bochecha*: 0.5`, `palpebraBaixo*: 0.3`); sorriso só com a boca parece educado ou falso.");
  add("   - Tristeza/medo/aflição = ponta de DENTRO da sobrancelha para cima (`franzir` negativo ou `sobrancelhaDentro*` +). Raiva = sobrancelhas juntas e baixas (`franzir` +, `sobrancelhas` −).");
  add("   - Surpresa = sobrancelhas para cima + boca aberta, pálpebras bem abertas (`palpebras: 0`). Medo = surpresa + aflição + cantos para baixo.");
  add("   - Desprezo e ironia são ASSIMÉTRICOS: um canto só (`cantoBocaEsq: 0.6`), uma sobrancelha só.");
  add("   - Nojo = nariz franzido + lábio de cima subindo (`narizFranzir`, `labioCima*`). Determinação = `labiosApertar` + `franzir` leve + pálpebra de baixo.");
  add("   - Intensidade: 0.3 sutil, 0.6 claro, 1 forte, acima de 1 só para mangá/cartum.");
  add("4. **Aplique e confira**: `m.aplicarRosto('rosto({ … })')`, depois `m.estadoIA()` (seção Rosto: cada controle fora do neutro e a expressão pronta mais parecida). Corrija só os números que precisa.");
  add("5. **Guarde com um nome**: `m.guardarRosto(\"Sorriso cínico\")` (ou no app: nome → Guardar). Daí em diante `m.expressao(\"Sorriso cínico\", 0.7)` funciona, entra nas misturas (`\"50% Sorriso cínico + 50% raiva\"`) e aparece como botão. `{formato: true}` guarda também as feições e a cabeça.");
  add("6. **Compartilhe**: `m.rostoCodigo()` devolve o código do rosto atual; `cena.expressoes.exportar()` devolve todas as guardadas; `cena.expressoes.importar(texto)` lê um ou vários `rosto(...)`.");
  add("- Comandos de Minhas expressões: `cena.expressoes.lista()`, `.salvar(nome, {manequim, valores, formato, substituir})`, `.aplicar(nome, {manequim, intensidade, formato})`, `.codigo(nome)`, `.apagar(nome)`, `.parecida(manequim)`. Nomes de expressões prontas não podem ser usados.");
  add("");
  add("- Formato e cabeça são opcionais: sem o 2º bloco o personagem fica como está. Para um rosto que deve funcionar em qualquer personagem, **não** inclua formato.");
  add("");
  add("### 8.6 Formato do rosto (feições do personagem, não é expressão)");
  add("Vai no 2º bloco: `rosto({...}, { formato: { eyeSize: 1.2, nose: 0.3 } })`. Muda o personagem, não a emoção. Por código o formato vem junto (`{formato: false}` ignora); no painel do app só vale com “incluir formato” marcado.");
  chavesFormato().forEach(k => { const d = SL.find(q => q.k === k); add("- `" + iaControle(k).nome + "`" + (iaControle(k).nome !== k ? " (`" + k + "`)" : "") + ": " + manNumR(d.min) + " a " + manNumR(d.max) + " — " + d.label + "."); });
  add("");
  add("### 8.7 Modelos de cabeça (o que aparece em cada um)");
  MODELOS_CABECA.forEach(([k, nome]) => add("- `" + k.replace(/_.*/, "") + "`: " + nome + "."));
  add("- `corar`, `lagrimas`, `olheiras` e `narizFranzir` **só aparecem na cabeça V5** (anime). `dentesCerrados` aparece melhor na V5. Nas outras cabeças use sobrancelhas, pálpebras e boca para passar a emoção. Troque com `m.cabeca(\"v5\")` ou `cabeca: \"v5\"` no código do rosto.");
  add("- A V5 exagera a expressão (feição `v5Exagero`) e aumenta olhos e boca (`v5Olhos`, `v5Boca`); os mesmos números parecem mais fortes nela.");
  add("");
}
function manualPosesIA(opts = {}) {
  const L = [], add = t => L.push(t);
  add("# Manual do GeoMannequin para IA: como fazer qualquer pose");
  add("Este manual serve para qualquer IA (Gemini, ChatGPT, Claude…) montar e corrigir poses no GeoMannequin, um manequim anatômico 3D desenhado em SVG, controlado por código JavaScript em português. Não precisa de MCP: a IA responde com código; a pessoa cola no editor “Comandos da cena” do site e clica em Executar.\n");
  add("## 0. Regras para a IA (leia primeiro)");
  add("1. Você vai receber: este manual, o **ESTADO DA CENA** (texto e JSON com cada controle e o que cada parte do corpo está fazendo), uma **imagem** da cena (opcional) e o **pedido** da pessoa.");
  add("2. Responda com **um único bloco de código** ```js ... ``` com comandos do GeoMannequin. Antes do bloco, no máximo 2 frases dizendo o que vai mudar. Não invente comandos: use só os deste manual.");
  add("3. Comece por uma pose pronta parecida (`m.poseRapida(\"nome\")`) e ajuste poucos controles com `m.pose({...})`. Os valores são **absolutos** (graus ou 0–1), não somam ao valor atual. Controle que você não mencionar fica como está.");
  add("4. **Esquerda/direita são sempre do manequim**, não da imagem. De frente para a câmera, a mão esquerda dele aparece à DIREITA da imagem. Confira no estado: `naImagem.maoEsq` dá a posição na foto.");
  add("5. Depois que a pessoa executar, ela manda o novo estado (e a imagem). Compare com o pedido, parte por parte (tronco, cabeça, cada braço, cada perna, mãos), e corrija só o que estiver errado. Repita até ficar certo.");
  add("6. Para movimentos com contato (mão no quadril, mão na parede, sentar numa cadeira) prefira os comandos de contato (`m.maoEm`, `m.sentar`, `m.apoiar`) em vez de adivinhar ângulos.");
  add("7. Se o estado mostrar **partes atravessando** (autoColisoes), afaste o membro (abra o braço, gire o tronco) ou mude o ângulo.\n");
  add("## 1. Mundo, eixos, unidades e lados");
  add("- Eixo **y** para cima. O chão fica em y = 0 (o apoio no chão acerta a altura sozinho: `apoio: 1`).");
  add("- Na cena nova, o manequim olha para **+z** (para a câmera inicial). A **esquerda dele é +x** (aparece à direita da imagem).");
  add("- `m.girar(graus)`: 0 = olha para +z; 90 = olha para +x; 180 = de costas para a câmera inicial; −90 = olha para −x.");
  add("- Unidades: o manequim padrão tem ≈ 16,5 de altura (a cabeça ≈ 2,2). Posição no chão: `m.posicao(x, z)` de −30 a 30. Dois manequins lado a lado: ~6 de distância; frente a frente lutando: 6 a 9.");
  add("- Controles com **Esq/Dir** no nome (ou **L/R** na chave interna) são do lado esquerdo/direito do manequim.");
  add("- Em `poseRapida(nome, {lado: \"esq\" | \"dir\"})` o lado escolhe o membro principal (padrão: \"esq\"). O que ele escolhe em cada pose está na seção 5 (ex.: em `direto`, lado = pé da frente e o soco sai com o braço do outro lado).");
  add("- `corpoInclinar`, `corpoRolar` e `altura` giram/levantam o corpo inteiro (pernas juntas) em volta da pelve; depois o apoio no chão (`apoio: 1`, sempre ligado) baixa ou sobe o corpo até a parte mais baixa encostar no chão. Os braços e as pernas são medidos em relação ao tronco/pelve, não ao mundo: com o corpo inclinado, `bracoFrente: 90` continua \"à frente do peito\".\n");
  add("## 2. Comandos essenciais");
  add("```js");
  add("const m = cena.ativo;                       // manequim ativo (ou cena.obter(\"Ana\"))");
  add("const b = cena.adicionar({ nome: \"Leo\", x: 8, z: 0, giro: -90, corpo: \"atletico\" }); // novo manequim");
  add("m.poseRapida(\"guardaLuta\", { lado: \"dir\" }); // pose pronta (lista na seção 5)");
  add("m.pose({ bracoDirFrente: 90, cotoveloDir: 0, antebracoDirGirar: -80 }); // controles (seção 3), valores absolutos");
  add("m.gesto(\"dir\", \"punho\");                   // gesto pronto da mão (seção 4): \"esq\", \"dir\" ou \"ambas\"");
  add("m.expressao(\"raiva\", 1.2);                 // expressão (seção 8); mistura: m.expressao(\"60% raiva + 40% medo\")");
  add("m.olhar(\"câmera\");                          // ou \"cima\" (céu), \"baixo\", \"frente\", \"esquerda\", \"direita\", o nome de outro manequim (\"Leo\") ou um ponto [x, y, z]; vira cabeça e pescoço (e o tronco se passar de ±80°)");
  add("m.girar(-90).posicao(6, 0);                 // girar no chão e posicionar");
  add("m.inclinar(-90);                            // corpo inteiro: −90 deitado de costas, 90 de bruços (2º número = tombar de lado)");
  add("m.saltar(4);                                // salto com 4 de altura (ou m.pose({ altura: 4 }))");
  add("m.deitar(\"costas\" | \"bruços\" | \"lado\", \"x\" | \"-z\");  m.sentar(\"cadeira\");");
  add("m.maoEm(\"dir\", [x, y, z]);                   // leva a mão até um ponto do mundo (cinemática inversa)");
  add("m.apoiar(\"maos pes\");                        // leva ao chão ao mesmo tempo: \"maos\", \"pes\", \"joelhos\", \"mao esquerda\", \"pe direito\", \"joelho direito\"… (combine com espaço: \"maos joelhos\")");
  add("m.flexibilidade(2);                         // 0 normal, 1 atleta, 2 ginasta, 3 contorcionista (amplia os limites)");
  add("m.espelhar();                               // troca esquerda e direita da pose");
  add("log(m.validarPose());                       // partes atravessando e limites acoplados");
  add("log(m.codigoPose({ soMudancas: true }));     // a pose atual como código");
  add("camera.orbitar(\"Ana\", { azimute: \"3/4 esquerda\", elevacao: 10 }); camera.girar(30, 8); camera.enquadrar();");
  add("```\n");
  add("## 3. Todos os controles de pose");
  add("Use o nome em português em `m.pose({...})` (a chave interna em inglês também funciona). Faixa = limite humano no perfil normal (a flexibilidade amplia). Ângulos em graus; os marcados com % vão de 0 a 1 ou de −1 a 1.\n");
  const usados = new Set();
  for (const [titulo, f] of MAN_GRUPOS) {
    const ks = SL.map(d => d.k).filter(k => POSEKEYS.has(k) && f(k)); if (!ks.length) continue;
    add("### " + titulo); ks.forEach(k => { usados.add(k); add(manLinhaControle(k)); }); add("");
  }
  add("### Dedos (cada falange)");
  add("Cada dedo tem base (Mcp), meio/ponta (Ip) e afastar (Abd), de −1 a 1 (positivo dobra/afasta): `fInMcpL`, `fInIpL`, `fInAbdL` … para polegar (Th), indicador (In), médio (Me), anelar (An), mínimo (Mi), lados L e R. Prefira os gestos prontos.\n");
  add("### Posição e giro do manequim");
  add("- `m.posicao(x, z)`, `m.mover(dx, dz)`, `m.girar(graus)` (ou chaves `wx`, `wz`, `wRot`).\n");
  add("## 4. Mãos: gestos prontos");
  add("`m.gesto(lado, nome)` com nome: " + Object.keys(GESTOS).map(k => "`" + k + "`").join(", ") + ".");
  add("- Palma para baixo com o braço à frente: `antebraco…Girar: -80`. Palma para cima: `+80`. Polegar para cima (soco vertical): `0`.");
  add("- Palma para a frente, dedos para cima (empurrar, golpe de palma): `antebraco…Girar: -80` e `punho…: -70` (estender o punho), gesto `espalmada`.");
  add("- Punho fechado: gesto `punho` (ou `maoEsq: 1`). Mão relaxada: `relaxada`. Garra (energia): `garra`.\n");
  add("## 5. Biblioteca de poses prontas");
  add("Use `m.poseRapida(\"nome\", {lado})`. Cada pose escreve o corpo inteiro a partir do neutro; depois ajuste com `m.pose`. Sem `lado`, vale \"esq\".");
  add("As poses simples " + BPOSES_LISTA_F().map(k => "`" + k + "`").join(", ") + " não usam `lado`: para trocar os lados use `m.espelhar()` depois.\n");
  for (const [g, ks] of Object.entries(POSE_GRUPOS)) add("- **" + g + "**: " + ks.map(k => "`" + k + "`" + (MAN_POSE_NOTAS[k] || MAN_LADO[k] ? " (" + [MAN_POSE_NOTAS[k], MAN_LADO[k] && MAN_LADO[k] !== "—" ? "lado = " + MAN_LADO[k] : ""].filter(Boolean).join("; ") + ")" : "")).join(", ") + ".");
  add("");
  add("## 6. Receitas (valores que funcionam)");
  add("Valores para o lado esquerdo; troque Esq↔Dir para o outro lado. Comece da pose indicada e ajuste.");
  add("- **Em pé natural**: `contrapposto`. Peso numa perna: `pelveLado: 7, colunaLado: -9, coxaDirFrente: 12`.");
  add("- **Andar**: `caminhando`. A perna da frente: `coxaEsqFrente: 24, joelhoEsq: 6`; a de trás: `coxaDirFrente: -14, joelhoDir: 28`; braços em oposição: `bracoEsqFrente: -22, bracoDirFrente: 25`.");
  add("- **Correr**: `correndo` (coxa da frente 60, joelho 95; coxa de trás −25; cotovelos 90; tronco 12 à frente). Mais rápido: `corpoInclinar: 20`.");
  add("- **Guarda de luta**: `guardaLuta` (pé esquerdo à frente, punhos já fechados). Mão de guarda perto do queixo: `bracoFrente: 42, bracoAbrir: 14, cotovelo: 135` (a da frente: `Frente: 62, cotovelo: 105`). Soco reto: braço `Frente: 88–90, cotovelo: 0–5, antebraco…Girar: -80` (palma para baixo).");
  add("- **Girar o tronco para dentro do soco**: `colunaTorcao` positivo = o ombro DIREITO vai para a frente (use com soco de direita, ≈ +25); negativo = o ombro ESQUERDO vai para a frente (soco de esquerda, ≈ −20). Some `pelveTorcao` no mesmo sentido (±10).");
  add("- **Gancho**: `bracoEsqAbrir: 82, bracoEsqFrente: 22, cotoveloEsq: 95, bracoEsqGirar: 0`. **Uppercut**: braço `Frente: 60, cotovelo: 100, antebraco…Girar: +70` (palma para o rosto), joelhos 38.");
  add("- **Chute frontal**: `chutando` (coxa 88, joelho 8, tornozelo 35 = pé apontado).");
  add("- **Chute lateral** (`chuteLateral`): perna ESQUERDA: `corpoRolar: +36, coxaEsqAbrir: 45, joelhoEsq: 2, coxaDirAbrir: +30` (abrir a perna de apoio a deixa na vertical). Perna DIREITA: `poseRapida(\"chuteLateral\", {lado: \"dir\"})` = `corpoRolar: -36, coxaDirAbrir: 45, coxaEsqAbrir: +30`. Mais alto: aumente `corpoRolar` (até ±50) junto com a abertura da perna de apoio. Altura do pé ≈ altura do quadril com ±36; peito do adversário ≈ ±45.");
  add("- **Chute circular alto** (`chuteAlto`): `corpoRolar ±28, coxaFrente 82, coxaAbrir 45, coxaGirar -25` e a de apoio `Abrir +26`.");
  add("- **Mirar um alvo**: o chute/soco sai para o lado/frente do próprio manequim. Gire o manequim (`m.girar`) até o lado certo apontar para o alvo: para atingir quem está em +x com um chute lateral de DIREITA, a direita dele precisa apontar para +x → `m.girar(180)` (ele fica de costas para a câmera inicial). Então reposicione a câmera: `camera.orbitar(\"Ana\", {azimute: \"3/4 direita\", elevacao: 10})`. Ou use a outra perna.");
  add("- **Saltar / voar**: `altura` (bodyLift) 3–7. No ar o apoio no chão continua ligado: a altura é medida a partir do chão.");
  add("- **Deitar**: `corpoInclinar: -90` (de costas) ou `90` (de bruços); de lado: `corpoRolar: ±90`. Cabeça para baixo: `corpoInclinar: 160–180`.");
  add("- **Sentar no chão**: `sentadoChao` (pernas cruzadas: coxas `Frente 84, Abrir 30, Girar +45`, joelhos 145). Numa cadeira: `m.sentar(\"cadeira\")`.");
  add("- **Ajoelhar**: `ajoelhado` (dois joelhos) ou `umJoelho`. **Agachar**: `agachar` ou `agachamentoProfundo`.");
  add("- **Inclinar o tronco**: `colunaFrente` (+ à frente); muito: some `corpoInclinar` (o corpo todo gira na base).");
  add("- **Olhar**: `cabecaGirar` (+ para a esquerda dele), `cabecaInclinar` (+ para baixo), `cabecaLado` (+ ombro direito). Ou `m.olhar(\"câmera\")`.");
  add("- **Mão no quadril**: `m.poseRapida(\"cintura\")` ou `m.maoEm(\"esq\", ponto)`. **Mão no queixo**: `pensando`. **Braços cruzados**: `cruzar` / `bracosCruzadosPeito`.");
  add("- **Levando golpe**: `golpeRosto` (cabeça e tronco jogados para trás, braços abertos: `cabecaInclinar: -45, pescocoFrente: -25, colunaFrente: -24`), `golpeEstomago` (`colunaFrente: 62`), `esquiva` (arqueado para trás de propósito, joelhos dobrados), voando para trás: `arremessadoCostas` (`corpoInclinar: -62, altura: 5`).");
  add("- **Sentado apoiado nas mãos atrás**: `pernasEsticadas` + `corpoInclinar: -25`, braços `Frente: -48, Abrir: 24, cotovelo: 8`, `punho: -70`, gesto `espalmada` (ou `deslizandoSentado`).");
  add("- **Carregando energia**: `baseGritando` (base larga: coxas `Abrir 45, Frente 50, Girar -25`, joelhos 72, punhos, cabeça para trás), `concentrando`, `esferaDeLado`, `cargaDuasMaos`, `lotusFlutuando`. Junte efeitos: aura_explosiva, pedras_levitando, ondas_chao (seção 9).");
  add("- **Linha de ação forte**: exagere a curva do tronco (`colunaFrente`/`colunaLado`) e a torção (`colunaTorcao` + `pelveTorcao` em sentidos opostos), afaste os pés, incline o corpo (`corpoInclinar`).\n");
  add("## 7. Limites, flexibilidade e contatos");
  add("- Cada controle tem o limite humano (seção 3). Valores fora são cortados e o comando avisa. Alguns limites dependem de outros (limites acoplados): ex. a coxa sobe menos com o joelho esticado. O app corrige sozinho e mostra o aviso.");
  add("- Para espacate, ponte, escorpião: `m.flexibilidade(2)` antes da pose.");
  add("- Colisão entre partes: `m.validarPose()` lista o que atravessa. Entre manequins: `cena.resolverColisoes()`.\n");
  manualRosto(add);
  add("## 9. Efeitos especiais (opcional)");
  add("Padrão em preto e branco (nanquim de mangá); `colorido: true` liga a cor. `nivel` 1–5. Presos a uma parte: `m.efeito(\"impacto_contato\", { em: \"peDir\" })`; no chão: `cena.efeito(\"cratera\", { em: { modo: \"chao\", x: 0, z: 0 } })`; na tela: `cena.efeito(\"concentracao\")`; de outro manequim: `em: \"Leo.peito\"`. Direção: `para: \"Leo\"`.");
  add("- Partes para `em`: " + PARTES_EFEITO.map(p => "`" + p + "`").join(", ") + ".");
  for (const [cat, nome] of Object.entries(CATEGORIAS)) add("- " + nome + ": " + Object.entries(CATALOGO).filter(([, c]) => c.cat === cat && !c.personalizado).map(([k]) => "`" + k + "`").join(", ") + ".");
  add("");
  add("## 10. Como ler o ESTADO e corrigir");
  add("- `geral`: em pé, deitado, no ar; inclinação do tronco (graus da vertical, para frente/trás e para o lado); `apoiadoEm` = o que toca o chão.");
  add("- `bracoEsquerdo/bracoDireito`: altura da mão (acima da cabeça, ombro, cintura…), se cruzou para o outro lado, direção do braço e do antebraço, **para onde a palma está virada**, dedos, cotovelo, mão aberta/fechada.");
  add("- `pernaEsquerda/pernaDireita`: pé no chão ou levantado, posição do pé, direção da coxa e da canela, joelho, ponta do pé.");
  add("- `controles`: cada controle fora do neutro, com o valor, a faixa e o que ele está fazendo.");
  add("- `naImagem`: onde cabeça, mãos, cotovelos, joelhos e pés aparecem na foto (0–1). Use para conferir a imagem com o estado.");
  add("- `codigo`: o código que recria a pose atual (com o rosto e, se for pose de atleta/ginasta, a linha `flexibilidade: 1–3`). Para corrigir, mude só os números necessários.");
  add("- **Erros comuns**: trocar esquerda/direita (lado do manequim ≠ lado da imagem); palma do soco para cima (use antebraço −80); tombar o corpo no chute sem abrir a perna de apoio; somar valores (são absolutos); esquecer `altura` em saltos; pedir mais que o limite (veja a faixa).\n");
  add("## 11. Exemplo de resposta");
  add("Pedido: “Ana dá um soco de direita em Leo, que se dobra de dor.”");
  add("```js\nconst ana = cena.obter(\"Ana\"), leo = cena.obter(\"Leo\");\nana.poseRapida(\"direto\").expressao(\"raiva\");\nleo.poseRapida(\"golpeEstomago\").expressao(\"dor\");\nana.efeito(\"impacto_contato\", { em: \"maoDir\", nivel: 4 });\ncena.efeito(\"onomatopeia\", { texto: \"ドッ\" });\n```");
  if (!opts.curto && REF) { add("\n## Apêndice: referência completa de comandos do app"); add("```text\n" + String(REF).trim() + "\n```"); }
  return L.join("\n");
}
/* pacote para colar numa IA: regras + manual + estado + pedido */
function pacoteParaIA(pedido, opts = {}) {
  const E = estadoParaIA(opts);
  return "Você vai controlar o GeoMannequin, um manequim 3D comandado por código. Leia o MANUAL, depois o ESTADO ATUAL e responda ao PEDIDO com um bloco ```js``` de comandos (veja as regras na seção 0 do manual)." +
    (opts.imagem ? " A imagem anexada é a cena atual." : "") + "\n\n=== PEDIDO ===\n" + (pedido && String(pedido).trim() ? String(pedido).trim() : "(escreva aqui o que você quer, por exemplo: \"deixe o braço direito mais alto e feche o punho\")") +
    "\n\n=== ESTADO ATUAL ===\n" + E.texto + "\n\n=== ESTADO EM JSON ===\n```json\n" + JSON.stringify(E.json, null, 1) + "\n```\n\n=== MANUAL ===\n" + manualPosesIA({ curto: !!opts.curto });
}
export { manualPosesIA, pacoteParaIA };
