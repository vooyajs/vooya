# RFC 0011: Vooya Lab alpha self-hosting program

Status: accepted self-hosting program, established during alpha.

The program continues to collect evidence during beta; this record does not
change the current release status or the support matrix. Execution remains
tracked in [Issue #103](https://github.com/vooyajs/vooya/issues/103).

## Decision

Vooya Lab is the public, cross-repository self-hosting program for evaluating
Vooya with non-trivial browser cases during alpha. It is an ordinary consumer
of Vooya, not a second compiler, runtime, adapter implementation, or a blanket
beta gate.

The Lab owns interactive cases, source presentation, comparison evidence, and
experimental product surfaces. This repository owns fixes to the compiler, ABI,
runtime, framework adapters, toolchain integration, diagnostics, and documented
authoring contract that a case reveals.

Every live Lab case must state the question it investigates and link its
evidence, limitations, environment requirements, and any upstream workaround
or issue. A result only broadens a Vooya support claim when this repository has
an automated fixture for the named framework, browser, bundler, and behavior.

## Case Lifecycle

The program follows one feedback loop:

```text
case question -> ordinary consumer implementation -> recorded friction
  -> focused Core/Lab/docs issue -> fix in the owning repository
  -> remove workaround -> repeatable evidence
```

The [case contract](https://github.com/vooyajs/vooya-lab/blob/main/docs/case-spec.md)
belongs in `vooyajs/vooya-lab` and includes its domain and
maturity, required browser capabilities and deployment headers, package/crate
inputs, presented source files, lifecycle behavior, known limitations, linked
issues, and any meaningful plain-Web baseline. The gallery remains oriented
around cases; compatibility probes and infrastructure experiments may use
direct routes instead of displacing that navigation.

## Alpha Evidence

Representative cases should cover deliberately different boundaries rather
than repeat counter examples:

- data or business UI with typed host integration;
- a long-lived Canvas or simulation surface with explicit lifecycle ownership;
- developer-facing source, diagnostics, or build-feedback presentation; and
- a meaningful Vue/React comparison when it exposes adapter differences.

Where applicable, a case verifies clean installation, development rebuild and
recovery, production output, typed host integration, mount/update/event/error/
dispose behavior, browser or deployment requirements, and artifact/loading
characteristics. It must not make unmeasured performance claims.

Complex Cargo consumers are acceptance evidence for normal Cargo semantics,
not justification for case-specific dependency translation. Workers, sandboxed
frames, managed runtimes, WebGPU, Electron, SSR, and untrusted code each need
their own lifecycle and security proposal before becoming a support claim.

## Triage And Extraction

Findings use the repository that owns the boundary:

| Finding | Owner |
| --- | --- |
| Compiler, ABI, runtime, adapter, toolchain, diagnostics, or stable authoring contract | `vooyajs/vooya` focused issue and implementation PR |
| Interactive case, source presentation, comparison evidence, or experimental UI | `vooyajs/vooya-lab` |
| Shared utility used by two independent cases, or with a distinct lifecycle/release boundary | A dedicated package proposal |

Lab-only workarounds are temporary evidence. They must be removed after an
owning-layer fix, or documented with a linked issue and limitation. A utility
is not extracted solely because one case needs it.

## Core Finding Handoff

When a Lab case reveals a possible Core defect or missing contract, open the
focused issue in the owning repository with enough information to reproduce the
boundary without private Lab context. The handoff is not a second case schema;
the authoritative case metadata remains in `vooyajs/vooya-lab`.

Include, where applicable:

- the case and route/revision that exposed the finding;
- the exact Vooya package versions or source commit, framework, bundler, browser
  and operating-system environment;
- the smallest user-visible behavior and the expected behavior;
- the command or browser steps needed to reproduce it;
- relevant source/configuration inputs and whether the result is deterministic;
- the current workaround, its owner, and why it must not become a permanent
  Lab-only patch;
- logs or sanitized diagnostics with secrets, tokens, absolute home paths and
  unrelated application data removed;
- the proposed owning boundary: compiler, ABI, runtime, adapter, toolchain,
  diagnostics, docs or Lab-only product surface;
- the evidence that would close the issue, including the named fixture or
  consumer test required before a public support claim changes.

If the finding depends on an external Lab commit or asset, pin that identity in
the issue rather than linking only to a moving branch. If it cannot be reduced
to a reproducible Core boundary, keep it as a Lab finding and record the
limitation instead of filing speculative implementation work.

After the owning fix lands, the Lab case should link the fix, remove the
workaround where possible, rerun the original scenario and record whether the
result changes. A passing Core unit test alone does not close a browser or
deployment finding; the named case must be rerun when its behavior is part of
the acceptance claim.

## Beta Boundary

The program informs the beta gate but does not expand it. Rust remains the only
first-party source-authoring language, and the beta support matrix remains the
canonical promise. Before beta, require only agreed representative evidence and
resolution or explicit documentation of severe gaps that evidence exposes.

The program does not commit Vooya to a complete WebIDE, remote compilation,
untrusted-code execution, universal offline execution, WebGPU, Electron,
arbitrary WASM components, a broad component catalog, or a general frontend
framework.

## Acceptance Criteria

- The Lab [case specification](https://github.com/vooyajs/vooya-lab/blob/main/docs/case-spec.md)
  and [portfolio strategy](https://github.com/vooyajs/vooya-lab/blob/main/docs/case-portfolio.md)
  remain the public starting point for new cases. The case schema is maintained
  there; this record defines the ownership and evidence boundary.
- Every Core finding has a focused issue or documented reason to remain an
  experiment.
- Core findings include a reproducible handoff with environment, source
  revision, workaround and closure evidence; private Lab context is not a
  prerequisite for triage.
- Compatibility claims continue to require named automated evidence in this
  repository.
- Reusable packages require repeated use or an independent public boundary.
- The project status and beta boundary distinguish the Lab program from current
  product support.
