---
'@gtbuchanan/cli': patch
---

Drop `--experimental-strip-types` from the generated self-hosted `gtb` script. Node 24 strips types by default, so the flag did nothing. `gtb sync` keeps existing scripts, so an already-generated script keeps the flag until it's removed by hand or regenerated with `gtb sync --force`.
