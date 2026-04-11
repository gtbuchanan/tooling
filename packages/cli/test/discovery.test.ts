import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { discoverPackage, discoverWorkspace } from '#src/lib/discovery.js';
import { createTempDir, writeJson } from './helpers.ts';

const writeFile = (dir: string, name: string, content = ''): void => {
  writeFileSync(join(dir, name), content);
};

describe(discoverPackage, () => {
  it('detects test directory', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    mkdirSync(join(dir, 'test'));

    const result = discoverPackage(dir);

    expect(result.hasTest).toBe(true);
  });

  it('detects e2e directory', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    mkdirSync(join(dir, 'e2e'));

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
      devDependencies: { '@gtbuchanan/eslint-config': '^0.1.0' },
    });

    const result = discoverPackage(dir);

    expect(result.hasEslint).toBe(true);
  });

  it('detects oxlint via config file', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    writeFile(dir, 'oxlint.config.ts');

    const result = discoverPackage(dir);

    expect(result.hasOxlint).toBe(true);
  });

  it('detects oxlint via dependency', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      devDependencies: { '@gtbuchanan/oxlint-config': '^0.1.0' },
    });

    const result = discoverPackage(dir);

    expect(result.hasOxlint).toBe(true);
  });

  it('detects vitest via dependency', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      devDependencies: { '@gtbuchanan/vitest-config': '^0.1.0' },
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
      devDependencies: { '@gtbuchanan/tsconfig': '^0.1.0' },
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
      publishConfig: { directory: 'dist/source' },
    });

    const result = discoverPackage(dir);

    expect(result.isPublished).toBe(true);
  });

  it('private package is not published', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      private: true,
      publishConfig: { directory: 'dist/source' },
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

  it('detects generate via script prefix', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      scripts: { 'generate:prisma': 'prisma generate' },
    });

    const result = discoverPackage(dir);

    expect(result.hasGenerate).toBe(true);
    expect(result.generateScripts).toStrictEqual(['generate:prisma']);
  });

  it('collects multiple generate scripts', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      scripts: {
        'generate:paraglide': 'paraglide-js compile',
        'generate:prisma': 'prisma generate',
      },
    });

    const result = discoverPackage(dir);

    expect(result.generateScripts).toStrictEqual([
      'generate:paraglide',
      'generate:prisma',
    ]);
  });

  it('does not detect generate without colon prefix', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {
      scripts: { codegen: 'some-tool generate', generate: 'gen all' },
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
      hasE2e: false,
      hasEslint: false,
      hasGenerate: false,
      hasOxlint: false,
      hasTest: false,
      hasTypeScript: false,
      hasVitest: false,
      hasVitestE2e: false,
      isPublished: false,
    });
  });
});

describe(discoverWorkspace, () => {
  it('discovers monorepo packages', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeJson(root, 'package.json', {});
    const alpha = join(root, 'packages', 'alpha');
    mkdirSync(alpha, { recursive: true });
    writeJson(alpha, 'package.json', {
      devDependencies: { '@gtbuchanan/eslint-config': '^0.1.0' },
    });
    mkdirSync(join(alpha, 'src'));

    const result = discoverWorkspace({ cwd: root });

    expect(result.isMonorepo).toBe(true);
    expect(result.packages).toHaveLength(1);
    expect(result.packages[0]!.hasEslint).toBe(true);
    expect(result.packages[0]!.hasEslint).toBe(true);
  });

  it('discovers single-package repo', ({ expect }) => {
    const root = createTempDir();
    writeJson(root, 'package.json', {
      devDependencies: { '@gtbuchanan/tsconfig': '^0.1.0' },
    });
    mkdirSync(join(root, 'src'));

    const result = discoverWorkspace({ cwd: root });

    expect(result.isMonorepo).toBe(false);
    expect(result.packages).toHaveLength(1);
    expect(result.packages[0]!.hasTypeScript).toBe(true);
  });

  it('includes root capabilities', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeJson(root, 'package.json', {
      devDependencies: { '@gtbuchanan/cli': 'workspace:*' },
    });
    const pkg = join(root, 'packages', 'lib');
    mkdirSync(pkg, { recursive: true });
    writeJson(pkg, 'package.json', {});

    const result = discoverWorkspace({ cwd: root });

    expect(result.isSelfHosted).toBe(true);
  });
});
