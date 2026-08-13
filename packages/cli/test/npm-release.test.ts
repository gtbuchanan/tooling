import { writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { executePublishNpmReleases } from '#src/lib/npm-release.js';
import {
  type GithubReleaseStubOptions,
  captureLogger,
  createNpmWorkspace,
  createTempDir,
  stubGithubReleaseDeps,
  writeJson,
} from './helpers.ts';

/**
 * Injected deps rooted at the workspace under test.
 */
const stubDeps = (
  cwd: string,
  options: GithubReleaseStubOptions = {},
) => stubGithubReleaseDeps({ ...options, cwd });

describe.concurrent(executePublishNpmReleases, () => {
  it('creates a release tagging HEAD when none exists', async ({ expect }) => {
    const ws = createNpmWorkspace();
    const { createCalls, deps, sha } = stubDeps(ws.root);

    await executePublishNpmReleases(deps);

    const tag = `${ws.name}@${ws.version}`;

    expect(createCalls()).toStrictEqual([{
      args: [
        'release', 'create', tag, '--target', sha, '--title', tag, '--notes', tag,
      ],
      command: 'gh',
    }]);
  });

  it('releases a single-package repo with a plain v<version> tag', async ({ expect }) => {
    const root = createTempDir();
    const version = build.semverVersion();
    writeJson(root, 'package.json', {
      name: build.scopedPackageName(),
      publishConfig: { directory: build.publishDirectory() },
      version,
    });
    const { createCalls, deps } = stubDeps(root);

    await executePublishNpmReleases(deps);

    expect(createCalls()).toHaveLength(1);
    expect(createCalls()[0]?.args.slice(0, 3)).toStrictEqual(['release', 'create', `v${version}`]);
  });

  it('uses the matching CHANGELOG.md section as the release notes', async ({ expect }) => {
    const ws = createNpmWorkspace();
    writeFileSync(
      path.join(ws.pkgDir, 'CHANGELOG.md'),
      `# pkg\n\n## ${ws.version}\n\n### Minor Changes\n\n- Added a thing\n\n## 0.0.1\n\n- old\n`,
    );
    const { createCalls, deps } = stubDeps(ws.root);

    await executePublishNpmReleases(deps);

    const args = createCalls()[0]?.args ?? [];

    expect(args[args.indexOf('--notes') + 1]).toBe('### Minor Changes\n\n- Added a thing');
  });

  it('skips when the release already exists', async ({ expect }) => {
    const ws = createNpmWorkspace();
    const { createCalls, deps } = stubDeps(ws.root, {
      existingTags: [`${ws.name}@${ws.version}`],
    });

    await executePublishNpmReleases(deps);

    expect(createCalls()).toHaveLength(0);
  });

  it('throws when the manifest is missing its package identity', async ({ expect }) => {
    const ws = createNpmWorkspace();
    writeJson(ws.pkgDir, 'package.json', {
      publishConfig: { directory: build.publishDirectory() },
      version: build.semverVersion(),
    });
    const { deps } = stubDeps(ws.root);

    await expect(executePublishNpmReleases(deps)).rejects.toThrow(/name or version/v);
  });

  it('no-ops when no package is published', async ({ expect }) => {
    const root = createTempDir();
    writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    writeJson(root, 'package.json', { name: build.packageName(), private: true });
    const captured = captureLogger();
    const { createCalls, deps } = stubDeps(root, { logger: captured.logger });

    await executePublishNpmReleases(deps);

    expect(createCalls()).toHaveLength(0);
    expect(captured.out()).toContain('no published npm packages');
  });
});
