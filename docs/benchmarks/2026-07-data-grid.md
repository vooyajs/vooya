# 100k Data Grid: Stage 3 Result

## Decision

**Inconclusive parity.** The Vooya island and Vue baseline were effectively tied
for this local, filter-sort-and-render workload. The measured median differed by
about one percent, which is not enough to claim a winner. The result validates
that the generated Rust/WASM island boundary remains usable on this case;
it does not establish a performance advantage or product-market proof.

## Workload

Both panes in `examples/data-grid-benchmark` generate the same 100,000 local
rows. Each pane sorts by score, filters by twenty fixed query prefixes, and
renders only a 24-row virtual window. Clicking **Run filter benchmark** runs
twenty rounds of those twenty filter/sort operations. Each query also renders
the 24-row virtual window before the next query. The page reports median and p95
wall time for the twenty-query rounds.

The Vooya pane keeps the row data, filtering, sorting, and DOM window renderer
in Rust/WASM. The Vue pane keeps the equivalent data and computed list in Vue.
Both render the final matching 1,000-row result after the same final query.

## Environment

- macOS 26.5.1 on arm64.
- Node 22.22.0, Vite 7.3.6, Vue 3.5.
- Rust 1.94.0 and `wasm-bindgen` 0.2.115.
- Browser validation through Playwright against the Vite development server.

## Result

| Implementation | Median | p95 | Relative median |
| --- | ---: | ---: | ---: |
| Vooya WASM island | 36.0 ms | 38.0 ms | 1.01x slower |
| Vue baseline | 35.6 ms | 38.1 ms | 1.00x |

The production Vite build emitted a 115.20 KB WASM file, 46.00 KB gzip. The
JavaScript entry was 29.28 KB gzip. The WASM asset is a real adoption cost, but
is within a reasonable initial budget for an explicitly selected, heavy widget;
it is not acceptable as a default replacement for ordinary components.

## Interpretation

The result confirms that moving this component into a generated Rust/WASM
boundary does not create a large interaction regression. It does **not**
demonstrate a speed-up. The primary remaining opportunity is avoiding repeated
full-list sorting and making renderer updates incremental, rather than merely
moving the same algorithm into Rust.

## Reproduction

```bash
npm install
npm run dev:benchmark
```

Open the reported local URL, click each pane's **Run filter benchmark**, and
record the values displayed by that run. Production asset sizes come from:

```bash
npm run build:benchmark
```
