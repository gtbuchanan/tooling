import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { discoverWorkspace } from '#src/core/discovery.js';
import type { Finding } from '#src/tasks/toolchain.js';
import { planChangesetsConfig } from '#src/toolchains/changesets/plan.js';
import { capabilities } from '#src/toolchains/index.js';
import { createTempDir, writeJson } from '#test/helpers.js';

interface Repo {
  readonly configPath: string;
  readonly root: string;
}

/**
 * A root that depends on the CLI, with `config` as its changesets config when
 * given.
 */
const createRepo = (config?: string): Repo => {
  const root = createTempDir();
  writeJson(root, 'package.json', {
    devDependencies: { '@gtbuchanan/cli': build.semverRange() },
    name: build.packageName(),
    private: true,
  });
  const configPath = path.join(root, '.changeset', 'config.json');
  if (config !== undefined) {
    mkdirSync(path.dirname(configPath));
    writeFileSync(configPath, config);
  }

  return { configPath, root };
};

const plan = (root: string): readonly Finding[] => planChangesetsConfig({
  discovery: discoverWorkspace({ capabilities, cwd: root }),
  force: false,
  ignored: new Set(),
});

const parseJson = (text: string): unknown => JSON.parse(text);

const parsedWrites = (findings: readonly Finding[]) =>
  findings.map(finding => (finding.kind === 'write'
    ? { changes: finding.changes, data: parseJson(finding.content), path: finding.path }
    : finding));

describe.concurrent(planChangesetsConfig, () => {
  it('disables formatting in a config that leaves it at its default', ({ expect }) => {
    const baseBranch = build.packageName();
    const { configPath, root } = createRepo(JSON.stringify({ baseBranch }));

    expect(parsedWrites(plan(root))).toStrictEqual([{
      changes: ['format should be false'],
      data: { baseBranch, format: false },
      path: configPath,
    }]);
  });

  it('disables formatting in a config that names a formatter', ({ expect }) => {
    const baseBranch = build.packageName();
    const { configPath, root } = createRepo(JSON.stringify({ baseBranch, format: 'prettier' }));

    expect(parsedWrites(plan(root))).toStrictEqual([{
      changes: ['format should be false'],
      data: { baseBranch, format: false },
      path: configPath,
    }]);
  });

  it('reports a config that is not valid JSON', ({ expect }) => {
    const { configPath, root } = createRepo('{');

    expect(plan(root)).toStrictEqual([{
      kind: 'problem',
      message: `${configPath}: could not be parsed as a JSON object — fix it by hand`,
    }]);
  });

  it('reports a config that is not a JSON object', ({ expect }) => {
    const { configPath, root } = createRepo('[]');

    expect(plan(root)).toStrictEqual([{
      kind: 'problem',
      message: `${configPath}: could not be parsed as a JSON object — fix it by hand`,
    }]);
  });

  it('reports a config path that is not a file', ({ expect }) => {
    const { configPath, root } = createRepo();
    mkdirSync(configPath, { recursive: true });

    expect(plan(root)).toStrictEqual([{
      kind: 'problem',
      message: `${configPath}: not a file — replace it with the changesets config`,
    }]);
  });

  it('plans nothing for a config that disables formatting', ({ expect }) => {
    const { root } = createRepo(JSON.stringify({ format: false }));

    expect(plan(root)).toStrictEqual([]);
  });

  it('plans nothing for a repo without changesets', ({ expect }) => {
    const { root } = createRepo();

    expect(plan(root)).toStrictEqual([]);
  });

  it('plans nothing for a root that does not depend on the CLI', ({ expect }) => {
    const { root } = createRepo(JSON.stringify({ format: 'prettier' }));
    writeJson(root, 'package.json', { name: build.packageName(), private: true });

    expect(plan(root)).toStrictEqual([]);
  });
});
