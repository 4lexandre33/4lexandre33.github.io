/* GeoMannequin — mais jeitos de se mover: PULAR (no lugar, para frente, alto, de lado, com corrida — o voo dura o tempo
   da gravidade), MERGULHAR, NADAR (crawl, peito, costas, cachorrinho, boiar, pernada), ENGATINHAR, RASTEJAR,
   ANDAR AGACHADO, CAIR, LEVANTAR-SE do chão e ROLAR. Água: a peça "agua" do local tem a superfície no topo dela;
   quem está dentro fica na linha da água e a legenda diz até onde a água chega. Ciclos (nado, engatinhar…) são loops. */
import { SCN } from "./modelo.js";
import { pMundo } from "./colisoes.js";
import { capsulas } from "../engine/index.js";
import { criarAnimacao, anPoseValores, registrarProntas, anSemCamera, aplicarAnimacao } from "./animacao.js";
import { pdCiclo, pdJuntar, pdRepetir, pdParams } from "./pose-dsl.js";

const LC_M = 1 / 0.114, LC_G = 9.81;
/* valores de uma pose pronta sobre o corpo do primeiro manequim (proporções inteiras) */
const lcPose = n => anPoseValores(n, pdParams({}));
/* um ciclo por fases (0–1): f(fase) → valores (deltas); n chaves por ciclo */
function lcCiclo(nome, dur, n, f, o = {}) {
  const ch = []; for (let i = 0; i <= n; i++) { const p = i / n, v = f(p); ch.push({ t: +(dur * p).toFixed(4), valores: v, mover: { frente: (o.anda || 0) * p, lado: 0, giro: 0 }, curva: "suave" }); }
  return criarAnimacao({ nome, duracao: dur, modo: "relativa", curva: "linear", loop: true, pesFixos: o.pesFixos ?? false, escalarPeloCorpo: true, chaves: ch, tags: o.tags || [], descricao: o.desc || "", absolutos: o.absolutos || [] });
}
/* interpolação entre amostras [fase, valor] (fecha o ciclo) */
function lcCurva(pts, p) { p = ((p % 1) + 1) % 1; for (let i = 0; i < pts.length - 1; i++) { const [a, va] = pts[i], [b, vb] = pts[i + 1]; if (p >= a && p <= b) { const u = (p - a) / Math.max(1e-6, b - a), s = u * u * (3 - 2 * u); return va + (vb - va) * s; } } return pts[pts.length - 1][1]; }

/* ===================== pular ===================== */
const LC_PULOS = { lugar: [0.3, 0], frente: [0.35, 1.0], alto: [0.55, 0], lado: [0.25, 0.6], corrida: [0.45, 1.8] };
function lcPulo(o = {}) {
  const est = LC_PULOS[o.estilo] ? o.estilo : "lugar", h = Math.max(0.05, o.altura ?? LC_PULOS[est][0]), dist = o.distancia ?? LC_PULOS[est][1], T = 2 * Math.sqrt(2 * h / LC_G), lado = est === "lado" ? (o.sentido === "direita" ? -1 : 1) : 0, longe = est === "frente" || est === "corrida";
  const dois = v => { const r = {}; for (const [k, x] of Object.entries(v)) { if (/^(knee|hip|ankle|arm|elbow)/.test(k)) { r[k + "L"] = x; r[k + "R"] = x; } else r[k] = x; } return r; };
  const ant = dois({ kneeFlex: 70, hipFlex: 62, ankleFlex: -22, spineFlex: 25, armFlex: -45, elbow: 15, headPitch: -8 });
  const imp = dois({ kneeFlex: 0, hipFlex: -5, ankleFlex: 35, spineFlex: -4, armFlex: est === "alto" ? 165 : 110, elbow: 10, headPitch: -5 });
  const ar = dois(longe ? { kneeFlex: 62, hipFlex: 80, ankleFlex: 10, spineFlex: 28, armFlex: 75, elbow: 20, headPitch: -10 } : { kneeFlex: 50, hipFlex: 45, ankleFlex: 25, spineFlex: 8, armFlex: est === "alto" ? 165 : 60, elbow: 18, headPitch: -5 });
  const pouso = dois({ kneeFlex: 25, hipFlex: longe ? 45 : 25, ankleFlex: 5, spineFlex: 14, armFlex: 55, elbow: 25, headPitch: 0 }), amort = dois({ kneeFlex: 78, hipFlex: 68, ankleFlex: -22, spineFlex: 32, armFlex: 45, elbow: 30, headPitch: -6 });
  const zero = Object.fromEntries(Object.keys(amort).map(k => [k, 0])), mv = (fr, u) => ({ frente: lado ? 0 : fr * u, lado: lado * dist * u, giro: 0 });
  const ch = [{ t: 0, valores: Object.assign({}, zero, { bodyLift: 0, ground: 0 }), mover: mv(dist, 0) }, { t: 0.32, valores: Object.assign({}, ant, { bodyLift: 0, ground: 0 }), mover: mv(dist, 0) }, { t: 0.46, valores: Object.assign({}, imp, { bodyLift: 0, ground: 0 }), mover: mv(dist, 0) }];
  const N = 8, t1 = 0.46; for (let i = 1; i <= N; i++) { const u = i / N, v = {}; const fase = u < 0.5 ? u * 2 : (1 - u) * 2; for (const k of Object.keys(imp)) v[k] = (u < 0.5 ? imp[k] + (ar[k] - imp[k]) * fase : pouso[k] + (ar[k] - pouso[k]) * fase);
    ch.push({ t: +(t1 + T * u).toFixed(4), valores: Object.assign(v, { bodyLift: h * LC_M * 4 * u * (1 - u), ground: i === N ? 0 : -1 }), mover: mv(dist, u), curva: "linear" }); }
  const t2 = t1 + T; ch.push({ t: +(t2 + 0.16).toFixed(4), valores: Object.assign({}, amort, { bodyLift: 0, ground: 0 }), mover: mv(dist, 1) }, { t: +(t2 + 0.6).toFixed(4), valores: Object.assign({}, zero, { bodyLift: 0, ground: 0 }), mover: mv(dist, 1) });
  const a = criarAnimacao({ nome: o.nome || "pulo" + est[0].toUpperCase() + est.slice(1), duracao: t2 + 0.6, modo: "relativa", curva: "suave", pesFixos: true, escalarPeloCorpo: true, chaves: ch,
    tags: ["Locomocao/Salto/" + est[0].toUpperCase() + est.slice(1)], descricao: "pulo " + est + ": " + Math.round(h * 100) + " cm de altura" + (dist ? ", " + dist.toFixed(1) + " m" : "") + " · voo " + T.toFixed(2) + " s (gravidade)" });
  if (est !== "corrida") return a;
  /* com corrida: dois passos correndo e então o pulo */
  const corrida = pdCiclo(lcPose("correndo"), { corre: true, loop: false, nome: "corrida" });
  return pdJuntar([corrida, a], { mistura: 0.08, nome: o.nome || "puloCorrida" });
}

/* ===================== água ===================== */
/* a peça de água onde a pessoa está (superfície = topo da peça) */
function lcAguaEm(x, z) { for (const o of SCN.objetos || []) { if (o.tipo !== "agua" && o.classe !== "agua") continue; const g = -(o.giro || 0) * Math.PI / 180, dx = x - o.x, dz = z - o.z, lx = dx * Math.cos(g) - dz * Math.sin(g), lz = dx * Math.sin(g) + dz * Math.cos(g);
    if (Math.abs(lx) <= (o.larg || 1) / 2 && Math.abs(lz) <= (o.prof || 1) / 2) return { obj: o, sup: (o.base || 0) + (o.alt || 0), fundo: o.base || 0 }; } return null; }
/* alturas do corpo no mundo: o meio (média das cápsulas do tronco, cabeça e pernas) e o chão (pés em pé, sem salto) */
function lcCaps(params) { const cs = capsulas(pMundo({ name: "_m", params })); return cs.caps || cs; }
function lcMeio(params) { const ys = lcCaps(params).filter(c => !/mao|dedo|braco|ante/i.test(c.nome || "")).map(c => (c.a[1] + c.b[1]) / 2); return ys.reduce((s0, y) => s0 + y, 0) / Math.max(1, ys.length); }
function lcChaoY(params) { const p = Object.assign({}, params, anPoseValores("empe", params), { bodyLift: 0, ground: 1, bodyPitch: 0, bodyRoll: 0 }); return Math.min(...lcCaps(p).map(c => Math.min(c.a[1], c.b[1]))); }
/* põe quem nada na linha da água: mede o meio do corpo já deitado (no meio da animação) e acerta a altura */
function lcNaLinhaDaAgua(it, an) {
  const A = lcAguaEm(it.params.wx || 0, it.params.wz || 0); if (!A) return null;
  it.params.ground = 0; it.params.bodyLift = 0;
  const tmp = { name: "_agua", params: Object.assign({}, it.params) }; aplicarAnimacao(tmp, an, an.duracao * 0.5, { base: { params: Object.assign({}, it.params) } });
  const alvo = lcChaoY(it.params) + A.sup - 0.06 * LC_M; it.params.bodyLift = Math.max(-2, (tmp.params.bodyLift || 0) - (tmp.params.bodyLift || 0) + (alvo - lcMeio(tmp.params))); return A;
}
/* até onde a água chega (frase para a legenda) */
function lcNivelAgua(it) {
  const Q = it.params, A = lcAguaEm(Q.wx || 0, Q.wz || 0); if (!A) return null;
  const H = 15.3 * (Q.tamanho || 1), pe = Q.ground === 0 ? (Q.bodyLift || 0) : 0, deitado = Math.abs(Q.bodyPitch || 0) > 55;
  if (deitado) { let meio = pe + 1; try { meio = lcMeio(Q) - lcChaoY(Q); } catch (e) { } return meio < A.sup - 0.35 * LC_M ? "submerso" : (Q.bodyPitch || 0) < -55 ? "boiando na água" : "nadando na água"; }
  const f = (A.sup - pe) / H; if (f <= 0) return null;
  return f < 0.1 ? "com a água nos tornozelos" : f < 0.3 ? "com a água até os joelhos" : f < 0.46 ? "com a água até as coxas" : f < 0.62 ? "com a água até a cintura" : f < 0.77 ? "com a água até o peito" : f < 0.88 ? "com a água até o pescoço" : "submerso";
}

/* ===================== mergulhar ===================== */
function lcMergulho(o = {}) {
  const alt = (o.altura ?? 0.3) * LC_M, fundo = (o.fundo ?? 1) * LC_M, dois = v => { const r = {}; for (const [k, x] of Object.entries(v)) { if (/^(knee|hip|ankle|arm|elbow)/.test(k)) { r[k + "L"] = x; r[k + "R"] = x; } else r[k] = x; } return r; };
  const z = dois({ kneeFlex: 0, hipFlex: 0, ankleFlex: 0, armFlex: 0, armAbd: 0, elbow: 0, spineFlex: 0, headPitch: 0 });
  const prep = dois({ kneeFlex: 42, hipFlex: 50, ankleFlex: -15, armFlex: 172, armAbd: -4, elbow: 0, spineFlex: 35, headPitch: 22 });
  const imp = dois({ kneeFlex: 0, hipFlex: 10, ankleFlex: 38, armFlex: 175, armAbd: -4, elbow: 0, spineFlex: 10, headPitch: 18 });
  const corpo = (p, l) => ({ bodyPitch: p, bodyLift: l, ground: -1 });
  const ch = [{ t: 0, valores: Object.assign({}, z, corpo(0, 0), { ground: 0 }), mover: { frente: 0, lado: 0, giro: 0 } }, { t: 0.45, valores: Object.assign({}, prep, corpo(0, 0), { ground: 0 }), mover: { frente: 0, lado: 0, giro: 0 } }, { t: 0.62, valores: Object.assign({}, imp, corpo(18, 0)), mover: { frente: 0.15, lado: 0, giro: 0 } }];
  const T = 0.62, voo = 0.55 + Math.sqrt(alt / LC_M) * 0.25; for (let i = 1; i <= 6; i++) { const u = i / 6; ch.push({ t: +(T + voo * u).toFixed(4), valores: Object.assign({}, imp, corpo(18 + 100 * u * u, 0.35 * LC_M * 4 * u * (1 - u) * (1 - u) - alt * u * u - (u === 1 ? 0.3 * LC_M : 0))), mover: { frente: 1.6 * u, lado: 0, giro: 0 }, curva: "linear" }); }
  const t2 = T + voo; ch.push({ t: +(t2 + 0.45).toFixed(4), valores: Object.assign({}, imp, corpo(108, -alt - fundo * 0.7)), mover: { frente: 2.6, lado: 0, giro: 0 } }, { t: +(t2 + 1.3).toFixed(4), valores: Object.assign({}, imp, corpo(90, -alt - fundo * 0.35)), mover: { frente: 4.0, lado: 0, giro: 0 } });
  return criarAnimacao({ nome: o.nome || "mergulhar", duracao: t2 + 1.3, modo: "relativa", curva: "suave", pesFixos: true, escalarPeloCorpo: true, chaves: ch, tags: ["Agua/Mergulho", "Locomocao/Salto"], descricao: "mergulho de cabeça da borda (" + Math.round(alt / LC_M * 100) + " cm acima da água)" });
}

/* ===================== nadar ===================== */
const LC_NADO = {
  crawl: { dur: 1.2, anda: 1.5, pitch: 90, f: p => { const braco = q => ({ armFlex: lcCurva([[0, 175], [0.25, 110], [0.5, 20], [0.75, 95], [1, 175]], q), elbow: lcCurva([[0, 10], [0.25, 45], [0.5, 10], [0.75, 100], [1, 10]], q), armAbd: lcCurva([[0, 5], [0.5, 10], [0.75, 35], [1, 5]], q) });
      const R = braco(p), L = braco(p + 0.5), k = Math.sin(2 * Math.PI * 3 * p);
      return { armFlexR: R.armFlex, elbowR: R.elbow, armAbdR: R.armAbd, armFlexL: L.armFlex, elbowL: L.elbow, armAbdL: L.armAbd, bodyRoll: 32 * Math.sin(2 * Math.PI * p), headYaw: lcCurva([[0, 0], [0.38, 0], [0.5, -55], [0.62, -55], [0.75, 0], [1, 0]], p), headPitch: -12,
        hipFlexL: 12 * k, hipFlexR: -12 * k, kneeFlexL: 8 + 8 * Math.max(0, k), kneeFlexR: 8 + 8 * Math.max(0, -k), ankleFlexL: 40, ankleFlexR: 40 }; } },
  peito: { dur: 1.4, anda: 1.2, pitch: 85, f: p => { const af = lcCurva([[0, 175], [0.3, 150], [0.5, 80], [0.65, 120], [0.8, 175], [1, 175]], p), ab = lcCurva([[0, 0], [0.3, 60], [0.5, 30], [0.65, 0], [1, 0]], p), el = lcCurva([[0, 0], [0.3, 20], [0.5, 110], [0.65, 120], [0.8, 0], [1, 0]], p);
      const hf = lcCurva([[0, 0], [0.45, 45], [0.7, 15], [0.85, 0], [1, 0]], p), kf = lcCurva([[0, 0], [0.45, 120], [0.7, 30], [0.85, 0], [1, 0]], p), ha = lcCurva([[0, 0], [0.45, 25], [0.7, 40], [0.85, 0], [1, 0]], p), an = lcCurva([[0, 35], [0.45, -20], [0.7, -15], [0.85, 35], [1, 35]], p);
      return { armFlexR: af, armFlexL: af, armAbdR: ab, armAbdL: ab, elbowR: el, elbowL: el, headPitch: lcCurva([[0, -5], [0.5, -38], [0.65, -30], [0.8, -5], [1, -5]], p), spineFlex: lcCurva([[0, 0], [0.5, -15], [0.8, 0], [1, 0]], p),
        hipFlexL: hf, hipFlexR: hf, kneeFlexL: kf, kneeFlexR: kf, hipAbdL: ha, hipAbdR: ha, hipRotL: ha * 0.8, hipRotR: ha * 0.8, ankleFlexL: an, ankleFlexR: an }; } },
  costas: { dur: 1.3, anda: -1.3, pitch: -90, f: p => { const braco = q => ({ armFlex: lcCurva([[0, 175], [0.25, 120], [0.5, 0], [0.75, 90], [1, 175]], q), armAbd: lcCurva([[0, 0], [0.25, 70], [0.5, 15], [0.75, 0], [1, 0]], q), elbow: lcCurva([[0, 0], [0.25, 60], [0.5, 0], [1, 0]], q) });
      const R = braco(p), L = braco(p + 0.5), k = Math.sin(2 * Math.PI * 3 * p);
      return { armFlexR: R.armFlex, armAbdR: R.armAbd, elbowR: R.elbow, armFlexL: L.armFlex, armAbdL: L.armAbd, elbowL: L.elbow, bodyRoll: 22 * Math.sin(2 * Math.PI * p), headPitch: 10,
        hipFlexL: 12 * k, hipFlexR: -12 * k, kneeFlexL: 10 + 10 * Math.max(0, k), kneeFlexR: 10 + 10 * Math.max(0, -k), ankleFlexL: 40, ankleFlexR: 40 }; } },
  cachorrinho: { dur: 1.0, anda: 0.45, pitch: 50, f: p => { const s = Math.sin(2 * Math.PI * p), c = Math.cos(2 * Math.PI * p);
      return { headPitch: -40, neckFlex: -18, armFlexR: 85 + 25 * s, elbowR: 65 - 25 * c, armFlexL: 85 - 25 * s, elbowL: 65 + 25 * c, hipFlexL: 40 + 20 * s, kneeFlexL: 60 + 30 * s, hipFlexR: 40 - 20 * s, kneeFlexR: 60 - 30 * s }; } },
  boia: { dur: 3, anda: 0, pitch: -88, f: p => ({ armAbdR: 60, armAbdL: 60, hipAbdL: 15, hipAbdR: 15, spineFlex: -3 + 2 * Math.sin(2 * Math.PI * p), headPitch: 8 }) },
  pernada: { dur: 1.0, anda: 0.6, pitch: 90, f: p => { const k = Math.sin(2 * Math.PI * 3 * p); return { armFlexR: 175, armFlexL: 175, elbowR: 5, elbowL: 5, headPitch: -15, hipFlexL: 14 * k, hipFlexR: -14 * k, kneeFlexL: 10 + 10 * Math.max(0, k), kneeFlexR: 10 + 10 * Math.max(0, -k), ankleFlexL: 40, ankleFlexR: 40 }; } }
};
function lcNadoCiclo(estilo) { const E = LC_NADO[estilo]; if (!E) throw new Error("Nado: " + Object.keys(LC_NADO).join(", ") + ".");
  return lcCiclo("nadar" + estilo[0].toUpperCase() + estilo.slice(1), E.dur, 12, p => Object.assign({ bodyPitch: E.pitch, ground: -1 }, E.f(p)), { anda: E.anda, tags: ["Agua/Nado/" + estilo[0].toUpperCase() + estilo.slice(1)], desc: "nado " + estilo + " (loop, " + Math.abs(E.anda).toFixed(1) + " m por ciclo)" }); }
/* nadar uma distância: entra na posição e repete o ciclo */
function lcNadar(estilo, o = {}) {
  const c = lcNadoCiclo(estilo), E = LC_NADO[estilo], dist = o.distancia ?? Math.abs(E.anda) * 2, n = E.anda ? Math.max(1, Math.round(dist / Math.abs(E.anda))) : Math.max(1, Math.round((o.duracao || 3) / E.dur));
  const v0 = c.chaves[0].valores, entra = criarAnimacao({ nome: "entra", duracao: 0.4, modo: "relativa", chaves: [{ t: 0, valores: Object.fromEntries(Object.keys(v0).map(k => [k, 0])), mover: { frente: 0, lado: 0, giro: 0 } }, { t: 0.4, valores: v0, mover: { frente: 0, lado: 0, giro: 0 } }] });
  const a = pdJuntar([entra, pdRepetir(Object.assign({}, c, { loop: false }), n)], { mistura: 0, nome: o.nome || "nada" + estilo[0].toUpperCase() + estilo.slice(1) });
  return Object.assign(a, { tags: c.tags, descricao: "nada " + estilo + (E.anda ? " " + (Math.abs(E.anda) * n).toFixed(1) + " m" : ""), pesFixos: false });
}

/* ===================== chão: engatinhar, rastejar, andar agachado ===================== */
function lcEngatinharCiclo() { return pdCiclo(lcPose("engatinhando"), { nome: "engatinhar", duracao: 1.3, anda: 0.6, tags: ["Locomocao/Chao/Engatinhar"] }); }
function lcRastejarCiclo() { const base = lcPose("deBrucos"), A = Object.assign({}, base, { armFlexR: 165, elbowR: 105, armAbdR: 20, armFlexL: 120, elbowL: 125, armAbdL: 30, hipFlexL: 45, hipAbdL: 35, kneeFlexL: 75, hipRotL: 25, hipFlexR: 0, kneeFlexR: 5, headPitch: -25 });
  const c = pdCiclo(A, { nome: "rastejar", duracao: 1.8, anda: 0.5, tags: ["Locomocao/Chao/Rastejar"] }); c.travarPes = false; return c; }
function lcAgachadoCiclo() { const A = Object.assign({}, lcPose("caminhando")); for (const l of ["L", "R"]) { A["kneeFlex" + l] = (A["kneeFlex" + l] || 0) + 55; A["hipFlex" + l] = (A["hipFlex" + l] || 0) + 40; A["ankleFlex" + l] = (A["ankleFlex" + l] || 0) - 18; } A.spineFlex = (A.spineFlex || 0) + 28; A.headPitch = -20;
  return pdCiclo(A, { nome: "andarAgachado", duracao: 1.2, anda: 0.9, tags: ["Locomocao/Andar/Agachado"] }); }
function lcPorDistancia(c, dist, nome) { const anda = Math.abs(c.chaves[c.chaves.length - 1].mover ? c.chaves[c.chaves.length - 1].mover.frente : 1) || 1, n = Math.max(1, Math.round(dist / anda)); return Object.assign(pdRepetir(Object.assign({}, c, { loop: false }), n, { nome }), { travarPes: c.travarPes }); }

/* ===================== cair, levantar, rolar ===================== */
function lcCair(dir = "frente", o = {}) {
  const v = lcPose, [meio, fim, fr] = { frente: ["quedaDeFrente", "deBrucos", 0.9], tras: ["quedaDeCostas", "deitadoCostas", -0.7], lado: ["caindo", "deitadoLado", 0] }[dir] || ["quedaDeFrente", "deBrucos", 0.9];
  return criarAnimacao({ nome: o.nome || "cair" + dir[0].toUpperCase() + dir.slice(1), duracao: 1.0, modo: "absoluta", curva: "entrada", pesFixos: true, escalarPeloCorpo: true, tags: ["Reacao/Queda"], descricao: "cai para " + dir,
    chaves: [{ t: 0, valores: v("empe"), mover: { frente: 0, lado: 0, giro: 0 } }, { t: 0.45, valores: v(meio), mover: { frente: fr * 0.5, lado: dir === "lado" ? 0.3 : 0, giro: 0 } }, { t: 1.0, valores: v(fim), mover: { frente: fr, lado: dir === "lado" ? 0.5 : 0, giro: 0 }, curva: "saida" }] });
}
function lcLevantar(de = "brucos", o = {}) {
  const v = lcPose, seq = de === "costas" ? ["deitadoCostas", "sentadoChao", "umJoelho", "empe"] : ["deBrucos", "quatroApoios", "levantandoDeQuatro", "umJoelho", "empe"], d = 0.55;
  return criarAnimacao({ nome: o.nome || "levantarDe" + (de === "costas" ? "Costas" : "Brucos"), duracao: d * (seq.length - 1), modo: "absoluta", curva: "suave", pesFixos: true, tags: ["Postura/Levantar"], descricao: "do chão (" + de + ") até em pé", chaves: seq.map((n, i) => ({ t: d * i, valores: v(n) })) });
}
function lcRolar(sentido = "direita", voltas = 1, o = {}) {
  const base = lcPose("deitadoCostas"), s = sentido === "direita" ? -1 : 1, n = Math.max(1, Math.round(voltas * 4)), ch = [], d = 0.35;
  for (let i = 0; i <= n; i++) { let ang = (s * 90 * i) % 360; if (ang > 180) ang -= 360; if (ang <= -180) ang += 360; const v = Object.assign({}, base, { bodyRoll: (base.bodyRoll || 0) + ang, armFlexL: 170, armFlexR: 170, elbowL: 0, elbowR: 0 });
    /* passar de +180 para −180 é a mesma posição: duas chaves quase juntas evitam a volta para trás */
    if (i && Math.abs(ang - ch[ch.length - 1].valores.bodyRoll) > 180) { const prev = ch[ch.length - 1]; ch.push({ t: +(prev.t + d / 2).toFixed(4), valores: Object.assign({}, v, { bodyRoll: s > 0 ? 179.9 : -179.9 }), mover: { frente: 0, lado: s * 0.26 * (i - 0.5), giro: 0 }, curva: "linear" }); ch.push({ t: +(prev.t + d / 2 + 0.001).toFixed(4), valores: Object.assign({}, v, { bodyRoll: s > 0 ? -179.9 : 179.9 }), mover: { frente: 0, lado: s * 0.26 * (i - 0.5), giro: 0 }, curva: "linear" }); }
    ch.push({ t: +(d * i).toFixed(4), valores: v, mover: { frente: 0, lado: s * 0.26 * i, giro: 0 }, curva: "linear" }); }
  return criarAnimacao({ nome: o.nome || "rolar" + (s < 0 ? "Direita" : "Esquerda"), duracao: d * n, modo: "absoluta", curva: "linear", pesFixos: true, tags: ["Locomocao/Chao/Rolar"], descricao: "rola " + voltas + " volta(s) para a " + sentido, chaves: ch });
}

function registrarLocomocao() {
  const L = {}, add = a => { L[a.nome] = Object.assign(a, { origem: "pronta", versao: 0 }); };
  for (const e of Object.keys(LC_PULOS)) add(lcPulo({ estilo: e }));
  add(lcMergulho()); for (const e of Object.keys(LC_NADO)) add(lcNadoCiclo(e));
  add(lcEngatinharCiclo()); add(lcRastejarCiclo()); add(lcAgachadoCiclo());
  for (const d of ["frente", "tras", "lado"]) add(lcCair(d)); add(lcLevantar("brucos")); add(lcLevantar("costas")); add(lcRolar("direita")); add(lcRolar("esquerda"));
  return L;
}
registrarProntas(registrarLocomocao);
export { lcPulo, lcMergulho, lcNadoCiclo, lcNadar, lcEngatinharCiclo, lcRastejarCiclo, lcAgachadoCiclo, lcPorDistancia, lcCair, lcLevantar, lcRolar, lcAguaEm, lcNaLinhaDaAgua, lcNivelAgua, registrarLocomocao, LC_NADO, LC_PULOS };
void anSemCamera;
