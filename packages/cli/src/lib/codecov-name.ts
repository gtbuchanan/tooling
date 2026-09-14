import type { PackageCapabilities } from './discovery.ts';
import { unscopedName } from './manifest.ts';

/**
 * Codecov flag / component name for a package: its unscoped manifest name.
 *
 * Deliberately *not* the directory basename. The basename is a property of
 * the checkout — a worktree or clone renames it — but these names are
 * committed to `codecov.yml`, so a basename-derived name drifts the moment
 * the repo is checked out somewhere else. That bites hardest in a
 * single-package repo, whose sole package is the checkout root itself.
 * A manifest name is the same in every checkout. The scope is stripped
 * because Codecov flag names don't accept `@` or `/`.
 */
export const codecovName = (pkg: PackageCapabilities): string => unscopedName(pkg.name);
