"use strict";
/** TS-016: strictly typed UI adapter, preserves classic-script behavior and ABI. */
/* Phase 9 — optional UI adapter; no image logic resides in this plugin. */
definePlugin({
    id: 'ui-image-operations',
    version: '1.0.0',
    needs: ['imageCommands', 'imageProcessors', 'state'],
    provides: ['ui.imageOperations'],
    uses: [],
    accepts: { imageCommands: '^1.0.0', imageProcessors: '^1.0.0', state: '^1.0.0' },
    contractVersions: { 'ui.imageOperations': '1.0.0' },
    setup: async function (kernel) {
        const commands = await kernel.require('imageCommands');
        const processors = await kernel.require('imageProcessors');
        const S = (await kernel.require('state')).data;
        let active = null, focusFrom = null, url = null, busy = false;
        const modal = document.createElement('div');
        modal.id = 'image-operations-dialog';
        modal.hidden = true;
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', 'Process image');
        modal.className = 'image-operations-modal';
        const card = document.createElement('div');
        card.className = 'image-operations-card';
        modal.appendChild(card);
        const title = document.createElement('h2');
        title.textContent = 'Process image';
        card.appendChild(title);
        const summary = document.createElement('p');
        card.appendChild(summary);
        const form = document.createElement('form');
        card.appendChild(form);
        const makeLabel = (text, control) => {
            const label = document.createElement('label');
            const caption = document.createElement('span');
            caption.textContent = text;
            label.append(caption, control);
            return label;
        };
        const select = document.createElement('select');
        select.id = 'image-op-type';
        select.setAttribute('aria-label', 'Image operation');
        const opts = processors.list().flatMap(a => a.operations.map(op => ({ op, processor: a.id })));
        for (const item of opts) {
            const option = document.createElement('option');
            option.value = item.processor + ':' + item.op;
            option.textContent = item.op.replace(/([a-z])([A-Z])/g, '$1 $2') + ' · ' + item.processor;
            select.appendChild(option);
        }
        form.appendChild(makeLabel('Operation', select));
        const fields = document.createElement('div');
        fields.id = 'image-op-params';
        form.appendChild(fields);
        const feedback = document.createElement('p');
        feedback.id = 'image-operations-feedback';
        feedback.setAttribute('role', 'status');
        card.appendChild(feedback);
        const preview = document.createElement('img');
        preview.alt = 'Preview of processed image';
        preview.id = 'image-operations-preview';
        preview.hidden = true;
        card.appendChild(preview);
        const buttons = document.createElement('div');
        buttons.className = 'image-operations-actions';
        function button(text, kind) {
            const el = document.createElement('button');
            el.type = 'button';
            el.textContent = text;
            el.className = 'btn ' + (kind || '');
            buttons.appendChild(el);
            return el;
        }
        const previewButton = button('Preview');
        const applyButton = button('Create copy', 'primary');
        const closeButton = button('Close');
        card.appendChild(buttons);
        document.body.appendChild(modal);
        function selected() {
            const [processor, operation] = select.value.split(':');
            const params = {};
            for (const input of fields.querySelectorAll('[data-param]')) {
                params[input.dataset.param] = Number(input.value);
            }
            return { source: { assetId: active }, operation, processor, parameters: params,
                output: { kind: 'asset' } };
        }
        function syncFields() {
            fields.replaceChildren();
            if (!active)
                return;
            const asset = S.assets.find(a => a.id === active);
            const operation = select.value.split(':')[1];
            const specs = operation === 'resize' ?
                [['width', 'Width', asset?.originalWidth || 256, 1, 8192],
                    ['height', 'Height', asset?.originalHeight || 256, 1, 8192]] :
                ['brightness', 'contrast'].includes(operation) ?
                    [['amount', 'Amount (−100 to 100)', 0, -100, 100]] :
                    operation === 'threshold' ? [['level', 'Threshold', 128, 0, 255]] : [];
            for (const [name, label, value, min, max] of specs) {
                const input = document.createElement('input');
                input.type = 'number';
                input.step = '1';
                input.min = String(min);
                input.max = String(max);
                input.required = true;
                input.value = String(value);
                input.dataset.param = name;
                fields.appendChild(makeLabel(label, input));
            }
            feedback.textContent = '';
            clearPreview();
        }
        function clearPreview() {
            if (url)
                URL.revokeObjectURL(url);
            url = null;
            preview.src = '';
            preview.hidden = true;
        }
        function close() {
            modal.hidden = true;
            active = null;
            clearPreview();
            if (focusFrom?.isConnected)
                focusFrom.focus();
            focusFrom = null;
        }
        function open(assetId, trigger) {
            const asset = S.assets.find(a => a.id === assetId);
            if (!asset || busy)
                return;
            if (!modal.hidden)
                close();
            active = asset.id;
            focusFrom = trigger || document.activeElement;
            summary.textContent = asset.name + ' · ' + (asset.originalWidth || '?') + ' × ' +
                (asset.originalHeight || '?');
            select.value = 'canvas2d:grayscale';
            if (!select.value)
                select.selectedIndex = 0;
            syncFields();
            modal.hidden = false;
            select.focus();
        }
        function inRange() {
            for (const el of fields.querySelectorAll('input')) {
                if (!el.checkValidity())
                    return false;
            }
            return true;
        }
        async function perform(commit) {
            if (busy || !active)
                return;
            if (!inRange()) {
                feedback.textContent = 'Correct the numeric parameters before continuing.';
                return;
            }
            busy = true;
            previewButton.disabled = true;
            applyButton.disabled = true;
            closeButton.disabled = true;
            feedback.textContent = commit ? 'Saving a new asset…' : 'Generating preview…';
            try {
                const command = selected();
                const result = commit ? await commands.apply(command) : await commands.execute(command);
                if (modal.hidden)
                    return; // user closed while processing; do not reopen it
                if (!result.success)
                    throw Error(result.errors?.map(x => x.message).join('; ') || 'Image process failed');
                if (commit) {
                    feedback.textContent = 'Copy created: ' + result.asset.name;
                    if (result.warnings?.length)
                        feedback.textContent += ' (' + result.warnings[0].message + ')';
                    kernel.emit('toast', { message: 'Image copy created', kind: 'ok' });
                }
                else {
                    clearPreview();
                    url = URL.createObjectURL(result.blob);
                    preview.src = url;
                    preview.hidden = false;
                    feedback.textContent = 'Preview: ' + result.width + ' × ' + result.height;
                }
            }
            catch (err) {
                feedback.textContent = 'Cannot process image: ' + err.message;
            }
            finally {
                busy = false;
                previewButton.disabled = false;
                applyButton.disabled = false;
                closeButton.disabled = false;
            }
        }
        previewButton.addEventListener('click', () => { void perform(false); });
        applyButton.addEventListener('click', () => { void perform(true); });
        closeButton.addEventListener('click', close);
        select.addEventListener('change', syncFields);
        // Escape works even when another UI component moves focus outside the modal.
        kernel.listen(window, 'keydown', event => {
            if (modal.hidden || event.key !== 'Escape')
                return;
            event.preventDefault();
            event.stopPropagation();
            close();
        }, true);
        modal.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close();
                return;
            }
            if (event.key !== 'Tab')
                return;
            const items = Array.from(card.querySelectorAll('input,select,button'))
                .filter(el => !el.disabled && !el.hidden);
            if (!items.length)
                return;
            const first = items[0], last = items.at(-1);
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            }
            else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });
        kernel.on('ui:image-process', payload => open(payload?.assetId, payload?.trigger));
        kernel.trackCleanup(() => { clearPreview(); modal.remove(); });
        kernel.provide('ui.imageOperations', { open, close });
    }
});
