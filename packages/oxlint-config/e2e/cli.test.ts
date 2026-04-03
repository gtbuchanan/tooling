import {
  type ProjectFixture,
  createProjectFixture,
  extendWithFixture,
} from '@gtbuchanan/test-utils';
import { describe } from 'vitest';

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

  it('includes stylistic rules via @stylistic/eslint-plugin', ({ fixture, expect }) => {
    fixture.writeFile('style.js', 'const _unused = 42\n');

    const result = fixture.run('oxlint', ['style.js']);

    expect(result.stdout).toContain('semi');
  });

  it('relaxes no-magic-numbers in test files', ({ fixture, expect }) => {
    fixture.writeFile('test/example.test.ts', 'export const answer = 42;\n');

    const result = fixture.run('oxlint', ['test/example.test.ts']);

    expect(result.exitCode).toBe(0);
  });
});
