import { describe, it } from 'vitest';
import {
  type HkRunnerDeps,
  executeHkAll,
  executeHkBase,
  hkMode,
  planHkAll,
  planHkBase,
  resolveBaseRef,
} from '#src/commands/root/hk.js';

interface RunCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: NodeJS.ProcessEnv | undefined;
}

interface StubDeps {
  readonly deps: HkRunnerDeps;
  readonly runCalls: readonly RunCall[];
  readonly captureCalls: readonly (readonly string[])[];
}

/** Records run/capture calls; `captures` maps a Git subcommand to its stdout. */
const stubDeps = (
  captures: Record<string, string>,
  env: NodeJS.ProcessEnv = {},
): StubDeps => {
  const runCalls: RunCall[] = [];
  const captureCalls: (readonly string[])[] = [];
  return {
    captureCalls,
    deps: {
      capture: (_command, args) => {
        captureCalls.push(args);
        return Promise.resolve(captures[args[0] ?? ''] ?? '');
      },
      env,
      run: (command, options) => {
        runCalls.push({ args: options?.args ?? [], command, env: options?.env });
        return Promise.resolve();
      },
    },
    runCalls,
  };
};

describe.concurrent(resolveBaseRef, () => {
  it('treats the first non-flag arg as the base ref', ({ expect }) => {
    expect(resolveBaseRef(['HEAD~3', '-S', 'eslint'])).toStrictEqual({
      base: 'HEAD~3',
      rest: ['-S', 'eslint'],
    });
  });

  it('defaults to origin/main when the first arg is a flag', ({ expect }) => {
    expect(resolveBaseRef(['-S', 'eslint'])).toStrictEqual({
      base: 'origin/main',
      rest: ['-S', 'eslint'],
    });
  });

  it('defaults to origin/main when no args are given', ({ expect }) => {
    expect(resolveBaseRef([])).toStrictEqual({ base: 'origin/main', rest: [] });
  });
});

describe.concurrent(hkMode, () => {
  it('checks (non-modifying) when CI is set', ({ expect }) => {
    expect(hkMode({ CI: 'true' })).toBe('check');
  });

  it('fixes locally when CI is unset', ({ expect }) => {
    expect(hkMode({})).toBe('fix');
  });

  it('fixes locally when CI is empty', ({ expect }) => {
    expect(hkMode({ CI: '' })).toBe('fix');
  });
});

describe.concurrent(planHkAll, () => {
  it('runs the mode against --all with forwarded args', ({ expect }) => {
    expect(planHkAll({ env: { CI: 'true' }, rawArgs: ['-S', 'eslint'] })).toStrictEqual({
      args: ['check', '--all', '-S', 'eslint'],
      bin: 'hk',
    });
  });
});

describe.concurrent(planHkBase, () => {
  it('diffs the base ref against HEAD', ({ expect }) => {
    expect(planHkBase({ base: 'origin/main', mode: 'fix', rest: [] })).toStrictEqual({
      args: ['fix', '--from-ref=origin/main', '--to-ref=HEAD'],
      bin: 'hk',
    });
  });

  it('forwards passthrough args after the ref range', ({ expect }) => {
    expect(
      planHkBase({ base: 'HEAD~3', mode: 'check', rest: ['-S', 'eslint'] }),
    ).toStrictEqual({
      args: ['check', '--from-ref=HEAD~3', '--to-ref=HEAD', '-S', 'eslint'],
      bin: 'hk',
    });
  });
});

describe.concurrent(executeHkAll, () => {
  it('runs hk --all in the resolved mode', async ({ expect }) => {
    const { deps, runCalls } = stubDeps({}, { CI: 'true' });

    await executeHkAll(['-S', 'eslint'], deps);

    expect(runCalls).toStrictEqual([
      { args: ['check', '--all', '-S', 'eslint'], command: 'hk', env: undefined },
    ]);
  });
});

describe.concurrent(executeHkBase, () => {
  it('diffs the base against HEAD without fetching on a full clone', async ({ expect }) => {
    const { deps, runCalls } = stubDeps({ 'rev-parse': 'false' });

    await executeHkBase([], deps);

    expect(runCalls).toStrictEqual([
      {
        args: ['fix', '--from-ref=origin/main', '--to-ref=HEAD'],
        command: 'hk',
        env: undefined,
      },
    ]);
  });

  it('fetches the base ref first on a shallow clone', async ({ expect }) => {
    const { deps, runCalls } = stubDeps({ 'rev-parse': 'true' }, { CI: 'true' });

    await executeHkBase(['HEAD~2', '-S', 'eslint'], deps);

    expect(runCalls[0]).toMatchObject({
      args: ['fetch', '--no-tags', '--depth=1', 'origin', 'HEAD~2'],
      command: 'git',
    });
    expect(runCalls[1]).toMatchObject({
      args: ['check', '--from-ref=HEAD~2', '--to-ref=HEAD', '-S', 'eslint'],
      command: 'hk',
    });
  });

  it('derives the remote and branch from a remote-tracking base ref', async ({
    expect,
  }) => {
    const { deps, runCalls } = stubDeps({ 'remote': 'origin', 'rev-parse': 'true' });

    await executeHkBase([], deps);

    expect(runCalls[0]).toMatchObject({
      args: ['fetch', '--no-tags', '--depth=1', 'origin', 'main'],
      command: 'git',
    });
    expect(runCalls[1]).toMatchObject({
      args: ['fix', '--from-ref=origin/main', '--to-ref=HEAD'],
      command: 'hk',
    });
  });

  it('fetches a configured non-origin remote, keeping nested branches', async ({
    expect,
  }) => {
    const { deps, runCalls } = stubDeps({ 'remote': 'origin\nupstream', 'rev-parse': 'true' });

    await executeHkBase(['upstream/release/v2'], deps);

    expect(runCalls[0]).toMatchObject({
      args: ['fetch', '--no-tags', '--depth=1', 'upstream', 'release/v2'],
      command: 'git',
    });
  });

  it('treats a slashed base whose prefix is not a remote as a branch on origin', async ({
    expect,
  }) => {
    const { deps, runCalls } = stubDeps({ 'remote': 'origin', 'rev-parse': 'true' });

    await executeHkBase(['feat/name'], deps);

    expect(runCalls[0]).toMatchObject({
      args: ['fetch', '--no-tags', '--depth=1', 'origin', 'feat/name'],
      command: 'git',
    });
  });
});
