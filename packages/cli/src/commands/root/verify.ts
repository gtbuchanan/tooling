import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { defineCommand } from 'citty';
import * as v from 'valibot';
import { checkCodecovSections } from '../../lib/codecov-verify.ts';
import { type WorkspaceDiscovery, discoverWorkspace } from '../../lib/discovery.ts';
import { readJsonFile } from '../../lib/file-writer.ts';
import { checkGenerateConfigs } from '../../lib/generate-tasks.ts';
import { type Logger, createLogger } from '../../lib/logger.ts';
import { checkManifests } from '../../lib/manifest-sync.ts';
import { checkMiseTasksInclude } from '../../lib/mise-tasks.ts';
import { StringArray, UnknownRecord } from '../../lib/schemas.ts';
import {
  type SyncScope, parseSyncScopes, syncScopes,
} from '../../lib/sync-scopes.ts';
import {
  type GeneratedTsconfig,
  planTsconfigs,
  readUserCompilerOptions,
  tsconfigBaseFileName,
} from '../../lib/tsconfig-gen.ts';
import {
  type TurboJson,
  forbiddenRootScripts,
  generatePackageScripts,
  generateRequiredRootScripts,
  generateTurboJson,
} from '../../lib/turbo-config.ts';
import { readParsedManifest } from '../../lib/workspace.ts';
import { rootNames } from './names.ts';

const TurboJsonSchema = v.looseObject({
  tasks: v.optional(UnknownRecord),
});

/**
 * Parses `--ignore <name>` flags from raw CLI args.
 */
export const parseIgnoreArgs = (args: readonly string[]): ReadonlySet<string> => {
  const ignored = new Set<string>();
  for (let idx = 0; idx < args.length; idx++) {
    const next = args[idx + 1];
    if (next !== undefined && args[idx] === '--ignore') {
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
    .filter(name => tasks === undefined || !Object.hasOwn(tasks, name))
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
    .filter(name => scripts === undefined || !Object.hasOwn(scripts, name))
    .map(name => `${dir}: missing script '${name}'`);
};

const TsconfigCheckSchema = v.looseObject({
  compilerOptions: v.optional(UnknownRecord),
  extends: v.optional(v.string()),
  include: v.optional(StringArray),
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

/*
 * The base tsconfig is hand-authored (the consumer's variant choice), so only
 * that a file exists is verified — its contents are theirs to own. A missing or
 * non-file path silently breaks every generated config's `extends`, which is
 * the gap this catches.
 */
const checkTsconfigBase = (rootDir: string): readonly string[] => {
  const filePath = path.join(rootDir, tsconfigBaseFileName);
  const stats = statSync(filePath, { throwIfNoEntry: false });
  if (stats === undefined) {
    return [`${filePath}: missing (run gtb sync)`];
  }

  return stats.isFile() ? [] : [`${filePath}: must be a file (run gtb sync)`];
};

const checkTsconfigs = (
  { rootDir, packages }: WorkspaceDiscovery,
): readonly string[] => [
  ...checkTsconfigBase(rootDir),
  ...planTsconfigs(rootDir, packages).flatMap(({ path: filePath, generate, ownedKeys }) =>
    checkTsconfigFile(filePath, generate(readUserCompilerOptions(filePath)), ownedKeys),
  ),
];

/**
 * Flags root scripts that shadow a turbo aggregate. Only single-package repos
 * can hit this — see `forbiddenRootScripts`. Unlike every other check here the
 * drift is a script's *presence*, so the fix is deletion, not `gtb sync`.
 */
const checkShadowedAggregates = (
  discovery: WorkspaceDiscovery,
  ignored: ReadonlySet<string>,
): readonly string[] => {
  const scripts = tryReadScripts(discovery.rootDir);

  return forbiddenRootScripts(discovery)
    .filter(name => !ignored.has(name))
    .filter(name => scripts !== undefined && Object.hasOwn(scripts, name))
    .map(name =>
      `${discovery.rootDir}: script '${name}' shadows the turbo task of the ` +
      `same name — delete it and run 'gtb turbo run ${name}' instead`);
};

/**
 * Flags a published package that declares a *private* workspace package among
 * its install-time dependencies. pnpm rewrites the `workspace:` specifier to a
 * concrete version at pack time, so the published tarball points at a version
 * that was never published to npm and a consumer's install fails to resolve
 * it. Like {@link checkShadowedAggregates} the drift is the *presence* of a
 * declaration, so the fix is editing `package.json`, not `gtb sync`.
 *
 * The e2e suite can't catch this: its harness installs each workspace
 * dependency's local tarball alongside the package under test, which resolves
 * a private dependency just fine while a real consumer 404s.
 *
 * A name matching no workspace package is left alone — pnpm's own install
 * fails on an unresolvable `workspace:` specifier, so verify adds nothing.
 */
const checkPublishableDependencies = (
  { packages, root }: WorkspaceDiscovery,
): readonly string[] => {
  /* The root is a workspace project too, so a `workspace:` specifier can
     resolve to it. It isn't in `packages` in a monorepo, so index it
     separately; in a single-package repo it *is* `packages[0]` and dedupes. */
  const byName = new Map([root, ...packages].map(pkg => [pkg.name, pkg]));

  return packages
    .filter(pkg => pkg.isPublished)
    .flatMap(pkg =>
      pkg.workspaceDependencies
        .filter(dep => byName.get(dep)?.isPublished === false)
        .map(dep =>
          `${pkg.dir}: dependency '${dep}' is a private workspace package — ` +
          'publish it, or move it to devDependencies if it is bundled at build time'));
};

const checkAllScripts = (
  discovery: WorkspaceDiscovery,
  ignored: ReadonlySet<string>,
): readonly string[] => [
  ...checkScripts(discovery.rootDir, generateRequiredRootScripts(discovery), ignored),
  ...checkShadowedAggregates(discovery, ignored),
  ...discovery.packages.flatMap(pkg => checkScripts(
    pkg.dir, generatePackageScripts(pkg, discovery.isSelfHosted, discovery.rootDir), ignored,
  )),
];

/**
 * Options for {@link runVerify}.
 */
export interface RunVerifyOptions {
  readonly cwd?: string;
  readonly ignored?: ReadonlySet<string>;
  /**
   * Artifacts to check. Defaults to all {@link syncScopes}.
   */
  readonly scopes?: ReadonlySet<SyncScope>;
}

/**
 * Validates the artifacts selected by `scopes` (default all) against the
 * baseline from discovery (empty result = no drift). The codecov/mise
 * checks self-skip when the repo lacks those tools.
 */
export const runVerify = (options: RunVerifyOptions = {}): readonly string[] => {
  const cwd = options.cwd ?? process.cwd();
  const ignored = options.ignored ?? new Set<string>();
  const scopes = options.scopes ?? new Set(syncScopes);
  const discovery = discoverWorkspace({ cwd });

  const checks: Record<SyncScope, () => readonly string[]> = {
    codecov: () => (discovery.packages.some(pkg => pkg.hasVitestTests)
      ? checkCodecovSections(discovery.rootDir, discovery, ignored)
      : []),
    manifest: () => [
      ...checkManifests(discovery),
      ...checkPublishableDependencies(discovery),
    ],
    mise: () => (discovery.hasMise ? checkMiseTasksInclude(discovery.rootDir) : []),
    scripts: () => checkAllScripts(discovery, ignored),
    tsconfig: () => checkTsconfigs(discovery),
    turbo: () => [
      ...checkTurboTasks(discovery.rootDir, generateTurboJson(discovery), ignored),
      ...checkGenerateConfigs(discovery, ignored),
    ],
  };

  return syncScopes.flatMap(scope => (scopes.has(scope) ? checks[scope]() : []));
};

/**
 * Parsed citty args for {@link verify}.
 */
export interface VerifyCommandArgs {
  readonly cwd?: string | undefined;
  /**
   * Positional scope tokens (citty `args._`). Empty means all scopes.
   */
  readonly scopes?: readonly string[] | undefined;
}

/**
 * Translates citty args into {@link RunVerifyOptions}, invokes
 * {@link runVerify}, and reports the drift through the given logger.
 * Returns the exit code so the citty wrapper can set
 * `process.exitCode` and tests can assert on the result without
 * mutating process state.
 */
export const verifyCommand = (
  rawArgs: readonly string[],
  args: VerifyCommandArgs,
  logger: Logger,
): number => {
  const parsed = parseSyncScopes(args.scopes ?? []);
  if ('errors' in parsed) {
    for (const message of parsed.errors) {
      logger.error(message);
    }

    return 1;
  }

  const drift = runVerify({
    ...(args.cwd !== undefined && { cwd: args.cwd }),
    ignored: parseIgnoreArgs(rawArgs),
    scopes: parsed.scopes,
  });

  if (drift.length === 0) {
    logger.info('verify passed — no drift detected');
    return 0;
  }

  for (const message of drift) {
    logger.error(message);
  }

  return 1;
};

/**
 * Citty command wrapper for {@link verifyCommand}.
 */
export const verify = defineCommand({
  args: {
    cwd: {
      alias: 'C',
      description: 'Workspace root directory (defaults to current working directory)',
      type: 'string',
    },
    ignore: {
      description: 'Skip drift detection for a specific task or script',
      type: 'string',
    },
  },
  meta: {
    description:
      'Verify generated config matches the expected baseline ' +
      `(optionally scope to: ${syncScopes.join(', ')})`,
    name: rootNames.verify,
  },
  run: ({ rawArgs, args }) => {
    const exitCode = verifyCommand(
      rawArgs, { cwd: args.cwd, scopes: args._ }, createLogger(),
    );
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  },
});
