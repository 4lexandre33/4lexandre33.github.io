"use strict";
/** TS-016: strictly typed UI adapter, preserves classic-script behavior and ABI. */
definePlugin({
    id: 'debug',
    version: '1.0.0',
    needs: ['state', 'camera'],
    provides: ['debug'],
    uses: [],
    accepts: { 'state': '^1.0.0', 'camera': '^1.0.0' },
    contractVersions: { 'debug': '1.0.0' },
    setup: async function (kernel) {
        const S = await kernel.require('state');
        const cam = await kernel.require('camera');
        const panel = document.getElementById('debug-panel');
        function render() {
            if (!S.data.ui.debug) {
                panel.hidden = true;
                return;
            }
            panel.hidden = false;
            const b = S.getCurrentBoard();
            let sel = 'none';
            if (S.data.selection.size === 1)
                sel = Array.from(S.data.selection)[0];
            else if (S.data.selection.size > 1)
                sel = S.data.selection.size + ' selected';
            panel.replaceChildren();
            function row(label, value) {
                panel.append(document.createTextNode(label + ' '));
                const bold = document.createElement('b');
                bold.textContent = String(value);
                panel.appendChild(bold);
                panel.appendChild(document.createElement('br'));
            }
            row('cam.x', cam.data.x.toFixed(1));
            row('cam.y', cam.data.y.toFixed(1));
            row('zoom', cam.data.zoom.toFixed(3));
            row('assets', S.data.assets.length);
            row('boards', S.data.boards.length);
            row('board', b ? b.name : '—');
            row('items', b ? b.instances.length : 0);
            row('sel', sel);
        }
        kernel.provide('debug', { render });
        kernel.on('state:changed', render);
        kernel.on('camera:changed', render);
        kernel.on('selection:changed', render);
    }
});
