/* Subfunções narrativas (encenações de 4 quadros) e História → texto com lacunas; locais prontos. */
import { createWorld } from "../mcp/lib/core.mjs";
let falhou = false; const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const w = createWorld(), comp = t => w.compilarName(t, { semCache: true, salvar: false });
const S = w.nrListarSub(); ok(S.length >= 300 && new Set(S.map(s => s.funcao)).size >= 100, S.length + " subfunções em " + new Set(S.map(s => s.funcao)).size + " funções");
ok(S.every(s => s.sequencia.join() === "normalidade,estimulo,reacao,consequencia"), "toda subfunção tem a sequência normalidade → estímulo → reação → consequência");
{ const ruins = []; for (const s of S.filter((x, i) => i % 9 === 0)) for (const f of ["manga", "animacao"]) { const r = comp(w.nrMontarTexto([w.nrReceita(s.id, { formato: f })], {})); if (!r.ok) ruins.push(s.id + "/" + f + ": " + r.erros[0].erro); }
  ok(!ruins.length, "amostra de subfunções compila em mangá e animação" + (ruins.length ? " — " + ruins.slice(0, 3).join(" | ") : "")); }
{ const r = comp("narrativa gatilho.chamado.carta-misteriosa.suspense.tenso com Kai, Mira\n"); ok(r.ok && r.quadros.length >= 4, "linha narrativa com subfunção + versão + tom (" + r.quadros.length + " quadros)"); }
{ const p = w.nrProximos("gatilho.chamado"); ok(p.filter(x => x.sub).length === 3 && p.some(x => x.nome === "suspense"), "árvore: depois da função vêm as 3 subfunções e as versões"); }
{ const a = w.analisarHistoria("Kai chegou à taverna numa noite de chuva. Um estranho entrou e sacou uma pistola. O estranho atirou em Kai, mas Mira lançou um feitiço de escudo com sua varinha. Kai socou o estranho. Depois, Kai e Mira fugiram a cavalo pela floresta. Mira chorou e Kai a abraçou. Kai disse \"Acabou.\" No fim, Kai remou até a praia, onde uma sereia esperava.");
  ok(a.personagens.includes("Estranho") && a.animais.some(x => x.especie === "cavalo"), "acha personagens (inclusive “o estranho”) e animais");
  ok(/Estranho atira em Kai/.test(a.dsl) && /Mira feitico escudo/.test(a.dsl) && /Kai monta Cavalo/.test(a.dsl) && /Kai interacao abracoFrente com Mira/.test(a.dsl) && /Kai fala "Acabou\./.test(a.dsl), "ações viram linhas: tiro, feitiço, montar, abraço, fala");
  ok(a.lugares.some(l => l.preset === "taverna") && a.lugares.some(l => l.preset === "floresta"), "lugares viram locais prontos");
  ok(a.lacunas.some(l => l.termo === "praia" && l.tipo === "lugar") && a.lacunas.some(l => l.termo === "sereia"), "lacunas: praia (lugar) e sereia (criatura)");
  const r = comp(a.dsl); ok(r.ok && r.quadros.length === a.quadros, "o texto gerado compila (" + r.quadros.length + " quadros) " + JSON.stringify(r.erros.slice(0, 2)));
  ok(w.listaLacunas().length >= 2, "lacunas ficam registradas"); }
{ const L = w.listaLocaisProntos(); ok(L.length >= 12, L.length + " locais prontos"); const ruins = []; for (const l of L) { const P = w.localPronto(l.tipo, { semente: 3 }), r = comp(P.codigo + 'elenco\n  Kai\nquadro 1 local "' + P.nome + '" geral\n  Kai em (0,0)\n'); if (!r.ok) ruins.push(l.tipo + ": " + r.erros[0].erro); }
  ok(!ruins.length, "todos compilam e montam" + (ruins.length ? " — " + ruins.join(" | ") : ""));
  const a = w.localPronto("sala", { largura: 8 }), b = w.localPronto("sala", { largura: 4 }); ok(a.codigo !== b.codigo && /-4,-2.5 a 4,2.5/.test(a.codigo), "parâmetros mudam o local (largura 8 → sala de 8 m)");
  const r = comp("local preset taverna \"Bar do Zé\" largura 10\nelenco\n  Kai\nquadro 1 local \"Bar do Zé\"\n  Kai em marca \"balcao\"\n"); ok(r.ok, "local preset com nome próprio e marcas " + JSON.stringify(r.erros)); }
console.log(falhou ? "\nFALHOU" : "\ntudo certo"); process.exit(falhou ? 1 : 0);
