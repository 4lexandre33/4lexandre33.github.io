"use strict";
/* =====================================================================
 * plugins/11-interaction.js
 * ---------------------------------------------------------------------
 * Ponteiro, teclado, marquee, auto-pan, drag&drop, e Panel Edit Mode.
 *
 * FASE E4 (Overlay edit):
 *   - getLayer() reconhece '__overlay__'.
 *   - onDown() no edit mode trata o overlay como alvo válido.
 * ===================================================================== */
definePlugin({
    id: 'interaction',
    version: '1.6.0',
    needs: ['state', 'camera', 'boards', 'instances', 'renderer', 'ui.dialogs'],
    provides: ['interaction'],
    uses: ['mangaEdit', 'mangaPage', 'panelSets', 'history', 'assets'],
    accepts: { 'state': '^1.0.0', 'camera': '^1.0.0', 'boards': '^1.0.0', 'instances': '^1.0.0', 'renderer': '^1.0.0', 'ui.dialogs': '^1.0.0', 'mangaEdit': '^1.0.0', 'mangaPage': '^1.0.0', 'panelSets': '^1.0.0', 'history': '^1.0.0', 'assets': '^1.0.0' },
    contractVersions: { 'interaction': '1.0.0' },
    setup: async function (kernel) {
        const S = await kernel.require('state');
        const cam = await kernel.require('camera');
        const B = await kernel.require('boards');
        const instApi = await kernel.require('instances');
        const rend = await kernel.require('renderer');
        const D = await kernel.require('ui.dialogs');
        const viewport = document.getElementById('viewport');
        const marqueeEl = document.getElementById('marquee');
        let drag = null;
        let spaceDown = false;
        let lastPointer = { x: 0, y: 0 };
        let autoPanRAF = null;
        const EDGE = 70, MAX_AUTOPAN = 22;
        /* ---------------- Refs assíncronas ---------------- */
        let ME = null;
        let MP = null;
        let PS = null;
        if (kernel.has('mangaEdit'))
            kernel.require('mangaEdit').then(function (m) { ME = m; });
        if (kernel.has('mangaPage'))
            kernel.require('mangaPage').then(function (m) { MP = m; });
        if (kernel.has('panelSets'))
            kernel.require('panelSets').then(function (m) { PS = m; });
        /* ---------------- FASE C: drag target state ---------------- */
        let lastDragTarget = null;
        function clearDragTarget() {
            if (!lastDragTarget)
                return;
            if (lastDragTarget.type === 'panel') {
                lastDragTarget.el.classList.remove('drop-target');
            }
            else if (lastDragTarget.type === 'overlay') {
                lastDragTarget.el.classList.remove('overlay-target');
            }
            lastDragTarget = null;
        }
        function updateDragTarget(worldX, worldY) {
            if (!MP || !rend) {
                clearDragTarget();
                return;
            }
            const inst = MP.hitTestMangaPage(worldX, worldY);
            if (!inst) {
                clearDragTarget();
                return;
            }
            const instEl = rend.els.get(inst.id);
            if (!instEl) {
                clearDragTarget();
                return;
            }
            const panelId = MP.hitTestPanel(inst, worldX, worldY);
            if (panelId) {
                const panelEl = instEl.querySelector('.manga-panel[data-panel-id="' + panelId + '"]');
                if (!panelEl) {
                    clearDragTarget();
                    return;
                }
                if (lastDragTarget && lastDragTarget.type === 'panel' &&
                    lastDragTarget.el === panelEl)
                    return;
                clearDragTarget();
                panelEl.classList.add('drop-target');
                lastDragTarget = { type: 'panel', el: panelEl, instanceId: inst.id };
            }
            else {
                const overlayEl = instEl.querySelector('.manga-overlay');
                if (!overlayEl) {
                    clearDragTarget();
                    return;
                }
                if (lastDragTarget && lastDragTarget.type === 'overlay' &&
                    lastDragTarget.el === overlayEl)
                    return;
                clearDragTarget();
                overlayEl.classList.add('overlay-target');
                lastDragTarget = { type: 'overlay', el: overlayEl, instanceId: inst.id };
            }
        }
        function vp(evt) {
            const r = viewport.getBoundingClientRect();
            return { x: evt.clientX - r.left, y: evt.clientY - r.top };
        }
        function select(inst, additive) {
            if (additive) {
                if (S.data.selection.has(inst.id))
                    S.data.selection.delete(inst.id);
                else
                    S.data.selection.add(inst.id);
            }
            else if (!S.data.selection.has(inst.id)) {
                S.data.selection.clear();
                S.data.selection.add(inst.id);
            }
            kernel.emit('selection:changed');
        }
        /* ==========================================================
         * Normal drags
         * ========================================================== */
        function startMove(e) {
            const p = vp(e);
            lastPointer = p;
            const w = cam.screenToWorld(p.x, p.y);
            const items = [];
            S.data.selection.forEach(function (id) {
                const i = S.getInstance(id);
                if (i && !i.locked)
                    items.push({ id: id, ox: i.x - w.x, oy: i.y - w.y });
            });
            if (!items.length)
                return;
            drag = { type: 'move', items: items, before: null, moved: false, pointerId: e.pointerId };
            try {
                viewport.setPointerCapture(e.pointerId);
            }
            catch (er) { }
            startAutoPan();
            kernel.call('history', 'snapshot').then(function (s) { if (drag && 'before' in drag)
                drag.before = s; });
        }
        function startResize(e, inst, corner) {
            const p = vp(e);
            lastPointer = p;
            const startWorld = cam.screenToWorld(p.x, p.y);
            const r = { x: inst.x, y: inst.y, w: inst.width, h: inst.height };
            let anchor;
            if (corner === 'se')
                anchor = { x: r.x, y: r.y };
            else if (corner === 'nw')
                anchor = { x: r.x + r.w, y: r.y + r.h };
            else if (corner === 'ne')
                anchor = { x: r.x, y: r.y + r.h };
            else
                anchor = { x: r.x + r.w, y: r.y };
            drag = {
                type: 'resize', corner: corner, instId: inst.id, anchorWorld: anchor,
                startRect: r, aspect: (inst.width / inst.height) || 1,
                before: null, moved: false, pointerId: e.pointerId
            };
            try {
                viewport.setPointerCapture(e.pointerId);
            }
            catch (er) { }
            startAutoPan();
            kernel.call('history', 'snapshot').then(function (s) { if (drag && 'before' in drag)
                drag.before = s; });
        }
        function startPan(e) {
            const p = vp(e);
            lastPointer = p;
            drag = {
                type: 'pan', startScreen: p,
                startCam: { x: cam.data.x, y: cam.data.y },
                moved: false, pointerId: e.pointerId
            };
            viewport.classList.add('panning');
            try {
                viewport.setPointerCapture(e.pointerId);
            }
            catch (er) { }
        }
        function startMarquee(e) {
            const p = vp(e);
            lastPointer = p;
            drag = {
                type: 'marquee', startScreen: p,
                additive: e.shiftKey || e.ctrlKey || e.metaKey,
                base: new Set(S.data.selection), pointerId: e.pointerId
            };
            marqueeEl.hidden = false;
            drawMarquee(p, p);
            try {
                viewport.setPointerCapture(e.pointerId);
            }
            catch (er) { }
            startAutoPan();
        }
        function drawMarquee(a, b) {
            const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
            const w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
            marqueeEl.style.left = x + 'px';
            marqueeEl.style.top = y + 'px';
            marqueeEl.style.width = w + 'px';
            marqueeEl.style.height = h + 'px';
        }
        /* ==========================================================
         * Manga layer drags (edit mode)
         * ========================================================== */
        function worldToLocal(inst, ps, worldX, worldY) {
            const scale = inst.width / ps.width;
            return { x: (worldX - inst.x) / scale, y: (worldY - inst.y) / scale };
        }
        /* FASE E4: reconhece '__overlay__' */
        function getLayer(inst, panelId, layerId) {
            if (!inst)
                return null;
            if (panelId === '__overlay__') {
                const arr = inst.overlays || [];
                for (let j = 0; j < arr.length; j++) {
                    if (arr[j].id === layerId)
                        return arr[j];
                }
                return null;
            }
            if (!inst.panels)
                return null;
            for (let i = 0; i < inst.panels.length; i++) {
                if (inst.panels[i].id !== panelId)
                    continue;
                const arr = inst.panels[i].layers || [];
                for (let j = 0; j < arr.length; j++) {
                    if (arr[j].id === layerId)
                        return arr[j];
                }
            }
            return null;
        }
        function startLayerMove(e, inst, panelId, layerId) {
            const ps = MP && MP.getPanelSet(inst);
            if (!ps)
                return;
            const layer = getLayer(inst, panelId, layerId);
            if (!layer)
                return;
            const p = vp(e);
            lastPointer = p;
            const w = cam.screenToWorld(p.x, p.y);
            const local = worldToLocal(inst, ps, w.x, w.y);
            drag = {
                type: 'manga-layer-move',
                instId: inst.id, panelId: panelId, layerId: layerId,
                startLocal: local,
                startLayer: { x: layer.x, y: layer.y },
                before: null, moved: false, pointerId: e.pointerId
            };
            try {
                viewport.setPointerCapture(e.pointerId);
            }
            catch (er) { }
            kernel.call('history', 'snapshot').then(function (s) { if (drag && 'before' in drag)
                drag.before = s; });
        }
        function startLayerResize(e, inst, panelId, layerId, corner) {
            const ps = MP && MP.getPanelSet(inst);
            if (!ps)
                return;
            const layer = getLayer(inst, panelId, layerId);
            if (!layer)
                return;
            const r = { x: layer.x, y: layer.y, w: layer.width, h: layer.height };
            let anchor;
            if (corner === 'se')
                anchor = { x: r.x, y: r.y };
            else if (corner === 'nw')
                anchor = { x: r.x + r.w, y: r.y + r.h };
            else if (corner === 'ne')
                anchor = { x: r.x, y: r.y + r.h };
            else
                anchor = { x: r.x + r.w, y: r.y };
            drag = {
                type: 'manga-layer-resize',
                instId: inst.id, panelId: panelId, layerId: layerId,
                corner: corner, anchorLocal: anchor,
                aspect: (layer.width / layer.height) || 1,
                before: null, moved: false, pointerId: e.pointerId
            };
            try {
                viewport.setPointerCapture(e.pointerId);
            }
            catch (er) { }
            kernel.call('history', 'snapshot').then(function (s) { if (drag && 'before' in drag)
                drag.before = s; });
        }
        /* ==========================================================
         * pointerdown
         * ========================================================== */
        function onDown(e) {
            if (e.button === 2)
                return;
            const wantPan = e.button === 1 || spaceDown || e.altKey;
            if (wantPan) {
                startPan(e);
                return;
            }
            /* ---------- EDIT MODE ---------- */
            if (ME && ME.isActive()) {
                const mode = ME.getMode();
                const inst = ME.instanceById(mode.instanceId);
                if (!inst) {
                    ME.exit(true);
                    return;
                }
                const layerHandleEl = e.target.closest && e.target.closest('[data-mlayer-handle]');
                const layerEl = e.target.closest && e.target.closest('.manga-layer');
                const panelEl = e.target.closest && e.target.closest('.manga-panel');
                const overlayEl = e.target.closest && e.target.closest('.manga-overlay');
                const isOverlayMode = mode.panelId === '__overlay__';
                // --- Handles ---
                if (layerHandleEl && layerEl) {
                    const belongs = isOverlayMode
                        ? !!(overlayEl && layerEl.closest('.manga-overlay'))
                        : !!(panelEl && panelEl.dataset.panelId === mode.panelId);
                    if (belongs) {
                        startLayerResize(e, inst, mode.panelId, layerEl.dataset.layerId, layerHandleEl.dataset.mlayerHandle);
                        return;
                    }
                }
                // --- Overlay edit ---
                if (isOverlayMode) {
                    if (layerEl && overlayEl && layerEl.closest('.manga-overlay') === overlayEl) {
                        ME.setSelectedLayer(layerEl.dataset.layerId || null);
                        startLayerMove(e, inst, mode.panelId, layerEl.dataset.layerId);
                        return;
                    }
                    // Clique em qualquer lugar do overlay → desseleciona
                    ME.setSelectedLayer(null);
                    return;
                }
                // --- Panel edit ---
                if (layerEl && panelEl && panelEl.dataset.panelId === mode.panelId) {
                    ME.setSelectedLayer(layerEl.dataset.layerId || null);
                    startLayerMove(e, inst, mode.panelId, layerEl.dataset.layerId);
                    return;
                }
                if (panelEl) {
                    ME.setSelectedLayer(null);
                    return;
                }
                ME.setSelectedLayer(null);
                return;
            }
            /* ---------- FIM EDIT MODE ---------- */
            const target = e.target;
            const handleEl = target.closest && target.closest('.handle');
            const iconEl = target.closest && target.closest('.board-card-icon');
            const mangaPageEl = target.closest && target.closest('.manga-page');
            const instEl = target.closest && target.closest('.instance');
            if (iconEl)
                return;
            if (mangaPageEl && !handleEl) {
                const pageInst = S.getInstance(mangaPageEl.dataset.id);
                if (pageInst && pageInst.type === 'manga-page') {
                    select(pageInst, e.shiftKey || e.ctrlKey || e.metaKey);
                    if (MP) {
                        let panelId = null;
                        const panelEl = e.target.closest && e.target.closest('.manga-panel');
                        if (panelEl && panelEl.dataset && panelEl.dataset.panelId) {
                            panelId = panelEl.dataset.panelId;
                        }
                        else {
                            const ps = MP.getPanelSet(pageInst);
                            panelId = ps && ps.panels && ps.panels[0] ? ps.panels[0].id : null;
                        }
                        if (panelId) {
                            const curFocus = MP.getFocus();
                            if (!curFocus || curFocus.instanceId !== pageInst.id ||
                                curFocus.panelId !== panelId) {
                                MP.setFocus(pageInst.id, panelId);
                            }
                        }
                    }
                    if (!pageInst.locked)
                        startMove(e);
                    return;
                }
            }
            if (instEl) {
                const inst = S.getInstance(instEl.dataset.id);
                if (!inst)
                    return;
                if (inst.type === 'board') {
                    if (handleEl && !inst.locked) {
                        startResize(e, inst, handleEl.dataset.handle);
                        return;
                    }
                    const add = e.shiftKey || e.ctrlKey || e.metaKey;
                    select(inst, add);
                    if (!inst.locked)
                        startMove(e);
                    return;
                }
                e.preventDefault();
                if (handleEl && !inst.locked && S.data.selection.size === 1) {
                    startResize(e, inst, handleEl.dataset.handle);
                    return;
                }
                const add = e.shiftKey || e.ctrlKey || e.metaKey;
                select(inst, add);
                if (!inst.locked)
                    startMove(e);
                return;
            }
            e.preventDefault();
            if (!(e.shiftKey || e.ctrlKey || e.metaKey)) {
                S.data.selection.clear();
                kernel.emit('selection:changed');
            }
            if (MP)
                MP.clearFocus();
            startMarquee(e);
        }
        /* ==========================================================
         * pointermove
         * ========================================================== */
        function onMove(e) {
            const p = vp(e);
            lastPointer = p;
            if (!drag)
                return;
            if (drag.type === 'pan') {
                const dx = p.x - drag.startScreen.x;
                const dy = p.y - drag.startScreen.y;
                if (Math.abs(dx) > 1 || Math.abs(dy) > 1)
                    drag.moved = true;
                cam.data.x = drag.startCam.x - dx / cam.data.zoom;
                cam.data.y = drag.startCam.y - dy / cam.data.zoom;
                cam.apply();
                return;
            }
            if (drag.type === 'move') {
                const w = cam.screenToWorld(p.x, p.y);
                for (const it of drag.items) {
                    const i = S.getInstance(it.id);
                    if (!i)
                        continue;
                    i.x = w.x + it.ox;
                    i.y = w.y + it.oy;
                    rend.updateEl(i);
                }
                drag.moved = true;
                return;
            }
            if (drag.type === 'resize') {
                const w = cam.screenToWorld(p.x, p.y);
                const i = S.getInstance(drag.instId);
                if (!i)
                    return;
                const a = drag.anchorWorld;
                const dx = w.x - a.x, dy = w.y - a.y;
                const c = drag.corner;
                let absW, absH;
                if (c === 'se') {
                    absW = Math.max(24, dx);
                    absH = Math.max(24, dy);
                }
                else if (c === 'nw') {
                    absW = Math.max(24, -dx);
                    absH = Math.max(24, -dy);
                }
                else if (c === 'ne') {
                    absW = Math.max(24, dx);
                    absH = Math.max(24, -dy);
                }
                else {
                    absW = Math.max(24, -dx);
                    absH = Math.max(24, dy);
                }
                const aspect = drag.aspect;
                let nw, nh;
                if (absW / aspect > absH) {
                    nw = absW;
                    nh = nw / aspect;
                }
                else {
                    nh = absH;
                    nw = nh * aspect;
                }
                if (c === 'se') {
                    i.x = a.x;
                    i.y = a.y;
                }
                else if (c === 'nw') {
                    i.x = a.x - nw;
                    i.y = a.y - nh;
                }
                else if (c === 'ne') {
                    i.x = a.x;
                    i.y = a.y - nh;
                }
                else {
                    i.x = a.x - nw;
                    i.y = a.y;
                }
                i.width = Math.round(nw);
                i.height = Math.round(nh);
                drag.moved = true;
                rend.updateEl(i);
                return;
            }
            if (drag.type === 'marquee') {
                const a = drag.startScreen, b = p;
                drawMarquee(a, b);
                const rect = {
                    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
                    w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y)
                };
                const tl = cam.screenToWorld(rect.x, rect.y);
                const br = cam.screenToWorld(rect.x + rect.w, rect.y + rect.h);
                S.data.selection.clear();
                drag.base.forEach(function (id) { S.data.selection.add(id); });
                for (const i of S.currentInstances()) {
                    if (i.x < br.x && i.x + i.width > tl.x && i.y < br.y && i.y + i.height > tl.y) {
                        S.data.selection.add(i.id);
                    }
                }
                kernel.emit('selection:changed');
                return;
            }
            if (drag.type === 'manga-layer-move') {
                const inst = S.getInstance(drag.instId);
                if (!inst || inst.type !== 'manga-page')
                    return;
                const ps = MP && MP.getPanelSet(inst);
                if (!ps)
                    return;
                const layer = getLayer(inst, drag.panelId, drag.layerId);
                if (!layer)
                    return;
                const w = cam.screenToWorld(p.x, p.y);
                const local = worldToLocal(inst, ps, w.x, w.y);
                layer.x = Math.round(drag.startLayer.x + (local.x - drag.startLocal.x));
                layer.y = Math.round(drag.startLayer.y + (local.y - drag.startLocal.y));
                drag.moved = true;
                rend.updateEl(inst);
                return;
            }
            if (drag.type === 'manga-layer-resize') {
                const inst = S.getInstance(drag.instId);
                if (!inst || inst.type !== 'manga-page')
                    return;
                const ps = MP && MP.getPanelSet(inst);
                if (!ps)
                    return;
                const layer = getLayer(inst, drag.panelId, drag.layerId);
                if (!layer)
                    return;
                const w = cam.screenToWorld(p.x, p.y);
                const local = worldToLocal(inst, ps, w.x, w.y);
                const a = drag.anchorLocal;
                const c = drag.corner;
                const dx = local.x - a.x, dy = local.y - a.y;
                let absW, absH;
                if (c === 'se') {
                    absW = Math.max(10, dx);
                    absH = Math.max(10, dy);
                }
                else if (c === 'nw') {
                    absW = Math.max(10, -dx);
                    absH = Math.max(10, -dy);
                }
                else if (c === 'ne') {
                    absW = Math.max(10, dx);
                    absH = Math.max(10, -dy);
                }
                else {
                    absW = Math.max(10, -dx);
                    absH = Math.max(10, dy);
                }
                if (e.shiftKey && drag.aspect) {
                    const asp = drag.aspect;
                    let nw, nh;
                    if (absW / asp > absH) {
                        nw = absW;
                        nh = nw / asp;
                    }
                    else {
                        nh = absH;
                        nw = nh * asp;
                    }
                    absW = nw;
                    absH = nh;
                }
                let nx, ny;
                if (c === 'se') {
                    nx = a.x;
                    ny = a.y;
                }
                else if (c === 'nw') {
                    nx = a.x - absW;
                    ny = a.y - absH;
                }
                else if (c === 'ne') {
                    nx = a.x;
                    ny = a.y - absH;
                }
                else {
                    nx = a.x - absW;
                    ny = a.y;
                }
                layer.x = Math.round(nx);
                layer.y = Math.round(ny);
                layer.width = Math.round(absW);
                layer.height = Math.round(absH);
                drag.moved = true;
                rend.updateEl(inst);
                return;
            }
        }
        /* ==========================================================
         * pointerup
         * ========================================================== */
        function onUp() {
            if (!drag)
                return;
            const d = drag;
            drag = null;
            stopAutoPan();
            viewport.classList.remove('panning');
            marqueeEl.hidden = true;
            try {
                viewport.releasePointerCapture(d.pointerId);
            }
            catch (e) { }
            const isMangaLayerDrag = d.type === 'manga-layer-move' || d.type === 'manga-layer-resize';
            if (d.type === 'move' || d.type === 'resize' || isMangaLayerDrag) {
                if (d.moved && d.before)
                    kernel.call('history', 'push', d.before);
                if (d.moved) {
                    kernel.emit('state:changed');
                    if (isMangaLayerDrag) {
                        kernel.emit('manga-page:changed', { instanceId: d.instId });
                    }
                }
            }
            else if (d.type === 'pan') {
                if (d.moved)
                    kernel.emit('camera:changed');
            }
        }
        /* ---------------- Auto-pan ---------------- */
        function startAutoPan() { if (autoPanRAF)
            return; autoPanRAF = requestAnimationFrame(autopan); }
        function stopAutoPan() { if (autoPanRAF) {
            cancelAnimationFrame(autoPanRAF);
            autoPanRAF = null;
        } }
        function autopan() {
            autoPanRAF = null;
            if (!drag)
                return;
            const vw = viewport.clientWidth, vh = viewport.clientHeight;
            const p = lastPointer;
            let vx = 0, vy = 0;
            if (p.x < EDGE)
                vx = -((EDGE - p.x) / EDGE) * MAX_AUTOPAN;
            else if (p.x > vw - EDGE)
                vx = ((p.x - (vw - EDGE)) / EDGE) * MAX_AUTOPAN;
            if (p.y < EDGE)
                vy = -((EDGE - p.y) / EDGE) * MAX_AUTOPAN;
            else if (p.y > vh - EDGE)
                vy = ((p.y - (vh - EDGE)) / EDGE) * MAX_AUTOPAN;
            if (vx || vy) {
                cam.data.x += vx / cam.data.zoom;
                cam.data.y += vy / cam.data.zoom;
                cam.apply();
                if (drag.type === 'move' && drag.items.length) {
                    const w = cam.screenToWorld(p.x, p.y);
                    for (const it of drag.items) {
                        const i = S.getInstance(it.id);
                        if (i) {
                            i.x = w.x + it.ox;
                            i.y = w.y + it.oy;
                            rend.updateEl(i);
                        }
                    }
                }
            }
            autoPanRAF = requestAnimationFrame(autopan);
        }
        /* ---------------- Wheel ---------------- */
        function onWheel(e) {
            e.preventDefault();
            const p = vp(e);
            const factor = Math.exp(-e.deltaY * 0.0016);
            cam.zoomAt(p.x, p.y, cam.data.zoom * factor);
        }
        /* ---------------- Double-click ---------------- */
        async function onDblClick(e) {
            const panelEl = e.target.closest && e.target.closest('.manga-panel');
            if (panelEl && ME) {
                const pageEl = panelEl.closest('.manga-page');
                if (pageEl) {
                    e.preventDefault();
                    e.stopPropagation();
                    ME.enter(pageEl.dataset.id, panelEl.dataset.panelId);
                    return;
                }
            }
            const nameEl = e.target.closest && e.target.closest('.board-card-name');
            if (nameEl) {
                e.preventDefault();
                e.stopPropagation();
                const cardEl = nameEl.closest('.board-card');
                const inst = cardEl ? S.getInstance(cardEl.dataset.id) : null;
                if (!inst || inst.type !== 'board' || !inst.boardId)
                    return;
                const board = B.getBoard(inst.boardId);
                if (!board)
                    return;
                const newName = await D.prompt({
                    title: 'Rename board',
                    message: 'Choose a new name for this board.',
                    input: board.name,
                    confirmText: 'Rename'
                });
                if (newName && newName !== board.name) {
                    B.rename(board.id, newName);
                    kernel.emit('state:changed');
                }
            }
        }
        /* ---------------- Keyboard ---------------- */
        function isTyping(el) {
            if (!el)
                return false;
            const target = el;
            const t = target.tagName;
            return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' ||
                t === 'BUTTON' || t === 'A' || target.isContentEditable ||
                Boolean(target.closest?.('[role="menuitem"], [role="button"]:not(.instance)'));
        }
        async function onKey(e) {
            const dialog = document.getElementById('dialog');
            const preview = document.getElementById('preview');
            if (dialog && !dialog.hidden)
                return;
            if (preview && !preview.hidden) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    kernel.emit('ui:preview-close');
                }
                return;
            }
            if (isTyping(e.target))
                return;
            const ctrl = e.ctrlKey || e.metaKey;
            if (ME && ME.isActive()) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    ME.exit();
                    return;
                }
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    e.preventDefault();
                    const mode = ME.getMode();
                    const inst = ME.instanceById(mode.instanceId);
                    const layerId = ME.getSelectedLayerId();
                    if (inst && inst.type === 'manga-page' && layerId && MP) {
                        await MP.removeLayer(inst, mode.panelId, layerId);
                        ME.setSelectedLayer(null);
                    }
                    return;
                }
                const sel = ME.getSelectedLayerId();
                if (sel) {
                    const mode = ME.getMode();
                    const inst = ME.instanceById(mode.instanceId);
                    if (inst && inst.type === 'manga-page') {
                        const step = e.shiftKey ? 10 : 1;
                        let dx = 0, dy = 0;
                        if (e.key === 'ArrowLeft')
                            dx = -step;
                        else if (e.key === 'ArrowRight')
                            dx = step;
                        else if (e.key === 'ArrowUp')
                            dy = -step;
                        else if (e.key === 'ArrowDown')
                            dy = step;
                        if (dx || dy) {
                            e.preventDefault();
                            const layer = getLayer(inst, mode.panelId, sel);
                            if (layer) {
                                const before = await kernel.call('history', 'snapshot');
                                layer.x += dx;
                                layer.y += dy;
                                await kernel.call('history', 'push', before);
                                rend.updateEl(inst);
                                kernel.emit('manga-page:changed', { instanceId: inst.id });
                                kernel.emit('state:changed');
                            }
                            return;
                        }
                    }
                }
                if (ctrl)
                    return;
                return;
            }
            if (e.code === 'Space' && !ctrl) {
                if (!spaceDown) {
                    spaceDown = true;
                    viewport.classList.add('pan-mode');
                }
                e.preventDefault();
                return;
            }
            if (ctrl && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault();
                kernel.emit('history:undo');
                return;
            }
            if (ctrl && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault();
                kernel.emit('history:redo');
                return;
            }
            if (ctrl && (e.key === 'y' || e.key === 'Y')) {
                e.preventDefault();
                kernel.emit('history:redo');
                return;
            }
            if (ctrl && (e.key === 'c' || e.key === 'C')) {
                e.preventDefault();
                instApi.copySelection();
                return;
            }
            if (ctrl && (e.key === 'v' || e.key === 'V')) {
                e.preventDefault();
                instApi.pasteClipboard();
                return;
            }
            if (ctrl && (e.key === 'd' || e.key === 'D')) {
                e.preventDefault();
                instApi.duplicateSelection();
                return;
            }
            if (ctrl && (e.key === 'a' || e.key === 'A')) {
                e.preventDefault();
                S.data.selection.clear();
                S.currentInstances().forEach(function (i) { S.data.selection.add(i.id); });
                kernel.emit('selection:changed');
                return;
            }
            if (ctrl && e.key === '[') {
                e.preventDefault();
                B.navigateUp();
                return;
            }
            if (ctrl)
                return;
            if (e.key === 'Delete') {
                e.preventDefault();
                instApi.removeSelection();
                return;
            }
            if (e.key === 'Backspace') {
                e.preventDefault();
                if (S.data.selection.size)
                    instApi.removeSelection();
                else if (B.current()?.parentBoardId)
                    B.navigateUp();
                return;
            }
            if (e.key === 'Escape') {
                if (S.data.selection.size) {
                    S.data.selection.clear();
                    kernel.emit('selection:changed');
                    return;
                }
                if (MP)
                    MP.clearFocus();
                const cur = B.current();
                if (cur && cur.parentBoardId) {
                    e.preventDefault();
                    B.navigateUp();
                }
                return;
            }
            if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                if (e.shiftKey)
                    cam.fitSelection();
                else
                    cam.fitAll();
                return;
            }
            if (e.key === '0') {
                e.preventDefault();
                cam.reset();
                return;
            }
            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                cam.zoomByFactor(1.2);
                return;
            }
            if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                cam.zoomByFactor(1 / 1.2);
                return;
            }
            const step = e.shiftKey ? 10 : 1;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                instApi.nudge(-step, 0);
                return;
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                instApi.nudge(step, 0);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                instApi.nudge(0, -step);
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                instApi.nudge(0, step);
                return;
            }
        }
        function onKeyUp(e) {
            if (e.code === 'Space') {
                spaceDown = false;
                viewport.classList.remove('pan-mode');
            }
        }
        /* ---------------- Drag & drop ---------------- */
        viewport.addEventListener('dragover', function (e) {
            if (e.dataTransfer && e.dataTransfer.types) {
                const t = Array.from(e.dataTransfer.types);
                if (t.indexOf('application/x-nvb-asset') !== -1 || t.indexOf('Files') !== -1) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    viewport.classList.add('drop-active');
                    if (t.indexOf('application/x-nvb-asset') !== -1 && MP) {
                        const p = vp(e);
                        const w = cam.screenToWorld(p.x, p.y);
                        updateDragTarget(w.x, w.y);
                    }
                }
            }
        });
        viewport.addEventListener('dragleave', function (e) {
            if (e.target === viewport) {
                viewport.classList.remove('drop-active');
                clearDragTarget();
            }
        });
        viewport.addEventListener('drop', async function (e) {
            viewport.classList.remove('drop-active');
            clearDragTarget();
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
                e.preventDefault();
                const A = await kernel.require('assets');
                await A.importFiles(e.dataTransfer.files, A.ensureDefaultPackage());
                return;
            }
            const assetId = e.dataTransfer?.getData('application/x-nvb-asset');
            if (!assetId)
                return;
            e.preventDefault();
            const p = vp(e);
            const w = cam.screenToWorld(p.x, p.y);
            if (MP) {
                try {
                    const handled = await MP.tryDrop(assetId, w.x, w.y);
                    if (handled)
                        return;
                }
                catch (err) {
                    kernel.log.warn('manga tryDrop failed', err);
                }
            }
            instApi.addImage(assetId, w.x, w.y);
        });
        /* ---------------- Wiring ---------------- */
        viewport.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        viewport.addEventListener('wheel', onWheel, { passive: false });
        viewport.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        viewport.addEventListener('dblclick', onDblClick);
        window.addEventListener('keydown', onKey);
        window.addEventListener('keyup', onKeyUp);
        kernel.provide('interaction', {});
    }
});
