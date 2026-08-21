import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { defineCommand } from 'citty';
import {
  buildOutDir, packNpmOutDirEntries, skillsOutDirEntry,
} from '../../lib/dist-source.ts';
import { run } from '../../lib/process.ts';

/*
 * Entries this task must leave in place. The `pack:npm` docs and manifest are
 * unconditional — that task restores them from its own cache entry rather than
 * re-deriving them here. The compiled skills are conditional on the package
 * still authoring any: while it does, `compile:skills` owns the subtree and
 * nothing orders that task against this one, so deleting it would race. Once
 * the authored directory is gone that task stops running (and stops being
 * generated at all), leaving nobody to clear what it last wrote — so the
 * subtree becomes ours to remove, exactly like any other orphaned output.
 */
const preservedEntries = (pkgDir: string): readonly string[] => [
  ...packNpmOutDirEntries,
  ...(existsSync(path.join(pkgDir, skillsOutDirEntry)) ? [skillsOutDirEntry] : []),
];

/**
 * Removes the output of a prior `compile:ts` so the next emit is authoritative.
 *
 * tsc doesn't record what it emitted and so never deletes output whose source
 * was since renamed or removed — the orphan stays behind and `pack:npm` ships
 * it. The stale `.tsbuildinfo` goes too: left in place after the files it
 * describes are gone, it reports them as up to date and tsc emits nothing.
 */
export const clearCompiledOutput = (pkgDir: string): void => {
  const outDir = path.join(pkgDir, buildOutDir);
  if (!existsSync(outDir)) {
    return;
  }

  const preserved = preservedEntries(pkgDir);
  for (const entry of readdirSync(outDir)) {
    if (preserved.includes(entry)) {
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
