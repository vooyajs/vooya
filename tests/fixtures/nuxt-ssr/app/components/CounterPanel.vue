<script setup>
import { ref } from "vue";
import Counter from "../src/Counter.rs";
import { useCart } from "../src/Store.rs";

defineProps({ id: String });
const { state, add } = useCart();
const selected = ref(null);
</script>

<template>
  <section :id="id">
    <Counter :count="state?.count ?? 0" @selected="selected = $event" />
    <span>Selected {{ selected ?? "pending" }}</span>
    <button :disabled="state === undefined" @click="add(1)">Store {{ state?.count ?? "pending" }}</button>
  </section>
</template>
