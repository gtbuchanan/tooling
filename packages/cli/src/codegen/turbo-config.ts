import path from 'node:path';
import { leaves } from '#src/codegen/leaves.js';
import { aggregateTasks } from '#src/codegen/turbo-aggregates.js';
import { toTurboGlobs } from '#src/codegen/turbo-globs.js';
import { type WorkspaceDiscovery, vendoredCli } from '#src/core/discovery.js';
import { toPosixRelative } from '#src/core/paths.js';
import { localeComparer } from '#src/core/sort.js';
import { createTaskGraph, leafTasks } from '#src/tasks/graph.js';
import type { TurboTask } from '#src/tasks/turbo-task.js';

/**
 * Turbo-only aggregate task names (no CLI handler).
 */
export const Aggregate = {
  build: 'build',
  buildCi: 'build:ci',
  check: 'check',
  compile: 'compile',
  coverageMerge: 'coverage:merge',
  generate: 'generate',
  lint: 'lint',
  pack: 'pack',
  testE2e: 'test:e2e',
  testSlow: 'test:slow',
  transit: 'transit',
  typecheck: 'typecheck',
} as const;

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

/**
 * Conditional entry for building records from flags.
 */
export interface ConditionalEntry<Value> {
  readonly condition: boolean;
  readonly key: string;
  readonly value: Value;
}

/**
 * Filters conditional entries and builds a record.
 */
export const collect = <Value>(
  entries: readonly ConditionalEntry<Value>[],
): Record<string, Value> =>
  Object.fromEntries(
    entries.filter(entry => entry.condition).map(entry => [entry.key, entry.value]),
  );

/**
 * Flags summarizing which tool categories are active across all packages.
 */
export interface ToolFlags {
  readonly hasCheck: boolean;
  readonly hasE2e: boolean;
  readonly hasEslint: boolean;
  readonly hasGenerate: boolean;
  readonly generateScripts: readonly string[];
  /**
   * Some package or a monorepo root lints, so the `lint` aggregate has a
   * member. The root counts on its own: without it a root-only ESLint config
   * generates `//#lint:eslint` that no aggregate runs.
   */
  readonly hasLint: boolean;
  /**
   * Some package produces a release artifact to pack — an npm-published
   * package or a Pkl package. The union a future kind (.NET, etc.) extends.
   */
  readonly hasPackable: boolean;
  /**
   * Some package has Pkl source (drives `typecheck:pkl`).
   */
  readonly hasPkl: boolean;
  /**
   * Some package is a publishable Pkl package (drives `pack:pkl`, publish).
   */
  readonly hasPklPackage: boolean;
  readonly hasPublished: boolean;
  /**
   * Some package both publishes and authors skills, which is the package
   * `compile:skills` runs in. Skills and publishing on different packages
   * leave the task with nothing to run.
   */
  readonly hasPublishedSkills: boolean;
  /**
   * Workspace root has its own ESLint config and is a monorepo (so root
   * is distinct from any package). Single-package repos lint root files
   * via the per-package task and don't need a separate root task.
   */
  readonly hasRootEslint: boolean;
  /**
   * Workspace root carries its own `skills/` and is a monorepo (so root is
   * distinct from any package). Skills that can't move into a package —
   * consumers that read `<root>/skills/<name>/SKILL.md` never see a
   * package's copy — stay at the root, which is otherwise invisible to
   * {@link hasSkills}. Single-package repos deploy root skills through the
   * per-package task and need no root task.
   */
  readonly hasRootSkills: boolean;
  /**
   * Workspace root has TypeScript of its own to check and is a monorepo (so
   * root is distinct from any package). Reads the root's
   * `hasTypeScriptSources` rather than its `hasTypeScript`: `gtb sync`
   * writes a root `tsconfig.json` unconditionally, so the latter is true at
   * every synced root, and a task gated on it would run tsc over a root with
   * nothing to check — TS18003, an error rather than a no-op.
   */
  readonly hasRootTypeScript: boolean;
  /**
   * Some *package* has authored skills. The root's own copy is
   * {@link hasRootSkills}: the per-package skills tasks (`compile:skills`,
   * `pack:npm`'s dep on it) publish skills inside a tarball, which the root
   * never does.
   */
  readonly hasSkills: boolean;
  readonly hasTypeScript: boolean;
  readonly hasVitest: boolean;
}

/**
 * Exported for script generation.
 * @internal
 */
export const resolveToolFlags = (discovery: WorkspaceDiscovery): ToolFlags => {
  const hasEslint = discovery.packages.some(pkg => pkg.hasEslint);
  const generateScripts = [...new Set(
    discovery.packages.flatMap(pkg => pkg.generateScripts),
  )].toSorted(localeComparer);
  const hasTypeScript = discovery.packages.some(pkg => pkg.hasTypeScript);
  const hasPkl = discovery.packages.some(pkg => pkg.hasPkl);
  const hasPklPackage = discovery.packages.some(pkg => pkg.hasPklPackage);
  const hasPublished = discovery.packages.some(pkg => pkg.isPublished);
  const hasVitest = discovery.packages.some(pkg => pkg.hasVitestTests);
  const hasRootEslint = discovery.isMonorepo && discovery.root.hasEslint;
  const hasRootTypeScript = discovery.isMonorepo && discovery.root.hasTypeScriptSources;
  const hasLint = hasEslint || hasRootEslint;

  return {
    generateScripts,
    hasCheck: hasTypeScript || hasLint || hasVitest || hasPkl || hasRootTypeScript,
    // Packages only: a monorepo root's e2e config has no script to run it.
    hasE2e: discovery.packages.some(pkg => pkg.hasVitestE2e),
    hasEslint,
    hasGenerate: generateScripts.length > 0,
    hasLint,
    hasPackable: hasPublished || hasPklPackage,
    hasPkl,
    hasPklPackage,
    hasPublished,
    hasPublishedSkills: discovery.packages.some(pkg => pkg.isPublished && pkg.hasSkills),
    hasRootEslint,
    hasRootSkills: discovery.isMonorepo && discovery.root.hasSkills,
    hasRootTypeScript,
    hasSkills: discovery.packages.some(pkg => pkg.hasSkills),
    hasTypeScript,
    hasVitest,
  };
};

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
 * Generates turbo.json from workspace discovery.
 */
export const generateTurboJson = (discovery: WorkspaceDiscovery): TurboJson => {
  const graph = createTaskGraph(leaves, discovery);
  const aggregates = collect(aggregateTasks(resolveToolFlags(discovery), discovery.isMonorepo));
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
    tasks: { ...Object.fromEntries(leafTasks(leaves, graph)), ...aggregates },
  };
};

export {
  forbiddenRootScripts,
  generatePackageScripts,
  generateRequiredRootScripts,
  generateRootScripts,
} from '#src/codegen/turbo-scripts.js';
