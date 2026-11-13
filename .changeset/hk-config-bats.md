---
'@gtbuchanan/hk-config': patch
---

Lint bats test files with the `shellcheck` and `shfmt` steps

The steps selected shell sources by hk's `shell` content type alone, which
doesn't recognize a `#!/usr/bin/env bats` shebang, so `*.bats` files went
unlinted. Both steps now select them too.
