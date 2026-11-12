/* GeoMannequin — construtor de efeitos por camadas (46 prontos), ações de luta com rosto e efeitos,
   funções narrativas (tags) e molejo. Uso: node testes/vfx-acoes.mjs */
import { createWorld } from "../mcp/lib/core.mjs";
import { renderSvg } from "../mcp/lib/scene.mjs";
import { PRESETS_VFX, ESTILOS_VFX, validarCamadas } from "../src/engine/index.js";

let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const w = createWorld(), m = w.cena.ativo, fx = w.cena.efeitos;

/* 1. todos os prontos desenham, em nanquim e coloridos, sem NaN */
const nomes = Object.keys(PRESETS_VFX);
ok(nomes.length >= 46, "prontos de mangá: " + nomes.length);
let ruins = [];
for (const t of nomes) for (const colorido of [false, true]) {
  fx.limpar(); fx.adicionar(t, { ancora: { parte: "maoDir" }, colorido });
  const r = renderSvg(w, {}).svg;
  if (r && /NaN|Infinity/.test(r)) ruins.push(t + (colorido ? " (cor)" : ""));
}
ok(!ruins.length, "prontos sem NaN no desenho" + (ruins.length ? ": " + ruins.join(", ") : ""));

/* 2. construtor: camadas novas, estilo e validação */
fx.limpar();
const id = fx.criar([{ forma: "fita", caminho: { tipo: "espiral", voltas: 2 }, traco: { largura: 2, perfil: "fuso" } }, { forma: "particulas", caminho: { tipo: "reta", comprimento: 6 }, repetir: { tipo: "leque", n: 5 } }], { ancora: { parte: "maoDir" }, estilo: "cel" });
ok(typeof id === "string" && fx.lista().length === 1 && fx.lista()[0].estilo === "cel", "criar por camadas com estilo cel");
let erro = ""; try { fx.criar([{ forma: "xyz" }]); } catch (e) { erro = e.message; }
ok(/forma|xyz/i.test(erro), "camada com forma errada → erro claro: " + erro.slice(0, 80));
ok(Object.keys(ESTILOS_VFX).length === 6, "6 estilos de acabamento");
const pecas = fx.construtor();
ok(pecas.caminhos.length >= 11 && pecas.formas.length >= 14 && pecas.repetir.length >= 7, "construtor lista caminhos, formas e repetições");
ok(fx.prontos().every(p => validarCamadas ? (validarCamadas(p.camadas), true) : true), "camadas de todos os prontos validam");

/* 3. ações de luta: pose + expressão + efeitos (os anteriores da mesma pessoa saem) */
const acoes = w.cena.acoes();
ok(acoes.length >= 26, "ações: " + acoes.length);
let semFx = [];
for (const a of acoes) { fx.limpar(); m.acao(a.acao); if (a.efeitos.length && fx.lista().length < a.efeitos.length) semFx.push(a.acao); }
ok(!semFx.length, "cada ação põe seus efeitos" + (semFx.length ? ": " + semFx.join(", ") : ""));
fx.limpar(); m.acao("socoCarregado"); const n1 = fx.lista().length; m.acao("chuteVoador"); const n2 = fx.lista().length;
ok(n1 > 0 && n2 === acoes.find(a => a.acao === "chuteVoador").efeitos.length, "trocar de ação troca os efeitos (" + n1 + " → " + n2 + ")");
fx.limpar(); m.acao("esquivaBaixa", { efeitos: false }); ok(fx.lista().length === 0, "efeitos: false só põe pose e rosto");

/* 4. funções narrativas */
const arv = w.cena.poses.arvore();
ok(arv && Object.keys(arv).length >= 4, "árvore de funções: " + Object.keys(arv).join(", "));
const comb = w.cena.poses.porTag("Combate"), ataque = w.cena.poses.porTag("Combate/Ataque");
ok(comb.length > ataque.length && ataque.length > 0, "Combate inclui as subcategorias (" + comb.length + " ⊃ " + ataque.length + ")");
m.poseRapida("caminhando"); w.cena.poses.salvar("Minha"); w.cena.poses.etiquetar("Minha", ["Teste/Sub"]); ok(w.cena.poses.porTag("Teste").some(x => x === "minha:Minha"), "etiquetar pose salva");

/* 5. molejo: muda a pose, determinístico pela semente, 0 desliga */
m.poseRapida("empe", { molejo: 0 }); const q0 = JSON.stringify(w.sceneList(true)[0].p);
m.poseRapida("empe"); const q1 = JSON.stringify(w.sceneList(true)[0].p);
m.poseRapida("empe"); const q2 = JSON.stringify(w.sceneList(true)[0].p);
ok(q0 !== q1 && q1 === q2, "molejo varia a pose e repete com a mesma semente");

/* 6. abraço de frente: os dois abraçam com as duas mãos (nenhum braço pendurado) */
{ const w2 = createWorld(); w2.cena.adicionar({ nome: "Leo", x: 8, z: 0, giro: -90 }); w2.cena.ativo.girar(90); w2.cena.interagir(w2.cena.ativo.nome, "Leo", "abracoFrente");
  const L = w2.sceneList(true); ok(L.slice(0, 2).every(x => Math.abs(x.p.armFlexL) > 20 && Math.abs(x.p.armFlexR) > 20), "abraço de frente: quatro braços em volta"); }

if (falhou) { console.log("\nFALHOU"); process.exit(1); } else console.log("\nvfx-acoes: tudo ok");
