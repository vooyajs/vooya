import Counter from "./Counter.rs";
import { useCart } from "./Store.rs";
import { useMemo, useState } from "react";

export function App() {
  const { state, add } = useCart();
  const [selected, setSelected] = useState(null);
  const count = state?.count ?? 0;
  const selection = useMemo(() => ({ id: count, tags: ["selected", "react"] }), [count]);
  const itemCount = state?.totals.item_count ?? 0;
  return (
    <main>
      <Counter count={count} selection={selection} onSelected={setSelected} />
      <span className="selected">Selected {selected?.id} {selected?.tags.join(",")}</span>
      <button className="store-add" onClick={() => add(1)}>Store {count} / {itemCount}</button>
    </main>
  );
}
