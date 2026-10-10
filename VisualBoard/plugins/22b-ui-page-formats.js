"use strict";
/** TS-016: strictly typed UI adapter, preserves classic-script behavior and ABI. */
/* =====================================================================
 * plugins/22b-ui-page-formats.js
 * ---------------------------------------------------------------------
 * Sub-painel "Page Formats" no sidebar esquerdo (abaixo da Asset Library).
 *
 * Lista todos os PanelSets disponíveis como miniaturas clicáveis.
 *  - Clique numa miniatura → cria uma instância no centro da câmera.
 *  - Botão [+]              → abre o modal de import de SVG.
 *  - Botão direito          → menu: Place / Rename / Delete.
 *
 * Fornece: ui.pageFormats
 * ===================================================================== */
definePlugin({
    id: 'ui.pageFormats',
    version: '1.0.0',
    needs: ['utils', 'state', 'panelSets', 'mangaPage', 'camera', 'ui.dialogs'],
    provides: ['ui.pageFormats'],
    uses: ['contextMenu'],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'panelSets': '^1.0.0', 'mangaPage': '^1.0.0', 'camera': '^1.0.0', 'ui.dialogs': '^1.0.0', 'contextMenu': '^1.0.0' },
    contractVersions: { 'ui.pageFormats': '1.0.0' },
    setup: async function (kernel) {
        const S = (await kernel.require('state')).data;
        const PS = await kernel.require('panelSets');
        const MP = await kernel.require('mangaPage');
        const cam = await kernel.require('camera');
        const D = await kernel.require('ui.dialogs');
        const grid = document.getElementById('page-formats');
        const empty = document.getElementById('pf-empty');
        const addBtn = document.getElementById('pf-add-btn');
        if (!grid || !addBtn) {
            kernel.log.warn('[ui.pageFormats] DOM ausente — verifique #page-formats / #pf-add-btn');
            return;
        }
        /* ---------------- Place instance ---------------- */
        async function placeInstance(ps) {
            try {
                const inst = await MP.addToBoard(ps.id, cam.data.x, cam.data.y);
                if (inst) {
                    D.toast('Page "' + ps.name + '" placed.', 'ok');
                }
                else {
                    D.toast('Could not place page.', 'error');
                }
            }
            catch (e) {
                kernel.log.error('placeInstance failed', e);
                D.toast('Could not place page.', 'error');
            }
        }
        /* ---------------- Build one thumbnail ---------------- */
        function buildItem(ps) {
            const item = document.createElement('div');
            item.className = 'pf-item';
            item.dataset.panelSetId = ps.id;
            item.title = ps.name + ' · ' + ps.panels.length +
                ' panel' + (ps.panels.length === 1 ? '' : 's') +
                '\nClick to place on canvas · Right-click for more';
            const thumb = document.createElement('div');
            thumb.className = 'pf-thumb';
            thumb.innerHTML = PS.thumbSvg(ps, null, 72);
            item.appendChild(thumb);
            const label = document.createElement('div');
            label.className = 'pf-label';
            label.textContent = ps.name || '';
            item.appendChild(label);
            // Click → place on canvas
            item.addEventListener('click', function (e) {
                if (e.button !== 0)
                    return;
                placeInstance(ps);
            });
            // Right-click → context menu
            item.addEventListener('contextmenu', function (e) {
                e.preventDefault();
                e.stopPropagation();
                openItemMenu(ps, e.clientX, e.clientY);
            });
            return item;
        }
        /* ---------------- Render ---------------- */
        function render() {
            const list = PS.list() || [];
            grid.innerHTML = '';
            if (!list.length) {
                empty.hidden = false;
                return;
            }
            empty.hidden = true;
            // Ordena alfabeticamente para consistência visual
            list.slice().sort(function (a, b) {
                return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true });
            }).forEach(function (ps) {
                grid.appendChild(buildItem(ps));
            });
        }
        /* ---------------- [+] Import ---------------- */
        addBtn.addEventListener('click', async function () {
            try {
                const ps = await PS.promptImport();
                if (!ps)
                    return;
                // Apenas adiciona à biblioteca; o usuário clica na miniatura para colocar
                render();
                D.toast('Format "' + ps.name + '" added to library.', 'ok');
            }
            catch (e) {
                kernel.log.error('promptImport failed', e);
            }
        });
        /* ---------------- Context menu ---------------- */
        async function openItemMenu(ps, x, y) {
            let cm = null;
            if (kernel.has('contextMenu')) {
                try {
                    cm = await kernel.require('contextMenu');
                }
                catch (e) {
                    cm = null;
                }
            }
            if (!cm || typeof cm.show !== 'function')
                return;
            cm.show(x, y, [
                {
                    icon: '📄',
                    label: 'Place on canvas',
                    action: function () { placeInstance(ps); }
                },
                {
                    icon: '⬇️',
                    label: 'Export original SVG',
                    action: function () {
                        const saved = PS.downloadSvg(ps.id);
                        if (!saved)
                            D.toast('SVG source is unavailable.', 'error');
                    }
                },
                {
                    icon: '✏️',
                    label: 'Rename…',
                    action: async function () {
                        const name = await D.prompt({
                            title: 'Rename page format',
                            message: 'Choose a new name for "' + ps.name + '".',
                            input: ps.name,
                            confirmText: 'Rename'
                        });
                        if (name && name !== ps.name) {
                            PS.rename(ps.id, name);
                            render();
                        }
                    }
                },
                { sep: true },
                {
                    icon: '🗑',
                    label: 'Delete format',
                    danger: true,
                    action: async function () {
                        // Conta instâncias que usam este PanelSet, em qualquer board
                        let count = 0;
                        for (let bi = 0; bi < S.boards.length; bi++) {
                            const b = S.boards[bi];
                            for (let ii = 0; ii < b.instances.length; ii++) {
                                const i = b.instances[ii];
                                if (i.type === 'manga-page' && i.panelSetId === ps.id)
                                    count++;
                            }
                        }
                        const msg = count
                            ? 'Delete format "' + ps.name + '"?\n\n' +
                                count + ' page' + (count === 1 ? '' : 's') +
                                ' on the canvas use' + (count === 1 ? 's' : '') +
                                ' it. Those pages will be removed too.'
                            : 'Delete format "' + ps.name + '"?';
                        const ok = await D.confirm({
                            title: 'Delete page format',
                            message: msg,
                            danger: true
                        });
                        if (!ok)
                            return;
                        // Remove instâncias dependentes
                        for (let bi = 0; bi < S.boards.length; bi++) {
                            const b = S.boards[bi];
                            b.instances = b.instances.filter(function (i) {
                                return !(i.type === 'manga-page' && i.panelSetId === ps.id);
                            });
                        }
                        // Limpa seleção de instâncias removidas
                        Array.from(S.selection).forEach(function (id) {
                            let stillExists = false;
                            for (let bi = 0; bi < S.boards.length; bi++) {
                                if (S.boards[bi].instances.some(function (i) { return i.id === id; })) {
                                    stillExists = true;
                                    break;
                                }
                            }
                            if (!stillExists)
                                S.selection.delete(id);
                        });
                        PS.remove(ps.id);
                        kernel.emit('instances:changed');
                        kernel.emit('selection:changed');
                        kernel.emit('state:changed');
                        render();
                    }
                }
            ]);
        }
        /* ---------------- Wiring ---------------- */
        kernel.provide('ui.pageFormats', { render: render });
        kernel.on('panelSets:changed', render);
        kernel.on('state:changed', render);
        render();
    }
});
