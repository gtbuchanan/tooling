import { existsSync } from 'node:fs';
import path from 'node:path';
import * as v from 'valibot';
import { checkGenerateConfigs } from '#src/codegen/generate-tasks.js';
import {
  type Generator, writeSortedAndLog,
} from '#src/codegen/generator.js';
import { type TurboJson, generateTurboJson } from '#src/codegen/turbo-config.js';
import { isGtbBuild } from '#src/core/discovery.js';
import { readJsonFile } from '#src/core/file-writer.js';
import { UnknownRecord } from '#src/core/schemas.js';

const TurboJsonSchema = v.looseObject({
  tasks: v.optional(UnknownRecord),
});

const checkTurboTasks = (
  rootDir: string,
  expected: TurboJson,
  ignored: ReadonlySet<string>,
): readonly string[] => {
  const filePath = path.join(rootDir, 'turbo.json');
  if (!existsSync(filePath)) {
    return ['turbo.json is missing (run gtb sync)'];
  }

  const raw = readJsonFile(filePath);
  const result = v.safeParse(TurboJsonSchema, raw);
  if (!result.success) {
    return ['turbo.json: failed to parse'];
  }

  const { tasks } = result.output;

  return Object.keys(expected.tasks)
    .filter(name => !ignored.has(name))
    .filter(name => tasks === undefined || !Object.hasOwn(tasks, name))
    .map(name => `turbo.json: missing task '${name}'`);
};

/**
 * `turbo.json`, and the config files its generate tasks need.
 */
export const turboGenerator: Generator = {
  sync: ({ discovery, logger }) => {
    if (!isGtbBuild(discovery)) {
      return [];
    }
    writeSortedAndLog(
      logger, path.join(discovery.rootDir, 'turbo.json'), generateTurboJson(discovery),
    );
    return [];
  },
  verify: ({ discovery, ignored }) => (isGtbBuild(discovery)
    ? [
        ...checkTurboTasks(discovery.rootDir, generateTurboJson(discovery), ignored),
        ...checkGenerateConfigs(discovery, ignored),
      ]
    : []),
};
