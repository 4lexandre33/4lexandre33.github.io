"use strict";
/* Fase 24 — núcleo de áudio do editor: DSP puro (sem DOM, sem AudioContext) sobre PCM Float32.
 * Usado pela interface, pelo MCP e pelos testes. Nada aqui lê ou grava ativos. */
definePlugin({
    id: 'audio-edit-core',
    version: '1.0.0',
    needs: [],
    provides: ['audioEditCore'],
    uses: [],
    accepts: {},
    contractVersions: { audioEditCore: '1.0.0' },
    setup: function (kernel) {
        const MAX_SECONDS = 600;
        const fail = (code, message) => { const e = new Error(message); e.code = code; throw e; };
        const dbLin = (db) => Math.pow(10, db / 20);
        const linDb = (x) => x > 1e-6 ? 20 * Math.log10(x) : -120;
        const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
        const lenOf = (p) => p.channels[0].length;
        const secs = (p) => lenOf(p) / p.sampleRate;
        const make = (sr, nch, len) => ({ sampleRate: sr, channels: Array.from({ length: nch }, () => new Float32Array(len)) });
        const clone = (p) => ({ sampleRate: p.sampleRate, channels: p.channels.map(c => new Float32Array(c)) });
        function checkPcm(p) {
            if (!p || !Array.isArray(p.channels) || !p.channels.length || p.channels.length > 2)
                fail('UNSUPPORTED_AUDIO', 'Somente áudio mono ou estéreo');
            const n = p.channels[0].length;
            if (p.channels.some(c => c.length !== n))
                fail('UNSUPPORTED_AUDIO', 'Canais com tamanhos diferentes');
            if (!(p.sampleRate >= 8000 && p.sampleRate <= 192000))
                fail('UNSUPPORTED_AUDIO', 'Taxa de amostragem fora de 8–192 kHz');
            if (n / p.sampleRate > MAX_SECONDS)
                fail('AUDIO_TOO_LONG', 'O áudio passa de ' + MAX_SECONDS / 60 + ' minutos; corte antes de processar');
        }
        /* ------------------------------ WAV ------------------------------ */
        function parseWav(bytes) {
            if (bytes.length < 44)
                fail('UNSUPPORTED_AUDIO', 'Arquivo WAV curto demais');
            const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
            if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE')
                fail('UNSUPPORTED_AUDIO', 'Não é um arquivo WAV');
            let pos = 12, fmt = null, dataAt = -1, dataLen = 0;
            while (pos + 8 <= bytes.length) {
                const id = tag(pos);
                let size = v.getUint32(pos + 4, true);
                const body = pos + 8;
                if (body + size > bytes.length)
                    size = bytes.length - body;
                if (id === 'fmt ' && size >= 16) {
                    let t = v.getUint16(body, true);
                    if (t === 0xFFFE && size >= 26)
                        t = v.getUint16(body + 24, true);
                    fmt = { tag: t, ch: v.getUint16(body + 2, true), sr: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
                }
                else if (id === 'data') {
                    dataAt = body;
                    dataLen = size;
                    break;
                }
                pos = body + size + (size & 1);
            }
            if (!fmt || dataAt < 0)
                fail('UNSUPPORTED_AUDIO', 'WAV sem cabeçalho fmt ou sem dados');
            const f = fmt;
            if (f.ch < 1 || f.ch > 2)
                fail('UNSUPPORTED_AUDIO', 'Somente mono ou estéreo');
            const bytesPer = f.bits >> 3, isFloat = f.tag === 3;
            const okInt = f.tag === 1 && (f.bits === 8 || f.bits === 16 || f.bits === 24 || f.bits === 32);
            if (!(okInt || (isFloat && f.bits === 32)))
                fail('UNSUPPORTED_AUDIO', 'WAV não suportado (use PCM 8/16/24/32 bits ou float 32)');
            const frames = Math.floor(dataLen / (bytesPer * f.ch));
            const out = make(f.sr, f.ch, frames);
            checkPcm(out);
            for (let i = 0; i < frames; i++)
                for (let c = 0; c < f.ch; c++) {
                    const o = dataAt + (i * f.ch + c) * bytesPer;
                    let s;
                    if (isFloat)
                        s = v.getFloat32(o, true);
                    else if (f.bits === 16)
                        s = v.getInt16(o, true) / 32768;
                    else if (f.bits === 8)
                        s = (bytes[o] - 128) / 128;
                    else if (f.bits === 24) {
                        let x = bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16);
                        if (x & 0x800000)
                            x |= ~0xFFFFFF;
                        s = x / 8388608;
                    }
                    else
                        s = v.getInt32(o, true) / 2147483648;
                    out.channels[c][i] = s;
                }
            return out;
        }
        function encodeWav(pcm, bits = 16) {
            checkPcm(pcm);
            const n = lenOf(pcm), ch = pcm.channels.length, bytesPer = bits >> 3, dataLen = n * ch * bytesPer;
            const out = new Uint8Array(44 + dataLen), v = new DataView(out.buffer);
            const put = (o, s) => { for (let i = 0; i < 4; i++)
                out[o + i] = s.charCodeAt(i); };
            put(0, 'RIFF');
            v.setUint32(4, 36 + dataLen, true);
            put(8, 'WAVE');
            put(12, 'fmt ');
            v.setUint32(16, 16, true);
            v.setUint16(20, bits === 32 ? 3 : 1, true);
            v.setUint16(22, ch, true);
            v.setUint32(24, pcm.sampleRate, true);
            v.setUint32(28, pcm.sampleRate * ch * bytesPer, true);
            v.setUint16(32, ch * bytesPer, true);
            v.setUint16(34, bits, true);
            put(36, 'data');
            v.setUint32(40, dataLen, true);
            let o = 44;
            for (let i = 0; i < n; i++)
                for (let c = 0; c < ch; c++) {
                    const s = pcm.channels[c][i];
                    if (bits === 32)
                        v.setFloat32(o, s, true);
                    else {
                        const x = clamp(s, -1, 1);
                        v.setInt16(o, Math.round(x < 0 ? x * 32768 : x * 32767), true);
                    }
                    o += bytesPer;
                }
            return out;
        }
        function bq(type, fs, f0, q, gainDb = 0) {
            const f = clamp(f0, 10, fs * 0.49), w = 2 * Math.PI * f / fs, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q), A = Math.pow(10, gainDb / 40);
            let b0, b1, b2, a0, a1, a2;
            switch (type) {
                case 'lp':
                    b0 = (1 - cw) / 2;
                    b1 = 1 - cw;
                    b2 = b0;
                    a0 = 1 + al;
                    a1 = -2 * cw;
                    a2 = 1 - al;
                    break;
                case 'hp':
                    b0 = (1 + cw) / 2;
                    b1 = -(1 + cw);
                    b2 = b0;
                    a0 = 1 + al;
                    a1 = -2 * cw;
                    a2 = 1 - al;
                    break;
                case 'bp':
                    b0 = al;
                    b1 = 0;
                    b2 = -al;
                    a0 = 1 + al;
                    a1 = -2 * cw;
                    a2 = 1 - al;
                    break;
                case 'notch':
                    b0 = 1;
                    b1 = -2 * cw;
                    b2 = 1;
                    a0 = 1 + al;
                    a1 = -2 * cw;
                    a2 = 1 - al;
                    break;
                case 'peak':
                    b0 = 1 + al * A;
                    b1 = -2 * cw;
                    b2 = 1 - al * A;
                    a0 = 1 + al / A;
                    a1 = -2 * cw;
                    a2 = 1 - al / A;
                    break;
                case 'ls': {
                    const s = 2 * Math.sqrt(A) * al;
                    b0 = A * ((A + 1) - (A - 1) * cw + s);
                    b1 = 2 * A * ((A - 1) - (A + 1) * cw);
                    b2 = A * ((A + 1) - (A - 1) * cw - s);
                    a0 = (A + 1) + (A - 1) * cw + s;
                    a1 = -2 * ((A - 1) + (A + 1) * cw);
                    a2 = (A + 1) + (A - 1) * cw - s;
                    break;
                }
                default: {
                    const s = 2 * Math.sqrt(A) * al;
                    b0 = A * ((A + 1) + (A - 1) * cw + s);
                    b1 = -2 * A * ((A - 1) + (A + 1) * cw);
                    b2 = A * ((A + 1) + (A - 1) * cw - s);
                    a0 = (A + 1) - (A - 1) * cw + s;
                    a1 = 2 * ((A - 1) - (A + 1) * cw);
                    a2 = (A + 1) - (A - 1) * cw - s;
                }
            }
            return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
        }
        /** Aplica uma cascata de biquads a um canal (cópia em Float32). */
        function filt(x, stages) {
            let cur = x;
            for (const s of stages) {
                const y = new Float32Array(cur.length);
                let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
                for (let i = 0; i < cur.length; i++) {
                    const xi = cur[i], yi = s.b0 * xi + s.b1 * x1 + s.b2 * x2 - s.a1 * y1 - s.a2 * y2;
                    x2 = x1;
                    x1 = xi;
                    y2 = y1;
                    y1 = yi;
                    y[i] = yi;
                }
                cur = y;
            }
            return cur;
        }
        const BUTTER4 = [0.5412, 1.3066];
        const hp4 = (fs, f) => BUTTER4.map(q => bq('hp', fs, f, q));
        const lp4 = (fs, f) => BUTTER4.map(q => bq('lp', fs, f, q));
        const mapCh = (p, fn) => ({ sampleRate: p.sampleRate, channels: p.channels.map(fn) });
        /* ------------------------------ medição ------------------------------ */
        /** Ponderação K da ITU-R BS.1770 (pré-filtro de prateleira + passa-altas RLB). */
        function kWeight(fs) {
            const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
            let K = Math.tan(Math.PI * f0 / fs);
            const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
            let a0 = 1 + K / Q + K * K;
            const shelf = { b0: (Vh + Vb * K / Q + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q + K * K) / a0, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
            const f1 = 38.13547087602444, Q1 = 0.5003270373238773;
            K = Math.tan(Math.PI * f1 / fs);
            a0 = 1 + K / Q1 + K * K;
            return [shelf, { b0: 1, b1: -2, b2: 1, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q1 + K * K) / a0 }];
        }
        /** Loudness integrado (LUFS). Mono conta como dois canais iguais (como é tocado). null = silêncio. */
        function lufs(pcm) {
            checkPcm(pcm);
            const fs = pcm.sampleRate, n = lenOf(pcm), hop = Math.max(1, Math.round(0.1 * fs));
            const chans = pcm.channels.map(c => filt(c, kWeight(fs)));
            const subs = [];
            for (let s = 0; s < n; s += hop) {
                const e = Math.min(n, s + hop);
                let sum = 0;
                for (const c of chans)
                    for (let i = s; i < e; i++)
                        sum += c[i] * c[i];
                subs.push(sum);
            }
            const weight = chans.length === 1 ? 2 : 1;
            const blockLoud = (z) => -0.691 + 10 * Math.log10(Math.max(z, 1e-20));
            const blocks = [];
            if (n < 4 * hop)
                blocks.push(weight * subs.reduce((a, b) => a + b, 0) / Math.max(1, n));
            else
                for (let i = 0; i + 4 <= subs.length; i++) {
                    const cnt = Math.min(n, (i + 4) * hop) - i * hop;
                    blocks.push(weight * (subs[i] + subs[i + 1] + subs[i + 2] + subs[i + 3]) / cnt);
                }
            const abs = blocks.filter(z => blockLoud(z) > -70);
            if (!abs.length)
                return null;
            const rel = blockLoud(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
            const gated = abs.filter(z => blockLoud(z) > rel);
            if (!gated.length)
                return null;
            return Math.round(blockLoud(gated.reduce((a, b) => a + b, 0) / gated.length) * 100) / 100;
        }
        function truePeak(pcm) {
            let peak = 0;
            for (const c of pcm.channels)
                for (let i = 0; i + 1 < c.length; i++) {
                    const p0 = c[Math.max(0, i - 1)], p1 = c[i], p2 = c[i + 1], p3 = c[Math.min(c.length - 1, i + 2)];
                    peak = Math.max(peak, Math.abs(p1));
                    for (let k = 1; k < 4; k++) {
                        const t = k / 4, t2 = t * t, t3 = t2 * t;
                        const v = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
                        peak = Math.max(peak, Math.abs(v));
                    }
                }
            return peak;
        }
        function analyze(pcm) {
            checkPcm(pcm);
            let peak = 0, sq = 0, clipped = 0;
            const n = lenOf(pcm);
            for (const c of pcm.channels)
                for (let i = 0; i < c.length; i++) {
                    const a = Math.abs(c[i]);
                    if (a > peak)
                        peak = a;
                    if (a >= 0.999)
                        clipped++;
                    sq += a * a;
                }
            const rms = Math.sqrt(sq / Math.max(1, n * pcm.channels.length));
            const r2 = (x) => Math.round(x * 100) / 100;
            return { duration: Math.round(n / pcm.sampleRate * 1000) / 1000, sampleRate: pcm.sampleRate, channels: pcm.channels.length,
                peakDb: r2(linDb(peak)), truePeakDb: r2(linDb(truePeak(pcm))), rmsDb: r2(linDb(rms)), lufs: lufs(pcm), clipped };
        }
        function waveform(pcm, columns, start = 0, end) {
            const n = lenOf(pcm), s0 = clamp(Math.round(start * pcm.sampleRate), 0, n), s1 = clamp(Math.round((end ?? n / pcm.sampleRate) * pcm.sampleRate), s0, n);
            const cols = Math.max(1, Math.min(8192, Math.floor(columns))), min = new Float32Array(cols), max = new Float32Array(cols), span = Math.max(1, s1 - s0);
            for (let k = 0; k < cols; k++) {
                const a = s0 + Math.floor(k * span / cols), b = Math.max(a + 1, s0 + Math.floor((k + 1) * span / cols));
                let lo = 0, hi = 0;
                for (const c of pcm.channels)
                    for (let i = a; i < b && i < n; i++) {
                        const x = c[i];
                        if (x < lo)
                            lo = x;
                        if (x > hi)
                            hi = x;
                    }
                min[k] = lo;
                max[k] = hi;
            }
            return { min, max };
        }
        function findSilences(pcm, thresholdDb, minDuration) {
            checkPcm(pcm);
            const fs = pcm.sampleRate, n = lenOf(pcm), win = Math.max(8, Math.round(0.01 * fs)), hop = Math.max(4, Math.round(0.005 * fs)), th = dbLin(thresholdDb);
            const out = [];
            let runStart = -1, lastEnd = 0;
            const close = (endSample) => {
                if (runStart >= 0 && (endSample - runStart) / fs >= minDuration)
                    out.push({ start: runStart / fs, end: endSample / fs });
                runStart = -1;
            };
            for (let s = 0; s < n; s += hop) {
                const e = Math.min(n, s + win);
                let sum = 0;
                for (const c of pcm.channels)
                    for (let i = s; i < e; i++)
                        sum += c[i] * c[i];
                const rms = Math.sqrt(sum / ((e - s) * pcm.channels.length));
                if (rms < th) {
                    if (runStart < 0)
                        runStart = s;
                    lastEnd = e;
                }
                else
                    close(lastEnd);
                if (e >= n)
                    break;
            }
            close(n);
            return out;
        }
        function splitBySilence(pcm, o) {
            const dur = secs(pcm), sil = findSilences(pcm, o.threshold, o.minSilence);
            /* silêncio nas pontas do arquivo sempre sai, mesmo menor que minSilence */
            const edge = findSilences(pcm, o.threshold, 0.01);
            const first = edge[0], last = edge[edge.length - 1];
            if (first && first.start < 0.02 && !(sil[0] && sil[0].start < 0.02))
                sil.unshift(first);
            if (last && last.end > dur - 0.02 && !(sil[sil.length - 1] && sil[sil.length - 1].end > dur - 0.02))
                sil.push(last);
            const speech = [];
            let cur = 0;
            for (const s of sil) {
                if (s.start > cur)
                    speech.push({ start: cur, end: s.start });
                cur = s.end;
            }
            if (cur < dur)
                speech.push({ start: cur, end: dur });
            const kept = speech.filter(s => s.end - s.start >= o.minSpeech);
            return kept.map((s, i) => {
                const prev = kept[i - 1], next = kept[i + 1];
                const lo = prev ? (prev.end + s.start) / 2 : 0, hi = next ? (s.end + next.start) / 2 : dur;
                return { start: Math.round(Math.max(lo, s.start - o.pad) * 1000) / 1000, end: Math.round(Math.min(hi, s.end + o.pad) * 1000) / 1000 };
            });
        }
        /* ------------------------------ estrutura ------------------------------ */
        function slice(pcm, start, end) {
            const n = lenOf(pcm), a = clamp(Math.round(start * pcm.sampleRate), 0, n), b = clamp(Math.round(end * pcm.sampleRate), 0, n);
            if (b <= a)
                fail('INVALID_ARGUMENT', 'Trecho vazio ou fora do áudio');
            return mapCh(pcm, c => c.slice(a, b));
        }
        function sameFormat(parts) {
            const f = parts[0];
            for (const p of parts)
                if (p.sampleRate !== f.sampleRate || p.channels.length !== f.channels.length)
                    fail('INVALID_ARGUMENT', 'Os trechos precisam ter a mesma taxa e o mesmo número de canais');
        }
        function concat(parts, gap = 0) {
            if (!parts.length)
                fail('INVALID_ARGUMENT', 'Nada para juntar');
            sameFormat(parts);
            const sr = parts[0].sampleRate, g = Math.round(gap * sr), total = parts.reduce((a, p) => a + lenOf(p), 0) + g * (parts.length - 1);
            const out = make(sr, parts[0].channels.length, total);
            let at = 0;
            for (const p of parts) {
                p.channels.forEach((c, k) => out.channels[k].set(c, at));
                at += lenOf(p) + g;
            }
            checkPcm(out);
            return out;
        }
        function mix(a, b, offset = 0, gainDb = 0) {
            if (a.sampleRate !== b.sampleRate)
                fail('INVALID_ARGUMENT', 'Taxas de amostragem diferentes');
            const off = Math.max(0, Math.round(offset * a.sampleRate)), g = dbLin(gainDb), n = Math.max(lenOf(a), off + lenOf(b)), nch = Math.max(a.channels.length, b.channels.length);
            const out = make(a.sampleRate, nch, n);
            for (let k = 0; k < nch; k++) {
                const o = out.channels[k], ca = a.channels[Math.min(k, a.channels.length - 1)], cb = b.channels[Math.min(k, b.channels.length - 1)];
                o.set(ca);
                for (let i = 0; i < cb.length; i++)
                    o[off + i] = o[off + i] + cb[i] * g;
            }
            checkPcm(out);
            return out;
        }
        function resampleBy(pcm, step, newRate) {
            /* lê o sinal com passo `step` (>1 = mais rápido/agudo), interpolação cúbica; filtra antes se for reduzir a banda */
            const fs = pcm.sampleRate, src = step > 1.0001 ? mapCh(pcm, c => filt(c, lp4(fs, 0.45 * fs / step))) : pcm;
            const n = lenOf(src), outLen = Math.max(1, Math.floor((n - 1) / step) + 1), out = make(newRate ?? fs, pcm.channels.length, outLen);
            src.channels.forEach((c, k) => {
                const o = out.channels[k];
                for (let i = 0; i < outLen; i++) {
                    const p = i * step, i1 = Math.floor(p), t = p - i1, p0 = c[Math.max(0, i1 - 1)], p1 = c[Math.min(n - 1, i1)], p2 = c[Math.min(n - 1, i1 + 1)], p3 = c[Math.min(n - 1, i1 + 2)];
                    o[i] = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
                }
            });
            return out;
        }
        /* ------------------------------ volume ------------------------------ */
        function peakOf(p) { let m = 0; for (const c of p.channels)
            for (let i = 0; i < c.length; i++) {
                const a = Math.abs(c[i]);
                if (a > m)
                    m = a;
            } return m; }
        function scaleInPlace(p, g) { for (const c of p.channels)
            for (let i = 0; i < c.length; i++)
                c[i] = c[i] * g; }
        function limiter(p, ceilingDb) {
            const n = lenOf(p), L = Math.max(1, Math.round(0.005 * p.sampleRate)), cl = dbLin(ceilingDb);
            const g = new Float32Array(n);
            for (let i = 0; i < n; i++) {
                let pk = 0;
                for (const c of p.channels) {
                    const a = Math.abs(c[i]);
                    if (a > pk)
                        pk = a;
                }
                g[i] = pk > cl ? cl / pk : 1;
            }
            /* mínimo deslizante em [i-L, i+L] por fila monótona */
            const m = new Float32Array(n), dq = new Int32Array(n);
            let head = 0, tail = 0, nxt = 0;
            for (let i = 0; i < n; i++) {
                const upto = Math.min(n - 1, i + L);
                while (nxt <= upto) {
                    while (tail > head && g[dq[tail - 1]] >= g[nxt])
                        tail--;
                    dq[tail++] = nxt++;
                }
                while (dq[head] < i - L)
                    head++;
                m[i] = g[dq[head]];
            }
            /* média de m em [i-L, i] garante ganho ≤ g[i]: nunca passa do teto */
            let acc = 0;
            const win = L + 1;
            for (let j = -L; j <= 0; j++)
                acc += m[Math.max(0, j)];
            for (let i = 0; i < n; i++) {
                if (i > 0) {
                    acc += m[i];
                    acc -= m[Math.max(0, i - L - 1)];
                }
                const gi = acc / win;
                for (const c of p.channels)
                    c[i] = c[i] * gi;
            }
        }
        function fadeCurve(c, t) { return c === 'sine' ? Math.sin(t * Math.PI / 2) : c === 'exp' ? t * t : t; }
        function compress(p, s) {
            const fs = p.sampleRate, n = lenOf(p), aA = Math.exp(-1 / (Math.max(0.0001, s.attack) * fs)), aR = Math.exp(-1 / (Math.max(0.001, s.release) * fs)), mk = dbLin(s.makeup);
            let env = 0;
            for (let i = 0; i < n; i++) {
                let lv = 0;
                for (const c of p.channels) {
                    const a = Math.abs(c[i]);
                    if (a > lv)
                        lv = a;
                }
                env = lv > env ? aA * env + (1 - aA) * lv : aR * env + (1 - aR) * lv;
                const over = linDb(env) - s.threshold, gr = over > 0 ? over * (1 - 1 / s.ratio) : 0, g = dbLin(-gr) * mk;
                for (const c of p.channels)
                    c[i] = c[i] * g;
            }
        }
        function gate(p, s) {
            const fs = p.sampleRate, n = lenOf(p), th = dbLin(s.threshold), fl = dbLin(s.floor), aO = Math.exp(-1 / (0.005 * fs)), aC = Math.exp(-1 / (Math.max(0.005, s.release) * fs)), aE = Math.exp(-1 / (0.05 * fs));
            let env = 0, g = 1;
            for (let i = 0; i < n; i++) {
                let lv = 0;
                for (const c of p.channels) {
                    const a = Math.abs(c[i]);
                    if (a > lv)
                        lv = a;
                }
                env = lv > env ? lv : aE * env + (1 - aE) * lv;
                const target = env >= th ? 1 : fl;
                g = target > g ? aO * g + (1 - aO) * target : aC * g + (1 - aC) * target;
                for (const c of p.channels)
                    c[i] = c[i] * g;
            }
        }
        /* ------------------------------ FFT / redução de ruído ------------------------------ */
        function fft(re, im, inverse) {
            const n = re.length;
            for (let i = 1, j = 0; i < n; i++) {
                let bit = n >> 1;
                for (; j & bit; bit >>= 1)
                    j ^= bit;
                j ^= bit;
                if (i < j) {
                    let t = re[i];
                    re[i] = re[j];
                    re[j] = t;
                    t = im[i];
                    im[i] = im[j];
                    im[j] = t;
                }
            }
            for (let len = 2; len <= n; len <<= 1) {
                const ang = 2 * Math.PI / len * (inverse ? 1 : -1), wr = Math.cos(ang), wi = Math.sin(ang);
                for (let i = 0; i < n; i += len) {
                    let cr = 1, ci = 0;
                    for (let k = 0; k < len / 2; k++) {
                        const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
                        re[b] = re[a] - xr;
                        im[b] = im[a] - xi;
                        re[a] = re[a] + xr;
                        im[a] = im[a] + xi;
                        const t = cr * wr - ci * wi;
                        ci = cr * wi + ci * wr;
                        cr = t;
                    }
                }
            }
            if (inverse)
                for (let i = 0; i < n; i++) {
                    re[i] = re[i] / n;
                    im[i] = im[i] / n;
                }
        }
        function denoise(pcm, s) {
            const N = 2048, H = 512, fs = pcm.sampleRate, n = lenOf(pcm), win = new Float64Array(N);
            for (let i = 0; i < N; i++)
                win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
            const p0 = clamp(Math.round(s.profileStart * fs), 0, n), p1 = clamp(Math.round(s.profileEnd * fs), 0, n);
            if (p1 - p0 < Math.max(N + 3 * H, Math.round(0.2 * fs)))
                fail('INVALID_ARGUMENT', 'O trecho de ruído é curto demais (use pelo menos 0,2 s só com ruído)');
            const floor = dbLin(-clamp(s.amount, 3, 40)), alpha = 2;
            const re = new Float64Array(N), im = new Float64Array(N), bins = N / 2 + 1;
            const out = make(fs, pcm.channels.length, n);
            pcm.channels.forEach((c, k) => {
                const noise = new Float64Array(bins);
                let frames = 0;
                for (let st = p0; st + N <= p1; st += H) {
                    for (let i = 0; i < N; i++) {
                        re[i] = c[st + i] * win[i];
                        im[i] = 0;
                    }
                    fft(re, im, false);
                    for (let b = 0; b < bins; b++)
                        noise[b] = noise[b] + re[b] * re[b] + im[b] * im[b];
                    frames++;
                }
                for (let b = 0; b < bins; b++)
                    noise[b] = noise[b] / frames;
                const o = out.channels[k], acc = new Float64Array(n + 2 * N), prev = new Float64Array(bins).fill(1), gain = new Float64Array(bins);
                for (let st = -N; st < n; st += H) {
                    for (let i = 0; i < N; i++) {
                        const idx = st + i;
                        re[i] = (idx >= 0 && idx < n ? c[idx] : 0) * win[i];
                        im[i] = 0;
                    }
                    fft(re, im, false);
                    for (let b = 0; b < bins; b++) {
                        const pw = re[b] * re[b] + im[b] * im[b], g = Math.sqrt(Math.max(0, 1 - alpha * noise[b] / (pw + 1e-18)));
                        gain[b] = Math.max(floor, g);
                    }
                    for (let b = 0; b < bins; b++) {
                        const sm = 0.25 * gain[Math.max(0, b - 1)] + 0.5 * gain[b] + 0.25 * gain[Math.min(bins - 1, b + 1)];
                        const g = 0.6 * sm + 0.4 * prev[b];
                        prev[b] = g;
                        re[b] = re[b] * g;
                        im[b] = im[b] * g;
                        if (b > 0 && b < N / 2) {
                            re[N - b] = re[b];
                            im[N - b] = -im[b];
                        }
                    }
                    fft(re, im, true);
                    for (let i = 0; i < N; i++) {
                        const idx = st + i + N;
                        acc[idx] = acc[idx] + re[i] * win[i] / 1.5;
                    }
                }
                for (let i = 0; i < n; i++)
                    o[i] = acc[i + N];
            });
            return out;
        }
        function declick(pcm, sensitivity) {
            const out = clone(pcm), k = clamp(sensitivity, 3, 30);
            for (const c of out.channels) {
                const n = c.length, d = new Float32Array(n);
                for (let i = 1; i < n - 1; i++)
                    d[i] = Math.abs(c[i] - (c[i - 1] + c[i + 1]) / 2);
                let sum = 0;
                for (let i = 0; i < n; i++)
                    sum += d[i];
                const mean = sum / Math.max(1, n);
                for (let i = 2; i < n - 2; i++) {
                    if (d[i] > k * (mean + 1e-4) && d[i] > 0.05) {
                        let j = i;
                        while (j < n - 2 && j - i < 8 && d[j + 1] > k * (mean + 1e-4) * 0.5)
                            j++;
                        const a = c[i - 1], b = c[j + 1];
                        for (let q = i; q <= j; q++)
                            c[q] = a + (b - a) * (q - i + 1) / (j - i + 2);
                        i = j + 1;
                    }
                }
            }
            return out;
        }
        /* ------------------------------ tempo e tom (WSOLA) ------------------------------ */
        function wsola(pcm, factor) {
            if (Math.abs(factor - 1) < 0.001)
                return clone(pcm);
            const fs = pcm.sampleRate, n = lenOf(pcm);
            let N = Math.round(0.03 * fs);
            N += N & 1;
            const Ha = N / 2, Hin = Ha * factor, delta = Math.round(0.012 * fs), D = 4, W = Math.round(0.01 * fs);
            const outLen = Math.max(1, Math.round(n / factor)), out = make(fs, pcm.channels.length, outLen + N), norm = new Float32Array(outLen + N);
            const win = new Float32Array(N);
            for (let i = 0; i < N; i++)
                win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
            const mono = new Float32Array(n);
            for (const c of pcm.channels)
                for (let i = 0; i < n; i++)
                    mono[i] = mono[i] + c[i] / pcm.channels.length;
            const corr = (a, b, step, len) => { let s = 0; for (let i = 0; i < len; i += step)
                s += mono[a + i] * mono[b + i]; return s; };
            let prev = 0;
            for (let k = 0;; k++) {
                const outPos = k * Ha;
                if (outPos >= outLen)
                    break;
                const nominal = clamp(Math.round(k * Hin), 0, Math.max(0, n - N));
                let pos = nominal;
                if (k > 0) {
                    const ref = prev + Ha;
                    if (ref + W < n) {
                        let best = -Infinity, lo = Math.max(0, nominal - delta), hi = Math.min(n - N, nominal + delta);
                        for (let c = lo; c <= hi; c += D) {
                            const v = corr(c, ref, D, W);
                            if (v > best) {
                                best = v;
                                pos = c;
                            }
                        }
                        best = -Infinity;
                        const c0 = pos;
                        for (let c = Math.max(lo, c0 - D); c <= Math.min(hi, c0 + D); c++) {
                            const v = corr(c, ref, 1, W);
                            if (v > best) {
                                best = v;
                                pos = c;
                            }
                        }
                    }
                }
                for (let i = 0; i < N && pos + i < n; i++) {
                    const w = win[i];
                    norm[outPos + i] = norm[outPos + i] + w;
                    for (let c = 0; c < pcm.channels.length; c++)
                        out.channels[c][outPos + i] = out.channels[c][outPos + i] + pcm.channels[c][pos + i] * w;
                }
                prev = pos;
            }
            return { sampleRate: fs, channels: out.channels.map(c => { for (let i = 0; i < outLen; i++) {
                    const w = norm[i];
                    if (w > 1e-6)
                        c[i] = c[i] / w;
                } return c.slice(0, outLen); }) };
        }
        /* ------------------------------ efeitos ------------------------------ */
        function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
        function saturate(c, drive) { const o = new Float32Array(c.length), inv = 1 / Math.tanh(drive); for (let i = 0; i < c.length; i++)
            o[i] = Math.tanh(c[i] * drive) * inv; return o; }
        function echo(p, delay, feedback, wet) {
            const d = Math.round(delay * p.sampleRate), reps = Math.min(8, Math.ceil(Math.log(0.01) / Math.log(feedback))), tail = d * reps, out = make(p.sampleRate, p.channels.length, lenOf(p) + tail);
            p.channels.forEach((c, k) => {
                const o = out.channels[k];
                o.set(c);
                for (let r = 1; r <= reps; r++) {
                    const g = wet * Math.pow(feedback, r - 1);
                    for (let i = 0; i < c.length; i++)
                        o[i + r * d] = o[i + r * d] + c[i] * g;
                }
            });
            return out;
        }
        function reverb(p, wet) {
            const sc = p.sampleRate / 44100, combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], aps = [556, 441, 341, 225], tail = Math.round(1.6 * p.sampleRate);
            const out = make(p.sampleRate, p.channels.length, lenOf(p) + tail);
            p.channels.forEach((c, k) => {
                const n = out.channels[0].length, inp = new Float32Array(n);
                inp.set(c);
                const acc = new Float32Array(n), spread = k ? 23 : 0;
                for (const cl of combs) {
                    const L = Math.max(2, Math.round((cl + spread) * sc)), buf = new Float32Array(L);
                    let idx = 0, store = 0;
                    for (let i = 0; i < n; i++) {
                        const y = buf[idx];
                        store = y * 0.5 + store * 0.5;
                        buf[idx] = inp[i] * 0.015 + store * 0.84;
                        idx = (idx + 1) % L;
                        acc[i] = acc[i] + y;
                    }
                }
                let cur = acc;
                for (const al of aps) {
                    const L = Math.max(2, Math.round((al + spread) * sc)), buf = new Float32Array(L), y = new Float32Array(n);
                    let idx = 0;
                    for (let i = 0; i < n; i++) {
                        const b = buf[idx];
                        y[i] = -cur[i] + b;
                        buf[idx] = cur[i] + b * 0.5;
                        idx = (idx + 1) % L;
                    }
                    cur = y;
                }
                const o = out.channels[k];
                for (let i = 0; i < n; i++)
                    o[i] = (i < c.length ? c[i] * (1 - wet * 0.5) : 0) + cur[i] * wet * 2.2;
            });
            return out;
        }
        function safe(p) { const pk = peakOf(p); if (pk > 0.999)
            scaleInPlace(p, 0.999 / pk); return p; }
        function effect(pcm, name, amount) {
            const fs = pcm.sampleRate, a = clamp(amount, 0, 1), inPeak = peakOf(pcm) || 1;
            const matchPeak = (p) => { const pk = peakOf(p); if (pk > 0)
                scaleInPlace(p, Math.min(1, inPeak / pk)); return p; };
            switch (name) {
                case 'telephone': return matchPeak(mapCh(pcm, c => saturate(filt(c, [...hp4(fs, 300), ...lp4(fs, 3400)]), 1 + a)));
                case 'radio': {
                    const r = rng(7);
                    return matchPeak(mapCh(pcm, c => { const f = saturate(filt(c, [...hp4(fs, 400), ...lp4(fs, 3000), bq('peak', fs, 1500, 1, 4)]), 1.5 + a); for (let i = 0; i < f.length; i++)
                        f[i] = f[i] + (r() - 0.5) * 0.02 * a; return f; }));
                }
                case 'megaphone': return matchPeak(mapCh(pcm, c => saturate(filt(c, [...hp4(fs, 500), ...lp4(fs, 4500), bq('peak', fs, 2000, 1, 6)]), 2 + 2 * a)));
                case 'muffled': return mapCh(pcm, c => { const f = filt(c, lp4(fs, 600 + 1400 * (1 - a))); for (let i = 0; i < f.length; i++)
                    f[i] = f[i] * 0.8; return f; });
                case 'robot': return matchPeak(mapCh(pcm, c => { const o = new Float32Array(c.length), f = 70; for (let i = 0; i < c.length; i++) {
                    const m = Math.sin(2 * Math.PI * f * i / fs);
                    o[i] = c[i] * (1 - a) + c[i] * m * a;
                } return filt(o, lp4(fs, 6000)); }));
                case 'echo': return safe(echo(pcm, 0.25 + 0.15 * a, 0.35 + 0.25 * a, 0.5));
                case 'reverb': return safe(reverb(pcm, 0.15 + 0.35 * a));
                default: { /* whisper */
                    const r = rng(11);
                    return matchPeak(mapCh(pcm, c => {
                        const env = filt(c.map(Math.abs), lp4(fs, 40)), noise = new Float32Array(c.length);
                        for (let i = 0; i < noise.length; i++)
                            noise[i] = (r() * 2 - 1) * Math.max(0, env[i]) * 3;
                        const w = filt(noise, [...hp4(fs, 1200)]), o = new Float32Array(c.length);
                        for (let i = 0; i < o.length; i++)
                            o[i] = w[i] * (0.5 + 0.5 * a) + c[i] * (1 - a) * 0.5;
                        return o;
                    }));
                }
            }
        }
        /* ------------------------------ passo e cadeia ------------------------------ */
        function trimSilence(pcm, s, warnings) {
            const dur = secs(pcm), sil = findSilences(pcm, s.threshold, 0.05);
            let from = 0, to = dur;
            const first = sil[0], last = sil[sil.length - 1];
            if (first && first.start < 0.01)
                from = Math.max(0, first.end - s.keep);
            if (last && last.end > dur - 0.01)
                to = Math.min(dur, last.start + s.keep);
            if (to - from < 0.01) {
                warnings.push('Todo o áudio é silêncio');
                fail('NO_SIGNAL', 'Todo o áudio está abaixo do limiar de silêncio');
            }
            const parts = [];
            let cur = from;
            if (s.shrinkTo !== null) {
                const keepEach = s.shrinkTo / 2;
                for (const q of sil) {
                    if (q.end <= from || q.start >= to || q.end - q.start <= s.shrinkTo + 0.001)
                        continue;
                    const a = Math.max(q.start, from), b = Math.min(q.end, to);
                    if (a - cur > 0)
                        parts.push(slice(pcm, cur, a + keepEach));
                    cur = b - keepEach;
                }
            }
            parts.push(slice(pcm, cur, to));
            return parts.length === 1 ? parts[0] : concat(parts);
        }
        function applyStep(input, step, warnings = []) {
            checkPcm(input);
            const fs = input.sampleRate, dur = secs(input);
            switch (step.op) {
                case 'trim': return slice(input, step.start, Math.min(step.end, dur));
                case 'cut': {
                    const a = Math.max(0, step.start), b = Math.min(dur, step.end);
                    if (b <= a)
                        fail('INVALID_ARGUMENT', 'Trecho a apagar vazio');
                    if (a <= 0 && b >= dur)
                        fail('INVALID_ARGUMENT', 'Apagar tudo não deixa áudio');
                    const parts = [];
                    if (a > 0)
                        parts.push(slice(input, 0, a));
                    if (b < dur)
                        parts.push(slice(input, b, dur));
                    return concat(parts);
                }
                case 'gain': {
                    const o = clone(input);
                    scaleInPlace(o, dbLin(step.db));
                    return o;
                }
                case 'normalize': {
                    const o = clone(input);
                    if (step.mode === 'peak') {
                        const pk = peakOf(o);
                        if (pk <= 0)
                            fail('NO_SIGNAL', 'Áudio em silêncio: nada a normalizar');
                        scaleInPlace(o, dbLin(step.target) / pk);
                        return o;
                    }
                    const l = lufs(o);
                    if (l === null)
                        fail('NO_SIGNAL', 'Áudio em silêncio ou curto demais para medir o volume');
                    scaleInPlace(o, dbLin(step.target - l));
                    if (peakOf(o) > dbLin(step.ceiling)) {
                        limiter(o, step.ceiling);
                        warnings.push('O pico passaria de ' + step.ceiling + ' dBFS; o limitador foi aplicado');
                    }
                    return o;
                }
                case 'fade': {
                    const o = clone(input), n = lenOf(o), fi = Math.min(n, Math.round(step.fadeIn * fs)), fo = Math.min(n, Math.round(step.fadeOut * fs));
                    for (const c of o.channels) {
                        for (let i = 0; i < fi; i++)
                            c[i] = c[i] * fadeCurve(step.curve, i / fi);
                        for (let j = 0; j < fo; j++)
                            c[n - 1 - j] = c[n - 1 - j] * fadeCurve(step.curve, j / fo);
                    }
                    return o;
                }
                case 'compress': {
                    const o = clone(input);
                    compress(o, step);
                    return o;
                }
                case 'limit': {
                    const o = clone(input);
                    limiter(o, step.ceiling);
                    return o;
                }
                case 'highpass': return mapCh(input, c => filt(c, hp4(fs, step.freq)));
                case 'lowpass': return mapCh(input, c => filt(c, lp4(fs, step.freq)));
                case 'notch': {
                    const st = [];
                    for (let h = 1; h <= step.harmonics && step.freq * h < fs * 0.45; h++)
                        st.push(bq('notch', fs, step.freq * h, step.q));
                    return mapCh(input, c => filt(c, st));
                }
                case 'eq': return mapCh(input, c => filt(c, step.bands.map(b => bq(b.type === 'peak' ? 'peak' : b.type === 'lowshelf' ? 'ls' : 'hs', fs, b.freq, b.q, b.gain))));
                case 'gate': {
                    const o = clone(input);
                    gate(o, step);
                    return o;
                }
                case 'denoise': return denoise(input, step);
                case 'declick': return declick(input, step.sensitivity);
                case 'speed': return wsola(input, step.factor);
                case 'pitch': {
                    const r = Math.pow(2, step.semitones / 12);
                    if (Math.abs(step.semitones) < 0.01)
                        return clone(input);
                    const s = wsola(input, 1 / r);
                    return resampleBy(s, r);
                }
                case 'rate': return resampleBy(input, step.factor);
                case 'effect': return effect(input, step.name, step.amount);
                case 'trimSilence': return trimSilence(input, step, warnings);
                case 'pad': {
                    const b = Math.round(step.before * fs), a = Math.round(step.after * fs), o = make(fs, input.channels.length, lenOf(input) + a + b);
                    input.channels.forEach((c, k) => o.channels[k].set(c, b));
                    return o;
                }
                case 'reverse': return mapCh(input, c => c.slice().reverse());
                case 'mixdown': {
                    if (input.channels.length === 1)
                        return clone(input);
                    const o = make(fs, 1, lenOf(input)), a = input.channels[0], b = input.channels[1], d = o.channels[0];
                    for (let i = 0; i < d.length; i++)
                        d[i] = (a[i] + b[i]) / 2;
                    return o;
                }
                case 'resample': {
                    if (step.sampleRate === fs)
                        return clone(input);
                    return resampleBy(input, fs / step.sampleRate, step.sampleRate);
                }
                case 'loopFit': {
                    const x = Math.round(step.crossfade * fs), n = lenOf(input);
                    if (x < 2 || x * 2 >= n)
                        fail('INVALID_ARGUMENT', 'Fusão do loop curta demais ou maior que metade do áudio');
                    const o = make(fs, input.channels.length, n - x);
                    input.channels.forEach((c, k) => { const d = o.channels[k]; d.set(c.subarray(0, n - x)); for (let i = 0; i < x; i++) {
                        const w = i / x;
                        d[i] = c[i] * w + c[n - x + i] * (1 - w);
                    } });
                    return o;
                }
                default: return fail('INVALID_ARGUMENT', 'Etapa desconhecida');
            }
        }
        function run(pcm, steps, warnings = []) {
            let cur = pcm;
            for (const s of steps)
                cur = applyStep(cur, s, warnings);
            return cur;
        }
        kernel.provide('audioEditCore', { parseWav, encodeWav, lufs, analyze, waveform, findSilences, splitBySilence, slice, concat, mix, applyStep, run });
    }
});
