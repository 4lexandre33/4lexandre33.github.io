"use strict";
/** TS-016: strictly typed UI adapter, preserves classic-script behavior and ABI. */
/* Phase 8 — accessibility adapter. State changes only through public capabilities. */
definePlugin({
    id: 'ui-accessibility',
    version: '1.0.0',
    needs: ['state', 'boards'],
    provides: ['ui.accessibility'],
    uses: [],
    accepts: { state: '^1.0.0', boards: '^1.0.0' },
    contractVersions: { 'ui.accessibility': '1.0.0' },
    setup: async function (kernel) {
        const S = await kernel.require('state');
        const B = await kernel.require('boards');
        const world = document.getElementById('world');
        const announcer = document.getElementById('a11y-announcer');
        let sequence = 0;
        function announce(message, urgent) {
            if (!announcer || !message)
                return;
            announcer.setAttribute('aria-live', urgent ? 'assertive' : 'polite');
            const current = ++sequence;
            announcer.textContent = '';
            queueMicrotask(() => { if (current === sequence)
                announcer.textContent = String(message); });
        }
        function sync() {
            if (!world)
                return;
            for (const el of world.querySelectorAll('.instance[data-id]')) {
                const inst = S.getInstance(el.dataset.id);
                if (!inst)
                    continue;
                el.setAttribute('role', 'button');
                el.setAttribute('tabindex', '0');
                el.setAttribute('aria-pressed', String(S.data.selection.has(inst.id)));
                const name = inst.type === 'board'
                    ? B.getBoard(inst.boardId)?.name || 'Missing board'
                    : inst.type === 'manga-page'
                        ? 'Manga page' : S.getAsset(inst.assetId)?.name || 'Image';
                const action = inst.type === 'board' ? ', press Enter to open' : ', press Enter to select';
                el.setAttribute('aria-label', name + action);
            }
        }
        if (world) {
            kernel.listen(world, 'keydown', function (event) {
                const e = event;
                if (e.key !== 'Enter' && e.key !== ' ')
                    return;
                const el = e.target.closest('.instance[data-id]');
                if (!el || !world.contains(el))
                    return;
                const inst = S.getInstance(el.dataset.id);
                if (!inst)
                    return;
                e.preventDefault();
                e.stopPropagation();
                if (e.key === 'Enter' && inst.type === 'board' && B.getBoard(inst.boardId)) {
                    B.navigate(inst.boardId);
                    announce('Opened board ' + (B.getBoard(inst.boardId)?.name || ''));
                    return;
                }
                if (!e.ctrlKey && !e.metaKey)
                    S.data.selection.clear();
                if (e.ctrlKey || e.metaKey) {
                    if (S.data.selection.has(inst.id))
                        S.data.selection.delete(inst.id);
                    else
                        S.data.selection.add(inst.id);
                }
                else
                    S.data.selection.add(inst.id);
                kernel.emit('selection:changed');
                announce(S.data.selection.size + ' item(s) selected');
            });
            const observer = new MutationObserver(() => sync());
            observer.observe(world, { childList: true, subtree: true });
            kernel.trackCleanup(() => observer.disconnect());
        }
        let queued = false;
        function scheduleSync() {
            if (queued)
                return;
            queued = true;
            requestAnimationFrame(() => { queued = false; sync(); });
        }
        for (const event of ['selection:changed', 'instances:changed', 'board:navigated',
            'assets:changed', 'boards:changed'])
            kernel.on(event, scheduleSync);
        kernel.on('storage:failed', e => announce('Saving failed: ' + (e?.message || 'unknown error'), true));
        kernel.on('manga-export:failed', e => announce('Export failed. ' + (e?.errors?.[0]?.message || ''), true));
        kernel.on('history:changed', () => scheduleSync());
        kernel.provide('ui.accessibility', { announce, sync });
        scheduleSync();
    }
});
