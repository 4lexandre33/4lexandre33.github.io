"use strict";
/* Fase 24 — operações de edição de áudio sobre clipes do vídeo: validação de cadeias, prévia, gravação transacional
 * (novos clipes ou troca do áudio do clipe), divisão por silêncio e nivelamento de vozes. Sem interface. */
definePlugin({
    id: 'audio-edit',
    version: '1.0.0',
    needs: ['audioEditCore', 'video', 'assets', 'state', 'history', 'backend', 'utils'],
    provides: ['audioEdit'],
    uses: ['app'],
    accepts: { audioEditCore: '^1.0.0', video: '^1.0.0', assets: '^1.0.0', state: '^1.0.0', history: '^1.0.0', backend: '^1.0.0', utils: '^1.0.0', app: '^1.0.0' },
    contractVersions: { audioEdit: '1.0.0' },
    setup: async function (kernel) {
        const core = await kernel.require('audioEditCore');
        const V = await kernel.require('video');
        const A = await kernel.require('assets');
        const S = (await kernel.require('state')).data;
        const H = await kernel.require('history');
        const backend = await kernel.require('backend');
        const LIMITS = { maxSeconds: 600, maxChannels: 2, maxSteps: 12, maxSegments: 50, maxBytes: 120 * 1024 * 1024 };
        const KINDS = ['voice', 'narration', 'sfx', 'music', 'ambient'];
        const LUFS_TARGET = { voice: -16, narration: -18, sfx: -14, music: -22, ambient: -26 };
        const fail = (code, message) => { const e = new Error(message); e.code = code; throw e; };
        const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
        const r3 = (n) => Math.round(n * 1000) / 1000;
        const tick = () => new Promise(res => { setTimeout(res, 0); });
        /* ---------------- validação das etapas ---------------- */
        function num(v, d, min, max, name) {
            if (v === undefined || v === null) {
                if (d === undefined)
                    fail('INVALID_ARGUMENT', name + ' é obrigatório');
                return d;
            }
            if (typeof v !== 'number' || !Number.isFinite(v))
                fail('INVALID_ARGUMENT', name + ' deve ser um número');
            if (v < min || v > max)
                fail('INVALID_ARGUMENT', name + ' deve estar entre ' + min + ' e ' + max);
            return v;
        }
        function pick(v, list, d, name) {
            if (v === undefined || v === null)
                return d;
            if (!list.includes(v))
                fail('INVALID_ARGUMENT', name + ' deve ser um de: ' + list.join(', '));
            return v;
        }
        const KEYS = {
            trim: ['start', 'end'], cut: ['start', 'end'], gain: ['db'], normalize: ['mode', 'target', 'ceiling'], fade: ['fadeIn', 'fadeOut', 'curve'],
            compress: ['threshold', 'ratio', 'attack', 'release', 'makeup'], limit: ['ceiling'], highpass: ['freq'], lowpass: ['freq'], notch: ['freq', 'q', 'harmonics'],
            eq: ['bands'], gate: ['threshold', 'release', 'floor'], denoise: ['profileStart', 'profileEnd', 'amount'], declick: ['sensitivity'], speed: ['factor'],
            pitch: ['semitones'], rate: ['factor'], effect: ['name', 'amount'], trimSilence: ['threshold', 'keep', 'shrinkTo'], pad: ['before', 'after'], reverse: [],
            mixdown: [], resample: ['sampleRate'], loopFit: ['crossfade']
        };
        const EFFECTS = ['telephone', 'radio', 'megaphone', 'robot', 'echo', 'reverb', 'muffled', 'whisper'];
        function normStep(raw, i) {
            if (!isObj(raw) || typeof raw['op'] !== 'string')
                return fail('INVALID_ARGUMENT', 'Etapa ' + (i + 1) + ' deve ser um objeto com "op"');
            const op = raw['op'];
            if (!Object.prototype.hasOwnProperty.call(KEYS, op))
                return fail('INVALID_ARGUMENT', 'Etapa ' + (i + 1) + ': operação desconhecida "' + String(raw['op']) + '"');
            for (const k of Object.keys(raw))
                if (k !== 'op' && !KEYS[op].includes(k))
                    fail('INVALID_ARGUMENT', 'Etapa ' + (i + 1) + ' (' + op + '): parâmetro desconhecido ' + k);
            const w = 'Etapa ' + (i + 1) + ' (' + op + '): ';
            const n = (k, d, a, b) => num(raw[k], d, a, b, w + k);
            switch (op) {
                case 'trim':
                case 'cut': {
                    const start = n('start', undefined, 0, 36000), end = n('end', undefined, 0, 36000);
                    if (end <= start)
                        fail('INVALID_ARGUMENT', w + 'end deve ser maior que start');
                    return { op, start: r3(start), end: r3(end) };
                }
                case 'gain': return { op, db: n('db', 0, -60, 40) };
                case 'normalize': {
                    const mode = pick(raw['mode'], ['peak', 'lufs'], 'lufs', w + 'mode');
                    return { op, mode, target: n('target', mode === 'peak' ? -1 : -16, mode === 'peak' ? -60 : -40, mode === 'peak' ? 0 : -5), ceiling: n('ceiling', -1, -20, 0) };
                }
                case 'fade': return { op, fadeIn: n('fadeIn', 0, 0, 30), fadeOut: n('fadeOut', 0, 0, 30), curve: pick(raw['curve'], ['linear', 'sine', 'exp'], 'sine', w + 'curve') };
                case 'compress': return { op, threshold: n('threshold', -20, -60, 0), ratio: n('ratio', 3, 1, 20), attack: n('attack', 0.01, 0.0005, 0.5), release: n('release', 0.15, 0.01, 2), makeup: n('makeup', 0, 0, 24) };
                case 'limit': return { op, ceiling: n('ceiling', -1, -20, 0) };
                case 'highpass': return { op, freq: n('freq', 80, 20, 2000) };
                case 'lowpass': return { op, freq: n('freq', 12000, 500, 20000) };
                case 'notch': return { op, freq: n('freq', 60, 20, 2000), q: n('q', 30, 5, 100), harmonics: Math.round(n('harmonics', 3, 1, 6)) };
                case 'eq': {
                    const bands = raw['bands'];
                    if (!Array.isArray(bands) || !bands.length || bands.length > 5)
                        return fail('INVALID_ARGUMENT', w + 'bands deve ter de 1 a 5 bandas');
                    return { op, bands: bands.map((b, k) => {
                            if (!isObj(b))
                                return fail('INVALID_ARGUMENT', w + 'bands[' + k + '] inválida');
                            for (const key of Object.keys(b))
                                if (!['type', 'freq', 'gain', 'q'].includes(key))
                                    fail('INVALID_ARGUMENT', w + 'bands[' + k + ']: parâmetro desconhecido ' + key);
                            return { type: pick(b['type'], ['peak', 'lowshelf', 'highshelf'], 'peak', w + 'type'), freq: num(b['freq'], undefined, 20, 20000, w + 'freq'), gain: num(b['gain'], undefined, -24, 24, w + 'gain'), q: num(b['q'], 1, 0.1, 10, w + 'q') };
                        }) };
                }
                case 'gate': return { op, threshold: n('threshold', -45, -80, -10), release: n('release', 0.2, 0.01, 2), floor: n('floor', -40, -80, 0) };
                case 'denoise': {
                    const ps = n('profileStart', undefined, 0, 36000), pe = n('profileEnd', undefined, 0, 36000);
                    if (pe - ps < 0.2 || pe - ps > 10)
                        fail('INVALID_ARGUMENT', w + 'o trecho de ruído deve ter de 0,2 a 10 s');
                    return { op, profileStart: r3(ps), profileEnd: r3(pe), amount: n('amount', 12, 3, 40) };
                }
                case 'declick': return { op, sensitivity: n('sensitivity', 10, 3, 30) };
                case 'speed': return { op, factor: n('factor', 1, 0.5, 2) };
                case 'pitch': return { op, semitones: n('semitones', 0, -12, 12) };
                case 'rate': return { op, factor: n('factor', 1, 0.5, 2) };
                case 'effect': return { op, name: pick(raw['name'], EFFECTS, 'telephone', w + 'name'), amount: n('amount', 0.6, 0, 1) };
                case 'trimSilence': {
                    const s = raw['shrinkTo'];
                    return { op, threshold: n('threshold', -50, -80, -20), keep: n('keep', 0.08, 0, 2), shrinkTo: s === undefined || s === null ? null : num(s, undefined, 0.05, 5, w + 'shrinkTo') };
                }
                case 'pad': return { op, before: n('before', 0, 0, 30), after: n('after', 0, 0, 30) };
                case 'reverse': return { op };
                case 'mixdown': return { op };
                case 'resample': {
                    const sr = n('sampleRate', 44100, 8000, 192000);
                    if (![8000, 16000, 22050, 24000, 32000, 44100, 48000].includes(sr))
                        fail('INVALID_ARGUMENT', w + 'sampleRate deve ser 8000, 16000, 22050, 24000, 32000, 44100 ou 48000');
                    return { op, sampleRate: sr };
                }
                default: return { op: 'loopFit', crossfade: n('crossfade', 0.1, 0.01, 5) };
            }
        }
        function validate(steps) {
            if (steps === undefined || steps === null)
                return { steps: [], warnings: [] };
            if (!Array.isArray(steps))
                return fail('INVALID_ARGUMENT', 'steps deve ser uma lista de etapas');
            if (steps.length > LIMITS.maxSteps)
                fail('INVALID_ARGUMENT', 'No máximo ' + LIMITS.maxSteps + ' etapas por cadeia');
            const out = steps.map((s, i) => normStep(s, i));
            const warnings = [];
            const speedSteps = out.filter(s => s.op === 'speed' || s.op === 'pitch').length;
            if (speedSteps > 1)
                warnings.push('Mais de uma etapa de velocidade/tom acumula artefatos');
            return { steps: out, warnings };
        }
        const DEFAULT_RAW = {
            trim: { start: 0, end: 1 }, cut: { start: 0, end: 1 }, gain: {}, normalize: {}, fade: { fadeIn: 0.01, fadeOut: 0.05 }, compress: {}, limit: {}, highpass: {}, lowpass: {}, notch: {},
            eq: { bands: [{ type: 'peak', freq: 3000, gain: 3 }] }, gate: {}, denoise: { profileStart: 0, profileEnd: 0.5 }, declick: {}, speed: {}, pitch: {}, rate: {}, effect: {},
            trimSilence: {}, pad: {}, reverse: {}, mixdown: {}, resample: {}, loopFit: {}
        };
        function defaults(op) {
            if (!Object.prototype.hasOwnProperty.call(KEYS, op))
                fail('INVALID_ARGUMENT', 'Operação desconhecida: ' + String(op));
            return { ...normStep({ op, ...DEFAULT_RAW[op] }, 0) };
        }
        /* ---------------- leitura do clipe ---------------- */
        function clipOf(projectId, clipId) {
            let project;
            try {
                project = V.get(projectId);
            }
            catch {
                return fail('CLIP_NOT_FOUND', 'Projeto de vídeo não encontrado: ' + projectId);
            }
            const clip = project.clips.find(c => c.id === clipId);
            return clip ?? fail('CLIP_NOT_FOUND', 'Clipe não encontrado: ' + clipId);
        }
        const cache = new Map();
        async function decodeAsset(assetId) {
            const hit = cache.get(assetId);
            if (hit)
                return hit;
            const blob = A.blobs.get(assetId);
            if (!blob)
                return fail('CLIP_NOT_FOUND', 'O áudio do clipe não está disponível');
            const buf = await blob.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let pcm;
            if (bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46)
                pcm = core.parseWav(bytes);
            else {
                const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
                if (!Ctx)
                    return fail('UNSUPPORTED_AUDIO', 'Este navegador não decodifica áudio');
                let decoded;
                try {
                    decoded = await new Ctx(1, 1, 48000).decodeAudioData(buf.slice(0));
                }
                catch (e) {
                    return fail('UNSUPPORTED_AUDIO', 'Não foi possível decodificar o áudio: ' + e.message);
                }
                const nch = Math.min(2, decoded.numberOfChannels);
                pcm = { sampleRate: decoded.sampleRate, channels: Array.from({ length: nch }, (_, k) => new Float32Array(decoded.getChannelData(k))) };
            }
            if (pcm.channels[0].length / pcm.sampleRate > LIMITS.maxSeconds)
                fail('AUDIO_TOO_LONG', 'O áudio passa de ' + LIMITS.maxSeconds / 60 + ' minutos; corte antes de processar');
            cache.set(assetId, pcm);
            if (cache.size > 4)
                cache.delete(cache.keys().next().value);
            return pcm;
        }
        async function decode(projectId, clipId) { return decodeAsset(clipOf(projectId, clipId).assetId); }
        const round = (a) => a;
        async function analyze(projectId, clipId, columns = 800) {
            const pcm = await decode(projectId, clipId), w = core.waveform(pcm, columns);
            return { analysis: round(core.analyze(pcm)), waveform: { min: Array.from(w.min, v => r3(v)), max: Array.from(w.max, v => r3(v)) }, silences: core.findSilences(pcm, -45, 0.3).map(s => ({ start: r3(s.start), end: r3(s.end) })) };
        }
        /* ---------------- prévia ---------------- */
        async function runChain(pcm, steps, warnings, signal) {
            let cur = pcm;
            for (const s of steps) {
                if (signal?.aborted)
                    fail('CANCELLED', 'Operação cancelada');
                await tick();
                try {
                    cur = core.applyStep(cur, s, warnings);
                }
                catch (e) {
                    const er = e;
                    throw er.code ? er : Object.assign(er, { code: 'INVALID_ARGUMENT' });
                }
            }
            return cur;
        }
        const baseOf = (clip) => clip.label.replace(/[^\p{L}\p{N} _.\-]/gu, ' ').trim().slice(0, 60) || 'audio';
        async function preview(projectId, clipId, rawSteps, signal) {
            const clip = clipOf(projectId, clipId), v = validate(rawSteps), warnings = [...v.warnings];
            const src = await decodeAsset(clip.assetId), before = core.analyze(src);
            const out = await runChain(src, v.steps, warnings, signal);
            const dur = out.channels[0].length / out.sampleRate;
            if (!out.channels[0].length)
                return fail('NO_RESULT', 'A cadeia não produziu áudio');
            return { projectId, clipId, kind: clip.kind, sourceName: clip.label, steps: v.steps, parts: [{ name: baseOf(clip) + '_editado', pcm: out, start: 0, end: r3(dur) }], before, after: [core.analyze(out)], warnings };
        }
        function release(p) { p.parts = []; }
        /* ---------------- gravação transacional ---------------- */
        function cleanupAssets(ids) {
            for (const id of ids) {
                const url = A.urls.get(id);
                if (url) {
                    try {
                        URL.revokeObjectURL(url);
                    }
                    catch { /* ignore */ }
                }
                A.urls.delete(id);
                A.blobs.delete(id);
                S.assets = S.assets.filter(a => a.id !== id);
                void backend.del('blobs', id).catch(() => { });
            }
        }
        async function commitInner(p, o, hook) {
            const src = clipOf(p.projectId, p.clipId);
            const mode = o.mode ?? 'new', bits = o.bits === 32 ? 32 : 16;
            const kind = o.kind ? pick(o.kind, KINDS, src.kind, 'kind') : src.kind;
            const idx = o.indices ?? p.parts.map((_, i) => i);
            if (!idx.length || idx.some(i => !Number.isInteger(i) || i < 0 || i >= p.parts.length))
                fail('INVALID_ARGUMENT', 'Índice de trecho inválido');
            if (mode === 'replace' && idx.length !== 1)
                fail('INVALID_ARGUMENT', 'Substituir exige exatamente um trecho');
            const files = idx.map(i => {
                const part = p.parts[i];
                const bytes = core.encodeWav(part.pcm, bits);
                if (bytes.length > LIMITS.maxBytes)
                    fail('AUDIO_TOO_LONG', 'O arquivo passa de ' + Math.round(LIMITS.maxBytes / 1048576) + ' MB');
                const name = (idx.length === 1 && o.name ? o.name : part.name).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);
                return { name, file: new File([bytes], name + '.wav', { type: 'audio/wav' }), part };
            });
            const created = [], clips = [];
            let bound = 0;
            try {
                await H.transaction('audioEdit.' + (mode === 'replace' ? 'replace' : 'commit'), async () => {
                    for (const f of files) {
                        const clip = await V.importClip(p.projectId, f.file, kind, f.name);
                        created.push(clip.assetId);
                        const asset = S.assets.find(a => a.id === clip.assetId);
                        if (asset) {
                            asset.derivedFrom = src.assetId;
                            asset.operations = p.steps.map(s => ({ processor: 'audioEdit', operation: s.op, params: { ...s } }));
                        }
                        if (mode === 'replace') {
                            const updated = await V.replaceClipAsset(p.projectId, p.clipId, clip.assetId, clip.id);
                            clips.push({ id: updated.id, assetId: updated.assetId, label: updated.label, duration: updated.duration, kind: updated.kind });
                        }
                        else
                            clips.push({ id: clip.id, assetId: clip.assetId, label: clip.label, duration: clip.duration, kind: clip.kind });
                    }
                    if (hook)
                        bound = await hook(clips);
                });
            }
            catch (e) {
                cleanupAssets(created);
                throw Object.assign(e, { code: e.code ?? 'COMMIT_FAILED' });
            }
            let saved = false;
            if (kernel.has('app')) {
                try {
                    saved = !!(await kernel.call('app', 'saveNow'));
                }
                catch { /* sem salvamento */ }
            }
            kernel.emit('assets:changed');
            kernel.emit('toast', { message: mode === 'replace' ? 'Áudio do clipe substituído.' : clips.length + (clips.length === 1 ? ' clipe criado' : ' clipes criados'), kind: 'ok' });
            return { projectId: p.projectId, sourceClipId: p.clipId, clips, replaced: mode === 'replace', warnings: p.warnings, analysis: idx.map(i => p.after[i] ?? p.after[0]), bound, saved };
        }
        const commit = (p, o = {}) => commitInner(p, o);
        async function apply(projectId, clipId, steps, o = {}) {
            const p = await preview(projectId, clipId, steps);
            try {
                return await commit(p, o);
            }
            finally {
                release(p);
            }
        }
        const replaceClip = (projectId, clipId, steps) => apply(projectId, clipId, steps, { mode: 'replace' });
        async function splitBySilence(projectId, clipId, opts = {}) {
            const clip = clipOf(projectId, clipId), v = validate(opts.steps), warnings = [...v.warnings];
            const o = {
                threshold: num(opts.threshold, -45, -80, -20, 'threshold'), minSilence: num(opts.minSilence, 0.35, 0.05, 10, 'minSilence'),
                pad: num(opts.pad, 0.08, 0, 1, 'pad'), minSpeech: num(opts.minSpeech, 0.15, 0.02, 30, 'minSpeech')
            };
            const src = await decodeAsset(clip.assetId), before = core.analyze(src), segs = core.splitBySilence(src, o);
            if (!segs.length)
                return fail('NO_RESULT', 'Nenhuma fala encontrada; ajuste o limiar de silêncio');
            if (segs.length > LIMITS.maxSegments)
                fail('INVALID_ARGUMENT', 'A divisão geraria ' + segs.length + ' trechos (máximo ' + LIMITS.maxSegments + '); aumente o silêncio mínimo');
            const parts = [], after = [];
            for (let i = 0; i < segs.length; i++) {
                const sg = segs[i];
                await tick();
                const pcm = await runChain(core.slice(src, sg.start, sg.end), v.steps, warnings);
                parts.push({ name: baseOf(clip) + '_fala-' + (i + 1), pcm, start: sg.start, end: sg.end });
                after.push(core.analyze(pcm));
            }
            const p = { projectId, clipId, kind: clip.kind, sourceName: clip.label, steps: v.steps, parts, before, after, warnings };
            try {
                return await commitInner(p, { mode: 'new' }, opts.bind ? async (made) => {
                    /* só os trechos novos entram nos balões livres, na ordem; o clipe original nunca é vinculado */
                    const proj = V.get(projectId), taken = new Set(proj.shots.flatMap(sh => sh.cues.map(c => c.clipId)).filter((x) => !!x));
                    const slots = proj.shots.flatMap(sh => sh.cues).filter(c => c.kind === 'balloon' && !c.clipId && !taken.has(c.id));
                    const n = Math.min(made.length, slots.length);
                    for (let i = 0; i < n; i++)
                        await V.bindClip(projectId, slots[i].id, made[i].id);
                    return n;
                } : undefined);
            }
            finally {
                release(p);
            }
        }
        function recipes() {
            const st = (raw) => validate(raw).steps;
            return [
                { id: 'voz-limpa', name: 'Voz limpa', description: 'Apara silêncio das pontas, corta graves de microfone, comprime de leve e nivela em −16 LUFS.',
                    steps: st([{ op: 'trimSilence', threshold: -50, keep: 0.08 }, { op: 'highpass', freq: 90 }, { op: 'compress', threshold: -20, ratio: 3, makeup: 3 }, { op: 'normalize', mode: 'lufs', target: -16 }]) },
                { id: 'narracao', name: 'Narração', description: 'Voz mais contínua, em −18 LUFS.', steps: st([{ op: 'highpass', freq: 70 }, { op: 'compress', threshold: -22, ratio: 2.5, makeup: 2 }, { op: 'normalize', mode: 'lufs', target: -18 }]) },
                { id: 'telefone', name: 'Telefone', description: 'Voz de telefone (300–3400 Hz).', steps: st([{ op: 'effect', name: 'telephone', amount: 0.6 }, { op: 'normalize', mode: 'lufs', target: -18 }]) },
                { id: 'radio', name: 'Rádio', description: 'Voz de rádio com leve chiado.', steps: st([{ op: 'effect', name: 'radio', amount: 0.6 }, { op: 'normalize', mode: 'lufs', target: -18 }]) },
                { id: 'megafone', name: 'Megafone', description: 'Voz de megafone/alto-falante.', steps: st([{ op: 'effect', name: 'megaphone', amount: 0.6 }, { op: 'normalize', mode: 'lufs', target: -16 }]) },
                { id: 'voz-distante', name: 'Voz distante', description: 'Abafada, com eco de sala.', steps: st([{ op: 'effect', name: 'muffled', amount: 0.5 }, { op: 'effect', name: 'reverb', amount: 0.6 }, { op: 'normalize', mode: 'lufs', target: -22 }]) },
                { id: 'efeito-nivelado', name: 'Efeito sonoro nivelado', description: 'Apara, aplica fade curto e nivela em −14 LUFS.', steps: st([{ op: 'trimSilence', threshold: -55, keep: 0.02 }, { op: 'fade', fadeIn: 0.005, fadeOut: 0.03 }, { op: 'normalize', mode: 'lufs', target: -14 }]) }
            ];
        }
        /** Nivela os clipes do projeto para o alvo de LUFS da categoria, trocando o áudio de cada clipe (um único Desfazer). */
        async function levelVoices(projectId, opts = {}) {
            let project;
            try {
                project = V.get(projectId);
            }
            catch {
                return fail('CLIP_NOT_FOUND', 'Projeto de vídeo não encontrado: ' + projectId);
            }
            const kinds = (opts.kinds && opts.kinds.length ? opts.kinds : ['voice', 'narration']).map(k => pick(k, KINDS, 'voice', 'kinds'));
            const targets = { ...LUFS_TARGET, ...(opts.targets ?? {}) };
            const previews = [], warnings = [];
            for (const c of project.clips.filter(x => kinds.includes(x.kind))) {
                const src = await decodeAsset(c.assetId), l = core.lufs(src), t = num(targets[c.kind], LUFS_TARGET[c.kind], -40, -5, 'target ' + c.kind);
                if (l === null) {
                    warnings.push('Clipe "' + c.label + '" em silêncio: ignorado');
                    continue;
                }
                if (Math.abs(l - t) <= 0.5)
                    continue;
                previews.push(await preview(projectId, c.id, [{ op: 'normalize', mode: 'lufs', target: t }]));
                await tick();
            }
            if (!previews.length)
                return { projectId, sourceClipId: '', clips: [], replaced: true, warnings: [...warnings, 'Todos os clipes já estão no volume alvo'], analysis: [], bound: 0, saved: false };
            const clips = [], analysis = [];
            await H.transaction('audioEdit.levelVoices', async () => {
                for (const p of previews) {
                    const r = await commitInner(p, { mode: 'replace' });
                    clips.push(...r.clips);
                    analysis.push(...r.analysis);
                    warnings.push(...r.warnings);
                    release(p);
                }
            });
            return { projectId, sourceClipId: '', clips, replaced: true, warnings, analysis, bound: 0, saved: true };
        }
        kernel.provide('audioEdit', { limits: () => ({ ...LIMITS }), defaults, validate, decode, analyze, preview, commit, apply, splitBySilence, replaceClip, release, recipes, levelVoices });
    }
});
