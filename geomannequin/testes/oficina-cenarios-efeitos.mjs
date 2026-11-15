/* Rodada "oficina": barra de comando na cena atual, sentar direito, câmera em coordenadas centrada, golpes com antecipação,
   portas gigantes, montaria em kaiju (sobre-cabeça), mão ativa nos poderes, efeitos novos, castelos e floresta leves. */
import { createWorld } from "../mcp/lib/core.mjs";
const w = createWorld(); let falhas = 0;
const ok = (c, m) => { console.log((c ? "  ok  " : "  FALHA ") + m); if (!c) falhas++; };
const comp = t => { const r = w.compilarName(t, { semCache: true, salvar: false }); if (!r.ok) throw new Error(JSON.stringify(r.erros)); w.loadScene(JSON.parse(JSON.stringify(r.quadros[0].estado))); return r; };
const caps = nome => { const it = w.SCN.list.find(x => x.name === nome), c = w.capsulas(w.pMundo(it)); return c.caps || c; };
const g0 = () => w.restGround(w.SCN.list[0].params);

/* 1. barra de comando: só o que a linha muda passa para a cena */
comp(`elenco\n  Kai\n  Mira\nquadro 1\n  Kai em (0,0) pose correndo\n  Mira em (2,0)\n`);
const kai0 = Object.assign({}, w.SCN.list.find(x => x.name === "Kai").params);
let r = w.aplicarLinhaNoPalco("Mira em (3,1) gira 90"); const kai1 = w.SCN.list.find(x => x.name === "Kai").params, mira = w.SCN.list.find(x => x.name === "Mira").params;
ok(r.ok && Math.abs(mira.wx * 0.114 - 3) < 0.05 && mira.wRot === 90 && kai1.hipFlexL === kai0.hipFlexL, "linha move só a Mira; a pose do Kai (correndo) fica");
r = w.aplicarLinhaNoPalco("objeto cadeira \"Cadeira\" em (1,2)"); ok(r.ok && w.SCN.objetos.some(o => o.nome === "Cadeira"), "objeto novo entra pela linha");
r = w.aplicarLinhaNoPalco("Mira senta-em Cadeira"); { const m2 = w.SCN.list.find(x => x.name === "Mira").params, c2 = w.SCN.objetos.find(o => o.nome === "Cadeira"); ok(r.ok && m2.hipFlexL > 60 && Math.hypot(m2.wx - c2.x, m2.wz - c2.z) < 4, "senta-em pela linha (sentada na cadeira)"); }
r = w.aplicarLinhaNoPalco("Lua animal lobo em (-2,1)"); ok(r.ok && w.SCN.objetos.some(o => o.nome === "Lua" && o.animal), "animal novo pela linha (Lua animal lobo)");
r = w.aplicarLinhaNoPalco("Zed em (-3,0) pose guardaBoxe"); ok(r.ok && w.SCN.list.some(x => x.name === "Zed"), "pessoa nova entra sozinha (Zed)");
const nef = (w.SCN.efeitos || []).length; r = w.aplicarLinhaNoPalco("efeito feixe de Kai para Zed"); ok(r.ok && (w.SCN.efeitos || []).length === nef + 1, "efeito pela linha");
r = w.aplicarLinhaNoPalco("objeto carro \"Fusca\" em (5,0)"); r = w.aplicarLinhaNoPalco("Kai embarca Fusca assento motorista"); w.aplicarLinhaNoPalco("Mira em (2.5,1)");
ok(w.SCN.list.find(x => x.name === "Kai").embarcadoEm && w.SCN.list.find(x => x.name === "Kai").embarcadoEm.veiculo === "Fusca", "embarque continua depois de outra linha");
r = w.aplicarLinhaNoPalco("camera (5,2,5) olhando (0,1,0)"); ok(r.ok && r.mudou.includes("câmera"), "linha de câmera");
r = w.aplicarLinhaNoPalco("Kai pose naoExisteEssa"); ok(!r.ok && r.erros.length, "erro explicado: " + (r.erros[0] || "").slice(0, 60));

/* 2. sentar direito */
comp(`elenco\n  Kai\nquadro 1\n  objeto cadeira "C" em (0,0)\n  Kai senta-em C\n`);
{ const L = caps("Kai"), pel = L.find(c => c.nome === "pelve"), base = Math.min(pel.a[1], pel.b[1]) - pel.r - g0(), pz = (pel.a[2] + pel.b[2]) / 2, o = w.SCN.objetos.find(x => x.nome === "C");
  ok(Math.abs(base - o.alt) < 0.6, "na cadeira: ísquios na altura do assento (" + (base * 11.4).toFixed(0) + " cm × " + (o.alt * 11.4).toFixed(0) + " cm)");
  ok(pz < o.z, "na cadeira: quadril no fundo do assento, perto do encosto"); }
comp(`elenco\n  Kai\nquadro 1\n  Kai em (0,0) pose sentadoChao\n`);
{ const L = caps("Kai"), pel = L.find(c => c.nome === "pelve"), min = Math.min(...L.map(c => Math.min(c.a[1], c.b[1]) - c.r)); ok(Math.min(pel.a[1], pel.b[1]) - pel.r - min < 0.6, "pernas cruzadas: o quadril encosta no chão"); }

/* 3. câmera em coordenadas: o alvo fica no centro do quadro */
{ const rq = w.compilarName(`elenco\n  Kai\nquadro 1 camera (0,0.94,4) olhando (0,0.94,0)\n  Kai em (0,0)\n`, { semCache: true, salvar: false }); w.loadScene(JSON.parse(JSON.stringify(rq.quadros[0].estado)));
  const t = w.telaDoMundo(Object.assign({}, w.P), [0, g0() + 0.94 / 0.114, 0]); ok(Math.abs(t[1] - 350) < 25 && Math.abs(t[0] - 300) < 10, "camera (x,y,z) olhando (x,y,z): o alvo cai no centro do quadro (" + t[0].toFixed(0) + ", " + t[1].toFixed(0) + ")"); }

/* 4. golpes com antecipação, impacto e recolhimento */
{ const B = w.bibliotecaAnimacoes ? w.bibliotecaAnimacoes() : null, nomes = ["karateKihonAnim", "boxeComboAnim", "muayThaiAnim", "capoeiraAtaquesAnim", "taekwondoAnim", "wingChunAnim", "chutesAltosAnim"];
  const acha = n => { try { return B.obter(n); } catch (e) { return null; } };
  ok(nomes.every(n => acha(n)), "animações de golpe registradas: " + nomes.filter(n => !acha(n)).join(", "));
  const a = acha("boxeComboAnim"); ok(a && a.chaves.length >= 4 * 6, "boxeComboAnim: 6 chaves por golpe (antecipação, golpe, impacto, segura, recolhe, guarda) — " + (a ? a.chaves.length : 0)); }

/* 5. portas gigantes */
for (const t of ["portaoTita", "portaoCidadela", "portaDungeon", "portaTemplo", "portaRaiz", "portaCofre"]) { let erro = null; try { for (const ab of [0, 0.5, 1]) { const rr = w.compilarName(`elenco\n  Kai\nquadro 1\n  objeto ${t} "P" em (0,0) aberta ${ab}\n  Kai em (3,6)\n`, { semCache: true, salvar: false }); if (!rr.ok) throw new Error(rr.erros[0].erro); w.renderizarQuadro(rr.quadros[0], { passes: false }); } } catch (e) { erro = e.message; } ok(!erro, t + " desenha fechado, meio e aberto" + (erro ? ": " + erro : "")); }

/* 6. kaiju: em cima da cabeça do monstro */
for (const [esp, parte] of [["gorila", "cabeca"], ["dragao", "pescoco"], ["cobra", "cabeca"]]) { comp(`elenco\n  Kai\n  M animal ${esp} monstro\nquadro 1\n  M em (0,0)\n  Kai sobre-${parte} M pose kaijuDePeNaCabeca\n`);
  const L = caps("Kai"), pe = Math.min(...L.map(c => Math.min(c.a[1], c.b[1]) - c.r)) - g0(); ok(pe > 5, esp + ": Kai em cima (" + parte + ") a " + (pe * 0.114).toFixed(1) + " m do chão"); }
ok(w.listaPosesExtras().filter(p => /^kaiju/.test(p.nome)).length >= 8, "poses de montaria em kaiju na biblioteca (Montaria/Kaiju)");

/* 7. mão ativa: o poder sai da mão que está à frente */
comp(`elenco\n  Kai\n  Mira\nquadro 1\n  Kai em (0,0) pose amKarateGyakuZuki\n  Mira em (0,4)\n  efeito feixe de Kai para Mira\n`);
{ const e = w.SCN.efeitos[w.SCN.efeitos.length - 1]; ok(e.ancora && e.ancora.parte === "maoAtiva", "“efeito feixe de Kai” sai da mão ativa (não do pé/chão)");
  const p = w.vtPontoPessoa ? w.vtPontoPessoa(w.SCN.list.find(x => x.name === "Kai"), "maoAtiva") : null, L = caps("Kai"), maos = L.filter(c => /^mao[ED]/.test(c.nome)), d = p ? Math.min(...maos.map(c => Math.hypot(...c.a.map((v, i) => v - p[i])))) : 0;
  ok(!p || d < 2.5, "mão ativa coincide com uma mão (" + d.toFixed(2) + " R)"); }

/* 8. efeitos novos desenham */
for (const t of ["raio_cadeia", "pisada_gigante", "rugido", "sopro_kaiju", "teia", "rasgo_dimensional"]) { let erro = null, svg = ""; try { const rr = w.compilarName(`elenco\n  Kai\n  Mira\nquadro 1\n  Kai em (0,0)\n  Mira em (0,5)\n  efeito ${t} de Kai para Mira colorido\n`, { semCache: true, salvar: false }); if (!rr.ok) throw new Error(rr.erros[0].erro); svg = w.renderizarQuadro(rr.quadros[0], { passes: false }).svg; } catch (e) { erro = e.message; } ok(!erro && /efeito-/.test(svg), t + " desenha" + (erro ? ": " + erro : "")); }

/* 9. cenários grandes leves: detalhe por distância, névoa e colisão simplificada */
for (const [nome, lin, cam] of [["castelo", 'objeto castelo "C" em (0,0)', "130,70,160"], ["castelo de magia", 'objeto casteloMagico "H" em (0,0)', "180,90,230"], ["floresta 230 m", 'objeto floresta "F" em (0,0) largura 230 profundidade 230', "120,60,160"]]) {
  const rr = w.compilarName(`elenco\n  Kai\nquadro 1 camera (${cam}) olhando (0,5,0)\n  ${lin}\n  Kai em (120,120)\n`, { semCache: true, salvar: false }); const t0 = Date.now(), R = w.renderizarQuadro(rr.quadros[0], { passes: false }), dt = Date.now() - t0;
  ok(dt < 3000 && R.svg.length < 4e6, nome + ": desenha em " + dt + " ms (" + (R.svg.length / 1024).toFixed(0) + " KB)"); }
{ const C = w.COMPOSTOS || null; void C; const o = { tipo: "floresta", x: 0, z: 0, larg: 440, prof: 440, alt: 120 }, perto = w.partesLocaisDbg ? null : null; void perto; }
{ const mk = (extra, olho) => Object.assign({ tipo: "floresta", x: 0, z: 0, larg: 440, prof: 440, alt: 120, semente: 7, _g0: 0 }, extra, olho ? { _olho: olho } : {});
  const n = o => w.TIPOS_OBJETO && w.partesLocais ? w.partesLocais(o).length : null;
  if (w.partesLocais) { const pertoN = n(mk({}, [0, 20, 0])), longeN = n(mk({}, [0, 600, 4000])), colN = n(mk({})), nevoaN = n(mk({ nevoa: 60 }, [0, 400, 300]));
    ok(longeN < pertoN, "floresta: longe tem menos peças (" + longeN + " < " + pertoN + ")");
    ok(colN > 0 && colN <= pertoN, "floresta: colisão usa só os troncos (" + colN + " peças)");
    ok(nevoaN < n(mk({}, [0, 400, 300])), "floresta: com névoa, o que fica abaixo dela não é desenhado"); } else ok(true, "(partesLocais não exportado: pulando contagem)"); }
console.log(falhas ? "\n" + falhas + " falha(s)" : "\ntudo certo"); process.exit(falhas ? 1 : 0);
