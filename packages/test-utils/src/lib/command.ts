import type { SpawnOptions, SpawnSyncOptions } from 'node:child_process';
import { devNull } from 'node:os';
import crossSpawn from 'cross-spawn';

/**
 * Result of a child process execution.
 */
export interface CommandResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * Git environment with isolation properties and optional identity.
 */
interface GitEnv extends NodeJS.ProcessEnv {
  readonly GIT_AUTHOR_EMAIL?: string;
  readonly GIT_AUTHOR_NAME?: string;
  readonly GIT_COMMITTER_EMAIL?: string;
  readonly GIT_COMMITTER_NAME?: string;
  readonly GIT_CONFIG_GLOBAL: string;
  readonly GIT_CONFIG_NOSYSTEM: string;
}

/**
 * Creates a Git environment isolated from user/system config (e.g. GPG signing, hooks).
 * Optionally includes a committer identity for commands that require one.
 */
export const createGitEnv = (identity?: { email: string; name: string }): GitEnv => ({
  ...process.env,
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: '1',
  ...(identity && {
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_AUTHOR_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name,
  }),
});

/*
 * Every fixture stands up its own project and installs into it, so each one
 * pays for whatever the registry is asked for, and the audit request posts the
 * whole dependency tree for a report no test reads. Left in, those round-trips
 * dominate the suite's wall time and are what pushes tests past their timeout
 * whenever the registry is slow.
 *
 * Trusting the cache costs correctness, which is why `npmInstall` exists: a
 * packument cached before a version was published reports that version as
 * nonexistent, and the specs being exact is what exposes the fixture to it
 * rather than what protects it. The retry pays the round-trip only then.
 */
const offlineFirstFlags = ['--prefer-offline', '--no-audit', '--no-fund'];

const revalidateFlags = ['--prefer-online', '--no-audit', '--no-fund'];

/**
 * Options for {@link npmInstallArgs}.
 */
export interface NpmInstallArgsOptions {
  /**
   * Reach the registry for metadata instead of trusting the cache.
   * @defaultValue false
   */
  readonly revalidate?: boolean;
}

/**
 * Builds the argv for a fixture's `npm install`, given the specs to install.
 */
export const npmInstallArgs = (
  specs: readonly string[],
  options: NpmInstallArgsOptions = {},
): readonly string[] => [
  'install',
  ...specs,
  ...(options.revalidate === true ? revalidateFlags : offlineFirstFlags),
];

/**
 * A failed {@link exec}, as {@link formatExecError} receives it.
 */
export interface ExecFailure {
  readonly args: readonly string[];
  readonly command: string;
  readonly status: number | null;
  readonly stderr: string;
  readonly stdout: string;
}

const maxOutputLines = 40;

/**
 * Builds the message for a failed {@link exec}, appending the tail of whatever
 * the child wrote. A fixture's `npm install` reports its cause in one line —
 * `npm error notarget No matching version found for …` — and discarding it
 * leaves only an exit code, which names no cause at all.
 */
export const formatExecError = (failure: ExecFailure): string => {
  const summary = `${[failure.command, ...failure.args].join(' ')} exited with ${String(
    failure.status,
  )}`;
  const output = [failure.stdout, failure.stderr]
    .map(stream => stream.trim())
    .filter(stream => stream !== '')
    .join('\n');
  if (output === '') {
    return summary;
  }
  const lines = output.split(/\r?\n/v);
  const tail = lines.slice(-maxOutputLines);
  const notice = tail.length < lines.length
    ? [`… truncated to the last ${String(maxOutputLines)} lines`]
    : [];
  return [summary, '', ...notice, ...tail].join('\n');
};

const decodeStream = (stream: string | Buffer | null): string => {
  if (stream === null) {
    return '';
  }
  return typeof stream === 'string' ? stream : stream.toString('utf8');
};

/*
 * Captured rather than discarded, so a failure carries its cause. 10MB is
 * ~1000x what a fixture's `npm install` emits with `--no-fund --no-audit` on a
 * non-TTY; past it spawnSync reports ENOBUFS, which still beats silence.
 */
const maxOutputBytes = 10_000_000;

/**
 * Synchronous exec helper used by fixture setup (`npm init`, `npm install`).
 * Throws on spawn error or non-zero exit. Internal to the test-utils package.
 */
export const exec = (command: string, args: readonly string[], options: SpawnSyncOptions): void => {
  const result = crossSpawn.sync(command, [...args], {
    ...options,
    maxBuffer: maxOutputBytes,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(formatExecError({
      args,
      command,
      status: result.status,
      stderr: decodeStream(result.stderr),
      stdout: decodeStream(result.stdout),
    }));
  }
};

/*
 * Anchored to npm's own diagnostic line, because the message this reads begins
 * with the whole command: an unanchored code would match a package whose name
 * spells it and buy a retry every genuine failure then pays for. npm reports
 * both codes for the same condition — `ETARGET` as the code and `notarget` on
 * each detail line — and has spelled the prefix `npm ERR!` in past majors.
 */
const staleMetadataPattern = /^npm (?:error|ERR!) (?:code ETARGET\b|notarget\b)/mv;

/**
 * Whether a failed install is npm resolving against a stale packument: it
 * reports a version as nonexistent because the cached metadata predates the
 * version's publication, rather than because the version does not exist.
 */
export const isStaleMetadataFailure = (message: string): boolean =>
  staleMetadataPattern.test(message);

/**
 * Runs a command the way {@link exec} does. Injected so {@link npmInstall}'s
 * retry can be exercised without reaching a registry.
 */
export type ExecRunner = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptions,
) => void;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Installs `specs` into `cwd`, retrying against the registry when the first
 * attempt fails the way a stale packument makes it fail.
 *
 * `--prefer-offline` bypasses staleness checks and fetches only what is
 * missing, so a packument cached before a version was published reports that
 * version as nonexistent. A dependency bump leaves the cache in exactly that
 * state, which is when the fixtures run. Retrying only on that signature keeps
 * every genuine failure as fast as it was.
 */
export const npmInstall = (
  cwd: string,
  specs: readonly string[],
  run: ExecRunner = exec,
): void => {
  try {
    run('npm', npmInstallArgs(specs), { cwd });
  } catch (error) {
    if (!isStaleMetadataFailure(messageOf(error))) {
      throw error;
    }
    run('npm', npmInstallArgs(specs, { revalidate: true }), { cwd });
  }
};

/**
 * Spawns a command, captures stdout/stderr, and returns the result.
 */
export const runCommand = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
): Promise<CommandResult> => new Promise((resolve, reject) => {
  const child = crossSpawn(command, args, {
    ...options,
    stdio: 'pipe',
  });

  let stdout = '';
  let stderr = '';

  child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk;
  });

  child.on('error', reject);
  child.on('close', (code) => {
    resolve({
      exitCode: code ?? 1,
      stderr,
      stdout,
    });
  });
});
