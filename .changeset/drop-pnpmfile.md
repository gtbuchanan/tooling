---
---

Drop the `.pnpmfile.cjs` tarball-URL strip hook.

It was a workaround for pnpm/pnpm#6667, where `lockfileIncludeTarballUrl:
false` didn't reliably keep tarball URLs out of the lockfile. That issue is
fixed upstream — regenerating the lockfile without the hook produces no
tarball entries — so the hook stripped nothing and only contributed a
`pnpmfileChecksum` entry to the lockfile.

That entry broke Renovate: its lockfile updater regenerates
`pnpm-lock.yaml` without the key, so every dependency PR failed CI with
`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` on `pnpm install --frozen-lockfile`.

`@pnpm/lockfile.types` goes with it — it existed only to type the hook.
