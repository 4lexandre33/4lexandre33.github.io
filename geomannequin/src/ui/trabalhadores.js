/* GeoMannequin — vários núcleos do processador: cada camada (manequim) pode ser desenhada num Web Worker.
   - Na pasta (servidor): worker de módulo src/engine/trabalhador.js.
   - No arquivo único (dist): o código do worker vem embutido num <script type="text/plain" id="gm-trabalhador">.
   - Sem suporte (ou se o worker falhar): tudo volta a ser desenhado na própria página, como antes.
   Fila por camada: se a mesma camada for pedida de novo antes de começar, só o pedido mais novo fica. */
let W = [], ok = false, seq = 0, falhou = false;
const fila = new Map(), emVoo = new Map(), espera = new Map();

function criar() {
  const emb = typeof document !== "undefined" && document.getElementById("gm-trabalhador");
  if (emb) return new Worker(URL.createObjectURL(new Blob([emb.textContent], { type: "text/javascript" })));
  return new Worker(new URL("../engine/trabalhador.js", import.meta.url), { type: "module" });
}
function desligar(motivo) {
  if (falhou) return;
  falhou = true; ok = false;
  W.forEach(t => { try { t.w.terminate(); } catch (e) { } });
  W = []; fila.clear();
  const cbs = [...espera.values()]; espera.clear(); emVoo.clear();
  cbs.forEach(c => { try { c.cb(null); } catch (e) { } });
  if (typeof console !== "undefined") console.info("GeoMannequin: desenho em paralelo desligado (" + motivo + "); tudo continua na página.");
}
function bombear() {
  for (const t of W) {
    if (t.ocupado || !t.pronto) continue;
    const prox = fila.entries().next(); if (prox.done) return;
    const [slot, pedido] = prox.value; fila.delete(slot);
    const n = ++seq; t.ocupado = n;
    emVoo.set(slot, pedido.chave); espera.set(n, { slot, cb: pedido.cb, t });
    try { t.w.postMessage({ n, job: pedido.job }); } catch (e) { desligar("falha ao enviar"); return; }
  }
}
function iniciarTrabalhadores() {
  if (typeof Worker === "undefined" || typeof URL === "undefined") return;
  const n = Math.max(1, Math.min(4, ((typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 2) - 1));
  try {
    for (let i = 0; i < n; i++) {
      const t = { w: criar(), ocupado: 0, pronto: false };
      t.w.onmessage = e => {
        const m = e.data || {};
        if (m.pronto) { t.pronto = true; ok = !falhou; bombear(); return; }
        const q = espera.get(m.n); espera.delete(m.n); t.ocupado = 0;
        if (q) { emVoo.delete(q.slot); try { q.cb(m.erro ? null : m.res, m.erro); } catch (err) { } }
        bombear();
      };
      t.w.onerror = e => { if (e && e.preventDefault) e.preventDefault(); desligar("erro no worker"); };
      W.push(t);
    }
  } catch (e) { desligar("sem suporte"); }
}
/* pede uma camada: cb(res) quando pronta (ou cb(null) se o paralelo for desligado) */
function pedirCamada(slot, chave, job, cb) {
  if (!ok) return false;
  if (emVoo.get(slot) === chave) return true;          /* já está sendo desenhada */
  const f = fila.get(slot); if (f && f.chave === chave) return true;
  fila.set(slot, { chave, job: job(), cb });
  bombear();
  return true;
}
function paraleloAtivo() { return ok; }
function quantosTrabalhadores() { return ok ? W.length : 0; }
function ocupados() { return fila.size + emVoo.size; }

export { iniciarTrabalhadores, pedirCamada, paraleloAtivo, quantosTrabalhadores, ocupados };
