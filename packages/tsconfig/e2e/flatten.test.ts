import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  type ProjectFixture,
  createProjectFixture,
  extendWithFixture,
} from '@gtbuchanan/test-utils';
import * as v from 'valibot';
import { describe } from 'vitest';

const createFixture = (): ProjectFixture =>
  createProjectFixture({
    packageName: '@gtbuchanan/tsconfig',
    packages: ['typescript'],
  });

const it = extendWithFixture(createFixture);

const TsconfigSchema = v.looseObject({
  compilerOptions: v.record(v.string(), v.unknown()),
});

const readPublishedTsconfig = (projectDir: string): string =>
  readFileSync(
    path.join(projectDir, 'node_modules/@gtbuchanan/tsconfig/node.json'),
    'utf8',
  );

/* eslint-disable vitest/require-hook --
   False positive with extendWithFixture indirection:
   https://github.com/vitest-dev/eslint-plugin-vitest/issues/891 */
describe('tsconfig flattening', () => {
  it('has no extends field', ({ fixture, expect }) => {
    const raw = readPublishedTsconfig(fixture.projectDir);

    expect(raw).not.toContain('"extends"');
  });

  it('includes strictest compilerOptions', ({ fixture, expect }) => {
    const tsconfig = v.parse(
      TsconfigSchema,
      JSON.parse(readPublishedTsconfig(fixture.projectDir)),
    );

    expect(tsconfig.compilerOptions).toMatchObject({
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true,
      strict: true,
    });
  });

  it('works without @tsconfig/strictest installed', ({ fixture, expect }) => {
    fixture.writeFile(
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: { noEmit: true, types: [] },
        extends: ['@gtbuchanan/tsconfig/node.json'],
      }),
    );
    fixture.writeFile(
      'index.ts',
      'export const add = (a: number, b: number): number => a + b;\n',
    );

    const result = fixture.run('tsc', ['--noEmit']);

    expect(result).toMatchObject({ exitCode: 0 });
  });
});
/* eslint-enable vitest/require-hook */
