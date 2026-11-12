/* imagem (PNG ou JPEG em base64) → pixels RGBA {w, h, data}, sem bibliotecas novas:
   o JPEG passa pelo mesmo conversor SVG → PNG (resvg) como <image>, e o PNG é lido com zlib. */
import { inflateSync } from "node:zlib";
import { toPng } from "./png.mjs";

function tamanho(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { tipo: "png", w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) { let i = 2;
    while (i < buf.length) { if (buf[i] !== 0xff) { i++; continue; } const m = buf[i + 1], L = buf.readUInt16BE(i + 2);
      if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) return { tipo: "jpeg", h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + L; } }
  throw new Error("Use uma imagem PNG ou JPEG.");
}
/* PNG RGBA 8 bits (ou RGB/cinza) sem entrelaçamento → pixels */
function lerPng(buf) {
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), prof = buf[24], tipoCor = buf[25], entrel = buf[28];
  if (prof !== 8 || entrel) throw new Error("PNG não suportado (use 8 bits, sem entrelaçamento).");
  const canais = { 6: 4, 2: 3, 0: 1, 4: 2 }[tipoCor]; if (!canais) throw new Error("PNG com paleta não suportado.");
  const idat = []; let i = 8; while (i < buf.length) { const L = buf.readUInt32BE(i), t = buf.toString("ascii", i + 4, i + 8); if (t === "IDAT") idat.push(buf.subarray(i + 8, i + 8 + L)); if (t === "IEND") break; i += 12 + L; }
  const raw = inflateSync(Buffer.concat(idat)), bpl = w * canais, px = Buffer.alloc(h * bpl), out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) { const f = raw[y * (bpl + 1)], o = y * (bpl + 1) + 1;
    for (let x = 0; x < bpl; x++) { const a = x >= canais ? px[y * bpl + x - canais] : 0, b = y ? px[(y - 1) * bpl + x] : 0, c = x >= canais && y ? px[(y - 1) * bpl + x - canais] : 0; let v = raw[o + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * bpl + x] = v & 255; } }
  for (let k = 0; k < w * h; k++) { const s = k * canais, d = k * 4;
    if (canais >= 3) { out[d] = px[s]; out[d + 1] = px[s + 1]; out[d + 2] = px[s + 2]; out[d + 3] = canais === 4 ? px[s + 3] : 255; }
    else { out[d] = out[d + 1] = out[d + 2] = px[s]; out[d + 3] = canais === 2 ? px[s + 1] : 255; } }
  return { w, h, data: out };
}
export async function decodificarImagem(base64, maxLado = 2048) {
  const buf = Buffer.from(String(base64).replace(/^data:[^,]+,/, ""), "base64"), t = tamanho(buf);
  const k = Math.min(1, maxLado / Math.max(t.w, t.h)), w = Math.max(1, Math.round(t.w * k)), h = Math.max(1, Math.round(t.h * k));
  if (t.tipo === "png" && k === 1) { try { return lerPng(buf); } catch (e) { /* cai no conversor */ } }
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '"><rect width="' + w + '" height="' + h + '" fill="#fff"/><image width="' + w + '" height="' + h + '" preserveAspectRatio="none" href="data:image/' + t.tipo + ";base64," + buf.toString("base64") + '"/></svg>';
  return lerPng(await toPng(svg, w));
}
