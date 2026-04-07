import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type ProjectFixture,
  createIsolatedFixture,
  createProjectFixture,
  extendWithFixture,
  runCommand,
} from '@gtbuchanan/test-utils';
import { it as baseIt, describe } from 'vitest';

const oxfmtConfig = [
  "import { configure } from '@gtbuchanan/oxfmt-config';",
  'export default configure();',
].join('\n');

const createFixture = (): ProjectFixture => {
  const fixture = createProjectFixture({
    packageName: '@gtbuchanan/oxfmt-config',
    packages: ['oxfmt'],
  });
  fixture.writeFile('oxfmt.config.ts', oxfmtConfig);
  return fixture;
};

const it = extendWithFixture(createFixture);

describe('oxfmt CLI', () => {
  it('detects unsorted package.json keys', ({ fixture, expect }) => {
    // oxlint-disable-next-line sort-keys -- Intentionally unsorted to test detection
    const unsorted = { version: '1.0.0', name: 'test' };
    fixture.writeFile(
      'sub/package.json',
      `${JSON.stringify(unsorted, null, 2)}\n`,
    );

    const result = fixture.run('oxfmt', ['--check', 'sub/package.json']);

    expect(result).not.toMatchObject({ exitCode: 0 });
  });

  it('passes well-formatted JSON', ({ fixture, expect }) => {
    fixture.writeFile('data.json', '{}\n');
    fixture.run('oxfmt', ['--write', 'data.json']);

    const result = fixture.run('oxfmt', ['--check', 'data.json']);

    expect(result).toMatchObject({ exitCode: 0 });
  });

  it('ignores JavaScript and TypeScript files', ({ fixture, expect }) => {
    fixture.writeFile('messy.ts', 'const   x   =   1;\n');
    fixture.writeFile('messy.mjs', 'const   x   =   1;\n');

    const tsResult = fixture.run(
      'oxfmt',
      ['--check', '--no-error-on-unmatched-pattern', 'messy.ts'],
    );
    const jsResult = fixture.run(
      'oxfmt',
      ['--check', '--no-error-on-unmatched-pattern', 'messy.mjs'],
    );

    expect(tsResult).toMatchObject({ exitCode: 0 });
    expect(jsResult).toMatchObject({ exitCode: 0 });
  });
});

const createRequireConfig = [
  'import { createRequire } from "node:module";',
  'import { pathToFileURL } from "node:url";',
  'const { resolve } = createRequire(import.meta.url);',
  'const { href } = pathToFileURL(resolve("@gtbuchanan/oxfmt-config"));',
  'const { configure } = await import(href);',
  'export default configure();',
].join('\n');

describe('pre-commit isolation', () => {
  baseIt('fails with bare import (proves isolation works)', ({ expect }) => {
    using fixture = createIsolatedFixture({
      hookPackages: ['oxfmt'],
      packageName: '@gtbuchanan/oxfmt-config',
    });

    const oxfmt = join(fixture.hookDir, 'node_modules/.bin/oxfmt');
    writeFileSync(join(fixture.projectDir, 'oxfmt.config.ts'), oxfmtConfig);
    writeFileSync(join(fixture.projectDir, 'data.json'), '{}\n');

    const { NODE_PATH: _nodePath, ...envWithoutNodePath } = process.env;
    const result = runCommand(oxfmt, ['--check', 'data.json'], {
      cwd: fixture.projectDir,
      env: envWithoutNodePath,
    });

    expect(result).not.toMatchObject({ exitCode: 0 });
  });

  baseIt('resolves config via NODE_PATH', ({ expect }) => {
    using fixture = createIsolatedFixture({
      hookPackages: ['oxfmt'],
      packageName: '@gtbuchanan/oxfmt-config',
    });

    const oxfmt = join(fixture.hookDir, 'node_modules/.bin/oxfmt');
    writeFileSync(join(fixture.projectDir, 'oxfmt.config.ts'), createRequireConfig);
    writeFileSync(join(fixture.projectDir, 'data.json'), '{}\n');

    const result = runCommand(oxfmt, ['--check', 'data.json'], {
      cwd: fixture.projectDir,
      env: { ...process.env, NODE_PATH: fixture.nodePath },
    });

    expect(result).toMatchObject({ exitCode: 0 });
  });
});
