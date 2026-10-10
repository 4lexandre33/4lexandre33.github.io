"use strict";
/** TS-016: strictly typed UI adapter, preserves classic-script behavior and ABI. */
/* =====================================================================
 * plugins/26-ui-storage.js
 * Badge no topbar mostrando o estado do storage.
 * ===================================================================== */
definePlugin({
    id: 'ui.storage',
    version: '1.2.0',
    needs: ['ui.dialogs'],
    provides: ['ui.storage'],
    uses: ['contextMenu', 'app'],
    accepts: { 'ui.dialogs': '^1.0.0', 'contextMenu': '^1.0.0', 'app': '^1.0.0' },
    contractVersions: { 'ui.storage': '1.0.0' },
    setup: async function (kernel) {
        const D = await kernel.require('ui.dialogs');
        const toolbar = document.querySelector('#topbar .toolbar');
        const debugBtn = toolbar.querySelector('[data-cmd="debug"]');
        const badge = document.createElement('button');
        badge.id = 'storage-badge';
        badge.className = 'storage-badge';
        badge.type = 'button';
        badge.title = 'Storage status — click for options';
        toolbar.insertBefore(badge, debugBtn);
        let app = null;
        let saving = false;
        function renderBadge(dotClass, labelText) {
            const dot = document.createElement('span');
            dot.className = dotClass;
            const text = document.createElement('span');
            text.className = 'storage-label';
            text.textContent = labelText;
            badge.replaceChildren(dot, text);
        }
        function render() {
            if (!app) {
                renderBadge('storage-dot off', 'Initializing…');
                return;
            }
            const mode = app.mode;
            let dotCls = 'storage-dot';
            let label = '';
            if (mode === 'idb') {
                dotCls += ' ok';
                label = saving ? 'Saving…' : 'Saved (IndexedDB)';
            }
            else if (mode === 'fs-dir') {
                dotCls += ' ok';
                const name = app.folderName;
                label = saving ? 'Saving…' : (name ? '📁 ' + name : '📁 Folder');
            }
            else if (mode === 'fs-single') {
                dotCls += ' ok';
                const name = app.fileName;
                label = saving ? 'Saving…' : (name ? '📄 ' + name : '📄 File');
            }
            else if (mode === 'ls') {
                dotCls += ' ok';
                label = saving ? 'Saving…' : '💾 Browser storage';
            }
            else {
                dotCls += ' off';
                label = '⚠ Not saving';
            }
            renderBadge(dotCls, label);
        }
        async function actionSaveNow() {
            if (!app || !app.isPersistent()) {
                D.toast('Not saving — connect a folder or file first.', 'error');
                return;
            }
            saving = true;
            render();
            try {
                await app.saveNow();
                D.toast('Saved.', 'ok');
            }
            catch (e) {
                kernel.log.error('saveNow failed', e);
                D.toast('Save failed: ' + e.message, 'error');
            }
            finally {
                saving = false;
                render();
            }
        }
        async function actionSwitch(target) {
            if (!app) {
                D.toast('App not ready.', 'error');
                return;
            }
            try {
                await app.switchBackend(target);
            }
            catch (e) {
                kernel.log.error('switchBackend failed', e);
                D.toast('Could not switch storage.', 'error');
            }
        }
        async function openMenu() {
            if (!app) {
                const retry = await D.confirm({
                    title: 'Storage initialization',
                    message: 'App still initializing. Retry?',
                    confirmText: 'Retry init',
                    cancelText: 'Dismiss'
                });
                if (retry)
                    location.reload();
                return;
            }
            const rect = badge.getBoundingClientRect();
            const items = [];
            if (app.isPersistent()) {
                items.push({
                    icon: '💾', label: 'Save now', shortcut: 'Ctrl+S',
                    action: actionSaveNow
                });
                items.push({ sep: true });
            }
            items.push({
                icon: '📦', label: 'Download complete backup…',
                action: async function () {
                    try {
                        const result = await app.backupNow();
                        if (!result.success)
                            D.toast('Backup failed. Check missing images.', 'error');
                    }
                    catch (e) {
                        kernel.log.error('backup failed', e);
                        D.toast('Backup failed: ' + e.message, 'error');
                    }
                }
            });
            items.push({ sep: true });
            items.push({
                icon: '📁', label: 'Use project folder…',
                disabled: app.mode === 'fs-dir',
                action: function () { actionSwitch('fs-dir'); }
            });
            items.push({
                icon: '📄', label: 'Use single file…',
                disabled: app.mode === 'fs-single',
                action: function () { actionSwitch('fs-single'); }
            });
            items.push({
                icon: '💾', label: 'Use browser storage',
                disabled: app.mode === 'ls',
                action: function () { actionSwitch('ls'); }
            });
            if (app.isPersistent()) {
                items.push({ sep: true });
                items.push({
                    icon: '🚫', label: 'Stop auto-saving',
                    danger: true,
                    action: function () { actionSwitch('volatile'); }
                });
            }
            const cm = kernel.has('contextMenu') ? await kernel.require('contextMenu') : null;
            if (cm && typeof cm.show === 'function') {
                cm.show(rect.left, rect.bottom + 6, items);
            }
        }
        badge.addEventListener('click', openMenu);
        function poll() {
            if (kernel.has('app')) {
                kernel.require('app').then(function (a) { app = a; render(); });
                return;
            }
            if (!poll._tries)
                poll._tries = 0;
            poll._tries++;
            if (poll._tries > 200) {
                render();
                return;
            }
            setTimeout(poll, 300);
        }
        kernel.on('storage:saving', function () { saving = true; render(); });
        kernel.on('storage:saved', function () { saving = false; render(); });
        kernel.on('storage:failed', function () { saving = false; badge.title = 'Last save FAILED. Download a backup.'; render(); });
        kernel.on('backend:changed', render);
        kernel.on('state:changed', render);
        kernel.provide('ui.storage', { render });
        render();
        poll();
    }
});
