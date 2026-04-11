import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import crossSpawn from 'cross-spawn';
import * as v from 'valibot';
import {
  ManifestSchema,
  type RootManifest,
  RootManifestSchema,
  buildOutput,
  buildRepoFields,
} from '../lib/manifest.ts';
import {
  type ResolveWorkspaceOptions,
  type WorkspaceContext,
  readManifest,
  resolveWorkspace,
} from '../lib/workspace.ts';

const jsonIndent = 2;
const npmignoreContent = '*.tsbuildinfo\n';
const packDestination = join('dist', 'packages', 'npm');

const readRootManifest = (rootDir: string): RootManifest =>
  v.parse(RootManifestSchema, readManifest(rootDir));

const generateManifests = ({ packageDirs, rootDir }: WorkspaceContext): void => {
  const root = readRootManifest(rootDir);

  for (const pkgDir of packageDirs) {
    preparePackage(root, rootDir, pkgDir);
  }
};

/**
 * Prepares `dist/source/` directories for all publishable packages.
 * Creates clean package.json and .npmignore in each.
 */
export const prepack = (options?: ResolveWorkspaceOptions): void => {
  generateManifests(resolveWorkspace(options));
};

const preparePackage = (
  root: RootManifest,
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

const runPnpmPack = (pkgDir: string, destination: string): void => {
  const manifest = v.parse(ManifestSchema, readManifest(pkgDir));
  if (manifest.private === true) {
    return;
  }

  rmSync(destination, { force: true, recursive: true });
  mkdirSync(destination, { recursive: true });

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

/**
 * Per-package pack for npm. Generates `dist/source/` manifest and packs
 * a tarball to `dist/packages/npm/`. Designed to run as a turbo task.
 */
export const packNpm = (): void => {
  const pkgDir = process.cwd();
  const ctx = resolveWorkspace({ cwd: pkgDir });
  const root = readRootManifest(ctx.rootDir);
  preparePackage(root, ctx.rootDir, pkgDir);
  runPnpmPack(pkgDir, join(pkgDir, packDestination));
};

/** Generates `dist/source/` manifests and packs all publishable packages into tarballs. */
export const pack = (options?: ResolveWorkspaceOptions): void => {
  const ctx = resolveWorkspace(options);
  generateManifests(ctx);

  for (const pkgDir of ctx.packageDirs) {
    runPnpmPack(pkgDir, join(pkgDir, packDestination));
  }
};
