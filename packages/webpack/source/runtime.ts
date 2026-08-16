import { VOO_ABI_VERSION } from "@vooya/compiler";
const initializers = new WeakMap<Function, Promise<unknown>>();
export function initializeWasm(initializer: Function) { const existing = initializers.get(initializer); if (existing) return existing; let value: Promise<unknown>; try { value = Promise.resolve(initializer()); } catch (cause) { return Promise.reject(cause); } initializers.set(initializer, value); void value.catch(() => { if (initializers.get(initializer) === value) initializers.delete(initializer); }); return value; }
export function assertVooAbiVersion(actual: unknown) { if (actual !== VOO_ABI_VERSION) throw new Error(`Vooya ABI mismatch: compiler expects ${VOO_ABI_VERSION}, but WASM provides ${String(actual)}.`); }
