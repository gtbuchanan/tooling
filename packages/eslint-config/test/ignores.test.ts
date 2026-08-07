import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ESLint, Linter } from 'eslint';
import { describe, it } from 'vitest';
import { configure, defaultIgnores } from '#src/index.js';

const findGitignore = (configs: Linter.Config[]) =>
  configs.find(cfg => cfg.name === 'gitignore');

const findGlobalIgnores = (configs: Linter.Config[]) =>
  configs.find(cfg =>
    cfg.ignores !== undefined && cfg.files === undefined && cfg.name === undefined,
  );

/**
 * Writes a throwaway directory tree of `.gitignore` files, keyed by the
 * directory each one belongs in relative to the tree root. Returns the
 * root so it can be passed as the `cwd` gitignore option.
 */
const createGitignoreFixture = (files: Record<string, string>): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'gtb-gitignore-'));

  for (const [dir, content] of Object.entries(files)) {
    const target = path.join(root, dir);
    mkdirSync(target, { recursive: true });
    writeFileSync(path.join(target, '.gitignore'), content);
  }

  return root;
};

/**
 * Builds a configured ESLint instance over a throwaway tree and returns a
 * predicate resolving to whether it would skip a path in that tree.
 */
const createSkipPredicate = async (
  files: Record<string, string> = {},
): Promise<(file: string) => Promise<boolean>> => {
  const cwd = createGitignoreFixture(files);
  const eslint = new ESLint({
    cwd,
    overrideConfig: await configure({
      gitignore: { cwd, root: true },
      onlyWarn: false,
    }),
    overrideConfigFile: true,
  });

  return (file: string) => eslint.isPathIgnored(path.join(cwd, file));
};

describe.concurrent('ignores', () => {
  it('applies custom ignores', async ({ expect }) => {
    const configs = await configure({ ignores: ['vendor/**'], onlyWarn: false });

    expect(findGlobalIgnores(configs)?.ignores).toStrictEqual(['vendor/**']);
  });

  it('applies the exported default ignores', async ({ expect }) => {
    const configs = await configure({ onlyWarn: false });

    expect(findGlobalIgnores(configs)?.ignores).toStrictEqual([...defaultIgnores]);
  });

  /*
   * Untracked paths come from .gitignore now, so the standing list covers
   * only tracked files another tool owns the format of — matched by naming
   * convention rather than per package manager. Asserted through ESLint's
   * own resolution rather than a matcher of our own, so directory pruning
   * and dotfile handling are the real thing.
   */
  it('ignores every package manager lockfile spelling by default', async ({ expect }) => {
    const wouldSkip = await createSkipPredicate();

    for (const file of [
      'Cargo.lock', 'bun.lock', 'deno.lock', 'mise.lock', 'npm-shrinkwrap.json',
      'package-lock.json', 'packages.lock.json', 'pnpm-lock.yaml', 'uv.lock',
    ]) {
      await expect(wouldSkip(`nested/dir/${file}`)).resolves.toBe(true);
    }
  });

  it('leaves tracked data files it can lint alone', async ({ expect }) => {
    const wouldSkip = await createSkipPredicate();

    for (const file of ['package.json', 'pnpm-workspace.yaml', 'turbo.json']) {
      await expect(wouldSkip(`nested/dir/${file}`)).resolves.toBe(false);
    }
  });
});

describe.concurrent('gitignore', () => {
  /*
   * The converted patterns keep .gitignore's trailing slash (`dist/` ⇒
   * `**\/dist/`), which only prunes a directory if ESLint reads it as one.
   */
  it('ignores directories a .gitignore excludes', async ({ expect }) => {
    const wouldSkip = await createSkipPredicate({ '.': 'build-output/\n' });

    await expect(wouldSkip('packages/thing/build-output/index.js'))
      .resolves.toBe(true);
    await expect(wouldSkip('packages/thing/src/index.js')).resolves.toBe(false);
  });

  it('derives ignores from .gitignore by default', async ({ expect }) => {
    const configs = await configure({ onlyWarn: false });

    // This repo's own .gitignore, found by walking up from the package.
    expect(findGitignore(configs)?.ignores).toContain('**/node_modules/');
  });

  it('omits gitignore-derived ignores when gitignore is false', async ({ expect }) => {
    const configs = await configure({ gitignore: false, onlyWarn: false });

    expect(findGitignore(configs)).toBeUndefined();
  });

  it('converts gitignore patterns from the configured directory', async ({ expect }) => {
    const cwd = createGitignoreFixture({ '.': 'build-output/\n*.generated.ts\n' });

    const configs = await configure({
      gitignore: { cwd, root: true },
      onlyWarn: false,
    });

    expect(findGitignore(configs)?.ignores).toStrictEqual([
      '**/build-output/',
      '**/*.generated.ts',
    ]);
  });

  it('discovers nested .gitignore files by default', async ({ expect }) => {
    const cwd = createGitignoreFixture({
      '.': 'root-only/\n',
      'packages/thing': 'nested-only/\n',
    });

    const configs = await configure({
      gitignore: { cwd, root: true },
      onlyWarn: false,
    });

    expect(findGitignore(configs)?.ignores).toStrictEqual([
      '**/root-only/',
      'packages/thing/**/nested-only/',
    ]);
  });

  it('stops discovering nested .gitignore files when recursive is false', async ({ expect }) => {
    const cwd = createGitignoreFixture({
      '.': 'root-only/\n',
      'packages/thing': 'nested-only/\n',
    });

    const configs = await configure({
      gitignore: { cwd, recursive: false, root: true },
      onlyWarn: false,
    });

    expect(findGitignore(configs)?.ignores).toStrictEqual(['**/root-only/']);
  });

  /*
  The upstream default throws instead, which no consumer opted into.
  */
  it('tolerates a repo with no .gitignore', async ({ expect }) => {
    const cwd = createGitignoreFixture({});

    const configs = await configure({
      gitignore: { cwd, root: true },
      onlyWarn: false,
    });

    expect(findGitignore(configs)?.ignores).toStrictEqual([]);
  });
});
