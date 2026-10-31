import path from 'node:path';
import { leaves } from '#src/codegen/leaves.js';
import { type TaskEntry, aggregateTasks } from '#src/codegen/turbo-aggregates.js';
import { toTurboGlobs } from '#src/codegen/turbo-globs.js';
import { type WorkspaceDiscovery, vendoredCli } from '#src/core/discovery.js';
import { toPosixRelative } from '#src/core/paths.js';
import { localeComparer } from '#src/core/sort.js';
import { createTaskGraph, leafTasks } from '#src/tasks/graph.js';
import type { TurboTask } from '#src/tasks/turbo-task.js';

/**
 * Generated turbo.json structure.
 */
export interface TurboJson {
  readonly $schema: string;
  /**
   * Always `false`. Left on, turbo rewrites a managed block into the root
   * `AGENTS.md` whenever it detects an AI agent, which surfaces as an
   * uncommitted change in every agent session.
   */
  readonly agentGuidance: false;
  /**
   * Files hashed into every task. Emitted only when discovery detects them.
   */
  readonly globalDependencies?: readonly string[];
  readonly tasks: Readonly<Record<string, TurboTask>>;
}

/*
 * Self-hosted packages run gtb from the CLI's source through a relative-path
 * script rather than a dependency, so no task edge reaches the CLI and an
 * edit to it would otherwise replay every other package's cached results.
 */
const vendoredCliSources = (discovery: WorkspaceDiscovery): readonly string[] => {
  const cli = vendoredCli(discovery);
  if (cli === undefined) {
    return [];
  }
  const rel = toPosixRelative(discovery.rootDir, cli.dir);
  return ['package.json', ...cli.buildIncludes.flatMap(toTurboGlobs)]
    .map(file => path.posix.join(rel, file));
};

/**
 * Every task the workspace declares: the leaf tasks applying in it, then the
 * aggregates over them.
 */
export const workspaceTasks = (discovery: WorkspaceDiscovery): readonly TaskEntry[] => {
  const graph = createTaskGraph(leaves, discovery);
  const leafEntries = leafTasks(leaves, graph);

  return [...leafEntries, ...aggregateTasks(graph, leafEntries)];
};

/**
 * Generates turbo.json from workspace discovery.
 */
export const generateTurboJson = (discovery: WorkspaceDiscovery): TurboJson => {
  /*
   * Self-hosted workspaces vendor tool-config packages (eslint-config,
   * vitest-config) internally. Turbo hashes internal dependencies by their
   * files only, so a lockfile-only bump to one of their plugins (e.g. an
   * eslint plugin pinned via the root catalog) never reaches sibling tasks
   * that consume the plugin without a task edge — CI then replays stale
   * passes. Salting the global hash with the lockfile closes that seam.
   * Consumers resolve those packages externally, where turbo's per-package
   * transitive closure already invalidates correctly, so they keep
   * granular caching.
   */
  const globalDependencies = [
    ...(discovery.hasMise ? ['mise.lock', 'mise.toml'] : []),
    ...(discovery.isSelfHosted ? ['pnpm-lock.yaml', ...vendoredCliSources(discovery)] : []),
  ].toSorted(localeComparer);

  return {
    $schema: 'https://turbo.build/schema.json',
    agentGuidance: false,
    ...(globalDependencies.length > 0 && { globalDependencies }),
    tasks: Object.fromEntries(workspaceTasks(discovery)),
  };
};

export {
  forbiddenRootScripts,
  generatePackageScripts,
  generateRequiredRootScripts,
  generateRootScripts,
} from '#src/codegen/turbo-scripts.js';
