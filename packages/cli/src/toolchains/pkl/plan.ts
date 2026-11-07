import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { WorkspacePackage } from '#src/core/discovery.js';
import { resolveHostedRepository } from '#src/core/repository.js';
import { readParsedManifest } from '#src/core/workspace.js';
import type { Finding, PlanContext } from '#src/tasks/toolchain.js';
import { pklPackage } from '#src/toolchains/pkl/capabilities.js';
import { patchPackageBlock } from '#src/toolchains/pkl/pkl-project.js';

/**
 * The scheme-less repo path (`host/owner/repo`) of the root manifest's
 * repository.
 */
const resolveRepoPath = (rootDir: string): string => {
  const { domain, owner, project } = resolveHostedRepository(rootDir);

  return `${domain}/${owner}/${project}`;
};

/*
 * Patches an author-owned `PklProject` rather than generating it, since the
 * file legitimately holds author content (`dependencies`, `evaluatorSettings`,
 * package metadata). Sync owns only the three version-derived fields in the
 * `package {}` block (see `patchPackageBlock`); `name` and everything else are
 * preserved verbatim. `baseUri` and `packageZipUrl` are written as `\(name)`
 * and `\(name)@\(version)` interpolations respectively, which are byte-stable,
 * so only the `version` literal changes across releases. The changeset-managed
 * `package.json` `version` is the single source of truth.
 */
const planPklProject = (
  pkg: WorkspacePackage,
  isMonorepo: boolean,
  repoPath: string,
): readonly Finding[] => {
  const filePath = path.join(pkg.dir, 'PklProject');
  const { version } = readParsedManifest(pkg.dir);
  if (version === undefined) {
    throw new Error(
      `${path.join(pkg.dir, 'package.json')}: missing "version" to stamp into PklProject`,
    );
  }
  const current = readFileSync(filePath, 'utf8');
  const content = patchPackageBlock(current, { isMonorepo, repoPath, version });

  return content === current
    ? []
    : [{
        changes: ['out of date'],
        content,
        kind: 'write',
        path: filePath,
      }];
};

/**
 * Stamps the `package.json` version into the `PklProject` of every publishable
 * Pkl package, the only fields of the file sync owns.
 */
export const planPklProjects = ({ discovery }: PlanContext): readonly Finding[] => {
  const publishable = discovery.packages.filter(pkg => pkg.capabilities.has(pklPackage));
  // Resolve the repo path, and so require one, only when a package needs it.
  if (publishable.length === 0) {
    return [];
  }
  const repoPath = resolveRepoPath(discovery.rootDir);

  return publishable.flatMap(pkg => planPklProject(pkg, discovery.isMonorepo, repoPath));
};
