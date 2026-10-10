"use strict";
/** TS-016: strictly typed UI adapter, preserves classic-script behavior and ABI. */
/* =====================================================================
 * plugins/20-ui-dialogs.js
 * Modais + toasts + preview.
 * FIX: o seletor de Cancel/OK era `document.querySelector` e capturava
 * o backdrop em vez dos botões. Agora escopa dentro de .dialog-actions.
 * ===================================================================== */
definePlugin({
    id: 'ui.dialogs',
    version: '1.2.0',
    needs: ['utils'],
    provides: ['ui.dialogs'],
    uses: ['assets', 'camera', 'instances'],
    accepts: { 'utils': '^1.0.0', 'assets': '^1.0.0', 'camera': '^1.0.0', 'instances': '^1.0.0' },
    contractVersions: { 'ui.dialogs': '1.0.0' },
    setup: function (kernel) {
        const dialog = document.getElementById('dialog');
        const dialogInner = dialog.querySelector('.dialog');
        const dialogActions = dialog.querySelector('.dialog-actions');
        const dTitle = document.getElementById('dialog-title');
        const dMsg = document.getElementById('dialog-message');
        const dInput = document.getElementById('dialog-input');
        const dOk = dialogActions.querySelector('[data-cmd="dialog-ok"]');
        const dCancel = dialogActions.querySelector('[data-cmd="dialog-cancel"]');
        const backdrop = dialog.querySelector('.modal-backdrop');
        const toastHost = document.getElementById('toast-host');
        const preview = document.getElementById('preview');
        const pImg = document.getElementById('preview-img');
        const pName = document.getElementById('preview-name');
        const pAdd = preview.querySelector('[data-cmd="preview-add"]');
        const pClose = preview.querySelector('[data-cmd="preview-close"]');
        const pBackdrop = preview.querySelector('.modal-backdrop');
        let activeResolve = null;
        let activeIsPrompt = false;
        let previousFocus = null;
        let previewFocus = null;
        const queue = [];
        let dialogOpen = false;
        const focusables = (root) => Array.from(root.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"]):not([hidden])')).filter(el => el.getClientRects().length > 0);
        function trap(e, root) {
            if (e.key !== 'Tab')
                return;
            const nodes = focusables(root);
            if (!nodes.length) {
                e.preventDefault();
                return;
            }
            const first = nodes[0], last = nodes[nodes.length - 1];
            if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
                e.preventDefault();
                last.focus();
            }
            else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
                e.preventDefault();
                first.focus();
            }
        }
        function focusBack(element) { if (element && element.isConnected && typeof element.focus === 'function')
            element.focus(); }
        /* ---------------- Toast ---------------- */
        function toast(message, kind) {
            const el = document.createElement('div');
            el.className = 'toast' + (kind ? ' ' + kind : '');
            el.textContent = message;
            toastHost.appendChild(el);
            setTimeout(function () {
                el.classList.add('out');
                setTimeout(function () { el.remove(); }, 300);
            }, kind === 'error' ? 5000 : 2400);
        }
        /* ---------------- Dialog ---------------- */
        function confirm(opts) {
            return showDialog(Object.assign({}, opts, { input: null }));
        }
        function prompt(opts) {
            return showDialog(Object.assign({}, opts, { input: typeof opts.input === 'string' ? opts.input : '' }));
        }
        function showDialog(opts) {
            return new Promise(function (resolve) {
                if (dialogOpen) {
                    queue.push({ opts, resolve });
                    return;
                }
                dialogOpen = true;
                previousFocus = document.activeElement;
                activeResolve = resolve;
                activeIsPrompt = opts.input !== null && opts.input !== undefined;
                dTitle.textContent = opts.title || '';
                dMsg.textContent = opts.message || '';
                dMsg.hidden = !opts.message;
                if (activeIsPrompt) {
                    dInput.hidden = false;
                    dInput.value = opts.input || '';
                    dInput.placeholder = opts.placeholder || '';
                }
                else {
                    dInput.hidden = true;
                    dInput.value = '';
                }
                dOk.textContent = opts.confirmText || 'OK';
                dOk.classList.toggle('danger', !!opts.danger);
                dOk.classList.toggle('primary', !opts.danger);
                dCancel.textContent = opts.cancelText || 'Cancel';
                dCancel.hidden = opts.cancelText === null;
                dialog.hidden = false;
                if (activeIsPrompt) {
                    dInput.focus();
                    dInput.select();
                }
                else {
                    dOk.focus();
                }
            });
        }
        function finish(v) {
            if (!dialogOpen)
                return;
            dialog.hidden = true;
            dialogOpen = false;
            const r = activeResolve;
            activeResolve = null;
            const focus = previousFocus;
            previousFocus = null;
            focusBack(focus);
            if (r)
                r(v);
            const next = queue.shift();
            if (next) {
                // Preserve callers' individual resolutions, even with multiple dialogs pending.
                showDialog(next.opts).then(next.resolve);
            }
        }
        dialog.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                finish(activeIsPrompt ? null : false);
            }
            else
                trap(e, dialog);
        });
        dOk.addEventListener('click', function () {
            finish(activeIsPrompt ? dInput.value.trim() : true);
        });
        dCancel.addEventListener('click', function () {
            finish(activeIsPrompt ? null : false);
        });
        backdrop.addEventListener('click', function () {
            finish(activeIsPrompt ? null : false);
        });
        dInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                finish(dInput.value.trim());
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                finish(null);
            }
        });
        /* ---------------- Preview ---------------- */
        let previewAsset = null;
        async function capability(name) {
            if (!kernel.has(name))
                return null;
            try {
                return await kernel.require(name);
            }
            catch (e) {
                kernel.log.warn('capability unavailable: ' + name, e);
                return null;
            }
        }
        async function openPreview(asset) {
            const A = await capability('assets');
            if (!A) {
                toast('Assets not ready yet.', 'error');
                return;
            }
            const url = A.urls.get(asset.id);
            if (!url) {
                toast('Image data missing.', 'error');
                return;
            }
            previewFocus = document.activeElement;
            previewAsset = asset;
            pImg.src = url;
            pImg.alt = asset.name || 'Image preview';
            pName.textContent = asset.name || '';
            preview.hidden = false;
            pClose.focus();
        }
        function closePreview() {
            if (preview.hidden)
                return;
            preview.hidden = true;
            pImg.src = '';
            previewAsset = null;
            focusBack(previewFocus);
            previewFocus = null;
        }
        pAdd.addEventListener('click', async function () {
            if (!previewAsset)
                return;
            const asset = previewAsset;
            closePreview();
            const cam = await capability('camera');
            const instApi = await capability('instances');
            if (cam && instApi)
                instApi.addImage(asset.id, cam.data.x, cam.data.y);
        });
        preview.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closePreview();
            }
            else
                trap(e, preview);
        });
        pClose.addEventListener('click', closePreview);
        pBackdrop.addEventListener('click', closePreview);
        /* ---------------- API ---------------- */
        kernel.provide('ui.dialogs', { toast, confirm, prompt, openPreview, closePreview });
        kernel.on('toast', function (p) { toast(p.message, p.kind); });
        kernel.on('ui:preview-close', closePreview);
    }
});
