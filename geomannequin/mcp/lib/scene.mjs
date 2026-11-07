/* Operações de cena usadas pelas ferramentas MCP: resumo, desenho (SVG/PNG) e link para o app */
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { Resvg } from "@resvg/resvg-js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const FONTS = ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"].map(f => join(dirname(fileURLToPath(import.meta.url)), "..", "fonts", f));

export const APP_URL = (process.env.GM_APP_URL || "https://4lexandre33.github.io/geomannequin/").replace(/#.*$/, "");

const b64u = buf => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = t => Buffer.from(t.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/* mesmo formato do botão "Copiar link da cena" do app */
export function payload(w) {
  const o = { v: 1, scene: w.sceneState(), layers: w.L, style: w.style };
  if (w.theme !== "sistema") o.tema = w.theme;
  return o;
}
export function sceneLink(w) {
  return APP_URL + "#cena=z" + b64u(deflateRawSync(Buffer.from(JSON.stringify(payload(w)))));
}
export function decodeLink(s) {
  const m = /#cena=([zj])([A-Za-z0-9_-]+)/.exec(String(s));
  if (!m) throw new Error("Isso não parece um link de cena do GeoMannequin (falta “#cena=”).");
  const bytes = unb64u(m[2]);
  return JSON.parse((m[1] === "z" ? inflateRawSync(bytes) : bytes).toString("utf8"));
}
/* carrega JSON exportado pelo app, payload de link ou link */
export function loadInto(w, input) {
  let o = input;
  if (typeof o === "string") {
    const t = o.trim();
    o = t.includes("#cena=") ? decodeLink(t) : JSON.parse(t);
  }
  if (!o || typeof o !== "object") throw new Error("Cena inválida.");
  const sc = o.scene || (o.list ? o : null);
  if (!sc) throw new Error("JSON sem o campo “scene” (use o JSON exportado pelo app ou um link de cena).");
  w.applyState({ scene: sc, layers: o.layers, style: o.style });
  w.setStyle(w.style);
  if (o.tema) w.tema(o.tema);
}

const r1 = x => Math.round(x * 10) / 10;
export function summary(w) {
  const P = w.P, L = w.L;
  const m = w.SCN.list.map((it, i) => {
    const c = w.instColors(it, w.theme !== "escuro");
    return { indice: i, nome: it.name, ativo: i === w.SCN.active, x: r1(it.params.wx), z: r1(it.params.wz), giro: Math.round(it.params.wRot), preenchimento: c.fill, contorno: c.ink };
  });
  return {
    manequins: m,
    camera: {
      perspectiva: !!P.persp, lente_mm: Math.round(P.lens), distancia: r1(P.camDist), yaw: r1(P.yaw), pitch: r1(P.pitch), roll: r1(P.roll),
      alvo: { x: r1(P.tx), y: r1(P.ty), z: r1(P.tz) }, altura_olhos: r1(w.eyeHeight()), zoom: P.zoom
    },
    luz: { azimute: Math.round(P.lightAz), elevacao: Math.round(P.lightEl) },
    cena: { tema: w.theme, modo: w.mode || "personalizado", estilo: w.style, sombras: !!L.shadow, horizonte: !!L.horizon, chao: !!L.floor, atmosfera: P.atmo }
  };
}
export function summaryText(w) {
  const s = summary(w);
  const lines = s.manequins.map(m => `${m.ativo ? "▶" : " "} [${m.indice}] ${m.nome} — x ${m.x}, z ${m.z}, giro ${m.giro}°, cor ${m.preenchimento} / ${m.contorno}`);
  const c = s.camera;
  lines.push(`Câmera: ${c.perspectiva ? `perspectiva, lente ${c.lente_mm} mm, distância ${c.distancia} R, olhos a ${c.altura_olhos} R do chão` : "sem perspectiva"}; yaw ${c.yaw}°, pitch ${c.pitch}°.`);
  lines.push(`Cena: tema ${s.cena.tema}, modo ${s.cena.modo}, sombras ${s.cena.sombras ? "sim" : "não"}, horizonte ${s.cena.horizonte ? "sim" : "não"}, atmosfera ${s.cena.atmosfera}.`);
  return lines.join("\n");
}

/* desenho: SVG completo e PNG */
export function renderSvg(w, { tema, enquadrar = false, camadas } = {}) {
  const dark = (tema || w.theme) === "escuro";
  if (enquadrar) w.autoFit();
  const prev = w.theme;
  if (tema && tema !== prev) w.tema(tema);
  try {
    const exp = !dark;
    const list = w.sceneList(exp);
    const L = Object.assign({}, w.L, { grid: false }, camadas || {});
    const r = w.renderScene(list, L, false, L.floor ? 16 : 0);
    const bg = exp ? "#FFFFFF" : (list[0].p.bg || "#0F1620");
    const W = w.W, H = w.H;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><title>GeoMannequin</title><rect width="${W}" height="${H}" fill="${bg}"/>${r.svg}</svg>`;
    return { svg, infos: r.infos };
  } finally { if (tema && tema !== prev) w.tema(prev); }
}
/* o resvg aborta o processo quando um elemento fica inteiro fora da tela: remove esses elementos antes */
function pathBox(d) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, cx = 0, cy = 0;
  const add = (x, y) => { cx = x; cy = y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (const m of d.matchAll(/([MLHVAZCQST])([^MLHVAZCQSTmlhvazcqst]*)/gi)) {
    const c = m[1], n = (m[2].match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
    if (c !== c.toUpperCase()) return null;
    if (c === "M" || c === "L" || c === "T") for (let i = 0; i + 1 < n.length; i += 2) add(n[i], n[i + 1]);
    else if (c === "H") n.forEach(x => add(x, cy));
    else if (c === "V") n.forEach(y => add(cx, y));
    else if (c === "C" || c === "S" || c === "Q") for (let i = 0; i + 1 < n.length; i += 2) add(n[i], n[i + 1]);
    else if (c === "A") for (let i = 0; i + 6 < n.length; i += 7) { const r = Math.max(n[i], n[i + 1]); add(n[i + 5] - r, n[i + 6] - r); add(n[i + 5] + r, n[i + 6] + r); }
  }
  return x0 <= x1 ? [x0, y0, x1, y1] : null;
}
export function sanitizeSvg(svg, W = 600, H = 700, pad = 4) {
  const out = (b) => b && (b[2] < -pad || b[0] > W + pad || b[3] < -pad || b[1] > H + pad);
  return svg
    .replace(/<path\b[^>]*?\bd="([^"]*)"[^>]*\/>/g, (el, d) => out(pathBox(d)) ? "" : el)
    .replace(/<circle\b[^>]*?\bcx="([-\d.e]+)"[^>]*?\bcy="([-\d.e]+)"[^>]*?\br="([-\d.e]+)"[^>]*\/>/g, (el, x, y, r) => { x = +x; y = +y; r = +r; return out([x - r, y - r, x + r, y + r]) ? "" : el; })
    .replace(/<text\b[^>]*?\bx="([-\d.e]+)"[^>]*?\by="([-\d.e]+)"[^>]*>[\s\S]*?<\/text>/g, (el, x, y) => (+x < -400 || +x > W + 400 || +y < -20 || +y > H + 20) ? "" : el);
}
export function svgToPng(svg, largura = 900) {
  svg = sanitizeSvg(svg);
  const r = new Resvg(svg, { fitTo: { mode: "width", value: Math.max(200, Math.min(2400, largura | 0)) }, font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "DejaVu Sans", sansSerifFamily: "DejaVu Sans" } });
  return r.render().asPng();
}

/* encontra um manequim por índice ou nome; sem argumento, o ativo */
export function pick(w, q) {
  const L = w.SCN.list;
  if (q === undefined || q === null || q === "") return L[w.SCN.active];
  if (typeof q === "number" || /^\d+$/.test(String(q))) { const it = L[Number(q)]; if (it) return it; }
  const s = String(q).toLowerCase(), it = L.find(x => x.name.toLowerCase() === s) || L.find(x => x.name.toLowerCase().includes(s));
  if (!it) throw new Error(`Manequim “${q}” não existe. Na cena: ${L.map((x, i) => `[${i}] ${x.name}`).join(", ")}.`);
  return it;
}
