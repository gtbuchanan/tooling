---
'@gtbuchanan/cli': patch
---

Stop packing and caching stale `dist/source` content

`compile:ts` now clears its output directory before invoking tsc. tsc doesn't
record what it emitted and so never removes output whose source was since
renamed or deleted — the orphan stayed behind and `pack:npm` shipped it. The
stale `.tsbuildinfo` goes with it, since left in place it reports the removed
files as up to date and suppresses the re-emit. The `pack:npm` docs and
manifest are kept, as is the `compile:skills` subtree — but only while the
package still authors a `skills/` directory, since once it doesn't that
task no longer runs to clear what it last wrote.

`compile:ts` also no longer declares the files `pack:npm` writes as its own
turbo `outputs`. The overlapping glob let a `compile:ts` cache entry capture
the stamped manifest and replay it on a hit, restoring whatever version was
current when the entry was written. `pack:npm` now declares the `.npmignore`
it writes, and excludes it from its own inputs alongside the other
self-generated files.
