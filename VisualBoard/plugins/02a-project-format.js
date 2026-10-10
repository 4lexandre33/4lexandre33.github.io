"use strict";
/* Phase 7: versioned project envelope and lossless v2→v3 migration. */
definePlugin({
    id: 'project-format',
    version: '1.0.0',
    needs: [],
    provides: ['projectFormat'],
    uses: [],
    accepts: {},
    contractVersions: { projectFormat: '1.0.0' },
    setup: async function (kernel) {
        const FORMAT = 'narrative-visual-board', VERSION = 3;
        function validArray(value, label) {
            if (!Array.isArray(value))
                throw Error('Project format: invalid ' + label);
            return value;
        }
        function normalize(doc) {
            if (!doc || typeof doc !== 'object' || Array.isArray(doc))
                throw Error('Project document missing');
            const input = doc;
            const boards = validArray(input.boards, 'boards');
            const assets = validArray(input.assets, 'assets');
            const packages = input.packages == null ? [] : validArray(input.packages, 'packages');
            const panelSets = input.panelSets == null ? [] : validArray(input.panelSets, 'panelSets');
            const ids = new Set();
            for (const board of boards) {
                if (!board || typeof board.id !== 'string' || ids.has(board.id))
                    throw Error('Invalid/duplicate board');
                ids.add(board.id);
                if (board.instances == null)
                    board.instances = [];
                if (!Array.isArray(board.instances))
                    throw Error('Board instances must be an array');
                if (!board.camera)
                    board.camera = { x: 0, y: 0, zoom: 1 };
                for (const inst of board.instances)
                    if (inst && !inst.type)
                        inst.type = 'image';
            }
            const psIds = new Set();
            for (const panelSet of panelSets) {
                if (!panelSet || typeof panelSet.id !== 'string' || psIds.has(panelSet.id))
                    throw Error('Invalid/duplicate panelSet');
                psIds.add(panelSet.id);
            }
            const assetIds = new Set();
            for (const asset of assets) {
                if (!asset || typeof asset.id !== 'string' || assetIds.has(asset.id))
                    throw Error('Invalid/duplicate asset');
                assetIds.add(asset.id);
            }
            // Preserve unrecognized fields; avoid dropping future extensions in a v3 roundtrip.
            return Object.assign({}, doc, {
                meta: input.meta && typeof input.meta === 'object' ? input.meta : { id: 'legacy-project', name: 'Untitled Project', version: VERSION },
                packages, assets, boards, panelSets,
                rootBoardId: (input.rootBoardId || boards[0]?.id || null),
                settings: input.settings && typeof input.settings === 'object' ? input.settings : {}
            });
        }
        function prepare(payload) {
            const candidate = payload;
            if (!candidate || candidate.format !== FORMAT)
                throw Error('Not a VisualBoard project');
            if (!Number.isInteger(candidate.version) || typeof candidate.version !== 'number' || candidate.version < 1 || candidate.version > VERSION)
                throw Error('Unsupported project version');
            if (!candidate.project || typeof candidate.project !== 'object' || !Array.isArray(candidate.assets))
                throw Error('Malformed project envelope');
            const meta = [], blobs = new Map(), keys = new Set();
            for (const item of candidate.assets) {
                if (!item || typeof item.id !== 'string' || keys.has(item.id))
                    throw Error('Duplicate or invalid asset in envelope');
                keys.add(item.id);
                const { data, ...asset } = item;
                if (data != null && (typeof data !== 'string' || !/^data:[^,]*;base64,/i.test(data)))
                    throw Error('Invalid binary data for asset ' + item.id);
                if (data)
                    blobs.set(item.id, data);
                meta.push(asset);
            }
            const doc = normalize(Object.assign({}, candidate.project, { assets: meta }));
            return { doc, blobs, version: candidate.version };
        }
        function envelope(doc, assetsWithData) {
            const normalized = normalize(doc);
            if (!Array.isArray(assetsWithData) || assetsWithData.length !== normalized.assets.length)
                throw Error('Project backup missing one or more asset entries');
            const expected = new Set(normalized.assets.map(a => a.id));
            for (const a of assetsWithData) {
                if (!expected.delete(a.id))
                    throw Error('Extra or duplicate backup asset');
                if (typeof a.data !== 'string' || !a.data.startsWith('data:'))
                    throw Error('Binary data missing for ' + a.id);
            }
            if (expected.size)
                throw Error('Incomplete backup assets');
            const project = Object.assign({}, normalized);
            delete project.assets; // binaries belong to the envelope's assets collection
            return {
                format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(),
                project, assets: assetsWithData
            };
        }
        kernel.provide('projectFormat', { normalize, prepare, envelope });
    }
});
