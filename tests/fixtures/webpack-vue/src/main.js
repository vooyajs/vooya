import { createApp, h, ref } from "vue";
import Counter from "./Counter.voo";
const value = ref(1); const events = ref([]);
createApp({ setup() { return () => h("main", [h(Counter, { initial: value.value, onChange: (next) => events.value.push(next) }), h("button", { id: "update", onClick: () => value.value += 1 }, "Update"), h("output", { id: "events" }, events.value.join(","))]); } }).mount("#app");
