"use strict";
/* =====================================================================
 * Undo/Redo history: complete document + image-blob snapshots.
 * Edits may use snapshot/push or transaction(label, operation).
 * ===================================================================== */
definePlugin({
    id: 'history',
    version: '2.0.0',
    needs: ['documentSnapshot'],
    provides: ['history'],
    uses: [],
    accepts: { 'documentSnapshot': '^1.0.0' },
    contractVersions: { 'history': '1.0.0' },
    setup: async function (kernel) {
        const documentState = await kernel.require('documentSnapshot');
        const past = [], future = [];
        const LIMIT = 120;
        let transactionDepth = 0;
        let restoring = false;
        function snapshot() { return documentState.capture(); }
        function push(before) {
            if (transactionDepth)
                return false; // outer transaction owns the step
            if (restoring)
                return false;
            const after = snapshot();
            if (documentState.equal(before, after))
                return false;
            past.push(before);
            if (past.length > LIMIT)
                past.shift();
            future.length = 0;
            kernel.emit('history:changed');
            return true;
        }
        async function transaction(label, action) {
            if (typeof label === 'function') {
                action = label;
                label = 'edit';
            }
            if (typeof action !== 'function')
                throw new TypeError('History transaction requires a function');
            if (restoring)
                throw new Error('History restoration in progress');
            if (transactionDepth) {
                transactionDepth++;
                try {
                    return await action();
                }
                finally {
                    transactionDepth--;
                }
            }
            const before = snapshot();
            transactionDepth = 1;
            try {
                const result = await action();
                transactionDepth = 0;
                push(before);
                return result;
            }
            catch (err) {
                transactionDepth = 0;
                try {
                    await documentState.restore(before);
                }
                catch (restoreError) {
                    kernel.log.error('transaction rollback failed', label, restoreError);
                }
                throw err;
            }
        }
        async function undo() {
            if (restoring || transactionDepth || !past.length)
                return false;
            restoring = true;
            try {
                const current = snapshot();
                await documentState.restore(past[past.length - 1]);
                past.pop();
                future.push(current);
                kernel.emit('history:changed');
                return true;
            }
            catch (err) {
                kernel.log.error('undo failed', err);
                kernel.emit('toast', { message: 'Undo failed: ' + err.message, kind: 'error' });
                return false;
            }
            finally {
                restoring = false;
            }
        }
        async function redo() {
            if (restoring || transactionDepth || !future.length)
                return false;
            restoring = true;
            try {
                const current = snapshot();
                await documentState.restore(future[future.length - 1]);
                future.pop();
                past.push(current);
                if (past.length > LIMIT)
                    past.shift();
                kernel.emit('history:changed');
                return true;
            }
            catch (err) {
                kernel.log.error('redo failed', err);
                kernel.emit('toast', { message: 'Redo failed: ' + err.message, kind: 'error' });
                return false;
            }
            finally {
                restoring = false;
            }
        }
        function clear() {
            past.length = 0;
            future.length = 0;
            kernel.emit('history:changed');
        }
        kernel.provide('history', {
            snapshot, push, transaction, undo, redo, clear,
            canUndo: () => past.length > 0,
            canRedo: () => future.length > 0,
            isRestoring: () => restoring,
            get depth() { return transactionDepth; }
        });
        kernel.on('history:undo', function () { void undo(); });
        kernel.on('history:redo', function () { void redo(); });
    }
});
