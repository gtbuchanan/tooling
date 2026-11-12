import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Finding, PlanContext } from '#src/tasks/toolchain.js';
import { generateMiseFragment, miseFragmentFileName } from '#src/toolchains/mise/fragment.js';

// Where gtb wrote the hk tasks before conf.d, loaded through an `includes` entry
const legacyTasksFileName = 'mise.tasks.toml';

const planFragment = (filePath: string, content: string): readonly Finding[] => {
  const stats = statSync(filePath, { throwIfNoEntry: false });
  if (stats === undefined) {
    return [{ changes: ['missing'], content, kind: 'write', path: filePath }];
  }
  if (!stats.isFile()) {
    return [{
      kind: 'problem',
      message: `${filePath}: not a file — remove it so gtb sync can write the hk tasks`,
    }];
  }

  return readFileSync(filePath, 'utf8') === content
    ? []
    : [{ changes: ['out of date'], content, kind: 'write', path: filePath }];
};

/*
While a config still includes it, the old file's tasks take precedence over
conf.d's, so the repository would keep running stale commands. Deleting the
file is enough: mise skips an include naming a file that isn't there. It stays
a problem rather than a deletion because sync only ever writes.
*/
const planLegacyTasks = (filePath: string): readonly Finding[] =>
  (existsSync(filePath)
    ? [{
        kind: 'problem',
        message: `${filePath}: gtb now writes the hk tasks to ${miseFragmentFileName} ` +
          '— delete this file and its [task_config] includes entry',
      }]
    : []);

/**
 * Generates gtb's conf.d fragment. Only a repo configuring mise gets it,
 * whether or not it builds with gtb: an hk-only adopter runs gtb from mise's
 * `npm:` backend. mise loads conf.d without being asked, so a fragment in a
 * repo with no mise config would start configuring one.
 */
export const planMiseFragment = ({ discovery }: PlanContext): readonly Finding[] => {
  if (discovery.miseFiles.every(file => !file.endsWith('.toml'))) {
    return [];
  }

  return [
    ...planFragment(
      path.join(discovery.rootDir, miseFragmentFileName),
      generateMiseFragment(discovery),
    ),
    ...planLegacyTasks(path.join(discovery.rootDir, legacyTasksFileName)),
  ];
};
