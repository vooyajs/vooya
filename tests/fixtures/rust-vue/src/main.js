import { createApp } from "vue";
import App from "./App.vue";
import createCartStore from "./Store.rs";

const store = await createCartStore();
createApp(App, { store }).mount("#app");
