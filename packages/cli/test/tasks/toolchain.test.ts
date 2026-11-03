import { defineCommand } from 'citty';
import { describe, it } from 'vitest';
import type { Capability } from '#src/core/capability.js';
import { discoverWorkspace } from '#src/core/discovery.js';
import type { Leaf } from '#src/tasks/leaf.js';
import {
  type CheckContext,
  type Toolchain,
  taskSubCommands,
  toolchainCapabilities,
  toolchainChecks,
  toolchainLeaves,
} from '#src/tasks/toolchain.js';
import { capabilities } from '#src/toolchains/index.js';
import { createTempDir, makePackage, writeJson } from '#test/helpers.js';

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

  it('withdraws a superseded leaf from the packages its superseder applies to', ({ expect }) => {
    const typescript = makeCapability('typescript');
    const tsdown = makeCapability('tsdown');
    const toolchains: readonly Toolchain[] = [
      {
        registrations: [{
          command: makeCommand('compile:ts'),
          leaf: { ...makeLeaf('compile:ts'), appliesTo: pkg => pkg.capabilities.has(typescript) },
        }],
      },
      {
        registrations: [{
          command: makeCommand('compile:tsdown'),
          leaf: {
            ...makeLeaf('compile:tsdown'),
            appliesTo: pkg => pkg.capabilities.has(tsdown),
            supersedes: ['compile:ts'],
          },
        }],
      },
    ];
    const plain = makePackage({ capabilities: new Set([typescript]) });
    const bundled = makePackage({ capabilities: new Set([tsdown, typescript]) });

    const compileTs = toolchainLeaves(toolchains).find(leaf => leaf.name === 'compile:ts');

    expect([plain, bundled].map(pkg => compileTs?.appliesTo(pkg))).toStrictEqual([true, false]);
  });

  /*
   * A misspelt name would otherwise supersede nothing, and the superseded leaf
   * would run beside its replacement.
   */
  it('rejects superseding a leaf no toolchain registers', ({ expect }) => {
    const toolchains: readonly Toolchain[] = [{
      registrations: [{
        command: makeCommand('compile:tsdown'),
        leaf: { ...makeLeaf('compile:tsdown'), supersedes: ['compile:tsc'] },
      }],
    }];

    expect(() => toolchainLeaves(toolchains)).toThrow(/compile:tsc/v);
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

const makeContext = (): CheckContext => {
  const root = createTempDir();
  writeJson(root, 'package.json', { name: 'root' });
  return { discovery: discoverWorkspace({ capabilities, cwd: root }) };
};

describe.concurrent(toolchainChecks, () => {
  it('reports every toolchain\'s messages, in registry order', ({ expect }) => {
    const context = makeContext();
    const toolchains: readonly Toolchain[] = [
      { checks: ({ discovery }) => [`npm: ${discovery.rootDir}`], registrations: [] },
      { registrations: [] },
      { checks: () => ['eslint: first', 'eslint: second'], registrations: [] },
    ];

    expect(toolchainChecks(toolchains, context)).toStrictEqual([
      `npm: ${context.discovery.rootDir}`,
      'eslint: first',
      'eslint: second',
    ]);
  });
});

const makeCapability = (name: string): Capability => ({ detect: () => true, name });

describe.concurrent(toolchainCapabilities, () => {
  it('collects every toolchain\'s capabilities, in registry order', ({ expect }) => {
    const first = makeCapability('first');
    const second = makeCapability('second');
    const third = makeCapability('third');
    const toolchains: readonly Toolchain[] = [
      { detects: [first, second], registrations: [] },
      { registrations: [] },
      { detects: [third], registrations: [] },
    ];

    expect(toolchainCapabilities(toolchains)).toStrictEqual([first, second, third]);
  });
});
