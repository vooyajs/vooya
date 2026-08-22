import Counter from "./Counter.rs";
import { useCart } from "./Store.rs";

export function App() {
  const { state, add } = useCart();
  const count = state?.count ?? 0;
  return (
    <main>
      <Counter count={count} />
      <button className="store-add" onClick={() => add(1)}>Store {count}</button>
    </main>
  );
}
