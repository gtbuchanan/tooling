import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { type CommandDef, defineCommand } from 'citty';
import { findUpSync } from 'find-up-simple';
import * as v from 'valibot';
import { discoverPackage } from '#src/core/discovery.js';
import { run } from '#src/core/process.js';
import type { Report } from '#src/tasks/leaf.js';
import { codecovName } from '#src/toolchains/codecov/codecov-name.js';
import { coverageCodecovUploadLeaf } from '#src/toolchains/codecov/leaves.js';

const HeadSchema = v.object({
  sha: v.string(),
});

const PullRequestEventSchema = v.object({
  pull_request: v.object({
    head: HeadSchema,
  }),
});

const resolveNetworkRoot = (): string => {
  const cwd = process.cwd();
  const gitPath = findUpSync('.git', { cwd });
  return process.env['GITHUB_WORKSPACE'] ??
    (gitPath === undefined ? undefined : path.dirname(gitPath)) ??
    cwd;
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

/**
 * Uploads the declared coverage reports to Codecov. No-ops outside CI.
 */
export const coverageCodecovUpload = (
  reports: readonly Report[],
): CommandDef => defineCommand({
  meta: {
    description: 'Upload the declared coverage reports to Codecov (no-op outside CI)',
    name: coverageCodecovUploadLeaf.name,
  },
  run: async ({ rawArgs }) => {
    if (!process.env['CI']) {
      console.log('Codecov upload skipped (not in CI)');
      return;
    }

    const files = reports.map(report => report.path).filter(file => existsSync(file));
    if (files.length === 0) {
      console.log('No coverage files found, skipping Codecov upload');
      return;
    }

    const sha = resolveCommitSha();
    /*
     * Must match the flag `gtb sync` writes into codecov.yml for this
     * package, so both go through codecovName — otherwise the upload
     * lands under a flag the config never declared. The name is all it
     * reads, so no capability needs detecting.
     */
    const flag = codecovName(discoverPackage(process.cwd(), []));

    await run('codecov', {
      args: [
        /*
         * An option of `codecov` rather than of `upload-process`, so it
         * precedes the subcommand — the CLI rejects it after with `No such
         * option`. Nothing here reads the telemetry, and its flush holds the
         * process open at the end of every upload.
         */
        '--disable-telem',
        'upload-process',
        '--disable-search',
        '--network-root-folder', resolveNetworkRoot(),
        ...(sha === undefined ? [] : ['-C', sha]),
        ...files.flatMap(file => ['-f', file]),
        '-F', flag,
        ...rawArgs,
      ],
    });
  },
});
