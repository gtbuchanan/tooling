import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  mergeCodecovSections,
  mergePackageScripts,
  sortKeysDeep,
  writeJsonFile,
  writeYamlFile,
} from '#src/lib/file-writer.js';
import { createTempDir } from './helpers.ts';

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, 'utf8'));

const jsonIndent = 2;

describe(writeJsonFile, () => {
  it('writes formatted JSON with trailing newline', ({ expect }) => {
    const dir = createTempDir();
    const path = join(dir, 'test.json');

    writeJsonFile(path, { alpha: 1, beta: 2 });

    const content = readFileSync(path, 'utf8');

    expect(content).toBe(
      `${JSON.stringify({ alpha: 1, beta: 2 }, null, jsonIndent)}\n`,
    );
  });

  it('overwrites existing file', ({ expect }) => {
    const dir = createTempDir();
    const path = join(dir, 'test.json');
    writeFileSync(path, '{"old": true}');

    writeJsonFile(path, { new: true });

    expect(readJson(path)).toStrictEqual({ new: true });
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

describe(writeYamlFile, () => {
  it('writes valid YAML with trailing newline', ({ expect }) => {
    const dir = createTempDir();
    const path = join(dir, 'test.yml');

    writeYamlFile(path, { key: 'value', list: [1, 2] });

    const content = readFileSync(path, 'utf8');
    const parsed: unknown = parseYaml(content);

    expect(parsed).toStrictEqual({ key: 'value', list: [1, 2] });
    expect(content.endsWith('\n')).toBe(true);
  });

  it('uses single quotes for strings that need quoting', ({ expect }) => {
    const dir = createTempDir();
    const path = join(dir, 'test.yml');

    writeYamlFile(path, { pattern: '**/dist/**' });

    const content = readFileSync(path, 'utf8');

    expect(content).toContain("'**/dist/**'");
  });
});

describe(sortKeysDeep, () => {
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
    expect(sortKeysDeep(null)).toBeNull();
    expect(sortKeysDeep(true)).toBe(true);
  });
});

describe(mergeCodecovSections, () => {
  const sections = {
    component_management: {
      individual_components: [
        { component_id: 'app', name: 'app', paths: ['packages/app/src/**'] },
      ],
    },
    flags: {
      app: { carryforward: true, paths: ['packages/app/'] },
    },
  };

  it('throws on malformed YAML in existing file', ({ expect }) => {
    const dir = createTempDir();
    const path = join(dir, 'codecov.yml');
    writeFileSync(path, 'invalid: [}');

    expect(() => {
      mergeCodecovSections(path, sections);
    }).toThrow(/invalid YAML/v);
  });

  it('creates codecov.yml when file does not exist', ({ expect }) => {
    const dir = createTempDir();
    const path = join(dir, 'codecov.yml');

    mergeCodecovSections(path, sections);

    const parsed: unknown = parseYaml(readFileSync(path, 'utf8'));

    expect(parsed).toHaveProperty('flags');
    expect(parsed).toHaveProperty('component_management');
  });

  it('overwrites flags and components in existing file', ({ expect }) => {
    const dir = createTempDir();
    const path = join(dir, 'codecov.yml');
    const existingYaml =
      'flags:\n  old:\n    carryforward: true\n    paths:\n      - packages/old/\n';
    writeFileSync(path, existingYaml);

    mergeCodecovSections(path, sections);

    const parsed: unknown = parseYaml(readFileSync(path, 'utf8'));

    expect(parsed).toHaveProperty('flags.app');
    expect(parsed).not.toHaveProperty('flags.old');
  });

  it('preserves user-configured keys', ({ expect }) => {
    const dir = createTempDir();
    const path = join(dir, 'codecov.yml');
    writeFileSync(path, 'codecov:\n  require_ci_to_pass: true\nflags: {}\n');

    mergeCodecovSections(path, sections);

    const parsed: unknown = parseYaml(readFileSync(path, 'utf8'));

    expect(parsed).toHaveProperty('codecov');
  });

  it('sorts keys and uses single quotes', ({ expect }) => {
    const dir = createTempDir();
    const path = join(dir, 'codecov.yml');
    writeFileSync(path, "ignore:\n  - '**/dist/**'\n");

    mergeCodecovSections(path, sections);

    const content = readFileSync(path, 'utf8');
    const keys = [...content.matchAll(/^(?<key>\w[\w_]*):/gmv)]
      .map(match => match.groups?.['key'] ?? '');

    expect(keys).toStrictEqual([...keys].sort((left, right) => left.localeCompare(right)));
    expect(content).toContain("'**/dist/**'");
  });

  it('preserves component_management.default_rules', ({ expect }) => {
    const dir = createTempDir();
    const path = join(dir, 'codecov.yml');
    writeFileSync(
      path,
      'component_management:\n  default_rules:\n    statuses:\n      - type: project\n',
    );

    mergeCodecovSections(path, sections);

    const parsed: unknown = parseYaml(readFileSync(path, 'utf8'));

    expect(parsed).toHaveProperty('component_management.default_rules');
    expect(parsed).toHaveProperty('component_management.individual_components');
  });
});
