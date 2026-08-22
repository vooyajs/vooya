<script setup>
import Abi from "./Abi.rs";
import Counter from "./Counter.rs";
import { useVooyaStore } from "@vooya/vue";
import { ref } from "vue";

const props = defineProps({ store: { type: Object, required: true } });
const { snapshot, dispatch } = useVooyaStore(props.store);
const selected = ref(null);
const abiPayload = ref("none");
const abiProps = {
  small: 3,
  precise: 9007199254740993n,
  optional: null,
  pair: [7, "pair"],
  labels: { alpha: 1n, beta: 2n },
};

function addItem() {
  dispatch("add", 1);
}

function handleSelected(value) {
  selected.value = value;
}

function handleAbiPayload(value) {
  abiPayload.value = value.toString();
}
</script>

<template>
  <Abi v-bind="abiProps" @payload="handleAbiPayload" />
  <span class="abi-output">ABI payload {{ abiPayload }}</span>
  <Counter :count="snapshot.count" @selected="handleSelected" />
  <span class="selected">Selected {{ selected }}</span>
  <button class="store-add" @click="addItem">Store {{ snapshot.count }}</button>
</template>
