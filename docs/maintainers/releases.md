# Releases

Semifold is Vooya's only version planner. The nine release packages form one
fixed release group; never edit their versions or internal exact dependencies by
hand. Semifold is a maintainer tool, not a dependency of published Vooya
packages.

## Inspect before changing state

```sh
npm run release:status
npm run verify:release
```

`npm run release:status` runs Semifold's read-only release plan after checking
Vooya's fixed-version contract. A pending `.changes/*.md` file must name all
nine package IDs with the same bump level. This is deliberate: Semifold's Node
adapter does not infer Vooya's coordinated release policy from npm dependency
ranges.

## Publish another alpha

Add one reviewed Semifold changeset for user-visible work, then run:

```sh
npm run version:packages
npm run verify:release
npm run release:alpha
```

Review the version, lockfile, exact internal dependencies, tarballs, and npm
dist-tags before the last command. `release:alpha` is the only command in this
sequence that publishes to npm.

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
