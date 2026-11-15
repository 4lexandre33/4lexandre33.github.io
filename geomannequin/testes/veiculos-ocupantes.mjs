/* Ocupantes dos veículos: em cada assento a pessoa fica DENTRO (cabeça abaixo do teto, nada atravessando portas e paredes,
   pés no piso) e, no filme, vai junto com o veículo (posição em relação ao veículo não muda). */
import { createWorld } from "../mcp/lib/core.mjs";
const w = createWorld(); let falhas = 0;
const ok = (c, m) => { console.log((c ? "  ok  " : "  FALHA ") + m); if (!c) falhas++; };
const V = w.listaVeiculos(), CM = 11.4;
const LIMITE = { pe: 6, sentado: 11 }; /* cm de contato aceitos (almofada, piso) */
let medidos = 0; const ruins = [];
for (const v of V) for (const a of v.assentos) {
  if (/^(vagao[2-9]-|banco([3-9]|1\d)$|poltrona([3-9]|1\d|2\d)$)/.test(a)) continue; /* um de cada tipo basta */
  const txt = `elenco\n  Kai\nlocal "L" unidade m\n  chao retangulo -80,-80 a 80,80\nquadro 1 local "L"\n  objeto ${v.tipo} "V" em (0,0)\n  Kai embarca V assento "${a}"\n`;
  const r = w.compilarName(txt, { semCache: true, salvar: false }); if (!r.ok) { ruins.push(v.tipo + "/" + a + ": " + r.erros[0].erro); continue; }
  w.loadScene(JSON.parse(JSON.stringify(r.quadros[0].estado))); medidos++;
  const it = w.SCN.list.find(x => x.name === "Kai"), o = w.SCN.objetos.find(x => x.nome === "V");
  const col = w.listaColisoes().filter(c => (c.a === "Kai" && c.b === "V")), pior = col.length ? Math.max(...col.map(c => c.cm)) : 0;
  const S = (w.SCN.objetos && o) ? null : null; void S;
  const beira = /borda|beira|proa$|popa$/.test(a) && /balsa|bote/.test(v.tipo);
  if (!beira && pior > LIMITE.sentado) ruins.push(v.tipo + "/" + a + " entra " + pior + " cm em " + col[0].partes.slice(0, 2).join(", "));
}
ok(medidos > 60, medidos + " assentos medidos");
ok(ruins.length === 0, "ninguém atravessa o veículo (≤ " + LIMITE.sentado + " cm de contato)" + (ruins.length ? ": " + ruins.join(" · ") : ""));

/* cabeça abaixo do teto nos fechados */
for (const [tipo, ass, extra, teto] of [["carro", "motorista", "", 13.2], ["carro", "traseiro1", "", 13.2], ["carro", "carona", "modelo esportivo", 11.2], ["carro", "motorista", "modelo suv", 15.6], ["onibus", "banco3", "", 27], ["aviaoPequeno", "piloto", "", 16.2], ["helicoptero", "copiloto", "", 17.6], ["vagao", "banco2", "", 30], ["carruagem", "passageiro", "", 20.9]]) {
  const txt = `elenco\n  Kai\nlocal "L" unidade m\n  chao retangulo -80,-80 a 80,80\nquadro 1 local "L"\n  objeto ${tipo} "V" em (0,0) ${extra}\n  Kai embarca V assento ${ass}\n`;
  const r = w.compilarName(txt, { semCache: true, salvar: false }); w.loadScene(JSON.parse(JSON.stringify(r.quadros[0].estado)));
  const it = w.SCN.list.find(x => x.name === "Kai"), cs = w.capsulas(w.pMundo(it)), L = cs.caps || cs, g0 = w.restGround(w.SCN.list[0].params);
  const topo = Math.max(...L.map(c => Math.max(c.a[1], c.b[1]) + (c.r || 0))) - g0, alt = teto;
  ok(topo < alt, tipo + (extra ? " " + extra : "") + " · " + ass + ": cabeça a " + (topo * 0.114).toFixed(2) + " m, abaixo do teto (" + (alt * 0.114).toFixed(2) + " m)");
}

/* no filme, quem está dentro vai junto (posição em relação ao veículo constante) */
const casos = {
  carro: [`objeto carro "V" em (0,0)`, `Kai embarca V assento motorista\n    Mira embarca V assento traseiro2\n    0s V anda 12m por 2s\n    2s V vira 90 por 1s\n    3s V anda 6m por 1s`, 4],
  "avião pequeno": [`objeto aviaoPequeno "V" em (0,0)`, `Kai embarca V assento piloto\n    Mira embarca V assento passageiro\n    0s V anda 30m por 2s\n    2s V decola altura 8 por 2s`, 4],
  lancha: [`objeto lancha "V" em (0,0)`, `Kai embarca V assento piloto\n    Mira embarca V assento popa\n    0s V anda 10m por 3s`, 3],
  "ônibus": [`objeto onibus "V" em (0,0)`, `Kai embarca V assento motorista\n    Mira embarca V assento banco5\n    0s V anda 12m por 3s`, 3],
  "helicóptero": [`objeto helicoptero "V" em (0,0)`, `Kai embarca V assento piloto\n    Mira embarca V assento traseiro\n    0s V decola altura 10 por 3s`, 3] };
for (const [k, [lc0, pl, dur]] of Object.entries(casos)) {
  const txt = `filme "f" fps 6\nelenco\n  Kai\n  Mira\nlocal "L" unidade m\n  chao retangulo -200,-200 a 200,200\n  ${lc0}\ncena "c" local "L"\n  plano 1 duracao ${dur}s\n    camera (-20,10,-12) olhando (0,1,6)\n    ${pl}\n`;
  const r = w.compilarName(txt, { semCache: true, salvar: false }); if (!r.ok) { ok(false, k + ": " + r.erros[0].erro); continue; }
  const v = w.videoDoFilme(r, { fps: 6 }), loc = { Kai: [], Mira: [] }; let moveu = 0;
  for (const f of v.frames) { w.loadScene(JSON.parse(JSON.stringify(f.estado))); const o = w.SCN.objetos.find(x => x.nome === "V"), g = (o.giro || 0) * Math.PI / 180;
    for (const nm of ["Kai", "Mira"]) { const it = w.SCN.list.find(x => x.name === nm), cs = w.capsulas(w.pMundo(it)), L = cs.caps || cs, pel = L.find(c => c.nome === "pelve"), pc = pel.a.map((x, i) => (x + pel.b[i]) / 2), dx = pc[0] - o.x, dz = pc[2] - o.z;
      loc[nm].push([dx * Math.cos(g) - dz * Math.sin(g), pc[1] - (o.base || 0), dx * Math.sin(g) + dz * Math.cos(g)]); }
    moveu = Math.max(moveu, Math.hypot(o.x, o.z) + (o.base || 0)); }
  const vari = a => Math.max(...[0, 1, 2].map(i => Math.max(...a.map(q => q[i])) - Math.min(...a.map(q => q[i]))));
  ok(moveu > 30 && vari(loc.Kai) < 0.3 && vari(loc.Mira) < 0.3, k + ": o veículo anda " + (moveu * 0.114).toFixed(0) + " m e os dois ficam no banco (desvio " + (Math.max(vari(loc.Kai), vari(loc.Mira)) * CM).toFixed(1) + " cm)");
}
/* nome de assento com ou sem acento */
{ const r = w.compilarName(`elenco\n  Kai\nquadro 1\n  objeto navio "N" em (0,0)\n  Kai embarca N assento conves\n`, { semCache: true, salvar: false }); ok(r.ok, "assento “conves” acha “convés”"); }
console.log(falhas ? "\n" + falhas + " falha(s)" : "\ntudo certo"); process.exit(falhas ? 1 : 0);
