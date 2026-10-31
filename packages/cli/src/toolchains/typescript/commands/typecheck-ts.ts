import { defineCommand } from 'citty';
import { run } from '#src/core/process.js';
import { typecheckTsLeaf } from '#src/toolchains/typescript/leaves.js';

/**
 * Runs `tsc --noEmit` for type-checking with optional pass-through args.
 */
export const typecheckTs = defineCommand({
  meta: {
    description: 'Type-check TypeScript via `tsc --noEmit`',
    name: typecheckTsLeaf.name,
  },
  run: async ({ rawArgs }) => {
    await run('tsc', { args: ['--noEmit', ...rawArgs] });
  },
});
