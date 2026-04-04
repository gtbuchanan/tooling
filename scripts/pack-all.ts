import * as v from 'valibot';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import crossSpawn from 'cross-spawn';
import { join } from 'node:path';

const ManifestSchema = v.looseObject({
  private: v.optional(v.boolean()),
});

const rootDir = import.meta.dirname;
const packagesDir = join(rootDir, '..', 'packages');
const destination = join(rootDir, '..', 'dist', 'packages');

mkdirSync(destination, { recursive: true });

for (const name of readdirSync(packagesDir)) {
  const pkgDir = join(packagesDir, name);
  const raw = readFileSync(join(pkgDir, 'package.json'), 'utf-8');
  const manifest = v.parse(ManifestSchema, JSON.parse(raw));
  if (manifest.private === true) {
    continue;
  }
  const result = crossSpawn.sync('pnpm', ['pack', '--pack-destination', destination], {
    cwd: pkgDir,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`pnpm pack failed for ${name} with exit code ${String(result.status)}`);
  }
}
