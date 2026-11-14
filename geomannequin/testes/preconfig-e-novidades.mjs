/* GeoMannequin — pré-configurações (500+, todas compilam, cabeças no quadro, câmera que acompanha no filme), autocompletar com miniatura,
   animações de animal (auditoria dos cascos), poses/expressões/interações extras, tom da cena e efeitos no tempo.
   Uso: node testes/preconfig-e-novidades.mjs [--rapido] */
import { createWorld } from "../mcp/lib/core.mjs";
let falhou = false; const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const M = 1 / 0.114, w = createWorld(), comp = t => w.compilarName(t, { semCache: true, salvar: false }), rapido = process.argv.includes("--rapido");

console.log("1. catálogo de pré-configurações");
{ const L = w.PRECONFIG, ids = new Set(L.map(d => d.id)); ok(L.length >= 500, L.length + " pré-configurações (500+)"); ok(ids.size === L.length, "ids únicos");
  ok(L.every(d => /^[a-z0-9.-]+$/.test(d.id)), "ids em minúsculas, sem acento (dá para digitar)");
  const raiz = Object.keys(w.pcArvore().filhos); ok(raiz.length >= 15, "árvore com " + raiz.length + " ramos: " + raiz.join(", "));
  ok(w.pcAchar("dialogo.dois.frente.ombro-a-dir").tecnico.includes("over-the-shoulder"), "o OTS (sobre o ombro) está no catálogo com o nome técnico");
  ok(w.pcBuscar("dirty single").length >= 2 && w.pcProximos("dialogo").map(n => n.nome).join() === "dois,tres", "busca e próximos níveis da árvore"); }

console.log("2. todas compilam e enquadram as cabeças");
{ const NOMES = ["Kai", "Mira", "Leo", "Ana", "Rui"], ruins = [], ISENTO = /^(um\.primeiro-plano\.zenital|pov\.pes-do-outro)$/; let n = 0;
  const lista = rapido ? w.PRECONFIG.filter((d, i) => i % 7 === 0) : w.PRECONFIG;
  for (const d of lista) { n++; const r = comp(w.pcDemoTexto(d)); if (!r.ok) { ruins.push(d.id + ": " + r.erros.map(e => e.erro).join("; ")); continue; }
    if (ISENTO.test(d.id) || /olhos|detalhe/.test(d.cam.enq || "")) continue; const q = r.quadros[0], nomes = d.papeis.map((p, i) => p === "M" ? "Trovao" : NOMES[i]);
    const alvos = [].concat(d.cam.tipo === "ombro" ? [d.cam.alvo] : d.cam.tipo === "orbita" ? d.cam.alvo : []).filter(a => a && a !== "M").map(a => nomes[d.papeis.indexOf(a)]);
    for (const a of alvos) { const c = (q.cabecas || {})[a]; if (!c || c.u < -0.02 || c.u > 1.02 || c.v < -0.02 || c.v > 1.02) ruins.push(d.id + ": cabeça de " + a + " fora do quadro"); }
    if ((q.avisos || []).some(x => /estava dentro de/.test(x))) ruins.push(d.id + ": " + q.avisos.join("; ")); }
  ok(!ruins.length, n + " testadas, problemas: " + (ruins.slice(0, 6).join(" | ") || "nenhum")); }

console.log("3. uso no texto: cena preset, camera preset, filme");
{ let r = comp("elenco\n  Kai relevante\n  Mira relevante\nquadro 1\n  cena preset dialogo.dois.frente.ombro-a-dir com Kai, Mira em (2,1) gira 90\n");
  ok(r.ok, "cena preset com em e gira (" + JSON.stringify(r.erros) + ")");
  const e = r.quadros[0].estado, K = e.list.find(x => x.name === "Kai").params, Mi = e.list.find(x => x.name === "Mira").params;
  ok(Math.abs(K.wx / M - 2) < 0.05 && Math.abs(K.wz / M - 1) < 0.05 && Math.abs(K.wRot - 90) < 1, "Kai no ponto pedido, virado 90°");
  ok(Math.abs(Math.hypot(Mi.wx - K.wx, Mi.wz - K.wz) / M - 1.2) < 0.1, "Mira a 1,2 m de Kai (arranjo frente a frente)");
  const c = r.quadros[0].cabecas; ok(c.Mira && c.Mira.u > 0.3 && c.Mira.u < 0.8 && c.Kai && c.Kai.u < c.Mira.u, "OTS: Mira de frente no meio, a nuca de Kai à esquerda");
  r = comp("elenco\n  Kai relevante\n  Mira relevante\nquadro 1\n  cena preset ombro-a-dir com Kai, Mira\n"); ok(r.ok, "basta o fim do id (ombro-a-dir)");
  r = comp("elenco\n  Kai relevante\nquadro 1\n  cena preset dialogo.dois.frente.ombro-a-dir com Kai\n"); ok(!r.ok && /precisa de 2/.test(r.erros[0].erro), "erro claro quando faltam personagens");
  r = comp("elenco\n  Kai relevante\n  Mira relevante\nquadro 1\n  cena preset dialogo.dois.frente.ombro-z com Kai, Mira\n"); ok(!r.ok && /Parecidas/.test(r.erros[0].erro), "id errado sugere parecidas");
  r = comp("elenco\n  Kai relevante\n  Mira relevante\nquadro 1\n  cena preset dialogo.dois.mesa.mestre-perfil com Kai, Mira\n"); ok(r.ok && r.quadros[0].estado.objetos.filter(o => o.tipo === "cadeira").length === 2 && r.quadros[0].estado.objetos.some(o => o.tipo === "mesa"), "sentados ganham cadeira; a mesa vem junto");
  r = comp("elenco\n  Kai relevante\n  Trovao animal cavalo sela\nquadro 1\n  cena preset animal.montaria.perfil com Kai, Trovao\n"); ok(r.ok, "montaria: A monta M (" + JSON.stringify(r.erros) + ")");
  r = comp('elenco\n  Kai relevante\n  Mira relevante\nfilme "F" fps 6\ncena "rua"\n  cena preset dialogo.dois.andando.frontal com Kai, Mira\n  plano 1\n    camera preset dialogo.dois.andando.frontal-inteiro com Kai, Mira\n    0s Kai anda 4m\n    0s Mira anda 4m\n');
  ok(r.ok, "filme com camera preset (" + JSON.stringify(r.erros) + ")");
  const v = w.videoDoFilme(r, { fps: 6, vida: false }), f0 = v.frames[0].estado.camera, f1 = v.frames[v.frames.length - 1].estado.camera;
  ok(Math.hypot(f1.tx - f0.tx, f1.tz - f0.tz) / M > 2, "no filme a câmera do preset acompanha quem anda (" + (Math.hypot(f1.tx - f0.tx, f1.tz - f0.tz) / M).toFixed(1) + " m)"); }

console.log("4. autocompletar com miniatura");
{ const casos = { "quadro 1 plano.": "enq", "quadro 1 angulo.": "ang", "quadro 1 lado.": "lado", "quadro 1 lente.": "lente", "  0s camera.": "cmov", "quadro 1 tom.": "tom", "  Kai expressao.": "expr", "  Kai gesto.": "gesto",
    "  Kai interacao.": "interacao", "  Kai efeito.": "efeito", "  objeto.": "objeto", "pagina formato.": "formato", "quadro 1 borda.": "borda", "quadro 1 ritmo.": "ritmo", "  1s camera aproxima 30 em 2s curva.": "curva",
    "  cena preset dialogo.dois.": "ramo", "elenco\n  Trovao animal cavalo\nquadro 1\n  Trovao pose.": "apose", "elenco\n  Trovao animal cavalo\nquadro 1\n  Trovao anima.": "aanim", "elenco\n  Kai relevante corpo.": "corpo" };
  const falhas = []; for (const [t, tipo] of Object.entries(casos)) { const r = w.pdCompletar(t, {}); const it = r && r.itens[0]; if (!it || !it.mini || it.mini.tipo !== tipo) { falhas.push(t.split("\n").pop() + " → " + (it ? JSON.stringify(it.mini) : "nada")); continue; }
    if (/^(cmov|curva|formato|borda|ritmo|trans|tam|balao)$/.test(tipo) && !/<svg/.test(w.pdMiniaturaItem(it.mini, {}))) falhas.push(t + ": sem diagrama"); }
  ok(!falhas.length, Object.keys(casos).length + " listas com miniatura" + (falhas.length ? ": " + falhas.join(" | ") : ""));
  const pr = w.pdCompletar("  cena preset dialogo.dois.frente.ombro-a", {}); ok(pr && pr.itens.some(i => i.v === "ombro-a-dir com "), "preset: a folha completa com “ com ”");
  const t0 = Date.now(); for (let i = 0; i < 50; i++) w.pdCompletar("quadro 1 plano.", {}); ok((Date.now() - t0) / 50 < 50, "listar < 50 ms"); }

console.log("5. animais animados, poses extras, tom, efeitos no tempo");
{ ok(w.listaAnimacoesAnimal().length >= 60, w.listaAnimacoesAnimal().length + " animações de animal");
  for (const [n, lim] of [["passo", 10], ["trote", 15], ["galope", 30]]) { const a = w.amaAuditar(n, "cavalo", { fps: 24 }); ok(a.escorregaCmS < lim && a.afundaCm > -3, n + ": casco escorrega " + a.escorregaCmS + " cm/s (< " + lim + "), afunda " + a.afundaCm + " cm"); }
  ok(w.listaPosesExtras().length >= 180 && Object.keys(w.EXPRESSOES_EXTRA).length >= 40 && w.listaInteracoesExtras().length >= 45, "poses, expressões e interações extras");
  const r = comp('elenco\n  Kai relevante\nfilme "T" fps 6\ncena "c" tom sepia\n  plano 1 duracao 2s\n    Kai em (0,0)\n    0.5s efeito explosao em (1,0) cresce por 1s\n'); ok(r.ok && r.quadros[0].tom === "sepia", "tom da cena vai para os planos (" + JSON.stringify(r.erros) + ")"); }

console.log(falhou ? "\nFALHOU" : "\ntudo certo"); process.exit(falhou ? 1 : 0);
