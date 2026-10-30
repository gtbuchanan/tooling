import { describe, it } from 'vitest';
import { createTaskGraph, leafTasks } from '#src/tasks/graph.js';
import type { Leaf } from '#src/tasks/leaf.js';
import { makeCapabilities, makeDiscovery } from '#test/codegen/turbo-config.helpers.js';

const pklLeaf: Leaf = {
  appliesTo: pkg => pkg.hasPkl,
  name: 'check:pkl',
  task: () => ({ outputs: ['package'] }),
};

const eslintLeaf: Leaf = {
  appliesTo: pkg => pkg.hasEslint,
  name: 'lint:eslint',
  root: {
    appliesTo: discovery => discovery.root.hasEslint,
    task: () => ({ outputs: ['root'] }),
  },
  task: () => ({ outputs: ['package'] }),
};

const leaves = [pklLeaf, eslintLeaf];

describe.concurrent('createTaskGraph', () => {
  it('applies a leaf some package satisfies', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities(), makeCapabilities({ hasPkl: true })]);

    const graph = createTaskGraph(leaves, discovery);

    expect(graph.applies(pklLeaf.name)).toBe(true);
    expect(graph.applies(eslintLeaf.name)).toBe(false);
  });

  it('applies a leaf at a monorepo root its root variant satisfies', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities()], { hasEslint: true, isMonorepo: true });

    const graph = createTaskGraph(leaves, discovery);

    expect(graph.appliesAtRoot(eslintLeaf.name)).toBe(true);
    expect(graph.applies(eslintLeaf.name)).toBe(false);
  });

  it('applies no leaf at a single-package root', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities({ hasEslint: true })], { hasEslint: true });

    const graph = createTaskGraph(leaves, discovery);

    expect(graph.appliesAtRoot(eslintLeaf.name)).toBe(false);
  });

  it('applies a leaf without a root variant at no root', ({ expect }) => {
    const discovery = makeDiscovery([makeCapabilities()], { hasPkl: true, isMonorepo: true });

    const graph = createTaskGraph(leaves, discovery);

    expect(graph.appliesAtRoot(pklLeaf.name)).toBe(false);
  });

  it('rejects a name no leaf is registered as', ({ expect }) => {
    const graph = createTaskGraph(leaves, makeDiscovery([makeCapabilities()]));

    expect(() => graph.applies('lint:other')).toThrow('lint:other');
    expect(() => graph.appliesAtRoot('lint:other')).toThrow('lint:other');
  });
});

describe.concurrent('leafTasks', () => {
  it('keys package tasks by name and root tasks by their root key', ({ expect }) => {
    const discovery = makeDiscovery(
      [makeCapabilities({ hasEslint: true })],
      { hasEslint: true, isMonorepo: true },
    );

    const tasks = leafTasks(leaves, createTaskGraph(leaves, discovery));

    expect(tasks).toStrictEqual([
      ['lint:eslint', { outputs: ['package'] }],
      ['//#lint:eslint', { outputs: ['root'] }],
    ]);
  });
});
