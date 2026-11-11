import { defineCommand } from 'citty';
import { reportFindings } from '#src/codegen/plans.js';
import { rejectPositionals } from '#src/codegen/positionals.js';
import { workspacePlans } from '#src/codegen/workspace-plans.js';
import { rootNames } from '#src/core/command-names.js';
import { discoverWorkspace } from '#src/core/discovery.js';
import { type Logger, createLogger } from '#src/core/logger.js';
import { planFindings } from '#src/tasks/toolchain.js';
import { capabilities } from '#src/toolchains/index.js';

/**
 * Parses `--ignore <name>` flags from raw CLI args.
 */
export const parseIgnoreArgs = (args: readonly string[]): ReadonlySet<string> => {
  const ignored = new Set<string>();
  for (let idx = 0; idx < args.length; idx++) {
    const next = args[idx + 1];
    if (next === undefined || args[idx] !== '--ignore') {
      continue;
    }

    ignored.add(next);
    idx++;
  }

  return ignored;
};

/**
 * Options for {@link runVerify}.
 */
export interface RunVerifyOptions {
  readonly cwd?: string;
  readonly ignored?: ReadonlySet<string>;
}

/**
 * Validates every generated artifact against the baseline from discovery
 * (empty result = no drift).
 */
export const runVerify = (options: RunVerifyOptions = {}): readonly string[] => {
  const discovery = discoverWorkspace({ capabilities, cwd: options.cwd ?? process.cwd() });

  return reportFindings(planFindings(workspacePlans, {
    discovery,
    force: false,
    ignored: options.ignored ?? new Set<string>(),
  }));
};

/**
 * Parsed citty args for {@link verify}.
 */
export interface VerifyCommandArgs {
  readonly cwd?: string | undefined;
  /**
   * Positional arguments (citty `args._`), which the command rejects.
   */
  readonly positionals?: readonly string[] | undefined;
}

/**
 * Translates citty args into {@link RunVerifyOptions}, invokes
 * {@link runVerify}, and reports the drift through the given logger.
 * Returns the exit code so the citty wrapper can set
 * `process.exitCode` and tests can assert on the result without
 * mutating process state.
 */
export const verifyCommand = (
  rawArgs: readonly string[],
  args: VerifyCommandArgs,
  logger: Logger,
): number => {
  const rejection = rejectPositionals(rootNames.verify, args.positionals ?? []);
  if (rejection !== undefined) {
    logger.error(rejection);
    return 1;
  }

  const drift = runVerify({
    ...(args.cwd !== undefined && { cwd: args.cwd }),
    ignored: parseIgnoreArgs(rawArgs),
  });

  if (drift.length === 0) {
    logger.info('verify passed — no drift detected');
    return 0;
  }

  for (const message of drift) {
    logger.error(message);
  }

  return 1;
};

/**
 * Citty command wrapper for {@link verifyCommand}.
 */
export const verify = defineCommand({
  args: {
    cwd: {
      alias: 'C',
      description: 'Workspace root directory (defaults to current working directory)',
      type: 'string',
    },
    ignore: {
      description: 'Skip drift detection for a specific task or script',
      type: 'string',
    },
  },
  meta: {
    description: 'Verify generated config matches the expected baseline',
    name: rootNames.verify,
  },
  run: ({ rawArgs, args }) => {
    const exitCode = verifyCommand(
      rawArgs, { cwd: args.cwd, positionals: args._ }, createLogger(),
    );
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  },
});
