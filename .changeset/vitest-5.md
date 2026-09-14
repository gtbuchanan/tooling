---
'@gtbuchanan/vitest-config': minor
---

Accept vitest 5 as a peer

The peer range widens to `^4.0.0 || ^5.0.0`. The workspace itself moves to
vitest 5, so `^5.0.0` is the version the configuration is tested against.

`vitest` also joins this package's devDependencies as `catalog:`, matching
every other package in the workspace. It was previously reachable only as an
auto-installed peer, which pnpm resolved to 4.1.11 once the range admitted two
majors; the package that owns the shared configuration was then the one package
not running on the workspace's vitest.
