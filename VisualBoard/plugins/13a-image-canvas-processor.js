"use strict";
/* Phase 9 — built-in CPU Canvas2D adapter, fully offline and replaceable. */
definePlugin({
    id: 'image-canvas-processor',
    version: '1.0.0',
    needs: ['imageProcessors'],
    provides: ['imageCanvasProcessor'],
    uses: [],
    accepts: { imageProcessors: '^1.0.0' },
    contractVersions: { imageCanvasProcessor: '1.0.0' },
    setup: async function (kernel) {
        const processors = await kernel.require('imageProcessors');
        const PIXEL_OPS = new Set(['grayscale', 'invert', 'sepia', 'brightness', 'contrast', 'threshold']);
        const OPERATIONS = [...PIXEL_OPS, 'flipHorizontal', 'flipVertical', 'rotate90', 'resize'];
        const range = (v, min, max, name) => {
            if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
                throw Error('Invalid ' + name + ': must be ' + min + ' to ' + max);
            return v;
        };
        function validate(step) {
            const { operation } = step;
            const params = step.params || {};
            const keys = Object.keys(params);
            let normalized = {};
            if (['brightness', 'contrast'].includes(operation)) {
                if (keys.some(k => k !== 'amount'))
                    throw Error('Unexpected image parameter');
                normalized = { amount: range(params.amount, -100, 100, 'amount') };
            }
            else if (operation === 'threshold') {
                if (keys.some(k => k !== 'level'))
                    throw Error('Unexpected image parameter');
                normalized = { level: range(params.level, 0, 255, 'level') };
            }
            else if (operation === 'resize') {
                if (keys.some(k => !['width', 'height'].includes(k)))
                    throw Error('Unexpected image parameter');
                const n = (key) => {
                    const value = range(params[key], 1, 8192, key);
                    if (!Number.isInteger(value))
                        throw Error(key + ' must be an integer');
                    return value;
                };
                const width = n('width'), height = n('height');
                if (width * height > 16000000)
                    throw Error('Resize exceeds 16 megapixels');
                normalized = { width, height };
            }
            else if (!OPERATIONS.includes(operation)) {
                throw Error('Canvas adapter cannot process ' + operation);
            }
            else if (keys.length)
                throw Error('Unexpected params for ' + operation);
            return { operation, params: normalized };
        }
        function create(w, h) {
            const el = document.createElement('canvas');
            el.width = w;
            el.height = h;
            if (!el.getContext('2d', { willReadFrequently: true }))
                throw Error('Canvas2D unavailable');
            return el;
        }
        function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }
        async function run(canvas, step) {
            const { operation } = step;
            const params = step.params;
            if (PIXEL_OPS.has(operation)) {
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                const data = ctx.getImageData(0, 0, canvas.width, canvas.height), p = data.data;
                for (let i = 0; i < p.length; i += 4) {
                    const r = p[i], g = p[i + 1], b = p[i + 2];
                    let nr = r, ng = g, nb = b;
                    if (operation === 'grayscale' || operation === 'threshold') {
                        const grey = .2126 * r + .7152 * g + .0722 * b;
                        nr = ng = nb = operation === 'threshold' ? (grey >= params.level ? 255 : 0) : grey;
                    }
                    else if (operation === 'invert') {
                        nr = 255 - r;
                        ng = 255 - g;
                        nb = 255 - b;
                    }
                    else if (operation === 'sepia') {
                        nr = .393 * r + .769 * g + .189 * b;
                        ng = .349 * r + .686 * g + .168 * b;
                        nb = .272 * r + .534 * g + .131 * b;
                    }
                    else if (operation === 'brightness') {
                        nr = r + params.amount * 2.55;
                        ng = g + params.amount * 2.55;
                        nb = b + params.amount * 2.55;
                    }
                    else if (operation === 'contrast') {
                        const c = params.amount * 2.55;
                        const factor = (259 * (c + 255)) / (255 * (259 - c));
                        nr = factor * (r - 128) + 128;
                        ng = factor * (g - 128) + 128;
                        nb = factor * (b - 128) + 128;
                    }
                    p[i] = clamp(nr);
                    p[i + 1] = clamp(ng);
                    p[i + 2] = clamp(nb);
                    // Alpha stays unchanged.
                }
                ctx.putImageData(data, 0, 0);
                return canvas;
            }
            const rotated = operation === 'rotate90';
            const newW = operation === 'resize' ? params.width : rotated ? canvas.height : canvas.width;
            const newH = operation === 'resize' ? params.height : rotated ? canvas.width : canvas.height;
            if (newW * newH > 16000000)
                throw Error('Image exceeds 16 megapixels');
            const output = create(newW, newH), ctx = output.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            if (operation === 'resize')
                ctx.drawImage(canvas, 0, 0, newW, newH);
            else if (rotated) {
                ctx.translate(newW, 0);
                ctx.rotate(Math.PI / 2);
                ctx.drawImage(canvas, 0, 0);
            }
            else if (operation === 'flipHorizontal') {
                ctx.translate(newW, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(canvas, 0, 0);
            }
            else if (operation === 'flipVertical') {
                ctx.translate(0, newH);
                ctx.scale(1, -1);
                ctx.drawImage(canvas, 0, 0);
            }
            else
                throw Error('Unsupported operation ' + operation);
            return output;
        }
        processors.register({
            id: 'canvas2d', version: '1.0.0', kind: 'browser', operations: OPERATIONS,
            description: 'Offline Canvas2D operations, no native executables',
            validate, run
        });
        kernel.provide('imageCanvasProcessor', { operations: OPERATIONS.slice() });
    }
});
