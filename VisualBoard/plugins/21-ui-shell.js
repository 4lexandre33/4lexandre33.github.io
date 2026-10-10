"use strict";
/** TS-016: strictly typed UI adapter, preserves classic-script behavior and ABI. */
/* =====================================================================
 * plugins/21-ui-shell.js
 * ---------------------------------------------------------------------
 * Renderiza:
 *   - Sidebar Navigator (trilha + Back + Rename) — como antes
 *   - Top breadcrumb flutuante — NOVO (v1.6.0)
 *
 * O top breadcrumb só aparece quando o usuário está em um sub-board
 * (path > 1), então não ocupa espaço de canvas no root board.
 * ===================================================================== */
definePlugin({
    id: 'ui.shell',
    version: '1.7.0',
    needs: ['state', 'camera', 'boards', 'history', 'exportImport', 'ui.dialogs'],
    provides: ['ui.shell'],
    uses: ['assets', 'panelSets', 'mangaPage', 'panelTemplates', 'instances'],
    accepts: { 'state': '^1.0.0', 'camera': '^1.0.0', 'boards': '^1.0.0', 'history': '^1.0.0', 'exportImport': '^1.0.0', 'ui.dialogs': '^1.0.0', 'assets': '^1.0.0', 'panelSets': '^1.0.0', 'mangaPage': '^1.0.0', 'panelTemplates': '^1.0.0', 'instances': '^1.0.0' },
    contractVersions: { 'ui.shell': '1.0.0' },
    setup: async function (kernel) {
        const S = await kernel.require('state');
        const cam = await kernel.require('camera');
        const B = await kernel.require('boards');
        const H = await kernel.require('history');
        const EI = await kernel.require('exportImport');
        const D = await kernel.require('ui.dialogs');
        const fileImages = document.getElementById('file-input-images');
        const fileProject = document.getElementById('file-input-project');
        const projectName = document.getElementById('project-name');
        const left = document.getElementById('left');
        const right = document.getElementById('right');
        const navTrail = document.getElementById('nav-trail');
        const navBack = document.getElementById('nav-back');
        const navRename = document.getElementById('nav-rename');
        const topBreadcrumb = document.getElementById('top-breadcrumb');
        const tbTrail = document.getElementById('tb-trail');
        const tbBack = document.getElementById('tb-back');
        const tbRename = document.getElementById('tb-rename');
        /* ---------------- Import images ---------------- */
        async function doImportImages() {
            const A = await kernel.require('assets');
            fileImages.click();
            fileImages.onchange = async function () {
                if (fileImages.files && fileImages.files.length) {
                    await A.importFiles(fileImages.files, A.ensureDefaultPackage());
                }
                fileImages.value = '';
            };
        }
        /* ---------------- New manga page ---------------- */
        async function doNewMangaPage() {
            if (!kernel.has('panelSets') || !kernel.has('mangaPage')) {
                D.toast('Manga page system not loaded.', 'error');
                return;
            }
            const PS = await kernel.require('panelSets');
            const MP = await kernel.require('mangaPage');
            const ps = await PS.promptImport();
            if (!ps)
                return;
            await MP.addToBoard(ps.id, cam.data.x, cam.data.y);
            D.toast('Page "' + ps.name + '" created.', 'ok');
        }
        /* ---------------- New from template ---------------- */
        async function doNewFromTemplate() {
            if (!kernel.has('panelTemplates')) {
                D.toast('Templates not available.', 'error');
                return;
            }
            const T = await kernel.require('panelTemplates');
            await T.pickAndCreate();
        }
        /* ---------------- Topbar commands ---------------- */
        const sideButtons = {
            left: document.querySelector('[data-cmd="toggle-left"]'),
            right: document.querySelector('[data-cmd="toggle-right"]')
        };
        function updateSidebarAria() {
            for (const key of ['left', 'right']) {
                const el = sideButtons[key], panel = key === 'left' ? left : right;
                if (el) {
                    el.setAttribute('aria-expanded', String(!panel.classList.contains('collapsed')));
                    el.setAttribute('aria-controls', panel.id);
                }
            }
        }
        document.querySelectorAll('#topbar [data-cmd]').forEach(function (btn) {
            btn.addEventListener('click', async function () {
                const cmd = btn.dataset.cmd;
                if (cmd === 'toggle-left')
                    left.classList.toggle('collapsed');
                else if (cmd === 'toggle-right')
                    right.classList.toggle('collapsed');
                else if (cmd === 'collapse-left')
                    left.classList.add('collapsed');
                else if (cmd === 'collapse-right')
                    right.classList.add('collapsed');
                if (['toggle-left', 'toggle-right', 'collapse-left', 'collapse-right'].includes(cmd || ''))
                    updateSidebarAria();
                else if (cmd === 'import-images')
                    doImportImages();
                else if (cmd === 'new-manga-page')
                    doNewMangaPage();
                else if (cmd === 'new-template')
                    doNewFromTemplate();
                else if (cmd === 'new-board') {
                    const name = await D.prompt({
                        title: 'New board',
                        message: 'A board is another infinite canvas.',
                        input: 'New Board',
                        confirmText: 'Create'
                    });
                    if (!name)
                        return;
                    const parentId = S.data.currentBoardId;
                    const boardId = B.create(name, parentId);
                    const instApi = await kernel.require('instances');
                    await instApi.addBoard(boardId, cam.data.x, cam.data.y);
                    D.toast('Board "' + name + '" created.', 'ok');
                }
                else if (cmd === 'undo')
                    H.undo();
                else if (cmd === 'redo')
                    H.redo();
                else if (cmd === 'fit')
                    cam.fitAll();
                else if (cmd === 'reset')
                    cam.reset();
                else if (cmd === 'export')
                    EI.exportProject();
                else if (cmd === 'load')
                    fileProject.click();
                else if (cmd === 'debug') {
                    S.data.ui.debug = !S.data.ui.debug;
                    btn.classList.toggle('primary', S.data.ui.debug);
                    kernel.emit('state:changed');
                }
            });
        });
        /* ---------------- Project file load ---------------- */
        fileProject.addEventListener('change', async function () {
            if (fileProject.files && fileProject.files[0]) {
                await EI.importProjectFile(fileProject.files[0]);
            }
            fileProject.value = '';
        });
        /* ---------------- Sidebar Navigator ---------------- */
        navBack.addEventListener('click', function () { B.navigateUp(); });
        navRename.addEventListener('click', async function () {
            const cur = B.current();
            if (!cur)
                return;
            const name = await D.prompt({ title: 'Rename board', input: cur.name, confirmText: 'Rename' });
            if (name && name !== cur.name)
                B.rename(cur.id, name);
        });
        function renderNav() {
            const cur = B.current();
            navTrail.innerHTML = '';
            if (!cur) {
                const e = document.createElement('div');
                e.className = 'nav-empty';
                e.textContent = 'No boards';
                navTrail.appendChild(e);
                navBack.disabled = true;
                return;
            }
            const path = B.pathOf(cur.id);
            navBack.disabled = !cur.parentBoardId;
            path.forEach(function (node, i) {
                const isCurrent = i === path.length - 1;
                const depth = i;
                const row = document.createElement(isCurrent ? 'div' : 'button');
                if (!isCurrent) {
                    row.type = 'button';
                    row.setAttribute('aria-label', 'Open board ' + node.name);
                }
                else
                    row.setAttribute('aria-current', 'page');
                row.className = 'nav-item' + (isCurrent ? ' current' : '');
                row.style.paddingLeft = (8 + depth * 14) + 'px';
                row.title = node.name + ' · ' + (node.instances ? node.instances.length : 0) + ' item(s)';
                row.dataset.boardId = node.id;
                const bullet = document.createElement('span');
                bullet.className = 'nav-bullet';
                bullet.textContent = depth === 0 ? '⌂' : (isCurrent ? '●' : '○');
                row.appendChild(bullet);
                const name = document.createElement('span');
                name.className = 'nav-name';
                name.textContent = node.name;
                row.appendChild(name);
                const count = document.createElement('span');
                count.className = 'nav-count';
                count.textContent = String(node.instances ? node.instances.length : 0);
                row.appendChild(count);
                if (!isCurrent)
                    row.addEventListener('click', function () { B.navigate(node.id); });
                navTrail.appendChild(row);
            });
        }
        /* ---------------- Top Breadcrumb ---------------- */
        function renderTopCrumb() {
            if (!topBreadcrumb || !tbTrail)
                return;
            const cur = B.current();
            if (!cur) {
                topBreadcrumb.hidden = true;
                return;
            }
            const path = B.pathOf(cur.id);
            // Só mostra quando há hierarquia (path > 1 item).
            if (path.length <= 1) {
                topBreadcrumb.hidden = true;
                return;
            }
            topBreadcrumb.hidden = false;
            tbTrail.innerHTML = '';
            path.forEach(function (node, i) {
                if (i > 0) {
                    const sep = document.createElement('span');
                    sep.className = 'tb-chevron';
                    sep.textContent = '›';
                    tbTrail.appendChild(sep);
                }
                const isLast = i === path.length - 1;
                const item = document.createElement(isLast ? 'span' : 'button');
                if (!isLast) {
                    item.type = 'button';
                    item.setAttribute('aria-label', 'Open board ' + node.name);
                }
                else
                    item.setAttribute('aria-current', 'page');
                item.className = 'tb-item' + (isLast ? ' current' : '');
                item.textContent = node.name;
                item.title = node.name;
                if (!isLast) {
                    item.addEventListener('click', function () { B.navigate(node.id); });
                }
                tbTrail.appendChild(item);
            });
            if (tbBack)
                tbBack.disabled = !cur.parentBoardId;
        }
        if (tbBack) {
            tbBack.addEventListener('click', function () { B.navigateUp(); });
        }
        if (tbRename) {
            tbRename.addEventListener('click', async function () {
                const cur = B.current();
                if (!cur)
                    return;
                const name = await D.prompt({ title: 'Rename board', input: cur.name, confirmText: 'Rename' });
                if (name && name !== cur.name)
                    B.rename(cur.id, name);
            });
        }
        /* ---------------- Project name ---------------- */
        function renderProjectName() { projectName.textContent = S.data.meta.name; }
        /* ---------------- History buttons ---------------- */
        function updateHistoryButtons() {
            const undo = document.querySelector('[data-cmd="undo"]');
            const redo = document.querySelector('[data-cmd="redo"]');
            if (undo)
                undo.disabled = !H.canUndo();
            if (redo)
                redo.disabled = !H.canRedo();
        }
        /* ---------------- Wiring ---------------- */
        kernel.provide('ui.shell', {
            renderNav: renderNav,
            renderTopCrumb: renderTopCrumb,
            renderProjectName: renderProjectName,
            updateHistoryButtons: updateHistoryButtons
        });
        kernel.on('board:navigated', function () { renderNav(); renderTopCrumb(); });
        kernel.on('boards:changed', function () { renderNav(); renderTopCrumb(); });
        kernel.on('instances:changed', renderNav);
        kernel.on('state:changed', function () {
            renderProjectName();
            renderNav();
            renderTopCrumb();
        });
        kernel.on('history:changed', updateHistoryButtons);
        // Hide the top breadcrumb while in manga panel edit mode
        kernel.on('manga-edit:enter', function () {
            if (topBreadcrumb)
                topBreadcrumb.hidden = true;
        });
        kernel.on('manga-edit:exit', function () {
            renderTopCrumb();
        });
        updateSidebarAria();
        renderNav();
        renderTopCrumb();
        renderProjectName();
        updateHistoryButtons();
    }
});
