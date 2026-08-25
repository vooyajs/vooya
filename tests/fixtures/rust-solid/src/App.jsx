import { createSignal } from "solid-js";
import Counter from "./Counter.rs";
import { useCart } from "./Store.rs";

export function App() {
  const { state, add } = useCart();
  const [selected, setSelected] = createSignal();

  return (
    <main>
      <Counter count={state()?.count ?? 0} onSelected={setSelected} />
      <span class="selected">Selected {selected() ?? "none"}</span>
      <button class="store-add" onClick={() => add(1)}>Store {state()?.count ?? 0}</button>
    </main>
  );
}
