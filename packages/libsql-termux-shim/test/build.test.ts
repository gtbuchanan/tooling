import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';

/*
 * `pack:npm` does not catch a missing build artifact — it exits 0 and publishes a
 * tarball containing only LICENSE, package.json, and README.md, so a shim that
 * never got copied would ship broken and only fail in a consumer's `require`.
 * This is the check that makes that loud.
 */
const pkgDir = path.join(import.meta.dirname, '..');
const source = path.join(pkgDir, 'src', 'index.cjs');
const built = path.join(pkgDir, 'dist', 'source', 'src', 'index.cjs');

describe('build', () => {
  it('copies the shim into the publishable layout', async ({ expect }) => {
    rmSync(built, { force: true });

    await import('../scripts/build.ts');

    expect(readFileSync(built, 'utf8')).toBe(readFileSync(source, 'utf8'));
  });
});
