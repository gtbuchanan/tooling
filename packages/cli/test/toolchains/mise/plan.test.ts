import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { parse as parseToml } from 'smol-toml';
import * as v from 'valibot';
import { describe, it } from 'vitest';
import { discoverWorkspace } from '#src/core/discovery.js';
import type { Finding } from '#src/tasks/toolchain.js';
import { capabilities } from '#src/toolchains/index.js';
import { planMiseFragment } from '#src/toolchains/mise/plan.js';
import { createTempDir, writeJson } from '#test/helpers.js';

interface RepoOptions {
  readonly dependsOnCli?: boolean;
  readonly miseConfig?: string;
}

interface Repo {
  readonly fragmentPath: string;
  readonly root: string;
}

/**
 * A root with a `mise.toml`, unless `miseConfig` names none.
 */
const createRepo = (
  { dependsOnCli = true, miseConfig = 'mise.toml' }: RepoOptions = {},
): Repo => {
  const root = createTempDir();
  writeJson(root, 'package.json', {
    ...(dependsOnCli && { devDependencies: { '@gtbuchanan/cli': build.semverRange() } }),
    name: build.packageName(),
    private: true,
  });
  if (miseConfig !== '') {
    mkdirSync(path.dirname(path.join(root, miseConfig)), { recursive: true });
    writeFileSync(path.join(root, miseConfig), '[tools]\nnode = "24"\n');
  }

  return { fragmentPath: path.join(root, '.config', 'mise', 'conf.d', 'gtb.toml'), root };
};

const plan = (root: string): readonly Finding[] => planMiseFragment({
  discovery: discoverWorkspace({ capabilities, cwd: root }),
  force: false,
  ignored: new Set(),
});

const TaskSchema = v.looseObject({ run: v.string() });

const FragmentSchema = v.object({ tasks: v.record(v.string(), TaskSchema) });

// Each task's command, keyed by task name
const runsOf = (content: string): Record<string, string> => {
  const { tasks } = v.parse(FragmentSchema, parseToml(content));
  return Object.fromEntries(Object.entries(tasks).map(([name, { run }]) => [name, run]));
};

const parsedWrites = (findings: readonly Finding[]) =>
  findings.map(finding => (finding.kind === 'write'
    ? { changes: finding.changes, path: finding.path, runs: runsOf(finding.content) }
    : finding));

describe.concurrent(planMiseFragment, () => {
  it('writes the hk tasks into conf.d when the file is missing', ({ expect }) => {
    const { fragmentPath, root } = createRepo();

    expect(parsedWrites(plan(root))).toStrictEqual([{
      changes: ['missing'],
      path: fragmentPath,
      runs: { 'hk:all': 'pnpm exec gtb hk all', 'hk:base': 'pnpm exec gtb hk base' },
    }]);
  });

  it('writes the hk tasks beside a mise config under .config', ({ expect }) => {
    const { fragmentPath, root } = createRepo({ miseConfig: '.config/mise.toml' });

    expect(plan(root).map(finding => finding.kind === 'write' && finding.path))
      .toStrictEqual([fragmentPath]);
  });

  it('rewrites a hand-edited tasks file', ({ expect }) => {
    const { fragmentPath, root } = createRepo();
    mkdirSync(path.dirname(fragmentPath), { recursive: true });
    writeFileSync(fragmentPath, '[tasks."hk:all"]\nrun = "hk check --all"\n');

    expect(parsedWrites(plan(root))).toStrictEqual([{
      changes: ['out of date'],
      path: fragmentPath,
      runs: { 'hk:all': 'pnpm exec gtb hk all', 'hk:base': 'pnpm exec gtb hk base' },
    }]);
  });

  it('plans nothing once its write is applied', ({ expect }) => {
    const { fragmentPath, root } = createRepo();
    for (const finding of plan(root)) {
      if (finding.kind !== 'write') {
        continue;
      }
      mkdirSync(path.dirname(finding.path), { recursive: true });
      writeFileSync(finding.path, finding.content);
    }

    expect(existsSync(fragmentPath)).toBe(true);
    expect(plan(root)).toStrictEqual([]);
  });

  it('runs a bare gtb in a repo that does not depend on the CLI', ({ expect }) => {
    const { fragmentPath, root } = createRepo({ dependsOnCli: false });

    expect(parsedWrites(plan(root))).toStrictEqual([{
      changes: ['missing'],
      path: fragmentPath,
      runs: { 'hk:all': 'gtb hk all', 'hk:base': 'gtb hk base' },
    }]);
  });

  /*
   * While a config still includes it, the old file's tasks take precedence
   * over conf.d's, so the repository would keep running the stale commands.
   */
  it('reports a leftover mise.tasks.toml', ({ expect }) => {
    const { root } = createRepo();
    const legacyPath = path.join(root, 'mise.tasks.toml');
    writeFileSync(legacyPath, '["hk:all"]\nrun = "gtb hk all"\n');

    expect(plan(root).filter(({ kind }) => kind === 'problem')).toStrictEqual([{
      kind: 'problem',
      message: `${legacyPath}: gtb now writes the hk tasks to .config/mise/conf.d/gtb.toml ` +
        '— delete this file and its [task_config] includes entry',
    }]);
  });

  it('reports a directory where the tasks file belongs', ({ expect }) => {
    const { fragmentPath, root } = createRepo();
    mkdirSync(fragmentPath, { recursive: true });

    expect(plan(root)).toStrictEqual([{
      kind: 'problem',
      message: `${fragmentPath}: not a file — remove it so gtb sync can write the hk tasks`,
    }]);
  });

  it('plans nothing in a repo without a mise config', ({ expect }) => {
    const { root } = createRepo({ miseConfig: '' });

    expect(plan(root)).toStrictEqual([]);
  });

  it('plans nothing in a repo with a mise lockfile but no config', ({ expect }) => {
    const { root } = createRepo({ miseConfig: '' });
    writeFileSync(path.join(root, 'mise.lock'), '');

    expect(plan(root)).toStrictEqual([]);
  });
});
