/* GeoMannequin — olhar natural, girar no lugar (passos, pivô, luta, salto), andar até, diálogo de frente, fps 1–60, em dois,
   velocidade/segurar, câmera com chaves, boca no ritmo da fala, esbarrões. Uso: node testes/movimento.mjs */
import { createWorld } from "../mcp/lib/core.mjs";

let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const M = 1 / 0.114;

console.log("1. olhar natural (olhos → cabeça → tronco → corpo)");
{
  let piores = 0, n = 0, giros = 0;
  for (const ang of [0, 20, 45, 70, 90, 120, 150, 180, -30, -60, -100, -135, -170]) for (const alt of [0.3, 1.6]) {
    if (n >= 20) break; const w = createWorld(), it = w.SCN.list[0], a = ang * Math.PI / 180, alvo = [Math.sin(a) * 2 * M, alt * M, Math.cos(a) * 2 * M];
    const r = w.olharNatural(it, alvo); const e = w.anguloNaCabeca(it, alvo), resto = Math.hypot(Math.max(0, Math.abs(e.yaw) - 35), Math.max(0, Math.abs(e.pit) - 25));
    if (!r.alcancou || resto > 10) { piores++; console.log("    ", ang, alt, JSON.stringify(r)); } if (r.virouCorpo) giros++; n++; }
  ok(piores === 0, "20 alvos em volta (frente, lados, atrás, alto e baixo): cabeça + olhos chegam (erro < 10°)");
  ok(giros >= 6, "alvos atrás viram o corpo (" + giros + " de 20)");
  const w = createWorld(), it = w.SCN.list[0], r = w.olharNatural(it, [0, 1.5 * M, -3 * M], { modo: "so-cabeca" });
  ok(!r.alcancou && it.params.wRot === 0, "só-cabeça não vira o corpo e avisa que não alcança atrás");
  const w2 = createWorld(), i2 = w2.SCN.list[0], r2 = w2.olharNatural(i2, [2 * M, 1.5 * M, 0.5 * M]); ok(Math.abs(i2.params.eyeYaw) > 0.05 && r2.alcancou, "os olhos ajudam (eyeYaw " + i2.params.eyeYaw.toFixed(2) + ")");
}

console.log("2. diálogo e DSL do olhar");
{
  const w = createWorld();
  const txt = arr => `elenco\n  Kai relevante\n  Mira relevante\nquadro 1 plano americano alvo Kai, Mira\n  dialogo Kai, Mira tom calmo ${arr}\n  Kai em (-0.8,0) fala "Oi"\n  Mira em (0.8,0.3)\n`;
  const r = w.compilarName(txt("")), K = r.quadros[0].estado.list.find(m => m.name === "Kai").params, Mi = r.quadros[0].estado.list.find(m => m.name === "Mira").params;
  const fr = (p, q) => { const a = Math.atan2(q.wx - p.wx, q.wz - p.wz) * 180 / Math.PI; return Math.abs(((a - p.wRot) % 360 + 540) % 360 - 180); };
  ok(fr(K, Mi) < 5 && fr(Mi, K) < 5, "diálogo: os corpos ficam de frente um para o outro");
  ok(/olhando para Mira/.test(r.quadros[0].legenda) && /olhando para Kai/.test(r.quadros[0].legenda), "legenda diz para quem cada um olha");
  const r2 = createWorld().compilarName(txt("lado-a-lado")), K2 = r2.quadros[0].estado.list.find(m => m.name === "Kai").params;
  ok(Math.abs(K2.headYaw) > 30 && r2.avisos.length === 0, "lado-a-lado: corpos para a frente, cabeças viradas (headYaw " + Math.round(K2.headYaw) + "), sem aviso");
  const r3 = createWorld().compilarName("elenco\n  Kai relevante\n  Mira relevante\nquadro\n  Kai em (0,0) olha Mira so-cabeca\n  Mira em (0,-2)\n");
  ok(r3.avisos.some(a => /não consegue olhar/.test(a)) && /tentando olhar/.test(r3.quadros[0].legenda), "olhar impossível vira aviso e a legenda é honesta");
}

console.log("3. girar no lugar");
{
  for (const [nome, ang] of [["girar360E", 0], ["girar360D", 0], ["girar90E", 90], ["girar180D", -180], ["girar45D", -45], ["girar360E_pivo", 0], ["girar360D_luta", 0], ["girar360E_salto", 0]]) {
    const w = createWorld(), an = w.bibliotecaAnimacoes().obter(nome), f = w.framesDaAnimacao(w.SCN.list[0], an, { fps: 30 });
    let pior = 0, ant = null; for (const q of f.frames) { w.loadScene(q.estado); const p = w.pesDoManequim(w.SCN.list[0]), ap = w.apoioNoTempo(an, q.t); if (ant && (ap === "L" || ap === "R") && ap === ant.ap) pior = Math.max(pior, Math.hypot(p[ap].x - ant.p[ap].x, p[ap].z - ant.p[ap].z) / M * 100); ant = { p, ap }; }
    const e = f.frames[f.frames.length - 1].estado.list[0].params, fim = Math.abs(((e.wRot - ang) % 360 + 540) % 360 - 180);
    ok(pior < 3 && fim < 1 && Math.hypot(e.wx, e.wz) / M < 0.25, nome + ": pé de apoio parado (" + pior.toFixed(1) + " cm/quadro), ângulo final exato, sai do lugar " + (Math.hypot(e.wx, e.wz) / M * 100).toFixed(0) + " cm");
  }
  const w = createWorld(), r = w.compilarName("elenco\n  Kai relevante\n  Mira relevante\nquadro\n  Kai em (0,0) gira 360 passos direita\n  Mira em (2,0)\nquadro 2 continua\n  Kai vira-para Mira passos\n");
  const a1 = r.quadros[0].animacoes[0], k2 = r.quadros[1].estado.list.find(m => m.name === "Kai").params;
  ok(r.ok && a1 && /girar360D/.test(a1.anim.nome) && Math.abs(Math.abs(k2.wRot) - 90) < 3, "DSL: gira 360 passos direita · vira-para Mira passos (fica a " + k2.wRot + "°)");
}

console.log("4. andar até");
{
  const w = createWorld(), r = w.compilarName("elenco\n  Kai relevante\n  Mira relevante\nlocal Sala unidade m\n  chao retangulo -6,-6 a 6,6\n  caixa \"Caixa\" em (0,1.5) tamanho 0.8x0.8x1.2\nquadro local Sala\n  Kai em (0,0)\n  Mira em (0,3)\nquadro 2 continua\n  Kai anda-ate Mira\n");
  const k = r.quadros[1].estado.list.find(m => m.name === "Kai").params, d = Math.hypot(k.wx, k.wz - 3 * M) / M, an = r.quadros[1].animacoes[0].anim;
  ok(r.ok && Math.abs(d - 0.9) < 0.25 && /desviando/.test(an.descricao), "anda-ate Mira: para a ~90 cm dela (" + d.toFixed(2) + " m) e desvia da caixa (" + an.descricao + ")" + JSON.stringify(r.erros));
}

console.log("5. tempo: fps 1–60, em dois, velocidade, segurar");
{
  const w = createWorld(), an = w.bibliotecaAnimacoes().obter("acenarTchau");
  const n = [1, 12, 24, 60].map(fps => w.framesDaAnimacao(w.SCN.list[0], an, { fps }).frames.length);
  ok(n.every((x, i) => x === Math.round(an.duracao * [1, 12, 24, 60][i]) + 1), "fps 1/12/24/60 → " + n.join("/") + " quadros");
  const e2 = w.framesDaAnimacao(w.SCN.list[0], an, { fps: 24, emDois: true }); ok(e2.desenhos <= Math.ceil(e2.frames.length / 2) + 1 && e2.frames.length === n[2], "em dois: " + e2.frames.length + " quadros, " + e2.desenhos + " desenhos");
  const rt = w.retimar(an, { velocidade: 2, segurar: { [an.chaves[1].t]: 0.5 } }); ok(Math.abs(rt.duracao - (an.duracao / 2 + 0.5)) < 1e-6, "velocidade 2 + segurar 0.5s (" + rt.duracao.toFixed(2) + " s)");
  const r = w.compilarName("video fps 30 em-dois\nelenco\n  A relevante\nanimacao \"x\" duracao 1s velocidade 2\n  chave 0s pose empe\n  chave 0.5s pose agachar segurar 0.25s\n  chave 1s pose empe\nquadro\n  A em (0,0) anima x\n");
  ok(r.video && r.video.fps === 30 && r.video.passo === 2 && Math.abs(r.animacoes[0].duracao - 0.75) < 1e-6, "DSL: video fps 30 em-dois · animacao velocidade 2 · chave segurar");
  ok(createWorld().compilarName("animacao \"y\" fps 90\n  chave 0s pose empe\n").erros.length === 1, "fps fora de 1–60 dá erro");
}

console.log("6. vídeo: câmera com chaves, boca no ritmo, vida, esbarrões");
{
  const w = createWorld(), r = w.compilarName(`elenco\n  Kai relevante\n  Mira relevante\nquadro 1 plano americano alvo Kai, Mira\n  Kai em (-0.8,0) fala "Oi, tudo bem? Que bom." tom alegre\n  Mira em (0.8,0)\n  camera 1s plano close alvo Kai lado 40\nquadro 2 continua\n  Kai em (0.75,0.1)\n`);
  const v = w.videoDoName(r, { fps: 12 }), q1 = v.frames.filter(f => f.quadro === 1);
  ok(q1[0].estado.camera.camDist > q1[q1.length - 1].estado.camera.camDist * 1.5, "câmera vai do americano ao close no tempo pedido");
  const bocas = q1.map(f => f.estado.list.find(m => m.name === "Kai").params.jawOpen); ok(Math.max(...bocas) > 0.12 && bocas.filter(b => b < 0.05).length >= 2, "a boca abre e fecha (vírgula e ponto fecham)");
  ok(q1.some(f => f.estado.list.find(m => m.name === "Kai").params.eyeLid > 0.5), "pisca sozinho (vida)");
  ok(v.avisos.some(a => /se atravessam/.test(a)), "esbarrão vira aviso: " + v.avisos[0]);
  ok(w.videoDoName(r, { fps: 60 }).fps === 60 && w.videoDoName(r, { fps: 200 }).fps === 60, "fps até 60");
}
if (falhou) { console.log("\nFALHOU"); process.exit(1); } else console.log("\nmovimento: tudo ok");
