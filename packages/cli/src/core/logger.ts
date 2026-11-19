/**
 * Stream-injectable logger for CLI commands so tests can capture output.
 */
export interface Logger {
  readonly info: (...args: unknown[]) => void;
  readonly error: (...args: unknown[]) => void;
}

/**
 * Streams a Logger writes to, each defaulting to the process's own.
 */
export interface LoggerStreams {
  readonly stderr?: NodeJS.WritableStream;
  readonly stdout?: NodeJS.WritableStream;
}

/**
 * Creates a Logger that writes to the given streams.
 */
export const createLogger = ({
  stderr = process.stderr,
  stdout = process.stdout,
}: LoggerStreams = {}): Logger => ({
  info: (...args) => {
    stdout.write(`${args.join(' ')}\n`);
  },
  error: (...args) => {
    stderr.write(`${args.join(' ')}\n`);
  },
});
