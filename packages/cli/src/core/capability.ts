import { type Dirent, readdirSync } from 'node:fs';
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

/**
 * One directory as a capability reads it, empty where it cannot be read. A
 * symlink is neither a file nor a directory here, so it answers no check.
 */
export const listDirectory = (dir: string): DirectoryListing => {
  const entries = readEntries(dir);

  return {
    dir,
    directories: entries.filter(entry => entry.isDirectory()).map(entry => entry.name),
    files: entries.filter(entry => entry.isFile()).map(entry => entry.name),
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
