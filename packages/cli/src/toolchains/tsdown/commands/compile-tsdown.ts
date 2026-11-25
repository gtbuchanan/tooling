import { defineCommand } from 'citty';
import { buildOutDir } from '#src/core/dist-source.js';
import { run } from '#src/core/process.js';
import { compileTsdownLeaf } from '#src/toolchains/tsdown/leaves.js';
import { clearCompiledOutput } from '#src/toolchains/typescript/commands/compile-ts.js';

/**
 * The arguments tsdown runs with, `extra` last so a package can override them.
 *
 * The package's tsdown config chooses its entries, format and the rest. What
 * is passed here is what the rest of the build relies on: the directory
 * `pack:npm` packs, the build tsconfig, tsc's extensions in place of the
 * `.mjs` tsdown writes for Node by default, and a source map beside each
 * chunk as `compile:ts` ships. Keeping those lets a package's `publishConfig`
 * paths hold whichever compile leaf applies to it.
 *
 * tsdown's own clean is off because the output directory is shared:
 * `compile:skills` writes into it unordered against this task.
 */
export const compileTsdownArgs = (extra: readonly string[]): readonly string[] => [
  '--out-dir',
  buildOutDir,
  '--tsconfig',
  'tsconfig.build.json',
  '--no-fixed-extension',
  '--sourcemap',
  '--no-clean',
  ...extra,
];

/**
 * Bundles the package with tsdown into the build output directory, after
 * clearing what a prior compile left there, as `compile:ts` does.
 */
export const compileTsdown = defineCommand({
  meta: {
    description: `Bundle with tsdown to ${buildOutDir}`,
    name: compileTsdownLeaf.name,
  },
  run: async ({ rawArgs }) => {
    clearCompiledOutput(process.cwd());
    await run('tsdown', { args: [...compileTsdownArgs(rawArgs)] });
  },
});
