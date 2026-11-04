import path from 'node:path';
import hostedGitInfo from 'hosted-git-info';
import * as v from 'valibot';
import { RootManifestSchema } from '#src/core/manifest.js';
import { readManifest } from '#src/core/workspace.js';

/**
 * The hosted repository the workspace root's manifest names.
 */
export interface HostedRepository {
  /**
   * Host name, e.g. `github.com`.
   */
  readonly domain: string;
  /**
   * Account or organization that owns the repository.
   */
  readonly owner: string;
  /**
   * Repository name.
   */
  readonly project: string;
}

/**
 * Resolves the repository from the root manifest's `homepage` or
 * `repository.url`, parsing the URL with `hosted-git-info` so every Git URL
 * form (`https`, `git+ssh`, scp-style `git@`, …) normalizes the same way.
 */
export const resolveHostedRepository = (rootDir: string): HostedRepository => {
  const root = v.parse(RootManifestSchema, readManifest(rootDir));
  const info = hostedGitInfo.fromUrl(root.homepage ?? '') ??
    hostedGitInfo.fromUrl(root.repository?.url ?? '');
  if (info === undefined) {
    throw new Error(
      `${path.join(rootDir, 'package.json')}: set homepage or repository.url`,
    );
  }

  return { domain: info.domain, owner: info.user, project: info.project };
};
