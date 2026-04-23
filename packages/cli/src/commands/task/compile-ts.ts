import { defineCommand } from 'citty';
import { run } from '../../lib/process.ts';

/** Runs `tsc -p tsconfig.build.json` to emit compiled output. */
export const compileTs = defineCommand({
  meta: {
    description: 'Compile TypeScript via tsc using tsconfig.build.json',
    name: 'compile:ts',
  },
  run: async ({ rawArgs }) => {
    await run('tsc', { args: ['-p', 'tsconfig.build.json', ...rawArgs] });
  },
});
