import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { findUpSync } from 'find-up-simple';
import { run } from '../../lib/process.ts';
import type { CustomCommandDef } from '../types.ts';

const mergedLcov = 'dist/coverage/vitest/merged/lcov.info';
const fastLcov = 'dist/coverage/vitest/fast/lcov.info';
/*
 * Turbo output sentinel. Writing this file after a successful upload
 * lets turbo cache the task — on cache hit (same lcov inputs), turbo
 * skips the upload entirely. Codecov flag carryforward covers the gap
 * for unchanged packages. Must match the `outputs` in turbo.json.
 */
const sentinelDir = 'dist/coverage/codecov';
const sentinelFile = join(sentinelDir, '.uploaded');

/** Resolves the repo root for Codecov network file listing. */
const resolveNetworkRoot = (): string => {
  const cwd = process.cwd();
  const gitPath = findUpSync('.git', { cwd });
  return process.env['GITHUB_WORKSPACE'] ??
    (gitPath === undefined ? undefined : dirname(gitPath)) ??
    cwd;
};

/** Writes the turbo cache sentinel after a successful upload. */
const writeSentinel = (): void => {
  mkdirSync(sentinelDir, { recursive: true });
  writeFileSync(sentinelFile, '');
};

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

    await run('codecov', {
      args: [
        'upload-process',
        '--disable-search',
        '--network-root-folder', resolveNetworkRoot(),
        '-f', file,
        '-F', basename(process.cwd()),
        ...args,
      ],
    });

    writeSentinel();
  },
  name: 'coverage:codecov:upload',
} as const satisfies CustomCommandDef;
