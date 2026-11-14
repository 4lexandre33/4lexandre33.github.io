/* GeoMannequin MCP — PDF mínimo (uma imagem por página, RGB comprimido com Flate): para exportar as páginas de HQ sem dependências */
import { deflateSync } from "node:zlib";
/* paginas: [{ w, h, data: RGBA Uint8Array }]; larguraPt: largura da página em pontos (595 = A4) */
export function pdfDeImagens(paginas, o = {}) {
  const objs = [], add = s => { objs.push(s); return objs.length; }, partes = [];
  const catalogo = add(null), arvore = add(null), kids = [];
  for (const im of paginas) {
    const rgb = Buffer.alloc(im.w * im.h * 3); for (let i = 0, j = 0; i < im.w * im.h * 4; i += 4, j += 3) { const a = im.data[i + 3] / 255; rgb[j] = im.data[i] * a + 255 * (1 - a); rgb[j + 1] = im.data[i + 1] * a + 255 * (1 - a); rgb[j + 2] = im.data[i + 2] * a + 255 * (1 - a); }
    const z = deflateSync(rgb), W = o.larguraPt || 595, H = Math.round(W * im.h / im.w);
    const img = add({ dict: "<< /Type /XObject /Subtype /Image /Width " + im.w + " /Height " + im.h + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length " + z.length + " >>", stream: z });
    const cont = Buffer.from("q " + W + " 0 0 " + H + " 0 0 cm /Im0 Do Q"), c = add({ dict: "<< /Length " + cont.length + " >>", stream: cont });
    kids.push(add("<< /Type /Page /Parent " + arvore + " 0 R /MediaBox [0 0 " + W + " " + H + "] /Resources << /XObject << /Im0 " + img + " 0 R >> >> /Contents " + c + " 0 R >>"));
  }
  objs[catalogo - 1] = "<< /Type /Catalog /Pages " + arvore + " 0 R >>"; objs[arvore - 1] = "<< /Type /Pages /Kids [" + kids.map(k => k + " 0 R").join(" ") + "] /Count " + kids.length + " >>";
  let pos = 0; const off = []; const push = b => { partes.push(b); pos += b.length; };
  push(Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1"));
  objs.forEach((ob, i) => { off.push(pos); push(Buffer.from((i + 1) + " 0 obj\n")); if (typeof ob === "string") push(Buffer.from(ob + "\n")); else { push(Buffer.from(ob.dict + "\nstream\n")); push(ob.stream); push(Buffer.from("\nendstream\n")); } push(Buffer.from("endobj\n")); });
  const x = pos; push(Buffer.from("xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n" + off.map(o2 => String(o2).padStart(10, "0") + " 00000 n \n").join("") + "trailer\n<< /Size " + (objs.length + 1) + " /Root " + catalogo + " 0 R" + (o.titulo ? " /Info << /Title (" + String(o.titulo).replace(/[()\\]/g, "") + ") >>" : "") + " >>\nstartxref\n" + x + "\n%%EOF\n"));
  return Buffer.concat(partes);
}
