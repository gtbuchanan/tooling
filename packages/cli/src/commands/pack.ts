import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import crossSpawn from 'cross-spawn';
import * as v from 'valibot';
import {
  ManifestSchema,
  RootManifestSchema,
  buildOutput,
  buildRepoFields,
} from '../lib/manifest.ts';
import {
  type ResolveWorkspaceOptions,
  readManifest,
  resolveWorkspace,
} from '../lib/workspace.ts';

const jsonIndent = 2;
const npmignoreContent = '*.tsbuildinfo\n';

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
