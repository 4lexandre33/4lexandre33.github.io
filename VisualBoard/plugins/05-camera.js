"use strict";
/* TS-009: typed bounded-world camera with unchanged zoom, transform and events. */
/* =====================================================================
 * plugins/05-camera.js
 * Câmera com mundo LIMITADO (não infinito). Borda visível do mundo,
 * pan clampado dentro dos limites, exposição de WORLD_MIN/MAX.
 * ===================================================================== */
definePlugin({
    id: 'camera',
    version: '1.2.0',
    needs: ['state'],
    provides: ['camera'],
    uses: [],
    accepts: { 'state': '^1.0.0' },
    contractVersions: { 'camera': '1.0.0' },
    setup: async function (kernel) {
        const stateApi = await kernel.require('state');
        const MIN_ZOOM = 0.05;
        const MAX_ZOOM = 8;
        // Mundo limitado: -5000..+5000 em cada eixo (10000x10000 unidades)
        const WORLD_HALF = 5000;
        const WORLD_MIN = -WORLD_HALF;
        const WORLD_MAX = WORLD_HALF;
        const WORLD_SIZE = WORLD_MAX - WORLD_MIN;
        const camera = { x: 0, y: 0, zoom: 1 };
        const viewport = document.getElementById('viewport');
        const world = document.getElementById('world');
        // Publica limites como variáveis CSS para a borda do mundo
        document.documentElement.style.setProperty('--world-min', WORLD_MIN + 'px');
        document.documentElement.style.setProperty('--world-size', WORLD_SIZE + 'px');
        // Garante que o elemento de borda existe dentro do world
        if (!world.querySelector('#world-boundary')) {
            const b = document.createElement('div');
            b.id = 'world-boundary';
            world.appendChild(b);
        }
        function viewportSize() {
            return { w: viewport.clientWidth, h: viewport.clientHeight };
        }
        /** Impede a câmera de sair do mundo. */
        function clampCamera() {
            const s = viewportSize();
            const halfW = s.w / 2 / camera.zoom;
            const halfH = s.h / 2 / camera.zoom;
            if (halfW * 2 >= WORLD_SIZE)
                camera.x = 0;
            else
                camera.x = Math.max(WORLD_MIN + halfW, Math.min(WORLD_MAX - halfW, camera.x));
            if (halfH * 2 >= WORLD_SIZE)
                camera.y = 0;
            else
                camera.y = Math.max(WORLD_MIN + halfH, Math.min(WORLD_MAX - halfH, camera.y));
        }
        function offset() {
            const s = viewportSize();
            return { tx: s.w / 2 - camera.x * camera.zoom, ty: s.h / 2 - camera.y * camera.zoom };
        }
        function screenToWorld(sx, sy) {
            const o = offset();
            return { x: (sx - o.tx) / camera.zoom, y: (sy - o.ty) / camera.zoom };
        }
        function worldToScreen(wx, wy) {
            const o = offset();
            return { x: wx * camera.zoom + o.tx, y: wy * camera.zoom + o.ty };
        }
        function apply() {
            clampCamera();
            const o = offset();
            world.style.transform = 'translate3d(' + o.tx + 'px,' + o.ty + 'px,0) scale(' + camera.zoom + ')';
            world.style.setProperty('--izoom', String(1 / camera.zoom));
            const zoomPct = Math.round(camera.zoom * 100);
            const hudZoom = document.getElementById('hud-zoom');
            const zoomLabel = document.getElementById('zoom-label');
            const slider = document.getElementById('zoom-slider');
            if (hudZoom)
                hudZoom.textContent = zoomPct + '%';
            if (zoomLabel)
                zoomLabel.textContent = zoomPct + '%';
            if (slider) {
                const v = Math.round((Math.log(camera.zoom / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM)) * (800 - 5) + 5);
                slider.value = String(Math.max(5, Math.min(800, v)));
            }
            kernel.emit('camera:changed');
        }
        function zoomAt(sx, sy, newZoom) {
            const before = screenToWorld(sx, sy);
            camera.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
            apply();
            const after = screenToWorld(sx, sy);
            camera.x += before.x - after.x;
            camera.y += before.y - after.y;
            apply();
        }
        function zoomByFactor(f) {
            zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, camera.zoom * f);
        }
        function setCentered(z) { zoomByFactor(z / camera.zoom); }
        function reset() { camera.x = 0; camera.y = 0; camera.zoom = 1; apply(); }
        function bounds(list) {
            if (!list.length)
                return null;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const i of list) {
                minX = Math.min(minX, i.x);
                minY = Math.min(minY, i.y);
                maxX = Math.max(maxX, i.x + i.width);
                maxY = Math.max(maxY, i.y + i.height);
            }
            return { minX, minY, maxX, maxY };
        }
        function fitBounds(b, pad) {
            if (!b) {
                reset();
                return;
            }
            pad = pad === undefined ? 90 : pad;
            const s = viewportSize();
            const cw = Math.max(b.maxX - b.minX, 1);
            const ch = Math.max(b.maxY - b.minY, 1);
            const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min((s.w - pad * 2) / cw, (s.h - pad * 2) / ch)));
            camera.zoom = z;
            camera.x = (b.minX + b.maxX) / 2;
            camera.y = (b.minY + b.maxY) / 2;
            apply();
        }
        function fitAll() {
            const S = stateApi;
            if (!S)
                return;
            const b = S.getCurrentBoard();
            if (!b)
                return;
            const vis = b.instances.filter(i => i.visible !== false);
            fitBounds(bounds(vis), 90);
        }
        function fitSelection() {
            const S = stateApi;
            if (!S)
                return;
            const list = S.currentInstances().filter(i => S.data.selection.has(i.id));
            if (!list.length)
                return fitAll();
            fitBounds(bounds(list), 120);
        }
        kernel.provide('camera', {
            data: camera,
            apply, zoomAt, zoomByFactor, setCentered, reset,
            screenToWorld, worldToScreen, offset, clampCamera,
            fitAll, fitSelection, fitBounds, bounds,
            WORLD_MIN, WORLD_MAX, WORLD_SIZE, MIN_ZOOM, MAX_ZOOM
        });
        window.addEventListener('resize', apply);
        kernel.on('state:changed', apply);
    }
});
