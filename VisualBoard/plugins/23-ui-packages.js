"use strict";
/** TS-016: strictly typed UI adapter, preserves classic-script behavior and ABI. */
definePlugin({
    id: 'ui.packages',
    version: '1.0.0',
    needs: ['state', 'packages', 'assets', 'ui.dialogs'],
    provides: ['ui.packages'],
    uses: ['history'],
    accepts: { 'state': '^1.0.0', 'packages': '^1.0.0', 'assets': '^1.0.0', 'ui.dialogs': '^1.0.0', 'history': '^1.0.0' },
    contractVersions: { 'ui.packages': '1.0.0' },
    setup: async function (kernel) {
        const S = await kernel.require('state');
        const P = await kernel.require('packages');
        const A = await kernel.require('assets');
        const D = await kernel.require('ui.dialogs');
        const host = document.getElementById('package-list');
        document.querySelectorAll('[data-cmd="new-package"]').forEach(b => {
            b.addEventListener('click', async () => {
                const name = await D.prompt({ title: 'New package', input: 'New Package', confirmText: 'Create' });
                if (!name)
                    return;
                const before = await kernel.call('history', 'snapshot');
                P.create(name);
                await kernel.call('history', 'push', before);
            });
        });
        function render() {
            host.innerHTML = '';
            const list = S.data.packages.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
            if (!list.length) {
                const e = document.createElement('div');
                e.className = 'empty-hint';
                e.textContent = 'No packages yet. Create one to organize your library.';
                host.appendChild(e);
                return;
            }
            list.forEach((pkg, i) => host.appendChild(row(pkg, i, list.length)));
        }
        function row(pkg, index, total) {
            const wrap = document.createElement('div');
            wrap.className = 'pkg';
            wrap.dataset.packageId = pkg.id;
            const head = document.createElement('div');
            head.className = 'pkg-head';
            const toggle = document.createElement('button');
            toggle.className = 'pkg-toggle' + (S.data.ui.expanded.has(pkg.id) ? ' open' : '');
            toggle.textContent = '▶';
            head.appendChild(toggle);
            const name = document.createElement('div');
            name.className = 'pkg-name';
            name.textContent = pkg.name;
            name.title = pkg.name;
            head.appendChild(name);
            const cnt = document.createElement('span');
            cnt.className = 'pkg-count';
            cnt.textContent = String(P.assetsOf(pkg.id).length);
            head.appendChild(cnt);
            const actions = document.createElement('div');
            actions.className = 'pkg-actions';
            const mk = (lbl, title, act, danger) => {
                const b = document.createElement('button');
                b.textContent = lbl;
                b.title = title;
                b.dataset.act = act;
                if (danger)
                    b.className = 'danger';
                return b;
            };
            const up = mk('↑', 'Move up', 'up');
            const dn = mk('↓', 'Move down', 'down');
            const rn = mk('✎', 'Rename', 'rename');
            const dl = mk('🗑', 'Delete', 'delete', true);
            up.disabled = index === 0;
            dn.disabled = index === total - 1;
            [up, dn, rn, dl].forEach(b => actions.appendChild(b));
            head.appendChild(actions);
            wrap.appendChild(head);
            const box = document.createElement('div');
            box.className = 'pkg-assets';
            box.hidden = !S.data.ui.expanded.has(pkg.id);
            const list = P.assetsOf(pkg.id);
            if (!list.length) {
                const e = document.createElement('div');
                e.className = 'pkg-empty';
                e.textContent = 'Empty package';
                box.appendChild(e);
            }
            else {
                for (const a of list) {
                    const im = document.createElement('img');
                    im.title = a.name || '';
                    im.alt = a.name || '';
                    const u = A.urls.get(a.id);
                    if (u)
                        im.src = u;
                    im.draggable = true;
                    im.addEventListener('dragstart', e => {
                        e.dataTransfer.setData('application/x-nvb-asset', a.id);
                        e.dataTransfer.effectAllowed = 'copyMove';
                    });
                    im.addEventListener('click', ev => { ev.stopPropagation(); D.openPreview(a); });
                    box.appendChild(im);
                }
            }
            wrap.appendChild(box);
            head.addEventListener('click', async (e) => {
                const target = e.target;
                const act = target && target.dataset ? target.dataset.act : null;
                if (!act) {
                    if (S.data.ui.expanded.has(pkg.id))
                        S.data.ui.expanded.delete(pkg.id);
                    else
                        S.data.ui.expanded.add(pkg.id);
                    box.hidden = !S.data.ui.expanded.has(pkg.id);
                    toggle.classList.toggle('open', S.data.ui.expanded.has(pkg.id));
                    return;
                }
                e.stopPropagation();
                if (act === 'up')
                    P.move(pkg.id, -1);
                else if (act === 'down')
                    P.move(pkg.id, 1);
                else if (act === 'rename') {
                    const name = await D.prompt({ title: 'Rename package', input: pkg.name, confirmText: 'Rename' });
                    if (name)
                        P.rename(pkg.id, name);
                }
                else if (act === 'delete')
                    P.remove(pkg.id);
            });
            wrap.addEventListener('dragover', e => {
                if (Array.from(e.dataTransfer?.types || []).indexOf('application/x-nvb-asset') !== -1) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    wrap.classList.add('drop-target');
                }
            });
            wrap.addEventListener('dragleave', () => wrap.classList.remove('drop-target'));
            wrap.addEventListener('drop', async (e) => {
                const id = e.dataTransfer?.getData('application/x-nvb-asset');
                if (!id)
                    return;
                e.preventDefault();
                e.stopPropagation();
                wrap.classList.remove('drop-target');
                const asset = S.data.assets.find(a => a.id === id);
                if (asset && asset.packageId !== pkg.id) {
                    const before = await kernel.call('history', 'snapshot');
                    asset.packageId = pkg.id;
                    asset.updatedAt = Date.now();
                    await kernel.call('history', 'push', before);
                    kernel.emit('assets:changed');
                }
            });
            return wrap;
        }
        kernel.provide('ui.packages', { render });
        kernel.on('packages:changed', render);
        kernel.on('assets:changed', render);
        render();
    }
});
