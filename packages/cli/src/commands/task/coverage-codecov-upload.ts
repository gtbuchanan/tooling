import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineCommand } from 'citty';
import { findUpSync } from 'find-up-simple';
import * as v from 'valibot';
import { run } from '../../lib/process.ts';

const PullRequestEventSchema = v.object({
  pull_request: v.object({
    head: v.object({
      sha: v.string(),
    }),
  }),
});

const mergedLcov = 'dist/coverage/vitest/merged/lcov.info';
const fastLcov = 'dist/coverage/vitest/fast/lcov.info';
/*
 * Turbo output sentinel. Writing this file after a successful upload
 * lets turbo cache the task — on cache hit (same lcov inputs), turbo
 * skips the upload entirely. Codecov flag carryforward covers the gap
 * for unchanged packages. Must match the `outputs` in turbo.json.
 */
const sentinelDir = 'dist/coverage/codecov';
const sentinelFile = path.join(sentinelDir, '.uploaded');

const resolveNetworkRoot = (): string => {
  const cwd = process.cwd();
  const gitPath = findUpSync('.git', { cwd });
  return process.env['GITHUB_WORKSPACE'] ??
    (gitPath === undefined ? undefined : path.dirname(gitPath)) ??
    cwd;
};

const writeSentinel = (): void => {
  mkdirSync(sentinelDir, { recursive: true });
  writeFileSync(sentinelFile, '');
};

const resolveLcov = (): string | undefined => {
  if (existsSync(mergedLcov)) {
    return mergedLcov;
  }
  if (existsSync(fastLcov)) {
    return fastLcov;
  }
  return undefined;
};

/*
 * On GitHub Actions `pull_request` events, GITHUB_SHA is the ephemeral
 * merge commit (refs/pull/N/merge), not the PR head. The Codecov CLI
 * defaults to that merge SHA, so its commit statuses land on a commit
 * the PR never renders — no checks, no comment. Pull the real head SHA
 * from the event payload and pass it via -C, mirroring what
 * codecov/codecov-action does. See codecov/codecov-cli#474.
 */
const resolveCommitSha = (): string | undefined => {
  const eventPath = process.env['GITHUB_EVENT_PATH'];
  if (eventPath !== undefined && eventPath !== '' && existsSync(eventPath)) {
    try {
      const result = v.safeParse(
        PullRequestEventSchema,
        JSON.parse(readFileSync(eventPath, 'utf8')),
      );
      if (result.success) {
        return result.output.pull_request.head.sha;
      }
    } catch {
      /*
       * Unreadable or non-JSON event payloads shouldn't fail the
       * upload — fall through to GITHUB_SHA (push events land here too,
       * where GITHUB_SHA is already the real commit).
       */
    }
  }
  const sha = process.env['GITHUB_SHA'];
  return sha === undefined || sha === '' ? undefined : sha;
};

/** Uploads coverage to Codecov. No-ops outside CI. */
export const coverageCodecovUpload = defineCommand({
  meta: {
    description: 'Upload merged coverage to Codecov (no-op outside CI)',
    name: 'coverage:codecov:upload',
  },
  run: async ({ rawArgs }) => {
    if (!process.env['CI']) {
      console.log('Codecov upload skipped (not in CI)');
      return;
    }

    const file = resolveLcov();
    if (file === undefined) {
      console.log('No coverage files found, skipping Codecov upload');
      return;
    }

    const sha = resolveCommitSha();

    await run('codecov', {
      args: [
        'upload-process',
        '--disable-search',
        '--network-root-folder', resolveNetworkRoot(),
        ...(sha === undefined ? [] : ['-C', sha]),
        '-f', file,
        '-F', path.basename(process.cwd()),
        ...rawArgs,
      ],
    });

    writeSentinel();
  },
});
