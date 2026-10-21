"use strict";
/* =====================================================================
 * plugins/29-ui-video.ts  (Fase 21)
 * ---------------------------------------------------------------------
 * Janela "Vídeo (voice comic)": shots, prévia com som, linha do tempo, áudio, efeitos e exportação.
 * Toda a lógica está nas capabilities video / videoRender / videoExport; aqui só há interface.
 *
 * Fornece: ui.video
 * ===================================================================== */
definePlugin({
    id: 'ui-video',
    version: '1.0.0',
    needs: ['utils', 'state', 'video', 'videoRender', 'videoExport', 'assets'],
    provides: ['ui.video'],
    uses: ['ui.dialogs'],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'video': '^1.0.0', 'videoRender': '^1.0.0', 'videoExport': '^1.0.0', 'assets': '^1.0.0', 'ui.dialogs': '^1.0.0' },
    contractVersions: { 'ui.video': '1.0.0' },
    setup: async function (kernel) {
        const S = (await kernel.require('state')).data;
        const V = await kernel.require('video');
        const R = await kernel.require('videoRender');
        const X = await kernel.require('videoExport');
        const A = await kernel.require('assets');
        const toast = (message, kind = 'error') => { kernel.emit('toast', { message, kind }); };
        function el(tag, cls, text) {
            const e = document.createElement(tag);
            if (cls)
                e.className = cls;
            if (text !== undefined)
                e.textContent = text;
            return e;
        }
        const fmt = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };
        const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
        const PRESETS = [
            { label: 'Full HD 16:9 (1920×1080)', w: 1920, h: 1080 }, { label: 'HD 16:9 (1280×720)', w: 1280, h: 720 },
            { label: 'Vertical 9:16 (1080×1920)', w: 1080, h: 1920 }, { label: 'Quadrado (1080×1080)', w: 1080, h: 1080 }, { label: '4K 16:9 (3840×2160)', w: 3840, h: 2160 }
        ];
        const FX_LABEL = {
            'shake': 'Tremor', 'rumble': 'Estrondo', 'zoom-punch': 'Soco de zoom', 'rotate-punch': 'Soco de rotação', 'flash': 'Flash', 'blur-in': 'Desfoque → nítido',
            'blur-out': 'Nítido → desfoque', 'whip': 'Chicote', 'vignette': 'Vinheta', 'glitch': 'Glitch', 'chromatic': 'Aberração cromática', 'grayscale': 'Preto e branco',
            'sepia': 'Sépia', 'invert-flash': 'Inversão', 'contrast-pop': 'Contraste', 'tint': 'Cor sobreposta', 'grain': 'Granulado', 'strobe': 'Estroboscópio',
            'letterbox': 'Barras de cinema', 'speed-zoom': 'Zoom veloz', 'fade-in': 'Surgir do preto', 'fade-out': 'Sumir no preto', 'parallax': 'Paralaxe dos balões'
        };
        const MOVE_LABEL = {
            'static': 'Parada', 'push-in': 'Aproximar', 'pull-out': 'Afastar', 'pan-left': 'Panorâmica ←', 'pan-right': 'Panorâmica →', 'pan-up': 'Panorâmica ↑', 'pan-down': 'Panorâmica ↓',
            'ken-burns': 'Ken Burns', 'roll-cw': 'Giro horário', 'roll-ccw': 'Giro anti-horário', 'heartbeat': 'Batimento'
        };
        const REVEAL_LABEL = { 'cut': 'Corte', 'fade': 'Esmaecer', 'pop': 'Estourar', 'slide-left': 'Deslizar ←', 'slide-right': 'Deslizar →', 'slide-up': 'Deslizar ↑', 'slide-down': 'Deslizar ↓', 'wipe': 'Varrer', 'typewriter': 'Máquina de escrever' };
        const TRANS_LABEL = {
            'cut': 'Corte seco', 'camera-move': 'Câmera viaja (mesma página)', 'crossfade': 'Fusão', 'dip-black': 'Via preto', 'dip-white': 'Via branco', 'slide-left': 'Deslizar ←', 'slide-right': 'Deslizar →',
            'slide-up': 'Deslizar ↑', 'slide-down': 'Deslizar ↓', 'push-left': 'Empurrar ←', 'push-right': 'Empurrar →', 'wipe-left': 'Cortina ←', 'wipe-right': 'Cortina →', 'wipe-up': 'Cortina ↑',
            'wipe-down': 'Cortina ↓', 'wipe-diagonal': 'Cortina diagonal', 'iris': 'Íris', 'zoom-through': 'Atravessar zoom', 'flash': 'Flash', 'glitch': 'Glitch', 'blinds': 'Persiana', 'dissolve': 'Dissolver', 'page-turn': 'Virar página'
        };
        const EASE_LABEL = { 'linear': 'Linear', 'ease-in': 'Acelera', 'ease-out': 'Desacelera', 'ease-in-out': 'Suave', 'back': 'Com retorno' };
        const CLIP_LABEL = { 'voice': 'Voz', 'sfx': 'Efeito sonoro', 'music': 'Música' };
        /* ------------------------------------------------------------------
         * Estado da janela
         * ------------------------------------------------------------------ */
        let root = null;
        let projectId = null;
        let shotId = null;
        let cueId = null;
        let showSettings = false;
        let playhead = 0;
        let playing = false;
        let session = null;
        let sessionDirty = true;
        let preparing = null;
        let dirtyTimer = null;
        let busy = null;
        let lastResult = null;
        let lastError = null;
        let planCache = null;
        let hubInfo = null;
        let codecInfo = null;
        let preview = null;
        const PREVIEW_W = 640;
        const board = () => S.boards.find(b => b.id === S.currentBoardId);
        const project = () => {
            if (!projectId)
                return null;
            try {
                return V.get(projectId);
            }
            catch {
                projectId = null;
                return null;
            }
        };
        function ensureProject() {
            const list = V.list();
            if (!list.length) {
                projectId = null;
                return null;
            }
            if (!projectId || !list.some(p => p.id === projectId))
                projectId = list[0].id;
            return list.find(p => p.id === projectId) ?? null;
        }
        const plan = () => { if (!projectId)
            return null; try {
            return (planCache = V.compile(projectId));
        }
        catch {
            return planCache;
        } };
        /* ------------------------------------------------------------------
         * Sessão de prévia (sprites) e quadros
         * ------------------------------------------------------------------ */
        async function ensureSession() {
            const p = project();
            if (!p)
                return null;
            if (preparing)
                await preparing;
            const pl = plan();
            if (!pl || !pl.shots.length)
                return null;
            if (session && !sessionDirty && session.setPlan(pl))
                return session;
            preparing = (async () => {
                session?.dispose();
                session = null;
                const w = PREVIEW_W, h = Math.max(16, Math.round(PREVIEW_W * pl.height / pl.width));
                session = await R.prepare(pl, { width: w, height: h, background: p.settings.background, unrevealed: p.settings.unrevealed, subtitles: p.settings.subtitles });
                sessionDirty = false;
            })();
            try {
                await preparing;
            }
            catch (e) {
                lastError = e.message;
                session = null;
            }
            finally {
                preparing = null;
            }
            return session;
        }
        function drawFrame() {
            if (!preview || !session)
                return;
            const ctx = preview.getContext('2d');
            if (!ctx)
                return;
            if (preview.width !== session.width) {
                preview.width = session.width;
                preview.height = session.height;
            }
            session.renderFrame(ctx, playhead);
        }
        async function seek(t) {
            const pl = plan();
            if (!pl)
                return;
            playhead = clamp(t, 0, Math.max(0, pl.duration - 0.001));
            if (await ensureSession())
                drawFrame();
            updateTransport();
        }
        /* ------------------------------------------------------------------
         * Reprodução com áudio
         * ------------------------------------------------------------------ */
        let actx = null;
        const buffers = new Map();
        let sources = [];
        let raf = 0, startCtx = 0, startT = 0;
        async function bufferOf(assetId) {
            if (buffers.has(assetId))
                return buffers.get(assetId);
            const blob = A.blobs.get(assetId);
            if (!blob || !actx)
                return null;
            try {
                const b = await actx.decodeAudioData(await blob.arrayBuffer());
                buffers.set(assetId, b);
                return b;
            }
            catch {
                return null;
            }
        }
        function stopAudio() { for (const s of sources) {
            try {
                s.stop();
            }
            catch { /* já parou */ }
        } sources = []; }
        async function play() {
            const pl = plan();
            if (!pl || !pl.shots.length) {
                toast('Monte os shots antes de reproduzir.');
                return;
            }
            if (!(await ensureSession())) {
                if (lastError)
                    toast(lastError);
                return;
            }
            if (playhead >= pl.duration - 0.05)
                playhead = 0;
            if (!actx)
                actx = new AudioContext();
            await actx.resume();
            for (const a of pl.audio)
                await bufferOf(a.assetId);
            stopAudio();
            startCtx = actx.currentTime + 0.05;
            startT = playhead;
            for (const a of pl.audio) {
                const buf = buffers.get(a.assetId);
                if (!buf)
                    continue;
                const end = a.start + a.duration;
                if (end <= playhead)
                    continue;
                const src = actx.createBufferSource();
                src.buffer = buf;
                src.loop = a.loop;
                const g = actx.createGain();
                g.gain.value = a.gain;
                src.connect(g);
                g.connect(actx.destination);
                const offset = Math.max(0, playhead - a.start);
                const when = startCtx + Math.max(0, a.start - playhead);
                if (a.loop) {
                    src.start(when, offset % buf.duration);
                    src.stop(startCtx + (end - playhead));
                }
                else
                    src.start(when, offset, Math.min(buf.duration - offset, a.duration - offset));
                sources.push(src);
            }
            playing = true;
            updateTransport();
            const loop = () => {
                if (!playing || !actx)
                    return;
                playhead = startT + Math.max(0, actx.currentTime - startCtx);
                if (playhead >= pl.duration) {
                    pause();
                    playhead = pl.duration - 0.001;
                    drawFrame();
                    updateTransport();
                    return;
                }
                drawFrame();
                updateTransport();
                raf = requestAnimationFrame(loop);
            };
            raf = requestAnimationFrame(loop);
        }
        function pause() { playing = false; cancelAnimationFrame(raf); stopAudio(); updateTransport(); }
        /* ------------------------------------------------------------------
         * Utilidades de interface
         * ------------------------------------------------------------------ */
        function field(label, control, hint) {
            const w = el('label', 'vbv-field');
            w.appendChild(el('span', 'vbv-label', label));
            w.appendChild(control);
            if (hint)
                w.title = hint;
            return w;
        }
        function select(options, value, onChange, aria) {
            const s = el('select');
            for (const [v, l] of options) {
                const o = el('option', undefined, l);
                o.value = v;
                if (v === value)
                    o.selected = true;
                s.appendChild(o);
            }
            s.addEventListener('change', () => onChange(s.value));
            if (aria)
                s.setAttribute('aria-label', aria);
            return s;
        }
        function number(value, opts, onChange) {
            const i = el('input');
            i.type = 'number';
            i.min = String(opts.min);
            i.max = String(opts.max);
            i.step = String(opts.step);
            if (value !== null)
                i.value = String(value);
            if (opts.placeholder)
                i.placeholder = opts.placeholder;
            i.addEventListener('change', () => onChange(i.value === '' ? null : Number(i.value)));
            return i;
        }
        function button(label, onClick, cls = 'btn', title) {
            const b = el('button', cls, label);
            b.type = 'button';
            if (title) {
                b.title = title;
                b.setAttribute('aria-label', title);
            }
            b.addEventListener('click', onClick);
            return b;
        }
        async function guarded(fn) {
            try {
                await fn();
            }
            catch (e) {
                toast(e.message);
            }
            sessionDirty = sessionDirty || false;
            render();
        }
        const labelOf = (info, kind, id) => {
            if (!id)
                return kind === 'sfx' ? 'Efeito sonoro solto' : '—';
            if (!info)
                return id;
            if (kind === 'panel')
                return 'Painel ' + (info.panels.findIndex(p => p.id === id) + 1);
            if (kind === 'balloon')
                return 'Balão: ' + ((info.balloons.find(b => b.id === id)?.text ?? '?').replace(/\s+/g, ' ').slice(0, 40) || '(vazio)');
            if (kind === 'text')
                return 'Texto: ' + ((info.texts.find(t => t.id === id)?.text ?? '?').replace(/\s+/g, ' ').slice(0, 40) || '(vazio)');
            if (kind === 'effect')
                return 'Efeito ' + id;
            return 'Overlay ' + id;
        };
        const pageName = (pageId) => {
            const pages = (board()?.instances ?? []).filter(i => i.type === 'manga-page');
            const i = pages.findIndex(p => p.id === pageId);
            return i >= 0 ? 'Página ' + (i + 1) : pageId;
        };
        /* ------------------------------------------------------------------
         * Renderização da janela
         * ------------------------------------------------------------------ */
        let transportEls = null;
        let timelineScale = 60;
        function updateTransport() {
            const pl = planCache;
            if (!transportEls || !pl)
                return;
            transportEls.play.textContent = playing ? '⏸' : '▶';
            transportEls.play.title = transportEls.play.ariaLabel = playing ? 'Pausar' : 'Reproduzir';
            transportEls.range.max = String(Math.max(0.1, pl.duration));
            transportEls.range.value = String(playhead);
            transportEls.time.textContent = fmt(playhead) + ' / ' + fmt(pl.duration);
            if (transportEls.head)
                transportEls.head.style.left = playhead * timelineScale + 'px';
        }
        function close() {
            pause();
            if (busy)
                busy.abort.abort();
            if (dirtyTimer) {
                clearTimeout(dirtyTimer);
                dirtyTimer = null;
            }
            session?.dispose();
            session = null;
            sessionDirty = true;
            preview = null;
            transportEls = null;
            root?.remove();
            root = null;
        }
        async function open(id) {
            if (root)
                close();
            if (id)
                projectId = id;
            root = el('div', 'vbv-overlay');
            root.setAttribute('role', 'dialog');
            root.setAttribute('aria-modal', 'true');
            root.setAttribute('aria-label', 'Vídeo (voice comic)');
            document.body.appendChild(root);
            hubInfo = null;
            codecInfo = null;
            render();
            void X.supportedCodecs().then(c => { codecInfo = c; if (root)
                render(); });
            void X.hubStatus().then(h => { hubInfo = h; if (root)
                render(); });
            if (project()?.shots.length)
                void seek(0);
            return true;
        }
        function render() {
            if (!root)
                return;
            const scrollKeep = root.querySelector('.vbv-side')?.scrollTop ?? 0;
            root.textContent = '';
            transportEls = null;
            const p = ensureProject();
            const win = el('div', 'vbv-window');
            root.appendChild(win);
            win.appendChild(header(p));
            if (!p) {
                win.appendChild(emptyState());
                return;
            }
            const pl = plan();
            const body = el('div', 'vbv-body');
            win.appendChild(body);
            body.appendChild(shotsColumn(p, pl));
            body.appendChild(stage(p, pl));
            body.appendChild(sideColumn(p));
            win.appendChild(timeline(p, pl));
            const side = root.querySelector('.vbv-side');
            if (side)
                side.scrollTop = scrollKeep;
            updateTransport();
            if (session && !preparing)
                drawFrame();
        }
        function header(p) {
            const h = el('div', 'vbv-head');
            h.appendChild(el('h2', undefined, '🎬 Vídeo (voice comic)'));
            const list = V.list();
            if (p) {
                h.appendChild(select(list.map(x => [x.id, x.name]), p.id, v => { projectId = v; shotId = null; cueId = null; sessionDirty = true; render(); void seek(0); }, 'Projeto de vídeo'));
                h.appendChild(button('Renomear', () => {
                    void (async () => {
                        const D = kernel.has('ui.dialogs') ? await kernel.require('ui.dialogs') : null;
                        const name = D ? await D.prompt({ title: 'Renomear vídeo', message: 'Novo nome do vídeo', defaultValue: p.name, confirmText: 'Renomear' }) : null;
                        if (name)
                            await guarded(() => V.rename(p.id, name));
                    })();
                }));
                h.appendChild(button('Excluir', () => {
                    void (async () => {
                        const D = kernel.has('ui.dialogs') ? await kernel.require('ui.dialogs') : null;
                        const ok = D ? await D.confirm({ title: 'Excluir vídeo?', message: 'O projeto de vídeo e os áudios importados nele serão removidos. Você pode desfazer com Ctrl+Z.', confirmText: 'Excluir', danger: true }) : true;
                        if (ok)
                            await guarded(async () => { await V.remove(p.id); projectId = null; shotId = null; sessionDirty = true; });
                    })();
                }, 'btn danger'));
            }
            h.appendChild(button('+ Novo vídeo', () => { void guarded(async () => { const np = await V.create({}); projectId = np.id; shotId = null; sessionDirty = true; }); }));
            h.appendChild(el('span', 'vbv-spacer'));
            if (p) {
                const sub = el('label', 'vbv-check');
                const cb = el('input');
                cb.type = 'checkbox';
                cb.checked = p.settings.subtitles.enabled;
                cb.addEventListener('change', () => { void guarded(async () => { await V.updateSettings(p.id, { subtitles: { ...p.settings.subtitles, enabled: cb.checked } }); sessionDirty = true; void seek(playhead); }); });
                sub.appendChild(cb);
                sub.appendChild(el('span', undefined, 'Legendas'));
                h.appendChild(sub);
                h.appendChild(select([['auto', 'Sincronia: automática'], ['manual', 'Sincronia: manual']], p.settings.sync, v => { void guarded(() => V.updateSettings(p.id, { sync: v })); }, 'Modo de sincronia'));
                h.appendChild(button(showSettings ? '⚙ Ajustes ▴' : '⚙ Ajustes ▾', () => { showSettings = !showSettings; render(); }));
            }
            h.appendChild(button('✕', () => close(), 'btn', 'Fechar'));
            return h;
        }
        function emptyState() {
            const e = el('div', 'vbv-empty');
            e.appendChild(el('p', undefined, 'Transforme suas páginas de mangá em um vídeo narrado (voice comic): cada painel aparece no tempo certo, os balões surgem junto com a dublagem e você exporta o MP4.'));
            const pages = (board()?.instances ?? []).filter(i => i.type === 'manga-page').length;
            if (!pages)
                e.appendChild(el('p', 'vbv-warn', 'Este quadro ainda não tem páginas de mangá. Crie ou aplique um modelo de página primeiro.'));
            e.appendChild(button('Criar vídeo a partir das páginas', () => {
                void guarded(async () => {
                    const np = await V.create({});
                    projectId = np.id;
                    if (pages) {
                        await V.autoBuild(np.id);
                        shotId = V.get(np.id).shots[0]?.id ?? null;
                    }
                    sessionDirty = true;
                    void seek(0);
                });
            }, 'btn primary'));
            return e;
        }
        function settingsPanel(p) {
            const s = p.settings, w = el('div', 'vbv-settings');
            const up = (patch) => { void guarded(async () => { await V.updateSettings(p.id, patch); sessionDirty = true; void seek(playhead); }); };
            const cur = PRESETS.find(x => x.w === s.width && x.h === s.height);
            w.appendChild(field('Formato', select([...PRESETS.map(x => [x.w + 'x' + x.h, x.label]), ...(cur ? [] : [[s.width + 'x' + s.height, s.width + '×' + s.height + ' (personalizado)']])], s.width + 'x' + s.height, v => { const [a, b] = v.split('x').map(Number); up({ width: a, height: b }); })));
            w.appendChild(field('Quadros/s', number(s.fps, { min: 8, max: 60, step: 1 }, v => { if (v !== null)
                up({ fps: v }); })));
            const bg = el('input');
            bg.type = 'color';
            bg.value = /^#[0-9a-f]{6}$/i.test(s.background) ? s.background : '#0b0b0f';
            bg.addEventListener('change', () => up({ background: bg.value }));
            w.appendChild(field('Fundo', bg));
            w.appendChild(field('Enquadramento do vídeo', select([
                ['page', 'Página completa (original)'], ['isolated', 'Painel isolado e centralizado']
            ], s.framing ?? 'page', v => up({ framing: v }), 'Modo padrão para cenas com foco em painel')));
            w.appendChild(field('Margem do enquadramento', number(s.margin, { min: 0, max: 0.6, step: 0.01 }, v => { if (v !== null)
                up({ margin: v }); }), 'Fração ao redor do painel'));
            w.appendChild(field('Intro do painel (s)', number(s.panelIntro, { min: 0, max: 10, step: 0.1 }, v => { if (v !== null)
                up({ panelIntro: v }); }), 'Tempo entre o painel aparecer e a primeira fala'));
            w.appendChild(field('Pausa entre falas (s)', number(s.linePad, { min: 0, max: 10, step: 0.05 }, v => { if (v !== null)
                up({ linePad: v }); })));
            w.appendChild(field('Cauda do shot (s)', number(s.shotTail, { min: 0, max: 30, step: 0.1 }, v => { if (v !== null)
                up({ shotTail: v }); })));
            w.appendChild(field('Segundos por letra (sem áudio)', number(s.secPerChar, { min: 0.01, max: 1, step: 0.01 }, v => { if (v !== null)
                up({ secPerChar: v }); }), 'Estimativa quando a fala não tem áudio'));
            w.appendChild(field('Leitura', select([['rtl', 'Mangá (direita → esquerda)'], ['ltr', 'Ocidental (esquerda → direita)']], s.direction, v => up({ direction: v }))));
            w.appendChild(field('Painéis ainda não revelados', select([['hidden', 'Escondidos'], ['dim', 'Esmaecidos']], s.unrevealed, v => up({ unrevealed: v }))));
            w.appendChild(field('Transição na mesma página', select(Object.entries(TRANS_LABEL), s.transitions.samePage, v => up({ transitions: { ...s.transitions, samePage: v } }))));
            w.appendChild(field('Transição entre páginas', select(Object.entries(TRANS_LABEL), s.transitions.newPage, v => up({ transitions: { ...s.transitions, newPage: v } }))));
            w.appendChild(field('Duração da transição (s)', number(s.transitions.duration, { min: 0, max: 5, step: 0.05 }, v => { if (v !== null)
                up({ transitions: { ...s.transitions, duration: v } }); })));
            const ov = el('label', 'vbv-check');
            const cb = el('input');
            cb.type = 'checkbox';
            cb.checked = s.overviewShots;
            cb.addEventListener('change', () => up({ overviewShots: cb.checked }));
            ov.appendChild(cb);
            ov.appendChild(el('span', undefined, 'Começar cada página com uma visão geral'));
            w.appendChild(ov);
            const sp = s.subtitles;
            w.appendChild(field('Legenda: posição', select([['bottom', 'Embaixo'], ['top', 'Em cima']], sp.position, v => up({ subtitles: { ...sp, position: v } }))));
            w.appendChild(field('Legenda: tamanho', number(sp.size, { min: 0.02, max: 0.15, step: 0.005 }, v => { if (v !== null)
                up({ subtitles: { ...sp, size: v } }); })));
            return w;
        }
        /* ---------------- coluna de shots ---------------- */
        function shotsColumn(p, pl) {
            const col = el('div', 'vbv-shots');
            const bar = el('div', 'vbv-bar');
            bar.appendChild(button('✨ Montar automaticamente', () => {
                void (async () => {
                    const D = kernel.has('ui.dialogs') ? await kernel.require('ui.dialogs') : null;
                    if (p.shots.length && D && !(await D.confirm({ title: 'Refazer os shots?', message: 'Os shots atuais serão substituídos por um shot por painel, na ordem de leitura. As vozes já importadas continuam disponíveis. Você pode desfazer com Ctrl+Z.', confirmText: 'Montar', danger: true })))
                        return;
                    await guarded(async () => { await V.autoBuild(p.id); shotId = V.get(p.id).shots[0]?.id ?? null; cueId = null; sessionDirty = true; await seek(0); });
                })();
            }, 'btn primary', 'Um shot por painel, na ordem de leitura, com falas, efeitos e câmera'));
            col.appendChild(bar);
            const pages = (board()?.instances ?? []).filter(i => i.type === 'manga-page');
            const addBar = el('div', 'vbv-bar');
            const pageSel = select(pages.map((pg, i) => [pg.id, 'Página ' + (i + 1)]), pages[0]?.id ?? '', () => undefined, 'Página do novo shot');
            addBar.appendChild(pageSel);
            addBar.appendChild(button('+ Shot', () => {
                if (!pageSel.value) {
                    toast('Não há páginas de mangá neste quadro.');
                    return;
                }
                void guarded(async () => {
                    const s = await V.addShot(p.id, { pageId: pageSel.value, label: 'Shot ' + (p.shots.length + 1) });
                    shotId = s.id;
                    sessionDirty = true;
                });
            }, 'btn', 'Adicionar shot da página inteira'));
            col.appendChild(addBar);
            const list = el('div', 'vbv-shotlist');
            list.setAttribute('role', 'listbox');
            list.setAttribute('aria-label', 'Shots');
            p.shots.forEach((s, i) => {
                const ps = pl?.shots.find(x => x.id === s.id);
                const row = el('div', 'vbv-shot' + (s.id === shotId ? ' sel' : ''));
                row.setAttribute('role', 'option');
                row.setAttribute('aria-selected', String(s.id === shotId));
                row.tabIndex = 0;
                row.appendChild(el('span', 'vbv-n', String(i + 1)));
                const info = el('span', 'vbv-info');
                info.appendChild(el('strong', undefined, s.label || 'Shot ' + (i + 1)));
                info.appendChild(el('small', undefined, pageName(s.pageId) + (s.focus.kind === 'panel' ? ' · painel' : s.focus.kind === 'rect' ? ' · área' : ' · página') + ' · ' + s.cues.filter(c => c.kind === 'balloon').length + ' fala(s)' + (ps ? ' · ' + (ps.end - ps.start).toFixed(1) + 's' : '')));
                row.appendChild(info);
                const act = el('span', 'vbv-rowact');
                act.appendChild(button('↑', () => { void guarded(() => V.moveShot(p.id, s.id, i - 1)); }, 'btn mini', 'Subir'));
                act.appendChild(button('↓', () => { void guarded(() => V.moveShot(p.id, s.id, i + 1)); }, 'btn mini', 'Descer'));
                act.appendChild(button('🗑', () => { void guarded(async () => { await V.removeShot(p.id, s.id); if (shotId === s.id)
                    shotId = null; sessionDirty = true; }); }, 'btn mini', 'Remover shot'));
                row.appendChild(act);
                const pick = () => { shotId = s.id; cueId = null; render(); if (ps)
                    void seek(ps.start + ps.lead + 0.3); };
                row.addEventListener('click', ev => { if (ev.target.closest('button'))
                    return; pick(); });
                row.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    pick();
                } });
                list.appendChild(row);
            });
            if (!p.shots.length)
                list.appendChild(el('p', 'vbv-hint', 'Nenhum shot. Use “Montar automaticamente” para criar um shot por painel.'));
            col.appendChild(list);
            return col;
        }
        /* ---------------- palco: prévia + transporte + exportação ---------------- */
        function stage(p, pl) {
            const st = el('div', 'vbv-stage');
            const frame = el('div', 'vbv-frame');
            frame.style.aspectRatio = p.settings.width + ' / ' + p.settings.height;
            preview = el('canvas', 'vbv-canvas');
            preview.width = PREVIEW_W;
            preview.height = Math.round(PREVIEW_W * p.settings.height / p.settings.width);
            preview.setAttribute('aria-label', 'Prévia do vídeo');
            frame.appendChild(preview);
            if (!pl || !pl.shots.length)
                frame.appendChild(el('div', 'vbv-nopreview', 'Sem prévia: crie shots para ver o vídeo.'));
            st.appendChild(frame);
            const tr = el('div', 'vbv-transport');
            const playBtn = button('▶', () => { if (playing)
                pause();
            else
                void play(); }, 'btn', 'Reproduzir');
            const range = el('input');
            range.type = 'range';
            range.min = '0';
            range.step = '0.01';
            range.max = String(Math.max(0.1, pl?.duration ?? 0.1));
            range.setAttribute('aria-label', 'Posição no vídeo');
            range.addEventListener('input', () => { if (playing)
                pause(); void seek(Number(range.value)); });
            const time = el('span', 'vbv-time', '0:00.0 / 0:00.0');
            tr.appendChild(playBtn);
            tr.appendChild(range);
            tr.appendChild(time);
            tr.appendChild(button('⏮', () => { pause(); void seek(0); }, 'btn mini', 'Início'));
            st.appendChild(tr);
            transportEls = { play: playBtn, range, time, head: null };
            if (pl && pl.warnings.length) {
                const w = el('ul', 'vbv-warnlist');
                for (const m of pl.warnings.slice(0, 6))
                    w.appendChild(el('li', undefined, m));
                st.appendChild(w);
            }
            if (lastError)
                st.appendChild(el('p', 'vbv-warn', lastError));
            st.appendChild(exportBox(p, pl));
            return st;
        }
        function exportBox(p, pl) {
            const box = el('div', 'vbv-export');
            box.appendChild(el('h3', undefined, 'Exportar MP4'));
            const est = pl ? 'Duração ' + fmt(pl.duration) + ' · ' + pl.frames + ' quadros · ' + pl.width + '×' + pl.height + ' · ' + pl.fps + ' fps' : '';
            box.appendChild(el('p', 'vbv-hint', est));
            if (busy) {
                const pr = el('progress');
                pr.max = Math.max(1, busy.total);
                pr.value = busy.done;
                box.appendChild(el('p', 'vbv-hint', busy.label));
                box.appendChild(pr);
                box.appendChild(button('Cancelar', () => busy?.abort.abort(), 'btn danger'));
                return box;
            }
            const row = el('div', 'vbv-bar');
            const canA = !codecInfo || codecInfo.webcodecs;
            row.appendChild(button('Neste navegador', () => { void runExport('browser', p); }, 'btn primary', 'Codifica aqui mesmo com WebCodecs (nada sai do computador)'));
            const canB = !!hubInfo && hubInfo.connected && hubInfo.enabled;
            const b = button('Pelo Hub (ffmpeg)', () => { void runExport('hub', p); }, 'btn', 'H.264 + AAC garantidos, sem limite de memória');
            b.disabled = !canB;
            row.appendChild(b);
            box.appendChild(row);
            const notes = el('ul', 'vbv-notes');
            if (codecInfo) {
                if (!codecInfo.webcodecs)
                    notes.appendChild(el('li', 'warn', 'Este navegador não tem WebCodecs' + (codecInfo.secureContext ? '.' : ' (exige página segura: abra por file:// ou HTTPS).') + ' Use o Hub.'));
                else
                    notes.appendChild(el('li', undefined, 'Neste navegador: ' + (codecInfo.video.length ? codecInfo.video.map(c => c === 'avc' ? 'H.264' : c.toUpperCase()).join(', ') : 'nenhum codec de vídeo') + ' + ' + (codecInfo.audio.length ? codecInfo.audio.map(c => c === 'aac' ? 'AAC' : 'Opus').join(', ') : 'sem áudio') + (codecInfo.video.includes('avc') ? '' : ' — sem H.264: use o Hub se precisar dele.')));
            }
            if (hubInfo)
                notes.appendChild(el('li', hubInfo.enabled ? undefined : 'warn', hubInfo.enabled ? 'Hub: ffmpeg ' + hubInfo.ffmpeg + (hubInfo.h264 ? ' · H.264' : '') + (hubInfo.aac ? ' · AAC' : '') : 'Hub: ' + (hubInfo.reason ?? 'indisponível')));
            else
                notes.appendChild(el('li', undefined, 'Hub: verificando…'));
            box.appendChild(notes);
            if (canA === false)
                void 0;
            if (lastResult) {
                const r = lastResult.result, done = el('div', 'vbv-done');
                done.appendChild(el('p', undefined, '✔ ' + lastResult.name + ' · ' + (r.bytes / 1048576).toFixed(1) + ' MB · ' + r.videoCodec + (r.audioCodec ? ' + ' + r.audioCodec : ' (sem áudio)') + ' · ' + (r.elapsedMs / 1000).toFixed(1) + 's'));
                done.appendChild(button('⬇ Baixar de novo', () => X.download(r, lastResult.name)));
                if (r.warnings.length) {
                    const w = el('ul', 'vbv-warnlist');
                    for (const m of r.warnings.slice(0, 6))
                        w.appendChild(el('li', undefined, m));
                    done.appendChild(w);
                }
                box.appendChild(done);
            }
            return box;
        }
        async function runExport(mode, p) {
            pause();
            const abort = new AbortController();
            busy = { label: 'Preparando…', done: 0, total: 1, abort };
            lastResult = null;
            lastError = null;
            render();
            const phases = { prepare: 'Preparando quadros…', audio: 'Mixando áudio…', encode: 'Codificando quadros…', mux: 'Finalizando MP4…' };
            const onProgress = (i) => {
                if (!busy)
                    return;
                busy.label = phases[i.phase] ?? i.phase;
                busy.done = i.done;
                busy.total = i.total;
                const pr = root?.querySelector('.vbv-export progress');
                const lb = root?.querySelector('.vbv-export p:nth-of-type(2)');
                if (pr) {
                    pr.max = Math.max(1, i.total);
                    pr.value = i.done;
                }
                if (lb)
                    lb.textContent = busy.label + ' ' + i.done + '/' + i.total;
            };
            try {
                const result = mode === 'browser' ? await X.exportMp4(p.id, { onProgress, signal: abort.signal }) : await X.exportViaHub(p.id, { onProgress, signal: abort.signal });
                const name = p.name.replace(/[^\w.-]+/g, '_') || 'video';
                lastResult = { name, result };
                X.download(result, name);
                toast('Vídeo exportado: ' + (result.bytes / 1048576).toFixed(1) + ' MB', 'success');
            }
            catch (e) {
                const err = e;
                if (err.name === 'AbortError')
                    toast('Exportação cancelada.', 'info');
                else {
                    lastError = err.message;
                    toast(err.message);
                }
            }
            finally {
                busy = null;
                render();
            }
        }
        /* ---------------- coluna lateral: inspetor do shot + áudio ---------------- */
        function sideColumn(p) {
            const side = el('div', 'vbv-side');
            if (showSettings)
                side.appendChild(settingsPanel(p));
            side.appendChild(audioBox(p));
            const shot = p.shots.find(s => s.id === shotId);
            if (shot)
                side.appendChild(shotInspector(p, shot));
            else
                side.appendChild(el('p', 'vbv-hint', 'Selecione um shot para ajustar câmera, transição, efeitos e falas.'));
            return side;
        }
        function audioBox(p) {
            const box = el('details', 'vbv-box');
            box.open = true;
            box.appendChild(el('summary', undefined, 'Áudio (' + p.clips.length + ')'));
            const bar = el('div', 'vbv-bar');
            const file = el('input');
            file.type = 'file';
            file.accept = 'audio/*,.wav,.mp3,.ogg,.m4a,.flac,.opus,.aac';
            file.multiple = true;
            file.hidden = true;
            let kind = 'voice';
            file.addEventListener('change', () => {
                const files = Array.from(file.files ?? []);
                file.value = '';
                if (!files.length)
                    return;
                void guarded(async () => { for (const f of files) {
                    try {
                        await V.importClip(p.id, f, kind);
                    }
                    catch (e) {
                        toast(f.name + ': ' + e.message);
                    }
                } buffers.clear(); });
            });
            bar.appendChild(file);
            for (const [k, label] of [['voice', '+ Voz'], ['sfx', '+ Efeito'], ['music', '+ Música']])
                bar.appendChild(button(label, () => { kind = k; file.click(); }, 'btn', 'Importar áudio (' + CLIP_LABEL[k] + '). Pode escolher vários arquivos.'));
            box.appendChild(bar);
            box.appendChild(button('Vincular vozes às falas na ordem', () => { void guarded(async () => { const r = await V.bindInOrder(p.id); toast(r.bound + ' voz(es) vinculada(s)' + (r.pending ? '; ' + r.pending + ' fala(s) sem voz' : ''), 'info'); sessionDirty = false; await seek(playhead); }); }, 'btn', 'As vozes livres, na ordem em que foram importadas, vão para as falas (balões) na ordem do vídeo'));
            const list = el('div', 'vbv-clips');
            for (const c of p.clips) {
                const row = el('div', 'vbv-clip');
                row.appendChild(el('span', 'vbv-clipk k-' + c.kind, CLIP_LABEL[c.kind]));
                row.appendChild(el('span', 'vbv-clipn', c.label + ' · ' + c.duration.toFixed(1) + 's'));
                row.appendChild(button('▶', () => { void (async () => { if (!actx)
                    actx = new AudioContext(); await actx.resume(); const b = await bufferOf(c.assetId); if (!b)
                    return; const s = actx.createBufferSource(); s.buffer = b; const g = actx.createGain(); g.gain.value = c.gain; s.connect(g); g.connect(actx.destination); s.start(); })(); }, 'btn mini', 'Ouvir'));
                if (c.kind !== 'voice')
                    row.appendChild(button('+ linha do tempo', () => { void guarded(async () => { await V.addAudioEvent(p.id, { clipId: c.id, shotId: shotId, at: 0, loop: c.kind === 'music', gain: c.kind === 'music' ? 0.5 : 1, fadeIn: c.kind === 'music' ? 1 : 0, fadeOut: c.kind === 'music' ? 1.5 : 0 }); }); }, 'btn mini', 'Põe este áudio na linha do tempo' + (shotId ? ' a partir do shot selecionado' : '')));
                row.appendChild(button('🗑', () => { void guarded(async () => { await V.removeClip(p.id, c.id); buffers.delete(c.assetId); }); }, 'btn mini', 'Remover áudio'));
                list.appendChild(row);
            }
            if (!p.clips.length)
                list.appendChild(el('p', 'vbv-hint', 'Importe a dublagem (ElevenLabs etc.), efeitos e música. No modo automático cada fala dura o tempo do áudio vinculado.'));
            box.appendChild(list);
            if (p.audioEvents.length) {
                const ev = el('div', 'vbv-events');
                for (const e of p.audioEvents) {
                    const c = p.clips.find(x => x.id === e.clipId);
                    const row = el('div', 'vbv-event');
                    row.appendChild(el('span', undefined, (c?.label ?? '?') + (e.shotId ? ' @ shot' : '') + ' ' + e.at.toFixed(1) + 's'));
                    row.appendChild(number(e.at, { min: 0, max: 36000, step: 0.1 }, v => { if (v !== null)
                        void guarded(() => V.updateAudioEvent(p.id, e.id, { at: v })); }));
                    row.appendChild(number(e.gain, { min: 0, max: 4, step: 0.1 }, v => { if (v !== null)
                        void guarded(() => V.updateAudioEvent(p.id, e.id, { gain: v })); }));
                    row.appendChild(button('🗑', () => { void guarded(() => V.removeAudioEvent(p.id, e.id)); }, 'btn mini', 'Remover da linha do tempo'));
                    ev.appendChild(row);
                }
                box.appendChild(ev);
            }
            return box;
        }
        function shotInspector(p, shot) {
            const box = el('div', 'vbv-inspector');
            const info = V.pageInfo(shot.pageId);
            const up = (patch) => { void guarded(async () => { await V.updateShot(p.id, shot.id, patch); sessionDirty = patch.pageId !== undefined; await seek(playhead); }); };
            const g1 = el('details', 'vbv-box');
            g1.open = true;
            g1.appendChild(el('summary', undefined, 'Shot: ' + (shot.label || 'sem nome')));
            const label = el('input');
            label.type = 'text';
            label.value = shot.label;
            label.maxLength = 80;
            label.addEventListener('change', () => up({ label: label.value }));
            g1.appendChild(field('Nome', label));
            const focusVal = shot.focus.kind === 'panel' ? 'panel:' + shot.focus.panelId : shot.focus.kind;
            const fopts = [['page', 'Página inteira'], ...(info?.panels ?? []).map((pn, i) => ['panel:' + pn.id, 'Painel ' + (i + 1)])];
            if (shot.focus.kind === 'rect')
                fopts.push(['rect', 'Área livre']);
            g1.appendChild(field('Foco', select(fopts, focusVal, v => { if (v === 'page')
                up({ focus: { kind: 'page' } });
            else if (v.startsWith('panel:'))
                up({ focus: { kind: 'panel', panelId: v.slice(6) } }); })));
            g1.appendChild(field('Enquadramento do shot', select([
                ['inherit', 'Herdar do vídeo'], ['page', 'Página completa'], ['isolated', 'Painel isolado']
            ], shot.framing ?? 'inherit', v => up({ framing: v }), 'Substitui a configuração geral apenas neste shot')));
            if (shot.focus.kind !== 'panel') g1.appendChild(el('p', 'vbv-hint',
                'O modo isolado só é aplicado quando o foco deste shot é um painel.'));
            const dur = number(shot.duration, { min: 0.1, max: 3600, step: 0.1, placeholder: 'automática' }, v => up({ duration: v }));
            g1.appendChild(field('Duração (s)', dur, 'Vazio = automática (termina após a última fala + cauda)'));
            g1.appendChild(field('Câmera', select(Object.entries(MOVE_LABEL), shot.camera.move, v => up({ camera: { ...shot.camera, move: v } }))));
            g1.appendChild(field('Intensidade', number(shot.camera.amount, { min: 0, max: 1, step: 0.05 }, v => { if (v !== null)
                up({ camera: { ...shot.camera, amount: v } }); })));
            g1.appendChild(field('Curva', select(Object.entries(EASE_LABEL), shot.camera.ease, v => up({ camera: { ...shot.camera, ease: v } }))));
            g1.appendChild(field('Transição de entrada', select(Object.entries(TRANS_LABEL), shot.transition.kind, v => up({ transition: { ...shot.transition, kind: v } }))));
            g1.appendChild(field('Duração da transição (s)', number(shot.transition.duration, { min: 0, max: 5, step: 0.05 }, v => { if (v !== null)
                up({ transition: { ...shot.transition, duration: v } }); })));
            g1.appendChild(field('Curva da transição', select(Object.entries(EASE_LABEL), shot.transition.ease, v => up({ transition: { ...shot.transition, ease: v } }))));
            box.appendChild(g1);
            /* efeitos */
            const g2 = el('details', 'vbv-box');
            g2.open = true;
            g2.appendChild(el('summary', undefined, 'Efeitos de câmera/imagem (' + shot.fx.length + ')'));
            const addRow = el('div', 'vbv-bar');
            const fxSel = select(Object.entries(FX_LABEL), 'shake', () => undefined, 'Novo efeito');
            addRow.appendChild(fxSel);
            addRow.appendChild(button('+ Efeito', () => { void guarded(async () => { await V.addFx(p.id, shot.id, { kind: fxSel.value, at: Math.max(0, +(playhead - (planCache?.shots.find(x => x.id === shot.id)?.start ?? 0)).toFixed(2)), duration: 0.5, intensity: 0.6 }); await seek(playhead); }); }));
            g2.appendChild(addRow);
            for (const fx of shot.fx) {
                const r = el('div', 'vbv-fx');
                r.appendChild(el('strong', undefined, FX_LABEL[fx.kind] ?? fx.kind));
                r.appendChild(field('início (s)', number(fx.at, { min: 0, max: 3600, step: 0.05 }, v => { if (v !== null)
                    void guarded(async () => { await V.updateFx(p.id, fx.id, { at: v }); await seek(playhead); }); })));
                r.appendChild(field('duração', number(fx.duration, { min: 0.02, max: 3600, step: 0.05 }, v => { if (v !== null)
                    void guarded(async () => { await V.updateFx(p.id, fx.id, { duration: v }); await seek(playhead); }); })));
                r.appendChild(field('força', number(fx.intensity, { min: 0, max: 1, step: 0.05 }, v => { if (v !== null)
                    void guarded(async () => { await V.updateFx(p.id, fx.id, { intensity: v }); await seek(playhead); }); })));
                if (fx.kind === 'tint' || fx.kind === 'flash' || fx.kind === 'fade-in' || fx.kind === 'fade-out') {
                    const c = el('input');
                    c.type = 'color';
                    c.value = /^#[0-9a-f]{6}$/i.test(fx.color ?? '') ? fx.color : '#ffffff';
                    c.addEventListener('change', () => { void guarded(async () => { await V.updateFx(p.id, fx.id, { color: c.value }); await seek(playhead); }); });
                    r.appendChild(field('cor', c));
                }
                r.appendChild(button('🗑', () => { void guarded(async () => { await V.removeFx(p.id, fx.id); await seek(playhead); }); }, 'btn mini', 'Remover efeito'));
                g2.appendChild(r);
            }
            box.appendChild(g2);
            /* falas e eventos */
            const g3 = el('details', 'vbv-box');
            g3.open = true;
            g3.appendChild(el('summary', undefined, 'Falas e revelações (' + shot.cues.length + ')'));
            const cueAdd = el('div', 'vbv-bar');
            const targets = [];
            if (info) {
                info.balloons.forEach(b => targets.push(['balloon:' + b.id, labelOf(info, 'balloon', b.id)]));
                info.texts.forEach(t => targets.push(['text:' + t.id, labelOf(info, 'text', t.id)]));
                info.panels.forEach((pn, i) => targets.push(['panel:' + pn.id, 'Painel ' + (i + 1)]));
                info.effects.forEach(e => targets.push(['effect:' + e.id, labelOf(info, 'effect', e.id)]));
                info.overlays.forEach(o => targets.push(['overlay:' + o.id, labelOf(info, 'overlay', o.id)]));
            }
            targets.push(['sfx:', 'Efeito sonoro solto']);
            const tSel = select(targets, targets[0]?.[0] ?? 'sfx:', () => undefined, 'Elemento da nova revelação');
            cueAdd.appendChild(tSel);
            cueAdd.appendChild(button('+ Revelar', () => { const [k, id] = tSel.value.split(':'); void guarded(async () => { const c = await V.addCue(p.id, shot.id, { kind: k, targetId: id || null }); cueId = c.id; await seek(playhead); }); }));
            g3.appendChild(cueAdd);
            const pshot = planCache?.shots.find(x => x.id === shot.id);
            for (const cue of shot.cues) {
                const r = el('div', 'vbv-cue' + (cue.id === cueId ? ' sel' : ''));
                const head = el('div', 'vbv-cuehead');
                const lbl = el('strong', undefined, labelOf(info, cue.kind, cue.targetId));
                head.appendChild(lbl);
                head.appendChild(button('🗑', () => { void guarded(async () => { await V.removeCue(p.id, cue.id); await seek(playhead); }); }, 'btn mini', 'Remover'));
                r.appendChild(head);
                const clipOpts = [['', '— sem áudio —'], ...p.clips.filter(c => cue.kind === 'sfx' ? c.kind !== 'music' : true).map(c => [c.id, CLIP_LABEL[c.kind] + ': ' + c.label])];
                r.appendChild(field('Áudio', select(clipOpts, cue.clipId ?? '', v => { void guarded(async () => { await V.bindClip(p.id, cue.id, v || null); await seek(playhead); }); })));
                r.appendChild(field('Entrada', select(Object.entries(REVEAL_LABEL), cue.anim, v => { void guarded(async () => { await V.updateCue(p.id, cue.id, { anim: v }); await seek(playhead); }); })));
                if (p.settings.sync === 'manual' || cue.at !== null)
                    r.appendChild(field('Início no shot (s)', number(cue.at, { min: 0, max: 3600, step: 0.05, placeholder: 'auto' }, v => { void guarded(async () => { await V.updateCue(p.id, cue.id, { at: v }); await seek(playhead); }); })));
                else
                    r.appendChild(button('Fixar tempo', () => { const pc = pshot ? planCache?.items.find(i => i.id === 'i_' + cue.id) : null; void guarded(async () => { await V.updateCue(p.id, cue.id, { at: pc && pshot ? +(pc.tIn - pshot.start).toFixed(2) : 0 }); }); }, 'btn mini'));
                if (cue.kind === 'balloon' || cue.kind === 'text')
                    r.appendChild(field('Legenda (opcional)', (() => { const i = el('input'); i.type = 'text'; i.value = cue.subtitle ?? ''; i.placeholder = 'usa o texto do balão'; i.maxLength = 500; i.addEventListener('change', () => { void guarded(async () => { await V.updateCue(p.id, cue.id, { subtitle: i.value || null }); await seek(playhead); }); }); return i; })()));
                r.addEventListener('click', ev => { if (ev.target.closest('input,select,button'))
                    return; cueId = cue.id; const it = planCache?.items.find(i => i.id === 'i_' + cue.id); if (it)
                    void seek(it.tIn + 0.05); render(); });
                g3.appendChild(r);
            }
            box.appendChild(g3);
            return box;
        }
        /* ---------------- linha do tempo ---------------- */
        function timeline(p, pl) {
            const tl = el('div', 'vbv-timeline');
            const head = el('div', 'vbv-tlhead');
            head.appendChild(el('strong', undefined, 'Linha do tempo'));
            head.appendChild(button('−', () => { timelineScale = Math.max(8, timelineScale / 1.4); render(); }, 'btn mini', 'Menos zoom'));
            head.appendChild(button('+', () => { timelineScale = Math.min(400, timelineScale * 1.4); render(); }, 'btn mini', 'Mais zoom'));
            head.appendChild(el('small', undefined, p.settings.sync === 'manual' ? 'Modo manual: arraste as falas para mudar o início.' : 'Modo automático: cada fala dura o tempo do áudio vinculado.'));
            tl.appendChild(head);
            if (!pl || !pl.duration) {
                tl.appendChild(el('p', 'vbv-hint', 'A linha do tempo aparece quando houver shots.'));
                return tl;
            }
            const scroller = el('div', 'vbv-tlscroll');
            const width = Math.ceil(pl.duration * timelineScale) + 40;
            const canvas = el('div', 'vbv-tlcanvas');
            canvas.style.width = width + 'px';
            const ruler = el('div', 'vbv-tlruler');
            const step = timelineScale >= 120 ? 1 : timelineScale >= 40 ? 5 : 10;
            for (let t = 0; t <= pl.duration; t += step) {
                const m = el('span', 'vbv-tick', fmt(t).replace('.0', ''));
                m.style.left = t * timelineScale + 'px';
                ruler.appendChild(m);
            }
            canvas.appendChild(ruler);
            const seekAt = (ev, host) => { const r = host.getBoundingClientRect(); pause(); void seek((ev.clientX - r.left) / timelineScale); };
            ruler.addEventListener('click', ev => seekAt(ev, canvas));
            const rows = [
                { name: 'Shots', blocks: pl.shots.map(s => ({ start: s.start, end: s.end, label: (p.shots.find(x => x.id === s.id)?.label || '') + ' · ' + pageName(s.pageId), cls: 'shot' + (s.id === shotId ? ' sel' : ''), shot: s.id })) },
                { name: 'Falas', blocks: pl.items.filter(i => i.kind === 'balloon' || i.kind === 'text').map(i => {
                        const cue = p.shots.flatMap(s => s.cues).find(c => 'i_' + c.id === i.id);
                        const sub = pl.subtitles.find(s => Math.abs(s.start - i.tIn) < 0.002);
                        return { start: i.tIn, end: sub ? sub.end : Math.min(i.tOut, i.tIn + 1), label: i.text ?? '', cls: 'line' + (cue?.clipId ? ' voiced' : '') + (cue?.id === cueId ? ' sel' : ''), cue: cue?.id };
                    }) },
                { name: 'Revelações', blocks: pl.items.filter(i => i.kind === 'panel' || i.kind === 'effect' || i.kind === 'overlay').map(i => ({ start: i.tIn, end: Math.min(i.tOut, i.tIn + 0.6), label: i.kind === 'panel' ? 'painel' : i.kind, cls: 'reveal' })) },
                { name: 'Efeitos', blocks: pl.shots.flatMap(s => s.fx.map(f => ({ start: f.start, end: f.end, label: FX_LABEL[f.kind] ?? f.kind, cls: 'fx' }))) },
                { name: 'Áudio', blocks: pl.audio.map(a => ({ start: a.start, end: a.start + a.duration, label: p.clips.find(c => c.id === a.clipId)?.label ?? '', cls: 'audio k-' + a.kind })) }
            ];
            for (const row of rows) {
                const r = el('div', 'vbv-tlrow');
                r.appendChild(el('span', 'vbv-tlname', row.name));
                const lane = el('div', 'vbv-lane');
                lane.addEventListener('click', ev => { if (!ev.target.classList.contains('vbv-lane'))
                    return; seekAt(ev, canvas); });
                for (const b of row.blocks) {
                    const blk = el('div', 'vbv-block ' + b.cls, b.label);
                    blk.style.left = b.start * timelineScale + 'px';
                    blk.style.width = Math.max(4, (b.end - b.start) * timelineScale) + 'px';
                    blk.title = b.label + ' (' + b.start.toFixed(2) + 's – ' + b.end.toFixed(2) + 's)';
                    blk.addEventListener('click', ev => { ev.stopPropagation(); if (b.shot) {
                        shotId = b.shot;
                        cueId = null;
                    } if (b.cue)
                        cueId = b.cue; pause(); void seek(b.start + 0.02); render(); });
                    if (b.cue && p.settings.sync === 'manual') {
                        blk.classList.add('draggable');
                        blk.addEventListener('pointerdown', ev => {
                            ev.preventDefault();
                            blk.setPointerCapture(ev.pointerId);
                            const x0 = ev.clientX, left0 = b.start;
                            const cue = p.shots.flatMap(s => s.cues).find(c => c.id === b.cue);
                            const shotStart = pl.shots.find(s => s.id === p.shots.find(sh => sh.cues.some(c => c.id === cue.id))?.id)?.start ?? 0;
                            let moved = 0;
                            const move = (e) => { moved = (e.clientX - x0) / timelineScale; blk.style.left = Math.max(0, (left0 + moved)) * timelineScale + 'px'; };
                            const up = (e) => {
                                blk.releasePointerCapture(e.pointerId);
                                blk.removeEventListener('pointermove', move);
                                blk.removeEventListener('pointerup', up);
                                if (Math.abs(moved) > 0.03)
                                    void guarded(async () => { await V.updateCue(p.id, cue.id, { at: Math.max(0, +(left0 + moved - shotStart).toFixed(2)) }); await seek(playhead); });
                            };
                            blk.addEventListener('pointermove', move);
                            blk.addEventListener('pointerup', up);
                        });
                    }
                    lane.appendChild(blk);
                }
                r.appendChild(lane);
                canvas.appendChild(r);
            }
            const ph = el('div', 'vbv-playhead');
            ph.style.left = playhead * timelineScale + 'px';
            canvas.appendChild(ph);
            if (transportEls)
                transportEls.head = ph;
            scroller.appendChild(canvas);
            tl.appendChild(scroller);
            return tl;
        }
        /* ------------------------------------------------------------------
         * Integração: eventos, menu de contexto, teclado
         * ------------------------------------------------------------------ */
        kernel.on('video:changed', () => {
            if (!root)
                return;
            if (!playing)
                render();
        });
        kernel.on('instances:changed', () => {
            if (!root)
                return;
            sessionDirty = true;
            if (dirtyTimer)
                clearTimeout(dirtyTimer);
            dirtyTimer = window.setTimeout(() => { dirtyTimer = null; if (root && !playing && !busy)
                void seek(playhead).then(() => render()); }, 500);
        });
        kernel.listen(window, 'keydown', event => {
            const e = event;
            if (!root)
                return;
            if (e.key === 'Escape' && !busy) {
                close();
                return;
            }
            if (e.key === ' ' && !e.target.closest('input,select,textarea,button')) {
                e.preventDefault();
                if (playing)
                    pause();
                else
                    void play();
            }
        });
        kernel.on('contextmenu:extend', payload => {
            const target = payload;
            target.items.push({ icon: '🎬', label: 'Vídeo (voice comic)…', action: () => { void open(); } });
        });
        kernel.provide('ui.video', { open, close, isOpen: () => !!root });
    }
});
