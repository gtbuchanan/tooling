import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { styleText } from 'node:util';
import sarifFormat from '@microsoft/eslint-formatter-sarif';
import {
  type Finding, type StyleText, formatFindingReport,
} from './finding-report.ts';
import { internalRuleId } from './internal-rule-id.ts';
import { type Logger, createLogger } from './logger.ts';
import { sarifLogPath } from './sarif-paths.ts';

/** SARIF log path written by `lint:eslint`, relative to the lint cwd. */
export const sarifOutputPath = sarifLogPath('eslint');

/** Structural subset of an ESLint lint message the task consumes. */
export interface EslintMessage {
  readonly column?: number | undefined;
  readonly line?: number | undefined;
  readonly message: string;
  readonly ruleId: string | null;
  readonly severity: number;
}

/** Structural subset of an ESLint lint result the task consumes. */
export interface EslintResult {
  readonly errorCount: number;
  readonly filePath: string;
  readonly messages: readonly EslintMessage[];
}

/** Constructor options the task passes to ESLint. */
export interface EslintOptions {
  readonly cache: boolean;
  readonly cacheLocation: string;
  readonly fix: boolean;
  readonly ignorePatterns?: string[];
}

/*
 * The interfaces below use method syntax deliberately: it keeps their
 * parameters bivariant, which is what lets the real ESLint class —
 * whose signatures take the full `LintResult` — satisfy these narrower
 * structural subsets without type assertions or plumbing eslint's own
 * types through the public deps surface.
 */
/* eslint-disable @typescript-eslint/method-signature-style --
   Parameter bivariance is the point; see the comment above. */

/** Structural subset of an ESLint instance the task consumes. */
export interface EslintInstance {
  getRulesMetaForResults(results: EslintResult[]): unknown;
  lintFiles(patterns: string[]): Promise<EslintResult[]>;
}

/** Structural subset of the ESLint class itself (constructor + statics). */
export interface EslintConstructor {
  new (options: EslintOptions): EslintInstance;
  outputFixes(results: EslintResult[]): Promise<void>;
}

/* eslint-enable @typescript-eslint/method-signature-style */

/** Parsed `lint:eslint` command arguments. */
export interface LintEslintArgs {
  readonly fix: boolean;
  readonly ignorePatterns: readonly string[];
  readonly patterns: readonly string[];
}

const ignorePatternFlag = '--ignore-pattern';

/**
 * Parses the narrow flag surface `lint:eslint` supports: positional
 * lint patterns, `--fix`, and repeatable `--ignore-pattern`. Anything
 * else is rejected rather than silently dropped — the ESLint CLI no
 * longer sits behind this command, so unknown flags would otherwise
 * vanish without effect.
 */
export const parseLintEslintArgs = (
  rawArgs: readonly string[],
): LintEslintArgs => {
  let shouldFix = false;
  const ignorePatterns: string[] = [];
  const patterns: string[] = [];
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index] ?? '';
    if (arg === '--fix') {
      shouldFix = true;
    } else if (arg === ignorePatternFlag) {
      index += 1;
      const value = rawArgs[index];
      if (value === undefined) {
        throw new Error(`${ignorePatternFlag} requires a value`);
      }
      ignorePatterns.push(value);
    } else if (arg.startsWith(`${ignorePatternFlag}=`)) {
      ignorePatterns.push(arg.slice(ignorePatternFlag.length + 1));
    } else if (arg.startsWith('-')) {
      throw new Error(
        `Unsupported lint:eslint argument ${arg} ` +
        `(supported: patterns, --fix, ${ignorePatternFlag})`,
      );
    } else {
      patterns.push(arg);
    }
  }
  return { fix: shouldFix, ignorePatterns, patterns };
};

/** Side-effecting dependencies of `lint:eslint`, injected for tests. */
export interface LintEslintDeps {
  readonly cwd: () => string;
  readonly loadEslint: () => Promise<EslintConstructor>;
  readonly logger: Logger;
  /** Styles the console report (identity in tests). */
  readonly style: StyleText;
  readonly writeFile: (filePath: string, content: string) => void;
}

/**
 * Loads the consumer's own ESLint through the optional peer dependency,
 * so the consumer keeps ownership of the ESLint version. The import is
 * dynamic because hk-only adopters install `@gtbuchanan/cli` without
 * eslint; the failure surfaces here, at first use, with the remedy.
 */
const loadEslintConstructor = async (): Promise<EslintConstructor> => {
  try {
    const { ESLint } = await import('eslint');
    return ESLint;
  } catch (error) {
    throw new Error(
      'lint:eslint could not load eslint — install it alongside ' +
      '@gtbuchanan/cli (declared as an optional peer dependency)',
      { cause: error },
    );
  }
};

/**
 * Real I/O implementations backing {@link LintEslintDeps}.
 * @internal
 */
export const defaultLintEslintDeps: LintEslintDeps = {
  cwd: () => process.cwd(),
  loadEslint: loadEslintConstructor,
  logger: createLogger(),
  // The report goes to stdout, styleText's default detection stream.
  style: styleText,
  writeFile: (filePath, content) => {
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  },
};

/** ESLint's numeric severity for an error (1 is a warning). */
const errorSeverity = 2;

const toFindings = (results: readonly EslintResult[]): readonly Finding[] =>
  results.flatMap(result => result.messages.map(message => ({
    column: message.column,
    level: message.severity === errorSeverity ? 'error' : 'warning',
    line: message.line,
    message: message.message,
    ruleId: message.ruleId ?? internalRuleId,
    uri: result.filePath,
  })));

/**
 * Runs ESLint through its programmatic API as a reporter, not a gate:
 * warnings never fail the task (the repo convention downgrades every
 * rule to a warning), while errors — parse or config breakage under
 * that convention — still do, and only after the SARIF log is written
 * (a baseline must exist for every commit, including failing ones).
 * The API replaces the CLI because ESLint accepts a single `--format`;
 * programmatic results feed the SARIF log and the stylish console
 * report from one lint run.
 */
export const executeLintEslint = async (
  rawArgs: readonly string[],
  deps: LintEslintDeps = defaultLintEslintDeps,
): Promise<void> => {
  const args = parseLintEslintArgs(rawArgs);
  const Eslint = await deps.loadEslint();
  const eslint = new Eslint({
    cache: true,
    cacheLocation: 'dist/.eslintcache',
    fix: args.fix,
    ...args.ignorePatterns.length > 0 &&
    { ignorePatterns: [...args.ignorePatterns] },
  });
  const results = await eslint.lintFiles(
    args.patterns.length > 0 ? [...args.patterns] : ['.'],
  );
  if (args.fix) {
    await Eslint.outputFixes(results);
  }
  deps.writeFile(
    path.resolve(deps.cwd(), sarifOutputPath),
    sarifFormat(results, {
      rulesMeta: eslint.getRulesMetaForResults(results),
    }),
  );
  const findings = toFindings(results);
  if (findings.length > 0) {
    deps.logger.info(formatFindingReport(findings, deps.style));
  }
  const errorCount = results
    .reduce((total, result) => total + result.errorCount, 0);
  if (errorCount > 0) {
    throw new Error(
      `ESLint found ${String(errorCount)} error${errorCount === 1 ? '' : 's'}`,
    );
  }
};
