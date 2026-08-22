import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  readonly,
  ref,
  shallowRef,
  watch,
} from "vue";

export interface VooyaStore<TSnapshot = unknown> {
  getSnapshot(): TSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
  [action: string]: unknown;
}

export interface UseVooyaStoreOptions {
  /** Dispose an instance-scoped store when this component unmounts. */
  disposeOnUnmount?: boolean;
  /** Receive asynchronous store creation failures. */
  onError?: (cause: unknown) => void;
}

export type VooyaStoreSource<TSnapshot = unknown> =
  | VooyaStore<TSnapshot>
  | PromiseLike<VooyaStore<TSnapshot>>;

/**
 * Consume the framework-neutral Rust store contract from Vue. The store owns
 * state and notification ordering; Vue only mirrors its latest snapshot.
 */
export function useVooyaStore<TSnapshot>(
  source: VooyaStoreSource<TSnapshot>,
  options: UseVooyaStoreOptions = {},
) {
  const pending = source && typeof source === "object" && "then" in source;
  const snapshot = shallowRef<TSnapshot | undefined>(
    pending ? undefined : (source as VooyaStore<TSnapshot>).getSnapshot(),
  );
  let store: VooyaStore<TSnapshot> | undefined;
  let unsubscribe: (() => void) | undefined;
  let active = true;
  const attach = (resolved: VooyaStore<TSnapshot>) => {
    if (!active) {
      resolved.dispose();
      return;
    }
    store = resolved;
    snapshot.value = resolved.getSnapshot();
    unsubscribe = resolved.subscribe(() => {
      snapshot.value = resolved.getSnapshot();
    });
  };
  const stop = () => {
    active = false;
    unsubscribe?.();
    unsubscribe = undefined;
    if (options.disposeOnUnmount) store?.dispose();
    store = undefined;
  };

  onMounted(() => {
    if (pending) {
      Promise.resolve(source).then(attach).catch((cause) => {
        if (active) options.onError?.(cause);
      });
    } else {
      attach(source as VooyaStore<TSnapshot>);
    }
  });
  onBeforeUnmount(stop);

  return {
    snapshot: readonly(snapshot),
    dispatch(action: string, ...args: unknown[]) {
      if (!store) throw new Error("Vooya store is not ready.");
      const candidate = store[action];
      if (typeof candidate !== "function") throw new Error(`Unknown Vooya store action "${action}".`);
      return candidate.apply(store, args);
    },
    unsubscribe: stop,
  };
}

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
  [method: string]: unknown;
}

export interface VooyaComponentBindings {
  mount(host: Element, ...props: unknown[]): VooyaComponentHandle;
}

export type VooyaComponentBindingsLoader = () => Promise<VooyaComponentBindings>;

export function defineVooyaComponent(
  definition: VooyaComponentDefinition,
  loadBindings: VooyaComponentBindingsLoader,
) {
  const constructors = {
    number: Number,
    bigint: BigInt,
    boolean: Boolean,
    string: String,
    array: Array,
    object: Object,
  };
  const componentProps = Object.fromEntries(
    definition.props.map((prop) => [
      prop.name,
      {
        type: constructors[prop.type] as any,
        required: prop.required,
        ...(Object.hasOwn(prop, "defaultValue") ? { default: prop.defaultValue } : {}),
      },
    ]),
  );
  const componentEvents = Object.fromEntries([
    ...definition.events.map((event) => [event.name, () => true] as const),
    ["error", (error: VooyaMountError) => error instanceof Object],
  ]);

  return defineComponent({
    name: definition.name.startsWith("Vooya") ? definition.name : `Vooya${definition.name}`,
    inheritAttrs: false,
    props: componentProps,
    emits: componentEvents,
    setup(props, { attrs, emit }) {
      const host = ref<Element>();
      let mounted = true;
      let handle: VooyaComponentHandle | undefined;

      const listeners = definition.events.map((event) => {
        const receive = (browserEvent: Event) => {
          const detail = (browserEvent as CustomEvent<unknown>).detail;
          if (event.parameters.length > 1 && Array.isArray(detail)) emit(event.name, ...detail);
          else if (event.parameters.length === 0) emit(event.name);
          else emit(event.name, detail);
        };
        return { name: `vooya-${event.name}`, receive };
      });

      onMounted(async () => {
        const startedAt = performance.now();
        try {
          const bindings = await loadBindings();
          if (!mounted || !host.value) return;

          for (const listener of listeners) {
            host.value.addEventListener(listener.name, listener.receive);
          }
          try {
            const values = props as Record<string, unknown>;
            handle = bindings.mount(
              host.value,
              ...definition.props.map((prop) => values[prop.name]),
            );
            emitDiagnostic(host.value, definition, "mount", elapsedSince(startedAt));
          } catch (cause) {
            for (const listener of listeners) {
              host.value.removeEventListener(listener.name, listener.receive);
            }
            emitDiagnostic(host.value, definition, "mount", elapsedSince(startedAt), cause);
            emit("error", { stage: "mount", cause });
          }
        } catch (cause) {
          if (host.value) emitDiagnostic(host.value, definition, "load", elapsedSince(startedAt), cause);
          if (mounted) emit("error", { stage: "load", cause });
        }
      });

      for (const prop of definition.props) {
        watch(
          () => (props as Record<string, unknown>)[prop.name],
          (value) => {
            const update = handle?.[`update_${prop.name}`];
            if (typeof update !== "function" || !host.value) return;
            const startedAt = performance.now();
            try {
              update.call(handle, value);
              emitDiagnostic(host.value, definition, "update", elapsedSince(startedAt));
            } catch (cause) {
              emitDiagnostic(host.value, definition, "update", elapsedSince(startedAt), cause);
              emit("error", { stage: "update", cause });
            }
          },
        );
      }

      onBeforeUnmount(() => {
        mounted = false;
        for (const listener of listeners) {
          host.value?.removeEventListener(listener.name, listener.receive);
        }
        if (handle && host.value) {
          const startedAt = performance.now();
          try {
            handle.dispose();
            emitDiagnostic(host.value, definition, "dispose", elapsedSince(startedAt));
          } catch (cause) {
            emitDiagnostic(host.value, definition, "dispose", elapsedSince(startedAt), cause);
            emit("error", { stage: "dispose", cause });
          }
        }
        handle = undefined;
      });

      return () =>
        h("div", {
          ...attrs,
          ref: host,
          "data-vooya-host": "",
          ...(definition.scopeId ? { "data-voo-scope": definition.scopeId } : {}),
        });
    },
  });
}

type LifecyclePhase = "load" | "mount" | "update" | "dispose";

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
  return {
    name: truncate(error.name || "Error"),
    message: truncate(error.message),
  };
}

function truncate(value: string) {
  return value.slice(0, 200);
}

function isDevelopment() {
  return (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true;
}
