import { it as base, describe } from 'vitest';
import { createProjectFixture, runCommand } from '@gtbuchanan/test-utils';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

  writeFileSync(join(fixture.projectDir, 'vitest.config.ts'), vitestConfig);
  mkdirSync(join(fixture.projectDir, 'src'), { recursive: true });

  const vitest = join(fixture.projectDir, 'node_modules/.bin/vitest');

  const env = {
    ...process.env,
    INIT_CWD: fixture.projectDir,
  };

  const run = ({ files }: { files: Record<string, string> }) => {
    for (const [name, content] of Object.entries(files)) {
      const filePath = join(fixture.projectDir, name);
      mkdirSync(join(filePath, '..'), { recursive: true });
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

const it = base.extend<{ fixture: Fixture }>({
  // oxlint-disable-next-line no-empty-pattern -- Vitest fixture requires destructuring
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
    expect(stdout).toMatch(/expected .*? assertion/u);
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
    expect(stdout + stderr).toMatch(/console method/u);
  });

  it('resolves @ alias to src/', ({ fixture, expect }) => {
    const { exitCode } = fixture.run({
      files: {
        'alias.test.ts': [
          'import { it } from "vitest";',
          'import { greet } from "@/greet";',
          'it("greets", ({ expect }) => {',
          '  expect(greet("World")).toBe("Hello, World!");',
          '});',
        ].join('\n'),
        // oxlint-disable-next-line no-template-curly-in-string -- Template for generated file
        'src/greet.ts': 'export const greet = (name: string) => `Hello, ${name}!`;\n',
      },
    });

    expect(exitCode).toBe(0);
  });

  it('uses v8 coverage provider', ({ fixture, expect }) => {
    writeFileSync(
      join(fixture.projectDir, 'src/add.ts'),
      'export const add = (a: number, b: number) => a + b;\n',
    );
    writeFileSync(
      join(fixture.projectDir, 'cov.test.ts'),
      [
        'import { it } from "vitest";',
        'import { add } from "@/add";',
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
    expect(existsSync(join(fixture.projectDir, 'dist/coverage'))).toBe(true);
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
