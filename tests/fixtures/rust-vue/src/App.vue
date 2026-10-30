<script setup lang="ts">
import { checkActionResults } from "./action-results";
import Abi from "./Abi.rs";
import Counter from "./Counter.rs";
import { useCart } from "./Store.rs";
import { computed, ref } from "vue";

const { state, add, receipt } = useCart();
const selection = computed(() => ({ id: state.value?.count ?? 0, tags: ["selected", "vue"] }));
const cartDetails = (): number => state.value?.totals.item_count ?? 0;
const selected = ref<{ id: number; tags: string[] } | null>(null);
const actionResult = ref("");
const abiPayload = ref("none");
const abiProps = {
  small: 3,
  precise: 9007199254740993n,
  optional: null,
  pair: [7, "pair"] as [number, string],
  labels: { alpha: 1n, beta: 2n },
};

function addItem() {
  add(1);
}

function handleSelected(value: { id: number; tags: string[] }) {
  selected.value = value;
}

function handleAbiPayload(value: bigint) {
  abiPayload.value = value.toString();
}
</script>

<template>
  <Abi v-bind="abiProps" @payload="handleAbiPayload" />
  <span class="abi-output">ABI payload {{ abiPayload }}</span>
  <Counter :count="state?.count ?? 0" :selection="selection" @selected="handleSelected" />
  <span class="selected">Selected {{ selected?.id }} {{ selected?.tags.join(',') }}</span>
  <button class="store-add" @click="addItem">Store {{ state?.count ?? 0 }} / {{ cartDetails() }}</button>
  <button @click="async () => actionResult = await checkActionResults()">Check action results</button>
  <button @click="actionResult = JSON.stringify(receipt(0, false))">Check hook result</button>
  <output data-testid="action-result">{{ actionResult }}</output>
</template>
