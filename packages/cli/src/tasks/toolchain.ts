import type { SubCommandsDef } from 'citty';
import type { Capability } from '#src/core/capability.js';
import type { WorkspaceDiscovery } from '#src/core/discovery.js';
import { localeComparer } from '#src/core/sort.js';
import type {
  Leaf, PublishingLeaf, Report, ReportKind,
} from '#src/tasks/leaf.js';

type TaskCommand = SubCommandsDef[string];

/**
 * A leaf, and the `gtb task` subcommand its script runs.
 */
export interface LeafRegistration {
  readonly command: TaskCommand;
  readonly leaf: Leaf;
}

/**
 * A `gtb task` subcommand no leaf runs: one a consumer invokes by hand, which
 * gets neither a script nor a turbo task.
 */
export interface CommandRegistration {
  readonly command: TaskCommand;
  readonly name: string;
}

/**
 * A publishing leaf, and the `gtb task` subcommand its script runs, built from
 * every report of the kind it publishes.
 */
export interface PublishingRegistration {
  readonly commandFor: (reports: readonly Report[]) => TaskCommand;
  readonly leaf: PublishingLeaf;
}

/**
 * One `gtb task` subcommand a toolchain contributes.
 */
export type Registration = CommandRegistration | LeafRegistration | PublishingRegistration;

/**
 * What a toolchain's checks may read of the workspace.
 */
export interface CheckContext {
  readonly discovery: WorkspaceDiscovery;
}

/**
 * One toolchain: everything the CLI knows about a tool, held in the tool's own
 * module so adding one edits nothing central.
 */
export interface Toolchain {
  /**
   * What `gtb verify toolchains` reports for the toolchain: one message per
   * problem, empty where there is none.
   */
  readonly checks?: (context: CheckContext) => readonly string[];
  /**
   * What discovery looks for on the toolchain's behalf. Registered as the
   * whole of its `capabilities.ts` module, so a capability defined there
   * cannot be left out and silently never hold.
   */
  readonly detects?: readonly Capability[];
  readonly registrations: readonly Registration[];
}

/**
 * Every capability the toolchains declare, which is what discovery looks for.
 */
export const toolchainCapabilities = (
  toolchains: readonly Toolchain[],
): readonly Capability[] => toolchains.flatMap(({ detects }) => detects ?? []);

/**
 * Every toolchain's check messages, in registry order.
 */
export const toolchainChecks = (
  toolchains: readonly Toolchain[],
  context: CheckContext,
): readonly string[] => toolchains.flatMap(({ checks }) => checks?.(context) ?? []);

const registrationsOf = (toolchains: readonly Toolchain[]): readonly Registration[] =>
  toolchains.flatMap(toolchain => toolchain.registrations);

const registrationName = (registration: Registration): string =>
  'leaf' in registration ? registration.leaf.name : registration.name;

/*
 * Every leaf name reachable from `names` by following `supersedes`. A leaf
 * reaching its own name is in a cycle, and narrowing would withdraw each leaf
 * in it wherever they all apply.
 */
const supersededThrough = (
  leaves: readonly Leaf[],
  names: readonly string[],
  seen: ReadonlySet<string>,
): ReadonlySet<string> => {
  const unseen = names.filter(name => !seen.has(name));
  return unseen.length === 0
    ? seen
    : supersededThrough(
        leaves,
        unseen.flatMap(name => leaves.find(leaf => leaf.name === name)?.supersedes ?? []),
        new Set([...seen, ...unseen]),
      );
};

/*
 * Narrows each superseded leaf to the packages none of its superseders apply
 * to. Done here rather than in the superseded leaf's own `appliesTo`, which
 * would have to import every toolchain that replaces it.
 */
const withdrawSuperseded = (leaves: readonly Leaf[]): readonly Leaf[] => {
  const unknown = leaves
    .flatMap(leaf => leaf.supersedes ?? [])
    .filter(name => leaves.every(leaf => leaf.name !== name));
  if (unknown.length > 0) {
    throw new Error(`No leaf to supersede is registered as '${unknown.join('\', \'')}'`);
  }
  const cyclic = leaves
    .filter(leaf => supersededThrough(leaves, leaf.supersedes ?? [], new Set()).has(leaf.name))
    .map(leaf => leaf.name);
  if (cyclic.length > 0) {
    throw new Error(`Leaves supersede themselves through a cycle: '${cyclic.join('\', \'')}'`);
  }

  return leaves.map((leaf): Leaf => {
    const superseders = leaves.filter(other => other.supersedes?.includes(leaf.name) ?? false);

    return superseders.length === 0
      ? leaf
      : {
          ...leaf,
          appliesTo: pkg =>
            leaf.appliesTo(pkg) && superseders.every(superseder => !superseder.appliesTo(pkg)),
        };
  });
};

/*
 * The leaves registered with a command of their own, in name order: every leaf
 * but the publishing ones, which are derived from these.
 */
const declaringLeaves = (toolchains: readonly Toolchain[]): readonly Leaf[] =>
  registrationsOf(toolchains)
    .flatMap(registration =>
      ('commandFor' in registration || !('leaf' in registration) ? [] : [registration.leaf]))
    .toSorted((left, right) => localeComparer(left.name, right.name));

const reportsOf = (leaves: readonly Leaf[], kind: ReportKind): readonly Report[] =>
  leaves.flatMap(leaf => (leaf.reports ?? []).filter(report => report.kind === kind));

const publishingLeaf = (
  { publishes, ...leaf }: PublishingLeaf,
  declaring: readonly Leaf[],
): Leaf => {
  const sources = declaring.filter(candidate => reportsOf([candidate], publishes).length > 0);

  return { ...leaf, appliesTo: pkg => sources.some(source => source.appliesTo(pkg)) };
};

/**
 * Every leaf the toolchains register, in name order, which is the order each
 * aggregate lists its members in. Toolchain order would serve none of them:
 * one toolchain's leaves belong to different aggregates.
 */
export const toolchainLeaves = (toolchains: readonly Toolchain[]): readonly Leaf[] => {
  /*
   * Narrowed before the publishers are derived from them, so a publisher
   * withdraws wherever every leaf declaring its kind has been superseded.
   */
  const declaring = withdrawSuperseded(declaringLeaves(toolchains));
  const publishing = registrationsOf(toolchains).flatMap(registration =>
    ('commandFor' in registration ? [publishingLeaf(registration.leaf, declaring)] : []));

  return [...declaring, ...publishing]
    .toSorted((left, right) => localeComparer(left.name, right.name));
};

/**
 * Every report of one kind the toolchains' leaves declare, in leaf name order.
 */
export const toolchainReports = (
  toolchains: readonly Toolchain[],
  kind: ReportKind,
): readonly Report[] => reportsOf(declaringLeaves(toolchains), kind);

/**
 * The `gtb task` subcommands the toolchains register, keyed by name in name
 * order, which is the order `gtb task --help` lists them in. Two registrations
 * under one name throw: keyed into one object, the second would silently
 * replace the first.
 */
export const taskSubCommands = (toolchains: readonly Toolchain[]): SubCommandsDef => {
  const names = registrationsOf(toolchains).map(registrationName);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length > 0) {
    throw new Error(`More than one task is registered as '${duplicates.join('\', \'')}'`);
  }
  const declaring = declaringLeaves(toolchains);

  return Object.fromEntries(registrationsOf(toolchains)
    .map((registration): readonly [string, TaskCommand] => [
      registrationName(registration),
      'commandFor' in registration
        ? registration.commandFor(reportsOf(declaring, registration.leaf.publishes))
        : registration.command,
    ])
    .toSorted(([left], [right]) => localeComparer(left, right)));
};
