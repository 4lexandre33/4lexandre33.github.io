/* GeoMannequin — MP4 (H.264) sem biblioteca: junta as amostras que o codificador do navegador (WebCodecs, formato "avc")
   entrega num arquivo .mp4 tocável em qualquer lugar (ftyp + moov + mdat, uma faixa de vídeo, fps constante).
   amostras: [{ data: Uint8Array (AVCC, tamanho + NAL), chave: true|false }]; avcC: a "description" do decoderConfig. */
function mp4Caixa(tipo, ...partes) { let n = 8; for (const p of partes) n += p.length; const b = new Uint8Array(n), dv = new DataView(b.buffer); dv.setUint32(0, n); for (let i = 0; i < 4; i++) b[4 + i] = tipo.charCodeAt(i); let o = 8; for (const p of partes) { b.set(p, o); o += p.length; } return b; }
function mp4U(...vals) { /* [bits, valor] → bytes big-endian */ const out = []; for (const [bits, v] of vals) { for (let s = bits - 8; s >= 0; s -= 8) out.push(Math.floor(v / Math.pow(2, s)) & 255); } return new Uint8Array(out); }
function mp4Cheia(tipo, versao, flags, ...partes) { return mp4Caixa(tipo, mp4U([8, versao], [24, flags]), ...partes); }
const MP4_MATRIZ = mp4U([32, 0x00010000], [32, 0], [32, 0], [32, 0], [32, 0x00010000], [32, 0], [32, 0], [32, 0], [32, 0x40000000]);
function criarMp4(o) {
  const { largura: W, altura: H, fps, avcC, amostras } = o, n = amostras.length, escala = Math.round(fps * 1000), delta = 1000, dur = n * delta;
  const ftyp = mp4Caixa("ftyp", new Uint8Array([105, 115, 111, 109]), mp4U([32, 512]), new Uint8Array([105, 115, 111, 109, 105, 115, 111, 50, 97, 118, 99, 49, 109, 112, 52, 49]));
  const durMs = Math.round(n / fps * 1000);
  const mvhd = mp4Cheia("mvhd", 0, 0, mp4U([32, 0], [32, 0], [32, 1000], [32, durMs], [32, 0x00010000], [16, 0x0100], [16, 0], [32, 0], [32, 0]), MP4_MATRIZ, new Uint8Array(24), mp4U([32, 2]));
  const tkhd = mp4Cheia("tkhd", 0, 3, mp4U([32, 0], [32, 0], [32, 1], [32, 0], [32, durMs], [32, 0], [32, 0], [16, 0], [16, 0], [16, 0], [16, 0]), MP4_MATRIZ, mp4U([32, W * 65536], [32, H * 65536]));
  const mdhd = mp4Cheia("mdhd", 0, 0, mp4U([32, 0], [32, 0], [32, escala], [32, dur], [16, 0x55c4], [16, 0]));
  const hdlr = mp4Cheia("hdlr", 0, 0, mp4U([32, 0]), new Uint8Array([118, 105, 100, 101]), new Uint8Array(12), new Uint8Array([71, 101, 111, 77, 97, 110, 110, 101, 113, 117, 105, 110, 0]));
  const vmhd = mp4Cheia("vmhd", 0, 1, mp4U([16, 0], [16, 0], [16, 0], [16, 0]));
  const dinf = mp4Caixa("dinf", mp4Cheia("dref", 0, 0, mp4U([32, 1]), mp4Cheia("url ", 0, 1)));
  const avc1 = mp4Caixa("avc1", new Uint8Array(6), mp4U([16, 1], [16, 0], [16, 0], [32, 0], [32, 0], [32, 0], [16, W], [16, H], [32, 0x00480000], [32, 0x00480000], [32, 0], [16, 1]), new Uint8Array(32), mp4U([16, 0x0018], [16, 0xffff]), mp4Caixa("avcC", avcC));
  const stsd = mp4Cheia("stsd", 0, 0, mp4U([32, 1]), avc1);
  const stts = mp4Cheia("stts", 0, 0, mp4U([32, 1], [32, n], [32, delta]));
  const chaves = []; amostras.forEach((a, i) => { if (a.chave) chaves.push(i + 1); });
  const stss = mp4Cheia("stss", 0, 0, mp4U([32, chaves.length], ...chaves.map(c => [32, c])));
  const stsc = mp4Cheia("stsc", 0, 0, mp4U([32, 1], [32, 1], [32, n], [32, 1]));
  const stsz = mp4Cheia("stsz", 0, 0, mp4U([32, 0], [32, n], ...amostras.map(a => [32, a.data.length])));
  const montar = off => { const stco = mp4Cheia("stco", 0, 0, mp4U([32, 1], [32, off])); const stbl = mp4Caixa("stbl", stsd, stts, stss, stsc, stsz, stco);
    return mp4Caixa("moov", mvhd, mp4Caixa("trak", tkhd, mp4Caixa("mdia", mdhd, hdlr, mp4Caixa("minf", vmhd, dinf, stbl)))); };
  const moov0 = montar(0), off = ftyp.length + moov0.length + 8, moov = montar(off);
  let total = 0; for (const a of amostras) total += a.data.length;
  const mdat = new Uint8Array(8 + total), dv = new DataView(mdat.buffer); dv.setUint32(0, 8 + total); mdat.set([109, 100, 97, 116], 4); let o2 = 8; for (const a of amostras) { mdat.set(a.data, o2); o2 += a.data.length; }
  const out = new Uint8Array(ftyp.length + moov.length + mdat.length); out.set(ftyp, 0); out.set(moov, ftyp.length); out.set(mdat, ftyp.length + moov.length); return out;
}
export { criarMp4 };
