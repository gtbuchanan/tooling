import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Generator } from '#src/codegen/generator.js';
import {
  checkMiseTasksInclude, generateMiseTasks, miseTasksFileName,
} from '#src/codegen/mise-tasks.js';

/**
 * `mise.tasks.toml`, which wires the hk mise tasks.
 */
export const miseGenerator: Generator = {
  /*
   * The hk task wiring is only useful in repos that pin tools with mise, so
   * gate generation on a mise.toml at the root. The `[task_config] includes`
   * line that loads this file stays a manual, one-time edit (verify checks
   * it) so sync never round-trips the hand-authored mise.toml.
   */
  sync: ({ discovery, logger }) => {
    if (!discovery.hasMise) {
      return;
    }
    const filePath = path.join(discovery.rootDir, miseTasksFileName);
    writeFileSync(filePath, generateMiseTasks(discovery));
    logger.info(`wrote ${filePath}`);
  },
  verify: ({ discovery }) =>
    (discovery.hasMise ? checkMiseTasksInclude(discovery.rootDir) : []),
};
