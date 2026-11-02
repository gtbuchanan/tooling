import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { discoverPackage } from '#src/core/discovery.js';
import { capabilities } from '#src/toolchains/index.js';
import { pklPackage, pklSource } from '#src/toolchains/pkl/capabilities.js';
import { createTempDir, writeJson } from '#test/helpers.js';

const packageBlock = 'amends "pkl:Project"\n\npackage {\n  name = "x"\n}\n';

/**
 * Discovers a package holding `files`, each name mapped to its content.
 */
const discover = (files: Readonly<Record<string, string>>) => {
  const dir = createTempDir();
  writeJson(dir, 'package.json', {});
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content);
  }

  return discoverPackage(dir, capabilities);
};

describe.concurrent('pklSource', () => {
  it('holds for a package holding a .pkl source file', ({ expect }) => {
    const result = discover({ 'Defaults.pkl': 'module Defaults\n' });

    expect(result.capabilities.has(pklSource)).toBe(true);
  });

  it('does not hold for an hk.pkl config alone', ({ expect }) => {
    const result = discover({ 'hk.pkl': 'amends "..."\n' });

    expect(result.capabilities.has(pklSource)).toBe(false);
  });
});

describe.concurrent('pklPackage', () => {
  it('holds for Pkl source whose PklProject declares a package block', ({ expect }) => {
    const result = discover({ 'Defaults.pkl': 'module Defaults\n', 'PklProject': packageBlock });

    expect(result.capabilities.has(pklPackage)).toBe(true);
  });

  it('does not hold for a PklProject without a package block', ({ expect }) => {
    const result = discover({
      'Defaults.pkl': 'module Defaults\n',
      'PklProject': 'amends "pkl:Project"\n\ndependencies {}\n',
    });

    expect(result.capabilities.has(pklPackage)).toBe(false);
  });

  it('does not hold for Pkl source with no PklProject', ({ expect }) => {
    const result = discover({ 'Defaults.pkl': 'module Defaults\n' });

    expect(result.capabilities.has(pklPackage)).toBe(false);
  });

  // A package block with nothing to package is no publishable package.
  it('does not hold for a package block without Pkl source', ({ expect }) => {
    const result = discover({ 'PklProject': packageBlock, 'hk.pkl': 'amends "..."\n' });

    expect(result.capabilities.has(pklPackage)).toBe(false);
  });
});
