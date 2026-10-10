"use strict";
/* =====================================================================
 * plugins/10b-minimap.js
 * Minimapa flutuante que mostra o mundo inteiro, todas as instâncias
 * do board atual e um retângulo do viewport. Clique para pular; arraste
 * para navegar continuamente.
 * ===================================================================== */
definePlugin({
    id: 'minimap',
    version: '1.0.0',
    needs: ['state', 'camera', 'boards'],
    provides: ['minimap'],
    uses: ['assets'],
    accepts: { 'state': '^1.0.0', 'camera': '^1.0.0', 'boards': '^1.0.0', 'assets': '^1.0.0' },
    contractVersions: { 'minimap': '1.0.0' },
    setup: async function (kernel) {
        const S = await kernel.require('state');
        const cam = await kernel.require('camera');
        const viewport = document.getElementById('viewport');
        const center = document.getElementById('center');
        // ---------- DOM ----------
        const wrap = document.createElement('div');
        wrap.id = 'minimap';
        wrap.title = 'Click to jump · drag to pan';
        const canvas = document.createElement('canvas');
        canvas.width = 180;
        canvas.height = 180;
        wrap.appendChild(canvas);
        const toggle = document.createElement('button');
        toggle.className = 'minimap-toggle';
        toggle.type = 'button';
        toggle.textContent = '–';
        toggle.title = 'Collapse / expand minimap';
        wrap.appendChild(toggle);
        center.appendChild(wrap);
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const WORLD_MIN = cam.WORLD_MIN;
        const WORLD_SIZE = cam.WORLD_SIZE;
        let assetsRef = null;
        kernel.require('assets').then(a => { assetsRef = a; });
        // ---------- Helpers ----------
        function w2m(wx, wy) {
            return {
                x: ((wx - WORLD_MIN) / WORLD_SIZE) * W,
                y: ((wy - WORLD_MIN) / WORLD_SIZE) * H
            };
        }
        function draw() {
            ctx.clearRect(0, 0, W, H);
            // Fundo (branco do canvas)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, H);
            // Borda do mundo
            ctx.strokeStyle = '#d8dae0';
            ctx.lineWidth = 1;
            ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
            // Instâncias do board atual
            const list = S.currentInstances();
            for (const i of list) {
                const tl = w2m(i.x, i.y);
                const br = w2m(i.x + i.width, i.y + i.height);
                const rw = Math.max(2, br.x - tl.x);
                const rh = Math.max(2, br.y - tl.y);
                if (i.type === 'board') {
                    ctx.fillStyle = '#4da3ff';
                }
                else {
                    const hasImg = assetsRef && i.type === 'image' && assetsRef.urls.has(i.assetId);
                    ctx.fillStyle = hasImg ? '#7a8291' : '#c8ccd2';
                }
                ctx.fillRect(tl.x, tl.y, rw, rh);
            }
            // Retângulo do viewport atual
            const vw = viewport.clientWidth;
            const vh = viewport.clientHeight;
            const halfW = vw / 2 / cam.data.zoom;
            const halfH = vh / 2 / cam.data.zoom;
            const vTL = w2m(cam.data.x - halfW, cam.data.y - halfH);
            const vBR = w2m(cam.data.x + halfW, cam.data.y + halfH);
            ctx.fillStyle = 'rgba(77,163,255,0.10)';
            ctx.fillRect(vTL.x, vTL.y, vBR.x - vTL.x, vBR.y - vTL.y);
            ctx.strokeStyle = '#4da3ff';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(vTL.x, vTL.y, vBR.x - vTL.x, vBR.y - vTL.y);
        }
        // ---------- Interação ----------
        let dragging = false;
        function jumpTo(clientX, clientY) {
            const r = canvas.getBoundingClientRect();
            const mx = clientX - r.left;
            const my = clientY - r.top;
            if (mx < 0 || my < 0 || mx > r.width || my > r.height)
                return;
            const wx = WORLD_MIN + (mx / r.width) * WORLD_SIZE;
            const wy = WORLD_MIN + (my / r.height) * WORLD_SIZE;
            cam.data.x = wx;
            cam.data.y = wy;
            cam.apply();
        }
        canvas.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            e.preventDefault();
            dragging = true;
            jumpTo(e.clientX, e.clientY);
        });
        window.addEventListener('mousemove', (e) => {
            if (!dragging)
                return;
            jumpTo(e.clientX, e.clientY);
        });
        window.addEventListener('mouseup', () => { dragging = false; });
        canvas.addEventListener('click', (e) => e.stopPropagation());
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            wrap.classList.toggle('collapsed');
            toggle.textContent = wrap.classList.contains('collapsed') ? '+' : '–';
        });
        kernel.provide('minimap', { draw });
        // ---------- Redraw ----------
        const redraw = () => requestAnimationFrame(draw);
        kernel.on('camera:changed', redraw);
        kernel.on('instances:changed', redraw);
        kernel.on('state:changed', redraw);
        kernel.on('board:navigated', redraw);
        kernel.on('assets:changed', redraw);
        kernel.on('boards:changed', redraw);
        window.addEventListener('resize', redraw);
        setTimeout(draw, 150);
    }
});
