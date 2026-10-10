"use strict";
definePlugin({
    id: 'packages',
    version: '1.0.0',
    needs: ['utils', 'state'],
    provides: ['packages'],
    uses: ['ui.dialogs', 'assets'],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'ui.dialogs': '^1.0.0', 'assets': '^1.0.0' },
    contractVersions: { 'packages': '1.0.0' },
    setup: async function (kernel) {
        const utils = await kernel.require('utils');
        const S = (await kernel.require('state')).data;
        function uniqueName(name, excludeId) {
            const base = name || 'Package';
            let c = base, n = 2;
            const taken = new Set(S.packages.filter(p => p.id !== excludeId).map(p => p.name.toLowerCase()));
            while (taken.has(c.toLowerCase())) {
                c = base + ' (' + n + ')';
                n++;
            }
            return c;
        }
        function create(name) {
            const p = {
                id: utils.uid('pkg'),
                name: uniqueName(name),
                order: S.packages.length
                    ? Math.max.apply(null, S.packages.map(x => x.order || 0)) + 1
                    : 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            S.packages.push(p);
            kernel.emit('packages:changed');
            return p.id;
        }
        function rename(id, name) {
            const p = S.packages.find(x => x.id === id);
            if (!p)
                return;
            p.name = uniqueName(name, id);
            p.updatedAt = Date.now();
            kernel.emit('packages:changed');
        }
        async function remove(id) {
            const p = S.packages.find(x => x.id === id);
            if (!p)
                return;
            const assets = S.assets.filter(a => a.packageId === id);
            const ok = await kernel.call('ui.dialogs', 'confirm', {
                title: 'Delete package',
                message: 'Delete "' + p.name + '"' + (assets.length ? ' and its ' + assets.length + ' image(s)?' : '?'),
                danger: true
            });
            if (!ok)
                return;
            const doomed = new Set(assets.map(a => a.id));
            for (const b of S.boards)
                b.instances = b.instances.filter(i => !doomed.has(i.assetId));
            S.assets = S.assets.filter(a => !doomed.has(a.id));
            S.packages = S.packages.filter(x => x.id !== id);
            const A = await kernel.require('assets');
            for (const aid of doomed) {
                const u = A.urls.get(aid);
                if (u) {
                    URL.revokeObjectURL(u);
                    A.urls.delete(aid);
                }
                A.blobs.delete(aid);
            }
            kernel.emit('packages:changed');
            kernel.emit('assets:changed');
            kernel.emit('state:changed');
        }
        function move(id, delta) {
            const sorted = S.packages.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
            const i = sorted.findIndex(p => p.id === id);
            const j = i + delta;
            if (i < 0 || j < 0 || j >= sorted.length)
                return;
            const tmp = sorted[i];
            sorted[i] = sorted[j];
            sorted[j] = tmp;
            sorted.forEach((p, k) => p.order = k);
            kernel.emit('packages:changed');
        }
        function assetsOf(packageId) {
            return S.assets.filter(a => a.packageId === packageId);
        }
        kernel.provide('packages', { create, rename, remove, move, assetsOf });
    }
});
