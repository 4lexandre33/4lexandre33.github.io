/* GeoMannequin — blocking: as vistas de cima e lateral leem e escrevem o MESMO estado da cena.
   Uso: node testes/blocking.mjs  (precisa de mcp/node_modules) */
import { createWorld } from "../mcp/lib/core.mjs";

let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const perto = (a, b, e) => Math.abs(a - b) <= (e || 0.06);

/* ida e volta: mover pela planta escreve wx/wz; a leitura devolve o mesmo; nada é copiado */
{ const w = createWorld(); w.cena.adicionar({ x: 6 });
  const id = w.SCN.list[1].id; w.moverManequim(id, -4.3, 7.1); w.girarManequim(id, 200);
  const d = w.leituraBlocking(), q = d.manequins.find(m => m.id === id);
  ok(perto(w.SCN.list[1].params.wx, -4.3) && perto(w.SCN.list[1].params.wz, 7.1), "mover na planta escreve wx/wz do manequim");
  ok(perto(q.x, -4.3) && perto(q.z, 7.1) && q.giro === -160, "a planta lê de volta a mesma posição e o giro (−160°)");
  w.cena.obter(1).posicao(2, -3); const d2 = w.leituraBlocking(); ok(perto(d2.manequins[1].x, 2) && perto(d2.manequins[1].z, -3), "mudança feita por código aparece na planta");
  w.apontarManequim(id, 2, 10); ok(perto(w.SCN.list[1].params.wRot, 0, 1), "virar para um ponto da planta (de frente para +z)"); }
/* câmera: a posição no mundo calculada bate com camera.posicao; mover a câmera mantém o alvo */
{ const w = createWorld(); w.camera.perspectiva(true).mirar(1, 2, -1).posicao(14, 8, 20);
  const C = w.cameraNoMundo(w.P);
  ok(perto(C.pos[0], 14, 0.3) && perto(C.pos[1], 8, 0.3) && perto(C.pos[2], 20, 0.3), "posição da câmera no mundo = a que camera.posicao pôs (" + C.pos.map(v => v.toFixed(2)).join(", ") + ")");
  w.moverCamera(-10, 5, 12); const C2 = w.cameraNoMundo(w.P);
  ok(perto(C2.pos[0], -10, 0.3) && perto(C2.pos[2], 12, 0.3) && perto(C2.alvo[0], 1) && perto(C2.alvo[2], -1), "arrastar a câmera mantém o alvo");
  w.moverAlvo(3, 2, 0); const C3 = w.cameraNoMundo(w.P);
  ok(perto(C3.pos[0], -10, 0.3) && perto(C3.pos[2], 12, 0.3) && perto(C3.alvo[0], 3), "arrastar o alvo mantém a câmera no lugar");
  w.abrirCone(60); ok(perto(w.cameraNoMundo(w.P).fovH, 60, 2), "abrir o cone para 60° muda a lente (" + w.P.lens + " mm)"); }
/* profundidade = perspectiva: mais longe da câmera → menor na foto; sem perspectiva o tamanho não muda */
{ const w = createWorld(); w.cena.adicionar({ x: 0, z: -25 }); w.camera.perspectiva(true).posicao(0, 0, 30);
  let d = w.leituraBlocking(); const [a, b] = d.manequins.map(m => m.foto.frac);
  ok(b < a * 0.8 && d.manequins[1].foto.prof > d.manequins[0].foto.prof, "com perspectiva, quem está mais fundo ocupa menos da foto (" + Math.round(a * 100) + "% × " + Math.round(b * 100) + "%)");
  w.camera.perspectiva(false); d = w.leituraBlocking(); const [a2, b2] = d.manequins.map(m => m.foto.frac);
  ok(Math.abs(a2 - b2) < 0.02, "sem perspectiva, a profundidade não muda o tamanho (" + Math.round(a2 * 100) + "% e " + Math.round(b2 * 100) + "%)"); }
/* o tamanho na foto calculado pela planta bate com o desenho de verdade */
{ const w = createWorld(); w.camera.perspectiva(true).girar(-25, -8); w.cena.enquadrar();
  const r = w.renderScene(w.sceneList(true), Object.assign({}, w.L, { grid: false }), true, 0), bb = r.infos[0].bb, S = w.cameraNoMundo(w.P).S;
  const frac = w.leituraBlocking().manequins[0].foto.frac, real = (bb[3] - bb[2]) * S / 700;
  ok(Math.abs(frac - real) < 0.06, "altura na foto: planta " + Math.round(frac * 100) + "% × desenho " + Math.round(real * 100) + "%"); }
/* manequim atrás da câmera ou fora do cone */
{ const w = createWorld(); w.cena.adicionar({ x: 40 }); w.camera.perspectiva(true).posicao(0, 0, 25); w.cena.adicionar({ x: 0, z: 40 });
  const d = w.leituraBlocking(); ok(!d.manequins[1].foto.dentro && d.manequins[2].foto.atras, "manequim fora do quadro e atrás da câmera são reconhecidos"); }
/* vista lateral: perpendicular à câmera, o eixo horizontal é a profundidade */
{ const w = createWorld(); w.cena.adicionar({ x: 3, z: -12 }); w.camera.perspectiva(true).girar(35, -5);
  const d = w.leituraBlocking(), E = w.eixoPerfil(d, "camera"), u = p => (p[0] - E.o[0]) * E.r[0] + (p[2] - E.o[2]) * E.r[2];
  ok(d.manequins.every(m => Math.abs(u([m.x, 0, m.z]) - m.foto.prof) < 4), "lateral (lado da câmera): horizontal ≈ profundidade de cada manequim");
  const s1 = w.svgPlanta(d, w.encaixar([[0, 0], [10, 10]], 520, 420)), s2 = w.svgPerfil(d, w.encaixar([[0, 0], [10, 10]], 520, 340), "camera");
  ok(/data-k="cam"/.test(s1) && /data-k="alvo"/.test(s1) && (s1.match(/data-k="m:/g) || []).length === 2, "planta: 2 manequins, câmera e alvo");
  ok(/blk-chao/.test(s2) && /olhos a/.test(s2) && (s2.match(/data-k="m:/g) || []).length === 2, "perfil: chão, altura dos olhos e os 2 manequins"); }
/* código: cena.blocking() e camera.colocar() */
{ const w = createWorld(); w.camera.perspectiva(true).colocar(0, 5, 25); const b = w.cena.blocking();
  ok(b.camera.perspectiva && b.manequins.length === 1 && Math.abs(b.camera.posicao[2] - 25 * 0.114) < 0.05, "cena.blocking() em metros e camera.colocar()"); }

console.log(falhou ? "\nFALHOU." : "\nTudo certo.");
process.exit(falhou ? 1 : 0);
