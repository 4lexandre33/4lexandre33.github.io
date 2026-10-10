"use strict";
/* TS-008: versioned capability ABI validator, classic TypeScript script.
 * Semantics and failure/error strings preserved from kernel/contract-runtime.js.
 */
(function (global) {
    'use strict';
    const registry = () => global.NVB_CAPABILITY_CONTRACTS || null;
    class CapabilityError extends Error {
        constructor(message) {
            super(message);
            this.name = 'CapabilityError';
        }
    }
    class OperationError extends Error {
        constructor(message, cause) {
            super(message);
            this.name = 'OperationError';
            if (cause)
                this.cause = cause;
        }
    }
    const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
    function parse(version) {
        const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version || '');
        return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
    }
    function satisfies(version, range) {
        if (typeof range !== 'string')
            return false;
        const v = parse(version);
        const caret = range.startsWith('^');
        const min = parse(caret ? range.slice(1) : range);
        if (!v || !min)
            return false;
        if (!caret)
            return v.every((number, i) => number === min[i]);
        if (min[0] > 0)
            return v[0] === min[0] &&
                (v[1] > min[1] || v[1] === min[1] && v[2] >= min[2]);
        return v[0] === 0 && v[1] === min[1] && v[2] >= min[2];
    }
    function matches(value, type) {
        if (type.includes('|'))
            return type.split('|').some(part => matches(value, part));
        if (type === 'any')
            return true;
        if (type === 'nullable')
            return value === null || typeof value === 'string';
        if (type === 'array')
            return Array.isArray(value);
        if (type === 'map' || type === 'set') {
            return Object.prototype.toString.call(value) === '[object ' +
                (type === 'map' ? 'Map' : 'Set') + ']';
        }
        if (type === 'object')
            return value !== null && typeof value === 'object';
        if (type === 'void')
            return value === undefined;
        if (type === 'null')
            return value === null;
        return typeof value === type;
    }
    function validateDefinition(def) {
        const contracts = registry();
        if (!contracts)
            return null; // Backwards-compatible standalone kernel tests
        if (!Array.isArray(def.uses) ||
            def.uses.some(v => typeof v !== 'string') ||
            new Set(def.uses).size !== def.uses.length) {
            return 'uses must be a unique array of capability names';
        }
        if (!def.accepts || !def.contractVersions)
            return 'missing contract version declarations';
        for (const name of [...def.needs, ...def.uses]) {
            const declared = contracts[name];
            if (!own(contracts, name) || !declared)
                return 'unknown consumed capability contract: ' + name;
            if (!satisfies(declared.version, def.accepts[name])) {
                return 'incompatible required contract: ' + name + '@' + def.accepts[name];
            }
        }
        for (const name of def.provides) {
            const declared = contracts[name];
            if (!own(contracts, name) || !declared)
                return 'unknown provided capability contract: ' + name;
            if (!satisfies(def.contractVersions[name], '^' + declared.version)) {
                return 'incompatible provider contract: ' + name + '@' + def.contractVersions[name];
            }
        }
        return null;
    }
    function validateSurface(name, impl) {
        const contracts = registry();
        if (!contracts)
            return;
        const spec = contracts[name];
        if (!spec)
            throw new CapabilityError('CapabilityError: contract not found: ' + name);
        if (impl == null || typeof impl !== 'object') {
            throw new CapabilityError('CapabilityError: ' + name + ' must be an object');
        }
        const surface = impl;
        for (const method of Object.keys(spec.methods)) {
            if (typeof surface[method] !== 'function') {
                throw new CapabilityError('CapabilityError: ' + name + ' missing method ' + method);
            }
        }
        for (const [field, type] of Object.entries(spec.properties)) {
            if (!matches(surface[field], type)) {
                throw new CapabilityError('CapabilityError: ' + name + '.' + field + ' expected ' + type);
            }
        }
    }
    function validateArgs(name, method, args) {
        const spec = registry()?.[name]?.methods?.[method];
        if (!spec || !Array.isArray(spec.params))
            return;
        if (spec.params[0] === '...args:any')
            return;
        for (let i = 0; i < spec.params.length; i++) {
            const parameter = spec.params[i];
            if (parameter === undefined)
                continue;
            if (parameter.startsWith('...'))
                break;
            const colon = parameter.lastIndexOf(':');
            const label = colon === -1 ? parameter : parameter.slice(0, colon);
            const type = colon === -1 ? 'any' : parameter.slice(colon + 1);
            if (args[i] === undefined && label.endsWith('?'))
                continue;
            if (!matches(args[i], type)) {
                throw new CapabilityError('CapabilityError: ' + name + '.' + method +
                    ' argument ' + label + ' expected ' + type);
            }
        }
    }
    function validateResult(name, method, value) {
        const expected = registry()?.[name]?.methods?.[method]?.returns;
        if (!expected || expected === 'any')
            return;
        if (expected.startsWith('promise<')) {
            if (!value || typeof value.then !== 'function') {
                throw new CapabilityError('CapabilityError: ' + name + '.' + method + ' expected Promise');
            }
            return;
        }
        if (expected.endsWith('|null') && value === null)
            return;
        if (!matches(value, expected.replace(/\|null$/, ''))) {
            throw new CapabilityError('CapabilityError: ' + name + '.' + method + ' returned invalid type');
        }
    }
    function view(name, impl) {
        if (!registry())
            return impl;
        return new Proxy(impl, {
            get(target, key, receiver) {
                const value = Reflect.get(target, key, receiver);
                if (typeof key !== 'string' || typeof value !== 'function')
                    return value;
                return function (...args) {
                    validateArgs(name, key, args);
                    const result = Reflect.apply(value, target, args);
                    validateResult(name, key, result);
                    return result;
                };
            }
        });
    }
    function verifyConsumer(def, name, publishedVersion) {
        if (!registry())
            return;
        const known = name;
        const permitted = def.needs.includes(known) ||
            (def.uses || []).includes(known) || def.provides.includes(known);
        if (!permitted)
            throw new CapabilityError('CapabilityError: ' + def.id +
                ' did not declare use of ' + name);
        if (def.provides.includes(known))
            return;
        if (!satisfies(publishedVersion, def.accepts[known])) {
            throw new CapabilityError('CapabilityError: ' + def.id + ' requires ' +
                name + '@' + def.accepts[known] + ', provided ' + publishedVersion);
        }
    }
    global.NVB_CONTRACT_RUNTIME = Object.freeze({
        satisfies, validateDefinition, validateSurface, validateArgs,
        validateResult, view, verifyConsumer,
        errors: Object.freeze({ CapabilityError, OperationError })
    });
})(window);
