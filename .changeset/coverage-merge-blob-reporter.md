---
'@gtbuchanan/cli': patch
---

Fix `coverage:vitest:merge` failing under vitest 4 by overriding the
reporter for the merge invocation (`--reporter=default`). Vitest 4
rejects `--merge-reports` while `blob` is an active reporter, and the
shared config enables `blob` unconditionally so the fast/slow runs can
produce the per-bucket blobs.
