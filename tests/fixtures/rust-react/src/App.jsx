import Counter from "./Counter.rs";
import { createCartStore, useCart } from "./Store.rs";
import { useMemo, useState } from "react";

export function App() {
  const { state, add } = useCart();
  const [selected, setSelected] = useState(null);
  const [actionResult, setActionResult] = useState(null);
  async function checkActionErrors() {
    const store = await createCartStore();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => notifications++);
    const errors = [];
    try {
      const success = store.checked_add(2, false);
      for (const invoke of [() => store.checked_add(3, true), () => store.checked_core(4), () => store.checked_plain(5)]) {
        try { invoke(); } catch (error) { errors.push(String(error)); }
      }
      const snapshot = store.getSnapshot();
      setActionResult(JSON.stringify({ errors, count: snapshot.count, notifications, stable: snapshot === store.getSnapshot(), successIsVoid: success === undefined }));
    } finally {
      unsubscribe();
      store.dispose();
    }
  }
  const count = state?.count ?? 0;
  const selection = useMemo(() => ({ id: count, tags: ["selected", "react"] }), [count]);
  const itemCount = state?.totals.item_count ?? 0;
  return (
    <main>
      <Counter count={count} selection={selection} onSelected={setSelected} />
      <span className="selected">Selected {selected?.id} {selected?.tags.join(",")}</span>
      <button className="store-add" onClick={() => add(1)}>Store {count} / {itemCount}</button>
      <button onClick={checkActionErrors}>Check action errors</button>
      <output data-testid="action-result">{actionResult}</output>
    </main>
  );
}
