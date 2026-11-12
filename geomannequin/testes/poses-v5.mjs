/* GeoMannequin — pose em código e Minhas poses, teclado e vistas de pose (articulações),
   cabeça V3 como padrão, orelhas da V3 abertas e cabeça V5 (anime).
   Uso: node testes/poses-v5.mjs  (precisa de mcp/node_modules) */
import { createWorld } from "../mcp/lib/core.mjs";
import { renderSvg } from "../mcp/lib/scene.mjs";
import { DEF, shape, earPointV3, ringAt, svgVistaPose, ossosDoCorpo, pontosDoCorpo, suavizarD, normalizarModeloCabeca } from "../src/engine/index.js";

let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const svgDe = w => { const r = renderSvg(w, {}); return typeof r === "string" ? r : r.svg; };

/* cabeça padrão */
{ const w = createWorld();
  ok(w.SCN.list[0].params.headModel === "v3_microgeometry" && DEF.headModel === "v3_microgeometry", "manequim novo nasce com a cabeça V3");
  const st = w.cena.estado(); delete st.list[0].params.headModel; const w2 = createWorld(); w2.cena.restaurar(st);
  ok(w2.SCN.list[0].params.headModel === "v1", "cena antiga sem modelo de cabeça continua com a V1 de quando foi feita");
  ok(normalizarModeloCabeca("v5") === "v5_anime" && normalizarModeloCabeca("anime") === "v5_anime" && normalizarModeloCabeca("xyz", null) === null, "apelidos v3/v5/anime");
}
/* orelhas da V3: abertas para fora do crânio, lóbulo mais colado, nunca dentro da cabeça */
{ const p = { ...DEF }, S = shape(p);
  const raiz = earPointV3(p, S, 1, 0.82, 0.3), borda = earPointV3(p, S, 1, -0.95, 0.3), lob = earPointV3(p, S, 1, -0.6, -0.85), lobRaiz = earPointV3(p, S, 1, 0.82, -0.85);
  ok(borda[0] - raiz[0] > 0.06, "a borda de trás da orelha sai " + (borda[0] - raiz[0]).toFixed(3) + " R do crânio (antes ≈ 0,02)");
  ok(lob[0] - lobRaiz[0] < borda[0] - raiz[0], "o lóbulo abre menos que o alto da orelha");
  let dentro = 0; for (let u = -1; u <= 1; u += 0.1) for (let v = -1; v <= 1; v += 0.1) { if (u * u + v * v > 1) continue; const q = earPointV3(p, S, 1, u, v); if (q[0] < ringAt(q[1], p, S)[0] * 0.6) dentro++; }
  ok(dentro === 0, "nenhum ponto da orelha dentro do crânio");
  const esp = earPointV3(p, S, -1, -0.5, 0.2); ok(esp[0] < 0 && Math.abs(esp[0] + earPointV3(p, S, 1, -0.5, 0.2)[0]) < 1e-9, "orelha esquerda espelha a direita");
}
/* pose em código: ida e volta, partes, espelhar, erros com linha, Minhas poses */
{ const w = createWorld(), m = w.cena.ativo;
  m.pose({ cotoveloDir: 70, bracoDirAbrir: 80, joelhoEsq: 40 });
  const cod = m.codigoPose({ nome: "Aceno" });
  ok(/^pose\("Aceno", \{$/m.test(cod) && /cotoveloDir: 70/.test(cod), "código legível com o nome da pose e nomes em português");
  const w2 = createWorld(); w2.cena.ativo.aplicarPose(cod);
  let dif = 0; w.POSEKEYS.forEach(k => { if (Math.abs((w.SCN.list[0].params[k] ?? 0) - (w2.SCN.list[0].params[k] ?? 0)) > 1e-3) dif++; });
  ok(dif === 0, "colar o código devolve exatamente a mesma pose (ida e volta)");
  const curto = m.codigoPose({ partes: "bracoDir", soMudancas: true });
  ok(/cotoveloDir: 70/.test(curto) && !/joelhoEsq/.test(curto), "código só do braço direito, só o que mudou");
  const w3 = createWorld(); w3.cena.ativo.aplicarPose(cod, { partes: "pernas" });
  ok(w3.SCN.list[0].params.kneeFlexL === 40 && w3.SCN.list[0].params.elbowR === 0, "aplicar só uma parte (pernas) não mexe no braço");
  const w4 = createWorld(); w4.cena.ativo.aplicarPose("pose({cotoveloDir: 70})", { espelhar: true });
  ok(w4.SCN.list[0].params.elbowL === 70 && w4.SCN.list[0].params.elbowR === 0, "espelhar leva o cotovelo direito para o esquerdo");
  let erro = ""; try { w4.cena.ativo.aplicarPose("pose({\n  cotoveloDir: 10,\n  joelhoX: 3\n})"); } catch (e) { erro = e.message; }
  ok(/^Linha 3: “joelhoX”/.test(erro) && /joelhoEsq/.test(erro), "erro aponta a linha e sugere o nome certo (" + erro + ")");
  erro = ""; try { w4.cena.ativo.aplicarPose("pose({ cotoveloDir 10 })"); } catch (e) { erro = e.message; } ok(/não entendi/.test(erro), "sintaxe errada explica o formato");
  ok(m.salvarPose("Aceno") === "Aceno" && m.salvarPose("Aceno") === "Aceno 2", "salvar numera nomes repetidos");
  const txt = w.cena.poses.exportar(), w5 = createWorld();
  ok(JSON.stringify(w5.cena.poses.importar(txt)) === JSON.stringify(["Aceno", "Aceno 2"]), "exportar e importar várias poses num texto só");
  const w6 = createWorld(); w6.cena.restaurar(w.cena.estado());
  ok(w6.cena.poses.lista().length === 2, "as poses salvas vão junto com a cena");
  w.cena.poses.renomear("Aceno 2", "Tchau"); w.cena.poses.apagar("Aceno");
  ok(w.cena.poses.lista().map(p => p.nome).join() === "Tchau", "renomear e apagar");
  /* pose(...) solto, como no editor de comandos */
  const w7 = createWorld(); w7.poseCmd({ cotoveloEsq: 33 }); w7.cena.poses.salvar("x"); w7.poseCmd({ cotoveloEsq: 0 }); w7.poseCmd("x");
  ok(w7.SCN.list[0].params.elbowL === 33, "pose({...}) e pose(\"nome salvo\") no editor de comandos");
  const lim = createWorld(); lim.cena.ativo.aplicarPose("pose({cotoveloDir: 999})");
  ok(lim.SCN.list[0].params.elbowR < 999, "limites anatômicos valem também no código colado");
}
/* teclado e arrasto das articulações */
{ const w = createWorld(), p = w.SCN.list[0].params;
  ok(JSON.stringify(w.eixosDaJunta({ k: "ombro", s: 1 })) === JSON.stringify(["armAbdL", "armFlexL", "armRotL"]), "ombro esquerdo: abrir, frente/trás, girar");
  ok(JSON.stringify(w.eixosDaJunta({ k: "dedo", s: -1, dedo: "In" })) === JSON.stringify(["fInAbdR", "fInMcpR", "fInIpR"]), "dedo indicador direito: afastar, base, ponta");
  const a0 = p.armAbdL; w.moverJunta(p, { k: "ombro", s: 1 }, 0, 1, "grande");
  ok(p.armAbdL === a0 + 10, "Shift+→ abre o braço 10°");
  for (let i = 0; i < 100; i++) w.moverJunta(p, { k: "cotovelo", s: -1 }, 1, 1, "grande");
  ok(p.elbowR > 100 && p.elbowR <= 160, "o cotovelo para no limite (" + p.elbowR + "°)");
  ok(w.moverJunta(p, { k: "joelho", s: 1 }, 2, 1) === null, "eixo que a junta não tem não faz nada");
  const ax = (j, v) => (w.planoDoArrasto({ ...DEF }, j, v) || {}).k;
  ok(ax({ k: "ombro", s: 1 }, "frente") === "armAbdL" && ax({ k: "ombro", s: 1 }, "lado") === "armFlexL", "arrastar o ombro: de frente abre, de lado leva à frente");
  ok(ax({ k: "joelho", s: 1 }, "lado") === "kneeFlexL" && ax({ k: "cabeca", s: 0 }, "cima") === "headYaw" && ax({ k: "quadril", s: -1 }, "frente") === "hipAbdR", "joelho de lado, cabeça de cima, quadril de frente");
}
/* vistas de pose e foco */
{ const p = { ...DEF }, E = ossosDoCorpo(p);
  const v = ["frente", "lado", "cima", "iso"].map(n => svgVistaPose(p, n, { esqueleto: E }));
  ok(v.every(r => r.juntas.length >= 13 && /<svg/.test(r.svg)), "quatro vistas com as juntas principais");
  ok(v[0].juntas.filter(j => j.k === "dedo").length === 0, "corpo inteiro: dedos escondidos para não poluir");
  const mao = svgVistaPose(p, "frente", { esqueleto: E, regiao: "maoDir" });
  ok(mao.juntas.filter(j => j.k === "dedo").length === 5 && mao.juntas.every(j => j.s === -1), "foco na mão direita: punho, mão e os 5 dedos");
  ok(mao.s > v[0].s * 4, "o foco aproxima (" + (mao.s / v[0].s).toFixed(1) + "×)");
  const fe = v[0].juntas.find(j => j.k === "ombro" && j.s === 1), fd = v[0].juntas.find(j => j.k === "ombro" && j.s === -1);
  ok(fe.x > fd.x, "de frente, o ombro esquerdo do manequim fica à direita da tela");
}
/* traço fechado de 0 a 2π não some na simplificação */
{ const pts = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * 2 * Math.PI; pts.push((100 + 30 * Math.cos(a)).toFixed(1) + " " + (100 + 20 * Math.sin(a)).toFixed(1)); }
  const d = suavizarD("M" + pts.join("L") + "Z"); ok(d.length > 60 && /C/.test(d), "elipse fechada continua elipse depois de simplificada");
}
/* cabeça V5 (anime) */
{ const linha = ex => { const w = createWorld(); w.cena.ativo.cabeca("v5"); if (ex) w.cena.ativo.expressao(ex); return svgDe(w); };
  const n = linha(""), g = linha("grito"), r = linha("riso"), c = linha("choro"), v3 = (() => { const w = createWorld(); return svgDe(w); })();
  const grupo = (s, id) => (s.match(new RegExp('<g id="' + id + '">([\\s\\S]*?)</g>')) || ["", ""])[1];
  const alturaOlhos = s => { const ys = []; for (const m of grupo(s, "olhos").matchAll(/d="([^"]*)"/g)) { const nn = m[1].match(/-?\d+\.?\d*/g).map(Number); for (let i = 1; i < nn.length; i += 2) ys.push(nn[i]); } return Math.max(...ys) - Math.min(...ys); };
  ok(/#fff/.test(grupo(n, "olhos")) && alturaOlhos(n) > alturaOlhos(v3) * 1.4, "V5: olhos grandes (" + (alturaOlhos(n) / alturaOlhos(v3)).toFixed(1) + "× a altura da V3) com íris, pupila e brilho");
  ok(/#F4EFE6/.test(grupo(g, "feicoes")) && (grupo(g, "feicoes").match(/<path/g) || []).length > (grupo(n, "feicoes").match(/<path/g) || []).length + 2, "V5 grito: cavidade, língua e dentes");
  ok(!/#fff/.test(grupo(r, "olhos")), "V5 riso: olhos fechados em arco (sem íris)");
  ok(/opacity:0\.[1-9]/.test(grupo(c, "olhos")) && (c.match(/opacity/g) || []).length > (n.match(/opacity/g) || []).length, "V5 choro: lágrimas");
  /* profundidade (A1/A2): órbita, cantos e sombra da pálpebra na esclera, limbo escuro, faixa clara e prega dupla;
     boca com fundo escuro, sombra do lábio nos dentes, língua com brilho e sulco, comissuras e lábio de baixo */
  const nPath = (s, id) => (grupo(s, id).match(/<path/g) || []).length;
  ok(nPath(n, "olhos") >= 2 * 15 && (grupo(n, "olhos").match(/opacity:0\.4/g) || []).length >= 4, "V5 olhos com profundidade: " + nPath(n, "olhos") + " formas");
  ok(/#F2B8B8/.test(grupo(g, "feicoes")) && /#F2B8B8/.test(grupo(r, "feicoes")) && !/#F2B8B8/.test(grupo(n, "feicoes")), "V5 boca aberta: língua com brilho (só quando abre)");
  ok(nPath(g, "feicoes") >= nPath(n, "feicoes") + 6, "V5 grito: fundo, sombra nos dentes, sulco, comissuras e lábio (" + nPath(n, "feicoes") + " → " + nPath(g, "feicoes") + ")");
  const pv3 = pontosDoCorpo({ ...DEF, jawOpen: 0.8, smile: 0.6 }).rosto, pv5 = pontosDoCorpo({ ...DEF, headModel: "v5_anime", jawOpen: 0.8, smile: 0.6 }).rosto;
  ok(pv5.length === 70 && pv5[54][0] - pv5[48][0] > (pv3[54][0] - pv3[48][0]) * 1.2 && pv5[39][0] - pv5[36][0] > (pv3[39][0] - pv3[36][0]) * 1.2, "OpenPose do rosto acompanha olhos e boca grandes da V5");
  const w = createWorld(); ["riso", "choro", "vergonha"].forEach(e => w.cena.ativo.expressao(e)); ok(w.SCN.list[0].params.blush === 1, "expressões novas: riso, choro, vergonha");
  let nan = 0; for (const ex of ["neutra", "alegria", "riso", "raiva", "tristeza", "choro", "surpresa", "medo", "grito", "vergonha", "sono", "desconfianca", "piscando"]) for (const az of [0, 35, 90, -35]) {
    const w2 = createWorld(); w2.cena.ativo.cabeca("v5"); w2.cena.ativo.expressao(ex); w2.camera.girar(az, 0); if (svgDe(w2).includes("NaN")) nan++; }
  ok(nan === 0, "V5: nenhum traço com NaN em 13 expressões × 4 ângulos");
}
console.log(falhou ? "FALHOU." : "Tudo certo.");
process.exit(falhou ? 1 : 0);
