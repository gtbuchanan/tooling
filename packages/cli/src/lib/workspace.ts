import { globSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { findUpSync } from 'find-up-simple';
import * as v from 'valibot';
import { parse } from 'yaml';

/** Resolved workspace context for pack operations. */
export interface WorkspaceContext {
  readonly packageDirs: readonly string[];
  readonly rootDir: string;
}

/** Options for {@link resolveWorkspace}. */
export interface ResolveWorkspaceOptions {
  /** Directory to search from. Defaults to `process.cwd()`. */
  readonly cwd?: string;
}

/**
 * Resolves the workspace root directory from the given starting directory.
 * Looks for pnpm-workspace.yaml upward; falls back to cwd.
 */
export const resolveRootDir = (options?: ResolveWorkspaceOptions): string => {
  const cwd = options?.cwd ?? process.cwd();
  const workspaceFile = findUpSync('pnpm-workspace.yaml', { cwd });
  return workspaceFile === undefined ? cwd : dirname(workspaceFile);
};

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
    const rootDir = dirname(workspaceFile);
    const globs = parsePackageGlobs(workspaceFile);
    const packageDirs = globs.flatMap(pattern =>
      globSync(`${pattern}/`, { cwd: rootDir }).map(dir => resolve(rootDir, dir)),
    );
    if (packageDirs.length > 0) {
      return { packageDirs, rootDir };
    }
  }

  return { packageDirs: [cwd], rootDir: cwd };
};

const WorkspaceSchema = v.object({
  packages: v.optional(v.nullable(v.array(v.string()))),
});

/** Extracts package glob patterns from pnpm-workspace.yaml. */
const parsePackageGlobs = (workspaceFile: string): readonly string[] => {
  const content = readFileSync(workspaceFile, 'utf-8');
  const { packages } = v.parse(WorkspaceSchema, parse(content));
  return packages ?? [];
};

/** Reads and parses a package.json from the given directory. */
export const readManifest = (dir: string): unknown =>
  JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
