# Bundling a package with `compile:tsdown`

`compile:ts` emits only a package's own sources, so a published package can't import a private workspace package: the tarball would import a package no registry holds. A bundle inlines it instead.

A published package holding a `tsdown.config.*` (`.ts`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs` or `.json`) gets `compile:tsdown` in place of `compile:ts`. `gtb sync` writes the new script and deletes the old one. The package needs `tsdown` among its own `devDependencies`, since the task runs the installed binary.

tsdown inlines what the package's `devDependencies` reach and leaves its `dependencies` and `peerDependencies` as imports. List a private workspace package under `devDependencies`. A private package's own runtime dependencies go in the published package's `dependencies` too, or tsdown inlines them as well.

## Options `compile:tsdown` passes to tsdown

These keep the bundle interchangeable with what `compile:ts` emits, so they are passed rather than left to the config:

- `--out-dir dist/source`, the directory `pack:npm` packs.
- `--tsconfig tsconfig.build.json`.
- `--no-fixed-extension`. tsdown writes `.mjs` for Node by default. With the flag the extension follows the package's `type`, so `publishConfig` paths written for tsc still hold.
- `--sourcemap`, since `compile:ts` ships a map beside every file.
- `--no-clean`. gtb clears the directory itself and keeps what `pack:npm` and `compile:skills` own there (see [the `dist/source` ownership reference](dist-source-ownership.md)).

Arguments after `gtb task compile:tsdown` come last and override these.

## Writing the tsdown config

Name each entry after the path `publishConfig` points `bin` or `exports` at, so the bundle lands where tsc's output would have:

```ts
import { defineConfig } from 'tsdown';

export default defineConfig({
  dts: { tsc: { eager: true } },
  entry: {
    'bin/cli': 'bin/cli.ts',
    'src/index': 'src/index.ts',
  },
});
```

`dts.tsc.eager` matters once the bundle inlines a private workspace package. That package's sources sit outside the build tsconfig's `rootDir`, and tsdown's lazy declaration emitter fails on their types with `MISSING_EXPORT`.
