import { globSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { findUpSync } from 'find-up-simple';
import * as v from 'valibot';
import {
  PackageJson,
  getWorkspaceIndex,
  getWorkspaceRoot,
  resolveWorkspaceDeps,
} from './workspace.ts';

interface TarballEntry {
  readonly dir: string;
  readonly name: string;
}

const require = createRequire(import.meta.url);

/**
 * Resolves a package name to `name@version` using the version currently
 * installed in this project's node_modules. This pins e2e fixture installs
 * to the exact versions tested during development.
 */
export const pinned = (name: string): string => {
  const entryDir = path.dirname(require.resolve(name));
  const pkgPath = findUpSync('package.json', { cwd: entryDir });
  if (pkgPath === undefined) {
    throw new Error(`Could not find package.json for ${name}`);
  }
  const { version } = v.parse(PackageJson, JSON.parse(readFileSync(pkgPath, 'utf8')));
  return `${name}@${version}`;
};

/**
 * Matches a single tarball filename from a list of files for the given
 * package name. Pure function — no filesystem access.
 */
export const matchTarball = (files: readonly string[], packageName: string): string => {
  // Tarball names from pnpm pack: gtbuchanan-eslint-config-0.0.0.tgz
  // Convert @gtbuchanan/eslint-config -> gtbuchanan-eslint-config
  const needle = packageName.replace(/^@/v, '').replace(/\//v, '-');
  const pattern = new RegExp(String.raw`^${needle}-\d`, 'v');
  const tarballs = files.filter(
    file => file.endsWith('.tgz') && pattern.test(file),
  );
  const [tgzName] = tarballs;
  if (tarballs.length !== 1 || tgzName === undefined) {
    const count = String(tarballs.length);
    throw new Error(
      `Expected exactly 1 tarball matching "${needle}", found ${count}`,
    );
  }
  return tgzName;
};

const collectTarballs = (): readonly TarballEntry[] => {
  const wsRoot = getWorkspaceRoot();
  const packDirs = [
    // Monorepo: per-package tarballs
    ...globSync('packages/*/dist/packages/npm', { cwd: wsRoot }),
    // Single-package: root tarballs
    ...globSync('dist/packages/npm', { cwd: wsRoot }),
  ];
  return packDirs.flatMap((packDir) => {
    const abs = path.join(wsRoot, packDir);
    return readdirSync(abs).map(file => ({ dir: abs, name: file }));
  });
};

/*
 * Tarball discovery is stable for the duration of a worker — packs don't
 * change mid-run. Memoize separately from workspace metadata so each cache
 * owns its own module-level state.
 */
const cache: {
  tarballs?: readonly TarballEntry[];
} = {};

const getTarballs = (): readonly TarballEntry[] =>
  cache.tarballs ??= collectTarballs();

const locateTarballFrom = (
  entries: readonly TarballEntry[],
  packageName: string,
): string => {
  const name = matchTarball(entries.map(entry => entry.name), packageName);
  const match = entries.find(entry => entry.name === name);
  if (match === undefined) {
    throw new Error(`Tarball ${name} not found`);
  }
  return path.join(match.dir, match.name);
};

/**
 * Resolves a package to its built tarball path, plus the tarballs of all
 * transitive workspace dependencies. Used to feed `npm install` alongside
 * pinned external packages.
 */
export const resolveTarballs = (packageName: string): readonly string[] => {
  const entries = getTarballs();
  const index = getWorkspaceIndex();
  const names = [...new Set([packageName, ...resolveWorkspaceDeps(packageName, index)])];
  return names.map(name => locateTarballFrom(entries, name));
};
