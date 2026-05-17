import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { resolveWorkspace } from '#src/lib/workspace.js';
import { createTempDir } from './helpers.ts';

describe.concurrent(resolveWorkspace, () => {
  it('detects monorepo with packages glob', ({ expect }) => {
    const root = createTempDir();
    const alphaName = build.packageName();
    const betaName = build.packageName();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    mkdirSync(path.join(root, 'packages', alphaName), { recursive: true });
    mkdirSync(path.join(root, 'packages', betaName), { recursive: true });

    const result = resolveWorkspace({ cwd: root });

    expect(result.rootDir).toBe(root);
    expect(result.packageDirs).toHaveLength(2);
    expect(result.packageDirs).toContainEqual(
      path.join(root, 'packages', alphaName),
    );
    expect(result.packageDirs).toContainEqual(
      path.join(root, 'packages', betaName),
    );
  });

  it('falls back to single-package when no workspace file', ({ expect }) => {
    const root = createTempDir();

    const result = resolveWorkspace({ cwd: root });

    expect(result.rootDir).toBe(root);
    expect(result.packageDirs).toStrictEqual([root]);
  });

  it('falls back to single-package when packages field is missing', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      'hoist: false\n',
    );

    const result = resolveWorkspace({ cwd: root });

    expect(result.rootDir).toBe(root);
    expect(result.packageDirs).toStrictEqual([root]);
  });

  it('falls back to single-package when packages list is empty', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      'packages:\n',
    );

    const result = resolveWorkspace({ cwd: root });

    expect(result.rootDir).toBe(root);
    expect(result.packageDirs).toStrictEqual([root]);
  });

  it('ignores files in packages directory', ({ expect }) => {
    const root = createTempDir();
    const pkgName = build.packageName();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    mkdirSync(path.join(root, 'packages'), { recursive: true });
    writeFileSync(path.join(root, 'packages', faker.system.commonFileName('txt')), '');
    mkdirSync(path.join(root, 'packages', pkgName), { recursive: true });

    const result = resolveWorkspace({ cwd: root });

    expect(result.packageDirs).toStrictEqual([
      path.join(root, 'packages', pkgName),
    ]);
  });

  it('resolves from a subdirectory', ({ expect }) => {
    const root = createTempDir();
    const pkgName = build.packageName();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    const subDir = path.join(root, 'packages', pkgName);
    mkdirSync(subDir, { recursive: true });

    const result = resolveWorkspace({ cwd: subDir });

    expect(result.rootDir).toBe(root);
    expect(result.packageDirs).toContainEqual(subDir);
  });

  it('handles double-quoted globs', ({ expect }) => {
    const root = createTempDir();
    const pkgName = build.packageName();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      'packages:\n  - "apps/*"\n',
    );
    mkdirSync(path.join(root, 'apps', pkgName), { recursive: true });

    const result = resolveWorkspace({ cwd: root });

    expect(result.packageDirs).toStrictEqual([path.join(root, 'apps', pkgName)]);
  });

  it('handles bare (unquoted) globs', ({ expect }) => {
    const root = createTempDir();
    const pkgName = build.packageName();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      'packages:\n  - packages/*\n',
    );
    mkdirSync(path.join(root, 'packages', pkgName), { recursive: true });

    const result = resolveWorkspace({ cwd: root });

    expect(result.packageDirs).toStrictEqual([
      path.join(root, 'packages', pkgName),
    ]);
  });

  it('handles multiple glob patterns', ({ expect }) => {
    const root = createTempDir();
    const libName = build.packageName();
    const webName = build.packageName();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n  - 'apps/*'\n",
    );
    mkdirSync(path.join(root, 'packages', libName), { recursive: true });
    mkdirSync(path.join(root, 'apps', webName), { recursive: true });

    const result = resolveWorkspace({ cwd: root });

    expect(result.packageDirs).toHaveLength(2);
    expect(result.packageDirs).toContainEqual(
      path.join(root, 'packages', libName),
    );
    expect(result.packageDirs).toContainEqual(
      path.join(root, 'apps', webName),
    );
  });

  it('handles literal directory (no wildcard)', ({ expect }) => {
    const root = createTempDir();
    const pkgName = build.packageName();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      `packages:\n  - '${pkgName}'\n`,
    );
    mkdirSync(path.join(root, pkgName), { recursive: true });

    const result = resolveWorkspace({ cwd: root });

    expect(result.packageDirs).toStrictEqual([path.join(root, pkgName)]);
  });

  it('returns empty when glob directory does not exist', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'nonexistent/*'\n",
    );

    const result = resolveWorkspace({ cwd: root });

    expect(result.rootDir).toBe(root);
    expect(result.packageDirs).toStrictEqual([root]);
  });
});
