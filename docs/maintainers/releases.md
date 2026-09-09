# Releases

Semifold is Vooya's only version planner. Changesets name only packages with
source or public-contract changes. Semifold then propagates version bumps to
dependants whose exact internal dependency must change. Never edit versions or
internal exact dependencies by hand. Semifold is a maintainer tool, not a
dependency of published Vooya packages.

## Inspect before changing state

```sh
npm run release:status
npm run verify:release
```

`npm run release:status` runs Semifold's read-only release plan after checking
that changesets use known Vooya package IDs. A pending `.changes/*.md` file
must name at least one directly affected package. Do not add unchanged packages
to force a coordinated version: Semifold's `depends-on` graph plans required
downstream bumps. For example, a `build-core` change also bumps the bundler
packages that pin it exactly, but it does not republish unrelated framework
adapters.

## Publish another alpha

Add one reviewed Semifold changeset for user-visible work, then run:

```sh
npm run version:packages
npm run verify:release
npm run release:alpha
```

Review the version, lockfile, exact internal dependencies, tarballs, and npm
dist-tags before the last command. `release:alpha` is the only local command in
this sequence that publishes to npm.

After the version commit and its required CI checks reach `main`, maintainers
can run the `Publish alpha` workflow manually. The workflow builds package
artifacts, lets Semifold skip versions already present in npm, publishes the
planned versions with the repository's `NPM_TOKEN`, and retries registry/tag
verification to tolerate npm propagation delay. It deliberately does not rerun
the browser and multi-bundler release gate already completed before the version
commit. Keep the workflow manual: merging a pull request must never publish
packages by itself.

## First stable release

Only after the ABI and documented support matrix are intentionally frozen:

```sh
npm run version:packages
npm run verify:release
```

Before a stable release, change `channel = "alpha"` to `channel = "stable"` in
`.changes/config.toml`, review `npm run release:status`, then run the commands
above. Semifold consumes applied changesets during `version`; that is expected
release bookkeeping, not cleanup.
