/* Poses narrativas e de grupo: mais de 1.000 novas, nenhuma repetida (juntas / composição), dentro dos limites do corpo,
   grupos que compilam e põem todos na cena, catálogo com filtros, grupo-pose no texto e no palco, MCP. */
import { createWorld } from "../mcp/lib/core.mjs";
import { Client } from "../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";
import { join, dirname } from "node:path"; import { fileURLToPath } from "node:url";
let falhas = 0; const ok = (c, m) => { console.log((c ? "  ok  " : "  FALHA ") + m); if (!c) falhas++; };
const w = createWorld(), it = w.cena.ativo, P = () => w.SCN.list[w.SCN.active].params;
const novas = w.listaPosesNarrativas().map(p => p.nome), grupos = w.listaGruposPoses(), todas = w.todasPoses();
ok(novas.length >= 650, "poses novas de 1 pessoa: " + novas.length);
ok(grupos.length >= 400, "poses de grupo: " + grupos.length + " " + JSON.stringify(grupos.reduce((a, g) => (a[g.pessoas] = (a[g.pessoas] || 0) + 1, a), {})));
ok(novas.length + grupos.length >= 1000, "total de novas: " + (novas.length + grupos.length));
ok(grupos.some(g => g.pessoas === 12) && grupos.some(g => g.pessoas === 5) && grupos.some(g => g.pessoas === 3), "tamanhos 3, 5 e 12 presentes");
/* distintas: soma das diferenças de 28 juntas >= 60° em relação a TODAS as outras poses (velhas e novas) */
const K = ["spineFlex", "spineSide", "spineTwist", "pelvisTwist", "bodyPitch", "bodyRoll", "bodyLift", "headYaw", "headPitch", "headRoll"].concat(...["hipFlex", "hipAbd", "hipRot", "kneeFlex", "ankleFlex", "armAbd", "armFlex", "armRot", "elbow"].map(k => [k + "L", k + "R"]));
const vec = {}, atravessa = [], semInfo = [];
for (const n of todas) { try { it.poseRapida(n); } catch (e) { continue; } const p = P(); vec[n] = K.map(k => +(p[k] || 0) * (k === "bodyLift" ? 10 : 1)); }
for (const n of novas) { it.poseRapida(n); const v = it.validarPose(), pr = Math.max(0, ...v.atravessa.map(a => a.profundidade)); if (pr > 1.25) atravessa.push(n + " " + pr.toFixed(1)); const i = w.POSES_NARRATIVAS_INFO[n]; if (!i.en || !i.apelidos.length || !i.tag) semInfo.push(n); }
const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };
const perto = []; for (const n of novas) { let m = 1e9, q = ""; for (const o of Object.keys(vec)) { if (o === n) continue; const d = dist(vec[n], vec[o]); if (d < m) { m = d; q = o; } } if (m < 60) perto.push(n + "~" + q + " " + m.toFixed(0)); }
ok(!perto.length, "nenhuma pose nova repetida (mínimo 60° de diferença) " + perto.slice(0, 5).join(", "));
ok(!atravessa.length, "poses novas sem o corpo atravessando " + atravessa.slice(0, 5).join(", "));
ok(!semInfo.length, "toda pose nova tem nome pt, descrição en e categoria " + semInfo.slice(0, 5).join(", "));
/* grupos: poses existem, composições únicas */
const set = new Set(todas), faltam = []; grupos.forEach(g => g.poses.forEach(p => { if (!set.has(p)) faltam.push(g.id + ":" + p); })); ok(!faltam.length, "todas as poses dos grupos existem " + faltam.slice(0, 4).join(", "));
const assin = new Map(), rep = []; for (const g of grupos) { const d = w.GRUPOS_POSES[g.id], s = d.papeis.map(p => p.pose + "@" + p.x.toFixed(1) + "," + p.z.toFixed(1)).sort().join("|") + "#" + (d.inter || []).map(x => x[2]).join(","); if (assin.has(s)) rep.push(g.id + "=" + assin.get(s)); assin.set(s, g.id); }
ok(!rep.length, "nenhuma pose de grupo repetida " + rep.slice(0, 4).join(", "));
/* compila uma amostra de cada tamanho e põe todos na cena */
for (const n of [2, 3, 4, 5, 6, 8, 12]) { const g = grupos.find(x => x.pessoas === n), w2 = createWorld(), r = w2.compilarName("elenco\n  Kai\nquadro 1 conjunto\n  grupo-pose " + g.id + " com Kai\n", { semCache: true, salvar: false });
  ok(r.ok && r.quadros[0].estado.list.filter(x => x.name && x.name !== "__vazio__").length === n, "grupo-pose " + g.id + " (" + n + "): " + (r.ok ? r.quadros[0].estado.list.filter(x => x.name !== "__vazio__").map(x => x.name).join(",") : r.erros.map(e => e.erro).join(";"))); }
{ const w2 = createWorld(), r = w2.compilarName("quadro 1\n  grupo-pose grupo.festaDanca4\nquadro 2\n  grupo-pose grupo.festaDanca4\n", { semCache: true, salvar: false }); const nomes = q => q.estado.list.filter(x => x.name !== "__vazio__").map(x => x.name).sort().join(",");
  ok(r.ok && nomes(r.quadros[0]) === nomes(r.quadros[1]), "o mesmo grupo em dois quadros usa os mesmos figurantes (" + (r.ok ? nomes(r.quadros[0]) : r.erros[0].erro) + ")"); }
{ const w2 = createWorld(), r = w2.compilarName("quadro 1 geral\n  grupo-pose grupo.festaDanca4\n  grupo-pose grupo.amigosRindo3 em (6,0)\n", { semCache: true, salvar: false }); ok(r.ok && r.quadros[0].estado.list.filter(x => x.name !== "__vazio__").length === 7, "dois grupos no mesmo quadro: 7 pessoas diferentes"); }
{ const w2 = createWorld(), r = w2.compilarName("quadro 1\n  grupo-pose grupo.naoExiste\n", { semCache: true, salvar: false }); ok(!r.ok && /não existe/.test(r.erros[0].erro), "grupo inexistente: erro claro (" + (r.erros[0] || {}).erro + ")"); }
/* palco */
{ const w2 = createWorld(), r = w2.aplicarLinhaNoPalco("grupo-pose dupla.casalDancaLenta"); ok(r.ok && w2.SCN.list.filter(x => x.name !== "__vazio__").length >= 2, "grupo-pose no palco (barra de comando)"); }
{ const w2 = createWorld(), r = w2.aplicarLinhaNoPalco("Kai pose sambaNoPe"); ok(r.ok, "pose nova pelo nome no palco"); const r2 = w2.aplicarLinhaNoPalco('Kai pose "samba no pé"'); ok(r2.ok, "pose nova pelo apelido em português"); }
/* catálogo */
const R = w.cxResumo(); ok(R.total > 2500 && R.porTipo.grupo >= 400, "catálogo: " + R.total + " itens " + JSON.stringify(R.porTipo));
const b = (q, f) => w.cxBuscar(q, f || {}, { limite: 5 });
ok(b("luta 2 pessoas").total > 10 && b("luta 2 pessoas").itens.every(i => i.pessoas === 2), "busca ‘luta 2 pessoas’ só traz duplas");
ok(b("namoro").itens.some(i => i.generos.includes("romance")), "‘namoro’ acha romance");
ok(b("cozinhar").total > 3, "‘cozinhar’ acha pela raiz (cozinhando)");
ok(b("", { tipo: "grupo", pessoas: 12 }).itens.every(i => i.pessoas >= 12), "filtro 12 pessoas");
ok(b("", { tipo: "pose", nivel: "deitado", novos: true }).total > 20, "filtro corpo deitado (novas)");
ok(b("festa -grupo").itens.every(i => !/grupo/.test(i.busca)), "exclusão com -");
ok(/^grupo-pose grupo\.festaDanca8 com Kai, "Ana Lu"$/.test(w.cxLinha(w.cxItem("grupo:grupo.festaDanca8"), ["Kai", "Ana Lu"])), "linha do item com nomes (aspas quando tem espaço)");
ok(w.cxMiniatura(w.cxItem("grupo:grupo.festaDanca8")).startsWith("<svg"), "miniatura de grupo");
/* prompt com grupo e toque */
{ const r = w.piGerar("prompt\n  formato 1:1\nelenco\n  Kai\n  Mira\nquadro 1 inteiro\n  grupo-pose dupla.casalDancaLenta com Kai, Mira\n"); ok(r.ok && /Group action:/.test(r.prompt.en) && /Physical contact: Kai and Mira/.test(r.prompt.en), "prompt conta a ação do grupo e o toque"); }
/* MCP */
{ const HERE = dirname(fileURLToPath(import.meta.url)), t = new StdioClientTransport({ command: process.execPath, args: [join(HERE, "..", "mcp", "server.mjs")], env: Object.assign({}, process.env, { GM_CELULAS: "0" }) }), c = new Client({ name: "t", version: "1" }); await c.connect(t);
  const ls = (await c.listTools()).tools, nomes = ls.map(x => x.name); ok(nomes.includes("catalogo_poses") && nomes.includes("grupo_pose"), "MCP: catalogo_poses e grupo_pose registradas");
  ok(!JSON.stringify(ls.filter(x => /catalogo_poses|grupo_pose/.test(x.name)).map(x => x.inputSchema)).includes("anyOf"), "MCP: esquemas sem anyOf (Gemini)");
  let rr = await c.callTool({ name: "catalogo_poses", arguments: { busca: "invasão", pessoas: 5, miniaturas: true } }); ok(!rr.isError && rr.content.some(x => x.type === "image") && /grupo-pose/.test(rr.content[0].text), "MCP catalogo_poses com miniaturas");
  rr = await c.callTool({ name: "grupo_pose", arguments: { id: "grupo.festaDanca5", nomes: ["Kai", "Mira"] } }); ok(!rr.isError && rr.content.some(x => x.type === "image"), "MCP grupo_pose na cena");
  rr = await c.callTool({ name: "grupo_pose", arguments: { id: "grupo.festaDanca7" } }); ok(rr.isError && /Parecidas/.test(rr.content[0].text), "MCP grupo_pose inexistente sugere parecidas");
  await c.close(); }
console.log(falhas ? "\n" + falhas + " falha(s)" : "\ntudo certo"); process.exit(falhas ? 1 : 0);
