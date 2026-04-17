import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { resolveWorkspace } from '#src/lib/workspace.js';
import { createTempDir } from './helpers.ts';

describe(resolveWorkspace, () => {
  it('detects monorepo with packages glob', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    mkdirSync(path.join(root, 'packages', 'alpha'), { recursive: true });
    mkdirSync(path.join(root, 'packages', 'beta'), { recursive: true });

    const result = resolveWorkspace({ cwd: root });

    expect(result.rootDir).toBe(root);
    expect(result.packageDirs).toHaveLength(2);
    expect(result.packageDirs).toContainEqual(
      path.join(root, 'packages', 'alpha'),
    );
    expect(result.packageDirs).toContainEqual(
      path.join(root, 'packages', 'beta'),
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
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    mkdirSync(path.join(root, 'packages'), { recursive: true });
    writeFileSync(path.join(root, 'packages', 'not-a-package.txt'), '');
    mkdirSync(path.join(root, 'packages', 'real-pkg'), { recursive: true });

    const result = resolveWorkspace({ cwd: root });

    expect(result.packageDirs).toStrictEqual([
      path.join(root, 'packages', 'real-pkg'),
    ]);
  });

  it('resolves from a subdirectory', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    const subDir = path.join(root, 'packages', 'alpha');
    mkdirSync(subDir, { recursive: true });

    const result = resolveWorkspace({ cwd: subDir });

    expect(result.rootDir).toBe(root);
    expect(result.packageDirs).toContainEqual(subDir);
  });

  it('handles double-quoted globs', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      'packages:\n  - "apps/*"\n',
    );
    mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });

    const result = resolveWorkspace({ cwd: root });

    expect(result.packageDirs).toStrictEqual([path.join(root, 'apps', 'web')]);
  });

  it('handles bare (unquoted) globs', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      'packages:\n  - packages/*\n',
    );
    mkdirSync(path.join(root, 'packages', 'lib'), { recursive: true });

    const result = resolveWorkspace({ cwd: root });

    expect(result.packageDirs).toStrictEqual([
      path.join(root, 'packages', 'lib'),
    ]);
  });

  it('handles multiple glob patterns', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n  - 'apps/*'\n",
    );
    mkdirSync(path.join(root, 'packages', 'lib'), { recursive: true });
    mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });

    const result = resolveWorkspace({ cwd: root });

    expect(result.packageDirs).toHaveLength(2);
    expect(result.packageDirs).toContainEqual(
      path.join(root, 'packages', 'lib'),
    );
    expect(result.packageDirs).toContainEqual(
      path.join(root, 'apps', 'web'),
    );
  });

  it('handles literal directory (no wildcard)', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'tooling'\n",
    );
    mkdirSync(path.join(root, 'tooling'), { recursive: true });

    const result = resolveWorkspace({ cwd: root });

    expect(result.packageDirs).toStrictEqual([path.join(root, 'tooling')]);
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
