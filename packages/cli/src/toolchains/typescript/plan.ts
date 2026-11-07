import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import { isGtbBuild } from '#src/core/discovery.js';
import { jsonContent, sortKeysDeep } from '#src/core/file-writer.js';
import { UnknownRecord } from '#src/core/schemas.js';
import type { Finding, PlanContext } from '#src/tasks/toolchain.js';
import {
  type GeneratedTsconfig,
  type TsconfigDescriptor,
  generateTsconfigBase,
  planTsconfigs,
  tsconfigBaseFileName,
} from '#src/toolchains/typescript/tsconfig.js';

const writeOf = (
  filePath: string,
  changes: readonly [string, ...string[]],
  data: object,
): Finding => ({
  changes,
  content: jsonContent(sortKeysDeep(data)),
  kind: 'write',
  path: filePath,
});

/*
 * The base is the consumer's one hand-authored tsconfig, their choice of
 * shared variant, so it is scaffolded only where absent and its contents are
 * never checked. A non-file at the path can't back an `extends`, and every
 * generated config would silently fail to resolve, so it's a problem rather
 * than something to skip.
 */
const planBase = (rootDir: string): readonly Finding[] => {
  const filePath = path.join(rootDir, tsconfigBaseFileName);
  const stats = statSync(filePath, { throwIfNoEntry: false });
  if (stats === undefined) {
    return [writeOf(filePath, ['missing'], generateTsconfigBase())];
  }

  return stats.isFile()
    ? []
    : [{
        kind: 'problem',
        message: `${filePath}: not a file — remove it so gtb sync can scaffold the base`,
      }];
};

const readObject = (filePath: string): Record<string, unknown> | undefined => {
  try {
    const result = v.safeParse(UnknownRecord, JSON.parse(readFileSync(filePath, 'utf8')));
    return result.success ? result.output : undefined;
  } catch {
    return undefined;
  }
};

const compilerOptionsOf = (
  actual: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  const result = v.safeParse(UnknownRecord, actual['compilerOptions']);
  return result.success ? result.output : undefined;
};

/*
What differs in the fields gtb writes, which are the only ones it owns.
*/
const ownedChanges = (
  actual: Record<string, unknown>,
  expected: GeneratedTsconfig,
  ownedKeys: Readonly<Record<string, unknown>>,
): readonly string[] => {
  const options = compilerOptionsOf(actual);

  return [
    ...(actual['extends'] === expected.extends
      ? []
      : [`extends should be '${expected.extends}'`]),
    ...(expected.include === undefined ||
      JSON.stringify(actual['include']) === JSON.stringify(expected.include)
      ? []
      : [`include should be ${JSON.stringify(expected.include)}`]),
    ...Object.keys(ownedKeys)
      .filter(key => options?.[key] !== expected.compilerOptions[key])
      .map(key => `compilerOptions.${key} should be ${String(expected.compilerOptions[key])}`),
  ];
};

/*
 * gtb owns the fields it writes and carries every other key through a
 * rewrite: `$schema`, `references`, `exclude`, a tool's own settings, and the
 * compiler options it does not own. A file it cannot read is a problem, since
 * treating it as empty would write away whatever it holds.
 */
const planConfig = (
  { generate, ownedKeys, path: filePath }: TsconfigDescriptor,
): readonly Finding[] => {
  if (!existsSync(filePath)) {
    return [writeOf(filePath, ['missing'], generate())];
  }
  const actual = readObject(filePath);
  if (actual === undefined) {
    return [{
      kind: 'problem',
      message: `${filePath}: could not be parsed as a JSON object — fix it by hand`,
    }];
  }
  const expected = generate(compilerOptionsOf(actual));
  const [first, ...rest] = ownedChanges(actual, expected, ownedKeys);

  return first === undefined
    ? []
    : [writeOf(filePath, [first, ...rest], { ...actual, ...expected })];
};

/**
 * The base tsconfig, scaffolded once, and each package's generated tsconfigs,
 * where gtb drives the workspace's build.
 */
export const planTsconfigFiles = ({ discovery }: PlanContext): readonly Finding[] =>
  (isGtbBuild(discovery)
    ? [
        ...planBase(discovery.rootDir),
        ...planTsconfigs(discovery.rootDir, discovery.packages).flatMap(planConfig),
      ]
    : []);
