import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { discoverWorkspace } from '#src/lib/discovery.js';
import { checkManifests, generateManifests, unscopedName } from '#src/lib/manifest-sync.js';
import { createPklWorkspace, createTempDir, pklProjectSource, writeJson } from './helpers.ts';

/** Scaffolds a single-package repo (root = package) with a publishable Pkl package. */
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

describe.concurrent(unscopedName, () => {
  it('strips an npm scope', ({ expect }) => {
    expect(unscopedName('@gtbuchanan/hk-config')).toBe('hk-config');
  });

  it('passes an unscoped name through unchanged', ({ expect }) => {
    expect(unscopedName('hk-config')).toBe('hk-config');
  });
});

describe.concurrent(generateManifests, () => {
  it('patches the package block, preserving the author-owned name', ({ expect }) => {
    const ws = createPklWorkspace();
    const expected = pklProjectSource({
      name: ws.name,
      repoPath: ws.repoPath,
      version: ws.version,
    });

    const [manifest, ...rest] = generateManifests(discoverWorkspace({ cwd: ws.root }));

    expect(rest).toHaveLength(0);
    expect(manifest?.filePath).toBe(path.join(ws.pkgDir, 'PklProject'));
    expect(manifest?.content).toBe(expected);
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

    const [manifest] = generateManifests(discoverWorkspace({ cwd: root }));
    const repoPath = homepage.replace(/^https?:\/\//v, '');

    expect(manifest?.content).toContain(
      String.raw`packageZipUrl = "https://${repoPath}/releases/download/v\(version)/`,
    );
  });

  it('throws when a publishable package is missing its version', ({ expect }) => {
    const root = createTempDir();
    const name = build.packageName();
    writePublishablePkg(root, { homepage: build.gitHubRepoUrl(), name: `@scope/${name}` }, name);

    expect(() => generateManifests(discoverWorkspace({ cwd: root })))
      .toThrow(/missing "version"/v);
  });

  it('throws when the repository URL is missing', ({ expect }) => {
    const root = createTempDir();
    const name = build.packageName();
    writePublishablePkg(root, { name: `@scope/${name}`, version: build.semverVersion() }, name);

    expect(() => generateManifests(discoverWorkspace({ cwd: root })))
      .toThrow(/homepage or repository\.url/v);
  });

  it('normalizes a git+https repository URL in the package baseUri', ({ expect }) => {
    const root = createTempDir();
    const name = build.packageName();
    writePublishablePkg(root, {
      name: `@scope/${name}`,
      repository: { type: 'git', url: 'git+https://github.com/o/r.git' },
      version: build.semverVersion(),
    }, name);

    const [manifest] = generateManifests(discoverWorkspace({ cwd: root }));

    expect(manifest?.content).toContain(String.raw`baseUri = "package://github.com/o/r/\(name)"`);
  });

  it('ignores packages without Pkl source', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    writeJson(root, 'package.json', { homepage: build.gitHubRepoUrl(), private: true });
    const pkgDir = path.join(root, 'packages', build.packageName());
    mkdirSync(pkgDir, { recursive: true });
    writeJson(pkgDir, 'package.json', { name: build.scopedPackageName() });

    expect(generateManifests(discoverWorkspace({ cwd: root }))).toHaveLength(0);
  });

  it('ignores a Pkl project without a package block', ({ expect }) => {
    const ws = createPklWorkspace({ publishable: false });

    expect(generateManifests(discoverWorkspace({ cwd: ws.root }))).toHaveLength(0);
  });
});

describe.concurrent(checkManifests, () => {
  it('passes when the on-disk PklProject matches', ({ expect }) => {
    const ws = createPklWorkspace();

    expect(checkManifests(discoverWorkspace({ cwd: ws.root }))).toStrictEqual([]);
  });

  it('reports drift when a sync-owned field is stale', ({ expect }) => {
    const ws = createPklWorkspace();
    writeFileSync(
      path.join(ws.pkgDir, 'PklProject'),
      'amends "pkl:Project"\n\npackage {\n  name = "x"\n  version = "0.0.0-stale"\n}\n',
    );

    expect(checkManifests(discoverWorkspace({ cwd: ws.root }))).toStrictEqual([
      `${path.join(ws.pkgDir, 'PklProject')}: out of date (run gtb sync manifest)`,
    ]);
  });
});
