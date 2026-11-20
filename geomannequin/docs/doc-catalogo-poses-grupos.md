# Catálogo de poses, duplas e grupos (mais de 1.000 poses novas)

Data: 2026-11-20 · Manual: capítulo 61 · Tutorial: capítulo 11 ("Catálogo: poses, duplas e grupos")

## Números
- **651 poses novas de uma pessoa**. Cada uma tem nome em português (com apelidos), descrição em inglês (usada no prompt de imagem) e categoria em árvore.
- **32 duplas com toque** (interações), resolvidas pelo motor de contato das mãos.
- **407 poses de grupo**: 100 duplas, 57 trios, 69 de 4, 33 de 5, 63 de 6, 56 de 8 e 29 de 12 pessoas.
- **Total novo: 1.090.** O catálogo inteiro tem 2.763 itens: 1.296 poses, 129 interações, 407 grupos, 208 animações e 723 cenas+câmera.

## Categorias das poses de uma pessoa
- **Ação:** invasão, assalto, infiltração, sniper, perseguição, telhado, fuga, esconderijo, tático, resgate, parkour.
- **Movimento:** corrida, caminhada, escalada, salto, chão.
- **Dança:** balé, hip hop, latina, salão e festa, contemporânea, folclore.
- **Esporte:** futebol, basquete, vôlei, raquete, natação, ginástica, radical, atletismo e força, bola e taco, luta esportiva, lazer ao ar livre.
- **Casa:** cozinha, limpeza, roupa, quarto e banheiro, família e bebê, jardim e bichos.
- **Trabalho:** escritório, saúde, segurança, serviços, arte e mídia.
- **Outras:** Escola, Festa, Viagem, Lazer, Emoção, Romance, Terror, Suspense, Comédia.
- **Luta:** briga de rua, armas brancas, defesa pessoal, artes marciais.
- **Fantasia:** magia, super-herói, criaturas e anime.
- **Gênero:** faroeste, medieval e pirata, ficção científica, sobrevivência.
- **Também:** Social, Infância, Velhice, Cerimônia e fé, Campo, Militar, Hospital, Animais e natureza, Rua, Tecnologia.

## Não repetir
Um teste automático (`testes/poses-narrativas.mjs`) verifica:
- cada pose nova difere de **todas** as outras (velhas e novas) em pelo menos 60°, somados os ângulos de 28 juntas;
- nenhuma pose nova faz o corpo atravessar a si mesmo;
- nenhum grupo repete a mesma combinação de poses, posições e toques.

## Classificação (eixos)
- tipo
- categoria (árvore)
- pessoas
- corpo: de pé, sentado/agachado, ajoelhado, deitado, no ar, de cabeça para baixo
- intensidade: calma, média, explosiva
- emoção
- gênero: ação, luta, romance, drama, terror, suspense, comédia, fantasia, ficção científica, faroeste, medieval, esporte, cotidiano, musical, infantil, guerra
- função na história (as mesmas dos Pacotes)
- lugar
- com toque
- com objeto
- sinônimos pt/en

A busca usa a raiz das palavras (cozinhar acha cozinhando) e "-palavra" exclui.

## Onde usar
- **Janela Catálogo** (tecla C, botão "Catálogo", botão direito em alguém):
  - busca e filtros em botões com contagem, além da árvore de categorias;
  - miniaturas de verdade (atlas) ou bonecos de linha, com a planta no canto nos grupos;
  - Aplicar no palco (os nomes vêm das pessoas do palco), Pôr no texto (Name), Usar no Prompt, Copiar.
- **Texto:** `grupo-pose ID [com Kai, Mira] [em (x,z)] [gira G] [espelhado] [sem-poses] [nome Base]`.
  - Quem faltar vira figurante.
  - O mesmo grupo em vários quadros usa os mesmos figurantes.
  - Os nomes do "com" entram no elenco sozinhos.
- **Autocompletar:** `grupo-pose ` lista os grupos com miniatura.
- **MCP** (Claude, ChatGPT, Gemini; esquemas sem anyOf):
  - `catalogo_poses`: filtros, facetas, árvore, miniaturas e a linha pronta;
  - `grupo_pose`: na cena da conversa ou só para ver.
- **Prompt de imagem:** ganha "Group action: …" e "Physical contact: A and B — …"; as poses novas entram com a descrição em inglês.

## Arquivos
- `src/scene/poses-narrativas.js` e `poses-narrativas-2…5.js`
- `interacoes-narrativas.js`
- `grupos-poses.js`
- `catalogo-poses.js`
- `src/ui/catalogo.js`
- `mcp/lib/tools-poses.mjs`
- atlas `img/miniaturas/{pose,grupo,interacao}.webp`
- Ajustes:
  - `lote.js`: grupo-pose;
  - `barra-comando.js`;
  - `autocompletar.js`;
  - `prompt-img.js`: ação do grupo e toques;
  - `interacoes.js`: ponto "nuca";
  - `oficina.js`: botão, menu e atalho C.

## Limitações
- As poses são ângulos de juntas do manequim. Acrobacias e contatos muito justos ficam aproximados.
- Algumas mãos ficam a 5–13 cm do ponto de contato, por exemplo:
  - noivos no colo;
  - tango;
  - alongamento em dupla.
- Nos grupos com apoio (mesa, tapete), o corpo pode encostar um pouco no objeto.
- Na roda do time, os braços se cruzam de propósito: é um abraço.
- Apelidos com espaço vão entre aspas: `Kai pose "samba no pé"`.
