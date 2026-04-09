import concurrently from 'concurrently';
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
  // oxlint-disable-next-line promise/avoid-new -- wrapping event-based API
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

/** Command descriptor for parallel execution. */
export interface ParallelCommand {
  readonly command: string;
  readonly name: string;
}

/** Runs commands in parallel with grouped output. Rejects if any command fails. */
export const runParallel = async (
  commands: readonly ParallelCommand[],
): Promise<void> => {
  try {
    await concurrently(
      [...commands],
      {
        group: true,
        killOthersOn: ['failure'],
      },
    ).result;
  } catch {
    const names = commands.map(cmd => cmd.name).join(', ');
    throw new Error(`Parallel execution failed: ${names}`);
  }
};
