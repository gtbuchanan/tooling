import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { faker } from '@faker-js/faker';
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
 * A scaffolded package and the generated facts a test asserts against.
 */
interface Package {
  readonly outDir: string;
  readonly pkgDir: string;
  /**
   * Name of the lone compiled skill. Incidental — nothing branches on it.
   */
  readonly skillName: string;
}

/*
 * `skills` stays hardcoded throughout: the production code branches on that
 * exact directory name, so generating it would stop exercising the branch.
 */
const skillsDir = 'skills';

/**
 * Scaffolds a package whose `dist/source` holds output from a prior run:
 * compiled files, the `compile:skills` subtree, and the `pack:npm` docs.
 */
const createPackage = (options: PackageOptions = {}): Package => {
  const pkgDir = createTempDir();
  const outDir = path.join(pkgDir, buildOutDir);
  const skillName = faker.lorem.slug();
  if (options.authorsSkills !== false) {
    mkdirSync(path.join(pkgDir, skillsDir), { recursive: true });
  }
  mkdirSync(path.join(outDir, 'src'), { recursive: true });
  mkdirSync(path.join(outDir, skillsDir, skillName), { recursive: true });
  for (const file of [
    path.join('src', 'renamed.js'),
    path.join('src', 'renamed.d.ts'),
    path.join(skillsDir, skillName, 'SKILL.md'),
    'tsconfig.tsbuildinfo',
    '.npmignore',
    'LICENSE',
    'README.md',
    'package.json',
  ]) {
    writeFileSync(path.join(outDir, file), '');
  }

  return { outDir, pkgDir, skillName };
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
    const { outDir, pkgDir, skillName } = createPackage();

    clearCompiledOutput(pkgDir);

    expect(existsSync(path.join(outDir, skillsDir, skillName, 'SKILL.md'))).toBe(true);
  });

  it('removes the skills subtree once the package stops authoring skills', ({ expect }) => {
    const { outDir, pkgDir } = createPackage({ authorsSkills: false });

    clearCompiledOutput(pkgDir);

    expect(existsSync(path.join(outDir, skillsDir))).toBe(false);
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
