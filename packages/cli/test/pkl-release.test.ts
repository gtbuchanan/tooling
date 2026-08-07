import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import type { GithubReleaseDeps } from '#src/lib/github-release.js';
import { createLogger } from '#src/lib/logger.js';
import { executePublishPkl, planPklRelease } from '#src/lib/pkl-release.js';
import { captureLogger, createPklWorkspace, createTempDir, writeJson } from './helpers.ts';

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

/**
 * Builds injected deps; `exists` decides whether `gh release view` succeeds.
 */
const stubDeps = (
  cwd: string,
  options: { exists: boolean; logger?: GithubReleaseDeps['logger'] },
): Stub => {
  const runCalls: RunCall[] = [];
  const sha = faker.git.commitSha();

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

describe.concurrent(planPklRelease, () => {
  it('uses an unscoped <name>@<version> tag for a monorepo member', ({ expect }) => {
    const plan = planPklRelease('/repo/packages/hk-config', 'hk-config', '1.2.3', true);
    const assetDir = path.join('/repo/packages/hk-config', 'dist', 'packages', 'pkl');

    expect(plan.tag).toBe('hk-config@1.2.3');
    expect(plan.assets).toStrictEqual([
      path.join(assetDir, 'hk-config@1.2.3'),
      path.join(assetDir, 'hk-config@1.2.3.sha256'),
      path.join(assetDir, 'hk-config@1.2.3.zip'),
      path.join(assetDir, 'hk-config@1.2.3.zip.sha256'),
    ]);
  });

  it('uses a plain v<version> tag for a single-package repo', ({ expect }) => {
    const plan = planPklRelease('/repo', 'lib', '1.2.3', false);

    // Mirrors changesets' single-package tag; assets keep the <name>@<version> basename.
    expect(plan.tag).toBe('v1.2.3');
    expect(plan.assets[2]).toBe(path.join('/repo', 'dist', 'packages', 'pkl', 'lib@1.2.3.zip'));
  });
});

describe.concurrent(executePublishPkl, () => {
  it('creates a release tagging HEAD with the assets when none exists', async ({ expect }) => {
    const ws = createPklWorkspace();
    const { deps, runCalls, sha } = stubDeps(ws.root, { exists: false });

    await executePublishPkl(deps);

    const tag = `${ws.name}@${ws.version}`;

    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]?.command).toBe('gh');
    expect(runCalls[0]?.args.slice(0, 9)).toStrictEqual([
      'release', 'create', tag, '--target', sha, '--title', tag, '--notes', tag,
    ]);
    expect(runCalls[0]?.args).toContain(
      path.join(ws.pkgDir, 'dist', 'packages', 'pkl', `${tag}.zip`),
    );
  });

  it('publishes a single-package repo with a plain v<version> tag', async ({ expect }) => {
    const root = createTempDir();
    const version = build.semverVersion();
    const name = build.packageName();
    writeJson(root, 'package.json', { name: `@scope/${name}`, version });
    writeFileSync(path.join(root, 'Defaults.pkl'), 'module Defaults\n');
    writeFileSync(
      path.join(root, 'PklProject'),
      `amends "pkl:Project"\n\npackage {\n  name = "${name}"\n  version = "${version}"\n}\n`,
    );
    const { deps, runCalls } = stubDeps(root, { exists: false });

    await executePublishPkl(deps);

    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]?.args.slice(0, 3)).toStrictEqual(['release', 'create', `v${version}`]);
  });

  it('uses the matching CHANGELOG.md section as the release notes', async ({ expect }) => {
    const ws = createPklWorkspace();
    writeFileSync(
      path.join(ws.pkgDir, 'CHANGELOG.md'),
      `# pkg\n\n## ${ws.version}\n\n### Minor Changes\n\n- Added a thing\n\n## 0.0.1\n\n- old\n`,
    );
    const { deps, runCalls } = stubDeps(ws.root, { exists: false });

    await executePublishPkl(deps);

    const args = runCalls[0]?.args ?? [];

    expect(args[args.indexOf('--notes') + 1]).toBe('### Minor Changes\n\n- Added a thing');
  });

  it('skips when the release already exists', async ({ expect }) => {
    const ws = createPklWorkspace();
    const { deps, runCalls } = stubDeps(ws.root, { exists: true });

    await executePublishPkl(deps);

    expect(runCalls).toHaveLength(0);
  });

  it('throws when the PklProject is missing its package identity', async ({ expect }) => {
    const ws = createPklWorkspace();
    writeFileSync(
      path.join(ws.pkgDir, 'PklProject'),
      'amends "pkl:Project"\n\npackage {\n  version = "1.0.0"\n}\n',
    );
    const { deps } = stubDeps(ws.root, { exists: false });

    await expect(executePublishPkl(deps)).rejects.toThrow(/package\.name or package\.version/v);
  });

  it('no-ops when there are no Pkl packages', async ({ expect }) => {
    const root = createTempDir();
    writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    writeJson(root, 'package.json', { name: build.packageName(), private: true });
    const captured = captureLogger();
    const { deps, runCalls } = stubDeps(root, { exists: false, logger: captured.logger });

    await executePublishPkl(deps);

    expect(runCalls).toHaveLength(0);
    expect(captured.out()).toContain('no Pkl packages to publish');
  });
});
