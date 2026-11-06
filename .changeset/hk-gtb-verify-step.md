---
'@gtbuchanan/hk-config': minor
---

Add `gtbCliSteps(prefix)`, a `gtb-verify` step that runs `gtb verify` and fixes drift with `gtb sync`, re-staging what sync writes. Spread it into a step mapping with the prefix that resolves `gtb` in your repo: `null` when gtb comes from a mise `npm:@gtbuchanan/cli` tool, `"pnpm exec"` when it's a workspace devDependency. A repo that adopts only the hk preset needs `@gtbuchanan/cli` 2.0.1 or later, and can then replace a hand-written `gtb verify mise` step with this one.
