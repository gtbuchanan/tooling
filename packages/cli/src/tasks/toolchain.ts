import type { SubCommandsDef } from 'citty';
import type { Capability } from '#src/core/capability.js';
import type { WorkspaceDiscovery } from '#src/core/discovery.js';
import { localeComparer } from '#src/core/sort.js';
import type { Leaf } from '#src/tasks/leaf.js';

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
 * One `gtb task` subcommand a toolchain contributes.
 */
export type Registration = CommandRegistration | LeafRegistration;

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

/**
 * Every leaf the toolchains register, in name order, which is the order each
 * aggregate lists its members in. Toolchain order would serve none of them:
 * one toolchain's leaves belong to different aggregates.
 */
export const toolchainLeaves = (toolchains: readonly Toolchain[]): readonly Leaf[] =>
  withdrawSuperseded(registrationsOf(toolchains)
    .flatMap(registration => ('leaf' in registration ? [registration.leaf] : [])))
    .toSorted((left, right) => localeComparer(left.name, right.name));

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

  return Object.fromEntries(registrationsOf(toolchains)
    .map((registration): readonly [string, TaskCommand] =>
      [registrationName(registration), registration.command])
    .toSorted(([left], [right]) => localeComparer(left, right)));
};
