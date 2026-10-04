import type Counter from "./Counter.rs";
import type { useCart } from "./Store.rs";

type Props = Parameters<typeof Counter>[0];
const valid: Props = { count: 1, selection: { id: 1, tags: ["octane"] }, onSelected(value) { value.id.toFixed(); } };
// @ts-expect-error Rust integer props are numbers.
const invalid: Props = { count: "one", selection: { id: 1, tags: [] } };
type Cart = ReturnType<typeof useCart>;
function checkStore(store: Cart) {
  const count: number | undefined = store.state?.count;
  store.add(1);
  // @ts-expect-error Rust action parameters retain their numeric type.
  store.add("one");
  void count;
}
void valid;
void invalid;
void checkStore;
