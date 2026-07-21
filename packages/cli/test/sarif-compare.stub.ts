import { faker } from '@faker-js/faker';
import { vi } from 'vitest';
import type { Logger } from '#src/lib/logger.js';
import type { SarifCompareDeps } from '#src/lib/sarif-compare.js';
import { localeComparer } from '#src/lib/sort.js';
import type { WorkspaceContext } from '#src/lib/workspace.js';

/** Overrides for {@link sarifResult}. */
export interface SarifResultOverrides {
  readonly ruleId?: string;
  readonly startLine?: number;
  readonly suppressions?: readonly object[];
}

/** Builds a SARIF result in the subset shape the compare consumes. */
export const sarifResult = (
  baselineState: string,
  overrides?: SarifResultOverrides,
): object => ({
  baselineState,
  level: 'error',
  locations: [{
    physicalLocation: {
      artifactLocation: { uri: faker.system.filePath() },
      region: { startColumn: 1, startLine: overrides?.startLine ?? 1 },
    },
  }],
  message: { text: faker.lorem.sentence() },
  ruleId: overrides?.ruleId ?? 'no-unused-vars',
  ...(overrides?.suppressions !== undefined &&
    { suppressions: overrides.suppressions }),
});

/** Wraps results in a single-run SARIF log. */
export const sarifLog = (results: readonly object[]): object => ({
  runs: [{ results }],
});

/** A recorded deps.run invocation. */
export interface RunCall {
  readonly args: readonly string[];
  readonly command: string;
}

/** A recorded deps.copyFile invocation. */
export interface CopyCall {
  readonly destination: string;
  readonly source: string;
}

/** A recorded deps.writeText invocation. */
export interface WriteTextCall {
  readonly content: string;
  readonly filePath: string;
}

/** Stubbed deps plus the calls they record. */
export interface StubDeps {
  readonly copyCalls: readonly CopyCall[];
  readonly deps: SarifCompareDeps;
  readonly errors: readonly string[];
  readonly infos: readonly string[];
  readonly removedPaths: readonly string[];
  readonly runCalls: readonly RunCall[];
  readonly writeTextCalls: readonly WriteTextCall[];
}

/** Options for {@link stubDeps}. */
export interface StubOptions {
  /** Workspace returned for the base worktree cwd. Defaults to `workspace`. */
  readonly baseWorkspace?: WorkspaceContext;
  /** `"<command> <argv0>"` prefixes whose run() rejects. */
  readonly failing?: readonly string[];
  /** `"<argv0> <argv1>"` prefixes whose capture() rejects. */
  readonly failingCapture?: readonly string[];
  /** Content returned by readText for any path (e.g. the stamp file). */
  readonly readTextContent?: string;
}

const normalize = (filePath: string): string => filePath.replaceAll('\\', '/');

/**
 * Fakes a workspace whose files are the members of `files`; `list`
 * derives directory listings from it, and readJson yields `log` for
 * any path (matched output or current log alike).
 */
export const stubDeps = (
  workspace: WorkspaceContext,
  files: readonly string[],
  log: object,
  options?: StubOptions,
): StubDeps => {
  const copyCalls: CopyCall[] = [];
  const errors: string[] = [];
  const infos: string[] = [];
  const removedPaths: string[] = [];
  const runCalls: RunCall[] = [];
  const writeTextCalls: WriteTextCall[] = [];
  const logger: Logger = {
    error: (...args) => void errors.push(args.join(' ')),
    info: (...args) => void infos.push(args.join(' ')),
  };
  return {
    copyCalls,
    deps: {
      capture: (_command, args) => {
        const key = `${args[0] ?? ''} ${args[1] ?? ''}`;
        return options?.failingCapture?.includes(key) === true
          ? Promise.reject(new Error(`${key} failed`))
          : Promise.resolve('abc1234');
      },
      copyFile: (source, destination) => {
        copyCalls.push({
          destination: normalize(destination),
          source: normalize(source),
        });
      },
      ensureDir: vi.fn<(dir: string) => void>(),
      exists: filePath => files.includes(normalize(filePath)),
      list: (dir) => {
        const prefix = `${normalize(dir)}/`;
        return files
          .filter(filePath => filePath.startsWith(prefix))
          .map(filePath => filePath.slice(prefix.length))
          .filter(name => !name.includes('/') && name.endsWith('.sarif'))
          .toSorted(localeComparer);
      },
      logger,
      makeTempDir: () => '/tmp/base',
      readJson: () => log,
      readText: () => options?.readTextContent ?? '',
      remove: filePath => void removedPaths.push(normalize(filePath)),
      resolveMultitool: () => 'sarif-multitool',
      run: (command, runOptions) => {
        runCalls.push({ args: runOptions?.args ?? [], command });
        const key = `${command} ${runOptions?.args?.[0] ?? ''}`;
        return options?.failing?.includes(key) === true
          ? Promise.reject(new Error(`${key} failed`))
          : Promise.resolve();
      },
      workspace: cwd =>
        (cwd === undefined ? workspace : options?.baseWorkspace ?? workspace),
      writeText: (filePath, content) => {
        writeTextCalls.push({ content, filePath: normalize(filePath) });
      },
    },
    errors,
    infos,
    removedPaths,
    runCalls,
    writeTextCalls,
  };
};
