"use strict";
/* =====================================================================
 * Phase 4 — pure-ish manga-panel migration, no UI or storage access.
 * Keeps unmatched layers in page.unassignedPanels instead of deleting them.
 * ===================================================================== */
definePlugin({
    id: 'panel-migration',
    version: '1.0.0',
    needs: ['utils'],
    provides: ['panelMigration'],
    uses: [],
    accepts: { 'utils': '^1.0.0' },
    contractVersions: { 'panelMigration': '1.0.0' },
    setup: async function (kernel) {
        const utils = await kernel.require('utils');
        const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
        const cloneLayers = (arr) => arr.map(layer => Object.assign({}, layer));
        const orderLayers = (arr) => arr.slice().sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
        const normalize = (arr) => arr.forEach((layer, index) => { layer.zIndex = index + 1; });
        const currentArchive = (inst) => Array.isArray(inst.unassignedPanels) ? inst.unassignedPanels : [];
        const panelIds = (ps) => new Set((ps && ps.panels || []).map(p => p.id));
        function validatePage(inst, ps, assets) {
            const errors = [], warnings = [];
            if (!inst || inst.type !== 'manga-page') {
                return { valid: false, errors: ['not a manga-page'], warnings: [] };
            }
            if (!ps || !Number.isFinite(ps.width) || ps.width <= 0 ||
                !Number.isFinite(ps.height) || ps.height <= 0 ||
                !Array.isArray(ps.panels) || !ps.panels.length) {
                errors.push('invalid or missing panel set');
            }
            const allowed = new Set();
            if (ps && Array.isArray(ps.panels)) {
                for (const panel of ps.panels) {
                    if (!panel || typeof panel.id !== 'string' || allowed.has(panel.id)) {
                        errors.push('duplicate or missing panel-set id');
                        continue;
                    }
                    allowed.add(panel.id);
                    if (!Array.isArray(panel.points) || panel.points.length < 3 ||
                        panel.points.some(pt => !pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y))) {
                        errors.push('invalid geometry for ' + panel.id);
                    }
                    if (panel.contours != null) {
                        if (!Array.isArray(panel.contours) || !panel.contours.length ||
                            panel.contours.some(loop => !Array.isArray(loop) || loop.length < 3 ||
                                loop.some(pt => !pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)))) {
                            errors.push('invalid compound geometry for ' + panel.id);
                        }
                    }
                    if (panel.fillRule != null && !['evenodd', 'nonzero'].includes(panel.fillRule)) {
                        errors.push('invalid fill rule for ' + panel.id);
                    }
                    if (panel.vector != null) {
                        const v = panel.vector;
                        if (!v || typeof v.d !== 'string' || !v.d.trim() ||
                            !Array.isArray(v.matrix) || v.matrix.length !== 6 ||
                            v.matrix.some(value => !Number.isFinite(value))) {
                            errors.push('invalid original vector path/matrix for ' + panel.id);
                        }
                    }
                }
            }
            if (!Array.isArray(inst.panels))
                errors.push('page.panels must be an array');
            if (inst.unassignedPanels != null && !Array.isArray(inst.unassignedPanels)) {
                errors.push('unassignedPanels must be an array');
            }
            if (inst.overlays != null && !Array.isArray(inst.overlays))
                errors.push('overlays must be an array');
            const seenPanels = new Set(), seenLayers = new Set(), seenArchived = new Set();
            const assetIds = assets ? new Set(assets.map(a => a.id)) : null;
            function validateLayers(arr, context) {
                if (!Array.isArray(arr)) {
                    errors.push(context + ' layers must be an array');
                    return;
                }
                for (let index = 0; index < arr.length; index++) {
                    const layer = arr[index];
                    if (!layer || typeof layer.id !== 'string' || !layer.id.trim() || seenLayers.has(layer.id)) {
                        errors.push(context + ' duplicate/invalid layer id');
                        continue;
                    }
                    seenLayers.add(layer.id);
                    if (typeof layer.assetId !== 'string' || !layer.assetId)
                        errors.push(layer.id + ': invalid assetId');
                    else if (assetIds && !assetIds.has(layer.assetId))
                        warnings.push(layer.id + ': missing asset ' + layer.assetId);
                    if (!Number.isFinite(layer.x) || !Number.isFinite(layer.y) ||
                        !Number.isFinite(layer.width) || !Number.isFinite(layer.height) ||
                        layer.width <= 0 || layer.height <= 0 ||
                        !Number.isFinite(layer.rotation || 0) ||
                        !Number.isFinite(layer.opacity == null ? 1 : layer.opacity) ||
                        (layer.opacity != null && (layer.opacity < 0 || layer.opacity > 1))) {
                        errors.push(layer.id + ': invalid geometry/opacity');
                    }
                    if (layer.zIndex !== index + 1)
                        warnings.push(layer.id + ': non-canonical zIndex');
                }
            }
            for (const p of inst.panels || []) {
                if (!p || typeof p.id !== 'string' || seenPanels.has(p.id)) {
                    errors.push('duplicate/invalid panel id');
                    continue;
                }
                seenPanels.add(p.id);
                if (!allowed.has(p.id))
                    warnings.push('panel ' + p.id + ' not in current panel set');
                validateLayers(p.layers, 'panel ' + p.id);
            }
            for (const id of allowed)
                if (!seenPanels.has(id))
                    warnings.push('missing active panel ' + id);
            validateLayers(inst.overlays || [], 'overlay');
            for (const entry of currentArchive(inst)) {
                if (!entry || typeof entry.id !== 'string' || seenArchived.has(entry.id) ||
                    typeof entry.sourcePanelId !== 'string' ||
                    typeof entry.sourcePanelSetId !== 'string') {
                    errors.push('invalid/duplicate archived panel');
                    continue;
                }
                seenArchived.add(entry.id);
                validateLayers(entry.layers, 'archived panel ' + entry.id);
            }
            return { valid: errors.length === 0, errors, warnings };
        }
        function plan(inst, oldPs, newPs, options) {
            if (!inst || inst.type !== 'manga-page' || !oldPs || !newPs ||
                !Array.isArray(newPs.panels) || !newPs.panels.length ||
                !Array.isArray(inst.panels))
                throw new Error('Missing page/panel set');
            if (inst.panelSetId !== oldPs.id)
                throw new Error('Source panel set mismatch');
            const selected = (options && options.mapping) || {};
            if (!selected || typeof selected !== 'object' || Array.isArray(selected)) {
                throw new TypeError('Mapping must be a dictionary of old panel ID to target ID or null');
            }
            const targetIds = panelIds(newPs), oldIds = new Set(inst.panels.map(p => p.id));
            for (const key of Object.keys(selected)) {
                if (!oldIds.has(key))
                    throw new Error('Unknown source panel: ' + key);
                if (selected[key] !== null && !targetIds.has(selected[key])) {
                    throw new Error('Unknown destination panel for ' + key);
                }
            }
            const mapping = Object.create(null), reserved = new Set();
            for (const old of inst.panels) {
                if (own(selected, old.id)) {
                    mapping[old.id] = selected[old.id];
                    if (mapping[old.id] != null)
                        reserved.add(mapping[old.id]);
                }
            }
            for (const old of inst.panels) {
                if (own(mapping, old.id))
                    continue;
                if (targetIds.has(old.id) && !reserved.has(old.id)) {
                    mapping[old.id] = old.id;
                    reserved.add(old.id);
                }
            }
            inst.panels.forEach((old, index) => {
                if (own(mapping, old.id))
                    return;
                const candidate = newPs.panels[index];
                if (candidate && !reserved.has(candidate.id)) {
                    mapping[old.id] = candidate.id;
                    reserved.add(candidate.id);
                }
                else {
                    const next = newPs.panels.find(p => !reserved.has(p.id));
                    mapping[old.id] = next ? next.id : null;
                    if (next)
                        reserved.add(next.id);
                }
            });
            const mapped = [], unassigned = [];
            for (const p of inst.panels) {
                const item = { sourcePanelId: p.id, targetPanelId: mapping[p.id], layerCount: (p.layers || []).length };
                (item.targetPanelId == null ? unassigned : mapped).push(item);
            }
            return { mapping, mapped, unassigned,
                previouslyUnassigned: currentArchive(inst).reduce((sum, p) => sum + p.layers.length, 0) };
        }
        function layerIds(inst) {
            const names = [];
            for (const p of inst.panels || [])
                for (const l of p.layers || [])
                    names.push(l.id);
            for (const p of currentArchive(inst))
                for (const l of p.layers || [])
                    names.push(l.id);
            for (const l of inst.overlays || [])
                names.push(l.id);
            return names.sort();
        }
        function equalIds(a, b) {
            return a.length === b.length && a.every((id, i) => id === b[i]);
        }
        function migrate(inst, oldPs, newPs, options, assets) {
            const before = validatePage(inst, oldPs, assets);
            if (!before.valid)
                throw new Error('Invalid source page: ' + before.errors.join('; '));
            const proposal = plan(inst, oldPs, newPs, options);
            const nextPanels = newPs.panels.map(p => ({ id: p.id, layers: [] }));
            const lookup = new Map(nextPanels.map(p => [p.id, p]));
            const archived = currentArchive(inst).map(p => Object.assign({}, p, { layers: cloneLayers(p.layers) }));
            const priorIds = layerIds(inst);
            for (const p of inst.panels) {
                const destination = proposal.mapping[p.id];
                const layers = cloneLayers(orderLayers(p.layers));
                if (destination === null) {
                    // Empty panels need no recovery record, avoiding phantom archive rows.
                    if (layers.length)
                        archived.push({ id: utils.uid('unassigned'), sourcePanelId: p.id,
                            sourcePanelSetId: inst.panelSetId, layers });
                }
                else {
                    lookup.get(destination).layers.push(...layers);
                }
            }
            nextPanels.forEach(p => normalize(p.layers));
            archived.forEach(p => normalize(p.layers));
            const preview = Object.assign({}, inst, {
                panelSetId: newPs.id, panels: nextPanels, unassignedPanels: archived
            });
            const after = validatePage(preview, newPs, assets);
            if (!after.valid)
                throw new Error('Invalid migrated page: ' + after.errors.join('; '));
            if (!equalIds(priorIds, layerIds(preview)))
                throw new Error('Migration would lose or duplicate layers');
            return { panels: nextPanels, unassignedPanels: archived, mapping: proposal.mapping,
                warnings: after.warnings, preservedLayerCount: priorIds.length };
        }
        function recover(inst, ps, archiveId, targetPanelId, assets) {
            const before = validatePage(inst, ps, assets);
            if (!before.valid)
                throw new Error('Invalid page before recovery: ' + before.errors.join('; '));
            const archives = currentArchive(inst);
            const from = archives.findIndex(p => p.id === archiveId);
            const to = (inst.panels || []).find(p => p.id === targetPanelId);
            if (from === -1 || !to || !panelIds(ps).has(targetPanelId))
                return null;
            const beforeIds = layerIds(inst);
            const panels = inst.panels.map(p => ({ id: p.id, layers: cloneLayers(p.layers) }));
            const archived = archives.filter(p => p.id !== archiveId).map(p => Object.assign({}, p, { layers: cloneLayers(p.layers) }));
            const destination = panels.find(p => p.id === targetPanelId);
            destination.layers.push(...cloneLayers(orderLayers(archives[from].layers)));
            normalize(destination.layers);
            const preview = Object.assign({}, inst, { panels, unassignedPanels: archived });
            const after = validatePage(preview, ps, assets);
            if (!after.valid)
                throw new Error('Invalid recovery result: ' + after.errors.join('; '));
            if (!equalIds(beforeIds, layerIds(preview)))
                throw new Error('Recovery would lose or duplicate layers');
            return { panels, unassignedPanels: archived, restored: archives[from].layers.length };
        }
        kernel.provide('panelMigration', { plan, migrate, recover, validatePage });
    }
});
