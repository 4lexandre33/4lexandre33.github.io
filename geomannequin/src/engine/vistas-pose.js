/* GeoMannequin — vistas de pose do manequim (frente, lado, cima, isométrica):
   o esqueleto no referencial do próprio corpo, com juntas clicáveis e foco por região
   (mão, pé, cabeça, braço, perna, tronco). Só geometria e SVG: quem desenha a interface
   e quem gira as juntas está em src/ui/vistas-pose.js e src/scene/junta-controle.js. */
import { ossosDoCorpo } from "./esqueleto.js";

const VISTAS_POSE = { frente: "Frente", lado: "Lado (direita)", cima: "Cima", iso: "Isométrica" };
const ISO_YAW = 45 * Math.PI / 180, ISO_PITCH = Math.atan(1 / Math.SQRT2);
/* (x, y, z) do corpo → [u (direita da tela), v (cima), profundidade (maior = mais perto)] */
function projetorPose(vista) {
  switch (vista) {
    case "lado": return q => [q[2], q[1], -q[0]];
    case "cima": return q => [q[0], -q[2], q[1]];
    case "iso": {
      const cy = Math.cos(ISO_YAW), sy = Math.sin(ISO_YAW), cp = Math.cos(ISO_PITCH), sp = Math.sin(ISO_PITCH);
      return q => { const x1 = q[0] * cy - q[2] * sy, z1 = q[0] * sy + q[2] * cy; return [x1, q[1] * cp - z1 * sp, z1 * cp + q[1] * sp]; };
    }
    default: return q => [q[0], q[1], q[2]];
  }
}

const REGIOES_POSE = {
  corpo: "Corpo inteiro", cabeca: "Cabeça", tronco: "Tronco",
  bracoEsq: "Braço esquerdo", bracoDir: "Braço direito", maoEsq: "Mão esquerda", maoDir: "Mão direita",
  pernaEsq: "Perna esquerda", pernaDir: "Perna direita", peEsq: "Pé esquerdo", peDir: "Pé direito"
};
/* a região que o foco segue ao escolher uma junta (mão → a mão inteira, para mexer punho e dedos) */
function regiaoDaJunta(j) {
  if (!j) return null;
  const L = j.s > 0 ? "Esq" : "Dir";
  if (j.k === "punho" || j.k === "mao" || j.k === "dedo") return "mao" + L;
  if (j.k === "tornozelo") return "pe" + L;
  if (j.k === "cabeca" || j.k === "rosto" || j.k === "cervical") return "cabeca";
  return null;
}
function filtroRegiao(regiao) {
  const m = /^(braco|mao|perna|pe)(Esq|Dir)$/.exec(regiao || ""), s = m ? (m[2] === "Esq" ? 1 : -1) : 0;
  if (!regiao || regiao === "corpo") return { osso: () => true, junta: () => true };
  if (regiao === "cabeca") return { osso: o => o.regiao === "cabeca" || /cervical|C[1-7]/.test(o.nome), junta: j => /cabeca|rosto|cervical/.test(j.k) };
  if (regiao === "tronco") return { osso: o => o.regiao === "tronco", junta: j => /pelve|lombar|toracica|cervical|quadril|ombro/.test(j.k) };
  const tipo = m[1], regs = { braco: ["braco", "mao"], mao: ["mao"], perna: ["perna", "pe"], pe: ["pe"] }[tipo];
  const js = { braco: /ombro|cotovelo|punho|mao|dedo/, mao: /punho|mao|dedo/, perna: /quadril|joelho|tornozelo/, pe: /tornozelo/ }[tipo];
  return { osso: o => regs.includes(o.regiao) && o.s === s, junta: j => j.s === s && js.test(j.k) };
}

/* desenha uma vista. opts: {w, h, regiao, sel:{k,s,dedo}, cor:{tinta,fundo,destaque,longe}, ossos (já calculados)} */
function svgVistaPose(params, vista, opts = {}) {
  const w = opts.w || 260, h = opts.h || 260, pr = projetorPose(vista);
  const E = opts.esqueleto || ossosDoCorpo(params), F = filtroRegiao(opts.regiao);
  const foco = opts.regiao && opts.regiao !== "corpo";
  /* enquadramento: caixa dos ossos da região (ou do corpo) */
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  const somar = q => { const a = pr(q); u0 = Math.min(u0, a[0]); u1 = Math.max(u1, a[0]); v0 = Math.min(v0, a[1]); v1 = Math.max(v1, a[1]); };
  E.ossos.forEach(o => { if (!F.osso(o)) return; if (o.tipo === "cranio") { const a = pr(o.a); [[o.r, 0], [-o.r, 0], [0, o.r], [0, -o.r]].forEach(([du, dv]) => { u0 = Math.min(u0, a[0] + du); u1 = Math.max(u1, a[0] + du); v0 = Math.min(v0, a[1] + dv); v1 = Math.max(v1, a[1] + dv); }); } else { somar(o.a); somar(o.b); } });
  E.juntas.forEach(j => { if (F.junta(j)) somar(j.P); });
  if (u0 > u1) { u0 = -1; u1 = 1; v0 = -1; v1 = 1; }
  const minLado = foco ? 1.4 : 4, bw = Math.max(u1 - u0, minLado), bh = Math.max(v1 - v0, minLado);
  const s = Math.min(w / bw, h / bh) * (foco ? 0.78 : 0.88), cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  const tela = q => { const a = pr(q); return [w / 2 + (a[0] - cu) * s, h / 2 - (a[1] - cv) * s, a[2]]; };
  const f1 = x => (Math.round(x * 10) / 10).toString();
  /* profundidade: perto mais forte, longe mais claro */
  let d0 = 1e9, d1 = -1e9;
  const bs = E.ossos.map(o => { const a = tela(o.a), b = tela(o.b); d0 = Math.min(d0, a[2], b[2]); d1 = Math.max(d1, a[2], b[2]); return { o, a, b, d: (a[2] + b[2]) / 2 }; }).sort((x, y) => x.d - y.d);
  const prox = d => d1 - d0 < 1e-6 ? 1 : (d - d0) / (d1 - d0);
  const out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + " " + h + '" class="vp-svg" data-vista="' + vista + '">'];
  /* referência: linha de chão (frente/lado/iso) ou cruz do centro (cima) */
  if (!foco) {
    if (vista === "cima") { const c = tela([0, 0, 0]); out.push('<path class="vp-ref" d="M' + f1(c[0] - 12) + " " + f1(c[1]) + "H" + f1(c[0] + 12) + "M" + f1(c[0]) + " " + f1(c[1] - 12) + "V" + f1(c[1] + 12) + '"/>'); }
    else { let gy = 1e9; E.ossos.forEach(o => { gy = Math.min(gy, o.a[1], o.b[1]); }); const a = tela([-6, gy, 0]), b = tela([6, gy, 0]); out.push('<path class="vp-ref" d="M0 ' + f1((a[1] + b[1]) / 2) + "H" + w + '"/>'); }
  }
  for (const { o, a, b, d } of bs) {
    const t = prox(d), dentro = F.osso(o), op = (0.35 + 0.65 * t) * (dentro ? 1 : 0.25);
    if (o.tipo === "cranio") { out.push('<circle class="vp-cranio" cx="' + f1(a[0]) + '" cy="' + f1(a[1]) + '" r="' + f1(Math.max(3, o.r * s)) + '" style="opacity:' + op.toFixed(2) + '"/>'); continue; }
    const lw = Math.max(1.2, Math.min(foco ? 7 : 10, (foco ? 1.1 : 2) * o.r * s));
    out.push('<path class="vp-osso' + (o.s > 0 ? " vp-esq" : o.s < 0 ? " vp-dir" : "") + '" d="M' + f1(a[0]) + " " + f1(a[1]) + "L" + f1(b[0]) + " " + f1(b[1]) + '" style="stroke-width:' + f1(lw) + ";opacity:" + op.toFixed(2) + '"/>');
  }
  /* direção do rosto: do atlas para a frente da face */
  const at = E.juntas.find(j => j.k === "cabeca"), ro = E.juntas.find(j => j.k === "rosto");
  if (at && ro) { const a = tela(at.P), b = tela(ro.P), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (L > 2) { const e = [b[0] + dx / L * 8, b[1] + dy / L * 8]; out.push('<path class="vp-olhar" d="M' + f1(b[0]) + " " + f1(b[1]) + "L" + f1(e[0]) + " " + f1(e[1]) + '"/>'); } }
  /* juntas: as principais sempre; dedos quando a mão está em foco ou grande na tela */
  const juntas = [];
  const raioJ = foco ? 5.5 : 4.2, dedosVis = foco || s > 60;
  E.juntas.forEach(j => {
    if (j.menor && j.k !== "dedo") return;
    if (j.k === "dedo" && !dedosVis) return;
    if (foco && !F.junta(j)) return;
    const q = tela(j.P), r = j.k === "dedo" ? raioJ * 0.75 : raioJ;
    const marc = opts.sel && opts.sel.k === j.k && opts.sel.s === j.s && (j.k !== "dedo" || opts.sel.dedo === j.dedo);
    juntas.push({ nome: j.nome, k: j.k, s: j.s, dedo: j.dedo, x: q[0], y: q[1], prof: q[2] });
    out.push('<circle class="vp-junta' + (j.k === "dedo" ? " vp-dedo" : "") + (marc ? " vp-sel" : "") + '" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="' + f1(r) + '"><title>' + j.nome + (j.s ? (j.s > 0 ? " esquerdo" : " direito") : "") + "</title></circle>");
    if (marc) out.push('<circle class="vp-anel" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="' + f1(r + 5) + '"/>');
  });
  out.push("</svg>");
  return { svg: out.join(""), juntas, s, cu, cv, w, h, vista };
}
/* posição na tela de um ponto do corpo, na mesma vista e enquadramento de svgVistaPose */
function telaDaVista(v, q) { const a = projetorPose(v.vista)(q); return [v.w / 2 + (a[0] - v.cu) * v.s, v.h / 2 - (a[1] - v.cv) * v.s, a[2]]; }

export { VISTAS_POSE, REGIOES_POSE, projetorPose, svgVistaPose, telaDaVista, regiaoDaJunta, filtroRegiao };
