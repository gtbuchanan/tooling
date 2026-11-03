import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { discoverWorkspace } from '#src/core/discovery.js';
import { capabilities } from '#src/toolchains/index.js';
import { checkPublishableDependencies } from '#src/toolchains/npm/checks.js';
import { createTempDir, writeJson } from '#test/helpers.js';
import { createWorkspaceDepProject } from '#test/toolchains/npm/fixtures.js';

const check = (root: string): readonly string[] =>
  checkPublishableDependencies({ discovery: discoverWorkspace({ capabilities, cwd: root }) });

describe.concurrent(checkPublishableDependencies, () => {
  it('reports a published package that depends on a private one', ({ expect }) => {
    const { consumer, dependency, root } = createWorkspaceDepProject();

    const messages = check(root);

    expect(messages).toStrictEqual([expect.stringContaining(dependency.name)]);
    expect(messages[0]).toContain(consumer.dir);
  });

  it('reports a private workspace peerDependency', ({ expect }) => {
    const { dependency, root } = createWorkspaceDepProject({
      field: 'peerDependencies',
    });

    expect(check(root)).toStrictEqual([expect.stringContaining(dependency.name)]);
  });

  it('reports a private workspace optionalDependency', ({ expect }) => {
    const { dependency, root } = createWorkspaceDepProject({
      field: 'optionalDependencies',
    });

    expect(check(root)).toStrictEqual([expect.stringContaining(dependency.name)]);
  });

  it('reports a dependency on the private workspace root', ({ expect }) => {
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

    expect(check(root)).toStrictEqual([expect.stringContaining(rootName)]);
  });

  it('passes when the workspace dependency is published', ({ expect }) => {
    const { root } = createWorkspaceDepProject({ dependencyPublished: true });

    expect(check(root)).toStrictEqual([]);
  });

  it('passes when the private package is only a devDependency', ({ expect }) => {
    const { root } = createWorkspaceDepProject({ field: 'devDependencies' });

    expect(check(root)).toStrictEqual([]);
  });

  it('passes when the private workspace package is bundled', ({ expect }) => {
    const { root } = createWorkspaceDepProject({ bundled: true });

    expect(check(root)).toStrictEqual([]);
  });

  it('passes when the depending package is itself private', ({ expect }) => {
    const { root } = createWorkspaceDepProject({ consumerPublished: false });

    expect(check(root)).toStrictEqual([]);
  });

  it('passes when the private package is pinned to a registry range', ({ expect }) => {
    const { root } = createWorkspaceDepProject({ specifier: build.semverRange() });

    expect(check(root)).toStrictEqual([]);
  });
});
