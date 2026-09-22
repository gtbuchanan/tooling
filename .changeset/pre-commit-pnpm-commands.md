---
---

Run codegen commands before hk in `pre-commit.yml`

`pre-commit.yml` called `pnpm-tasks` with no commands and accepted only
`use-pnpm`, so a consumer had no way to run codegen before the hooks.

The `eslint` step lints the PR's changed files with type-aware rules. Where a
repository's linted source imports a generated file, that import resolves to
the `error` type in a fresh checkout and the rules fire on code that is fine,
while `CI / Build` passes on the same commit because turbo's `lint` task
depends on the codegen task.

The new `pnpm-commands` input takes newline-delimited commands and forwards
them to `pnpm-tasks`. It implies `use-pnpm`, since the commands run through
pnpm and gating them on that input would skip the step that runs them. A
repository with codegen passes `exec turbo run generate`.
