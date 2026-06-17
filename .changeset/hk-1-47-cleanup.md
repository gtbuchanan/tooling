---
'@gtbuchanan/hk-config': minor
'@gtbuchanan/cli': patch
---

Drop hk batching/diff workarounds fixed upstream in hk 1.47

hk 1.47 made auto-batching respect the platform command-line limit
(cmd.exe on Windows) and added a no-merge-base fallback for ref diffs,
so the local workarounds are no longer needed:

- `@gtbuchanan/hk-config`: drop the `batchFiles` primitive and the
  per-step `batch` wiring from `fileHygiene` — hk auto-batches under the
  arg limit on its own.
- `@gtbuchanan/cli`: `gtb hk all` no longer sets `HK_BATCH`, and
  `gtb hk base` hands the range to hk as `--from-ref=<base> --to-ref=HEAD`
  instead of pre-computing the changed-file list.
