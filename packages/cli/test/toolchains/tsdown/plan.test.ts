import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { discoverWorkspace } from '#src/core/discovery.js';
import type { Finding } from '#src/tasks/toolchain.js';
import { capabilities } from '#src/toolchains/index.js';
import { planTsdownInstalled } from '#src/toolchains/tsdown/plan.js';
import { createTempDir, writeJson } from '#test/helpers.js';

interface Workspace {
  readonly pkgDir: string;
  readonly root: string;
}

/**
 * A monorepo whose one package holds a tsdown config, published unless
 * `isPublished` is false.
 */
const createWorkspace = (isPublished = true): Workspace => {
  const root = createTempDir();
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  writeJson(root, 'package.json', {
    devDependencies: { '@gtbuchanan/cli': build.semverRange() },
    name: build.packageName(),
    private: true,
  });
  const pkgDir = path.join(root, 'packages', build.packageName());
  mkdirSync(pkgDir, { recursive: true });
  writeJson(pkgDir, 'package.json', {
    name: build.scopedPackageName(),
    ...(isPublished ? { publishConfig: { directory: 'dist/source' } } : { private: true }),
  });
  writeFileSync(path.join(pkgDir, 'tsdown.config.ts'), 'export default {};\n');

  return { pkgDir, root };
};

/*
Installs a resolvable tsdown into `dir`'s node_modules.
*/
const installTsdown = (dir: string): void => {
  const tsdownDir = path.join(dir, 'node_modules', 'tsdown');
  mkdirSync(tsdownDir, { recursive: true });
  writeJson(tsdownDir, 'package.json', {
    exports: { './package.json': './package.json' },
    name: 'tsdown',
    version: build.semverVersion(),
  });
};

const plan = (root: string): readonly Finding[] => planTsdownInstalled({
  discovery: discoverWorkspace({ capabilities, cwd: root }),
  force: false,
  ignored: new Set(),
});

describe.concurrent(planTsdownInstalled, () => {
  /*
   * The peer dependency is optional, so nothing in the install warns. The
   * bundle would otherwise fail only when compile:tsdown first spawns tsdown.
   */
  it('reports a package compile:tsdown applies to without tsdown', ({ expect }) => {
    const { pkgDir, root } = createWorkspace();

    expect(plan(root)).toStrictEqual([{
      kind: 'problem',
      message: `${pkgDir}: tsdown.config.* needs tsdown — add it to devDependencies`,
    }]);
  });

  it('reports nothing where the package installs tsdown', ({ expect }) => {
    const { pkgDir, root } = createWorkspace();
    installTsdown(pkgDir);

    expect(plan(root)).toStrictEqual([]);
  });

  /*
  pnpm puts the root's binaries on every package script's PATH too.
  */
  it('reports nothing where the workspace root installs tsdown', ({ expect }) => {
    const { root } = createWorkspace();
    installTsdown(root);

    expect(plan(root)).toStrictEqual([]);
  });

  /*
  compile:tsdown doesn't apply, so nothing spawns tsdown.
  */
  it('reports nothing for an unpublished package', ({ expect }) => {
    const { root } = createWorkspace(false);

    expect(plan(root)).toStrictEqual([]);
  });
});
