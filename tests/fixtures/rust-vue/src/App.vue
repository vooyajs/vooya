<script setup>
import Counter from "./Counter.rs";
import { useVooyaStore } from "@vooya/vue";

const props = defineProps({ store: { type: Object, required: true } });
const { snapshot, dispatch } = useVooyaStore(props.store);

function addItem() {
  dispatch("add", 1);
}
</script>

<template>
  <Counter :count="snapshot.count" />
  <button class="store-add" @click="addItem">Store {{ snapshot.count }}</button>
</template>
