import { constants } from 'node:os';
import crossSpawn from 'cross-spawn';

/**
 * Options for spawning a single command.
 */
export interface RunOptions {
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Spawns a command with inherited stdio and resolves on success.
 */
export const run = async (
  command: string,
  options?: RunOptions,
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = crossSpawn(command, options?.args?.slice() ?? [], {
      cwd: options?.cwd,
      ...(options?.env !== undefined && { env: options.env }),
      stdio: 'inherit',
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${String(code)}`));
      }
    });
    child.on('error', reject);
  });
};

/**
 * Spawns a command and resolves its trimmed stdout (rejects on non-zero).
 */
export const capture = async (
  command: string,
  args: readonly string[],
): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = crossSpawn(command, [...args], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`${command} exited with code ${String(code)}`));
      }
    });
  });

/**
 * A finished command: its exit code and both captured streams (trimmed).
 */
export interface ExecResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

/**
 * Options for {@link execute}.
 */
export interface ExecuteOptions {
  /**
   * The child's working directory. The parent's when omitted.
   */
  readonly cwd?: string;
  /**
   * How stdout is decoded. UTF-8 by default; `latin1` maps each byte to one
   * character, for output sliced by byte count or holding content that may
   * not be text. `Buffer.from(text, 'latin1')` gives the bytes back. stderr
   * is always UTF-8, since it carries the child's diagnostics.
   */
  readonly encoding?: 'latin1' | 'utf8';
  /**
   * Written to the child's stdin, which is closed afterwards. Without it the
   * child gets no stdin at all.
   */
  readonly input?: string;
  /**
   * Trims both captured streams. On by default; turn it off where the output
   * is file content, whose trailing newline is part of it.
   */
  readonly trim?: boolean;
}

/*
 * Reported when a child ends without either a code or a signal — a shape Node
 * documents as impossible. Non-zero regardless, since it is not a success.
 */
const unknownFailureExitCode = 1;

/*
 * What a shell adds to the signal number to report a killed process in `$?`.
 */
const signalExitCodeOffset = 128;

/**
 * The exit code to report for a finished child, from Node's `close` arguments:
 * exactly one of `code` and `signal` is set. A signal kill has no exit code of
 * its own, so it takes the shell's `128 + signum` convention. What matters to
 * every caller is that a killed command is never reported as a success — a
 * plain `code ?? 0` would claim a `gh release create` that CI killed mid-flight
 * had created the release.
 */
export const resolveExitCode = (
  code: number | undefined,
  signal: NodeJS.Signals | undefined,
): number => {
  if (code !== undefined) {
    return code;
  }
  if (signal === undefined) {
    return unknownFailureExitCode;
  }

  return signalExitCodeOffset + constants.signals[signal];
};

const finishStream = (
  chunks: readonly Buffer[],
  encoding: BufferEncoding,
  { trim = true }: ExecuteOptions,
): string => {
  const text = Buffer.concat(chunks).toString(encoding);

  return trim ? text.trim() : text;
};

const brokenPipeCodes = new Set(['EOF', 'EPIPE']);

const isBrokenPipe = ({ code }: NodeJS.ErrnoException): boolean =>
  code !== undefined && brokenPipeCodes.has(code);

/**
 * Spawns a command and resolves its outcome instead of throwing on failure,
 * so the caller can branch on *why* it failed rather than only that it did.
 * Prefer this over {@link capture} whenever a non-zero exit is a meaningful
 * answer (e.g. "no such release") that must be told apart from a genuine
 * error: `capture` collapses every failure into the same generic rejection,
 * which turns a transient outage into a false negative. Rejects only when the
 * command cannot be spawned at all, or its input cannot be written for a
 * reason other than the child having exited.
 */
export const execute = async (
  command: string,
  args: readonly string[],
  options: ExecuteOptions = {},
): Promise<ExecResult> =>
  new Promise((resolve, reject) => {
    const child = crossSpawn(command, [...args], {
      ...(options.cwd !== undefined && { cwd: options.cwd }),
      stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    /*
     * A child that exits before draining its input breaks the pipe under the
     * write (EPIPE, or EOF on Windows). Unhandled, that error crashes the
     * caller; the child's own exit already reports how it ended. Any other
     * write error rejects: thrown from this listener, it would escape the
     * promise as an uncaught exception. The child is killed with it, since a
     * caller told the command failed must not have it go on to act.
     */
    child.stdin?.on('error', (error: NodeJS.ErrnoException) => {
      if (isBrokenPipe(error)) {
        return;
      }

      child.kill();
      reject(error);
    });
    child.stdin?.end(options.input);
    /*
     * Chunks are kept as bytes and decoded once, because a chunk boundary can
     * fall inside a multi-byte character that decoding each piece would split.
     */
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout.push(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({
        exitCode: resolveExitCode(code ?? undefined, signal ?? undefined),
        stderr: finishStream(stderr, 'utf8', options),
        stdout: finishStream(stdout, options.encoding ?? 'utf8', options),
      });
    });
  });

/**
 * Spawns a command. Resolves true on exit 0, false on ENOENT
 * (command not found), and rejects on other failures.
 */
export const trySpawn = async (
  bin: string,
  args: readonly string[],
): Promise<boolean> =>
  new Promise((resolve, reject) => {
    const child = crossSpawn(bin, [...args], { stdio: 'inherit' });
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        resolve(false);
      } else {
        reject(err);
      }
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        reject(new Error(`${bin} exited with code ${String(code)}`));
      }
    });
  });
