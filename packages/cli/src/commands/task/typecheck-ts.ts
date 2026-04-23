import { defineCommand } from 'citty';
import { run } from '../../lib/process.ts';

/** Runs `tsc --noEmit` for type-checking with optional pass-through args. */
export const typecheckTs = defineCommand({
  meta: {
    description: 'Type-check TypeScript via `tsc --noEmit`',
    name: 'typecheck:ts',
  },
  run: async ({ rawArgs }) => {
    await run('tsc', { args: ['--noEmit', ...rawArgs] });
  },
});
