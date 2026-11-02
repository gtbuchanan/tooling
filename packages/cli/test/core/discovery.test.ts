import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import type { Capability } from '#src/core/capability.js';
import { discoverPackage, discoverWorkspace } from '#src/core/discovery.js';
import { localeComparer } from '#src/core/sort.js';
import { eslint } from '#src/toolchains/eslint/capabilities.js';
import { capabilities } from '#src/toolchains/index.js';
import { createTempDir, writeJson } from '#test/helpers.js';

const writeFile = (dir: string, name: string, content = ''): void => {
  writeFileSync(path.join(dir, name), content);
};

/**
 * Holds where the directory has a `marker` entry and its manifest names it `name`.
 */
const markedAs = (name: string): Capability => ({
  detect: ({ entries, manifest }) => entries.includes('marker') && manifest.name === name,
  name: `marked as ${name}`,
});

const never: Capability = { detect: () => false, name: 'never' };

describe.concurrent(discoverPackage, () => {
  it('records the capabilities that hold, and no others', ({ expect }) => {
    const dir = createTempDir();
    const name = build.scopedPackageName();
    writeJson(dir, 'package.json', { name });
    mkdirSync(path.join(dir, 'marker'));
    const marked = markedAs(name);

    const result = discoverPackage(dir, [never, marked, markedAs(build.scopedPackageName())]);

    expect(result.capabilities).toStrictEqual(new Set([marked]));
  });

  it('exposes the manifest name', ({ expect }) => {
    const dir = createTempDir();
    const name = build.scopedPackageName();
    writeJson(dir, 'package.json', { name });

    const result = discoverPackage(dir, capabilities);

    expect(result).toHaveProperty('name', name);
  });

  it('falls back to the directory basename when the manifest has no name', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});

    const result = discoverPackage(dir, capabilities);

    expect(result).toHaveProperty('name', path.basename(dir));
  });

  it('detects test directory', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    mkdirSync(path.join(dir, 'test'));

    const result = discoverPackage(dir, capabilities);

    expect(result.hasTest).toBe(true);
  });

  it('detects e2e directory', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    mkdirSync(path.join(dir, 'e2e'));

    const result = discoverPackage(dir, capabilities);

    expect(result.hasE2e).toBe(true);
  });

  it('detects a Pkl package via a .pkl source file', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    writeFile(dir, 'Defaults.pkl', 'module Defaults\n');

    const result = discoverPackage(dir, capabilities);

    expect(result.hasPkl).toBe(true);
  });

  it('does not treat an hk.pkl config as a Pkl package', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    writeFile(dir, 'hk.pkl', 'amends "..."\n');

    const result = discoverPackage(dir, capabilities);

    expect(result.hasPkl).toBe(false);
  });

  it('treats a Pkl package with a package block as publishable', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    writeFile(dir, 'Defaults.pkl', 'module Defaults\n');
    writeFile(dir, 'PklProject', 'amends "pkl:Project"\n\npackage {\n  name = "x"\n}\n');

    const result = discoverPackage(dir, capabilities);

    expect(result).toMatchObject({ hasPkl: true, hasPklPackage: true });
  });

  it('treats a Pkl project without a package block as internal (not publishable)', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    writeFile(dir, 'Defaults.pkl', 'module Defaults\n');
    writeFile(dir, 'PklProject', 'amends "pkl:Project"\n\ndependencies {}\n');

    const result = discoverPackage(dir, capabilities);

    expect(result).toMatchObject({ hasPkl: true, hasPklPackage: false });
  });

  it('treats Pkl source with no PklProject as internal (not publishable)', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    writeFile(dir, 'Defaults.pkl', 'module Defaults\n');

    const result = discoverPackage(dir, capabilities);

    expect(result).toMatchObject({ hasPkl: true, hasPklPackage: false });
  });

  it('detects vitest via dependency', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      devDependencies: { '@gtbuchanan/vitest-config': build.semverRange() },
    });

    const result = discoverPackage(dir, capabilities);

    expect(result.hasVitest).toBe(true);
  });

  it('detects vitest via config file', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    writeFile(dir, 'vitest.config.ts');

    const result = discoverPackage(dir, capabilities);

    expect(result.hasVitest).toBe(true);
  });

  it('detects typescript via dependency', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      devDependencies: { '@gtbuchanan/tsconfig': build.semverRange() },
    });

    const result = discoverPackage(dir, capabilities);

    expect(result.hasTypeScript).toBe(true);
  });

  it('detects typescript via tsconfig.json', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    writeJson(dir, 'tsconfig.json', {});

    const result = discoverPackage(dir, capabilities);

    expect(result.hasTypeScript).toBe(true);
  });

  it('detects published package', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      publishConfig: { directory: build.publishDirectory() },
    });

    const result = discoverPackage(dir, capabilities);

    expect(result.isPublished).toBe(true);
  });

  it('private package is not published', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      private: true,
      publishConfig: { directory: build.publishDirectory() },
    });

    const result = discoverPackage(dir, capabilities);

    expect(result.isPublished).toBe(false);
  });

  it('detects vitest e2e config', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    writeFile(dir, 'vitest.config.e2e.ts');

    const result = discoverPackage(dir, capabilities);

    expect(result.hasVitestE2e).toBe(true);
  });

  it('detects bin directory', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    mkdirSync(path.join(dir, 'bin'));

    const result = discoverPackage(dir, capabilities);

    expect(result.hasBin).toBe(true);
  });

  it('detects scripts directory', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    mkdirSync(path.join(dir, 'scripts'));

    const result = discoverPackage(dir, capabilities);

    expect(result.hasScripts).toBe(true);
  });

  it('detects src directory', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    mkdirSync(path.join(dir, 'src'));

    const result = discoverPackage(dir, capabilities);

    expect(result.hasSrc).toBe(true);
  });

  it('detects generate via script prefix', ({ expect }) => {
    const dir = createTempDir();
    const generateKey = `generate:${faker.lorem.word()}`;
    writeJson(dir, 'package.json', {
      scripts: { [generateKey]: faker.lorem.words({ min: 1, max: 3 }) },
    });

    const result = discoverPackage(dir, capabilities);

    expect(result.hasGenerate).toBe(true);
    expect(result.generateScripts).toStrictEqual([generateKey]);
  });

  it('collects multiple generate scripts', ({ expect }) => {
    const dir = createTempDir();
    const generateKeys = [
      `generate:${faker.lorem.word()}`,
      `generate:${faker.lorem.word()}`,
    ].toSorted(localeComparer);
    writeJson(dir, 'package.json', {
      scripts: Object.fromEntries(
        generateKeys.map(key => [key, faker.lorem.words({ min: 1, max: 3 })]),
      ),
    });

    const result = discoverPackage(dir, capabilities);

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

    const result = discoverPackage(dir, capabilities);

    expect(result.hasGenerate).toBe(false);
    expect(result.generateScripts).toStrictEqual([]);
  });

  it('returns all false for minimal package', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});

    const result = discoverPackage(dir, capabilities);

    expect(result).toMatchObject({
      hasBin: false,
      hasE2e: false,
      hasGenerate: false,
      hasScripts: false,
      hasSrc: false,
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

    const result = discoverWorkspace({ capabilities, cwd: root });

    expect(result.isMonorepo).toBe(true);
    expect(result.packages).toHaveLength(1);
    expect(result.packages[0]!.capabilities.has(eslint)).toBe(true);
  });

  it('discovers single-package repo', ({ expect }) => {
    const root = createTempDir();
    writeJson(root, 'package.json', {
      devDependencies: { '@gtbuchanan/tsconfig': build.semverRange() },
    });
    mkdirSync(path.join(root, 'src'));

    const result = discoverWorkspace({ capabilities, cwd: root });

    expect(result.isMonorepo).toBe(false);
    expect(result.packages).toHaveLength(1);
    expect(result.packages[0]!.hasTypeScript).toBe(true);
  });

  it('detects capabilities at each package and at the root', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    const rootName = build.scopedPackageName();
    writeJson(root, 'package.json', { name: rootName });
    writeFile(root, 'marker');
    const pkgName = build.scopedPackageName();
    const pkgDir = path.join(root, 'packages', build.packageName());
    mkdirSync(pkgDir, { recursive: true });
    writeJson(pkgDir, 'package.json', { name: pkgName });
    writeFile(pkgDir, 'marker');
    const [atRoot, atPackage] = [markedAs(rootName), markedAs(pkgName)];

    const result = discoverWorkspace({ capabilities: [atRoot, atPackage], cwd: root });

    expect(result.root.capabilities).toStrictEqual(new Set([atRoot]));
    expect(result.packages.map(pkg => pkg.capabilities)).toStrictEqual([new Set([atPackage])]);
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

    const result = discoverWorkspace({ capabilities, cwd: root });

    expect(result.isSelfHosted).toBe(true);
  });
});
