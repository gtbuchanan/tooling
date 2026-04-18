import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createIsolatedFixture, runCommand } from '@gtbuchanan/test-utils';
import { it as base, describe } from 'vitest';

const createRequireConfig = [
  'import { createRequire } from "node:module";',
  'import { pathToFileURL } from "node:url";',
  'const { resolve } = createRequire(import.meta.url);',
  'const { href } = pathToFileURL(resolve("@gtbuchanan/eslint-config"));',
  'const { configure } = await import(href);',
  'export default configure({',
  '  onlyWarn: false,',
  '  tsconfigRootDir: import.meta.dirname,',
  '});',
].join('\n');

const createRequireOnlyWarnConfig = [
  'import { createRequire } from "node:module";',
  'import { pathToFileURL } from "node:url";',
  'const { resolve } = createRequire(import.meta.url);',
  'const { href } = pathToFileURL(resolve("@gtbuchanan/eslint-config"));',
  'const { configure } = await import(href);',
  'export default configure({',
  '  onlyWarn: true,',
  '  tsconfigRootDir: import.meta.dirname,',
  '});',
].join('\n');

const tsconfigRoot = `${JSON.stringify({
  compilerOptions: {
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    target: 'ESNext',
  },
})}\n`;

const tsconfig = `${JSON.stringify({
  extends: './tsconfig.root.json',
  include: ['**/*.ts', '**/*.mts', '**/*.cts'],
})}\n`;

interface RunOptions {
  config?: string;
  env?: Record<string, string | undefined>;
  files: Record<string, string>;
}

const createFixture = () => {
  const fixture = createIsolatedFixture({
    depsPackages: ['typescript'],
    hookPackages: ['eslint', 'jiti'],
    packageName: '@gtbuchanan/eslint-config',
    workspaceDeps: [],
  });

  const eslint = path.join(fixture.hookDir, 'node_modules/.bin/eslint');

  const run = ({ config, env, files }: RunOptions) => {
    writeFileSync(path.join(fixture.projectDir, 'eslint.config.ts'), config ?? createRequireConfig);
    writeFileSync(path.join(fixture.projectDir, 'tsconfig.json'), tsconfig);
    writeFileSync(path.join(fixture.projectDir, 'tsconfig.root.json'), tsconfigRoot);

    const fileNames = Object.keys(files);
    for (const [name, content] of Object.entries(files)) {
      const filePath = path.join(fixture.projectDir, name);
      mkdirSync(path.join(filePath, '..'), { recursive: true });
      writeFileSync(filePath, content);
    }

    return runCommand(eslint, fileNames, {
      cwd: fixture.projectDir,
      env: {
        ...process.env,
        NODE_PATH: fixture.nodePath,
        ...env,
      },
    });
  };

  return {
    eslint,
    nodePath: fixture.nodePath,
    projectDir: fixture.projectDir,
    run,
    [Symbol.dispose]() {
      fixture[Symbol.dispose]();
    },
  };
};

type Fixture = ReturnType<typeof createFixture>;

/* eslint-disable-next-line vitest/consistent-test-it --
   False positive on .extend() factory:
   https://github.com/vitest-dev/eslint-plugin-vitest/issues/884 */
const it = base.extend<{ fixture: Fixture }>({

  fixture: [async ({}, use) => {
    using fixture = createFixture();
    await use(fixture);
  }, { scope: 'file' }],
});

describe.concurrent('eslint CLI integration', () => {
  it('fails with bare import (proves isolation works)', ({ fixture, expect }) => {
    const bareConfig = [
      'import { configure } from "@gtbuchanan/eslint-config";',
      'export default configure({',
      '  onlyWarn: false,',
      '  tsconfigRootDir: import.meta.dirname,',
      '});',
    ].join('\n');

    writeFileSync(path.join(fixture.projectDir, 'eslint.config.ts'), bareConfig);

    const filePath = path.join(fixture.projectDir, 'clean.mjs');
    writeFileSync(filePath, "export const greeting = 'hello';\n");

    const { NODE_PATH: _nodePath, ...envWithoutNodePath } = process.env;
    const { exitCode, stderr } = runCommand(
      fixture.eslint,
      ['clean.mjs'],
      { cwd: fixture.projectDir, env: envWithoutNodePath },
    );

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('@gtbuchanan/eslint-config');
  });

  it('passes for a clean file', ({ fixture, expect }) => {
    const result = fixture.run({
      files: { 'clean.ts': "export const greeting = 'hello';\n" },
    });

    expect(result).toMatchObject({ exitCode: 0 });
  });

  it('detects process.exit via eslint-plugin-n', ({ fixture, expect }) => {
    const { exitCode, stdout } = fixture.run({
      files: { 'bad.ts': 'process.exit(0);\n' },
    });

    expect(exitCode).not.toBe(0);
    expect(stdout).toContain('n/no-process-exit');
  });

  it('applies oxlint overlay as last config', ({ fixture, expect }) => {
    const { exitCode, stdout } = fixture.run({
      files: { 'test.ts': 'export const greeting = 42;\n' },
    });

    // Should pass — oxlint overlay disables overlapping ESLint rules
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain('Error');
  });

  it('respects global ignores for dist/', ({ fixture, expect }) => {
    const longLine = `export const x = '${'a'.repeat(101)}';\n`;
    const { exitCode } = fixture.run({
      files: { 'dist/bad.mjs': longLine },
    });

    expect(exitCode).toBe(0);
  });

  it('detects duplicate keys in JSON files', ({ fixture, expect }) => {
    const { exitCode, stdout } = fixture.run({
      files: { 'bad.json': '{\n  "key": 1,\n  "key": 2\n}\n' },
    });

    expect(exitCode).not.toBe(0);
    expect(stdout).toContain('json/no-duplicate-keys');
  });

  it('passes for a valid JSON file', ({ fixture, expect }) => {
    const { exitCode } = fixture.run({
      files: { 'valid.json': '{\n  "key": "value"\n}\n' },
    });

    expect(exitCode).toBe(0);
  });

  it('warns on unsorted keys in JSON files', ({ fixture, expect }) => {
    const { exitCode, stdout } = fixture.run({
      files: { 'unsorted.json': '{\n  "beta": 1,\n  "alpha": 2\n}\n' },
    });

    // Warnings don't cause a non-zero exit code
    expect(exitCode).toBe(0);
    expect(stdout).toContain('json/sort-keys');
  });

  it('allows comments in tsconfig.json via JSONC', ({ fixture, expect }) => {
    const { exitCode } = fixture.run({
      files: {
        'tsconfig.json': '{\n  // A comment\n  "compilerOptions": {}\n}\n',
      },
    });

    expect(exitCode).toBe(0);
  });

  it('downgrades errors to warnings with onlyWarn', ({ fixture, expect }) => {
    const { exitCode, stdout } = fixture.run({
      config: createRequireOnlyWarnConfig,
      files: { 'bad.ts': 'process.exit(0);\n' },
    });

    // Warnings don't cause a non-zero exit code
    expect(exitCode).toBe(0);
    expect(stdout).toContain('n/no-process-exit');
  });
});
