/**
 * Builds the publishable layout under `dist/source/`. Copies `bin/pnpm`
 * verbatim and reasserts the executable bit, since the package's
 * `publishConfig.directory` is `dist/source` and `pnpm pack` runs from
 * there. Mirrors the convention used by other non-TypeScript packages
 * in this repo (e.g. `@gtbuchanan/tsconfig`).
 */

import { chmodSync, copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/** rwxr-xr-x — owner full, group/other read+execute (no write). */
const executableMode = 0o755;

const pkgDir = path.join(import.meta.dirname, '..');
const outBinDir = path.join(pkgDir, 'dist', 'source', 'bin');
const outBinPath = path.join(outBinDir, 'pnpm');

mkdirSync(outBinDir, { recursive: true });
copyFileSync(path.join(pkgDir, 'bin', 'pnpm'), outBinPath);
chmodSync(outBinPath, executableMode);
