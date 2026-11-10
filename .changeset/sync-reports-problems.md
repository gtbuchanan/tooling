---
'@gtbuchanan/cli': minor
---

Fail `gtb sync` on drift only a hand edit fixes

`gtb sync` now reports each such problem, such as a published package depending
on a private workspace package, and exits 1, so an hk fix step running it fails
on what its check step reports.
