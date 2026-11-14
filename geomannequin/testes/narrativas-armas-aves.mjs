/* Testes: funções narrativas (todas compilam em mangá, webtoon e animação; tons; história procedural com semente e nota),
   golpes com armas (dedos e arma fora do corpo), aves (espécies, montaria por escala) e efeitos de A até B. */
import { createWorld } from "../mcp/lib/core.mjs";
let falhou = false; const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const w = createWorld();

/* 1. biblioteca */
ok(w.NR.size >= 100 && w.nrTotalVariantes() >= 1000, "biblioteca: " + w.NR.size + " funções, " + w.nrTotalVariantes() + " variantes");
{ const ruins = []; for (const d of w.nrListar()) for (const f of ["manga", "webtoon", "animacao"]) { const r = w.compilarName(w.nrMontarTexto([w.nrReceita(d.id, { formato: f })], {}), { semCache: true, salvar: false }); if (r.erros.length) ruins.push(d.id + "@" + f + ": " + r.erros[0].erro); }
  ok(!ruins.length, "todas as funções compilam nos 3 formatos" + (ruins.length ? " — " + ruins.slice(0, 3).join(" | ") : "")); }
{ const ruins = []; for (const d of w.nrListar().filter((x, i) => i % 6 === 0)) for (const v of Object.keys(w.NR_VERSOES)) for (const t of Object.keys(w.NR_TONS)) { const r = w.compilarName(w.nrMontarTexto([w.nrReceita(d.id, { versao: v, tom: t })], {}), { semCache: true, salvar: false }); if (r.erros.length) ruins.push(d.id + "." + v + "." + t); }
  ok(!ruins.length, "amostra de versões × tons compila" + (ruins.length ? " — " + ruins.slice(0, 3).join(" ") : "")); }
/* 2. história procedural: mesma semente = mesma história; variações ordenadas pela nota */
{ const a = w.nrHistoria({ estrutura: "jornada", nomes: ["Kai", "Mira"], variacoes: 4, semente: 9 }), b = w.nrHistoria({ estrutura: "jornada", nomes: ["Kai", "Mira"], variacoes: 4, semente: 9 });
  ok(JSON.stringify(a.map(x => x.funcoes)) === JSON.stringify(b.map(x => x.funcoes)), "história: a semente repete a mesma história");
  ok(a.every((x, i) => !i || a[i - 1].nota.total >= x.nota.total), "história: variações da melhor para a pior nota");
  const r = w.compilarName("elenco\n  Kai relevante\n  Mira relevante\nhistoria acao com Kai, Mira semente 3 variacoes 3\n", { semCache: true, salvar: false });
  ok(r.erros.length === 0 && r.quadros.length >= 8, "linha \"historia\" no name vira " + r.quadros.length + " quadros sem erro"); }
/* 3. verificação narrativa → visual reduz os avisos de composição */
{ let antes = 0, depois = 0; for (const id of ["gatilho.chamado", "relacao.discussao", "conflito.troca-socos", "revelacao.segredo", "apresentacao.dupla"]) { const tx = w.nrMontarTexto([w.nrReceita(id, {})], {}), r0 = w.compilarName(tx, { semCache: true, salvar: false });
    antes += r0.avisos.filter(a => /cruzou o eixo|cortada/.test(a)).length; depois += w.nrVerificar(tx, (t, o) => w.compilarName(t, o)).avisosRestantes.filter(a => /cruzou o eixo|cortada/.test(a)).length; }
  ok(depois <= antes, "verificação corrige eixo/cabeça cortada (" + antes + " → " + depois + ")"); }
/* 4. golpes com armas: dedos não entram e a arma não atravessa o corpo (a maioria) */
{ const L = w.listaGolpes(); let dedos = 0, atrav = 0; for (const g of L) { const W2 = createWorld(); W2.cena.objeto(g.teste, { x: 0, z: 3 }); const ob = W2.SCN.objetos[W2.SCN.objetos.length - 1]; const r = W2.cena.ativo.segurarComo(ob.id, g.nome, {});
    if (r.dedosEntram > 2.5) dedos++; if ((r.atravessa || []).length) atrav++; }
  ok(L.length >= 70 && dedos === 0, "golpes: " + L.length + ", nenhum com dedos > 2,5 cm dentro"); ok(atrav <= 4, "golpes: arma atravessando o corpo em " + atrav + " de " + L.length); }
/* 5. aves: espécies compilam, falcão não dá para montar, roca gigante sim */
{ const esp = Object.keys(w.AV_ESPECIES); const ruins = esp.filter(e => w.compilarName("elenco\n  A animal " + e + "\nquadro 1 alvo A\n  A em (0,0)\n", { semCache: true, salvar: false }).erros.length);
  ok(esp.length >= 16 && !ruins.length, "aves: " + esp.length + " espécies");
  const r1 = w.compilarName("elenco\n  Kai relevante\n  F animal falcao\nquadro 1\n  F em (2,0)\n  Kai em (0,0) monta F\n", { semCache: true, salvar: false });
  const r2 = w.compilarName("elenco\n  Kai relevante\n  R animal aguia escala 5 sela\nquadro 1\n  R em (2,0)\n  Kai em (0,0) monta R\n", { semCache: true, salvar: false });
  ok(r1.erros.some(e => /pequeno demais/.test(e.erro)) && !r2.erros.length, "montaria por escala: falcão não, roca escala 5 sim"); }
/* 6. efeitos de A até B */
{ const r = w.compilarName("elenco\n  Kai relevante\n  Mira relevante\nquadro 1\n  Kai em (0,0) gira 90 segura varinha como varinhaConjurando\n  Mira em (5,0) gira -90\n  efeito projetil de Kai.varinha.ponta para Mira arco\n  efeito raio em Kai.varinha.ponta colorido\n", { semCache: true, salvar: false });
  const ef = r.quadros[0].estado.efeitos || [], p = ef.find(e => e.tipo === "projetil");
  ok(!r.erros.length && p && p.trilha && p.trilha.length > 3 && ef.some(e => e.tipo === "raio" && e.ancora.modo === "objeto"), "projétil com trilha e efeito preso na ponta da varinha");
  const svg = w.renderizarQuadro(r.quadros[0], { passes: false }).svg; ok(/data-vfx="projetil"/.test(svg) && !/NaN/.test(svg), "projétil desenhado sem NaN"); }
console.log(falhou ? "\nFALHOU" : "\ntudo certo"); process.exit(falhou ? 1 : 0);
