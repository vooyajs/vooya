import { createElement, useEffect, useRef } from "react";

export interface VooyaMountError {
  stage: "load" | "mount";
  cause: unknown;
}

export interface VooyaComponentDefinition {
  abiVersion: number;
  name: string;
  scopeId?: string;
  props: Array<{
    name: string;
    type: "number" | "boolean" | "string";
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

type RuntimeProps = Record<string, unknown> & {
  className?: string;
  onError?: (error: VooyaMountError) => void;
};

export function defineVooyaComponent(
  definition: VooyaComponentDefinition,
  loadBindings: VooyaComponentBindingsLoader,
) {
  return function VooyaComponent(componentProps: RuntimeProps) {
    const host = useRef<HTMLDivElement>(null);
    const handle = useRef<VooyaComponentHandle | undefined>(undefined);
    const props = useRef(componentProps);
    const previousProps = useRef<Record<string, unknown> | undefined>(undefined);
    props.current = componentProps;

    useEffect(() => {
      let active = true;
      const element = host.current;
      if (!element) return undefined;

      const listeners = definition.events.map((event) => {
        const receive = (browserEvent: Event) => {
          const callback = props.current[reactEventName(event.name)];
          if (typeof callback !== "function") return;
          const detail = (browserEvent as CustomEvent<unknown>).detail;
          if (event.parameters.length > 1 && Array.isArray(detail)) callback(...detail);
          else if (event.parameters.length === 0) callback();
          else callback(detail);
        };
        element.addEventListener(`vooya-${event.name}`, receive);
        return { name: `vooya-${event.name}`, receive };
      });

      void loadBindings()
        .then((bindings) => {
          if (!active) return;
          const startedAt = performance.now();
          try {
            handle.current = bindings.mount(
              element,
              ...definition.props.map((prop) => resolvePropValue(prop, props.current)),
            );
            emitDiagnostic(element, definition, "mount", elapsedSince(startedAt));
          } catch (cause) {
            for (const listener of listeners) {
              element.removeEventListener(listener.name, listener.receive);
            }
            emitDiagnostic(element, definition, "mount", elapsedSince(startedAt), cause);
            props.current.onError?.({ stage: "mount", cause });
          }
        })
        .catch((cause) => {
          emitDiagnostic(element, definition, "load", 0, cause);
          props.current.onError?.({ stage: "load", cause });
        });

      return () => {
        active = false;
        for (const listener of listeners) {
          element.removeEventListener(listener.name, listener.receive);
        }
        // See the Vue adapter: freeing synchronously can race wasm-bindgen's
        // temporary borrow during framework teardown.
        if (handle.current) {
          const startedAt = performance.now();
          try {
            handle.current.dispose();
            emitDiagnostic(element, definition, "dispose", elapsedSince(startedAt));
          } catch (cause) {
            emitDiagnostic(element, definition, "dispose", elapsedSince(startedAt), cause);
          }
        }
        handle.current = undefined;
      };
    }, [loadBindings]);

    useEffect(() => {
      const previous = previousProps.current;
      if (previous) {
        for (const prop of definition.props) {
          const value = resolvePropValue(prop, componentProps);
          if (Object.is(previous[prop.name], value)) continue;
          if (!host.current) continue;
          const dispatch = handle.current?.["update"];
          const update = handle.current?.[`update_${prop.name}`];
          const startedAt = performance.now();
          try {
            if (typeof dispatch === "function") dispatch.call(handle.current, prop.name, value);
            else if (typeof update === "function") update.call(handle.current, value);
            else continue;
            emitDiagnostic(host.current, definition, "update", elapsedSince(startedAt));
          } catch (cause) {
            emitDiagnostic(host.current, definition, "update", elapsedSince(startedAt), cause);
          }
        }
      }
      previousProps.current = Object.fromEntries(
        definition.props.map((prop) => [prop.name, resolvePropValue(prop, componentProps)]),
      );
    });

    return createElement("div", {
      ref: host,
      className: componentProps.className,
      "data-vooya-host": "",
      ...(definition.scopeId ? { "data-voo-scope": definition.scopeId } : {}),
    });
  };
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
  return { name: truncate(error.name || "Error"), message: truncate(error.message) };
}

function truncate(value: string) {
  return value.slice(0, 200);
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

function isDevelopment() {
  return (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true;
}

function reactEventName(name: string) {
  const pascal = name
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join("");
  return `on${pascal}`;
}
