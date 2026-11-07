import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { discoverWorkspace } from '#src/core/discovery.js';
import { checkChangelogFormatting } from '#src/toolchains/changesets/checks.js';
import { capabilities } from '#src/toolchains/index.js';
import { createTempDir, writeJson } from '#test/helpers.js';

const createRepo = (config?: string): string => {
  const root = createTempDir();
  writeJson(root, 'package.json', { name: build.scopedPackageName(), private: true });
  if (config !== undefined) {
    mkdirSync(path.join(root, '.changeset'));
    writeFileSync(path.join(root, '.changeset', 'config.json'), config);
  }

  return root;
};

const check = (root: string): readonly string[] =>
  checkChangelogFormatting({ discovery: discoverWorkspace({ capabilities, cwd: root }) });

describe.concurrent(checkChangelogFormatting, () => {
  it('reports a config that leaves format at its default', ({ expect }) => {
    const root = createRepo(JSON.stringify({ access: 'public' }));

    expect(check(root)).toStrictEqual([expect.stringContaining('"format": false')]);
  });

  it('reports a config that names a formatter', ({ expect }) => {
    const root = createRepo(JSON.stringify({ format: 'prettier' }));

    expect(check(root)).toStrictEqual([expect.stringContaining('"format": false')]);
  });

  it('reports a config that is not valid JSON', ({ expect }) => {
    const root = createRepo('{');

    expect(check(root)).toStrictEqual([expect.stringContaining('.changeset/config.json')]);
  });

  it('passes a config that disables formatting', ({ expect }) => {
    const root = createRepo(JSON.stringify({ format: false }));

    expect(check(root)).toStrictEqual([]);
  });

  it('passes a repo without changesets', ({ expect }) => {
    const root = createRepo();

    expect(check(root)).toStrictEqual([]);
  });
});
