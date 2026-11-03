---
'@gtbuchanan/cli': patch
---

Make `gtb task coverage:codecov:upload` upload every coverage report the test tasks declare. Where more than one exists on disk, such as fast and merged coverage after a local run, each one is uploaded instead of only the merged report. Codecov combines them, so the reported coverage is unchanged.
