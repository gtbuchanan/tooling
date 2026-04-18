import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createProjectFixture, runCommand } from '@gtbuchanan/test-utils';
import * as v from 'valibot';
import { it as base, describe } from 'vitest';

const vitestConfig = [
  'import { defineConfig } from "vitest/config";',
  'import { configure } from "@gtbuchanan/vitest-config/configure";',
  'export default defineConfig(configure());',
].join('\n');

const createFixture = () => {
  const fixture = createProjectFixture({
    packageName: '@gtbuchanan/vitest-config',
    packages: ['vitest', '@vitest/coverage-v8', 'console-fail-test'],
  });

  writeFileSync(path.join(fixture.projectDir, 'vitest.config.ts'), vitestConfig);
  mkdirSync(path.join(fixture.projectDir, 'src'), { recursive: true });

  // Add subpath imports for #src/* resolution
  const pkgJsonPath = path.join(fixture.projectDir, 'package.json');
  const pkg = v.parse(
    v.looseObject({ imports: v.optional(v.record(v.string(), v.string())) }),
    JSON.parse(readFileSync(pkgJsonPath, 'utf8')),
  );
  pkg.imports = { '#src/*': './src/*' };
  writeFileSync(pkgJsonPath, JSON.stringify(pkg, undefined, 2));

  const vitest = path.join(fixture.projectDir, 'node_modules/.bin/vitest');

  const env = {
    ...process.env,
    INIT_CWD: fixture.projectDir,
  };

  const run = ({ files }: { files: Record<string, string> }) => {
    for (const [name, content] of Object.entries(files)) {
      const filePath = path.join(fixture.projectDir, name);
      mkdirSync(path.join(filePath, '..'), { recursive: true });
      writeFileSync(filePath, content);
    }

    const testFiles = Object.keys(files).filter(
      file => file.endsWith('.test.ts'),
    );

    return runCommand(
      vitest,
      ['run', '--reporter=verbose', ...testFiles],
      { cwd: fixture.projectDir, env },
    );
  };

  return {
    env,
    projectDir: fixture.projectDir,
    run,
    vitest,
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

describe('vitest CLI integration', () => {
  it('enforces hasAssertions via setup file', ({ fixture, expect }) => {
    const { exitCode, stdout } = fixture.run({
      files: {
        'no-assert.test.ts': [
          'import { it } from "vitest";',
          'it("has no assertions", () => {});',
        ].join('\n'),
      },
    });

    expect(exitCode).not.toBe(0);
    expect(stdout).toMatch(/expected .*? assertion/v);
  });

  it('enforces console-fail-test via setup file', ({ fixture, expect }) => {
    const { exitCode, stderr, stdout } = fixture.run({
      files: {
        'console.test.ts': [
          'import { it } from "vitest";',
          'it("logs to console", ({ expect }) => {',
          '  console.log("forbidden");',
          '  expect(true).toBe(true);',
          '});',
        ].join('\n'),
      },
    });

    expect(exitCode).not.toBe(0);
    expect(stdout + stderr).toMatch(/console method/v);
  });

  it('resolves #src/ subpath imports', ({ fixture, expect }) => {
    const { exitCode } = fixture.run({
      files: {
        'alias.test.ts': [
          'import { it } from "vitest";',
          'import { greet } from "#src/greet";',
          'it("greets", ({ expect }) => {',
          '  expect(greet("World")).toBe("Hello, World!");',
          '});',
        ].join('\n'),

        'src/greet.ts': 'export const greet = (name: string) => `Hello, ${name}!`;\n',
      },
    });

    expect(exitCode).toBe(0);
  });

  it('uses v8 coverage provider', ({ fixture, expect }) => {
    writeFileSync(
      path.join(fixture.projectDir, 'src/add.ts'),
      'export const add = (a: number, b: number) => a + b;\n',
    );
    writeFileSync(
      path.join(fixture.projectDir, 'cov.test.ts'),
      [
        'import { it } from "vitest";',
        'import { add } from "#src/add";',
        'it("adds", ({ expect }) => {',
        '  expect(add(1, 2)).toBe(3);',
        '});',
      ].join('\n'),
    );

    const { exitCode } = runCommand(
      fixture.vitest,
      ['run', '--reporter=verbose', '--coverage', 'cov.test.ts'],
      { cwd: fixture.projectDir, env: fixture.env },
    );

    expect(exitCode).toBe(0);
    expect(existsSync(path.join(fixture.projectDir, 'dist/coverage'))).toBe(true);
  });

  it('writes repo-relative lcov paths for package coverage', ({ fixture, expect }) => {
    const appDir = path.join(fixture.projectDir, 'packages', 'app');
    mkdirSync(path.join(appDir, 'src'), { recursive: true });
    mkdirSync(path.join(appDir, 'test'), { recursive: true });
    writeFileSync(
      path.join(appDir, 'package.json'),
      JSON.stringify({ name: '@test/app', private: true, type: 'module' }),
    );
    writeFileSync(
      path.join(appDir, 'vitest.config.ts'),
      [
        'import { defineConfig } from "vitest/config";',
        'import { configurePackage } from "@gtbuchanan/vitest-config/configure";',
        'export default defineConfig(configurePackage());',
      ].join('\n'),
    );
    writeFileSync(
      path.join(appDir, 'src/add.ts'),
      'export const add = (a: number, b: number) => a + b;\n',
    );
    writeFileSync(
      path.join(appDir, 'test/cov.test.ts'),
      [
        'import { it } from "vitest";',
        'import { add } from "../src/add";',
        'it("adds", ({ expect }) => {',
        '  expect(add(1, 2)).toBe(3);',
        '});',
      ].join('\n'),
    );

    const initResult = runCommand('git', ['init'], { cwd: fixture.projectDir });

    expect(initResult).toMatchObject({ exitCode: 0 });

    const { exitCode } = runCommand(
      fixture.vitest,
      ['run', '--reporter=verbose', '--coverage', 'test/cov.test.ts'],
      {
        cwd: appDir,
        env: {
          ...fixture.env,
          GITHUB_WORKSPACE: fixture.projectDir,
          INIT_CWD: appDir,
        },
      },
    );

    expect(exitCode).toBe(0);

    const lcovPath = path.join(appDir, 'dist/coverage/vitest/all/lcov.info');

    expect(existsSync(lcovPath)).toBe(true);

    const lcov = readFileSync(lcovPath, 'utf8');
    const normalizedLcov = lcov.replaceAll('\\', '/');

    expect(normalizedLcov).toContain('SF:packages/app/src/add.ts');
  });

  it('auto-resets mocks between tests (mockReset: true)', ({ fixture, expect }) => {
    const { exitCode, stdout } = fixture.run({
      files: {
        'mock-reset.test.ts': [
          'import { vi, it, describe } from "vitest";',
          'const mock = vi.fn();',
          'describe("mockReset", () => {',
          '  it("records calls", ({ expect }) => {',
          '    mock.mockReturnValue("value");',
          '    mock();',
          '    expect(mock).toHaveBeenCalledOnce();',
          '    expect(mock).toHaveReturnedWith("value");',
          '  });',
          '  it("is auto-reset between tests", ({ expect }) => {',
          '    expect(mock).not.toHaveBeenCalled();',
          '    expect(mock()).toBeUndefined();',
          '  });',
          '});',
        ].join('\n'),
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('2 passed');
  });

  it('auto-unstubs env vars between tests (unstubEnvs: true)', ({ fixture, expect }) => {
    const { exitCode, stdout } = fixture.run({
      files: {
        'unstub-envs.test.ts': [
          'import { vi, it, describe } from "vitest";',
          'describe("unstubEnvs", () => {',
          '  it("stubs env var", ({ expect }) => {',
          '    vi.stubEnv("TEST_E2E_VAR", "hello");',
          '    expect(import.meta.env["TEST_E2E_VAR"]).toBe("hello");',
          '  });',
          '  it("is auto-unstubbed between tests", ({ expect }) => {',
          '    expect(import.meta.env["TEST_E2E_VAR"]).toBeUndefined();',
          '  });',
          '});',
        ].join('\n'),
      },
    });

    expect(exitCode).toBe(0);
    expect(stdout).toContain('2 passed');
  });
});
