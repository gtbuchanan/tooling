---
---

Add shellcheck to mise so actionlint lints workflow `run:` scripts.
Disable actionlint's shellcheck integration on Windows only, where its
stdin-pipe deadlock (rhysd/actionlint#650) hangs the hook; CI and other
platforms keep full coverage.
