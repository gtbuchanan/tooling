---
'@gtbuchanan/eslint-config': minor
---

Lint with `@stylistic/eslint-plugin` v6

Its `customize()` preset, which `configure()` builds the stylistic rules from,
now enables `@stylistic/list-style`: a list whose brackets sit on their own
lines must put each item on its own line too, so a wrapped list can no longer
pack several items per line. `@stylistic/indent` also indents a property value
that starts on the next line by one level instead of two. `--fix` rewrites both.
