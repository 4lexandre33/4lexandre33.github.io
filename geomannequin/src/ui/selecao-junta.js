/* GeoMannequin — a articulação escolhida é uma só para o palco e para as vistas de pose:
   escolher em qualquer lugar destaca nas outras janelas (evento "gm:junta"). */
let atual = null;
export function juntaSel() { return atual; }
export function escolherJunta(j, origem) {
  const novo = j ? { k: j.k, s: j.s || 0, dedo: j.dedo, nome: j.nome } : null;
  const igual = (a, b) => (!a && !b) || (a && b && a.k === b.k && a.s === b.s && a.dedo === b.dedo);
  if (igual(novo, atual)) return;
  atual = novo;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("gm:junta", { detail: { junta: atual, origem } }));
}
