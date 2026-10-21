"use strict";
/* =====================================================================
 * plugins/14a-video-render.ts  (Fase 21)
 * ---------------------------------------------------------------------
 * Renderizador de quadros do vídeo. Cada elemento da página (painel, balão, texto, efeito, overlay)
 * vira um sprite transparente gerado pelo MESMO caminho da exportação PNG (renderPageToCanvas com
 * `only`). A cena é recomposta em coordenadas de página com câmera (centro, largura, rotação),
 * animações de revelação, transições, efeitos de pós-processamento e legendas.
 * Tudo é função pura do tempo `t` (ruído por semente) → prévia e exportação saem idênticas.
 *
 * Fornece: videoRender
 * ===================================================================== */
definePlugin({
    id: 'video-render',
    version: '1.0.0',
    needs: ['utils', 'state', 'mangaExport', 'video'],
    provides: ['videoRender'],
    uses: [],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'mangaExport': '^2.0.0', 'video': '^1.0.0' },
    contractVersions: { 'videoRender': '1.0.0' },
    setup: async function (kernel) {
        const stateApi = await kernel.require('state');
        const S = stateApi.data;
        const ME = await kernel.require('mangaExport');
        const V = await kernel.require('video');
        const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
        const lerp = (a, b, t) => a + (b - a) * t;
        const EASE = {
            'linear': t => t, 'ease-in': t => t * t * t, 'ease-out': t => 1 - Math.pow(1 - t, 3),
            'ease-in-out': t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
            'back': t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
        };
        const ease = (kind, t) => (EASE[kind] || EASE['linear'])(clamp(t, 0, 1));
        function rng(seed) {
            let a = seed >>> 0;
            return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        }
        const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        } return h >>> 0; };
        function belongsToPanel(sprite, scene, targetId) {
            if (sprite.kind === 'panel') return sprite.id === targetId;
            const px = sprite.x + sprite.w / 2, py = sprite.y + sprite.h / 2;
            const inside = (poly) => {
                let hit = false;
                for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                    const a = poly[i], b = poly[j];
                    if ((a[1] > py) !== (b[1] > py) &&
                        px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
                }
                return hit;
            };
            const owner = scene.panels.find(p => inside(p.polygon));
            if (owner) return owner.id === targetId;
            let best = null, dist = Infinity;
            for (const p of scene.panels) {
                const d = Math.hypot(px - (p.x + p.width / 2), py - (p.y + p.height / 2));
                if (d < dist) { dist = d; best = p.id; }
            }
            return best === targetId;
        }
        function trim(src) {
            const w = src.width, h = src.height, ctx = src.getContext('2d');
            let minX = w, minY = h, maxX = -1, maxY = -1;
            const band = 256;
            for (let y0 = 0; y0 < h; y0 += band) {
                const bh = Math.min(band, h - y0);
                const data = ctx.getImageData(0, y0, w, bh).data;
                for (let y = 0; y < bh; y++) {
                    const row = y * w * 4;
                    for (let x = 0; x < w; x++) {
                        if (data[row + x * 4 + 3] !== 0) {
                            if (x < minX)
                                minX = x;
                            if (x > maxX)
                                maxX = x;
                            const yy = y0 + y;
                            if (yy < minY)
                                minY = yy;
                            if (yy > maxY)
                                maxY = yy;
                        }
                    }
                }
            }
            if (maxX < 0)
                return null;
            const out = document.createElement('canvas');
            out.width = maxX - minX + 1;
            out.height = maxY - minY + 1;
            out.getContext('2d').drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
            return { canvas: out, x: minX, y: minY };
        }
        async function buildScene(pageId, quality, warnings) {
            const board = S.boards.find(b => b.id === S.currentBoardId);
            const page = board?.instances.find(i => i.id === pageId);
            if (!page || page.type !== 'manga-page')
                throw Error('Manga page not found: ' + pageId);
            const info = V.pageInfo(pageId);
            if (!info)
                throw Error('Page has no panel set: ' + pageId);
            const cache = new Map();
            const sprites = [];
            let q = quality;
            async function one(only) {
                const r = await ME.renderPageToCanvas(page, { quality: q, only, imageCache: cache, silent: true });
                q = r.resolution.quality;
                for (const w of r.warnings)
                    if (!warnings.includes(w.message))
                        warnings.push(w.message);
                const t = trim(r.canvas);
                r.canvas.width = 0;
                r.canvas.height = 0;
                if (only.kind === 'panel') {
                    /* o painel é papel branco com o conteúdo por cima (como na exportação PNG) */
                    const poly = info.panels.find(pn => pn.id === only.id)?.polygon;
                    if (poly && poly.length > 2) {
                        const sx = t ? t.x / q : Infinity, sy = t ? t.y / q : Infinity;
                        const minX = Math.min(sx, ...poly.map(v => v[0])), minY = Math.min(sy, ...poly.map(v => v[1]));
                        const maxX = Math.max(t ? sx + t.canvas.width / q : -Infinity, ...poly.map(v => v[0])), maxY = Math.max(t ? sy + t.canvas.height / q : -Infinity, ...poly.map(v => v[1]));
                        const c = document.createElement('canvas');
                        c.width = Math.max(1, Math.ceil((maxX - minX) * q));
                        c.height = Math.max(1, Math.ceil((maxY - minY) * q));
                        const g = c.getContext('2d');
                        g.fillStyle = '#ffffff';
                        g.beginPath();
                        poly.forEach((v, i) => { const px = (v[0] - minX) * q, py = (v[1] - minY) * q; if (i)
                            g.lineTo(px, py);
                        else
                            g.moveTo(px, py); });
                        g.closePath();
                        g.fill();
                        if (t) {
                            g.drawImage(t.canvas, Math.round((sx - minX) * q), Math.round((sy - minY) * q));
                            t.canvas.width = 0;
                            t.canvas.height = 0;
                        }
                        sprites.push({ kind: 'panel', id: only.id, canvas: c, x: minX, y: minY, w: c.width / q, h: c.height / q });
                        return;
                    }
                }
                if (!t)
                    return;
                sprites.push({ kind: only.kind, id: only.id, canvas: t.canvas, x: t.x / q, y: t.y / q, w: t.canvas.width / q, h: t.canvas.height / q });
            }
            try {
                for (const p of info.panels)
                    await one({ kind: 'panel', id: p.id });
                for (const e of info.effects)
                    if (e.scope === 'page')
                        await one({ kind: 'effect', id: e.id });
                for (const o of info.overlays)
                    await one({ kind: 'overlay', id: o.id });
                for (const b of info.balloons)
                    await one({ kind: 'balloon', id: b.id });
                for (const t of info.texts)
                    await one({ kind: 'text', id: t.id });
            }
            catch (e) {
                for (const s of sprites) {
                    s.canvas.width = 0;
                    s.canvas.height = 0;
                }
                throw e;
            }
            return { pageId, width: info.width, height: info.height, sprites, panels: info.panels };
        }
        /* ------------------------------------------------------------------
         * Sessão de renderização
         * ------------------------------------------------------------------ */
        async function prepare(initialPlan, opts = {}) {
            let plan = initialPlan;
            const W = Math.max(16, Math.round(opts.width ?? plan.width)), H = Math.max(16, Math.round(opts.height ?? plan.height));
            const bg = opts.background ?? '#0b0b0f';
            const dim = opts.unrevealed === 'dim';
            const subs = opts.subtitles ?? null;
            const warnings = plan.warnings.slice();
            const pageIds = Array.from(new Set(plan.shots.map(s => s.pageId)));
            /* resolução dos sprites: pixels por unidade de página necessários na câmera mais fechada */
            let minCam = Infinity;
            for (const s of plan.shots)
                minCam = Math.min(minCam, s.camera.from.w, s.camera.to.w);
            const need = Number.isFinite(minCam) ? W / (minCam * 0.8) : 1;
            const quality = clamp(Math.round(need * 100) / 100, 0.4, 4);
            const scenes = new Map();
            let done = 0;
            try {
                for (const id of pageIds) {
                    scenes.set(id, await buildScene(id, quality, warnings));
                    opts.onProgress?.(++done, pageIds.length);
                }
            }
            catch (e) {
                disposeScenes(scenes);
                throw e;
            }
            const make = () => {
                const c = document.createElement('canvas');
                c.width = W;
                c.height = H;
                return { c, x: c.getContext('2d', { willReadFrequently: false }) };
            };
            const A = make(), B = make(), T = make(), T2 = make();
            let noise = null;
            const noiseTiles = [];
            function noiseTile(i) {
                if (noiseTiles[i])
                    return noiseTiles[i];
                const c = document.createElement('canvas');
                c.width = 128;
                c.height = 128;
                const x = c.getContext('2d');
                const img = x.createImageData(128, 128);
                const r = rng(1234 + i * 77);
                for (let p = 0; p < img.data.length; p += 4) {
                    const v = Math.floor(r() * 256);
                    img.data[p] = v;
                    img.data[p + 1] = v;
                    img.data[p + 2] = v;
                    img.data[p + 3] = 255;
                }
                x.putImageData(img, 0, 0);
                noiseTiles[i] = c;
                return c;
            }
            void noise;
            const shotAt = (t) => {
                const last = plan.shots.length - 1;
                for (let i = 0; i <= last; i++)
                    if (t < plan.shots[i].end || i === last)
                        return i;
                return last;
            };
            const itemsFor = (pageId, t) => {
                const m = new Map();
                for (const it of plan.items)
                    if (it.pageId === pageId && it.targetId && t >= it.tIn && t < it.tOut)
                        m.set(it.kind + '|' + it.targetId, it);
                return m;
            };
            const firstAppear = new Map();
            for (const it of plan.items)
                if (it.targetId) {
                    const k = it.pageId + '|' + it.kind + '|' + it.targetId;
                    const p = firstAppear.get(k);
                    if (p === undefined || it.tIn < p)
                        firstAppear.set(k, it.tIn);
                }
            /* câmera em t dentro do shot (inclui efeitos de câmera dos fx) */
            function camAt(shot, t, frame) {
                const act = shot.start + shot.lead;
                const span = Math.max(0.001, shot.end - act);
                const u = clamp((t - act) / span, 0, 1);
                const e = ease(shot.camera.ease, u);
                const f = shot.camera.from, g = shot.camera.to;
                let cam = { cx: lerp(f.cx, g.cx, e), cy: lerp(f.cy, g.cy, e), w: lerp(f.w, g.w, e), rot: lerp(f.rot, g.rot, e) };
                if (shot.camera.move === 'heartbeat') {
                    const beat = Math.pow(Math.max(0, Math.sin((t - act) * Math.PI * 2 * 1.1)), 6);
                    cam = { ...cam, w: cam.w * (1 - 0.035 * Math.max(0.3, shot.camera.amount) * beat) };
                }
                let blur = 0;
                const h = cam.w / (W / H);
                for (const fx of shot.fx) {
                    if (t < fx.start || t >= fx.end)
                        continue;
                    const p = (t - fx.start) / Math.max(0.001, fx.end - fx.start);
                    const env = Math.sin(Math.PI * p);
                    const r = rng(hash(fx.id) + frame * 9973);
                    const i = fx.intensity;
                    if (fx.kind === 'shake')
                        cam = { ...cam, cx: cam.cx + (r() - 0.5) * 2 * 0.025 * i * cam.w * env, cy: cam.cy + (r() - 0.5) * 2 * 0.025 * i * h * env };
                    else if (fx.kind === 'rumble')
                        cam = { ...cam, cx: cam.cx + Math.sin(t * 60) * 0.008 * i * cam.w * env, cy: cam.cy + Math.cos(t * 47) * 0.008 * i * h * env };
                    else if (fx.kind === 'zoom-punch')
                        cam = { ...cam, w: cam.w * (1 - 0.14 * i * Math.pow(1 - p, 2)) };
                    else if (fx.kind === 'rotate-punch')
                        cam = { ...cam, rot: cam.rot + 5 * i * Math.pow(1 - p, 2) * (hash(fx.id) % 2 ? 1 : -1) };
                    else if (fx.kind === 'speed-zoom')
                        cam = { ...cam, w: cam.w * (1 - 0.3 * i * ease('ease-in', p)) };
                    else if (fx.kind === 'whip') {
                        cam = { ...cam, cx: cam.cx + (p - 0.5) * 0.35 * i * cam.w * Math.sin(Math.PI * p) };
                        blur = Math.max(blur, 14 * i * env);
                    }
                }
                return { cam, extraBlur: blur };
            }
            /* desenha a cena de uma página com a câmera dada */
            function drawScene(x, scene, cam, t, shot, parallax) {
                x.save();
                x.fillStyle = bg;
                x.fillRect(0, 0, W, H);
                const scale = W / cam.w;
                x.translate(W / 2, H / 2);
                x.rotate(cam.rot * Math.PI / 180);
                x.scale(scale, scale);
                x.translate(-cam.cx, -cam.cy);
                const focused = shot?.framing === 'isolated' && shot.isolationPanelId
                    ? scene.panels.find(p => p.id === shot.isolationPanelId) : undefined;
                if (focused) {
                    x.beginPath();
                    focused.polygon.forEach((pt, i) => {
                        if (i === 0) x.moveTo(pt[0], pt[1]);
                        else x.lineTo(pt[0], pt[1]);
                    });
                    x.closePath();
                    x.clip();
                }
                const active = itemsFor(scene.pageId, t);
                const implicitPanelId = focused && !plan.items.some(item =>
                    item.shotId === shot?.id && item.kind === 'panel' && item.targetId === focused.id)
                    ? focused.id : null;
                const base = shot ? { x: shot.focus.x + shot.focus.width / 2, y: shot.focus.y + shot.focus.height / 2 } : { x: cam.cx, y: cam.cy };
                for (const sp of scene.sprites) {
                    if (focused && !belongsToPanel(sp, scene, focused.id)) continue;
                    const it = active.get(sp.kind + '|' + sp.id);
                    const implicitFocus = sp.kind === 'panel' && sp.id === implicitPanelId;
                    let alpha = 1, dx = 0, dy = 0, zoom = 1, clip = null, prog = 1;
                    if (!it) {
                        if (implicitFocus) { /* render focused panel without a cue */ }
                        else if (!dim || sp.kind !== 'panel') continue;
                        else {
                            const appear = firstAppear.get(scene.pageId + '|panel|' + sp.id);
                            if (appear !== undefined && t >= appear) continue;
                            alpha = 0.14;
                        }
                    }
                    else {
                        const raw = it.animDuration <= 0 || it.anim === 'cut' ? 1 : clamp((t - it.tIn) / it.animDuration, 0, 1);
                        prog = raw;
                        const e = ease('ease-out', raw);
                        switch (it.anim) {
                            case 'cut': break;
                            case 'fade':
                                alpha = e;
                                break;
                            case 'pop':
                                alpha = clamp(raw * 2, 0, 1);
                                zoom = 0.6 + 0.4 * ease('back', raw);
                                break;
                            case 'slide-left':
                                dx = (1 - e) * sp.w * 0.6;
                                alpha = e;
                                break;
                            case 'slide-right':
                                dx = -(1 - e) * sp.w * 0.6;
                                alpha = e;
                                break;
                            case 'slide-up':
                                dy = (1 - e) * sp.h * 0.6;
                                alpha = e;
                                break;
                            case 'slide-down':
                                dy = -(1 - e) * sp.h * 0.6;
                                alpha = e;
                                break;
                            case 'wipe':
                                clip = 'wipe';
                                break;
                            case 'typewriter':
                                clip = 'type';
                                break;
                        }
                    }
                    if (alpha <= 0)
                        continue;
                    if (parallax > 0 && (sp.kind === 'balloon' || sp.kind === 'text')) {
                        dx += (cam.cx - base.x) * 0.12 * parallax;
                        dy += (cam.cy - base.y) * 0.12 * parallax;
                    }
                    x.save();
                    x.globalAlpha = alpha;
                    const cx = sp.x + sp.w / 2, cy = sp.y + sp.h / 2;
                    x.translate(cx + dx, cy + dy);
                    x.scale(zoom, zoom);
                    x.translate(-cx, -cy);
                    if (clip) {
                        x.beginPath();
                        if (clip === 'wipe')
                            x.rect(sp.x, sp.y, sp.w * prog, sp.h);
                        else
                            x.rect(sp.x, sp.y, sp.w * prog, sp.h);
                        x.clip();
                    }
                    x.drawImage(sp.canvas, sp.x, sp.y, sp.w, sp.h);
                    x.restore();
                }
                x.restore();
            }
            function shotCam(shot, t, frame) {
                const r = camAt(shot, t, frame);
                return { cam: r.cam, blur: r.extraBlur };
            }
            /* uma "imagem" completa da cena do shot em t para um canvas alvo */
            function drawShot(x, shot, t, frame) {
                const scene = scenes.get(shot.pageId);
                const { cam, blur } = shotCam(shot, t, frame);
                const par = shot.fx.some(f => f.kind === 'parallax' && t >= f.start && t < f.end) ? 1 : 0;
                drawScene(x, scene, cam, t, shot, par);
                return blur;
            }
            /* ------------------ transições ------------------ */
            function drawTransition(out, kind, o, n, p, frame, seed) {
                out.save();
                out.globalAlpha = 1;
                const draw = (c, dx = 0, dy = 0, a = 1) => { out.globalAlpha = a; out.drawImage(c, dx, dy); out.globalAlpha = 1; };
                switch (kind) {
                    case 'crossfade':
                    case 'camera-move':
                        draw(o);
                        draw(n, 0, 0, p);
                        break;
                    case 'dip-black':
                    case 'dip-white': {
                        const c = kind === 'dip-black' ? '#000' : '#fff';
                        if (p < 0.5) {
                            draw(o);
                            out.fillStyle = c;
                            out.globalAlpha = p * 2;
                            out.fillRect(0, 0, W, H);
                        }
                        else {
                            draw(n);
                            out.fillStyle = c;
                            out.globalAlpha = (1 - p) * 2;
                            out.fillRect(0, 0, W, H);
                        }
                        break;
                    }
                    case 'slide-left':
                        draw(o);
                        draw(n, (1 - p) * W, 0);
                        break;
                    case 'slide-right':
                        draw(o);
                        draw(n, -(1 - p) * W, 0);
                        break;
                    case 'slide-up':
                        draw(o);
                        draw(n, 0, (1 - p) * H);
                        break;
                    case 'slide-down':
                        draw(o);
                        draw(n, 0, -(1 - p) * H);
                        break;
                    case 'push-left':
                        draw(o, -p * W, 0);
                        draw(n, (1 - p) * W, 0);
                        break;
                    case 'push-right':
                        draw(o, p * W, 0);
                        draw(n, -(1 - p) * W, 0);
                        break;
                    case 'wipe-left':
                    case 'wipe-right':
                    case 'wipe-up':
                    case 'wipe-down': {
                        draw(o);
                        out.save();
                        out.beginPath();
                        if (kind === 'wipe-left')
                            out.rect(W * (1 - p), 0, W * p, H);
                        else if (kind === 'wipe-right')
                            out.rect(0, 0, W * p, H);
                        else if (kind === 'wipe-up')
                            out.rect(0, H * (1 - p), W, H * p);
                        else
                            out.rect(0, 0, W, H * p);
                        out.clip();
                        draw(n);
                        out.restore();
                        break;
                    }
                    case 'wipe-diagonal': {
                        draw(o);
                        out.save();
                        out.beginPath();
                        const d = (W + H) * p;
                        out.moveTo(0, 0);
                        out.lineTo(Math.min(d, W), 0);
                        out.lineTo(0, Math.min(d, H));
                        out.closePath();
                        if (d > W) {
                            out.moveTo(W, 0);
                            out.lineTo(W, Math.min(d - W, H));
                            out.lineTo(Math.max(0, d - H), H);
                            out.lineTo(0, H);
                            out.lineTo(0, 0);
                            out.closePath();
                        }
                        out.rect(0, 0, 0, 0);
                        out.restore();
                        out.save();
                        out.beginPath();
                        out.moveTo(0, 0);
                        out.lineTo(W * 2 * p, 0);
                        out.lineTo(0, H * 2 * p);
                        out.closePath();
                        out.clip();
                        draw(n);
                        out.restore();
                        break;
                    }
                    case 'iris': {
                        draw(o);
                        out.save();
                        out.beginPath();
                        out.arc(W / 2, H / 2, Math.hypot(W, H) / 2 * p, 0, Math.PI * 2);
                        out.clip();
                        draw(n);
                        out.restore();
                        break;
                    }
                    case 'zoom-through': {
                        const so = 1 + p * 0.6, sn = 0.6 + p * 0.4;
                        out.save();
                        out.translate(W / 2, H / 2);
                        out.scale(so, so);
                        out.globalAlpha = 1 - p;
                        out.drawImage(o, -W / 2, -H / 2);
                        out.restore();
                        out.save();
                        out.translate(W / 2, H / 2);
                        out.scale(sn, sn);
                        out.globalAlpha = p;
                        out.drawImage(n, -W / 2, -H / 2);
                        out.restore();
                        break;
                    }
                    case 'flash': {
                        if (p < 0.5)
                            draw(o);
                        else
                            draw(n);
                        out.fillStyle = '#fff';
                        out.globalAlpha = Math.sin(Math.PI * p);
                        out.fillRect(0, 0, W, H);
                        break;
                    }
                    case 'glitch': {
                        draw(p < 0.5 ? o : n);
                        const r = rng(seed + frame * 31);
                        const strips = 10;
                        for (let i = 0; i < strips; i++) {
                            const sy = Math.floor(r() * H), sh = Math.max(4, Math.floor(r() * H * 0.12)), off = (r() - 0.5) * W * 0.25 * Math.sin(Math.PI * p);
                            out.drawImage(p < 0.5 ? n : o, 0, sy, W, sh, off, sy, W, sh);
                        }
                        break;
                    }
                    case 'blinds': {
                        draw(o);
                        const n2 = 8, sw = W / n2;
                        for (let i = 0; i < n2; i++)
                            out.drawImage(n, i * sw, 0, sw * p, H, i * sw, 0, sw * p, H);
                        break;
                    }
                    case 'dissolve': {
                        draw(o);
                        const cell = Math.max(8, Math.round(W / 64));
                        const r = rng(seed);
                        for (let yy = 0; yy < H; yy += cell)
                            for (let xx = 0; xx < W; xx += cell)
                                if (r() < p)
                                    out.drawImage(n, xx, yy, cell, cell, xx, yy, cell, cell);
                        break;
                    }
                    case 'page-turn': {
                        draw(n);
                        const wv = W * (1 - p);
                        out.save();
                        out.beginPath();
                        out.rect(0, 0, wv, H);
                        out.clip();
                        out.drawImage(o, 0, 0, W, H, 0, 0, wv, H);
                        const g = out.createLinearGradient(0, 0, wv, 0);
                        g.addColorStop(0, 'rgba(0,0,0,0)');
                        g.addColorStop(1, 'rgba(0,0,0,' + (0.45 * (1 - p)) + ')');
                        out.fillStyle = g;
                        out.fillRect(0, 0, wv, H);
                        out.restore();
                        break;
                    }
                    default:
                        draw(p < 1 ? o : n);
                        if (p >= 1)
                            draw(n);
                }
                out.restore();
            }
            /* ------------------ pós-efeitos ------------------ */
            const filterOk = (() => { try {
                return 'filter' in A.x;
            }
            catch {
                return false;
            } })();
            function applyPost(out, src, shot, t, frame, camBlur) {
                let cur = src;
                const passes = [];
                let filters = '';
                let overlayFns = [];
                let blur = camBlur;
                let chroma = 0, glitchAmt = 0;
                for (const fx of shot.fx) {
                    if (t < fx.start || t >= fx.end)
                        continue;
                    const p = (t - fx.start) / Math.max(0.001, fx.end - fx.start), i = fx.intensity, r = rng(hash(fx.id) + frame * 7919);
                    switch (fx.kind) {
                        case 'blur-in':
                            blur = Math.max(blur, 22 * i * (1 - p));
                            break;
                        case 'blur-out':
                            blur = Math.max(blur, 22 * i * p);
                            break;
                        case 'grayscale':
                            filters += ' grayscale(' + i + ')';
                            break;
                        case 'sepia':
                            filters += ' sepia(' + i + ')';
                            break;
                        case 'contrast-pop':
                            filters += ' contrast(' + (1 + 0.8 * i) + ') saturate(' + (1 + 0.6 * i) + ')';
                            break;
                        case 'chromatic':
                            chroma = Math.max(chroma, 0.012 * i * W);
                            break;
                        case 'glitch':
                            glitchAmt = Math.max(glitchAmt, i);
                            chroma = Math.max(chroma, 0.01 * i * W);
                            break;
                        case 'flash':
                            overlayFns.push(x => { x.globalAlpha = i * Math.pow(1 - p, 2); x.fillStyle = fx.color || '#fff'; x.fillRect(0, 0, W, H); });
                            break;
                        case 'invert-flash':
                            passes.push(() => {
                                T2.x.clearRect(0, 0, W, H);
                                if (filterOk)
                                    T2.x.filter = 'invert(1)';
                                T2.x.drawImage(cur, 0, 0);
                                T2.x.filter = 'none';
                                out.globalAlpha = i * Math.pow(1 - p, 1.5);
                                out.drawImage(T2.c, 0, 0);
                                out.globalAlpha = 1;
                            });
                            break;
                        case 'vignette':
                            overlayFns.push(x => {
                                const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.hypot(W, H) / 2);
                                g.addColorStop(0, 'rgba(0,0,0,0)');
                                g.addColorStop(1, 'rgba(0,0,0,' + (0.85 * i * Math.sin(Math.PI * Math.min(1, p * 1.2 + 0.001)) ** 0.5) + ')');
                                x.globalAlpha = 1;
                                x.fillStyle = g;
                                x.fillRect(0, 0, W, H);
                            });
                            break;
                        case 'tint':
                            overlayFns.push(x => { x.globalCompositeOperation = 'multiply'; x.globalAlpha = 0.6 * i; x.fillStyle = fx.color || '#ff3030'; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'source-over'; });
                            break;
                        case 'grain':
                            overlayFns.push(x => {
                                x.globalCompositeOperation = 'overlay';
                                x.globalAlpha = 0.35 * i;
                                const tile = noiseTile(frame % 6), ox = Math.floor(r() * 128), oy = Math.floor(r() * 128);
                                for (let yy = -oy; yy < H; yy += 128)
                                    for (let xx = -ox; xx < W; xx += 128)
                                        x.drawImage(tile, xx, yy);
                                x.globalCompositeOperation = 'source-over';
                            });
                            break;
                        case 'strobe':
                            if (Math.floor((t - fx.start) * plan.fps / 2) % 2 === 0)
                                overlayFns.push(x => { x.globalAlpha = 0.55 * i; x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); });
                            break;
                        case 'letterbox':
                            overlayFns.push(x => { const hgt = H * 0.14 * i * ease('ease-out', Math.min(1, p * 4)); x.globalAlpha = 1; x.fillStyle = '#000'; x.fillRect(0, 0, W, hgt); x.fillRect(0, H - hgt, W, hgt); });
                            break;
                        case 'fade-in':
                            overlayFns.push(x => { x.globalAlpha = 1 - p; x.fillStyle = fx.color || '#000'; x.fillRect(0, 0, W, H); });
                            break;
                        case 'fade-out':
                            overlayFns.push(x => { x.globalAlpha = p; x.fillStyle = fx.color || '#000'; x.fillRect(0, 0, W, H); });
                            break;
                        default: break;
                    }
                }
                if (blur > 0.2)
                    filters += ' blur(' + (blur * W / 1920).toFixed(2) + 'px)';
                if (glitchAmt > 0 || chroma > 0 || filters) {
                    /* base processada → T */
                    T.x.clearRect(0, 0, W, H);
                    T.x.fillStyle = bg;
                    T.x.fillRect(0, 0, W, H);
                    if (filterOk && filters)
                        T.x.filter = filters.trim();
                    T.x.drawImage(cur, 0, 0);
                    T.x.filter = 'none';
                    if (glitchAmt > 0) {
                        const r = rng(hash(shot.id) + frame * 104729);
                        const n = Math.round(3 + 10 * glitchAmt);
                        for (let k = 0; k < n; k++) {
                            const sy = Math.floor(r() * H), sh = Math.max(3, Math.floor(r() * H * 0.1)), off = (r() - 0.5) * W * 0.18 * glitchAmt;
                            T.x.drawImage(T.c, 0, sy, W, sh, off, sy, W, sh);
                        }
                    }
                    cur = T.c;
                    if (chroma > 0) {
                        T2.x.save();
                        T2.x.globalCompositeOperation = 'source-over';
                        T2.x.fillStyle = '#000';
                        T2.x.fillRect(0, 0, W, H);
                        for (const [color, dx] of [['#ff0000', -chroma], ['#00ffff', chroma]]) {
                            B.x.clearRect(0, 0, W, H);
                            B.x.globalCompositeOperation = 'source-over';
                            B.x.drawImage(cur, 0, 0);
                            B.x.globalCompositeOperation = 'multiply';
                            B.x.fillStyle = color;
                            B.x.fillRect(0, 0, W, H);
                            B.x.globalCompositeOperation = 'source-over';
                            T2.x.globalCompositeOperation = 'lighter';
                            T2.x.drawImage(B.c, dx, 0);
                        }
                        T2.x.restore();
                        cur = T2.c;
                    }
                }
                out.drawImage(cur, 0, 0);
                for (const p of passes)
                    p();
                for (const fn of overlayFns) {
                    out.save();
                    fn(out);
                    out.restore();
                }
            }
            function drawSubtitle(out, t) {
                if (!subs || !subs.enabled)
                    return;
                const s = plan.subtitles.find(q => t >= q.start && t < q.end);
                if (!s)
                    return;
                const size = Math.round(H * subs.size);
                out.save();
                out.font = '700 ' + size + 'px "Noto Sans", "Segoe UI", system-ui, sans-serif';
                out.textAlign = 'center';
                out.textBaseline = 'alphabetic';
                const maxW = W * 0.86, words = s.text.split(/\s+/), lines = [];
                let line = '';
                for (const w of words) {
                    const trial = line ? line + ' ' + w : w;
                    if (out.measureText(trial).width > maxW && line) {
                        lines.push(line);
                        line = w;
                    }
                    else
                        line = trial;
                }
                if (line)
                    lines.push(line);
                const lh = size * 1.25, block = lines.length * lh;
                let y = subs.position === 'bottom' ? H - H * 0.05 - block + size : H * 0.05 + size;
                out.lineJoin = 'round';
                out.lineWidth = Math.max(2, size / 6);
                out.strokeStyle = subs.outline;
                out.fillStyle = subs.color;
                for (const l of lines.slice(0, 5)) {
                    out.strokeText(l, W / 2, y);
                    out.fillText(l, W / 2, y);
                    y += lh;
                }
                out.restore();
            }
            /* ------------------ quadro final ------------------ */
            function renderFrame(ctx, tIn, frameIndex) {
                const t = clamp(tIn, 0, Math.max(0, plan.duration - 1e-6));
                const frame = frameIndex ?? Math.round(t * plan.fps);
                if (!plan.shots.length) {
                    ctx.fillStyle = bg;
                    ctx.fillRect(0, 0, W, H);
                    return;
                }
                const idx = shotAt(t), shot = plan.shots[idx];
                const prev = idx > 0 ? plan.shots[idx - 1] : null;
                const inTrans = prev && shot.transition.duration > 0 && shot.transition.kind !== 'cut' && t < shot.start + shot.transition.duration;
                let blur = 0;
                if (inTrans && prev) {
                    const p = ease(shot.transition.ease, (t - shot.start) / shot.transition.duration);
                    if (shot.transition.kind === 'camera-move' && prev.pageId === shot.pageId) {
                        /* uma única cena: câmera viaja do fim do shot anterior ao início deste */
                        const scene = scenes.get(shot.pageId);
                        const a = prev.camera.to, b = shot.camera.from;
                        const cam = { cx: lerp(a.cx, b.cx, p), cy: lerp(a.cy, b.cy, p), w: Math.exp(lerp(Math.log(a.w), Math.log(b.w), p)), rot: lerp(a.rot, b.rot, p) };
                        drawScene(A.x, scene, cam, t, shot, 0);
                        blur = Math.sin(Math.PI * p) * 3;
                    }
                    else {
                        drawShot(A.x, prev, Math.min(t, prev.end - 1e-6), frame);
                        blur = drawShot(B.x, shot, t, frame);
                        T.x.clearRect(0, 0, W, H);
                        T.x.fillStyle = bg;
                        T.x.fillRect(0, 0, W, H);
                        drawTransition(T.x, shot.transition.kind, A.c, B.c, p, frame, hash(shot.id));
                        A.x.clearRect(0, 0, W, H);
                        A.x.drawImage(T.c, 0, 0);
                    }
                }
                else {
                    blur = drawShot(A.x, shot, t, frame);
                }
                ctx.fillStyle = bg;
                ctx.fillRect(0, 0, W, H);
                applyPost(ctx, A.c, shot, t, frame, blur);
                drawSubtitle(ctx, t);
            }
            function dispose() {
                disposeScenes(scenes);
                for (const o of [A, B, T, T2]) {
                    o.c.width = 0;
                    o.c.height = 0;
                }
                for (const c of noiseTiles)
                    if (c) {
                        c.width = 0;
                        c.height = 0;
                    }
            }
            function setPlan(next) {
                if (!next.shots.every(sh => scenes.has(sh.pageId)))
                    return false;
                plan = next;
                session.plan = next;
                firstAppear.clear();
                for (const it of plan.items)
                    if (it.targetId) {
                        const k = it.pageId + '|' + it.kind + '|' + it.targetId;
                        const p = firstAppear.get(k);
                        if (p === undefined || it.tIn < p)
                            firstAppear.set(k, it.tIn);
                    }
                return true;
            }
            const session = { plan, width: W, height: H, warnings, renderFrame, setPlan, dispose };
            return session;
        }
        function disposeScenes(scenes) {
            for (const sc of scenes.values())
                for (const s of sc.sprites) {
                    s.canvas.width = 0;
                    s.canvas.height = 0;
                }
            scenes.clear();
        }
        async function prepareProject(projectId, opts = {}) {
            const project = V.get(projectId);
            return prepare(V.compile(projectId), { background: project.settings.background, unrevealed: project.settings.unrevealed, subtitles: project.settings.subtitles, ...opts });
        }
        kernel.provide('videoRender', { prepare, prepareProject });
    }
});
