import { readdirSync } from 'node:fs';
import { defineCommand } from 'citty';
import { capture } from '../../lib/process.ts';

/** Lists hand-authored Pkl modules in a directory (sorted, excludes PklProject). */
export const pklModules = (dir: string): readonly string[] =>
  readdirSync(dir)
    .filter(file => file.endsWith('.pkl'))
    .toSorted();

/**
 * Validates the package's Pkl modules via `pkl eval`. Evaluation is how Pkl
 * type-checks; the rendered output is captured and discarded (we only care
 * that it evaluates), so this produces no artifact — the no-output companion
 * to `pack:pkl`.
 */
export const typecheckPkl = defineCommand({
  meta: {
    description: 'Validate Pkl modules via `pkl eval`',
    name: 'typecheck:pkl',
  },
  run: async ({ rawArgs }) => {
    const modules = pklModules(process.cwd());
    if (modules.length === 0) {
      return;
    }
    await capture('pkl', ['eval', ...modules, ...rawArgs]);
  },
});
