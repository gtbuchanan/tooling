import { statSync } from 'node:fs';
import { defineCommand } from 'citty';
import crossSpawn from 'cross-spawn';
import { trySpawn } from '../../lib/process.ts';
import { rootNames } from './names.ts';

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

const installPreCommitHooks = async (): Promise<void> => {
  if (isLinkedWorktree()) {
    console.log('linked worktree, skipping hook installation');
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

const syncInstalledSkills = async (): Promise<void> => {
  if (!await trySpawn('skills-npm', ['--recursive', '--yes'])) {
    console.log('skills-npm unavailable, skipping skill symlinking');
  }
};

/**
 * Installs pre-commit hooks and symlinks skills from installed packages.
 *
 * Hooks: prek first (Rust, fast), falls back to pre-commit (Python) on
 * platforms where prek is unavailable. Skipped in linked worktrees
 * (hooks inherited via shared `core.hooksPath`).
 *
 * Skills: `skills-npm --recursive` discovers `skills/` in every installed
 * package and symlinks them into the agent directories it detects on
 * the machine. Runs unconditionally — linked worktrees have their own
 * `node_modules` and agent dirs. Silently skipped when `skills-npm`
 * isn't installed (consumers opt in).
 */
export const prepare = defineCommand({
  meta: {
    description: 'Install pre-commit hooks and sync installed skills',
    name: rootNames.prepare,
  },
  run: async () => {
    await installPreCommitHooks();
    await syncInstalledSkills();
  },
});
