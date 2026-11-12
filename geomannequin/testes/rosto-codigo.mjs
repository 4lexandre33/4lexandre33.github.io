/* GeoMannequin — código do rosto: ida e volta exata, rosto completo (o resto volta ao neutro), nomes de expressão
   no código da pose, Minhas expressões (guardar, aplicar, misturar, exportar/importar, recusas) e o estado para IA.
   Uso: node testes/rosto-codigo.mjs */
import { createWorld } from "../mcp/lib/core.mjs";
let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const w = createWorld(), c = w.cena, m = c.ativo;
const P = () => w.sceneList(true)[0].p;
const rosto = () => { const v = c.expressoes.ler(m.rostoCodigo()).valores; return v; };
const SOR = Object.keys(c.expressoes.ler("rosto({ sorriso: 1 })").valores)[0]; /* nome interno do controle "sorriso" */

m.expressao("raiva");
const cod = m.rostoCodigo(), antes = { ...rosto() };
ok(/rosto\(\{/.test(cod) && /partiu de: raiva/.test(cod), "código do rosto mostra a expressão de origem");
m.expressao("alegria"); m.aplicarRosto(cod);
const depois = rosto();
ok(Object.keys(antes).every(k => Math.abs((antes[k] || 0) - (depois[k] || 0)) < 1e-3) && Object.keys(depois).every(k => Math.abs((antes[k] || 0) - depois[k]) < 1e-3), "ida e volta exata do rosto");
m.aplicarRosto('rosto({ sorriso: 0.5 })');
const s = rosto(); ok(Object.keys(s).length === 1 && Math.abs(s[SOR] - 0.5) < 1e-6, "rosto completo: o que não veio volta ao neutro");
let erro = ""; try { m.aplicarRosto("rosto({ naoExiste: 1 })"); } catch (e) { erro = e.message; }
ok(/não é um controle/.test(erro), "recusa controle desconhecido com mensagem clara");
erro = ""; try { m.aplicarRosto("rosto({ sorriso: 0.5 "); } catch (e) { erro = e.message; } ok(/Falta fechar/.test(erro), "recusa chave sem fechar");

/* rosto novo, guardado com nome, usado por m.expressao e por mistura */
m.aplicarRosto('rosto("Sorriso cínico", { sorriso: 0.35, palpebras: 0.3 })');
c.expressoes.salvar("Sorriso cínico");
ok(c.expressoes.lista().some(e => e.nome === "Sorriso cínico"), "guarda um rosto novo em Minhas expressões");
m.expressao("neutra"); m.expressao("sorriso cinico");
ok(Math.abs(rosto()[SOR] - 0.35) < 1e-3, "m.expressao acha a expressão guardada (sem acento/maiúscula)");
m.expressao("neutra"); c.expressoes.aplicar("Sorriso cínico", { intensidade: 0.5 });
ok(rosto()[SOR] > 0.1 && rosto()[SOR] < 0.3, "aplica a guardada com intensidade");
erro = ""; try { c.expressoes.salvar("Raiva"); } catch (e) { erro = e.message; } ok(/já é uma expressão pronta/.test(erro), "não deixa sobrescrever expressão pronta");
const exp = c.expressoes.exportar(); c.expressoes.apagar("Sorriso cínico");
ok(!c.expressoes.lista().length, "apaga");
ok(c.expressoes.importar(exp).join() === "Sorriso cínico", "importa de volta o que exportou");

/* código da pose leva o rosto e o nome */
m.expressao("tristeza"); const pc = m.codigoPose();
ok(/partiu de “tristeza”/.test(pc) && /\/\/ rosto/i.test(pc), "código da pose leva o rosto e diz de qual expressão partiu");
m.expressao("alegria"); m.aplicarPose(pc); m.expressao("neutra"); m.aplicarPose(pc);
const t1 = rosto(); m.expressao("tristeza"); const t2 = rosto();
ok(Object.keys(t2).every(k => Math.abs((t1[k] || 0) - t2[k]) < 1e-3), "aplicar o código da pose recria o rosto");

/* formato do rosto e cabeça */
const cf = m.rostoCodigo({ formato: true }); ok(/formato:/.test(cf) && /cabeca:/.test(cf), "opção formato inclui feições e cabeça");
/* estado para IA traz o rosto */
const est = c.estadoIA(); ok(/rosto\(/.test(est) && /tristeza/i.test(est), "estado para IA descreve o rosto e traz o código");
if (falhou) { console.log("\nFalhou."); process.exit(1); } console.log("\nTudo certo.");
