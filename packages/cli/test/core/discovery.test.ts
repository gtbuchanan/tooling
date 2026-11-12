import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import type { Capability } from '#src/core/capability.js';
import { discoverPackage, discoverWorkspace } from '#src/core/discovery.js';
import { localeComparer } from '#src/core/sort.js';
import { eslint } from '#src/toolchains/eslint/capabilities.js';
import { capabilities } from '#src/toolchains/index.js';
import { pklSource } from '#src/toolchains/pkl/capabilities.js';
import { skills } from '#src/toolchains/skills/capabilities.js';
import { typescript } from '#src/toolchains/typescript/capabilities.js';
import { vitestE2e, vitestTests } from '#src/toolchains/vitest/capabilities.js';
import { createTempDir, writeJson } from '#test/helpers.js';

const writeMarker = (dir: string): void => {
  mkdirSync(path.join(dir, 'marker'));
};

/**
 * Holds where the directory has a `marker` subdirectory and its manifest names it `name`.
 */
const markedAs = (name: string): Capability => ({
  detect: ({ directories, manifest }) => directories.includes('marker') && manifest.name === name,
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

  /*
   * Each of these detects a file by name, and a directory carrying the name
   * would put the package in the plan and leave a generator writing over it.
   */
  it.for([
    { capability: eslint, file: 'eslint.config.ts' },
    { capability: pklSource, file: 'Defaults.pkl' },
    { capability: typescript, file: 'tsconfig.json' },
    { capability: vitestE2e, file: 'vitest.config.e2e.ts' },
  ])('does not take a directory for $file', ({ capability, file }, { expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    mkdirSync(path.join(dir, file));

    const result = discoverPackage(dir, [capability]);

    expect(result.capabilities).toStrictEqual(new Set());
  });

  // The tools follow a symlinked config, so detection has to as well
  it('follows a symlink to the file it detects', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    const target = path.join(createTempDir(), 'eslint.config.ts');
    writeFileSync(target, '');
    symlinkSync(target, path.join(dir, 'eslint.config.ts'), 'file');

    const result = discoverPackage(dir, [eslint]);

    expect(result.capabilities).toStrictEqual(new Set([eslint]));
  });

  it('follows a symlink to the directory it detects', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    symlinkSync(createTempDir(), path.join(dir, 'skills'), 'dir');

    const result = discoverPackage(dir, [skills]);

    expect(result.capabilities).toStrictEqual(new Set([skills]));
  });

  it('takes a dangling symlink for neither a file nor a directory', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    symlinkSync(path.join(dir, 'missing.json'), path.join(dir, 'tsconfig.json'), 'file');

    const result = discoverPackage(dir, [typescript]);

    expect(result.capabilities).toStrictEqual(new Set());
  });

  it('does not take a file for the skills directory', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    writeFileSync(path.join(dir, 'skills'), '');

    const result = discoverPackage(dir, [skills]);

    expect(result.capabilities).toStrictEqual(new Set());
  });

  it('does not take a file for the test directory', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    writeFileSync(path.join(dir, 'vitest.config.ts'), '');
    writeFileSync(path.join(dir, 'test'), '');

    const result = discoverPackage(dir, [vitestTests]);

    expect(result.capabilities).toStrictEqual(new Set());
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

  it('detects generate via script prefix', ({ expect }) => {
    const dir = createTempDir();
    const generateKey = `generate:${faker.lorem.word()}`;
    writeJson(dir, 'package.json', {
      scripts: { [generateKey]: faker.lorem.words({ min: 1, max: 3 }) },
    });

    const result = discoverPackage(dir, capabilities);

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

    expect(result.generateScripts).toStrictEqual([]);
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
    expect(result.packages[0]!.capabilities.has(typescript)).toBe(true);
  });

  it('detects capabilities at each package and at the root', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    const rootName = build.scopedPackageName();
    writeJson(root, 'package.json', { name: rootName });
    writeMarker(root);
    const pkgName = build.scopedPackageName();
    const pkgDir = path.join(root, 'packages', build.packageName());
    mkdirSync(pkgDir, { recursive: true });
    writeJson(pkgDir, 'package.json', { name: pkgName });
    writeMarker(pkgDir);
    const [atRoot, atPackage] = [markedAs(rootName), markedAs(pkgName)];

    const result = discoverWorkspace({ capabilities: [atRoot, atPackage], cwd: root });

    expect(result.root.capabilities).toStrictEqual(new Set([atRoot]));
    expect(result.packages.map(pkg => pkg.capabilities)).toStrictEqual([new Set([atPackage])]);
  });

  it('runs the CLI from the workspace package that vendors it', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeJson(root, 'package.json', {
      devDependencies: { '@gtbuchanan/cli': 'workspace:*' },
    });
    const cliDir = path.join(root, 'packages', 'cli');
    mkdirSync(cliDir, { recursive: true });
    writeJson(cliDir, 'package.json', { name: '@gtbuchanan/cli' });

    const result = discoverWorkspace({ capabilities, cwd: root });

    expect(result.cli).toStrictEqual({ dir: cliDir, kind: 'workspace' });
  });

  it('runs the CLI the root depends on', ({ expect }) => {
    const root = createTempDir();
    writeJson(root, 'package.json', {
      devDependencies: { '@gtbuchanan/cli': build.semverRange() },
    });

    const result = discoverWorkspace({ capabilities, cwd: root });

    expect(result.cli).toStrictEqual({ kind: 'dependency' });
  });

  it('runs whatever CLI is on PATH when the root does not depend on it', ({ expect }) => {
    const root = createTempDir();
    writeJson(root, 'package.json', {});

    const result = discoverWorkspace({ capabilities, cwd: root });

    expect(result.cli).toStrictEqual({ kind: 'path' });
  });

  it.for([
    '.config/mise.lock',
    '.config/mise.toml',
    '.config/mise/config.toml',
    '.mise.toml',
    'mise.lock',
    'mise.toml',
  ])('lists the mise file %s', (file, { expect }) => {
    const root = createTempDir();
    writeJson(root, 'package.json', {});
    mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    writeFileSync(path.join(root, file), '');

    const result = discoverWorkspace({ capabilities, cwd: root });

    expect(result.root.miseFiles).toStrictEqual([file]);
  });

  it('lists every mise file present, sorted', ({ expect }) => {
    const root = createTempDir();
    writeJson(root, 'package.json', {});
    mkdirSync(path.join(root, '.config'));
    const files = ['mise.toml', '.config/mise.lock', '.config/mise.toml'];
    for (const file of files) {
      writeFileSync(path.join(root, file), '');
    }

    const result = discoverWorkspace({ capabilities, cwd: root });

    expect(result.root.miseFiles)
      .toStrictEqual(['.config/mise.lock', '.config/mise.toml', 'mise.toml']);
  });

  it('leaves out local overrides and directories named like mise files', ({ expect }) => {
    const root = createTempDir();
    writeJson(root, 'package.json', {});
    writeFileSync(path.join(root, 'mise.local.toml'), '');
    mkdirSync(path.join(root, 'mise.toml'));

    const result = discoverWorkspace({ capabilities, cwd: root });

    expect(result.root.miseFiles).toStrictEqual([]);
  });

  it.for(['.config/hk.pkl', 'hk.pkl'])('lists the hk config %s', (file, { expect }) => {
    const root = createTempDir();
    writeJson(root, 'package.json', {});
    mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    writeFileSync(path.join(root, file), '');

    const result = discoverWorkspace({ capabilities, cwd: root });

    expect(result.root.hkFiles).toStrictEqual([file]);
  });

  it('leaves out local overrides and directories named like hk configs', ({ expect }) => {
    const root = createTempDir();
    writeJson(root, 'package.json', {});
    mkdirSync(path.join(root, '.config'));
    writeFileSync(path.join(root, 'hk.local.pkl'), '');
    writeFileSync(path.join(root, '.config', 'hk.local.pkl'), '');
    mkdirSync(path.join(root, 'hk.pkl'));

    const result = discoverWorkspace({ capabilities, cwd: root });

    expect(result.root.hkFiles).toStrictEqual([]);
  });
});
