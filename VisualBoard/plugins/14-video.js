"use strict";
/* =====================================================================
 * plugins/14-video.ts  (Fase 21)
 * ---------------------------------------------------------------------
 * Páginas de mangá → vídeo (voice comic): modelo de dados, clipes de áudio,
 * montagem automática (um shot por painel) e COMPILADOR determinístico da linha do tempo.
 *
 * O áudio (dublagem, efeitos sonoros, música) é externo: entra como asset `kind:'audio'`
 * (mesma persistência, histórico e envelope do projeto). Sincronia:
 *   - auto (padrão): cada balão dura o tempo do áudio vinculado (sem áudio: estimado pelo texto);
 *   - manual: `at`/`duration` informados em cada cue.
 *
 * Fornece: video
 * ===================================================================== */
definePlugin({
    id: 'video',
    version: '1.0.0',
    needs: ['utils', 'state', 'history', 'backend', 'assets', 'mangaPage', 'panelSets'],
    provides: ['video'],
    uses: [],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'history': '^1.0.0', 'backend': '^1.0.0', 'assets': '^1.0.0', 'mangaPage': '^1.0.0', 'panelSets': '^1.0.0' },
    contractVersions: { 'video': '1.0.0' },
    setup: async function (kernel) {
        const utils = await kernel.require('utils');
        const stateApi = await kernel.require('state');
        const S = stateApi.data;
        const history = await kernel.require('history');
        const backend = await kernel.require('backend');
        const A = await kernel.require('assets');
        const MP = await kernel.require('mangaPage');
        const PS = await kernel.require('panelSets');
        const round3 = (n) => Math.round(n * 1000) / 1000;
        const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
        const num = (v, d) => typeof v === 'number' && Number.isFinite(v) ? v : d;
        const LIMITS = { projects: 8, shots: 2000, cues: 200, fx: 60, clips: 2000, events: 2000, clipBytes: 120 * 1024 * 1024, clipSeconds: 3 * 3600 };
        const CATALOG = {
            cameraMoves: ['static', 'push-in', 'pull-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down', 'ken-burns', 'roll-cw', 'roll-ccw', 'heartbeat'],
            fx: ['shake', 'rumble', 'zoom-punch', 'rotate-punch', 'flash', 'blur-in', 'blur-out', 'whip', 'vignette', 'glitch', 'chromatic', 'grayscale', 'sepia',
                'invert-flash', 'contrast-pop', 'tint', 'grain', 'strobe', 'letterbox', 'speed-zoom', 'fade-in', 'fade-out', 'parallax'],
            reveals: ['cut', 'fade', 'pop', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'wipe', 'typewriter'],
            transitions: ['cut', 'camera-move', 'crossfade', 'dip-black', 'dip-white', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'push-left', 'push-right',
                'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down', 'wipe-diagonal', 'iris', 'zoom-through', 'flash', 'glitch', 'blinds', 'dissolve', 'page-turn'],
            eases: ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'back']
        };
        const oneOf = (list, v, d) => list.includes(v) ? v : d;
        const colorOf = (v, d) => typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{3,20}$|^rgba?\([\d.,\s%]+\)$/.test(v) ? v : d;
        /* ------------------------------------------------------------------
         * Padrões e normalização
         * ------------------------------------------------------------------ */
        function defaultSettings() {
            return {
                width: 1920, height: 1080, fps: 30, background: '#0b0b0f', sync: 'auto',
                subtitles: { enabled: false, position: 'bottom', size: 0.045, color: '#ffffff', outline: '#000000' },
                margin: 0.06, panelIntro: 0.6, linePad: 0.35, lineMin: 1.0, secPerChar: 0.07, shotTail: 0.5,
                direction: 'rtl', unrevealed: 'hidden',
                transitions: { samePage: 'camera-move', newPage: 'crossfade', duration: 0.5 },
                overviewShots: false
            };
        }
        function normalizeSettings(input, base) {
            const i = (input || {});
            const sub = (i['subtitles'] || {});
            const tr = (i['transitions'] || {});
            const even = (v) => Math.round(v / 2) * 2;
            const out = {
                width: even(clamp(num(i['width'], base.width), 160, 3840)),
                height: even(clamp(num(i['height'], base.height), 120, 2160)),
                fps: Math.round(clamp(num(i['fps'], base.fps), 8, 60)),
                background: colorOf(i['background'], base.background),
                sync: oneOf(['auto', 'manual'], i['sync'], base.sync),
                subtitles: {
                    enabled: typeof sub['enabled'] === 'boolean' ? sub['enabled'] : base.subtitles.enabled,
                    position: oneOf(['bottom', 'top'], sub['position'], base.subtitles.position),
                    size: round3(clamp(num(sub['size'], base.subtitles.size), 0.02, 0.15)),
                    color: colorOf(sub['color'], base.subtitles.color), outline: colorOf(sub['outline'], base.subtitles.outline)
                },
                margin: round3(clamp(num(i['margin'], base.margin), 0, 0.6)),
                panelIntro: round3(clamp(num(i['panelIntro'], base.panelIntro), 0, 10)),
                linePad: round3(clamp(num(i['linePad'], base.linePad), 0, 10)),
                lineMin: round3(clamp(num(i['lineMin'], base.lineMin), 0.1, 30)),
                secPerChar: round3(clamp(num(i['secPerChar'], base.secPerChar), 0.01, 1)),
                shotTail: round3(clamp(num(i['shotTail'], base.shotTail), 0, 30)),
                direction: oneOf(['rtl', 'ltr'], i['direction'], base.direction),
                unrevealed: oneOf(['hidden', 'dim'], i['unrevealed'], base.unrevealed),
                transitions: {
                    samePage: oneOf(CATALOG.transitions, tr['samePage'], base.transitions.samePage),
                    newPage: oneOf(CATALOG.transitions, tr['newPage'], base.transitions.newPage),
                    duration: round3(clamp(num(tr['duration'], base.transitions.duration), 0, 5))
                },
                overviewShots: typeof i['overviewShots'] === 'boolean' ? i['overviewShots'] : base.overviewShots
            };
            return out;
        }
        function currentBoard() {
            const board = S.boards.find(b => b.id === S.currentBoardId);
            if (!board)
                throw Error('No active board');
            return board;
        }
        const projectsOf = (board) => { if (!Array.isArray(board.vp1Videos))
            board.vp1Videos = []; return board.vp1Videos; };
        function projectById(id) {
            const p = projectsOf(currentBoard()).find(x => x.id === id);
            if (!p)
                throw Error('Video project not found on the current board: ' + id);
            return p;
        }
        const clone = (v) => JSON.parse(JSON.stringify(v));
        function notify(id) {
            kernel.emit('video:changed', id ? { projectId: id } : {});
            kernel.emit('state:changed');
        }
        function clipOf(p, id) {
            return id ? p.clips.find(c => c.id === id) ?? null : null;
        }
        function shotOf(p, id) {
            const s = p.shots.find(x => x.id === id);
            if (!s)
                throw Error('Shot not found: ' + id);
            return s;
        }
        function cueOf(p, id) {
            for (const shot of p.shots) {
                const cue = shot.cues.find(c => c.id === id);
                if (cue)
                    return { shot, cue };
            }
            throw Error('Cue not found: ' + id);
        }
        /* ------------------------------------------------------------------
         * Informação das páginas (leitura do documento, sem alterar)
         * ------------------------------------------------------------------ */
        function boxOf(points) {
            const xs = points.map(p => p.x), ys = points.map(p => p.y);
            const x = Math.min(...xs), y = Math.min(...ys);
            return { x: round3(x), y: round3(y), width: round3(Math.max(...xs) - x), height: round3(Math.max(...ys) - y) };
        }
        function pageInfo(pageId) {
            const page = currentBoard().instances.find(i => i.id === pageId);
            if (!page || page.type !== 'manga-page')
                return null;
            const ps = MP.getPanelSet(page) || PS.get(page.panelSetId);
            if (!ps)
                return null;
            return {
                pageId, width: ps.width, height: ps.height,
                panels: ps.panels.map(p => ({ id: p.id, ...boxOf(p.points), polygon: p.points.map(q => [round3(q.x), round3(q.y)]) })),
                balloons: MP.listBalloons(page).filter(b => b.visible !== false).map(b => ({ id: b.id, text: b.text, x: b.x, y: b.y, width: b.width, height: b.height })),
                texts: MP.listHorizontalTexts(page).filter(t => t.visible !== false).map(t => ({ id: t.id, text: t.text, x: t.x, y: t.y, width: t.width, height: t.height })),
                effects: MP.listMangaEffects(page).map(e => ({ id: e.id, scope: e.scope, panelId: e.panelId, x: e.x, y: e.y, width: e.width, height: e.height })),
                overlays: (page.overlays || []).map(o => ({ id: o.id, x: o.x, y: o.y, width: o.width, height: o.height }))
            };
        }
        const inPoly = (px, py, poly) => {
            let inside = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
                if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
                    inside = !inside;
            }
            return inside;
        };
        /** Ordem de leitura: linhas de cima para baixo; dentro da linha, direita→esquerda (rtl) ou esquerda→direita (ltr). */
        function readingOrder(items, direction) {
            const byTop = items.slice().sort((a, b) => a.y - b.y || a.x - b.x);
            const rows = [];
            for (const it of byTop) {
                const row = rows.find(r => it.y < r.top + 0.5 * Math.min(it.height, r.h));
                if (row)
                    row.items.push(it);
                else
                    rows.push({ top: it.y, h: it.height, items: [it] });
            }
            return rows.flatMap(r => r.items.slice().sort((a, b) => direction === 'rtl' ? (b.x + b.width) - (a.x + a.width) : a.x - b.x));
        }
        function panelOfPoint(info, x, y) {
            const hit = info.panels.find(p => inPoly(x, y, p.polygon));
            if (hit)
                return hit.id;
            let best = null, bestD = Infinity;
            for (const p of info.panels) {
                const d = Math.hypot(x - (p.x + p.width / 2), y - (p.y + p.height / 2));
                if (d < bestD) {
                    bestD = d;
                    best = p.id;
                }
            }
            return best;
        }
        /* ------------------------------------------------------------------
         * Estimativas e foco
         * ------------------------------------------------------------------ */
        const speechLength = (text) => text.replace(/\s+/g, '').length;
        const estimateLine = (text, st) => round3(clamp(speechLength(text) * st.secPerChar + 0.4, st.lineMin, 20));
        function focusRect(shot, info) {
            const f = shot.focus;
            if (f.kind === 'page')
                return { x: 0, y: 0, width: info.width, height: info.height };
            if (f.kind === 'rect')
                return { x: f.x, y: f.y, width: Math.max(1, f.width), height: Math.max(1, f.height) };
            const p = info.panels.find(q => q.id === f.panelId);
            return p ? { x: p.x, y: p.y, width: Math.max(1, p.width), height: Math.max(1, p.height) } : { x: 0, y: 0, width: info.width, height: info.height };
        }
        /** Retângulo visível com a proporção do vídeo, centrado no foco, sem sair da página quando possível. */
        function baseCamera(rect, info, st) {
            const aspect = st.width / st.height;
            const ew = rect.width * (1 + 2 * st.margin), eh = rect.height * (1 + 2 * st.margin);
            const w = Math.max(ew, eh * aspect), h = w / aspect;
            let cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
            if (w <= info.width)
                cx = clamp(cx, w / 2, info.width - w / 2);
            if (h <= info.height)
                cy = clamp(cy, h / 2, info.height - h / 2);
            return { cx: round3(cx), cy: round3(cy), w: round3(w), rot: 0 };
        }
        function cameraEnds(move, amount, base, aspect) {
            const a = clamp(amount, 0, 1), h = base.w / aspect;
            const cam = (o) => ({ cx: round3(o.cx ?? base.cx), cy: round3(o.cy ?? base.cy), w: round3(o.w ?? base.w), rot: round3(o.rot ?? 0) });
            switch (move) {
                case 'push-in': return { from: cam({}), to: cam({ w: base.w * (1 - 0.22 * a) }) };
                case 'pull-out': return { from: cam({ w: base.w * (1 - 0.22 * a) }), to: cam({}) };
                case 'pan-left': return { from: cam({ cx: base.cx + 0.07 * a * base.w, w: base.w * 0.96 }), to: cam({ cx: base.cx - 0.07 * a * base.w, w: base.w * 0.96 }) };
                case 'pan-right': return { from: cam({ cx: base.cx - 0.07 * a * base.w, w: base.w * 0.96 }), to: cam({ cx: base.cx + 0.07 * a * base.w, w: base.w * 0.96 }) };
                case 'pan-up': return { from: cam({ cy: base.cy + 0.07 * a * h, w: base.w * 0.96 }), to: cam({ cy: base.cy - 0.07 * a * h, w: base.w * 0.96 }) };
                case 'pan-down': return { from: cam({ cy: base.cy - 0.07 * a * h, w: base.w * 0.96 }), to: cam({ cy: base.cy + 0.07 * a * h, w: base.w * 0.96 }) };
                case 'ken-burns': return { from: cam({ cx: base.cx - 0.03 * a * base.w, cy: base.cy + 0.02 * a * h }),
                    to: cam({ cx: base.cx + 0.03 * a * base.w, cy: base.cy - 0.02 * a * h, w: base.w * (1 - 0.12 * a) }) };
                case 'roll-cw': return { from: cam({ w: base.w * 0.95 }), to: cam({ w: base.w * 0.95, rot: 2.5 * a }) };
                case 'roll-ccw': return { from: cam({ w: base.w * 0.95 }), to: cam({ w: base.w * 0.95, rot: -2.5 * a }) };
                default: return { from: cam({}), to: cam({}) };
            }
        }
        /* ------------------------------------------------------------------
         * COMPILADOR: projeto + informação das páginas → plano determinístico
         * ------------------------------------------------------------------ */
        function compileWith(project, infoFor) {
            const st = project.settings;
            const warnings = [];
            const shots = [], items = [], audio = [], subtitles = [];
            let cursor = 0;
            let prev = null;
            const assetOf = (clip) => clip.assetId;
            const pending = [];
            const runEnds = new Map();
            let runIndex = -1;
            const runOfShot = new Map();
            const planned = [];
            for (const shot of project.shots) {
                const info = infoFor(shot.pageId);
                if (!info) {
                    warnings.push('Shot "' + (shot.label || shot.id) + '": page ' + shot.pageId + ' was not found; skipped');
                    continue;
                }
                planned.push({ shot, info });
            }
            planned.forEach(({ shot, info }, index) => {
                const first = index === 0;
                let tKind = first ? 'cut' : shot.transition.kind;
                const previous = index > 0 ? planned[index - 1] : null;
                if (tKind === 'camera-move' && previous && previous.shot.pageId !== shot.pageId) {
                    warnings.push('Shot "' + (shot.label || shot.id) + '": camera-move needs the same page; using crossfade');
                    tKind = 'crossfade';
                }
                const tDur = first || tKind === 'cut' ? 0 : round3(clamp(shot.transition.duration, 0, 5));
                const lead = tDur;
                if (!previous || previous.shot.pageId !== shot.pageId)
                    runIndex++;
                runOfShot.set(shot.id, runIndex);
                /* --- cues → tempos --- */
                const start = cursor;
                let local = lead + st.panelIntro;
                let lastEnd = lead + st.panelIntro;
                const shotItems = [];
                for (const cue of shot.cues) {
                    const clip = clipOf(project, cue.clipId);
                    const balloon = cue.kind === 'balloon' ? info.balloons.find(b => b.id === cue.targetId) : null;
                    const textObj = cue.kind === 'text' ? info.texts.find(t => t.id === cue.targetId) : null;
                    const text = cue.subtitle ?? balloon?.text ?? textObj?.text ?? '';
                    if ((cue.kind === 'balloon' && !balloon) || (cue.kind === 'text' && !textObj)) {
                        warnings.push('Cue ' + cue.id + ': target ' + String(cue.targetId) + ' no longer exists on page ' + shot.pageId);
                        continue;
                    }
                    if (cue.kind === 'panel' && !info.panels.some(p => p.id === cue.targetId)) {
                        warnings.push('Cue ' + cue.id + ': panel ' + String(cue.targetId) + ' no longer exists');
                        continue;
                    }
                    const speech = (cue.kind === 'balloon') || ((cue.kind === 'text' || cue.kind === 'sfx') && !!clip && clip.kind === 'voice');
                    let at;
                    if (cue.kind === 'panel')
                        at = st.sync === 'manual' && cue.at != null ? cue.at : 0;
                    else if (st.sync === 'manual' && cue.at != null)
                        at = cue.at;
                    else if (cue.kind === 'text' || cue.kind === 'effect' || cue.kind === 'overlay' || cue.kind === 'sfx')
                        at = Math.min(local, lead + st.panelIntro * 0.5 + (cue.kind === 'sfx' ? st.panelIntro * 0.5 : 0));
                    else
                        at = local;
                    if ((cue.kind === 'text' || cue.kind === 'effect' || cue.kind === 'overlay') && st.sync === 'auto' && cue.at == null)
                        at = lead + st.panelIntro * 0.5;
                    if (speech && st.sync === 'auto')
                        at = local;
                    let dur;
                    if (cue.kind === 'balloon' || speech)
                        dur = st.sync === 'manual' && cue.duration != null ? cue.duration : (clip ? clip.duration : (cue.duration ?? estimateLine(text, st)));
                    else if (clip)
                        dur = clip.duration;
                    else
                        dur = cue.duration ?? 0;
                    at = round3(Math.max(0, at));
                    dur = round3(Math.max(0, dur));
                    shotItems.push({ cue, at, dur });
                    if (speech && st.sync === 'auto')
                        local = round3(at + dur + st.linePad);
                    else if (speech)
                        local = Math.max(local, round3(at + dur + st.linePad));
                    lastEnd = Math.max(lastEnd, at + (speech || cue.kind === 'sfx' ? dur : 0));
                    if (clip)
                        audio.push({ id: 'a_' + cue.id, clipId: clip.id, assetId: assetOf(clip), kind: clip.kind, start: round3(start + at), duration: clip.duration,
                            gain: clip.gain, fadeIn: 0, fadeOut: 0, loop: false, source: 'cue' });
                    if (text && (cue.kind === 'balloon' || cue.kind === 'text') && (speech || cue.kind === 'balloon'))
                        subtitles.push({ start: round3(start + at), end: round3(start + at + Math.max(dur, 0.3)), text, shotId: shot.id });
                }
                const autoDuration = Math.max(lastEnd, lead + st.panelIntro + 0.4) + st.shotTail;
                const duration = round3(Math.max(0.4, shot.duration != null ? clamp(shot.duration, 0.1, 3600) : autoDuration));
                const end = round3(start + duration);
                if (shot.duration != null && shot.duration < lastEnd + 0.01 && shotItems.some(s => s.dur > 0))
                    warnings.push('Shot "' + (shot.label || shot.id) + '": manual duration ends before its last line finishes');
                for (const { cue, at, dur } of shotItems) {
                    if (cue.kind === 'sfx')
                        continue;
                    const tIn = round3(start + at);
                    const item = { id: 'i_' + cue.id, shotId: shot.id, pageId: shot.pageId, kind: cue.kind, targetId: cue.targetId, tIn, tOut: end,
                        anim: cue.anim, animDuration: cue.animDuration, text: cue.kind === 'balloon' || cue.kind === 'text'
                            ? (cue.kind === 'balloon' ? info.balloons.find(b => b.id === cue.targetId)?.text : info.texts.find(t => t.id === cue.targetId)?.text) ?? null : null };
                    const hold = cue.kind === 'balloon' || cue.kind === 'text' ? (cue.hold === 'line' ? 'line' : 'shot') : 'run';
                    if (hold === 'line')
                        item.tOut = round3(Math.min(end, tIn + Math.max(dur, 0.3) + 0.25));
                    items.push(item);
                    pending.push({ item, hold });
                }
                /* --- câmera --- */
                const rect = focusRect(shot, info);
                const base = baseCamera(rect, info, st);
                const ends = cameraEnds(shot.camera.move, shot.camera.amount, base, st.width / st.height);
                shots.push({
                    id: shot.id, pageId: shot.pageId, start: round3(start), end, lead,
                    transition: { kind: tKind, duration: tDur, ease: shot.transition.ease },
                    focus: rect,
                    camera: { move: shot.camera.move, amount: shot.camera.amount, ease: shot.camera.ease, from: ends.from, to: ends.to },
                    fx: shot.fx.map(f => ({ id: f.id, kind: f.kind, start: round3(start + clamp(f.at, 0, 3600)), end: round3(start + clamp(f.at, 0, 3600) + Math.max(0.02, f.duration)),
                        intensity: clamp(f.intensity, 0, 1), color: f.color || '#ffffff' }))
                });
                runEnds.set(runIndex, end);
                cursor = end;
                prev = { pageId: shot.pageId, end };
            });
            void prev;
            /* itens "run": ficam até o fim da sequência de shots da mesma página; só a primeira revelação conta */
            const seen = new Set();
            const finalItems = [];
            for (const p of pending) {
                if (p.hold === 'run') {
                    const run = runOfShot.get(p.item.shotId);
                    const key = run + '|' + p.item.kind + '|' + p.item.targetId;
                    if (seen.has(key))
                        continue;
                    seen.add(key);
                    p.item.tOut = runEnds.get(run) ?? p.item.tOut;
                }
                finalItems.push(p.item);
            }
            finalItems.sort((a, b) => a.tIn - b.tIn || a.id.localeCompare(b.id));
            const shotDuration = cursor;
            /* --- eventos de áudio livres (música/SFX na linha do tempo) --- */
            for (const ev of project.audioEvents) {
                const clip = clipOf(project, ev.clipId);
                if (!clip) {
                    warnings.push('Audio event ' + ev.id + ': clip not found');
                    continue;
                }
                let at = ev.at;
                if (ev.shotId) {
                    const sh = shots.find(s => s.id === ev.shotId);
                    if (!sh) {
                        warnings.push('Audio event ' + ev.id + ': shot not found');
                        continue;
                    }
                    at = sh.start + ev.at;
                }
                if (at >= shotDuration) {
                    warnings.push('Audio event ' + ev.id + ' starts after the video ends and was ignored');
                    continue;
                }
                const dur = ev.loop ? shotDuration - at : Math.min(clip.duration, shotDuration - at);
                if (!ev.loop && clip.duration > shotDuration - at + 0.01)
                    warnings.push('Audio event ' + ev.id + ' is trimmed at the end of the video');
                audio.push({ id: 'a_' + ev.id, clipId: clip.id, assetId: clip.assetId, kind: clip.kind, start: round3(at), duration: round3(dur), gain: clip.gain * ev.gain,
                    fadeIn: ev.fadeIn, fadeOut: ev.fadeOut, loop: ev.loop, source: 'event' });
            }
            audio.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
            subtitles.sort((a, b) => a.start - b.start);
            const duration = round3(shotDuration);
            return { projectId: project.id, width: st.width, height: st.height, fps: st.fps, duration, frames: Math.max(1, Math.ceil(duration * st.fps)), sync: st.sync,
                shots, items: finalItems, audio, subtitles, warnings };
        }
        function compile(projectId) { return compileWith(projectById(projectId), pageInfo); }
        /* ------------------------------------------------------------------
         * Projetos
         * ------------------------------------------------------------------ */
        async function create(opts = {}) {
            const board = currentBoard();
            const list = projectsOf(board);
            if (list.length >= LIMITS.projects)
                throw Error('Limit of ' + LIMITS.projects + ' video projects per board');
            const p = { id: utils.uid('video'), name: String(opts.name || '').trim().slice(0, 80) || 'Vídeo ' + (list.length + 1),
                settings: normalizeSettings(opts.settings, defaultSettings()), clips: [], shots: [], audioEvents: [] };
            await history.transaction('video.create', async () => { list.push(p); notify(p.id); });
            return clone(p);
        }
        const list = () => projectsOf(currentBoard()).map(clone);
        const get = (id) => clone(projectById(id));
        async function rename(id, name) {
            const p = projectById(id);
            const clean = String(name ?? '').trim();
            if (!clean || clean.length > 80)
                throw Error('The name must have 1 to 80 characters');
            await history.transaction('video.rename', async () => { p.name = clean; notify(id); });
            return clone(p);
        }
        async function remove(id) {
            const board = currentBoard();
            const p = projectById(id);
            const clipIds = p.clips.map(c => c.id);
            await history.transaction('video.remove', async () => {
                for (const c of p.clips)
                    await dropAsset(c.assetId, id);
                board.vp1Videos = projectsOf(board).filter(x => x.id !== id);
                notify(id);
            });
            return { removed: id, releasedClips: clipIds.length };
        }
        async function updateSettings(id, patch) {
            const p = projectById(id);
            await history.transaction('video.update_settings', async () => { p.settings = normalizeSettings(patch, p.settings); notify(id); });
            return clone(p);
        }
        /* ------------------------------------------------------------------
         * Clipes de áudio (assets com kind:'audio')
         * ------------------------------------------------------------------ */
        const AUDIO_EXT = /\.(wav|mp3|ogg|oga|opus|m4a|aac|flac|webm|weba)$/i;
        async function decodeDuration(blob) {
            const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
            if (!Ctx)
                throw Error('This browser cannot decode audio');
            const ctx = new Ctx(1, 1, 44100);
            const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
            return round3(buf.duration);
        }
        async function importClip(projectId, file, kind = 'voice', label) {
            const p = projectById(projectId);
            if (p.clips.length >= LIMITS.clips)
                throw Error('Limit of ' + LIMITS.clips + ' clips');
            if (!(file instanceof Blob))
                throw Error('Provide an audio file');
            const type = file.type || '';
            if (!/^audio\//.test(type) && !AUDIO_EXT.test(file.name || '') && type !== 'video/webm')
                throw Error('Unsupported audio file: ' + (file.name || type));
            if (file.size <= 0 || file.size > LIMITS.clipBytes)
                throw Error('Audio file must have 1 byte to ' + Math.round(LIMITS.clipBytes / 1048576) + ' MB');
            const k = oneOf(['voice', 'sfx', 'music'], kind, 'voice');
            const duration = await decodeDuration(file);
            if (!(duration > 0) || duration > LIMITS.clipSeconds)
                throw Error('Audio duration is out of range');
            return history.transaction('video.import_clip', async () => {
                const base = utils.baseName(file.name || 'audio');
                const taken = new Set(S.assets.map(a => a.name.toLowerCase()));
                let name = base || 'Audio', n = 2;
                while (taken.has(name.toLowerCase())) {
                    name = base + ' (' + n + ')';
                    n++;
                }
                const mime = type || 'audio/wav';
                const asset = { id: utils.uid('asset'), name, mimeType: mime, kind: 'audio', originalWidth: 0, originalHeight: 0, duration,
                    size: file.size, createdAt: Date.now(), updatedAt: Date.now() };
                try {
                    await backend.put('blobs', asset.id, file);
                }
                catch (e) {
                    kernel.log.warn('audio blob not persisted:', asset.id, e.message);
                }
                const stored = new Blob([file], { type: mime });
                A.blobs.set(asset.id, stored);
                A.urls.set(asset.id, URL.createObjectURL(stored));
                S.assets.push(asset);
                const clip = { id: utils.uid('clip'), assetId: asset.id, label: (label || name).slice(0, 80), kind: k, duration, gain: 1 };
                p.clips.push(clip);
                kernel.emit('assets:changed');
                notify(projectId);
                return clone(clip);
            });
        }
        async function dropAsset(assetId, exceptProject) {
            const shared = projectsOf(currentBoard()).some(pr => pr.id !== exceptProject && pr.clips.some(c => c.assetId === assetId));
            if (shared)
                return;
            const url = A.urls.get(assetId);
            if (url) {
                try {
                    URL.revokeObjectURL(url);
                }
                catch { /* ignore */ }
            }
            A.urls.delete(assetId);
            A.blobs.delete(assetId);
            S.assets = S.assets.filter(a => a.id !== assetId);
            try {
                await backend.del('blobs', assetId);
            }
            catch { /* ignore */ }
        }
        async function removeClip(projectId, clipId) {
            const p = projectById(projectId);
            const clip = clipOf(p, clipId);
            if (!clip)
                throw Error('Clip not found: ' + clipId);
            let unbound = 0;
            await history.transaction('video.remove_clip', async () => {
                for (const sh of p.shots)
                    for (const c of sh.cues)
                        if (c.clipId === clipId) {
                            c.clipId = null;
                            unbound++;
                        }
                p.audioEvents = p.audioEvents.filter(e => e.clipId !== clipId);
                p.clips = p.clips.filter(c => c.id !== clipId);
                const stillUsed = p.clips.some(c => c.assetId === clip.assetId);
                if (!stillUsed)
                    await dropAsset(clip.assetId, projectId);
                kernel.emit('assets:changed');
                notify(projectId);
            });
            return { removed: clipId, unbound };
        }
        async function updateClip(projectId, clipId, patch) {
            const p = projectById(projectId);
            const clip = clipOf(p, clipId);
            if (!clip)
                throw Error('Clip not found: ' + clipId);
            await history.transaction('video.update_clip', async () => {
                if (patch.label !== undefined)
                    clip.label = String(patch.label).trim().slice(0, 80) || clip.label;
                if (patch.kind !== undefined)
                    clip.kind = oneOf(['voice', 'sfx', 'music'], patch.kind, clip.kind);
                if (patch.gain !== undefined)
                    clip.gain = round3(clamp(num(patch.gain, 1), 0, 4));
                notify(projectId);
            });
            return clone(clip);
        }
        /* ------------------------------------------------------------------
         * Shots, cues, efeitos
         * ------------------------------------------------------------------ */
        function newCue(c) {
            const kind = oneOf(['panel', 'balloon', 'text', 'effect', 'overlay', 'sfx'], c.kind, 'balloon');
            const defAnim = kind === 'balloon' ? 'pop' : kind === 'text' ? 'pop' : kind === 'panel' ? 'fade' : 'fade';
            return {
                id: c.id || utils.uid('cue'), kind, targetId: c.targetId ?? null,
                at: c.at == null ? null : round3(clamp(num(c.at, 0), 0, 3600)),
                duration: c.duration == null ? null : round3(clamp(num(c.duration, 0), 0, 600)),
                anim: oneOf(CATALOG.reveals, c.anim, defAnim), animDuration: round3(clamp(num(c.animDuration, 0.25), 0, 5)),
                clipId: c.clipId ?? null, hold: c.hold === 'line' ? 'line' : 'shot', subtitle: c.subtitle == null ? null : String(c.subtitle).slice(0, 500)
            };
        }
        function newFx(f) {
            const out = { id: f.id || utils.uid('fx'), kind: oneOf(CATALOG.fx, f.kind, 'shake'), at: round3(clamp(num(f.at, 0), 0, 3600)),
                duration: round3(clamp(num(f.duration, 0.4), 0.02, 3600)), intensity: round3(clamp(num(f.intensity, 0.6), 0, 1)) };
            if (f.color)
                out.color = colorOf(f.color, '#ffffff');
            return out;
        }
        function newShot(base, st) {
            const focus = base.focus && base.focus.kind === 'panel' && typeof base.focus.panelId === 'string' ? { kind: 'panel', panelId: base.focus.panelId }
                : base.focus && base.focus.kind === 'rect' ? { kind: 'rect', x: num(base.focus.x, 0), y: num(base.focus.y, 0), width: Math.max(1, num(base.focus.width, 100)), height: Math.max(1, num(base.focus.height, 100)) }
                    : { kind: 'page' };
            const cam = base.camera;
            const tr = base.transition;
            return {
                id: base.id || utils.uid('shot'), pageId: base.pageId, label: String(base.label || '').slice(0, 80), focus,
                camera: { move: oneOf(CATALOG.cameraMoves, cam?.move, 'static'), amount: round3(clamp(num(cam?.amount, 0.35), 0, 1)), ease: oneOf(CATALOG.eases, cam?.ease, 'ease-in-out') },
                fx: (base.fx || []).slice(0, LIMITS.fx).map(f => newFx(f)),
                transition: { kind: oneOf(CATALOG.transitions, tr?.kind, st.transitions.samePage), duration: round3(clamp(num(tr?.duration, st.transitions.duration), 0, 5)),
                    ease: oneOf(CATALOG.eases, tr?.ease, 'ease-in-out') },
                duration: base.duration == null ? null : round3(clamp(num(base.duration, 1), 0.1, 3600)),
                cues: (base.cues || []).slice(0, LIMITS.cues).map(c => newCue(c))
            };
        }
        function requirePage(pageId) {
            const page = currentBoard().instances.find(i => i.id === pageId);
            if (!page || page.type !== 'manga-page')
                throw Error('Manga page not found on the current board: ' + pageId);
        }
        async function addShot(projectId, shot, index) {
            const p = projectById(projectId);
            requirePage(shot.pageId);
            if (p.shots.length >= LIMITS.shots)
                throw Error('Limit of ' + LIMITS.shots + ' shots');
            const made = newShot(shot, p.settings);
            validateShotRefs(p, made);
            await history.transaction('video.add_shot', async () => {
                const at = index === undefined ? p.shots.length : clamp(Math.round(index), 0, p.shots.length);
                p.shots.splice(at, 0, made);
                notify(projectId);
            });
            return clone(made);
        }
        function validateShotRefs(p, shot) {
            for (const c of shot.cues)
                if (c.clipId && !clipOf(p, c.clipId))
                    throw Error('Clip not found: ' + c.clipId);
        }
        async function updateShot(projectId, shotId, patch) {
            const p = projectById(projectId);
            const shot = shotOf(p, shotId);
            await history.transaction('video.update_shot', async () => {
                if (patch.label !== undefined)
                    shot.label = String(patch.label).slice(0, 80);
                if (patch.pageId !== undefined) {
                    requirePage(patch.pageId);
                    shot.pageId = patch.pageId;
                }
                if (patch.focus !== undefined)
                    shot.focus = newShot({ pageId: shot.pageId, focus: patch.focus }, p.settings).focus;
                if (patch.camera !== undefined)
                    shot.camera = newShot({ pageId: shot.pageId, camera: { ...shot.camera, ...patch.camera } }, p.settings).camera;
                if (patch.transition !== undefined)
                    shot.transition = newShot({ pageId: shot.pageId, transition: { ...shot.transition, ...patch.transition } }, p.settings).transition;
                if (patch.duration !== undefined)
                    shot.duration = patch.duration == null ? null : round3(clamp(num(patch.duration, 1), 0.1, 3600));
                notify(projectId);
            });
            return clone(shot);
        }
        async function removeShot(projectId, shotId) {
            const p = projectById(projectId);
            shotOf(p, shotId);
            await history.transaction('video.remove_shot', async () => {
                p.shots = p.shots.filter(s => s.id !== shotId);
                p.audioEvents = p.audioEvents.filter(e => e.shotId !== shotId);
                notify(projectId);
            });
            return { removed: shotId };
        }
        async function moveShot(projectId, shotId, toIndex) {
            const p = projectById(projectId);
            const from = p.shots.findIndex(s => s.id === shotId);
            if (from < 0)
                throw Error('Shot not found: ' + shotId);
            await history.transaction('video.move_shot', async () => {
                const [s] = p.shots.splice(from, 1);
                p.shots.splice(clamp(Math.round(toIndex), 0, p.shots.length), 0, s);
                notify(projectId);
            });
            return clone(p);
        }
        async function addCue(projectId, shotId, cue, index) {
            const p = projectById(projectId);
            const shot = shotOf(p, shotId);
            if (shot.cues.length >= LIMITS.cues)
                throw Error('Limit of ' + LIMITS.cues + ' cues per shot');
            const made = newCue(cue);
            if (made.clipId && !clipOf(p, made.clipId))
                throw Error('Clip not found: ' + made.clipId);
            if (made.kind !== 'sfx' && !made.targetId)
                throw Error('This cue needs a targetId (panel, balloon, text, effect or overlay id)');
            await history.transaction('video.add_cue', async () => {
                shot.cues.splice(index === undefined ? shot.cues.length : clamp(Math.round(index), 0, shot.cues.length), 0, made);
                notify(projectId);
            });
            return clone(made);
        }
        /** Remove chaves `undefined` para que um patch parcial nunca apague campos existentes. */
        function definedOnly(patch) {
            const out = {};
            for (const key of Object.keys(patch))
                if (patch[key] !== undefined)
                    out[key] = patch[key];
            return out;
        }
        async function updateCue(projectId, cueId, patch) {
            const p = projectById(projectId);
            const { cue } = cueOf(p, cueId);
            await history.transaction('video.update_cue', async () => {
                const merged = newCue({ ...cue, ...definedOnly(patch), id: cue.id, kind: cue.kind, targetId: patch.targetId === undefined ? cue.targetId : patch.targetId });
                if (patch.clipId !== undefined && patch.clipId !== null && !clipOf(p, patch.clipId))
                    throw Error('Clip not found: ' + patch.clipId);
                if (patch.at === null)
                    merged.at = null;
                if (patch.duration === null)
                    merged.duration = null;
                Object.assign(cue, merged);
                notify(projectId);
            });
            return clone(cue);
        }
        async function removeCue(projectId, cueId) {
            const p = projectById(projectId);
            const { shot } = cueOf(p, cueId);
            await history.transaction('video.remove_cue', async () => { shot.cues = shot.cues.filter(c => c.id !== cueId); notify(projectId); });
            return { removed: cueId };
        }
        async function bindClip(projectId, cueId, clipId) {
            return updateCue(projectId, cueId, { clipId });
        }
        /** Vincula os clipes de voz ainda livres às falas (balões/textos) na ordem da linha do tempo. */
        async function bindInOrder(projectId) {
            const p = projectById(projectId);
            const bound = new Set(p.shots.flatMap(s => s.cues.map(c => c.clipId)).filter((x) => !!x));
            const free = p.clips.filter(c => c.kind === 'voice' && !bound.has(c.id));
            const slots = p.shots.flatMap(s => s.cues).filter(c => c.kind === 'balloon' && !c.clipId);
            const n = Math.min(free.length, slots.length);
            await history.transaction('video.bind_in_order', async () => {
                for (let i = 0; i < n; i++)
                    slots[i].clipId = free[i].id;
                notify(projectId);
            });
            return { bound: n, pending: slots.length - n };
        }
        async function addFx(projectId, shotId, fx) {
            const p = projectById(projectId);
            const shot = shotOf(p, shotId);
            if (shot.fx.length >= LIMITS.fx)
                throw Error('Limit of ' + LIMITS.fx + ' effects per shot');
            const made = newFx(fx);
            await history.transaction('video.add_fx', async () => { shot.fx.push(made); notify(projectId); });
            return clone(made);
        }
        async function updateFx(projectId, fxId, patch) {
            const p = projectById(projectId);
            for (const shot of p.shots) {
                const fx = shot.fx.find(f => f.id === fxId);
                if (!fx)
                    continue;
                await history.transaction('video.update_fx', async () => { Object.assign(fx, newFx({ ...fx, ...definedOnly(patch), id: fx.id, kind: patch.kind ?? fx.kind })); notify(projectId); });
                return clone(fx);
            }
            throw Error('Effect not found: ' + fxId);
        }
        async function removeFx(projectId, fxId) {
            const p = projectById(projectId);
            const shot = p.shots.find(s => s.fx.some(f => f.id === fxId));
            if (!shot)
                throw Error('Effect not found: ' + fxId);
            await history.transaction('video.remove_fx', async () => { shot.fx = shot.fx.filter(f => f.id !== fxId); notify(projectId); });
            return { removed: fxId };
        }
        async function addAudioEvent(projectId, ev) {
            const p = projectById(projectId);
            if (p.audioEvents.length >= LIMITS.events)
                throw Error('Limit of ' + LIMITS.events + ' audio events');
            if (!clipOf(p, ev.clipId))
                throw Error('Clip not found: ' + ev.clipId);
            if (ev.shotId)
                shotOf(p, ev.shotId);
            const made = { id: utils.uid('aev'), clipId: ev.clipId, shotId: ev.shotId ?? null, at: round3(clamp(num(ev.at, 0), 0, 36000)),
                gain: round3(clamp(num(ev.gain, 1), 0, 4)), fadeIn: round3(clamp(num(ev.fadeIn, 0), 0, 60)), fadeOut: round3(clamp(num(ev.fadeOut, 0), 0, 60)), loop: !!ev.loop };
            await history.transaction('video.add_audio_event', async () => { p.audioEvents.push(made); notify(projectId); });
            return clone(made);
        }
        async function updateAudioEvent(projectId, eventId, patch) {
            const p = projectById(projectId);
            const ev = p.audioEvents.find(e => e.id === eventId);
            if (!ev)
                throw Error('Audio event not found: ' + eventId);
            await history.transaction('video.update_audio_event', async () => {
                if (patch.at !== undefined)
                    ev.at = round3(clamp(num(patch.at, ev.at), 0, 36000));
                if (patch.gain !== undefined)
                    ev.gain = round3(clamp(num(patch.gain, ev.gain), 0, 4));
                if (patch.fadeIn !== undefined)
                    ev.fadeIn = round3(clamp(num(patch.fadeIn, 0), 0, 60));
                if (patch.fadeOut !== undefined)
                    ev.fadeOut = round3(clamp(num(patch.fadeOut, 0), 0, 60));
                if (patch.loop !== undefined)
                    ev.loop = !!patch.loop;
                if (patch.shotId !== undefined) {
                    if (patch.shotId)
                        shotOf(p, patch.shotId);
                    ev.shotId = patch.shotId;
                }
                notify(projectId);
            });
            return clone(ev);
        }
        async function removeAudioEvent(projectId, eventId) {
            const p = projectById(projectId);
            if (!p.audioEvents.some(e => e.id === eventId))
                throw Error('Audio event not found: ' + eventId);
            await history.transaction('video.remove_audio_event', async () => { p.audioEvents = p.audioEvents.filter(e => e.id !== eventId); notify(projectId); });
            return { removed: eventId };
        }
        /* ------------------------------------------------------------------
         * Montagem automática: um shot por painel, na ordem de leitura
         * ------------------------------------------------------------------ */
        function pagesInReadingOrder(direction) {
            const board = currentBoard();
            const pages = board.instances.filter((i) => i.type === 'manga-page');
            const spreads = board.vp1Spreads || [];
            const free = pages.filter(pg => !pg.vp1SpreadSlot);
            const bands = readingOrder(free.map(pg => ({ pg, x: pg.x, y: pg.y, width: pg.width, height: pg.height })), 'ltr').map(o => o.pg);
            const out = [];
            const placed = new Set();
            const spreadOrder = (sp) => {
                const l = pages.find(pg => pg.id === sp.slots.left.pageId), r = pages.find(pg => pg.id === sp.slots.right.pageId);
                return (direction === 'rtl' ? [r, l] : [l, r]).filter((x) => !!x);
            };
            const entries = [];
            for (const pg of bands)
                entries.push({ y: pg.y, x: pg.x, pages: [pg] });
            for (const sp of spreads) {
                const ps = spreadOrder(sp);
                if (ps.length)
                    entries.push({ y: sp.slots.left.y, x: sp.slots.left.x, pages: ps });
            }
            const ordered = readingOrder(entries.map(e => ({ e, x: e.x, y: e.y, width: 1, height: 1 })), 'ltr').map(o => o.e);
            for (const e of ordered)
                for (const pg of e.pages)
                    if (!placed.has(pg.id)) {
                        placed.add(pg.id);
                        out.push(pg);
                    }
            return out;
        }
        async function autoBuild(projectId, opts = {}) {
            const p = projectById(projectId);
            const st = p.settings;
            const pages = opts.pageIds && opts.pageIds.length
                ? opts.pageIds.map(id => { requirePage(id); return currentBoard().instances.find(i => i.id === id); })
                : pagesInReadingOrder(st.direction);
            if (!pages.length)
                throw Error('There are no manga pages on the current board');
            const overview = opts.overview ?? st.overviewShots;
            const built = [];
            pages.forEach((page, pageIndex) => {
                const info = pageInfo(page.id);
                if (!info || !info.panels.length)
                    return;
                const panels = readingOrder(info.panels, st.direction);
                const balloonsBy = new Map(), textsBy = new Map();
                for (const b of readingOrder(info.balloons, st.direction)) {
                    const id = panelOfPoint(info, b.x + b.width / 2, b.y + b.height / 2);
                    if (!id)
                        continue;
                    balloonsBy.set(id, [...(balloonsBy.get(id) || []), b]);
                }
                for (const t of readingOrder(info.texts, st.direction)) {
                    const id = panelOfPoint(info, t.x + t.width / 2, t.y + t.height / 2);
                    if (!id)
                        continue;
                    textsBy.set(id, [...(textsBy.get(id) || []), t]);
                }
                const fxBy = new Map();
                for (const e of info.effects)
                    if (e.scope === 'page') {
                        const id = panelOfPoint(info, e.x + e.width / 2, e.y + e.height / 2);
                        if (!id)
                            continue;
                        fxBy.set(id, [...(fxBy.get(id) || []), e.id]);
                    }
                const overlayBy = new Map();
                for (const o of info.overlays) {
                    const id = panelOfPoint(info, o.x + o.width / 2, o.y + o.height / 2);
                    if (!id)
                        continue;
                    overlayBy.set(id, [...(overlayBy.get(id) || []), o.id]);
                }
                const newPage = pageIndex > 0 || built.length > 0;
                if (overview) {
                    built.push(newShot({ pageId: page.id, label: 'Página ' + (pageIndex + 1) + ' · visão geral', focus: { kind: 'page' }, camera: { move: 'static', amount: 0, ease: 'linear' },
                        transition: { kind: newPage ? st.transitions.newPage : 'cut', duration: st.transitions.duration, ease: 'ease-in-out' },
                        duration: 1.4, cues: panels.map((pn, i) => ({ kind: 'panel', targetId: pn.id, at: round3(i * 0.18), anim: 'fade', animDuration: 0.25 })) }, st));
                }
                panels.forEach((pn, i) => {
                    const speaking = (balloonsBy.get(pn.id) || []).length > 0;
                    const cues = [];
                    const firstInPage = i === 0 && !overview;
                    cues.push({ kind: 'panel', targetId: pn.id, anim: firstInPage && newPage ? 'cut' : 'fade', animDuration: firstInPage && newPage ? 0 : 0.35 });
                    for (const e of fxBy.get(pn.id) || [])
                        cues.push({ kind: 'effect', targetId: e, anim: 'fade', animDuration: 0.2 });
                    for (const o of overlayBy.get(pn.id) || [])
                        cues.push({ kind: 'overlay', targetId: o, anim: 'fade', animDuration: 0.2 });
                    for (const t of textsBy.get(pn.id) || [])
                        cues.push({ kind: 'text', targetId: t.id, anim: 'pop', animDuration: 0.2 });
                    for (const b of balloonsBy.get(pn.id) || [])
                        cues.push({ kind: 'balloon', targetId: b.id, anim: 'pop', animDuration: 0.2 });
                    const startsPage = i === 0 && !overview;
                    const move = speaking ? 'push-in' : (i % 2 ? 'ken-burns' : 'pan-left');
                    built.push(newShot({ pageId: page.id, label: 'Página ' + (pageIndex + 1) + ' · painel ' + (i + 1), focus: { kind: 'panel', panelId: pn.id },
                        camera: { move, amount: speaking ? 0.3 : 0.4, ease: 'ease-in-out' },
                        transition: { kind: startsPage ? (newPage ? st.transitions.newPage : 'cut') : st.transitions.samePage, duration: st.transitions.duration, ease: 'ease-in-out' },
                        cues }, st));
                });
            });
            if (!built.length)
                throw Error('No panels found to build shots');
            if (built.length > LIMITS.shots)
                throw Error('Too many shots for one project (limit ' + LIMITS.shots + ')');
            await history.transaction('video.auto_build', async () => {
                const keep = opts.replace === false ? p.shots : [];
                p.shots = keep.concat(built);
                notify(projectId);
            });
            return clone(p);
        }
        function estimate(projectId) {
            const p = projectById(projectId);
            const plan = compileWith(p, pageInfo);
            const lines = p.shots.flatMap(s => s.cues).filter(c => c.kind === 'balloon');
            return { duration: plan.duration, shots: plan.shots.length, frames: plan.frames, voiceLines: lines.length, boundLines: lines.filter(c => !!c.clipId).length, warnings: plan.warnings };
        }
        kernel.provide('video', {
            catalog: () => clone(CATALOG),
            defaultSettings,
            list, get, create, rename, remove, updateSettings,
            importClip, removeClip, updateClip,
            addShot, updateShot, removeShot, moveShot,
            addCue, updateCue, removeCue, bindClip, bindInOrder,
            addFx, updateFx, removeFx,
            addAudioEvent, updateAudioEvent, removeAudioEvent,
            autoBuild, pageInfo, compile, compileWith, estimate
        });
    }
});
