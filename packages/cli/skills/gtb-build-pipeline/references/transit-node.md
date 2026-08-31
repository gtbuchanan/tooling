# The `transit` node

Turbo folds a workspace dependency's sources into a consumer's task hash only through a task edge. Tasks that read a dependency as **source** rather than as a build artifact have no artifact task to gate on, so without an edge they replay a cached pass after that dependency changed — a stale green.

`^compile:ts` doesn't close the gap. It covers only dependencies that actually compile; a source-only package (shared test fixtures, internal helpers) declares no such script and propagates nothing. Nor is turbo's global `hashOfInternalDependencies` a substitute — it is over-broad, undeclared, and does not move uniformly across a package's files.

`transit` is turbo's seam for this — a scriptless node whose only edge is `^transit`:

```json
{
  "tasks": {
    "transit": { "dependsOn": ["^transit"] },
    "typecheck:ts": { "dependsOn": ["transit"] },
    "lint:eslint": { "dependsOn": ["typecheck:ts", "transit"] },
    "test:vitest:fast": { "dependsOn": ["^compile", "transit"] }
  }
}
```

It declares no `inputs`, so turbo hashes the whole package, and it runs nothing, so nothing serializes — depending on it just pulls every transitive workspace dependency's file hashes into the consumer's hash. `gtb sync` emits it whenever the workspace has TypeScript, ESLint, Vitest, or e2e tests, and no package needs a `transit` script.

Watch for aggregates that appear to cover this already. `test:vitest:e2e` gates on `^pack`, and a dependency with no `pack:npm` script leaves its `pack` node scriptless and inputs-less — so it hashes the whole package exactly as `transit` does. That coverage is incidental: it reaches direct dependencies only, and resolves to nothing at all when the workspace packs nothing. `transit` is declared alongside it rather than assumed from it.

`lint:eslint` declares the edge itself rather than inheriting it through its same-package `typecheck:ts` dep. That dep is optional — consumers may drop it for parallelism — and isn't generated at all for a workspace without TypeScript, so inheriting would make lint's cross-package invalidation silently conditional.
