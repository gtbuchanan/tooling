import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { run } from '../../lib/process.ts';
import type { CustomCommandDef } from '../types.ts';

const mergedLcov = 'dist/coverage/vitest/merged/lcov.info';
const fastLcov = 'dist/coverage/vitest/fast/lcov.info';

/** Resolves the best available lcov file (merged over fast). */
const resolveLcov = (): string | undefined => {
  if (existsSync(mergedLcov)) {
    return mergedLcov;
  }
  if (existsSync(fastLcov)) {
    return fastLcov;
  }
  return undefined;
};

/** Uploads coverage to Codecov. No-ops outside CI. */
export const def = {
  handler: async (args) => {
    if (!process.env['CI']) {
      console.log('Codecov upload skipped (not in CI)');
      return;
    }

    const file = resolveLcov();
    if (file === undefined) {
      console.log('No coverage files found, skipping Codecov upload');
      return;
    }

    const flag = basename(process.cwd());

    await run('codecov', {
      args: [
        'upload-process',
        '--disable-search',
        '-f', file,
        '-F', flag,
        ...args,
      ],
    });
  },
  name: 'coverage:codecov:upload',
} as const satisfies CustomCommandDef;
