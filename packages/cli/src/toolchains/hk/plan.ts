import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import * as v from 'valibot';
import { StringArray } from '#src/core/schemas.js';
import type { Finding, PlanContext } from '#src/tasks/toolchain.js';
import { generateMiseTasks, miseTasksFileName } from '#src/toolchains/hk/mise-tasks.js';

const TaskConfigSchema = v.looseObject({
  includes: v.optional(StringArray),
});

const MiseConfigSchema = v.looseObject({
  task_config: v.optional(TaskConfigSchema),
});

const planTasksFile = (filePath: string, content: string): readonly Finding[] => {
  const stats = statSync(filePath, { throwIfNoEntry: false });
  if (stats === undefined) {
    return [{ changes: ['missing'], content, kind: 'write', path: filePath }];
  }
  if (!stats.isFile()) {
    return [{
      kind: 'problem',
      message: `${filePath}: not a file — remove it so gtb sync can write the hk tasks`,
    }];
  }

  return readFileSync(filePath, 'utf8') === content
    ? []
    : [{ changes: ['out of date'], content, kind: 'write', path: filePath }];
};

// Only unparseable TOML is undefined; a mistyped `includes` lacks the file
const parseIncludes = (text: string): readonly string[] | undefined => {
  try {
    const result = v.safeParse(MiseConfigSchema, parseToml(text));
    return result.success ? result.output.task_config?.includes ?? [] : [];
  } catch {
    return undefined;
  }
};

/*
The include stays a hand edit so sync never round-trips the comment-heavy
mise.toml, which leaves it a problem to report rather than a write.
*/
const planInclude = (filePath: string): readonly Finding[] => {
  const includes = parseIncludes(readFileSync(filePath, 'utf8'));
  if (includes === undefined) {
    return [{
      kind: 'problem',
      message: `${filePath}: could not be parsed as TOML — fix it by hand`,
    }];
  }

  return includes.includes(miseTasksFileName)
    ? []
    : [{
        kind: 'problem',
        message: `${filePath}: [task_config] includes must contain ` +
          `"${miseTasksFileName}" — add it by hand`,
      }];
};

/**
 * Generates `mise.tasks.toml`, the `hk:all` / `hk:base` mise tasks, and checks
 * that `mise.toml` loads it. Only a repo pinning its tools with mise gets
 * either, whether or not it builds with gtb: an hk-only adopter runs gtb from
 * mise's `npm:` backend.
 */
export const planMiseTasks = ({ discovery }: PlanContext): readonly Finding[] => {
  if (!discovery.hasMise) {
    return [];
  }

  return [
    ...planTasksFile(
      path.join(discovery.rootDir, miseTasksFileName),
      generateMiseTasks(discovery),
    ),
    ...planInclude(path.join(discovery.rootDir, 'mise.toml')),
  ];
};
