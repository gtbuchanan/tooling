import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { defineCommand } from 'citty';
import * as v from 'valibot';
import { parse as parseYaml } from 'yaml';
import { type CodecovSections, generateCodecovSections } from '../../lib/codecov-config.ts';
import { type WorkspaceDiscovery, discoverWorkspace } from '../../lib/discovery.ts';
import { readJsonFile } from '../../lib/file-writer.ts';
import {
  type GeneratedTsconfig,
  planTsconfigs,
  readUserCompilerOptions,
} from '../../lib/tsconfig-gen.ts';
import {
  type TurboJson,
  generatePackageScripts,
  generateRequiredRootScripts,
  generateTurboJson,
} from '../../lib/turbo-config.ts';
import { readParsedManifest } from '../../lib/workspace.ts';
import { rootNames } from './names.ts';

const TurboJsonSchema = v.looseObject({
  tasks: v.optional(v.record(v.string(), v.unknown())),
});

/** Parses `--ignore <name>` flags from raw CLI args. */
export const parseIgnoreArgs = (args: readonly string[]): ReadonlySet<string> => {
  const ignored = new Set<string>();
  for (let idx = 0; idx < args.length; idx++) {
    const next = args[idx + 1];
    if (args[idx] === '--ignore' && next !== undefined) {
      ignored.add(next);
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
  const filePath = path.join(rootDir, 'turbo.json');
  if (!existsSync(filePath)) {
    return ['turbo.json is missing (run gtb sync)'];
  }

  const raw = readJsonFile(filePath);
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
  filePath: string,
  actual: Record<string, unknown> | undefined,
  expected: GeneratedTsconfig,
  ownedKeys: Readonly<Record<string, unknown>>,
): readonly string[] =>
  Object.keys(ownedKeys)
    .filter(key => actual?.[key] !== expected.compilerOptions[key])
    .map((key) => {
      const want = String(expected.compilerOptions[key]);
      return `${filePath}: compilerOptions.${key} should be ${want}`;
    });

const checkTsconfigStructure = (
  filePath: string,
  expected: GeneratedTsconfig,
  ownedKeys: Readonly<Record<string, unknown>>,
): readonly string[] => {
  const result = v.safeParse(TsconfigCheckSchema, readJsonFile(filePath));
  if (!result.success) {
    return [`${filePath}: failed to parse`];
  }

  const actual = result.output;

  return [
    ...(actual.extends === expected.extends
      ? []
      : [`${filePath}: extends should be '${expected.extends}'`]),
    ...(expected.include === undefined ||
      JSON.stringify(actual.include) === JSON.stringify(expected.include)
      ? []
      : [`${filePath}: include should be ${JSON.stringify(expected.include)}`]),
    ...checkOwnedCompilerOptions(filePath, actual.compilerOptions, expected, ownedKeys),
  ];
};

const checkTsconfigFile = (
  filePath: string,
  expected: GeneratedTsconfig,
  ownedKeys: Readonly<Record<string, unknown>>,
): readonly string[] =>
  existsSync(filePath)
    ? checkTsconfigStructure(filePath, expected, ownedKeys)
    : [`${filePath}: missing (run gtb sync)`];

const checkTsconfigs = (
  { rootDir, packages }: WorkspaceDiscovery,
): readonly string[] =>
  planTsconfigs(rootDir, packages).flatMap(({ path: filePath, generate, ownedKeys }) =>
    checkTsconfigFile(filePath, generate(readUserCompilerOptions(filePath)), ownedKeys),
  );

const CodecovYamlSchema = v.nullable(
  v.looseObject({
    component_management: v.optional(
      v.looseObject({
        individual_components: v.optional(
          v.array(v.looseObject({ component_id: v.optional(v.string()) })),
        ),
      }),
    ),
    flags: v.optional(v.record(v.string(), v.unknown())),
  }),
);

interface ActualComponent { readonly component_id?: string | undefined }

type ReadCodecovResult =
  | { readonly data: unknown; readonly errors?: undefined }
  | { readonly errors: readonly string[] };

const readCodecovYaml = (filePath: string): ReadCodecovResult => {
  if (!existsSync(filePath)) {
    return { errors: ['codecov.yml is missing (run gtb sync)'] };
  }
  try {
    return { data: parseYaml(readFileSync(filePath, 'utf8')) };
  } catch {
    return { errors: ['codecov.yml: invalid YAML (run gtb sync)'] };
  }
};

const checkCodecovFlags = (
  actualFlags: Record<string, unknown> | undefined,
  expected: CodecovSections,
  ignored: ReadonlySet<string>,
): readonly string[] =>
  Object.keys(expected.flags)
    .filter(name => !ignored.has(name))
    .filter(name => actualFlags === undefined || !(name in actualFlags))
    .map(name => `codecov.yml: missing flag '${name}'`);

const checkCodecovComponents = (
  actualComponents: readonly ActualComponent[],
  expected: CodecovSections,
  ignored: ReadonlySet<string>,
): readonly string[] => {
  const actualIds = new Set(actualComponents.map(comp => comp.component_id));
  return expected.component_management.individual_components
    .filter(({ component_id: id }) => !ignored.has(id))
    .filter(({ component_id: id }) => !actualIds.has(id))
    .map(({ component_id: id }) => `codecov.yml: missing component '${id}'`);
};

const checkCodecovSections = (
  rootDir: string,
  discovery: WorkspaceDiscovery,
  ignored: ReadonlySet<string>,
): readonly string[] => {
  const filePath = path.join(rootDir, 'codecov.yml');
  const readResult = readCodecovYaml(filePath);
  if (readResult.errors !== undefined) {
    return readResult.errors;
  }
  const parseResult = v.safeParse(CodecovYamlSchema, readResult.data);
  if (!parseResult.success || parseResult.output === null) {
    return ['codecov.yml: failed to parse'];
  }
  const { flags: actualFlags, component_management: actualCm } = parseResult.output;
  const expected = generateCodecovSections(discovery);
  return [
    ...checkCodecovFlags(actualFlags, expected, ignored),
    ...checkCodecovComponents(actualCm?.individual_components ?? [], expected, ignored),
  ];
};

/**
 * Validates project config against the expected baseline from discovery.
 *
 * Checks turbo.json tasks, package.json scripts, tsconfig structure, and
 * codecov.yml flags/components. Use `--ignore <name>` to skip specific
 * tasks/scripts. Exits non-zero on drift.
 */
export const verify = defineCommand({
  args: {
    ignore: {
      description: 'Skip drift detection for a specific task or script',
      type: 'string',
    },
  },
  meta: {
    description: 'Verify generated config matches the expected baseline',
    name: rootNames.verify,
  },
  run: ({ rawArgs }) => {
    const ignored = parseIgnoreArgs(rawArgs);
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
      ...(discovery.packages.some(pkg => pkg.hasVitestTests)
        ? checkCodecovSections(discovery.rootDir, discovery, ignored)
        : []),
    ];

    if (drift.length === 0) {
      console.log('verify passed — no drift detected');
      return;
    }

    for (const message of drift) {
      console.error(message);
    }

    process.exitCode = 1;
  },
});
