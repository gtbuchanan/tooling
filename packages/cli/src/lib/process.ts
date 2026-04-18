import crossSpawn from 'cross-spawn';

/** Options for spawning a single command. */
export interface RunOptions {
  readonly args?: readonly string[];
  readonly cwd?: string;
}

/** Spawns a command with inherited stdio and resolves on success. */
export const run = async (
  command: string,
  options?: RunOptions,
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = crossSpawn(command, options?.args?.slice() ?? [], {
      cwd: options?.cwd,
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
