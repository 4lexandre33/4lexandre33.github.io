"use strict";
/**
 * TS-005 — independent, opt-in domain validation; pure functions and no IO.
 * Compiles to a classic script. NOT loaded by index.html until a later
 * explicitly approved runtime integration. Current projectFormat ABI unchanged.
 */
var NVBDomain;
(function (NVBDomain) {
    NVBDomain.FORMAT = 'narrative-visual-board';
    NVBDomain.MAX_VERSION = 3;
    const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
    const finite = (value) => typeof value === 'number' && Number.isFinite(value);
    const string = (value) => typeof value === 'string';
    const boolean = (value) => typeof value === 'boolean';
    const id = (value) => typeof value === 'string';
    const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
    const issue = (issues, path, message) => {
        issues.push({ path, message });
    };
    const required = (value, key, check, issues, path) => {
        if (!check(value[key]))
            issue(issues, path + '.' + key, 'invalid or missing value');
    };
    const optional = (value, key, check, issues, path) => {
        if (own(value, key) && value[key] !== undefined && !check(value[key])) {
            issue(issues, path + '.' + key, 'invalid optional value');
        }
    };
    const nullableId = (value) => value === null || id(value);
    /** A strict schema check for newly produced normalized documents.
     * It never mutates, drops unknown keys, or changes any serialized data.
     * Historical documents should first use prepareEnvelope (compatibility path).
     */
    function validateProjectDocument(value) {
        const issues = [];
        if (!record(value)) {
            return { valid: false, issues: [{ path: 'project', message: 'expected object' }] };
        }
        const doc = value;
        if (!record(doc.meta))
            issue(issues, 'project.meta', 'expected object');
        else {
            required(doc.meta, 'id', id, issues, 'project.meta');
            optional(doc.meta, 'name', string, issues, 'project.meta');
            optional(doc.meta, 'createdAt', finite, issues, 'project.meta');
            optional(doc.meta, 'updatedAt', finite, issues, 'project.meta');
            optional(doc.meta, 'version', finite, issues, 'project.meta');
        }
        if (!Array.isArray(doc.boards))
            issue(issues, 'project.boards', 'expected array');
        if (!Array.isArray(doc.assets))
            issue(issues, 'project.assets', 'expected array');
        if (!Array.isArray(doc.packages))
            issue(issues, 'project.packages', 'expected array');
        if (!Array.isArray(doc.panelSets))
            issue(issues, 'project.panelSets', 'expected array');
        required(doc, 'rootBoardId', nullableId, issues, 'project');
        if (!record(doc.settings))
            issue(issues, 'project.settings', 'expected object');
        else
            optional(doc.settings, 'lastBoardId', nullableId, issues, 'project.settings');
        const unique = (items, path, handler) => {
            if (!Array.isArray(items))
                return;
            const seen = new Set();
            items.forEach((item, index) => {
                const p = path + '[' + index + ']';
                if (!record(item)) {
                    issue(issues, p, 'expected object');
                    return;
                }
                if (!id(item.id))
                    issue(issues, p + '.id', 'missing string id');
                else if (seen.has(item.id))
                    issue(issues, p + '.id', 'duplicate id');
                else
                    seen.add(item.id);
                handler(item, p);
            });
        };
        const point = (value, p) => {
            if (!record(value)) {
                issue(issues, p, 'expected point');
                return;
            }
            required(value, 'x', finite, issues, p);
            required(value, 'y', finite, issues, p);
        };
        const points = (value, p) => {
            if (!Array.isArray(value)) {
                issue(issues, p, 'expected points array');
                return;
            }
            value.forEach((pt, i) => point(pt, p + '[' + i + ']'));
        };
        const layer = (value, p) => {
            if (!record(value)) {
                issue(issues, p, 'expected layer');
                return;
            }
            required(value, 'id', id, issues, p);
            required(value, 'assetId', id, issues, p);
            for (const key of ['x', 'y', 'width', 'height'])
                required(value, key, finite, issues, p);
            for (const key of ['rotation', 'opacity', 'zIndex'])
                optional(value, key, finite, issues, p);
            if (finite(value.opacity) && (value.opacity < 0 || value.opacity > 1))
                issue(issues, p + '.opacity', 'outside [0,1]');
        };
        const layers = (value, p) => {
            if (!Array.isArray(value)) {
                issue(issues, p, 'expected layers array');
                return;
            }
            value.forEach((l, i) => layer(l, p + '[' + i + ']'));
        };
        const mangaPanels = (value, p, archived) => {
            if (!Array.isArray(value)) {
                issue(issues, p, 'expected panels array');
                return;
            }
            value.forEach((v, i) => {
                const q = p + '[' + i + ']';
                if (!record(v)) {
                    issue(issues, q, 'expected panel');
                    return;
                }
                required(v, 'id', id, issues, q);
                if (archived) {
                    required(v, 'sourcePanelId', id, issues, q);
                    required(v, 'sourcePanelSetId', id, issues, q);
                }
                layers(v.layers, q + '.layers');
            });
        };
        unique(doc.boards, 'project.boards', (b, p) => {
            optional(b, 'name', string, issues, p);
            optional(b, 'parentBoardId', nullableId, issues, p);
            for (const key of ['createdAt', 'updatedAt'])
                optional(b, key, finite, issues, p);
            if (!record(b.camera))
                issue(issues, p + '.camera', 'expected camera');
            else {
                point(b.camera, p + '.camera');
                required(b.camera, 'zoom', finite, issues, p + '.camera');
            }
            if (!Array.isArray(b.instances)) {
                issue(issues, p + '.instances', 'expected array');
                return;
            }
            b.instances.forEach((v, i) => {
                const q = p + '.instances[' + i + ']';
                if (!record(v)) {
                    issue(issues, q, 'expected instance');
                    return;
                }
                required(v, 'id', id, issues, q);
                for (const key of ['x', 'y', 'width', 'height'])
                    required(v, key, finite, issues, q);
                for (const key of ['zIndex', 'rotation'])
                    optional(v, key, finite, issues, q);
                for (const key of ['locked', 'visible'])
                    optional(v, key, boolean, issues, q);
                if (v.type === 'image')
                    required(v, 'assetId', id, issues, q);
                else if (v.type === 'board')
                    required(v, 'boardId', id, issues, q);
                else if (v.type === 'manga-page') {
                    required(v, 'panelSetId', id, issues, q);
                    mangaPanels(v.panels, q + '.panels', false);
                    if (v.overlays !== undefined)
                        layers(v.overlays, q + '.overlays');
                    if (v.unassignedPanels !== undefined)
                        mangaPanels(v.unassignedPanels, q + '.unassignedPanels', true);
                }
                else
                    issue(issues, q + '.type', 'unsupported instance discriminant');
            });
        });
        unique(doc.assets, 'project.assets', (a, p) => {
            optional(a, 'name', string, issues, p);
            optional(a, 'packageId', string, issues, p);
            optional(a, 'mimeType', string, issues, p);
            for (const key of ['originalWidth', 'originalHeight', 'size', 'createdAt', 'updatedAt'])
                optional(a, key, finite, issues, p);
            optional(a, 'derivedFrom', string, issues, p);
            if (a.operations !== undefined) {
                if (!Array.isArray(a.operations))
                    issue(issues, p + '.operations', 'expected array');
                else
                    a.operations.forEach((op, j) => {
                        const q = p + '.operations[' + j + ']';
                        if (!record(op))
                            issue(issues, q, 'expected operation');
                        else {
                            required(op, 'operation', string, issues, q);
                            optional(op, 'processor', string, issues, q);
                            if (op.params !== undefined && !record(op.params))
                                issue(issues, q + '.params', 'expected params object');
                        }
                    });
            }
        });
        unique(doc.packages, 'project.packages', (pck, p) => {
            optional(pck, 'name', string, issues, p);
            for (const key of ['order', 'createdAt', 'updatedAt'])
                optional(pck, key, finite, issues, p);
        });
        unique(doc.panelSets, 'project.panelSets', (ps, p) => {
            optional(ps, 'name', string, issues, p);
            required(ps, 'width', finite, issues, p);
            required(ps, 'height', finite, issues, p);
            optional(ps, 'svgSource', string, issues, p);
            for (const key of ['createdAt', 'updatedAt'])
                optional(ps, key, finite, issues, p);
            if (ps.viewBox !== undefined) {
                if (!record(ps.viewBox))
                    issue(issues, p + '.viewBox', 'expected viewBox');
                else
                    for (const key of ['minX', 'minY', 'width', 'height'])
                        required(ps.viewBox, key, finite, issues, p + '.viewBox');
            }
            if (!Array.isArray(ps.panels)) {
                issue(issues, p + '.panels', 'expected array');
                return;
            }
            ps.panels.forEach((v, i) => {
                const q = p + '.panels[' + i + ']';
                if (!record(v)) {
                    issue(issues, q, 'expected panel geometry');
                    return;
                }
                required(v, 'id', id, issues, q);
                points(v.points, q + '.points');
                if (v.contours !== undefined) {
                    if (!Array.isArray(v.contours))
                        issue(issues, q + '.contours', 'expected contour array');
                    else
                        v.contours.forEach((loop, j) => points(loop, q + '.contours[' + j + ']'));
                }
                if (v.fillRule !== undefined && v.fillRule !== 'evenodd' && v.fillRule !== 'nonzero')
                    issue(issues, q + '.fillRule', 'unknown fill rule');
                if (v.vector !== undefined) {
                    if (!record(v.vector))
                        issue(issues, q + '.vector', 'expected SVG vector');
                    else {
                        required(v.vector, 'd', string, issues, q + '.vector');
                        if (!Array.isArray(v.vector.matrix) || v.vector.matrix.length !== 6 ||
                            v.vector.matrix.some((n) => !finite(n)))
                            issue(issues, q + '.vector.matrix', 'expected 6 finite numeric elements');
                        optional(v.vector, 'sourceElement', string, issues, q + '.vector');
                        if (v.vector.fillRule !== undefined && v.vector.fillRule !== 'evenodd' &&
                            v.vector.fillRule !== 'nonzero')
                            issue(issues, q + '.vector.fillRule', 'unknown fill rule');
                    }
                }
            });
        });
        return issues.length ? { valid: false, issues } :
            { valid: true, value: value, issues: [] };
    }
    NVBDomain.validateProjectDocument = validateProjectDocument;
    /** Validate JSON tree separately from runtime-only caches. This can be used
     * before serializing unknown extension fields; never silently drops keys.
     */
    function validateSerializable(value) {
        const issues = [];
        const stack = new Set();
        const visit = (node, p) => {
            if (node === null || typeof node === 'string' || typeof node === 'boolean')
                return;
            if (finite(node))
                return;
            if (typeof node === 'number') {
                issue(issues, p, 'non-finite number');
                return;
            }
            if (!node || typeof node !== 'object') {
                issue(issues, p, 'not JSON serializable');
                return;
            }
            if (stack.has(node)) {
                issue(issues, p, 'circular reference');
                return;
            }
            // Preserve plain JSON objects across execution realms; reject DOM,
            // Blob, Map, Set, Date and custom class instances.
            if (!Array.isArray(node)) {
                const proto = Object.getPrototypeOf(node);
                if (Object.prototype.toString.call(node) !== '[object Object]' ||
                    (proto !== null && Object.getPrototypeOf(proto) !== null)) {
                    issue(issues, p, 'non-plain object (Blob/Map/Set/DOM not serializable)');
                    return;
                }
            }
            stack.add(node);
            if (Array.isArray(node))
                node.forEach((v, i) => visit(v, p + '[' + i + ']'));
            else
                Object.keys(node).forEach(key => visit(node[key], p + '.' + key));
            stack.delete(node);
        };
        visit(value, '$');
        return issues.length ? { valid: false, issues } :
            { valid: true, value: value, issues: [] };
    }
    NVBDomain.validateSerializable = validateSerializable;
    /** Preserve the exact project-format v1/v2/v3 acceptance boundary.
     * It is intentionally weaker than validateProjectDocument: older exports may
     * omit panelSets, packages, board camera, and instance.type.
     */
    function normalizeLegacyDocument(input) {
        if (!record(input))
            throw Error('Project document missing');
        if (!Array.isArray(input.boards))
            throw Error('Project format: invalid boards');
        if (!Array.isArray(input.assets))
            throw Error('Project format: invalid assets');
        const packages = input.packages == null ? [] : input.packages;
        const panelSets = input.panelSets == null ? [] : input.panelSets;
        if (!Array.isArray(packages))
            throw Error('Project format: invalid packages');
        if (!Array.isArray(panelSets))
            throw Error('Project format: invalid panelSets');
        const boardIds = new Set();
        const boards = input.boards.map((item) => {
            if (!record(item) || !id(item.id) || boardIds.has(item.id))
                throw Error('Invalid/duplicate board');
            boardIds.add(item.id);
            if (item.instances != null && !Array.isArray(item.instances))
                throw Error('Board instances must be an array');
            const instances = (item.instances == null ? [] : item.instances).map((inst) => {
                if (!record(inst))
                    return inst; // existing codec leaves null entries as-is
                return !inst.type ? { ...inst, type: 'image' } : inst;
            });
            return { ...item, instances, camera: item.camera || { x: 0, y: 0, zoom: 1 } };
        });
        const setIds = new Set();
        const normalizedSets = panelSets.map((item) => {
            if (!record(item) || !id(item.id) || setIds.has(item.id))
                throw Error('Invalid/duplicate panelSet');
            setIds.add(item.id);
            return item;
        });
        const assetIds = new Set();
        const normalizedAssets = input.assets.map((item) => {
            if (!record(item) || !id(item.id) || assetIds.has(item.id))
                throw Error('Invalid/duplicate asset');
            assetIds.add(item.id);
            return item;
        });
        const meta = record(input.meta) ? input.meta :
            { id: 'legacy-project', name: 'Untitled Project', version: NVBDomain.MAX_VERSION };
        return {
            ...input, meta, boards, assets: normalizedAssets,
            packages: packages,
            panelSets: normalizedSets,
            rootBoardId: input.rootBoardId || boards[0]?.id || null,
            settings: record(input.settings) ? input.settings : {}
        };
    }
    NVBDomain.normalizeLegacyDocument = normalizeLegacyDocument;
    /** Typed, side-effect-free analogue of the existing projectFormat.prepare().
     * It does not replace that runtime validator in TS-005. No binary decoding,
     * File API or existing browser storage is touched here.
     */
    function prepareEnvelope(payload) {
        if (!record(payload) || payload.format !== NVBDomain.FORMAT)
            throw Error('Not a VisualBoard project');
        if (!Number.isInteger(payload.version) || typeof payload.version !== 'number' ||
            payload.version < 1 || payload.version > NVBDomain.MAX_VERSION)
            throw Error('Unsupported project version');
        if (!record(payload.project) || !Array.isArray(payload.assets))
            throw Error('Malformed project envelope');
        const meta = [];
        const blobs = new Map();
        const keys = new Set();
        for (const item of payload.assets) {
            if (!record(item) || !id(item.id) || keys.has(item.id))
                throw Error('Duplicate or invalid asset in envelope');
            keys.add(item.id);
            const { data, ...asset } = item;
            if (data != null && (typeof data !== 'string' || !/^data:[^,]*;base64,/i.test(data)))
                throw Error('Invalid binary data for asset ' + item.id);
            if (data)
                blobs.set(item.id, data);
            meta.push(asset);
        }
        const doc = normalizeLegacyDocument({ ...payload.project, assets: meta });
        return { doc, blobs, version: payload.version };
    }
    NVBDomain.prepareEnvelope = prepareEnvelope;
    function inspectEnvelope(input) {
        try {
            return { valid: true, value: prepareEnvelope(input), issues: [] };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { valid: false, issues: [{ path: 'envelope', message }] };
        }
    }
    NVBDomain.inspectEnvelope = inspectEnvelope;
})(NVBDomain || (NVBDomain = {}));
