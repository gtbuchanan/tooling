import { readdirSync } from 'node:fs';
import { defineCommand } from 'citty';
import { capture } from '#src/core/process.js';
import { localeComparer } from '#src/core/sort.js';
import { typecheckPklLeaf } from '#src/toolchains/pkl/leaves.js';

/**
 * Lists hand-authored Pkl modules in a directory (sorted, excludes PklProject).
 */
export const pklModules = (dir: string): readonly string[] =>
  readdirSync(dir)
    .filter(file => file.endsWith('.pkl'))
    .toSorted(localeComparer);

/**
 * Validates the package's Pkl modules via `pkl eval`. Evaluation is how Pkl
 * type-checks; the rendered output is captured and discarded (we only care
 * that it evaluates), so this produces no artifact — the no-output companion
 * to `pack:pkl`.
 */
export const typecheckPkl = defineCommand({
  meta: {
    description: 'Validate Pkl modules via `pkl eval`',
    name: typecheckPklLeaf.name,
  },
  run: async ({ rawArgs }) => {
    const modules = pklModules(process.cwd());
    if (modules.length === 0) {
      return;
    }
    await capture('pkl', ['eval', ...modules, ...rawArgs]);
  },
});
