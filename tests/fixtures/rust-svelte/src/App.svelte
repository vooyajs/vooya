<script>
  import Counter from "./Counter.rs";
  import { useCart } from "./Store.rs";
  import LifecycleProbe from "./LifecycleProbe.svelte";

  const { state, add } = useCart();
  let selected;
  let showProbe = true;
</script>

<main>
  <Counter count={$state?.count ?? 0} onSelected={(value) => selected = value} />
  <span class="selected">Selected {selected ?? "none"}</span>
  <button class="store-add" onclick={() => add(1)}>Store {$state?.count ?? 0}</button>
  {#if showProbe}
    <LifecycleProbe />
  {/if}
  <button class="unmount-probe" onclick={() => showProbe = false}>Unmount probe</button>
</main>
