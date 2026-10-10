"use strict";
/* Phase 9 — registry of independent image processors (ports/adapters). */
definePlugin({
    id: 'image-processors',
    version: '1.0.0',
    needs: [],
    provides: ['imageProcessors'],
    uses: [],
    accepts: {},
    contractVersions: { imageProcessors: '1.0.0' },
    setup: async function (kernel) {
        const adapters = new Map();
        const NAME = /^[a-z][a-zA-Z0-9._-]*$/;
        function register(adapter) {
            if (!adapter || !NAME.test(adapter.id || ''))
                throw Error('Invalid image processor id');
            if (adapters.has(adapter.id))
                throw Error('Duplicate image processor: ' + adapter.id);
            if (!Array.isArray(adapter.operations) || !adapter.operations.length ||
                adapter.operations.some(o => !NAME.test(o)))
                throw Error('Invalid operations for ' + adapter.id);
            if (typeof adapter.validate !== 'function' || typeof adapter.run !== 'function')
                throw Error('Processor needs validate(step) and run(canvas,step)');
            const operations = Object.freeze(adapter.operations.slice());
            const publicAdapter = Object.freeze({
                id: adapter.id, version: adapter.version || '1.0.0', operations,
                validate: adapter.validate, run: adapter.run,
                kind: adapter.kind || 'browser',
                description: adapter.description || ''
            });
            adapters.set(adapter.id, publicAdapter);
            return publicAdapter.id;
        }
        function list() {
            return Array.from(adapters.values(), a => ({
                id: a.id, version: a.version, kind: a.kind,
                operations: a.operations.slice(), description: a.description
            }));
        }
        function resolve(operation, preferred) {
            if (typeof operation !== 'string' || !NAME.test(operation))
                throw Error('Invalid operation');
            if (preferred != null) {
                const a = adapters.get(preferred);
                if (!a || !a.operations.includes(operation))
                    throw Error('Processor ' + preferred + ' does not support ' + operation);
                return a;
            }
            const candidates = Array.from(adapters.values()).filter(a => a.operations.includes(operation));
            if (!candidates.length)
                throw Error('Unsupported image operation: ' + operation);
            if (candidates.length > 1)
                throw Error('Ambiguous operation ' + operation + ' — specify processor');
            return candidates[0];
        }
        function plan(steps) {
            if (!Array.isArray(steps) || !steps.length || steps.length > 24)
                throw Error('Image pipeline must contain 1–24 steps');
            const prepared = steps.map((step, index) => {
                if (!step || typeof step !== 'object' || Array.isArray(step))
                    throw Error('Invalid step ' + index);
                const operation = step.operation;
                const adapter = resolve(operation, step.processor);
                const params = step.params === undefined ? {} : step.params;
                if (!params || typeof params !== 'object' || Array.isArray(params))
                    throw Error('Invalid params at step ' + index);
                // Serialization rejects non-finite/undefined/prototype-based parameters.
                const plain = JSON.parse(JSON.stringify(params));
                if (Object.keys(plain).length > 12)
                    throw Error('Too many parameters');
                const normalized = adapter.validate({ operation, params: plain });
                if (!normalized || typeof normalized !== 'object' || !normalized.params)
                    throw Error('Processor rejected step ' + index);
                return Object.freeze({
                    operation, processor: adapter.id,
                    params: Object.freeze({ ...normalized.params })
                });
            });
            return Object.freeze(prepared);
        }
        kernel.provide('imageProcessors', { register, list, resolve, plan });
    }
});
