---
---

Retry a fixture install against the registry when npm's cache is stale

`--prefer-offline` bypasses staleness checks and fetches only what is missing,
so a packument cached before a version was published reports that version as
nonexistent. A dependency bump leaves the cache in exactly that state, which is
when the e2e fixtures run, so the suite failed on the change it was meant to
test and blamed a version that exists.

Fixture installs now retry once with `--prefer-online` on that signature. Every
other failure is rethrown on the first attempt, so nothing genuinely broken
waits for a second install to confirm it.
