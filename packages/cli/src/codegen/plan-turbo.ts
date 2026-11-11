import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import { checkGenerateConfigs } from '#src/codegen/generate-tasks.js';
import { generateTurboJson } from '#src/codegen/turbo-config.js';
import { isGtbBuild } from '#src/core/discovery.js';
import { jsonContent, sortKeysDeep } from '#src/core/file-writer.js';
import { UnknownRecord } from '#src/core/schemas.js';
import type { Finding, PlanContext } from '#src/tasks/toolchain.js';

const TurboJsonSchema = v.looseObject({
  tasks: v.optional(UnknownRecord),
});

const readText = (filePath: string): string | undefined =>
  (statSync(filePath, { throwIfNoEntry: false }) === undefined
    ? undefined
    : readFileSync(filePath, 'utf8'));

// An unparseable file holds no tasks, so a rewrite replaces all of them
const parseTasks = (text: string): Readonly<Record<string, unknown>> => {
  try {
    const result = v.safeParse(TurboJsonSchema, JSON.parse(text));
    return result.success ? result.output.tasks ?? {} : {};
  } catch {
    return {};
  }
};

/*
An ignored task is left as the file has it, kept when present and absent when
not, so `--ignore` exempts it from the comparison.
*/
const expectedTasks = (
  generated: Readonly<Record<string, unknown>>,
  actual: Readonly<Record<string, unknown>>,
  ignored: ReadonlySet<string>,
): Record<string, unknown> => Object.fromEntries([
  ...Object.entries(generated).filter(([name]) => !ignored.has(name)),
  ...Object.entries(actual).filter(([name]) => ignored.has(name)),
]);

const planTurboJson = ({ discovery, ignored }: PlanContext): readonly Finding[] => {
  const filePath = path.join(discovery.rootDir, 'turbo.json');
  const generated = generateTurboJson(discovery);
  const text = readText(filePath);
  const actual = text === undefined ? {} : parseTasks(text);
  const content = jsonContent(sortKeysDeep({
    ...generated,
    tasks: expectedTasks(generated.tasks, actual, ignored),
  }));
  if (text === content) {
    return [];
  }
  if (text === undefined) {
    return [{ changes: ['missing'], content, kind: 'write', path: filePath }];
  }
  const [first, ...rest] = Object.keys(generated.tasks)
    .filter(name => !ignored.has(name) && !Object.hasOwn(actual, name))
    .map(name => `missing task '${name}'`);

  return [{
    changes: first === undefined ? ['out of date'] : [first, ...rest],
    content,
    kind: 'write',
    path: filePath,
  }];
};

/**
 * The root `turbo.json`, which gtb generates whole, and the rules over the
 * package configurations its generate tasks need, which only a hand edit
 * satisfies. A repo that doesn't build with gtb gets neither.
 */
export const planTurbo = (context: PlanContext): readonly Finding[] => {
  if (!isGtbBuild(context.discovery)) {
    return [];
  }

  return [
    ...planTurboJson(context),
    ...checkGenerateConfigs(context.discovery, context.ignored)
      .map((message): Finding => ({ kind: 'problem', message })),
  ];
};
