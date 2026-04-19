import { describe, it } from 'vitest';
import {
  type SchedulerInput, type TaskSchedule, resolveSchedule,
} from '#src/lib/task-graph.js';

/** Helper to create a minimal scheduler input for testing. */
const makeTurboJson = (
  tasks: SchedulerInput['tasks'],
): SchedulerInput => ({ tasks });

describe.concurrent(resolveSchedule, () => {
  it('returns single-level schedule for a leaf task with no dependencies', ({ expect }) => {
    const turbo = makeTurboJson({
      'typecheck:ts': { dependsOn: [], inputs: ['src/**'], outputs: [] },
    });

    const result = resolveSchedule('typecheck:ts', turbo);

    expect(result).toStrictEqual([['typecheck:ts']]);
  });

  it('resolves a single dependency chain', ({ expect }) => {
    const turbo = makeTurboJson({
      'compile:ts': { dependsOn: ['^compile:ts'], inputs: ['src/**'], outputs: ['dist/**'] },
      'pack:npm': { dependsOn: ['compile:ts'], inputs: ['dist/**'], outputs: ['dist/npm/**'] },
    });

    const result = resolveSchedule('pack:npm', turbo);

    expect(result).toStrictEqual([['compile:ts'], ['pack:npm']]);
  });

  it('skips aggregate (transit) tasks', ({ expect }) => {
    const turbo = makeTurboJson({
      'check': { dependsOn: ['typecheck'] },
      'typecheck': { dependsOn: ['typecheck:ts'] },
      'typecheck:ts': { dependsOn: [], inputs: ['src/**'], outputs: [] },
    });

    const result = resolveSchedule('check', turbo);

    expect(result).toStrictEqual([['typecheck:ts']]);
  });

  it('groups independent tasks into the same level', ({ expect }) => {
    const turbo = makeTurboJson({
      'check': { dependsOn: ['typecheck:ts', 'compile:ts'] },
      'compile:ts': { dependsOn: [], inputs: ['src/**'], outputs: ['dist/**'] },
      'typecheck:ts': { dependsOn: [], inputs: ['src/**'], outputs: [] },
    });

    const result = resolveSchedule('check', turbo);

    expect(result).toStrictEqual([['compile:ts', 'typecheck:ts']]);
  });

  it('handles deep aggregate chains', ({ expect }) => {
    const turbo = makeTurboJson({
      'build': { dependsOn: ['check', 'pack'] },
      'check': { dependsOn: ['typecheck', 'lint'] },
      'compile:ts': { dependsOn: [], inputs: ['src/**'], outputs: ['dist/**'] },
      'lint': { dependsOn: ['lint:eslint'] },
      'lint:eslint': { dependsOn: ['typecheck:ts'], inputs: ['src/**'], outputs: [] },
      'pack': { dependsOn: ['pack:npm'] },
      'pack:npm': {
        dependsOn: ['compile:ts'],
        inputs: ['dist/**'],
        outputs: ['dist/npm/**'],
      },
      'typecheck': { dependsOn: ['typecheck:ts'] },
      'typecheck:ts': { dependsOn: [], inputs: ['src/**'], outputs: [] },
    });

    const result = resolveSchedule('build', turbo);

    expect(result).toStrictEqual([
      ['compile:ts', 'typecheck:ts'],
      ['lint:eslint', 'pack:npm'],
    ]);
  });

  it('strips ^ prefix from topological dependencies', ({ expect }) => {
    const turbo = makeTurboJson({
      'compile:ts': { dependsOn: [], inputs: ['src/**'], outputs: ['dist/**'] },
      'test:vitest:fast': {
        dependsOn: ['^compile:ts'],
        env: ['CI'],
        inputs: ['test/**'],
        outputs: [],
      },
    });

    const result = resolveSchedule('test:vitest:fast', turbo);

    expect(result).toStrictEqual([['compile:ts'], ['test:vitest:fast']]);
  });

  it('throws on cycle', ({ expect }) => {
    const turbo = makeTurboJson({
      'task-a': { dependsOn: ['task-b'], inputs: ['src/**'], outputs: [] },
      'task-b': { dependsOn: ['task-a'], inputs: ['src/**'], outputs: [] },
    });

    expect(() => resolveSchedule('task-a', turbo)).toThrow(/cycle/iv);
  });

  it('resolves the real turbo.json check task correctly', ({ expect }) => {
    const turbo = makeTurboJson({
      'check': { dependsOn: ['typecheck', 'lint', 'test:vitest:fast'] },
      'compile:ts': {
        dependsOn: ['^compile:ts'],
        inputs: ['src/**'],
        outputs: ['dist/source/**'],
      },
      'lint': { dependsOn: ['lint:eslint'] },
      'lint:eslint': {
        dependsOn: ['typecheck:ts'],
        inputs: ['src/**'],
        outputs: ['dist/.eslintcache'],
      },
      'test:vitest:fast': {
        dependsOn: ['^compile:ts'],
        env: ['CI'],
        inputs: ['test/**'],
        outputs: ['dist/coverage/**'],
      },
      'typecheck': { dependsOn: ['typecheck:ts'] },
      'typecheck:ts': { dependsOn: [], inputs: ['src/**'], outputs: [] },
    });

    const result = resolveSchedule('check', turbo);

    expect(result).toStrictEqual([
      ['compile:ts', 'typecheck:ts'],
      ['lint:eslint', 'test:vitest:fast'],
    ]);
  });

  it('resolves the real turbo.json build task correctly', ({ expect }) => {
    const turbo = makeTurboJson({
      'build': {
        dependsOn: ['check', 'compile', 'pack', 'test:slow', 'test:e2e'],
      },
      'check': { dependsOn: ['typecheck', 'lint', 'test:vitest:fast'] },
      'compile': { dependsOn: ['compile:ts'] },
      'compile:ts': {
        dependsOn: ['^compile:ts'],
        inputs: ['src/**'],
        outputs: ['dist/source/**'],
      },
      'lint': { dependsOn: ['lint:eslint'] },
      'lint:eslint': {
        dependsOn: ['typecheck:ts'],
        inputs: ['src/**'],
        outputs: ['dist/.eslintcache'],
      },
      'pack': { dependsOn: ['pack:npm'] },
      'pack:npm': {
        dependsOn: ['compile:ts'],
        inputs: ['dist/source/**'],
        outputs: ['dist/packages/npm/**'],
      },
      'test:e2e': { dependsOn: ['test:vitest:e2e'] },
      'test:slow': { dependsOn: ['test:vitest:slow'] },
      'test:vitest:e2e': {
        dependsOn: ['pack', '^pack'],
        env: ['CI'],
        inputs: ['e2e/**'],
        outputs: [],
      },
      'test:vitest:fast': {
        dependsOn: ['^compile:ts'],
        env: ['CI'],
        inputs: ['test/**'],
        outputs: ['dist/coverage/**'],
      },
      'test:vitest:slow': {
        dependsOn: ['^compile:ts'],
        env: ['CI'],
        inputs: ['test/**'],
        outputs: ['dist/coverage/**'],
      },
      'typecheck': { dependsOn: ['typecheck:ts'] },
      'typecheck:ts': { dependsOn: [], inputs: ['src/**'], outputs: [] },
    });

    const result = resolveSchedule('build', turbo);

    expect(result).toStrictEqual([
      ['compile:ts', 'typecheck:ts'],
      ['lint:eslint', 'pack:npm', 'test:vitest:fast', 'test:vitest:slow'],
      ['test:vitest:e2e'],
    ]);
  });

  it('returns empty schedule for unknown task', ({ expect }) => {
    const turbo = makeTurboJson({});

    const result = resolveSchedule('nonexistent', turbo);

    expect(result).toStrictEqual([]);
  });

  it('handles a leaf task that is also the root', ({ expect }) => {
    const turbo = makeTurboJson({
      'lint:eslint': {
        dependsOn: ['typecheck:ts'],
        inputs: ['src/**'],
        outputs: [],
      },
      'typecheck:ts': { dependsOn: [], inputs: ['src/**'], outputs: [] },
    });

    const result = resolveSchedule('lint:eslint', turbo);

    expect(result).toStrictEqual([['typecheck:ts'], ['lint:eslint']]);
  });

  it('deduplicates shared dependencies across branches', ({ expect }) => {
    const turbo = makeTurboJson({
      'root': { dependsOn: ['task-a', 'task-b'] },
      'shared': { dependsOn: [], inputs: ['src/**'], outputs: [] },
      'task-a': { dependsOn: ['shared'], inputs: ['src/**'], outputs: [] },
      'task-b': { dependsOn: ['shared'], inputs: ['src/**'], outputs: [] },
    });

    const result: TaskSchedule = resolveSchedule('root', turbo);

    expect(result).toStrictEqual([['shared'], ['task-a', 'task-b']]);
  });
});
