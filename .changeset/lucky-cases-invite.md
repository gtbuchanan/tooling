---
'@gtbuchanan/cli': minor
---

Verify that published packages declare no private workspace dependencies

`gtb verify` (scope `manifest`) now asserts that every install-time
`workspace:` dependency of a published package is itself published. pnpm
rewrites the specifier to the linked package's concrete version at pack
time without checking that the version ever reached the registry, so a
private workspace package ships in the tarball as a dependency no
consumer can resolve.

Covers `dependencies`, `peerDependencies`, and `optionalDependencies`.
`devDependencies` are exempt (publishing strips them) as is anything
listed in `bundleDependencies` (the tarball carries it).
