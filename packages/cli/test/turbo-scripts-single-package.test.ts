import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { runSync } from '#src/commands/root/sync.js';
import { runVerify } from '#src/commands/root/verify.js';
import { readJsonFile, writeJsonFile } from '#src/lib/file-writer.js';
import { captureLogger, createTempDir, readScripts, writeJson } from './helpers.ts';

/**
 * Scaffolds a repo whose root _is_ the lone package — a `pnpm-workspace.yaml`
 * carrying settings but no `packages` globs, so discovery falls back to
 * single-package mode with `pkg.dir === rootDir`.
 */
const createSinglePackageProject = (): string => {
  const root = createTempDir();
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'linkWorkspacePackages: true\n');
  mkdirSync(path.join(root, 'src'), { recursive: true });
  mkdirSync(path.join(root, 'test'), { recursive: true });
  writeJson(root, 'package.json', {
    devDependencies: {
      '@gtbuchanan/cli': build.semverRange(),
      '@gtbuchanan/eslint-config': build.semverRange(),
      '@gtbuchanan/tsconfig': build.semverRange(),
      '@gtbuchanan/vitest-config': build.semverRange(),
    },
    name: build.scopedPackageName(),
    publishConfig: { directory: build.publishDirectory() },
    scripts: {},
    version: build.semverVersion(),
  });

  return root;
};

const syncScripts = (root: string): void => {
  runSync({
    cwd: root,
    force: true,
    logger: captureLogger().logger,
    scopes: new Set(['scripts']),
  });
};

/** Adds one script, leaving the rest of the manifest (and so discovery) intact. */
const addScript = (root: string, name: string, value: string): void => {
  const filePath = path.join(root, 'package.json');
  const manifest = readJsonFile(filePath);
  writeJsonFile(filePath, { ...manifest, scripts: { ...readScripts(root), [name]: value } });
};

describe.concurrent('single-package root scripts', () => {
  it('generates no script that would re-enter turbo', ({ expect }) => {
    const root = createSinglePackageProject();

    syncScripts(root);

    const turboCallers = Object.entries(readScripts(root))
      .filter(([, value]) => value.includes('turbo'))
      .map(([name]) => name);

    expect(turboCallers).toStrictEqual([]);
  });

  it('keeps the leaf scripts that dispatch through gtb task', ({ expect }) => {
    const root = createSinglePackageProject();

    syncScripts(root);

    expect(readScripts(root)).toMatchObject({
      'lint:eslint': 'gtb task lint:eslint',
      'test:vitest:fast': 'gtb task test:vitest:fast',
      'typecheck:ts': 'gtb task typecheck:ts',
    });
  });

  it('leaves no drift for verify to report', ({ expect }) => {
    const root = createSinglePackageProject();

    syncScripts(root);

    expect(runVerify({ cwd: root, scopes: new Set(['scripts']) })).toStrictEqual([]);
  });

  it('reports a leftover aggregate script as drift', ({ expect }) => {
    const root = createSinglePackageProject();
    syncScripts(root);
    addScript(root, 'check', 'gtb turbo run check');

    const drift = runVerify({ cwd: root, scopes: new Set(['scripts']) });

    expect(drift).toStrictEqual([
      `${root}: script 'check' shadows the turbo task of the same name — ` +
      "delete it and run 'gtb turbo run check' instead",
    ]);
  });

  it('suppresses the shadowing report through the ignored set', ({ expect }) => {
    const root = createSinglePackageProject();
    syncScripts(root);
    addScript(root, 'check', 'gtb turbo run check');

    const drift = runVerify({
      cwd: root,
      ignored: new Set(['check']),
      scopes: new Set(['scripts']),
    });

    expect(drift).toStrictEqual([]);
  });
});
