/* Auditoria de TODAS as poses: membros atravessando o corpo, deitados flutuando, limites das juntas; e das animações (pés, chão, corpo). */
import { createWorld } from "../mcp/lib/core.mjs";
let falhou = false; const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const w = createWorld(), it = w.cena.ativo;
/* poses em que encostar braço com braço / perna é o próprio gesto */
const CONTATO = new Set(["abracandoJoelhos", "esquivaRolamento", "sentado", "poderSocoChao"]);
const atrav = [], flut = [], lim = [];
for (const n of w.todasPoses()) { it.poseRapida(n); const v = it.validarPose(), p = w.SCN.list[w.SCN.active].params;
  const prof = v.atravessa.length ? Math.max(...v.atravessa.map(a => a.profundidade || a.prof || 0)) : 0; if (prof > 0.8 && !CONTATO.has(n)) atrav.push(n + " " + prof);
  if (v.limites.length) lim.push(n);
  if ((p.bodyLift || 0) < 0.8) { const C = w.capsulas(Object.assign({}, p, { wx: 0, wz: 0, wRot: 0 })).caps; let g = 1e9; for (const c of C) g = Math.min(g, c.a[1] - c.r, c.b[1] - c.r);
    const mid = k => { const c = C.find(x => x.nome === k); return c.a.map((q, i) => (q + c.b[i]) / 2); }, pe = mid("pelve"), pc = mid("pescoco"), vv = pc.map((q, i) => q - pe[i]);
    const incl = Math.acos(Math.abs(vv[1]) / Math.hypot(...vv)) * 180 / Math.PI, tr = C.filter(c => /torax|abdomen|pelve/.test(c.nome)), alt = Math.min(...tr.map(c => Math.min(c.a[1], c.b[1]) - c.r)) - g;
    if (incl > 80 && alt > 2.2 && !/engatinh|quatroApoios|ponte|camelo|prancha|CapoeiraAu|KesaGatame/.test(n) /* aú: apoiado nas mãos; kesa gatame: deitado sobre o oponente */) flut.push(n + " " + alt.toFixed(1)); } }
ok(!atrav.length, "nenhuma pose com membro atravessando o corpo > 0,8 R" + (atrav.length ? " — " + atrav.join(", ") : ""));
ok(!lim.length, "nenhuma pose fora dos limites acoplados" + (lim.length ? " — " + lim.slice(0, 8).join(", ") : ""));
ok(!flut.length, "nenhuma pose deitada flutuando (tronco a mais de 2,2 R do chão)" + (flut.length ? " — " + flut.join(", ") : ""));
const a = w.auditarAnimacoes(); ok(a.problemas.length === 0, "auditoria das " + a.total + " animações (pés, chão, corpo atravessando)" + (a.problemas.length ? " — " + a.problemas.slice(0, 5).join(" | ") : ""));
console.log(falhou ? "\nFALHOU" : "\ntudo certo"); process.exit(falhou ? 1 : 0);
