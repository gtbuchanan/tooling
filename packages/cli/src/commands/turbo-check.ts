import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as v from 'valibot';
import { discoverWorkspace } from '../lib/discovery.ts';
import { PackageJsonSchema } from '../lib/file-writer.ts';
import {
  type TurboJson,
  generatePackageScripts,
  generateTurboJson,
} from '../lib/turbo-config.ts';
import { readManifest } from '../lib/workspace.ts';

const TurboJsonSchema = v.looseObject({
  tasks: v.optional(v.record(v.string(), v.unknown())),
});

const checkTurboTasks = (
  rootDir: string,
  expected: TurboJson,
): readonly string[] => {
  const path = join(rootDir, 'turbo.json');
  if (!existsSync(path)) {
    return ['turbo.json is missing (run gtb turbo:init)'];
  }

  const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'));
  const result = v.safeParse(TurboJsonSchema, raw);
  if (!result.success) {
    return ['turbo.json: failed to parse'];
  }

  const { tasks } = result.output;

  return Object.keys(expected.tasks)
    .filter(name => tasks === undefined || !(name in tasks))
    .map(name => `turbo.json: missing task '${name}'`);
};

const checkScripts = (
  dir: string,
  expected: Record<string, string>,
): readonly string[] => {
  const result = v.safeParse(PackageJsonSchema, readManifest(dir));
  if (!result.success) {
    return [];
  }

  const { scripts } = result.output;

  return Object.keys(expected)
    .filter(name => scripts === undefined || !(name in scripts))
    .map(name => `${dir}: missing script '${name}'`);
};

/** Validates project config against expected baseline from discovery. */
export const turboCheck = (_args: readonly string[]): void => {
  const discovery = discoverWorkspace();
  const expected = generateTurboJson(discovery);

  const drift = [
    ...checkTurboTasks(discovery.rootDir, expected),
    ...discovery.packages.flatMap(
      pkg => checkScripts(pkg.dir, generatePackageScripts(pkg, discovery.isSelfHosted)),
    ),
  ];

  if (drift.length === 0) {
    console.log('turbo:check passed — no drift detected');
    return;
  }

  for (const message of drift) {
    console.error(message);
  }

  process.exitCode = 1;
};
