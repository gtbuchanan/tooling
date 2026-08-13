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
 * Spawns a command and resolves its outcome instead of throwing on failure,
 * so the caller can branch on *why* it failed rather than only that it did.
 * Prefer this over {@link capture} whenever a non-zero exit is a meaningful
 * answer (e.g. "no such release") that must be told apart from a genuine
 * error: `capture` collapses every failure into the same generic rejection,
 * which turns a transient outage into a false negative. Rejects only when the
 * command cannot be spawned at all.
 */
export const execute = async (
  command: string,
  args: readonly string[],
): Promise<ExecResult> =>
  new Promise((resolve, reject) => {
    const child = crossSpawn(command, [...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 0, stderr: stderr.trim(), stdout: stdout.trim() });
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
