/* GeoMannequin — conversa (gestos, atitudes, fala, papéis, ajustes finos) e animação (chaves, curvas, relativa, pés no chão,
   biblioteca, DSL, vídeo do name, GIF). Uso: node testes/animacao.mjs */
import { createWorld } from "../mcp/lib/core.mjs";

let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const M = 1 / 0.114;
const caps = (w, i = 0) => w.leituraBlocking().manequins[i].caps.flatMap(c => [c.a, c.b]);
const pes = (w, i = 0) => { const p = caps(w, i), y0 = Math.min(...p.map(q => q[1])); return p.filter(q => q[1] < y0 + 2.2); };

console.log("1. linguagem corporal");
{
  const w = createWorld(), it = w.SCN.list[0], antes = Object.assign({}, it.params);
  const r = w.aplicarGestoConversa(it, "bracosCruzados");
  ok(r.lados.length === 2 && Math.abs(it.params.armRotR - antes.armRotR) > 30 && Math.abs(it.params.elbowL - 115) < 1, "gesto nos dois braços (braços cruzados)");
  const w2 = createWorld(), i2 = w2.SCN.list[0]; w2.apiFor(i2).poseRapida("sentado", { molejo: 0 }); const sp = i2.params.spineFlex; w2.aplicarAtitude(i2, "troncoAFrente");
  ok(Math.abs(i2.params.spineFlex - sp - 22) < 0.5, "atitude soma à pose (sentado + tronco à frente)");
  const w3 = createWorld(), i3 = w3.SCN.list[0], p0 = pes(w3); w3.ajusteFino(i3, "pe direito", "pe", 15, "direita"); const p1 = pes(w3);
  const desl = Math.max(...p1.map((q, k) => Math.hypot(q[0] - p0[k][0], q[2] - p0[k][2]))) / M * 100;
  ok(desl > 9 && desl < 22, "ajuste fino: pé direito 15 cm para a direita (moveu " + desl.toFixed(0) + " cm)");
  const w4 = createWorld(), i4 = w4.SCN.list[0]; w4.falar(i4, "raiva", "abacate", 0);
  ok(i4.params.jawOpen > 0.15 && i4.params.browIn > 0, "fala no tom: boca aberta + raiva");
  const nomes = Object.keys(w4.PAPEIS_CONVERSA); let todos = true; for (const p of nomes) { const w5 = createWorld(); try { w5.aplicarPapel(w5.SCN.list[0], p, { semente: 2 }); } catch (e) { todos = false; console.log("   ", p, e.message); } }
  ok(todos && nomes.length >= 12, "todos os " + nomes.length + " papéis de conversa aplicam");
}

console.log("2. animação");
{
  const w = createWorld(), it = w.SCN.list[0];
  const a = w.criarAnimacao({ nome: "t", duracao: 1, curva: "linear", chaves: [{ t: 0, valores: { elbowR: 0 } }, { t: 0.5, valores: { elbowR: 90 } }, { t: 1, valores: { elbowR: 30 } }] });
  const s = [0, 0.25, 0.5, 0.75, 1].map(t => w.amostrar(a, t, it.params).valores.elbowR);
  ok(s[0] === 0 && Math.abs(s[1] - 45) < 1e-6 && s[2] === 90 && Math.abs(s[3] - 60) < 1e-6 && s[4] === 30, "interpolação linear passa pelas chaves: " + s.join(", "));
  const su = w.criarAnimacao(Object.assign({}, a, { curva: "suave" })); ok(w.amostrar(su, 0.125, it.params).valores.elbowR < 22.5, "curva suave começa devagar");
  const rel = w.bibliotecaAnimacoes().obter("abaixarCabeca"); let bom = true;
  for (const p of ["empe", "sentado", "agachar"]) { const w2 = createWorld(), i2 = w2.SCN.list[0]; w2.apiFor(i2).poseRapida(p, { molejo: 0 }); const h0 = i2.params.headPitch, sp0 = i2.params.spineFlex; w2.aplicarAnimacao(i2, rel, rel.duracao, { base: { params: Object.assign({}, i2.params) } });
    if (!(i2.params.headPitch > h0 + 10 && Math.abs(i2.params.spineFlex - sp0) < 0.01)) { bom = false; console.log("   ", p, h0, i2.params.headPitch); } }
  ok(bom, "animação relativa (abaixar a cabeça) funciona a partir de 3 poses e não mexe no resto");
  const andar = w.bibliotecaAnimacoes().obter("passoFrente"), fr = w.framesDaAnimacao(it, andar, { fps: 10 });
  const ys = fr.frames.map(f => { w.loadScene(f.estado); return Math.min(...caps(w).map(q => q[1])); }), g0 = w.leituraBlocking().chao;
  ok(ys.every(y => Math.abs(y - g0) < 1.2), "pés no chão durante o passo (pior " + Math.max(...ys.map(y => Math.abs(y - g0))).toFixed(2) + " R)");
  const fim = fr.frames[fr.frames.length - 1].estado.list[0].params; ok(Math.abs(fim.wz - 0.6 * M) < 0.5, "o passo anda 60 cm para frente");
  const enc = w.encadear([w.bibliotecaAnimacoes().obter("passoFrente"), w.bibliotecaAnimacoes().obter("acenarTchau")]); ok(Math.abs(enc.duracao - (0.7 + 1.2 + 0.15)) < 0.01, "encadear: passo + tchau (" + enc.duracao.toFixed(2) + " s)");
  const L = w.bibliotecaAnimacoes().listar(); ok(L.length >= 60 && L.every(x => x.tags && x.tags.length && x.partes && x.partes.length), L.length + " animações prontas, todas com tags e partes do corpo");
  ok(w.bibliotecaAnimacoes().listar({ tags: ["Ajuste/Pe"] }).length === 8 && w.bibliotecaAnimacoes().listar({ parte: "rosto" }).length >= 4, "busca por tag (8 ajustes de pé) e por parte do corpo (rosto)");
}

console.log("3. biblioteca");
{
  const w = createWorld(), B = w.bibliotecaAnimacoes(), a = w.animacaoDePoses(["empe", "agachar"], { duracao: 0.8 });
  ok(B.salvar(a, { nome: "abaixar", tags: ["Postura/Agachar"] }).versao === 1 && B.salvar(a, { nome: "abaixar" }).versao === 2 && B.obter("abaixar", 1), "salvar com versões");
  const w2 = createWorld(); ok(w2.bibliotecaAnimacoes().importar(B.exportar()) === 1 && w2.bibliotecaAnimacoes().obter("abaixar").tags[0] === "Postura/Agachar", "exportar → importar");
}

console.log("4. DSL e vídeo");
{
  const w = createWorld(), r = w.compilarName(`semente 4
elenco
  Ana relevante corpo feminino
  Leo relevante corpo masculino
animacao "chegar" duracao 1.4s tags "Locomocao/Chegar" salvar
  chave 0s pose empe
  chave 0.7s pose passo move frente 0.4
  chave 1.4s pose empe gesto acenar move frente 0.8
animacao "olharDeLado" duracao 0.5s relativa
  chave 0s
  chave 0.5s pescoco gira 30 coluna torce 10
local Sala unidade m
  chao retangulo -4,-4 a 4,4
quadro 1 local Sala plano americano alvo Ana, Leo duracao 1s
  dialogo Ana, Leo tom tenso
  Ana em (-0.8,0) olha Leo fala "Você mentiu!" tom raiva
  Leo em (0.8,0) olha Ana
quadro 2 continua plano medio alvo Leo duracao 1s camera-move aproxima
  Leo gesto encolherOmbros atitude cabecaInclinada pescoco inclina 10 pe direito 15cm para direita
quadro 3 continua plano inteiro alvo Leo
  Leo anima chegar depois olharDeLado
quadro 4 continua plano inteiro alvo Leo
  Leo anima chegar instante 0.7s
`);
  ok(r.ok && r.quadros.length === 4, "name com gestos, atitudes, diálogo, ajustes e animações compila (" + JSON.stringify(r.erros) + ")");
  ok(/falando \(raiva\)/.test(r.quadros[0].legenda) && /ouvinte cetico/.test(r.quadros[0].legenda), "legenda: quem fala (tom) e quem ouve (papel)");
  ok(w.bibliotecaAnimacoes().obter("chegar") && r.animacoes.find(a => a.nome === "olharDeLado").modo === "relativa", "bloco animacao: salva na biblioteca; relativa só com o que muda");
  const leo3 = r.quadros[2].estado.list.find(m => m.name === "Leo").params, leo4 = r.quadros[3].estado.list.find(m => m.name === "Leo").params;
  ok(leo3.wz - r.quadros[1].estado.list.find(m => m.name === "Leo").params.wz > 0.7 * M && Math.abs(leo3.headYaw) > 20, "anima … depois …: andou 80 cm e virou a cabeça");
  ok(Math.abs(leo4.wz - r.quadros[2].estado.list.find(m => m.name === "Leo").params.wz - 0.4 * M) < 0.6, "anima … instante 0.7s: meio do caminho (40 cm)");
  const v = w.videoDoName(r, { fps: 6 }); const q2 = v.frames.filter(f => f.quadro === 2);
  ok(v.frames.length >= 6 * 3 && q2[q2.length - 1].estado.camera.camDist < q2[0].estado.camera.camDist * 0.8, "vídeo do name: " + v.frames.length + " quadros; câmera aproxima no quadro 2");
  const q3 = v.frames.filter(f => f.quadro === 3), z = q3.map(f => f.estado.list.find(m => m.name === "Leo").params.wz); ok(z[z.length - 1] - z[0] > 0.6 * M, "vídeo: a animação toca dentro do quadro 3");
  const e = w.compilarName("elenco\n  A relevante\nquadro\n  A gesto explicr atitude cabecaBaxa anima chegr\n"); ok(e.erros.length >= 1 && /explicar/.test(e.erros[0].erro), "erros com sugestão: " + e.erros.map(x => x.erro).join(" | "));
  const rgba = new Uint8Array(40 * 30 * 4).fill(200), gif = w.criarGif([rgba, rgba, rgba], 40, 30, { atraso: 100 });
  ok(String.fromCharCode(...gif.slice(0, 6)) === "GIF89a" && gif[gif.length - 1] === 0x3b, "GIF animado válido");
}
if (falhou) { console.log("\nFALHOU"); process.exit(1); } else console.log("\nanimacao: tudo ok");
