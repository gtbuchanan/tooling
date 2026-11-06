import type { WorkspacePackage } from '#src/core/discovery.js';
import type { Finding, PlanContext } from '#src/tasks/toolchain.js';
import { published } from '#src/toolchains/npm/capabilities.js';
import { workspaceDependenciesOf } from '#src/toolchains/npm/manifest.js';

const isPublished = (pkg: WorkspacePackage): boolean => pkg.capabilities.has(published);

/**
 * Flags a published package that declares a *private* workspace package among
 * its install-time dependencies. pnpm rewrites the `workspace:` specifier to a
 * concrete version at pack time, so the published tarball points at a version
 * that was never published to npm and a consumer's install fails to resolve
 * it. The drift is the *presence* of a declaration, so the fix is editing
 * `package.json`, not `gtb sync`.
 *
 * The e2e suite can't catch this: its harness installs each workspace
 * dependency's local tarball alongside the package under test, which resolves
 * a private dependency just fine while a real consumer 404s.
 *
 * A name matching no workspace package is left alone — pnpm's own install
 * fails on an unresolvable `workspace:` specifier, so verify adds nothing.
 */
export const planPublishableDependencies = (
  { discovery: { packages, root } }: PlanContext,
): readonly Finding[] => {
  /* The root is a workspace project too, so a `workspace:` specifier can
     resolve to it. It isn't in `packages` in a monorepo, so index it
     separately; in a single-package repo it *is* `packages[0]` and dedupes. */
  const byName = new Map([root, ...packages].map(pkg => [pkg.name, pkg]));
  const isPrivateWorkspacePackage = (name: string): boolean => {
    const pkg = byName.get(name);

    return pkg !== undefined && !isPublished(pkg);
  };

  return packages
    .filter(isPublished)
    .flatMap(pkg =>
      workspaceDependenciesOf(pkg)
        .filter(isPrivateWorkspacePackage)
        .map((dep): Finding => ({
          kind: 'problem',
          message:
            `${pkg.dir}: dependency '${dep}' is a private workspace package — ` +
            'publish it, or move it to devDependencies if it is bundled at build time',
        })));
};
