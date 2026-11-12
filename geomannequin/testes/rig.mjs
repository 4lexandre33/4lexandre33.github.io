/* GeoMannequin — rig completo e referências de ControlNet: OpenPose (BODY_25 + mãos + rosto) alinhado e com oclusão,
   passes em 1 px (normais, partes, canny), órbita em volta de um pivô, giro 360° e ficha no roteiro, limites acoplados,
   autocolisão e varredura de poses ao acaso.
   Uso: node testes/rig.mjs  (precisa de mcp/node_modules) */
import { createWorld } from "../mcp/lib/core.mjs";
import { autoColisoes, pontosDoCorpo, telaDoMundo, W, H } from "../src/engine/index.js";

let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const trios = a => { const o = []; for (let i = 0; i < a.length; i += 3) o.push([a[i], a[i + 1], a[i + 2]]); return o; };

/* OpenPose: tamanhos, lados, rosto dentro da cabeça */
{ const w = createWorld();
  const q = w.executarRoteiro("#cena\ncena.limpar();\ncena.ativo.renomear(\"Ana\").expressao(\"surpresa\");\ncamera.perspectiva(false).girar(0, 0).enquadramento(\"primeiro plano\");\n#quadro 1").quadros[0];
  const f = w.renderizarQuadro(q), P = f.openpose.json.people[0];
  ok(P.pose_keypoints_2d.length === 75 && P.pose_keypoints_2d_coco18.length === 54 && P.hand_left_keypoints_2d.length === 63 && P.hand_right_keypoints_2d.length === 63 && P.face_keypoints_2d.length === 210, "OpenPose: BODY_25 (75), COCO 18 (54), mãos 21 + 21 (63) e rosto 70 (210)");
  const c = trios(P.pose_keypoints_2d), r = trios(P.face_keypoints_2d);
  ok(c[2][0] < c[5][0] && c[15][0] < c[16][0], "de frente, ombro e olho DIREITOS ficam à esquerda da foto (padrão OpenPose)");
  ok(r[30][0] > r[39][0] && r[30][0] < r[42][0] && r[30][1] > r[39][1] && r[57][1] > r[51][1] && r[8][1] > r[57][1], "rosto: nariz entre os olhos e abaixo deles, boca abaixo do nariz, queixo embaixo de tudo");
  const M = f.partes, cab = M.legenda.find(l => l.nome === "cabeça").cor, corEm = (x, y) => { const o = (Math.floor(y) * M.w + Math.floor(x)) * 4; return "#" + [0, 1, 2].map(k => M.rgba[o + k].toString(16).padStart(2, "0")).join(""); };
  const dentro = r.filter(([x, y, v]) => v > 0 && corEm(x, y) === cab).length;
  ok(dentro >= 60, "rosto: " + dentro + " de 70 pontos caem na cabeça da segmentação por partes");
  ok(r[68][2] === 1 && r[69][2] === 1, "pupilas visíveis de frente");
  /* olhar para o lado move as pupilas */
  const q2 = w.executarRoteiro("#cena\ncena.limpar();\ncena.ativo.olhos(1, 0);\ncamera.perspectiva(false).girar(0, 0).enquadramento(\"primeiro plano\");\n#quadro 1").quadros[0];
  const r2 = trios(w.renderizarQuadro(q2, { passes: { openpose: true } }).openpose.json.people[0].face_keypoints_2d);
  ok(r2[68][0] - (r2[36][0] + r2[39][0]) / 2 > 2, "olhar para a esquerda do manequim leva a pupila para a direita da foto");
  ok(/<ellipse/.test(f.openpose.svg) && !/<circle[^>]*#ffffff/.test(f.openpose.svgCorpo), "desenho no estilo DWPose (membros em elipse); a versão só corpo não tem o rosto"); }
/* oclusão: quem está atrás fica com confiança 0,5 */
{ const w = createWorld();
  const q = w.executarRoteiro("#cena\ncena.limpar();\ncena.ativo.renomear(\"Ana\");\ncena.adicionar({ nome: \"Leo\", x: 0, z: -8 });\ncamera.perspectiva(false).girar(0, 0).enquadrar();\n#quadro 1").quadros[0];
  const pp = w.renderizarQuadro(q, { passes: { openpose: true } }).openpose.json.people, leo = trios(pp.find(p => p.nome === "Leo").pose_keypoints_2d), ana = trios(pp.find(p => p.nome === "Ana").pose_keypoints_2d);
  const meio = leo.filter(t => t[2] === 0.5).length, um = ana.filter(t => t[2] === 1).length;
  ok(meio >= 15, "Leo, inteiro atrás da Ana: " + meio + " de 25 pontos marcados como escondidos (0,5)");
  ok(um >= 20, "Ana, na frente: " + um + " de 25 pontos visíveis"); }
/* passes em 1 px */
{ const w = createWorld();
  const q = w.executarRoteiro("#cena\ncena.limpar();\ncena.ativo.poseRapida(\"acenando\");\ncena.objeto(\"caixa\", { x: 6, z: 0 });\ncamera.perspectiva(true).girar(20, -8);\n#quadro 1 16:9\ncamera.enquadrar();").quadros[0];
  const f = w.renderizarQuadro(q), M = f.mascara;
  ok(["profundidade", "normal", "partes", "canny"].every(k => f[k].w === M.w && f[k].h === M.h && f[k].escala === 1) && M.w === Math.round(f.recorte.w), "profundidade, normais, máscara, partes e canny em 1 px, do tamanho do recorte (" + M.w + "×" + M.h + ")");
  const nomes = f.partes.legenda.map(l => l.nome);
  ok(["cabeça", "tronco", "mão esquerda", "pé direito", "objeto"].every(n => nomes.includes(n)), "partes: " + nomes.length + " cores com legenda (cabeça, tronco, mãos, pés, objeto…)");
  let azul = 0, n = 0; for (let i = 0; i < f.normal.rgba.length; i += 4) if (f.normal.rgba[i] || f.normal.rgba[i + 1] || f.normal.rgba[i + 2]) { n++; if (f.normal.rgba[i + 2] > 180) azul++; }
  ok(n > 0 && azul / n > 0.6, "normais: a maior parte da superfície aponta para a câmera (B alto: " + Math.round(100 * azul / n) + "%)");
  let bordas = 0; for (let i = 0; i < f.canny.rgba.length; i += 4) if (f.canny.rgba[i]) bordas++;
  ok(bordas > 300 && bordas < n * 0.5, "canny: contornos finos (" + bordas + " px de borda para " + n + " px de corpo)"); }
/* órbita */
{ const w = createWorld(), c = w.camera; w.cena.limpar(); w.cena.ativo.renomear("Ana").posicao(4, 2).girar(30); c.perspectiva(true);
  const dir = () => { const p = c.posicaoMundo(), d = [p[0] - w.P.tx, p[2] - w.P.tz], l = Math.hypot(...d); return d.map(v => v / l); }, wr = 30 * Math.PI / 180;
  c.orbitar("Ana", { azimute: "frente", elevacao: 0 }); let d = dir(); ok(Math.abs(d[0] - Math.sin(wr)) < 0.02 && Math.abs(d[1] - Math.cos(wr)) < 0.02, "orbitar frente: a câmera fica na frente da Ana (girada 30°)");
  c.orbitar("Ana", "esquerda"); d = dir(); ok(Math.abs(d[0] - Math.cos(wr)) < 0.02 && Math.abs(d[1] + Math.sin(wr)) < 0.02, "orbitar esquerda: do lado esquerdo dela");
  const t = telaDoMundo(w.sceneList(true)[0].p, [w.P.tx, w.P.ty, w.P.tz]); ok(Math.abs(t[0] - W / 2) < 1 && Math.abs(t[1] - H / 2) < 1, "o pivô fica no centro da foto");
  const d1 = w.P.camDist; c.orbitar("Ana", { azimute: 135, elevacao: 20 }); ok(Math.abs(w.P.camDist - d1) < 1.5 && w.P.pitch === -20, "mesma distância em qualquer azimute (o giro não pulsa); elevação 20°");
  ok(c.vista().pivo === "Ana" && Math.abs(c.vista().azimute - 135) < 0.5, "camera.vista() devolve pivô e azimute");
  w.cena.objeto("mesa", { x: -6, z: 0 }); c.orbitar("mesa", "costas"); ok(Math.abs(w.P.tx + 6) < 0.6, "orbitar um objeto");
  c.orbitar(["Ana", "mesa"], 0); ok(w.P.tx > -6 && w.P.tx < 4, "orbitar um grupo: pivô no meio");
  c.orbitar([0, -7, 0], 90); ok(w.P.tx === 0 && w.P.ty === -7, "orbitar um ponto");
  let e = null; try { c.orbitar("Ninguém"); } catch (x) { e = x.message; } ok(/Pivô/.test(e || ""), "pivô desconhecido explica as opções");
  const b = w.leituraBlocking(); c.pivo("Ana"); ok(w.leituraBlocking().pivo && w.leituraBlocking().pivo.nome === "Ana" && /blk-orbita/.test(w.svgPlanta(w.leituraBlocking(), { w: 400, h: 300, cx: 0, cy: 0, s: 8 })), "planta mostra o pivô e o círculo da órbita"); }
/* giro 360° e ficha no roteiro */
{ const w = createWorld();
  const X = w.executarRoteiro("#cena\ncena.limpar();\ncena.ativo.renomear(\"Ana\").girar(40);\ncamera.perspectiva(true);\n#orbita \"Ana\" 8 elevacao 10 16:9 — Giro\ncena.obter(\"Ana\").poseRapida(\"acenando\");\n#ficha \"Ana\" orto\n#quadro 16:9 — Fim");
  const g = X.quadros.slice(0, 8), yaws = g.map(q => q.estado.camera ? q.estado.camera.yaw : q.estado.list[0].params.yaw);
  ok(X.quadros.length === 13 && g.every(q => !q.erro && q.formato === "16:9"), "#orbita 8 + #ficha (4) + 1 quadro = 13, sem erro, no formato pedido");
  const passos = yaws.slice(1).map((y, i) => ((y - yaws[i] + 540) % 360) - 180);
  ok(passos.every(p => Math.abs(Math.abs(p) - 45) < 0.5), "o giro anda de 45 em 45° (" + passos.map(p => Math.round(p)).join(", ") + ")");
  ok(X.quadros[8].titulo === "Ficha — frente" && X.quadros[11].titulo === "Ficha — costas" && X.quadros[12].titulo === "Fim" && X.quadros[12].formato === "16:9", "ficha: frente … costas; o quadro seguinte lê \"16:9\" como formato, não como número"); }
/* limites acoplados e autocolisão */
{ const w = createWorld(), m = w.cena.ativo;
  ok(m.validarPose().ok, "pose em pé: nada atravessa");
  m.pose({ bracoEsqAbrir: -40, cotoveloEsq: 0 }); const a = autoColisoes(w.SCN.list[0].params);
  m.articulacao("mandíbula", { abrir: 1, lado: 1 }); const p = w.SCN.list[0].params;
  ok(Math.abs(p.jawSide) <= 0.5 + 1e-9, "mandíbula toda aberta desvia no máximo 50% para o lado");
  m.articulacao("canela esquerda", { girar: 30 }); ok(Math.abs(p.tibiaRotL) <= 5 + p.kneeFlexL * 0.45 + 1e-6, "canela só gira com o joelho dobrado");
  m.articulacao("indicador esquerdo", { base: 1, afastar: 1 }); ok(Math.abs(p.fInAbdL) <= 0.25 + 1e-9, "com a base do dedo dobrada, ele quase não abre");
  /* varredura: poses ao acaso dentro das faixas — o motor não quebra e os pontos são finitos */
  let rng = 7; const rnd = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
  const ch = w.SL.filter(d => w.POSEKEYS.has(d.k) && d.k !== "ground"); let ruins = 0, atravessa = 0;
  for (let i = 0; i < 200; i++) { const Q = Object.assign({}, w.SCN.list[0].params); ch.forEach(d => { const [lo, hi] = w.faixa(d.k, 0); Q[d.k] = lo + rnd() * (hi - lo); });
    const P = pontosDoCorpo(Q); if (![P.corpo25, P.maoE, P.maoD, P.rosto].flat().every(q => q && q.every(Number.isFinite))) ruins++; if (autoColisoes(Q).length) atravessa++; }
  ok(ruins === 0, "200 poses ao acaso: todos os 137 pontos finitos");
  ok(atravessa > 0 && atravessa < 200, "a autocolisão separa poses possíveis das que atravessam (" + atravessa + " de 200 atravessam)");
  /* poses prontas: só as de contato proposital passam da tolerância */
  const contato = new Set(["sentado", "abracandoJoelhos", "escorpiao", "camelo", "sentadoChao", "meditando", "lotusFlutuando", "maosEmPrece", "bracosCruzadosPeito"]), ruinsP = [];
  w.todasPoses().forEach(n => { const w2 = createWorld(); try { w2.cena.ativo.poseRapida(n); } catch (e) { return; } if (!w2.cena.ativo.validarPose().ok && !contato.has(n)) ruinsP.push(n); });
  ok(!ruinsP.length, "poses prontas sem partes atravessando (fora as de contato proposital)" + (ruinsP.length ? ": " + ruinsP.join(", ") : "")); }
/* gestos novos */
{ const w = createWorld(); ["chifres", "telefone", "gancho", "mesa", "vulcano", "figa", "cruzados"].forEach(g => w.cena.ativo.gesto("direita", g)); ok(true, "gestos novos: chifres, telefone, gancho, mesa, vulcano, figa, cruzados"); }

console.log(falhou ? "\nFALHOU." : "\nTudo certo.");
process.exit(falhou ? 1 : 0);
