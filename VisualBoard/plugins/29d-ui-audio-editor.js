"use strict";
/* Fase 24 — janela do editor de áudio para voice comic: forma de onda, seleção, prévia A/B, limpeza, volume, tom/velocidade, efeitos,
 * receitas, divisão por silêncio, gravação e nivelamento em lote. Toda a lógica de áudio está em audioEdit/audioEditCore; aqui só há interface. */
definePlugin({
    id: 'ui-audio-editor',
    version: '1.0.0',
    needs: ['audioEdit', 'audioEditCore', 'video', 'assets'],
    provides: ['ui.audioEditor'],
    uses: [],
    accepts: { audioEdit: '^1.0.0', audioEditCore: '^1.0.0', video: '^1.0.0', assets: '^1.0.0' },
    contractVersions: { 'ui.audioEditor': '1.0.0' },
    setup: async function (kernel) {
        const E = await kernel.require('audioEdit');
        const C = await kernel.require('audioEditCore');
        const V = await kernel.require('video');
        const TABS = [['cut', '✂ Cortar'], ['split', '⫶ Dividir'], ['clean', '🧹 Limpar'], ['level', '🔊 Volume'], ['tempo', '⏱ Tom e velocidade'], ['fx', '✨ Efeitos'], ['recipes', '📋 Receitas']];
        const KIND_LABEL = { voice: 'Voz', narration: 'Narração', sfx: 'Efeito', music: 'Música', ambient: 'Ambiente' };
        const toast = (message, kind = 'error') => { kernel.emit('toast', { message, kind }); };
        function el(tag, cls, text) {
            const e = document.createElement(tag);
            if (cls)
                e.className = cls;
            if (text !== undefined)
                e.textContent = text;
            return e;
        }
        const fmt = (s) => { const m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(2).padStart(5, '0'); };
        const db = (v) => v === null || !Number.isFinite(v) ? '—' : v.toFixed(1);
        /* ---------------- estado ---------------- */
        let root = null;
        let projectId = null;
        let clipId = null;
        let pcm = null;
        let analysis = null;
        let tab = 'cut';
        let sel = null;
        let cursor = 0;
        let view = { start: 0, dur: 1 };
        let preview = null;
        let previewIdx = 0;
        let busy = '';
        let message = '';
        let token = 0;
        let timer = null;
        let mode = 'new';
        let noise = null;
        let segments = [];
        let playing = null;
        let actx = null;
        let source = null;
        let playStart = 0;
        let playFrom = 0;
        let raf = 0;
        let recorder = null;
        const P = {
            cut: { mode: 'none', trimSilence: false, fadeIn: 0, fadeOut: 0, reverse: false },
            split: { threshold: -45, minSilence: 0.35, pad: 0.08, minSpeech: 0.15, bind: true },
            clean: { highpass: 0, notch: 0, gate: false, gateThreshold: -50, denoise: false, amount: 14, declick: false },
            level: { normalize: true, mode: 'lufs', target: -16, compress: false, threshold: -20, ratio: 3, limit: false, ceiling: -1, gain: 0 },
            tempo: { speed: 1, pitch: 0 },
            fx: { name: 'none', amount: 0.6 },
            recipe: null
        };
        const FX = [['telephone', 'Telefone'], ['radio', 'Rádio'], ['megaphone', 'Megafone'], ['muffled', 'Abafado (distante)'], ['whisper', 'Sussurro'], ['robot', 'Robô'], ['echo', 'Eco'], ['reverb', 'Reverberação']];
        const project = () => { try {
            return projectId ? V.get(projectId) : null;
        }
        catch {
            return null;
        } };
        const clip = () => project()?.clips.find(c => c.id === clipId) ?? null;
        const selRange = () => sel && sel.b - sel.a >= 0.01 ? sel : null;
        const total = () => pcm ? pcm.channels[0].length / pcm.sampleRate : 0;
        /** Monta a cadeia da aba atual. Devolve null quando não há nada a fazer; lança com mensagem clara em caso de pedido inválido. */
        function stepsOf(t) {
            const out = [];
            if (t === 'cut') {
                const c = P.cut, r = selRange();
                if (c.mode !== 'none') {
                    if (!r)
                        throw new Error('Selecione um trecho na forma de onda (arraste).');
                    out.push({ op: c.mode === 'keep' ? 'trim' : 'cut', start: r.a, end: r.b });
                }
                if (c.trimSilence)
                    out.push({ op: 'trimSilence' });
                if (c.fadeIn > 0 || c.fadeOut > 0)
                    out.push({ op: 'fade', fadeIn: c.fadeIn, fadeOut: c.fadeOut });
                if (c.reverse)
                    out.push({ op: 'reverse' });
            }
            else if (t === 'clean') {
                const c = P.clean;
                if (c.highpass > 0)
                    out.push({ op: 'highpass', freq: c.highpass });
                if (c.notch > 0)
                    out.push({ op: 'notch', freq: c.notch, harmonics: 3 });
                if (c.declick)
                    out.push({ op: 'declick' });
                if (c.denoise) {
                    if (!noise)
                        throw new Error('Marque um trecho só com ruído: selecione-o e use "Usar seleção como ruído".');
                    out.push({ op: 'denoise', profileStart: noise.a, profileEnd: noise.b, amount: c.amount });
                }
                if (c.gate)
                    out.push({ op: 'gate', threshold: c.gateThreshold });
            }
            else if (t === 'level') {
                const c = P.level;
                if (c.gain !== 0)
                    out.push({ op: 'gain', db: c.gain });
                if (c.compress)
                    out.push({ op: 'compress', threshold: c.threshold, ratio: c.ratio });
                if (c.normalize)
                    out.push({ op: 'normalize', mode: c.mode, target: c.target });
                if (c.limit)
                    out.push({ op: 'limit', ceiling: c.ceiling });
            }
            else if (t === 'tempo') {
                if (Math.abs(P.tempo.speed - 1) > 0.001)
                    out.push({ op: 'speed', factor: P.tempo.speed });
                if (P.tempo.pitch !== 0)
                    out.push({ op: 'pitch', semitones: P.tempo.pitch });
            }
            else if (t === 'fx') {
                if (P.fx.name !== 'none')
                    out.push({ op: 'effect', name: P.fx.name, amount: P.fx.amount });
            }
            else if (t === 'recipes') {
                const r = P.recipe ? E.recipes().find(x => x.id === P.recipe) : null;
                if (r)
                    out.push(...r.steps);
            }
            return out.length ? out : null;
        }
        /* ---------------- carregar ---------------- */
        function stopPlayback() {
            if (source) {
                try {
                    source.onended = null;
                    source.stop();
                }
                catch { /* já parado */ }
                source.disconnect();
                source = null;
            }
            playing = null;
            cancelAnimationFrame(raf);
        }
        function discardPreview() { token++; stopPlaybackIf('preview'); if (preview) {
            E.release(preview);
            preview = null;
        } }
        function stopPlaybackIf(what) { if (playing === what) {
            stopPlayback();
        } }
        async function loadClip(pid, cid) {
            stopPlayback();
            discardPreview();
            projectId = pid;
            clipId = cid;
            pcm = null;
            analysis = null;
            sel = null;
            noise = null;
            segments = [];
            cursor = 0;
            message = '';
            busy = 'Abrindo áudio…';
            renderAll();
            try {
                pcm = await E.decode(pid, cid);
                analysis = C.analyze(pcm);
                view = { start: 0, dur: Math.max(0.05, total()) };
            }
            catch (e) {
                message = e.message;
            }
            busy = '';
            renderAll();
            schedule(0);
        }
        /* ---------------- prévia ---------------- */
        function schedule(delay = 350) {
            if (timer)
                clearTimeout(timer);
            timer = window.setTimeout(() => { timer = null; void runPreview(); }, delay);
        }
        async function runPreview() {
            if (!root || !projectId || !clipId || !pcm || tab === 'split') {
                drawWave();
                return;
            }
            let steps;
            try {
                steps = stepsOf(tab);
            }
            catch (e) {
                discardPreview();
                message = e.message;
                renderResults();
                drawWave();
                return;
            }
            if (!steps) {
                discardPreview();
                message = '';
                renderResults();
                drawWave();
                return;
            }
            const mine = ++token;
            busy = 'Calculando prévia…';
            message = '';
            renderResults();
            let p = null;
            try {
                p = await E.preview(projectId, clipId, steps);
            }
            catch (e) {
                if (mine === token)
                    message = e.message;
            }
            if (mine !== token) {
                if (p)
                    E.release(p);
                return;
            }
            busy = '';
            if (preview)
                E.release(preview);
            preview = p;
            previewIdx = 0;
            renderResults();
            drawWave();
        }
        /* ---------------- reprodução ---------------- */
        async function play(what, fromSel = false) {
            const src = what === 'preview' ? preview?.parts[previewIdx]?.pcm : pcm;
            if (!src) {
                toast(what === 'preview' ? 'Nenhuma prévia para ouvir: ajuste os controles.' : 'Nada para ouvir.', 'info');
                return;
            }
            stopPlayback();
            if (!actx)
                actx = new AudioContext();
            await actx.resume();
            const buf = actx.createBuffer(src.channels.length, src.channels[0].length, src.sampleRate);
            src.channels.forEach((c, i) => buf.copyToChannel(c, i));
            const r = selRange();
            const dur = buf.duration;
            /* a prévia de cortes toca do início; as demais respeitam o cursor/seleção */
            let from = what === 'preview' && preview && preview.parts[0] && (preview.parts[0].end - preview.parts[0].start) < total() - 0.02 ? 0 : (fromSel && r ? r.a : cursor);
            if (what === 'preview' && tab === 'tempo')
                from = from * (dur / Math.max(0.001, total()));
            if (from >= dur - 0.01)
                from = 0;
            const node = actx.createBufferSource();
            node.buffer = buf;
            node.connect(actx.destination);
            const until = fromSel && r && what === 'original' ? r.b - from : undefined;
            node.onended = () => { if (source === node) {
                source = null;
                playing = null;
                cancelAnimationFrame(raf);
                renderTransport();
                drawWave();
            } };
            if (until !== undefined)
                node.start(0, from, until);
            else
                node.start(0, from);
            source = node;
            playing = what;
            playStart = actx.currentTime;
            playFrom = from;
            tick();
            renderTransport();
        }
        function tick() {
            if (!playing || !actx)
                return;
            const pos = playFrom + (actx.currentTime - playStart);
            if (playing === 'original') {
                cursor = Math.min(total(), pos);
                if (cursor > view.start + view.dur)
                    view.start = Math.max(0, Math.min(total() - view.dur, cursor - view.dur * 0.1));
            }
            drawWave(pos);
            raf = requestAnimationFrame(tick);
        }
        /* ---------------- forma de onda ---------------- */
        let canvas = null;
        let stage = null;
        function timeAt(e) {
            const r = canvas.getBoundingClientRect();
            return Math.max(0, Math.min(total(), view.start + (e.clientX - r.left) / r.width * view.dur));
        }
        function drawWave(playPos) {
            if (!canvas || !pcm)
                return;
            const cssW = canvas.clientWidth || 600, cssH = canvas.clientHeight || 220, dpr = window.devicePixelRatio || 1;
            if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
                canvas.width = Math.round(cssW * dpr);
                canvas.height = Math.round(cssH * dpr);
            }
            const ctx = canvas.getContext('2d');
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, cssW, cssH);
            const cs = getComputedStyle(canvas), line = cs.getPropertyValue('--line').trim() || '#3a3f48', accent = cs.getPropertyValue('--accent').trim() || '#4da3ff';
            const x = (t) => (t - view.start) / view.dur * cssW;
            const tot = total(), cols = Math.max(50, Math.floor(cssW));
            const lanes = preview && preview.parts[0] && tab !== 'split' ? 2 : 1, laneH = cssH / lanes;
            const lane = (src, a, b, top, color, mapX) => {
                const w = C.waveform(src, cols, a, b), mid = top + laneH / 2, amp = laneH / 2 - 3;
                ctx.fillStyle = color;
                for (let i = 0; i < cols; i++) {
                    const t = a + (i / cols) * (b - a), px = mapX(t), nx = mapX(a + ((i + 1) / cols) * (b - a));
                    const y0 = mid - w.max[i] * amp, y1 = mid - w.min[i] * amp;
                    ctx.fillRect(px, y0, Math.max(1, nx - px), Math.max(1, y1 - y0));
                }
                ctx.strokeStyle = line;
                ctx.beginPath();
                ctx.moveTo(0, mid);
                ctx.lineTo(cssW, mid);
                ctx.stroke();
            };
            const a = view.start, b = Math.min(tot, view.start + view.dur);
            lane(pcm, a, b, 0, '#8fb4ff', t => x(t));
            if (lanes === 2 && preview) {
                const pp = preview.parts[previewIdx].pcm, pd = pp.channels[0].length / pp.sampleRate, scaleT = pd / tot;
                ctx.strokeStyle = line;
                ctx.beginPath();
                ctx.moveTo(0, laneH);
                ctx.lineTo(cssW, laneH);
                ctx.stroke();
                lane(pp, a * scaleT, Math.min(pd, b * scaleT), laneH, '#7ee0a0', t => x(t / scaleT));
                ctx.fillStyle = 'rgba(255,255,255,.5)';
                ctx.font = '11px sans-serif';
                ctx.fillText('original', 6, 12);
                ctx.fillText('prévia', 6, laneH + 12);
            }
            if (tab === 'split') {
                ctx.fillStyle = 'rgba(77,163,255,.18)';
                ctx.strokeStyle = accent;
                segments.forEach((s, i) => { ctx.fillRect(x(s.start), 0, x(s.end) - x(s.start), cssH); ctx.strokeRect(x(s.start), 0.5, x(s.end) - x(s.start), cssH - 1); ctx.fillStyle = accent; ctx.fillText(String(i + 1), x(s.start) + 4, 24); ctx.fillStyle = 'rgba(77,163,255,.18)'; });
            }
            const r = selRange();
            if (r) {
                ctx.fillStyle = 'rgba(255,210,77,.22)';
                ctx.fillRect(x(r.a), 0, x(r.b) - x(r.a), cssH);
                ctx.strokeStyle = '#ffd24d';
                ctx.strokeRect(x(r.a), 0.5, x(r.b) - x(r.a), cssH - 1);
            }
            if (noise) {
                ctx.fillStyle = 'rgba(255,100,100,.18)';
                ctx.fillRect(x(noise.a), cssH - 8, x(noise.b) - x(noise.a), 8);
            }
            const cx = x(playing === 'original' && playPos !== undefined ? playPos : cursor);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx + 0.5, 0);
            ctx.lineTo(cx + 0.5, cssH);
            ctx.stroke();
            if (playing === 'preview' && playPos !== undefined) {
                const px = x(playPos / (preview.parts[previewIdx].pcm.channels[0].length / preview.parts[previewIdx].pcm.sampleRate) * tot);
                ctx.strokeStyle = '#7ee0a0';
                ctx.beginPath();
                ctx.moveTo(px + 0.5, 0);
                ctx.lineTo(px + 0.5, cssH);
                ctx.stroke();
            }
        }
        let drag = null;
        function onDown(e) { if (!pcm)
            return; canvas.setPointerCapture(e.pointerId); drag = { t0: timeAt(e), moved: false }; }
        function onMove(e) {
            if (!drag)
                return;
            const t = timeAt(e);
            if (Math.abs(t - drag.t0) * canvas.clientWidth / view.dur > 3)
                drag.moved = true;
            if (drag.moved) {
                sel = { a: Math.min(drag.t0, t), b: Math.max(drag.t0, t) };
                drawWave();
                renderSelInfo();
            }
        }
        function onUp(e) {
            if (!drag)
                return;
            if (!drag.moved) {
                cursor = timeAt(e);
                sel = null;
                if (playing === 'original')
                    void play('original');
            }
            drag = null;
            renderSelInfo();
            drawWave();
            if (tab === 'cut' && P.cut.mode !== 'none')
                schedule(150);
        }
        function onWheel(e) {
            if (!pcm)
                return;
            e.preventDefault();
            const tot = total();
            if (e.ctrlKey || e.metaKey || !e.shiftKey) {
                const t = timeAt(e), f = e.deltaY < 0 ? 0.8 : 1.25, nd = Math.max(0.02, Math.min(tot, view.dur * f));
                view.start = Math.max(0, Math.min(tot - nd, t - (t - view.start) * (nd / view.dur)));
                view.dur = nd;
            }
            else
                view.start = Math.max(0, Math.min(tot - view.dur, view.start + e.deltaY / 500 * view.dur));
            drawWave();
        }
        function zoomBy(f) { const tot = total(), c = view.start + view.dur / 2, nd = Math.max(0.02, Math.min(tot, view.dur * f)); view.start = Math.max(0, Math.min(tot - nd, c - nd / 2)); view.dur = nd; drawWave(); }
        /* ---------------- controles ---------------- */
        function field(label, control, hint) {
            const r = el('div', 'vbae-field');
            r.setAttribute('role', 'group');
            r.setAttribute('aria-label', label);
            r.append(el('span', 'vbae-label', label), control);
            if (hint)
                r.title = hint;
            return r;
        }
        function slider(label, value, min, max, step, on, unit = '', hint, off) {
            const wrap = el('div', 'vbae-slider'), i = el('input');
            i.type = 'range';
            i.min = String(min);
            i.max = String(max);
            i.step = String(step);
            i.value = String(value);
            const show = (v) => (off !== undefined && v === min ? off : v + unit);
            const out = el('output', undefined, show(value));
            i.addEventListener('input', () => { const v = Number(i.value); out.textContent = show(v); on(v); schedule(); });
            wrap.append(i, out);
            return field(label, wrap, hint);
        }
        function check(label, value, on, hint) {
            const i = el('input');
            i.type = 'checkbox';
            i.checked = value;
            i.addEventListener('change', () => { on(i.checked); schedule(0); renderSide(); });
            const r = el('label', 'vbae-check');
            r.append(i, el('span', undefined, label));
            if (hint)
                r.title = hint;
            return r;
        }
        function choice(label, options, value, on, hint) {
            const s = el('select');
            for (const [v, t] of options) {
                const o = el('option', undefined, t);
                o.value = v;
                s.appendChild(o);
            }
            s.value = value;
            s.addEventListener('change', () => { on(s.value); schedule(0); renderSide(); });
            return field(label, s, hint);
        }
        function btn(text, fn, cls = 'btn', title) {
            const b = el('button', cls, text);
            b.type = 'button';
            if (title)
                b.title = title;
            b.addEventListener('click', fn);
            return b;
        }
        function cutControls(box) {
            const c = P.cut;
            box.appendChild(choice('Seleção', [['none', 'Não usar seleção'], ['keep', 'Manter só a seleção'], ['remove', 'Remover a seleção']], c.mode, v => { c.mode = v; }, 'Arraste na forma de onda para selecionar'));
            box.appendChild(check('Aparar silêncio das pontas', c.trimSilence, v => { c.trimSilence = v; }, 'Remove o silêncio do início e do fim, deixando uma folga curta'));
            box.appendChild(slider('Fade-in', c.fadeIn, 0, 1, 0.01, v => { c.fadeIn = v; }, ' s', 'Evita estalo no começo', 'desligado'));
            box.appendChild(slider('Fade-out', c.fadeOut, 0, 2, 0.01, v => { c.fadeOut = v; }, ' s', 'Evita corte seco no fim', 'desligado'));
            box.appendChild(check('Inverter (de trás para frente)', c.reverse, v => { c.reverse = v; }));
            box.appendChild(el('p', 'vbae-note', 'Arraste na forma de onda para selecionar; clique para posicionar o cursor. Roda do mouse dá zoom, Shift+roda rola.'));
        }
        function splitControls(box) {
            const s = P.split;
            const refresh = () => { if (!pcm)
                return; segments = C.splitBySilence(pcm, { threshold: s.threshold, minSilence: s.minSilence, pad: s.pad, minSpeech: s.minSpeech }); drawWave(); renderResults(); };
            const mk = (label, value, min, max, step, unit, set, hint) => {
                const wrap = el('div', 'vbae-slider'), i = el('input');
                i.type = 'range';
                i.min = String(min);
                i.max = String(max);
                i.step = String(step);
                i.value = String(value);
                const out = el('output', undefined, value + unit);
                i.addEventListener('input', () => { const v = Number(i.value); out.textContent = v + unit; set(v); refresh(); });
                wrap.append(i, out);
                return field(label, wrap, hint);
            };
            box.appendChild(mk('Silêncio abaixo de', s.threshold, -80, -20, 1, ' dB', v => { s.threshold = v; }, 'Quanto mais alto, mais som é tratado como silêncio'));
            box.appendChild(mk('Pausa mínima', s.minSilence, 0.05, 3, 0.05, ' s', v => { s.minSilence = v; }, 'Pausas menores que isso não separam falas'));
            box.appendChild(mk('Folga em volta', s.pad, 0, 0.5, 0.01, ' s', v => { s.pad = v; }, 'Mantém um pouco de silêncio antes e depois de cada fala'));
            box.appendChild(mk('Fala mínima', s.minSpeech, 0.05, 3, 0.05, ' s', v => { s.minSpeech = v; }, 'Descarta ruídos curtos'));
            box.appendChild(check('Vincular aos balões livres, na ordem', s.bind, v => { s.bind = v; }, 'Cada trecho novo vai para o próximo balão sem voz'));
            box.appendChild(btn('Detectar falas', refresh, 'btn'));
            box.appendChild(el('p', 'vbae-note', 'Cada fala vira um clipe novo (<nome>_fala-N). O original continua no projeto; um Desfazer remove todos.'));
        }
        function cleanControls(box) {
            const c = P.clean;
            box.appendChild(slider('Cortar graves (passa-altas)', c.highpass, 0, 400, 10, v => { c.highpass = v; }, ' Hz', 'Remove rumble e sopro de microfone; 80–120 Hz é típico para voz', 'desligado'));
            box.appendChild(choice('Zumbido da rede (notch)', [['0', 'Desligado'], ['50', '50 Hz'], ['60', '60 Hz (Brasil)']], String(c.notch), v => { c.notch = Number(v); }, 'Remove o zumbido e seus harmônicos'));
            box.appendChild(check('Remover estalos (declick)', c.declick, v => { c.declick = v; }));
            box.appendChild(check('Reduzir ruído de fundo', c.denoise, v => { c.denoise = v; }, 'Funciona melhor com chiado constante (ventilador, ar-condicionado)'));
            if (c.denoise) {
                box.appendChild(slider('Quantidade', c.amount, 3, 30, 1, v => { c.amount = v; }, ' dB'));
                const use = btn('Usar seleção como ruído', () => { const r = selRange(); if (!r || r.b - r.a < 0.2) {
                    toast('Selecione pelo menos 0,2 s só com ruído (sem fala).', 'info');
                    return;
                } noise = { ...r }; renderSide(); schedule(0); drawWave(); }, 'btn');
                box.appendChild(use);
                box.appendChild(el('p', 'vbae-note', noise ? 'Ruído marcado: ' + fmt(noise.a) + ' – ' + fmt(noise.b) : 'Ainda sem trecho de ruído marcado (barra vermelha na base).'));
            }
            box.appendChild(check('Porta de ruído (silencia pausas)', c.gate, v => { c.gate = v; }));
            if (c.gate)
                box.appendChild(slider('Limiar da porta', c.gateThreshold, -80, -20, 1, v => { c.gateThreshold = v; }, ' dB'));
        }
        function levelControls(box) {
            const c = P.level;
            box.appendChild(slider('Ganho', c.gain, -24, 24, 0.5, v => { c.gain = v; }, ' dB', '', '0 dB'));
            box.appendChild(check('Nivelar', c.normalize, v => { c.normalize = v; }, 'Leva o áudio a um volume-alvo'));
            if (c.normalize) {
                box.appendChild(choice('Medida', [['lufs', 'Volume percebido (LUFS)'], ['peak', 'Pico']], c.mode, v => { c.mode = v; c.target = v === 'lufs' ? -16 : -3; renderSide(); }));
                box.appendChild(slider('Alvo', c.target, c.mode === 'lufs' ? -40 : -24, c.mode === 'lufs' ? -5 : 0, 0.5, v => { c.target = v; }, c.mode === 'lufs' ? ' LUFS' : ' dBFS', 'Voz: −16 · Narração: −18 · Efeito: −14 · Música: −22'));
            }
            box.appendChild(check('Compressor (uniformiza)', c.compress, v => { c.compress = v; }));
            if (c.compress) {
                box.appendChild(slider('Limiar', c.threshold, -50, 0, 1, v => { c.threshold = v; }, ' dB'));
                box.appendChild(slider('Razão', c.ratio, 1, 10, 0.5, v => { c.ratio = v; }, ':1'));
            }
            box.appendChild(check('Limitador (impede estourar)', c.limit, v => { c.limit = v; }));
            if (c.limit)
                box.appendChild(slider('Teto', c.ceiling, -12, 0, 0.5, v => { c.ceiling = v; }, ' dBFS'));
            box.appendChild(btn('Nivelar todas as vozes do projeto', () => { void levelAll(); }, 'btn', 'Leva voz, narração e demais clipes ao volume-alvo de cada categoria'));
        }
        function tempoControls(box) {
            const c = P.tempo;
            box.appendChild(slider('Velocidade (mantém o tom)', c.speed, 0.5, 2, 0.05, v => { c.speed = Math.round(v * 100) / 100; }, '×', 'Entre 0,5× e 2× a qualidade é boa; fora disso há artefatos'));
            box.appendChild(slider('Tom', c.pitch, -12, 12, 1, v => { c.pitch = v; }, ' semitons', 'Muda o tom sem mudar a duração', '0'));
            const pr = el('div', 'vbae-presets');
            for (const [t, p] of [['Mais grave', -3], ['Mais agudo', 3], ['Criança', 5], ['Monstro', -7]])
                pr.appendChild(btn(t, () => { c.pitch = p; renderSide(); schedule(0); }));
            box.appendChild(pr);
        }
        function fxControls(box) {
            box.appendChild(choice('Efeito', [['none', 'Nenhum'], ...FX], P.fx.name, v => { P.fx.name = v; }));
            if (P.fx.name !== 'none')
                box.appendChild(slider('Intensidade', P.fx.amount, 0, 1, 0.05, v => { P.fx.amount = v; }));
            box.appendChild(el('p', 'vbae-note', 'Telefone, rádio e megafone limitam a faixa de frequências; abafado simula voz distante; eco e reverberação aumentam a duração.'));
        }
        function recipeControls(box) {
            for (const r of E.recipes()) {
                const b = btn(r.name, () => { P.recipe = r.id; renderSide(); schedule(0); }, 'vbae-recipe' + (P.recipe === r.id ? ' on' : ''), r.description);
                const wrap = el('div', 'vbae-recipewrap');
                wrap.append(b, el('small', undefined, r.description));
                box.appendChild(wrap);
            }
        }
        function renderSide() {
            if (!side)
                return;
            side.textContent = '';
            const tabs = el('div', 'vbae-tabs');
            for (const [t, label] of TABS) {
                const b = el('button', 'vbae-tab' + (tab === t ? ' on' : ''), label);
                b.type = 'button';
                b.setAttribute('aria-pressed', String(tab === t));
                b.addEventListener('click', () => { tab = t; discardPreview(); segments = []; message = ''; renderAll(); if (t === 'split' && pcm) {
                    const s = P.split;
                    segments = C.splitBySilence(pcm, { threshold: s.threshold, minSilence: s.minSilence, pad: s.pad, minSpeech: s.minSpeech });
                    drawWave();
                    renderResults();
                }
                else
                    schedule(0); });
                tabs.appendChild(b);
            }
            side.appendChild(tabs);
            const box = el('div', 'vbae-controls');
            side.appendChild(box);
            if (!pcm) {
                box.appendChild(el('p', 'vbae-note', 'Escolha um clipe acima para editar.'));
                return;
            }
            ({ cut: cutControls, split: splitControls, clean: cleanControls, level: levelControls, tempo: tempoControls, fx: fxControls, recipes: recipeControls })[tab](box);
        }
        /* ---------------- resultados ---------------- */
        let results = null;
        function stat(label, a, b) {
            const r = el('div', 'vbae-stat');
            r.appendChild(el('b', undefined, label));
            if (!a)
                return r;
            r.appendChild(el('span', undefined, 'Volume ' + db(a.lufs) + ' LUFS · pico ' + db(a.peakDb) + ' dB · ' + fmt(a.duration)));
            if (a.clipped > 0)
                r.appendChild(el('span', 'vbae-warn', '⚠ ' + a.clipped + ' amostras estouradas'));
            if (b)
                r.classList.add('after');
            return r;
        }
        function renderSelInfo() { const e = root?.querySelector('.vbae-selinfo'); const r = selRange(); if (e)
            e.textContent = r ? 'Seleção ' + fmt(r.a) + ' – ' + fmt(r.b) + ' (' + (r.b - r.a).toFixed(2) + ' s)' : 'Cursor ' + fmt(cursor); }
        function renderResults() {
            if (!results)
                return;
            results.textContent = '';
            results.appendChild(stat('Original', analysis));
            if (busy)
                results.appendChild(el('p', 'vbae-busy', busy));
            if (message)
                results.appendChild(el('p', 'vbae-error', message));
            if (tab === 'split') {
                results.appendChild(el('b', undefined, segments.length + (segments.length === 1 ? ' fala detectada' : ' falas detectadas')));
                const list = el('div', 'vbae-list');
                segments.forEach((s, i) => { const row = el('button', 'vbae-seg', (i + 1) + ' · ' + fmt(s.start) + ' → ' + fmt(s.end) + ' (' + (s.end - s.start).toFixed(2) + ' s)'); row.type = 'button'; row.addEventListener('click', () => { sel = { a: s.start, b: s.end }; cursor = s.start; renderSelInfo(); drawWave(); }); list.appendChild(row); });
                results.appendChild(list);
                const b = btn('Dividir em ' + segments.length + ' clipes', () => { void doSplit(); }, 'btn primary');
                b.disabled = !segments.length || !!busy;
                results.appendChild(b);
                return;
            }
            if (preview) {
                for (const w of preview.warnings)
                    results.appendChild(el('p', 'vbae-warn', '⚠ ' + w));
                const part = preview.parts[previewIdx];
                results.appendChild(stat('Prévia', preview.after[previewIdx] ?? null, preview.after[previewIdx]));
                const rowA = el('div', 'vbae-actions');
                rowA.append(btn(playing === 'original' ? '■ Parar' : '▶ Original', () => { if (playing === 'original')
                    stopPlayback();
                else
                    void play('original', true); renderTransport(); }), btn(playing === 'preview' ? '■ Parar' : '▶ Prévia', () => { if (playing === 'preview')
                    stopPlayback();
                else
                    void play('preview'); renderTransport(); }));
                results.appendChild(rowA);
                results.appendChild(choiceMode());
                const apply = btn(mode === 'replace' ? 'Aplicar (trocar áudio do clipe)' : 'Aplicar (criar novo clipe)', () => { void doApply(); }, 'btn primary');
                apply.disabled = !!busy;
                results.appendChild(apply);
                results.appendChild(el('small', 'vbae-dim', 'Resultado: ' + part.name.replace(/_fala-\d+$/, '') + ' · WAV 16 bits · ' + fmt(part.pcm.channels[0].length / part.pcm.sampleRate)));
            }
            else if (!message && !busy)
                results.appendChild(el('p', 'vbae-note', 'Ajuste os controles para ouvir e comparar a prévia (A/B).'));
        }
        function choiceMode() {
            const w = el('div', 'vbae-modes');
            for (const [m, t, tip] of [['new', 'Novo clipe', 'Mantém o original no projeto'], ['replace', 'Trocar no clipe', 'Mantém falas e vínculos; Desfazer devolve o original']]) {
                const b = el('button', 'vbae-mode' + (mode === m ? ' on' : ''), t);
                b.type = 'button';
                b.title = tip;
                b.setAttribute('aria-pressed', String(mode === m));
                b.addEventListener('click', () => { mode = m; renderResults(); });
                w.appendChild(b);
            }
            return w;
        }
        async function doApply() {
            if (!preview || !projectId || busy)
                return;
            const pid = projectId, cid = clipId;
            busy = 'Salvando…';
            renderResults();
            try {
                const done = await E.commit(preview, { mode });
                const made = done.clips[0];
                message = '';
                busy = '';
                discardPreview();
                renderHeader();
                if (made)
                    await loadClip(pid, mode === 'replace' ? cid : made.id);
            }
            catch (e) {
                busy = '';
                message = e.message;
                renderResults();
            }
        }
        async function doSplit() {
            if (!projectId || !clipId || busy)
                return;
            const s = P.split;
            busy = 'Dividindo…';
            renderResults();
            try {
                const done = await E.splitBySilence(projectId, clipId, { threshold: s.threshold, minSilence: s.minSilence, pad: s.pad, minSpeech: s.minSpeech, bind: s.bind });
                busy = '';
                message = '';
                renderHeader();
                toast(done.clips.length + ' clipes criados' + (s.bind ? '; ' + done.bound + ' vinculado(s) a balões' : '') + '.', 'ok');
                renderResults();
            }
            catch (e) {
                busy = '';
                message = e.message;
                renderResults();
            }
        }
        async function levelAll() {
            if (!projectId || busy)
                return;
            busy = 'Nivelando vozes do projeto…';
            renderResults();
            try {
                const done = await E.levelVoices(projectId);
                busy = '';
                message = '';
                toast(done.clips.length ? done.clips.length + ' clipe(s) nivelado(s).' : (done.warnings[0] ?? 'Nada a nivelar.'), done.clips.length ? 'ok' : 'info');
                if (clipId && clip())
                    await loadClip(projectId, clipId);
                else
                    renderAll();
            }
            catch (e) {
                busy = '';
                message = e.message;
                renderResults();
            }
        }
        /* ---------------- gravação ---------------- */
        async function toggleRecord() {
            if (recorder) {
                recorder.rec.stop();
                return;
            }
            if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
                toast('Este navegador não permite gravar aqui. Grave em outro programa e importe o arquivo.', 'error');
                return;
            }
            const pid = ensureProject();
            if (!pid)
                return;
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
                const rec = new MediaRecorder(stream), chunks = [];
                recorder = { rec, stream, chunks };
                rec.ondataavailable = ev => { if (ev.data.size)
                    chunks.push(ev.data); };
                rec.onstop = () => {
                    stream.getTracks().forEach(t => t.stop());
                    recorder = null;
                    renderHeader();
                    const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
                    void (async () => {
                        try {
                            const c = await V.importClip(pid, new File([blob], 'gravacao-' + new Date().toISOString().slice(11, 19).replace(/:/g, '') + '.webm', { type: blob.type }), 'voice', 'Gravação');
                            renderHeader();
                            await loadClip(pid, c.id);
                        }
                        catch (e) {
                            toast('Não foi possível usar a gravação: ' + e.message);
                        }
                    })();
                };
                rec.start();
                renderHeader();
            }
            catch (e) {
                recorder = null;
                toast('Microfone indisponível: ' + (e.name === 'NotAllowedError' ? 'permissão negada.' : e.message));
            }
        }
        function ensureProject() {
            if (projectId && project())
                return projectId;
            const first = V.list()[0];
            if (first) {
                projectId = first.id;
                return projectId;
            }
            toast('Crie um projeto de vídeo (Voice comic) antes de importar áudio.', 'info');
            return null;
        }
        /* ---------------- janela ---------------- */
        let headEl = null;
        let side = null;
        function renderHeader() {
            if (!headEl)
                return;
            headEl.textContent = '';
            headEl.appendChild(el('h2', undefined, '🎧 Editor de áudio'));
            const projs = V.list();
            const ps = el('select');
            ps.setAttribute('aria-label', 'Projeto de vídeo');
            if (!projs.length) {
                const o = el('option', undefined, '— nenhum vídeo —');
                o.value = '';
                ps.appendChild(o);
            }
            for (const p of projs) {
                const o = el('option', undefined, p.name);
                o.value = p.id;
                ps.appendChild(o);
            }
            ps.value = projectId ?? '';
            ps.addEventListener('change', () => { projectId = ps.value; const f = project()?.clips[0]; if (f)
                void loadClip(projectId, f.id);
            else {
                clipId = null;
                pcm = null;
                analysis = null;
                renderAll();
            } });
            headEl.appendChild(ps);
            const cs = el('select');
            cs.setAttribute('aria-label', 'Clipe de áudio');
            const none = el('option', undefined, '— escolher clipe —');
            none.value = '';
            cs.appendChild(none);
            for (const c of project()?.clips ?? []) {
                const o = el('option', undefined, (KIND_LABEL[c.kind] ?? c.kind) + ' · ' + c.label + ' · ' + c.duration.toFixed(1) + 's');
                o.value = c.id;
                cs.appendChild(o);
            }
            cs.value = clip() ? clipId : '';
            cs.addEventListener('change', () => { if (cs.value && projectId)
                void loadClip(projectId, cs.value); });
            headEl.appendChild(cs);
            if (!projs.length)
                headEl.appendChild(btn('+ Criar vídeo', () => { void V.create({ name: 'Voice comic' }).then(p => { projectId = p.id; renderHeader(); }).catch(e => toast(e.message)); }));
            const file = el('input');
            file.type = 'file';
            file.accept = 'audio/*,.wav,.mp3,.ogg,.flac,.m4a';
            file.multiple = true;
            file.hidden = true;
            file.addEventListener('change', () => {
                const files = Array.from(file.files ?? []);
                const pid = ensureProject();
                if (!files.length || !pid)
                    return;
                void (async () => { let last = null; for (const f of files) {
                    try {
                        last = await V.importClip(pid, f, 'voice');
                    }
                    catch (e) {
                        toast(f.name + ': ' + e.message);
                    }
                } file.value = ''; renderHeader(); if (last)
                    await loadClip(pid, last.id); })();
            });
            headEl.append(file, btn('📂 Importar áudio…', () => file.click()));
            const rb = btn(recorder ? '■ Parar gravação' : '🎙 Gravar', () => { void toggleRecord(); }, 'btn' + (recorder ? ' primary' : ''), 'Grava do microfone e cria um clipe de voz');
            rb.setAttribute('aria-pressed', String(!!recorder));
            headEl.appendChild(rb);
            headEl.appendChild(el('span', 'vbae-spacer'));
            headEl.appendChild(btn('✕ Fechar', () => closeEditor()));
        }
        function renderTransport() {
            const t = root?.querySelector('.vbae-transport');
            if (!t)
                return;
            t.textContent = '';
            t.append(btn(playing === 'original' ? '⏸ Pausar' : '▶ Tocar', () => { if (playing)
                stopPlayback();
            else
                void play('original', !!selRange()); renderTransport(); }, 'btn primary'), btn('⏮', () => { stopPlayback(); cursor = 0; view.start = 0; drawWave(); renderSelInfo(); renderTransport(); }, 'btn', 'Voltar ao início'), el('span', 'vbae-selinfo'), el('span', 'vbae-spacer'), btn('−', () => zoomBy(1.4), 'btn', 'Reduzir zoom'), btn('Tudo', () => { view = { start: 0, dur: Math.max(0.05, total()) }; drawWave(); }, 'btn', 'Mostrar o áudio inteiro'), btn('Seleção', () => { const r = selRange(); if (r) {
                view = { start: r.a, dur: Math.max(0.02, r.b - r.a) };
                drawWave();
            } }, 'btn', 'Ampliar a seleção'), btn('+', () => zoomBy(1 / 1.4), 'btn', 'Ampliar'));
            renderSelInfo();
        }
        function renderAll() {
            if (!root)
                return;
            root.textContent = '';
            const win = el('div', 'vbae-window');
            root.appendChild(win);
            headEl = el('div', 'vbae-head');
            win.appendChild(headEl);
            const body = el('div', 'vbae-body');
            win.appendChild(body);
            side = el('div', 'vbae-side');
            body.appendChild(side);
            const mid = el('div', 'vbae-mid');
            body.appendChild(mid);
            results = el('div', 'vbae-results');
            body.appendChild(results);
            stage = el('div', 'vbae-stage');
            mid.appendChild(stage);
            if (pcm) {
                canvas = el('canvas', 'vbae-canvas');
                canvas.setAttribute('aria-label', 'Forma de onda');
                canvas.tabIndex = 0;
                canvas.addEventListener('pointerdown', onDown);
                canvas.addEventListener('pointermove', onMove);
                canvas.addEventListener('pointerup', onUp);
                canvas.addEventListener('wheel', onWheel, { passive: false });
                stage.appendChild(canvas);
                mid.appendChild(el('div', 'vbae-transport'));
            }
            else {
                canvas = null;
                const msg = busy || (project() ? (project().clips.length ? 'Escolha um clipe para editar.' : 'Este vídeo ainda não tem áudio. Importe um arquivo ou grave pelo microfone.') : 'Crie um vídeo (Voice comic) e importe as falas.');
                stage.appendChild(el('p', 'vbae-empty', msg));
            }
            renderHeader();
            renderSide();
            renderResults();
            renderTransport();
            requestAnimationFrame(() => drawWave());
        }
        function closeEditor() {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            if (recorder) {
                recorder.rec.onstop = null;
                try {
                    recorder.rec.stop();
                }
                catch { /* já parado */ }
                recorder.stream.getTracks().forEach(t => t.stop());
                recorder = null;
            }
            stopPlayback();
            discardPreview();
            void actx?.close().catch(() => { });
            actx = null;
            root?.remove();
            root = null;
            pcm = null;
            analysis = null;
            canvas = null;
            side = null;
            results = null;
            stage = null;
            headEl = null;
            sel = null;
            noise = null;
            segments = [];
        }
        async function open(pid, cid) {
            if (root)
                closeEditor();
            root = el('div', 'vbae-overlay');
            root.setAttribute('role', 'dialog');
            root.setAttribute('aria-modal', 'true');
            root.setAttribute('aria-label', 'Editor de áudio');
            document.body.appendChild(root);
            const projs = V.list();
            let p = pid && projs.some(x => x.id === pid) ? pid : (projectId && projs.some(x => x.id === projectId) ? projectId : projs[0]?.id ?? null);
            projectId = p;
            const proj = project();
            const c = cid && proj?.clips.some(x => x.id === cid) ? cid : (clipId && proj?.clips.some(x => x.id === clipId) ? clipId : proj?.clips[0]?.id ?? null);
            if (p && c)
                await loadClip(p, c);
            else {
                pcm = null;
                analysis = null;
                renderAll();
            }
        }
        kernel.listen(window, 'keydown', event => {
            const e = event;
            if (!root)
                return;
            const tag = e.target?.tagName;
            if (e.key === 'Escape') {
                closeEditor();
                return;
            }
            if (e.key === ' ' && pcm && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'BUTTON' && tag !== 'TEXTAREA') {
                e.preventDefault();
                if (playing)
                    stopPlayback();
                else
                    void play('original', !!selRange());
                renderTransport();
            }
        });
        kernel.listen(window, 'resize', () => { if (root)
            drawWave(); });
        kernel.on('assets:changed', () => { if (root) {
            renderHeader();
        } });
        kernel.on('contextmenu:extend', payload => {
            const target = payload;
            target.items.push({ icon: '🎧', label: 'Editor de áudio…', action: () => { void open(); } });
        });
        kernel.provide('ui.audioEditor', { open, close: closeEditor, isOpen: () => !!root });
    }
});
