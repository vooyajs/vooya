import { createApp, h, ref } from "vue";
import type { CounterStore as Light } from "./light/Counter.rs";
import type { CounterStore as Heavy } from "./heavy/Counter.rs";

createApp({ setup() {
  const route = ref("loading");
  const count = ref(0);
  const notices = ref(0);
  const disposed = ref(0);
  const error = ref("");
  let store: Light | Heavy | undefined;
  let unsubscribe: (() => void) | undefined;
  let transition = 0;
  async function navigate(next: "light" | "heavy") {
    const ticket = ++transition;
    unsubscribe?.();
    if (store) {
      store.dispose();
      try { store.add(); throw new Error("disposed handle remained callable"); }
      catch (cause) {
        if (!String(cause).includes("invalid store handle")) throw cause;
        disposed.value++;
      }
      store = undefined;
    }
    route.value = "loading";
    const loaded = next === "light"
      ? await import("./light/Counter.rs")
      : await import("./heavy/Counter.rs");
    const instance = await loaded.createCounterStore();
    if (ticket !== transition) { instance.dispose(); return; }
    store = instance;
    count.value = instance.getSnapshot().count;
    notices.value = 0;
    unsubscribe = instance.subscribe(() => { notices.value++; count.value = instance.getSnapshot().count; });
    route.value = next;
  }
  const show = (next: "light" | "heavy") => navigate(next).catch(cause => error.value = String(cause));
  void show("light");
  return () => h("main", [
    h("button", {onClick: () => show("light")}, "Light route"),
    h("button", {onClick: () => show("heavy")}, "Heavy route"),
    h("button", {onClick: () => store?.add()}, "Add"),
    h("output", {id: "state"}, `${route.value}:${count.value}:${notices.value}:${disposed.value}`),
    h("output", {id: "error"}, error.value),
  ]);
} }).mount("#app");

// Distinct types named Snapshot must remain scoped to their owning artifact.
declare const light: Light;
declare const heavy: Heavy;
function checkTypes() {
  const a: boolean = light.getSnapshot().light;
  const b: string = heavy.getSnapshot().heavy;
  // @ts-expect-error the heavy shape must not leak into the lightweight artifact
  light.getSnapshot().heavy;
  // @ts-expect-error the light shape must not leak into the heavy artifact
  heavy.getSnapshot().light;
  return [a, b];
}
void checkTypes;
