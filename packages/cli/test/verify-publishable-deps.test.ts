import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { runVerify } from '#src/commands/root/verify.js';
import { createTempDir, writeJson } from './helpers.ts';

/**
 * Runtime manifest field a workspace dependency can be declared through.
 */
type RuntimeDepField = 'dependencies' | 'optionalDependencies' | 'peerDependencies';

interface WorkspaceDepProject {
  readonly consumer: { dir: string; name: string };
  readonly dependency: { dir: string; name: string };
  readonly root: string;
}

interface WorkspaceDepOptions {
  /**
   * Whether the consumer lists the dependency in `bundleDependencies`.
   * Defaults to `false`.
   */
  readonly bundled?: boolean;
  /**
   * Whether the depending package is published. Defaults to `true`.
   */
  readonly consumerPublished?: boolean;
  /**
   * Whether the depended-on package is published. Defaults to `false`.
   */
  readonly dependencyPublished?: boolean;
  /**
   * Manifest field the consumer declares the workspace dependency through.
   * Defaults to `dependencies`.
   */
  readonly field?: RuntimeDepField | 'devDependencies';
  /**
   * Specifier the consumer declares. Defaults to `workspace:*`.
   */
  readonly specifier?: string;
}

const publishFields = (isPublished: boolean): Record<string, unknown> =>
  (isPublished
    ? { publishConfig: { directory: build.publishDirectory() } }
    : { private: true });

/**
 * Scaffolds a two-package monorepo where one package depends on the other.
 * Both directory names derive from one seed with distinct suffixes so they
 * can never collide.
 */
const createWorkspaceDepProject = (
  options: WorkspaceDepOptions = {},
): WorkspaceDepProject => {
  const {
    bundled = false,
    consumerPublished = true,
    dependencyPublished = false,
    field = 'dependencies',
    specifier = 'workspace:*',
  } = options;
  const root = createTempDir();
  const seed = build.packageName();
  writeFileSync(
    path.join(root, 'pnpm-workspace.yaml'),
    "packages:\n  - 'packages/*'\n",
  );
  writeJson(root, 'package.json', { name: build.packageName(), private: true });

  const dependencyName = build.scopedPackageName();
  const dependencyDir = path.join(root, 'packages', `${seed}-dep`);
  mkdirSync(dependencyDir, { recursive: true });
  writeJson(dependencyDir, 'package.json', {
    name: dependencyName,
    ...publishFields(dependencyPublished),
  });

  const consumerName = build.scopedPackageName();
  const consumerDir = path.join(root, 'packages', `${seed}-consumer`);
  mkdirSync(consumerDir, { recursive: true });
  writeJson(consumerDir, 'package.json', {
    ...(bundled && { bundleDependencies: [dependencyName] }),
    [field]: { [dependencyName]: specifier },
    name: consumerName,
    ...publishFields(consumerPublished),
  });

  return {
    consumer: { dir: consumerDir, name: consumerName },
    dependency: { dir: dependencyDir, name: dependencyName },
    root,
  };
};

const manifestScope = new Set(['manifest'] as const);

describe.concurrent('published packages depending on private workspace packages', () => {
  it('reports drift when a published package depends on a private one', ({ expect }) => {
    const { consumer, dependency, root } = createWorkspaceDepProject();

    const drift = runVerify({ cwd: root, scopes: manifestScope });

    expect(drift).toStrictEqual([expect.stringContaining(dependency.name)]);
    expect(drift[0]).toContain(consumer.dir);
  });

  it('reports drift for a private workspace peerDependency', ({ expect }) => {
    const { dependency, root } = createWorkspaceDepProject({
      field: 'peerDependencies',
    });

    const drift = runVerify({ cwd: root, scopes: manifestScope });

    expect(drift).toStrictEqual([expect.stringContaining(dependency.name)]);
  });

  it('reports drift for a private workspace optionalDependency', ({ expect }) => {
    const { dependency, root } = createWorkspaceDepProject({
      field: 'optionalDependencies',
    });

    const drift = runVerify({ cwd: root, scopes: manifestScope });

    expect(drift).toStrictEqual([expect.stringContaining(dependency.name)]);
  });

  it('reports drift when the private dependency is the workspace root', ({ expect }) => {
    const root = createTempDir();
    const rootName = build.scopedPackageName();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n",
    );
    writeJson(root, 'package.json', { name: rootName, private: true });
    const pkgDir = path.join(root, 'packages', build.packageName());
    mkdirSync(pkgDir, { recursive: true });
    writeJson(pkgDir, 'package.json', {
      dependencies: { [rootName]: 'workspace:*' },
      name: build.scopedPackageName(),
      publishConfig: { directory: build.publishDirectory() },
    });

    const drift = runVerify({ cwd: root, scopes: manifestScope });

    expect(drift).toStrictEqual([expect.stringContaining(rootName)]);
  });

  it('passes when the workspace dependency is published', ({ expect }) => {
    const { root } = createWorkspaceDepProject({ dependencyPublished: true });

    const drift = runVerify({ cwd: root, scopes: manifestScope });

    expect(drift).toStrictEqual([]);
  });

  it('passes when the private package is only a devDependency', ({ expect }) => {
    const { root } = createWorkspaceDepProject({ field: 'devDependencies' });

    const drift = runVerify({ cwd: root, scopes: manifestScope });

    expect(drift).toStrictEqual([]);
  });

  it('passes when the private workspace package is bundled', ({ expect }) => {
    const { root } = createWorkspaceDepProject({ bundled: true });

    const drift = runVerify({ cwd: root, scopes: manifestScope });

    expect(drift).toStrictEqual([]);
  });

  it('passes when the depending package is itself private', ({ expect }) => {
    const { root } = createWorkspaceDepProject({ consumerPublished: false });

    const drift = runVerify({ cwd: root, scopes: manifestScope });

    expect(drift).toStrictEqual([]);
  });

  it('passes when the private package is pinned to a registry range', ({ expect }) => {
    const { root } = createWorkspaceDepProject({ specifier: build.semverRange() });

    const drift = runVerify({ cwd: root, scopes: manifestScope });

    expect(drift).toStrictEqual([]);
  });

  it('is not reported under an unrelated scope', ({ expect }) => {
    const { root } = createWorkspaceDepProject();

    const drift = runVerify({ cwd: root, scopes: new Set(['turbo']) });

    expect(drift.some(msg => msg.includes('private workspace'))).toBe(false);
  });
});
