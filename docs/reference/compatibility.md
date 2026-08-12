# Host Compatibility

<!-- GENERATED FILE — edit packages/{vue,react}/compatibility.json and run npm run compatibility:generate. -->

Vooya treats host support as a tested product contract. `verified` means the capability is covered by the linked evidence; it is not a general compatibility claim beyond the stated host version.

| Host adapter | Host versions | Mount | Prop updates | Events | Dispose | Scoped styles | Mount errors | Last verified |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `@vooya/vue` | `^3.5.0` | verified | verified | verified | verified | verified | partial | 2026-08-12 |
| `@vooya/react` | `^19.0.0` | verified | verified | verified | verified | verified | partial | 2026-08-12 |

## Known gaps

### Vue

- SSR
- hydration
- slots
- deep object props
- mount error forwarding is implemented but not browser-verified

Evidence:

- [`tests/e2e/vue-counter.spec.js`](../../tests/e2e/vue-counter.spec.js)
- [`tests/e2e/host-parity.spec.js`](../../tests/e2e/host-parity.spec.js)

### React

- SSR
- hydration
- slots
- deep object props
- mount error forwarding is implemented but not browser-verified

Evidence:

- [`tests/e2e/react-counter.spec.js`](../../tests/e2e/react-counter.spec.js)
- [`tests/e2e/host-parity.spec.js`](../../tests/e2e/host-parity.spec.js)

