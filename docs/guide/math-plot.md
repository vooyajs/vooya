# Math Plot template

`examples/math-plot-astro` is a source template for textbook visualizations,
not a hidden chart runtime. Copy `MathPlot.rs`, its `MathPlot/` module directory,
and `MathPlot.css` into the consumer so the Rust/WASM boundary remains visible
and editable.

The example is also the maintained multi-file authoring proof. JavaScript
imports only the thin schema-owning root:

```text
src/
├── MathPlot.rs
├── MathPlot.css
└── MathPlot/
    ├── axes.rs
    ├── interaction.rs
    ├── series.rs
    ├── spec.rs
    └── render/
        ├── mod.rs
        └── canvas2d.rs
```

`MathPlot.rs` uses ordinary `mod axes;`, `mod spec;`, and `mod render;`
declarations. Vooya mirrors the whole tree into its generated crate while
preserving Rust's normal module lookup. Helper files are not JS components;
they participate in Cargo diagnostics and trigger one dev rebuild when edited.
For deeper public paths, provide a conventional `mod.rs` chain from `src/` or
configure `rust.entry` for an authored crate root. Do not import a helper file
from JavaScript: import the `.rs` file containing `#[voo::component]` or
`#[voo::store]`.

The component accepts two primitive props:

- `spec: string`: JSON using Math Plot protocol version 1;
- `theme: string`: a host-defined theme token (`auto` in the example).

It emits `probe(payload: string)`. The payload is versioned JSON with
`series_id`, `x`, and `y`. JSON strings are intentional: Vooya's current ABI is
primitive, the data crosses Astro serialization safely, and no JavaScript
closure is smuggled into WASM.

```json
{
  "version": 1,
  "title": "Linear model",
  "domain": { "x": [-6, 6], "y": [-5, 7] },
  "series": [
    { "kind": "linear", "id": "h", "label": "y = w*x + b", "w": 1.25, "b": 0.5, "samples": 320 },
    { "kind": "scatter", "id": "samples", "label": "training", "points": [[-2, -1.8], [0, 0.7], [2, 2.8]] }
  ]
}
```

Version 1 supports `linear`, `line`, and `scatter` series. A future protocol
revision can add discriminated overlay kinds for tangent lines and integral
areas, and view kinds for contours or loss surfaces. Unknown versions fail
explicitly; version 1 will not silently change meaning.

Rust owns validation, function sampling, coordinate transforms, probe search,
pan/zoom state, and HiDPI Canvas drawing. Vue/Astro owns article layout and
controls. CSS variables `--vooya-plot-bg`, `--vooya-plot-grid`,
`--vooya-plot-axis`, `--vooya-plot-text`, `--vooya-plot-accent`, and
`--vooya-plot-point` define light/dark presentation.

The template uses `#[voo::component(update = "update_math_plot")]`. This is an
opt-in in-place update hook: the handler receives the mounted `ViewElement` and
the complete next props value. It must update its own state atomically. Without
the option, Vooya retains the existing replace-root update behavior.
