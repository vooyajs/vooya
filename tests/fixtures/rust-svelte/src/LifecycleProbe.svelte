<script>
  import { defineVooyaComponent, defineVooyaStore } from "@vooya/svelte";

  const ProbeComponent = defineVooyaComponent({
    contract: { abiVersion: 1, name: "LifecycleProbe", props: [], events: [] },
    async loadBindings() {
      return {
        mount(host) {
          host.textContent = "Component probe ready";
          return {
            dispose() {
              window.__vooyaComponentDisposed = (window.__vooyaComponentDisposed ?? 0) + 1;
            },
          };
        },
      };
    },
  });

  const useProbeStore = defineVooyaStore({
    name: "Probe",
    actions: [],
    async create() {
      return {
        getSnapshot() { return { ready: true }; },
        subscribe() { return () => {}; },
        dispose() {
          window.__vooyaStoreDisposed = (window.__vooyaStoreDisposed ?? 0) + 1;
        },
      };
    },
  });
  const { state } = useProbeStore();
</script>

<ProbeComponent />
<span class="store-probe">Store probe {$state?.ready ? "ready" : "loading"}</span>
