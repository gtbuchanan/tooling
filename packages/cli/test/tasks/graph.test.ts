import { describe, it } from 'vitest';
import { createTaskGraph, leafTasks } from '#src/tasks/graph.js';
import type { Leaf } from '#src/tasks/leaf.js';
import { eslint } from '#src/toolchains/eslint/capabilities.js';
import { pklSource } from '#src/toolchains/pkl/capabilities.js';
import { skills } from '#src/toolchains/skills/capabilities.js';
import { makeDiscovery, makePackage } from '#test/helpers.js';

const pklLeaf: Leaf = {
  aggregate: 'typecheck',
  appliesTo: pkg => pkg.capabilities.has(pklSource),
  name: 'check:pkl',
  task: () => ({ outputs: ['package'] }),
};

const eslintLeaf: Leaf = {
  aggregate: 'lint',
  appliesTo: pkg => pkg.capabilities.has(eslint),
  name: 'lint:eslint',
  root: {
    appliesTo: discovery => discovery.root.capabilities.has(eslint),
    task: () => ({ outputs: ['root'] }),
  },
  task: () => ({ outputs: ['package'] }),
};

const skillsLeaf: Leaf = {
  aggregate: 'lint',
  appliesTo: pkg => pkg.capabilities.has(skills),
  name: 'lint:skills',
  task: () => ({}),
};

const leaves = [pklLeaf, eslintLeaf, skillsLeaf];

describe.concurrent('createTaskGraph', () => {
  it('applies a leaf some package satisfies', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage(),
      makePackage({ capabilities: new Set([pklSource]) }),
    ]);

    const graph = createTaskGraph(leaves, discovery);

    expect(graph.applies(pklLeaf.name)).toBe(true);
    expect(graph.applies(eslintLeaf.name)).toBe(false);
  });

  it('applies a leaf at a monorepo root its root variant satisfies', ({ expect }) => {
    const discovery = makeDiscovery(
      [makePackage()],
      { capabilities: new Set([eslint]), isMonorepo: true },
    );

    const graph = createTaskGraph(leaves, discovery);

    expect(graph.appliesAtRoot(eslintLeaf.name)).toBe(true);
    expect(graph.applies(eslintLeaf.name)).toBe(false);
  });

  it('applies no leaf at a single-package root', ({ expect }) => {
    const discovery = makeDiscovery(
      [makePackage({ capabilities: new Set([eslint]) })],
      { capabilities: new Set([eslint]) },
    );

    const graph = createTaskGraph(leaves, discovery);

    expect(graph.appliesAtRoot(eslintLeaf.name)).toBe(false);
  });

  it('applies a leaf without a root variant at no root', ({ expect }) => {
    const discovery = makeDiscovery(
      [makePackage()],
      { capabilities: new Set([pklSource]), isMonorepo: true },
    );

    const graph = createTaskGraph(leaves, discovery);

    expect(graph.appliesAtRoot(pklLeaf.name)).toBe(false);
  });

  it('rejects a name no leaf is registered as', ({ expect }) => {
    const graph = createTaskGraph(leaves, makeDiscovery([makePackage()]));

    expect(() => graph.applies('lint:other')).toThrow('lint:other');
    expect(() => graph.appliesAtRoot('lint:other')).toThrow('lint:other');
  });
});

describe.concurrent('createTaskGraph membersOf', () => {
  it('lists root tasks first, then package tasks, each in registry order', ({ expect }) => {
    const discovery = makeDiscovery(
      [
        makePackage({ capabilities: new Set([eslint]) }),
        makePackage({ capabilities: new Set([skills]) }),
      ],
      { capabilities: new Set([eslint]), isMonorepo: true },
    );

    const graph = createTaskGraph(leaves, discovery);

    expect(graph.membersOf('lint')).toStrictEqual(['//#lint:eslint', 'lint:eslint', 'lint:skills']);
  });

  it('leaves out members that apply nowhere', ({ expect }) => {
    const discovery = makeDiscovery([
      makePackage({ capabilities: new Set([pklSource, skills]) }),
    ]);

    const graph = createTaskGraph(leaves, discovery);

    expect(graph.membersOf('lint')).toStrictEqual(['lint:skills']);
    expect(graph.membersOf('typecheck')).toStrictEqual(['check:pkl']);
    expect(graph.membersOf('pack')).toStrictEqual([]);
  });
});

describe.concurrent('leafTasks', () => {
  it('keys package tasks by name and root tasks by their root key', ({ expect }) => {
    const discovery = makeDiscovery(
      [makePackage({ capabilities: new Set([eslint]) })],
      { capabilities: new Set([eslint]), isMonorepo: true },
    );

    const tasks = leafTasks(leaves, createTaskGraph(leaves, discovery));

    expect(tasks).toStrictEqual([
      ['lint:eslint', { outputs: ['package'] }],
      ['//#lint:eslint', { outputs: ['root'] }],
    ]);
  });
});
