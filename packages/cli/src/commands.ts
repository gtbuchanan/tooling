import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import crossSpawn from 'cross-spawn';
import * as v from 'valibot';
import {
  ManifestSchema,
  RootManifestSchema,
  buildOutput,
  buildRepoFields,
} from './lib/manifest.ts';
import { type ParallelCommand, run, runParallel } from './lib/process.ts';
import {
  type ResolveWorkspaceOptions,
  readManifest,
  resolveWorkspace,
} from './lib/workspace.ts';

const jsonIndent = 2;
const npmignoreContent = '*.tsbuildinfo\n';

const lintCommands: readonly ParallelCommand[] = [
  { command: 'oxlint', name: 'oxlint' },
  { command: 'eslint --max-warnings=0', name: 'eslint' },
];

const lintAndTestCommands: readonly ParallelCommand[] = [
  ...lintCommands,
  { command: 'vitest run', name: 'test' },
];

// ── Leaf commands (forward args to a single tool) ───────────────

/** Runs `tsc -b` with optional pass-through args. */
export const compileTs = async (
  args: readonly string[],
): Promise<void> => {
  await run('tsc', { args: ['-b', ...args] });
};

/** Runs ESLint with zero-warning threshold. */
export const lintEslint = async (
  args: readonly string[],
): Promise<void> => {
  await run('eslint', { args: ['--max-warnings=0', ...args] });
};

/** Runs oxlint. */
export const lintOxlint = async (
  args: readonly string[],
): Promise<void> => {
  await run('oxlint', { args });
};

/** Runs unit tests via Vitest. */
export const testVitest = async (
  args: readonly string[],
): Promise<void> => {
  await run('vitest', { args: ['run', ...args] });
};

/** Runs end-to-end tests via Vitest with the e2e config. */
export const testVitestE2e = async (
  args: readonly string[],
): Promise<void> => {
  await run('vitest', {
    args: ['run', '--config', 'vitest.config.e2e.ts', ...args],
  });
};

/** Installs pre-commit hooks via prek. */
export const prepare = async (
  args: readonly string[],
): Promise<void> => {
  await run('prek', { args: ['install', ...args] });
};

// ── Composed commands (no pass-through args) ────────────────────

/** Runs `tsc -b` followed by per-package compile scripts. */
export const compile = async (): Promise<void> => {
  await run('tsc', { args: ['-b'] });
  await run('pnpm', { args: ['-r', '--if-present', 'run', 'compile'] });
};

/** Runs oxlint and ESLint in parallel. */
export const lint = async (): Promise<void> => {
  await runParallel(lintCommands);
};

/** Runs unit tests via Vitest. */
export const test = async (): Promise<void> => {
  await run('vitest', { args: ['run'] });
};

/** Runs end-to-end tests via Vitest with the e2e config. */
export const testE2e = async (): Promise<void> => {
  await run('vitest', {
    args: ['run', '--config', 'vitest.config.e2e.ts'],
  });
};

/**
 * Prepares `dist/source/` directories for all publishable packages.
 * Creates clean package.json and .npmignore in each.
 */
export const prepack = (options?: ResolveWorkspaceOptions): void => {
  const { packageDirs, rootDir } = resolveWorkspace(options);
  const rootRaw = readFileSync(join(rootDir, 'package.json'), 'utf-8');
  const root = v.parse(RootManifestSchema, JSON.parse(rootRaw));

  for (const pkgDir of packageDirs) {
    preparePackage(root, rootDir, pkgDir);
  }
};

const preparePackage = (
  root: v.InferOutput<typeof RootManifestSchema>,
  rootDir: string,
  pkgDir: string,
): void => {
  const manifest = v.parse(ManifestSchema, readManifest(pkgDir));
  const dir = manifest.publishConfig?.directory;
  if (manifest.private === true || dir === undefined) {
    return;
  }

  const target = join(pkgDir, dir);
  mkdirSync(target, { recursive: true });
  const directory = relative(rootDir, pkgDir).replaceAll('\\', '/');
  const json = JSON.stringify(
    { ...buildOutput(manifest), ...buildRepoFields(root, directory) },
    null,
    jsonIndent,
  );
  writeFileSync(join(target, 'package.json'), `${json}\n`);
  writeFileSync(join(target, '.npmignore'), npmignoreContent);
};

/** Packs all publishable packages into tarballs. */
export const pack = (options?: ResolveWorkspaceOptions): void => {
  const { packageDirs, rootDir } = resolveWorkspace(options);
  const destination = join(rootDir, 'dist', 'packages');
  rmSync(destination, { force: true, recursive: true });
  mkdirSync(destination, { recursive: true });

  for (const pkgDir of packageDirs) {
    packPackage(pkgDir, destination);
  }
};

const packPackage = (pkgDir: string, destination: string): void => {
  const manifest = v.parse(ManifestSchema, readManifest(pkgDir));
  if (manifest.private === true) {
    return;
  }

  const result = crossSpawn.sync(
    'pnpm',
    ['pack', '--pack-destination', destination],
    { cwd: pkgDir, stdio: 'inherit' },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `pnpm pack failed for ${pkgDir} with code ${String(result.status)}`,
    );
  }
};

/** Compile, then lint + test in parallel (no pack). */
export const check = async (): Promise<void> => {
  await compile();
  await runParallel(lintAndTestCommands);
};

/** Compile, lint + test in parallel, then pack. */
export const buildCi = async (): Promise<void> => {
  await check();
  prepack();
  pack();
};

/** Full build pipeline: build:ci then e2e tests. */
export const build = async (): Promise<void> => {
  await buildCi();
  await testE2e();
};

/** Command registry mapping CLI names to handler functions. */
export const commands: Record<
  string,
  (args: readonly string[]) => Promise<void> | void
> = {
  build,
  'build:ci': buildCi,
  check,
  compile,
  'compile:ts': compileTs,
  lint,
  'lint:eslint': lintEslint,
  'lint:oxlint': lintOxlint,
  'pack': () => { pack(); },
  'prepack': () => { prepack(); },
  prepare,
  test,
  'test:e2e': testE2e,
  'test:vitest': testVitest,
  'test:vitest:e2e': testVitestE2e,
};
