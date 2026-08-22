<script setup>
import Counter from "./Counter.rs";
import { useVooyaStore } from "@vooya/vue";
import { ref } from "vue";

const props = defineProps({ store: { type: Object, required: true } });
const { snapshot, dispatch } = useVooyaStore(props.store);
const selected = ref(null);

function addItem() {
  dispatch("add", 1);
}

function handleSelected(value) {
  selected.value = value;
}
</script>

<template>
  <Counter :count="snapshot.count" @selected="handleSelected" />
  <span class="selected">Selected {{ selected }}</span>
  <button class="store-add" @click="addItem">Store {{ snapshot.count }}</button>
</template>
