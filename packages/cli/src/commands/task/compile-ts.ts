import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { defineCommand } from 'citty';
import { buildOutDir, foreignOutDirEntries } from '../../lib/dist-source.ts';
import { run } from '../../lib/process.ts';

/**
 * Removes the output of a prior `compile:ts` so the next emit is authoritative.
 *
 * tsc doesn't record what it emitted and so never deletes output whose source
 * was since renamed or removed — the orphan stays behind and `pack:npm` ships
 * it. The stale `.tsbuildinfo` goes too: left in place after the files it
 * describes are gone, it reports them as up to date and tsc emits nothing.
 *
 * Entries another task owns are left alone. `compile:skills` has no edge
 * ordering it against this task, so deleting its subtree would race it, and
 * the `pack:npm` docs and manifest are restored from that task's own cache
 * entry rather than re-derived here.
 */
export const clearCompiledOutput = (pkgDir: string): void => {
  const outDir = path.join(pkgDir, buildOutDir);
  if (!existsSync(outDir)) {
    return;
  }

  for (const entry of readdirSync(outDir)) {
    if (foreignOutDirEntries.includes(entry)) {
      continue;
    }
    rmSync(path.join(outDir, entry), { force: true, recursive: true });
  }
};

/**
 * Runs `tsc -p tsconfig.build.json` to emit compiled output.
 */
export const compileTs = defineCommand({
  meta: {
    description: 'Compile TypeScript via tsc using tsconfig.build.json',
    name: 'compile:ts',
  },
  run: async ({ rawArgs }) => {
    clearCompiledOutput(process.cwd());
    await run('tsc', { args: ['-p', 'tsconfig.build.json', ...rawArgs] });
  },
});
