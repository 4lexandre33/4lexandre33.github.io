/* Gera src/scene/pegadas-formas-tabela.js: para cada objeto que dá para segurar, as FORMAS de segurar que funcionam de verdade
   (testadas uma a uma: sem erro, palma alcança, mãos em lugares diferentes, nada dentro do tronco/cabeça, dedos fora do objeto),
   em ordem de preferência para aquele tipo de objeto. Uso: node ferramentas/pegadas-formas.mjs [--paralelo 4]
   (roda em processos filhos; leva alguns minutos). */
import { createWorld } from "../mcp/lib/core.mjs";
import { writeFileSync, readFileSync } from "fs";
import { fork } from "child_process";
import { fileURLToPath } from "url";

const AQUI = fileURLToPath(import.meta.url), NAO = /^(animal|arvore|palmeira|predio|agua|poco|rampaDegraus|parede|carruagem|carroca|barcoRemo|canoa|veleiro|balsa|navio|balsaGrande|trem|locomotiva|vagao|trilho|degrau|coluna|corda|cama|mesaComAlca|cadeiraVazada|baseRetangular|basePerfil|baseCircular)$/;
/* preferência por grupo de pegada (a 1ª que passar vira a padrão) */
const ORDEM_GRUPO = ["empunhar", "mirar", "tocar", "cotidiano", "golpe", "usar ferramenta", "carregar", "sustentar", "levantar", "empurrar", "puxar", "arrastar", "arremessar", "alcançar", "defender"];
/* que grupos de pegada fazem sentido para cada tipo de objeto (corta as combinações absurdas e o tempo do teste) */
const G_ARMA = ["empunhar", "carregar", "alcançar", "arremessar", "usar ferramenta", "defender"], G_FOGO = ["mirar", "empunhar", "carregar"], G_INSTR = ["tocar", "empunhar", "carregar", "cotidiano"],
  G_MIUDO = ["cotidiano", "empunhar", "carregar", "arremessar", "alcançar", "sustentar"], G_FERR = ["usar ferramenta", "carregar", "empunhar", "alcançar", "levantar"],
  G_LONGO = ["carregar", "levantar", "arrastar", "empurrar", "puxar", "usar ferramenta", "alcançar", "sustentar"], G_PESADO = ["carregar", "levantar", "sustentar", "empurrar", "puxar", "arrastar", "arremessar"], G_RODAS = ["empurrar", "puxar", "carregar", "arrastar"];
function gruposDe(tipo, T, C) { const g = (C && C.grupo) || (T && T.grupo) || "", d = T ? [T.larg || 0, T.prof || 0, T.alt || 0] : [1, 1, 1], mx = Math.max(...d);
  if (/arma-fogo|arma-distancia/.test(g)) return G_FOGO; if (/instrumento/.test(g)) return G_INSTR; if (/escudo/.test(g) || tipo === "escudo") return ["defender", "carregar", "empunhar"];
  if (/arma|magico/.test(g) || ["bastao", "cajado", "espada", "lanca", "arco"].includes(tipo)) return G_ARMA; if (/ferramenta/.test(g)) return G_FERR; if (/rodas/.test(g)) return G_RODAS;
  if (/cotidiano/.test(g) || mx <= 3) return G_MIUDO; if (/constru|esporte/.test(g) || mx >= 12) return G_LONGO; return G_PESADO; }
function avaliar(tipo) { const w = createWorld(), it = w.cena.ativo, GR = gruposDe(tipo, w.TIPOS_OBJETO[tipo], w.COMPOSTOS && w.COMPOSTOS[tipo]), cand = w.cena.pegadas().filter(a => a.grupo === "golpe" ? a.teste === tipo : GR.includes(a.grupo)), out = [];
  for (const a of cand) { const W = createWorld(); try { W.cena.objeto(tipo, { x: 0, z: 6, nome: "Obj" }); const r = W.cena.ativo.segurarComo("Obj", a.tipo);
      const p = W.SCN.list[0].params, cs = W.capsulas(p).caps || W.capsulas(p), c = n => { const q = cs.find(x => x.nome === n); return q.a.map((v, i) => (v + q.b[i]) / 2); };
      const sep = a.maos === 2 ? Math.hypot(...c("maoE").map((v, i) => v - c("maoD")[i])) * 11.4 : 99;
      const ruim = (r.aproximado > 8) || r.dedosEntram > 2.5 || (r.atravessa || []).some(x => /torax|abdomen|pelve|cabeca|pescoco/.test(x)) || (a.maos === 2 && (sep < 7 || sep > 120)) || r.alcance !== "ok";
      if (!ruim) out.push({ tipo: a.tipo, grupo: a.grupo, maos: a.maos, sep: Math.round(sep) }); } catch (e) { } }
  out.sort((x, y) => (ORDEM_GRUPO.indexOf(x.grupo) - ORDEM_GRUPO.indexOf(y.grupo)) || (x.grupo === "golpe" ? 0 : 0)); void it; return out; }
if (process.argv[2] === "--filho") { process.on("message", tipos => { for (const t of tipos) { let r = []; try { r = avaliar(t); } catch (e) { r = []; } process.send({ [t]: r }); } process.exit(0); }); }
else { const w = createWorld(), CACHE = process.env.GM_CACHE_FORMAS || null, tab = {};
  if (CACHE) { try { Object.assign(tab, JSON.parse(readFileSync(CACHE, "utf8"))); } catch (e) { } }
  const tipos = Object.keys(w.TIPOS_OBJETO).filter(t => !NAO.test(t)), falta = tipos.filter(t => !tab[t]), N = +(process.argv[process.argv.indexOf("--paralelo") + 1] || 2) || 2, partes = Array.from({ length: N }, (_, i) => falta.filter((_, j) => j % N === i));
  /* cada filho manda o resultado de um objeto por vez (e o cache guarda): se um filho cair, os outros seguem e a próxima rodada continua de onde parou */
  await Promise.all(partes.map(p => new Promise(ok => { if (!p.length) return ok(); const f = fork(AQUI, ["--filho"]); f.on("message", r => { Object.assign(tab, r); if (CACHE) writeFileSync(CACHE, JSON.stringify(tab)); process.stdout.write("."); }); f.on("exit", ok); f.on("error", ok); f.send(p); })));
  const ord = Object.fromEntries(tipos.map(t => { const GR = gruposDe(t, w.TIPOS_OBJETO[t], w.COMPOSTOS && w.COMPOSTOS[t]), pos = x => x.grupo === "golpe" ? (GR[0] === "empunhar" || GR[0] === "mirar" ? 0.5 : 50) : GR.includes(x.grupo) ? GR.indexOf(x.grupo) : 99;
    return [t, (tab[t] || []).filter(x => pos(x) < 99).sort((a, b) => pos(a) - pos(b) || (a.maos - b.maos) * (GR === G_LONGO || GR === G_PESADO ? -1 : 0)).slice(0, 12).map(x => x.tipo)]; }));
  const poucas = Object.entries(ord).filter(([, v]) => v.length < 5).map(([k, v]) => k + "(" + v.length + ")");
  writeFileSync(new URL("../src/scene/pegadas-formas-tabela.js", import.meta.url), "/* GERADO por ferramentas/pegadas-formas.mjs — formas de segurar testadas para cada objeto (a 1ª é a padrão). Não edite à mão. */\nconst PEGADAS_FORMAS = " + JSON.stringify(ord, null, 0).replace(/\],"/g, '],\n  "') + ";\nexport { PEGADAS_FORMAS };\n");
  console.log("\n" + tipos.length + " objetos; com menos de 5 formas: " + (poucas.join(", ") || "nenhum")); process.exit(0); }
