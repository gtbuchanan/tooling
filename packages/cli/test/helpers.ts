import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import * as build from '@gtbuchanan/test-utils/builders';
import * as v from 'valibot';
import { generateCodecovSections } from '#src/lib/codecov-config.js';
import { type PackageCapabilities, discoverWorkspace } from '#src/lib/discovery.js';
import {
  mergeCodecovSections, mergePackageScripts, writeJsonFile,
} from '#src/lib/file-writer.js';
import { type Logger, createLogger } from '#src/lib/logger.js';
import { unscopedName } from '#src/lib/manifest-sync.js';
import { ManifestSchema } from '#src/lib/manifest.js';
import { planTsconfigs } from '#src/lib/tsconfig-gen.js';
import {
  generatePackageScripts, generateRootScripts, generateTurboJson,
} from '#src/lib/turbo-config.js';

/** Creates an isolated temp directory for test fixtures. */
export const createTempDir = (): string =>
  mkdtempSync(path.join(tmpdir(), 'gtb-test-'));

/** A capturing logger plus accessors for the buffered stdout/stderr text. */
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

/** Writes generated tsconfigs for a discovered workspace. */
export const writeTsconfigs = (
  rootDir: string,
  packages: readonly PackageCapabilities[],
): void => {
  for (const descriptor of planTsconfigs(rootDir, packages)) {
    writeJsonFile(descriptor.path, descriptor.generate());
  }
};

/** Writes a JSON file to a directory. */
export const writeJson = (dir: string, name: string, data: unknown): void => {
  writeFileSync(path.join(dir, name), JSON.stringify(data));
};

/** A scaffolded temp monorepo containing one Pkl package. */
export interface PklWorkspace {
  /** Unscoped package name (`hk-config`). */
  readonly name: string;
  /** Absolute path of the Pkl package directory. */
  readonly pkgDir: string;
  /** Repo URL minus scheme, e.g. `github.com/owner/repo`. */
  readonly repoPath: string;
  /** Workspace root directory. */
  readonly root: string;
  /** Pkl package version. */
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

/** Options for {@link createPklWorkspace}. */
export interface PklWorkspaceOptions {
  /**
   * Whether the Pkl package declares a `package {}` block (⇒ publishable).
   * `false` writes a block-less, deps-only `PklProject` — an internal package.
   * Defaults to `true`.
   */
  readonly publishable?: boolean;
}

/** Scaffolds a temp monorepo with a single Pkl package and returns its facts. */
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

const UnknownRecord = v.record(v.string(), v.unknown());

const TurboJsonSchema = v.looseObject({
  tasks: v.optional(UnknownRecord),
});

/** Reads the tasks from a project's turbo.json. */
export const readTurboTasks = (root: string): Record<string, unknown> => {
  const raw: unknown = JSON.parse(readFileSync(path.join(root, 'turbo.json'), 'utf8'));
  const { tasks } = v.parse(TurboJsonSchema, raw);
  return tasks ?? {};
};

/** Reads the scripts from a package's package.json. */
export const readScripts = (pkgDir: string): Record<string, string> => {
  const raw: unknown = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const { scripts } = v.parse(ManifestSchema, raw);
  return scripts ?? {};
};

/** Initializes a fully valid project state (turbo.json, tsconfigs, scripts, codecov.yml). */
export const initProject = (root: string): void => {
  const discovery = discoverWorkspace({ cwd: root });
  writeJsonFile(path.join(root, 'turbo.json'), generateTurboJson(discovery));
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

  if (discovery.packages.some(pkg => pkg.hasVitestTests)) {
    mergeCodecovSections(
      path.join(root, 'codecov.yml'),
      generateCodecovSections(discovery),
    );
  }
};
