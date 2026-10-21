"use strict";
/* =====================================================================
 * plugins/14b-video-export.ts  (Fase 21)
 * ---------------------------------------------------------------------
 * Exportação do vídeo no navegador (modo A): WebCodecs (VideoEncoder/AudioEncoder) + muxer MP4 próprio.
 * O áudio é mixado offline (OfflineAudioContext) a partir do plano — mesma função do instante `t`
 * usada pela prévia, então o resultado é idêntico e determinístico.
 * Codecs: H.264/AAC quando o navegador oferece; senão VP9 ou AV1 + Opus (aviso de compatibilidade).
 *
 * Fornece: videoExport
 * ===================================================================== */
definePlugin({
    id: 'video-export',
    version: '1.0.0',
    needs: ['utils', 'state', 'assets', 'video', 'videoRender'],
    provides: ['videoExport'],
    uses: ['assetHub'],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'assets': '^1.0.0', 'video': '^1.0.0', 'videoRender': '^1.0.0', 'assetHub': '^1.1.0' },
    contractVersions: { 'videoExport': '1.0.0' },
    setup: async function (kernel) {
        const A = await kernel.require('assets');
        const V = await kernel.require('video');
        const R = await kernel.require('videoRender');
        const SR = 48000;
        const MAX_BYTES = 0xFFFFFFFF - 1024;
        const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
        /* ------------------------------------------------------------------
         * Muxer MP4 (faststart: ftyp, moov, mdat). Uma amostra por "chunk".
         * ------------------------------------------------------------------ */
        const u8 = (...n) => Uint8Array.from(n);
        const be32 = (n) => u8((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255);
        const be16 = (n) => u8((n >>> 8) & 255, n & 255);
        const str = (s) => Uint8Array.from(Array.from(s).map(c => c.charCodeAt(0)));
        function cat(...parts) {
            let n = 0;
            for (const p of parts)
                n += p.length;
            const out = new Uint8Array(n);
            let o = 0;
            for (const p of parts) {
                out.set(p, o);
                o += p.length;
            }
            return out;
        }
        const box = (type, ...payload) => { const body = cat(...payload); return cat(be32(body.length + 8), str(type), body); };
        const full = (type, version, flags, ...payload) => box(type, u8(version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), ...payload);
        const zeros = (n) => new Uint8Array(n);
        const MATRIX = cat(be32(0x00010000), be32(0), be32(0), be32(0), be32(0x00010000), be32(0), be32(0), be32(0), be32(0x40000000));
        function esdsBox(config) {
            const dsi = cat(u8(0x05, config.length), config);
            const dec = cat(u8(0x04, 13 + dsi.length, 0x40, 0x15, 0, 0, 0), be32(0), be32(0), dsi);
            const sl = u8(0x06, 1, 0x02);
            const es = cat(u8(0x03, 3 + dec.length + sl.length), be16(1), u8(0), dec, sl);
            return full('esds', 0, 0, es);
        }
        function buildMoov(tracks, dataStart, layout) {
            const movieTs = 1000;
            let movieDur = 0;
            const traks = tracks.map(t => {
                const durMedia = t.samples.reduce((a, s) => a + s.duration, 0);
                const durMovie = Math.round(durMedia * movieTs / t.timescale);
                movieDur = Math.max(movieDur, durMovie);
                const offsets = layout.get(t).map(o => o + dataStart);
                const stts = [];
                let runDur = -1, runN = 0;
                const flush = () => { if (runN)
                    stts.push(runN, runDur); };
                for (const s of t.samples) {
                    if (s.duration === runDur)
                        runN++;
                    else {
                        flush();
                        runDur = s.duration;
                        runN = 1;
                    }
                }
                flush();
                const sttsBytes = full('stts', 0, 0, be32(stts.length / 2), ...stts.map(be32));
                const stsz = full('stsz', 0, 0, be32(0), be32(t.samples.length), ...t.samples.map(s => be32(s.data.length)));
                const stsc = full('stsc', 0, 0, be32(1), be32(1), be32(1), be32(1));
                const stco = full('stco', 0, 0, be32(offsets.length), ...offsets.map(be32));
                const syncIdx = t.samples.map((s, i) => s.sync ? i + 1 : 0).filter(Boolean);
                const stss = t.kind === 'video' ? full('stss', 0, 0, be32(syncIdx.length), ...syncIdx.map(be32)) : new Uint8Array(0);
                const stsd = full('stsd', 0, 0, be32(1), t.entry);
                const stbl = box('stbl', stsd, sttsBytes, stss, stsc, stsz, stco);
                const mediaHeader = t.kind === 'video' ? full('vmhd', 0, 1, zeros(8)) : full('smhd', 0, 0, zeros(4));
                const dinf = box('dinf', full('dref', 0, 0, be32(1), full('url ', 0, 1)));
                const minf = box('minf', mediaHeader, dinf, stbl);
                const hdlr = full('hdlr', 0, 0, be32(0), str(t.kind === 'video' ? 'vide' : 'soun'), zeros(12), str(t.kind === 'video' ? 'VideoHandler' : 'SoundHandler'), u8(0));
                const mdhd = full('mdhd', 0, 0, be32(0), be32(0), be32(t.timescale), be32(durMedia), be16(0x55c4), be16(0));
                const tkhd = full('tkhd', 0, 7, be32(0), be32(0), be32(t.id), be32(0), be32(durMovie), zeros(8), be16(0), be16(0), be16(t.kind === 'audio' ? 0x0100 : 0), be16(0), MATRIX, be32(t.kind === 'video' ? t.width << 16 : 0), be32(t.kind === 'video' ? t.height << 16 : 0));
                return box('trak', tkhd, box('mdia', mdhd, hdlr, minf));
            });
            const mvhd = full('mvhd', 0, 0, be32(0), be32(0), be32(movieTs), be32(movieDur), be32(0x00010000), be16(0x0100), be16(0), zeros(8), MATRIX, zeros(24), be32(tracks.length + 1));
            return box('moov', mvhd, ...traks);
        }
        function muxMp4(tracks, brandsCompat) {
            const ftyp = box('ftyp', str('isom'), be32(512), ...['isom', 'iso2', ...brandsCompat, 'mp41'].map(str));
            /* ordem de gravação: intercalada por tempo */
            const order = [];
            for (const t of tracks)
                t.samples.forEach((s, i) => order.push({ t, i, time: s.dts / t.timescale }));
            order.sort((a, b) => a.time - b.time || (a.t.kind === 'video' ? -1 : 1));
            const layout = new Map(tracks.map(t => [t, new Array(t.samples.length).fill(0)]));
            let off = 0;
            for (const o of order) {
                layout.get(o.t)[o.i] = off;
                off += o.t.samples[o.i].data.length;
            }
            if (off > MAX_BYTES)
                throw Error('Video is too large for a single MP4 (4 GB limit)');
            const probe = buildMoov(tracks, 0, layout);
            const dataStart = ftyp.length + probe.length + 8;
            const moov = buildMoov(tracks, dataStart, layout);
            const mdatHeader = cat(be32(off + 8), str('mdat'));
            return new Blob([ftyp, moov, mdatHeader, ...order.map(o => o.t.samples[o.i].data)], { type: 'video/mp4' });
        }
        /* ------------------------------------------------------------------
         * Suporte do navegador
         * ------------------------------------------------------------------ */
        const hasWebCodecs = () => typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof VideoFrame !== 'undefined' && typeof AudioData !== 'undefined';
        function videoCandidates(width, height) {
            const big = width * height > 1920 * 1088;
            return [
                { id: 'avc', codec: big ? 'avc1.640033' : 'avc1.640028' }, { id: 'avc', codec: 'avc1.4d0028' }, { id: 'avc', codec: 'avc1.42001f' },
                { id: 'vp9', codec: big ? 'vp09.00.50.08' : 'vp09.00.40.08' },
                { id: 'av1', codec: big ? 'av01.0.12M.08' : 'av01.0.08M.08' }
            ];
        }
        async function pickVideo(width, height, fps, bitrate, want) {
            for (const c of videoCandidates(width, height)) {
                if (want !== 'auto' && c.id !== want)
                    continue;
                const config = { codec: c.codec, width, height, bitrate, framerate: fps };
                if (c.id === 'avc')
                    config.avc = { format: 'avc' };
                try {
                    const r = await VideoEncoder.isConfigSupported(config);
                    if (r.supported)
                        return { id: c.id, config: r.config ?? config };
                }
                catch { /* próximo */ }
            }
            return null;
        }
        async function pickAudio(bitrate, want) {
            const list = [{ id: 'aac', codec: 'mp4a.40.2' }, { id: 'opus', codec: 'opus' }];
            for (const c of list) {
                if (want !== 'auto' && c.id !== want)
                    continue;
                const config = { codec: c.codec, sampleRate: SR, numberOfChannels: 2, bitrate };
                try {
                    const r = await AudioEncoder.isConfigSupported(config);
                    if (r.supported)
                        return { id: c.id, config: r.config ?? config };
                }
                catch { /* próximo */ }
            }
            return null;
        }
        async function supportedCodecs() {
            const out = { video: [], audio: [], webcodecs: hasWebCodecs(), secureContext: typeof isSecureContext === 'boolean' ? isSecureContext : false };
            if (!out.webcodecs)
                return out;
            for (const id of ['avc', 'vp9', 'av1'])
                if (await pickVideo(1280, 720, 30, 2_000_000, id))
                    out.video.push(id);
            for (const id of ['aac', 'opus'])
                if (await pickAudio(96_000, id))
                    out.audio.push(id);
            return out;
        }
        /* ------------------------------------------------------------------
         * Mixagem de áudio (offline, determinística)
         * ------------------------------------------------------------------ */
        async function mixAudio(plan, sampleRate = SR) {
            const warnings = [];
            if (!plan.audio.length || plan.duration <= 0)
                return { buffer: null, warnings };
            const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
            if (!Off)
                throw Error('This browser cannot mix audio');
            const length = Math.ceil(plan.duration * sampleRate);
            const ctx = new Off(2, length, sampleRate);
            const decoded = new Map();
            for (const a of plan.audio) {
                if (!decoded.has(a.assetId)) {
                    const blob = A.blobs.get(a.assetId);
                    if (!blob) {
                        decoded.set(a.assetId, null);
                        warnings.push('Audio asset ' + a.assetId + ' is missing; skipped');
                        continue;
                    }
                    try {
                        decoded.set(a.assetId, await ctx.decodeAudioData(await blob.arrayBuffer()));
                    }
                    catch (e) {
                        decoded.set(a.assetId, null);
                        warnings.push('Could not decode audio ' + a.assetId + ': ' + e.message);
                    }
                }
            }
            for (const a of plan.audio) {
                const buf = decoded.get(a.assetId);
                if (!buf)
                    continue;
                const src = ctx.createBufferSource();
                src.buffer = buf;
                src.loop = a.loop;
                const g = ctx.createGain();
                const end = a.start + a.duration;
                g.gain.setValueAtTime(a.fadeIn > 0 ? 0 : a.gain, 0);
                if (a.fadeIn > 0) {
                    g.gain.setValueAtTime(0, a.start);
                    g.gain.linearRampToValueAtTime(a.gain, a.start + a.fadeIn);
                }
                else
                    g.gain.setValueAtTime(a.gain, a.start);
                if (a.fadeOut > 0) {
                    g.gain.setValueAtTime(a.gain, Math.max(a.start, end - a.fadeOut));
                    g.gain.linearRampToValueAtTime(0, end);
                }
                src.connect(g);
                g.connect(ctx.destination);
                src.start(a.start, 0, a.loop ? undefined : Math.min(buf.duration, a.duration));
                if (a.loop)
                    src.stop(end);
            }
            const rendered = await ctx.startRendering();
            let peak = 0;
            for (let c = 0; c < rendered.numberOfChannels; c++) {
                const d = rendered.getChannelData(c);
                for (let i = 0; i < d.length; i++) {
                    const v = Math.abs(d[i]);
                    if (v > peak)
                        peak = v;
                }
            }
            if (peak > 1) {
                for (let c = 0; c < rendered.numberOfChannels; c++) {
                    const d = rendered.getChannelData(c);
                    for (let i = 0; i < d.length; i++)
                        d[i] = d[i] / peak;
                }
                warnings.push('Audio mix clipped (peak ' + peak.toFixed(2) + '); normalized to avoid distortion');
            }
            return { buffer: rendered, warnings };
        }
        /* ------------------------------------------------------------------
         * Exportação MP4
         * ------------------------------------------------------------------ */
        const abortCheck = (signal) => { if (signal?.aborted)
            throw new DOMException('Export cancelled', 'AbortError'); };
        const tick = () => new Promise(r => setTimeout(r, 0));
        function vpcC(codec) {
            const m = /^vp09\.(\d+)\.(\d+)\.(\d+)/.exec(codec) || [];
            const profile = Number(m[1] ?? 0), level = Number(m[2] ?? 40), depth = Number(m[3] ?? 8);
            return full('vpcC', 1, 0, u8(profile, level, (depth << 4) | (1 << 1) | 0, 1, 1, 1), be16(0));
        }
        function opusDops(desc) {
            const dv = desc && desc.length >= 19 ? new DataView(desc.buffer, desc.byteOffset, desc.byteLength) : null;
            const ch = dv ? dv.getUint8(9) : 2, pre = dv ? dv.getUint16(10, true) : 312, rate = dv ? dv.getUint32(12, true) : SR, gain = dv ? dv.getInt16(16, true) : 0;
            return box('dOps', u8(0, ch), be16(pre), be32(rate), be16(gain & 0xffff), u8(0));
        }
        const toBytes = (d) => !d ? undefined : d instanceof ArrayBuffer ? new Uint8Array(d) : new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
        async function exportMp4(projectId, opts = {}) {
            const started = performance.now();
            if (!hasWebCodecs())
                throw Error('This browser has no WebCodecs (VideoEncoder/AudioEncoder). Use Chrome, Brave or Edge over file:// or HTTPS, or the local Hub export.');
            const project = V.get(projectId);
            const plan = V.compile(projectId);
            if (!plan.shots.length)
                throw Error('The video has no shots');
            const scale = clamp(opts.scale ?? 1, 0.1, 1);
            const width = Math.max(16, Math.round(plan.width * scale / 2) * 2), height = Math.max(16, Math.round(plan.height * scale / 2) * 2);
            const fps = plan.fps;
            const warnings = plan.warnings.slice();
            const videoBitrate = Math.round(clamp(opts.videoBitrate ?? width * height * fps * 0.1, 300_000, 80_000_000));
            const vpick = await pickVideo(width, height, fps, videoBitrate, opts.codec ?? 'auto');
            if (!vpick)
                throw Error('No supported video encoder for ' + (opts.codec ?? 'auto') + ' at ' + width + 'x' + height);
            if (vpick.id !== 'avc')
                warnings.push('This browser has no H.264 encoder: the file uses ' + vpick.id.toUpperCase() + '. It plays in Chrome, Firefox and VLC but may not open in some editors; use the local Hub export for H.264.');
            opts.onProgress?.({ phase: 'prepare', done: 0, total: 1 });
            const session = await R.prepare(plan, { width, height, background: project.settings.background, unrevealed: project.settings.unrevealed, subtitles: project.settings.subtitles,
                onProgress: (d, n) => opts.onProgress?.({ phase: 'prepare', done: d, total: n }) });
            warnings.push(...session.warnings.filter(w => !warnings.includes(w)));
            let venc = null, aenc = null;
            try {
                abortCheck(opts.signal);
                /* ---- áudio ---- */
                opts.onProgress?.({ phase: 'audio', done: 0, total: 1 });
                const mix = await mixAudio(plan, SR);
                warnings.push(...mix.warnings);
                const audioChunks = [];
                let audioDesc;
                let apick = null;
                if (mix.buffer) {
                    apick = await pickAudio(Math.round(clamp(opts.audioBitrate ?? 160_000, 32_000, 512_000)), opts.audioCodec ?? 'auto');
                    if (!apick) {
                        warnings.push('No supported audio encoder; the video has no sound');
                    }
                    else {
                        let aerr = null;
                        aenc = new AudioEncoder({ output: (chunk, meta) => {
                                const d = new Uint8Array(chunk.byteLength);
                                chunk.copyTo(d);
                                audioChunks.push({ data: d, ts: chunk.timestamp, dur: chunk.duration ?? 0 });
                                const desc = toBytes(meta?.decoderConfig?.description);
                                if (desc && !audioDesc)
                                    audioDesc = desc.slice();
                            }, error: e => { aerr = e; } });
                        aenc.configure(apick.config);
                        const L = mix.buffer.getChannelData(0), Rr = mix.buffer.numberOfChannels > 1 ? mix.buffer.getChannelData(1) : L;
                        const block = apick.id === 'aac' ? 1024 : 960;
                        for (let off = 0; off < L.length; off += block) {
                            abortCheck(opts.signal);
                            const n = Math.min(block, L.length - off);
                            const planar = new Float32Array(n * 2);
                            planar.set(L.subarray(off, off + n), 0);
                            planar.set(Rr.subarray(off, off + n), n);
                            const data = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(off * 1e6 / SR), data: planar });
                            aenc.encode(data);
                            data.close();
                            if (aenc.encodeQueueSize > 40)
                                await tick();
                            if (aerr)
                                throw aerr;
                        }
                        await aenc.flush();
                        if (aerr)
                            throw aerr;
                    }
                }
                else if (!plan.audio.length)
                    warnings.push('No audio clips: the video is silent');
                /* ---- vídeo ---- */
                const vchunks = [];
                let vdesc;
                let verr = null;
                venc = new VideoEncoder({ output: (chunk, meta) => {
                        const d = new Uint8Array(chunk.byteLength);
                        chunk.copyTo(d);
                        vchunks.push({ data: d, ts: chunk.timestamp, key: chunk.type === 'key', dur: chunk.duration ?? Math.round(1e6 / fps) });
                        const desc = toBytes(meta?.decoderConfig?.description);
                        if (desc && !vdesc)
                            vdesc = desc.slice();
                    }, error: e => { verr = e; } });
                venc.configure(vpick.config);
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                const keyEvery = Math.max(1, Math.round((opts.keyframeSeconds ?? 2) * fps));
                for (let i = 0; i < plan.frames; i++) {
                    abortCheck(opts.signal);
                    session.renderFrame(ctx, i / fps, i);
                    const frame = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
                    venc.encode(frame, { keyFrame: i % keyEvery === 0 });
                    frame.close();
                    if (venc.encodeQueueSize > 6) {
                        while (venc.encodeQueueSize > 2)
                            await tick();
                    }
                    if (verr)
                        throw verr;
                    if (i % 5 === 0) {
                        opts.onProgress?.({ phase: 'encode', done: i + 1, total: plan.frames });
                        await tick();
                    }
                }
                await venc.flush();
                if (verr)
                    throw verr;
                opts.onProgress?.({ phase: 'encode', done: plan.frames, total: plan.frames });
                canvas.width = 0;
                canvas.height = 0;
                /* ---- mux ---- */
                opts.onProgress?.({ phase: 'mux', done: 0, total: 1 });
                if (!vchunks.length)
                    throw Error('The encoder produced no frames');
                const VTS = 90000;
                const vsamples = vchunks.map((c, i) => {
                    const start = Math.round(c.ts * VTS / 1e6);
                    const next = i + 1 < vchunks.length ? Math.round(vchunks[i + 1].ts * VTS / 1e6) : start + Math.round(c.dur * VTS / 1e6);
                    return { data: c.data, dts: start, duration: Math.max(1, next - start), sync: c.key };
                });
                let ventry;
                const vhead = [zeros(6), be16(1), zeros(16), be16(width), be16(height), be32(0x00480000), be32(0x00480000), be32(0), be16(1), zeros(32), be16(0x0018), be16(0xffff)];
                if (vpick.id === 'avc') {
                    if (!vdesc)
                        throw Error('The H.264 encoder did not return codec configuration');
                    ventry = box('avc1', ...vhead, box('avcC', vdesc));
                }
                else if (vpick.id === 'vp9')
                    ventry = box('vp09', ...vhead, vpcC(vpick.config.codec));
                else {
                    if (!vdesc)
                        throw Error('The AV1 encoder did not return codec configuration; choose VP9 or H.264');
                    ventry = box('av01', ...vhead, box('av1C', vdesc));
                }
                const tracks = [{ kind: 'video', timescale: VTS, samples: vsamples, entry: ventry, width, height, id: 1 }];
                if (apick && audioChunks.length) {
                    const asamples = audioChunks.map((c, i) => {
                        const s = Math.round(c.ts * SR / 1e6);
                        const n = i + 1 < audioChunks.length ? Math.round(audioChunks[i + 1].ts * SR / 1e6) : s + Math.round(c.dur * SR / 1e6);
                        return { data: c.data, dts: s, duration: Math.max(1, n - s), sync: true };
                    });
                    const ahead = [zeros(6), be16(1), zeros(8), be16(2), be16(16), be16(0), be16(0), be32(SR << 16)];
                    let aentry;
                    if (apick.id === 'aac') {
                        if (!audioDesc)
                            throw Error('The AAC encoder did not return codec configuration');
                        aentry = box('mp4a', ...ahead, esdsBox(audioDesc));
                    }
                    else
                        aentry = box('Opus', ...ahead, opusDops(audioDesc));
                    tracks.push({ kind: 'audio', timescale: SR, samples: asamples, entry: aentry, width: 0, height: 0, id: 2 });
                }
                const blob = muxMp4(tracks, [vpick.id === 'avc' ? 'avc1' : vpick.id === 'vp9' ? 'vp09' : 'av01']);
                opts.onProgress?.({ phase: 'mux', done: 1, total: 1 });
                return { success: true, blob, mime: 'video/mp4', bytes: blob.size, width, height, fps, frames: plan.frames, duration: plan.duration,
                    videoCodec: vpick.config.codec, audioCodec: apick && audioChunks.length ? apick.config.codec : null, hasAudio: !!(apick && audioChunks.length),
                    warnings, elapsedMs: Math.round(performance.now() - started) };
            }
            finally {
                try {
                    venc?.close();
                }
                catch { /* já fechado */ }
                try {
                    aenc?.close();
                }
                catch { /* já fechado */ }
                session.dispose();
            }
        }
        /* ------------------------------------------------------------------
         * Modo B: Hub local + ffmpeg (H.264/AAC garantidos, sem limite de memória do navegador)
         * ------------------------------------------------------------------ */
        async function hubOf() {
            if (!kernel.has('assetHub'))
                return null;
            const h = await kernel.require('assetHub');
            return h.isConnected() ? h : null;
        }
        async function hubStatus() {
            const off = { connected: false, enabled: false, reason: 'Conecte o Hub em Mais ▸ Catálogo de imagens', ffmpeg: null, h264: false, vp9: false, aac: false, opus: false };
            const hub = await hubOf();
            if (!hub)
                return off;
            try {
                const res = await hub.request('/v1/render/capabilities');
                if (!res.ok)
                    return { ...off, connected: true, reason: 'O Hub não respondeu às capacidades de renderização (' + res.status + '). Atualize o Hub.' };
                const body = await res.json();
                return { connected: true, enabled: !!body.data.enabled, reason: body.data.reason ?? null, ffmpeg: body.data.ffmpeg ?? null, h264: !!body.data.h264, vp9: !!body.data.vp9, aac: !!body.data.aac, opus: !!body.data.opus };
            }
            catch (e) {
                return { ...off, reason: 'Sem resposta do Hub: ' + e.message };
            }
        }
        async function hubJson(hub, path, init) {
            const res = await hub.request(path, init);
            const body = await res.json().catch(() => null);
            if (!res.ok || !body || body.ok === false)
                throw Error('Hub: ' + (body?.error ? body.error.code + ' — ' + body.error.message : 'HTTP ' + res.status));
            return { data: body.data ?? {} };
        }
        async function exportViaHub(projectId, opts = {}) {
            const started = performance.now();
            const hub = await hubOf();
            if (!hub)
                throw Error('O Hub não está conectado. Abra Mais ▸ Catálogo de imagens e informe a URL e o token.');
            const st = await hubStatus();
            if (!st.enabled)
                throw Error('Renderização indisponível neste Hub: ' + (st.reason ?? 'ffmpeg ausente'));
            const codec = opts.codec ?? (st.h264 ? 'h264' : 'vp9');
            if ((codec === 'h264' && !st.h264) || (codec === 'vp9' && !st.vp9))
                throw Error('O ffmpeg do Hub não tem o codec ' + codec);
            const project = V.get(projectId);
            const plan = V.compile(projectId);
            if (!plan.shots.length)
                throw Error('The video has no shots');
            const scale = clamp(opts.scale ?? 1, 0.1, 1);
            const width = Math.max(16, Math.round(plan.width * scale / 2) * 2), height = Math.max(16, Math.round(plan.height * scale / 2) * 2);
            const warnings = plan.warnings.slice();
            const frameFormat = opts.frameFormat ?? 'png';
            const assets = Array.from(new Set(plan.audio.map(a => a.assetId)));
            const srcKey = new Map(assets.map((id, i) => [id, 'f' + i]));
            const spec = { width, height, fps: plan.fps, duration: plan.duration, frames: plan.frames, frameFormat, codec, crf: opts.crf ?? 18, audioBitrate: opts.audioBitrate ?? 192_000,
                audio: plan.audio.map((a, i) => ({ key: 'a' + i, src: srcKey.get(a.assetId), start: a.start, duration: a.duration, gain: a.gain, fadeIn: a.fadeIn, fadeOut: a.fadeOut, loop: a.loop })) };
            const created = await hubJson(hub, '/v1/render/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec) });
            const jobId = String(created.data['jobId']);
            const base = '/v1/render/jobs/' + jobId;
            let session = null;
            try {
                opts.onProgress?.({ phase: 'prepare', done: 0, total: 1 });
                for (const id of assets) {
                    abortCheck(opts.signal);
                    const blob = A.blobs.get(id);
                    if (!blob) {
                        warnings.push('Audio asset ' + id + ' is missing; skipped');
                        continue;
                    }
                    await hubJson(hub, base + '/audio/' + srcKey.get(id), { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
                }
                /* áudios ausentes: o Hub exige todos; reenvia silêncio mínimo para manter o job consistente */
                const missing = assets.filter(id => !A.blobs.get(id));
                for (const id of missing)
                    await hubJson(hub, base + '/audio/' + srcKey.get(id), { method: 'PUT', body: new Blob([new Uint8Array(44)], { type: 'audio/wav' }) }).catch(() => undefined);
                session = await R.prepare(plan, { width, height, background: project.settings.background, unrevealed: project.settings.unrevealed, subtitles: project.settings.subtitles,
                    onProgress: (d, n) => opts.onProgress?.({ phase: 'prepare', done: d, total: n }) });
                warnings.push(...session.warnings.filter(w => !warnings.includes(w)));
                await hubJson(hub, base + '/start', { method: 'POST' });
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                for (let i = 0; i < plan.frames; i++) {
                    abortCheck(opts.signal);
                    session.renderFrame(ctx, i / plan.fps, i);
                    const blob = await new Promise(r => canvas.toBlob(r, frameFormat === 'jpeg' ? 'image/jpeg' : 'image/png', 0.95));
                    if (!blob)
                        throw Error('Could not encode frame ' + i);
                    await hubJson(hub, base + '/frames', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob });
                    if (i % 3 === 0)
                        opts.onProgress?.({ phase: 'encode', done: i + 1, total: plan.frames });
                }
                canvas.width = 0;
                canvas.height = 0;
                opts.onProgress?.({ phase: 'mux', done: 0, total: 1 });
                await hubJson(hub, base + '/finish', { method: 'POST' });
                const out = await hub.request(base + '/output');
                if (!out.ok)
                    throw Error('Hub: could not download the video (' + out.status + ')');
                const blob = new Blob([await out.arrayBuffer()], { type: 'video/mp4' });
                opts.onProgress?.({ phase: 'mux', done: 1, total: 1 });
                const hasAudio = plan.audio.length > 0;
                return { success: true, blob, mime: 'video/mp4', bytes: blob.size, width, height, fps: plan.fps, frames: plan.frames, duration: plan.duration,
                    videoCodec: codec === 'h264' ? 'h264 (ffmpeg)' : 'vp9 (ffmpeg)', audioCodec: hasAudio ? (codec === 'h264' ? 'aac' : 'opus') : null, hasAudio, warnings,
                    elapsedMs: Math.round(performance.now() - started) };
            }
            finally {
                session?.dispose();
                try {
                    await hub.request(base, { method: 'DELETE' });
                }
                catch { /* o Hub limpa trabalhos ociosos */ }
            }
        }
        function download(result, name = 'visualboard-video') {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(result.blob);
            a.download = name.replace(/[^\w.-]+/g, '_').replace(/\.mp4$/i, '') + '.mp4';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        }
        kernel.provide('videoExport', { supportedCodecs, mixAudio, exportMp4, download, hubStatus, exportViaHub });
    }
});
