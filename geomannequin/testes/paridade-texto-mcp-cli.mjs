/* Paridade: cada recurso novo tem TEXTO (compila), ferramenta MCP, linha de comando (gm.mjs = as mesmas ferramentas do MCP) e está no MANUAL. */
import { createWorld } from "../mcp/lib/core.mjs";
import { registerAll } from "../mcp/lib/tools.mjs";
import { execFileSync } from "node:child_process";
let falhou = false; const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const FERR = new Set(); registerAll({ registerTool: n => FERR.add(n), registerResource() { }, registerPrompt() { } }, () => createWorld(), {});
const cli = execFileSync(process.execPath, ["mcp/gm.mjs", "lista"], { encoding: "utf8" }).split("\n").filter(l => /^  \S/.test(l)).map(l => l.trim().split(/\s+/)[0]);
ok(cli.length === FERR.size && cli.every(n => FERR.has(n)), "linha de comando lista as " + FERR.size + " ferramentas do MCP (" + cli.length + ")");
const w = createWorld(), man = w.manualName(), comp = t => w.compilarName(t, { semCache: true, salvar: false });
const E = "elenco\n  Kai\n  Mira\n  Rex animal lagarto\n  A animal cavalo\n  B animal cavalo\n";
const F = (corpo, dur = 4) => 'filme "P" fps 4\n' + E + 'local "L" unidade m\n  chao retangulo -30,-30 a 30,30\ncena "C" local "L"\n  plano 1 duracao ' + dur + "s\n    Kai em (0,0)\n    Mira em (0,4)\n" + corpo.split("\n").map(l => "    " + l).join("\n") + "\n    camera fixa\n";
const Q = corpo => E + "quadro 1\n  Kai em (0,0)\n  Mira em (0,4)\n  Rex em (5,0)\n" + corpo.split("\n").map(l => "  " + l).join("\n") + "\n";
const R = [
  ["montar em qualquer animal (escala automática)", Q("Kai monta Rex"), "catalogo", /38\. MONTAR EM QUALQUER ANIMAL/],
  ["montar com escala escolhida", Q("Kai monta Rex escala 12"), "filme_texto", /monta Rex \[escala N\]/],
  ["esgrima: um movimento com varinha", Q("Kai esgrima estocada em Mira feitico gelo"), "catalogo", /39\. ESGRIMA/],
  ["esgrima com espada", Q("Kai esgrima quarta em Mira com sabre"), "gerar_name", /Kai esgrima estocada em Mira/],
  ["duelo de varinha pronto", F("0s Kai duelo-varinha Mira rodadas 4", 5), "filme_texto", /duelo-varinha/],
  ["artes marciais: pose", Q("Kai pose amTigreGarra"), "catalogo", /40\. ARTES MARCIAIS/],
  ["artes marciais: animação", F("0s Kai anima cincoAnimaisAnim", 5), "animacao_texto", /cincoAnimaisAnim/],
  ["veículo andando (trem no trilho)", F('objeto trilho "Linha" em (8,0) profundidade 40\nobjeto trem "Trem" em (8,-10) vagoes 1\n0s Trem anda 20m no-trilho Linha'), "filme_texto", /no-trilho/],
  ["carruagem com 4 cavalos", Q('objeto carruagem "Coche" em (10,0)\nA em (10,2.5)\nA puxa Coche\nB puxa Coche'), "catalogo", /VÁRIOS CAVALOS/],
  ["navio e balsa grande", Q('objeto navio "Nau" em (0,40)\nobjeto balsaGrande "Ferry" em (30,0)\nKai embarca Nau assento leme'), "catalogo", /NAVIO/],
  ["efeito impulso (explosão branca)", Q("efeito impulso em Kai dash 1"), "efeitos", /IMPULSO/],
  ["borrão de movimento", Q("efeito borrao_movimento em Kai"), "efeitos", /BORRÃO/],
  ["projétil esticado", Q("efeito projetil de Kai.maoDir para Mira estica 2"), "efeitos", /estica 2/],
  ["efeitos automáticos no filme", F("0s Kai anima puloCompleto").replace('fps 4', 'fps 4 efeitos auto'), "exportar_filme", /efeitos auto/],
  ["formas de segurar (como N, uma/duas mãos)", Q("Kai segura bastao como 1\nMira segura bastao duas-maos"), "catalogo", /43\. FORMAS DE SEGURAR/],
  ["câmera parada num ponto do filme", F("camera (8,2,2) olhando (0,1,2)").replace("    camera fixa\n", ""), "camera_plano", /camera \(x,altura,z\) olhando/],
  ["linha de comando", null, null, /42\. LINHA DE COMANDO/]];
for (const [nome, txt, ferr, re] of R) { const r = txt ? comp(txt) : { ok: true, erros: [] }; ok(r.ok && (!ferr || FERR.has(ferr)) && re.test(man), nome + (r.ok ? "" : " — texto: " + JSON.stringify(r.erros).slice(0, 160)) + (ferr && !FERR.has(ferr) ? " — sem MCP " + ferr : "") + (re.test(man) ? "" : " — falta no manual " + re)); }
console.log(falhou ? "\nFALHOU" : "\ntudo certo"); process.exit(falhou ? 1 : 0);
