"use strict";
/** TS-016: strictly typed UI adapter, preserves classic-script behavior and ABI. */
definePlugin({
    id: 'ui.library',
    version: '1.0.0',
    needs: ['state', 'assets', 'packages', 'ui.dialogs'],
    provides: ['ui.library'],
    uses: [],
    accepts: { 'state': '^1.0.0', 'assets': '^1.0.0', 'packages': '^1.0.0', 'ui.dialogs': '^1.0.0' },
    contractVersions: { 'ui.library': '1.0.0' },
    setup: async function (kernel) {
        const S = await kernel.require('state');
        const A = await kernel.require('assets');
        const P = await kernel.require('packages');
        const D = await kernel.require('ui.dialogs');
        const grid = document.getElementById('asset-grid');
        const filter = document.getElementById('package-filter');
        const search = document.getElementById('search');
        const sort = document.getElementById('sort');
        const count = document.getElementById('asset-count');
        const empty = document.getElementById('library-empty');
        search.addEventListener('input', e => { S.data.ui.search = e.target.value; renderGrid(); });
        filter.addEventListener('change', e => { S.data.ui.filterPackage = e.target.value; renderGrid(); });
        sort.addEventListener('change', e => { S.data.ui.sort = e.target.value; renderGrid(); });
        function renderFilter() {
            const cur = S.data.ui.filterPackage;
            filter.innerHTML = '';
            const all = document.createElement('option');
            all.value = 'all';
            all.textContent = 'All packages (' + S.data.assets.length + ')';
            filter.appendChild(all);
            for (const p of S.data.packages.slice().sort((a, b) => (a.order || 0) - (b.order || 0))) {
                const o = document.createElement('option');
                o.value = p.id;
                o.textContent = p.name + ' (' + P.assetsOf(p.id).length + ')';
                filter.appendChild(o);
            }
            const exists = Array.prototype.some.call(filter.options, (o) => o.value === cur);
            filter.value = exists ? cur : 'all';
            S.data.ui.filterPackage = filter.value;
        }
        function renderGrid() {
            const q = S.data.ui.search.trim().toLowerCase();
            const pf = S.data.ui.filterPackage;
            let list = S.data.assets.filter(a => {
                if (pf !== 'all' && a.packageId !== pf)
                    return false;
                if (q && a.name.toLowerCase().indexOf(q) === -1)
                    return false;
                return true;
            });
            if (S.data.ui.sort === 'name')
                list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
            else if (S.data.ui.sort === 'newest')
                list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            else
                list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            grid.innerHTML = '';
            const frag = document.createDocumentFragment();
            for (const a of list)
                frag.appendChild(card(a));
            grid.appendChild(frag);
            count.textContent = list.length + (list.length === 1 ? ' image' : ' images');
            empty.hidden = S.data.assets.length > 0;
        }
        function card(asset) {
            const el = document.createElement('div');
            el.className = 'asset-card';
            el.draggable = true;
            el.dataset.assetId = asset.id;
            el.title = asset.name + '\nDrag to canvas · Click to preview';
            const img = document.createElement('img');
            img.draggable = false;
            img.loading = 'lazy';
            img.alt = asset.name;
            const url = A.urls.get(asset.id);
            if (url)
                img.src = url;
            el.appendChild(img);
            const label = document.createElement('div');
            label.className = 'asset-label';
            label.textContent = asset.name;
            el.appendChild(label);
            const processButton = document.createElement('button');
            processButton.type = 'button';
            processButton.className = 'asset-process-btn';
            processButton.dataset.processAssetId = asset.id;
            processButton.textContent = 'Edit image';
            processButton.title = 'Create a processed copy of ' + asset.name;
            processButton.setAttribute('aria-label', 'Edit image ' + asset.name);
            processButton.draggable = false;
            processButton.addEventListener('click', event => {
                event.stopPropagation();
                kernel.emit('ui:image-process', { assetId: asset.id, trigger: processButton });
            });
            el.appendChild(processButton);
            el.addEventListener('dragstart', e => {
                e.dataTransfer.setData('application/x-nvb-asset', asset.id);
                e.dataTransfer.setData('text/plain', asset.id);
                e.dataTransfer.effectAllowed = 'copyMove';
            });
            el.addEventListener('click', () => D.openPreview(asset));
            return el;
        }
        kernel.provide('ui.library', { renderFilter, renderGrid });
        kernel.on('assets:changed', () => { renderFilter(); renderGrid(); });
        kernel.on('packages:changed', renderFilter);
        renderFilter();
        renderGrid();
    }
});
