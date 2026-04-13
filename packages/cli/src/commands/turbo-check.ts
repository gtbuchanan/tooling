import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as v from 'valibot';
import { type WorkspaceDiscovery, discoverWorkspace } from '../lib/discovery.ts';
import { readJsonFile } from '../lib/file-writer.ts';
import {
  type GeneratedTsconfig,
  planTsconfigs,
  readUserCompilerOptions,
} from '../lib/tsconfig-gen.ts';
import {
  type TurboJson,
  generatePackageScripts,
  generateRequiredRootScripts,
  generateTurboJson,
} from '../lib/turbo-config.ts';
import { readParsedManifest } from '../lib/workspace.ts';

const TurboJsonSchema = v.looseObject({
  tasks: v.optional(v.record(v.string(), v.unknown())),
});

/** Parses `--ignore <name>` flags from CLI args. */
export const parseIgnoreArgs = (args: readonly string[]): ReadonlySet<string> => {
  const ignored = new Set<string>();
  for (let idx = 0; idx < args.length; idx++) {
    if (args[idx] === '--ignore' && idx + 1 < args.length) {
      ignored.add(args[idx + 1]!);
      idx++;
    }
  }

  return ignored;
};

const checkTurboTasks = (
  rootDir: string,
  expected: TurboJson,
  ignored: ReadonlySet<string>,
): readonly string[] => {
  const path = join(rootDir, 'turbo.json');
  if (!existsSync(path)) {
    return ['turbo.json is missing (run gtb turbo:init)'];
  }

  const raw = readJsonFile(path);
  const result = v.safeParse(TurboJsonSchema, raw);
  if (!result.success) {
    return ['turbo.json: failed to parse'];
  }

  const { tasks } = result.output;

  return Object.keys(expected.tasks)
    .filter(name => !ignored.has(name))
    .filter(name => tasks === undefined || !(name in tasks))
    .map(name => `turbo.json: missing task '${name}'`);
};

const tryReadScripts = (dir: string): Record<string, string> | undefined => {
  try {
    return readParsedManifest(dir).scripts;
  } catch {
    return undefined;
  }
};

const checkScripts = (
  dir: string,
  expected: Record<string, string>,
  ignored: ReadonlySet<string>,
): readonly string[] => {
  const scripts = tryReadScripts(dir);

  return Object.keys(expected)
    .filter(name => !ignored.has(name))
    .filter(name => scripts === undefined || !(name in scripts))
    .map(name => `${dir}: missing script '${name}'`);
};

const TsconfigCheckSchema = v.looseObject({
  compilerOptions: v.optional(v.record(v.string(), v.unknown())),
  extends: v.optional(v.string()),
  include: v.optional(v.array(v.string())),
});

const checkOwnedCompilerOptions = (
  path: string,
  actual: Record<string, unknown> | undefined,
  expected: GeneratedTsconfig,
  ownedKeys: Readonly<Record<string, unknown>>,
): readonly string[] =>
  Object.keys(ownedKeys)
    .filter(key => actual?.[key] !== expected.compilerOptions[key])
    .map((key) => {
      const want = String(expected.compilerOptions[key]);
      return `${path}: compilerOptions.${key} should be ${want}`;
    });

const checkTsconfigStructure = (
  path: string,
  expected: GeneratedTsconfig,
  ownedKeys: Readonly<Record<string, unknown>>,
): readonly string[] => {
  const result = v.safeParse(TsconfigCheckSchema, readJsonFile(path));
  if (!result.success) {
    return [`${path}: failed to parse`];
  }

  const actual = result.output;

  return [
    ...(actual.extends === expected.extends
      ? []
      : [`${path}: extends should be '${expected.extends}'`]),
    ...(expected.include === undefined ||
      JSON.stringify(actual.include) === JSON.stringify(expected.include)
      ? []
      : [`${path}: include should be ${JSON.stringify(expected.include)}`]),
    ...checkOwnedCompilerOptions(path, actual.compilerOptions, expected, ownedKeys),
  ];
};

const checkTsconfigFile = (
  path: string,
  expected: GeneratedTsconfig,
  ownedKeys: Readonly<Record<string, unknown>>,
): readonly string[] =>
  existsSync(path)
    ? checkTsconfigStructure(path, expected, ownedKeys)
    : [`${path}: missing (run gtb turbo:init)`];

const checkTsconfigs = (
  { rootDir, packages }: WorkspaceDiscovery,
): readonly string[] =>
  planTsconfigs(rootDir, packages).flatMap(({ path, generate, ownedKeys }) =>
    checkTsconfigFile(path, generate(readUserCompilerOptions(path)), ownedKeys),
  );

/**
 * Validates project config against expected baseline from discovery.
 * Checks turbo tasks, package scripts, and tsconfig structure.
 * Use `--ignore <name>` to skip specific tasks/scripts.
 */
export const turboCheck = (args: readonly string[]): void => {
  const ignored = parseIgnoreArgs(args);
  const discovery = discoverWorkspace();
  const expected = generateTurboJson(discovery);

  const drift = [
    ...checkTurboTasks(discovery.rootDir, expected, ignored),
    ...checkTsconfigs(discovery),
    ...checkScripts(discovery.rootDir, generateRequiredRootScripts(discovery), ignored),
    ...discovery.packages.flatMap(
      pkg => checkScripts(
        pkg.dir,
        generatePackageScripts(pkg, discovery.isSelfHosted, discovery.rootDir),
        ignored,
      ),
    ),
  ];

  if (drift.length === 0) {
    console.log('turbo:check passed — no drift detected');
    return;
  }

  for (const message of drift) {
    console.error(message);
  }

  process.exitCode = 1;
};
