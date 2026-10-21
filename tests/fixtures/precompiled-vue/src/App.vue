<script setup>
import { ref } from "vue";
import PortableCounter from "@vooya/test-precompiled-vue-product";

const value = ref(7);
const visible = ref(true);
</script>

<template>
  <main>
    <PortableCounter v-if="visible" :initial="value" />
    <button @click="value = 12">Update</button>
    <button @click="visible = !visible">{{ visible ? "Dispose" : "Mount" }}</button>
    <div id="unrelated" class="vooya-portable-counter">Unrelated host</div>
  </main>
</template>
