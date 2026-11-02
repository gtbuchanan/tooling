import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import type { CapabilitySource } from '#src/core/capability.js';
import type { Manifest } from '#src/core/manifest.js';
import { eslint } from '#src/toolchains/eslint/capabilities.js';

const source = (entries: readonly string[], manifest: Manifest = {}): CapabilitySource => ({
  dir: '/repo',
  entries,
  manifest,
});

describe.concurrent('eslint', () => {
  it.for([
    ['eslint.config.ts'],
    ['eslint.config.mjs'],
    ['eslint.config.json'],
  ] as const)('holds for a package holding %s', ([file], { expect }) => {
    expect(eslint.detect(source([file]))).toBe(true);
  });

  it.for([
    ['dependencies'],
    ['devDependencies'],
  ] as const)('holds for a package declaring the shared config in %s', ([field], { expect }) => {
    const manifest = { [field]: { '@gtbuchanan/eslint-config': build.semverRange() } };

    expect(eslint.detect(source([], manifest))).toBe(true);
  });

  // `lint:eslint` runs flat config only, which ESLint never reads from an rc file.
  it('does not hold for a legacy rc file alone', ({ expect }) => {
    expect(eslint.detect(source(['.eslintrc.json']))).toBe(false);
  });
});
