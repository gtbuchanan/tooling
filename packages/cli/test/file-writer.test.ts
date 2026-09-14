import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import {
  mergePackageScripts, sortKeysDeep, writeJsonFile,
} from '#src/lib/file-writer.js';
import { createTempDir } from './helpers.ts';

const readJson = (filePath: string): unknown =>
  JSON.parse(readFileSync(filePath, 'utf8'));

const jsonIndent = 2;

describe.concurrent(writeJsonFile, () => {
  it('writes formatted JSON with trailing newline', ({ expect }) => {
    const dir = createTempDir();
    const filePath = path.join(dir, 'test.json');

    writeJsonFile(filePath, { alpha: 1, beta: 2 });

    const content = readFileSync(filePath, 'utf8');

    expect(content).toBe(
      `${JSON.stringify({ alpha: 1, beta: 2 }, undefined, jsonIndent)}\n`,
    );
  });

  it('overwrites existing file', ({ expect }) => {
    const dir = createTempDir();
    const filePath = path.join(dir, 'test.json');
    writeFileSync(filePath, '{"old": true}');

    writeJsonFile(filePath, { new: true });

    expect(readJson(filePath)).toStrictEqual({ new: true });
  });
});

describe.concurrent(mergePackageScripts, () => {
  it('adds missing scripts to existing package.json', ({ expect }) => {
    const dir = createTempDir();
    const filePath = path.join(dir, 'package.json');
    const existingScriptName = faker.lorem.word();
    const existingScriptValue = faker.lorem.words({ min: 1, max: 3 });
    writeFileSync(filePath, JSON.stringify({
      name: build.scopedPackageName(),
      scripts: { [existingScriptName]: existingScriptValue },
    }));

    const result = mergePackageScripts(
      filePath, { 'typecheck:ts': 'gtb typecheck:ts' }, false,
    );

    expect(readJson(filePath)).toMatchObject({
      scripts: {
        [existingScriptName]: existingScriptValue,
        'typecheck:ts': 'gtb typecheck:ts',
      },
    });
    expect(result.added).toContain('typecheck:ts');
  });

  it('does not overwrite existing scripts without force', ({ expect }) => {
    const dir = createTempDir();
    const filePath = path.join(dir, 'package.json');
    const userTypecheck = faker.lorem.words({ min: 1, max: 3 });
    writeFileSync(filePath, JSON.stringify({
      scripts: { 'typecheck:ts': userTypecheck },
    }));

    const result = mergePackageScripts(
      filePath, { 'typecheck:ts': 'gtb typecheck:ts' }, false,
    );

    expect(readJson(filePath)).toMatchObject({
      scripts: { 'typecheck:ts': userTypecheck },
    });
    expect(result.skipped).toContain('typecheck:ts');
  });

  it('overwrites existing scripts with force', ({ expect }) => {
    const dir = createTempDir();
    const filePath = path.join(dir, 'package.json');
    writeFileSync(filePath, JSON.stringify({
      scripts: { 'typecheck:ts': faker.lorem.words({ min: 1, max: 3 }) },
    }));

    const result = mergePackageScripts(
      filePath, { 'typecheck:ts': 'gtb typecheck:ts' }, true,
    );

    expect(readJson(filePath)).toMatchObject({
      scripts: { 'typecheck:ts': 'gtb typecheck:ts' },
    });
    expect(result.added).toContain('typecheck:ts');
  });

  it('creates scripts field if missing', ({ expect }) => {
    const dir = createTempDir();
    const filePath = path.join(dir, 'package.json');
    writeFileSync(filePath, JSON.stringify({ name: build.scopedPackageName() }));

    mergePackageScripts(filePath, { 'lint:eslint': 'gtb lint:eslint' }, false);

    expect(readJson(filePath)).toMatchObject({
      scripts: { 'lint:eslint': 'gtb lint:eslint' },
    });
  });

  it('preserves non-script fields in package.json', ({ expect }) => {
    const dir = createTempDir();
    const filePath = path.join(dir, 'package.json');
    const dependencies = build.dependencyMap();
    const name = build.scopedPackageName();
    const version = build.semverVersion();
    writeFileSync(filePath, JSON.stringify({ dependencies, name, version }));

    mergePackageScripts(filePath, { 'typecheck:ts': 'gtb typecheck:ts' }, false);

    expect(readJson(filePath)).toMatchObject({ dependencies, name, version });
  });
});

describe.concurrent(sortKeysDeep, () => {
  it('sorts top-level keys alphabetically', ({ expect }) => {
    expect(sortKeysDeep({ zebra: 3, alpha: 1, mango: 2 }))
      .toStrictEqual({ alpha: 1, mango: 2, zebra: 3 });
  });

  it('sorts nested object keys recursively', ({ expect }) => {
    const input = { outer: { zz: 1, aa: 2 } };

    expect(sortKeysDeep(input)).toStrictEqual({ outer: { aa: 2, zz: 1 } });
  });

  it('preserves array element order', ({ expect }) => {
    expect(sortKeysDeep({ items: [3, 1, 2] })).toStrictEqual({ items: [3, 1, 2] });
  });

  it('returns primitives unchanged', ({ expect }) => {
    expect(sortKeysDeep('hello')).toBe('hello');
    expect(sortKeysDeep(42)).toBe(42);
    // eslint-disable-next-line unicorn/no-null -- Testing null input handling
    expect(sortKeysDeep(null)).toBeNull();
    expect(sortKeysDeep(true)).toBe(true);
  });
});
