---
'@gtbuchanan/cli': minor
---

Remove leaf scripts that no longer apply in `gtb sync`

A `package.json` script that runs `gtb task <leaf>` after the leaf stops
applying to its package is now deleted by `gtb sync` and reported by
`gtb verify`. Left in place it would still run, failing on a missing config or
running beside a leaf that supersedes it. Scripts holding anything other than
the command sync writes, with or without arguments, are left alone.
