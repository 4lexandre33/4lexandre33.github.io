/* Poses e animações por TEXTO: juntas, atalhos, ciclo de uma pose, derivar/picotar/juntar/camada, pular, nadar, água, autocompletar */
import { createWorld } from "../mcp/lib/core.mjs";
let falhas = 0; const ok = (c, m) => { if (c) console.log("  ok  " + m); else { falhas++; console.log("  FALHOU  " + m); } };
const perto = (a, b, e = 1e-3) => Math.abs(a - b) <= e;

console.log("1. juntas e atalhos");
{ const w = createWorld(), Q = Object.assign({}, w.pdParams({}));
  ok(w.pdAplicarJunta(Q, "ombro", "direito", "frente 40, abre 10", 1).length === 0 && Q.armFlexR === 40 && Q.armAbdR === 10, "ombro.direito(frente 40, abre 10)");
  w.pdAplicarJunta(Q, "ombro", "direito", "frente +15", 1); ok(Q.armFlexR === 55, "+15 soma ao que já estava (" + Q.armFlexR + ")");
  w.pdAplicarJunta(Q, "joelho", null, "dobra 30", 1); ok(Q.kneeFlexL === 30 && Q.kneeFlexR === 30, "sem lado = os dois lados");
  const av = w.pdAplicarJunta(Q, "cotovelo", "esquerdo", "dobra 300", 1); ok(av.length === 1 && Q.elbowL === 150, "passou do limite: fica no limite e avisa");
  w.pdAplicarJunta(Q, "mao", "direito", "fecha 80%", 1); ok(perto(Q.handCurlR, 0.8), "mão em %");
  w.pdAplicarJunta(Q, "corpo", null, "sobe 30cm", 1); ok(perto(Q.bodyLift, 0.3 / 0.114, 1e-6), "corpo(sobe 30cm) em centímetros");
  let erro = null; try { w.pdAplicarJunta(Q, "ombro", "direito", "frnte 10", 7); } catch (e) { erro = e; } ok(erro && erro.linha === 7 && /Quis dizer “frente”/.test(erro.message), "movimento errado: sugere o certo e diz a linha");
  const r = w.compilarName('pose "a" de empe\n  ajoelha direito\npose "b" de empe\n  ajoelha esquerdo\npose "c" de passo\n  espelha tudo\n', { salvar: false });
  const a = r.defs[0].valores, b = r.defs[1].valores, c = r.defs[2].valores, p = w.anPoseValores("passo", w.pdParams({}));
  ok(r.ok && a.hipFlexR < a.hipFlexL && b.hipFlexL < b.hipFlexR, "ajoelha direito / esquerdo: o joelho do lado dito vai ao chão");
  ok(perto(c.hipFlexL, p.hipFlexR) && perto(c.hipFlexR, p.hipFlexL), "espelha tudo troca os lados");
  const r2 = w.compilarName('pose "x" de empe\n  agacha 50%\n  peso esquerdo\n  inclina frente 20\n  olha baixo 30\n  copia bracos de guardaLuta\n', { salvar: false }), x = r2.defs[0].valores, g = w.anPoseValores("guardaLuta", w.pdParams({}));
  ok(r2.ok && x.kneeFlexL > 5 && x.headPitch === 30 && perto(x.armFlexR, g.armFlexR), "agacha, peso, inclina, olha e copia bracos numa pose");
  const r3 = w.compilarName('pose "x" de pasos\n', { salvar: false }); ok(!r3.ok && /Quis dizer “passo”/.test(r3.erros[0].erro), "pose que não existe sugere a parecida"); }

console.log("2. salvar e usar no quadro");
{ const w = createWorld(), txt = 'pose "aceno-alto" de empe salvar\n  ombro.direito(abre 160)\nelenco\n  Kai relevante\nquadro\n  Kai em (0,0) pose aceno-alto ombro.esquerdo(frente 30)\n';
  const r0 = w.compilarName(txt, { salvar: false }); ok(r0.ok && !w.posesSalvas().length, "editando (salvar: false) não grava nada");
  const r = w.compilarName(txt, { salvar: true, semCache: true }), s = w.posesSalvas().find(p => p.nome === "aceno-alto");
  ok(r.ok && s && /<svg/.test(s.miniatura), "“salvar” manda para Minhas poses com miniatura");
  const k = r.quadros[0].estado.list.find(m => m.name === "Kai"); ok(k && k.params.armAbdR === 160 && k.params.armFlexL === 30, "o quadro usa a pose e a junta escrita na linha");
  const c = w.pdCompletar("quadro\n  Kai pose.acen", {}); ok(c && c.itens.some(i => i.r === "aceno-alto"), "a pose salva aparece no ponto (pose.)"); }

console.log("3. ciclo a partir de UMA pose");
{ const w = createWorld(), r = w.compilarName('pose "pl" de empe\n  ombro.direito(frente 35)\n  ombro.esquerdo(tras 30)\n  quadril.direito(frente 35)\n  quadril.esquerdo(tras 15)\n  joelho.esquerdo(dobra 20)\nciclo "andar-pl" de pl duracao 1s\n', { salvar: false }), a = r.animacoes[0];
  const A = a.chaves[0].valores, M = a.chaves.find(c => perto(c.t, 0.5)).valores, F = a.chaves[a.chaves.length - 1].valores;
  ok(r.ok && a.loop && a.chaves.length === 5, "5 chaves e loop");
  ok(Object.keys(A).every(k => perto(A[k], F[k])), "o fim é igual ao começo (o loop fecha sem salto)");
  ok(perto(M.hipFlexL, A.hipFlexR) && perto(M.armFlexL, A.armFlexR), "no meio: a mesma pose espelhada");
  const P = a.chaves[1].valores; ok(P.kneeFlexL > A.kneeFlexL && P.kneeFlexL >= 40, "passagem: a perna de trás passa dobrada");
  ok(a.chaves[0].apoio === "R" && a.chaves[2].apoio === "L" && a.chaves[4].mover.frente > 0.2, "apoio troca de pé e o corpo anda (calibrado pelo pé) (" + a.chaves[4].mover.frente.toFixed(2) + " m por ciclo)"); }

console.log("4. derivar, picotar, juntar, camada");
{ const w = createWorld(), g = w.bibliotecaAnimacoes().obter("girar360E");
  for (const ang of [15, 30, 45, 60, 90, 180]) { const a = w.pdAteAngulo(g, ang), m = a.chaves[a.chaves.length - 1].mover; ok(perto(m.giro, ang, 1e-6) && a.chaves[a.chaves.length - 1].apoio === "ambos", "ate " + ang + ": termina em " + m.giro + "° com os dois pés no chão"); }
  let e = null; try { w.pdAteAngulo(w.pdAteAngulo(g, 90), 180); } catch (x) { e = x; } ok(e && /só gira 90°/.test(e.message), "pedir mais do que a animação gira avisa");
  const r = w.compilarName('animacao "aj" de girar360E\n  troca pernas por pose ajoelhado\nanimacao "aj-fixo" de girar360E\n  troca pernas por pose ajoelhado fixo\n', { salvar: false }), aj = r.animacoes[0], fx = r.animacoes[1], K = w.anPoseValores("ajoelhado", w.pdParams({}));
  ok(r.ok && !aj.travarPes && aj.chaves.every(c => !c.apoio) && perto(aj.chaves[aj.chaves.length - 1].mover.giro, 360, 1e-6), "troca pernas: gira 360° no lugar, sem pés presos");
  ok(fx.chaves.every(c => perto(c.valores.kneeFlexL, K.kneeFlexL) && perto(c.valores.kneeFlexR, K.kneeFlexR)), "troca … fixo: as pernas ficam na pose ajoelhado a animação toda");
  ok(aj.chaves.some(c => Math.abs(c.valores.kneeFlexL - K.kneeFlexL) > 5), "troca (sem fixo): o movimento dos passos continua por cima da pose");
  const inv = w.pdReverter(w.pdReverter(g)), t = 1.3, s1 = w.amostrar(g, t, {}), s2 = w.amostrar(inv, t, {});
  ok(Object.keys(s1.valores).every(k => perto(s1.valores[k], s2.valores[k] ?? 0, 0.6)) && perto(s1.mover.giro, s2.mover.giro, 0.6), "reverter duas vezes volta ao original");
  const esp = w.pdEspelharAnim(g); ok(perto(esp.chaves[esp.chaves.length - 1].mover.giro, -360, 1e-6), "espelhar o giro: vai para o outro lado");
  const g90 = w.pdAteAngulo(g, 90), tres = w.pdRepetir(g90, 3), fim = tres.chaves[tres.chaves.length - 1].mover;
  ok(perto(fim.giro, 270, 1e-6) && perto(tres.duracao, g90.duracao * 3, 1e-6), "repete 3: continua de onde parou (270°)");
  const r2 = w.compilarName('animacao "combo" junta acenarTchau, g90, puloFrente mistura 0.2s\nanimacao "g90" de girar360E\n  ate 90\n', { salvar: false }), cb = r2.animacoes.find(a => a.nome === "combo");
  ok(r2.ok && cb && perto(cb.chaves[cb.chaves.length - 1].mover.giro, 90, 1e-6), "junta (usando uma animação escrita mais abaixo): termina virado 90°");
  const pf = cb.chaves[cb.chaves.length - 1].mover; ok(Math.hypot(pf.frente, pf.lado) > 0.8, "o pulo depois do giro sai na direção nova (" + pf.frente.toFixed(2) + ", " + pf.lado.toFixed(2) + ")");
  const r3 = w.compilarName('animacao "aa" camada andarCiclo + acenarTchau bracos\n', { salvar: false }), aa = r3.animacoes[0], ac = w.bibliotecaAnimacoes().obter("acenarTchau"), an = w.bibliotecaAnimacoes().obter("andarCiclo");
  const sA = w.amostrar(aa, 0.6, w.pdBase()), sB = w.amostrar(ac, 0.6, w.pdBase()), sC = w.amostrar(an, 0.6, w.pdBase());
  ok(r3.ok && perto(sA.valores.elbowR, sB.valores.elbowR, 1) && perto(sA.valores.hipFlexL, sC.valores.hipFlexL, 1), "camada: braço do aceno e pernas do andar ao mesmo tempo");
  const r4 = w.compilarName('animacao "gc" de girar360E\n  soma tronco(frente 25)\n  chave 0.5s ombro.ambos(abre 60)\n  trecho 0s a 1s\n', { salvar: false }), gc = r4.animacoes[0];
  ok(r4.ok && perto(gc.duracao, 1, 1e-6) && gc.chaves.every(c => perto(w.amostrar(gc, c.t, {}).valores.spineFlex, (w.amostrar(g, c.t, {}).valores.spineFlex || 0) + 25, 0.5)), "soma tronco + chave + trecho");
  const k5 = gc.chaves.find(c => perto(c.t, 0.5)); ok(k5 && perto(k5.valores.armAbdL + (w.pdBase().armAbdL || 0), 60, 0.5), "a chave nova põe os braços abertos em 0,5 s"); }

console.log("5. pular, nadar, água, chão");
{ const w = createWorld(), h = 0.4, p = w.lcPulo({ estilo: "frente", altura: h, distancia: 1 }), T = 2 * Math.sqrt(2 * h / 9.81);
  const voo = p.chaves.filter(c => c.valores.ground === -1), dt = voo.length ? voo[voo.length - 1].t - p.chaves.find(c => c.t > 0.45 && c.t < 0.47).t : 0, top = Math.max(...p.chaves.map(c => c.valores.bodyLift || 0)) * 0.114;
  ok(perto(top, h, 0.02), "altura do pulo " + top.toFixed(2) + " m"); ok(Math.abs(dt - T * 7 / 8) < 0.02, "tempo de voo pela gravidade (" + T.toFixed(2) + " s)");
  ok(perto(p.chaves[p.chaves.length - 1].mover.frente, 1, 1e-6), "aterrissa 1 m à frente");
  const txt = 'local "Clube" unidade m\n  chao retangulo -6,-6 a 6,6\n  agua "piscina" em (0,0) tamanho 6x8x1.1\nelenco\n  Kai relevante\n  Mira relevante\nquadro local "Clube" plano geral\n  Kai em (0,1) nada crawl 2m\n  Mira em (1.5,-2)\n';
  const r = w.compilarName(txt, { salvar: false }); ok(r.ok, "local com água" + (r.ok ? "" : ": " + JSON.stringify(r.erros)));
  ok(/Kai \(vermelho\): nada crawl, nadando na água/.test(r.quadros[0].legenda), "a legenda diz que Kai está nadando (" + r.quadros[0].legenda + ")");
  ok(/Mira \(azul\): com a água até (a cintura|o peito)/.test(r.quadros[0].legenda), "em pé na piscina: a água até a cintura/peito");
  const r2 = w.compilarName('elenco\n  Kai relevante\nquadro\n  Kai em (0,0) nada peito\n', { salvar: false }); ok(r2.avisos.some(a => /fora da água/.test(a)), "nadar fora da água vira aviso");
  const r3 = w.compilarName('elenco\n  Kai relevante\nquadro\n  Kai em (0,0) engatinha 1m\nquadro\n  Kai cai tras\nquadro\n  Kai levanta-se\nquadro\n  Kai rola direita 2 voltas\nquadro\n  Kai pula alto\nquadro\n  Kai mergulha\nquadro\n  Kai rasteja 1m\nquadro\n  Kai anda-agachado 1m\n', { salvar: false });
  ok(r3.ok && r3.quadros.every(q => q.animacoes.length === 1), "engatinha, cai, levanta-se, rola, pula, mergulha, rasteja, anda-agachado no quadro");
  const rl = w.lcRolar("direita", 1), rolls = rl.chaves.map(c => c.valores.bodyRoll); ok(rolls.some(v => v > 170) || rolls.some(v => v < -170), "rolar dá a volta inteira (passa por 180°)");
  const L = w.bibliotecaAnimacoes().listar().map(a => a.nome); ok(["puloFrente", "mergulhar", "nadarCrawl", "nadarCostas", "engatinhar", "rastejar", "andarAgachado", "cairFrente", "levantarDeBrucos", "rolarDireita"].every(n => L.includes(n)) && !L.some(n => /^_erro/.test(n)), "tudo na biblioteca, sem erro"); }

console.log("5b. teste cego: correções");
{ const w = createWorld();
  const r = w.compilarName('animacao "aa" camada andarCiclo + acenarTchau braco-direito\nanimacao "ab" camada andarCiclo + acenarTchau bracoDireito\n', { salvar: false }), aa = r.animacoes[0], m = aa.chaves[aa.chaves.length - 1].mover;
  ok(r.ok && m.frente > 1.5, "camada com ciclo em loop: anda de verdade (" + m.frente.toFixed(2) + " m em " + aa.duracao.toFixed(1) + " s)");
  ok(r.animacoes.length === 2, "partes com hífen ou juntas (braco-direito = bracoDireito)");
  const jn = w.pdJuntar([w.bibliotecaAnimacoes().obter("andarCiclo"), w.bibliotecaAnimacoes().obter("acenarTchau")], { mistura: 0.1 }), mj = jn.chaves[jn.chaves.length - 1].mover;
  const fa = w.bibliotecaAnimacoes().obter("andarCiclo").chaves.at(-1).mover.frente; ok(mj && perto(mj.frente, fa, 0.02), "junta com um ciclo em loop: o aceno começa onde o andar terminou (" + (mj ? mj.frente.toFixed(2) : "-") + " m)");
  const r2 = w.compilarName('local "P" unidade m\n  chao retangulo -10,-10 a 10,10\n  agua "piscina" em (0,0) tamanho 6x12x1.4\nelenco\n  Kai relevante\nquadro local "P" plano geral\n  Kai em (0,4) nada crawl 4m\n', { salvar: false });
  ok(r2.avisos.some(a => /termina o nado FORA da água/.test(a)), "terminar o nado fora da água avisa");
  const r3 = w.compilarName('local "P" unidade m\n  chao retangulo -10,-10 a 10,10\n  agua "piscina" em (0,0) tamanho 6x12x1.4\nelenco\n  Kai relevante\nquadro local "P" plano geral\n  Kai em (0,2) nada costas 2m\nquadro continua\n  Kai nada crawl 2m\n', { salvar: false });
  ok(/Kai \(vermelho\): nada crawl, nadando/.test(r3.quadros[1].legenda), "crawl logo depois do nado de costas: continua nadando (" + r3.quadros[1].legenda + ")");
  const r4 = w.compilarName('local "P" unidade m\n  chao retangulo -10,-10 a 10,10\n  agua "rasa" em (0,0) tamanho 6x6x0.6\nelenco\n  Mira relevante\nquadro local "P" plano geral\n  Mira em (0,0)\n', { salvar: false });
  ok(/até as coxas/.test(r4.quadros[0].legenda), "60 cm de água num adulto: até as coxas");
  const c = w.pdCompletar('pose "x"\n  joelho.direito(dobra 30, ', {}); ok(c && !c.itens.some(i => i.r === "dobra") && c.itens.some(i => i.r === "estica"), "o movimento já usado sai da lista");
  const r5 = w.compilarName('animacao "x" de girar360E\n  troca pernas, banana por pose ajoelhado\n', { salvar: false }); ok(/“banana” não é uma parte do corpo/.test((r5.erros[0] || {}).erro || ""), "parte do corpo errada: erro diz qual"); }

console.log("6. autocompletar e miniaturas");
{ const w = createWorld();
  const a = w.pdCompletar('pose "x"\n  ombro.', {}); ok(a && a.itens.map(i => i.r).join() === "direito(,esquerdo(,ambos(", "ombro. → lados");
  const b = w.pdCompletar('pose "x"\n  ombro.direito(fre', {}); ok(b && b.itens[0].r === "frente" && /frente 0–180°/.test(b.ajuda), "dentro dos parênteses: movimentos e limites");
  const c = w.pdCompletar("quadro\n  Kai pose.", {}); ok(c && c.ponto && c.itens.length > 50 && c.itens[0].v.startsWith(" "), "pose. → poses (o ponto vira espaço)");
  const d = w.pdCompletar('animacao "a" junta acenarTchau, gir', {}); ok(d && d.itens.some(i => /girar360E/.test(i.r)), "junta A, … → animações");
  const e = w.pdCompletar('pose "x"\n  ag', {}); ok(e && e.itens[0].r === "agacha", "começo de linha na pose: juntas e atalhos");
  const f = w.pdCompletar('animacao "x" de girar360E\n  tr', {}); ok(f && f.itens.some(i => i.r === "troca") && f.itens.some(i => i.r === "trecho"), "começo de linha na animação: operações");
  ok(/<svg[^>]*pd-mini/.test(w.pdMiniaturaItem({ tipo: "pose", nome: "passo" })) && /pd-tira/.test(w.pdMiniaturaItem({ tipo: "anim", nome: "puloFrente" })) && /#e8662c/.test(w.pdMiniaturaItem({ tipo: "junta", junta: "joelho", lado: "esquerdo" })), "miniaturas: pose, tirinha da animação e junta acesa"); }

console.log(falhas ? "poses-texto: " + falhas + " FALHOU" : "poses-texto: tudo ok"); process.exit(falhas ? 1 : 0);
