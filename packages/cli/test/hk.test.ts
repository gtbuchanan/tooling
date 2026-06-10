import { describe, it } from 'vitest';
import {
  hkMode, planHkAll, planHkBase, resolveBaseRef,
} from '#src/commands/root/hk.js';

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
