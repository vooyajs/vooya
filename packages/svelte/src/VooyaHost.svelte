<script lang="ts">
  import { afterUpdate, onDestroy, onMount } from "svelte";
  import { DEV } from "esm-env";
  import type {
    VooyaComponentBridge,
    VooyaComponentHandle,
    VooyaMountError,
  } from "./index.js";

  export let __vooyaBridge: VooyaComponentBridge;
  export let onError: ((error: VooyaMountError) => void) | undefined = undefined;

  let host: HTMLDivElement;
  let active = true;
  let handle: VooyaComponentHandle | undefined;
  let previousProps = new Map<string, unknown>();
  const definition = __vooyaBridge.contract;

  const listeners = definition.events.map((event) => {
    const receive = (browserEvent: Event) => {
      const callback = $$restProps[svelteEventName(event.name)];
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
    void __vooyaBridge.loadBindings().then(
      (bindings) => {
        if (!active) return;
        const startedAt = performance.now();
        try {
          handle = bindings.mount(
            host,
            ...definition.props.map((prop) => resolvePropValue(prop, $$restProps)),
          );
          previousProps = new Map(
            definition.props.map((prop) => [prop.name, resolvePropValue(prop, $$restProps)]),
          );
          emitDiagnostic(host, definition, "mount", elapsedSince(startedAt));
        } catch (cause) {
          removeListeners();
          emitDiagnostic(host, definition, "mount", elapsedSince(startedAt), cause);
          onError?.({ stage: "mount", cause });
        }
      },
      (cause) => {
        if (!active) return;
        removeListeners();
        emitDiagnostic(host, definition, "load", 0, cause);
        onError?.({ stage: "load", cause });
      },
    );
  });

  afterUpdate(() => {
    if (!handle) return;
    const changed: Record<string, unknown> = {};
    for (const prop of definition.props) {
      const value = resolvePropValue(prop, $$restProps);
      if (!Object.is(previousProps.get(prop.name), value)) changed[prop.name] = value;
    }
    if (Object.keys(changed).length === 0) return;

    const startedAt = performance.now();
    try {
      if (typeof handle.updateProps === "function") {
        handle.updateProps(changed);
      } else {
        for (const [name, value] of Object.entries(changed)) {
          const update = handle[`update_${name}`];
          if (typeof update === "function") update.call(handle, value);
        }
      }
      for (const [name, value] of Object.entries(changed)) previousProps.set(name, value);
      emitDiagnostic(host, definition, "update", elapsedSince(startedAt));
    } catch (cause) {
      emitDiagnostic(host, definition, "update", elapsedSince(startedAt), cause);
      onError?.({ stage: "update", cause });
    }
  });

  onDestroy(() => {
    active = false;
    removeListeners();
    if (handle) {
      const startedAt = performance.now();
      try {
        handle.dispose();
        emitDiagnostic(host, definition, "dispose", elapsedSince(startedAt));
      } catch (cause) {
        emitDiagnostic(host, definition, "dispose", elapsedSince(startedAt), cause);
        onError?.({ stage: "dispose", cause });
      }
    }
    handle = undefined;
  });

  function removeListeners() {
    for (const listener of listeners) host?.removeEventListener(listener.name, listener.receive);
  }
</script>

<div
  bind:this={host}
  class={$$restProps.class ?? $$restProps.className}
  data-vooya-host=""
  data-voo-scope={definition.scopeId || undefined}
></div>

<script lang="ts" context="module">
  function resolvePropValue(
    prop: { name: string; defaultValue?: unknown },
    props: Record<string, unknown>,
  ) {
    const value = props[prop.name];
    return value === undefined && Object.hasOwn(prop, "defaultValue") ? prop.defaultValue : value;
  }

  function svelteEventName(name: string) {
    const pascal = name
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
      .join("");
    return `on${pascal}`;
  }

  function emitDiagnostic(
    host: Element,
    definition: { abiVersion: number; name: string },
    stage: "mount" | "update" | "dispose" | "load",
    duration: number,
    cause?: unknown,
  ) {
    if (!DEV) return;
    const detail = {
      component: definition.name,
      abiVersion: definition.abiVersion,
      phase: stage,
      duration,
      ...(cause === undefined ? {} : { error: summarizeError(cause) }),
    };
    host.dispatchEvent(new CustomEvent(`vooya:${cause === undefined ? stage : "error"}`, {
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
</script>
