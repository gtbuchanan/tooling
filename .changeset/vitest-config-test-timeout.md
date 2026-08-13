---
'@gtbuchanan/vitest-config': minor
---

Add a `testTimeout` option to `configure`, `configurePackage`, and
`configureGlobal`

Raise it for a package whose tests do seconds of real work — building an
ESLint config, starting a TypeScript project service, spawning a child
process. On a machine running the rest of the build in parallel, that
work exceeds vitest's 5s default and the suite fails under load while
passing in isolation.

The trade is real: this is a duration bound, so a higher one catches a
performance regression later. It buys reliability, because a wall-clock
limit can't distinguish a slower test from a busier machine. Size it to
the worst contention the suite runs under, not to the test's own cost.

`testTimeout` was already accepted by the e2e entry points; this makes
it consistent for source tests.
