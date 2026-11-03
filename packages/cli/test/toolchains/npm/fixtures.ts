import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { createTempDir, writeJson } from '#test/helpers.js';

/**
 * Runtime manifest field a workspace dependency can be declared through.
 */
type RuntimeDepField = 'dependencies' | 'optionalDependencies' | 'peerDependencies';

/**
 * A scaffolded monorepo holding one package that depends on another.
 */
export interface WorkspaceDepProject {
  readonly consumer: { dir: string; name: string };
  readonly dependency: { dir: string; name: string };
  readonly root: string;
}

/**
 * How {@link createWorkspaceDepProject} declares the dependency.
 */
export interface WorkspaceDepOptions {
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
 * The `-dep` / `-consumer` suffixes keep the two directory names distinct
 * even when the generated words happen to coincide.
 */
export const createWorkspaceDepProject = (
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
  writeFileSync(
    path.join(root, 'pnpm-workspace.yaml'),
    "packages:\n  - 'packages/*'\n",
  );
  writeJson(root, 'package.json', { name: build.packageName(), private: true });

  const dependencyName = build.scopedPackageName();
  const dependencyDir = path.join(root, 'packages', `${build.packageName()}-dep`);
  mkdirSync(dependencyDir, { recursive: true });
  writeJson(dependencyDir, 'package.json', {
    name: dependencyName,
    ...publishFields(dependencyPublished),
  });

  const consumerName = build.scopedPackageName();
  const consumerDir = path.join(root, 'packages', `${build.packageName()}-consumer`);
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
