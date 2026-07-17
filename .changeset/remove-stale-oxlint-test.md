---
---

Remove a stale eslint-config e2e test that asserted a removed oxlint
overlay. Its premise no longer holds, and its assertion duplicated the
existing clean-file test.
