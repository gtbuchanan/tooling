import { defineCommand } from 'citty';
import type { VerifyContext } from '#src/codegen/generator.js';
import { generators } from '#src/codegen/generators/index.js';
import {
  type SyncScope, parseSyncScopes, syncScopes,
} from '#src/codegen/sync-scopes.js';
import { rootNames } from '#src/core/command-names.js';
import { discoverWorkspace } from '#src/core/discovery.js';
import { type Logger, createLogger } from '#src/core/logger.js';

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
  /**
   * Artifacts to check. Defaults to all {@link syncScopes}.
   */
  readonly scopes?: ReadonlySet<SyncScope>;
}

/**
 * Validates the artifacts selected by `scopes` (default all) against the
 * baseline from discovery (empty result = no drift). The mise check
 * self-skips when the repo lacks that tool.
 */
export const runVerify = (options: RunVerifyOptions = {}): readonly string[] => {
  const scopes = options.scopes ?? new Set(syncScopes);
  const context: VerifyContext = {
    discovery: discoverWorkspace({ cwd: options.cwd ?? process.cwd() }),
    ignored: options.ignored ?? new Set<string>(),
  };

  return syncScopes.flatMap(scope => (scopes.has(scope) ? generators[scope].verify(context) : []));
};

/**
 * Parsed citty args for {@link verify}.
 */
export interface VerifyCommandArgs {
  readonly cwd?: string | undefined;
  /**
   * Positional scope tokens (citty `args._`). Empty means all scopes.
   */
  readonly scopes?: readonly string[] | undefined;
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
  const parsed = parseSyncScopes(args.scopes ?? []);
  if ('errors' in parsed) {
    for (const message of parsed.errors) {
      logger.error(message);
    }

    return 1;
  }

  const drift = runVerify({
    ...(args.cwd !== undefined && { cwd: args.cwd }),
    ignored: parseIgnoreArgs(rawArgs),
    scopes: parsed.scopes,
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
    description:
      'Verify generated config matches the expected baseline ' +
      `(optionally scope to: ${syncScopes.join(', ')})`,
    name: rootNames.verify,
  },
  run: ({ rawArgs, args }) => {
    const exitCode = verifyCommand(
      rawArgs, { cwd: args.cwd, scopes: args._ }, createLogger(),
    );
    if (exitCode !== 0) {
      process.exitCode = exitCode;
    }
  },
});
