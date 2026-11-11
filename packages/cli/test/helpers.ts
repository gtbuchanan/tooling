import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { faker } from '@faker-js/faker';
import * as build from '@gtbuchanan/test-utils/builders';
import * as v from 'valibot';
import {
  generatePackageScripts, generateRootScripts, generateTurboJson,
} from '#src/codegen/turbo-config.js';
import type { Capability } from '#src/core/capability.js';
import {
  type WorkspaceDiscovery, type WorkspacePackage, discoverWorkspace,
} from '#src/core/discovery.js';
import { mergePackageScripts, sortKeysDeep, writeJsonFile } from '#src/core/file-writer.js';
import { buildInclude } from '#src/core/layout.js';
import { type Logger, createLogger } from '#src/core/logger.js';
import { ManifestSchema, unscopedName } from '#src/core/manifest.js';
import { UnknownRecord } from '#src/core/schemas.js';
import type { GithubReleaseDeps } from '#src/release/github-release.js';
import { capabilities } from '#src/toolchains/index.js';
import {
  generateTsconfigBase, planTsconfigs, tsconfigBaseFileName,
} from '#src/toolchains/typescript/tsconfig.js';

/**
 * Creates an isolated temp directory for test fixtures.
 */
export const createTempDir = (): string =>
  mkdtempSync(path.join(tmpdir(), 'gtb-test-'));

/**
 * A capturing logger plus accessors for the buffered stdout/stderr text.
 */
export interface CapturedLogger {
  readonly logger: Logger;
  readonly out: () => string;
  readonly err: () => string;
}

const captureSink = (chunks: string[]): NodeJS.WritableStream =>
  new Writable({
    write: (chunk, _enc, cb) => {
      chunks.push(String(chunk));
      cb();
    },
  });

/**
 * Buffers everything written through the Logger so concurrent tests can
 * assert on the output without sharing console state.
 */
export const captureLogger = (): CapturedLogger => {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  return {
    logger: createLogger(captureSink(stdoutChunks), captureSink(stderrChunks)),
    out: () => stdoutChunks.join(''),
    err: () => stderrChunks.join(''),
  };
};

/**
 * A single stubbed command invocation.
 */
export interface StubCall {
  readonly args: readonly string[];
  readonly command: string;
}

/**
 * Options for {@link stubGithubReleaseDeps}.
 */
export interface GithubReleaseStubOptions {
  /**
   * Tags `gh release list` reports as already released.
   */
  readonly existingTags?: readonly string[];
  /**
   * When set, `gh release list` fails with this stderr instead of listing.
   */
  readonly listStderr?: string;
  readonly logger?: Logger;
  /**
   * Tags whose `gh release create` fails, mapped to the stderr it emits.
   */
  readonly rejectedTags?: Readonly<Record<string, string>>;
}

/**
 * Injected deps plus accessors over the gh calls they recorded.
 */
export interface GithubReleaseStub {
  readonly createCalls: () => readonly StubCall[];
  readonly deps: GithubReleaseDeps;
  readonly listCalls: () => readonly StubCall[];
  readonly sha: string;
}

const silentLogger = createLogger(
  new Writable({ write: (_chunk, _enc, cb) => { cb(); } }),
  new Writable({ write: (_chunk, _enc, cb) => { cb(); } }),
);

/**
 * Stubs the gh/git side of the release channels: `git rev-parse` answers with
 * a generated sha, `gh release list` reports {@link
 * GithubReleaseStubOptions.existingTags}, and `gh release create` succeeds
 * unless the tag is listed in `rejectedTags`. Shared by every release-channel
 * test so they exercise one fake of the real `execute` contract.
 */
export const stubGithubReleaseDeps = (
  options: GithubReleaseStubOptions & { cwd?: string } = {},
): GithubReleaseStub => {
  const calls: StubCall[] = [];
  const sha = faker.git.commitSha();
  const existingTags = options.existingTags ?? [];
  const rejectedTags = options.rejectedTags ?? {};
  const select = (args: readonly string[]) => {
    if (args[1] === 'list') {
      return options.listStderr === undefined
        ? { stdout: JSON.stringify(existingTags.map(tagName => ({ tagName }))) }
        : { exitCode: 1, stderr: options.listStderr };
    }
    const stderr = rejectedTags[args[2] ?? ''];

    return stderr === undefined
      ? { stdout: `https://github.com/o/r/releases/tag/${args[2] ?? ''}` }
      : { exitCode: 1, stderr };
  };
  const byCommand = (name: string) => () => calls.filter(call => call.args[1] === name);

  return {
    createCalls: byCommand('create'),
    deps: {
      cwd: options.cwd ?? createTempDir(),
      execute: (command, args) => {
        calls.push({ args: [...args], command });

        return Promise.resolve({
          exitCode: 0,
          stderr: '',
          stdout: '',
          ...(command === 'git' ? { stdout: sha } : select(args)),
        });
      },
      logger: options.logger ?? silentLogger,
    },
    listCalls: byCommand('list'),
    sha,
  };
};

/**
 * Writes generated tsconfigs for a discovered workspace.
 */
export const writeTsconfigs = (
  rootDir: string,
  packages: readonly WorkspacePackage[],
): void => {
  writeJsonFile(path.join(rootDir, tsconfigBaseFileName), generateTsconfigBase());
  for (const descriptor of planTsconfigs(rootDir, packages)) {
    writeJsonFile(descriptor.path, descriptor.generate());
  }
};

/**
 * Writes a JSON file to a directory.
 */
export const writeJson = (dir: string, name: string, data: unknown): void => {
  writeFileSync(path.join(dir, name), JSON.stringify(data));
};

/**
 * Scaffolds a repo that adopts only the hk preset: a TypeScript-flavoured root
 * manifest with no `@gtbuchanan/cli` dependency, and a `mise.toml`. Returns
 * the root.
 */
export const createHkOnlyProject = (): string => {
  const root = createTempDir();
  writeJson(root, 'package.json', {
    devDependencies: {
      '@gtbuchanan/tsconfig': build.semverRange(),
      'typescript': build.semverRange(),
    },
    private: true,
  });
  writeFileSync(path.join(root, 'mise.toml'), '[tools]\nnode = "24"\n');

  return root;
};

/**
 * A scaffolded temp monorepo containing one Pkl package.
 */
export interface PklWorkspace {
  /**
   * Unscoped package name (`hk-config`).
   */
  readonly name: string;
  /**
   * Absolute path of the Pkl package directory.
   */
  readonly pkgDir: string;
  /**
   * Repo URL minus scheme, e.g. `github.com/owner/repo`.
   */
  readonly repoPath: string;
  /**
   * Workspace root directory.
   */
  readonly root: string;
  /**
   * Pkl package version.
   */
  readonly version: string;
}

/**
 * Author-owned `PklProject` for a publishable monorepo Pkl package — the
 * `package {}` block with sync's `\(name)`/`\(version)` interpolation
 * templates. Byte-identical to what `patchPackageBlock` produces, so the
 * fixture round-trips through `gtb sync`/`verify` without drift.
 */
export const pklProjectSource = (
  { name, repoPath, version }: { name: string; repoPath: string; version: string },
): string => {
  const basename = String.raw`\(name)@\(version)`;

  return [
    'amends "pkl:Project"',
    '',
    'package {',
    `  name = "${name}"`,
    `  version = "${version}"`,
    String.raw`  baseUri = "package://${repoPath}/\(name)"`,
    `  packageZipUrl = "https://${repoPath}/releases/download/${basename}/${basename}.zip"`,
    '}',
    '',
  ].join('\n');
};

/**
 * A scaffolded temp monorepo containing one published npm package.
 */
export interface NpmWorkspace {
  /**
   * Scoped package name (`@scope/pkg`).
   */
  readonly name: string;
  /**
   * Absolute path of the published package directory.
   */
  readonly pkgDir: string;
  /**
   * Workspace root directory.
   */
  readonly root: string;
  /**
   * Package version.
   */
  readonly version: string;
}

/**
 * Scaffolds a temp monorepo with a single published npm package.
 */
export const createNpmWorkspace = (): NpmWorkspace => {
  const root = createTempDir();
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  writeJson(root, 'package.json', { name: build.packageName(), private: true });

  const name = build.scopedPackageName();
  const version = build.semverVersion();
  const pkgDir = path.join(root, 'packages', build.packageName());
  mkdirSync(pkgDir, { recursive: true });
  writeJson(pkgDir, 'package.json', {
    name,
    publishConfig: { directory: build.publishDirectory() },
    version,
  });

  return { name, pkgDir, root, version };
};

/**
 * Options for {@link createPklWorkspace}.
 */
export interface PklWorkspaceOptions {
  /**
   * Whether the Pkl package declares a `package {}` block (⇒ publishable).
   * `false` writes a block-less, deps-only `PklProject` — an internal package.
   * Defaults to `true`.
   */
  readonly publishable?: boolean;
}

/**
 * Scaffolds a temp monorepo with a single Pkl package and returns its facts.
 */
export const createPklWorkspace = (options: PklWorkspaceOptions = {}): PklWorkspace => {
  const root = createTempDir();
  const homepage = build.gitHubRepoUrl();
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  writeJson(root, 'package.json', { homepage, name: build.packageName(), private: true });

  const scopedName = build.scopedPackageName();
  const version = build.semverVersion();
  const pkgDir = path.join(root, 'packages', build.packageName());
  mkdirSync(pkgDir, { recursive: true });
  writeJson(pkgDir, 'package.json', { name: scopedName, version });
  writeFileSync(path.join(pkgDir, 'Defaults.pkl'), 'module Defaults\n');

  const name = unscopedName(scopedName);
  const repoPath = homepage.replace(/^https?:\/\//v, '');
  writeFileSync(
    path.join(pkgDir, 'PklProject'),
    options.publishable === false
      ? 'amends "pkl:Project"\n'
      : pklProjectSource({ name, repoPath, version }),
  );

  return { name, pkgDir, repoPath, root, version };
};

const TurboJsonSchema = v.looseObject({
  tasks: v.optional(UnknownRecord),
});

/**
 * Reads the tasks from a project's turbo.json.
 */
export const readTurboTasks = (root: string): Record<string, unknown> => {
  const raw: unknown = JSON.parse(readFileSync(path.join(root, 'turbo.json'), 'utf8'));
  const { tasks } = v.parse(TurboJsonSchema, raw);
  return tasks ?? {};
};

/**
 * Reads the scripts from a package's package.json.
 */
export const readScripts = (pkgDir: string): Record<string, string> => {
  const raw: unknown = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const { scripts } = v.parse(ManifestSchema, raw);
  return scripts ?? {};
};

/**
 * Initializes a fully valid project state (turbo.json, tsconfigs, scripts).
 */
export const initProject = (root: string): void => {
  const discovery = discoverWorkspace({ capabilities, cwd: root });
  writeJsonFile(path.join(root, 'turbo.json'), sortKeysDeep(generateTurboJson(discovery)));
  writeTsconfigs(root, discovery.packages);
  mergePackageScripts(path.join(root, 'package.json'), generateRootScripts(discovery), true);

  for (const pkg of discovery.packages) {
    const scripts = generatePackageScripts(pkg, discovery.isSelfHosted);
    const pkgPath = path.join(pkg.dir, 'package.json');
    const manifest = v.parse(ManifestSchema, JSON.parse(readFileSync(pkgPath, 'utf8')));
    writeJson(pkg.dir, 'package.json', {
      ...manifest,
      scripts: { ...manifest.scripts, ...scripts },
    });
  }
};

export const makePackage = (
  overrides: Partial<WorkspacePackage> = {},
): WorkspacePackage => {
  const merged = {
    buildIncludes: [...buildInclude] as readonly string[],
    capabilities: new Set<Capability>(),
    dir: '/fake/pkg',
    generateScripts: [] as readonly string[],
    hasBin: false,
    hasE2e: false,
    hasGenerate: false,
    hasScripts: false,
    hasSrc: false,
    hasTest: false,
    manifest: {},
    name: 'pkg',
    ...overrides,
  };
  return {
    ...merged,
    hasGenerate: overrides.hasGenerate ?? merged.generateScripts.length > 0,
  };
};

export interface MakeDiscoveryOverrides extends Partial<WorkspacePackage> {
  /**
   * Overrides {@link WorkspaceDiscovery.dependsOnCli} (defaults to `false`).
   */
  readonly dependsOnCli?: boolean;
  /**
   * Overrides {@link WorkspaceDiscovery.miseFiles} (defaults to none).
   */
  readonly miseFiles?: readonly string[];
  /**
   * Overrides {@link WorkspaceDiscovery.isMonorepo} (defaults to more than
   * one package). Real discovery also reports a monorepo for a single
   * package under a `packages/*` glob, which no package count can express.
   */
  readonly isMonorepo?: boolean;
  /**
   * Overrides {@link WorkspaceDiscovery.isSelfHosted} (defaults to `false`).
   */
  readonly isSelfHosted?: boolean;
}

export const makeDiscovery = (
  packages: readonly WorkspacePackage[],
  overrides: MakeDiscoveryOverrides = {},
): WorkspaceDiscovery => {
  const {
    dependsOnCli: hasCliDependency = false,
    isMonorepo = packages.length > 1,
    miseFiles = [],
    isSelfHosted = false,
    ...rootOverrides
  } = overrides;
  return {
    dependsOnCli: hasCliDependency,
    isMonorepo,
    isSelfHosted,
    miseFiles,
    packages,
    packageGlobs: isMonorepo
      ? [{ dirs: packages.map(({ dir }) => dir), pattern: 'packages/*' }]
      : [],
    root: makePackage(rootOverrides),
    rootDir: '/fake/root',
  };
};

/**
 * Two identical packages — the minimum `makeDiscovery` reads as a monorepo.
 */
export const monorepoOf = (
  overrides: Partial<WorkspacePackage> = {},
): readonly WorkspacePackage[] => [
  makePackage(overrides),
  makePackage(overrides),
];
