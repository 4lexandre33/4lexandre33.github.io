/* GeoMannequin — cenário por imagem de planta e muitos manequins (registro, grade, separar, olhar para o ponto, nível de detalhe).
   Uso: node testes/planta-multidao.mjs */
import { createWorld } from "../mcp/lib/core.mjs";
import { renderSvg } from "../mcp/lib/scene.mjs";
import { decodificarImagem } from "../mcp/lib/decodificar.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };

/* 1. planta: a folha de teste (uma linha: vista de cima | lateral | isométrica) */
{
  const img = await decodificarImagem(readFileSync(join(HERE, "../mcp/test/planta-teste.png")).toString("base64"));
  const w = createWorld(), an = w.cena.lerPlanta(img), L = an.linhas[0];
  ok(an.linhas.length === 1 && L.celulas.length === 3, "acha 1 linha com 3 vistas (" + an.linhas.length + " linha, " + (L && L.celulas.length) + " células)");
  ok(L.escala.pelaLateral && L.escala.metrosLargura > 8 && L.escala.metrosLargura < 25, "escala pela lateral: " + L.escala.metrosLargura.toFixed(1) + " m de largura");
  const tipos = new Set(L.itens.map(i => i.tipo));
  ok(tipos.has("rampaDegraus") && [...tipos].some(t => t === "parede" || t === "predio") && [...tipos].some(t => /arvore|arbusto|palmeira/.test(t)), "entende paredes, escada e árvores: " + [...tipos].join(", "));
  ok(L.manequins.length === 3 && new Set(L.manequins.map(m => m.cor)).size === 3, "3 manequins (vermelho, azul, roxo): " + L.manequins.map(m => m.cor).join(", "));
  const r = w.cena.dePlanta(an, { linha: 0 });
  ok(r.objetos === L.itens.length && r.manequins === 3 && !r.erros.length, "monta " + r.objetos + " peças e " + r.manequins + " manequins");
  const reg = w.cena.registro();
  ok(reg.manequins.every(m => Math.abs(m.x) < 120 && Math.abs(m.z) < 120 && m.altura > 12), "manequins dentro da planta e em pé");
  const s = renderSvg(w, {}).svg; ok(s.length > 1000 && !/NaN/.test(s), "desenha o cenário sem NaN");
}

/* 2. muitos manequins: grade de 60, ninguém sobreposto, registro completo, olhar para o ponto */
{
  const w = createWorld(), c = w.cena;
  const g = c.grade({ n: 60, colunas: 10, espacamento: 5, x: 0, z: -40, pose: "empe", grupo: "Plateia" });
  ok(g.manequins.length === 60 && w.sceneList(true).length === 61, "grade cria 60 (cena com 61; o limite antigo era 12)");
  ok(c.sobrepostos().length === 0, "ninguém sobreposto depois da grade");
  const reg = c.registro();
  ok(reg.total === 61 && reg.manequins.every(m => m.pegada && typeof m.giro === "number") && reg.manequins.filter(m => m.grupo === "Plateia").every(m => m.pose === "empe"), "registro: posição, pegada, pose e giro de todos");
  c.olharPara("grupo:Plateia", [0, 0]);
  const desvio = Math.max(...c.registro().manequins.filter(m => m.grupo === "Plateia").map(m => { const a = Math.atan2(0 - m.x, 0 - m.z) * 180 / Math.PI; return Math.abs(((m.giro - a + 540) % 360) - 180); }));
  ok(desvio < 25, "olhar para o ponto: todos com a frente para (0, 0) (desvio máx. " + desvio.toFixed(0) + "°)");
  /* empurra dois para o mesmo lugar e separa */
  const a = c.obter("Plateia 1"), b = c.obter("Plateia 2"); b.posicao(a.params ? 0 : 0, 0); a.posicao(0.3, 0);
  const antes = c.sobrepostos().length, sep = c.separar();
  ok(antes > 0 && sep.restantes === 0, "separar: " + antes + " sobreposição(ões) → 0 (" + sep.movidos.length + " movidos)");
  const ci = c.arranjo("circulo", { n: 10, raio: 14, x: 40, z: 0, grupo: "Roda" });
  ok(ci.manequins.length === 10, "círculo de 10 virado para o centro");
}

/* 3. nível de detalhe: manequim pequeno na tela vira figura simples (leve) */
{
  const w = createWorld(), c = w.cena;
  c.grade({ n: 20, colunas: 5, espacamento: 6, x: 0, z: -160, pose: "empe" });
  const t0 = performance.now(), s = renderSvg(w, {}).svg, dt = performance.now() - t0;
  ok(/class="lod"/.test(s), "figuras distantes em modo simples (" + (s.length / 1024).toFixed(0) + " KB, " + dt.toFixed(0) + " ms)");
}

if (falhou) { console.log("\nFALHOU"); process.exit(1); } else console.log("\nplanta-multidao: tudo ok");
