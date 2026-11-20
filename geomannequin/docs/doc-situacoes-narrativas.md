# Situações narrativas: mais de 1.000 cenas prontas

Data: 2026-11-20 · Manual: capítulo 62 · Tutorial: "Situações narrativas (mais de 1.000)"

## O que é
Uma **situação** é uma cena de história pronta. Ela traz:
- quem está na cena (papéis de 1 a 12 pessoas);
- onde cada um fica e para quem olha;
- a **pose** e a **expressão** de cada um;
- os **toques** (interações), os **objetos** (mesa, porta, parede, carro…) e os **efeitos** (chuva, fumaça, aura…);
- a **câmera**: enquadramento e ângulo, que seguem as pessoas.

## Números
- **1.050 situações** em **34 famílias**, cada uma com subfamílias.
- Tamanhos:
  - 249 de 1 pessoa;
  - 473 de 2;
  - 179 de 3;
  - 95 de 4;
  - 13 de 5;
  - 6 de 6;
  - 12 de 8;
  - 23 de 12.
- Nenhuma repete outra. Um teste confere que poses, lugares, giros, toques e objetos nunca coincidem.
- Todas compilam com a câmera própria, e ninguém começa dentro de um objeto.

## Famílias
| Família | Exemplos de subfamília |
|---|---|
| Revelação e descoberta | identidade, passado, pista, notícia |
| Segredo e mentira | confidência, pacto, chantagem, conspiração, fofoca |
| Espionagem e vigilância | vigilância, disfarce, infiltração, troca, captura |
| Investigação e mistério | cena do crime, interrogatório, perícia, desfecho |
| Decisão, dilema e virada | escolha, dilema, ruptura, compromisso, redenção |
| Amizade | cumplicidade, apoio, diversão, reconciliação |
| Inimizade e rivalidade | provocação, humilhação, ameaça, sabotagem, trégua |
| Romance e casal | primeiro encontro, beijo, dança, pedido, ciúme, término |
| Família | bebê, rotina, irmãos, avós, conflito, luto |
| Chegadas, despedidas e reencontros | chegada, despedida, reencontro, apresentação |
| Raiva e discussão | discussão, explosão, frustração, briga |
| Medo e pânico | escuro, presença, fobia, pânico, assombração |
| Luto e tristeza | luto, saudade, solidão, choro, derrota |
| Alegria e conquista | vitória, sorte, superação, gratidão |
| Comédia e constrangimento | pastelão, vexame, gafe, flagra, azar |
| Festa e celebração | aniversário, balada, casamento, natal, carnaval |
| Descanso e lazer | cochilo, leitura, praia, acampamento, hobby |
| Cotidiano doméstico | manhã, cozinha, faxina, compras, noite |
| Trabalho | reunião, pressão, negócio, oficina, restaurante |
| Escola | aula, prova, recreio, formatura, disciplina |
| Acidente e emergência | queda, trânsito, ferimento, primeiros socorros |
| Perigo e catástrofe | terremoto, tsunami, enchente, tempestade, bomba, kaiju |
| Resgate e ajuda | carregar ferido, incêndio, água, gentileza |
| Saúde e hospital | emergência, espera, recuperação, consulta |
| Fuga e perseguição | a pé, telhados, veículo, esconder, captura |
| Crime e polícia | assalto, sequestro, refém, prisão, tribunal, máfia |
| Luta e confronto | golpe, defesa, agarramento, espadas, boxe |
| Poder e hierarquia | realeza, corporação, tirania, política, justiça |
| Sobrenatural e terror | possessão, vampiro, zumbis, fantasma, ritual |
| Fantasia e aventura | dragão, magia, portal, transformação, super-herói, espaço |
| Esporte e competição | futebol, basquete, vôlei, atletismo, radical, torcida |
| Viagem e exploração | aeroporto, turismo, trilha, mar, selva, deserto |
| Guerra e militar | trincheira, ataque, ferido, rendição, paz |
| Sociedade e eventos públicos | protesto, política, show, fila, vigília |

## Classificação (Catálogo e MCP)
Os eixos são:
- família › subfamília;
- **evento**: descoberta, segredo, festa, acidente, perseguição…;
- **relação**: sozinho, dupla, amigos, casal, família, inimigos, aliados, chefe, mestre…;
- emoção, gênero, lugar, intensidade e pessoas;
- com toque e com objeto.

## Como usar
- **Texto (Name e barra do palco):**
  `situacao ID [com Kai, Mira] [em (x,z)] [gira G] [espelhado] [sem-camera] [sem-poses] [falas] [nome Guarda]`
  - Quem faltar vira figurante.
  - A câmera vira `camera preset sit.ID com …`.
  - `falas` acrescenta a fala sugerida. 138 situações têm uma; nas outras aparece um aviso.
  - Os figurantes entram no fim do elenco, então quem foi declarado antes fica com as primeiras cores.
  - `Figurante1 sai` tira um figurante.
  - O id pode ser curto, por exemplo `verdadeNaCara`.
- **Catálogo** (tecla C):
  - o tipo "Situações" tem botões de Evento e de Relação;
  - a árvore de Categorias tem "Situações › família › subfamília";
  - Aplicar no palco usa as pessoas que já estão no palco e põe a câmera da situação.
  - Se só houver o "Manequim 1" do começo, ele vira o primeiro papel.
- **Barra de comando:** `situacao ` sugere as famílias e `situacao festa.` sugere as situações daquela família.
- **Autocompletar:** `situacao ` mostra as famílias; `situacao festa.` mostra as situações com miniatura (atlas `img/miniaturas/situacao.webp`).
- **Prompt de imagem:** cada quadro com situação ganha "Narrative situation: …".
- **MCP** (Claude, ChatGPT, Gemini; esquemas sem anyOf):
  - `situacoes`: famílias, busca, filtros, facetas e miniaturas;
  - `aplicar_situacao`: monta a cena e devolve a imagem;
  - `catalogo_poses` também aceita `tipo: "situacao"`.

## Arquivos
- `src/scene/situacoes.js`: motor, formato, câmera, linha `situacao` e `stLinhas`.
- `src/scene/situacoes-dados-1…6.js`: as 1.050 situações.
- Ajustes:
  - `lote.js`, `barra-comando.js` (a câmera vai para o palco), `preconfig.js` (`sit.ID`);
  - `catalogo-poses.js` (tipo situacao, eixos evento e relação), `autocompletar.js`, `prompt-img.js`;
  - `src/ui/catalogo.js`, `src/ui/prompt.js`, `src/ui/tutorial.js`;
  - `mcp/lib/tools-poses.mjs`.
- Teste: `testes/situacoes.mjs`.

## Teste cego (agente só com o manual) e correções
O agente encontrou estes problemas, todos corrigidos:
- o "Manequim 1" padrão ficava parado no meio da cena;
- `Figurante1 sai` não achava o figurante;
- os figurantes roubavam as primeiras cores do elenco;
- `falas` só funcionava em 5 situações (agora são 138, e as outras avisam);
- contagens erradas nas descrições dos grupos de 8 e 12;
- o filtro `pessoas` de 9 a 11 caía em 6–8;
- a faceta de família vinha com o rótulo "Situações";
- a câmera de `acidente.batidaCarro` ficava dentro de um carro;
- o efeito de `sobrenatural.levitando` saía como manchas cinza;
- nas situações de sofá e banco, as pessoas sentavam em cadeiras (agora sentam no sofá ou no banco de praça).

## Limitações
- As situações das famílias com toque usam as interações prontas. Algumas mãos ficam a 5–20 cm do ponto de contato.
- Quem monta a cavalo foi trocado por poses a pé: a situação ainda não põe animais.
- Nas situações de sofá e de banco de praça, as pessoas sentam no objeto de verdade (desde o capítulo 63). Nas outras, quem está deitado fica no chão e quem está sentado ganha uma cadeira.
- Nas situações dentro de carro, trem ou avião, aparecem só as pessoas, sem o veículo.
- Algumas câmeras de close cortam a cabeça quando a pose olha para baixo. Troque o plano no quadro ou use `sem-camera`.
- Situações com `falas`: a boca de fala troca a expressão de quem fala.
