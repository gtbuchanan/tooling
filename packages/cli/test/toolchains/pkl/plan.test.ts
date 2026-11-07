import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { discoverWorkspace } from '#src/core/discovery.js';
import type { Finding } from '#src/tasks/toolchain.js';
import { capabilities } from '#src/toolchains/index.js';
import { planPklProjects } from '#src/toolchains/pkl/plan.js';
import { createPklWorkspace, createTempDir, pklProjectSource, writeJson } from '#test/helpers.js';

const plan = (root: string): readonly Finding[] => planPklProjects({
  discovery: discoverWorkspace({ capabilities, cwd: root }),
  force: false,
  ignored: new Set(),
});

/*
 * The content of the single write planned for `root`, failing on any other
 * outcome.
 */
const plannedContent = (root: string): string => {
  const [finding, ...rest] = plan(root);
  if (finding?.kind !== 'write' || rest.length > 0) {
    throw new Error(`expected one write, planned ${JSON.stringify(plan(root))}`);
  }
  return finding.content;
};

/**
 * Scaffolds a single-package repo (root = package) with a publishable Pkl
 * package whose `PklProject` holds none of the sync-owned fields yet.
 */
const writePublishablePkg = (
  root: string,
  manifest: Record<string, unknown>,
  name: string,
): void => {
  writeJson(root, 'package.json', manifest);
  writeFileSync(path.join(root, 'Defaults.pkl'), 'module Defaults\n');
  writeFileSync(
    path.join(root, 'PklProject'),
    `amends "pkl:Project"\n\npackage {\n  name = "${name}"\n}\n`,
  );
};

describe.concurrent(planPklProjects, () => {
  it('plans the patched package block, preserving the author-owned name', ({ expect }) => {
    const ws = createPklWorkspace();
    const filePath = path.join(ws.pkgDir, 'PklProject');
    const synced = pklProjectSource({ name: ws.name, repoPath: ws.repoPath, version: ws.version });
    writeFileSync(filePath, synced.replace(`"${ws.version}"`, '"0.0.0-stale"'));

    expect(plan(ws.root)).toStrictEqual([{
      changes: ['out of date'],
      content: synced,
      kind: 'write',
      path: filePath,
    }]);
  });

  it('plans nothing when the PklProject is up to date', ({ expect }) => {
    const ws = createPklWorkspace();

    expect(plan(ws.root)).toStrictEqual([]);
  });

  it('inserts a v<version> packageZipUrl tag for a single-package repo', ({ expect }) => {
    const root = createTempDir();
    const homepage = build.gitHubRepoUrl();
    const name = build.packageName();
    writePublishablePkg(
      root,
      { homepage, name: `@scope/${name}`, version: build.semverVersion() },
      name,
    );
    const repoPath = homepage.replace(/^https?:\/\//v, '');

    expect(plannedContent(root)).toContain(
      String.raw`packageZipUrl = "https://${repoPath}/releases/download/v\(version)/`,
    );
  });

  it('throws when a publishable package is missing its version', ({ expect }) => {
    const root = createTempDir();
    const name = build.packageName();
    writePublishablePkg(root, { homepage: build.gitHubRepoUrl(), name: `@scope/${name}` }, name);

    expect(() => plan(root)).toThrow(/missing "version"/v);
  });

  it('throws when the repository URL is missing', ({ expect }) => {
    const root = createTempDir();
    const name = build.packageName();
    writePublishablePkg(root, { name: `@scope/${name}`, version: build.semverVersion() }, name);

    expect(() => plan(root)).toThrow(/homepage or repository\.url/v);
  });

  it('falls back to repository.url when homepage is absent', ({ expect }) => {
    const root = createTempDir();
    const name = build.packageName();
    writePublishablePkg(root, {
      name: `@scope/${name}`,
      repository: { type: 'git', url: 'https://github.com/o/r' },
      version: build.semverVersion(),
    }, name);

    expect(plannedContent(root))
      .toContain(String.raw`baseUri = "package://github.com/o/r/\(name)"`);
  });

  it('ignores packages without Pkl source', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    writeJson(root, 'package.json', { private: true });
    const pkgDir = path.join(root, 'packages', build.packageName());
    mkdirSync(pkgDir, { recursive: true });
    writeJson(pkgDir, 'package.json', { name: build.scopedPackageName() });

    expect(plan(root)).toStrictEqual([]);
  });

  it('ignores a Pkl project without a package block', ({ expect }) => {
    const ws = createPklWorkspace({ publishable: false });

    expect(plan(ws.root)).toStrictEqual([]);
  });
});
