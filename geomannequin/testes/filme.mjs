/* FILME por texto: filme → cena → plano, linhas de tempo, ações que seguram, esperas vivas, câmera de cinema, transições e MP4 */
import { createWorld } from "../mcp/lib/core.mjs";
import { spawnSync } from "node:child_process";
let falhas = 0; const ok = (c, m) => { if (c) console.log("  ok  " + m); else { falhas++; console.log("  FALHOU  " + m); } };
const w = createWorld();
const compila = t => w.compilarName(t.trim() + "\n", { semCache: true, salvar: false });
const ang = (a, b) => { const la = Math.hypot(...a), lb = Math.hypot(...b); return Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb)))) * 180 / Math.PI; };
/* câmera do quadro: posição, direção do olhar e ângulo até a cabeça de alguém */
function camDe(f, quem) { w.loadScene(JSON.parse(JSON.stringify(f.estado))); const c = w.cameraNoMundo(f.estado.camera), p = w.cfPessoa(quem); const dir = [c.alvo[0] - c.pos[0], c.alvo[1] - c.pos[1], c.alvo[2] - c.pos[2]], para = [p.cabeca[0] - c.pos[0], p.cabeca[1] - c.pos[1], p.cabeca[2] - c.pos[2]];
  return { pos: c.pos, desvio: ang(dir, para), dist: Math.hypot(...para) * 0.114, olhos: p.olhos, cabeca: p.cabeca, frente: p.frente }; }
const posDe = (f, quem) => { w.loadScene(JSON.parse(JSON.stringify(f.estado))); const it = w.SCN.list.find(x => x.name === quem); return [it.params.wx, it.params.wz, it.params]; };

const BASE = `
filme "Teste" fps 12
elenco
  Kai relevante
  Mira relevante
local "Praça" unidade m
  chao retangulo -20,-20 a 20,20 classe pedra
cena "Praça" local "Praça" hora tarde
`;

console.log("1. estrutura: filme, cena, planos, transições");
{ const r = compila(BASE + `
  plano 1 duracao 4s
    Kai em (0,-6)
    Mira em (0,4) vira-para Kai
    camera fixa frente-de Kai 12m altura 1.6m olha Kai
    0s Kai anda-ate Mira
  plano 2 fusao 0.5s duracao 3s
    camera sobre-o-ombro Kai alvo Mira
    0s Kai oferece
  plano 3 escurece 0.6s
    camera pov Mira
    0s Mira espera
    marca "fim" 2s
`);
  ok(!r.erros.length, "compila sem erros " + JSON.stringify(r.erros));
  const ps = r.quadros.filter(q => q.filme); ok(ps.length === 3, "3 planos (" + ps.length + ")");
  ok(r.filme && r.filme.nome === "Teste" && r.filme.fps === 12, "cabeçalho do filme (nome, fps)");
  ok(ps[0].filme.duracao === 4 && ps[1].filme.duracao === 3, "durações dadas");
  ok(ps[2].filme.duracao >= 2, "duração automática cobre a marca (" + ps[2].filme.duracao + ")");
  ok(ps[1].filme.transicao.tipo === "fusao" && ps[2].filme.transicao.tipo === "escurece", "transições lidas");
  const v = w.videoDoFilme(r, {}); ok(v.fps === 12 && v.frames.length === Math.round(v.duracao * 12), "quadros = duração × fps (" + v.frames.length + ")");
  ok(v.planos.length === 3 && v.planos[1].quadros[0] === 48, "plano 2 começa no quadro 48");
  const fu = v.frames.slice(48, 60).filter(f => f.fusao); ok(fu.length >= 5 && fu[0].fusao.u > fu[fu.length - 1].fusao.u, "fusão: mistura com o fim do plano anterior e some (" + fu.length + " quadros)");
  const ve = v.frames.filter(f => f.veu); ok(ve.length >= 6 && ve.some(f => f.veu.u > 0.8), "escurece: véu escuro no corte (" + ve.length + " quadros)");
  /* continuidade: o plano 2 começa onde o 1 terminou */
  const [x1, z1] = posDe(v.frames[47], "Kai"), [x2, z2] = posDe(v.frames[48], "Kai"); ok(Math.hypot(x1 - x2, z1 - z2) < 8.8, "continuidade entre planos (salto " + (Math.hypot(x1 - x2, z1 - z2) * 0.114).toFixed(2) + " m)");
  const ro = w.roteiroDoFilme(r); ok(/## Plano 1/.test(ro.md) && /câmera/.test(ro.md) && ro.prompts.length === 3, "lista de planos (.md) e 3 prompts");
  ok(ro.json.planos[1].inicio === 4 && ro.json.duracao > 9, "json: início e duração");
}

console.log("2. tempo: Ns, Ns-Ms, depois, junto");
{ const r = compila(BASE + `
  plano 1 duracao 8s
    Kai em (0,0)
    Mira em (0,3) vira-para Kai
    1s Kai acena
    depois Kai aponta Mira
    junto Mira olha Kai
    5s-6s Mira expressao alegria
`); ok(!r.erros.length, "compila " + JSON.stringify(r.erros));
  const F = r.quadros[0].filme, rt = F.roteiro; const ac = rt.find(e => /acena/.test(e.texto)), ap = rt.find(e => /aponta/.test(e.texto)), ol = rt.find(e => /olha/.test(e.texto)), ex = rt.find(e => /expressao/.test(e.texto));
  ok(ac && ac.t === 1, "1s acena começa em 1 s");
  ok(ap && Math.abs(ap.t - ac.ate) < 0.01, "depois = quando a anterior termina (" + (ap && ap.t.toFixed(2)) + ")");
  ok(ol && Math.abs(ol.t - ap.t) < 0.01, "junto = ao mesmo tempo que a anterior");
  ok(ex && ex.t === 5 && Math.abs(ex.ate - 6) < 0.01, "5s-6s: transição dura o intervalo");
}

console.log("3. ações seguram, esperas vivas, ciclos até o fim");
{ const r = compila(BASE + `
  plano 1 duracao 6s
    Kai em (0,0)
    Mira em (0,3) vira-para Kai
    0s Kai oferece
    0s Mira espera impaciente
`); ok(!r.erros.length, "compila");
  const v = w.videoDoFilme(r, { fps: 6 }); const braco = i => posDe(v.frames[i], "Kai")[2].armFlexR;
  ok(braco(Math.round(2.5 * 6)) > 30 && Math.abs(braco(35) - braco(Math.round(2.5 * 6))) < 15, "oferece: o braço fica estendido até o fim do plano (" + braco(15).toFixed(0) + "° → " + braco(35).toFixed(0) + "°)");
  const mira = v.frames.map(f => posDe(f, "Mira")[2]), varia = k => Math.max(...mira.map(p => p[k] || 0)) - Math.min(...mira.map(p => p[k] || 0));
  ok(varia("headYaw") > 3 || varia("spineSide") > 1 || varia("pelvisShift") > 0.2, "espera viva: cabeça/peso variam (" + varia("headYaw").toFixed(1) + "°)");
  const e1 = w.adEspera("empe", 8, { semente: 1 }), e2 = w.adEspera("empe", 8, { semente: 2 }); ok(e1.tipo === "espera" && Math.abs(e1.duracao - 8) < 0.01 && JSON.stringify(e1.chaves) !== JSON.stringify(e2.chaves), "esperas: duração exata e variação por semente");
  ok(w.adEspera("empe", 5).gerar(11).duracao === 11, "espera.gerar(duração)");
  ok(w.adTipoDe(w.AD_ACOES.oferece ? w.adAcaoPara("oferece") : null) === "acao", "oferece é ação (não ciclo)");
  const ac = w.adAcaoPara("acena"); ok(ac.duracao > 0.8 && !ac.loop, "acena: ação que volta (" + ac.duracao.toFixed(2) + " s)");
}

console.log("4. câmera de cinema");
{ const r = compila(BASE + `
  plano 1 duracao 5s
    Kai em (0,-8)
    Mira em (0,8)
    camera segue Kai atras distancia 3m altura 1.7m
    0s Kai anda-ate (0,6)
  plano 2 corte duracao 4s
    Kai em (0,0)
    camera fixa frente-de Kai 10m altura 1.6m olha Kai
    0s Kai anda-ate (0,6)
  plano 3 corte duracao 3s
    Mira vira-para Kai
    camera pov Mira
  plano 4 corte duracao 4s
    camera plano medio alvo Kai
    2s camera corte plano geral
    0s camera orbita 90 em 2s
`); ok(!r.erros.length, "compila " + JSON.stringify(r.erros));
  const v = w.videoDoFilme(r, { fps: 6 }), P = v.planos;
  const segue = [P[0].quadros[0] + 3, P[0].quadros[0] + 15, P[0].quadros[1]].map(i => camDe(v.frames[i], "Kai"));
  ok(segue.every(c => c.desvio < 20), "segue: Kai sempre perto do centro (" + segue.map(c => c.desvio.toFixed(0) + "°").join(", ") + ")");
  ok(segue.every(c => c.dist > 2 && c.dist < 4.5), "segue: a distância fica perto de 3 m (" + segue.map(c => c.dist.toFixed(1)).join(", ") + ")");
  const f1 = camDe(v.frames[P[1].quadros[0] + 1], "Kai"), f2 = camDe(v.frames[P[1].quadros[1]], "Kai");
  ok(Math.hypot(f1.pos[0] - f2.pos[0], f1.pos[1] - f2.pos[1], f1.pos[2] - f2.pos[2]) < 0.5, "fixa: a câmera não sai do lugar");
  ok(f2.dist < f1.dist - 3 && f2.desvio < 15, "fixa: Kai chega perto, sempre olhado (" + f1.dist.toFixed(1) + " → " + f2.dist.toFixed(1) + " m)");
  const pv = camDe(v.frames[P[2].quadros[0] + 2], "Mira"); w.loadScene(JSON.parse(JSON.stringify(v.frames[P[2].quadros[0] + 2].estado)));
  const cm = w.cameraNoMundo(v.frames[P[2].quadros[0] + 2].estado.camera), mo = w.cfPessoa("Mira").olhos; ok(Math.hypot(cm.pos[0] - mo[0], cm.pos[1] - mo[1], cm.pos[2] - mo[2]) * 0.114 < 0.25, "POV: a câmera está nos olhos de Mira");
  const kai = camDe(v.frames[P[2].quadros[0] + 2], "Kai"); ok(kai.desvio < 15, "POV: Mira vê Kai (" + kai.desvio.toFixed(0) + "°)");
  const q4 = P[3].quadros[0], a = v.frames[q4 + 11].estado.camera, b2 = v.frames[q4 + 12].estado.camera; ok(Math.abs((a.camDist || 0) - (b2.camDist || 0)) > 3 || Math.abs((a.lens || 0) - (b2.lens || 0)) > 5, "corte em 2 s: muda de uma vez entre dois quadros");
  const yaw0 = v.frames[q4].estado.camera.yaw, yaw1 = v.frames[q4 + 10].estado.camera.yaw; ok(Math.abs(((yaw1 - yaw0) % 360 + 540) % 360 - 180) > 50, "orbita: o ângulo gira com o tempo (" + (yaw1 - yaw0).toFixed(0) + "°)");
}

console.log("5. avisos úteis");
{ const r = compila(BASE + `
  plano 1 duracao 2s
    Kai em (0,-8)
    Mira em (0,8)
    0s Kai anda-ate Mira
`); ok(r.avisos.concat(...r.quadros.map(q => q.avisos || [])).some(a => /corta no meio/.test(a)), "avisa quando a ação passa do fim do plano");
  const e = compila(BASE + `
  plano 1
    0s Ninguem acena
`); ok(e.erros.length > 0, "nome fora do elenco vira erro");
}

console.log("6. MP4 (ffmpeg) válido");
{ const ff = spawnSync("ffmpeg", ["-version"]); if (ff.status !== 0) console.log("  (sem ffmpeg: pulado)"); else {
  const { quadrosParaMp4 } = await import("../mcp/lib/tools-filme.mjs"); const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs"); const { tmpdir } = await import("node:os"); const { join } = await import("node:path");
  const r = compila(BASE + `
  plano 1 duracao 1s
    Kai em (0,0)
    camera plano medio alvo Kai
  plano 2 fusao 0.3s duracao 1s
    camera plano close alvo Kai
`); const v = w.videoDoFilme(r, { fps: 8 }), m = await quadrosParaMp4(w, v.frames, { fps: 8, largura: 320 }), d = mkdtempSync(join(tmpdir(), "gmt-")), arq = join(d, "t.mp4"); writeFileSync(arq, m.mp4);
  const pr = spawnSync("ffprobe", ["-v", "error", "-count_frames", "-show_entries", "stream=codec_name,nb_read_frames,width,height", "-of", "csv=p=0", arq]).stdout.toString().trim();
  ok(pr === "h264,320,180," + v.frames.length, "MP4 H.264 320×180 com " + v.frames.length + " quadros (" + pr + ")"); rmSync(d, { recursive: true, force: true }); } }

console.log("7. objetos no tempo: pega, entrega, larga, joga; efeito no tempo");
{ const r = compila(`
filme "Obj" fps 12
elenco
  Kai relevante
  Mira relevante
local "Sala" unidade m
  chao retangulo -6,-6 a 6,6
  mesa "mesa" em (0.8,0) tamanho 1x0.6x0.75
  copo "copo" em (0.8,0) sobre mesa
  bola "bola" em (0.5,-0.5)
cena "Sala" local "Sala"
  plano 1 duracao 9s
    Kai em (0,0) vira-para mesa
    Mira em (0,2.2) vira-para Kai
    0s Kai pega copo
    2s Kai entrega copo para Mira
    4.5s Mira larga copo
    6s Kai efeito energia_mao em mao-direita
`); ok(!r.erros.length, "compila " + JSON.stringify(r.erros));
  const v = w.videoDoFilme(r, { fps: 12 }), at = s0 => { const f = v.frames[Math.round(s0 * 12)]; const o = f.estado.objetos.find(x => x.nome === "copo"); return { o, dono: o.gripV3 ? o.gripV3.mannequinIndex : null, base: (o.base || 0) / 8.77, fx: (f.estado.efeitos || []).length }; };
  const lista = f => f.estado.list.map(x => x.name);
  const iK = lista(v.frames[0]).indexOf("Kai"), iM = lista(v.frames[0]).indexOf("Mira");
  ok(at(0.2).dono === null && at(0.2).base > 0.6, "antes de pegar: o copo está sobre a mesa (" + at(0.2).base.toFixed(2) + " m)");
  ok(at(1.5).dono === iK, "pega: o copo está na mão de Kai");
  ok(at(3.8).dono === iM, "entrega: o copo passou para a mão de Mira");
  const meio = at(4.85), chao = at(6); ok(meio.dono === null && meio.base > chao.base + 0.1 && chao.base < 0.1, "larga: o copo cai (" + meio.base.toFixed(2) + " m → " + chao.base.toFixed(2) + " m)");
  ok(at(5).fx === 0 && at(6.5).fx >= 1, "efeito aparece só no tempo dele");
  const r2 = compila(`
filme "Jogo" fps 12
elenco
  Kai relevante
  Mira relevante
local "Q" unidade m
  chao retangulo -8,-8 a 8,8
  bola "bola" em (0.3,0.3)
cena "Q" local "Q"
  plano 1 duracao 4s
    Kai em (0,0)
    Mira em (0,5) vira-para Kai
    0s Kai pega bola
    1.5s Kai joga bola para Mira
`); ok(!r2.erros.length, "joga compila " + JSON.stringify(r2.erros)); const v2 = w.videoDoFilme(r2, { fps: 24 }), b = t => v2.frames[Math.round(t * 24)].estado.objetos.find(x => x.nome === "bola");
  const z = [2.0, 2.2, 2.4, 2.6].map(t => b(t).z), alto = Math.max(...[2.0, 2.2, 2.4].map(t => (b(t).base || 0) / 8.77));
  ok(z[0] < z[1] && z[1] < z[2], "joga: a bola avança em direção a Mira"); ok(alto > 1.5, "joga: arco no ar (" + alto.toFixed(2) + " m)");
  ok(b(3.8).gripV3 && b(3.8).gripV3.mannequinIndex === v2.frames[0].estado.list.findIndex(x => x.name === "Mira"), "joga para alguém: Mira pega");
}

console.log("8. princípios: exagera, sobreposição, silhueta");
{ const base = BASE + `
  plano 1 duracao 3s
    Kai em (0,0)
    camera plano medio alvo Kai
    0s Kai aponta`;
  const a = w.videoDoFilme(compila(base), { fps: 12 }), b = w.videoDoFilme(compila(base + " exagera 140%"), { fps: 12 });
  const ombro = (v, s0) => { const f = v.frames[Math.round(s0 * 12)]; return f.estado.list.find(x => x.name === "Kai").params.armFlexR; };
  ok(ombro(b, 2) > ombro(a, 2) * 1.25, "exagera 140%: braço vai mais longe (" + ombro(a, 2).toFixed(0) + "° → " + ombro(b, 2).toFixed(0) + "°)");
  const an = w.adAcaoPara("acena"), so = w.pdSobrepor(an, 0.12); ok(so.duracao > an.duracao + 0.1, "sobreposição: termina um pouco depois");
  const mt = an.duracao * 0.3, pr = (x, k) => w.pdChaveEm(Object.assign({}, x, { loop: false }), mt, w.pdBase()).valores[k] || 0;
  const lagK = Object.keys(an.chaves[an.chaves.length - 1].valores).filter(k => /^(hand|wrist|forearm|head|neck)/.test(k)), pt = (x, k, t) => w.pdChaveEm(Object.assign({}, x, { loop: false }), t, w.pdBase()).valores[k] || 0;
  ok(lagK.some(k => [0.2, 0.35, 0.5, 0.65, 0.8].some(u => Math.abs(pt(so, k, an.duracao * u) - pt(an, k, an.duracao * u)) > (/^hand/.test(k) ? 0.01 : 0.5))), "sobreposição: mão/punho/cabeça chegam atrasados (" + lagK.join(", ") + ")");
  ok(Math.abs(pr(so, "armFlexR") - pr(an, "armFlexR")) < 1e-6 || !("armFlexR" in an.chaves[1].valores), "o ombro (ação primária) não atrasa");
  const r = compila(BASE + `
  plano 1 duracao 3s
    Kai em (0,0)
    camera plano medio alvo Kai lado frente
    0s Kai cruza-bracos`); const v = w.videoDoFilme(r, { fps: 12 }); ok(v.avisos.some(x => /silhueta/.test(x)), "silhueta: mão na frente do corpo vira aviso");
  const r3 = compila(BASE + `
  plano 1 duracao 3s
    Kai em (0,0)
    camera plano medio alvo Kai lado frente
    0s Kai acena`); ok(!w.videoDoFilme(r3, { fps: 12 }).avisos.some(x => /silhueta/.test(x)), "acenar de frente: sem aviso de silhueta");
}

console.log("9. falas: quem escuta olha, legendas, .srt");
{ const r = compila(`
filme "Conversa" fps 12 legendas
elenco
  Kai relevante
  Mira relevante
local "P" unidade m
  chao retangulo -6,-6 a 6,6
cena "P" local "P"
  plano 1 duracao 5s
    Kai em (0,0) vira-para (0,5)
    Mira em (1.5,1.5)
    camera plano geral alvo Kai
    1s Mira fala "Você trouxe o mapa?"
`); ok(!r.erros.length, "compila " + JSON.stringify(r.erros)); const v = w.videoDoFilme(r, { fps: 12 });
  const yaw = s0 => v.frames[Math.round(s0 * 12)].estado.list.find(x => x.name === "Kai").params.headYaw || 0;
  ok(Math.abs(yaw(2.2) - yaw(0.5)) > 15, "Kai vira a cabeça para Mira enquanto ela fala (" + yaw(0.5).toFixed(0) + "° → " + yaw(2.2).toFixed(0) + "°)");
  const fr = v.frames[Math.round(1.5 * 12)]; ok(fr.fala && /mapa/.test(fr.fala.texto), "o quadro leva a fala (legenda)");
  const svg = w.svgComLegenda(w.renderizarQuadro(fr, { passes: false }).svg, fr.fala); ok(/Mira: Você trouxe o mapa\?/.test(svg), "legenda queimada no desenho");
  const ro = w.roteiroDoFilme(r); ok(/^1\n00:00:01,000 --> 00:00:0\d,\d{3}\nMira: Você trouxe o mapa\?/.test(ro.srt), ".srt com o tempo da fala");
}

console.log("10. código: pose e animação → texto → de volta");
{ let ruins = 0, n = 0; for (const nome of w.todasPoses().slice(0, 60)) { let V; try { V = w.pdValoresPose(nome, w.pdParams({}), null, 0).valores; } catch (e) { continue; } n++;
    const r = compila(w.pdCodigoPose(V, { nome: "x" })), W2 = r.erros.length ? null : r.defs.find(x => x.tipo === "pose").valores; if (!W2 || Object.keys(V).some(k => Math.abs((W2[k] ?? 0) - V[k]) > (/^(handCurl|shElev|shProt)/.test(k) ? 0.01 : 0.2))) ruins++; }
  ok(n > 50 && ruins === 0, "poses prontas: código → pose igual (" + n + " poses, " + ruins + " diferentes)");
  const B = w.pdBase(), lib = w.bibliotecaAnimacoes(); let m = 0, rA = 0;
  for (const nome of ["andarCiclo", "acenarTchau", "girar360E", "puloFrente", "nadarCrawl", "oferecer", "esperaImpaciente", "socoDireto"]) { const a = lib.obter(nome); if (!a) continue; m++;
    const r = compila(w.pdCodigoAnimacao(a, { nome: "x" })); if (r.erros.length) { rA++; continue; } const b = r.defs.find(x => x.tipo === "animacao").anim;
    for (let i = 0; i <= 8; i++) { const t = a.duracao * i / 8, A = w.pdChaveEm(Object.assign({}, a, { loop: false }), t, B), C = w.pdChaveEm(Object.assign({}, b, { loop: false }), t, B);
      const val = (x, c, k) => x.modo === "relativa" && !(x.absolutos || []).includes(k) ? (B[k] || 0) + (c.valores[k] || 0) : (c.valores[k] ?? B[k] ?? 0);
      if (Object.keys(A.valores).some(k => Math.abs(val(a, A, k) - val(b, C, k)) > (/^(hand|sh|jaw|smile|eye|brow)/.test(k) ? 0.02 : 1.5))) { rA++; break; } } }
  ok(m >= 7 && rA === 0, "animações (ciclo, giro, pulo, nado, ação, espera, luta): código → animação igual (" + m + ", " + rA + " diferentes)");
}

console.log("11. continuidade de ação cortada, anda/corre, saída escura, enquadramento");
{ const r = compila(`
filme "T" fps 6 fim escurece 1s
elenco
  Kai relevante
local "P" unidade m
  chao retangulo -9,-9 a 9,12
cena "P" local "P"
  plano 1 duracao 2s
    Kai em (0,-6)
    camera segue Kai
    0s Kai corre 10m
  plano 2 corte duracao 3s sai escurece 1s
    camera plano geral alvo Kai
  plano 3 fusao 0.5s duracao 2s
    camera plano close alvo Kai lado frente
    0s Kai anda 1m
`); ok(!r.erros.length, "compila " + JSON.stringify(r.erros));
  const v = w.videoDoFilme(r, { fps: 6 }), z = i => v.frames[i].estado.list.find(x => x.name === "Kai").params.wz * 0.114;
  ok(z(13) > z(12) + 0.2 && z(29) > z(12) + 3, "a corrida cortada continua no plano seguinte (" + z(12).toFixed(1) + " → " + z(29).toFixed(1) + " m)");
  ok(Math.abs(z(29) - z(0) - 10) < 0.8, "chega onde a corrida inteira levaria (10 m: " + (z(29) - z(0)).toFixed(1) + ")");
  ok(v.frames[29].veu && v.frames[29].veu.u > 0.9 && !v.frames[22].veu, "sai escurece: o fim do plano 2 vai ao preto");
  ok(v.frames[v.frames.length - 1].veu && v.frames[v.frames.length - 1].veu.u > 0.9, "fim escurece: o filme termina no preto");
  const f = v.frames[v.planos[2].quadros[0] + 3]; w.loadScene(JSON.parse(JSON.stringify(f.estado))); const c = w.cameraNoMundo(f.estado.camera), p = w.cfPessoa("Kai");
  ok(f.estado.camera.panY !== undefined, "close: o enquadramento guarda o deslocamento de tela (panY " + (f.estado.camera.panY || 0).toFixed(2) + ")");
}

console.log(falhas ? "\n" + falhas + " FALHA(S)" : "\ntudo certo"); process.exit(falhas ? 1 : 0);
