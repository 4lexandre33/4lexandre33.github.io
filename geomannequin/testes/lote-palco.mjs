/* Cena em lote e edição no palco: espalha (pessoas, animais, objetos; olhando centro/ponto; pose aleatória por categoria; semente),
   grupo (pose, olha, gira, move, alinha fila/círculo/grade/arco, com objetos), apaga, duplica, no palco e no Name; miniaturas no MCP. */
import { createWorld } from "../mcp/lib/core.mjs";
let falhas = 0; const ok = (c, m) => { console.log((c ? "  ok  " : "  FALHA ") + m); if (!c) falhas++; };
const w = createWorld(), M = 0.114, pos = n => { const it = w.SCN.list.find(x => x.name === n); return it ? [it.params.wx * M, it.params.wz * M, it.params.wRot || 0] : null; };
let r = w.aplicarLinhaNoPalco("espalha 8 pessoas em area (0,0) (6,4) olhando centro pose aleatoria-de Conversa semente 2");
const gente = w.SCN.list.filter(x => /^Pessoa\d+$/.test(x.name)); ok(r.ok && gente.length === 8, "espalha 8 pessoas: " + gente.length + " na cena");
ok(gente.every(it => { const p = [it.params.wx * M, it.params.wz * M]; return p[0] >= -0.01 && p[0] <= 6.01 && p[1] >= -0.01 && p[1] <= 4.01; }), "todas dentro da área");
{ let dmin = 1e9; for (let i = 0; i < gente.length; i++) for (let j = i + 1; j < gente.length; j++) dmin = Math.min(dmin, Math.hypot(gente[i].params.wx - gente[j].params.wx, gente[i].params.wz - gente[j].params.wz) * M); ok(dmin >= 0.85, "distância mínima entre elas (" + dmin.toFixed(2) + " m)"); }
ok(gente.every(it => { const g = Math.atan2(3 - it.params.wx * M, 2 - it.params.wz * M) * 180 / Math.PI; return Math.abs(((it.params.wRot - g + 540) % 360) - 180) < 2; }), "olhando o centro da área");
ok(new Set(gente.map(it => JSON.stringify([it.params.armFlexL, it.params.elbowR, it.params.headYaw]))).size > 2, "poses variadas (categoria Conversa)");
{ const w2 = createWorld(); w2.aplicarLinhaNoPalco("espalha 8 pessoas em area (0,0) (6,4) olhando centro pose aleatoria-de Conversa semente 2"); ok(JSON.stringify(w2.SCN.list.map(x => [x.name, Math.round(x.params.wx)])) === JSON.stringify(w.SCN.list.map(x => [x.name, Math.round(x.params.wx)])), "mesma semente = mesmo resultado"); }
r = w.aplicarLinhaNoPalco("espalha 3 animal lobo em area (-6,0) (-2,4) olhando (0,0)"); ok(r.ok && w.SCN.objetos.filter(o => o.animal && /^Lobo\d$/.test(o.nome)).length === 3, "espalha 3 animais (lobos)");
r = w.aplicarLinhaNoPalco("espalha 4 objeto cadeira em area (0,6) (4,8)"); ok(r.ok && w.SCN.objetos.filter(o => /^Cadeira\d$/.test(o.nome)).length === 4, "espalha 4 objetos (cadeiras)");
r = w.aplicarLinhaNoPalco("espalha 2 pessoas em area (0,0) (6,4) pose aleatoria-de Xyz"); ok(!r.ok && /Categoria de pose/.test(r.erros[0]), "categoria errada: erro com a lista");
r = w.aplicarLinhaNoPalco("grupo Pessoa1, Pessoa2, Pessoa3, Cadeira1 alinha circulo em (0,-4) espaco 1.2"); { const c = ["Pessoa1", "Pessoa2", "Pessoa3"].map(pos), ca = w.SCN.objetos.find(o => o.nome === "Cadeira1"); ok(r.ok && c.every(p => Math.abs(Math.hypot(p[0], p[1] + 4) - Math.hypot(ca.x * M, ca.z * M + 4)) < 0.05), "grupo alinha círculo (com uma cadeira junto)"); }
r = w.aplicarLinhaNoPalco("grupo Pessoa1, Pessoa2 move (1,0)"); { const p = pos("Pessoa1"); ok(r.ok && p, "grupo move"); }
r = w.aplicarLinhaNoPalco('grupo Pessoa4, "Manequim 1" olha (10,10)'); ok(r.ok && Math.abs(pos("Manequim 1")[2] - 45) < 1, "grupo olha (x,z) (nome com espaço entre aspas)");
r = w.aplicarLinhaNoPalco("grupo Pessoa5, Pessoa6 pose guardaBoxe"); ok(r.ok && r.mudou.filter(m => /pose/.test(m)).length === 2, "grupo pose");
r = w.aplicarLinhaNoPalco("duplica Pessoa1 em (9,9)"); ok(r.ok && pos("Pessoa9") && Math.abs(pos("Pessoa9")[0] - 9) < 0.01, "duplica (vira Pessoa9 em (9,9))");
r = w.aplicarLinhaNoPalco("apaga Pessoa9, Cadeira4"); ok(r.ok && !pos("Pessoa9") && !w.SCN.objetos.some(o => o.nome === "Cadeira4"), "apaga pessoa e objeto");
{ const rn = w.compilarName("elenco\n  Kai\nquadro 1\n  Kai em (0,0)\n  espalha 4 pessoas em area (2,2) (5,5) pose aleatoria semente 5\n  grupo Pessoa1, Pessoa2 olha (0,0)\n", { semCache: true, salvar: false }); ok(rn.ok && rn.quadros[0].personagens.length === 5, "no Name: espalha + grupo dentro do quadro (" + (rn.erros[0] ? rn.erros[0].erro : "ok") + ")"); }
console.log(falhas ? "\n" + falhas + " falha(s)" : "\ntudo certo"); process.exit(falhas ? 1 : 0);
