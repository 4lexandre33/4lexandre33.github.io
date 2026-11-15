/* GeoMannequin — LOCAIS PRONTOS (parametrizados): "local preset sala largura 6 profundidade 5" vira o código do local
   (as mesmas peças que alguém escreveria à mão: sala, parede, escada, nivel, agua, árvores, móveis). Cada um aceita
   largura/profundidade/altura (m), semente (sorteio dos detalhes) e algumas opções próprias. O resultado é texto: dá para
   ver, editar e salvar na biblioteca (e na nuvem) como qualquer local. */

const LP_RND = s => { let a = (s >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const lpN = v => +(+v).toFixed(2);
const lpP = (x, z) => "(" + lpN(x) + "," + lpN(z) + ")";
const lpR = (x0, z0, x1, z1) => lpN(x0) + "," + lpN(z0) + " a " + lpN(x1) + "," + lpN(z1);
const lpT = (l, p, a) => lpN(l) + "x" + lpN(p) + "x" + lpN(a);

const LOCAIS_PRONTOS = {
  sala: { nome: "Sala de estar", grupo: "interior", padrao: { largura: 6, profundidade: 5, altura: 2.8 }, desc: "sala com sofá, poltrona, mesa de centro, tapete, estante, TV e janela",
    gerar: (o, r) => { const W = o.largura, D = o.profundidade, x0 = -W / 2, z0 = -D / 2, x1 = W / 2, z1 = D / 2; return [
      "chao retangulo " + lpR(x0 - 1, z0 - 1, x1 + 1, z1 + 1) + " classe piso",
      "sala \"Sala\" retangulo " + lpR(x0, z0, x1, z1) + " altura " + o.altura + " porta lado sul em " + lpN(W * 0.2) + " janela lado norte",
      "chao retangulo " + lpR(-1.3, -1.0, 1.3, 1.0) + " classe madeira",
      "caixa \"sofá\" em " + lpP(0, z1 - 0.55) + " tamanho 2.2x0.9x0.8 classe tecido",
      "cadeira \"poltrona\" em " + lpP(x0 + 0.8, 0.3) + " gira 90 tamanho 0.9x0.9x0.9 classe tecido",
      "mesa \"mesa de centro\" em " + lpP(0, 0.3) + " tamanho 1.1x0.6x0.45 classe madeira",
      "caixa \"estante\" em " + lpP(x1 - 0.25, 0.4) + " gira 90 tamanho 1.8x0.4x2 classe madeira",
      "caixa \"tv\" em " + lpP(0, z0 + 0.35) + " tamanho 1.4x0.3x1.2 cor #222428",
      "cilindro \"luminária\" em " + lpP(x1 - 0.5, z1 - 0.5) + " raio 0.15 altura 1.6",
      "marca \"porta\" em " + lpP(x0 + W * 0.2, z0 + 0.4), "marca \"sofa\" em " + lpP(0, z1 - 1.3)]; } },
  quarto: { nome: "Quarto", grupo: "interior", padrao: { largura: 4.5, profundidade: 4, altura: 2.7 }, desc: "quarto com cama de casal, criados-mudos, guarda-roupa, escrivaninha com cadeira e janela",
    gerar: (o) => { const W = o.largura, D = o.profundidade, x0 = -W / 2, z0 = -D / 2, x1 = W / 2, z1 = D / 2; return [
      "chao retangulo " + lpR(x0 - 1, z0 - 1, x1 + 1, z1 + 1) + " classe madeira",
      "sala \"Quarto\" retangulo " + lpR(x0, z0, x1, z1) + " altura " + o.altura + " porta lado sul em " + lpN(W - 1.2) + " janela lado leste",
      "cama \"cama\" em " + lpP(-0.2, z1 - 1.05) + " tamanho 1.6x2x0.5",
      "caixa \"criado-mudo E\" em " + lpP(-1.3, z1 - 0.25) + " tamanho 0.45x0.4x0.55 classe madeira",
      "caixa \"criado-mudo D\" em " + lpP(0.9, z1 - 0.25) + " tamanho 0.45x0.4x0.55 classe madeira",
      "caixa \"guarda-roupa\" em " + lpP(x0 + 0.3, z0 + 1.2) + " gira 90 tamanho 1.8x0.6x2.2 classe madeira",
      "mesa \"escrivaninha\" em " + lpP(x1 - 0.35, z0 + 1.2) + " gira 90 tamanho 1.2x0.6x0.75 classe madeira",
      "cadeira \"cadeira\" em " + lpP(x1 - 0.95, z0 + 1.2) + " gira -90",
      "marca \"porta\" em " + lpP(x1 - 1.2, z0 + 0.4), "marca \"cama\" em " + lpP(-0.2, z1 - 2.3)]; } },
  escadaria: { nome: "Escadaria interna (com patamar)", grupo: "interior", padrao: { largura: 6, profundidade: 8, altura: 3.2 }, desc: "hall com escada em L: primeiro lanço, patamar e segundo lanço até o andar de cima (mezanino)",
    gerar: (o) => { const W = o.largura, D = o.profundidade, A = o.altura, x0 = -W / 2, z0 = -D / 2, x1 = W / 2, z1 = D / 2, h = A / 2; return [
      "chao retangulo " + lpR(x0 - 1, z0 - 1, x1 + 1, z1 + 1) + " classe piso",
      "sala \"Hall\" retangulo " + lpR(x0, z0, x1, z1) + " altura " + lpN(A * 2) + " porta lado sul",
      "escada de " + lpP(x1 - 0.6, z0 + 1) + " ate " + lpP(x1 - 0.6, z1 - 2.2) + " sobe-para norte altura " + lpN(h),
      "nivel \"Patamar\" altura " + lpN(h) + " retangulo " + lpR(x1 - 1.2, z1 - 2.2, x1, z1),
      "escada de " + lpP(x1 - 1.2, z1 - 0.6) + " ate " + lpP(x0 + 2.2, z1 - 0.6) + " sobe-para oeste base " + lpN(h) + " altura " + lpN(A),
      "nivel \"Andar de cima\" altura " + lpN(A) + " retangulo " + lpR(x0, z1 - 2.2, x0 + 2.2, z1),
      "cerca linha " + lpP(x0 + 2.2, z1 - 2.2) + "-" + lpP(x0, z1 - 2.2) + " altura 1",
      "marca \"pe da escada\" em " + lpP(x1 - 0.6, z0 + 0.5), "marca \"topo\" em " + lpP(x0 + 1, z1 - 1) + " nivel \"Andar de cima\""]; } },
  "escadaria-aberta": { nome: "Escadaria aberta (monumental)", grupo: "exterior", padrao: { largura: 10, profundidade: 12, altura: 3 }, desc: "escadaria larga ao ar livre com colunas e um terraço no alto (templo, palácio, tribunal)",
    gerar: (o) => { const W = o.largura, D = o.profundidade, A = o.altura; return [
      "chao retangulo " + lpR(-W, -D, W, D) + " classe pedra",
      "escada de " + lpP(0, -D / 2) + " ate " + lpP(0, 0) + " sobe-para norte altura " + A + " largura " + lpN(W * 0.8),
      "nivel \"Terraço\" altura " + A + " retangulo " + lpR(-W / 2, 0, W / 2, D / 2),
      ...[-1, -0.5, 0.5, 1].map(f => "coluna em " + lpP(f * W * 0.42, D * 0.3) + " altura 6 base " + A + " classe pedra"),
      "caixa \"frontão\" em " + lpP(0, D * 0.3) + " tamanho " + lpT(W * 0.95, 1.2, 0.8) + " base " + lpN(A + 6) + " classe pedra",
      "marca \"pe da escada\" em " + lpP(0, -D / 2 - 1), "marca \"topo\" em " + lpP(0, D * 0.15) + " nivel \"Terraço\""]; } },
  calcada: { nome: "Calçada e rua", grupo: "exterior", padrao: { largura: 30, profundidade: 14, altura: 0 }, desc: "rua asfaltada, meio-fio, calçadas dos dois lados, postes, árvores e fachadas",
    gerar: (o, r) => { const W = o.largura, D = o.profundidade, rua = D * 0.42, cal = (D - rua) / 2; return [
      "chao retangulo " + lpR(-W / 2, -rua / 2, W / 2, rua / 2) + " cor #3a3c40",
      "chao retangulo " + lpR(-W / 2, rua / 2, W / 2, rua / 2 + cal) + " classe pedra", "chao retangulo " + lpR(-W / 2, -rua / 2 - cal, W / 2, -rua / 2) + " classe pedra",
      "caixa \"meio-fio N\" em " + lpP(0, rua / 2) + " tamanho " + lpT(W, 0.15, 0.15) + " cor #9a9a96", "caixa \"meio-fio S\" em " + lpP(0, -rua / 2) + " tamanho " + lpT(W, 0.15, 0.15) + " cor #9a9a96",
      "fileira " + Math.max(2, Math.round(W / 4)) + " caixa de " + lpP(-W / 2 + 2, 0) + " ate " + lpP(W / 2 - 2, 0) + " tamanho 2x0.15x0.02 cor #e8e4d0",
      "fileira " + Math.max(2, Math.round(W / 10)) + " coluna de " + lpP(-W / 2 + 3, rua / 2 + 0.5) + " ate " + lpP(W / 2 - 3, rua / 2 + 0.5) + " altura 4.5 raio 0.08 cor #4a4c50",
      "fileira " + Math.max(2, Math.round(W / 8)) + " arvore de " + lpP(-W / 2 + 5, -rua / 2 - 0.9) + " ate " + lpP(W / 2 - 5, -rua / 2 - 0.9) + " variar 0.2",
      ...Array.from({ length: Math.max(2, Math.round(W / 7)) }, (_, i) => { const x = -W / 2 + (i + 0.5) * W / Math.max(2, Math.round(W / 7)); return "predio \"fachada " + (i + 1) + "\" em " + lpP(x, rua / 2 + cal + 3) + " tamanho " + lpT(W / Math.max(2, Math.round(W / 7)) - 0.3, 6, lpN(6 + r() * 10)); }),
      "marca \"esquina\" em " + lpP(-W / 2 + 2, -rua / 2 - cal / 2), "regiao \"rua\" retangulo " + lpR(-W / 2, -rua / 2, W / 2, rua / 2)]; } },
  "estrada-terra": { nome: "Estrada de terra", grupo: "exterior", padrao: { largura: 40, profundidade: 30, altura: 0 }, desc: "estrada de terra batida no campo, com cerca, pedras, arbustos e árvores esparsas",
    gerar: (o, r) => { const W = Math.min(50, o.largura), D = Math.min(50, o.profundidade), out = ["chao retangulo " + lpR(-W / 2, -D / 2, W / 2, D / 2) + " classe grama"]; let z = 0;
      for (let i = 0; i < 5; i++) { const x0 = -W / 2 + i * W / 5, x1 = x0 + W / 5; z += (r() - 0.5) * 2; out.push("chao retangulo " + lpR(x0, z - 1.8, x1 + 0.4, z + 1.8) + " classe terra"); }
      out.push("cerca linha " + lpP(-W / 2, 3.5) + "-" + lpP(W / 2, 4.2), "fileira 6 pedra de " + lpP(-W / 2 + 3, -3) + " ate " + lpP(W / 2 - 3, -3.6) + " variar 0.5", "fileira 5 arbusto de " + lpP(-W / 2 + 6, -5) + " ate " + lpP(W / 2 - 4, -6) + " variar 0.4");
      for (let i = 0; i < 6; i++) out.push("arvore em " + lpP(-W / 2 + r() * W, (r() < 0.5 ? -1 : 1) * (7 + r() * (D / 2 - 8))));
      out.push("marca \"curva\" em " + lpP(W / 4, 0), "regiao \"estrada\" retangulo " + lpR(-W / 2, -2, W / 2, 2)); return out; } },
  "estrada-pedra": { nome: "Estrada de pedra (calçamento geométrico)", grupo: "exterior", padrao: { largura: 24, profundidade: 4, altura: 0, padrao: "xadrez" }, desc: "calçamento de pedras em padrão (xadrez ou espinha de peixe) com guias e grama dos lados",
    gerar: (o) => { const W = Math.min(40, o.largura), L = Math.min(8, o.profundidade), t = 0.8, nx = Math.round(W / t), nz = Math.round(L / t), out = ["chao retangulo " + lpR(-W / 2 - 4, -L / 2 - 4, W / 2 + 4, L / 2 + 4) + " classe grama", "chao retangulo " + lpR(-W / 2, -L / 2, W / 2, L / 2) + " cor #8c8478"];
      if (o.padrao === "espinha") { for (let j = 0; j < nz; j++) out.push("fileira " + Math.round(nx / 2) + " caixa de " + lpP(-W / 2 + t, -L / 2 + (j + 0.5) * t) + " ate " + lpP(W / 2 - t, -L / 2 + (j + 0.5) * t) + " tamanho " + lpT(t * 0.9, t * 0.42, 0.06) + " gira " + (j % 2 ? 45 : -45) + " cor " + (j % 2 ? "#a49a8a" : "#7c7468")); }
      else for (let j = 0; j < nz; j++) out.push("fileira " + Math.round(nx / 2) + " caixa de " + lpP(-W / 2 + t * (0.5 + (j % 2)), -L / 2 + (j + 0.5) * t) + " ate " + lpP(W / 2 - t * (1.5 - (j % 2)), -L / 2 + (j + 0.5) * t) + " tamanho " + lpT(t * 0.94, t * 0.94, 0.06) + " cor #a69c8c");
      out.push("caixa \"guia N\" em " + lpP(0, L / 2 + 0.1) + " tamanho " + lpT(W, 0.2, 0.18) + " classe pedra", "caixa \"guia S\" em " + lpP(0, -L / 2 - 0.1) + " tamanho " + lpT(W, 0.2, 0.18) + " classe pedra", "regiao \"estrada\" retangulo " + lpR(-W / 2, -L / 2, W / 2, L / 2)); return out; } },
  "rio-ponte": { nome: "Rio com ponte", grupo: "exterior", padrao: { largura: 30, profundidade: 30, altura: 1.2 }, desc: "rio atravessando o campo com ponte de madeira (rampas, guarda-corpo), pedras na margem",
    gerar: (o, r) => { const W = Math.min(50, o.largura), D = Math.min(50, o.profundidade), rio = 7, A = o.altura; return [
      "chao retangulo " + lpR(-W / 2, -D / 2, W / 2, D / 2) + " classe grama", "chao retangulo " + lpR(-W / 2, -rio / 2 - 1, W / 2, rio / 2 + 1) + " classe areia",
      "agua \"rio\" em " + lpP(0, 0) + " tamanho " + lpT(W, rio, 0.3),
      "nivel \"Ponte\" altura " + A + " retangulo " + lpR(-1.5, -rio / 2 - 0.5, 1.5, rio / 2 + 0.5),
      "rampa de " + lpP(0, -rio / 2 - 3.5) + " ate " + lpP(0, -rio / 2 - 0.5) + " altura " + A, "rampa de " + lpP(0, rio / 2 + 3.5) + " ate " + lpP(0, rio / 2 + 0.5) + " altura " + A,
      "cerca linha " + lpP(-1.5, -rio / 2 - 0.5) + "-" + lpP(-1.5, rio / 2 + 0.5) + " base " + A, "cerca linha " + lpP(1.5, -rio / 2 - 0.5) + "-" + lpP(1.5, rio / 2 + 0.5) + " base " + A,
      ...[-1, 1].flatMap(s => [-1, 1].map(q => "coluna \"pilar\" em " + lpP(s * 1.5, q * rio * 0.25) + " altura " + A + " raio 0.25 classe madeira")),
      "fileira 6 pedra de " + lpP(-W / 2 + 2, rio / 2 + 0.6) + " ate " + lpP(-4, rio / 2 + 0.8) + " variar 0.5", "fileira 5 pedra de " + lpP(4, -rio / 2 - 0.6) + " ate " + lpP(W / 2 - 2, -rio / 2 - 0.8) + " variar 0.5",
      "fileira 4 arvore de " + lpP(-W / 2 + 4, D / 2 - 4) + " ate " + lpP(W / 2 - 4, D / 2 - 5) + " variar 0.3",
      "marca \"meio da ponte\" em " + lpP(0, 0) + " nivel \"Ponte\"", "marca \"margem sul\" em " + lpP(0, -rio / 2 - 4), "marca \"margem norte\" em " + lpP(0, rio / 2 + 4)]; } },
  castelo: { nome: "Castelo com fosso e ponte levadiça", grupo: "exterior", padrao: { largura: 30, profundidade: 30, altura: 8 }, desc: "muralha com quatro torres, portão, fosso com água em volta e ponte levadiça na frente",
    gerar: (o) => { const W = Math.min(34, o.largura), D = Math.min(30, o.profundidade), A = o.altura, x = W / 2, z = D / 2, f = 3.5; return [
      "chao retangulo " + lpR(-Math.min(25, x + f + 6), -Math.min(25, z + f + 10), Math.min(25, x + f + 6), Math.min(25, z + f + 6)) + " classe grama",
      "agua \"fosso S\" em " + lpP(0, -z - f / 2) + " tamanho " + lpT(W + 2 * f, f, 0.3), "agua \"fosso N\" em " + lpP(0, z + f / 2) + " tamanho " + lpT(W + 2 * f, f, 0.3),
      "agua \"fosso O\" em " + lpP(-x - f / 2, 0) + " tamanho " + lpT(f, D, 0.3), "agua \"fosso L\" em " + lpP(x + f / 2, 0) + " tamanho " + lpT(f, D, 0.3),
      "muro linha " + lpP(-x + 2.6, -z) + "-" + lpP(x - 2.6, -z) + " altura " + A + " espessura 1.5 vao porta " + lpP(0, -z) + " largura 3.2", "muro linha " + lpP(x, -z + 2.6) + "-" + lpP(x, z - 2.6) + " altura " + A + " espessura 1.5",
      "muro linha " + lpP(x - 2.6, z) + "-" + lpP(-x + 2.6, z) + " altura " + A + " espessura 1.5", "muro linha " + lpP(-x, z - 2.6) + "-" + lpP(-x, -z + 2.6) + " altura " + A + " espessura 1.5",
      ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => "coluna \"torre\" em " + lpP(a * x, b * z) + " raio 2.4 altura " + lpN(A * 1.6) + " classe pedra"),
      "nivel \"Muralha\" altura " + A + " retangulo " + lpR(-x + 2.6, -z - 0.75, x - 2.6, -z + 0.75), "nivel \"Muralha norte\" altura " + A + " retangulo " + lpR(-x + 2.6, z - 0.75, x - 2.6, z + 0.75),
      "fileira 8 caixa de " + lpP(-x + 3.6, -z - 0.5) + " ate " + lpP(x - 3.6, -z - 0.5) + " tamanho 0.9x0.5x0.9 base " + A + " classe pedra",
      "nivel \"Ponte levadiça\" altura 0.4 retangulo " + lpR(-1.6, -z - f - 0.2, 1.6, -z - 0.8), "coluna \"poste da ponte E\" em " + lpP(-2, -z - 1.1) + " raio 0.15 altura 3 classe madeira", "coluna \"poste da ponte D\" em " + lpP(2, -z - 1.1) + " raio 0.15 altura 3 classe madeira",
      "marca \"muralha\" em " + lpP(-x / 2, -z) + " nivel \"Muralha\"", "marca \"fosso\" em " + lpP(x / 2, -z - f / 2), "marca \"portão\" em " + lpP(0, -z + 1), "marca \"ponte\" em " + lpP(0, -z - f / 2) + " nivel \"Ponte levadiça\"", "marca \"pátio\" em " + lpP(0, 0), "regiao \"pátio\" retangulo " + lpR(-x + 1.5, -z + 1.5, x - 1.5, z - 1.5)]; } },
  taverna: { nome: "Taverna", grupo: "interior", padrao: { largura: 12, profundidade: 9, altura: 3.2 }, desc: "salão de taverna: balcão com barris, mesas redondas com bancos, lareira, porta e janelas",
    gerar: (o, r) => { const W = o.largura, D = o.profundidade, x0 = -W / 2, z0 = -D / 2, x1 = W / 2, z1 = D / 2, out = [
      "chao retangulo " + lpR(x0 - 1, z0 - 1, x1 + 1, z1 + 1) + " classe madeira",
      "sala \"Taverna\" retangulo " + lpR(x0, z0, x1, z1) + " altura " + o.altura + " porta lado sul janela lado leste janela lado oeste",
      "caixa \"balcão\" em " + lpP(x1 - 3, z1 - 1.6) + " tamanho 4.5x0.7x1.1 classe madeira",
      "fileira 4 barril de " + lpP(x1 - 4.8, z1 - 0.4) + " ate " + lpP(x1 - 1.2, z1 - 0.4),
      "caixa \"prateleira\" em " + lpP(x1 - 3, z1 - 0.15) + " tamanho 4.5x0.3x2.2 classe madeira",
      "caixa \"lareira\" em " + lpP(x0 + 0.4, 1) + " gira 90 tamanho 2x0.8x1.5 classe pedra"];
      const cols = Math.max(1, Math.floor((W - 6) / 3)), lins = Math.max(1, Math.floor((D - 3.5) / 2.8)); for (let i = 0; i < cols * lins; i++) { const mx = x0 + 2.4 + (i % cols) * 3 + (r() - 0.5) * 0.4, mz = z0 + 1.8 + Math.floor(i / cols) * 2.8 + (r() - 0.5) * 0.4; out.push("mesaRedonda \"mesa " + (i + 1) + "\" em " + lpP(mx, mz) + " raio 0.6 altura 0.75", "banco em " + lpP(mx - 1, mz) + " gira 90 tamanho 0.4x1.1x0.45", "banco em " + lpP(mx + 1, mz) + " gira 90 tamanho 0.4x1.1x0.45"); }
      out.push("marca \"balcao\" em " + lpP(x1 - 3, z1 - 2.5), "marca \"porta\" em " + lpP(0, z0 + 0.5), "marca \"lareira\" em " + lpP(x0 + 1.6, 1)); return out; } },
  floresta: { nome: "Floresta", grupo: "exterior", padrao: { largura: 40, profundidade: 40, altura: 0, densidade: 1 }, desc: "mata com árvores sorteadas, arbustos, pedras, tora caída e uma clareira no meio",
    gerar: (o, r) => { const W = Math.min(50, o.largura), D = Math.min(50, o.profundidade), n = Math.round(W * D / 45 * (o.densidade || 1)), out = ["chao retangulo " + lpR(-W / 2, -D / 2, W / 2, D / 2) + " classe grama", "chao circulo em (0,0) raio 5 classe terra"];
      for (let i = 0; i < n; i++) { let x, z; do { x = (r() - 0.5) * W; z = (r() - 0.5) * D; } while (Math.hypot(x, z) < 6.5); out.push((r() < 0.75 ? "arvore" : "arbusto") + " em " + lpP(x, z) + (r() < 0.3 ? " altura " + lpN(4 + r() * 6) : "")); }
      for (let i = 0; i < Math.round(n / 5); i++) { let x, z; do { x = (r() - 0.5) * W; z = (r() - 0.5) * D; } while (Math.hypot(x, z) < 5.5); out.push("pedra em " + lpP(x, z) + " tamanho " + lpT(0.6 + r(), 0.5 + r(), 0.4 + r() * 0.6)); }
      out.push("cano \"tora caída\" em " + lpP(3, 4.2) + " gira 70 tamanho 4x0.5x0.5 classe madeira", "marca \"clareira\" em (0,0)", "regiao \"clareira\" retangulo -4,-4 a 4,4"); return out; } },
  lago: { nome: "Lago", grupo: "exterior", padrao: { largura: 36, profundidade: 30, altura: 0 }, desc: "lago (água em faixas que formam uma oval), margem de areia, juncos, pedras e um píer de madeira",
    gerar: (o, r) => { const W = Math.min(50, o.largura), D = Math.min(50, o.profundidade), a = W * 0.33, b = D * 0.3, out = ["chao retangulo " + lpR(-W / 2, -D / 2, W / 2, D / 2) + " classe grama", "chao circulo em (0,0) raio " + lpN(Math.max(a, b) + 1.5) + " classe areia"];
      const k = 7; for (let i = 0; i < k; i++) { const z = -b + (i + 0.5) * 2 * b / k, w = 2 * a * Math.sqrt(Math.max(0.05, 1 - z * z / (b * b))); out.push("agua em " + lpP(0, z) + " tamanho " + lpT(w, 2 * b / k + 0.05, 0.3)); }
      for (let i = 0; i < 14; i++) { const t = r() * 6.283; out.push("cilindro \"junco\" em " + lpP(Math.cos(t) * (a + 0.4), Math.sin(t) * (b + 0.4)) + " raio 0.03 altura " + lpN(0.8 + r() * 0.6) + " classe vegetacao"); }
      out.push("fileira 5 pedra de " + lpP(-a - 1, -b * 0.4) + " ate " + lpP(-a * 0.6, -b - 1) + " variar 0.5", "nivel \"Píer\" altura 0.4 retangulo " + lpR(a * 0.55, -1, a + 2.5, 1), "fileira 4 coluna de " + lpP(a * 0.6, -1) + " ate " + lpP(a * 0.6 + 2.6, -1) + " altura 0.4 raio 0.1 classe madeira",
        "marca \"pier\" em " + lpP(a * 0.8, 0) + " nivel \"Píer\"", "marca \"margem\" em " + lpP(-a - 2, 0)); return out; } }
};
const LP_SIN = { "sala-de-estar": "sala", living: "sala", quarto: "quarto", dormitorio: "quarto", "dormitório": "quarto", escada: "escadaria", "escadaria-interna": "escadaria", "escadaria-externa": "escadaria-aberta", escadaria_aberta: "escadaria-aberta",
  rua: "calcada", "calçada": "calcada", calcada: "calcada", estrada: "estrada-terra", "estrada-de-terra": "estrada-terra", "estrada-de-pedra": "estrada-pedra", calcamento: "estrada-pedra", "calçamento": "estrada-pedra", rio: "rio-ponte", ponte: "rio-ponte", "rio-com-ponte": "rio-ponte",
  castelo: "castelo", fortaleza: "castelo", taverna: "taverna", bar: "taverna", estalagem: "taverna", floresta: "floresta", mata: "floresta", bosque: "floresta", lago: "lago", lagoa: "lago" };
function lpAchar(n) { const k = String(n || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "-"); return LOCAIS_PRONTOS[k] ? k : LP_SIN[k] || LP_SIN[String(n || "").toLowerCase()] || null; }
/* opções: { largura, profundidade, altura, semente, padrao, densidade, nome } → código do local (texto) */
function localPronto(tipo, o = {}) { const k = lpAchar(tipo); if (!k) throw new Error("Local pronto “" + tipo + "” não existe. Há: " + Object.keys(LOCAIS_PRONTOS).join(", ") + ".");
  const L = LOCAIS_PRONTOS[k], op = Object.assign({}, L.padrao, Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "")));
  for (const q of ["largura", "profundidade", "altura"]) if (op[q] !== undefined) op[q] = Math.max(q === "altura" ? 0 : 2, Math.min(50, +op[q]));
  const linhas = L.gerar(op, LP_RND(+op.semente || 7)), nome = op.nome || L.nome;
  return { tipo: k, nome, codigo: "local \"" + nome + "\" unidade m origem (0,0)\n" + linhas.map(l => "  " + l).join("\n") + "\n", pecas: linhas.length, desc: L.desc, opcoes: op }; }
function listaLocaisProntos() { return Object.entries(LOCAIS_PRONTOS).map(([k, L]) => ({ tipo: k, nome: L.nome, grupo: L.grupo, desc: L.desc, padrao: L.padrao })); }
/* "local preset sala largura 6 [nome "Sala do Kai"] [semente 3]" (linha do texto) → bloco "local" completo */
function lpExpandirTexto(texto) { return String(texto).replace(/^([ \t]*)local\s+(?:preset|pronto)\s+(\S+)([^\n]*)$/gim, (_, ind, tipo, resto) => {
  const o = {}, nm = /"([^"]+)"/.exec(resto); if (nm) o.nome = nm[1]; const sem = resto.replace(/"[^"]*"/g, "");
  for (const m of sem.matchAll(/(largura|profundidade|altura|semente|densidade|padrao|padrão)\s+([\w.,-]+)/gi)) o[m[1].toLowerCase().replace("padrão", "padrao")] = /^[\d.]+$/.test(m[2]) ? +m[2] : m[2];
  return localPronto(tipo, o).codigo.replace(/\n$/, "").split("\n").map(l => ind + l).join("\n"); }); }
export { LOCAIS_PRONTOS, localPronto, listaLocaisProntos, lpExpandirTexto, lpAchar };
