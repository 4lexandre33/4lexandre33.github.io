"use strict";
/* Scene Blocking — ativos de vistas laterais. Uma elevação é um ativo SVG DERIVADO de uma célula de uma folha do Blocking:
 * guarda uma cópia da célula + as opções de altura. Nada é desenhado aqui (sceneElevation desenha) e a folha de origem nunca é alterada.
 * Se a célula de origem muda, a elevação fica "desatualizada" até refresh(). Tudo entra no mesmo Desfazer/Refazer do documento. */
definePlugin({
    id: 'scene-blocking-elevation-assets',
    version: '1.0.0',
    needs: ['sceneBlockingCore', 'sceneBlockingRender', 'sceneBlocking', 'sceneElevation', 'assets', 'state', 'backend', 'utils', 'history'],
    provides: ['sceneElevationAssets'],
    uses: ['app'],
    accepts: { sceneBlockingCore: '^1.0.0', sceneBlockingRender: '^1.0.0', sceneBlocking: '^1.0.0', sceneElevation: '^1.0.0', assets: '^1.0.0', state: '^1.0.0', backend: '^1.0.0', utils: '^1.0.0', history: '^1.0.0', app: '^1.0.0' },
    contractVersions: { sceneElevationAssets: '1.0.0' },
    setup: async function (kernel) {
        const core = await kernel.require('sceneBlockingCore');
        const R = await kernel.require('sceneBlockingRender');
        const SB = await kernel.require('sceneBlocking');
        const E = await kernel.require('sceneElevation');
        const A = await kernel.require('assets');
        const S = (await kernel.require('state')).data;
        const backend = await kernel.require('backend');
        const utils = await kernel.require('utils');
        const H = await kernel.require('history');
        const fail = core.fail, SVG_MIME = 'image/svg+xml', MAX = 8 * 1024 * 1024;
        const LIMITS = { maxPngScale: 2, maxPerSource: 20 };
        const pad2 = (i) => String(i + 1).padStart(2, '0');
        function assetOf(id) {
            if (typeof id !== 'string')
                return fail('INVALID_ARGUMENT', 'assetId deve ser um texto', 'assetId');
            const a = S.assets.find(x => x.id === id);
            if (!a)
                return fail('NOT_FOUND', 'Ativo inexistente: ' + id);
            return a;
        }
        /** O projeto pode vir de fora: o modelo é revalidado a cada leitura (o mesmo parser do SVG). */
        function metaOf(a) {
            const m = a.sceneElevation;
            if (!m || typeof m !== 'object' || m.version !== 1)
                return fail('NOT_AN_ELEVATION', 'O ativo "' + a.name + '" não é uma elevação do Scene Blocking');
            const svg = E.renderSheet({ sourceAssetId: String(m.sourceAssetId), sourceName: String(m.sourceName).slice(0, 200), cellIndex: m.cellIndex, sourceHash: String(m.sourceHash), cell: m.cell, options: m.options });
            return E.parse(svg);
        }
        const isElevationAsset = (id) => !!S.assets.find(x => x.id === id)?.sceneElevation;
        function cellIdx(v) {
            if (!Number.isInteger(v) || v < 0 || v > 8)
                return fail('INVALID_ARGUMENT', 'cell deve ser um inteiro de 0 a 8', 'cell');
            return v;
        }
        function resolved(m) {
            const res = E.resolve(m.cell, m.options);
            return { res, warnings: E.warnings(m.cell, res) };
        }
        function summaryOf(a) {
            const m = metaOf(a), st = statusOf(a, m);
            return { id: a.id, name: a.name, sourceAssetId: m.sourceAssetId, sourceName: m.sourceName, cell: m.cellIndex, views: m.options.views, state: st.state, warnings: resolved(m).warnings.length };
        }
        function statusOf(a, m) {
            const src = S.assets.find(x => x.id === m.sourceAssetId);
            if (!src || !isSceneSource(src.id))
                return { id: a.id, state: 'source-missing', sourceHash: m.sourceHash, currentHash: null };
            let cell;
            try {
                cell = SB.get(src.id).sheet.cells[m.cellIndex];
            }
            catch {
                return { id: a.id, state: 'source-missing', sourceHash: m.sourceHash, currentHash: null };
            }
            const cur = E.cellHash(cell);
            return { id: a.id, state: cur === m.sourceHash ? 'current' : 'stale', sourceHash: m.sourceHash, currentHash: cur };
        }
        const isSceneSource = (id) => SB.isSceneAsset(id);
        function uniqueName(base) {
            let name = base + '.svg', k = 2;
            while (S.assets.some(a => a.name.toLowerCase() === name.toLowerCase()))
                name = base + ' (' + (k++) + ').svg';
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
        function blobOf(m) {
            const blob = new Blob([E.renderSheet(m)], { type: SVG_MIME });
            if (blob.size > MAX)
                fail('LIMIT_EXCEEDED', 'O SVG gerado passa de 8 MB');
            return blob;
        }
        function plain(m) { return { version: 1, ...JSON.parse(JSON.stringify(m)) }; }
        /* ------------------------------ operações ------------------------------ */
        function sourceCell(assetId, cell) {
            const id = typeof assetId === 'string' ? assetId : fail('INVALID_ARGUMENT', 'assetId deve ser um texto', 'assetId'), i = cellIdx(cell);
            const src = S.assets.find(x => x.id === id);
            if (!src)
                return fail('NOT_FOUND', 'Ativo inexistente: ' + id);
            if (!isSceneSource(id))
                return fail('NOT_A_SCENE', 'O ativo "' + src.name + '" não é uma folha do Scene Blocking (elevações são geradas de uma célula de folha)');
            return { src, c: SB.get(id).sheet.cells[i], i };
        }
        /** Pré-visualização sem criar nada: opções efetivas, avisos e inclinação da câmera. */
        function plan(assetId, cell, options) {
            const { c, i } = sourceCell(assetId, cell), opts = E.normalizeOptions(options, c), res = E.resolve(c, opts);
            return { assetId, cell: i, views: opts.views.map((v) => ({ id: v, title: E.views().find((x) => x.id === v).title })), options: opts, resolved: res, cameraPitchDegrees: E.cameraPitch(c, res), warnings: E.warnings(c, res), unit: { H: E.H(), ground: E.ground() } };
        }
        async function generate(assetId, cell, options) {
            const { src, c, i } = sourceCell(assetId, cell), opts = E.normalizeOptions(options, c);
            if (S.assets.filter(a => a.sceneElevation?.sourceAssetId === assetId && a.sceneElevation.cellIndex === i).length >= LIMITS.maxPerSource)
                fail('LIMIT_EXCEEDED', 'No máximo ' + LIMITS.maxPerSource + ' elevações por célula; remova alguma antes');
            const meta = { sourceAssetId: assetId, sourceName: src.name, cellIndex: i, sourceHash: E.cellHash(c), cell: JSON.parse(JSON.stringify(c)), options: opts };
            const blob = blobOf(meta), pkg = A.ensureDefaultPackage(), warnings = [];
            const asset = { id: utils.uid('asset'), name: uniqueName('ELEVATIONS_' + src.name.replace(/\.svg$/i, '').replace(/[^A-Za-z0-9_\-() ]/g, '_').slice(0, 60) + '_CELL_' + pad2(i)), packageId: pkg, mimeType: SVG_MIME,
                originalWidth: 1800, originalHeight: 1800, size: blob.size, createdAt: Date.now(), updatedAt: Date.now(), derivedFrom: assetId, sceneElevation: plain(meta),
                operations: [{ processor: 'sceneElevation', operation: 'generate', params: { source: assetId, cell: i } }] };
            let persisted = false, url = '';
            try {
                await H.transaction('sceneElevation.generate', async () => {
                    if (backend.isAvailable()) {
                        await backend.put('blobs', asset.id, blob);
                        persisted = true;
                    }
                    url = URL.createObjectURL(blob);
                    A.blobs.set(asset.id, blob);
                    A.urls.set(asset.id, url);
                    A.missing.delete(asset.id);
                    S.assets.push(asset);
                    kernel.emit('assets:changed');
                    kernel.emit('state:changed');
                });
            }
            catch (e) {
                if (url)
                    URL.revokeObjectURL(url);
                A.blobs.delete(asset.id);
                A.urls.delete(asset.id);
                if (persisted) {
                    try {
                        await backend.del('blobs', asset.id);
                    }
                    catch (er) {
                        kernel.log.warn('limpeza de blob falhou', asset.id, er);
                    }
                }
                throw e;
            }
            const res = resolved(meta), saved = await save(warnings);
            kernel.emit('toast', { message: 'Vistas laterais criadas: ' + asset.name, kind: 'ok' });
            return { asset: summaryOf(asset), warnings: res.warnings, saved };
        }
        async function putMeta(a, m, label) {
            const blob = blobOf(m);
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
                a.sceneElevation = plain(m);
                kernel.emit('assets:changed');
                kernel.emit('state:changed');
            });
        }
        /** Copia de novo a célula de origem (a vista de cima mudou) mantendo as opções dos manequins que ainda existem. */
        async function refresh(assetId) {
            const a = assetOf(assetId), m = metaOf(a), st = statusOf(a, m);
            if (st.state === 'source-missing')
                fail('SOURCE_MISSING', 'A folha de origem não existe mais; não é possível atualizar');
            const { c } = sourceCell(m.sourceAssetId, m.cellIndex), src = S.assets.find(x => x.id === m.sourceAssetId);
            const chars = {};
            for (const ch of c.characters)
                if (m.options.characters[ch.id])
                    chars[ch.id] = m.options.characters[ch.id];
            const next = { ...m, sourceName: src.name, sourceHash: E.cellHash(c), cell: JSON.parse(JSON.stringify(c)), options: E.normalizeOptions({ ...m.options, characters: chars }, c) };
            await putMeta(a, next, 'sceneElevation.refresh');
            return summaryOf(a);
        }
        /** Altera views, frameAspect, variation, altura da câmera e, por manequim, altura/base/pose. `null` num manequim volta ao automático. */
        async function setOptions(assetId, patch) {
            const a = assetOf(assetId), m = metaOf(a);
            if (!patch || typeof patch !== 'object' || Array.isArray(patch))
                fail('INVALID_ARGUMENT', 'patch deve ser um objeto', 'patch');
            const p = patch, merged = { ...m.options };
            for (const k of ['views', 'frameAspect', 'variation'])
                if (p[k] !== undefined)
                    merged[k] = p[k];
            if ('cameraHeight' in p) {
                if (p['cameraHeight'] === null)
                    delete merged['cameraHeight'];
                else
                    merged['cameraHeight'] = p['cameraHeight'];
            }
            if (p['characters'] !== undefined) {
                if (!p['characters'] || typeof p['characters'] !== 'object' || Array.isArray(p['characters']))
                    fail('INVALID_ARGUMENT', 'characters deve ser um objeto', 'characters');
                const chars = { ...m.options.characters };
                for (const [id, v] of Object.entries(p['characters'])) {
                    if (v === null)
                        delete chars[id];
                    else
                        chars[id] = { ...(chars[id] ?? {}), ...v };
                }
                merged['characters'] = chars;
            }
            const opts = E.normalizeOptions(merged, m.cell), next = { ...m, options: opts };
            await putMeta(a, next, 'sceneElevation.set');
            return { id: a.id, options: opts, warnings: resolved(next).warnings };
        }
        const list = () => S.assets.filter(a => a.sceneElevation).map(summaryOf);
        function get(assetId) {
            const a = assetOf(assetId), m = metaOf(a), r = resolved(m), st = statusOf(a, m);
            return { id: a.id, name: a.name, sourceAssetId: m.sourceAssetId, cell: m.cellIndex, state: st.state, options: m.options, resolved: r.res, warnings: r.warnings, cameraPitchDegrees: E.cameraPitch(m.cell, r.res),
                characters: m.cell.characters.map(ch => ({ id: ch.id, x: ch.x, y: ch.y, rotation: ch.rotation, topZ: round(E.topOf(m.cell, r.res, ch)) })), camera: { x: m.cell.camera.x, y: m.cell.camera.y, z: round(r.res.cameraHeight * E.H()), elevation: m.cell.camera.elevationLevel } };
        }
        const round = core.round2;
        const status = (assetId) => { const a = assetOf(assetId); return statusOf(a, metaOf(a)); };
        /* ------------------------------ exportação ------------------------------ */
        function viewOf(m, view) {
            if (typeof view !== 'string' || !m.options.views.includes(view))
                return fail('INVALID_ARGUMENT', 'view deve ser uma das vistas geradas: ' + m.options.views.join(', '), 'view');
            return view;
        }
        const exportSvg = async (assetId) => E.renderSheet(metaOf(assetOf(assetId)));
        const exportViewSvg = async (assetId, view) => { const m = metaOf(assetOf(assetId)); return E.renderViewDocument(m, viewOf(m, view)); };
        async function rasterize(svg, size, scale) {
            if (!isFinite(scale) || scale < 0.25 || scale > LIMITS.maxPngScale)
                fail('INVALID_ARGUMENT', 'scale deve ser de 0.25 a ' + LIMITS.maxPngScale, 'scale');
            const url = URL.createObjectURL(new Blob([svg], { type: SVG_MIME }));
            try {
                const img = new Image();
                img.decoding = 'sync';
                await new Promise((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('O navegador não conseguiu desenhar o SVG')); img.src = url; });
                const px = Math.round(size * scale), c = document.createElement('canvas');
                c.width = px;
                c.height = px;
                c.getContext('2d').drawImage(img, 0, 0, px, px);
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
        async function exportPng(assetId, opts = {}) {
            const m = metaOf(assetOf(assetId)), scale = opts.scale ?? 1;
            return opts.view === undefined ? rasterize(E.renderSheet(m), 1800, scale) : rasterize(E.renderViewDocument(m, viewOf(m, opts.view)), 600, scale);
        }
        async function exportZip(assetId, opts = {}) {
            const a = assetOf(assetId), m = metaOf(a), format = opts.format ?? 'svg', enc = new TextEncoder(), files = [];
            if (format !== 'svg' && format !== 'png')
                fail('INVALID_ARGUMENT', 'format deve ser svg ou png', 'format');
            const base = a.name.replace(/\.svg$/i, '').replace(/[^A-Za-z0-9_\-() ]/g, '_').slice(0, 80) || 'ELEVATIONS';
            if (format === 'svg') {
                files.push({ name: base + '.svg', data: enc.encode(E.renderSheet(m)) });
                for (const v of m.options.views)
                    files.push({ name: base + '_' + v + '.svg', data: enc.encode(E.renderViewDocument(m, v)) });
            }
            else {
                files.push({ name: base + '.png', data: new Uint8Array(await (await exportPng(assetId, { scale: opts.scale ?? 1 })).arrayBuffer()) });
                for (const v of m.options.views)
                    files.push({ name: base + '_' + v + '.png', data: new Uint8Array(await (await exportPng(assetId, { view: v, scale: opts.scale ?? 1 })).arrayBuffer()) });
            }
            const zipped = R.zip(files), copy = new Uint8Array(zipped.length);
            copy.set(zipped);
            return new Blob([copy.buffer], { type: 'application/zip' });
        }
        kernel.provide('sceneElevationAssets', { limits: () => ({ ...LIMITS }), isElevationAsset, plan, generate, refresh, setOptions, list, get, status, exportSvg, exportViewSvg, exportPng, exportZip });
    }
});
