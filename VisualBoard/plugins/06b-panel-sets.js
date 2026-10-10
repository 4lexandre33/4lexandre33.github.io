"use strict";
/* =====================================================================
 * plugins/06b-panel-sets.js
 * ---------------------------------------------------------------------
 * PanelSets = templates de página de mangá importados de SVG.
 *
 * FASE 5:
 *   - Suporta <path> fechado com curvas Bézier e arcos SVG nativos.
 *     Caminhos compostos ainda são rejeitados pelo modelo de painel único.
 *   - Helper de thumbnail SVG compartilhado (thumbSvg).
 *   - Picker modal reutilizável (promptPick) para "Change panel set…".
 * ===================================================================== */
definePlugin({
    id: 'panel-sets',
    version: '1.4.0',
    needs: ['utils', 'state', 'history', 'svgGeometry'],
    provides: ['panelSets'],
    uses: ['storage-fs-dir'],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'history': '^1.0.0', 'svgGeometry': '^1.0.0', 'storage-fs-dir': '^1.0.0' },
    contractVersions: { 'panelSets': '1.0.0' },
    setup: async function (kernel) {
        const utils = await kernel.require('utils');
        const S = (await kernel.require('state')).data;
        const history = await kernel.require('history');
        const geometry = await kernel.require('svgGeometry');
        if (!Array.isArray(S.panelSets))
            S.panelSets = [];
        /* ---------------- Referência opcional a FS-Dir ---------------- */
        let fsDir = null;
        if (kernel.has('storage-fs-dir')) {
            kernel.require('storage-fs-dir').then(function (m) { fsDir = m; });
        }
        function fsDirActive() {
            return !!(fsDir && fsDir.hasHandle && fsDir.hasHandle());
        }
        /* ---------------- Persistência em disco (Fase 3) ---------------- */
        async function persistSvgToDisk(ps) {
            if (!fsDirActive())
                return false;
            if (!ps || !ps.svgSource)
                return false;
            const ok = await fsDir.writeSvgFile(ps.id, ps.svgSource);
            if (ok) {
                kernel.log.info('[panelSets] wrote .svg/' + ps.id + '.svg');
            }
            else {
                kernel.emit('toast', {
                    message: 'Não foi possível gravar .svg/' + ps.id + '.svg',
                    kind: 'error'
                });
            }
            return ok;
        }
        async function removeSvgFromDisk(id) {
            if (!fsDirActive())
                return false;
            const ok = await fsDir.deleteSvgFile(id);
            if (ok)
                kernel.log.info('[panelSets] removed .svg/' + id + '.svg');
            return ok;
        }
        async function syncAllToDisk() {
            if (!fsDirActive())
                return 0;
            const list = S.panelSets || [];
            let written = 0;
            for (let i = 0; i < list.length; i++) {
                const ps = list[i];
                if (!ps.svgSource)
                    continue;
                try {
                    const ok = await fsDir.writeSvgFile(ps.id, ps.svgSource);
                    if (ok)
                        written++;
                }
                catch (e) {
                    kernel.log.warn('sync writeSvgFile failed for ' + ps.id, e);
                }
            }
            if (written) {
                kernel.log.info('[panelSets] synced ' + written + ' SVG file(s) to .svg/');
            }
            return written;
        }
        /* SVG geometry is isolated in plugins/06a-svg-geometry.js. */
        function parseSvg(svgText, options) { return geometry.parseSvg(svgText, options); }
        function parsePathToPoints(d, options) { return geometry.parsePathToPoints(d, options); }
        function getOriginalSvg(id) {
            const ps = get(id);
            return ps && typeof ps.svgSource === 'string' ? ps.svgSource : null;
        }
        function downloadSvg(id) {
            const svg = getOriginalSvg(id);
            if (!svg)
                return false;
            const ps = get(id);
            const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = (ps.name || 'panel-set').replace(/[^\w-]+/g, '_') + '.svg';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            return true;
        }
        /* ---------------- Thumbnail helper (Fase 4) ---------------- */
        /**
         * Gera uma miniatura SVG inline do PanelSet, com um painel destacado.
         * @param {Object} ps PanelSet
         * @param {string|null} highlightPanelId painel a destacar
         * @param {number} maxDim dimensão máxima em px (padrão 64)
         * @returns {string} string SVG
         */
        function thumbSvg(ps, highlightPanelId, maxDim) {
            if (!ps || !Number.isFinite(ps.width) || !Number.isFinite(ps.height) ||
                ps.width <= 0 || ps.height <= 0)
                return '';
            maxDim = maxDim || 64;
            const scale = maxDim / Math.max(ps.width, ps.height);
            const w = ps.width * scale;
            const h = ps.height * scale;
            const escapeAttr = (value) => String(value).replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const paths = ps.panels.map(function (p) {
                const vector = geometry.serializeVector(p);
                const fill = p.id === highlightPanelId ? 'rgba(77,163,255,0.32)' : '#f0f2f6';
                const stroke = p.id === highlightPanelId ? '#4da3ff' : '#c8ccd2';
                const sw = p.id === highlightPanelId ? 1.6 : 1;
                return '<path d="' + escapeAttr(vector.d) + '" ' +
                    (vector.transform ? 'transform="' + escapeAttr(vector.transform) + '" ' : '') +
                    'fill-rule="' + escapeAttr(vector.fillRule) + '" ' +
                    'fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + (sw / scale) +
                    '" stroke-linejoin="miter"/>';
            }).join('');
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
                ps.width + ' ' + ps.height + '" width="' + w.toFixed(0) + '" height="' +
                h.toFixed(0) + '">' +
                '<rect x="0" y="0" width="100%" height="100%" fill="#ffffff"/>' +
                paths +
                '</svg>';
        }
        /* ---------------- CRUD ---------------- */
        function create(parsed, name) {
            const before = history.snapshot();
            const ps = {
                id: utils.uid('panelset'),
                name: (name || 'Manga Page').trim() || 'Manga Page',
                width: parsed.width,
                height: parsed.height,
                panels: parsed.panels,
                svgSource: parsed.svgSource,
                viewBox: parsed.viewBox || { minX: 0, minY: 0, width: parsed.width, height: parsed.height },
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            S.panelSets.push(ps);
            history.push(before);
            persistSvgToDisk(ps);
            kernel.emit('panelSets:changed');
            return ps;
        }
        function get(id) {
            for (let i = 0; i < S.panelSets.length; i++) {
                if (S.panelSets[i].id === id)
                    return S.panelSets[i];
            }
            return null;
        }
        function list() { return (S.panelSets || []).slice(); }
        function rename(id, name) {
            const ps = get(id);
            if (!ps)
                return;
            const clean = (name || '').trim();
            if (!clean || clean === ps.name)
                return;
            const before = history.snapshot();
            ps.name = clean;
            ps.updatedAt = Date.now();
            history.push(before);
            kernel.emit('panelSets:changed');
        }
        function remove(id) {
            const idx = (S.panelSets || []).findIndex(function (p) { return p.id === id; });
            if (idx === -1)
                return;
            const before = history.snapshot();
            S.panelSets.splice(idx, 1);
            history.push(before);
            removeSvgFromDisk(id);
            kernel.emit('panelSets:changed');
        }
        /* ---------------- Picker modal (Fase 4) ---------------- */
        function promptPick(opts) {
            opts = opts || {};
            const excludeId = opts.excludeId || null;
            const title = opts.title || 'Choose a panel set';
            const subtitle = opts.subtitle || '';
            return new Promise(function (resolve) {
                const available = (S.panelSets || []).filter(function (ps) {
                    return ps.id !== excludeId;
                });
                const modal = document.createElement('div');
                modal.className = 'modal';
                const backdrop = document.createElement('div');
                backdrop.className = 'modal-backdrop';
                modal.appendChild(backdrop);
                const dlg = document.createElement('div');
                dlg.className = 'dialog ps-picker-dialog';
                dlg.setAttribute('role', 'dialog');
                const h = document.createElement('h3');
                h.textContent = title;
                dlg.appendChild(h);
                if (subtitle) {
                    const p = document.createElement('p');
                    p.textContent = subtitle;
                    dlg.appendChild(p);
                }
                if (!available.length) {
                    const em = document.createElement('div');
                    em.className = 'ps-picker-empty';
                    em.textContent = 'No panel sets available. Import an SVG first.';
                    dlg.appendChild(em);
                    const actions = document.createElement('div');
                    actions.className = 'dialog-actions';
                    const cancelBtn = document.createElement('button');
                    cancelBtn.className = 'btn';
                    cancelBtn.type = 'button';
                    cancelBtn.textContent = 'Close';
                    cancelBtn.addEventListener('click', function () {
                        modal.remove();
                        resolve(null);
                    });
                    actions.appendChild(cancelBtn);
                    dlg.appendChild(actions);
                    modal.appendChild(dlg);
                    document.body.appendChild(modal);
                    return;
                }
                const grid = document.createElement('div');
                grid.className = 'ps-picker-grid';
                available.forEach(function (ps) {
                    const item = document.createElement('button');
                    item.type = 'button';
                    item.className = 'ps-picker-item';
                    const thumbWrap = document.createElement('div');
                    thumbWrap.className = 'ps-picker-thumb';
                    thumbWrap.innerHTML = thumbSvg(ps, null, 72);
                    item.appendChild(thumbWrap);
                    const meta = document.createElement('div');
                    meta.className = 'ps-picker-meta';
                    const nameEl = document.createElement('div');
                    nameEl.className = 'ps-picker-name';
                    nameEl.textContent = ps.name || '';
                    nameEl.title = ps.name || '';
                    meta.appendChild(nameEl);
                    const sub = document.createElement('div');
                    sub.className = 'ps-picker-sub';
                    sub.textContent = ps.panels.length + ' panel' +
                        (ps.panels.length === 1 ? '' : 's') +
                        ' · ' + ps.width + '×' + ps.height;
                    meta.appendChild(sub);
                    item.appendChild(meta);
                    item.addEventListener('click', function () {
                        modal.remove();
                        resolve(ps);
                    });
                    grid.appendChild(item);
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
        /* ---------------- Modal de import ---------------- */
        function promptImport() {
            return new Promise(function (resolve) {
                const modal = document.createElement('div');
                modal.className = 'modal';
                const backdrop = document.createElement('div');
                backdrop.className = 'modal-backdrop';
                modal.appendChild(backdrop);
                const dlg = document.createElement('div');
                dlg.className = 'dialog svg-dialog';
                dlg.setAttribute('role', 'dialog');
                const h = document.createElement('h3');
                h.textContent = 'Import manga page from SVG';
                dlg.appendChild(h);
                const p1 = document.createElement('p');
                p1.textContent = 'Paste an SVG containing closed panels ' +
                    '(<rect>, <polygon>, or closed <path> with curves).';
                dlg.appendChild(p1);
                const note = document.createElement('div');
                note.className = 'svg-save-note';
                if (fsDirActive()) {
                    note.innerHTML = '<span class="svg-save-dot on"></span> ' +
                        'Will be saved to <code>.svg/</code> in your project folder.';
                }
                else {
                    note.innerHTML = '<span class="svg-save-dot off"></span> ' +
                        'No project folder connected — SVG stays embedded in the project file.';
                }
                dlg.appendChild(note);
                const nameInput = document.createElement('input');
                nameInput.type = 'text';
                nameInput.placeholder = 'Page name (optional)';
                dlg.appendChild(nameInput);
                const ta = document.createElement('textarea');
                ta.className = 'svg-textarea';
                ta.spellcheck = false;
                ta.placeholder =
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 850">\n' +
                        '  <rect x="15" y="15" width="570" height="380"/>\n' +
                        '  <path d="M15,410 L193,410 L193,835 L15,835 Z"/>\n' +
                        '  ...\n' +
                        '</svg>';
                dlg.appendChild(ta);
                const errEl = document.createElement('div');
                errEl.className = 'svg-error';
                errEl.hidden = true;
                dlg.appendChild(errEl);
                const actions = document.createElement('div');
                actions.className = 'dialog-actions';
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'btn';
                cancelBtn.type = 'button';
                cancelBtn.textContent = 'Cancel';
                const okBtn = document.createElement('button');
                okBtn.className = 'btn primary';
                okBtn.type = 'button';
                okBtn.textContent = 'Import';
                actions.appendChild(cancelBtn);
                actions.appendChild(okBtn);
                dlg.appendChild(actions);
                modal.appendChild(dlg);
                document.body.appendChild(modal);
                function close(result) { modal.remove(); resolve(result); }
                backdrop.addEventListener('click', function () { close(null); });
                cancelBtn.addEventListener('click', function () { close(null); });
                okBtn.addEventListener('click', function () {
                    const text = ta.value.trim();
                    if (!text) {
                        errEl.textContent = 'Paste an SVG first.';
                        errEl.hidden = false;
                        return;
                    }
                    let parsed;
                    try {
                        parsed = parseSvg(text);
                    }
                    catch (e) {
                        errEl.textContent = e.message || 'Could not parse SVG';
                        errEl.hidden = false;
                        return;
                    }
                    const ps = create(parsed, nameInput.value || 'Manga Page');
                    close(ps);
                });
                setTimeout(function () { ta.focus(); }, 40);
            });
        }
        /* ---------------- Eventos ---------------- */
        kernel.on('backend:changed', function (payload) {
            if (!payload || payload.mode !== 'fs-dir')
                return;
            syncAllToDisk();
        });
        kernel.provide('panelSets', {
            parseSvg: parseSvg,
            parsePathToPoints: parsePathToPoints,
            getOriginalSvg: getOriginalSvg,
            downloadSvg: downloadSvg,
            thumbSvg: thumbSvg,
            create: create,
            get: get,
            list: list,
            rename: rename,
            remove: remove,
            promptImport: promptImport,
            promptPick: promptPick,
            syncAll: syncAllToDisk
        });
    }
});
