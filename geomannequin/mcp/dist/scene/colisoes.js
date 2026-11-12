/* GeoMannequin — colisões entre manequins: detectar e corrigir, do jeito que o usuário escolher.
   Soluções: "distancia" (afastar no chão), "giro" (girar no chão), "pose" (corrigir só o braço/perna que entra
   no outro) e "auto" (testa as três e fica com a que muda menos). Quem muda: o manequim "a", o "b" ou os dois.
   Modos: "desligado", "avisar" (marca na tela e lista no painel), "corrigir" (corrige ao soltar o arraste),
   "bloquear" (ao arrastar, o manequim/mão para na superfície do outro). Sem depender da página (o MCP usa). */
import { SCN, setP, P, sceneList } from "./modelo.js";
import { guardArms } from "./poses.js";
import { MEMBRO, PARTES, capsulas, capsulasObjeto, colisaoEntreObjetos, TIPOS_OBJETO, telaDoMundo, clamp, contatosEntre, doMundo, ikArm, paraMundo, restGround, segSeg, shape, chainSetup, armPose, comp, applyA } from "../engine/index.js";

/* 1 R (unidade do manequim) ≈ 11,4 cm num corpo de 1,75 m */
const CM = 11.4;
const COL = { modo: "avisar", preferir: "auto", ultima: [], desfazer: null, composicao: false, ultimaComp: [] };
function setModoColisao(m) { if (!["desligado", "avisar", "corrigir", "bloquear"].includes(m)) throw new Error("Modo de colisão: use \"desligado\", \"avisar\", \"corrigir\" ou \"bloquear\"."); COL.modo = m; }
function setPreferir(m) { if (!["auto", "distancia", "giro", "pose"].includes(m)) throw new Error("Solução: use \"auto\", \"distancia\", \"giro\" ou \"pose\"."); COL.preferir = m; }

/* p no mundo de um manequim (com a altura do chão certa para a pose) */
function pMundo(it, params) {
  const pr = params || it.params, g0 = restGround(SCN.list[0] === it && params ? params : SCN.list[0].params);
  return Object.assign({}, pr, { wy: g0 - restGround(pr) });
}
const contatoPermitido = (a, b) => (a.contato || []).includes(b.id) || (b.contato || []).includes(a.id);
function visiveis() { return SCN.list.filter(it => !it.oculto); }
function chao() { return restGround(SCN.list[0].params); }
/* objetos da cena como cápsulas; o objeto em que o manequim está sentado/apoiado não conta */
function capsObjetos(it) { return SCN.objetos.filter(o => !it || it.apoioEm !== o.id).map(o => capsulasObjeto(o, chao())); }
function capsOutros(it) { return visiveis().filter(o => o !== it && !contatoPermitido(it, o)).map(o => capsulas(pMundo(o))).concat(capsObjetos(it)); }
function penet(it, params, outros) { const A = capsulas(pMundo(it, params)); let s = 0; for (const B of outros) for (const c of contatosEntre(A, B)) s += c.prof; return s; }

/* partes de mão do manequim que seguram este objeto (vínculo rígido V3 ou pegada antiga) */
function maosSegurando(it, o) {
  const out = [], nome = l => (l === 1 || l === "esquerda" || l === "L") ? "maoE" : "maoD";
  for (const g of [o.gripV3, o.grip]) {
    if (!g || (g.mannequinId !== undefined && g.mannequinId !== it.id)) continue;
    if (g.side !== undefined) out.push(nome(g.side));
    if (g.secundaria && g.secundaria.side !== undefined) out.push(nome(g.secundaria.side));
  }
  return out;
}
/* ===== detectar ===== */
function colisoesDaCena() {
  const vis = visiveis(), C = vis.map(it => capsulas(pMundo(it))), out = [];
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
    if (contatoPermitido(vis[i], vis[j])) continue;
    const cs = contatosEntre(C[i], C[j]);
    if (!cs.length) continue;
    const a = SCN.list.indexOf(vis[i]), b = SCN.list.indexOf(vis[j]), c0 = cs[0];
    /* a frase começa pelo membro que entra (mão no quadril, e não quadril na mão) */
    const troca = MEMBRO[c0.pb] && !MEMBRO[c0.pa];
    const [pa, na, pb, nb] = troca ? [c0.pb, vis[j].name, c0.pa, vis[i].name] : [c0.pa, vis[i].name, c0.pb, vis[j].name];
    out.push({ a, b, prof: c0.prof, contatos: cs,
      texto: PARTES[pa] + " de " + na + " entra em " + PARTES[pb] + " de " + nb + " (" + Math.max(1, Math.round(c0.prof * CM)) + " cm)" + (cs.length > 1 ? " · mais " + (cs.length - 1) + " ponto" + (cs.length > 2 ? "s" : "") : "") });
  }
  /* manequim × objeto (banco, parede…) */
  vis.forEach((it, i) => SCN.objetos.forEach((o, k) => {
    if (it.apoioEm === o.id) return;
    /* a pegada é um contato previsto: a mão que segura (principal ou secundária) não colide com o próprio objeto;
       o resto do corpo continua valendo (encosto na coxa, assento no peito…) */
    const maos = maosSegurando(it, o);
    const cs = contatosEntre(C[i], capsulasObjeto(o, chao())).filter(c => !maos.includes(c.pa)); if (!cs.length) return;
    const a = SCN.list.indexOf(it), nomeO = o.nome || TIPOS_OBJETO[o.tipo].nome;
    out.push({ a, b: -1, objeto: k, prof: cs[0].prof, contatos: cs, texto: PARTES[cs[0].pa] + " de " + it.name + " entra em " + nomeO + " (" + Math.max(1, Math.round(cs[0].prof * CM)) + " cm)" + (cs.length > 1 ? " · mais " + (cs.length - 1) + " ponto" + (cs.length > 2 ? "s" : "") : "") });
  }));
  /* objeto × objeto (a mesa e a cadeira, o copo e a parede…); quem está em cima de outro não conta como colisão com ele */
  const objs = SCN.objetos, g0 = chao();
  for (let k = 0; k < objs.length; k++) for (let j = k + 1; j < objs.length; j++) {
    const A = objs[k], B = objs[j]; if (A.sobre === B.id || B.sobre === A.id) continue;
    const cs = colisaoEntreObjetos(A, B, g0); if (!cs.length) continue;
    out.push({ a: -1, b: -1, objeto: k, objeto2: j, prof: cs[0].prof, contatos: cs, texto: nomeObj(A) + " entra em " + nomeObj(B) + " (" + Math.max(1, Math.round(cs[0].prof * CM)) + " cm)" });
  }
  COL.ultima = out;
  return out;
}
const nomeObj = o => o.nome || TIPOS_OBJETO[o.tipo].nome;
/* objeto: empurra no chão para fora dos outros objetos e dos manequins (o apoio dele não conta) */
function separarObjeto(o, max) {
  const g0 = chao(); let mov = 0;
  for (let it = 0; it < 24; it++) {
    let vx = 0, vz = 0, pm = 0; const mine = capsulasObjeto(o, g0);
    SCN.objetos.forEach(b => { if (b === o || b.sobre === o.id || o.sobre === b.id) return; colisaoEntreObjetos(o, b, g0, 0).forEach(c => { const d = c.plano + 0.06; vx += c.n[0] * d; vz += c.n[2] * d; pm = Math.max(pm, c.prof); }); });
    visiveis().forEach(m => { if (m.apoioEm === o.id) return; contatosEntre(mine, capsulas(pMundo(m)), 0).forEach(c => { const d = c.prof + 0.06, L = Math.hypot(c.n[0], c.n[2]) || 1; vx += c.n[0] / L * d; vz += c.n[2] / L * d; pm = Math.max(pm, c.prof); }); });
    if (pm <= 0.03) break;
    const L = Math.hypot(vx, vz); if (L < 1e-6) { vx = 1; vz = 0; }
    const st = Math.min(L || 1, 3); o.x += vx / (L || 1) * st; o.z += vz / (L || 1) * st; mov += st;
    SCN.objetos.forEach(c => { if (c.sobre === o.id) { c.x += vx / (L || 1) * st; c.z += vz / (L || 1) * st; } });
    if (max && mov > max) break;
  }
  o.x = Math.round(o.x * 100) / 100; o.z = Math.round(o.z * 100) / 100;
  return mov;
}
/* corrige objeto × objeto: muda o mais novo (o último colocado), a não ser que se diga qual */
function resolverObjetos(k, j, qual) {
  const o = SCN.objetos[qual === "a" ? k : j] || SCN.objetos[j]; if (!o) throw new Error("Objeto não encontrado.");
  const x0 = o.x, z0 = o.z; separarObjeto(o);
  const d = Math.hypot(o.x - x0, o.z - z0);
  return [nomeObj(o) + (d > 0.01 ? ": afastado " + Math.round(d * CM) + " cm" : ": nada para corrigir")];
}
/* corrige manequim × objeto: só o manequim muda */
function resolverObjeto(a, k, metodo) {
  metodo = metodo || COL.preferir; const it = SCN.list[a]; if (!it) throw new Error("Manequim não encontrado.");
  guardarDesfazer([it]);
  const outros = capsOutros(it), p0 = penet(it, it.params, outros); if (p0 <= 0) return ["Nada para corrigir."];
  const r = metodo === "auto" ? solAuto(it, outros) : SOL[metodo](it, outros);
  if (r.resto > 0.01 && r.resto >= 0.5 * p0) return [it.name + ": " + ({ giro: "girar", pose: "ajustar a pose", distancia: "afastar" }[metodo] || metodo) + " não resolve — tente Afastar ou Automático"];
  aplicar(it, r.params); return [it.name + ": " + r.desc];
}
/* lista simples, em português (comandos e MCP) */
function listaColisoes() { return colisoesDaCena().map(c => c.objeto2 !== undefined ? { a: nomeObj(SCN.objetos[c.objeto]), b: nomeObj(SCN.objetos[c.objeto2]), cm: Math.round(c.prof * CM), descricao: c.texto, partes: ["objeto × objeto"] } : ({ a: SCN.list[c.a].name, b: c.objeto !== undefined ? (SCN.objetos[c.objeto].nome || SCN.objetos[c.objeto].tipo) : SCN.list[c.b].name, cm: Math.round(c.prof * CM), descricao: c.texto, partes: c.contatos.map(x => PARTES[x.pa] + " × " + (PARTES[x.pb] || (c.objeto !== undefined ? nomeObj(SCN.objetos[c.objeto]) : x.pb))) })); }

/* ===== soluções (cada uma devolve novos parâmetros e o "custo" da mudança, sem aplicar) ===== */
/* 1) distância: empurra no chão pela soma das direções de saída, até não haver penetração */
function solDistancia(it, outros) {
  const q = Object.assign({}, it.params); let movido = 0;
  for (let k = 0; k < 30; k++) {
    const A = capsulas(pMundo(it, q)); let vx = 0, vz = 0, pm = 0;
    for (const B of outros) for (const c of contatosEntre(A, B, 0.01)) { vx += c.n[0] * c.prof; vz += c.n[2] * c.prof; pm = Math.max(pm, c.prof); }
    if (pm <= 0) break;
    let L = Math.hypot(vx, vz);
    if (L < 1e-4) { /* direção vertical: afasta do centro dos outros */
      let cx = 0, cz = 0; outros.forEach(B => { cx += (B.lo[0] + B.hi[0]) / 2; cz += (B.lo[2] + B.hi[2]) / 2; });
      vx = q.wx - cx / outros.length; vz = q.wz - cz / outros.length; L = Math.hypot(vx, vz) || 1; if (L < 1e-4) { vx = 1; L = 1; }
    }
    const st = Math.min(1.5, pm + 0.04);
    q.wx = clamp(q.wx + vx / L * st, -30, 30); q.wz = clamp(q.wz + vz / L * st, -30, 30); movido += st;
  }
  let resto = penet(it, q, outros);
  if (resto > 0.01) {
    /* preso entre dois (um empurra para cá, o outro para lá): procura a direção com a menor saída livre */
    let best = null;
    for (let a = 0; a < 360; a += 15) {
      const dx = Math.cos(a * Math.PI / 180), dz = Math.sin(a * Math.PI / 180);
      for (let t = 0.1; t <= 8 && (!best || t < best.t); t += 0.1) {
        const c = Object.assign({}, it.params, { wx: clamp(it.params.wx + dx * t, -30, 30), wz: clamp(it.params.wz + dz * t, -30, 30) });
        if (penet(it, c, outros) <= 0) { best = { t, c }; break; }
      }
    }
    if (best) { Object.assign(q, { wx: best.c.wx, wz: best.c.wz }); movido = best.t; resto = 0; }
  }
  return { metodo: "distancia", params: q, resto, custo: movido * 12, desc: "afastar " + Math.round(Math.hypot(q.wx - it.params.wx, q.wz - it.params.wz) * CM) + " cm" };
}
/* 2) giro: menor rotação no chão que resolve (ou a que mais reduz) */
function solGiro(it, outros) {
  const base = penet(it, it.params, outros); let best = { a: 0, r: base };
  for (let a = 3; a <= 90; a += 3) for (const sg of [1, -1]) {
    const q = Object.assign({}, it.params, { wRot: ((it.params.wRot + sg * a + 180) % 360 + 360) % 360 - 180 }), r = penet(it, q, outros);
    if (r < best.r - 1e-4) best = { a: sg * a, r, q };
    if (r <= 0) return { metodo: "giro", params: q, resto: 0, custo: a * 0.25, desc: "girar " + (sg * a > 0 ? "+" : "") + sg * a + "°" };
  }
  return { metodo: "giro", params: best.q || Object.assign({}, it.params), resto: best.r, custo: Math.abs(best.a) * 0.25, desc: "girar " + best.a + "°" };
}
/* 3) pose: só os braços/pernas que entram no outro; tenta diminuir o balanço, dobrar o cotovelo/joelho,
   abrir/fechar o membro e, por fim, empurrar a mão para fora do outro corpo e refazer o braço por cinemática inversa */
const JUNTAS = { braco: s => ["armFlex", "armAbd", "armRot", "elbow"].map(k => k + (s > 0 ? "L" : "R")), perna: s => ["hipFlex", "hipAbd", "hipRot", "kneeFlex"].map(k => k + (s > 0 ? "L" : "R")) };
function mudancaJuntas(a, b) { let s = 0; for (const k in a) if (/^(arm|elbow|hip|knee|ankle)/.test(k) && typeof a[k] === "number") s += Math.abs((b[k] || 0) - a[k]); return s; }
function comGuarda(q) { const prev = P; setP(q); try { guardArms(); } finally { setP(prev); } return q; }
function solPose(it, outros) {
  const A0 = capsulas(pMundo(it)), membros = new Map();
  for (const B of outros) for (const c of contatosEntre(A0, B)) { const m = MEMBRO[c.pa]; if (m) membros.set(m[0] + m[1], m); }
  if (!membros.size) return { metodo: "pose", params: Object.assign({}, it.params), resto: penet(it, it.params, outros), custo: 0, desc: "a pose não resolve (o contato é no tronco ou na cabeça)", impossivel: true };
  let q = Object.assign({}, it.params);
  for (const [tipo, s] of membros.values()) {
    const L = s > 0 ? "L" : "R", cand = [];
    if (tipo === "braco") {
      for (const t of [0.75, 0.5, 0.25, 0]) cand.push({ ["armFlex" + L]: q["armFlex" + L] * t });
      for (const d of [20, 40, 60, 90]) cand.push({ ["elbow" + L]: clamp(q["elbow" + L] + d, 0, 150) });
      for (const d of [-25, -12, 12, 25, 40]) cand.push({ ["armAbd" + L]: clamp(q["armAbd" + L] + d, -45, 170) });
      for (const t of [0.5, 0]) for (const d of [30, 60]) cand.push({ ["armFlex" + L]: q["armFlex" + L] * t, ["elbow" + L]: clamp(q["elbow" + L] + d, 0, 150) });
      /* mão empurrada para fora do outro corpo + cinemática inversa */
      const pw = pMundo(it, q), S = shape(q), ch = chainSetup(pw, S), ap = armPose(pw, ch.F, s), Ah = comp(ch.A2, ap.hand);
      const M = paraMundo(pw), Mi = doMundo(pw); let w = M(Ah.T);
      for (let k = 0; k < 4; k++) for (const B of outros) for (const c of B.caps) { const r = segSeg(w, w, c.a, c.b), need = c.r + 0.45 - r.d; if (need > 0 && r.d > 1e-4) { const n = [(w[0] - r.q[0]) / r.d, (w[1] - r.q[1]) / r.d, (w[2] - r.q[2]) / r.d]; w = [w[0] + n[0] * need, w[1] + n[1] * need, w[2] + n[2] * need]; } }
      try { const ik = ikArm(q, S, s, Mi(w)); cand.push({ ["armAbd" + L]: ik.abd, ["armFlex" + L]: ik.flex, ["armRot" + L]: ik.rot, ["elbow" + L]: ik.elbow }); } catch (e) { }
    } else {
      for (const t of [0.75, 0.5, 0.25, 0]) cand.push({ ["hipFlex" + L]: q["hipFlex" + L] * t });
      for (const d of [-10, 10, 20]) cand.push({ ["hipAbd" + L]: clamp(q["hipAbd" + L] + d, -30, 45) });
      for (const d of [20, 40]) cand.push({ ["kneeFlex" + L]: clamp(q["kneeFlex" + L] + d, 0, 150) });
    }
    let best = null;
    for (const c of cand) {
      const t = comGuarda(Object.assign({}, q, c)), r = penet(it, t, outros), custo = mudancaJuntas(it.params, t) * 0.12;
      const val = r * 400 + custo;
      if (!best || val < best.val) best = { val, t, r };
    }
    if (best) q = best.t;
  }
  const resto = penet(it, q, outros), mud = mudancaJuntas(it.params, q);
  return { metodo: "pose", params: q, resto, custo: mud * 0.12, desc: "ajustar a pose (" + Math.round(mud) + "° nas articulações)" };
}
const SOL = { distancia: solDistancia, giro: solGiro, pose: solPose };
/* automático: testa as três; fica com a que zera a penetração mudando menos; se nenhuma zera, completa afastando */
function solAuto(it, outros) {
  const rs = ["pose", "giro", "distancia"].map(m => SOL[m](it, outros)).filter(r => !r.impossivel);
  rs.sort((x, y) => (x.resto * 400 + x.custo) - (y.resto * 400 + y.custo));
  let r = rs[0];
  if (r.resto > 0.01 && r.metodo !== "distancia") {
    const fake = Object.assign({}, it, { params: r.params }), d = solDistancia(fake, outros);
    r = { metodo: r.metodo + "+distancia", params: d.params, resto: d.resto, custo: r.custo + d.custo, desc: r.desc + " e " + d.desc };
  }
  r.desc = "automático: " + r.desc;
  return r;
}
/* ===== aplicar ===== */
function guardarDesfazer(its) { COL.desfazer = its.map(it => ({ it, params: Object.assign({}, it.params) })); }
function desfazerColisao() {
  if (!COL.desfazer) return false;
  COL.desfazer.forEach(({ it, params }) => { if (SCN.list.includes(it)) { Object.keys(it.params).forEach(k => delete it.params[k]); Object.assign(it.params, params); } });
  COL.desfazer = null; return true;
}
function aplicar(it, params) { Object.assign(it.params, params); }
/* corrige o par (a, b) — índices na cena; metodo: auto|distancia|giro|pose; quem: "a" | "b" | "ambos" */
function resolverPar(a, b, metodo, quem) {
  metodo = metodo || COL.preferir; quem = quem || "b";
  const A = SCN.list[a], B = SCN.list[b];
  if (!A || !B) throw new Error("Par de manequins não encontrado.");
  const its = quem === "a" ? [A] : quem === "ambos" ? [B, A] : [B];
  guardarDesfazer(its);
  const feitos = [];
  if (quem === "ambos" && metodo === "distancia") {
    /* os dois se afastam metade cada */
    const r = solDistancia(B, capsOutros(B)), dx = (r.params.wx - B.params.wx) / 2, dz = (r.params.wz - B.params.wz) / 2;
    B.params.wx += dx; B.params.wz += dz; A.params.wx -= dx; A.params.wz -= dz;
    feitos.push(B.name + " e " + A.name + ": afastar " + Math.round(Math.hypot(dx, dz) * 2 * CM) + " cm");
  } else for (const it of its) {
    const outros = capsOutros(it);
    if (penet(it, it.params, outros) <= 0) continue;
    const p0 = penet(it, it.params, outros), r = metodo === "auto" ? solAuto(it, outros) : SOL[metodo](it, outros);
    if (r.resto > 0.01 && r.resto >= 0.5 * p0) {
      /* não vale a pena: não muda nada e explica */
      feitos.push(it.name + ": " + (r.impossivel ? r.desc : ({ giro: "girar", pose: "ajustar a pose", distancia: "afastar" }[metodo] || metodo) + " não resolve") + " — tente mexer no outro manequim, Afastar ou Automático");
      continue;
    }
    aplicar(it, r.params);
    feitos.push(it.name + ": " + r.desc + (r.resto > 0.01 ? " (ainda encosta " + Math.round(r.resto * CM) + " cm)" : ""));
  }
  if (!feitos.length) feitos.push("Nada para corrigir.");
  return feitos;
}
/* quem deve mudar num par: quem tem o braço/perna entrando no outro (a pose dele resolve); senão o ativo; senão o mais novo */
function quemMexer(c) {
  if (c.objeto !== undefined) return "a";
  const k = c.contatos[0], la = !!MEMBRO[k.pa], lb = !!MEMBRO[k.pb];
  if (la && !lb) return "a"; if (lb && !la) return "b";
  return c.a === SCN.active ? "a" : "b";
}
/* corrige todos os conflitos da cena */
function resolverTodas(metodo) {
  const objMov = [], met = metodo || COL.preferir, antes = SCN.list.map(it => ({ it, params: Object.assign({}, it.params) })), mudados = new Set(), tentou = new Set();
  for (let rodada = 0; rodada < 10; rodada++) {
    const cs = colisoesDaCena(); if (!cs.length) break;
    let mexeu = false;
    for (const c of cs) {
      if (c.objeto2 !== undefined) { const o = SCN.objetos[c.objeto2]; if (!tentou.has(o)) { tentou.add(o); const x0 = o.x, z0 = o.z; separarObjeto(o); if (o.x !== x0 || o.z !== z0) { objMov.push([o, x0, z0]); mexeu = true; } } continue; }
      const quem = quemMexer(c), it = SCN.list[quem === "a" || c.objeto !== undefined ? c.a : c.b];
      const outros = capsOutros(it), p0 = penet(it, it.params, outros); if (p0 <= 0) continue;
      const r = met === "auto" ? solAuto(it, outros) : SOL[met](it, outros);
      tentou.add(it);
      /* só aplica se resolve, ou se pelo menos reduz bem (senão a mudança não vale a pena) */
      if (r.resto <= 0.01 || r.resto < 0.5 * p0) { aplicar(it, r.params); mudados.add(it); mexeu = true; }
    }
    if (!mexeu) break;
  }
  COL.desfazer = antes.filter(x => mudados.has(x.it));
  /* resumo: o que mudou em cada manequim (comparando com antes) */
  const feitos = [];
  for (const { it, params } of COL.desfazer) {
    const d = Math.hypot(it.params.wx - params.wx, it.params.wz - params.wz), g = Math.abs(it.params.wRot - params.wRot), j = mudancaJuntas(params, it.params), partes = [];
    if (d > 0.01) partes.push("afastado " + Math.round(d * CM) + " cm"); if (g > 0.5) partes.push("girado " + Math.round(g) + "°"); if (j > 0.5) partes.push("pose ajustada (" + Math.round(j) + "° nas articulações)");
    feitos.push(it.name + ": " + (partes.join(", ") || "sem mudança"));
  }
  objMov.forEach(([o, x0, z0]) => feitos.push(nomeObj(o) + ": afastado " + Math.round(Math.hypot(o.x - x0, o.z - z0) * CM) + " cm"));
  const restam = colisoesDaCena().length;
  if (restam) feitos.push(restam + " colisão(ões) não resolvida(s) com " + ({ distancia: "afastar", giro: "girar", pose: "a pose", auto: "o automático" }[met]) + (met === "auto" || met === "distancia" ? "." : " — tente Automático ou Afastar."));
  return feitos;
}
/* modo "bloquear": o manequim arrastado no chão não entra no outro (desliza encostando) */
function bloquearMovimento(it) {
  const outros = capsOutros(it); if (penet(it, it.params, outros) <= 0) return false;
  const r = solDistancia(it, outros); it.params.wx = r.params.wx; it.params.wz = r.params.wz; return true;
}
/* modo "bloquear": alvo da mão/pé (no corpo do manequim) empurrado para fora dos outros corpos */
function bloquearAlvo(it, alvo, pad) {
  const outros = capsOutros(it); if (!outros.length) return alvo;
  const pw = pMundo(it), M = paraMundo(pw), Mi = doMundo(pw); let w = M(alvo); pad = pad === undefined ? 0.35 : pad;
  for (let k = 0; k < 4; k++) for (const B of outros) for (const c of B.caps) { const r = segSeg(w, w, c.a, c.b), need = c.r + pad - r.d; if (need > 0 && r.d > 1e-4) { const n = [(w[0] - r.q[0]) / r.d, (w[1] - r.q[1]) / r.d, (w[2] - r.q[2]) / r.d]; w = [w[0] + n[0] * need, w[1] + n[1] * need, w[2] + n[2] * need]; } }
  return Mi(w);
}
/* modo "corrigir": depois de mexer no manequim ativo */
function corrigirAtivo() {
  if (COL.modo !== "corrigir") return [];
  const it = SCN.list[SCN.active]; if (!it || it.oculto) return [];
  const outros = capsOutros(it); if (penet(it, it.params, outros) <= 0) return [];
  guardarDesfazer([it]);
  const r = COL.preferir === "auto" ? solAuto(it, outros) : SOL[COL.preferir](it, outros);
  aplicar(it, r.params);
  return [it.name + ": " + r.desc];
}
function permitirContato(a, b, on) {
  const A = SCN.list[a], B = SCN.list[b]; if (!A || !B || A === B) throw new Error("Escolha dois manequins diferentes.");
  A.contato = (A.contato || []).filter(id => id !== B.id); B.contato = (B.contato || []).filter(id => id !== A.id);
  if (on !== false) A.contato.push(B.id);
}

/* ===== composição 2D (opcional): sem atravessar em 3D, o desenho pode ficar confuso =====
   - tangência: mão, pé ou cabeça de um encosta exatamente no contorno do outro na tela (as formas "grudam")
   - cabeça escondida: a cabeça de quem está atrás fica coberta por quem está na frente */
const EXTREM = /^(mao[ED]|pe[ED]|cabeca)$/;
function capsTela(p0, it) {
  return capsulas(pMundo(it)).caps.map(c => { const A = telaDoMundo(p0, c.a), B = telaDoMundo(p0, c.b); return { nome: c.nome, a: [A[0], A[1], 0], b: [B[0], B[1], 0], z: (A[2] + B[2]) / 2, r: c.r * (A[3] + B[3]) / 2 }; });
}
function problemasComposicao(p0, vis, T) {
  const out = [], vistos = new Set();
  for (let i = 0; i < vis.length; i++) for (let j = 0; j < vis.length; j++) {
    if (i === j || contatoPermitido(vis[i], vis[j])) continue;
    let tang = null, esc = null;
    for (const a of T[i]) {
      if (!EXTREM.test(a.nome)) continue;
      for (const b of T[j]) {
        const r = segSeg(a.a, a.b, b.a, b.b), gap = r.d - (a.r + b.r);
        if (Math.abs(gap) < 2.5 && (!tang || Math.abs(gap) < tang.gap)) tang = { gap: Math.abs(gap), pa: a.nome, pb: b.nome, pt: r.p };
        if (a.nome === "cabeca" && b.z > a.z + 0.5 && r.d < b.r - 0.25 * a.r) esc = { pb: b.nome, pt: a.a };
      }
    }
    const A = SCN.list.indexOf(vis[i]), B = SCN.list.indexOf(vis[j]);
    if (esc) out.push({ tipo: "escondida", a: A, b: B, pt: esc.pt, texto: "cabeça de " + vis[i].name + " fica escondida atrás de " + PARTES[esc.pb] + " de " + vis[j].name });
    else if (tang && !vistos.has(Math.min(i, j) + "-" + Math.max(i, j)) && vistos.add(Math.min(i, j) + "-" + Math.max(i, j))) out.push({ tipo: "tangencia", a: A, b: B, pt: tang.pt, texto: PARTES[tang.pa] + " de " + vis[i].name + " encosta no contorno de " + PARTES[tang.pb] + " de " + vis[j].name + " (tangência)" });
  }
  return out;
}
function composicaoDaCena() {
  const vis = visiveis(); if (vis.length < 2) return COL.ultimaComp = [];
  const p0 = sceneList()[0].p, T = vis.map(it => capsTela(p0, it));
  return COL.ultimaComp = problemasComposicao(p0, vis, T);
}
/* sugestão: o menor passo no chão que tira a tangência/esconderijo sem criar colisão */
function ajustarComposicao(k) {
  const c = (COL.ultimaComp || [])[k]; if (!c) throw new Error("Problema de composição não encontrado.");
  const it = SCN.list[c.a], p0 = sceneList()[0].p, outros = capsOutros(it), x0 = it.params.wx, z0 = it.params.wz;
  const chave = x => x.tipo + x.a + "-" + x.b;
  guardarDesfazer([it]);
  /* aceita o menor passo que tira esta tangência sem criar outras:
   * o total de avisos tem de cair (antes, empurrar o manequim podia
   * encostá-lo em outra figura e a cena continuava com o mesmo número) */
  const n0 = (COL.ultimaComp || []).length; let reserva = null;
  for (let t = 0.3; t <= 4; t += 0.3) for (let a = 0; a < 360; a += 30) {
    it.params.wx = x0 + Math.cos(a * Math.PI / 180) * t; it.params.wz = z0 + Math.sin(a * Math.PI / 180) * t;
    if (penet(it, it.params, outros) > 0) continue;
    const novo = composicaoDaCena();
    if (novo.some(x => chave(x) === chave(c))) continue;
    if (novo.length < n0) return [it.name + ": afastado " + Math.round(t * CM) + " cm para melhorar a composição"];
    if (!reserva) reserva = [it.params.wx, it.params.wz, t];
  }
  if (reserva) { it.params.wx = reserva[0]; it.params.wz = reserva[1]; composicaoDaCena();
    return [it.name + ": afastado " + Math.round(reserva[2] * CM) + " cm; esta tangência saiu, mas surgiu outra — confira a composição"]; }
  it.params.wx = x0; it.params.wz = z0; composicaoDaCena();
  return ["Não achei um passo pequeno que resolva; tente girar ou mudar a pose."];
}
function setComposicao(on) { COL.composicao = on !== false && on !== 0; }

export { separarObjeto, resolverObjetos, nomeObj, resolverObjeto, capsObjetos, composicaoDaCena, ajustarComposicao, setComposicao, quemMexer };
export { CM, COL, setModoColisao, setPreferir, pMundo, colisoesDaCena, listaColisoes, solDistancia, solGiro, solPose, solAuto, resolverPar, resolverTodas,
  desfazerColisao, bloquearMovimento, bloquearAlvo, corrigirAtivo, permitirContato, contatoPermitido };
