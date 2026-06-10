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

/** Records run/capture calls; `captures` maps a git subcommand to its stdout. */
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
  it('runs --all and forces batching to stay under the cmd.exe limit', ({ expect }) => {
    const plan = planHkAll({ env: { CI: 'true' }, rawArgs: ['-S', 'eslint'] });

    expect(plan).toMatchObject({
      args: ['check', '--all', '-S', 'eslint'],
      bin: 'hk',
    });
    expect(plan.env['HK_BATCH']).toBe('1');
  });

  it('preserves the inherited env alongside HK_BATCH', ({ expect }) => {
    const plan = planHkAll({ env: { FOO: 'bar' }, rawArgs: [] });

    expect(plan.env).toMatchObject({ FOO: 'bar', HK_BATCH: '1' });
  });
});

describe.concurrent(planHkBase, () => {
  it('skips when no files changed', ({ expect }) => {
    expect(planHkBase({ files: [], mode: 'fix', rest: [] })).toStrictEqual({
      kind: 'skip',
    });
  });

  it('passes changed files after forwarded args', ({ expect }) => {
    expect(
      planHkBase({ files: ['a.ts', 'b.ts'], mode: 'check', rest: ['-S', 'eslint'] }),
    ).toStrictEqual({
      args: ['check', '-S', 'eslint', 'a.ts', 'b.ts'],
      bin: 'hk',
      kind: 'spawn',
    });
  });
});

describe.concurrent(executeHkAll, () => {
  it('runs hk --all with batching forced on', async ({ expect }) => {
    const { deps, runCalls } = stubDeps({}, { CI: 'true' });

    await executeHkAll(['-S', 'eslint'], deps);

    expect(runCalls).toHaveLength(1);
    expect(runCalls[0]).toMatchObject({
      args: ['check', '--all', '-S', 'eslint'],
      command: 'hk',
    });
    expect(runCalls[0]?.env?.['HK_BATCH']).toBe('1');
  });
});

describe.concurrent(executeHkBase, () => {
  it('fixes changed files without fetching on a full clone', async ({ expect }) => {
    const { deps, runCalls, captureCalls } = stubDeps({
      'diff': 'a.ts\nb.ts',
      'rev-parse': 'false',
    });

    await executeHkBase([], deps);

    expect(runCalls).toStrictEqual([
      { args: ['fix', 'a.ts', 'b.ts'], command: 'hk', env: undefined },
    ]);
    expect(captureCalls.some(args => args.includes('origin/main'))).toBe(true);
  });

  it('fetches the base ref first on a shallow clone', async ({ expect }) => {
    const { deps, runCalls } = stubDeps({ 'diff': 'a.ts', 'rev-parse': 'true' });

    await executeHkBase(['HEAD~2'], deps);

    expect(runCalls[0]).toMatchObject({
      args: ['fetch', '--no-tags', '--depth=1', 'origin', 'HEAD~2'],
      command: 'git',
    });
    expect(runCalls[1]).toMatchObject({ args: ['fix', 'a.ts'], command: 'hk' });
  });

  it('skips hk entirely when nothing changed', async ({ expect }) => {
    const { deps, runCalls } = stubDeps({ 'diff': '', 'rev-parse': 'false' });

    await executeHkBase([], deps);

    expect(runCalls).toHaveLength(0);
  });
});
