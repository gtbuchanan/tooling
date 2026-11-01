import { defineCommand } from 'citty';
import { describe, it } from 'vitest';
import type { Leaf } from '#src/tasks/leaf.js';
import { type Toolchain, taskSubCommands, toolchainLeaves } from '#src/tasks/toolchain.js';

const makeLeaf = (name: string): Leaf => ({
  appliesTo: () => true,
  name,
  task: () => ({}),
});

const makeCommand = (name: string) => defineCommand({ meta: { name } });

describe.concurrent(toolchainLeaves, () => {
  /*
   * A toolchain's leaves belong to different aggregates, so toolchain order is
   * no use to any of them: each aggregate lists its members in leaf name order.
   */
  it('lists every toolchain\'s leaves in name order', ({ expect }) => {
    const toolchains: readonly Toolchain[] = [
      {
        registrations: [
          { command: makeCommand('typecheck:ts'), leaf: makeLeaf('typecheck:ts') },
          { command: makeCommand('compile:ts'), leaf: makeLeaf('compile:ts') },
        ],
      },
      { registrations: [{ command: makeCommand('lint:eslint'), leaf: makeLeaf('lint:eslint') }] },
    ];

    expect(toolchainLeaves(toolchains).map(leaf => leaf.name))
      .toStrictEqual(['compile:ts', 'lint:eslint', 'typecheck:ts']);
  });

  it('leaves out a command no leaf runs', ({ expect }) => {
    const toolchains: readonly Toolchain[] = [{
      registrations: [
        { command: makeCommand('test:vitest'), name: 'test:vitest' },
        { command: makeCommand('test:vitest:fast'), leaf: makeLeaf('test:vitest:fast') },
      ],
    }];

    expect(toolchainLeaves(toolchains).map(leaf => leaf.name))
      .toStrictEqual(['test:vitest:fast']);
  });
});

describe.concurrent(taskSubCommands, () => {
  it('keys each command by its leaf\'s name, or by its own', ({ expect }) => {
    const fast = makeCommand('test:vitest:fast');
    const all = makeCommand('test:vitest');
    const toolchains: readonly Toolchain[] = [{
      registrations: [
        { command: fast, leaf: makeLeaf('test:vitest:fast') },
        { command: all, name: 'test:vitest' },
      ],
    }];

    expect(taskSubCommands(toolchains))
      .toStrictEqual({ 'test:vitest': all, 'test:vitest:fast': fast });
  });

  // `gtb task --help` lists the subcommands in key order.
  it('lists the subcommands in name order', ({ expect }) => {
    const toolchains: readonly Toolchain[] = [
      { registrations: [{ command: makeCommand('typecheck:ts'), leaf: makeLeaf('typecheck:ts') }] },
      { registrations: [{ command: makeCommand('compile:ts'), leaf: makeLeaf('compile:ts') }] },
    ];

    expect(Object.keys(taskSubCommands(toolchains))).toStrictEqual(['compile:ts', 'typecheck:ts']);
  });

  /*
   * Keyed into one object, a second registration under a taken name would
   * silently replace the first, leaving its leaf's script running another
   * toolchain's command.
   */
  it('rejects two registrations under one name', ({ expect }) => {
    const toolchains: readonly Toolchain[] = [
      { registrations: [{ command: makeCommand('lint:eslint'), leaf: makeLeaf('lint:eslint') }] },
      { registrations: [{ command: makeCommand('lint:eslint'), name: 'lint:eslint' }] },
    ];

    expect(() => taskSubCommands(toolchains)).toThrow(/lint:eslint/v);
  });
});
