import { statSync } from 'node:fs';
import crossSpawn from 'cross-spawn';
import type { CustomCommandDef } from '../types.ts';

/**
 * Tries to spawn a command. Resolves true on exit 0, false on ENOENT
 * (command not found), and rejects on other failures.
 */
const trySpawn = async (
  bin: string,
  args: readonly string[],
): Promise<boolean> =>
  new Promise((resolve, reject) => {
    const child = crossSpawn(bin, [...args], { stdio: 'inherit' });
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        resolve(false);
      } else {
        reject(err);
      }
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        reject(new Error(`${bin} exited with code ${String(code)}`));
      }
    });
  });

/**
 * Linked worktrees have a `.git` file (not directory) pointing to the
 * main repo's `.git/worktrees/<name>`. Hooks are inherited from the
 * shared `core.hooksPath` config — no installation needed.
 */
const isLinkedWorktree = (): boolean => {
  try {
    return statSync('.git').isFile();
  } catch {
    return false;
  }
};

/**
 * Installs pre-commit hooks.
 *
 * Skips in linked worktrees (hooks inherited via shared config). In the
 * main working tree, tries prek first (Rust, fast), then falls back to
 * pre-commit (Python) when prek is unavailable (e.g., Android/Termux).
 */
const prepare = async (): Promise<void> => {
  if (isLinkedWorktree()) {
    console.log('prepare: skipped (linked worktree)');
    return;
  }

  if (await trySpawn('prek', ['install'])) {
    return;
  }

  console.log('prek unavailable, falling back to pre-commit');
  crossSpawn.sync('git', ['config', '--unset-all', 'core.hooksPath']);

  if (await trySpawn('pre-commit', ['install'])) {
    return;
  }

  console.log('pre-commit unavailable, skipping hook installation');
};

/** Installs pre-commit hooks via prek or pre-commit. */
export const def = {
  handler: prepare,
  name: 'prepare',
} as const satisfies CustomCommandDef;
