import { defineCommand } from 'citty';
import { trySpawn } from '../../lib/process.ts';
import { rootNames } from './names.ts';

const syncInstalledSkills = async (): Promise<void> => {
  if (!await trySpawn('skills-npm', ['--recursive', '--yes'])) {
    console.log('skills-npm unavailable, skipping skill symlinking');
  }
};

/**
 * Symlinks skills from installed packages into the agent directories.
 *
 * `skills-npm --recursive` discovers `skills/` in every installed package
 * and symlinks them into the agent directories it detects on the machine.
 * Silently skipped when `skills-npm` isn't installed (consumers opt in).
 *
 * Git hook installation is owned by mise's `postinstall` hook
 * (`hk install --mise`), not this command — see `mise.toml`.
 */
export const prepare = defineCommand({
  meta: {
    description: 'Sync skills from installed packages',
    name: rootNames.prepare,
  },
  run: async () => {
    await syncInstalledSkills();
  },
});
