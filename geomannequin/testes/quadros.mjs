/* GeoMannequin — roteiro de quadros: leitura, continuidade, "novo", erros com linha, cena aberta intacta, foto igual ao
   palco, OpenPose alinhado à máscara, página de mangá e comandos de enquadramento.
   Uso: node testes/quadros.mjs  (precisa de mcp/node_modules) */
import { createWorld } from "../mcp/lib/core.mjs";

let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };

/* leitura */
{ const w = createWorld();
  const R = w.lerRoteiro("#cena\ncena.limpar();\n\n#quadro 1 — Abertura\nlog(1);\n// fala: Ana: Oi!\n// nota: céu nublado\n# frame 2 novo 16:9 - Close\nlog(2);\n#quadro vertical\nlog(3);\n#quadro 7\n");
  ok(R.quadros.length === 4, "4 quadros (#quadro e # frame)");
  ok(R.quadros[0].titulo === "Abertura" && R.quadros[0].falas[0].quem === "Ana" && R.quadros[0].falas[0].texto === "Oi!" && R.quadros[0].notas[0] === "céu nublado", "título, fala com quem fala e nota");
  ok(R.quadros[1].n === 2 && R.quadros[1].novo && R.quadros[1].formato === "16:9" && R.quadros[1].titulo === "Close", "opções no marcador: novo, 16:9 e título");
  ok(R.quadros[2].n === 3 && R.quadros[2].formato === "vertical" && R.quadros[3].n === 7, "número automático e número dado");
  ok(R.preparacao.codigo.includes("cena.limpar") && R.quadros[0].inicio === 5, "preparação separada; linhas contadas"); }
/* continuidade, "novo", erro com a linha, cena aberta intacta */
{ const w = createWorld(); w.cena.ativo.renomear("Aberta").posicao(7, 3);
  const antes = JSON.stringify(w.sceneState());
  const X = w.executarRoteiro("#cena\ncena.limpar();\ncena.ativo.renomear(\"Ana\").posicao(0, 0);\n#quadro 1\ncena.obter(\"Ana\").mover(2, 0);\n#quadro 2\ncena.obter(\"Ana\").mover(2, 0);\n#quadro 3 novo\ncena.obter(\"Ana\").mover(1, 0);\n#quadro 4\nconst x = 1;\ncena.obter(\"Ninguém\");\n#quadro 5\ncena.obter(\"Ana\").mover(1, 0);");
  const xs = X.quadros.map(q => q.estado.list[0].params.wx);
  ok(xs[0] === 2 && xs[1] === 4, "cada quadro continua do anterior (x = " + xs.slice(0, 2) + ")");
  ok(xs[2] === 1, "\"novo\" recomeça da preparação (x = " + xs[2] + ")");
  ok(X.quadros[3].erro && X.quadros[3].linhaErro === 12, "erro no quadro 4 com a linha do roteiro (" + X.quadros[3].linhaErro + ")");
  ok(xs[4] === 2, "depois de um erro, o próximo continua do último estado bom (x = " + xs[4] + ")");
  ok(JSON.stringify(w.sceneState()) === antes && w.SCN.list[0].name === "Aberta", "a cena aberta volta como estava"); }
/* a foto do quadro = o mesmo código rodado no palco */
{ const w = createWorld(), cod = "cena.limpar();\ncena.ativo.poseRapida(\"acenando\").girar(30);\ncena.adicionar({ x: 6 });\ncamera.angulo(\"plongée\").enquadrar();";
  const q = w.executarRoteiro("#quadro 1\n" + cod).quadros[0], f = w.renderizarQuadro(q, { passes: false });
  new Function("cena", "camera", "tema", "log", cod)(w.cena, w.camera, w.tema, () => { });
  const r = w.renderScene(w.sceneList(true), Object.assign({}, w.L, { grid: false }), false, w.L.floor ? 16 : 0);
  const corpo = f.svg.replace(/^<svg[^>]*><rect[^>]*\/>/, "").replace(/<\/svg>$/, "");
  const semNomes = t => t.replace(/ data-camada="[^"]*"/g, "");
  ok(semNomes(corpo) === semNomes(r.svg), "quadro renderizado = mesmo código no palco (SVG idêntico, fora o nome automático)"); }
/* passes: OpenPose dentro da máscara do próprio personagem; profundidade com perto mais claro */
{ const w = createWorld();
  const X = w.executarRoteiro("#cena\ncena.limpar();\ncena.ativo.renomear(\"Ana\").posicao(-4, 0);\ncena.adicionar({ nome: \"Leo\", x: 4 }).poseRapida(\"acenando\");\ncamera.perspectiva(true).girar(20, -10).enquadrar();\n#quadro 1\n#quadro 2 16:9\ncamera.enquadramento(\"americano\", \"Leo\");");
  for (const q of X.quadros) {
    const f = w.renderizarQuadro(q), M = f.mascara, rc = f.recorte;
    const corDe = (x, y) => { const cx = Math.floor((x - rc.x + (rc.x % 2)) / 2), cy = Math.floor((y - rc.y + (rc.y % 2)) / 2); if (cx < 0 || cy < 0 || cx >= M.w || cy >= M.h) return null; const o = (cy * M.w + cx) * 4; return "#" + [0, 1, 2].map(k => M.rgba[o + k].toString(16).padStart(2, "0")).join(""); };
    let dentro = 0, tot = 0;
    f.openpose.json.people.forEach((pp, i) => { const cor = M.legenda.find(l => l.nome === pp.nome).cor; [1, 2, 5, 8, 11].forEach(k => { const x = pp.pose_keypoints_2d[k * 3] + rc.x, y = pp.pose_keypoints_2d[k * 3 + 1] + rc.y, c = pp.pose_keypoints_2d[k * 3 + 2]; if (!c) return; tot++;
      const vz = [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [3, 3], [-3, -3]].some(([dx, dy]) => corDe(x + dx, y + dy) === cor); if (vz) dentro++; }); });
    ok(tot > 0 && dentro / tot >= 0.8, "quadro " + q.n + ": pontos do OpenPose caem na máscara do próprio personagem (" + dentro + "/" + tot + ")");
    ok(f.profundidade.w === M.w && f.openpose.json.canvas_width === Math.round(rc.w), "quadro " + q.n + ": passes do mesmo tamanho do recorte (" + q.formato + ")");
  } }
/* formato do quadro: o enquadramento cabe no recorte (16:9), não no palco inteiro */
for (const cod of ["camera.enquadrar();", "camera.enquadramento(\"americano\");"]) { const w = createWorld();
  const q = w.executarRoteiro("#cena\ncena.limpar();\ncamera.perspectiva(true);\n#quadro 1 16:9\n" + cod).quadros[0], f = w.renderizarQuadro(q, { passes: { mascara: true } }), M = f.mascara;
  const linha = y => { for (let x = 0; x < M.w; x++) if (M.rgba[(y * M.w + x) * 4] || M.rgba[(y * M.w + x) * 4 + 1] || M.rgba[(y * M.w + x) * 4 + 2]) return true; return false; };
  let topo = -1; for (let y = 0; y < M.h; y++) if (linha(y)) { topo = y; break; }
  ok(topo > 0, "16:9 com " + cod + " a cabeça fica dentro do quadro (primeira linha com o corpo: " + topo + ")"); }
/* enquadramento e ângulo */
{ const w = createWorld(); w.cena.limpar(); w.camera.perspectiva(true).eixo("z");
  w.camera.enquadramento("close"); const d = w.leituraBlocking(), C = d.camera, cab = w.SCN.list[0];
  const fr = d.manequins[0].foto; ok(fr.frac > 2.2, "close: a pessoa inteira passaria de 2× a altura da foto (" + fr.frac.toFixed(2) + "×)");
  w.camera.enquadramento("inteiro"); ok(w.leituraBlocking().manequins[0].foto.inteiro, "inteiro: a pessoa cabe inteira");
  w.camera.angulo("holandes", 20); ok(w.P.roll === 20, "holandês inclina a câmera"); w.camera.angulo("contra-plongée"); ok(w.P.roll === 0 && w.P.pitch > 0, "contra-plongée: de baixo");
  let e = null; try { w.camera.enquadramento("panorâmico"); } catch (x) { e = x.message; } ok(/Enquadramento/.test(e || ""), "enquadramento desconhecido explica as opções");
  const est = w.cena.estado(); w.cena.ativo.posicao(9, 9); w.cena.restaurar(est); ok(w.SCN.list[0].params.wx !== 9, "cena.estado() e cena.restaurar()"); }
/* página, folha de contato e manifesto */
{ const w = createWorld(); const X = w.executarRoteiro(w.MODELOS_ROTEIRO["Diálogo entre dois"]);
  ok(X.quadros.length === 3 && X.quadros.every(q => !q.erro), "modelo \"Diálogo entre dois\" roda sem erro");
  const fotos = X.quadros.map(q => Object.assign(w.renderizarQuadro(q, { passes: false }), { falas: q.falas, titulo: q.titulo }));
  const pg = w.paginaQuadros(fotos.concat(fotos), { grade: "4", leitura: "japonesa" });
  ok(pg.length === 2 && (pg[0].match(/<image /g) || []).length === 4 && /Oi, Leo!/.test(pg[0]), "página: 6 quadros em grade 4 = 2 páginas, com balões");
  ok((w.folhaDeContato(fotos).match(/<image /g) || []).length === 3, "folha de contato com os 3 quadros");
  const man = w.manifestoQuadros(X.quadros, "x"); ok(man.quadros[1].pasta === "quadro-002_ana-fala" && man.quadros[2].falas[0].quem === "Leo", "manifesto com pastas numeradas na ordem e as falas");
  ["Briga em três tempos", "Caminhada (quadros seguidos)"].forEach(k => { const Y = w.executarRoteiro(w.MODELOS_ROTEIRO[k]); ok(Y.quadros.every(q => !q.erro), "modelo \"" + k + "\" roda sem erro"); }); }

console.log(falhou ? "\nFALHOU." : "\nTudo certo.");
process.exit(falhou ? 1 : 0);
