/* GeoMannequin — manual de poses para IA e estado da pose: os sinais escritos no manual são medidos no motor,
   o manual cita todas as poses e controles, o estado descreve certo poses conhecidas e o código do estado recria a pose.
   Uso: node testes/manual-ia.mjs */
import { createWorld } from "../mcp/lib/core.mjs";
import { ossosDoCorpo, paraMundo } from "../src/engine/index.js";

let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const w = createWorld(), m = w.cena.ativo;
const J = () => { const p = w.sceneList(true)[0].p, M = paraMundo(p), j = ossosDoCorpo(p).juntas; return (n, s = 0) => M((j.find(x => x.nome === n && x.s === s) || j.find(x => x.nome === n)).P); };
const d = (pose, extra, jn, s) => { m.girar(0); m.poseRapida("empe"); if (extra) m.pose(extra); const a = J()(jn, s); m.pose(pose); const b = J()(jn, s); return [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; }; /* x = esquerda do manequim, y = cima, z = frente */
/* 1. sinais do manual medidos (manequim de frente para +z; a esquerda dele é +x) */
const S = [
  ["bracoEsqAbrir + abre o braço para o lado e para cima", d({ armAbdL: 90 }, null, "mão", 1), v => v[0] > 3 && v[1] > 3],
  ["bracoEsqFrente + leva o braço para a frente", d({ armFlexL: 90 }, null, "mão", 1), v => v[2] > 4],
  ["bracoEsqGirar + (cotovelo dobrado) leva a mão para fora", d({ armRotL: 60 }, { elbowL: 90 }, "mão", 1), v => v[0] > 1],
  ["colunaFrente + curva o tronco para a frente", d({ spineFlex: 40 }, null, "cabeça (atlas)"), v => v[2] > 1.5],
  ["colunaLado + inclina para a direita do manequim", d({ spineSide: 30 }, null, "cabeça (atlas)"), v => v[0] < -1],
  ["colunaTorcao + leva o ombro esquerdo para trás (peito vira para a esquerda)", d({ spineTwist: 40 }, null, "ombro", 1), v => v[2] < -0.5],
  ["cabecaGirar + vira o rosto para a esquerda do manequim", d({ headYaw: 60 }, null, "rosto"), v => v[0] > 0.5],
  ["cabecaInclinar + abaixa a cabeça", d({ headPitch: 40 }, null, "rosto"), v => v[1] < -0.4],
  ["cabecaLado + inclina para o ombro direito", d({ headRoll: 30 }, null, "rosto"), v => v[0] < -0.1],
  ["corpoInclinar + inclina o corpo para a frente (de bruços)", d({ bodyPitch: 60 }, null, "cabeça (atlas)"), v => v[2] > 3],
  ["corpoRolar + tomba para a direita do manequim", d({ bodyRoll: 60 }, null, "cabeça (atlas)"), v => v[0] < -3],
  ["coxaEsqFrente + leva a coxa para a frente", d({ hipFlexL: 80 }, null, "tornozelo", 1), v => v[2] > 4],
  ["coxaEsqAbrir + abre a coxa para fora", d({ hipAbdL: 40 }, null, "tornozelo", 1), v => v[0] > 2],
  ["ombroEsqSubir + eleva o ombro", d({ shElevL: 1 }, null, "ombro", 1), v => v[1] > 0.4],
  ["ombroEsqAvancar + leva o ombro para a frente", d({ shProtL: 1 }, null, "ombro", 1), v => v[2] > 0.4],
  ["girar(90) faz o manequim olhar para +x", (() => { m.poseRapida("empe"); m.girar(90); const g = J(), r = [g("rosto")[0] - g("cabeça (atlas)")[0], 0, g("rosto")[2] - g("cabeça (atlas)")[2]]; m.girar(0); return r; })(), v => v[0] > 0.8 && Math.abs(v[2]) < 0.3]
];
S.forEach(([t, v, f]) => ok(f(v), t + " (" + v.map(x => x.toFixed(2)).join(", ") + ")"));
/* palma: antebraço − = palma para baixo; + = para cima (com o braço à frente) */
const palma = (pron) => { m.poseRapida("empe"); m.pose({ armFlexL: 90, pronL: pron }); const g = J(), a = [g("mão", 1), g("punho", 1), g("dedo indicador", 1), g("dedo mínimo", 1)];
  const dd = [0, 1, 2].map(i => a[0][i] - a[1][i]), ac = [0, 1, 2].map(i => a[2][i] - a[3][i]); return dd[2] * ac[0] - dd[0] * ac[2]; }; /* componente vertical da normal da palma (mão esquerda) */
ok(palma(-80) < -0.1 && palma(80) > 0.1, "antebracoEsqGirar −80 = palma para baixo; +80 = palma para cima");
/* coxa girada + com o joelho dobrado (sentado) cruza as pernas */
{ m.poseRapida("empe"); m.pose({ hipFlexL: 84, hipFlexR: 84, hipAbdL: 30, hipAbdR: 30, hipRotL: 45, hipRotR: 45, kneeFlexL: 148, kneeFlexR: 142 }); const g = J(); ok(g("tornozelo", 1)[0] < g("tornozelo", -1)[0] + 0.6, "coxaGirar + com joelhos dobrados cruza as pernas (pernas cruzadas)"); }
/* 2. o manual cita todas as poses e todos os controles de pose (menos as falanges, descritas em grupo) */
const man = w.cena.manualIA();
const faltaPose = w.todasPoses().filter(k => !man.includes("`" + k + "`"));
ok(!faltaPose.length, "manual cita as " + w.todasPoses().length + " poses" + (faltaPose.length ? " (faltam: " + faltaPose.join(", ") + ")" : ""));
const inv = Object.fromEntries(Object.entries(w.ALIAS).map(([a, k]) => [k, a]));
const faltaCtl = [...w.POSEKEYS].filter(k => !/^f(Th|In|Me|An|Mi)(Mcp|Ip|Abd)[LR]$/.test(k) && !man.includes("`" + k + "`") && !man.includes("`" + (inv[k] || "§") + "`"));
ok(!faltaCtl.length, "manual cita todos os controles de pose" + (faltaCtl.length ? " (faltam: " + faltaCtl.slice(0, 12).join(", ") + ")" : ""));
ok(/Regras para a IA/.test(man) && /esquerda dele é \+x/.test(man) && /Apêndice/.test(man) && !/Apêndice/.test(w.cena.manualIA({ curto: true })), "manual: regras, eixos e apêndice opcional");
/* 3. o estado descreve certo poses conhecidas */
const E = n => { m.girar(0); m.poseRapida(n); return w.cena.estadoIA({ json: true }).manequins[0]; };
ok(E("saltando").geral.noAr, "saltando: no ar");
{ const e = E("deitadoCostas"); ok(/horizontal/.test(e.geral.texto) && /para cima/.test(e.geral.texto), "deitado de costas: horizontal, peito para cima"); }
{ const e = E("deBrucos"); ok(/para o chão/.test(e.geral.texto), "de bruços: peito para o chão"); }
{ const e = E("jab"); ok(e.bracoEsquerdo.posicao.frenteDoCorpo > 4 && /baixo/.test(e.bracoEsquerdo.palma.texto) && /punho fechado/.test(e.bracoEsquerdo.mao), "jab: mão esquerda à frente, palma para baixo, punho fechado"); }
{ const e = E("erguido"); ok(e.bracoEsquerdo.altura === "acima da cabeça", "braço erguido: mão acima da cabeça"); }
{ const e = E("ajoelhado"); ok(e.geral.apoiadoEm.includes("joelho esquerdo") && e.geral.apoiadoEm.includes("joelho direito"), "ajoelhado: os dois joelhos no chão"); }
{ const e = E("sentadoChao"); ok(e.geral.apoiadoEm.includes("pelve/glúteos") && /sentado/.test(e.geral.texto), "sentado no chão: glúteos no chão"); }
{ const e = E("chutando"); ok(/levantado/.test(e.pernaEsquerda.pe) && /no chão/.test(e.pernaDireita.pe), "chute: um pé levantado, o outro no chão"); }
{ m.poseRapida("empe"); m.pose({ headYaw: 60 }); const e = w.cena.estadoIA({ json: true }).manequins[0]; ok(/esquerda/.test(e.cabeca.olhando), "cabeça girada +60: olhando para a esquerda"); }
/* 4. o código do estado recria a pose; o pacote traz pedido, estado em JSON e manual */
{ m.poseRapida("chuteAlto"); m.pose({ headYaw: 20 }); const e = w.cena.estadoIA({ json: true }).manequins[0], w2 = createWorld(), m2 = w2.cena.ativo;
  m2.aplicarPose(e.codigo); const a = w.SCN.list[0].params, b = w2.SCN.list[0].params; const dif = [...w.POSEKEYS].filter(k => Math.abs((a[k] || 0) - (b[k] || 0)) > 0.6);
  ok(!dif.length, "código do estado recria a pose" + (dif.length ? " (diferem: " + dif.slice(0, 8).join(", ") + ")" : "")); }
{ const p = w.cena.pacoteIA("feche o punho esquerdo"); const js = p.slice(p.indexOf("```json") + 7, p.indexOf("```", p.indexOf("```json") + 7));
  let okJ = false; try { okJ = Array.isArray(JSON.parse(js).manequins); } catch (e) { }
  ok(/=== PEDIDO ===\nfeche o punho esquerdo/.test(p) && okJ && /=== MANUAL ===/.test(p), "pacote: pedido, estado em JSON válido e manual"); }
/* 5. duas pessoas: relação entre elas */
{ const w3 = createWorld(); w3.cena.ativo.renomear("Ana"); w3.cena.adicionar({ nome: "Leo", x: 8, giro: -90 }); const t = w3.cena.estadoIA(); ok(/Leo → Ana: 8 unidades, à frente de Leo/.test(t), "relação entre manequins (Leo olha para Ana)"); }
/* 6. rosto no manual: todos os controles com faixa e sinal, receitas = expressões prontas, exemplo de código aplica */
{ const w4 = createWorld(), man = w4.cena.manualIA({ curto: true }), r = man.slice(man.indexOf("## 8"), man.indexOf("## 9"));
  const falta = w4.chavesRosto().filter(k => !r.includes("(`" + k + "`)"));
  ok(!falta.length, "manual do rosto cita todos os controles" + (falta.length ? ": faltam " + falta.join(", ") : ""));
  const semSinal = r.split("\n").filter(l => /^- `\w+` \(`\w+`\): -1 a 1\./.test(l) && !/\*\*−\*\*/.test(l));
  ok(!semSinal.length, "controles de −1 a 1 dizem o que o − e o + fazem" + (semSinal.length ? ": " + semSinal[0] : ""));
  const m4 = w4.cena.ativo; let rec = 0, ruins = [];
  for (const l of r.split("\n")) { const mm = /^- `(\w+)` \([^)]*\): `([^`]+)`/.exec(l); if (!mm || !w4.EXPRESSOES[mm[1]]) continue; rec++;
    m4.aplicarRosto("rosto({" + mm[2] + "})"); const a = w4.cena.expressoes.ler(m4.rostoCodigo()).valores; m4.expressao(mm[1]); const b = w4.cena.expressoes.ler(m4.rostoCodigo()).valores;
    if (Object.keys({ ...a, ...b }).some(k => Math.abs((a[k] || 0) - (b[k] || 0)) > 0.006)) ruins.push(mm[1]); }
  ok(rec >= 26 && !ruins.length, "receitas do manual recriam as " + rec + " expressões" + (ruins.length ? " (diferem: " + ruins.join(", ") + ")" : ""));
  const ex = /```js\n(rosto\([\s\S]*?\);)\n```/.exec(r); let erro = ""; try { m4.aplicarRosto(ex[1], { formato: true }); } catch (e) { erro = e.message; }
  ok(ex && !erro, "o exemplo de código do rosto do manual funciona" + (erro ? ": " + erro : ""));
  const ins = [...r.matchAll(/m\.aplicarRosto\('([^']+)'\)/g)].map(x => x[1]).filter(t => !t.includes("…"));
  ok(ins.every(t => { try { m4.aplicarRosto(t); return true; } catch (e) { return false; } }), "exemplos curtos de aplicarRosto do manual funcionam"); }
/* 7. pose de descanso: igual à pose em pé, mantém biotipo/posição/rosto; pacote diz o modo */
{ const w5 = createWorld(), m5 = w5.cena.ativo; m5.corpo("atletico"); m5.posicao(3, 2); m5.poseRapida("chuteAlto"); m5.expressao("raiva"); const r0 = m5.rostoCodigo(); m5.descanso();
  const p = w5.SCN.list[0].params, w6 = createWorld(); w6.cena.ativo.corpo("atletico"); w6.cena.ativo.poseRapida("empe"); const q = w6.SCN.list[0].params;
  const dif = [...w5.POSEKEYS].filter(k => w5.parteDaChave(k) !== "rosto" && Math.abs((p[k] || 0) - (q[k] || 0)) > 1e-6);
  ok(!dif.length && p.wx === 3 && p.wz === 2 && m5.rostoCodigo() === r0, "m.descanso(): pose em pé, mantém posição e rosto" + (dif.length ? " (difere: " + dif.join(", ") + ")" : ""));
  m5.descanso({ rosto: true }); ok(!/sorriso|franzir/.test(m5.rostoCodigo()), "m.descanso({rosto:true}) zera a expressão");
  const pn = w5.cena.pacoteIA("hip hop", { modo: "nova" }), pa = w5.cena.pacoteIA("braço", { modo: "ajuste" });
  ok(/POSE NOVA/.test(pn) && /m\.descanso\(\)/.test(pn) && /AJUSTE/.test(pa) && /Onde pegar o estado atual/.test(pn), "pacote diz se é pose nova (descanso) ou ajuste, e onde pegar o estado"); }
/* 8. cabeça e pescoço: as receitas do manual funcionam e o estado descreve o pescoço */
{ const w7 = createWorld(), m7 = w7.cena.ativo, man = w7.cena.manualIA({ curto: true }), linha = man.split("\n").find(l => l.startsWith("- Receitas: olhar para o céu")) || "";
  const recs = [...linha.matchAll(/`([^`]+)`/g)].map(x => x[1]); let ruim = "";
  recs.forEach(r => { try { m7.pose(JSON.parse("{" + r.replace(/(\w+):/g, '"$1":') + "}")); } catch (e) { ruim = r + ": " + e.message; } });
  ok(recs.length >= 6 && !ruim, "receitas de cabeça e pescoço do manual funcionam" + (ruim ? " (" + ruim + ")" : ""));
  m7.poseRapida("empe"); m7.pose({ pescocoFrente: 20, pescocoGirar: -30 }); ok(/Pescoço: dobrado para a frente.*girado para a direita dele/.test(w7.cena.estadoIA()), "estado descreve o pescoço em palavras"); }
console.log(falhou ? "FALHOU." : "Tudo certo.");
process.exit(falhou ? 1 : 0);
