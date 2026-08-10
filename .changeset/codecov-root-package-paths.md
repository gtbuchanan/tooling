---
'@gtbuchanan/cli': patch
---

Fix root-package paths in the generated `codecov.yml`. A single-package
repo's sole package is the workspace root, so its path relative to the root
is empty — component paths came out absolute (`/src/**`) and matched nothing
in a root-relative coverage report, and its flag path was a bare `/`. Root
components are now written repo-relative (`src/**`) and the root flag omits
`paths` entirely, which Codecov already reads as "every file".

`src/**` is also no longer emitted unconditionally: it appears only when the
package has a `src/` directory, mirroring the existing `bin/` and `scripts/`
guards. A package with none of the three falls back to its own directory
glob, since Codecov treats an empty path list as the whole repo.
