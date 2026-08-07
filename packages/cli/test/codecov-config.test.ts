import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { generateCodecovSections } from '#src/lib/codecov-config.js';
import { discoverWorkspace } from '#src/lib/discovery.js';
import { localeComparer } from '#src/lib/sort.js';
import { createTempDir, writeJson } from './helpers.ts';

/**
 * One package in the fixture. `basename` and `flag` are deliberately
 * independent — the directory is named separately from the manifest, so an
 * assertion can only pass by reading the one the implementation claims to use.
 */
interface CodecovPackage {
  /** Directory basename, unrelated to the manifest name. */
  readonly basename: string;
  readonly dir: string;
  /** Expected Codecov flag/component name: the unscoped manifest name. */
  readonly flag: string;
}

interface CodecovMonorepo {
  readonly alpha: CodecovPackage;
  readonly beta: CodecovPackage;
  readonly gamma: CodecovPackage;
  readonly root: string;
}

interface WritePackageOptions {
  readonly extraDirs?: readonly string[];
  readonly hasTests?: boolean;
}

/*
 * `seed` and `label` together make every name in the fixture distinct by
 * construction: the label separates the packages, the suffixes separate each
 * package's directory from its flag. Independent builder calls could collide —
 * making a negative basename assertion vacuous, or making two packages share a
 * flag and fail as a duplicate. The scoped name is composed from a known
 * unscoped part, so the expected flag is an independent value rather than the
 * implementation's own derivation.
 */
const writePackage = (
  root: string,
  seed: string,
  label: string,
  { extraDirs = [], hasTests = true }: WritePackageOptions = {},
): CodecovPackage => {
  const basename = `${seed}-${label}-dir`;
  const flag = `${seed}-${label}-flag`;
  const name = `@${seed}-scope/${flag}`;
  const dir = path.join(root, 'packages', basename);
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  for (const extra of extraDirs) {
    mkdirSync(path.join(dir, extra));
  }
  if (hasTests) {
    mkdirSync(path.join(dir, 'test'));
    writeJson(dir, 'package.json', {
      devDependencies: { '@gtbuchanan/vitest-config': build.semverRange() },
      name,
    });
    writeFileSync(path.join(dir, 'vitest.config.ts'), '');
  } else {
    writeJson(dir, 'package.json', { name, private: true });
  }
  return { basename, dir, flag };
};

const createMonorepo = (): CodecovMonorepo => {
  const root = createTempDir();
  const seed = build.packageName();
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  writeJson(root, 'package.json', { name: build.packageName(), private: true });

  return {
    alpha: writePackage(root, seed, 'alpha'),
    beta: writePackage(root, seed, 'beta', { extraDirs: ['bin', 'scripts'] }),
    gamma: writePackage(root, seed, 'gamma', { hasTests: false }),
    root,
  };
};

/**
 * Scaffolds two coverage packages that share a directory basename (`apps/x`
 * and `packages/x`) and carry the given manifest names — isolating a name
 * collision from a directory collision.
 */
const createCollisionRepo = (names: readonly string[]): string => {
  const root = createTempDir();
  writeFileSync(
    path.join(root, 'pnpm-workspace.yaml'),
    "packages:\n  - 'apps/*'\n  - 'packages/*'\n",
  );
  writeJson(root, 'package.json', { name: build.packageName(), private: true });

  const sharedBasename = build.packageName();
  for (const [index, base] of ['apps', 'packages'].entries()) {
    const pkgDir = path.join(root, base, sharedBasename);
    mkdirSync(path.join(pkgDir, 'src'), { recursive: true });
    mkdirSync(path.join(pkgDir, 'test'));
    writeJson(pkgDir, 'package.json', {
      devDependencies: { '@gtbuchanan/vitest-config': build.semverRange() },
      name: names[index],
    });
    writeFileSync(path.join(pkgDir, 'vitest.config.ts'), '');
  }

  return root;
};

describe.concurrent(generateCodecovSections, () => {
  it('forces codecov.require_ci_to_pass false', ({ expect }) => {
    const { root } = createMonorepo();
    const discovery = discoverWorkspace({ cwd: root });

    const { codecov } = generateCodecovSections(discovery);

    expect(codecov).toStrictEqual({ require_ci_to_pass: false });
  });

  it('generates a flag per coverage package', ({ expect }) => {
    const { alpha, beta, gamma, root } = createMonorepo();
    const discovery = discoverWorkspace({ cwd: root });

    const { flags } = generateCodecovSections(discovery);

    expect(Object.keys(flags)).toContain(alpha.flag);
    expect(Object.keys(flags)).toContain(beta.flag);
    expect(Object.keys(flags)).not.toContain(gamma.flag);
  });

  it('names flags after the unscoped manifest name, not the directory', ({ expect }) => {
    const { alpha, root } = createMonorepo();
    const discovery = discoverWorkspace({ cwd: root });

    const { flags } = generateCodecovSections(discovery);

    expect(Object.keys(flags)).not.toContain(alpha.basename);
  });

  it('names components after the unscoped manifest name, not the directory', ({ expect }) => {
    const { alpha, root } = createMonorepo();
    const discovery = discoverWorkspace({ cwd: root });

    const { component_management: componentManagement } = generateCodecovSections(discovery);
    const ids = componentManagement.individual_components.map(comp => comp.component_id);

    expect(ids).not.toContain(alpha.basename);
  });

  it('names a root package after its manifest, not the checkout directory', ({ expect }) => {
    /*
     * Regression guard for the worktree/clone bug: a single-package repo's
     * sole package IS the checkout root, so a basename-derived name changes
     * with the directory the repo happens to live in.
     */
    const root = createTempDir();
    const flag = build.packageName();
    mkdirSync(path.join(root, 'src'));
    mkdirSync(path.join(root, 'test'));
    writeJson(root, 'package.json', {
      devDependencies: { '@gtbuchanan/vitest-config': build.semverRange() },
      name: `@${build.packageName()}/${flag}`,
    });
    writeFileSync(path.join(root, 'vitest.config.ts'), '');

    const discovery = discoverWorkspace({ cwd: root });
    const { flags } = generateCodecovSections(discovery);

    expect(Object.keys(flags)).toStrictEqual([flag]);
  });

  it('flag has carryforward true and correct path', ({ expect }) => {
    const { alpha, root } = createMonorepo();
    const discovery = discoverWorkspace({ cwd: root });

    const { flags } = generateCodecovSections(discovery);

    expect(flags[alpha.flag]).toMatchObject({
      carryforward: true,
      paths: [`packages/${alpha.basename}/`],
    });
  });

  it('generates a component per coverage package', ({ expect }) => {
    const { alpha, beta, gamma, root } = createMonorepo();
    const discovery = discoverWorkspace({ cwd: root });

    const { component_management: componentManagement } = generateCodecovSections(discovery);
    const ids = componentManagement.individual_components.map(comp => comp.component_id);

    expect(ids).toContain(alpha.flag);
    expect(ids).toContain(beta.flag);
    expect(ids).not.toContain(gamma.flag);
  });

  it('component paths include only src for package without bin/scripts', ({ expect }) => {
    const { alpha, root } = createMonorepo();
    const discovery = discoverWorkspace({ cwd: root });

    const { component_management: componentManagement } = generateCodecovSections(discovery);
    const alphaComp = componentManagement.individual_components.find(
      comp => comp.component_id === alpha.flag,
    );

    expect(alphaComp?.paths).toStrictEqual([`packages/${alpha.basename}/src/**`]);
  });

  it('component paths include bin and scripts when present', ({ expect }) => {
    const { beta, root } = createMonorepo();
    const discovery = discoverWorkspace({ cwd: root });

    const { component_management: componentManagement } = generateCodecovSections(discovery);
    const betaComp = componentManagement.individual_components.find(
      comp => comp.component_id === beta.flag,
    );

    expect(betaComp?.paths).toStrictEqual([
      `packages/${beta.basename}/bin/**`,
      `packages/${beta.basename}/scripts/**`,
      `packages/${beta.basename}/src/**`,
    ]);
  });

  it('returns empty sections when no package has vitest tests', ({ expect }) => {
    const root = createTempDir();
    writeJson(root, 'package.json', { name: build.packageName(), private: true });
    writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    const pkgDir = path.join(root, 'packages', build.packageName());
    mkdirSync(path.join(pkgDir, 'src'), { recursive: true });
    writeJson(pkgDir, 'package.json', { name: build.scopedPackageName(), private: true });

    const discovery = discoverWorkspace({ cwd: root });
    const { flags, component_management: componentManagement } = generateCodecovSections(discovery);

    expect(Object.keys(flags)).toHaveLength(0);
    expect(componentManagement.individual_components).toHaveLength(0);
  });

  it('allows two packages to share a directory basename', ({ expect }) => {
    /* Suffixed from one seed so the two flags cannot collide — that would
       turn this into the collision case and make it throw. */
    const seed = build.packageName();
    const flags = [`${seed}-one`, `${seed}-two`];
    const root = createCollisionRepo(flags.map(flag => `@${seed}-scope/${flag}`));

    const discovery = discoverWorkspace({ cwd: root });
    const sections = generateCodecovSections(discovery);

    expect(Object.keys(sections.flags).toSorted(localeComparer))
      .toStrictEqual(flags.toSorted(localeComparer));
  });

  it('throws when two packages share an unscoped name', ({ expect }) => {
    const shared = build.packageName();
    const root = createCollisionRepo([
      `@${shared}-left/${shared}`,
      `@${shared}-right/${shared}`,
    ]);

    const discovery = discoverWorkspace({ cwd: root });

    /* A plain string asserts by substring, avoiding a regex built from
       generated input. */
    expect(() => generateCodecovSections(discovery))
      .toThrow(`Duplicate Codecov flag names: ${shared}`);
  });
});
