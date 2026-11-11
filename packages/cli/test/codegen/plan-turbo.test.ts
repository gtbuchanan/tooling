import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import * as v from 'valibot';
import { describe, it } from 'vitest';
import { planTurbo } from '#src/codegen/plan-turbo.js';
import { discoverWorkspace } from '#src/core/discovery.js';
import { jsonContent, sortKeysDeep } from '#src/core/file-writer.js';
import { UnknownRecord } from '#src/core/schemas.js';
import type { Finding, PlanContext } from '#src/tasks/toolchain.js';
import { capabilities } from '#src/toolchains/index.js';
import { createTempDir, writeJson } from '#test/helpers.js';

interface Root {
  readonly root: string;
  readonly turboPath: string;
}

/**
 * A single-package root that lints with eslint-config, so its `turbo.json`
 * holds `lint:eslint`.
 */
const createRoot = (hasCliDependency = true): Root => {
  const root = createTempDir();
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'linkWorkspacePackages: true\n');
  mkdirSync(path.join(root, 'src'));
  writeJson(root, 'package.json', {
    devDependencies: {
      ...(hasCliDependency && { '@gtbuchanan/cli': build.semverRange() }),
      '@gtbuchanan/eslint-config': build.semverRange(),
    },
    name: build.scopedPackageName(),
  });

  return { root, turboPath: path.join(root, 'turbo.json') };
};

const plan = (root: string, options: Partial<PlanContext> = {}): readonly Finding[] =>
  planTurbo({
    discovery: discoverWorkspace({ capabilities, cwd: root }),
    force: false,
    ignored: new Set(),
    ...options,
  });

const TurboSchema = v.looseObject({ tasks: UnknownRecord });

const applyWrites = (findings: readonly Finding[]): void => {
  for (const finding of findings) {
    if (finding.kind === 'write') {
      writeFileSync(finding.path, finding.content);
    }
  }
};

const changesTo = (findings: readonly Finding[], filePath: string) =>
  findings.flatMap(finding => (finding.kind === 'write' && finding.path === filePath
    ? finding.changes
    : []));

/**
 * The synced `turbo.json` with `edit` applied to its tasks.
 */
const editTasks = (
  root: Root,
  edit: (tasks: Record<string, unknown>) => Record<string, unknown>,
): void => {
  applyWrites(plan(root.root));
  const text = readFileSync(root.turboPath, 'utf8');
  const turbo = v.parse(TurboSchema, JSON.parse(text));
  const edited = sortKeysDeep({ ...turbo, tasks: edit(turbo.tasks) });
  writeFileSync(root.turboPath, jsonContent(edited));
};

describe.concurrent(planTurbo, () => {
  it('writes turbo.json when it is missing', ({ expect }) => {
    const { root, turboPath } = createRoot();

    expect(changesTo(plan(root), turboPath)).toStrictEqual(['missing']);
  });

  it('plans nothing once its write is applied', ({ expect }) => {
    const { root, turboPath } = createRoot();
    const findings = plan(root);
    applyWrites(findings);

    expect(changesTo(findings, turboPath)).toStrictEqual(['missing']);
    expect(changesTo(plan(root), turboPath)).toStrictEqual([]);
  });

  it('names a task the file lacks', ({ expect }) => {
    const repo = createRoot();
    editTasks(repo, ({ 'lint:eslint': _removed, ...rest }) => rest);

    expect(changesTo(plan(repo.root), repo.turboPath)).toStrictEqual([
      "missing task 'lint:eslint'",
    ]);
  });

  it('rewrites a hand edit to a generated task', ({ expect }) => {
    const repo = createRoot();
    editTasks(repo, tasks => ({ ...tasks, 'lint:eslint': { cache: false } }));

    expect(changesTo(plan(repo.root), repo.turboPath)).toStrictEqual(['out of date']);
  });

  it('leaves an ignored task as the file has it', ({ expect }) => {
    const repo = createRoot();
    editTasks(repo, ({ 'lint:eslint': _removed, ...rest }) => rest);

    const findings = plan(repo.root, { ignored: new Set(['lint:eslint']) });

    expect(changesTo(findings, repo.turboPath)).toStrictEqual([]);
  });

  it('reports a package whose generate scripts have no package configuration', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    writeJson(root, 'package.json', {
      devDependencies: { '@gtbuchanan/cli': build.semverRange() },
      name: build.packageName(),
      private: true,
    });
    const pkgDir = path.join(root, 'packages', build.packageName());
    mkdirSync(pkgDir, { recursive: true });
    writeJson(pkgDir, 'package.json', {
      name: build.scopedPackageName(),
      scripts: { 'generate:prisma': 'prisma generate' },
    });

    expect(plan(root).filter(({ kind }) => kind === 'problem')).toStrictEqual([{
      kind: 'problem',
      message: `${path.join(pkgDir, 'turbo.json')}: missing — add a package configuration ` +
        'defining generate:* tasks',
    }]);
  });

  it('plans nothing in a repo that does not build with gtb', ({ expect }) => {
    const { root } = createRoot(false);

    expect(plan(root)).toStrictEqual([]);
  });
});
