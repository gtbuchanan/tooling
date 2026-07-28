---
'@gtbuchanan/eslint-config': patch
---

Stop `--fix` corrupting JSON files with unsorted keys

`json/sort-keys` and `format/prettier` were both fixable on the same
files. ESLint saw their fix ranges as non-overlapping and applied both
in one pass, interleaving the reordered keys with a Prettier text diff
computed against the unsorted original — the file came out as invalid
JSON that no later pass could recover. Prettier already sorts these
files recursively via `prettier-plugin-sort-json`, so `json/sort-keys`
is now off and Prettier owns JSON key order outright.
