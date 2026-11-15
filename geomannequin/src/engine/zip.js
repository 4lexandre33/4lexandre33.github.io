/* GeoMannequin — utilitário ZIP de dados (sem compressão), compartilhado entre UI e MCP */
const TAB = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = TAB[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
/* arquivos: [{nome, texto}] → Uint8Array do .zip */
function criarZip(arquivos) {
  const enc = new TextEncoder(), partes = [], centrais = [];
  const d = new Date(), hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let pos = 0;
  for (const a of arquivos) {
    const nome = enc.encode(a.nome), dados = typeof a.texto === "string" ? enc.encode(a.texto) : a.texto, crc = crc32(dados);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, hora, true); lh.setUint16(12, dia, true); lh.setUint32(14, crc, true); lh.setUint32(18, dados.length, true); lh.setUint32(22, dados.length, true);
    lh.setUint16(26, nome.length, true); lh.setUint16(28, 0, true);
    partes.push(new Uint8Array(lh.buffer), nome, dados);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, hora, true); ch.setUint16(14, dia, true); ch.setUint32(16, crc, true); ch.setUint32(20, dados.length, true); ch.setUint32(24, dados.length, true);
    ch.setUint16(28, nome.length, true); ch.setUint32(42, pos, true);
    centrais.push(new Uint8Array(ch.buffer), nome);
    pos += 30 + nome.length + dados.length;
  }
  const tamC = centrais.reduce((s, b) => s + b.length, 0), fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true); fim.setUint32(12, tamC, true); fim.setUint32(16, pos, true);
  const todos = partes.concat(centrais, [new Uint8Array(fim.buffer)]), out = new Uint8Array(pos + tamC + 22);
  let o = 0; for (const b of todos) { out.set(b, o); o += b.length; }
  return out;
}
export { criarZip, crc32 };
/* lê o diretório central de um .zip: [{nome, metodo (0 guardado, 8 deflate), dados (ainda comprimidos), tamanho}].
   Descomprimir fica com quem chama (navegador: DecompressionStream("deflate-raw"); Node: zlib.inflateRawSync). */
function lerZip(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), dv = new DataView(b.buffer, b.byteOffset, b.byteLength), dec = new TextDecoder();
  let fim = -1; for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw new Error("Arquivo ZIP inválido (sem diretório central).");
  const n = dv.getUint16(fim + 10, true); let p = dv.getUint32(fim + 16, true); const out = [];
  for (let k = 0; k < n; k++) { if (dv.getUint32(p, true) !== 0x02014b50) break;
    const flags = dv.getUint16(p + 8, true), metodo = dv.getUint16(p + 10, true), comp = dv.getUint32(p + 20, true), tam = dv.getUint32(p + 24, true), ln = dv.getUint16(p + 28, true), le = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const nomeB = b.subarray(p + 46, p + 46 + ln), nome = (flags & 0x800) ? dec.decode(nomeB) : Array.from(nomeB, c => String.fromCharCode(c)).join("");
    const lnL = dv.getUint16(off + 26, true), leL = dv.getUint16(off + 28, true), ini = off + 30 + lnL + leL;
    if (!nome.endsWith("/")) out.push({ nome, metodo, dados: b.subarray(ini, ini + comp), tamanho: tam, cifrado: !!(flags & 1) });
    p += 46 + ln + le + lc; }
  return out;
}
export { lerZip };
