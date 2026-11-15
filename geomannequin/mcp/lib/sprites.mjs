/* GeoMannequin MCP — pacotes de folhas de cenas: ZIP/imagens → grade pelo fundo → células recortadas (PNG) com nome pacote-folha-célula.
   O catálogo (fichas) mora no mundo da sessão (src/scene/celulas.js); aqui fica o que precisa de Node: ler ZIP, decodificar, recortar, gravar. */
import { inflateRawSync, deflateSync } from "node:zlib";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { lerZip, detectarGrade, recortarPixels, ordemNatural, spSlug, crc32 } from "../../src/engine/index.js";
import { decodificarImagem } from "./decodificar.mjs";

/* PNG RGBA 8 bits (filtro 0) */
export function codificarPng(px) {
  const { w, h, data } = px, raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(data.buffer, data.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const chunk = (tipo, dados) => { const t = Buffer.from(tipo, "ascii"), L = Buffer.alloc(4), C = Buffer.alloc(4); L.writeUInt32BE(dados.length); C.writeUInt32BE(crc32(Buffer.concat([t, dados]))); return Buffer.concat([L, t, dados, C]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6; ih[10] = 0; ih[11] = 0; ih[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ih), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
}
const ehImagem = n => /\.(png|jpe?g)$/i.test(n) && !/(^|\/)__MACOSX\//.test(n) && !/(^|\/)\./.test(basename(n));
/* entradas → [{arquivo, base64}]: zip (base64 ou caminho), imagens (base64 ou caminhos), pasta */
export function arquivosDoPacote(a) {
  const out = [];
  const doZip = buf => { for (const e of lerZip(new Uint8Array(buf)).filter(e => ehImagem(e.nome)).sort((x, y) => ordemNatural(x.nome, y.nome))) { if (e.cifrado) throw new Error("ZIP com senha não é suportado."); const d = e.metodo === 0 ? Buffer.from(e.dados) : e.metodo === 8 ? inflateRawSync(Buffer.from(e.dados)) : null; if (!d) throw new Error("ZIP: compressão " + e.metodo + " não suportada (use deflate)."); out.push({ arquivo: e.nome, base64: d.toString("base64") }); } };
  if (a.zip_base64) doZip(Buffer.from(String(a.zip_base64).replace(/^data:[^,]+,/, ""), "base64"));
  if (a.caminho) { if (!existsSync(a.caminho)) throw new Error("Caminho não encontrado: " + a.caminho); const st = statSync(a.caminho);
    if (st.isDirectory()) readdirSync(a.caminho).filter(ehImagem).sort(ordemNatural).forEach(n => out.push({ arquivo: n, base64: readFileSync(join(a.caminho, n)).toString("base64") }));
    else if (/\.zip$/i.test(a.caminho)) doZip(readFileSync(a.caminho)); else out.push({ arquivo: basename(a.caminho), base64: readFileSync(a.caminho).toString("base64") }); }
  for (const [i, im] of (a.imagens || []).entries()) { if (typeof im === "string") { if (im.length < 2000 && existsSync(im)) out.push({ arquivo: basename(im), base64: readFileSync(im).toString("base64") }); else out.push({ arquivo: (a.nomes && a.nomes[i]) || "imagem" + (i + 1) + ".png", base64: im }); } else out.push({ arquivo: im.nome || "imagem" + (i + 1) + ".png", base64: im.base64 || im.dados }); }
  if (!out.length) throw new Error("Nenhuma imagem PNG/JPEG no pacote.");
  return out;
}
/* analisa e corta: devolve o pacote pronto para clRegistrarPacote (células com img em data URL PNG) */
export async function cortarPacote(arquivos, o = {}) {
  const folhas = [];
  for (const [fi, a] of arquivos.entries()) {
    const px = await decodificarImagem(a.base64, o.maxLado || 4096), grade = detectarGrade(px, { grade: (o.grades && o.grades[fi]) || o.grade, leitura: o.leitura, tolerancia: o.tolerancia, margem: o.margem });
    const celulas = grade.celulas.map(c => { let cp = recortarPixels(px, c); const lim = o.ladoCelula || 1024, k = Math.min(1, lim / Math.max(cp.w, cp.h)); if (k < 1) cp = reduzir(cp, k);
      return Object.assign({}, c, { img: "data:image/png;base64," + codificarPng(cp).toString("base64"), w: cp.w, h: cp.h, origem: { x: c.x, y: c.y, w: c.w, h: c.h } }); });
    folhas.push({ arquivo: a.arquivo, grade: grade.codigo, largura: px.w, altura: px.h, regular: grade.regular, avisos: grade.avisos, celulas }); }
  return { nome: o.nome || "pacote", folhas };
}
function reduzir(px, k) { const w = Math.max(1, Math.round(px.w * k)), h = Math.max(1, Math.round(px.h * k)), out = new Uint8Array(w * h * 4), f = 1 / k;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const x0 = Math.floor(x * f), y0 = Math.floor(y * f), x1 = Math.min(px.w, Math.floor((x + 1) * f)), y1 = Math.min(px.h, Math.floor((y + 1) * f)); const s = [0, 0, 0, 0]; let n = 0;
    for (let yy = y0; yy < Math.max(y0 + 1, y1); yy++) for (let xx = x0; xx < Math.max(x0 + 1, x1); xx++) { const i = (yy * px.w + xx) * 4; s[0] += px.data[i]; s[1] += px.data[i + 1]; s[2] += px.data[i + 2]; s[3] += px.data[i + 3]; n++; }
    const o = (y * w + x) * 4; for (let c = 0; c < 4; c++) out[o + c] = Math.round(s[c] / n); } return { w, h, data: out }; }
/* banco do MCP local (stdio): pasta com catalogo.json + celulas/*.png. GM_CELULAS muda a pasta; GM_CELULAS=0 desliga. */
export function pastaCatalogo() { const p = process.env.GM_CELULAS; if (p === "0") return null; return p || join(homedir(), ".geomannequin", "celulas"); }
export function salvarCatalogoDisco(world, pasta = pastaCatalogo()) { if (!pasta) return null; mkdirSync(join(pasta, "img"), { recursive: true }); const d = world.clExportar();
  for (const [id, c] of Object.entries(d.itens)) { if (c.img && /^data:image\/png;base64,/.test(c.img)) { const f = join(pasta, "img", spSlug(id) + ".png"); if (!existsSync(f)) writeFileSync(f, Buffer.from(c.img.split(",")[1], "base64")); c.img = null; c.arquivoImg = "img/" + spSlug(id) + ".png"; } }
  writeFileSync(join(pasta, "catalogo.json"), JSON.stringify(d)); return pasta; }
export function carregarCatalogoDisco(world, pasta = pastaCatalogo()) { if (!pasta || !existsSync(join(pasta, "catalogo.json"))) return 0; const d = JSON.parse(readFileSync(join(pasta, "catalogo.json"), "utf8"));
  for (const c of Object.values(d.itens || {})) if (!c.img && c.arquivoImg && existsSync(join(pasta, c.arquivoImg))) c.img = "data:image/png;base64," + readFileSync(join(pasta, c.arquivoImg)).toString("base64");
  return world.clImportar(d); }
