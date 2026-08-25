import { onDestroy, type Component } from "svelte";
import { readable, type Readable } from "svelte/store";
import VooyaHost from "./VooyaHost.svelte";

export interface VooyaMountError {
  stage: "load" | "mount" | "update" | "dispose";
  cause: unknown;
}

export interface VooyaComponentDefinition {
  abiVersion: number;
  name: string;
  scopeId?: string;
  props: Array<{
    name: string;
    type: "number" | "bigint" | "boolean" | "string" | "array" | "object";
    required: boolean;
    defaultValue?: unknown;
  }>;
  events: Array<{
    name: string;
    parameters: string[];
  }>;
}

export interface VooyaComponentHandle {
  dispose(): void;
  updateProps?(values: Record<string, unknown>): void;
  [method: string]: unknown;
}

export interface VooyaComponentBindings {
  mount(host: Element, ...props: unknown[]): VooyaComponentHandle;
}

export type VooyaComponentBindingsLoader = () => Promise<VooyaComponentBindings>;

export interface VooyaComponentBridge {
  contract: VooyaComponentDefinition;
  loadBindings: VooyaComponentBindingsLoader;
}

export type VooyaComponentProps = Record<string, unknown> & {
  class?: string;
  className?: string;
  onError?: (error: VooyaMountError) => void;
};

/** Turn the framework-neutral generated bridge into a Svelte 5 component. */
export function defineVooyaComponent(bridge: VooyaComponentBridge): Component<VooyaComponentProps> {
  return function GeneratedVooyaComponent(internals, props) {
    const bridgedProps = new Proxy(props, {
      get(target, property, receiver) {
        if (property === "__vooyaBridge") return bridge;
        return Reflect.get(target, property, receiver);
      },
      has(target, property) {
        return property === "__vooyaBridge" || Reflect.has(target, property);
      },
      ownKeys(target) {
        return [...new Set([...Reflect.ownKeys(target), "__vooyaBridge"])];
      },
      getOwnPropertyDescriptor(target, property) {
        if (property === "__vooyaBridge") {
          return { configurable: true, enumerable: true, value: bridge, writable: false };
        }
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    }) as VooyaComponentProps & { __vooyaBridge: VooyaComponentBridge };
    return VooyaHost(internals, bridgedProps);
  };
}

export interface VooyaStore<TSnapshot> {
  getSnapshot(): TSnapshot;
  subscribe(listener: () => void): (() => void) | void;
  dispose(): void;
  [method: string]: unknown;
}

export interface VooyaStoreOptions {
  onError?: (cause: unknown) => void;
  onNotify?: (name: string, payload: unknown) => void;
}

export type VooyaStoreFactory<TProps, TStore extends VooyaStore<unknown>> = (
  props: TProps,
  options?: VooyaStoreOptions,
) => TStore | Promise<TStore>;

export interface VooyaStoreBinding<TSnapshot, TStore extends VooyaStore<TSnapshot>> {
  /** Svelte readable store; `undefined` means the asynchronous WASM store is not ready yet. */
  state: Readable<TSnapshot | undefined>;
  readonly store: TStore | undefined;
}

export interface VooyaStoreBridge<TStore extends VooyaStore<unknown>> {
  name: string;
  create: VooyaStoreFactory<undefined, TStore>;
  actions: readonly string[];
}

/** Turn the framework-neutral generated store bridge into a Svelte store factory. */
export function defineVooyaStore<TStore extends VooyaStore<unknown>>(
  bridge: VooyaStoreBridge<TStore>,
) {
  return function useGeneratedVooyaStore(options: VooyaStoreOptions = {}) {
    const consumed = useVooyaStore(bridge.create, undefined, options);
    return {
      state: consumed.state,
      ...Object.fromEntries(bridge.actions.map((action) => [
        action,
        (...args: unknown[]) => {
          const candidate = consumed.store?.[action];
          if (typeof candidate !== "function") {
            throw new Error(`Vooya store action "${action}" is not ready.`);
          }
          return candidate.apply(consumed.store, args);
        },
      ])),
    };
  };
}

/** Connect an instance-scoped Rust store to the current Svelte component. */
export function useVooyaStore<
  TSnapshot,
  TProps,
  TStore extends VooyaStore<TSnapshot>,
>(
  factory: VooyaStoreFactory<TProps, TStore>,
  props: TProps,
  options: VooyaStoreOptions = {},
): VooyaStoreBinding<TSnapshot, TStore> {
  let active = true;
  let store: TStore | undefined;
  let createdStore: TStore | undefined;
  let unsubscribe: (() => void) | undefined;
  let publish: (snapshot: TSnapshot | undefined) => void = () => {};
  const state = readable<TSnapshot | undefined>(undefined, (set) => {
    publish = set;
    if (store) set(store.getSnapshot());
    return () => {
      publish = () => {};
    };
  });

  Promise.resolve(factory(props, options)).then(
    (resolved) => {
      createdStore = resolved;
      if (!active) {
        resolved.dispose();
        return;
      }
      store = resolved;
      publish(resolved.getSnapshot());
      const stop = resolved.subscribe(() => publish(resolved.getSnapshot()));
      unsubscribe = typeof stop === "function" ? stop : undefined;
    },
    (cause) => {
      if (active) options.onError?.(cause);
    },
  );

  onDestroy(() => {
    active = false;
    unsubscribe?.();
    unsubscribe = undefined;
    const current = store ?? createdStore;
    store = undefined;
    createdStore = undefined;
    current?.dispose();
  });

  return {
    state,
    get store() {
      return store;
    },
  };
}
