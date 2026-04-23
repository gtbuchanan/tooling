import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineCommand } from 'citty';
import crossSpawn from 'cross-spawn';
import * as v from 'valibot';
import {
  type Manifest,
  type RootManifest,
  RootManifestSchema,
  buildOutput,
  buildRepoFields,
} from '../../lib/manifest.ts';
import {
  type ResolveWorkspaceOptions,
  readManifest,
  readParsedManifest,
  resolveWorkspace,
} from '../../lib/workspace.ts';

const jsonIndent = 2;
const npmignoreContent = '*.tsbuildinfo\n';
const packDestination = path.join('dist', 'packages', 'npm');

const readRootManifest = (rootDir: string): RootManifest =>
  v.parse(RootManifestSchema, readManifest(rootDir));

/**
 * Prepares `dist/source/` directories for all publishable packages.
 * Creates clean package.json and .npmignore in each.
 */
export const prepack = (options?: ResolveWorkspaceOptions): void => {
  const ctx = resolveWorkspace(options);
  const root = readRootManifest(ctx.rootDir);
  for (const pkgDir of ctx.packageDirs) {
    preparePackage(root, ctx.rootDir, pkgDir);
  }
};

const writeSourceManifest = (
  manifest: Manifest,
  root: RootManifest,
  target: string,
  directory: string,
): void => {
  mkdirSync(target, { recursive: true });
  const json = JSON.stringify(
    { ...buildOutput(manifest), ...buildRepoFields(root, directory) },
    undefined,
    jsonIndent,
  );
  writeFileSync(path.join(target, 'package.json'), `${json}\n`);
  writeFileSync(path.join(target, '.npmignore'), npmignoreContent);
};

const preparePackage = (
  root: RootManifest,
  rootDir: string,
  pkgDir: string,
): void => {
  const manifest = readParsedManifest(pkgDir);
  const dir = manifest.publishConfig?.directory;
  if (manifest.private === true || dir === undefined) {
    return;
  }

  const target = path.join(pkgDir, dir);
  const directory = path.relative(rootDir, pkgDir).replaceAll('\\', '/');
  writeSourceManifest(manifest, root, target, directory);
};

const execPnpmPack = (pkgDir: string, destination: string): void => {
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

const prepareAndPack = (
  root: RootManifest,
  rootDir: string,
  pkgDir: string,
): void => {
  const manifest = readParsedManifest(pkgDir);
  const dir = manifest.publishConfig?.directory;
  if (manifest.private === true || dir === undefined) {
    return;
  }

  const target = path.join(pkgDir, dir);
  const directory = path.relative(rootDir, pkgDir).replaceAll('\\', '/');
  writeSourceManifest(manifest, root, target, directory);
  execPnpmPack(pkgDir, path.join(pkgDir, packDestination));
};

/**
 * Per-package pack for npm. Generates `dist/source/` manifest and packs
 * a tarball to `dist/packages/npm/`. Designed to run as a turbo task.
 */
export const packNpm = defineCommand({
  meta: {
    description: 'Generate dist/source manifest and pack tarball to dist/packages/npm',
    name: 'pack:npm',
  },
  run: () => {
    const pkgDir = process.cwd();
    const ctx = resolveWorkspace({ cwd: pkgDir });
    const root = readRootManifest(ctx.rootDir);
    prepareAndPack(root, ctx.rootDir, pkgDir);
  },
});
