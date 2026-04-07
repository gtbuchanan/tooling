import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createIsolatedFixture, runCommand } from '@gtbuchanan/test-utils';
import { describe, it } from 'vitest';

const createRequireImport = [
  'import { createRequire } from "node:module";',
  'import { pathToFileURL } from "node:url";',
  'const { resolve } = createRequire(import.meta.url);',
  'const { href } = pathToFileURL(resolve("@gtbuchanan/markdownlint-config"));',
  'export const mod = await import(href);',
].join('\n');

const createRequireConfig = [
  createRequireImport,
  'export default mod.configure();',
].join('\n');

const createRequireCli2Config = [
  createRequireImport,
  'export default mod.configureCli2();',
].join('\n');

const bareImportConfig = [
  'import { configure } from "@gtbuchanan/markdownlint-config";',
  'export default configure();',
].join('\n');

const runMarkdownlint = (
  fixture: ReturnType<typeof createIsolatedFixture>,
  config: string,
  markdown: string,
): ReturnType<typeof runCommand> => {
  const cli2 = join(fixture.hookDir, 'node_modules/.bin/markdownlint-cli2');
  writeFileSync(join(fixture.projectDir, '.markdownlint.mjs'), config);
  writeFileSync(join(fixture.projectDir, 'test.md'), markdown);
  return runCommand(cli2, ['test.md'], {
    cwd: fixture.projectDir,
    env: { ...process.env, NODE_PATH: fixture.nodePath },
  });
};

describe('pre-commit isolation', () => {
  it('fails with bare import (proves isolation works)', ({ expect }) => {
    using fixture = createIsolatedFixture({
      hookPackages: ['markdownlint-cli2'],
      packageName: '@gtbuchanan/markdownlint-config',
    });

    const cli2 = join(fixture.hookDir, 'node_modules/.bin/markdownlint-cli2');
    writeFileSync(join(fixture.projectDir, '.markdownlint.mjs'), bareImportConfig);
    writeFileSync(join(fixture.projectDir, 'test.md'), '# Hello\n\nTest.\n');

    const { NODE_PATH: _nodePath, ...envWithoutNodePath } = process.env;
    const result = runCommand(cli2, ['test.md'], {
      cwd: fixture.projectDir,
      env: envWithoutNodePath,
    });

    expect(result).not.toMatchObject({ exitCode: 0 });
  });

  it('passes for a clean markdown file', ({ expect }) => {
    using fixture = createIsolatedFixture({
      hookPackages: ['markdownlint-cli2'],
      packageName: '@gtbuchanan/markdownlint-config',
    });

    const result = runMarkdownlint(
      fixture,
      createRequireConfig,
      '# Hello\n\nThis is a test.\n',
    );

    expect(result).toMatchObject({ exitCode: 0 });
  });

  it('detects violations not suppressed by prettier style', ({ expect }) => {
    using fixture = createIsolatedFixture({
      hookPackages: ['markdownlint-cli2'],
      packageName: '@gtbuchanan/markdownlint-config',
    });

    // MD024: no-duplicate-heading (not disabled by prettier style)
    const result = runMarkdownlint(
      fixture,
      createRequireConfig,
      '# Duplicate\n\n# Duplicate\n',
    );

    expect(result).not.toMatchObject({ exitCode: 0 });
    expect(result.stderr).toMatch(/MD024/v);
  });

  it('suppresses rules disabled by prettier style', ({ expect }) => {
    using fixture = createIsolatedFixture({
      hookPackages: ['markdownlint-cli2'],
      packageName: '@gtbuchanan/markdownlint-config',
    });

    // Heading-style is disabled — mixed styles should not error
    const markdown = ['# ATX heading', '', 'Setext heading', '--------------', ''].join('\n');
    const result = runMarkdownlint(fixture, createRequireConfig, markdown);

    expect(result).toMatchObject({ exitCode: 0 });
  });

  it('ignores .changeset/ files with configureCli2', ({ expect }) => {
    using fixture = createIsolatedFixture({
      hookPackages: ['markdownlint-cli2'],
      packageName: '@gtbuchanan/markdownlint-config',
    });

    const cli2 = join(fixture.hookDir, 'node_modules/.bin/markdownlint-cli2');
    writeFileSync(join(fixture.projectDir, '.markdownlint.mjs'), createRequireConfig);
    writeFileSync(join(fixture.projectDir, '.markdownlint-cli2.mjs'), createRequireCli2Config);

    // Changeset file without a heading — would fail MD041 if not ignored
    const changesetDir = join(fixture.projectDir, '.changeset');
    mkdirSync(changesetDir);
    writeFileSync(join(changesetDir, 'test-changeset.md'), 'No heading here\n');

    // Also create a valid file so markdownlint has something to lint
    writeFileSync(join(fixture.projectDir, 'test.md'), '# Valid\n\nContent.\n');

    const result = runCommand(cli2, ['**/*.md'], {
      cwd: fixture.projectDir,
      env: { ...process.env, NODE_PATH: fixture.nodePath },
    });

    expect(result).toMatchObject({ exitCode: 0 });
  });
});
