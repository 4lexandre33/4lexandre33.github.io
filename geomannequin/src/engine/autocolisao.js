/* GeoMannequin — o manequim atravessando a si mesmo: pares de cápsulas do MESMO corpo que não são vizinhos
   (mão dentro do tronco, antebraço atravessando a coxa, um pé dentro do outro…). Encostar é permitido;
   atravessar além de "tol" (em R, padrão 0,5: as cápsulas são mais gordas que a pele, então encostar dá até ~0,45). Também serve para a estimativa de quantas poses são possíveis. */
import { capsulas, segSeg } from "./colisao-cena.js";

/* vizinhos (ligados por articulação ou que se tocam naturalmente) não contam */
const VIZINHOS0 = ["cabeca|pescoco", "pescoco|torax", "torax|torax", "torax|abdomen", "abdomen|pelve", "torax|pelve", "abdomen|torax",
  "bracoE|torax", "bracoD|torax", "pescoco|bracoE", "pescoco|bracoD", "bracoE|antebracoE", "bracoD|antebracoD", "antebracoE|maoE", "antebracoD|maoD",
  "coxaE|pelve", "coxaD|pelve", "abdomen|coxaE", "abdomen|coxaD", "coxaE|pernaE", "coxaD|pernaD", "pernaE|peE", "pernaD|peD", "coxaD|coxaE"];
const chaveAuto = (a, b) => a < b ? a + "|" + b : b + "|" + a;
const VIZINHOS = new Set(VIZINHOS0.map(k => chaveAuto(...k.split("|"))));
function autoColisoes(p, tol) {
  tol = tol === undefined ? 0.5 : tol;
  const C = capsulas(Object.assign({}, p, { wx: 0, wy: 0, wz: 0, wRot: 0 })).caps, out = [];
  for (let i = 0; i < C.length; i++) for (let j = i + 1; j < C.length; j++) {
    const a = C[i], b = C[j]; if (a.nome === b.nome || VIZINHOS.has(chaveAuto(a.nome, b.nome))) continue;
    const r = segSeg(a.a, a.b, b.a, b.b), prof = a.r + b.r - r.d;
    if (prof > tol) out.push({ a: a.nome, b: b.nome, prof: Math.round(prof * 100) / 100, ponto: r.p.map((v, k) => (v + r.q[k]) / 2) });
  }
  return out.sort((x, y) => y.prof - x.prof);
}
export { autoColisoes };
