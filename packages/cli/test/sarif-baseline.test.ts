import { describe, it } from 'vitest';
import {
  executeSarifBaseline,
  executeSarifCompare,
  produceBaseline,
} from '#src/lib/sarif-compare.js';
import type { WorkspaceContext } from '#src/lib/workspace.js';
import { sarifLog, stubDeps } from './sarif-compare.stub.ts';

describe.concurrent(produceBaseline, () => {
  const headWorkspace: WorkspaceContext = {
    packageDirs: ['/repo/packages/a'],
    packageGlobs: ['packages/*'],
    rootDir: '/repo',
  };
  const baseWorkspace: WorkspaceContext = {
    packageDirs: ['/tmp/base/packages/a'],
    packageGlobs: ['packages/*'],
    rootDir: '/tmp/base',
  };
  const baseFiles = [
    '/tmp/base/dist/sarif/eslint.sarif',
    '/tmp/base/packages/a/dist/sarif/eslint.sarif',
  ];

  it('lints the merge base in a temp worktree and copies baselines', async ({
    expect,
  }) => {
    const { copyCalls, deps, removedPaths, runCalls, writeTextCalls } = stubDeps(
      headWorkspace, baseFiles, sarifLog([]), { baseWorkspace },
    );

    await produceBaseline('abc1234', deps);

    expect(runCalls.map(call => `${call.command} ${call.args[0] ?? ''}`)).toStrictEqual([
      'git worktree',
      'pnpm install',
      'pnpm exec',
      'git worktree',
    ]);
    expect(runCalls[0]?.args).toContain('abc1234');
    expect(removedPaths).toStrictEqual([
      '/repo/dist/sarif/base',
      '/repo/packages/a/dist/sarif/base',
    ]);
    expect(copyCalls).toStrictEqual([
      {
        destination: '/repo/dist/sarif/base/eslint.sarif',
        source: '/tmp/base/dist/sarif/eslint.sarif',
      },
      {
        destination: '/repo/packages/a/dist/sarif/base/eslint.sarif',
        source: '/tmp/base/packages/a/dist/sarif/eslint.sarif',
      },
    ]);
    expect(writeTextCalls).toStrictEqual([
      { content: 'abc1234\n', filePath: '/repo/dist/sarif/base.ref' },
    ]);
  });

  it('tolerates a failing base lint and copies what it wrote', async ({ expect }) => {
    const { copyCalls, deps, errors } = stubDeps(
      headWorkspace, baseFiles, sarifLog([]),
      { baseWorkspace, failing: ['pnpm exec'] },
    );

    await produceBaseline('abc1234', deps);

    expect(errors.some(line => line.includes('Base lint'))).toBe(true);
    expect(copyCalls).toHaveLength(2);
  });

  it('copies nothing when the base wrote no SARIF logs', async ({ expect }) => {
    const { copyCalls, deps } = stubDeps(
      headWorkspace, [], sarifLog([]), { baseWorkspace },
    );

    await produceBaseline('abc1234', deps);

    expect(copyCalls).toHaveLength(0);
  });

  it('removes the worktree when the base install fails', async ({ expect }) => {
    const { deps, runCalls, writeTextCalls } = stubDeps(
      headWorkspace, baseFiles, sarifLog([]),
      { baseWorkspace, failing: ['pnpm install'] },
    );

    await expect(produceBaseline('abc1234', deps)).rejects.toThrow(
      /pnpm install failed/v,
    );
    expect(runCalls.at(-1)?.args).toStrictEqual([
      'worktree', 'remove', '--force', '/tmp/base',
    ]);
    expect(writeTextCalls).toHaveLength(0);
  });
});

describe.concurrent(executeSarifBaseline, () => {
  const workspace: WorkspaceContext = {
    packageDirs: ['/repo/packages/a'],
    packageGlobs: ['packages/*'],
    rootDir: '/repo',
  };

  it('copies current SARIF logs to baselines and stamps HEAD', async ({
    expect,
  }) => {
    const files = [
      '/repo/dist/sarif/eslint.sarif',
      '/repo/packages/a/dist/sarif/eslint.sarif',
    ];
    const { copyCalls, deps, writeTextCalls } = stubDeps(workspace, files, sarifLog([]));

    await executeSarifBaseline(deps);

    expect(copyCalls).toStrictEqual([
      {
        destination: '/repo/dist/sarif/base/eslint.sarif',
        source: '/repo/dist/sarif/eslint.sarif',
      },
      {
        destination: '/repo/packages/a/dist/sarif/base/eslint.sarif',
        source: '/repo/packages/a/dist/sarif/eslint.sarif',
      },
    ]);
    expect(writeTextCalls).toStrictEqual([
      { content: 'abc1234\n', filePath: '/repo/dist/sarif/base.ref' },
    ]);
  });

  it('spawns nothing: seeding is pure file copying', async ({ expect }) => {
    const { deps, runCalls } = stubDeps(
      workspace,
      ['/repo/dist/sarif/eslint.sarif'],
      sarifLog([]),
    );

    await executeSarifBaseline(deps);

    expect(runCalls).toHaveLength(0);
  });
});

describe.concurrent('executeSarifCompare --base', () => {
  const workspace: WorkspaceContext = {
    packageDirs: [],
    packageGlobs: [],
    rootDir: '/repo',
  };
  const stampedFiles = [
    '/repo/dist/sarif/base.ref',
    '/repo/dist/sarif/base/eslint.sarif',
    '/repo/dist/sarif/eslint.sarif',
  ];

  it('reuses on-disk baselines when the stamp matches the merge base', async ({
    expect,
  }) => {
    const { deps, infos, runCalls } = stubDeps(
      workspace, stampedFiles, sarifLog([]),
      { readTextContent: 'abc1234\n' },
    );

    await executeSarifCompare({ baseRef: 'origin/main' }, deps);

    expect(infos.some(line => line.includes('already present'))).toBe(true);
    expect(runCalls.map(call => call.command)).toStrictEqual(['sarif-multitool']);
  });

  it('produces the baseline when the stamp records another merge base', async ({
    expect,
  }) => {
    const { deps, runCalls } = stubDeps(
      workspace, stampedFiles, sarifLog([]),
      { readTextContent: 'other999\n' },
    );

    await executeSarifCompare({ baseRef: 'origin/main' }, deps);

    expect(runCalls[0]).toMatchObject({ command: 'git' });
    expect(runCalls[0]?.args.slice(0, 2)).toStrictEqual(['worktree', 'add']);
  });

  it('produces the baseline when no stamp exists', async ({ expect }) => {
    const { deps, runCalls } = stubDeps(
      workspace,
      ['/repo/dist/sarif/eslint.sarif', '/repo/dist/sarif/base/eslint.sarif'],
      sarifLog([]),
    );

    await executeSarifCompare({ baseRef: 'origin/main' }, deps);

    expect(runCalls[0]?.args.slice(0, 2)).toStrictEqual(['worktree', 'add']);
  });

  it('uses an exact commit from --base-sha without merge-base resolution', async ({
    expect,
  }) => {
    const { deps, runCalls } = stubDeps(
      workspace, stampedFiles, sarifLog([]),
      { readTextContent: 'fedc987\n' },
    );

    await executeSarifCompare({ baseSha: 'fedc987' }, deps);

    // Stamp matches the given SHA, so no git commands run at all.
    expect(runCalls.map(call => call.command)).toStrictEqual(['sarif-multitool']);
  });

  it('rejects when --base and --base-sha are both given', async ({ expect }) => {
    const { deps } = stubDeps(workspace, stampedFiles, sarifLog([]));

    await expect(
      executeSarifCompare({ baseRef: 'origin/main', baseSha: 'fedc987' }, deps),
    ).rejects.toThrow(/mutually exclusive/v);
  });

  it('fetches the baseline commit when absent from a shallow clone', async ({
    expect,
  }) => {
    const { deps, runCalls } = stubDeps(
      workspace,
      ['/repo/dist/sarif/eslint.sarif', '/repo/dist/sarif/base/eslint.sarif'],
      sarifLog([]),
      { failingCapture: ['cat-file -e'] },
    );

    await executeSarifCompare({ baseSha: 'fedc987' }, deps);

    expect(runCalls[0]).toMatchObject({
      args: ['fetch', '--depth=1', 'origin', 'fedc987'],
      command: 'git',
    });
    expect(runCalls[1]?.args.slice(0, 2)).toStrictEqual(['worktree', 'add']);
  });
});
