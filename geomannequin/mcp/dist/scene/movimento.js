/* GeoMannequin — movimentos com os pés de verdade: girar no lugar (passos, pivô, luta, salto; até 360° e além), andar até um
   ponto (vira com passos, anda com passadas do tamanho do corpo, desvia de objeto) e "pés presos" (o pé de apoio não escorrega).
   Ordem do corpo ao virar: olhos e cabeça antecipam → ombros/tronco → pelve → pés. O pé de apoio fica parado: o corpo gira em
   volta dele e a coxa gira ao contrário (hipRot) para a sola não arrastar. Unidades: graus, metros (frente/lado no sistema do começo). */
import { SCN } from "./modelo.js";
import { pMundo } from "./colisoes.js";
import { capsulas } from "../engine/index.js";
import { criarAnimacao, anPoseValores, anSemCamera, bibliotecaAnimacoes, registrarProntas } from "./animacao.js";

const MV_M = 1 / 0.114;
/* rotação no plano do chão, no sistema do começo (x = lado/esquerda, z = frente): mesma convenção do wRot */
const mvRot = (th, p) => { const c = Math.cos(th * Math.PI / 180), s = Math.sin(th * Math.PI / 180); return [p[0] * c + p[1] * s, -p[0] * s + p[1] * c]; };
const PE_L = [0.11, 0], PE_R = [-0.11, 0]; /* pés no corpo (m): esquerdo em +x, direito em −x */
/* pés no mundo (R): calcanhar e ponta de cada pé, e a altura */
function pesDoManequim(it) {
  const cs = capsulas(pMundo(it)).caps || capsulas(pMundo(it)), pe = n => cs.find(c => c.nome === n);
  const f = c => c ? { x: (c.a[0] + c.b[0]) / 2, z: (c.a[2] + c.b[2]) / 2, y: Math.min(c.a[1], c.b[1]), calc: c.a, ponta: c.b } : null;
  return { L: f(pe("peE")), R: f(pe("peD")) };
}
/* pés presos: o pé de apoio (dito pela animação — chave.apoio — ou o mais baixo) não sai do lugar; o corpo é que se ajusta */
function apoioNoTempo(a, t) { let r = null; for (const c of a.chaves || []) { if (c.t > t + 1e-6) break; if (c.apoio) r = c.apoio; } return r; }
function travarPes(it, mem, o = {}) {
  const p = pesDoManequim(it); if (!p.L || !p.R) return mem;
  const yMin = Math.min(p.L.y, p.R.y), apoio = o.apoio === "L" || o.apoio === "R" ? o.apoio : o.apoio === "ambos" && mem && mem.lado ? mem.lado : Math.abs(p.L.y - p.R.y) < (o.empate ?? 0.15) ? (mem && mem.lado) || "L" : p.L.y < p.R.y ? "L" : "R";
  if (mem && mem.lado === apoio && mem.pos && !(it.params.bodyLift > 0.5)) {
    const dx = mem.pos[0] - p[apoio].x, dz = mem.pos[1] - p[apoio].z;
    if (Math.hypot(dx, dz) < (o.maxCorrecao ?? 4)) { it.params.wx += dx; it.params.wz += dz; mem.acc = [(mem.acc ? mem.acc[0] : 0) + dx, (mem.acc ? mem.acc[1] : 0) + dz]; return Object.assign(mem, { y: yMin }); }
  }
  return { lado: apoio, pos: [p[apoio].x, p[apoio].z], acc: mem ? mem.acc : [0, 0], y: yMin };
}

/* onde fica cada pé (m, no sistema do corpo) numa pose — com joelho dobrado, girar a coxa (hipRot) leva o pé junto */
const _peCache = new Map();
function peLocal(vals, lado) {
  const ch = lado + JSON.stringify(vals); if (_peCache.has(ch)) return _peCache.get(ch);
  let r = lado === "L" ? PE_L.slice() : PE_R.slice();
  try { const b = SCN.list[0] ? anSemCamera(SCN.list[0].params) : {}, emp = anPoseValores("empe", b), p = Object.assign({}, b, emp), out = {};
    for (const [k, v] of Object.entries(vals)) out[k] = (emp[k] || 0) + v;
    const it = { name: "_medida", params: Object.assign(p, out, { wx: 0, wz: 0, wRot: 0, bodyLift: 0, tamanho: 1 }) }, q = pesDoManequim(it)[lado];
    if (q && Number.isFinite(q.x)) r = [q.x / MV_M, q.z / MV_M]; } catch (e) { }
  if (_peCache.size > 5000) _peCache.clear(); _peCache.set(ch, r); return r;
}
/* ===== girar no lugar ===== */
/* angulo + = para a esquerda (anti-horário visto de cima com o norte para cima); estilo: passos | pivo | luta | salto */
function animacaoGiro(o = {}) { const a = animacaoGiro0(o);
  /* toda chave diz todos os parâmetros que a animação usa (o que não foi dito volta a 0 = pose de partida) — sem braço ou perna "presos" no fim */
  const ks = new Set(a.chaves.flatMap(c => Object.keys(c.valores))); a.chaves.forEach(c => ks.forEach(k => { if (!(k in c.valores)) c.valores[k] = 0; })); return a; }
function animacaoGiro0(o = {}) {
  const A = +o.angulo || 360, estilo = String(o.estilo || "passos").toLowerCase(), sg = Math.sign(A) || 1, nome = o.nome || "girar" + Math.abs(A) + (sg > 0 ? "E" : "D") + (estilo === "passos" ? "" : "_" + estilo);
  const chaves = [], add = (t, v, th, c, extra) => chaves.push(Object.assign({ t: +t.toFixed(3), valores: Object.assign({ headYaw: 0, spineTwist: 0, hipRotL: 0, hipRotR: 0, hipFlexL: 0, hipFlexR: 0, kneeFlexL: 0, kneeFlexR: 0, ankleFlexL: 0, ankleFlexR: 0, armFlexL: 0, armFlexR: 0 }, v), mover: { frente: +c[1].toFixed(4), lado: +c[0].toFixed(4), giro: +th.toFixed(2) } }, extra || {}));
  const s = { L: 1, R: -1 }; /* yaw do pé no mundo = θ + s·hipRot */
  const lim = estilo === "luta" ? 40 : (o.limiteQuadril ?? 22), hip = (lado, yawPe, th) => Math.max(-lim, Math.min(lim, s[lado] * (yawPe - th))); /* além disso o pé de apoio gira na bola do pé */
  if (estilo === "passos" || estilo === "luta") {
    const n = o.passos || Math.max(1, Math.ceil(Math.abs(A) / (estilo === "luta" ? 120 : 90))), ds = o.duracaoPasso || (estilo === "luta" ? 0.42 : 0.62), a = A / n;
    const base = estilo === "luta" ? { kneeFlexL: 32, kneeFlexR: 32, hipFlexL: 18, hipFlexR: 18, ankleFlexL: -12, ankleFlexR: -12 } : {};
    const lead = sg > 0 ? "L" : "R", trail = lead === "L" ? "R" : "L", P = { L: PE_L, R: PE_R };
    let th = 0, c = [0, 0], t = 0; const Y = { L: 0, R: 0 }, F = {};
    const pose = (th0, swing, lev, extra) => { const v = Object.assign({}, base); for (const l of ["L", "R"]) v["hipRot" + l] = hip(l, Y[l], th0) + (l === swing ? 0 : 0);
      if (swing && lev) { v["hipFlex" + swing] = (base["hipFlex" + swing] || 0) + 22 * lev; v["kneeFlex" + swing] = (base["kneeFlex" + swing] || 0) + 42 * lev; v["ankleFlex" + swing] = (base["ankleFlex" + swing] || 0) - 14 * lev; /* ponta do pé para cima: não raspa */ }
      return Object.assign(v, extra || {}); };
    { const v0 = pose(0, null, 0); F.L = peLocal(v0, "L"); F.R = peLocal(v0, "R"); add(0, v0, 0, c); }
    for (let i = 0; i < n; i++) {
      const fases = [[lead, trail, 0.6], [trail, lead, 0.4]]; /* [pé que pisa, pé de apoio, fração do ângulo] */
      for (const [ph, [sw, piv, fr]] of fases.entries()) {
        const th0 = th, th1 = th + a * fr, dur = ds * (ph ? 0.45 : 0.55);
        /* sub-chaves: o pé levanta quase no lugar (o corpo ainda não girou), gira no ar, chega ao lugar ainda no ar e então desce */
        const US = [0.18, 0.45, 0.75, 1], GIRO = [0.04, 0.4, 0.8, 1], YG = [0.45, 0.7, 0.9, 1], LEV = [0.6, 1, 0.75, 0.3], ANT = ph === 0 ? [1, 0.9, 0.6, 0.4] : [0.25, 0.25, 0.1, 0];
        const Y0 = Y[sw]; /* o pé livre sai da direção em que estava pisado e vai até a nova */
        for (let k = 0; k < 4; k++) { const u = US[k], thk = th0 + (th1 - th0) * GIRO[k];
          /* cabeça e tronco antecipam a virada (a cabeça chega antes) */
          const ant = Math.min(Math.abs(a), 35) * sg * ANT[k], tronco = ph === 0 ? Math.min(Math.abs(a) * 0.3, 14) * sg * (k < 3 ? 1 : 0.5) : 0;
          Y[sw] = Y0 + (th1 - Y0) * YG[k]; /* o calcanhar sai primeiro e o pé gira na ponta (bola do pé) */
          const braco = (sw === "L" ? 1 : -1) * 8 * Math.sin(Math.PI * u);
          const lev = LEV[k] * (estilo === "luta" ? 1.1 : 1);
          const v = pose(thk, sw, lev, Object.assign({ headYaw: ant, spineTwist: tronco, armFlexL: braco, armFlexR: -braco }, k === 0 ? { ["ankleFlex" + sw]: (base["ankleFlex" + sw] || 0) + 18 } : {})), cr = mvRot(thk, peLocal(v, piv)); c = [F[piv][0] - cr[0], F[piv][1] - cr[1]];
          add(t + dur * u, v, thk, c, { apoio: piv }); }
        const desce = estilo === "luta" ? 0.06 : 0.09, vd = pose(th1, sw, 0, { headYaw: ph === 0 ? Math.min(Math.abs(a), 35) * sg * 0.3 : 0, spineTwist: 0, armFlexL: 0, armFlexR: 0 }), cd = mvRot(th1, peLocal(vd, piv)); c = [F[piv][0] - cd[0], F[piv][1] - cd[1]];
        add(t + dur + desce, vd, th1, c, { apoio: sw }); /* já pousou: o próximo apoio é ele */
        th = th1; const ps = mvRot(th1, peLocal(vd, sw)); F[sw] = [c[0] + ps[0], c[1] + ps[1]]; Y[sw] = th1; Y[piv] = th1 + s[piv] * hip(piv, Y[piv], th1); /* o pé de apoio que girou na bola do pé fica na direção em que parou */ t += dur + desce;
      }
    }
    { const vf = Object.assign(pose(th, null, 0), { hipRotL: 0, hipRotR: 0 }), pf = mvRot(th, peLocal(vf, lead === "L" ? "R" : "L")); const lst = lead === "L" ? "R" : "L"; add(t + 0.15, vf, th, [F[lst][0] - pf[0], F[lst][1] - pf[1]], { apoio: "ambos" }); }
    return criarAnimacao({ nome, duracao: t + 0.15, modo: "relativa", curva: "suave", pesFixos: true, travarPes: true, escalarPeloCorpo: true, tags: ["Locomocao/Virar/" + (estilo === "luta" ? "Luta" : "Passos")], descricao: "gira " + Math.abs(A) + "° para a " + (sg > 0 ? "esquerda" : "direita") + " com " + n + (n > 1 ? " passos" : " passo"), chaves });
  }
  if (estilo === "pivo" || estilo === "pirueta") {
    /* pivô na ponta do pé de apoio, a outra perna recolhida (passé); a cabeça fica presa num ponto e vira de uma vez */
    const piv = sg > 0 ? "R" : "L", liv = piv === "R" ? "L" : "R", P0 = piv === "R" ? PE_R : PE_L, voltas = Math.abs(A), dGiro = o.duracaoGiro || Math.max(0.5, voltas / 360 * 0.8);
    const braco = { armFlexL: 55, armFlexR: 55, armAbdL: -12, armAbdR: -12, elbowL: 75, elbowR: 75 }, passe = { ["hipFlex" + liv]: 65, ["hipAbd" + liv]: 35, ["hipRot" + liv]: 30 * (liv === "L" ? 1 : -1), ["kneeFlex" + liv]: 115, ["ankleFlex" + liv]: 30 };
    const prep = { kneeFlexL: 22, kneeFlexR: 22, hipFlexL: 10, hipFlexR: 10, armAbdL: 30, armAbdR: 30, armFlexL: 20, armFlexR: 20, elbowL: 20, elbowR: 20 }, ponta = { ["ankleFlex" + piv]: 28 };
    const cOf = th => { const r = mvRot(th, P0); return [P0[0] - r[0], P0[1] - r[1]]; };
    add(0, {}, 0, [0, 0]); add(0.3, prep, 0, [0, 0]); add(0.45, Object.assign({}, braco, passe, ponta), 0, [0, 0], { apoio: piv });
    const N = Math.max(4, Math.round(voltas / 30));
    for (let k = 1; k <= N; k++) { const th = A * k / N, olha = ((-th) % 360 + 540) % 360 - 180; /* cabeça fixa na direção inicial enquanto der */
      add(0.45 + dGiro * k / N, Object.assign({}, braco, passe, ponta, { headYaw: Math.max(-70, Math.min(70, olha)) }), th, cOf(th), { curva: "linear", apoio: piv }); }
    add(0.45 + dGiro + 0.25, prep, A, cOf(A), { apoio: "ambos" }); add(0.45 + dGiro + 0.55, {}, A, cOf(A));
    return criarAnimacao({ nome, duracao: 1 + dGiro, modo: "relativa", curva: "suave", pesFixos: true, escalarPeloCorpo: true, tags: ["Locomocao/Virar/Pivo", "Danca/Pirueta"], descricao: "pirueta de " + voltas + "° na ponta do pé", chaves });
  }
  if (estilo === "salto" || estilo === "pulo") {
    const dAr = o.duracaoGiro || 0.5;
    add(0, {}, 0, [0, 0]); add(0.25, { kneeFlexL: 55, kneeFlexR: 55, hipFlexL: 40, hipFlexR: 40, ankleFlexL: -15, ankleFlexR: -15, armFlexL: -20, armFlexR: -20 }, 0, [0, 0]);
    const ar = { kneeFlexL: 25, kneeFlexR: 25, hipFlexL: 20, hipFlexR: 20, ankleFlexL: 25, ankleFlexR: 25, armFlexL: 40, armFlexR: 40, armAbdL: -10, armAbdR: -10, elbowL: 80, elbowR: 80 };
    const N = Math.max(3, Math.round(Math.abs(A) / 45));
    for (let k = 1; k <= N; k++) { const u = k / N, th = A * u; add(0.25 + dAr * u, Object.assign({ bodyLift: 6 * Math.sin(Math.PI * Math.min(1, u * 1.05)) }, ar), th, [0, 0], { curva: "linear" }); }
    add(0.25 + dAr + 0.15, { kneeFlexL: 45, kneeFlexR: 45, hipFlexL: 30, hipFlexR: 30, ankleFlexL: -12, ankleFlexR: -12, bodyLift: 0 }, A, [0, 0]); add(0.25 + dAr + 0.5, { bodyLift: 0 }, A, [0, 0]);
    return criarAnimacao({ nome, duracao: 0.75 + dAr, modo: "relativa", curva: "suave", escalarPeloCorpo: true, tags: ["Locomocao/Virar/Salto", "Locomocao/Salto"], descricao: "giro de " + Math.abs(A) + "° no ar", chaves });
  }
  throw new Error("Estilo de giro: passos, pivo, luta ou salto.");
}

/* ===== andar até um ponto ===== */
/* destino em R no mundo; vira com passos se precisar, anda com passadas do tamanho do corpo, desvia do primeiro objeto no caminho */
function animacaoAndarAte(it, destino, o = {}) {
  const Q = it.params, tam = Q.tamanho || 1, g0 = Q.wRot || 0, dxW = destino[0] - (Q.wx || 0), dzW = destino[1] - (Q.wz || 0);
  const local = p => mvRot(-g0, [p[0] / MV_M, p[1] / MV_M]); /* mundo (R) → sistema do começo (m) */
  let pontos = [[0, 0], local([dxW, dzW])];
  /* desvio: o primeiro objeto alto entre a pessoa e o destino → contorna pelo lado mais curto */
  const obs = SCN.objetos.find(ob => { if (ob.chao || ob.tipo === "agua" || ob.alt < 3) return false; for (let k = 1; k < 10; k++) { const u = k / 10, x = (Q.wx || 0) + dxW * u, z = (Q.wz || 0) + dzW * u; if (Math.abs(x - ob.x) < (ob.larg || 2) / 2 + 2.5 && Math.abs(z - ob.z) < (ob.prof || 2) / 2 + 2.5) return true; } return false; });
  if (obs && o.desviar !== false) { const r = Math.max(obs.larg || 2, obs.prof || 2) / 2 + 4, nx = -dzW, nz = dxW, nl = Math.hypot(nx, nz) || 1, lado = ((obs.x - Q.wx) * nx + (obs.z - Q.wz) * nz) > 0 ? -1 : 1;
    const w1 = [obs.x + lado * nx / nl * r - (Q.wx || 0), obs.z + lado * nz / nl * r - (Q.wz || 0)]; pontos = [[0, 0], local(w1), local([dxW, dzW])]; }
  const passada = (o.passada || 0.68) * tam, ds = o.duracaoPasso || 0.5 / Math.sqrt(tam) * (o.correndo ? 0.6 : 1);
  const empe = anPoseValores("empe", Q), cam = anPoseValores(o.correndo ? "correndo" : "caminhando", Q), esp = {}; for (const [k, v] of Object.entries(cam)) { const m = /^(.*)(L|R)$/.exec(k); esp[m ? m[1] + (m[2] === "L" ? "R" : "L") : k] = /Side|Twist|Yaw|Roll/.test(k) && !m ? -v : v; }
  const delta = v => { const d = {}; for (const k of Object.keys(v)) if (!/^(wx|wz|wRot|bodyLift|bodyPitch|bodyRoll|ground)$/.test(k)) d[k] = (v[k] || 0) - (empe[k] || 0); return d; };
  const D0 = delta(empe), D1 = delta(cam), D2 = delta(esp), chaves = [], add = (t, v, mv) => chaves.push({ t: +t.toFixed(3), valores: Object.assign({}, v), mover: mv });
  let t = 0, th = 0, pos = [0, 0]; add(0, D0, { frente: 0, lado: 0, giro: 0 });
  for (let i = 1; i < pontos.length; i++) {
    const dx = pontos[i][0] - pos[0], dz = pontos[i][1] - pos[1], dist = Math.hypot(dx, dz); if (dist < 0.05) continue;
    const ang = Math.atan2(dx, dz) * 180 / Math.PI, giro = ((ang - th) % 360 + 540) % 360 - 180;
    if (Math.abs(giro) > 25) { const n = Math.max(1, Math.ceil(Math.abs(giro) / 90)), dt = 0.5 * n; for (let k = 1; k <= n; k++) { const u = k / n; add(t + dt * u, Object.assign({}, k % 2 ? D1 : D2, k === n ? D0 : {}), { frente: pos[1], lado: pos[0], giro: th + giro * u }); } t += dt; th += giro; }
    const n = Math.max(1, Math.round(dist / passada));
    for (let k = 1; k <= n; k++) { const u = k / n, p = [pos[0] + dx * u, pos[1] + dz * u]; add(t + ds * k, k === n && i === pontos.length - 1 ? D0 : (k % 2 ? D1 : D2), { frente: p[1], lado: p[0], giro: th }); }
    t += ds * n; pos = pontos[i];
  }
  add(t + 0.25, D0, { frente: pos[1], lado: pos[0], giro: th });
  return criarAnimacao({ nome: o.nome || "andarAte", duracao: t + 0.25, modo: "relativa", curva: "suave", travarPes: false, tags: ["Locomocao/Andar/AteUmPonto"], descricao: "anda " + Math.hypot(...pontos[pontos.length - 1]).toFixed(1) + " m" + (pontos.length > 2 ? " desviando de “" + (obs.nome || obs.tipo) + "”" : ""), chaves });
}
/* animações prontas de giro na biblioteca */
function registrarGiros() {
  const L = {}; for (const [A, e] of [[45, "passos"], [-45, "passos"], [90, "passos"], [-90, "passos"], [180, "passos"], [-180, "passos"], [360, "passos"], [-360, "passos"], [360, "pivo"], [-360, "pivo"], [360, "luta"], [-360, "luta"], [360, "salto"], [-360, "salto"], [720, "pivo"]]) {
    const a = animacaoGiro({ angulo: A, estilo: e }); L[a.nome] = Object.assign(a, { origem: "pronta", versao: 0 }); }
  return L;
}
registrarProntas(registrarGiros);
export { apoioNoTempo, pesDoManequim, travarPes, animacaoGiro, animacaoAndarAte, registrarGiros, mvRot };
void bibliotecaAnimacoes; void anSemCamera;
