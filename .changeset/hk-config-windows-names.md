---
'@gtbuchanan/hk-config': minor
---

Reject paths Windows can't check out, in `recommended`

The new `illegal-windows-names` step fails a commit that adds a reserved device
name (`aux`, `com1`, ...), a character Windows forbids in a path, or a path
segment ending in a space or a dot. It's a no-op on Windows, which can't create
such names; it guards commits made on Linux and macOS, CI included.
