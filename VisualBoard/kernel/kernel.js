"use strict";
/* =====================================================================
 * TS-007: VisualBoard microkernel, authored exclusively in TypeScript.
 * Classic script, no ES modules, same window ABI and lifecycle semantics.
 * ===================================================================== */
(function (global) {
    'use strict';
    const DEFINITIONS = [];
    const REGISTRY = new Map();
    const STATES = new Map();
    const INSTANCES = new Map();
    const CAPABILITIES = new Map();
    const LISTENERS = new Map();
    const ONCE_WAITERS = new Map();
    const DISPOSERS = new Map();
    const DIAGNOSTICS = [];
    const DUPLICATE_IDS = new Set();
    let activePluginId = null;
    let bootState = 'idle';
    const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
    const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
    function contractRuntime() {
        return global.NVB_CONTRACT_RUNTIME || null;
    }
    /** The runtime allows invalid definitions to reach checkDefinition so they
     * become diagnostics rather than uncaught exceptions. TS callers are strict. */
    function pluginScope(def) {
        // Inherit the public kernel, overriding only owner-aware entry points.
        const scope = Object.create(kernel);
        const allowed = new Set([...def.needs, ...(def.uses || []), ...def.provides]);
        scope.has = (name) => allowed.has(name) && kernel.has(name);
        scope.require = (name) => {
            const entry = CAPABILITIES.get(name);
            const runtime = contractRuntime();
            if (runtime) {
                try {
                    runtime.verifyConsumer(def, name, entry ? entry.version : null);
                }
                catch (error) {
                    return Promise.reject(error);
                }
            }
            if (!entry)
                return Promise.reject(new Error('capability not found: ' + name));
            // Checked by provide()/contractRuntime before entering the registry.
            const impl = runtime ? runtime.view(name, entry.impl) : entry.impl;
            return Promise.resolve(impl);
        };
        scope.call = async (name, method, ...args) => {
            const impl = await scope.require(name);
            const fn = Reflect.get(impl, method);
            if (typeof fn !== 'function')
                throw new Error('method not found: ' + name + '.' + method);
            return await Reflect.apply(fn, impl, args);
        };
        scope.on = (event, handler) => kernel.on(event, handler, def.id);
        scope.once = (event) => kernel.once(event, def.id);
        scope.listen = (target, event, handler, options) => kernel.listen(target, event, handler, options, def.id);
        scope.trackCleanup = (disposer) => kernel.trackCleanup(disposer, def.id);
        return scope;
    }
    function record(code, pluginId, message, error) {
        const entry = {
            code, pluginId: pluginId || null, message: String(message),
            time: new Date().toISOString()
        };
        if (error) {
            const detail = error && typeof error === 'object' && 'message' in error
                ? error.message : error;
            entry.detail = String(detail || error);
        }
        DIAGNOSTICS.push(entry);
        kernel.log.error(code, pluginId || '(kernel)', message, error || '');
        return entry;
    }
    function stateOf(id) {
        return STATES.get(id);
    }
    function setState(id, status, reason) {
        const entry = stateOf(id);
        if (!entry)
            return;
        entry.status = status;
        entry.reason = reason || null;
        kernel.emit('kernel:plugin-state', {
            id, status: entry.status, reason: entry.reason
        });
    }
    function tracked(owner, disposer) {
        if (!owner)
            return disposer;
        let set = DISPOSERS.get(owner);
        if (!set) {
            set = new Set();
            DISPOSERS.set(owner, set);
        }
        let disposed = false;
        const off = function () {
            if (disposed)
                return;
            disposed = true;
            set.delete(off);
            disposer();
        };
        set.add(off);
        return off;
    }
    function releaseOwned(id) {
        const items = DISPOSERS.get(id);
        if (items) {
            for (const dispose of Array.from(items).reverse()) {
                try {
                    dispose();
                }
                catch (err) {
                    record('CLEANUP_FAILED', id, 'cleanup callback threw', err);
                }
            }
            DISPOSERS.delete(id);
        }
        for (const [name, entry] of CAPABILITIES) {
            if (entry.pluginId === id)
                CAPABILITIES.delete(name);
        }
    }
    function checkDefinition(def) {
        if (!VERSION_PATTERN.test(def.version || ''))
            return 'invalid semantic version (expected X.Y.Z)';
        if (!Array.isArray(def.needs) || !Array.isArray(def.provides) || !def.provides.length)
            return 'needs and non-empty provides must be arrays';
        for (const [label, names] of [
            ['needs', def.needs], ['provides', def.provides]
        ]) {
            if (names.some(n => typeof n !== 'string' || !ID_PATTERN.test(n)))
                return label + ' contains an invalid capability';
            if (new Set(names).size !== names.length)
                return label + ' contains a duplicate capability';
        }
        const runtime = contractRuntime();
        if (runtime) {
            const reason = runtime.validateDefinition(def);
            if (reason)
                return reason;
        }
        if (typeof def.setup !== 'function')
            return 'setup must be a function';
        if (def.teardown !== undefined && typeof def.teardown !== 'function')
            return 'teardown must be a function when provided';
        return null;
    }
    function validate() {
        for (const def of DEFINITIONS) {
            if (DUPLICATE_IDS.has(def.id)) {
                setState(def.id, 'failed', 'duplicate plugin id');
                continue;
            }
            const reason = checkDefinition(def);
            if (reason) {
                setState(def.id, 'failed', reason);
                record('INVALID_PLUGIN', def.id, reason);
            }
        }
        const providers = new Map();
        for (const def of DEFINITIONS) {
            if (DUPLICATE_IDS.has(def.id))
                continue;
            if (stateOf(def.id)?.status === 'failed')
                continue;
            for (const name of def.provides) {
                if (!providers.has(name))
                    providers.set(name, []);
                providers.get(name)?.push(def.id);
            }
        }
        for (const [cap, ids] of providers) {
            if (ids.length < 2)
                continue;
            const message = 'capability "' + cap +
                '" has multiple providers: ' + ids.join(', ');
            record('DUPLICATE_CAPABILITY', null, message);
            for (const id of ids)
                setState(id, 'failed', message);
        }
        const validProviders = new Map();
        for (const def of DEFINITIONS) {
            if (stateOf(def.id)?.status !== 'registered')
                continue;
            for (const cap of def.provides)
                validProviders.set(cap, def.id);
        }
        return validProviders;
    }
    function sortPlugins(providers) {
        const visited = new Set();
        const visiting = new Set();
        const stack = [];
        const result = [];
        function visit(id) {
            if (visited.has(id))
                return;
            if (visiting.has(id)) {
                const cycle = stack.slice(stack.indexOf(id)).concat(id);
                const message = 'dependency cycle: ' + cycle.join(' -> ');
                record('DEPENDENCY_CYCLE', id, message);
                for (const member of cycle)
                    setState(member, 'failed', message);
                return;
            }
            const def = REGISTRY.get(id);
            if (!def)
                return;
            visiting.add(id);
            stack.push(id);
            for (const need of def.needs) {
                const provider = providers.get(need);
                if (provider)
                    visit(provider);
            }
            stack.pop();
            visiting.delete(id);
            visited.add(id);
            result.push(def);
        }
        for (const def of DEFINITIONS) {
            if (stateOf(def.id)?.status === 'registered')
                visit(def.id);
        }
        return result;
    }
    function removeWaiter(event, waiter) {
        const set = ONCE_WAITERS.get(event);
        if (!set)
            return;
        set.delete(waiter);
        if (!set.size)
            ONCE_WAITERS.delete(event);
    }
    const kernel = {
        context: Object.freeze({
            id: 'nvb-' + Math.random().toString(36).slice(2, 9),
            version: '2.1.0', startedAt: Date.now()
        }),
        definePlugin(def) {
            if (bootState !== 'idle' && bootState !== 'booting') {
                record('LATE_PLUGIN', def && def.id, 'registration after boot is not supported');
                return false;
            }
            if (!def || typeof def.id !== 'string' || !ID_PATTERN.test(def.id)) {
                record('INVALID_PLUGIN', null, 'plugin must declare a valid id');
                return false;
            }
            if (REGISTRY.has(def.id)) {
                DUPLICATE_IDS.add(def.id);
                record('DUPLICATE_PLUGIN', def.id, 'plugin id registered more than once');
                return false;
            }
            // A plugin's literal needs/uses/provides narrow its setup scope at compile
            // time; the registry stores their erased common form for runtime ordering.
            const registered = def;
            DEFINITIONS.push(registered);
            REGISTRY.set(def.id, registered);
            STATES.set(def.id, {
                id: def.id, version: def.version || null, status: 'registered',
                needs: Array.isArray(def.needs) ? def.needs.slice() : [],
                provides: Array.isArray(def.provides) ? def.provides.slice() : [],
                reason: null
            });
            return true;
        },
        provide(name, impl) {
            if (typeof name !== 'string' || !ID_PATTERN.test(name))
                throw new Error('valid capability name required');
            if (!activePluginId || !REGISTRY.has(activePluginId))
                throw new Error('provide() is only allowed during plugin setup');
            const def = REGISTRY.get(activePluginId);
            if (!def || !def.provides.includes(name))
                throw new Error(activePluginId + ' did not declare capability ' + name);
            if (CAPABILITIES.has(name))
                throw new Error('capability already registered: ' + name);
            contractRuntime()?.validateSurface(name, impl);
            CAPABILITIES.set(name, {
                impl, pluginId: activePluginId,
                version: def.contractVersions?.[name] || '1.0.0'
            });
        },
        require(name) {
            const entry = CAPABILITIES.get(name);
            if (!entry)
                return Promise.reject(new Error('capability not found: ' + name));
            const runtime = contractRuntime();
            const impl = runtime ? runtime.view(name, entry.impl) : entry.impl;
            return Promise.resolve(impl);
        },
        has(name) {
            return CAPABILITIES.has(name);
        },
        async call(name, method, ...args) {
            const impl = await kernel.require(name);
            const fn = Reflect.get(impl, method);
            if (typeof fn !== 'function')
                throw new Error('method not found: ' + name + '.' + method);
            return await Reflect.apply(fn, impl, args);
        },
        on(event, handler, owner) {
            if (bootState === 'stopped')
                throw new Error('kernel is stopped');
            if (typeof event !== 'string' || typeof handler !== 'function')
                throw new TypeError('on(event, handler) requires a string and function');
            let set = LISTENERS.get(event);
            if (!set) {
                set = new Set();
                LISTENERS.set(event, set);
            }
            // Erase the event-specific parameter only at the keyed bus boundary.
            const listener = handler;
            set.add(listener);
            return tracked(owner || activePluginId, () => {
                set.delete(listener);
                if (!set.size)
                    LISTENERS.delete(event);
            });
        },
        once(event, owner) {
            if (bootState === 'stopped')
                return Promise.resolve(undefined);
            if (typeof event !== 'string')
                throw new TypeError('event must be a string');
            return new Promise(resolve => {
                let set = ONCE_WAITERS.get(event);
                if (!set) {
                    set = new Set();
                    ONCE_WAITERS.set(event, set);
                }
                const waiter = {
                    resolve: value => resolve(value),
                    done: false, off: () => { }
                };
                waiter.off = tracked(owner || activePluginId, () => {
                    removeWaiter(event, waiter);
                    if (!waiter.done) {
                        waiter.done = true;
                        resolve(undefined);
                    }
                });
                set.add(waiter);
            });
        },
        emit(event, ...args) {
            const payload = args[0];
            const set = LISTENERS.get(event);
            if (set)
                for (const handler of Array.from(set)) {
                    try {
                        handler(payload);
                    }
                    catch (err) {
                        kernel.log.error('handler error on "' + event + '"', err);
                    }
                }
            const waiters = ONCE_WAITERS.get(event);
            if (waiters) {
                ONCE_WAITERS.delete(event);
                for (const waiter of waiters) {
                    if (waiter.done)
                        continue;
                    waiter.done = true;
                    waiter.off();
                    waiter.resolve(payload);
                }
            }
        },
        trackCleanup(disposer, owner) {
            if (typeof disposer !== 'function')
                throw new TypeError('disposer must be a function');
            if (!(owner || activePluginId))
                throw new Error('trackCleanup requires a plugin owner');
            return tracked(owner || activePluginId, disposer);
        },
        listen(target, event, handler, options, owner) {
            if (bootState === 'stopped')
                throw new Error('kernel is stopped');
            if (!target || typeof target.addEventListener !== 'function' ||
                typeof target.removeEventListener !== 'function')
                throw new TypeError('listen requires an EventTarget');
            target.addEventListener(event, handler, options);
            return tracked(owner || activePluginId, () => {
                target.removeEventListener(event, handler, options);
            });
        },
        getPluginStatus(id) {
            const entry = stateOf(id);
            if (!entry)
                return null;
            return {
                id: entry.id, version: entry.version, status: entry.status,
                needs: entry.needs.slice(), provides: entry.provides.slice(),
                reason: entry.reason
            };
        },
        listPlugins() {
            return DEFINITIONS.map(def => kernel.getPluginStatus(def.id))
                .filter((status) => status !== null);
        },
        getDiagnostics() {
            return DIAGNOSTICS.map(entry => Object.assign({}, entry));
        },
        getBootStatus() { return bootState; },
        getCapabilityContract(name) {
            const all = global.NVB_CAPABILITY_CONTRACTS || {};
            return all[name] || null;
        },
        log: {
            debug: (...a) => console.debug('[nvb]', ...a),
            info: (...a) => console.info('[nvb]', ...a),
            warn: (...a) => console.warn('[nvb]', ...a),
            error: (...a) => console.error('[nvb]', ...a)
        },
        async boot(manifest) {
            if (bootState !== 'idle')
                throw new Error('kernel boot is a one-time operation');
            bootState = 'booting';
            kernel.log.info('booting', kernel.context);
            if (manifest && Array.isArray(manifest.plugins)) {
                for (const src of manifest.plugins) {
                    try {
                        await loadScript(src);
                    }
                    catch (err) {
                        record('SCRIPT_LOAD_FAILED', null, 'cannot load ' + src, err);
                    }
                }
            }
            const providers = validate();
            const ordered = sortPlugins(providers);
            for (const def of ordered) {
                if (stateOf(def.id)?.status !== 'registered')
                    continue;
                const unavailable = def.needs.filter(need => {
                    const providerId = providers.get(need);
                    return !providerId || stateOf(providerId)?.status !== 'ready' ||
                        !CAPABILITIES.has(need);
                });
                if (unavailable.length) {
                    const reason = 'unavailable required capabilities: ' + unavailable.join(', ');
                    setState(def.id, 'blocked', reason);
                    record('DEPENDENCY_UNAVAILABLE', def.id, reason);
                    continue;
                }
                setState(def.id, 'initializing');
                activePluginId = def.id;
                try {
                    await def.setup(pluginScope(def));
                    const absent = def.provides.filter(name => {
                        const entry = CAPABILITIES.get(name);
                        return !entry || entry.pluginId !== def.id;
                    });
                    if (absent.length)
                        throw new Error('declared capabilities not provided: ' + absent.join(', '));
                    INSTANCES.set(def.id, def);
                    setState(def.id, 'ready');
                }
                catch (err) {
                    record('SETUP_FAILED', def.id, 'plugin setup failed', err);
                    const message = err && typeof err === 'object' && 'message' in err
                        ? String(err.message || err) : String(err);
                    setState(def.id, 'failed', message);
                    if (typeof def.teardown === 'function') {
                        try {
                            await def.teardown(kernel);
                        }
                        catch (teardownError) {
                            record('TEARDOWN_FAILED', def.id, 'cleanup after setup failed', teardownError);
                        }
                    }
                    releaseOwned(def.id);
                }
                finally {
                    activePluginId = null;
                }
            }
            bootState = 'ready';
            kernel.emit('kernel:ready', {
                plugins: Array.from(INSTANCES.keys()),
                failed: kernel.listPlugins().filter(p => p.status === 'failed').map(p => p.id),
                blocked: kernel.listPlugins().filter(p => p.status === 'blocked').map(p => p.id)
            });
            kernel.log.info('ready with ' + INSTANCES.size + ' plugins');
            return kernel.listPlugins();
        },
        async shutdown() {
            if (bootState === 'stopped' || bootState === 'idle')
                return;
            if (bootState !== 'ready')
                throw new Error('cannot shutdown during boot');
            bootState = 'stopping';
            kernel.emit('kernel:shutdown');
            const defs = Array.from(INSTANCES.values()).reverse();
            for (const def of defs) {
                activePluginId = def.id;
                try {
                    if (typeof def.teardown === 'function')
                        await def.teardown(pluginScope(def));
                }
                catch (err) {
                    record('TEARDOWN_FAILED', def.id, 'plugin teardown failed', err);
                }
                finally {
                    releaseOwned(def.id);
                    setState(def.id, 'stopped');
                    INSTANCES.delete(def.id);
                    activePluginId = null;
                }
            }
            for (const waiters of ONCE_WAITERS.values()) {
                for (const waiter of waiters) {
                    if (!waiter.done) {
                        waiter.done = true;
                        waiter.resolve(undefined);
                    }
                }
            }
            ONCE_WAITERS.clear();
            LISTENERS.clear();
            CAPABILITIES.clear();
            bootState = 'stopped';
        }
    };
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = false;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('failed to load ' + src));
            document.head.appendChild(script);
        });
    }
    global.NVB_KERNEL = kernel;
    global.definePlugin = def => kernel.definePlugin(def);
})(window);
