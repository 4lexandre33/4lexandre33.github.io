"use strict";
/* Scene Blocking — ativos SVG do projeto. O modelo fica no próprio ativo (mesmo documento, mesmo Undo/Redo); o SVG é regenerado dele.
 * Nada aqui desenha ou calcula geometria: usa sceneBlockingEngine e sceneBlockingRender. */
definePlugin({
    id: 'scene-blocking-assets',
    version: '1.0.0',
    needs: ['sceneBlockingCore', 'sceneBlockingEngine', 'sceneBlockingRender', 'assets', 'state', 'backend', 'utils', 'history'],
    provides: ['sceneBlocking'],
    uses: ['app'],
    accepts: { sceneBlockingCore: '^1.0.0', sceneBlockingEngine: '^1.0.0', sceneBlockingRender: '^1.0.0', assets: '^1.0.0', state: '^1.0.0', backend: '^1.0.0', utils: '^1.0.0', history: '^1.0.0', app: '^1.0.0' },
    contractVersions: { sceneBlocking: '1.1.0' },
    setup: async function (kernel) {
        const core = await kernel.require('sceneBlockingCore');
        const engine = await kernel.require('sceneBlockingEngine');
        const R = await kernel.require('sceneBlockingRender');
        const A = await kernel.require('assets');
        const S = (await kernel.require('state')).data;
        const backend = await kernel.require('backend');
        const utils = await kernel.require('utils');
        const H = await kernel.require('history');
        const LIMITS = { maxSheetsPerBatch: 50, maxEditsPerCall: 50, maxPngScale: 2 };
        const SVG_MIME = 'image/svg+xml';
        const fail = core.fail;
        const pad2 = (i) => String(i + 1).padStart(2, '0');
        /* ------------------------------ leitura segura ------------------------------ */
        function assetOf(id) {
            if (typeof id !== 'string')
                return fail('INVALID_ARGUMENT', 'assetId deve ser um texto', 'assetId');
            const a = S.assets.find(x => x.id === id);
            if (!a)
                return fail('NOT_FOUND', 'Ativo inexistente: ' + id);
            return a;
        }
        /** O projeto pode ter sido importado de fora: a forma do modelo é conferida a cada leitura. */
        function metaOf(a) {
            const m = a.sceneBlocking;
            if (!m || typeof m !== 'object' || m.version !== 1)
                return fail('NOT_A_SCENE', 'O ativo "' + a.name + '" não é uma folha do Scene Blocking');
            return { version: 1, batchId: String(m.batchId), engineVersion: String(m.engineVersion), config: core.normalizeConfig(m.config), sheet: core.assertSheetShape(m.sheet) };
        }
        const isSceneAsset = (id) => { const a = S.assets.find(x => x.id === id); return !!a?.sceneBlocking; };
        function summary(a) {
            const m = metaOf(a), v = engine.validateBatch({ format: 'visualboard-scene-blocking', formatVersion: 1, engineVersion: m.engineVersion, config: m.config, sheets: [m.sheet] });
            return { id: a.id, name: a.name, batchId: m.batchId, sheetIndex: m.sheet.index, engineVersion: m.engineVersion, violations: v.length, lockedCells: m.sheet.cells.filter(c => c.locked || c.lockedParts.characters || c.lockedParts.camera || c.lockedParts.framing).length };
        }
        const docOf = (m) => ({ format: 'visualboard-scene-blocking-sheet', formatVersion: 1, engineVersion: m.engineVersion, config: m.config, sheet: m.sheet });
        const batchOf = (m) => ({ format: 'visualboard-scene-blocking', formatVersion: 1, engineVersion: m.engineVersion, config: m.config, sheets: [m.sheet] });
        const cache = R.createCache();
        function uniqueName(base, ext, taken) {
            let name = base + ext, k = 2;
            while (S.assets.some(a => a.name.toLowerCase() === name.toLowerCase()) || taken.has(name.toLowerCase()))
                name = base + ' (' + (k++) + ')' + ext;
            taken.add(name.toLowerCase());
            return name;
        }
        async function save(warnings) {
            if (!kernel.has('app'))
                return false;
            try {
                return !!(await kernel.call('app', 'saveNow'));
            }
            catch (e) {
                warnings.push('Falha ao salvar o projeto: ' + e.message);
                return false;
            }
        }
        /** Troca o modelo e o SVG do ativo na mesma transação de histórico. */
        async function putSheet(a, m, label) {
            const svg = R.renderSheet(docOf(m), cache), blob = new Blob([svg], { type: SVG_MIME });
            if (blob.size > 8 * 1024 * 1024)
                fail('LIMIT_EXCEEDED', 'O SVG gerado passa de 8 MB');
            await H.transaction(label, async () => {
                if (backend.isAvailable())
                    await backend.put('blobs', a.id, blob);
                const old = A.urls.get(a.id);
                if (old)
                    URL.revokeObjectURL(old);
                const url = URL.createObjectURL(blob);
                A.blobs.set(a.id, blob);
                A.urls.set(a.id, url);
                A.missing.delete(a.id);
                a.size = blob.size;
                a.updatedAt = Date.now();
                a.mimeType = SVG_MIME;
                a.sceneBlocking = JSON.parse(JSON.stringify(m));
                kernel.emit('assets:changed');
                kernel.emit('state:changed');
            });
        }
        /* ------------------------------ operações ------------------------------ */
        async function generate(input, onProgress) {
            const cfg = core.normalizeConfig(input);
            if (cfg.quantityOfSpritesheets > LIMITS.maxSheetsPerBatch)
                fail('INVALID_ARGUMENT', 'No máximo ' + LIMITS.maxSheetsPerBatch + ' folhas por geração no projeto', 'quantityOfSpritesheets');
            const batch = engine.generate(cfg, onProgress);
            const batchId = utils.uid('scene'), pkg = A.ensureDefaultPackage(), taken = new Set(), metas = [], blobs = [];
            const warnings = [];
            for (const sheet of batch.sheets) {
                const m = { version: 1, batchId, engineVersion: batch.engineVersion, config: batch.config, sheet };
                const blob = new Blob([R.renderSheet(docOf(m), cache)], { type: SVG_MIME });
                blobs.push(blob);
                metas.push({ id: utils.uid('asset'), name: uniqueName('SPRITESHEET_' + pad2(sheet.index), '.svg', taken), packageId: pkg, mimeType: SVG_MIME, originalWidth: 1800, originalHeight: 1800,
                    size: blob.size, createdAt: Date.now(), updatedAt: Date.now(), sceneBlocking: m,
                    operations: [{ processor: 'sceneBlocking', operation: 'generate', params: { theme: cfg.theme, masterSeed: cfg.masterSeed, sheet: sheet.index } }] });
            }
            const bad = engine.validateBatch(batch);
            if (bad.length)
                warnings.push(bad.length + ' célula(s) não cumprem todas as regras geométricas; veja sceneMetadata.violations');
            const persisted = [], urls = [];
            try {
                await H.transaction('sceneBlocking.generate', async () => {
                    for (let i = 0; i < metas.length; i++) {
                        const m = metas[i], b = blobs[i];
                        if (backend.isAvailable()) {
                            await backend.put('blobs', m.id, b);
                            persisted.push(m.id);
                        }
                        const url = URL.createObjectURL(b);
                        urls.push(url);
                        A.blobs.set(m.id, b);
                        A.urls.set(m.id, url);
                        A.missing.delete(m.id);
                        S.assets.push(m);
                    }
                    kernel.emit('assets:changed');
                    kernel.emit('state:changed');
                });
            }
            catch (error) {
                for (const u of urls)
                    URL.revokeObjectURL(u);
                for (const m of metas) {
                    A.blobs.delete(m.id);
                    A.urls.delete(m.id);
                }
                for (const id of persisted) {
                    try {
                        await backend.del('blobs', id);
                    }
                    catch (e) {
                        kernel.log.warn('limpeza de blob falhou', id, e);
                    }
                }
                throw error;
            }
            const saved = await save(warnings);
            kernel.emit('toast', { message: metas.length === 1 ? 'Folha criada: ' + metas[0].name : metas.length + ' folhas criadas', kind: 'ok' });
            return { batchId, assets: metas.map(summary), warnings, saved };
        }
        const list = () => S.assets.filter(a => a.sceneBlocking).map(summary);
        function get(assetId) {
            const a = assetOf(assetId), m = metaOf(a);
            return { assetId: a.id, name: a.name, config: m.config, engineVersion: m.engineVersion, sheet: m.sheet, violations: engine.validateBatch(batchOf(m)) };
        }
        function cellIndex(v) {
            if (!Number.isInteger(v) || v < 0 || v > 8)
                return fail('INVALID_ARGUMENT', 'cell deve ser um inteiro de 0 a 8', 'cell');
            return v;
        }
        async function regenerate(assetId, req = {}) {
            const a = assetOf(assetId), m = metaOf(a), part = req.part ?? 'all';
            if (!['all', 'characters', 'camera', 'framing'].includes(part))
                fail('INVALID_ARGUMENT', 'part inválido', 'part');
            const cells = req.cell === undefined ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [cellIndex(req.cell)];
            let batch = batchOf(m), done = 0, skipped = 0;
            for (const c of cells) {
                try {
                    batch = engine.regenerate(batch, { sheet: m.sheet.index, cell: c, part });
                    done++;
                }
                catch (e) {
                    const code = e.code;
                    if ((code === 'CELL_LOCKED' || code === 'PART_LOCKED') && req.cell === undefined) {
                        skipped++;
                        continue;
                    }
                    throw e;
                }
            }
            if (!done)
                return { assetId, regenerated: 0, skippedLocked: skipped, violations: 0 };
            const next = { ...m, sheet: batch.sheets[0] };
            await putSheet(a, next, 'sceneBlocking.regenerate');
            return { assetId, regenerated: done, skippedLocked: skipped, violations: engine.validateBatch(batchOf(next)).length };
        }
        async function setLock(assetId, cell, lock) {
            const a = assetOf(assetId), m = metaOf(a), i = cellIndex(cell);
            const batch = engine.setLock(batchOf(m), m.sheet.index, i, lock);
            await putSheet(a, { ...m, sheet: batch.sheets[0] }, 'sceneBlocking.lock');
            return summary(a);
        }
        async function editCell(assetId, cell, edits) {
            const a = assetOf(assetId), m = metaOf(a), i = cellIndex(cell), list = Array.isArray(edits) ? edits : [edits];
            if (!list.length)
                fail('INVALID_ARGUMENT', 'Informe ao menos uma edição', 'edits');
            if (list.length > LIMITS.maxEditsPerCall)
                fail('LIMIT_EXCEEDED', 'No máximo ' + LIMITS.maxEditsPerCall + ' edições por chamada', 'edits');
            let batch = batchOf(m);
            list.forEach((edit, k) => {
                try {
                    batch = engine.editCell(batch, { sheet: m.sheet.index, cell: i, edit });
                }
                catch (e) {
                    const err = e;
                    err.message = (list.length > 1 ? 'Edição ' + (k + 1) + ' de ' + list.length + ': ' : '') + err.message;
                    throw err;
                }
            });
            await putSheet(a, { ...m, sheet: batch.sheets[0] }, 'sceneBlocking.edit');
            const c = batch.sheets[0].cells[i];
            return { assetId, cell: i, applied: list.length, manualEdits: c.manualEdits ?? 0, violations: engine.validateCell(c).length };
        }
        async function duplicate(assetId) {
            const src = assetOf(assetId), m = metaOf(src), blob = A.blobs.get(src.id);
            if (!blob)
                return fail('NOT_FOUND', 'O arquivo do ativo não está disponível');
            const copyBlob = new Blob([R.renderSheet(docOf(m), cache)], { type: SVG_MIME });
            const base = src.name.replace(/\.svg$/i, ''), name = uniqueName(base, '.svg', new Set());
            const meta = { ...src, id: utils.uid('asset'), name, size: copyBlob.size, createdAt: Date.now(), updatedAt: Date.now(), derivedFrom: src.id, sceneBlocking: JSON.parse(JSON.stringify(m)) };
            await H.transaction('sceneBlocking.duplicate', async () => {
                if (backend.isAvailable())
                    await backend.put('blobs', meta.id, copyBlob);
                const url = URL.createObjectURL(copyBlob);
                A.blobs.set(meta.id, copyBlob);
                A.urls.set(meta.id, url);
                A.missing.delete(meta.id);
                S.assets.push(meta);
                kernel.emit('assets:changed');
                kernel.emit('state:changed');
            });
            return summary(meta);
        }
        /** Reconhece um SVG exportado anteriormente (modelo embutido) e o transforma em folha editável. */
        async function adopt(assetId) {
            const a = assetOf(assetId), blob = A.blobs.get(a.id);
            if (!blob || (blob.type && blob.type !== SVG_MIME))
                return fail('NOT_A_SCENE', 'O ativo não é um SVG');
            if (blob.size > 8 * 1024 * 1024)
                fail('LIMIT_EXCEEDED', 'SVG grande demais');
            const doc = R.parseDocument(await blob.text());
            const bad = engine.validateBatch({ format: 'visualboard-scene-blocking', formatVersion: 1, engineVersion: doc.engineVersion, config: doc.config, sheets: [doc.sheet] });
            if (bad.length)
                fail('INVALID_MODEL', 'O modelo embutido viola regras geométricas: ' + bad[0].message);
            await putSheet(a, { version: 1, batchId: utils.uid('scene'), engineVersion: doc.engineVersion, config: doc.config, sheet: doc.sheet }, 'sceneBlocking.adopt');
            return summary(a);
        }
        /* ------------------------------ exportação ------------------------------ */
        async function exportSvg(assetId) { return R.renderSheet(docOf(metaOf(assetOf(assetId)))); }
        async function exportCellSvg(assetId, cell) { return R.renderCellDocument(metaOf(assetOf(assetId)).sheet.cells[cellIndex(cell)]); }
        async function rasterize(svg, size, scale) {
            const url = URL.createObjectURL(new Blob([svg], { type: SVG_MIME }));
            try {
                const img = new Image();
                img.decoding = 'sync';
                await new Promise((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('O navegador não conseguiu desenhar o SVG')); img.src = url; });
                const px = Math.round(size * scale), c = document.createElement('canvas');
                c.width = px;
                c.height = px;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0, px, px);
                const out = await new Promise(r => c.toBlob(r, 'image/png'));
                c.width = 0;
                c.height = 0;
                if (!out || !out.size)
                    return fail('NO_RESULT', 'PNG vazio');
                return out;
            }
            finally {
                URL.revokeObjectURL(url);
            }
        }
        function scaleOf(v) {
            if (v === undefined)
                return 1;
            if (typeof v !== 'number' || !Number.isFinite(v) || v < 0.25 || v > LIMITS.maxPngScale)
                return fail('INVALID_ARGUMENT', 'scale deve ser de 0.25 a ' + LIMITS.maxPngScale, 'scale');
            return v;
        }
        async function exportPng(assetId, opts = {}) {
            const m = metaOf(assetOf(assetId)), scale = scaleOf(opts.scale);
            if (opts.cell !== undefined)
                return rasterize(R.renderCellDocument(m.sheet.cells[cellIndex(opts.cell)]), 600, scale);
            return rasterize(R.renderSheet(docOf(m)), 1800, scale);
        }
        async function exportZip(assetIds, opts = {}) {
            if (!Array.isArray(assetIds) || !assetIds.length || assetIds.length > LIMITS.maxSheetsPerBatch)
                fail('INVALID_ARGUMENT', 'Informe de 1 a ' + LIMITS.maxSheetsPerBatch + ' ativos', 'assetIds');
            const format = opts.format ?? 'svg';
            if (format !== 'svg' && format !== 'png')
                fail('INVALID_ARGUMENT', 'format deve ser svg ou png', 'format');
            const scale = scaleOf(opts.scale), enc = new TextEncoder(), files = [], used = new Set();
            const nameFor = (base) => { let n = base, k = 2; while (used.has(n))
                n = base.replace(/(\.\w+)$/, '_' + (k++) + '$1'); used.add(n); return n; };
            for (const id of assetIds) {
                const a = assetOf(id), m = metaOf(a), base = a.name.replace(/\.svg$/i, '').replace(/[^A-Za-z0-9_\-() ]/g, '_').slice(0, 80) || 'SPRITESHEET';
                const targets = opts.cells ? m.sheet.cells.map(c => ({ label: base + '_CELL_' + pad2(c.index), cell: c.index })) : [{ label: base }];
                for (const t of targets) {
                    if (format === 'svg')
                        files.push({ name: nameFor(t.label + '.svg'), data: enc.encode(t.cell === undefined ? R.renderSheet(docOf(m)) : R.renderCellDocument(m.sheet.cells[t.cell])) });
                    else
                        files.push({ name: nameFor(t.label + '.png'), data: new Uint8Array(await (await exportPng(id, { ...(t.cell === undefined ? {} : { cell: t.cell }), scale })).arrayBuffer()) });
                }
            }
            const zipped = R.zip(files), copy = new Uint8Array(zipped.length);
            copy.set(zipped);
            return new Blob([copy.buffer], { type: 'application/zip' });
        }
        kernel.provide('sceneBlocking', { limits: () => ({ ...LIMITS }), isSceneAsset, generate, list, get, regenerate, setLock, editCell, duplicate, adopt, exportSvg, exportCellSvg, exportPng, exportZip });
    }
});
