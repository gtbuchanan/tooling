---
'@gtbuchanan/cli': patch
---

Upload every coverage report the test tasks declare

`gtb task coverage:codecov:upload` uploaded only the merged report. Where
several exist on disk, such as fast and merged coverage after a local run, it
now uploads each. Codecov combines them, so the reported coverage is
unchanged.
