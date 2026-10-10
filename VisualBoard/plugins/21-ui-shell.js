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
        const workspace = document.getElementById('app');
        const workspaceMore = document.getElementById('workspace-more');
        const leftGrip = document.getElementById('resize-left');
        const rightGrip = document.getElementById('resize-right');
        const workspaceLabel = document.getElementById('workspace-label');
        const workspaceHint = document.getElementById('workspace-hint');
        const guide = document.getElementById('workspace-guide');
        const guideDismiss = document.getElementById('workspace-guide-dismiss');
        const help = document.getElementById('workspace-help');
        const modes = ['studio', 'focus', 'library', 'manga'];
        const modeHints = {
            studio: 'Arraste imagens para o canvas. Selecione um item para acessar ações contextuais.',
            focus: 'Canvas em foco. Use os botões de painéis para abrir ferramentas sob demanda.',
            library: 'Busque imagens, organize pacotes e arraste assets para seu board.',
            manga: 'Crie páginas com modelos e edite painéis e camadas no inspetor à direita.'
        };
        const labels = {
            studio: 'Estúdio', focus: 'Foco', library: 'Biblioteca', manga: 'Mangá'
        };
        const widths = {
            studio: [272, 286], focus: [272, 286], library: [364, 274], manga: [230, 370]
        };
        const storageGet = (key) => {
            try {
                return localStorage.getItem(key);
            }
            catch {
                return null;
            }
        };
        const storageSet = (key, value) => {
            try {
                localStorage.setItem(key, value);
            }
            catch { /* private contexts can reject storage */ }
        };
        const modeValue = storageGet('nvb.ui.workspaceMode');
        let currentMode = modes.includes(modeValue)
            ? modeValue : 'studio';
        let modeBeforeEdit = null;
        function syncPanelControls() {
            updateSidebarAria();
            if (leftGrip)
                leftGrip.hidden = left.classList.contains('collapsed');
            if (rightGrip)
                rightGrip.hidden = right.classList.contains('collapsed');
        }
        function setSidebarWidths() {
            for (const side of ['left', 'right']) {
                const fallback = widths[currentMode][side === 'left' ? 0 : 1];
                const stored = Number(storageGet('nvb.ui.width.' + currentMode + '.' + side));
                const size = Number.isFinite(stored) && stored >= 190 && stored <= 520 ? stored : fallback;
                workspace.style.setProperty(side === 'left' ? '--vb-left' : '--vb-right', size + 'px');
                const grip = side === 'left' ? leftGrip : rightGrip;
                if (grip)
                    grip.setAttribute('aria-valuenow', String(size));
            }
        }
        function setWorkspaceMode(mode, persist = true) {
            currentMode = mode;
            workspace.dataset.workspaceMode = mode;
            const mobile = window.matchMedia('(max-width:820px)').matches;
            left.classList.toggle('collapsed', mobile ? mode !== 'library' : mode === 'focus');
            right.classList.toggle('collapsed', mobile ? mode !== 'manga' : mode === 'focus' || mode === 'library');
            setSidebarWidths();
            restoreSectionHeights();
            document.querySelectorAll('[data-workspace-mode]').forEach(btn => {
                const selected = btn.dataset.workspaceMode === mode;
                btn.setAttribute('aria-pressed', String(selected));
            });
            if (workspaceLabel)
                workspaceLabel.textContent = labels[mode];
            if (workspaceHint)
                workspaceHint.textContent = modeHints[mode];
            syncPanelControls();
            if (persist)
                storageSet('nvb.ui.workspaceMode', mode);
        }
        document.querySelectorAll('[data-workspace-mode]').forEach(btn => {
            kernel.listen(btn, 'click', () => {
                const mode = btn.dataset.workspaceMode;
                if (modes.includes(mode))
                    setWorkspaceMode(mode);
            });
        });
        function installResizer(grip, side) {
            if (!grip)
                return;
            const property = side === 'left' ? '--vb-left' : '--vb-right';
            const limit = (value) => {
                const main = document.getElementById('main');
                const other = side === 'left' ? right : left;
                const otherWidth = other.classList.contains('collapsed') ? 0 : other.getBoundingClientRect().width;
                return Math.max(190, Math.min(520, main.clientWidth - otherWidth - 340, value));
            };
            const apply = (size) => {
                const safe = Math.round(limit(size));
                workspace.style.setProperty(property, safe + 'px');
                grip.setAttribute('aria-valuenow', String(safe));
                storageSet('nvb.ui.width.' + currentMode + '.' + side, String(safe));
            };
            kernel.listen(grip, 'pointerdown', event => {
                const e = event;
                if (e.button !== 0)
                    return;
                e.preventDefault();
                grip.setPointerCapture(e.pointerId);
                grip.classList.add('is-dragging');
            });
            kernel.listen(grip, 'pointermove', event => {
                const e = event;
                if (!grip.hasPointerCapture(e.pointerId))
                    return;
                const rect = document.getElementById('main').getBoundingClientRect();
                apply(side === 'left' ? e.clientX - rect.left : rect.right - e.clientX);
            });
            const finish = (event) => {
                const e = event;
                if (grip.hasPointerCapture(e.pointerId))
                    grip.releasePointerCapture(e.pointerId);
                grip.classList.remove('is-dragging');
            };
            kernel.listen(grip, 'pointerup', finish);
            kernel.listen(grip, 'pointercancel', finish);
            kernel.listen(grip, 'keydown', event => {
                const e = event;
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home')
                    return;
                e.preventDefault();
                const current = Number(grip.getAttribute('aria-valuenow')) || widths[currentMode][side === 'left' ? 0 : 1];
                if (e.key === 'Home')
                    apply(widths[currentMode][side === 'left' ? 0 : 1]);
                else
                    apply(current + (e.key === 'ArrowRight' ? (side === 'left' ? 1 : -1) : (side === 'left' ? -1 : 1)) *
                        (e.shiftKey ? 32 : 16));
            });
        }
        installResizer(leftGrip, 'left');
        installResizer(rightGrip, 'right');
        const sectionDefaults = {
            formats: 220, navigator: 160, inspector: 230
        };
        const sectionProps = {
            formats: '--vb-formats-height',
            navigator: '--vb-nav-height',
            inspector: '--vb-inspector-height'
        };
        const sectionSide = {
            formats: left, navigator: right, inspector: right
        };
        const sections = ['formats', 'navigator', 'inspector'];
        const sectionGrip = (kind) => document.getElementById('resize-' + kind) ||
            (kind === 'formats' ? document.getElementById('resize-formats') : null);
        const sectionPanel = (kind) => {
            if (kind === 'formats')
                return left.querySelector('.pf-body');
            if (kind === 'navigator')
                return right.querySelector('.nav-body');
            return document.getElementById('inspector-body');
        };
        function sectionBounds(kind) {
            const container = sectionSide[kind];
            const height = container.getBoundingClientRect().height || container.clientHeight;
            const navHeight = right.querySelector('.nav-body')?.getBoundingClientRect().height || 160;
            const inspector = document.getElementById('inspector-body');
            const inspectorVisible = !!inspector && !inspector.hidden;
            const inspectorHeight = inspectorVisible ? (inspector.getBoundingClientRect().height || 230) : 0;
            const reserve = kind === 'formats' ? 235 :
                kind === 'navigator' ? (inspectorVisible ? 260 + inspectorHeight : 175) :
                    255 + navHeight;
            const min = kind === 'formats' ? 96 : 100;
            return [min, Math.max(min, Math.min(460, height - reserve))];
        }
        function setSectionHeight(kind, size, persist = true) {
            if (!Number.isFinite(size))
                return;
            const [min, max] = sectionBounds(kind);
            const safe = Math.round(Math.min(max, Math.max(min, size)));
            workspace.style.setProperty(sectionProps[kind], safe + 'px');
            const grip = sectionGrip(kind);
            if (grip) {
                grip.setAttribute('aria-valuemin', String(min));
                grip.setAttribute('aria-valuemax', String(max));
                grip.setAttribute('aria-valuenow', String(safe));
            }
            if (persist)
                storageSet('nvb.ui.section.' + currentMode + '.' + kind, String(safe));
        }
        function restoreSectionHeights() {
            for (const kind of sections) {
                const raw = storageGet('nvb.ui.section.' + currentMode + '.' + kind);
                const stored = raw !== null ? Number(raw) : NaN;
                setSectionHeight(kind, Number.isFinite(stored) ? stored : sectionDefaults[kind], false);
            }
        }
        function installSectionResizer(kind) {
            const grip = sectionGrip(kind);
            if (!grip)
                return;
            const valueFromPointer = (y) => {
                const bounds = sectionSide[kind].getBoundingClientRect();
                if (kind === 'navigator')
                    return y - bounds.top - 41;
                if (kind === 'formats')
                    return bounds.bottom - y - 41;
                const inspector = sectionPanel('inspector');
                return inspector ? y - inspector.getBoundingClientRect().top : sectionDefaults.inspector;
            };
            kernel.listen(grip, 'pointerdown', event => {
                const e = event;
                if (e.button !== 0)
                    return;
                e.preventDefault();
                grip.setPointerCapture(e.pointerId);
                grip.classList.add('is-dragging');
            });
            kernel.listen(grip, 'pointermove', event => {
                const e = event;
                if (!grip.hasPointerCapture(e.pointerId))
                    return;
                setSectionHeight(kind, valueFromPointer(e.clientY));
            });
            const finish = (event) => {
                const e = event;
                if (grip.hasPointerCapture(e.pointerId))
                    grip.releasePointerCapture(e.pointerId);
                grip.classList.remove('is-dragging');
            };
            kernel.listen(grip, 'pointerup', finish);
            kernel.listen(grip, 'pointercancel', finish);
            kernel.listen(grip, 'keydown', event => {
                const e = event;
                if (!['ArrowUp', 'ArrowDown', 'Home'].includes(e.key))
                    return;
                e.preventDefault();
                if (e.key === 'Home')
                    return setSectionHeight(kind, sectionDefaults[kind]);
                const current = Number(grip.getAttribute('aria-valuenow')) || sectionDefaults[kind];
                // The lower format section grows upward; Navigator/Inspector grow downward.
                const sign = (e.key === 'ArrowDown' ? 1 : -1) * (kind === 'formats' ? -1 : 1);
                setSectionHeight(kind, current + sign * (e.shiftKey ? 32 : 16));
            });
        }
        sections.forEach(installSectionResizer);
        const mobileBreakpoint = window.matchMedia('(max-width:820px)');
        kernel.listen(mobileBreakpoint, 'change', () => setWorkspaceMode(currentMode, false));
        /* Progressive disclosure: help appears for a genuinely empty new project. */
        let guideDismissed = storageGet('nvb.ui.guide.dismissed') === '1';
        let forceGuide = false;
        function updateGuide() {
            if (!guide)
                return;
            const empty = S.data.boards.length > 0 &&
                S.data.assets.length === 0 &&
                S.data.boards.every(board => board.instances.length === 0);
            guide.hidden = !(forceGuide || (!guideDismissed && empty));
        }
        kernel.on('state:changed', updateGuide);
        kernel.on('instances:changed', updateGuide);
        kernel.on('assets:changed', updateGuide);
        kernel.on('boards:changed', updateGuide);
        kernel.listen(guideDismiss || document, 'click', () => {
            guideDismissed = true;
            forceGuide = false;
            storageSet('nvb.ui.guide.dismissed', '1');
            updateGuide();
        });
        if (help)
            kernel.listen(help, 'click', () => {
                forceGuide = true;
                updateGuide();
                guide?.querySelector('[data-guide-action]')?.focus();
            });
        guide?.querySelectorAll('[data-guide-action]').forEach(btn => {
            kernel.listen(btn, 'click', () => {
                const cmd = btn.dataset.guideAction;
                if (!cmd)
                    return;
                forceGuide = false;
                guide.hidden = true;
                document.querySelector('#topbar [data-cmd="' + cmd + '"]')?.click();
            });
        });
        if (workspaceMore) {
            kernel.listen(document, 'pointerdown', event => {
                if (workspaceMore.open && !workspaceMore.contains(event.target))
                    workspaceMore.open = false;
            });
            kernel.listen(document, 'keydown', event => {
                if (event.key === 'Escape' && workspaceMore.open) {
                    workspaceMore.open = false;
                    workspaceMore.querySelector('summary')?.focus();
                }
            });
        }
        document.querySelectorAll('#topbar [data-cmd]').forEach(btn => {
            kernel.listen(btn, 'click', () => {
                if (workspaceMore?.contains(btn))
                    workspaceMore.open = false;
                // Existing topbar command handler owns the action. This only updates shell UI.
                syncPanelControls();
            });
        });
        document.querySelectorAll('[data-cmd="collapse-left"],[data-cmd="collapse-right"]')
            .forEach(btn => {
            kernel.listen(btn, 'click', () => {
                if (btn.dataset.cmd === 'collapse-left')
                    left.classList.add('collapsed');
                else
                    right.classList.add('collapsed');
                syncPanelControls();
            });
        });
        kernel.on('manga-edit:enter', () => {
            if (modeBeforeEdit === null)
                modeBeforeEdit = currentMode;
            setWorkspaceMode('manga', false);
        });
        kernel.on('manga-edit:exit', () => {
            if (modeBeforeEdit !== null) {
                setWorkspaceMode(modeBeforeEdit, false);
                modeBeforeEdit = null;
            }
        });
        setWorkspaceMode(currentMode, false);
        updateGuide();
        updateSidebarAria();
        renderNav();
        renderTopCrumb();
        renderProjectName();
        updateHistoryButtons();
    }
});
