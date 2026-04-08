import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { findUpSync } from 'find-up-simple';

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
    const packageDirs = resolvePackageGlobs(rootDir, workspaceFile);
    if (packageDirs.length > 0) {
      return { packageDirs, rootDir };
    }
  }

  return { packageDirs: [cwd], rootDir: cwd };
};

const packagesPattern = /^packages:\s*$/mv;

const globEntryPattern =
  /^\s+-\s+'(?<sq>[^']+)'|^\s+-\s+"(?<dq>[^"]+)"|^\s+-\s+(?<bare>\S+)/v;

const wildcardSuffix = '/*';

/** Parses `packages` globs from pnpm-workspace.yaml and resolves them to absolute directories. */
const resolvePackageGlobs = (
  rootDir: string,
  workspaceFile: string,
): readonly string[] => {
  const globs = parsePackageGlobs(workspaceFile);
  if (globs.length === 0) {
    return [];
  }

  return globs.flatMap(pattern => resolveGlob(rootDir, pattern));
};

/**
 * Resolves a simple glob pattern (e.g., `packages/*`) to absolute directories.
 * Handles `dir/*` patterns by listing subdirectories. Falls back to treating
 * the pattern as a literal path.
 */
const resolveGlob = (
  rootDir: string,
  pattern: string,
): readonly string[] => {
  if (pattern.endsWith(wildcardSuffix)) {
    const parentDir = join(
      rootDir,
      pattern.slice(0, -wildcardSuffix.length),
    );
    try {
      return readdirSync(parentDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => resolve(parentDir, entry.name));
    }
    catch {
      return [];
    }
  }

  return [resolve(rootDir, pattern)];
};

/** Extracts a glob string from a YAML list entry match. */
const extractGlob = (match: RegExpExecArray): string | undefined =>
  match.groups?.['sq'] ??
  match.groups?.['dq'] ??
  match.groups?.['bare'];

/** Collects consecutive YAML list entries from lines starting at the given index. */
const collectGlobEntries = (
  lines: readonly string[],
  startIndex: number,
): readonly string[] => {
  const globs: string[] = [];
  for (let idx = startIndex; idx < lines.length; idx++) {
    const match = globEntryPattern.exec(lines[idx] ?? '');
    if (match === null) {
      break;
    }
    const glob = extractGlob(match);
    if (glob !== undefined) {
      globs.push(glob);
    }
  }
  return globs;
};

/** Extracts package glob patterns from pnpm-workspace.yaml content. */
const parsePackageGlobs = (
  workspaceFile: string,
): readonly string[] => {
  const lines = readFileSync(workspaceFile, 'utf-8').split('\n');
  const packagesIndex = lines.findIndex(
    line => packagesPattern.test(line),
  );
  if (packagesIndex === -1) {
    return [];
  }

  return collectGlobEntries(lines, packagesIndex + 1);
};

/** Reads and parses a package.json from the given directory. */
export const readManifest = (dir: string): unknown =>
  JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
