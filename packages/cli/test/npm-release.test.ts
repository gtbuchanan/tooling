import { writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import type { GithubReleaseDeps } from '#src/lib/github-release.js';
import { createLogger } from '#src/lib/logger.js';
import { executePublishNpmReleases } from '#src/lib/npm-release.js';
import { captureLogger, createNpmWorkspace, createTempDir, writeJson } from './helpers.ts';

interface RunCall {
  readonly args: readonly string[];
  readonly command: string;
}

const silentLogger = createLogger(
  { write: () => true } as unknown as NodeJS.WritableStream,
  { write: () => true } as unknown as NodeJS.WritableStream,
);

interface Stub {
  readonly deps: GithubReleaseDeps;
  readonly runCalls: readonly RunCall[];
  readonly sha: string;
}

/** Builds injected deps; `exists` decides whether `gh release view` succeeds. */
const stubDeps = (
  cwd: string,
  options: { exists: boolean; logger?: GithubReleaseDeps['logger'] },
): Stub => {
  const runCalls: RunCall[] = [];
  const sha = build.commitSha();

  return {
    deps: {
      capture: (command) => {
        if (command === 'git') {
          return Promise.resolve(`${sha}\n`);
        }

        return options.exists
          ? Promise.resolve('')
          : Promise.reject(new Error('release not found'));
      },
      cwd,
      logger: options.logger ?? silentLogger,
      run: (command, runOptions) => {
        runCalls.push({ args: runOptions?.args ?? [], command });

        return Promise.resolve();
      },
    },
    runCalls,
    sha,
  };
};

describe.concurrent(executePublishNpmReleases, () => {
  it('creates a release tagging HEAD when none exists', async ({ expect }) => {
    const ws = createNpmWorkspace();
    const { deps, runCalls, sha } = stubDeps(ws.root, { exists: false });

    await executePublishNpmReleases(deps);

    const tag = `${ws.name}@${ws.version}`;

    expect(runCalls).toStrictEqual([{
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
    const { deps, runCalls } = stubDeps(root, { exists: false });

    await executePublishNpmReleases(deps);

    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]?.args.slice(0, 3)).toStrictEqual(['release', 'create', `v${version}`]);
  });

  it('uses the matching CHANGELOG.md section as the release notes', async ({ expect }) => {
    const ws = createNpmWorkspace();
    writeFileSync(
      path.join(ws.pkgDir, 'CHANGELOG.md'),
      `# pkg\n\n## ${ws.version}\n\n### Minor Changes\n\n- Added a thing\n\n## 0.0.1\n\n- old\n`,
    );
    const { deps, runCalls } = stubDeps(ws.root, { exists: false });

    await executePublishNpmReleases(deps);

    const args = runCalls[0]?.args ?? [];

    expect(args[args.indexOf('--notes') + 1]).toBe('### Minor Changes\n\n- Added a thing');
  });

  it('skips when the release already exists', async ({ expect }) => {
    const ws = createNpmWorkspace();
    const { deps, runCalls } = stubDeps(ws.root, { exists: true });

    await executePublishNpmReleases(deps);

    expect(runCalls).toHaveLength(0);
  });

  it('throws when the manifest is missing its package identity', async ({ expect }) => {
    const ws = createNpmWorkspace();
    writeJson(ws.pkgDir, 'package.json', {
      publishConfig: { directory: build.publishDirectory() },
      version: build.semverVersion(),
    });
    const { deps } = stubDeps(ws.root, { exists: false });

    await expect(executePublishNpmReleases(deps)).rejects.toThrow(/name or version/v);
  });

  it('no-ops when no package is published', async ({ expect }) => {
    const root = createTempDir();
    writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    writeJson(root, 'package.json', { name: build.packageName(), private: true });
    const captured = captureLogger();
    const { deps, runCalls } = stubDeps(root, { exists: false, logger: captured.logger });

    await executePublishNpmReleases(deps);

    expect(runCalls).toHaveLength(0);
    expect(captured.out()).toContain('no published npm packages');
  });
});
