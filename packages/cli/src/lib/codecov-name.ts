import type { PackageCapabilities } from './discovery.ts';
import { unscopedName } from './manifest.ts';

/**
 * Codecov flag name for a package: its unscoped manifest name.
 *
 * Deliberately *not* the directory basename. Codecov compares a flag against
 * its own history across commits, so the name has to mean the same thing in
 * every checkout, and a basename does not — a worktree or clone renames it.
 * That bites hardest in a single-package repo, whose sole package is the
 * checkout root itself. The scope is stripped because Codecov flag names
 * don't accept `@` or `/`.
 */
export const codecovName = (pkg: PackageCapabilities): string => unscopedName(pkg.name);
