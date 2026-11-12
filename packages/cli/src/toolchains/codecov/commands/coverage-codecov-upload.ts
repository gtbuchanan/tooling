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

const RepoSchema = v.object({
  full_name: v.string(),
});

const ForkBaseSchema = v.object({
  repo: RepoSchema,
});

const ForkHeadSchema = v.object({
  label: v.string(),
  repo: RepoSchema,
});

/*
 * Parsed apart from PullRequestEventSchema so a payload without these
 * fields still yields the head sha. A deleted fork's `head.repo` is null,
 * which fails the parse and leaves the branch to the CLI.
 */
const ForkEventSchema = v.object({
  pull_request: v.object({
    base: ForkBaseSchema,
    head: ForkHeadSchema,
  }),
});

const readEvent = (): unknown => {
  const eventPath = process.env['GITHUB_EVENT_PATH'];
  if (eventPath === undefined || eventPath === '' || !existsSync(eventPath)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(eventPath, 'utf8'));
  } catch {
    /*
     * Unreadable or non-JSON event payloads shouldn't fail the upload —
     * every value read from the payload has a fallback.
     */
    return undefined;
  }
};

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
const resolveCommitSha = (event: unknown): string | undefined => {
  const result = v.safeParse(PullRequestEventSchema, event);
  if (result.success) {
    return result.output.pull_request.head.sha;
  }
  // Push events land here too, where GITHUB_SHA is already the real commit.
  const sha = process.env['GITHUB_SHA'];
  return sha === undefined || sha === '' ? undefined : sha;
};

/*
 * Codecov accepts an upload without a token only for an unprotected
 * branch, which it recognizes by an `owner:branch` name. A fork's run gets
 * no token (nor an OIDC one), but the CLI sends the bare head ref, which
 * Codecov treats as protected and refuses. Pass the head label instead,
 * as codecov/codecov-action does. A same-repository pull request keeps
 * the CLI's own branch detection.
 */
const resolveForkBranch = (event: unknown): string | undefined => {
  const result = v.safeParse(ForkEventSchema, event);
  if (!result.success) {
    return undefined;
  }
  const { base, head } = result.output.pull_request;
  return head.repo.full_name === base.repo.full_name ? undefined : head.label;
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

    const event = readEvent();
    const sha = resolveCommitSha(event);
    const branch = resolveForkBranch(event);
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
        ...(branch === undefined ? [] : ['-B', branch]),
        ...files.flatMap(file => ['-f', file]),
        '-F', flag,
        ...rawArgs,
      ],
    });
  },
});
