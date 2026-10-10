"use strict";
/* TS-009: typed live state preserving original initialization and update semantics. */
definePlugin({
    id: 'state',
    version: '1.0.0',
    needs: ['utils'],
    provides: ['state'],
    uses: [],
    accepts: { 'utils': '^1.0.0' },
    contractVersions: { 'state': '1.0.0' },
    setup: function (kernel) {
        const u = kernel.require('utils'); // returns Promise → we await below
        // Since we are inside setup (async-capable via promise chaining),
        // we can pull utils synchronously via the cached handle if available.
        // In this architecture `setup` is awaited, so use the async form:
        let utils = null;
        kernel.require('utils').then(u => { utils = u; });
        // Also expose directly to allow sync use after boot by other plugins.
        const state = {
            meta: {
                id: 'pending', name: 'Untitled Project',
                createdAt: Date.now(), updatedAt: Date.now(), version: 2
            },
            packages: [],
            assets: [],
            boards: [],
            rootBoardId: null,
            currentBoardId: null,
            settings: {},
            selection: new Set(),
            ui: {
                filterPackage: 'all',
                search: '',
                sort: 'name',
                expanded: new Set(),
                debug: false
            }
        };
        function getCurrentBoard() {
            for (const b of state.boards)
                if (b.id === state.currentBoardId)
                    return b;
            return state.boards[0] || null;
        }
        function getBoard(id) {
            for (const b of state.boards)
                if (b.id === id)
                    return b;
            return null;
        }
        function getAsset(id) {
            for (const a of state.assets)
                if (a.id === id)
                    return a;
            return null;
        }
        function getInstance(id) {
            const b = getCurrentBoard();
            if (!b)
                return null;
            for (const i of b.instances)
                if (i.id === id)
                    return i;
            return null;
        }
        function getPackage(id) {
            for (const p of state.packages)
                if (p.id === id)
                    return p;
            return null;
        }
        function currentInstances() {
            const b = getCurrentBoard();
            return b ? b.instances : [];
        }
        function nextZIndex() {
            let max = 0;
            for (const i of currentInstances())
                max = Math.max(max, i.zIndex || 0);
            return max + 1;
        }
        function uniqueAssetName(name, excludeId) {
            const base = name || 'Image';
            let c = base, n = 2;
            const taken = new Set(state.assets
                .filter(a => a.id !== excludeId).map(a => a.name.toLowerCase()));
            while (taken.has(c.toLowerCase())) {
                c = base + ' (' + n + ')';
                n++;
            }
            return c;
        }
        function uniquePackageName(name, excludeId) {
            const base = name || 'Package';
            let c = base, n = 2;
            const taken = new Set(state.packages
                .filter(p => p.id !== excludeId).map(p => p.name.toLowerCase()));
            while (taken.has(c.toLowerCase())) {
                c = base + ' (' + n + ')';
                n++;
            }
            return c;
        }
        function uniqueBoardName(name, excludeId) {
            const base = name || 'Board';
            let c = base, n = 2;
            const taken = new Set(state.boards
                .filter(b => b.id !== excludeId).map(b => b.name.toLowerCase()));
            while (taken.has(c.toLowerCase())) {
                c = base + ' (' + n + ')';
                n++;
            }
            return c;
        }
        function sortedPackages() {
            return state.packages.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
        }
        // Newly created state: bootstrap root board once utils resolves
        Promise.resolve().then(() => {
            if (!state.boards.length) {
                const uid = utils ? utils.uid : ((p) => p + '_' + Math.random().toString(36).slice(2, 9));
                const rootId = uid('board');
                state.boards.push({
                    id: rootId, name: 'Root Board', parentBoardId: null,
                    instances: [], camera: { x: 0, y: 0, zoom: 1 },
                    createdAt: Date.now(), updatedAt: Date.now()
                });
                state.rootBoardId = rootId;
                state.currentBoardId = rootId;
            }
        });
        kernel.provide('state', {
            data: state,
            getCurrentBoard, getBoard, getAsset, getInstance, getPackage,
            currentInstances, nextZIndex,
            uniqueAssetName, uniquePackageName, uniqueBoardName,
            sortedPackages
        });
    }
});
