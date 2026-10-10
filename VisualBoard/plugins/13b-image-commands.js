"use strict";
/* Phase 9 — public image command pipeline, immutable sources and transactional derived assets. */
definePlugin({
    id: 'image-commands',
    version: '1.0.0',
    needs: ['imageProcessors', 'imageCanvasProcessor', 'assets', 'state', 'backend', 'utils', 'history'],
    provides: ['imageCommands'],
    uses: ['app'],
    accepts: {
        imageProcessors: '^1.0.0', imageCanvasProcessor: '^1.0.0',
        assets: '^1.0.0', state: '^1.0.0', backend: '^1.0.0',
        utils: '^1.0.0', history: '^1.0.0', app: '^1.0.0'
    },
    contractVersions: { imageCommands: '1.0.0' },
    setup: async function (kernel) {
        const processors = await kernel.require('imageProcessors');
        const A = await kernel.require('assets');
        const S = (await kernel.require('state')).data;
        const backend = await kernel.require('backend');
        const utils = await kernel.require('utils');
        const H = await kernel.require('history');
        const supported = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif']);
        const MAX_PIXELS = 16000000, MAX_BYTES = 32 * 1024 * 1024;
        function normalize(command) {
            if (!command || typeof command !== 'object' || Array.isArray(command))
                throw Error('image.process expects an object');
            const source = command.source;
            if (!source || typeof source !== 'object' || typeof source.assetId !== 'string' || !source.assetId)
                throw Error('Image command source must include assetId');
            const steps = Array.isArray(command.steps) ? command.steps :
                command.operation ? [{ operation: command.operation, params: command.parameters || {},
                        processor: command.processor }] : null;
            const planned = processors.plan(steps);
            const output = command.output || { kind: 'asset' };
            if (!output || !['asset', 'blob'].includes(output.kind))
                throw Error('Image output.kind must be "asset" or "blob"');
            if (output.name != null && (typeof output.name !== 'string' || !output.name.trim() ||
                output.name.length > 100))
                throw Error('Invalid output name');
            const metadata = S.assets.find(a => a.id === source.assetId);
            if (!metadata)
                throw Error('Source asset not found: ' + source.assetId);
            if (!supported.has(metadata.mimeType || ''))
                throw Error('Unsupported image type');
            return { sourceAsset: metadata, steps: planned,
                output: { kind: output.kind, name: output.name || null } };
        }
        function plan(command) {
            const p = normalize(command);
            let width = p.sourceAsset.originalWidth || 0, height = p.sourceAsset.originalHeight || 0;
            for (const step of p.steps)
                if (step.operation === 'resize') {
                    width = step.params.width;
                    height = step.params.height;
                }
                else if (step.operation === 'rotate90') {
                    const t = width;
                    width = height;
                    height = t;
                }
            if (width * height > MAX_PIXELS)
                throw Error('Output exceeds 16 megapixels');
            return { sourceAssetId: p.sourceAsset.id,
                operations: p.steps.map(({ operation, processor, params }) => ({ operation, processor, params })),
                output: p.output, width, height };
        }
        async function loadSource(asset) {
            let blob = A.blobs.get(asset.id);
            if (!(blob instanceof Blob))
                blob = await backend.get('blobs', asset.id);
            if (!(blob instanceof Blob) || !blob.size)
                throw Error('Source image binary unavailable: ' + asset.id);
            if (blob.size > MAX_BYTES)
                throw Error('Source binary exceeds 32 MB limit');
            let bitmap;
            try {
                bitmap = await createImageBitmap(blob);
            }
            catch (e) {
                throw Error('Cannot decode source image: ' + asset.id);
            }
            if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_PIXELS) {
                bitmap.close();
                throw Error('Source exceeds 16 megapixels');
            }
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
                bitmap.close();
                throw Error('Canvas2D unavailable');
            }
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            return canvas;
        }
        async function execute(command) {
            const started = performance.now();
            let canvas = null;
            try {
                const job = normalize(command);
                canvas = await loadSource(job.sourceAsset);
                for (let i = 0; i < job.steps.length; i++) {
                    const step = job.steps[i], processor = processors.resolve(step.operation, step.processor);
                    const result = await processor.run(canvas, step);
                    if (!(result instanceof HTMLCanvasElement) || result.width <= 0 || result.height <= 0 ||
                        result.width * result.height > MAX_PIXELS)
                        throw Error('Processor returned invalid dimensions or result');
                    if (result !== canvas) {
                        canvas.width = 0;
                        canvas.height = 0;
                    }
                    canvas = result;
                    kernel.emit('image:progress', { current: i + 1, total: job.steps.length,
                        operation: step.operation });
                }
                const width = canvas.width, height = canvas.height;
                const blob = await new Promise((resolve, reject) => {
                    try {
                        canvas.toBlob(b => b ? resolve(b) : reject(Error('PNG encode failed')), 'image/png');
                    }
                    catch (e) {
                        reject(e);
                    }
                });
                if (!blob.size)
                    throw Error('Generated image is empty');
                return { success: true, format: 'image/png', blob, width, height, bytes: blob.size,
                    operations: job.steps.map(s => s.operation),
                    elapsedMs: Math.round(performance.now() - started), errors: [] };
            }
            catch (error) {
                kernel.log.error('image command failed', error);
                return { success: false, format: 'image/png', errors: [{ code: 'IMAGE_PROCESS_FAILED',
                            message: error.message }], elapsedMs: Math.round(performance.now() - started) };
            }
            finally {
                if (canvas) {
                    canvas.width = 0;
                    canvas.height = 0;
                }
            }
        }
        async function apply(command) {
            let job;
            try {
                job = normalize(command);
                if (job.output.kind !== 'asset')
                    throw Error('apply() requires output.kind="asset"');
            }
            catch (error) {
                return { success: false, errors: [{ code: 'INVALID_COMMAND', message: error.message }] };
            }
            const result = await execute(command);
            if (!result.success)
                return result;
            const id = utils.uid('asset');
            const original = job.sourceAsset;
            const baseName = job.output.name || original.name.replace(/\.[^.]+$/, '') +
                ' [' + job.steps.map(s => s.operation).join('+') + '].png';
            const clean = baseName.endsWith('.png') ? baseName : baseName + '.png';
            let name = clean, n = 2;
            const exists = () => S.assets.some(a => a.name.toLowerCase() === name.toLowerCase());
            while (exists())
                name = clean.replace(/\.png$/i, '') + ' (' + (n++) + ').png';
            const metadata = {
                id, name, packageId: original.packageId, mimeType: 'image/png',
                originalWidth: result.width, originalHeight: result.height, size: result.bytes,
                createdAt: Date.now(), updatedAt: Date.now(),
                derivedFrom: original.id, operations: job.steps.map(s => ({
                    processor: s.processor, operation: s.operation, params: s.params
                }))
            };
            let persisted = false, createdUrl = null;
            try {
                await H.transaction('image.process', async () => {
                    if (backend.isAvailable()) {
                        await backend.put('blobs', id, result.blob);
                        persisted = true;
                    }
                    createdUrl = URL.createObjectURL(result.blob);
                    A.blobs.set(id, result.blob);
                    A.urls.set(id, createdUrl);
                    A.missing.delete(id);
                    S.assets.push(metadata);
                    kernel.emit('assets:changed');
                    kernel.emit('state:changed');
                });
            }
            catch (error) {
                if (createdUrl)
                    URL.revokeObjectURL(createdUrl);
                A.urls.delete(id);
                A.blobs.delete(id);
                S.assets = S.assets.filter(a => a.id !== id);
                if (persisted) {
                    try {
                        await backend.del('blobs', id);
                    }
                    catch (rollback) {
                        kernel.log.error('derived image rollback failed', rollback);
                    }
                }
                return { success: false, errors: [{ code: 'ASSET_COMMIT_FAILED', message: error.message }] };
            }
            let saved = false, warnings = [];
            if (kernel.has('app')) {
                try {
                    saved = !!(await kernel.call('app', 'saveNow'));
                }
                catch (e) {
                    warnings.push({ code: 'SAVE_FAILED', message: e.message });
                }
            }
            if (!backend.isAvailable())
                warnings.push({
                    code: 'VOLATILE_STORAGE', message: 'Image exists in memory only; download a project backup.'
                });
            kernel.emit('toast', { message: 'Processed image: ' + name, kind: 'ok' });
            return { success: true, assetId: id, asset: metadata, saved,
                width: result.width, height: result.height, bytes: result.bytes,
                warnings, errors: [] };
        }
        async function process(command) {
            try {
                const job = normalize(command);
                return job.output.kind === 'blob' ? await execute(command) : await apply(command);
            }
            catch (error) {
                return { success: false, errors: [{
                            code: 'INVALID_COMMAND', message: error.message
                        }] };
            }
        }
        kernel.provide('imageCommands', { plan, execute, apply, process });
    }
});
