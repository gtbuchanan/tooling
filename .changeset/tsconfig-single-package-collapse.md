---
'@gtbuchanan/cli': patch
---

Fix `gtb sync`/`gtb verify` disagreeing on tsconfigs in single-package repos

When the workspace root is itself the lone package, the root and
per-package tsconfig layers of the sync plan target the same
`tsconfig.json` / `tsconfig.build.json`. The package layer won, writing an
`extends` of `../../tsconfig.base.json` that resolves outside the repo
(`TS5083`), and `verify` reported drift against whichever layer it
compared — so it could never pass, leaving the `Config Check` job
permanently red.

The plan now collapses layers that land on the same file, keeping the
root layer's `extends` while folding in the package layer's
`compilerOptions` and `include`. Package `extends` paths are also derived
from the package's actual depth below the root instead of assuming a
`packages/<name>` layout, so a package nested one level deep resolves
correctly too.
