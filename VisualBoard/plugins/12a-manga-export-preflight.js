"use strict";
/* =====================================================================
 * Phase 6 — non-mutating export preflight for manga pages.
 * Checks every page and referenced active layer before any rendering.
 * ===================================================================== */
definePlugin({
    id: 'manga-export-preflight',
    version: '1.0.0',
    needs: ['state', 'panelSets', 'assets', 'mangaPage'],
    provides: ['mangaExportPreflight'],
    uses: [],
    accepts: { state: '^1.0.0', panelSets: '^1.0.0', assets: '^1.0.0', mangaPage: '^1.0.0' },
    contractVersions: { mangaExportPreflight: '1.0.0' },
    setup: async function (kernel) {
        const S = (await kernel.require('state')).data;
        const PS = await kernel.require('panelSets');
        const A = await kernel.require('assets');
        const MP = await kernel.require('mangaPage');
        const supported = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif']);
        function validate(pages) {
            const errors = [], warnings = [], refs = new Map();
            const metadata = new Map((S.assets || []).map(asset => [asset.id, asset]));
            const list = Array.isArray(pages) ? pages : [];
            const error = (code, message, pageId, assetId) => errors.push({
                code, message, pageId: pageId || null, assetId: assetId || null
            });
            const warn = (code, message, pageId, assetId) => warnings.push({
                code, message, pageId: pageId || null, assetId: assetId || null
            });
            if (!list.length)
                error('NO_PAGES', 'No manga pages were selected');
            const seen = new Set();
            for (const page of list) {
                if (!page || page.type !== 'manga-page' || typeof page.id !== 'string') {
                    error('INVALID_PAGE', 'Invalid manga page instance');
                    continue;
                }
                if (seen.has(page.id)) {
                    error('DUPLICATE_PAGE', 'The same page was selected more than once', page.id);
                    continue;
                }
                seen.add(page.id);
                const ps = PS.get(page.panelSetId);
                if (!ps) {
                    error('MISSING_TEMPLATE', 'Page template is missing: ' + page.panelSetId, page.id);
                    continue;
                }
                const integrity = MP.validatePage(page);
                for (const issue of integrity.errors) {
                    error('INVALID_PAGE', issue, page.id);
                }
                for (const issue of integrity.warnings) {
                    if (!/missing asset/.test(issue))
                        warn('PAGE_WARNING', issue, page.id);
                }
                const expected = new Set(ps.panels.map(p => p.id));
                const active = new Set((page.panels || []).map(p => p.id));
                for (const id of expected)
                    if (!active.has(id))
                        error('MISSING_PANEL', 'Page has no active panel ' + id, page.id);
                for (const p of page.panels || [])
                    if (!expected.has(p.id))
                        error('UNKNOWN_PANEL', 'Page has unknown panel ' + p.id, page.id);
                if ((page.unassignedPanels || []).some(p => (p.layers || []).length)) {
                    warn('ARCHIVED_LAYERS', 'Some saved layers have no destination panel and are not exported', page.id);
                }
                function inspectLayer(layer, origin) {
                    if (!layer || typeof layer.assetId !== 'string' || !layer.assetId) {
                        error('INVALID_LAYER', 'Layer without assetId at ' + origin, page.id);
                        return;
                    }
                    const id = layer.assetId;
                    const asset = metadata.get(id);
                    if (!asset) {
                        error('MISSING_ASSET', 'Missing image metadata: ' + id + ' (' + origin + ')', page.id, id);
                        return;
                    }
                    if (!supported.has(asset.mimeType || '')) {
                        error('UNSUPPORTED_IMAGE', 'Unsupported image type ' + asset.mimeType + ': ' + (asset.name || id), page.id, id);
                        return;
                    }
                    const url = A.urls.get(id);
                    if (typeof url !== 'string' || !url) {
                        error('MISSING_BLOB', 'Image file unavailable: ' + (asset.name || id) + ' [' + id + ']', page.id, id);
                        return;
                    }
                    if (!refs.has(id))
                        refs.set(id, { id, name: asset.name || id, url });
                }
                for (const p of page.panels || []) {
                    if (!expected.has(p.id))
                        continue;
                    for (const layer of p.layers || [])
                        inspectLayer(layer, 'panel ' + p.id);
                }
                for (const layer of page.overlays || [])
                    inspectLayer(layer, 'overlay');
            }
            return { valid: errors.length === 0, errors, warnings,
                pages: list.map(p => p && p.id || null), assets: Array.from(refs.values()) };
        }
        kernel.provide('mangaExportPreflight', { validate });
    }
});
