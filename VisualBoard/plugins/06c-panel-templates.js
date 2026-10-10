"use strict";
/* =====================================================================
 * plugins/06c-panel-templates.js
 * ---------------------------------------------------------------------
 * Templates prontos de páginas de mangá.
 * Cada template define painéis em coordenadas de 600×850.
 * Ao escolher, sintetiza um SVG source (para persistência e .svg/) e
 * cria o PanelSet + MangaPage no centro da câmera.
 *
 * Fornece: panelTemplates
 * ===================================================================== */
definePlugin({
    id: 'panel-templates',
    version: '1.0.0',
    needs: ['utils', 'state', 'panelSets', 'mangaPage', 'camera', 'history'],
    provides: ['panelTemplates'],
    uses: [],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'panelSets': '^1.0.0', 'mangaPage': '^1.0.0', 'camera': '^1.0.0', 'history': '^1.0.0' },
    contractVersions: { 'panelTemplates': '1.0.0' },
    setup: async function (kernel) {
        const S = (await kernel.require('state')).data;
        const PS = await kernel.require('panelSets');
        const MP = await kernel.require('mangaPage');
        const cam = await kernel.require('camera');
        const PAGE_W = 600;
        const PAGE_H = 850;
        /* ---------------- Template definitions ---------------- */
        // Painéis em arrays de [x, y] para economizar espaço.
        const TEMPLATES = [
            {
                id: 'splash',
                name: 'Splash page',
                desc: 'One full-page panel.',
                panels: [[[0, 0], [600, 0], [600, 850], [0, 850]]]
            },
            {
                id: 'two-rows',
                name: 'Two rows',
                desc: 'Two stacked horizontal panels.',
                panels: [
                    [[10, 10], [590, 10], [590, 420], [10, 420]],
                    [[10, 430], [590, 430], [590, 840], [10, 840]]
                ]
            },
            {
                id: 'two-cols',
                name: 'Two columns',
                desc: 'Two side-by-side vertical panels.',
                panels: [
                    [[10, 10], [295, 10], [295, 840], [10, 840]],
                    [[305, 10], [590, 10], [590, 840], [305, 840]]
                ]
            },
            {
                id: 'three-cols',
                name: 'Three columns',
                desc: 'Three vertical panels.',
                panels: [
                    [[10, 10], [196, 10], [196, 840], [10, 840]],
                    [[207, 10], [393, 10], [393, 840], [207, 840]],
                    [[404, 10], [590, 10], [590, 840], [404, 840]]
                ]
            },
            {
                id: 'four-grid',
                name: '2×2 grid',
                desc: 'Four equal panels.',
                panels: [
                    [[10, 10], [295, 10], [295, 420], [10, 420]],
                    [[305, 10], [590, 10], [590, 420], [305, 420]],
                    [[10, 430], [295, 430], [295, 840], [10, 840]],
                    [[305, 430], [590, 430], [590, 840], [305, 840]]
                ]
            },
            {
                id: 'six-grid',
                name: '3×2 grid',
                desc: 'Six equal panels.',
                panels: [
                    [[10, 10], [295, 10], [295, 275], [10, 275]],
                    [[305, 10], [590, 10], [590, 275], [305, 275]],
                    [[10, 285], [295, 285], [295, 560], [10, 560]],
                    [[305, 285], [590, 285], [590, 560], [305, 560]],
                    [[10, 570], [295, 570], [295, 840], [10, 840]],
                    [[305, 570], [590, 570], [590, 840], [305, 840]]
                ]
            },
            {
                id: 'classic-5',
                name: 'Classic 5-panel',
                desc: 'Wide top, four below.',
                panels: [
                    [[15, 15], [585, 15], [585, 395], [15, 395]],
                    [[15, 410], [193, 410], [193, 835], [15, 835]],
                    [[211, 410], [389, 410], [389, 605], [211, 605]],
                    [[211, 620], [389, 620], [389, 835], [211, 835]],
                    [[407, 410], [585, 410], [585, 835], [407, 835]]
                ]
            },
            {
                id: 'splash-top',
                name: 'Splash top + 2',
                desc: 'Wide top panel, two below.',
                panels: [
                    [[10, 10], [590, 10], [590, 395], [10, 395]],
                    [[10, 410], [295, 410], [295, 840], [10, 840]],
                    [[305, 410], [590, 410], [590, 840], [305, 840]]
                ]
            },
            {
                id: 'three-tiers',
                name: 'Three tiers',
                desc: 'Three horizontal bands.',
                panels: [
                    [[10, 10], [590, 10], [590, 270], [10, 270]],
                    [[10, 280], [590, 280], [590, 570], [10, 570]],
                    [[10, 580], [590, 580], [590, 840], [10, 840]]
                ]
            },
            {
                id: 'big-left',
                name: 'Big left',
                desc: 'Large left panel, three on the right.',
                panels: [
                    [[10, 10], [400, 10], [400, 840], [10, 840]],
                    [[410, 10], [590, 10], [590, 275], [410, 275]],
                    [[410, 285], [590, 285], [590, 560], [410, 560]],
                    [[410, 570], [590, 570], [590, 840], [410, 840]]
                ]
            }
        ];
        /* ---------------- Builders ---------------- */
        function svgSourceForPanels(panels) {
            const paths = panels.map(function (pts) {
                const d = 'M' + pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' L') + ' Z';
                return '<path d="' + d + '"/>';
            }).join('');
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
                PAGE_W + ' ' + PAGE_H + '">' + paths + '</svg>';
        }
        function buildParsed(tpl) {
            const panels = tpl.panels.map(function (pts, i) {
                return {
                    id: 'p' + (i + 1),
                    points: pts.map(function (p) { return { x: p[0], y: p[1] }; })
                };
            });
            return {
                width: PAGE_W,
                height: PAGE_H,
                panels: panels,
                svgSource: svgSourceForPanels(tpl.panels)
            };
        }
        function thumbForTemplate(tpl) {
            // Reaproveita o helper do panelSets (renderização genérica por polígonos)
            const pseudo = {
                width: PAGE_W,
                height: PAGE_H,
                panels: tpl.panels.map(function (pts, i) {
                    return { id: 'p' + (i + 1), points: pts.map(function (p) { return { x: p[0], y: p[1] }; }) };
                })
            };
            return PS.thumbSvg(pseudo, null, 100);
        }
        /* ---------------- Create ---------------- */
        async function createFromTemplate(tpl) {
            return kernel.call('history', 'transaction', 'template.create', async function () {
                const parsed = buildParsed(tpl);
                const ps = PS.create(parsed, tpl.name);
                const inst = await MP.addToBoard(ps.id, cam.data.x, cam.data.y);
                if (!inst)
                    throw new Error('Could not create manga page');
                kernel.emit('toast', { message: 'Page "' + tpl.name + '" created.', kind: 'ok' });
                return { panelSet: ps, instance: inst };
            });
        }
        /* ---------------- Modal picker ---------------- */
        function promptPick() {
            return new Promise(function (resolve) {
                const modal = document.createElement('div');
                modal.className = 'modal';
                const backdrop = document.createElement('div');
                backdrop.className = 'modal-backdrop';
                modal.appendChild(backdrop);
                const dlg = document.createElement('div');
                dlg.className = 'dialog tpl-dialog';
                dlg.setAttribute('role', 'dialog');
                const h = document.createElement('h3');
                h.textContent = 'New manga page from template';
                dlg.appendChild(h);
                const p = document.createElement('p');
                p.textContent = 'Pick a layout. It is instantiated as a PanelSet ' +
                    'and placed at the center of the canvas.';
                dlg.appendChild(p);
                const grid = document.createElement('div');
                grid.className = 'tpl-grid';
                TEMPLATES.forEach(function (tpl) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'tpl-item';
                    const thumb = document.createElement('div');
                    thumb.className = 'tpl-thumb';
                    thumb.innerHTML = thumbForTemplate(tpl);
                    btn.appendChild(thumb);
                    const meta = document.createElement('div');
                    meta.className = 'tpl-meta';
                    const nameEl = document.createElement('div');
                    nameEl.className = 'tpl-name';
                    nameEl.textContent = tpl.name;
                    meta.appendChild(nameEl);
                    const descEl = document.createElement('div');
                    descEl.className = 'tpl-desc';
                    descEl.textContent = tpl.desc + ' · ' + tpl.panels.length +
                        ' panel' + (tpl.panels.length === 1 ? '' : 's');
                    meta.appendChild(descEl);
                    btn.appendChild(meta);
                    btn.addEventListener('click', function () {
                        modal.remove();
                        resolve(tpl);
                    });
                    grid.appendChild(btn);
                });
                dlg.appendChild(grid);
                const actions = document.createElement('div');
                actions.className = 'dialog-actions';
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'btn';
                cancelBtn.type = 'button';
                cancelBtn.textContent = 'Cancel';
                cancelBtn.addEventListener('click', function () {
                    modal.remove();
                    resolve(null);
                });
                actions.appendChild(cancelBtn);
                dlg.appendChild(actions);
                backdrop.addEventListener('click', function () {
                    modal.remove();
                    resolve(null);
                });
                modal.appendChild(dlg);
                document.body.appendChild(modal);
            });
        }
        /* ---------------- Flow from UI ---------------- */
        async function pickAndCreate() {
            const tpl = await promptPick();
            if (!tpl)
                return null;
            return await createFromTemplate(tpl);
        }
        kernel.provide('panelTemplates', {
            list: function () { return TEMPLATES.slice(); },
            createFromTemplate: createFromTemplate,
            promptPick: promptPick,
            pickAndCreate: pickAndCreate
        });
    }
});
