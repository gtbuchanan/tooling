import { existsSync } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import type { PackageCapabilities, WorkspaceDiscovery } from '../core/discovery.ts';
import { readJsonFile } from '../core/file-writer.ts';
import { StringArray, UnknownRecord } from '../core/schemas.ts';
import { Aggregate, topo } from './turbo-config.ts';

/**
 * Package configuration (`packages/<pkg>/turbo.json`) as far as the
 * generate wiring is concerned. Loose so unrelated keys pass through.
 */
const PackageConfigSchema = v.looseObject({
  extends: v.optional(StringArray),
  tasks: v.optional(UnknownRecord),
});

const TaskSchema = v.looseObject({
  cache: v.optional(v.boolean()),
  dependsOn: v.optional(StringArray),
  extends: v.optional(v.boolean()),
  outputs: v.optional(StringArray),
});

type PackageConfig = v.InferOutput<typeof PackageConfigSchema>;

const readPackageConfig = (filePath: string): PackageConfig | undefined => {
  try {
    return v.parse(PackageConfigSchema, readJsonFile(filePath));
  } catch {
    return undefined;
  }
};

/**
 * A cached task restores its declared outputs on a hit and skips the run;
 * with nothing declared, the hit restores only logs and the generated files
 * never appear. Either declaration makes that impossible.
 */
const isRestorable = (task: v.InferOutput<typeof TaskSchema>): boolean =>
  task.cache === false || (task.outputs ?? []).length > 0;

const checkLeafTask = (
  filePath: string,
  tasks: Record<string, unknown>,
  script: string,
): readonly string[] => {
  if (!Object.hasOwn(tasks, script)) {
    return [`${filePath}: missing task '${script}'`];
  }
  const result = v.safeParse(TaskSchema, tasks[script]);
  return result.success && isRestorable(result.output)
    ? []
    : [`${filePath}: task '${script}' must declare outputs or cache: false`];
};

const checkAggregateWiring = (
  filePath: string,
  tasks: Record<string, unknown>,
  script: string,
): readonly string[] => {
  const result = v.safeParse(TaskSchema, tasks[Aggregate.generate]);
  const dependsOn = result.success ? result.output.dependsOn ?? [] : [];

  return dependsOn.includes(script)
    ? []
    : [`${filePath}: task '${Aggregate.generate}' must depend on '${script}'`];
};

/**
 * turbo's marker for keeping the root's array entries in a package override.
 */
const extendsMarker = '$TURBO_EXTENDS$';

/*
 * A package configuration's `dependsOn` replaces the root's, so an aggregate
 * listing only its leaves drops the root's `^generate`. Its dependencies'
 * codegen then goes unordered, and a consumer two hops away races it. turbo
 * honours the marker only as the first entry, and a task with `extends: false`
 * inherits nothing for it to keep.
 */
const checkAggregateExtends = (
  filePath: string,
  tasks: Record<string, unknown>,
): readonly string[] => {
  const result = v.safeParse(TaskSchema, tasks[Aggregate.generate]);
  const task = result.success ? result.output : {};
  const dependsOn = task.dependsOn ?? [];
  const isRootKept = task.extends !== false && dependsOn[0] === extendsMarker;
  const hasRootEdge = isRootKept || dependsOn.includes(topo(Aggregate.generate));

  return hasRootEdge
    ? []
    : [
        `${filePath}: task '${Aggregate.generate}' must list '${extendsMarker}' first ` +
        `to keep the root's ${topo(Aggregate.generate)}`,
      ];
};

const checkPackageConfig = (
  filePath: string,
  config: PackageConfig,
  scripts: readonly string[],
): readonly string[] => {
  /*
   * turbo rejects a package configuration that doesn't extend the root, so
   * an unextended one takes the whole workspace down rather than degrading.
   */
  if (!(config.extends ?? []).includes('//')) {
    return [`${filePath}: must extend '//'`];
  }
  const tasks = config.tasks ?? {};

  return [
    ...scripts.flatMap(script => [
      ...checkAggregateWiring(filePath, tasks, script),
      ...checkLeafTask(filePath, tasks, script),
    ]),
    ...checkAggregateExtends(filePath, tasks),
  ];
};

const checkPackage = (
  pkg: PackageCapabilities,
  ignored: ReadonlySet<string>,
): readonly string[] => {
  const scripts = pkg.generateScripts.filter(script => !ignored.has(script));
  if (scripts.length === 0) {
    return [];
  }
  const filePath = path.join(pkg.dir, 'turbo.json');
  if (!existsSync(filePath)) {
    return [`${filePath}: missing — add a package configuration defining generate:* tasks`];
  }
  const config = readPackageConfig(filePath);

  return config === undefined
    ? [`${filePath}: failed to parse`]
    : checkPackageConfig(filePath, config, scripts);
};

/**
 * Asserts every package with `generate:*` scripts wires them into its own
 * package configuration. The generated root `turbo.json` names no leaves in
 * the monorepo `generate` aggregate (only the package knows what its
 * codegen reads and writes), which means a package that never declares its
 * leaves silently skips generation instead of failing — this check is what
 * makes that loud. Single-package repos have no package configuration to
 * check: their leaves are generated into the root config instead.
 */
export const checkGenerateConfigs = (
  discovery: WorkspaceDiscovery,
  ignored: ReadonlySet<string>,
): readonly string[] =>
  discovery.isMonorepo
    ? discovery.packages.flatMap(pkg => checkPackage(pkg, ignored))
    : [];
