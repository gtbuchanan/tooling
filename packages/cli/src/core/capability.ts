import { type Dirent, type Stats, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Manifest } from '#src/core/manifest.js';

/**
 * One directory as discovery lists it once for every capability asked of it.
 */
export interface DirectoryListing {
  /**
   * Absolute path to the directory.
   */
  readonly dir: string;
  /**
   * The names of the directories directly inside it.
   */
  readonly directories: readonly string[];
  /**
   * The names of the files directly inside it. Only files: a *directory*
   * called `tsconfig.json` answers a name check, and counting one would put
   * the package in the plan and leave a generator writing over a directory.
   */
  readonly files: readonly string[];
}

/**
 * What a capability is detected from.
 */
export interface CapabilitySource extends DirectoryListing {
  /**
   * The directory's `package.json`, or `{}` when it has none.
   */
  readonly manifest: Manifest;
}

/**
 * The entries of a directory, or none where it cannot be read.
 */
export const readEntries = (dir: string): readonly Dirent[] => {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

/*
 * What an entry is, following a symlink to its target: the tools whose
 * configs the capabilities look for read through a link, so detection does
 * too. A link to nothing, or one that loops, is neither.
 */
type EntryKind = Pick<Stats, 'isDirectory' | 'isFile'>;

const resolve = (dir: string, entry: Dirent): EntryKind | undefined => {
  if (!entry.isSymbolicLink()) {
    return entry;
  }
  try {
    return statSync(path.join(dir, entry.name), { throwIfNoEntry: false });
  } catch {
    return undefined;
  }
};

interface ResolvedEntry {
  readonly kind: EntryKind | undefined;
  readonly name: string;
}

const namesWhere = (
  entries: readonly ResolvedEntry[],
  isWanted: (kind: EntryKind) => boolean,
): readonly string[] =>
  entries.filter(({ kind }) => kind !== undefined && isWanted(kind)).map(({ name }) => name);

/**
 * One directory as a capability reads it, empty where it cannot be read.
 */
export const listDirectory = (dir: string): DirectoryListing => {
  const entries = readEntries(dir).map(entry => ({ kind: resolve(dir, entry), name: entry.name }));

  return {
    dir,
    directories: namesWhere(entries, kind => kind.isDirectory()),
    files: namesWhere(entries, kind => kind.isFile()),
  };
};

/**
 * A fact about a workspace package, which one toolchain declares and
 * discovery records where it holds. The workspace root is detected as a
 * package too.
 *
 * A capability is a fact rather than a decision: `eslint` says a package uses
 * ESLint, and which leaves apply because of it is each leaf's call. That is
 * what lets a second toolchain read a capability the first declared. Compared
 * by identity, so the object a toolchain exports is the one every reader asks
 * for.
 */
export interface Capability {
  readonly detect: (source: CapabilitySource) => boolean;
  /**
   * What a test diff prints it as.
   */
  readonly name: string;
}
