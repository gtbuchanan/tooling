import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { clearCompiledOutput } from '#src/commands/task/compile-ts.js';
import { buildOutDir } from '#src/lib/dist-source.js';
import { createTempDir } from './helpers.ts';

/**
 * Options for {@link createPackage}.
 */
interface PackageOptions {
  /**
   * Whether the package still authors `skills/`. `false` scaffolds one that
   * dropped them, leaving only the compiled copy from a prior run. Defaults
   * to `true`.
   */
  readonly authorsSkills?: boolean;
}

/**
 * Scaffolds a package whose `dist/source` holds output from a prior run:
 * compiled files, the `compile:skills` subtree, and the `pack:npm` docs.
 */
const createPackage = (
  options: PackageOptions = {},
): { readonly outDir: string; readonly pkgDir: string } => {
  const pkgDir = createTempDir();
  const outDir = path.join(pkgDir, buildOutDir);
  if (options.authorsSkills !== false) {
    mkdirSync(path.join(pkgDir, 'skills'), { recursive: true });
  }
  mkdirSync(path.join(outDir, 'src'), { recursive: true });
  mkdirSync(path.join(outDir, 'skills', 'my-skill'), { recursive: true });
  for (const file of [
    path.join('src', 'renamed.js'),
    path.join('src', 'renamed.d.ts'),
    path.join('skills', 'my-skill', 'SKILL.md'),
    'tsconfig.tsbuildinfo',
    '.npmignore',
    'LICENSE',
    'README.md',
    'package.json',
  ]) {
    writeFileSync(path.join(outDir, file), '');
  }

  return { outDir, pkgDir };
};

describe.concurrent(clearCompiledOutput, () => {
  it('removes compiled output left by a prior run', ({ expect }) => {
    const { outDir, pkgDir } = createPackage();

    clearCompiledOutput(pkgDir);

    expect(existsSync(path.join(outDir, 'src'))).toBe(false);
  });

  it('removes the tsbuildinfo so tsc re-emits the cleared output', ({ expect }) => {
    const { outDir, pkgDir } = createPackage();

    clearCompiledOutput(pkgDir);

    expect(existsSync(path.join(outDir, 'tsconfig.tsbuildinfo'))).toBe(false);
  });

  it('preserves the skills subtree compile:skills owns', ({ expect }) => {
    const { outDir, pkgDir } = createPackage();

    clearCompiledOutput(pkgDir);

    expect(existsSync(path.join(outDir, 'skills', 'my-skill', 'SKILL.md'))).toBe(true);
  });

  it('removes the skills subtree once the package stops authoring skills', ({ expect }) => {
    const { outDir, pkgDir } = createPackage({ authorsSkills: false });

    clearCompiledOutput(pkgDir);

    expect(existsSync(path.join(outDir, 'skills'))).toBe(false);
  });

  it('preserves the docs and manifest pack:npm owns', ({ expect }) => {
    const { outDir, pkgDir } = createPackage();

    clearCompiledOutput(pkgDir);

    for (const file of ['.npmignore', 'LICENSE', 'README.md', 'package.json']) {
      expect(existsSync(path.join(outDir, file))).toBe(true);
    }
  });

  it('leaves sibling dist directories untouched', ({ expect }) => {
    const { pkgDir } = createPackage();
    const coverage = path.join(pkgDir, 'dist', 'coverage');
    mkdirSync(coverage, { recursive: true });

    clearCompiledOutput(pkgDir);

    expect(existsSync(coverage)).toBe(true);
  });

  it('no-ops when the package has never been compiled', ({ expect }) => {
    const pkgDir = createTempDir();

    clearCompiledOutput(pkgDir);

    expect(existsSync(path.join(pkgDir, buildOutDir))).toBe(false);
  });
});
