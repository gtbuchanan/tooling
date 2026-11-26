import { createRequire } from 'node:module';
import path from 'node:path';
import type { WorkspacePackage } from '#src/core/discovery.js';
import type { Finding, PlanContext } from '#src/tasks/toolchain.js';
import { compileTsdownLeaf } from '#src/toolchains/tsdown/leaves.js';

/*
 * Resolved the way Node would from the package, so a tsdown installed at the
 * workspace root counts: pnpm puts the root's binaries on every package
 * script's PATH, which is where compile:tsdown finds it.
 */
const canResolveTsdown = (pkg: WorkspacePackage): boolean => {
  try {
    createRequire(path.join(pkg.dir, 'package.json')).resolve('tsdown/package.json');
    return true;
  } catch {
    return false;
  }
};

/**
 * Flags each package `compile:tsdown` applies to that cannot resolve tsdown.
 *
 * tsdown is an optional peer of the CLI, since most packages never bundle,
 * so no install warns when a package that does lacks it. Without this the
 * first sign is `compile:tsdown` failing to spawn tsdown. The fix is a
 * dependency only the author can add, so each is a problem rather than a
 * write.
 */
export const planTsdownInstalled = ({ discovery }: PlanContext): readonly Finding[] =>
  discovery.packages
    .filter(pkg => compileTsdownLeaf.appliesTo(pkg) && !canResolveTsdown(pkg))
    .map((pkg): Finding => ({
      kind: 'problem',
      message: `${pkg.dir}: tsdown.config.* needs tsdown — add it to devDependencies`,
    }));
