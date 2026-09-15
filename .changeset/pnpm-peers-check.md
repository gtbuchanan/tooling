---
---

Replace CI's resolution-only install with a peer check

`pnpm install --frozen-lockfile` skips resolution, so it reports no peer issues
at all, even under `strictPeerDependencies`. CI covered that gap with a second
`--prefer-frozen-lockfile --resolution-only` install, plus a `git checkout` to
undo the lockfile the extra pass rewrote. pnpm 12 removed `--resolution-only`,
so every job that installs now fails on the flag.

`pnpm peers check` reads the lockfile and exits non-zero on unmet peers, which
is all the second install was there for, and it leaves the lockfile alone. It
has shipped since pnpm 11.0.0, so it works on the pinned pnpm and unblocks the
move to 12.
