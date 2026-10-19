"use strict";
/** TS-016: typed UI/inspector/app plugin with unchanged legacy runtime structure. */
/* =====================================================================
 * plugins/25-context-menu.js
 * Menu de contexto no botão direito.
 *
 * FASE D:
 *   - Menu específico de PAINEL quando o botão direito cai sobre
 *     um .manga-panel de uma manga-page.
 *     Ações: Enter panel edit mode · Add image to this panel ·
 *             Clear this panel · Show page menu…
 * ===================================================================== */
definePlugin({
    id: 'context-menu',
    version: '1.5.0',
    needs: ['state', 'camera', 'boards', 'instances', 'ui.dialogs'],
    provides: ['contextMenu'],
    uses: ['mangaPage', 'mangaEdit', 'mangaExport', 'utils', 'assets', 'history', 'panelTemplates'],
    accepts: { 'state': '^1.0.0', 'camera': '^1.0.0', 'boards': '^1.0.0', 'instances': '^1.0.0', 'ui.dialogs': '^1.0.0', 'mangaPage': '^1.0.0', 'mangaEdit': '^1.0.0', 'mangaExport': '^2.0.0', 'utils': '^1.0.0', 'assets': '^1.0.0', 'history': '^1.0.0', 'panelTemplates': '^1.0.0' },
    contractVersions: { 'contextMenu': '1.0.0' },
    setup: async function (kernel) {
        const stateApi = await kernel.require('state');
        const S = stateApi.data; // S = state.data
        const cam = await kernel.require('camera');
        const B = await kernel.require('boards');
        const I = await kernel.require('instances');
        const D = await kernel.require('ui.dialogs');
        let MP = null;
        let ME = null;
        let MX = null;
        if (kernel.has('mangaPage'))
            kernel.require('mangaPage').then(function (m) { MP = m; });
        if (kernel.has('mangaEdit'))
            kernel.require('mangaEdit').then(function (m) { ME = m; });
        if (kernel.has('mangaExport'))
            kernel.require('mangaExport').then(function (m) { MX = m; });
        const viewport = document.getElementById('viewport');
        const menu = document.createElement('div');
        menu.id = 'context-menu';
        menu.hidden = true;
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Context actions');
        document.body.appendChild(menu);
        let previousFocus = null;
        function close(restoreFocus) {
            if (menu.hidden)
                return;
            menu.hidden = true;
            if (restoreFocus !== false && previousFocus?.isConnected)
                previousFocus.focus();
            previousFocus = null;
        }
        function show(x, y, items) {
            if (menu.hidden)
                previousFocus = document.activeElement;
            menu.innerHTML = '';
            for (const item of items) {
                if (item.sep) {
                    const s = document.createElement('div');
                    s.className = 'cm-sep';
                    s.setAttribute('role', 'separator');
                    menu.appendChild(s);
                    continue;
                }
                const el = document.createElement('button');
                el.type = 'button';
                el.className = 'cm-item' + (item.danger ? ' danger' : '');
                el.setAttribute('role', 'menuitem');
                el.tabIndex = -1;
                if (item.disabled)
                    el.disabled = true;
                const ic = document.createElement('span');
                ic.className = 'cm-icon';
                ic.textContent = item.icon || '';
                el.appendChild(ic);
                const lb = document.createElement('span');
                lb.className = 'cm-label';
                lb.textContent = item.label;
                el.appendChild(lb);
                if (item.shortcut) {
                    const sc = document.createElement('span');
                    sc.className = 'cm-shortcut';
                    sc.textContent = item.shortcut;
                    el.appendChild(sc);
                }
                el.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    close();
                    try {
                        item.action?.();
                    }
                    catch (e) {
                        kernel.log.error('context menu action failed', e);
                    }
                });
                menu.appendChild(el);
            }
            menu.hidden = false;
            const rect = menu.getBoundingClientRect();
            const px = Math.min(x, window.innerWidth - rect.width - 8);
            const py = Math.min(y, window.innerHeight - rect.height - 8);
            menu.style.left = Math.max(8, px) + 'px';
            menu.style.top = Math.max(8, py) + 'px';
            const first = menu.querySelector('button:not([disabled])');
            if (first)
                first.focus();
        }
        menu.addEventListener('keydown', function (e) {
            const buttons = Array.from(menu.querySelectorAll('button:not([disabled])'));
            if (!buttons.length)
                return;
            const current = buttons.indexOf(document.activeElement);
            let next = -1;
            if (e.key === 'ArrowDown')
                next = (current + 1) % buttons.length;
            else if (e.key === 'ArrowUp')
                next = (current - 1 + buttons.length) % buttons.length;
            else if (e.key === 'Home')
                next = 0;
            else if (e.key === 'End')
                next = buttons.length - 1;
            else if (e.key === 'Tab') {
                e.preventDefault();
                close();
                return;
            }
            else if (e.key === 'Escape') {
                e.preventDefault();
                close();
                return;
            }
            if (next >= 0) {
                e.preventDefault();
                e.stopPropagation();
                buttons[next].focus();
            }
        });
        /* ---------------- File picker helper ---------------- */
        async function openFilePickerForPanel(inst, panelId) {
            const utils = await kernel.require('utils');
            const A = await kernel.require('assets');
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.multiple = true;
            input.style.display = 'none';
            document.body.appendChild(input);
            input.addEventListener('change', async function () {
                const files = Array.from(input.files || []);
                if (input.parentNode)
                    input.parentNode.removeChild(input);
                if (!files.length)
                    return;
                let inserted = 0;
                await kernel.call('history', 'transaction', 'menu.importImages', async function () {
                    let baseIdx;
                    if (panelId === '__overlay__') {
                        baseIdx = (inst.overlays || []).length;
                    }
                    else {
                        const p = (inst.panels || []).find(function (x) { return x.id === panelId; });
                        baseIdx = p ? (p.layers || []).length : 0;
                    }
                    let idx = baseIdx;
                    for (const file of files) {
                        if (!utils.isSupportedImageFile(file))
                            continue;
                        try {
                            const asset = await A.createFromFile(file, A.ensureDefaultPackage());
                            await MP.insertLayerAt(inst, panelId, asset.id, idx);
                            idx++;
                            inserted++;
                        }
                        catch (err) {
                            kernel.log.warn('insert from file failed', file.name, err);
                        }
                    }
                });
                kernel.emit('assets:changed');
                kernel.emit('state:changed');
                if (inserted)
                    D.toast(inserted + ' image' + (inserted === 1 ? '' : 's') + ' added.', 'ok');
            });
            input.click();
        }
        /* -------- Canvas vazio -------- */
        function showCanvasMenu(x, y) {
            const cur = B.current();
            const hasParent = cur && cur.parentBoardId;
            const isRoot = cur && cur.id === S.rootBoardId;
            const items = [];
            if (hasParent) {
                items.push({ icon: '←', label: 'Go to parent board', shortcut: 'Esc',
                    action: function () { B.navigateUp(); } });
            }
            if (!isRoot) {
                items.push({ icon: '⌂', label: 'Go to root board',
                    action: function () { B.navigate(S.rootBoardId); } });
            }
            if (items.length)
                items.push({ sep: true });
            items.push({
                icon: '✏️', label: 'Rename this board',
                action: async function () {
                    const c = B.current();
                    if (!c)
                        return;
                    const n = await D.prompt({ title: 'Rename board', input: c.name, confirmText: 'Rename' });
                    if (n)
                        B.rename(c.id, n);
                }
            });
            items.push({
                icon: '📁', label: 'New sub-board here',
                action: async function () {
                    const n = await D.prompt({ title: 'New board', input: 'New Board', confirmText: 'Create' });
                    if (!n)
                        return;
                    const id = B.create(n, S.currentBoardId);
                    await I.addBoard(id, cam.data.x, cam.data.y);
                }
            });
            items.push({
                icon: '📄', label: 'New manga page…',
                action: function () {
                    const btn = document.querySelector('[data-cmd="new-manga-page"]');
                    if (btn)
                        btn.click();
                }
            });
            items.push({
                icon: '📐', label: 'New page from template…',
                action: function () {
                    if (!kernel.has('panelTemplates'))
                        return;
                    kernel.require('panelTemplates').then(function (T) {
                        T.pickAndCreate();
                    });
                }
            });
            if (MX) {
                items.push({ sep: true });
                items.push({
                    icon: '📄',
                    label: 'Export board as PDF…',
                    action: function () { MX.exportWholeBoardAsPdf(); }
                });
            }
            items.push({ sep: true });
            items.push({ icon: '🗂', label: 'Boards…', action: function () { openShellWindow('open-boards'); } });
            items.push({ icon: '🗂', label: 'Catálogo de imagens…', action: function () { openShellWindow('open-catalog'); } });
            items.push({ icon: '⌨', label: 'Console de comandos…', action: function () { openShellWindow('open-console'); } });
            items.push({ icon: '📦', label: 'Pacotes de imagens…', action: function () { openShellWindow('open-packages'); } });
            items.push({ icon: '⚙', label: 'Propriedades…', action: function () { openShellWindow('open-properties'); } });
            items.push({ sep: true });
            items.push({ icon: '📋', label: 'Paste', shortcut: 'Ctrl+V',
                action: function () { I.pasteClipboard(); } });
            items.push({ icon: '⤢', label: 'Fit all', shortcut: 'F',
                action: function () { cam.fitAll(); } });
            show(x, y, items);
        }
        /* Abre as janelas do shell (Propriedades / Boards / Pacotes) pelos mesmos botões do menu "Mais". */
        function openShellWindow(cmd) {
            document.querySelector('#topbar [data-cmd="' + cmd + '"]')?.click();
        }
        /* -------- Manga page -------- */
        function showMangaPageMenu(inst, x, y) {
            if (!S.selection.has(inst.id)) {
                S.selection.clear();
                S.selection.add(inst.id);
                kernel.emit('selection:changed');
            }
            const items = [];
            if (MP) {
                items.push({
                    icon: '✎', label: 'Enter panel edit…',
                    action: async function () {
                        if (!ME) {
                            ME = await kernel.require('mangaEdit');
                        }
                        const ps = MP.getPanelSet(inst);
                        if (!ps || !ps.panels.length)
                            return;
                        const focus = MP.getFocus();
                        const panelId = (focus && focus.instanceId === inst.id && focus.panelId)
                            ? focus.panelId
                            : ps.panels[0].id;
                        ME.enter(inst.id, panelId);
                    }
                });
                items.push({ sep: true });
                items.push({
                    icon: '⧉', label: 'Duplicate page',
                    action: function () { MP.duplicate(inst); }
                });
                items.push({
                    icon: '📐', label: 'Change panel set…',
                    action: function () { MP.promptChangePanelSet(inst); }
                });
                items.push({ sep: true });
                items.push({
                    icon: '🧹', label: 'Clear all layers',
                    danger: true,
                    action: async function () {
                        const ok = await D.confirm({
                            title: 'Clear all layers?',
                            message: 'Remove every layer from every panel and overlay of this manga page.',
                            danger: true
                        });
                        if (!ok)
                            return;
                        const before = await kernel.call('history', 'snapshot');
                        (inst.panels || []).forEach(function (p) { p.layers = []; });
                        inst.overlays = [];
                        await kernel.call('history', 'push', before);
                        kernel.emit('manga-page:changed', { instanceId: inst.id });
                        kernel.emit('state:changed');
                    }
                });
            }
            if (MX) {
                items.push({ sep: true });
                items.push({
                    icon: '🖼',
                    label: 'Export as PNG',
                    action: function () { MX.exportPng(inst, { quality: 3 }); }
                });
                let selectedMangaCount = 0;
                S.selection.forEach(function (id) {
                    for (let bi = 0; bi < S.boards.length; bi++) {
                        const b = S.boards[bi];
                        for (let ii = 0; ii < b.instances.length; ii++) {
                            const x2 = b.instances[ii];
                            if (x2.id === id && x2.type === 'manga-page') {
                                selectedMangaCount++;
                            }
                        }
                    }
                });
                items.push({
                    icon: '📕',
                    label: selectedMangaCount > 1
                        ? 'Export selection as PDF (' + selectedMangaCount + ' pages)…'
                        : 'Export as PDF…',
                    action: function () { MX.exportSelectionAsPdf(); }
                });
            }
            items.push({ sep: true });
            items.push({ icon: '⧉', label: 'Duplicate instance', shortcut: 'Ctrl+D',
                action: function () { I.duplicateSelection(); } });
            items.push({ icon: '⤒', label: 'Bring to front',
                action: function () { I.reorder('front'); } });
            items.push({ icon: '⤓', label: 'Send to back',
                action: function () { I.reorder('back'); } });
            items.push({ sep: true });
            items.push({ icon: '🗑', label: 'Delete', shortcut: 'Del', danger: true,
                action: function () { I.removeSelection(); } });
            items.push({ sep: true });
            items.push({ icon: '⚙', label: 'Propriedades…', action: function () { openShellWindow('open-properties'); } });
            show(x, y, items);
        }
        /* -------- Panel (Fase D) -------- */
        function showPanelMenu(inst, panelId, x, y) {
            // Garante foco + seleção na página
            if (!S.selection.has(inst.id)) {
                S.selection.clear();
                S.selection.add(inst.id);
                kernel.emit('selection:changed');
            }
            MP.setFocus(inst.id, panelId);
            const ps = MP.getPanelSet(inst);
            const panelIdx = ps ? ps.panels.findIndex(function (p) { return p.id === panelId; }) : -1;
            const panelLabel = panelIdx >= 0 ? 'Panel ' + (panelIdx + 1) : panelId;
            const instPanel = (inst.panels || []).find(function (p) { return p.id === panelId; });
            const layerCount = instPanel ? instPanel.layers.length : 0;
            const items = [];
            items.push({
                icon: '✎',
                label: 'Enter panel edit mode',
                action: async function () {
                    if (!ME)
                        ME = await kernel.require('mangaEdit');
                    if (ME)
                        ME.enter(inst.id, panelId);
                }
            });
            items.push({
                icon: '📄',
                label: 'Add image to ' + panelLabel + '…',
                action: function () {
                    openFilePickerForPanel(inst, panelId);
                }
            });
            if (layerCount > 0) {
                items.push({ sep: true });
                items.push({
                    icon: '🧹',
                    label: 'Clear ' + panelLabel + ' (' + layerCount + ' layer' + (layerCount === 1 ? '' : 's') + ')',
                    danger: true,
                    action: async function () {
                        const ok = await D.confirm({
                            title: 'Clear ' + panelLabel + '?',
                            message: 'Remove all ' + layerCount + ' layer(s) from this panel.',
                            danger: true
                        });
                        if (!ok)
                            return;
                        const before = await kernel.call('history', 'snapshot');
                        if (instPanel)
                            instPanel.layers = [];
                        await kernel.call('history', 'push', before);
                        kernel.emit('manga-page:changed', { instanceId: inst.id });
                        kernel.emit('state:changed');
                    }
                });
            }
            items.push({ sep: true });
            items.push({
                icon: '📖',
                label: 'Show page menu…',
                action: function () {
                    showMangaPageMenu(inst, x, y);
                }
            });
            items.push({ sep: true });
            items.push({ icon: '⚙', label: 'Propriedades…', action: function () { openShellWindow('open-properties'); } });
            show(x, y, items);
        }
        /* -------- Instância comum -------- */
        function showInstanceMenu(inst, x, y) {
            const live = stateApi.getInstance(inst.id);
            if (!live)
                return;
            if (!S.selection.has(live.id)) {
                S.selection.clear();
                S.selection.add(live.id);
                kernel.emit('selection:changed');
            }
            if (live.type === 'manga-page' && MP) {
                showMangaPageMenu(live, x, y);
                return;
            }
            const items = [];
            if (inst.type === 'board') {
                items.push({
                    icon: '📂', label: 'Open board',
                    action: function () {
                        if (live.type === 'board' && live.boardId && B.getBoard(live.boardId))
                            B.navigate(live.boardId);
                    }
                });
                items.push({
                    icon: '✏️', label: 'Rename board',
                    action: async function () {
                        const target = B.getBoard(live.boardId);
                        if (!target)
                            return;
                        const n = await D.prompt({ title: 'Rename board', input: target.name, confirmText: 'Rename' });
                        if (n && n !== target.name)
                            B.rename(target.id, n);
                    }
                });
                items.push({ sep: true });
            }
            items.push({ icon: '⧉', label: 'Duplicate', shortcut: 'Ctrl+D',
                action: function () { I.duplicateSelection(); } });
            items.push({ icon: '📄', label: 'Copy', shortcut: 'Ctrl+C',
                action: function () { I.copySelection(); } });
            items.push({ sep: true });
            items.push({ icon: '⤒', label: 'Bring to front', action: function () { I.reorder('front'); } });
            items.push({ icon: '↑', label: 'Bring forward', action: function () { I.reorder('forward'); } });
            items.push({ icon: '↓', label: 'Send backward', action: function () { I.reorder('backward'); } });
            items.push({ icon: '⤓', label: 'Send to back', action: function () { I.reorder('back'); } });
            if (inst.type !== 'board') {
                items.push({ sep: true });
                items.push({ icon: '⟳', label: 'Rotate 90°', action: function () { I.rotateSelection(); } });
                items.push({ icon: '⇔', label: 'Restore aspect ratio', action: function () { I.restoreAspect(); } });
            }
            items.push({ sep: true });
            items.push({
                icon: '🗑',
                label: inst.type === 'board' ? 'Delete board link' : 'Delete',
                shortcut: 'Del', danger: true,
                action: function () { I.removeSelection(); }
            });
            show(x, y, items);
        }
        /* -------- Handler -------- */
        viewport.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            // 1) Painel de uma manga-page (Fase D)
            const panelEl = e.target.closest('.manga-panel');
            if (panelEl && MP) {
                const pageEl = panelEl.closest('.manga-page');
                if (pageEl) {
                    const inst = stateApi.getInstance(pageEl.dataset.id);
                    if (inst && inst.type === 'manga-page') {
                        showPanelMenu(inst, panelEl.dataset.panelId, e.clientX, e.clientY);
                        return;
                    }
                }
            }
            // 2) Instância qualquer
            const instEl = e.target.closest('.instance');
            if (instEl) {
                const inst = stateApi.getInstance(instEl.dataset.id);
                if (inst) {
                    showInstanceMenu(inst, e.clientX, e.clientY);
                    return;
                }
            }
            // 3) Canvas vazio
            showCanvasMenu(e.clientX, e.clientY);
        });
        window.addEventListener('pointerdown', function (e) {
            if (!menu.hidden && !menu.contains(e.target))
                close();
        }, true);
        window.addEventListener('blur', () => close());
        window.addEventListener('scroll', () => close(), true);
        window.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !menu.hidden) {
                e.preventDefault();
                e.stopPropagation();
                close();
            }
        }, true);
        kernel.provide('contextMenu', { show: show, close: close });
        kernel.on('board:navigated', () => close());
    }
});
