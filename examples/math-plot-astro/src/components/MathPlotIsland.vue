<script setup lang="ts">
import { computed, ref } from "vue";
import MathPlot from "../MathPlot.rs";

const weight = ref(1.25);
const bias = ref(0.5);
const probe = ref("Move across the graph or focus it and use the arrow keys.");
const mounted = ref(true);

const spec = computed(() => JSON.stringify({
  version: 1,
  title: `Linear hypothesis at w = ${weight.value.toFixed(2)}`,
  domain: { x: [-6, 6], y: [-5, 7] },
  series: [
    { kind: "linear", id: "hypothesis", label: "y = w·x + b", w: weight.value, b: bias.value, samples: 320 },
    { kind: "scatter", id: "training", label: "training samples", points: [[-4,-4.2],[-2,-1.8],[-1,-0.6],[0,0.7],[2,2.8],[4,5.7]], radius: 4 },
  ],
}));
</script>

<template>
  <section class="lesson" data-math-lesson>
    <div class="controls" role="group" aria-label="Linear model controls">
      <label>weight <output>{{ weight.toFixed(2) }}</output><input v-model.number="weight" data-weight type="range" min="-2" max="3" step="0.05" /></label>
      <label>bias <output>{{ bias.toFixed(2) }}</output><input v-model.number="bias" data-bias type="range" min="-3" max="3" step="0.05" /></label>
      <button type="button" data-toggle @click="mounted = !mounted">{{ mounted ? "Unmount plot" : "Remount plot" }}</button>
    </div>
    <MathPlot v-if="mounted" :spec="spec" theme="auto" @probe="probe = String($event)" />
    <p class="probe" data-probe aria-live="polite">{{ probe }}</p>
  </section>
</template>

<style scoped>
  .lesson { display: grid; gap: 1rem; margin-top: 2rem; }
  .controls { align-items: end; display: grid; gap: 1rem; grid-template-columns: repeat(2, minmax(12rem, 1fr)) auto; }
  label { color: #657068; display: grid; font: .8rem/1.4 ui-monospace, monospace; gap: .35rem; grid-template-columns: 1fr auto; }
  input { accent-color: #3157d5; grid-column: 1 / -1; width: 100%; }
  button { background: transparent; border: 1px solid currentColor; color: inherit; min-height: 2.4rem; padding: 0 .9rem; }
  .probe { color: #657068; font: .82rem/1.5 ui-monospace, monospace; margin: 0; min-height: 1.5em; min-width: 0; overflow-wrap: anywhere; }
  @media (max-width: 700px) { .controls { grid-template-columns: 1fr; } }
</style>
