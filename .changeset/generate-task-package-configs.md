---
'@gtbuchanan/cli': minor
---

Declare `generate:*` tasks so turbo can actually run them

`gtb sync` named every discovered `generate:*` script in the root
`generate` aggregate's `dependsOn` but never emitted a task definition
for it. In a monorepo turbo refuses to build the graph at all in that
state — `Could not find "<pkg>#generate:prisma" in root turbo.json` —
so any consumer that added a codegen script broke every `turbo run`.

Only the package knows what its codegen reads and writes, and a task
with no `outputs` restores nothing on a cache hit, so sync no longer
guesses:

- **Monorepo** — the root aggregate is emitted empty and each package
  declares its own leaves in a package configuration
  (`packages/<pkg>/turbo.json` extending `//`), where it can give them
  real `inputs`/`outputs`. `gtb verify` reports a package that has
  `generate:*` scripts but no such configuration, a leaf missing from
  `generate`'s `dependsOn`, or a leaf declaring neither `outputs` nor
  `cache: false` — without the check, a missing configuration silently
  skips generation and leaves downstream tasks reading stale files.
- **Single-package repo** — turbo offers package configurations only
  for workspace packages, so sync declares the leaves itself with
  `cache: false`.

Repos with no `generate:*` scripts generate the same `turbo.json` as
before.
