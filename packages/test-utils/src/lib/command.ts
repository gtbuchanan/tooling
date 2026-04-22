import type { SpawnOptions, SpawnSyncOptions } from 'node:child_process';
import { devNull } from 'node:os';
import crossSpawn from 'cross-spawn';

/** Result of a child process execution. */
export interface CommandResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

/** Git environment with isolation properties and optional identity. */
interface GitEnv extends NodeJS.ProcessEnv {
  readonly GIT_AUTHOR_EMAIL?: string;
  readonly GIT_AUTHOR_NAME?: string;
  readonly GIT_COMMITTER_EMAIL?: string;
  readonly GIT_COMMITTER_NAME?: string;
  readonly GIT_CONFIG_GLOBAL: string;
  readonly GIT_CONFIG_NOSYSTEM: string;
}

/**
 * Creates a git environment isolated from user/system config (e.g. GPG signing, hooks).
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

/**
 * Synchronous exec helper used by fixture setup (`npm init`, `npm install`).
 * Throws on spawn error or non-zero exit. Internal to the test-utils package.
 */
export const exec = (command: string, args: readonly string[], options: SpawnSyncOptions): void => {
  const result = crossSpawn.sync(command, [...args], { ...options, stdio: 'ignore' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}`);
  }
};

/** Spawns a command, captures stdout/stderr, and returns the result. */
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
