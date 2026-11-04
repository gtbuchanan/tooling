import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findUpSync } from 'find-up-simple';
import * as v from 'valibot';
import { parse } from 'yaml';
import { readJsonFile } from '#src/core/file-writer.js';
import { type Manifest, ManifestSchema } from '#src/core/manifest.js';
import { StringArray } from '#src/core/schemas.js';

/**
 * One `packages` glob from pnpm-workspace.yaml and the package directories it
 * resolved to.
 */
export interface PackageGlob {
  /**
   * Absolute directories of the packages the glob matched.
   */
  readonly dirs: readonly string[];
  /**
   * The glob as written in pnpm-workspace.yaml.
   */
  readonly pattern: string;
}

/**
 * Resolved workspace context for pack operations.
 */
export interface WorkspaceContext {
  readonly packageDirs: readonly string[];
  /**
   * The `packages` globs from pnpm-workspace.yaml. Empty in single-package mode.
   */
  readonly packageGlobs: readonly PackageGlob[];
  readonly rootDir: string;
}

/**
 * Options for {@link resolveWorkspace}.
 */
export interface ResolveWorkspaceOptions {
  /**
   * Directory to search from. Defaults to `process.cwd()`.
   */
  readonly cwd?: string;
}

/**
 * Resolves the workspace context from the given directory.
 * If a pnpm-workspace.yaml with non-empty `packages` globs is found,
 * resolves to monorepo mode. Otherwise, single-package mode using cwd.
 */
export const resolveWorkspace = (
  options?: ResolveWorkspaceOptions,
): WorkspaceContext => {
  const cwd = options?.cwd ?? process.cwd();
  const workspaceFile = findUpSync('pnpm-workspace.yaml', { cwd });
  if (workspaceFile !== undefined) {
    const rootDir = path.dirname(workspaceFile);
    /*
     * Only a directory holding a package.json is a project, as pnpm counts
     * them. A deleted package or a branch switch leaves its untracked
     * node_modules/ and dist/ behind, and treating that husk as a package
     * would make generated config depend on what a checkout has lying around.
     */
    const packageGlobs = parsePackageGlobs(workspaceFile).map(pattern => ({
      dirs: globSync(`${pattern}/package.json`, { cwd: rootDir })
        .map(manifest => path.resolve(rootDir, path.dirname(manifest))),
      pattern,
    }));
    const packageDirs = packageGlobs.flatMap(({ dirs }) => dirs);
    if (packageDirs.length > 0) {
      return { packageDirs, packageGlobs, rootDir };
    }
  }

  return { packageDirs: [cwd], packageGlobs: [], rootDir: cwd };
};

const WorkspaceSchema = v.object({
  packages: v.optional(v.nullable(StringArray)),
});

/**
 * Extracts package glob patterns from pnpm-workspace.yaml.
 */
const parsePackageGlobs = (workspaceFile: string): readonly string[] => {
  const content = readFileSync(workspaceFile, 'utf8');
  const { packages } = v.parse(WorkspaceSchema, parse(content));
  return packages ?? [];
};

/**
 * Reads and parses a package.json from the given directory.
 */
export const readManifest = (dir: string): unknown =>
  readJsonFile(path.join(dir, 'package.json'));

/**
 * Reads and validates a package.json as a {@link Manifest}.
 */
export const readParsedManifest = (dir: string): Manifest =>
  v.parse(ManifestSchema, readManifest(dir));
