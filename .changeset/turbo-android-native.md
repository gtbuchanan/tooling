---
'@gtbuchanan/pnpm-termux-shim': patch
'@gtbuchanan/cli': minor
---

Run the npm-distributed turbo on Termux instead of a Termux-packaged one.
turbo 2.10.8 publishes its `linux-arm64` binary under `os: ["android",
"linux"]`, so `node_modules/.bin/turbo` now starts on Android and the
`pkg install turbo` escape hatch in `gtb turbo` is gone.

In its place `gtb turbo` rewrites every PATH entry to an absolute path.
turbo resolves the package manager against PATH from the directory it was
invoked in and keeps the path that search produced, then runs each task
with that package's directory as the cwd — so a match from a relative
entry is re-interpreted against the child's directory and the spawn
fails. pnpm always prepends a relative `./node_modules/.bin`, which is
exactly where `@gtbuchanan/pnpm-termux-shim` installs its `pnpm`.
