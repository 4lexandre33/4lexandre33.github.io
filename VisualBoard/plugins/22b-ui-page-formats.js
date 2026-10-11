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
    needs: ['utils', 'state', 'panelSets', 'mangaPage', 'camera', 'ui.dialogs', 'panelTemplates'],
    provides: ['ui.pageFormats'],
    uses: ['contextMenu'],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'panelSets': '^1.0.0', 'mangaPage': '^1.0.0', 'camera': '^1.0.0', 'ui.dialogs': '^1.0.0', 'panelTemplates': '^1.0.0', 'contextMenu': '^1.0.0' },
    contractVersions: { 'ui.pageFormats': '1.0.0' },
    setup: async function (kernel) {
        const S = (await kernel.require('state')).data;
        const PS = await kernel.require('panelSets');
        const MP = await kernel.require('mangaPage');
        const cam = await kernel.require('camera');
        const D = await kernel.require('ui.dialogs');
        const PT = await kernel.require('panelTemplates');
        const grid = document.getElementById('page-formats');
        const empty = document.getElementById('pf-empty');
        const addBtn = document.getElementById('pf-add-btn');
        if (!grid || !addBtn) {
            kernel.log.warn('[ui.pageFormats] DOM ausente — verifique #page-formats / #pf-add-btn');
            return;
        }
        let tab = 'saved';
        let activeLayoutId = null;
        const browser = document.createElement('div');
        browser.className = 'pf-browser';
        const tabs = document.createElement('div');
        tabs.className = 'pf-tabs';
        tabs.setAttribute('role', 'group');
        tabs.setAttribute('aria-label', 'Page format categories');
        browser.appendChild(tabs);
        const tools = document.createElement('div');
        tools.className = 'pf-layout-tools';
        const search = document.createElement('input');
        search.type = 'search';
        search.placeholder = 'Search layouts';
        search.setAttribute('aria-label', 'Search page layouts');
        search.className = 'pf-layout-search';
        tools.appendChild(search);
        const sizes = document.createElement('div');
        sizes.className = 'pf-layout-sizes';
        function dimensionInput(label, id, value) {
            const wrap = document.createElement('label');
            wrap.textContent = label + ' ';
            const input = document.createElement('input');
            input.id = id;
            input.type = 'number';
            input.min = '128';
            input.max = '4096';
            input.step = '1';
            input.value = String(value);
            input.setAttribute('aria-label', label + ' in page units');
            wrap.appendChild(input);
            sizes.appendChild(wrap);
            return input;
        }
        const widthInput = dimensionInput('W', 'pf-layout-width', 600);
        const heightInput = dimensionInput('H', 'pf-layout-height', 850);
        tools.appendChild(sizes);
        browser.appendChild(tools);
        const preview = document.createElement('div');
        preview.className = 'pf-layout-preview';
        preview.setAttribute('aria-live', 'polite');
        grid.parentNode.insertBefore(browser, grid);
        grid.parentNode.insertBefore(preview, grid);
        const categories = [
            { id: 'saved', label: 'Saved' },
            { id: 'vertical', label: 'Vertical (41)' },
            { id: 'horizontal', label: 'Horizontal (28)' }
        ];
        for (const entry of categories) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'pf-tab';
            button.textContent = entry.label;
            button.dataset.tab = entry.id;
            button.addEventListener('click', () => {
                tab = entry.id;
                activeLayoutId = null;
                search.value = '';
                if (tab === 'vertical') {
                    widthInput.value = '600';
                    heightInput.value = '850';
                }
                if (tab === 'horizontal') {
                    widthInput.value = '850';
                    heightInput.value = '600';
                }
                render();
            });
            tabs.appendChild(button);
        }
        function dimensions() {
            const width = Number(widthInput.value), height = Number(heightInput.value);
            if (!Number.isInteger(width) || !Number.isInteger(height) ||
                width < 128 || height < 128 || width > 4096 || height > 4096)
                return null;
            return { width, height };
        }
        function previewFor(tpl, dim) {
            const dw = tpl.width ?? 600, dh = tpl.height ?? 850;
            return PS.thumbSvg({
                width: dim.width, height: dim.height,
                panels: tpl.panels.map((points, i) => ({
                    id: 'p' + (i + 1),
                    points: points.map(p => ({ x: p[0] * dim.width / dw, y: p[1] * dim.height / dh }))
                }))
            }, null, 155);
        }
        function selectedTemplate(list) {
            return list.find(t => t.id === activeLayoutId) || list[0] || null;
        }
        async function placeTemplate(tpl) {
            const dim = dimensions();
            if (!dim) {
                D.toast('Width and height must be 128–4096.', 'error');
                return;
            }
            try {
                await PT.createFromTemplate(tpl, dim);
            }
            catch (error) {
                kernel.log.error('[ui.pageFormats] layout creation failed', error);
                D.toast('Could not create page from layout.', 'error');
            }
        }
        search.addEventListener('input', () => render());
        widthInput.addEventListener('input', () => renderPreview());
        heightInput.addEventListener('input', () => renderPreview());
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
        function filteredLayouts() {
            const q = search.value.trim().toLowerCase();
            return PT.list().filter(t => t.orientation === tab &&
                (!q || (t.name + ' ' + t.desc + ' ' + t.id).toLowerCase().includes(q)));
        }
        function renderPreview() {
            preview.replaceChildren();
            if (tab === 'saved')
                return;
            const list = filteredLayouts(), selected = selectedTemplate(list);
            if (!selected)
                return;
            activeLayoutId = selected.id;
            const dims = dimensions();
            if (!dims) {
                const problem = document.createElement('p');
                problem.className = 'pf-dimension-error';
                problem.textContent = 'Dimensions must be whole numbers between 128 and 4096.';
                preview.appendChild(problem);
                return;
            }
            const picture = document.createElement('div');
            picture.className = 'pf-preview-image';
            picture.appendChild(document.importNode(new DOMParser().parseFromString(previewFor(selected, dims), 'image/svg+xml').documentElement, true));
            preview.appendChild(picture);
            const info = document.createElement('div');
            info.className = 'pf-preview-meta';
            const name = document.createElement('strong');
            name.textContent = selected.name;
            const sub = document.createElement('span');
            sub.textContent = selected.panels.length + ' panels · ' + dims.width + '×' + dims.height;
            info.appendChild(name);
            info.appendChild(sub);
            const place = document.createElement('button');
            place.type = 'button';
            place.className = 'btn pf-preview-place';
            place.textContent = 'Place page';
            place.addEventListener('click', () => { void placeTemplate(selected); });
            info.appendChild(place);
            preview.appendChild(info);
        }
        function render() {
            grid.classList.toggle('pf-template-grid', tab !== 'saved');
            for (const el of tabs.querySelectorAll('button')) {
                const selected = el.dataset.tab === tab;
                el.classList.toggle('active', selected);
                el.setAttribute('aria-pressed', String(selected));
            }
            grid.replaceChildren();
            if (tab === 'saved') {
                tools.hidden = true;
                preview.hidden = true;
                const list = PS.list() || [];
                empty.hidden = list.length > 0;
                if (!list.length)
                    return;
                list.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true })).forEach(ps => grid.appendChild(buildItem(ps)));
                return;
            }
            tools.hidden = false;
            preview.hidden = false;
            const list = filteredLayouts();
            empty.hidden = true;
            const choice = selectedTemplate(list);
            activeLayoutId = choice?.id ?? null;
            if (!list.length) {
                const none = document.createElement('p');
                none.className = 'pf-dimension-error';
                none.textContent = 'No layouts match your search.';
                grid.appendChild(none);
            }
            for (const tpl of list) {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'pf-item pf-layout-item';
                item.setAttribute('aria-label', tpl.name + ' · ' + tpl.panels.length + ' panels');
                item.setAttribute('aria-pressed', String(tpl.id === activeLayoutId));
                if (tpl.id === activeLayoutId)
                    item.classList.add('selected');
                const picture = document.createElement('div');
                picture.className = 'pf-thumb';
                picture.appendChild(document.importNode(new DOMParser().parseFromString(previewFor(tpl, { width: tpl.width ?? 600, height: tpl.height ?? 850 }), 'image/svg+xml').documentElement, true));
                const caption = document.createElement('div');
                caption.className = 'pf-label';
                caption.textContent = tpl.name;
                item.appendChild(picture);
                item.appendChild(caption);
                item.addEventListener('click', () => { activeLayoutId = tpl.id; render(); });
                grid.appendChild(item);
            }
            renderPreview();
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
