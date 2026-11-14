/* GeoMannequin — chão e pés (auditor, ciclo), escala e apoio, animais e montaria, página de HQ e balões, webtoon, diretor (eixo),
   câmera em percurso, vertigo, câmera lenta e congelar. Uso: node testes/hq-animais-video.mjs */
import { createWorld } from "../mcp/lib/core.mjs";
let falhou = false; const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const M = 1 / 0.114, w = createWorld(), comp = t => w.compilarName(t, { semCache: true, salvar: false });

console.log("1. chão e pés");
{ const r = w.auditarAnimacoes({ nomes: ["andarCiclo", "passoFrente", "acenarTchau", "agachar", "puloAlto"], fps: 20 });
  ok(r.ruins === 0, "auditor: 5 animações dentro do limite (" + r.problemas.join("; ") + ")");
  const a = r.itens.find(x => x.nome === "andarCiclo"); ok(a.escorregaCmS < 2 && a.afundaCm > -1.5, "andar: pé apoiado parado (" + a.escorregaCmS + " cm/s) e sem afundar (" + a.afundaCm + " cm)");
  const v = w.auditarAnimacoes({ nomes: ["andarCiclo"], limites: { escorrega: -1 } }); ok(v.ruins === 1, "auditor acusa quando o limite é ultrapassado"); }

console.log("2. escala, voo e apoio");
{ const r = comp('filme "E" fps 6\nelenco\n  Golias gigante 4\n  Lumi fada\n  Toco anao\nlocal "P" unidade m\n  chao retangulo -14,-14 a 14,14\n  caixa "c" em (2.5,2) tamanho 1x1x1 inclina 30\ncena "P" local "P"\n  plano 1 duracao 1s\n    Golias em (0,-3)\n    Lumi em (0,2)\n    Toco em (1,1)\n    Lumi sobre-mao Golias\n    camera plano geral alvo Golias\n');
  ok(!r.erros.length, "compila (" + JSON.stringify(r.erros) + ")");
  const v = w.videoDoFilme(r, { fps: 6, vida: false }), e = v.frames[0].estado, G = e.list.find(x => x.name === "Golias").params, L = e.list.find(x => x.name === "Lumi").params, T = e.list.find(x => x.name === "Toco").params;
  ok(Math.abs(G.tamanho - 4) < 1e-6 && L.tamanho < 0.2 && T.tamanho < 0.7 && T.legLen < 0.9, "gigante 4×, fada < 0,2×, anão com pernas curtas");
  w.loadScene(JSON.parse(JSON.stringify(e))); const lb = w.leituraBlocking(), li = w.SCN.list.findIndex(x => x.name === "Lumi"), pes = Math.min(...lb.manequins[li].caps.flatMap(c => [c.a[1], c.b[1]])) - lb.chao;
  ok(pes / M > 2, "a fada está no alto, sobre a mão do gigante (pés a " + (pes / M).toFixed(2) + " m do chão)");
  const cx = e.objetos.find(o => o.nome === "c"); ok(cx && cx.rot3, "objeto inclinado tem orientação 3D"); }

console.log("3. animais e montaria");
{ const r = comp('filme "C" fps 10\nelenco\n  Kai relevante\n  Trovão animal cavalo\n  Rex animal cachorro\nlocal "Campo" unidade m\n  chao retangulo -30,-30 a 30,30\ncena "Campo" local "Campo"\n  plano 1 duracao 3s\n    Trovão em (0,0)\n    Rex em (-2,-2) segue Kai\n    Kai monta Trovão\n    camera segue Trovão lado direita distancia 6m altura 2m\n    0s Trovão galopa 10m\n');
  ok(!r.erros.length, "compila (" + JSON.stringify(r.erros) + ")");
  const v = w.videoDoFilme(r, { fps: 10, vida: false }), f0 = v.frames[0].estado, f1 = v.frames[v.frames.length - 1].estado, T0 = f0.objetos.find(o => o.nome === "Trovão"), T1 = f1.objetos.find(o => o.nome === "Trovão");
  ok(Math.hypot(T1.x - T0.x, T1.z - T0.z) / M > 8, "galope andou " + (Math.hypot(T1.x - T0.x, T1.z - T0.z) / M).toFixed(1) + " m");
  w.loadScene(JSON.parse(JSON.stringify(f1))); const o = w.amAchar("Trovão"), kai = w.SCN.list.find(x => x.name === "Kai"), sela = w.qdPontoMundo(o, "sela", w.amChaoMundo());
  ok(kai.montadoEm === "Trovão" && Math.hypot(kai.params.wx - sela[0], kai.params.wz - sela[2]) < 1, "o cavaleiro acompanha a sela no fim do galope");
  const Rx = f1.objetos.find(x => x.nome === "Rex"), Rx0 = f0.objetos.find(x => x.nome === "Rex"); ok(Math.hypot(Rx.x - Rx0.x, Rx.z - Rx0.z) / M > 2, "o cachorro segue (andou " + (Math.hypot(Rx.x - Rx0.x, Rx.z - Rx0.z) / M).toFixed(1) + " m)");
  ok(Object.keys(w.QD_ESPECIES).length >= 13, "13+ espécies"); }

console.log("4. página, balões, webtoon, diretor");
{ const txt = 'elenco\n  Kai relevante\n  Mira relevante\nlocal "Rua" unidade m\n  chao retangulo -10,-10 a 10,10\npagina formato manga leitura japonesa\nquadro 1 local "Rua" plano medio alvo Kai, Mira\n  Kai em (0,0) vira-para Mira\n  Mira em (1.3,0) vira-para Kai\n  Kai fala "Você viu aquilo?"\n  Mira pensa "Ele mente."\nquadro 2 plano close alvo Mira borda diagonal\n  Mira grita "SAI!"\nquadro 3 plano medio alvo Kai ritmo cena\n  narra "Depois."\n';
  const r = comp(txt); ok(!r.erros.length, "compila (" + JSON.stringify(r.erros) + ")");
  const fotos = r.quadros.map(q => w.renderizarQuadro(q, { passes: false })), pg = w.hqPaginas(r, fotos, { largura: 900 });
  ok(pg.length === 1 && /clipPath/.test(pg[0].svg) && pg[0].quadros.length === 3, "uma página com 3 quadros e recorte (diagonal)");
  const c1 = fotos[0].cabecas; ok(c1 && c1.Kai && c1.Mira, "cabeças na tela de cada quadro (para os balões)");
  const bal = w.hqBaloes ? null : null; void bal;
  ok((pg[0].svg.match(/<path|<ellipse|<rect|<polygon/g) || []).length >= 6 && /aquilo\?/.test(pg[0].svg) && /SAI!/.test(pg[0].svg) && /Depois\./.test(pg[0].svg), "balões com as falas, o grito e a narração");
  const t = w.hqWebtoon(r, fotos, {}); ok(t.quadros.length === 3 && t.quadros[2].y - (t.quadros[1].y + t.quadros[1].h) > 300, "webtoon: troca de cena = espaço grande (" + (t.quadros[2].y - t.quadros[1].y - t.quadros[1].h) + " px)");
  const d = comp('diretor auto\nelenco\n  Kai relevante\n  Mira relevante\nlocal "P" unidade m\n  chao retangulo -10,-10 a 10,10\nquadro 1 local "P"\n  Kai em (0,0) vira-para Mira\n  Mira em (1.3,0) vira-para Kai\nquadro 2\n  Kai fala "Oi"\nquadro 3\n  Mira fala "Oi"\nquadro 4\n  Mira expressao surpresa\n  Mira grita "O QUÊ?"\n');
  ok(!d.erros.length && d.quadros[0].planoUsado !== d.quadros[3].planoUsado && /close|primeiro/.test(d.quadros[3].planoUsado || ""), "diretor: geral no começo, close no grito (" + d.quadros.map(q => q.planoUsado).join(", ") + ")");
  const lado = q => { w.loadScene(JSON.parse(JSON.stringify(q.estado || q.cena || {}))); return 0; }; void lado;
  const alts = w.alternativasDeQuadro(txt, 2, 6); ok(alts.length === 6 && alts.every(a => comp(a.texto).erros.length === 0), "6 alternativas do quadro 2, todas compilam"); }

console.log("5. vídeo avançado");
{ const r = comp('filme "V" fps 8\nelenco\n  Kai\nlocal "P" unidade m\n  chao retangulo -15,-15 a 15,15\ncena "A" local "P"\n  plano 1 duracao 4s\n    Kai em (0,-4)\n    camera caminho (-6,1.6,-6) (0,2.5,-8) (6,3,-4) em 4s olha Kai\n    0s Kai anda por (0,0) (2,1)\n  plano 2 duracao 2s lento 50% congela 1s por 1s\n    camera plano medio alvo Kai\n    0s camera vertigo aproxima 50 em 2s linear\n');
  ok(!r.erros.length, "compila (" + JSON.stringify(r.erros) + ")");
  const v = w.videoDoFilme(r, { fps: 8, vida: false }), p2 = v.planos[1]; ok(Math.abs((p2.fim - p2.inicio) - 5) < 0.2, "lento 50% + congela 1 s: plano de 2 s vira " + (p2.fim - p2.inicio).toFixed(2) + " s de tela");
  const th = v.frames.slice(p2.quadros[0], p2.quadros[1] + 1).map(f => f.th); ok(th.filter(x => Math.abs(x - 1) < 1e-6).length >= 7, "a imagem congela em 1 s (" + th.filter(x => Math.abs(x - 1) < 1e-6).length + " quadros iguais)");
  const C = i => w.cameraNoMundo(v.frames[i].estado.camera || {}); void C;
  const cam = r.quadros[0].filme.cam.find(c => c.base && c.base.modo === "caminho"); ok(cam && cam.base.pts.length === 3 && cam.base.dur === 4, "câmera em percurso por 3 pontos em 4 s");
  const lent = v.frames.slice(p2.quadros[0], p2.quadros[1] + 1).map(f => f.estado.camera && f.estado.camera.lens).filter(Boolean); ok(lent.length && lent[lent.length - 1] < lent[0] * 0.7, "vertigo: a lente compensa a aproximação (" + lent[0] + " → " + lent[lent.length - 1] + " mm)");
  const kp = f => f.estado.list.find(x => x.name === "Kai").params, k0 = kp(v.frames[0]), k1 = kp(v.frames[p2.quadros[0] - 1]); ok(Math.hypot(k1.wx - k0.wx, k1.wz - k0.wz) / M > 2, "anda por um percurso");
  const ro = w.roteiroDoFilme(r).json.planos; ok(ro[1].velocidade === 0.5 && ro[0].trilha.some(e => e.linha), "lista de planos com velocidade e linhas (linha do tempo)"); }

console.log(falhou ? "\nFALHOU" : "\ntudo certo"); process.exit(falhou ? 1 : 0);
