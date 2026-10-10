"use strict";
/* =====================================================================
 * plugins/10-renderer.js
 * Board card (icon + name), image instances, e manga pages (delegado).
 * ---------------------------------------------------------------------
 * FIX (v1.4):
 *   O rendererManga plugin é registrado DEPOIS deste plugin (topoSort
 *   coloca 10c-renderer-manga.js depois de 10-renderer.js). Por isso
 *   o carregamento tem que ser RETENTADO em cada render(), e o elemento
 *   fallback precisa ser substituído quando o renderer real aparecer.
 * ===================================================================== */
definePlugin({
    id: 'renderer',
    version: '1.4.0',
    needs: ['state', 'camera', 'assets', 'boards'],
    provides: ['renderer'],
    uses: ['rendererManga'],
    accepts: { 'state': '^1.0.0', 'camera': '^1.0.0', 'assets': '^1.0.0', 'boards': '^1.0.0', 'rendererManga': '^1.0.0' },
    contractVersions: { 'renderer': '1.0.0' },
    setup: async function (kernel) {
        const S = await kernel.require('state');
        const cam = await kernel.require('camera');
        const A = await kernel.require('assets');
        const B = await kernel.require('boards');
        const world = document.getElementById('world');
        const els = new Map();
        const FOLDER_SVG = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" ' +
            'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
            'stroke-linejoin="round">' +
            '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>' +
            '<path d="M12 11.5v5M9.5 14h5"/>' +
            '</svg>';
        /* ---------------- Image instance ---------------- */
        function createImageEl(inst) {
            const el = document.createElement('div');
            el.className = 'instance image-instance';
            el.dataset.id = inst.id;
            const img = document.createElement('img');
            img.draggable = false;
            img.alt = '';
            const url = A.urls.get(inst.assetId);
            if (url)
                img.src = url;
            el.appendChild(img);
            for (const c of ['nw', 'ne', 'se', 'sw']) {
                const h = document.createElement('div');
                h.className = 'handle handle-' + c;
                h.dataset.handle = c;
                el.appendChild(h);
            }
            return el;
        }
        /* ---------------- Board card ---------------- */
        function createBoardEl(inst) {
            const el = document.createElement('div');
            el.className = 'instance board-card';
            el.dataset.id = inst.id;
            el.title = 'Click the folder to open · double-click the name to rename';
            const icon = document.createElement('div');
            icon.className = 'board-card-icon';
            icon.dataset.action = 'open-board';
            icon.title = 'Open this board';
            icon.innerHTML = FOLDER_SVG;
            icon.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
            icon.addEventListener('mousedown', function (ev) { ev.stopPropagation(); });
            icon.addEventListener('dblclick', function (ev) { ev.stopPropagation(); ev.preventDefault(); });
            icon.addEventListener('click', function (ev) {
                ev.stopPropagation();
                ev.preventDefault();
                const live = S.getInstance(inst.id);
                if (!live || live.type !== 'board' || !live.boardId)
                    return;
                if (B.getBoard(live.boardId))
                    B.navigate(live.boardId);
            });
            el.appendChild(icon);
            const nameRow = document.createElement('div');
            nameRow.className = 'board-card-name-row';
            const name = document.createElement('div');
            name.className = 'board-card-name';
            name.dataset.action = 'rename-board';
            name.title = 'Double-click to rename';
            nameRow.appendChild(name);
            el.appendChild(nameRow);
            for (const c of ['nw', 'ne', 'se', 'sw']) {
                const h = document.createElement('div');
                h.className = 'handle handle-' + c;
                h.dataset.handle = c;
                el.appendChild(h);
            }
            return el;
        }
        function updateBoardContent(el, inst) {
            const target = S.getBoard(inst.boardId);
            const nameEl = el.querySelector('.board-card-name');
            const iconEl = el.querySelector('.board-card-icon');
            if (!target) {
                el.classList.add('missing');
                if (nameEl)
                    nameEl.textContent = 'Missing board';
                if (iconEl)
                    iconEl.title = 'This board no longer exists';
                return;
            }
            el.classList.remove('missing');
            if (nameEl) {
                nameEl.textContent = target.name;
                nameEl.title = 'Double-click to rename · ' + target.name;
            }
            if (iconEl) {
                const total = target.instances.length;
                iconEl.title = 'Open "' + target.name + '" · ' + total +
                    (total === 1 ? ' item' : ' items');
            }
        }
        /* ---------------- Manga delegate (v1.4 — RETRY) ---------------- */
        let mangaRenderer = null;
        let mangaRendererLoading = false;
        /**
         * Tenta carregar o rendererManga. É idempotente: chamado em cada
         * render(), só dispara o require uma vez até resolver/falhar.
         */
        function tryLoadMangaRenderer() {
            if (mangaRenderer || mangaRendererLoading)
                return;
            if (!kernel.has('rendererManga'))
                return; // ainda não registrado
            mangaRendererLoading = true;
            kernel.require('rendererManga').then(function (r) {
                mangaRenderer = r;
                mangaRendererLoading = false;
                kernel.log.info('[renderer] mangaRenderer carregado — substituindo fallbacks');
                // Remove qualquer elemento fallback existente, para que o próximo
                // render crie o elemento real (via mangaRenderer.createEl).
                const toRemove = [];
                els.forEach(function (el, id) {
                    if (el.classList.contains('manga-fallback'))
                        toRemove.push(id);
                });
                toRemove.forEach(function (id) {
                    const el = els.get(id);
                    if (el) {
                        el.remove();
                        els.delete(id);
                    }
                });
                // Re-render completo no próximo frame
                requestAnimationFrame(render);
            }).catch(function (e) {
                kernel.log.warn('[renderer] falha ao carregar rendererManga', e);
                mangaRendererLoading = false;
            });
        }
        /* ---------------- Update ---------------- */
        function updateEl(inst) {
            const el = els.get(inst.id);
            if (!el)
                return;
            let tf = 'translate(' + inst.x + 'px,' + inst.y + 'px)';
            if (inst.rotation)
                tf += ' rotate(' + inst.rotation + 'deg)';
            el.style.transform = tf;
            el.style.width = inst.width + 'px';
            el.style.height = inst.height + 'px';
            el.style.zIndex = String(inst.zIndex || 1);
            el.style.opacity = inst.visible === false ? '0.22' : '1';
            el.classList.toggle('locked', !!inst.locked);
            if (inst.type === 'board') {
                updateBoardContent(el, inst);
            }
            else if (inst.type === 'manga-page') {
                // Só delega se for o elemento REAL, não o fallback
                if (mangaRenderer && !el.classList.contains('manga-fallback')) {
                    mangaRenderer.updateEl(el, inst);
                }
            }
            else {
                el.classList.toggle('missing', !A.urls.has(inst.assetId));
                const img = el.firstChild;
                const u = A.urls.get(inst.assetId);
                if (img && u && img.src !== u)
                    img.src = u;
            }
        }
        /* ---------------- Render ---------------- */
        function desiredClass(inst) {
            if (inst.type === 'board')
                return 'board-card';
            if (inst.type === 'manga-page')
                return 'manga-page';
            return 'image-instance';
        }
        function createMangaFallbackEl(inst) {
            const el = document.createElement('div');
            el.className = 'instance manga-page manga-fallback';
            el.dataset.id = inst.id;
            el.innerHTML = '<div class="manga-missing-label">Loading manga renderer…</div>';
            return el;
        }
        function render() {
            // v1.4: tenta carregar o rendererManga em CADA render.
            // Isso resolve a ordem de setup (10c roda depois de 10).
            tryLoadMangaRenderer();
            const b = S.getCurrentBoard();
            const list = b ? b.instances : [];
            const seen = new Set();
            for (const inst of list) {
                if (!inst.type)
                    inst.type = 'image';
                seen.add(inst.id);
                let el = els.get(inst.id);
                const want = desiredClass(inst);
                const hasClass = el && el.classList.contains(want);
                // v1.4: se for fallback e o renderer real já estiver pronto,
                // descartar o elemento para que ele seja recriado corretamente.
                const isFallback = el && el.classList.contains('manga-fallback');
                const mustRebuild = isFallback && !!mangaRenderer;
                if (el && (!hasClass || mustRebuild)) {
                    el.remove();
                    els.delete(inst.id);
                    el = undefined;
                }
                if (!el) {
                    if (inst.type === 'board') {
                        el = createBoardEl(inst);
                    }
                    else if (inst.type === 'manga-page') {
                        el = mangaRenderer
                            ? mangaRenderer.createEl(inst)
                            : createMangaFallbackEl(inst);
                    }
                    else {
                        el = createImageEl(inst);
                    }
                    els.set(inst.id, el);
                    world.appendChild(el);
                }
                updateEl(inst);
            }
            els.forEach(function (el, id) {
                if (!seen.has(id)) {
                    el.remove();
                    els.delete(id);
                }
            });
            updateSelection();
            updateHud();
            updateEmptyState();
        }
        function updateSelection() {
            els.forEach(function (el, id) {
                const sel = S.data.selection.has(id);
                el.classList.toggle('selected', sel);
                el.classList.toggle('single', sel && S.data.selection.size === 1);
            });
            const tb = document.getElementById('selection-toolbar');
            if (!tb)
                return;
            tb.hidden = S.data.selection.size === 0;
            if (tb.hidden)
                return;
            const context = document.getElementById('selection-context');
            if (context) {
                const onlyId = S.data.selection.size === 1
                    ? Array.from(S.data.selection)[0] : undefined;
                const inst = onlyId ? S.getInstance(onlyId) : null;
                context.textContent = S.data.selection.size > 1
                    ? S.data.selection.size + ' itens selecionados'
                    : inst?.type === 'manga-page' ? 'Página de mangá'
                        : inst?.type === 'board' ? 'Board selecionado'
                            : 'Imagem selecionada';
            }
            // Keep the existing action toolbar close to the selected object.
            // Multiple selection remains in a stable bottom dock.
            const center = document.getElementById('center');
            const selectedId = S.data.selection.size === 1
                ? Array.from(S.data.selection)[0] : undefined;
            const selected = selectedId ? els.get(selectedId) : null;
            if (center && selected) {
                const item = selected.getBoundingClientRect();
                const bounds = center.getBoundingClientRect();
                const width = tb.offsetWidth || 310;
                const height = tb.offsetHeight || 45;
                const x = Math.min(Math.max((item.left + item.right) / 2 - bounds.left, width / 2 + 10), Math.max(width / 2 + 10, bounds.width - width / 2 - 10));
                const below = item.bottom - bounds.top + 10;
                const above = item.top - bounds.top - height - 10;
                const y = below + height < bounds.height - 54 ? below :
                    above >= 52 ? above : 58;
                tb.style.left = x + 'px';
                tb.style.top = Math.max(58, Math.min(bounds.height - height - 14, y)) + 'px';
                tb.style.bottom = 'auto';
            }
            else {
                tb.style.left = '50%';
                tb.style.top = '';
                tb.style.bottom = '64px';
            }
        }
        function updateHud() {
            const b = S.getCurrentBoard();
            const n = b ? b.instances.length : 0;
            const info = document.getElementById('hud-info');
            if (info)
                info.textContent = n + (n === 1 ? ' item on canvas' : ' items on canvas');
        }
        function updateEmptyState() {
            const b = S.getCurrentBoard();
            const n = b ? b.instances.length : 0;
            const empty = document.getElementById('canvas-empty');
            if (!empty)
                return;
            if (n > 0) {
                empty.hidden = true;
                return;
            }
            empty.hidden = false;
            const isSub = !!b && b.id !== S.data.rootBoardId;
            const title = empty.querySelector('.ce-title');
            const sub = empty.querySelector('.ce-sub');
            if (title)
                title.textContent = isSub ? b.name : 'Empty canvas';
            if (sub)
                sub.textContent = isSub
                    ? 'This sub-board is empty. Drag images here, or press ← Back to return.'
                    : 'Drag images from the library, or use New Board to create a sub-board.';
        }
        kernel.provide('renderer', {
            render: render,
            updateEl: updateEl,
            updateSelection: updateSelection,
            updateHud: updateHud,
            updateEmptyState: updateEmptyState,
            els: els
        });
        kernel.on('state:changed', render);
        kernel.on('instances:changed', render);
        kernel.on('board:navigated', render);
        kernel.on('assets:changed', render);
        kernel.on('selection:changed', updateSelection);
        kernel.on('camera:changed', updateSelection);
        kernel.on('boards:changed', render);
        kernel.on('manga-page:changed', function (payload) {
            if (!payload || !payload.instanceId)
                return render();
            const inst = S.getInstance(payload.instanceId);
            if (inst)
                updateEl(inst);
        });
        kernel.on('manga-page:focus', function () {
            render();
        });
        kernel.on('panelSets:changed', render);
    }
});
