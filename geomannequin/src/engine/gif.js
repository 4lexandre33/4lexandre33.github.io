/* GeoMannequin — GIF animado sem bibliotecas (navegador e Node): paleta fixa 6×7×6 + cinzas, LZW, repetição infinita.
   criarGif(quadros, w, h, {atraso: ms}) → Uint8Array; cada quadro = RGBA (Uint8Array/Uint8ClampedArray, w*h*4). */
const GIF_PAL = (() => { const p = []; for (let r = 0; r < 6; r++) for (let g = 0; g < 7; g++) for (let b = 0; b < 6; b++) p.push([Math.round(r * 51), Math.round(g * 42.5), Math.round(b * 51)]);
  for (let i = 0; i < 4; i++) p.push([32 + i * 64, 32 + i * 64, 32 + i * 64]); return p; })();
function gifIndice(r, g, b) {
  if (Math.abs(r - g) < 10 && Math.abs(g - b) < 10) { /* cinza: o mais perto entre os cinzas da grade e os extras */
    const v = (r + g + b) / 3; let best = 0, bd = 1e9; for (let i = 0; i < GIF_PAL.length; i++) { const c = GIF_PAL[i]; if (c[0] !== c[1] || c[1] !== c[2]) continue; const d = Math.abs(c[0] - v); if (d < bd) { bd = d; best = i; } } return best; }
  return Math.round(r / 51) * 42 + Math.round(g / 42.5) * 6 + Math.round(b / 51);
}
function gifLzw(ind, minBits) {
  const out = [], clear = 1 << minBits, eoi = clear + 1; let bits = minBits + 1, dict = new Map(), next = eoi + 1, cur = 0, nb = 0;
  const emit = c => { cur |= c << nb; nb += bits; while (nb >= 8) { out.push(cur & 255); cur >>>= 8; nb -= 8; } };
  emit(clear); let w = ind[0];
  for (let i = 1; i < ind.length; i++) { const k = ind[i], key = w * 4096 + k;
    if (dict.has(key)) { w = dict.get(key); continue; }
    emit(w); if (next < 4096) { dict.set(key, next++); if (next > (1 << bits) && bits < 12) bits++; } else { emit(clear); dict = new Map(); next = eoi + 1; bits = minBits + 1; }
    w = k; }
  emit(w); emit(eoi); if (nb > 0) out.push(cur & 255);
  return out;
}
function criarGif(quadros, w, h, o = {}) {
  const b = [], s = t => { for (const c of t) b.push(c.charCodeAt(0)); }, u16 = v => b.push(v & 255, (v >> 8) & 255), atraso = Math.round((o.atraso || 100) / 10);
  s("GIF89a"); u16(w); u16(h); b.push(0xf7, 0, 0); /* paleta global de 256 cores */
  for (let i = 0; i < 256; i++) { const c = GIF_PAL[i] || [0, 0, 0]; b.push(c[0], c[1], c[2]); }
  b.push(0x21, 0xff, 11); s("NETSCAPE2.0"); b.push(3, 1); u16(o.repetir === false ? 1 : 0); b.push(0);
  for (const q of quadros) {
    b.push(0x21, 0xf9, 4, 0, atraso & 255, (atraso >> 8) & 255, 0, 0);
    b.push(0x2c); u16(0); u16(0); u16(w); u16(h); b.push(0);
    const ind = new Uint8Array(w * h); for (let i = 0, j = 0; i < ind.length; i++, j += 4) ind[i] = q[j + 3] < 128 ? gifIndice(255, 255, 255) : gifIndice(q[j], q[j + 1], q[j + 2]);
    b.push(8); const d = gifLzw(ind, 8); for (let i = 0; i < d.length; i += 255) { const n = Math.min(255, d.length - i); b.push(n); for (let k = 0; k < n; k++) b.push(d[i + k]); } b.push(0);
  }
  b.push(0x3b);
  return new Uint8Array(b);
}
export { criarGif };
