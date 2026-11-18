---
'@gtbuchanan/hk-config': minor
---

Add the ESLint step as `Defaults.nodeSteps(prefix)`

Spread `...Defaults.nodeSteps("pnpm exec")` in place of a hand-written `eslint`
step. It runs `eslint --max-warnings=0 --no-warn-ignored` over every changed
file, as the step consumers have been copying does, and `Eslint.eslintArgs`
keeps those flags for a repository that replaces the command. Requires ESLint 10.
