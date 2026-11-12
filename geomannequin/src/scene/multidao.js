/* GeoMannequin — muitos manequins: registro da cena, pegada no chão, separar sobreposições, grade, arranjos e
   "olhar para o ponto". Tudo trabalha só com dados (posição, giro, pose, pegada): vale também para quem não está sendo
   desenhado (fora do quadro, oculto, figura simples de longe). Unidade: R (1 R ≈ 11,4 cm). */
import { SCN, P, CAMK } from "./modelo.js";
import { pMundo } from "./colisoes.js";
import { orientar, adicionarObjeto, removerObjeto } from "./cenario.js";
import { addInst, nextHue } from "./modelo.js";
import { capsulas, telaDoMundo } from "../engine/index.js";

/* pegada no chão (círculo que cobre o corpo visto de cima) e altura, pelas cápsulas do corpo */
function mdPegada(it) {
  const c = capsulas(pMundo(it)), lo = c.lo, hi = c.hi;
  const x = (lo[0] + hi[0]) / 2, z = (lo[2] + hi[2]) / 2, r = Math.max(1.2, 0.5 * Math.max(hi[0] - lo[0], hi[2] - lo[2]) * 0.68);
  return { x, z, r, y0: lo[1], y1: hi[1] };
}
function mdFrente(giro) { const a = (giro || 0) * Math.PI / 180; return [Math.sin(a), Math.cos(a)]; }
const r1 = v => Math.round(v * 10) / 10;

/* registro: o que cada manequim e objeto é, onde está e o que faz — com ou sem desenho */
function registroCena(o = {}) {
  const lista = SCN.list.map((it, i) => {
    const p = it.params, pg = mdPegada(it), cam = Object.assign({}, p, pMundo(it)); CAMK.forEach(k => cam[k] = P[k]);
    let tela = null; try { const a = telaDoMundo(cam, [pg.x, pg.y0, pg.z]), b = telaDoMundo(cam, [pg.x, pg.y1, pg.z]); tela = { x: r1(a[0]), y: r1(b[1]), altura: r1(Math.abs(a[1] - b[1])), dentro: a[0] > -40 && a[0] < 1240 && b[1] < 900 && a[1] > -40 }; } catch (e) { }
    return { i, nome: it.name, grupo: it.grupo || null, x: r1(p.wx || 0), z: r1(p.wz || 0), giro: r1(p.wRot || 0), frente: mdFrente(p.wRot).map(r1),
      pegada: { x: r1(pg.x), z: r1(pg.z), raio: r1(pg.r) }, altura: r1(pg.y1 - pg.y0), pose: it.poseNome || null, acao: it.acaoNome || null, interacao: it.interacaoNome || null,
      olhar: { cabecaGirar: r1(p.headYaw || 0), cabecaInclinar: r1(p.headPitch || 0) }, oculto: !!it.oculto, congelado: !!it.congelado, tela };
  });
  const objetos = o.semObjetos ? [] : SCN.objetos.map((q, k) => ({ i: k, nome: q.nome || q.tipo, tipo: q.tipo, x: r1(q.x || 0), z: r1(q.z || 0), giro: r1(q.giro || 0), grupo: q.grupo || null }));
  return { manequins: lista, objetos, total: lista.length, sobrepostos: sobreposicoes().map(([a, b, d]) => [SCN.list[a].name, SCN.list[b].name, r1(d)]) };
}

/* grade espacial: compara só vizinhos (100 manequins = poucas centenas de pares, não 4 950) */
function mdVizinhos(peg, celula) {
  const g = new Map(), pares = [], chave = (a, b) => a + "," + b;
  peg.forEach((p, i) => { const cx = Math.floor(p.x / celula), cz = Math.floor(p.z / celula), k = chave(cx, cz); if (!g.has(k)) g.set(k, []); g.get(k).push(i); });
  peg.forEach((p, i) => { const cx = Math.floor(p.x / celula), cz = Math.floor(p.z / celula);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const j of g.get(chave(cx + dx, cz + dz)) || []) if (j > i) pares.push([i, j]); });
  return pares;
}
function juntos(a, b) { return (a.contato || []).includes(b.id) || (b.contato || []).includes(a.id) || a.apoioEm === b.id; }
/* pares de manequins cujas pegadas se sobrepõem (sem contar quem está de propósito em contato: abraço, luta…) */
function sobreposicoes(folga = 0) {
  const peg = SCN.list.map(mdPegada), out = [];
  for (const [i, j] of mdVizinhos(peg, 6)) { const a = peg[i], b = peg[j], d = Math.hypot(a.x - b.x, a.z - b.z), m = a.r + b.r + folga - d;
    if (m > 0.05 && !juntos(SCN.list[i], SCN.list[j]) && !SCN.list[i].oculto && !SCN.list[j].oculto) out.push([i, j, m]); }
  return out;
}
/* afasta quem se sobrepõe, o mínimo necessário (os fixos/congelados e o ativo, se pedido, não se mexem) */
function separar(o = {}) {
  const folga = o.folga ?? 0.3, fixos = new Set((o.fixos || []).map(n => typeof n === "number" ? n : SCN.list.findIndex(it => it.name === n)));
  let mov = new Set(), voltas = 0;
  for (; voltas < (o.voltas || 40); voltas++) {
    const sp = sobreposicoes(folga); if (!sp.length) break;
    const peg = SCN.list.map(mdPegada);
    for (const [i, j, m] of sp) {
      const A = SCN.list[i], B = SCN.list[j], fa = fixos.has(i) || A.congelado, fb = fixos.has(j) || B.congelado; if (fa && fb) continue;
      let dx = peg[j].x - peg[i].x, dz = peg[j].z - peg[i].z, d = Math.hypot(dx, dz);
      if (d < 1e-3) { const t = (i * 2.399 + j) % (2 * Math.PI); dx = Math.cos(t); dz = Math.sin(t); d = 1; }
      dx /= d; dz /= d; const ka = fa ? 0 : fb ? 1 : 0.5, kb = 1 - ka, s = m + 0.02;
      A.params.wx -= dx * s * ka; A.params.wz -= dz * s * ka; B.params.wx += dx * s * kb; B.params.wz += dz * s * kb;
      if (ka) mov.add(i); if (kb) mov.add(j);
    }
  }
  return { movidos: [...mov].map(i => SCN.list[i].name), restantes: sobreposicoes(folga).length, voltas };
}

/* frente para o ponto [x, z] (manequins e objetos); modo "costas" vira de costas, "lado" de lado */
function olharParaPonto(itens, ponto, o = {}) {
  const [px, pz] = Array.isArray(ponto) ? [ponto[0], ponto.length > 2 ? ponto[2] : ponto[1]] : [ponto.x, ponto.z];
  const extra = o.modo === "costas" ? 180 : o.modo === "lado" ? 90 : 0, feitos = [];
  for (const q of itens) {
    if (q.params) { const p = q.params, dx = px - p.wx, dz = pz - p.wz; if (Math.hypot(dx, dz) < 0.3) continue;
      try { orientar(q, [px, 0, pz]); } catch (e) { p.wRot = Math.atan2(dx, dz) * 180 / Math.PI; }
      if (extra) p.wRot = ((p.wRot + extra + 540) % 360) - 180; feitos.push(q.name); }
    else { const dx = px - q.x, dz = pz - q.z; if (Math.hypot(dx, dz) < 0.3) continue; q.giro = Math.round((((Math.atan2(dx, dz) * 180 / Math.PI + extra) + 540) % 360 - 180) * 10) / 10; feitos.push(q.nome || q.tipo); }
  }
  return feitos;
}

/* posições de um arranjo: grade, fila, círculo, arco, multidão (espalhada com distância mínima) */
function posicoesArranjo(tipo, n, o = {}) {
  const esp = o.espacamento || 6, cx = o.x || 0, cz = o.z || 0, out = [], rnd = mdSorteio(o.semente ?? 7);
  if (tipo === "grade") {
    let col = o.colunas, lin = o.linhas;
    if (o.area) { const [x0, z0, x1, z1] = o.area, w = Math.abs(x1 - x0), h = Math.abs(z1 - z0);
      if (!col && !lin) { col = Math.max(1, Math.round(Math.sqrt(n * w / Math.max(h, 0.1)))); } col = col || Math.ceil(n / (lin || 1)); lin = lin || Math.ceil(n / col);
      const dx = col > 1 ? w / (col - 1) : 0, dz = lin > 1 ? h / (lin - 1) : 0, ox = Math.min(x0, x1) + (col > 1 ? 0 : w / 2), oz = Math.min(z0, z1) + (lin > 1 ? 0 : h / 2);
      for (let k = 0; k < n; k++) out.push([ox + (k % col) * dx, oz + Math.floor(k / col) * dz]);
    } else { col = col || Math.ceil(Math.sqrt(n)); lin = Math.ceil(n / col);
      for (let k = 0; k < n; k++) out.push([cx + ((k % col) - (col - 1) / 2) * esp, cz + (Math.floor(k / col) - (lin - 1) / 2) * esp]); }
  } else if (tipo === "fila") { const a = (o.direcao || 0) * Math.PI / 180; for (let k = 0; k < n; k++) { const t = (k - (n - 1) / 2) * esp; out.push([cx + Math.cos(a) * t, cz - Math.sin(a) * t]); } }
  else if (tipo === "circulo" || tipo === "arco") {
    const ab = tipo === "arco" ? (o.abertura || 120) : 360, R = o.raio || Math.max(esp * n / (2 * Math.PI) * (360 / ab), esp), a0 = (o.direcao || 0) - ab / 2;
    for (let k = 0; k < n; k++) { const a = (a0 + (tipo === "arco" ? (n > 1 ? ab * k / (n - 1) : ab / 2) : 360 * k / n)) * Math.PI / 180; out.push([cx + Math.sin(a) * R, cz + Math.cos(a) * R]); }
  } else if (tipo === "multidao") {
    const R = o.raio || Math.sqrt(n) * esp * 0.62, area = o.area; let tent = 0;
    while (out.length < n && tent++ < n * 400) {
      let x, z; if (area) { x = area[0] + rnd() * (area[2] - area[0]); z = area[1] + rnd() * (area[3] - area[1]); } else { const a = rnd() * 2 * Math.PI, r = R * Math.sqrt(rnd()); x = cx + Math.cos(a) * r; z = cz + Math.sin(a) * r; }
      if (out.every(q => Math.hypot(q[0] - x, q[1] - z) >= esp * 0.72)) out.push([x, z]);
    }
  } else throw new Error("Arranjo “" + tipo + "”: use grade, fila, circulo, arco ou multidao.");
  const jit = o.desalinhar ?? (tipo === "grade" ? 0.15 : 0);
  return out.map(([x, z]) => [x + (rnd() - 0.5) * 2 * jit * esp * 0.5, z + (rnd() - 0.5) * 2 * jit * esp * 0.5]);
}
function mdSorteio(s) { let a = (typeof s === "number" ? s : String(s).split("").reduce((h, c) => h * 31 + c.charCodeAt(0) | 0, 7)) >>> 0 || 1; return () => (a = (a * 1664525 + 1013904223) >>> 0) / 4294967296; }

/* monta a cena a partir da análise de uma planta (engine/planta-imagem.js): caixas, escadas, árvores, água e manequins.
   {limpar: true} tira os objetos e os manequins extras antes; {manequins: false} só o cenário; {escala: 1} multiplica tudo. */
function construirDaPlanta(an, o = {}) {
  if (!an || !an.itens) throw new Error("Análise de planta inválida (use cena.lerPlanta).");
  const k = o.escala || 1;
  if (o.limpar !== false) { while (SCN.objetos.length) removerObjeto(SCN.objetos[SCN.objetos.length - 1]); SCN.list.splice(1); SCN.active = 0; }
  const grupo = o.grupo || "Planta", feitos = [], erros = [];
  const nome = { parede: "parede", predio: "prédio", rampaDegraus: "escada", caixa: "banca", arvore: "árvore", palmeira: "palmeira", arbusto: "arbusto", agua: "água", poco: "poço" }, cont = {};
  for (const it of an.itens.slice(0, 280)) {
    try { cont[it.tipo] = (cont[it.tipo] || 0) + 1;
      const q = adicionarObjeto(it.tipo, { x: it.x * k, z: it.z * k, larg: it.larg * k, prof: it.prof * k, alt: it.alt * k, giro: it.giro || 0, nome: (nome[it.tipo] || it.tipo) + " " + cont[it.tipo] });
      q.grupo = grupo; feitos.push(q);
      /* cores do cenário (como na planta): cinza, madeira, verde, água — variam um pouco de tom para cada peça se distinguir */
      if (o.coresDaPlanta !== false) { const base = { parede: [150, 150, 152], madeira: [196, 128, 60], vegetacao: [70, 150, 70], agua: [70, 190, 205] }[it.classe];
        if (base) { const v = ((cont[it.tipo] * 37) % 21) - 10, f = base.map(c => Math.max(0, Math.min(255, c + v))), hx = c => c.toString(16).padStart(2, "0"), tinta = f.map(c => Math.round(c * 0.45));
          q.col = { fill: "#" + f.map(hx).join(""), ink: "#" + tinta.map(hx).join("") }; } } } catch (e) { erros.push(e.message); }
  }
  const mqs = [];
  if (o.manequins !== false) {
    const porCor = {};
    an.manequins.forEach((m, i) => {
      try { const it = i === 0 && SCN.list.length === 1 && o.limpar !== false ? SCN.list[0] : addInst({}, null, true);
        it.params.wx = m.x * k; it.params.wz = m.z * k; it.params.wRot = m.giro || 0; it.grupo = grupo + " · " + m.cor;
        porCor[m.cor] = (porCor[m.cor] || 0) + 1; it.name = (m.cor[0].toUpperCase() + m.cor.slice(1)) + " " + porCor[m.cor];
        /* a cor da planta (vermelho, azul, roxo), com um tom levemente diferente para cada um */
        const base = { vermelho: [232, 112, 112], azul: [112, 140, 232], roxo: [176, 116, 214] }[m.cor], v = (porCor[m.cor] * 23) % 30 - 15, hx = c => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0");
        if (base) it.col = { fill: "#" + base.map(c => hx(c + v)).join(""), ink: "#" + base.map(c => hx(Math.round(c * 0.32))).join("") }; else it.hue = nextHue(it); mqs.push(it); } catch (e) { erros.push(e.message); }
    });
  }
  return { objetos: feitos.length, manequins: mqs.length, erros: erros.slice(0, 5), escala: an.escala, nomes: mqs.map(it => it.name) };
}

export { construirDaPlanta, mdPegada, registroCena, sobreposicoes, separar, olharParaPonto, posicoesArranjo, mdSorteio, mdFrente };
