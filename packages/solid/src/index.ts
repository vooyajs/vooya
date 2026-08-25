import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  type Accessor,
  type Component,
  type JSX,
} from "solid-js";

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

type RuntimeProps = Record<string, unknown> & {
  class?: string;
  className?: string;
  onError?: (error: VooyaMountError) => void;
};

/**
 * Bridge a Vooya component into Solid's owner lifecycle. The returned host is
 * an ordinary DOM node; Solid owns its placement while Rust owns its contents.
 */
export function defineVooyaComponent(
  bridge: VooyaComponentBridge | VooyaComponentDefinition,
  legacyLoader?: VooyaComponentBindingsLoader,
): Component<RuntimeProps> {
  const { contract: definition, loadBindings } = normalizeComponentBridge(bridge, legacyLoader);
  return function VooyaComponent(props: RuntimeProps): JSX.Element {
    const host = document.createElement("div");
    host.dataset.vooyaHost = "";
    if (definition.scopeId) host.dataset.vooScope = definition.scopeId;

    let active = true;
    let handle: VooyaComponentHandle | undefined;
    const previousProps = new Map<string, unknown>();

    createEffect(() => {
      const className = (props.class ?? props.className) as string | undefined;
      if (className == null || className === "") host.removeAttribute("class");
      else host.className = className;
    });

    for (const prop of definition.props) {
      createEffect(() => {
        const value = resolvePropValue(prop, props);
        const previous = previousProps.get(prop.name);
        previousProps.set(prop.name, value);
        if (!handle || Object.is(previous, value)) return;

        const startedAt = performance.now();
        try {
          if (typeof handle.updateProps === "function") {
            handle.updateProps({ [prop.name]: value });
          } else {
            const update = handle[`update_${prop.name}`];
            if (typeof update === "function") update.call(handle, value);
          }
          emitDiagnostic(host, definition, "update", elapsedSince(startedAt));
        } catch (cause) {
          emitDiagnostic(host, definition, "update", elapsedSince(startedAt), cause);
          props.onError?.({ stage: "update", cause });
        }
      });
    }

    const listeners = definition.events.map((event) => {
      const receive = (browserEvent: Event) => {
        const callback = props[solidEventName(event.name)];
        if (typeof callback !== "function") return;
        const detail = (browserEvent as CustomEvent<unknown>).detail;
        if (event.parameters.length > 1 && Array.isArray(detail)) callback(...detail);
        else if (event.parameters.length === 0) callback();
        else callback(detail);
      };
      return { name: `vooya-${event.name}`, receive };
    });

    onMount(() => {
      for (const listener of listeners) host.addEventListener(listener.name, listener.receive);

      void loadBindings().then(
        (bindings) => {
          if (!active) return;
          const startedAt = performance.now();
          try {
            handle = bindings.mount(
              host,
              ...definition.props.map((prop) => resolvePropValue(prop, props)),
            );
            for (const prop of definition.props) {
              previousProps.set(prop.name, resolvePropValue(prop, props));
            }
            emitDiagnostic(host, definition, "mount", elapsedSince(startedAt));
          } catch (cause) {
            removeListeners(host, listeners);
            emitDiagnostic(host, definition, "mount", elapsedSince(startedAt), cause);
            props.onError?.({ stage: "mount", cause });
          }
        },
        (cause) => {
          if (!active) return;
          removeListeners(host, listeners);
          emitDiagnostic(host, definition, "load", 0, cause);
          props.onError?.({ stage: "load", cause });
        },
      );
    });

    onCleanup(() => {
      active = false;
      removeListeners(host, listeners);
      if (handle) {
        const startedAt = performance.now();
        try {
          handle.dispose();
          emitDiagnostic(host, definition, "dispose", elapsedSince(startedAt));
        } catch (cause) {
          emitDiagnostic(host, definition, "dispose", elapsedSince(startedAt), cause);
          props.onError?.({ stage: "dispose", cause });
        }
      }
      handle = undefined;
    });

    return host;
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
  /** Solid accessor; `undefined` means the asynchronous WASM store is not ready yet. */
  state: Accessor<TSnapshot | undefined>;
  readonly store: TStore | undefined;
}

export interface VooyaStoreBridge<TStore extends VooyaStore<unknown>> {
  name: string;
  create: VooyaStoreFactory<undefined, TStore>;
  actions: readonly string[];
}

/** Turn the framework-neutral generated store bridge into a Solid primitive. */
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
          if (typeof candidate === "function") return candidate.apply(consumed.store, args);
        },
      ])),
    };
  };
}

/**
 * Connect an instance-scoped Rust store to the current Solid owner. Store
 * notifications update a signal and owner disposal releases the Rust handle.
 */
export function useVooyaStore<
  TSnapshot,
  TProps,
  TStore extends VooyaStore<TSnapshot>,
>(
  factory: VooyaStoreFactory<TProps, TStore>,
  props: TProps,
  options: VooyaStoreOptions = {},
): VooyaStoreBinding<TSnapshot, TStore> {
  const [state, setState] = createSignal<TSnapshot>();
  let active = true;
  let store: TStore | undefined;
  let createdStore: TStore | undefined;
  let unsubscribe: (() => void) | undefined;

  Promise.resolve(factory(props, options)).then(
    (resolved) => {
      createdStore = resolved;
      if (!active) {
        resolved.dispose();
        return;
      }
      store = resolved;
      const publish = () => setState(() => resolved.getSnapshot());
      publish();
      const cleanup = resolved.subscribe(publish);
      unsubscribe = typeof cleanup === "function" ? cleanup : undefined;
    },
    (cause) => {
      if (active) options.onError?.(cause);
    },
  );

  onCleanup(() => {
    active = false;
    unsubscribe?.();
    unsubscribe = undefined;
    const owned = store ?? createdStore;
    store = undefined;
    owned?.dispose();
  });

  return {
    state,
    get store() {
      return store;
    },
  };
}

type LifecyclePhase = "load" | "mount" | "update" | "dispose";

function removeListeners(
  host: Element,
  listeners: Array<{ name: string; receive: EventListener }>,
) {
  for (const listener of listeners) host.removeEventListener(listener.name, listener.receive);
}

function resolvePropValue(
  prop: VooyaComponentDefinition["props"][number],
  props: Record<string, unknown>,
): unknown {
  const value = props[prop.name];
  return value === undefined && Object.hasOwn(prop, "defaultValue")
    ? prop.defaultValue
    : value;
}

function solidEventName(name: string) {
  const pascal = name
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join("");
  return `on${pascal}`;
}

function emitDiagnostic(
  host: Element,
  definition: VooyaComponentDefinition,
  phase: LifecyclePhase,
  duration: number,
  cause?: unknown,
) {
  if (!isDevelopment()) return;
  const detail: Record<string, unknown> = {
    component: definition.name,
    abiVersion: definition.abiVersion,
    phase,
    duration,
  };
  if (cause !== undefined) detail.error = summarizeError(cause);
  host.dispatchEvent(new CustomEvent(cause === undefined ? `vooya:${phase}` : "vooya:error", {
    bubbles: false,
    detail,
  }));
}

function elapsedSince(startedAt: number) {
  return Math.max(0, performance.now() - startedAt);
}

function summarizeError(cause: unknown) {
  const error = cause instanceof Error ? cause : new Error(String(cause));
  return { name: error.name.slice(0, 200), message: error.message.slice(0, 200) };
}

function isDevelopment() {
  return (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true;
}

function normalizeComponentBridge(
  bridge: VooyaComponentBridge | VooyaComponentDefinition,
  legacyLoader?: VooyaComponentBindingsLoader,
): VooyaComponentBridge {
  if ("contract" in bridge) return bridge;
  if (!legacyLoader) throw new Error("Vooya component bridge is missing loadBindings.");
  return { contract: bridge, loadBindings: legacyLoader };
}
