<script setup lang="ts">
import { ref } from "vue";
import { useCart } from "./CartStore.voo.rs";

const notice = ref<string>();

const { state, add, applyCoupon } = useCart({ taxRate: 0.08 }, {
  onCouponRejected: (reason) => {
    notice.value = `Rust rejected the coupon: ${String(reason)}`;
  },
});

const sku = ref("SKU-1");
const qty = ref(1);
const coupon = ref("VOOYA10");

function submitCoupon() {
  Promise.resolve(applyCoupon(coupon.value)).catch((error) => {
    notice.value = `Coupon action failed: ${String(error)}`;
  });
}
</script>

<template>
  <main>
    <h1>Rust cart store inside Vue</h1>
    <p class="muted">Vue renders; Rust owns the cart state and rules.</p>

    <form class="row" @submit.prevent="add(sku, qty)">
      <input v-model="sku" aria-label="SKU" placeholder="SKU" />
      <input v-model.number="qty" type="number" min="1" aria-label="Quantity" />
      <button type="submit">Add to cart</button>
    </form>

    <form class="row" @submit.prevent="submitCoupon()">
      <input v-model="coupon" aria-label="Coupon" placeholder="Coupon" />
      <button type="submit">Apply coupon</button>
    </form>

    <p v-if="notice" class="notice">{{ notice }}</p>

    <ul>
      <li v-for="item in state?.items ?? []" :key="item.sku">
        {{ item.sku }} × {{ item.qty }}
      </li>
    </ul>
    <p>Total: <strong>{{ state?.totalCents ?? 0 }}¢</strong></p>
  </main>
</template>

<style>
main { font-family: system-ui, sans-serif; margin: 2rem; }
.row { display: flex; gap: 0.5rem; margin-block: 0.75rem; }
.muted { color: #666; }
.notice { color: #a33; }
</style>
