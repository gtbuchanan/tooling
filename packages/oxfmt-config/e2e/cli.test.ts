import {
  type ProjectFixture,
  createProjectFixture,
  extendWithFixture,
} from '@gtbuchanan/test-utils';
import { describe } from 'vitest';

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

    expect(result.exitCode).not.toBe(0);
  });

  it('passes well-formatted JSON', ({ fixture, expect }) => {
    fixture.writeFile('data.json', '{}\n');
    fixture.run('oxfmt', ['--write', 'data.json']);

    const result = fixture.run('oxfmt', ['--check', 'data.json']);

    expect(result.exitCode).toBe(0);
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

    expect(tsResult.exitCode).toBe(0);
    expect(jsResult.exitCode).toBe(0);
  });
});
