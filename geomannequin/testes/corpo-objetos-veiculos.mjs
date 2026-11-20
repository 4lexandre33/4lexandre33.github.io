/* Pernas cruzadas de verdade, mãos nos marcos do corpo (braço natural), objetos do dia a dia, instrumentos, veículos por
   categoria, efeitos para todas as poses, mais de 1.000 poses novas e as câmeras prontas de veículo, música e objetos. */
import { createWorld } from "../mcp/lib/core.mjs";
import * as E from "../src/engine/index.js";
import { cruzarPernas, PC_MODOS, pcPontos, pcFolga } from "../src/scene/pernas-cruzadas.js";
import { MARCOS, POSE_MAOS, marcoNoMundo } from "../src/scene/maos-alvo.js";
import { OBJ_CASA } from "../src/engine/objetos-casa.js";
import { POSES_MIL } from "../src/scene/poses-mil.js";
let falhas = 0; const ok = (c, m) => { console.log((c ? "  ok  " : "  FALHA ") + m); if (!c) falhas++; };
const w = createWorld(), it = w.cena.ativo, P = () => w.SCN.list[w.SCN.active].params;
const w2 = createWorld(), comp = (txt) => w2.compilarName(txt, { semCache: true, salvar: false });

/* ---------- pernas cruzadas ---------- */
{ const ruins = []; for (const modo of Object.keys(PC_MODOS)) for (const s of [1, -1]) { it.poseRapida(modo === "empe" ? "empe" : /indio|lotus|borboleta|lado/.test(modo) ? "sentadoChao" : "sentado", { molejo: 0 }); const Q = Object.assign({}, P()), r = cruzarPernas(Q, modo, s), g = E.legGap(Q, E.shape(Q));
    if (g < -0.08) ruins.push(modo + s + " " + g.toFixed(2)); if (E.legClear(Q, E.shape(Q))) ruins.push(modo + s + " a trava abriria as pernas"); }
  ok(!ruins.length, "8 modos de pernas cruzadas × 2 lados: pernas encostam sem atravessar e a trava não abre " + ruins.join(", ")); }
{ it.poseRapida("sentadoPernasCruzadas", { molejo: 0 }); const Q = P(), ch = E.chainSetup(Q, E.shape(Q)), A = E.legDims(Q), d = pcPontos(Q, ch, A, -1).lp.calf.T, e = pcPontos(Q, ch, A, 1).lp.calf.T;
  ok(d[1] > e[1] + 0.3 * A.k && Math.abs(d[0] - e[0]) < 1.5 * A.k, "sentadoPernasCruzadas: o joelho direito fica EM CIMA do esquerdo (Δy " + (d[1] - e[1]).toFixed(2) + ", Δx " + (d[0] - e[0]).toFixed(2) + ")"); }
{ it.poseRapida("meditando", { molejo: 0 }); const Q = P(); ok(Q.hipAbdL > 10 && Q.kneeFlexL > 120 && Q.kneeFlexR > 120, "meditando: sentado de pernas cruzadas no chão (abre " + Q.hipAbdL + ", joelhos " + Q.kneeFlexL + "/" + Q.kneeFlexR + ")"); }

/* ---------- mãos nos marcos ---------- */
{ const longe = []; for (const n of Object.keys(POSE_MAOS)) { if (!w.todasPoses().includes(n)) continue; it.poseRapida(n, { molejo: 0 }); const p = Object.assign({}, P(), { wx: 0, wz: 0, wRot: 0 }), ch = E.chainSetup(p, E.shape(p)), C = E.capsulas(p).caps;
    for (const [L, mk] of Object.entries(POSE_MAOS[n])) { const t = L === "L" ? 1 : -1, a = marcoNoMundo(p, mk, t, ch), h = C.find(c => c.nome === (t > 0 ? "maoE" : "maoD")).a, d = Math.hypot(h[0] - a[0], h[1] - a[1], h[2] - a[2]); if (d > 1.9) longe.push(n + ":" + L + " " + d.toFixed(2)); } }
  console.log("    (longe: " + longe.length + ")");
  ok(longe.length <= Math.ceil(Object.keys(POSE_MAOS).length * 0.06), "poses com mão em marco (" + Object.keys(POSE_MAOS).length + "): a mão chega ao marco (≤ 1,9 R: a mão de cima se afasta um pouco para os braços não se atravessarem) — longe: " + longe.slice(0, 6).join(", ")); }
{ it.poseRapida("bracosCruzadosPeito", { molejo: 0 }); const Q = P(); const ch = E.chainSetup(Q, E.shape(Q)), C = E.capsulas(Object.assign({}, Q, { wx: 0, wz: 0, wRot: 0 })).caps, cot = C.find(c => c.nome === "antebracoE").a, omb = E.applyA(ch.A2, [1.92, -2.15, 0]);
  ok(cot[1] < omb[1], "braços cruzados: cotovelo abaixo do ombro (não é a guarda alta de antes)"); }
for (const [txt, re] of [["Kai pose empe mao-dir no queixo", /mao-dir no queixo/], ["Kai pose sentado cruza perna-dir sobre perna-esq", /cruza perna-dir/], ["Kai pose acenando naturaliza bracos", /naturaliza/], ["Kai pose sentadoChao cruza pernas lotus", /lotus/], ["Kai pose empe maos nos bolsos", /maos/]]) { const r = comp("elenco\n  Kai\nquadro 1\n  " + txt + "\n"); ok(r.ok, "texto: " + txt + (r.ok ? "" : " — " + r.erros[0].erro)); void re; }
{ const r = comp("elenco\n  Kai\nquadro 1\n  Kai mao-dir no umbigoX\n"); ok(!r.ok && /não existe/.test(r.erros[0].erro), "lugar da mão errado: erro claro (" + (r.erros[0] || {}).erro + ")"); }

/* ---------- objetos ---------- */
const novos = Object.keys(OBJ_CASA), naoVeic = novos.filter(k => !OBJ_CASA[k].veiculo);
ok(naoVeic.length >= 80, "objetos novos do dia a dia e instrumentos: " + naoVeic.length);
{ const ruins = []; for (const k of novos) { try { const o = E.objetoPadrao(k, {}); const ps = E.COMPOSTOS[k].partes(o); if (!ps.length || ps.some(p => !p.c || p.c.some(v => !Number.isFinite(v)))) ruins.push(k); } catch (e) { ruins.push(k + ":" + e.message); } } ok(!ruins.length, "todas as peças dos objetos novos são válidas " + ruins.join(", ")); }
for (const [tipo, uso, conf] of [["sofa", "senta-em", q => q.wRot !== undefined], ["sofa", "deita-em", q => Math.abs(q.bodyPitch) > 60], ["camaCasal", "deita-em", q => Math.abs(q.bodyPitch) > 60], ["bancoPraca", "senta-em", q => q.hipFlexL > 60], ["piano", "toca", q => q.hipFlexL > 60], ["bateria", "toca", q => q.hipFlexL > 60], ["microfonePedestal", "toca", q => q.hipFlexL < 40], ["fogao", "usa", q => true]]) {
  const r = comp('elenco\n  Kai\nquadro 1\n  objeto ' + tipo + ' "O" em (0,0)\n  Kai ' + uso + " O\n"); const q = r.ok ? r.quadros[0].estado.list.find(x => x.name === "Kai").params : null; ok(r.ok && conf(q) && !r.avisos.some(a => /ficou a/.test(a)), tipo + ": " + uso + (r.ok ? (r.avisos.length ? " · " + r.avisos[0] : "") : " — " + r.erros[0].erro)); }
for (const t of ["saxofone", "ukulele", "pandeiro", "trombone", "clarinete"]) { const r = comp("elenco\n  Kai\nquadro 1\n  Kai segura " + t + "\n"); ok(r.ok, "segura " + t + " (toca)" + (r.ok ? "" : " — " + r.erros[0].erro)); }

/* ---------- veículos ---------- */
for (const [tipo, mod, ass] of [["bicicleta", "speed", "ciclista"], ["bicicleta", "", "em-pe"], ["moto", "", "piloto"], ["moto", "custom", "piloto"], ["moto", "scooter", "piloto"], ["caminhao", "tanque", "motorista"], ["van", "ambulancia", "motorista"], ["trator", "", "motorista"], ["carroCorrida", "kart", "piloto"], ["skate", "", "skatista"], ["patinete", "", "condutor"], ["jetski", "", "piloto"], ["quadriciclo", "", "piloto"]]) {
  const r = comp('elenco\n  Kai\nquadro 1\n  objeto ' + tipo + ' "V" em (0,0)' + (mod ? " modelo " + mod : "") + "\n  Kai embarca V " + ass + " efeitos\n"); const k = r.ok ? r.quadros[0].estado.list.find(x => x.name === "Kai") : null;
  ok(r.ok && k.embarcadoEm && (r.quadros[0].estado.efeitos || []).length >= 2, tipo + (mod ? " " + mod : "") + ": " + ass + " embarcado, com efeitos de velocidade" + (r.ok ? "" : " — " + r.erros[0].erro)); }
{ const r = comp('elenco\n  Kai\n  Mira\nquadro 1\n  objeto moto "M" em (0,0)\n  Kai embarca M piloto\n  Mira embarca M garupa\n'); const k = r.ok && r.quadros[0].estado.list.find(x => x.name === "Mira"); ok(r.ok && k.embarcadoEm && k.embarcadoEm.assento === "garupa", "moto: garupa atrás do piloto"); }

/* ---------- efeitos ---------- */
{ const sem = []; for (const n of w.todasPoses()) if (w.efeitosDaPose(n, 3).length < 2) sem.push(n); ok(!sem.length, "toda pose (" + w.todasPoses().length + ") tem efeitos sugeridos " + sem.slice(0, 4).join(", ")); }
{ const r = comp("elenco\n  Kai\nquadro 1\n  Kai pose correndo efeitos 3\n"); ok(r.ok && r.quadros[0].estado.efeitos.length === 4 && r.quadros[0].estado.efeitos.some(e => /velocidade|rastro/.test(e.tipo)), "efeitos 3 na corrida: " + (r.ok ? r.quadros[0].estado.efeitos.map(e => e.tipo).join(", ") : r.erros[0].erro)); }
{ const id = Object.keys(w.SITUACOES)[0], r = comp("elenco\n  Kai\nquadro 1\n  situacao " + id + " com Kai efeitos\n"); ok(r.ok && r.quadros[0].estado.efeitos.length > 0, "situacao … efeitos"); }

/* ---------- mil poses ---------- */
ok(POSES_MIL.length >= 1000, "poses novas desta rodada: " + POSES_MIL.length);
{ const cats = new Set(POSES_MIL.map(n => w.POSES_NARRATIVAS_INFO[n].tag.split("/")[0])); ok(["Anime", "Dança", "Música", "Veículo", "Descanso", "Cotidiano"].every(c => cats.has(c)), "famílias: " + [...cats].join(", ")); }
{ const K = ["spineFlex", "spineSide", "spineTwist", "pelvisTwist", "bodyPitch", "bodyRoll", "bodyLift", "headYaw", "headPitch", "headRoll"].concat(...["hipFlex", "hipAbd", "hipRot", "kneeFlex", "ankleFlex", "armAbd", "armFlex", "armRot", "elbow"].map(k => [k + "L", k + "R"]));
  const v = {}; for (const n of w.todasPoses()) { it.poseRapida(n, { molejo: 0 }); const p = P(); v[n] = K.map(k => +(p[k] || 0) * (k === "bodyLift" ? 10 : 1)); }
  const d = (a, b) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0), perto = []; for (const n of POSES_MIL) { let m = 1e9; for (const o in v) if (o !== n) m = Math.min(m, d(v[n], v[o])); if (m < 60) perto.push(n + " " + m.toFixed(0)); }
  ok(!perto.length, "as poses novas diferem ≥ 60° de todas as " + Object.keys(v).length + " poses " + perto.slice(0, 4).join(", ")); }

/* ---------- câmeras prontas, catálogo, MCP ---------- */
for (const id of ["veiculo.moto.lateral", "veiculo.bicicleta.drone", "musica.piano.palco", "musica.bateria.contra", "objeto.sofa-deitado.medio", "objeto.cozinha-fogao.geral"]) { const r = comp("elenco\n  Kai\nquadro 1\n  cena preset " + id + " com Kai\n"); ok(r.ok, "câmera pronta " + id + (r.ok ? "" : " — " + r.erros[0].erro)); }
{ const r = w.cxBuscar("", { tipo: "objeto" }, { limite: 1 }); ok(r.total >= 200, "catálogo: " + r.total + " objetos/veículos/instrumentos"); const b = w.cxItem("obj:moto"); ok(b && w.cxUsoObjeto(b) === "Kai embarca Moto", "catálogo: uso sugerido " + (b && w.cxUsoObjeto(b))); }
console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\nTUDO OK"); process.exit(falhas ? 1 : 0);
