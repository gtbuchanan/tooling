---
'@gtbuchanan/cli': patch
---

Drop `--experimental-strip-types` from the self-hosted `gtb` script

Node 24 strips types by default, so the flag did nothing. `gtb sync` keeps an
existing script, so remove it by hand or run `gtb sync --force`.
