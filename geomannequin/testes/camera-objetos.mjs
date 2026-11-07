/* GeoMannequin — ordem de desenho das peças dos objetos, cone da câmera, zoom óptico e pontos de fuga dos objetos.
   Uso: node testes/camera-objetos.mjs  (precisa de mcp/node_modules) */
import { createWorld } from "../mcp/lib/core.mjs";
import * as E from "../src/engine/index.js";

let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const ordem = (w, yaw, pitch, persp) => { w.camera.perspectiva(persp !== false).girar(yaw, pitch); const lst = w.sceneList(true), o = lst.objetos[0];
  return E.desenharObjeto(o, lst[0].p, lst.palObjetos, lst.chao, w.L).info.ordemPartes; };

/* mesa redonda: peças 0 = tampo, 1 = coluna, 2 = base */
{ const w = createWorld(); w.SCN.list[0].oculto = true; w.cena.objeto("mesa redonda", {}); w.camera.mirar(0, -10, 0);
  for (const persp of [true, false]) {
    const cima = ordem(w, -30, -55, persp), baixo = ordem(w, 20, 30, persp);
    ok(cima.indexOf(0) > cima.indexOf(1) && cima.indexOf(1) > cima.indexOf(2), "mesa redonda de cima" + (persp ? "" : " (sem perspectiva)") + ": base, coluna e por último o tampo (" + cima + ")");
    ok(baixo.indexOf(1) > baixo.indexOf(0), "mesa redonda de baixo" + (persp ? "" : " (sem perspectiva)") + ": a coluna na frente do tampo (" + baixo + ")"); } }
/* cadeira de frente: as pernas da frente depois do assento visto de baixo; de trás, o encosto por último */
{ const w = createWorld(); w.SCN.list[0].oculto = true; w.cena.objeto("cadeira", {}); w.camera.mirar(0, -10, 0);
  const tras = ordem(w, 180, -20); ok(tras[tras.length - 1] === 5, "cadeira vista de trás: o encosto por último (" + tras + ")");
  const baixo = ordem(w, 0, 35); ok(baixo.indexOf(0) > baixo.indexOf(5), "cadeira vista de baixo: o assento na frente do encosto (" + baixo + ")"); }
/* cama: colchão e cabeceira não se atravessam (há um plano entre eles) */
{ const ps = E.partesDoObjeto(E.objetoPadrao("cama"), 0); ok(E.sobrepoePartes(ps[0], ps[1]) === null, "cama: colchão e cabeceira só se tocam"); }
/* cone: os cantos da pegada no chão caem nos cantos da foto, com a câmera inclinada e a tela deslocada */
{ const w = createWorld(); w.camera.perspectiva(true).lente(35, false).mirar(2, -4, -6).colocar(-12, 20, 20); w.P.panX = 1.5; w.P.panY = -0.8;
  const d = w.leituraBlocking(), C = d.camera, pe = w.pegadaNoChao(C, d.chao, 400), tela = pe.map(q => C.tela(q));
  const alvo = [[0, 0], [600, 0], [600, 700], [0, 700]];
  ok(tela.every((t, i) => Math.hypot(t.x - alvo[i][0], t.y - alvo[i][1]) < 1.5), "pegada no chão = cantos da foto (com inclinação e deslocamento): " + tela.map(t => Math.round(t.x) + "," + Math.round(t.y)).join(" "));
  /* linha de 25%: uma pessoa em pé ali ocupa 1/4 da altura da foto (a de 100% fica embaixo da câmera, então não aparece) */
  ok(w.distEscala(C, d.chao, d.alturaPessoa, 1) === null, "câmera alta e inclinada: não há lugar no chão em que a pessoa ocupe 100% (linha omitida)");
  const s = w.distEscala(C, d.chao, d.alturaPessoa, 0.25), fh = [C.frente[0], C.frente[2]], h = Math.hypot(...fh), p0 = [C.pos[0] + fh[0] / h * s, C.pos[2] + fh[1] / h * s];
  const a = C.tela([p0[0], d.chao, p0[1]]), b = C.tela([p0[0], d.chao + d.alturaPessoa, p0[1]]);
  ok(Math.abs(Math.abs(a.y - b.y) / 700 - 0.25) < 0.03, "linha de 25%: pessoa ali ocupa " + Math.round(Math.abs(a.y - b.y) / 7) + "% da foto"); }
/* zoom óptico: a câmera e o alvo ficam parados; só a lente e o ângulo mudam */
{ const w = createWorld(); w.camera.perspectiva(true).colocar(6, 4, 26); const C0 = w.cameraNoMundo(w.P);
  w.camera.zoomLente("2x"); const C1 = w.cameraNoMundo(w.P);
  ok(Math.hypot(...C0.pos.map((v, i) => v - C1.pos[i])) < 1e-6 && Math.hypot(...C0.alvo.map((v, i) => v - C1.alvo[i])) < 1e-6 && C1.lente === 100, "zoom 2x: 50 → 100 mm, câmera e alvo parados");
  w.camera.campo(90); const li = w.camera.lenteInfo(); ok(li.campoGraus === 90 && li.faixa === "grande-angular", "campo de 90°: " + li.lente + " mm, " + li.faixa);
  ok(w.faixaLente(50) === "normal" && w.faixaLente(135) === "tele", "faixas: 50 mm normal, 135 mm tele");
  const s = w.svgPlanta(w.leituraBlocking(), w.encaixar([[-20, -20], [20, 30]], 520, 420)); ok(/blk-cone lente-grande/.test(s) && /grande-angular · 18 mm/.test(s), "o cone muda de cor e mostra a faixa da lente"); }
/* perspectiva nos objetos novos: mesma câmera; pontos de fuga próprios dos objetos girados */
{ const w = createWorld(); w.cena.objeto("cubo", { x: 6, giro: 30 }); w.cena.horizonte(true); w.camera.perspectiva(true).girar(20, -15);
  const r = w.renderScene(w.sceneList(true), w.L, false, 0);
  ok(/stroke-dasharray:2 5/.test(r.svg), "horizonte ligado: guias do cubo até os pontos de fuga dele");
  const lst = w.sceneList(true), p = lst[0].p, o = lst.objetos[0], ps = E.partesDoObjeto(o, lst.chao)[0];
  /* arestas paralelas (direção do cubo) convergem: as duas retas projetadas se cruzam no ponto de fuga da direção */
  const tl = q => E.telaDoMundo(p, q), e = ps.e[0], c1 = [ps.c[0], ps.c[1] + ps.h[1], ps.c[2]], c2 = [ps.c[0] + ps.e[2][0] * ps.h[2], ps.c[1] - ps.h[1], ps.c[2] + ps.e[2][2] * ps.h[2]];
  const A = tl(c1), B = tl(c1.map((v, i) => v + e[i])), C2 = tl(c2), D2 = tl(c2.map((v, i) => v + e[i]));
  const cr = (a, b, c, d) => { const den = (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]); const t = ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / den; return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; };
  const X = cr(A, B, C2, D2), cam = E.makeXf(Object.assign({}, p, { wRot: 0 }))(e), d = Math.max(3, p.camDist), S = E.effScale(p), sg = cam[2] < 0 ? 1 : -1, cc = cam.map(v => v * sg);
  const V = [E.CX + S * (d * cc[0] / (-cc[2]) + p.panX), E.CY - S * (d * cc[1] / (-cc[2]) + p.panY)];
  ok(Math.hypot(X[0] - V[0], X[1] - V[1]) < 2, "arestas do cubo girado convergem no ponto de fuga da direção dele (erro " + Math.hypot(X[0] - V[0], X[1] - V[1]).toFixed(2) + " px)"); }

console.log(falhou ? "\nFALHOU." : "\nTudo certo.");
process.exit(falhou ? 1 : 0);
