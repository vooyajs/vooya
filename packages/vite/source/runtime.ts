export { VOO_ABI_VERSION } from "@vooya/compiler/abi";
import { VOO_ABI_VERSION } from "@vooya/compiler/abi";

// wasm-bindgen only remembers a completed initialization. Multiple framework
// islands can mount in the same tick, so cache the in-flight promise as well.
const wasmInitializers = new WeakMap<() => unknown, Promise<unknown>>();

export function initializeWasm<T>(initializer: () => T | PromiseLike<T>): Promise<T> {
  const existing = wasmInitializers.get(initializer);
  if (existing) return existing as Promise<T>;

  let initialization;
  try {
    initialization = Promise.resolve(initializer());
  } catch (cause) {
    return Promise.reject(cause);
  }
  wasmInitializers.set(initializer, initialization);
  void initialization.catch(() => {
    if (wasmInitializers.get(initializer) === initialization) {
      wasmInitializers.delete(initializer);
    }
  });
  return initialization;
}

export function assertVooAbiVersion(actual: unknown) {
  if (actual === VOO_ABI_VERSION) return;
  throw new Error(
    `Vooya ABI mismatch: compiler expects ${VOO_ABI_VERSION}, but WASM provides ${String(actual)}.`,
  );
}
