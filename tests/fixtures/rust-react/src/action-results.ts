import { createCartStore } from "./Store.rs";

export async function checkActionResults() {
  const store = await createCartStore();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  try {
    const unit = store.add(1);
    const scalar: number = store.add_total(2);
    const named = store.receipt(4, false);
    const typedCount: number = named.item_count;
    const typedLabels: string[] = named.labels;
    const precise: bigint = store.precise();
    let failure = "";
    try { store.receipt(1, true); } catch (error) { failure = String(error); }
    const snapshot = store.getSnapshot();
    store.receipt(0, false);
    const stable = snapshot === store.getSnapshot();
    store.dispose();
    let disposed = false;
    try { store.add_total(1); } catch { disposed = true; }
    return JSON.stringify({ unit: unit === undefined, scalar, named: {item_count: typedCount, labels: typedLabels}, precise: precise.toString(), failure, count: snapshot.count, notifications, stable, disposed });
  } finally {
    unsubscribe();
    store.dispose();
  }
}
