/* GeoMannequin — objetos: caixas e cilindros, cor exclusiva, um em cima do outro, colisões, comandos e salvar/carregar.
   Uso: node testes/objetos.mjs  (precisa de mcp/node_modules) */
import { createWorld } from "../mcp/lib/core.mjs";

let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const dHue = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/* todos os tipos: criam, desenham e têm partes */
{ const w = createWorld(); let x = -30;
  const tipos = Object.keys(w.TIPOS_OBJETO);
  tipos.forEach(t => { const o = w.cena.objeto(t, { x, z: -20 }); x += 6; });
  ok(tipos.length >= 13 && w.SCN.objetos.length === tipos.length, "13 tipos de objeto (" + tipos.join(", ") + ")");
  ok(["cilindro", "copo", "coluna", "barril", "mesaRedonda"].every(t => w.TIPOS_OBJETO[t].forma === "cilindro"), "cilindros: cilindro, copo, coluna, barril e mesa redonda");
  const r = w.renderScene(w.sceneList(true), w.L, false, 0);
  ok((r.svg.match(/id="objeto-/g) || []).length === tipos.length, "cada objeto vira uma camada no desenho");
  /* cores exclusivas: matizes longe uns dos outros e dos manequins */
  w.cena.adicionar(); w.cena.adicionar();
  /* com dezenas de itens o círculo de matizes acaba: a exclusividade vale para os ~22 primeiros (depois os tons se repetem; multidões e plantas usam cor de grupo) */
  const hs = w.SCN.objetos.slice(0, 22).map(o => o.hue);
  let menor = 360; for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) menor = Math.min(menor, dHue(hs[i], hs[j]));
  ok(new Set(hs).size === hs.length && menor >= 10, "cor exclusiva: " + hs.length + " itens, menor distância de matiz " + menor + "°");
  const cores = r.svg.match(/fill:#[0-9a-f]{6}/gi) || [];
  const fl = w.sceneList(true).objetos.map(o => o._cor.fill); ok(new Set(fl.slice(0, 22)).size === 22 && fl.every(Boolean), "o desenho usa a cor de cada objeto"); }
/* cor manual repetida é recusada (de outro objeto ou de um manequim) */
{ const w = createWorld(); const a = w.cena.objeto("caixa", { x: 6 }), b = w.cena.objeto("cubo", { x: -6 });
  a.cor("#3366cc"); let e1 = null; try { b.cor("#3467cb"); } catch (e) { e1 = e.message; }
  const m = w.cena.adicionar({ x: 15 }); m.cor("#cc6633"); let e2 = null; try { b.cor("#cc6633"); } catch (e) { e2 = e.message; }
  let e3 = null; try { m.cor("#3366cc"); } catch (e) { e3 = e.message; }
  ok(/usada/.test(e1 || "") && /usada/.test(e2 || "") && /usada/.test(e3 || ""), "cor repetida recusada: objeto×objeto, objeto×manequim e manequim×objeto"); }
/* um em cima do outro: a base segue o topo; mover o de baixo leva o de cima; remover o de baixo derruba */
{ const w = createWorld(); const mesa = w.cena.objeto("mesa", { x: 10 }), caixa = w.cena.objeto("caixa", { sobre: "mesa", larg: 2, prof: 2, alt: 2 }), copo = w.cena.objeto("copo", { sobre: caixa });
  ok(caixa.info().base === 6.5 && copo.info().base === 8.5, "pilha: caixa na mesa (6,5) e copo na caixa (8,5)");
  ok(w.cena.colisoes().length === 0, "sem falsas colisões entre o que está apoiado");
  mesa.posicao(14, 3); ok(caixa.info().x === 14 && copo.info().z === 3, "mover a mesa leva a caixa e o copo");
  mesa.medidas({ altura: 8 }); ok(copo.info().base === 10, "mudar a altura da mesa sobe o que está em cima");
  mesa.remover(); ok(caixa.info().base === 0 && copo.info().base === 2, "sem a mesa, a pilha desce para o chão"); }
/* colisões: objeto × objeto (caixa, cilindro) e manequim × cilindro */
{ const w = createWorld(); w.cena.objeto("cubo", { x: 20, z: 0 }); w.cena.objeto("barril", { x: 22.5, z: 0 });
  let cs = w.cena.colisoes(); ok(cs.length === 1 && /cubo/.test(cs[0].descricao) && /barril/.test(cs[0].descricao), "cubo × barril: " + (cs[0] || {}).descricao);
  w.cena.obterObjeto("barril").posicao(26, 0); ok(w.cena.colisoes().length === 0, "afastados: sem colisão");
  const col = w.cena.objeto("coluna", { x: 0, z: 0.5 }); ok(w.cena.colisoes().some(c => /coluna/.test(c.descricao) && /Manequim 1/.test(c.descricao)), "manequim × coluna (cilindro)");
  col.posicao(0, 6); ok(!w.cena.colisoes().some(c => /coluna/.test(c.descricao)), "coluna longe: livre");
  /* mesa e cadeira encaixada embaixo: só o encosto bate no tampo */
  w.cena.objeto("mesa", { x: -20, z: 0 }); w.cena.objeto("cadeira", { x: -20, z: 2.5 });
  ok(w.cena.colisoes().some(c => /mesa/.test(c.descricao) && /cadeira/.test(c.descricao)), "encosto da cadeira entra no tampo da mesa");
  const r = w.cena.resolverColisoes(); ok(w.cena.colisoes().length === 0, "corrigir: " + r.join(" · ")); }
/* modo bloquear: arrastar um objeto para dentro de outro para na borda */
{ const w = createWorld(); w.cena.colisao("bloquear"); w.cena.objeto("cubo", { x: 20 }); const b = w.cena.objeto("cubo", { x: 30 });
  w.moverObjeto(w.SCN.objetos[1].id, 21, 0, false); ok(w.cena.colisoes().length === 0 && Math.abs(b.info().x - 20) >= 3.9, "bloquear: o cubo arrastado para encostado (x = " + b.info().x + ")"); }
/* soltar sobre um tampo maior: apoia; tirar de cima: desce */
{ const w = createWorld(); w.cena.objeto("mesa", { x: 10 }); const c = w.cena.objeto("copo", { x: -10 });
  w.moverObjeto(w.SCN.objetos[1].id, 10.5, 1); ok(c.info().sobre === "mesa" && c.info().base === 6.5, "arrastado para cima da mesa, o copo fica sobre ela");
  w.moverObjeto(w.SCN.objetos[1].id, -10, 0); ok(c.info().sobre === null && c.info().base === 0, "arrastado para fora, volta ao chão");
  const m2 = w.cena.objeto("mesa", { x: 30 }); w.moverObjeto(w.SCN.objetos[2].id, 10, 0); ok(m2.info().sobre === null, "mesa do mesmo tamanho não sobe na outra"); }
/* salvar e carregar: forma, raio, cor, apoio */
{ const w = createWorld(); w.cena.objeto("mesa", { x: 10 }); const c = w.cena.objeto("cilindro", { sobre: "mesa", raio: 1.2, altura: 3 }); c.cor("#aa3355");
  const st = JSON.parse(JSON.stringify(w.sceneState())), w2 = createWorld(); w2.loadScene(st);
  const i = w2.cena.obterObjeto("cilindro").info();
  ok(i.raio === 1.2 && i.altura === 3 && i.sobre === "mesa" && i.base === 6.5 && i.cor === "#aa3355", "salvar/carregar mantém raio, altura, cor e apoio");
  ok(w2.SCN.objetos[0].hue === w.SCN.objetos[0].hue, "a cor automática também volta igual"); }
/* comandos e frase */
{ const w = createWorld();
  const f = w.cena.descrever("uma mesa azul à direita do manequim 1, copo sobre a mesa, um barril vermelho atrás do manequim 1");
  const b = w.cena.blocking();
  ok(b.objetos.length === 3 && b.objetos.find(o => o.tipo === "copo").sobre === "mesa", "descrever: mesa, copo sobre a mesa e barril (" + f.join(" · ") + ")");
  ok(w.cena.colisoes().length === 0, "descrever: nada atravessa nada");
  const d = w.cena.obterObjeto("mesa").duplicar(); ok(w.SCN.objetos.length === 4 && d.info().cor !== w.cena.obterObjeto("mesa").info().cor, "duplicar: cópia com outra cor");
  ok(w.cena.blocking.estado().aviso !== undefined, "cena.blocking.estado() sem página avisa que o painel é do app");
  w.cena.selecionar("barril"); ok(w.leituraBlocking().objetos.find(o => o.tipo === "barril").sel, "cena.selecionar(objeto) marca a seleção do blocking");
  w.cena.selecionar(0); ok(w.leituraBlocking().manequins[0].sel && !w.leituraBlocking().objetos.some(o => o.sel), "cena.selecionar(manequim) volta para o manequim");
  const s1 = w.svgPlanta(w.leituraBlocking(), w.encaixar([[-20, -20], [20, 20]], 520, 420)), s2 = w.svgPerfil(w.leituraBlocking(), w.encaixar([[-20, 0], [20, 20]], 520, 300), "camera");
  ok((s1.match(/data-k="o:/g) || []).length === 4 && /<circle[^>]*class="blk-obj"/.test(s1), "planta: 4 objetos arrastáveis, cilindro como círculo");
  ok((s2.match(/data-k="o:/g) || []).length === 4, "lateral: 4 objetos arrastáveis"); }

console.log(falhou ? "\nFALHOU." : "\nTudo certo.");
process.exit(falhou ? 1 : 0);
