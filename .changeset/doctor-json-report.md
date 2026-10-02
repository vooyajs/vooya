---
"@vooya/vite": patch
---

Add `vooya doctor --json` for machine-readable toolchain diagnostics. The
versioned report explicitly selects public diagnostic fields and excludes
internal build objects and the process environment. Failed checks retain a
nonzero exit status. Reject `clean --json` before removing generated files.
