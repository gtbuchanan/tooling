---
'@gtbuchanan/cli': patch
---

Generate `deploy:skills` for skills at the workspace root

A monorepo whose `skills/` sits at the root got no `deploy:skills` task
at all: the capability was read from the packages alone, so the root's
copy — which `capabilitiesFor` already detects — went unused. The task
disappeared the moment `packages:` globs were added to
`pnpm-workspace.yaml` and the root stopped being the lone package.

`gtb sync` now emits a `//#deploy:skills` root task and the root
`deploy:skills` script backing it whenever a monorepo root carries its
own `skills/`, with `build` depending on it — the shape
`//#lint:eslint` already uses. `gtb verify` covers it for free, since a
generated task is one it can report as missing.

Root skills are not a fallback for per-package ones: both are emitted
when both exist. They are the case a package can't serve — skills
consumed as `<root>/skills/<name>/SKILL.md` are invisible inside a
package, and a private workspace package reaches no consumer at all.

Because turbo dispatches `//#deploy:skills` through the root script of
that name, such a root no longer gets the `gtb turbo run deploy:skills`
alias — it would re-enter turbo and trip the
`recursive_turbo_invocations` guard. Reach every package's copy through
`pnpm build` or `gtb turbo run deploy:skills`.
