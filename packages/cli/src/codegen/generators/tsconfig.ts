import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import {
  type Generator, isGtbBuild, writeSortedAndLog,
} from '#src/codegen/generator.js';
import {
  type GeneratedTsconfig,
  generateTsconfigBase,
  planTsconfigs,
  readUserCompilerOptions,
  tsconfigBaseFileName,
} from '#src/codegen/tsconfig-gen.js';
import { readJsonFile } from '#src/core/file-writer.js';
import type { Logger } from '#src/core/logger.js';
import { StringArray, UnknownRecord } from '#src/core/schemas.js';

/*
 * Scaffold the base tsconfig the generated configs extend. It's the consumer's
 * one hand-authored tsconfig (their choice of shared variant), so leave an
 * existing file untouched — never clobber an edited variant on a re-sync. A
 * non-file at the path (e.g. a directory) can't back an `extends`, so fail
 * loudly rather than silently skip and leave the generated configs broken.
 */
const writeTsconfigBase = (logger: Logger, rootDir: string): void => {
  const filePath = path.join(rootDir, tsconfigBaseFileName);
  const stats = statSync(filePath, { throwIfNoEntry: false });
  if (stats?.isFile()) {
    return;
  }
  if (stats !== undefined) {
    throw new Error(`${filePath} exists but is not a file — remove it so gtb sync can scaffold it`);
  }
  writeSortedAndLog(logger, filePath, generateTsconfigBase());
};

const TsconfigCheckSchema = v.looseObject({
  compilerOptions: v.optional(UnknownRecord),
  extends: v.optional(v.string()),
  include: v.optional(StringArray),
});

const checkOwnedCompilerOptions = (
  filePath: string,
  actual: Record<string, unknown> | undefined,
  expected: GeneratedTsconfig,
  ownedKeys: Readonly<Record<string, unknown>>,
): readonly string[] =>
  Object.keys(ownedKeys)
    .filter(key => actual?.[key] !== expected.compilerOptions[key])
    .map((key) => {
      const want = String(expected.compilerOptions[key]);
      return `${filePath}: compilerOptions.${key} should be ${want}`;
    });

const checkTsconfigStructure = (
  filePath: string,
  expected: GeneratedTsconfig,
  ownedKeys: Readonly<Record<string, unknown>>,
): readonly string[] => {
  const result = v.safeParse(TsconfigCheckSchema, readJsonFile(filePath));
  if (!result.success) {
    return [`${filePath}: failed to parse`];
  }

  const actual = result.output;

  return [
    ...(actual.extends === expected.extends
      ? []
      : [`${filePath}: extends should be '${expected.extends}'`]),
    ...(expected.include === undefined ||
      JSON.stringify(actual.include) === JSON.stringify(expected.include)
      ? []
      : [`${filePath}: include should be ${JSON.stringify(expected.include)}`]),
    ...checkOwnedCompilerOptions(filePath, actual.compilerOptions, expected, ownedKeys),
  ];
};

const checkTsconfigFile = (
  filePath: string,
  expected: GeneratedTsconfig,
  ownedKeys: Readonly<Record<string, unknown>>,
): readonly string[] =>
  existsSync(filePath)
    ? checkTsconfigStructure(filePath, expected, ownedKeys)
    : [`${filePath}: missing (run gtb sync)`];

/*
 * The base tsconfig is hand-authored (the consumer's variant choice), so only
 * that a file exists is verified — its contents are theirs to own. A missing or
 * non-file path silently breaks every generated config's `extends`, which is
 * the gap this catches.
 */
const checkTsconfigBase = (rootDir: string): readonly string[] => {
  const filePath = path.join(rootDir, tsconfigBaseFileName);
  const stats = statSync(filePath, { throwIfNoEntry: false });
  if (stats === undefined) {
    return [`${filePath}: missing (run gtb sync)`];
  }

  return stats.isFile() ? [] : [`${filePath}: must be a file (run gtb sync)`];
};

/**
 * The base tsconfig, scaffolded once, and each package's generated tsconfigs.
 */
export const tsconfigGenerator: Generator = {
  sync: ({ discovery, logger }) => {
    if (!isGtbBuild(discovery)) {
      return;
    }
    writeTsconfigBase(logger, discovery.rootDir);
    for (const descriptor of planTsconfigs(discovery.rootDir, discovery.packages)) {
      const userOpts = readUserCompilerOptions(descriptor.path);
      writeSortedAndLog(logger, descriptor.path, descriptor.generate(userOpts));
    }
  },
  verify: ({ discovery }) => (isGtbBuild(discovery)
    ? [
        ...checkTsconfigBase(discovery.rootDir),
        ...planTsconfigs(discovery.rootDir, discovery.packages)
          .flatMap(({ path: filePath, generate, ownedKeys }) => checkTsconfigFile(
            filePath, generate(readUserCompilerOptions(filePath)), ownedKeys,
          )),
      ]
    : []),
};
