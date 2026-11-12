---
'@gtbuchanan/cli': patch
---

Drop the `get-tsconfig` dependency

`compile:ts` hashes `bin` and `src` directly instead of reading them back
from each package's `tsconfig.build.json`, where `gtb sync` writes exactly
those two and `gtb verify` rejects any other `include`.
