import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { runSync } from '#src/commands/root/sync.js';
import { runVerify } from '#src/commands/root/verify.js';
import { readJsonFile } from '#src/lib/file-writer.js';
import { captureLogger, createTempDir, writeJson } from './helpers.ts';

/**
 * Scaffolds a minimal TypeScript workspace whose root is the lone package.
 * The base tsconfig is deliberately omitted so each test controls whether it
 * exists — sync scaffolds `tsconfig.base.json` (the consumer's hand-authored
 * variant choice) only when absent.
 */
const createProjectWithoutBase = (): string => {
  const root = createTempDir();
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeJson(root, 'package.json', {
    devDependencies: { '@gtbuchanan/tsconfig': build.semverRange() },
    name: build.scopedPackageName(),
    private: true,
    version: build.semverVersion(),
  });

  return root;
};

const syncTsconfigs = (root: string): void => {
  runSync({ cwd: root, logger: captureLogger().logger, scopes: new Set(['tsconfig']) });
};

describe.concurrent('tsconfig.base.json scaffolding', () => {
  it('scaffolds the base extending the node variant when absent', ({ expect }) => {
    const root = createProjectWithoutBase();

    syncTsconfigs(root);

    expect(readJsonFile(path.join(root, 'tsconfig.base.json')))
      .toStrictEqual({ extends: ['@gtbuchanan/tsconfig/node.json'] });
  });

  it('preserves an existing base rather than overwriting it', ({ expect }) => {
    const root = createProjectWithoutBase();
    const basePath = path.join(root, 'tsconfig.base.json');
    const custom = { compilerOptions: { [build.packageName()]: true } };
    writeFileSync(basePath, JSON.stringify(custom));

    syncTsconfigs(root);

    expect(readJsonFile(basePath)).toStrictEqual(custom);
  });

  it('reports verify drift when the base is missing', ({ expect }) => {
    const root = createProjectWithoutBase();
    syncTsconfigs(root);
    rmSync(path.join(root, 'tsconfig.base.json'));

    expect(runVerify({ cwd: root, scopes: new Set(['tsconfig']) }))
      .toContainEqual(expect.stringContaining('tsconfig.base.json'));
  });

  it('fails sync and reports verify drift when the base path is not a file', ({ expect }) => {
    const root = createProjectWithoutBase();
    mkdirSync(path.join(root, 'tsconfig.base.json'));

    expect(() => {
      syncTsconfigs(root);
    }).toThrow(/not a file/v);
    expect(runVerify({ cwd: root, scopes: new Set(['tsconfig']) }))
      .toContainEqual(expect.stringContaining('tsconfig.base.json'));
  });
});
