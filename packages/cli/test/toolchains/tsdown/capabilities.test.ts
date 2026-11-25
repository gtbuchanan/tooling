import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { discoverPackage } from '#src/core/discovery.js';
import { capabilities } from '#src/toolchains/index.js';
import { tsdownConfig } from '#src/toolchains/tsdown/capabilities.js';
import { createTempDir, writeJson } from '#test/helpers.js';

/**
 * Discovers a package holding an empty file at each of `files`.
 */
const discover = (...files: readonly string[]) => {
  const dir = createTempDir();
  writeJson(dir, 'package.json', {});
  for (const file of files) {
    writeFileSync(path.join(dir, file), '');
  }

  return discoverPackage(dir, capabilities);
};

describe.concurrent('tsdownConfig', () => {
  it.for([
    'tsdown.config.ts',
    'tsdown.config.mts',
    'tsdown.config.cts',
    'tsdown.config.js',
    'tsdown.config.mjs',
    'tsdown.config.cjs',
    'tsdown.config.json',
  ])('holds for a package holding %s', (file, { expect }) => {
    expect(discover(file).capabilities.has(tsdownConfig)).toBe(true);
  });

  it('does not hold for a package with no tsdown config', ({ expect }) => {
    expect(discover('tsconfig.json').capabilities.has(tsdownConfig)).toBe(false);
  });

  it('does not hold for a file that only starts like a tsdown config', ({ expect }) => {
    expect(discover('tsdown.config.ts.bak').capabilities.has(tsdownConfig)).toBe(false);
  });
});
