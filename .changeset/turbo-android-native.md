---
'@gtbuchanan/pnpm-termux-shim': patch
'@gtbuchanan/cli': minor
---

Run the npm turbo on Termux instead of `pkg install turbo`

turbo 2.10.8 publishes its `linux-arm64` binary under `os: ["android",
"linux"]`, so `node_modules/.bin/turbo` starts on Android and `gtb turbo` no
longer looks for the Termux-packaged turbo at `$PREFIX/bin/turbo`. That package
lags upstream and rejects keys `gtb sync` writes into `turbo.json`. The turbo
peer range rises to `>=2.10.8` to match, and `pkg install turbo` is no longer
needed.

`gtb turbo` now makes every PATH entry absolute before running turbo, so turbo
finds `@gtbuchanan/pnpm-termux-shim`'s `pnpm` from each package directory under
pnpm 11 and earlier. See the shim's README for the setup.
