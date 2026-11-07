/* GeoMannequin — Web Worker: desenha camadas (uma "foto" por manequim) fora da thread da página.
   Recebe {n, job} com job = {o:{p,pal,gy}, lanc:[...], L, fast}; responde {n, res} (ou {n, erro}).
   Cada worker guarda as malhas de cada manequim (pelo id), como a página faz. */
import { newCache, renderJob } from "./index.js";

const malhas = new Map();
function comCache(o) {
  const id = o.p._id;
  if (id !== undefined) { if (!malhas.has(id)) malhas.set(id, newCache()); o.p._cache = malhas.get(id); }
  return o;
}
self.onmessage = e => {
  const { n, job } = e.data || {};
  if (n === undefined) return;
  try {
    comCache(job.o); (job.lanc || []).forEach(comCache);
    const res = renderJob(job);
    self.postMessage({ n, res }, res.z ? [res.z.z.buffer] : []);
  } catch (err) { self.postMessage({ n, erro: String(err && err.message || err) }); }
};
self.postMessage({ pronto: true });
