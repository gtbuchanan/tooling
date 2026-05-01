import crossSpawn from 'cross-spawn';

/** Options for spawning a single command. */
export interface RunOptions {
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

/** Spawns a command with inherited stdio and resolves on success. */
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
