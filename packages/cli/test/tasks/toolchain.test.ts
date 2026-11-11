import path from 'node:path';
import { defineCommand } from 'citty';
import { describe, it, vi } from 'vitest';
import type { Capability } from '#src/core/capability.js';
import { discoverWorkspace } from '#src/core/discovery.js';
import type { Leaf, PublishingLeaf, Report } from '#src/tasks/leaf.js';
import {
  type Plan,
  type PlanContext,
  type PublishingRegistration,
  type Toolchain,
  planFindings,
  taskSubCommands,
  toolchainCapabilities,
  toolchainLeaves,
  toolchainPlans,
  toolchainReports,
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

  // Narrowed against itself, the leaf would silently apply nowhere.
  it('rejects a leaf superseding itself', ({ expect }) => {
    const toolchains: readonly Toolchain[] = [{
      registrations: [{
        command: makeCommand('compile:tsdown'),
        leaf: { ...makeLeaf('compile:tsdown'), supersedes: ['compile:tsdown'] },
      }],
    }];

    expect(() => toolchainLeaves(toolchains)).toThrow(/compile:tsdown/v);
  });

  // Each leaf in the cycle would be withdrawn wherever they all apply.
  it('rejects leaves superseding each other in a cycle', ({ expect }) => {
    const toolchains: readonly Toolchain[] = [{
      registrations: [
        {
          command: makeCommand('compile:a'),
          leaf: { ...makeLeaf('compile:a'), supersedes: ['compile:b'] },
        },
        {
          command: makeCommand('compile:b'),
          leaf: { ...makeLeaf('compile:b'), supersedes: ['compile:c'] },
        },
        {
          command: makeCommand('compile:c'),
          leaf: { ...makeLeaf('compile:c'), supersedes: ['compile:a'] },
        },
      ],
    }];

    expect(() => toolchainLeaves(toolchains)).toThrow(/compile:a.*compile:b.*compile:c/v);
  });
});

const fastCoverage: Report = { format: 'lcov', kind: 'coverage', path: 'coverage/fast/lcov.info' };
const slowCoverage: Report = { format: 'lcov', kind: 'coverage', path: 'coverage/slow/lcov.info' };
const slowResults: Report = { format: 'junit', kind: 'test-results', path: 'results/slow.xml' };

const reportingToolchains = (
  tests: Capability,
  commandFor: PublishingRegistration['commandFor'],
): readonly Toolchain[] => [
  {
    registrations: [
      {
        command: makeCommand('test:slow'),
        leaf: {
          ...makeLeaf('test:slow'),
          appliesTo: pkg => pkg.capabilities.has(tests),
          reports: [slowCoverage, slowResults],
        },
      },
      {
        command: makeCommand('test:fast'),
        leaf: {
          ...makeLeaf('test:fast'),
          appliesTo: pkg => pkg.capabilities.has(tests),
          reports: [fastCoverage],
        },
      },
      { command: makeCommand('lint:eslint'), leaf: makeLeaf('lint:eslint') },
    ],
  },
  {
    registrations: [{
      commandFor,
      leaf: { name: 'coverage:upload', publishes: 'coverage', task: () => ({}) },
    }],
  },
];

// The registry derives a publisher from other leaves' reports, never its own.
export const publisherWithReports: PublishingLeaf = {
  name: 'coverage:upload',
  publishes: 'coverage',
  // @ts-expect-error -- a publishing leaf declares no reports of its own
  reports: [fastCoverage],
  task: () => ({}),
};

describe.concurrent('publishing leaves', () => {
  it('applies a publishing leaf wherever a leaf declaring its kind applies', ({ expect }) => {
    const tests = makeCapability('tests');
    const tested = makePackage({ capabilities: new Set([tests]) });
    const untested = makePackage();

    const upload = toolchainLeaves(reportingToolchains(tests, () => makeCommand('upload')))
      .find(leaf => leaf.name === 'coverage:upload');

    expect([tested, untested].map(pkg => upload?.appliesTo(pkg))).toStrictEqual([true, false]);
  });

  it('withdraws a publishing leaf where its only source is superseded', ({ expect }) => {
    const tests = makeCapability('tests');
    const other = makeCapability('other');
    const toolchains: readonly Toolchain[] = [
      ...reportingToolchains(tests, () => makeCommand('upload')),
      {
        registrations: [{
          command: makeCommand('test:other'),
          leaf: {
            ...makeLeaf('test:other'),
            appliesTo: pkg => pkg.capabilities.has(other),
            supersedes: ['test:fast', 'test:slow'],
          },
        }],
      },
    ];
    const tested = makePackage({ capabilities: new Set([tests]) });
    const replaced = makePackage({ capabilities: new Set([other, tests]) });

    const upload = toolchainLeaves(toolchains).find(leaf => leaf.name === 'coverage:upload');

    expect([tested, replaced].map(pkg => upload?.appliesTo(pkg))).toStrictEqual([true, false]);
  });

  it('lists the reports of a kind in leaf name order', ({ expect }) => {
    const toolchains = reportingToolchains(makeCapability('tests'), () => makeCommand('upload'));

    expect(toolchainReports(toolchains, 'coverage')).toStrictEqual([fastCoverage, slowCoverage]);
  });

  it('leaves out the reports of another kind', ({ expect }) => {
    const toolchains = reportingToolchains(makeCapability('tests'), () => makeCommand('upload'));

    expect(toolchainReports(toolchains, 'test-results')).toStrictEqual([slowResults]);
  });

  it('builds a publishing command from the reports of its kind', ({ expect }) => {
    const upload = makeCommand('upload');
    const commandFor = vi.fn<PublishingRegistration['commandFor']>(() => upload);

    const commands = taskSubCommands(reportingToolchains(makeCapability('tests'), commandFor));

    expect(commandFor).toHaveBeenCalledWith([fastCoverage, slowCoverage]);
    expect(commands).toHaveProperty(['coverage:upload'], upload);
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

const makeContext = (): PlanContext => {
  const root = createTempDir();
  writeJson(root, 'package.json', { name: 'root' });
  return {
    discovery: discoverWorkspace({ capabilities, cwd: root }),
    force: false,
    ignored: new Set(),
  };
};

const firstPlan: Plan = () => [];
const secondPlan: Plan = () => [];

describe.concurrent(toolchainPlans, () => {
  it('collects every toolchain\'s plan, in registry order', ({ expect }) => {
    const toolchains: readonly Toolchain[] = [
      { plan: firstPlan, registrations: [] },
      { registrations: [] },
      { plan: secondPlan, registrations: [] },
    ];

    expect(toolchainPlans(toolchains)).toStrictEqual([firstPlan, secondPlan]);
  });
});

describe.concurrent(planFindings, () => {
  it('collects every plan\'s findings, in order', ({ expect }) => {
    const context = makeContext();
    const filePath = path.join(context.discovery.rootDir, 'first.json');
    const plans: readonly Plan[] = [
      ({ discovery }) => [{ kind: 'problem', message: `npm: ${discovery.rootDir}` }],
      () => [
        { changes: ['adds a'], content: 'a', kind: 'write', path: filePath },
        { kind: 'problem', message: 'eslint: second' },
      ],
    ];

    expect(planFindings(plans, context)).toStrictEqual([
      { kind: 'problem', message: `npm: ${context.discovery.rootDir}` },
      { changes: ['adds a'], content: 'a', kind: 'write', path: filePath },
      { kind: 'problem', message: 'eslint: second' },
    ]);
  });

  it('hands each plan the run\'s context', ({ expect }) => {
    const context = { ...makeContext(), force: true, ignored: new Set(['lint:eslint']) };
    const seen: PlanContext[] = [];
    const recording: Plan = (given) => {
      seen.push(given);
      return [];
    };

    planFindings([recording], context);

    expect(seen).toStrictEqual([context]);
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
