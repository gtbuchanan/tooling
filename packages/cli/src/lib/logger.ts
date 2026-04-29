/** Stream-injectable logger for CLI commands so tests can capture output. */
export interface Logger {
  readonly info: (...args: unknown[]) => void;
  readonly error: (...args: unknown[]) => void;
}

/** Creates a Logger that writes to the given streams. */
export const createLogger = (
  stdout: NodeJS.WritableStream = process.stdout,
  stderr: NodeJS.WritableStream = process.stderr,
): Logger => ({
  info: (...args) => {
    stdout.write(`${args.join(' ')}\n`);
  },
  error: (...args) => {
    stderr.write(`${args.join(' ')}\n`);
  },
});
