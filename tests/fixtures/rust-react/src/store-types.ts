import { useCart } from "./Store.rs";

const { state } = useCart();
const itemCount: number | undefined = state?.totals.item_count;
const label: string | null | undefined = state?.last_label;
const range: [number, string] | undefined = state?.range;

void itemCount;
void label;
void range;
