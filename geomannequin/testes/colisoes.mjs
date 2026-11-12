/* GeoMannequin — colisões entre manequins: detectar e corrigir (auto, distância, giro, pose), contato permitido,
   bloquear ao arrastar e desfazer. Uso: node testes/colisoes.mjs  (precisa de mcp/node_modules) */
import { createWorld } from "../mcp/lib/core.mjs";

let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const fila = () => { const w = createWorld(); w.cena.ativo.poseRapida("caminhando"); for (let i = 1; i < 4; i++) w.cena.adicionar({ x: i * 2.3, z: -i * 1.9 }).poseRapida("caminhando"); return w; };
const mudanca = (w, antes) => w.SCN.list.reduce((s, it, i) => s + Math.hypot(it.params.wx - antes[i].wx, it.params.wz - antes[i].wz), 0) * 11.4;

/* separados: nada */
{ const w = createWorld(); w.cena.adicionar(); w.cena.adicionar(); ok(w.cena.colisoes().length === 0, "manequins novos (espaçamento padrão): nenhuma colisão"); }
/* fila apertada (como uma caminhada em grupo): detecta e cada solução */
{
  const w = fila(), cs = w.cena.colisoes();
  ok(cs.length >= 2 && cs.every(c => c.cm > 0 && c.descricao), `fila apertada: ${cs.length} colisões detectadas (ex.: ${cs[0] && cs[0].descricao})`);
  for (const met of ["auto", "distancia", "giro", "pose"]) {
    const v = fila(), antes = v.SCN.list.map(it => Object.assign({}, it.params)), n0 = v.cena.colisoes().length, t = performance.now();
    v.cena.resolverColisoes({ preferir: met });
    const n1 = v.cena.colisoes().length, ms = performance.now() - t;
    if (met === "auto" || met === "distancia") ok(n1 === 0, `corrigir (${met}): ${n0} → ${n1} colisões em ${ms.toFixed(0)} ms, ${Math.round(mudanca(v, antes))} cm de deslocamento somado`);
    else ok(n1 <= n0, `corrigir (${met}): ${n0} → ${n1} colisões em ${ms.toFixed(0)} ms (sozinho pode não bastar; o painel sugere Automático/Afastar)`);
  }
}
/* um braço só atravessando: a pose resolve sem mexer na posição */
{
  const w = createWorld(); w.cena.adicionar({ x: 7.5, nome: "B" });
  w.cena.ativo.pose({ armAbdL: 85, elbowL: 0 });
  const n0 = w.cena.colisoes().length, x0 = w.SCN.list[0].params.wx;
  w.cena.ativo.resolverColisoes("pose");
  ok(n0 > 0 && w.cena.colisoes().length === 0 && w.SCN.list[0].params.wx === x0, `braço aberto entrando no vizinho: a pose resolve sem mover (${n0} → ${w.cena.colisoes().length})`);
}
/* contato permitido (abraço): não aparece */
{
  const w = createWorld(); w.cena.adicionar({ x: 0.5, z: 0.4, nome: "B" });
  const n0 = w.cena.colisoes().length; w.cena.ativo.permitirContato("B");
  ok(n0 > 0 && w.cena.colisoes().length === 0, "contato permitido: o par deixa de ser avisado");
  const st = JSON.parse(JSON.stringify(w.sceneState())), w2 = createWorld(); w2.loadScene(st);
  ok(w2.cena.colisoes().length === 0, "contato permitido é salvo com a cena");
}
/* desfazer */
{
  const w = fila(), antes = w.SCN.list.map(it => it.params.wx + "," + it.params.wz).join(";");
  w.cena.resolverColisoes({ preferir: "distancia" }); w.cena.desfazerColisao();
  ok(w.SCN.list.map(it => it.params.wx + "," + it.params.wz).join(";") === antes, "desfazer volta as posições");
}
/* bloquear ao arrastar: empurra para fora */
{
  const w = createWorld(); w.cena.adicionar({ x: 4.5, nome: "B" });
  const it = w.SCN.list[1]; it.params.wx = 0.6;
  w.resolverPar(0, 1, "distancia", "b");
  const d = Math.hypot(it.params.wx, it.params.wz); ok(w.cena.colisoes().length === 0 && d > 1.5 && w.SCN.list[0].params.wx === 0, `afastar o arrastado (só ele se move): distância 0,6 → ${d.toFixed(2)}`);
}
/* desempenho da detecção: 12 manequins */
{
  const w = createWorld(); for (let i = 1; i < 12; i++) w.cena.adicionar({ x: (i % 4) * 2.6, z: -Math.floor(i / 4) * 2.4 });
  w.cena.colisoes(); const t = performance.now(); for (let k = 0; k < 10; k++) w.cena.colisoes();
  const ms = (performance.now() - t) / 10; ok(ms < 30, `detecção com 12 manequins: ${ms.toFixed(1)} ms por quadro`);
}
/* composição 2D: tangência detectada e ajustada sem criar colisão */
{
  const w = createWorld(); w.cena.adicionar({ x: 3, z: -7 }); w.cena.adicionar({ x: 9, z: 0 }); w.camera.perspectiva(true).girar(-20, -5); w.cena.enquadrar();
  const a = w.cena.composicao(true); w.cena.ajustarComposicao(0); const b = w.cena.composicao();
  ok(a.length > 0 && b.length < a.length && w.cena.colisoes().length === 0, `composição: ${a.length} aviso(s) → ${b.length} depois de ajustar (ex.: ${a[0]})`);
}
console.log(falhou ? "\nHá falhas." : "\nColisões ok.");
process.exitCode = falhou ? 1 : 0;
