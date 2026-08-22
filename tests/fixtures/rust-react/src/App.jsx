import Counter from "./Counter.rs";
import { useCart } from "./Store.rs";
import { useState } from "react";

export function App() {
  const { state, add } = useCart();
  const [selected, setSelected] = useState(null);
  const count = state?.count ?? 0;
  return (
    <main>
      <Counter count={count} onSelected={setSelected} />
      <span className="selected">Selected {selected}</span>
      <button className="store-add" onClick={() => add(1)}>Store {count}</button>
    </main>
  );
}
