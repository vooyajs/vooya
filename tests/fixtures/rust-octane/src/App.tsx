/** @jsxImportSource octane */
import { useMemo, useState } from "octane";
import Counter from "./Counter.rs";
import { createCartStore, useCart } from "./Store.rs";
import { useVooyaStore } from "@vooya/octane";

const lifecycle = { created: 0, unsubscribed: 0, disposed: 0 };
Object.assign(window, { vooyaOctaneLifecycle: lifecycle });
async function trackedFactory() {
  const store = await createCartStore();
  lifecycle.created++;
  return {
    getSnapshot: () => store.getSnapshot(),
    subscribe(listener: () => void) {
      const unsubscribe = store.subscribe(listener);
      return () => { lifecycle.unsubscribed++; unsubscribe(); };
    },
    dispose() { lifecycle.disposed++; store.dispose(); },
  };
}

function Panel({ label }: { label: string }) {
  const { state, add } = useCart();
  const tracked = useVooyaStore(trackedFactory, undefined);
  const [selected, setSelected] = useState<{ id: number; tags: string[] } | null>(null);
  const count = state?.count ?? 0;
  const selection = useMemo(() => ({ id: count, tags: [label, "octane"] }), [count, label]);
  return <section data-panel={label}>
    <span>Tracked {label}: {tracked.state?.count ?? "loading"}</span>
    <Counter count={count} selection={selection} onSelected={setSelected} />
    <output>Selected {selected?.id} {selected?.tags.join(",")}</output>
    <button onClick={() => add(1)}>Store {label}: {state === undefined ? "loading" : count}</button>
  </section>;
}

export function App() {
  const [visible, setVisible] = useState(true);
  return <main>
    <h1>Vooya native Octane</h1>
    <button onClick={() => setVisible(!visible)}>{visible ? "Hide" : "Show"}</button>
    {visible ? <><Panel label="A" /><Panel label="B" /></> : <p>Unmounted</p>}
  </main>;
}
