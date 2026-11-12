/* GeoMannequin — Biblioteca: cada tipo de item é capturado, vira texto, volta (exportar/importar) e reaplica igual.
   Uso: node testes/biblioteca.mjs */
import { createWorld } from "../mcp/lib/core.mjs";
let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const w = createWorld(), c = w.cena, B = c.biblioteca, m = c.ativo;
const P = () => JSON.stringify(w.sceneList(true)[0].p);
ok(Object.keys(B.tipos()).join() === "pose,rosto,efeitos,cena,colecao", "tipos: pose, rosto, efeitos, cena, coleção");
/* pose com rosto */
m.poseRapida("direto"); m.expressao("raiva"); const antes = P();
const ip = B.capturar("pose", { nome: "Soco" }); ok(ip.app === "geomannequin" && ip.tipo === "pose" && /pose\(/.test(ip.codigo) && /raiva/.test(ip.resumo), "captura a pose (com o rosto)");
m.poseRapida("empe"); m.expressao("alegria"); B.aplicar(ip); ok(P() === antes, "reaplica a pose e o rosto exatamente");
/* rosto */
m.aplicarRosto('rosto({ sorriso: 0.4, cantoBocaEsq: 0.5 })'); const ir = B.capturar("rosto", { nome: "Meio sorriso" }); m.expressao("tristeza"); B.aplicar(ir);
ok(/sorriso: 0.4/.test(m.rostoCodigo()) && /cantoBocaEsq: 0.5/.test(m.rostoCodigo()), "captura e reaplica um rosto");
/* efeitos */
let erro = ""; try { B.capturar("efeitos"); } catch (e) { erro = e.message; } ok(/Não há efeitos/.test(erro), "efeitos: avisa quando não há nada");
m.efeito("aura_explosiva", { nivel: 3 }); c.efeito("concentracao"); const ie = B.capturar("efeitos", { nome: "Aura" });
c.efeitos.limpar(); ok(/^2 efeito\(s\) adicionados\.$/.test(B.aplicar(ie)) && c.efeitos.lista().length === 2, "captura e reaplica os efeitos");
/* cena inteira */
c.adicionar({ nome: "Leo", x: 8 }); const ic = B.capturar("cena", { nome: "Duelo" }); const sc = JSON.stringify(c.estadoCompleto());
c.limpar(); ok(c.manequins ? true : true, ""); B.aplicar(ic); ok(JSON.stringify(c.estadoCompleto()) === sc, "captura e recarrega a cena inteira");
/* coleção */
c.poses.salvar("Soco salvo"); c.expressoes.salvar("Meu rosto"); const ico = B.capturar("colecao", { nome: "Tudo" });
c.poses.apagar("Soco salvo"); c.expressoes.apagar("Meu rosto"); B.aplicar(ico);
ok(c.poses.lista().some(p => p.nome === "Soco salvo") && c.expressoes.lista().some(e => e.nome === "Meu rosto"), "coleção devolve Minhas poses e Minhas expressões");
/* arquivo */
const arq = B.exportar([ip, ir, ie, ic, ico]), volta = B.importar(arq);
ok(volta.length === 5 && volta.every((x, i) => x.codigo === [ip, ir, ie, ic, ico][i].codigo), "exportar/importar arquivo preserva os 5 itens");
erro = ""; try { B.importar("{nada"); } catch (e) { erro = e.message; } ok(/não é uma biblioteca/.test(erro), "recusa arquivo inválido");
erro = ""; try { B.aplicar({ tipo: "xyz", codigo: "1" }); } catch (e) { erro = e.message; } ok(/tipo desconhecido/.test(erro), "recusa item de tipo desconhecido");
if (falhou) { console.log("\nFalhou."); process.exit(1); } console.log("\nTudo certo.");
