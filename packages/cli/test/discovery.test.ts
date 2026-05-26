import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { discoverPackage, discoverWorkspace } from '#src/lib/discovery.js';
import { createTempDir, writeJson } from './helpers.ts';

const writeFile = (dir: string, name: string, content = ''): void => {
  writeFileSync(path.join(dir, name), content);
};

describe.concurrent(discoverPackage, () => {
  it('detects test directory', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    mkdirSync(path.join(dir, 'test'));

    const result = discoverPackage(dir);

    expect(result.hasTest).toBe(true);
  });

  it('detects e2e directory', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    mkdirSync(path.join(dir, 'e2e'));

    const result = discoverPackage(dir);

    expect(result.hasE2e).toBe(true);
  });

  it('detects eslint via config file', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    writeFile(dir, 'eslint.config.ts');

    const result = discoverPackage(dir);

    expect(result.hasEslint).toBe(true);
  });

  it('detects eslint via dependency', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      devDependencies: { '@gtbuchanan/eslint-config': build.semverRange() },
    });

    const result = discoverPackage(dir);

    expect(result.hasEslint).toBe(true);
  });

  it('detects vitest via dependency', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      devDependencies: { '@gtbuchanan/vitest-config': build.semverRange() },
    });

    const result = discoverPackage(dir);

    expect(result.hasVitest).toBe(true);
  });

  it('detects vitest via config file', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    writeFile(dir, 'vitest.config.ts');

    const result = discoverPackage(dir);

    expect(result.hasVitest).toBe(true);
  });

  it('detects typescript via dependency', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      devDependencies: { '@gtbuchanan/tsconfig': build.semverRange() },
    });

    const result = discoverPackage(dir);

    expect(result.hasTypeScript).toBe(true);
  });

  it('detects typescript via tsconfig.json', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    writeJson(dir, 'tsconfig.json', {});

    const result = discoverPackage(dir);

    expect(result.hasTypeScript).toBe(true);
  });

  it('detects published package', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      publishConfig: { directory: build.publishDirectory() },
    });

    const result = discoverPackage(dir);

    expect(result.isPublished).toBe(true);
  });

  it('private package is not published', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      private: true,
      publishConfig: { directory: build.publishDirectory() },
    });

    const result = discoverPackage(dir);

    expect(result.isPublished).toBe(false);
  });

  it('detects vitest e2e config', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    writeFile(dir, 'vitest.config.e2e.ts');

    const result = discoverPackage(dir);

    expect(result.hasVitestE2e).toBe(true);
  });

  it('detects bin directory', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    mkdirSync(path.join(dir, 'bin'));

    const result = discoverPackage(dir);

    expect(result.hasBin).toBe(true);
  });

  it('detects scripts directory', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    mkdirSync(path.join(dir, 'scripts'));

    const result = discoverPackage(dir);

    expect(result.hasScripts).toBe(true);
  });

  it('detects generate via script prefix', ({ expect }) => {
    const dir = createTempDir();
    const generateKey = `generate:${faker.lorem.word()}`;
    writeJson(dir, 'package.json', {
      scripts: { [generateKey]: faker.lorem.words({ min: 1, max: 3 }) },
    });

    const result = discoverPackage(dir);

    expect(result.hasGenerate).toBe(true);
    expect(result.generateScripts).toStrictEqual([generateKey]);
  });

  it('collects multiple generate scripts', ({ expect }) => {
    const dir = createTempDir();
    const generateKeys = [
      `generate:${faker.lorem.word()}`,
      `generate:${faker.lorem.word()}`,
    ].toSorted();
    writeJson(dir, 'package.json', {
      scripts: Object.fromEntries(
        generateKeys.map(key => [key, faker.lorem.words({ min: 1, max: 3 })]),
      ),
    });

    const result = discoverPackage(dir);

    expect(result.generateScripts).toStrictEqual(generateKeys);
  });

  it('does not detect generate without colon prefix', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      scripts: {
        codegen: faker.lorem.words({ min: 1, max: 3 }),
        generate: faker.lorem.words({ min: 1, max: 3 }),
      },
    });

    const result = discoverPackage(dir);

    expect(result.hasGenerate).toBe(false);
    expect(result.generateScripts).toStrictEqual([]);
  });

  it('returns all false for minimal package', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});

    const result = discoverPackage(dir);

    expect(result).toMatchObject({
      hasBin: false,
      hasE2e: false,
      hasEslint: false,
      hasGenerate: false,
      hasScripts: false,
      hasTest: false,
      hasTypeScript: false,
      hasVitest: false,
      hasVitestE2e: false,
      isPublished: false,
    });
  });
});

describe.concurrent(discoverWorkspace, () => {
  it('discovers monorepo packages', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeJson(root, 'package.json', {});
    const pkgDir = path.join(root, 'packages', build.packageName());
    mkdirSync(pkgDir, { recursive: true });
    writeJson(pkgDir, 'package.json', {
      devDependencies: { '@gtbuchanan/eslint-config': build.semverRange() },
    });
    mkdirSync(path.join(pkgDir, 'src'));

    const result = discoverWorkspace({ cwd: root });

    expect(result.isMonorepo).toBe(true);
    expect(result.packages).toHaveLength(1);
    expect(result.packages[0]!.hasEslint).toBe(true);
  });

  it('discovers single-package repo', ({ expect }) => {
    const root = createTempDir();
    writeJson(root, 'package.json', {
      devDependencies: { '@gtbuchanan/tsconfig': build.semverRange() },
    });
    mkdirSync(path.join(root, 'src'));

    const result = discoverWorkspace({ cwd: root });

    expect(result.isMonorepo).toBe(false);
    expect(result.packages).toHaveLength(1);
    expect(result.packages[0]!.hasTypeScript).toBe(true);
  });

  it('includes root capabilities', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeJson(root, 'package.json', {
      devDependencies: { '@gtbuchanan/cli': 'workspace:*' },
    });
    const pkgDir = path.join(root, 'packages', build.packageName());
    mkdirSync(pkgDir, { recursive: true });
    writeJson(pkgDir, 'package.json', {});

    const result = discoverWorkspace({ cwd: root });

    expect(result.isSelfHosted).toBe(true);
  });
});
