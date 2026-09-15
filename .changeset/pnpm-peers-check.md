---
---

Replace CI's resolution-only install with a peer check

`pnpm install --frozen-lockfile` skips resolution, so it reports no peer issues
at all, even under `strictPeerDependencies`. CI covered that gap with a second
`--prefer-frozen-lockfile --resolution-only` install, plus a `git checkout` to
undo the lockfile the extra pass rewrote. pnpm 12 removed `--resolution-only`,
so every job that installs now fails on the flag.

`pnpm peers check` reports the same mismatches, reads the lockfile rather than
rewriting it, and has shipped since pnpm 11.0.0, so it works on pnpm 11 and 12
alike.

It also ignores `strictPeerDependencies` and exits non-zero on any mismatch, so
the step reads that setting and branches on it rather than deciding for the
consumer. A repository that set it gets the failure it asked for; one that did
not gets a warning annotation instead of a build break it never opted into.
`pnpm-tasks` runs in every repository that consumes it, and a step failing
outright would turn a mismatch those repositories already live with into a
broken build.
