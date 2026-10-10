"use strict";
/** TS-016: typed UI/inspector/app plugin with unchanged legacy runtime structure. */
/* =====================================================================
 * plugins/99-app.js
 * Boot em cascata: IDB → FS-Dir → FS-Single → localStorage → Volatile.
 * Inclui panelSets em buildDoc/hydrate.
 * ===================================================================== */
definePlugin({
    id: 'app',
    version: '3.5.0',
    needs: ['utils', 'backend', 'state', 'documentSnapshot', 'projectFormat'],
    provides: ['app'],
    uses: ['storage', 'storage-fs', 'storage-fs-dir', 'storage-ls', 'assets', 'camera', 'ui.dialogs', 'exportImport', 'history'],
    accepts: { 'utils': '^1.0.0', 'backend': '^1.0.0', 'state': '^1.0.0', 'documentSnapshot': '^1.0.0', 'projectFormat': '^1.0.0', 'exportImport': '^1.0.0', 'history': '^1.0.0', 'storage': '^1.0.0', 'storage-fs': '^1.0.0', 'storage-fs-dir': '^1.0.0', 'storage-ls': '^1.0.0', 'assets': '^1.0.0', 'camera': '^1.0.0', 'ui.dialogs': '^1.0.0' },
    contractVersions: { 'app': '1.0.0' },
    setup: async function (kernel) {
        console.log('=============================================');
        console.log('[nvb] APP BOOT — diagnostics');
        console.log('  isSecureContext     :', window.isSecureContext);
        console.log('  indexedDB           :', !!window.indexedDB);
        console.log('  showDirectoryPicker :', typeof window.showDirectoryPicker);
        console.log('  showSaveFilePicker  :', typeof window.showSaveFilePicker);
        console.log('  showOpenFilePicker  :', typeof window.showOpenFilePicker);
        console.log('  localStorage        :', typeof window.localStorage);
        console.log('  protocol            :', location.protocol);
        console.log('  origin              :', location.origin);
        console.log('=============================================');
        async function safeRequire(name) {
            if (!kernel.has(name)) {
                kernel.log.warn('missing capability: ' + name);
                return null;
            }
            try {
                return await kernel.require(name);
            }
            catch (e) {
                kernel.log.warn('require failed: ' + name, e);
                return null;
            }
        }
        const utils = (await safeRequire('utils'));
        const idb = (await safeRequire('storage'));
        const fs = (await safeRequire('storage-fs'));
        const fsDir = (await safeRequire('storage-fs-dir'));
        const ls = (await safeRequire('storage-ls'));
        const fac = (await safeRequire('backend'));
        const S = (await safeRequire('state'));
        const docApi = (await safeRequire('documentSnapshot'));
        const format = (await safeRequire('projectFormat'));
        const A = (await safeRequire('assets'));
        const cam = (await safeRequire('camera'));
        const D = (await safeRequire('ui.dialogs'));
        if (!utils || !fac || !S || !docApi) {
            console.error('[nvb] app.setup cannot continue');
            kernel.provide('app', {
                saveNow: async function () { }, scheduleSave: function () { },
                boot: async function () { }, switchBackend: async function () { },
                mode: 'volatile', folderName: null, fileName: null,
                isPersistent: function () { return false; }
            });
            return;
        }
        const DOC_KEY = 'project-doc';
        const LS_KEY = 'nvb.lastMode';
        let mode = 'volatile';
        let activeBackend = null;
        function lsGet(k) { try {
            return localStorage.getItem(k);
        }
        catch (e) {
            return null;
        } }
        function lsSet(k, v) { try {
            localStorage.setItem(k, v);
        }
        catch (e) { } }
        function buildDoc() {
            return format.normalize(docApi.serialize());
        }
        function initEmptyProject() {
            if (!S.data.boards.length) {
                const rootId = utils.uid('board');
                S.data.boards.push({
                    id: rootId, name: 'Root Board', parentBoardId: null,
                    instances: [], camera: { x: 0, y: 0, zoom: 1 },
                    createdAt: Date.now(), updatedAt: Date.now()
                });
                S.data.rootBoardId = rootId;
                S.data.currentBoardId = rootId;
            }
            if (!S.data.panelSets)
                S.data.panelSets = [];
            if (A && A.ensureDefaultPackage)
                A.ensureDefaultPackage();
        }
        function hydrateFromDoc(input) {
            if (!input)
                return;
            const doc = format.normalize(input);
            if (doc.meta)
                S.data.meta = doc.meta;
            if (!S.data.meta.id)
                S.data.meta.id = utils.uid('proj');
            S.data.packages = Array.isArray(doc.packages) ? doc.packages : [];
            S.data.assets = Array.isArray(doc.assets) ? doc.assets : [];
            S.data.boards = Array.isArray(doc.boards) ? doc.boards : [];
            S.data.panelSets = Array.isArray(doc.panelSets) ? doc.panelSets : [];
            S.data.settings = doc.settings || {};
            S.data.boards.forEach(function (b) {
                if (!b.instances)
                    b.instances = [];
                if (!b.camera)
                    b.camera = { x: 0, y: 0, zoom: 1 };
                b.instances.forEach(function (i) { if (!i.type)
                    i.type = 'image'; });
            });
            if (!S.data.boards.length) {
                initEmptyProject();
                return;
            }
            S.data.rootBoardId = doc.rootBoardId && S.getBoard && S.getBoard(doc.rootBoardId)
                ? doc.rootBoardId
                : S.data.boards[0].id;
            S.data.currentBoardId =
                S.data.settings.lastBoardId && S.getBoard && S.getBoard(S.data.settings.lastBoardId)
                    ? S.data.settings.lastBoardId
                    : S.data.rootBoardId;
            const cur = S.getBoard && S.getBoard(S.data.currentBoardId);
            if (cur && cur.camera && cam) {
                cam.data.x = Number(cur.camera.x) || 0;
                cam.data.y = Number(cur.camera.y) || 0;
                cam.data.zoom = Math.max(0.05, Math.min(8, Number(cur.camera.zoom) || 1));
            }
            if (A && A.ensureDefaultPackage)
                A.ensureDefaultPackage();
        }
        let saving = null;
        async function saveNow() {
            if (mode === 'volatile' || !activeBackend)
                return false;
            if (saving)
                return saving.then(() => saveNow());
            S.data.meta.updatedAt = Date.now();
            const doc = buildDoc();
            const destination = activeBackend;
            kernel.emit('storage:saving');
            saving = (async function () {
                await destination.put('kv', DOC_KEY, doc);
                if (typeof destination.flushNow === 'function')
                    await destination.flushNow();
                else if (typeof destination.saveAll === 'function')
                    await destination.saveAll();
                kernel.emit('storage:saved');
                return true;
            })();
            try {
                return await saving;
            }
            catch (err) {
                kernel.log.error('save failed', err);
                kernel.emit('storage:failed', { mode, message: err.message });
                kernel.emit('toast', { message: 'Could not save project: ' + err.message +
                        '. Export a backup before leaving.', kind: 'error' });
                throw err;
            }
            finally {
                saving = null;
            }
        }
        const scheduleSave = utils?.debounce
            ? utils.debounce(() => { void saveNow().catch(() => { }); }, 500)
            : function () { setTimeout(() => { void saveNow().catch(() => { }); }, 500); };
        async function backupNow() {
            const exports = await kernel.require('exportImport');
            return exports.exportProject({ backup: true });
        }
        async function backupBeforeSwitch() {
            // Never change a backend before the current project has an offline backup.
            const result = await backupNow();
            if (!result.success) {
                kernel.emit('toast', { message: 'Storage change cancelled: unable to back up current project.', kind: 'error' });
                return false;
            }
            if (activeBackend) {
                try {
                    await saveNow();
                }
                catch (e) {
                    return false;
                }
            }
            return true;
        }
        async function tryIndexedDB() {
            console.log('[boot] step 1: trying IndexedDB…');
            if (!idb)
                return false;
            try {
                await idb.open();
                if (idb.isAvailable && idb.isAvailable()) {
                    console.log('[boot] step 1: IndexedDB OK');
                    return true;
                }
            }
            catch (err) {
                console.warn('[boot] step 1: IndexedDB failed —', err && err.message);
            }
            return false;
        }
        async function tryFsDir() {
            console.log('[boot] step 2: trying File System — Folder…');
            if (!fsDir || !fsDir.isAvailable || !fsDir.isAvailable()) {
                console.log('[boot] step 2: unavailable — skip');
                return false;
            }
            if (!D)
                return false;
            const lastMode = lsGet(LS_KEY);
            let use;
            try {
                if (lastMode === 'fs-dir') {
                    use = await D.confirm({
                        title: 'Reopen project folder',
                        message: 'Reconnect to your project folder?',
                        confirmText: 'Reopen folder…', cancelText: 'Other options'
                    });
                }
                else {
                    use = await D.confirm({
                        title: 'Choose storage',
                        message: 'Use a PROJECT FOLDER? It will contain project.json + assets/*.bin.',
                        confirmText: 'Use project folder…', cancelText: 'Other options'
                    });
                }
            }
            catch (e) {
                return false;
            }
            if (!use)
                return false;
            try {
                await fsDir.pickDirectory();
                await fsDir.loadFromDirectory();
                console.log('[boot] step 2: OK');
                return true;
            }
            catch (e) {
                if (e && e.name === 'AbortError')
                    return false;
                console.error('[boot] step 2:', e);
                return false;
            }
        }
        async function tryFsSingle() {
            console.log('[boot] step 3: trying File System — Single File…');
            if (!fs || !fs.isAvailable || !fs.isAvailable()) {
                console.log('[boot] step 3: unavailable — skip');
                return false;
            }
            if (!D)
                return false;
            let use;
            try {
                use = await D.confirm({
                    title: 'Single-file storage',
                    message: 'Use a single .nvb.json file?',
                    confirmText: 'Use single file…', cancelText: 'Other options'
                });
            }
            catch (e) {
                return false;
            }
            if (!use)
                return false;
            try {
                const createNew = await D.confirm({
                    title: 'Single-file project',
                    message: 'Create a new project file? Choose “Open existing” to restore a saved .nvb.json.',
                    confirmText: 'Create new', cancelText: 'Open existing'
                });
                if (createNew)
                    await fs.pickNew();
                else {
                    await fs.pickExisting();
                    await fs.loadFromHandle();
                }
                console.log('[boot] step 3: OK');
                return true;
            }
            catch (e) {
                if (e && e.name === 'AbortError')
                    return false;
                console.error('[boot] step 3:', e);
                return false;
            }
        }
        async function tryLocalStorage() {
            console.log('[boot] step 4: trying localStorage…');
            if (!ls || !ls.isAvailable || !ls.isAvailable()) {
                console.log('[boot] step 4: unavailable — skip');
                return false;
            }
            try {
                ls.loadFromStorage();
            }
            catch (error) {
                kernel.log.error('localStorage read failed', error);
                return false;
            }
            const existing = ls.get ? await ls.get('kv', DOC_KEY) : null;
            const hasExisting = !!existing;
            const message = hasExisting
                ? 'Restore from browser storage (localStorage)?\n\nYour previous project was found.\n\n⚠ Limit ~5 MB.'
                : 'Using browser storage (localStorage).\n\nYour project will auto-save here.\n\n⚠ Limit ~5 MB. For larger projects, prefer a local HTTP server or Firefox.';
            if (D) {
                const use = await D.confirm({
                    title: hasExisting ? 'Restore from browser storage' : 'Browser storage',
                    message: message,
                    confirmText: hasExisting ? 'Restore' : 'Use browser storage',
                    cancelText: 'Work without saving'
                });
                if (!use) {
                    console.log('[boot] step 4: user declined');
                    return false;
                }
            }
            try {
                console.log('[boot] step 4: OK');
                return true;
            }
            catch (e) {
                console.warn('[boot] step 4:', e);
                return false;
            }
        }
        async function enterVolatileMode() {
            console.log('[boot] step 5: VOLATILE');
            mode = 'volatile';
            activeBackend = null;
            fac.setBackend('volatile', null);
            lsSet(LS_KEY, 'volatile');
            initEmptyProject();
            if (D) {
                await D.confirm({
                    title: '⚠ Automatic saving unavailable',
                    message: 'No compatible storage backend was found.\n\n' +
                        'The app works, but nothing will be saved automatically.\n' +
                        'Use Export (top-right) to save manually.',
                    confirmText: 'Continue', cancelText: null
                });
            }
            kernel.emit('toast', { message: 'Volatile mode. Use Export/Load manually.', kind: 'error' });
        }
        async function switchBackend(target) {
            if (target === mode)
                return false;
            if (target === 'volatile') {
                if (!(await backupBeforeSwitch()))
                    return false;
                if (fsDir && fsDir.hasHandle && fsDir.hasHandle())
                    fsDir.detach();
                if (fs && fs.hasHandle && fs.hasHandle())
                    fs.detach();
                if (ls && ls.detach)
                    ls.detach();
                mode = 'volatile';
                activeBackend = null;
                fac.setBackend('volatile', null);
                lsSet(LS_KEY, 'volatile');
                if (D)
                    D.toast('Auto-save disabled.');
                return;
            }
            if (target === 'ls') {
                if (!ls || !ls.isAvailable || !ls.isAvailable()) {
                    if (D)
                        D.toast('localStorage not available.', 'error');
                    return;
                }
                if (!(await backupBeforeSwitch()))
                    return false;
                ls.loadFromStorage();
                const existing = await ls.get('kv', DOC_KEY);
                if (existing) {
                    hydrateFromDoc(existing);
                    if (A && A.urls) {
                        A.urls.forEach(function (u) { URL.revokeObjectURL(u); });
                        A.urls.clear();
                        A.blobs.clear();
                        A.missing.clear();
                    }
                    mode = 'ls';
                    activeBackend = ls;
                    fac.setBackend('ls', ls);
                    lsSet(LS_KEY, 'ls');
                    if (A && A.restoreFromStorage)
                        await A.restoreFromStorage();
                    if (kernel.has('history'))
                        await kernel.call('history', 'clear');
                    kernel.emit('state:changed');
                    kernel.emit('assets:changed');
                    kernel.emit('packages:changed');
                    kernel.emit('boards:changed');
                    kernel.emit('camera:changed');
                    kernel.emit('history:changed');
                    kernel.emit('panelSets:changed');
                    if (D)
                        D.toast('Loaded from browser storage.', 'ok');
                }
                else {
                    if (A && A.blobs) {
                        for (const [id, blob] of A.blobs) {
                            try {
                                await ls.put('blobs', id, blob);
                            }
                            catch (e) { }
                        }
                    }
                    mode = 'ls';
                    activeBackend = ls;
                    fac.setBackend('ls', ls);
                    lsSet(LS_KEY, 'ls');
                    await ls.put('kv', DOC_KEY, buildDoc());
                    await ls.saveAll();
                    if (D)
                        D.toast('Saving to browser storage.', 'ok');
                }
                return;
            }
            if (target === 'fs-dir') {
                if (!fsDir || !fsDir.isAvailable || !fsDir.isAvailable()) {
                    if (D)
                        D.toast('Directory picker not supported.', 'error');
                    return;
                }
                try {
                    await fsDir.pickDirectory();
                    await fsDir.loadFromDirectory();
                }
                catch (e) {
                    if (e && e.name === 'AbortError')
                        return;
                    if (D)
                        D.toast('Could not open folder.', 'error');
                    return;
                }
                if (!(await backupBeforeSwitch()))
                    return false;
                const existing = await fsDir.get('kv', DOC_KEY);
                if (existing) {
                    hydrateFromDoc(existing);
                    if (A && A.urls) {
                        A.urls.forEach(function (u) { URL.revokeObjectURL(u); });
                        A.urls.clear();
                        A.blobs.clear();
                        A.missing.clear();
                    }
                    mode = 'fs-dir';
                    activeBackend = fsDir;
                    fac.setBackend('fs-dir', fsDir);
                    lsSet(LS_KEY, 'fs-dir');
                    if (A && A.restoreFromStorage)
                        await A.restoreFromStorage();
                    if (kernel.has('history'))
                        await kernel.call('history', 'clear');
                    kernel.emit('state:changed');
                    kernel.emit('assets:changed');
                    kernel.emit('packages:changed');
                    kernel.emit('boards:changed');
                    kernel.emit('camera:changed');
                    kernel.emit('history:changed');
                    kernel.emit('panelSets:changed');
                    if (D)
                        D.toast('Loaded from folder: ' + fsDir.getFolderName(), 'ok');
                }
                else {
                    if (A && A.blobs) {
                        for (const [id, blob] of A.blobs) {
                            try {
                                await fsDir.put('blobs', id, blob);
                            }
                            catch (e) { }
                        }
                    }
                    mode = 'fs-dir';
                    activeBackend = fsDir;
                    fac.setBackend('fs-dir', fsDir);
                    lsSet(LS_KEY, 'fs-dir');
                    await fsDir.put('kv', DOC_KEY, buildDoc());
                    await fsDir.saveAll();
                    if (D)
                        D.toast('Saving to folder: ' + fsDir.getFolderName(), 'ok');
                }
                return;
            }
            if (target === 'fs-single') {
                if (!fs || !fs.isAvailable || !fs.isAvailable()) {
                    if (D)
                        D.toast('File picker not supported.', 'error');
                    return;
                }
                try {
                    await fs.pickNew();
                }
                catch (e) {
                    if (e && e.name === 'AbortError')
                        return;
                    if (D)
                        D.toast('Could not open file picker.', 'error');
                    return;
                }
                if (!(await backupBeforeSwitch()))
                    return false;
                if (A && A.blobs) {
                    for (const [id, blob] of A.blobs) {
                        try {
                            await fs.put('blobs', id, blob);
                        }
                        catch (e) { }
                    }
                }
                mode = 'fs-single';
                activeBackend = fs;
                fac.setBackend('fs-single', fs);
                lsSet(LS_KEY, 'fs-single');
                await fs.put('kv', DOC_KEY, buildDoc());
                await fs.flushNow();
                if (D)
                    D.toast('Saving to file: ' + fs.getHandleName(), 'ok');
                return;
            }
        }
        function protectFailedLoad(label, err) {
            kernel.log.error(label + ' load failed; storage will be left untouched', err);
            mode = 'volatile';
            activeBackend = null;
            fac.setBackend('volatile', null);
            lsSet(LS_KEY, 'volatile');
            kernel.emit('storage:failed', { mode: label, message: err.message });
            kernel.emit('toast', { message: 'Saved project could not be loaded (' + label + ').' +
                    ' Original files were NOT overwritten. Export a backup before continuing.', kind: 'error' });
            initEmptyProject();
        }
        async function boot() {
            console.log('[boot] starting backend selection');
            const idbOk = await tryIndexedDB();
            if (idbOk) {
                mode = 'idb';
                activeBackend = idb;
                fac.setBackend('idb', idb);
                lsSet(LS_KEY, 'idb');
                try {
                    const doc = await idb.get('kv', DOC_KEY);
                    if (doc) {
                        hydrateFromDoc(doc);
                        if (A && A.restoreFromStorage)
                            await A.restoreFromStorage();
                    }
                    else
                        initEmptyProject();
                }
                catch (e) {
                    protectFailedLoad('idb', e);
                }
            }
            else {
                const dirOk = await tryFsDir();
                if (dirOk) {
                    mode = 'fs-dir';
                    activeBackend = fsDir;
                    fac.setBackend('fs-dir', fsDir);
                    lsSet(LS_KEY, 'fs-dir');
                    try {
                        const doc = await fsDir.get('kv', DOC_KEY);
                        if (doc) {
                            hydrateFromDoc(doc);
                            if (A && A.restoreFromStorage)
                                await A.restoreFromStorage();
                        }
                        else {
                            initEmptyProject();
                            await fsDir.put('kv', DOC_KEY, buildDoc());
                            await fsDir.saveAll();
                        }
                    }
                    catch (e) {
                        protectFailedLoad('fs-dir', e);
                    }
                }
                else {
                    const singleOk = await tryFsSingle();
                    if (singleOk) {
                        mode = 'fs-single';
                        activeBackend = fs;
                        fac.setBackend('fs-single', fs);
                        lsSet(LS_KEY, 'fs-single');
                        try {
                            const doc = await fs.get('kv', DOC_KEY);
                            if (doc) {
                                hydrateFromDoc(doc);
                                if (A && A.restoreFromStorage)
                                    await A.restoreFromStorage();
                            }
                            else
                                initEmptyProject();
                        }
                        catch (e) {
                            protectFailedLoad('fs-single', e);
                        }
                    }
                    else {
                        const lsOk = await tryLocalStorage();
                        if (lsOk) {
                            mode = 'ls';
                            activeBackend = ls;
                            fac.setBackend('ls', ls);
                            lsSet(LS_KEY, 'ls');
                            try {
                                const doc = await ls.get('kv', DOC_KEY);
                                if (doc) {
                                    hydrateFromDoc(doc);
                                    if (A && A.restoreFromStorage)
                                        await A.restoreFromStorage();
                                }
                                else {
                                    initEmptyProject();
                                    await ls.put('kv', DOC_KEY, buildDoc());
                                    await ls.saveAll();
                                }
                            }
                            catch (e) {
                                protectFailedLoad('ls', e);
                            }
                        }
                        else {
                            await enterVolatileMode();
                        }
                    }
                }
            }
            console.log('[boot] redrawing — mode =', mode);
            kernel.emit('state:changed');
            kernel.emit('assets:changed');
            kernel.emit('packages:changed');
            kernel.emit('boards:changed');
            kernel.emit('panelSets:changed');
            kernel.emit('board:navigated', { boardId: S.data.currentBoardId });
            kernel.emit('camera:changed');
            kernel.emit('history:changed');
            kernel.emit('backend:changed', { mode: mode });
            console.log('[nvb] boot complete. mode =', mode);
            scheduleSave();
        }
        kernel.on('state:changed', scheduleSave);
        kernel.on('assets:changed', scheduleSave);
        kernel.on('packages:changed', scheduleSave);
        kernel.on('boards:changed', scheduleSave);
        kernel.on('camera:changed', scheduleSave);
        kernel.on('panelSets:changed', scheduleSave);
        // Browsers do not await async storage inside beforeunload.
        // Flush on visibility changes; warn on exit if a save remains pending.
        kernel.listen(window, 'beforeunload', function (event) {
            if (saving) {
                event.preventDefault();
                event.returnValue = '';
            }
        });
        kernel.listen(document, 'visibilitychange', function () {
            if (document.visibilityState === 'hidden') {
                void saveNow().catch(() => { });
            }
        });
        kernel.provide('app', {
            saveNow: saveNow, backupNow: backupNow, scheduleSave: scheduleSave, boot: boot, switchBackend: switchBackend,
            get mode() { return mode; },
            get folderName() { return fsDir && fsDir.getFolderName ? fsDir.getFolderName() : null; },
            get fileName() { return fs && fs.getHandleName ? fs.getHandleName() : null; },
            isPersistent: function () { return mode !== 'volatile'; }
        });
        await boot();
    }
});
