import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { runSync } from '#src/commands/root/sync.js';
import { runVerify } from '#src/commands/root/verify.js';
import { readJsonFile } from '#src/lib/file-writer.js';
import { captureLogger, createTempDir, writeJson } from './helpers.ts';

/**
 * Scaffolds a repo whose root _is_ the lone package — a `pnpm-workspace.yaml`
 * carrying settings but no `packages` globs, so discovery falls back to
 * single-package mode with `pkg.dir === rootDir`.
 */
const createSinglePackageProject = (): string => {
  const root = createTempDir();
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'linkWorkspacePackages: true\n');
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeJson(root, 'package.json', {
    devDependencies: {
      '@gtbuchanan/cli': build.semverRange(),
      '@gtbuchanan/tsconfig': build.semverRange(),
    },
    name: build.scopedPackageName(),
    publishConfig: { directory: build.publishDirectory() },
    scripts: {},
    version: build.semverVersion(),
  });
  writeFileSync(path.join(root, 'tsconfig.base.json'), '{}');

  return root;
};

const syncTsconfigs = (root: string): void => {
  runSync({
    cwd: root,
    force: true,
    logger: captureLogger().logger,
    scopes: new Set(['tsconfig']),
  });
};

describe.concurrent('single-package tsconfigs', () => {
  it('writes tsconfigs that resolve inside the repo', ({ expect }) => {
    const root = createSinglePackageProject();

    syncTsconfigs(root);

    for (const name of ['tsconfig.json', 'tsconfig.build.json']) {
      expect(readJsonFile(path.join(root, name)))
        .toHaveProperty('extends', './tsconfig.base.json');
    }
  });

  it('keeps the emit options the build task needs', ({ expect }) => {
    const root = createSinglePackageProject();

    syncTsconfigs(root);

    expect(readJsonFile(path.join(root, 'tsconfig.build.json'))).toMatchObject({
      compilerOptions: { declaration: true, outDir: 'dist/source', rootDir: '.' },
      include: ['bin', 'src'],
    });
  });

  it('leaves no drift for verify to report', ({ expect }) => {
    const root = createSinglePackageProject();

    syncTsconfigs(root);

    expect(runVerify({ cwd: root, scopes: new Set(['tsconfig']) })).toStrictEqual([]);
  });

  it('stays idempotent across repeated syncs', ({ expect }) => {
    const root = createSinglePackageProject();

    syncTsconfigs(root);
    const first = readJsonFile(path.join(root, 'tsconfig.build.json'));
    syncTsconfigs(root);

    expect(readJsonFile(path.join(root, 'tsconfig.build.json'))).toStrictEqual(first);
  });
});
