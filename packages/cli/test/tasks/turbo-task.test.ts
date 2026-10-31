import { describe, it } from 'vitest';
import { isRootTaskKey } from '#src/tasks/turbo-task.js';

describe.concurrent(isRootTaskKey, () => {
  it('recognizes a root task key', ({ expect }) => {
    expect(isRootTaskKey('//#lint:eslint')).toBe(true);
  });

  it('rejects a package task key', ({ expect }) => {
    expect(isRootTaskKey('lint:eslint')).toBe(false);
  });

  it('rejects a topological dependency', ({ expect }) => {
    expect(isRootTaskKey('^lint')).toBe(false);
  });
});
