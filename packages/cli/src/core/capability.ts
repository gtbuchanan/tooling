import type { Manifest } from '#src/core/manifest.js';

/**
 * What discovery reads once for every capability asked of a directory.
 */
export interface CapabilitySource {
  /**
   * Absolute path to the directory.
   */
  readonly dir: string;
  /**
   * The names of everything directly inside the directory, files and
   * directories alike.
   */
  readonly entries: readonly string[];
  /**
   * The directory's `package.json`, or `{}` when it has none.
   */
  readonly manifest: Manifest;
}

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
