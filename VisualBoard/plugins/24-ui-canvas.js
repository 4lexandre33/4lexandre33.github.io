"use strict";
definePlugin({
    id: 'ui.canvas',
    version: '1.0.0',
    needs: ['camera', 'instances', 'renderer', 'interaction', 'state'],
    provides: ['ui.canvas'],
    uses: [],
    accepts: { 'camera': '^1.0.0', 'instances': '^1.0.0', 'renderer': '^1.0.0', 'interaction': '^1.0.0', 'state': '^1.0.0' },
    contractVersions: { 'ui.canvas': '1.0.0' },
    setup: async function (kernel) {
        const cam = await kernel.require('camera');
        const I = await kernel.require('instances');
        const slider = document.getElementById('zoom-slider');
        const selToolbar = document.getElementById('selection-toolbar');
        document.querySelectorAll('[data-cmd="zoom-out"]').forEach(b => b.addEventListener('click', () => cam.zoomByFactor(1 / 1.25)));
        document.querySelectorAll('[data-cmd="zoom-in"]').forEach(b => b.addEventListener('click', () => cam.zoomByFactor(1.25)));
        document.querySelectorAll('[data-cmd="zoom-100"]').forEach(b => b.addEventListener('click', () => cam.setCentered(1)));
        document.querySelectorAll('[data-cmd="zoom-fit"]').forEach(b => b.addEventListener('click', () => cam.fitAll()));
        document.querySelectorAll('[data-cmd="zoom-focus"]').forEach(b => b.addEventListener('click', () => cam.fitSelection()));
        slider.addEventListener('input', e => {
            const v = Number(e.target.value);
            const z = 0.05 * Math.pow(8 / 0.05, (v - 5) / (800 - 5));
            cam.setCentered(z);
        });
        selToolbar.addEventListener('click', e => {
            const target = e.target;
            const act = target && target.dataset ? target.dataset.act : null;
            if (!act)
                return;
            if (act === 'front')
                I.reorder('front');
            else if (act === 'forward')
                I.reorder('forward');
            else if (act === 'backward')
                I.reorder('backward');
            else if (act === 'back')
                I.reorder('back');
            else if (act === 'rotate')
                I.rotateSelection();
            else if (act === 'ratio')
                I.restoreAspect();
            else if (act === 'duplicate')
                I.duplicateSelection();
            else if (act === 'delete')
                I.removeSelection();
        });
        kernel.provide('ui.canvas', {});
    }
});
