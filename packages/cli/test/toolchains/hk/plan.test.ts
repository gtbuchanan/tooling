import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { parse as parseToml } from 'smol-toml';
import * as v from 'valibot';
import { describe, it } from 'vitest';
import { discoverWorkspace } from '#src/core/discovery.js';
import type { Finding } from '#src/tasks/toolchain.js';
import { planMiseTasks } from '#src/toolchains/hk/plan.js';
import { capabilities } from '#src/toolchains/index.js';
import { createTempDir, writeJson } from '#test/helpers.js';

const includingTasks = '[task_config]\nincludes = ["mise-tasks", "mise.tasks.toml"]\n';

interface RepoOptions {
  readonly dependsOnCli?: boolean;
  readonly miseToml?: string;
}

interface Repo {
  readonly miseTomlPath: string;
  readonly root: string;
  readonly tasksPath: string;
}

/**
 * A root with `miseToml` as its `mise.toml` when given.
 */
const createRepo = ({ dependsOnCli = true, miseToml }: RepoOptions = {}): Repo => {
  const root = createTempDir();
  writeJson(root, 'package.json', {
    ...(dependsOnCli && { devDependencies: { '@gtbuchanan/cli': build.semverRange() } }),
    name: build.packageName(),
    private: true,
  });
  const miseTomlPath = path.join(root, 'mise.toml');
  if (miseToml !== undefined) {
    writeFileSync(miseTomlPath, miseToml);
  }

  return { miseTomlPath, root, tasksPath: path.join(root, 'mise.tasks.toml') };
};

const plan = (root: string): readonly Finding[] => planMiseTasks({
  discovery: discoverWorkspace({ capabilities, cwd: root }),
  force: false,
  ignored: new Set(),
});

const TasksSchema = v.record(v.string(), v.looseObject({ run: v.string() }));

// Each task's command, keyed by task name
const runsOf = (content: string): Record<string, string> => {
  const tasks = Object.entries(v.parse(TasksSchema, parseToml(content)));
  return Object.fromEntries(tasks.map(([name, { run }]) => [name, run]));
};

const parsedWrites = (findings: readonly Finding[]) =>
  findings.map(finding => (finding.kind === 'write'
    ? { changes: finding.changes, path: finding.path, runs: runsOf(finding.content) }
    : finding));

const problems = (findings: readonly Finding[]): readonly Finding[] =>
  findings.filter(({ kind }) => kind === 'problem');

const missingInclude = (miseTomlPath: string): Finding => ({
  kind: 'problem',
  message: `${miseTomlPath}: [task_config] includes must contain "mise.tasks.toml" ` +
    '— add it by hand',
});

describe.concurrent(planMiseTasks, () => {
  it('writes the hk tasks when the file is missing', ({ expect }) => {
    const { root, tasksPath } = createRepo({ miseToml: includingTasks });

    expect(parsedWrites(plan(root))).toStrictEqual([{
      changes: ['missing'],
      path: tasksPath,
      runs: { 'hk:all': 'pnpm exec gtb hk all', 'hk:base': 'pnpm exec gtb hk base' },
    }]);
  });

  it('rewrites a hand-edited tasks file', ({ expect }) => {
    const { root, tasksPath } = createRepo({ miseToml: includingTasks });
    writeFileSync(tasksPath, '["hk:all"]\nrun = "hk check --all"\n');

    expect(parsedWrites(plan(root))).toStrictEqual([{
      changes: ['out of date'],
      path: tasksPath,
      runs: { 'hk:all': 'pnpm exec gtb hk all', 'hk:base': 'pnpm exec gtb hk base' },
    }]);
  });

  it('plans nothing once its write is applied', ({ expect }) => {
    const { root, tasksPath } = createRepo({ miseToml: includingTasks });
    for (const finding of plan(root)) {
      if (finding.kind === 'write') {
        writeFileSync(finding.path, finding.content);
      }
    }

    expect(existsSync(tasksPath)).toBe(true);
    expect(plan(root)).toStrictEqual([]);
  });

  it('runs a bare gtb in a repo that does not depend on the CLI', ({ expect }) => {
    const { root, tasksPath } = createRepo({ dependsOnCli: false, miseToml: includingTasks });

    expect(parsedWrites(plan(root))).toStrictEqual([{
      changes: ['missing'],
      path: tasksPath,
      runs: { 'hk:all': 'gtb hk all', 'hk:base': 'gtb hk base' },
    }]);
  });

  it('reports a mise.toml that does not include the tasks file', ({ expect }) => {
    const { miseTomlPath, root } = createRepo({ miseToml: '[tools]\nnode = "24"\n' });

    expect(problems(plan(root))).toStrictEqual([missingInclude(miseTomlPath)]);
  });

  it('reports an includes that is not a list as missing the tasks file', ({ expect }) => {
    const { miseTomlPath, root } = createRepo({
      miseToml: '[task_config]\nincludes = "mise.tasks.toml"\n',
    });

    expect(problems(plan(root))).toStrictEqual([missingInclude(miseTomlPath)]);
  });

  it('reports a mise.toml that is not valid TOML', ({ expect }) => {
    const { miseTomlPath, root } = createRepo({ miseToml: 'includes = [' });

    expect(problems(plan(root))).toStrictEqual([{
      kind: 'problem',
      message: `${miseTomlPath}: could not be parsed as TOML — fix it by hand`,
    }]);
  });

  it('reports a directory where the tasks file belongs', ({ expect }) => {
    const { root, tasksPath } = createRepo({ miseToml: includingTasks });
    mkdirSync(tasksPath);

    expect(plan(root)).toStrictEqual([{
      kind: 'problem',
      message: `${tasksPath}: not a file — remove it so gtb sync can write the hk tasks`,
    }]);
  });

  it('plans nothing in a repo without a mise.toml', ({ expect }) => {
    const { root } = createRepo();

    expect(plan(root)).toStrictEqual([]);
  });
});
