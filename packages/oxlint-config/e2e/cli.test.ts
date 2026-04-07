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

const isAndroid = process.platform === 'android';

const oxlintConfig = [
  "import { configure } from '@gtbuchanan/oxlint-config';",
  'export default configure({ options: { typeAware: false } });',
].join('\n');

const createFixture = (): ProjectFixture => {
  const fixture = createProjectFixture({
    packageName: '@gtbuchanan/oxlint-config',
    packages: ['oxlint'],
  });
  fixture.writeFile('oxlint.config.ts', oxlintConfig);
  return fixture;
};

const it = extendWithFixture(createFixture);

describe('oxlint CLI', () => {
  it('detects debugger statements', ({ fixture, expect }) => {
    fixture.writeFile('bad.js', 'debugger;\n');

    const result = fixture.run('oxlint', ['bad.js']);

    expect(result.exitCode).not.toBe(0);
  });

  it('passes clean code', ({ fixture, expect }) => {
    fixture.writeFile('good.js', 'export const greeting = 42;\n');

    const result = fixture.run('oxlint', ['good.js']);

    expect(result.exitCode).toBe(0);
  });

  it('enforces denyWarnings', ({ fixture, expect }) => {
    fixture.writeFile('warn.js', 'debugger;\n');

    const result = fixture.run('oxlint', ['warn.js']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain('debugger');
  });

  // JsPlugins crash on Android/Termux; stylistic rules require the plugin
  baseIt.runIf(!isAndroid)(
    'includes stylistic rules via @stylistic/eslint-plugin',
    ({ expect }) => {
      const fixture = createFixture();
      fixture.writeFile('style.js', 'const _unused = 42\n');

      const result = fixture.run('oxlint', ['style.js']);

      expect(result.stdout).toContain('semi');
    },
  );

  it('relaxes no-magic-numbers in test files', ({ fixture, expect }) => {
    fixture.writeFile('test/example.test.ts', 'export const answer = 42;\n');

    const result = fixture.run('oxlint', ['test/example.test.ts']);

    expect(result.exitCode).toBe(0);
  });
});

const createRequireConfig = [
  'import { createRequire } from "node:module";',
  'import { pathToFileURL } from "node:url";',
  'const { resolve } = createRequire(import.meta.url);',
  'const { href } = pathToFileURL(resolve("@gtbuchanan/oxlint-config"));',
  'const { configure } = await import(href);',
  'export default configure({ options: { typeAware: false } });',
].join('\n');

describe('pre-commit isolation', () => {
  baseIt('fails with bare import (proves isolation works)', ({ expect }) => {
    using fixture = createIsolatedFixture({
      hookPackages: ['oxlint'],
      packageName: '@gtbuchanan/oxlint-config',
    });

    const oxlint = join(fixture.hookDir, 'node_modules/.bin/oxlint');
    writeFileSync(join(fixture.projectDir, 'oxlint.config.ts'), oxlintConfig);
    writeFileSync(join(fixture.projectDir, 'good.js'), 'export const greeting = 42;\n');

    const { NODE_PATH: _nodePath, ...envWithoutNodePath } = process.env;
    const result = runCommand(oxlint, ['good.js'], {
      cwd: fixture.projectDir,
      env: envWithoutNodePath,
    });

    expect(result).not.toMatchObject({ exitCode: 0 });
  });

  baseIt('resolves config via NODE_PATH', ({ expect }) => {
    using fixture = createIsolatedFixture({
      hookPackages: ['oxlint'],
      packageName: '@gtbuchanan/oxlint-config',
    });

    const oxlint = join(fixture.hookDir, 'node_modules/.bin/oxlint');
    writeFileSync(join(fixture.projectDir, 'oxlint.config.ts'), createRequireConfig);
    writeFileSync(join(fixture.projectDir, 'good.js'), 'export const greeting = 42;\n');

    const result = runCommand(oxlint, ['good.js'], {
      cwd: fixture.projectDir,
      env: { ...process.env, NODE_PATH: fixture.nodePath },
    });

    expect(result).toMatchObject({ exitCode: 0 });
  });
});
