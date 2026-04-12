import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as v from 'valibot';
import { discoverWorkspace } from '../lib/discovery.ts';
import { readJsonFile } from '../lib/file-writer.ts';
import { ManifestSchema } from '../lib/manifest.ts';
import {
  type TurboJson,
  generatePackageScripts,
  generateTurboJson,
} from '../lib/turbo-config.ts';
import { readManifest } from '../lib/workspace.ts';

const TurboJsonSchema = v.looseObject({
  tasks: v.optional(v.record(v.string(), v.unknown())),
});

/** Parses `--ignore <name>` flags from CLI args. */
export const parseIgnoreArgs = (args: readonly string[]): ReadonlySet<string> => {
  const ignored = new Set<string>();
  for (let idx = 0; idx < args.length; idx++) {
    if (args[idx] === '--ignore' && idx + 1 < args.length) {
      ignored.add(args[idx + 1]!);
      idx++;
    }
  }

  return ignored;
};

const checkTurboTasks = (
  rootDir: string,
  expected: TurboJson,
  ignored: ReadonlySet<string>,
): readonly string[] => {
  const path = join(rootDir, 'turbo.json');
  if (!existsSync(path)) {
    return ['turbo.json is missing (run gtb turbo:init)'];
  }

  const raw = readJsonFile(path);
  const result = v.safeParse(TurboJsonSchema, raw);
  if (!result.success) {
    return ['turbo.json: failed to parse'];
  }

  const { tasks } = result.output;

  return Object.keys(expected.tasks)
    .filter(name => !ignored.has(name))
    .filter(name => tasks === undefined || !(name in tasks))
    .map(name => `turbo.json: missing task '${name}'`);
};

const checkScripts = (
  dir: string,
  expected: Record<string, string>,
  ignored: ReadonlySet<string>,
): readonly string[] => {
  const result = v.safeParse(ManifestSchema, readManifest(dir));
  if (!result.success) {
    return [];
  }

  const { scripts } = result.output;

  return Object.keys(expected)
    .filter(name => !ignored.has(name))
    .filter(name => scripts === undefined || !(name in scripts))
    .map(name => `${dir}: missing script '${name}'`);
};

/**
 * Validates project config against expected baseline from discovery.
 * Checks existence of turbo tasks and package scripts only — modified
 * script values (consumer customizations) are not flagged as drift.
 * Use `--ignore <name>` to skip specific tasks/scripts.
 */
export const turboCheck = (args: readonly string[]): void => {
  const ignored = parseIgnoreArgs(args);
  const discovery = discoverWorkspace();
  const expected = generateTurboJson(discovery);

  const drift = [
    ...checkTurboTasks(discovery.rootDir, expected, ignored),
    ...discovery.packages.flatMap(
      pkg => checkScripts(
        pkg.dir,
        generatePackageScripts(pkg, discovery.isSelfHosted, discovery.rootDir),
        ignored,
      ),
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
