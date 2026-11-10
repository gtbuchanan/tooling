---
'@gtbuchanan/cli': minor
---

Keep the tsconfig keys gtb doesn't write

The tsconfigs now come from the TypeScript toolchain, under the `toolchains`
scope, and the `tsconfig` scope is gone. A rewrite keeps every key gtb doesn't
own, such as `$schema`, `references`, `exclude` or a tool's own settings, where
it used to drop them.

A tsconfig that can't be parsed is reported for a hand fix instead of having its
compiler options written away, and a base path that isn't a file fails
`gtb sync` with a message instead of a stack trace.
