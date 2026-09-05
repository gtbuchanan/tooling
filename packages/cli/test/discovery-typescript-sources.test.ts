import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { discoverPackage } from '#src/lib/discovery.js';
import { createTempDir, writeJson } from './helpers.ts';

const writeFile = (dir: string, name: string): void => {
  writeFileSync(path.join(dir, name), '');
};

describe.concurrent('typescript source discovery', () => {
  it('detects a top-level file', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    writeFile(dir, 'eslint.config.ts');

    const result = discoverPackage(dir);

    expect(result.hasTypeScriptSources).toBe(true);
  });

  it('detects a file nested in an included directory', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    mkdirSync(path.join(dir, 'src', 'lib'), { recursive: true });
    writeFile(dir, path.join('src', 'lib', 'index.ts'));

    const result = discoverPackage(dir);

    expect(result.hasTypeScriptSources).toBe(true);
  });

  /*
   * The gate tsc itself applies: a config whose `include` matches nothing
   * fails with TS18003, so the presence of a tsconfig is not evidence that
   * there is anything to check. `gtb sync` writes one at every root, which
   * is why this has to be a signal separate from `hasTypeScript`.
   */
  it('reports none when a tsconfig matches no files', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    writeJson(dir, 'tsconfig.json', {});

    const result = discoverPackage(dir);

    expect(result).toMatchObject({ hasTypeScript: true, hasTypeScriptSources: false });
  });

  it('ignores javascript and an empty included directory', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    writeFile(dir, 'eslint.config.js');
    mkdirSync(path.join(dir, 'src'));

    const result = discoverPackage(dir);

    expect(result.hasTypeScriptSources).toBe(false);
  });

  it('ignores typescript the type-check include never reaches', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    mkdirSync(path.join(dir, 'packages', 'app'), { recursive: true });
    writeFile(dir, path.join('packages', 'app', 'index.ts'));

    const result = discoverPackage(dir);

    expect(result.hasTypeScriptSources).toBe(false);
  });

  /*
   * A name is not a source. Counting a *directory* called `types.ts` would
   * generate a task for a root with nothing to check, which is the TS18003
   * failure this signal exists to prevent — so the check reads entry type,
   * not just the extension.
   */
  it('ignores a directory named like a TypeScript file', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    mkdirSync(path.join(dir, 'types.ts'));

    const result = discoverPackage(dir);

    expect(result.hasTypeScriptSources).toBe(false);
  });

  it('ignores a like-named directory nested in an included directory', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    mkdirSync(path.join(dir, 'src', 'types.ts'), { recursive: true });

    const result = discoverPackage(dir);

    expect(result.hasTypeScriptSources).toBe(false);
  });

  /*
   * tsc's own default `exclude` skips node_modules, so a dependency's
   * sources are not inputs and must not make an otherwise-empty root
   * look checkable.
   */
  it('ignores typescript inside node_modules', ({ expect }) => {
    const dir = createTempDir();
    writeJson(dir, 'package.json', {});
    mkdirSync(path.join(dir, 'src', 'node_modules', 'dep'), { recursive: true });
    writeFile(dir, path.join('src', 'node_modules', 'dep', 'index.ts'));

    const result = discoverPackage(dir);

    expect(result.hasTypeScriptSources).toBe(false);
  });
});
