import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { discoverPackage } from '#src/core/discovery.js';
import { capabilities } from '#src/toolchains/index.js';
import { vitestE2e, vitestTests } from '#src/toolchains/vitest/capabilities.js';
import { createTempDir, writeJson } from '#test/helpers.js';

interface PackageShape {
  readonly files?: readonly string[];
  readonly manifest?: Readonly<Record<string, unknown>>;
  readonly testDir?: boolean;
}

const discover = ({ files = [], manifest = {}, testDir = false }: PackageShape) => {
  const dir = createTempDir();
  writeJson(dir, 'package.json', manifest);
  for (const file of files) {
    writeFileSync(path.join(dir, file), '');
  }
  if (testDir) {
    mkdirSync(path.join(dir, 'test'));
  }

  return discoverPackage(dir, capabilities);
};

describe.concurrent('vitestTests', () => {
  it('holds for a package depending on the shared config, with a test/ directory', ({ expect }) => {
    const result = discover({
      manifest: { devDependencies: { '@gtbuchanan/vitest-config': build.semverRange() } },
      testDir: true,
    });

    expect(result.capabilities.has(vitestTests)).toBe(true);
  });

  it('holds for a package holding a vitest.config.*, with a test/ directory', ({ expect }) => {
    const result = discover({ files: ['vitest.config.ts'], testDir: true });

    expect(result.capabilities.has(vitestTests)).toBe(true);
  });

  it('does not hold for Vitest without a test/ directory', ({ expect }) => {
    const result = discover({ files: ['vitest.config.ts'] });

    expect(result.capabilities.has(vitestTests)).toBe(false);
  });

  it('does not hold for a test/ directory without Vitest', ({ expect }) => {
    const result = discover({ testDir: true });

    expect(result.capabilities.has(vitestTests)).toBe(false);
  });
});

describe.concurrent('vitestE2e', () => {
  it('holds for a package holding a vitest.config.e2e.*', ({ expect }) => {
    const result = discover({ files: ['vitest.config.e2e.ts'] });

    expect(result.capabilities.has(vitestE2e)).toBe(true);
  });

  // A unit-test config is not an e2e one, so only `test:vitest:fast` and `:slow` run it.
  it('does not hold for a unit-test config alone', ({ expect }) => {
    const result = discover({ files: ['vitest.config.ts'] });

    expect(result.capabilities.has(vitestE2e)).toBe(false);
  });
});
