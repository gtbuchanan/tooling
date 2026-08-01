import { existsSync } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import type { PackageCapabilities, WorkspaceDiscovery } from './discovery.ts';
import { readJsonFile } from './file-writer.ts';
import { StringArray, UnknownRecord } from './schemas.ts';
import { Aggregate } from './turbo-config.ts';

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
  if (!result.success || !isRestorable(result.output)) {
    return [`${filePath}: task '${script}' must declare outputs or cache: false`];
  }

  return [];
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

  return scripts.flatMap(script => [
    ...checkAggregateWiring(filePath, tasks, script),
    ...checkLeafTask(filePath, tasks, script),
  ]);
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
 * package configuration. The generated root `turbo.json` leaves the
 * `generate` aggregate empty for monorepos (only the package knows what its
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
