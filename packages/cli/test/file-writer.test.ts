import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import {
  mergePackageScripts,
  writeIfMissing,
  writeJsonFile,
} from '#src/lib/file-writer.js';

const createTempDir = (): string =>
  mkdtempSync(join(tmpdir(), 'gtb-writer-'));

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, 'utf-8'));

const jsonIndent = 2;

describe(writeJsonFile, () => {
  it('writes formatted JSON with trailing newline', ({ expect }) => {
    const dir = createTempDir();
    const path = join(dir, 'test.json');

    writeJsonFile(path, { alpha: 1, beta: 2 });

    const content = readFileSync(path, 'utf-8');

    expect(content).toBe(
      `${JSON.stringify({ alpha: 1, beta: 2 }, null, jsonIndent)}\n`,
    );
  });

  it('overwrites existing file', ({ expect }) => {
    const dir = createTempDir();
    const path = join(dir, 'test.json');
    writeFileSync(path, '{"old": true}');

    writeJsonFile(path, { new: true });

    expect(readJson(path)).toEqual({ new: true });
  });
});

describe(mergePackageScripts, () => {
  it('adds missing scripts to existing package.json', ({ expect }) => {
    const dir = createTempDir();
    const path = join(dir, 'package.json');
    writeFileSync(path, JSON.stringify({
      name: 'test',
      scripts: { existing: 'keep' },
    }));

    const result = mergePackageScripts(
      path, { 'typecheck:ts': 'gtb typecheck:ts' }, false,
    );

    expect(readJson(path)).toMatchObject({
      scripts: { 'existing': 'keep', 'typecheck:ts': 'gtb typecheck:ts' },
    });
    expect(result.added).toContain('typecheck:ts');
  });

  it('does not overwrite existing scripts without force', ({ expect }) => {
    const dir = createTempDir();
    const path = join(dir, 'package.json');
    writeFileSync(path, JSON.stringify({
      scripts: { 'typecheck:ts': 'vue-tsc --noEmit' },
    }));

    const result = mergePackageScripts(
      path, { 'typecheck:ts': 'gtb typecheck:ts' }, false,
    );

    expect(readJson(path)).toMatchObject({
      scripts: { 'typecheck:ts': 'vue-tsc --noEmit' },
    });
    expect(result.skipped).toContain('typecheck:ts');
  });

  it('overwrites existing scripts with force', ({ expect }) => {
    const dir = createTempDir();
    const path = join(dir, 'package.json');
    writeFileSync(path, JSON.stringify({
      scripts: { 'typecheck:ts': 'vue-tsc --noEmit' },
    }));

    const result = mergePackageScripts(
      path, { 'typecheck:ts': 'gtb typecheck:ts' }, true,
    );

    expect(readJson(path)).toMatchObject({
      scripts: { 'typecheck:ts': 'gtb typecheck:ts' },
    });
    expect(result.added).toContain('typecheck:ts');
  });

  it('creates scripts field if missing', ({ expect }) => {
    const dir = createTempDir();
    const path = join(dir, 'package.json');
    writeFileSync(path, JSON.stringify({ name: 'test' }));

    mergePackageScripts(path, { 'lint:eslint': 'gtb lint:eslint' }, false);

    expect(readJson(path)).toMatchObject({
      scripts: { 'lint:eslint': 'gtb lint:eslint' },
    });
  });

  it('preserves non-script fields in package.json', ({ expect }) => {
    const dir = createTempDir();
    const path = join(dir, 'package.json');
    writeFileSync(path, JSON.stringify({
      dependencies: { valibot: '^1.0.0' },
      name: 'test',
      version: '1.0.0',
    }));

    mergePackageScripts(path, { 'typecheck:ts': 'gtb typecheck:ts' }, false);

    expect(readJson(path)).toMatchObject({
      dependencies: { valibot: '^1.0.0' },
      name: 'test',
      version: '1.0.0',
    });
  });
});

describe(writeIfMissing, () => {
  it('writes file when it does not exist', ({ expect }) => {
    const dir = createTempDir();
    const path = join(dir, 'new.ts');

    const result = writeIfMissing(path, 'export default {};');

    expect(result).toBe('created');
    expect(readFileSync(path, 'utf-8')).toBe('export default {};');
  });

  it('skips when file already exists', ({ expect }) => {
    const dir = createTempDir();
    const path = join(dir, 'existing.ts');
    writeFileSync(path, 'original content');

    const result = writeIfMissing(path, 'new content');

    expect(result).toBe('skipped');
    expect(readFileSync(path, 'utf-8')).toBe('original content');
  });
});
