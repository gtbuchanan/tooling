/**
 * Builds the publishable layout under `dist/source/`. The shim is hand-written
 * CommonJS rather than compiled TypeScript — it has to be `require()`-able by
 * libsql's own CJS wrapper — so this copies it verbatim instead of running tsc.
 * `publishConfig.directory` is `dist/source`, so `package.json`'s
 * `./src/index.cjs` main resolves identically in the workspace and the tarball.
 * Mirrors the convention used by other non-TypeScript packages in this repo
 * (e.g. `@gtbuchanan/pnpm-termux-shim`).
 */

import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const pkgDir = path.join(import.meta.dirname, '..');
const outSrcDir = path.join(pkgDir, 'dist', 'source', 'src');

mkdirSync(outSrcDir, { recursive: true });
copyFileSync(
  path.join(pkgDir, 'src', 'index.cjs'),
  path.join(outSrcDir, 'index.cjs'),
);
