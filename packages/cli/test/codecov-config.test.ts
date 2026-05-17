import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { generateCodecovSections } from '#src/lib/codecov-config.js';
import { discoverWorkspace } from '#src/lib/discovery.js';
import { createTempDir, writeJson } from './helpers.ts';

interface CodecovMonorepo {
  readonly alpha: { basename: string; dir: string };
  readonly beta: { basename: string; dir: string };
  readonly gamma: { basename: string; dir: string };
  readonly root: string;
}

const createMonorepo = (): CodecovMonorepo => {
  const root = createTempDir();
  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  writeJson(root, 'package.json', { name: build.packageName(), private: true });

  const alphaBasename = build.packageName();
  const alphaDir = path.join(root, 'packages', alphaBasename);
  mkdirSync(path.join(alphaDir, 'src'), { recursive: true });
  mkdirSync(path.join(alphaDir, 'test'));
  writeJson(alphaDir, 'package.json', {
    devDependencies: { '@gtbuchanan/vitest-config': build.semverRange() },
    name: build.scopedPackageName(),
  });
  writeFileSync(path.join(alphaDir, 'vitest.config.ts'), '');

  const betaBasename = build.packageName();
  const betaDir = path.join(root, 'packages', betaBasename);
  mkdirSync(path.join(betaDir, 'src'), { recursive: true });
  mkdirSync(path.join(betaDir, 'test'));
  mkdirSync(path.join(betaDir, 'bin'));
  mkdirSync(path.join(betaDir, 'scripts'));
  writeJson(betaDir, 'package.json', {
    devDependencies: { '@gtbuchanan/vitest-config': build.semverRange() },
    name: build.scopedPackageName(),
  });
  writeFileSync(path.join(betaDir, 'vitest.config.ts'), '');

  const gammaBasename = build.packageName();
  const gammaDir = path.join(root, 'packages', gammaBasename);
  mkdirSync(path.join(gammaDir, 'src'), { recursive: true });
  writeJson(gammaDir, 'package.json', { name: build.scopedPackageName(), private: true });

  return {
    alpha: { basename: alphaBasename, dir: alphaDir },
    beta: { basename: betaBasename, dir: betaDir },
    gamma: { basename: gammaBasename, dir: gammaDir },
    root,
  };
};

describe.concurrent(generateCodecovSections, () => {
  it('generates a flag per coverage package', ({ expect }) => {
    const { alpha, beta, gamma, root } = createMonorepo();
    const discovery = discoverWorkspace({ cwd: root });

    const { flags } = generateCodecovSections(discovery);

    expect(Object.keys(flags)).toContain(alpha.basename);
    expect(Object.keys(flags)).toContain(beta.basename);
    expect(Object.keys(flags)).not.toContain(gamma.basename);
  });

  it('flag has carryforward true and correct path', ({ expect }) => {
    const { alpha, root } = createMonorepo();
    const discovery = discoverWorkspace({ cwd: root });

    const { flags } = generateCodecovSections(discovery);

    expect(flags[alpha.basename]).toMatchObject({
      carryforward: true,
      paths: [`packages/${alpha.basename}/`],
    });
  });

  it('generates a component per coverage package', ({ expect }) => {
    const { alpha, beta, gamma, root } = createMonorepo();
    const discovery = discoverWorkspace({ cwd: root });

    const { component_management: componentManagement } = generateCodecovSections(discovery);
    const ids = componentManagement.individual_components.map(comp => comp.component_id);

    expect(ids).toContain(alpha.basename);
    expect(ids).toContain(beta.basename);
    expect(ids).not.toContain(gamma.basename);
  });

  it('component paths include only src for package without bin/scripts', ({ expect }) => {
    const { alpha, root } = createMonorepo();
    const discovery = discoverWorkspace({ cwd: root });

    const { component_management: componentManagement } = generateCodecovSections(discovery);
    const alphaComp = componentManagement.individual_components.find(
      comp => comp.component_id === alpha.basename,
    );

    expect(alphaComp?.paths).toStrictEqual([`packages/${alpha.basename}/src/**`]);
  });

  it('component paths include bin and scripts when present', ({ expect }) => {
    const { beta, root } = createMonorepo();
    const discovery = discoverWorkspace({ cwd: root });

    const { component_management: componentManagement } = generateCodecovSections(discovery);
    const betaComp = componentManagement.individual_components.find(
      comp => comp.component_id === beta.basename,
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

  it('throws on duplicate package directory basenames', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(
      path.join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'apps/*'\n  - 'packages/*'\n",
    );
    writeJson(root, 'package.json', { name: build.packageName(), private: true });

    const sharedBasename = build.packageName();
    for (const base of ['apps', 'packages']) {
      const pkgDir = path.join(root, base, sharedBasename);
      mkdirSync(path.join(pkgDir, 'src'), { recursive: true });
      mkdirSync(path.join(pkgDir, 'test'));
      writeJson(pkgDir, 'package.json', {
        devDependencies: { '@gtbuchanan/vitest-config': build.semverRange() },
        name: build.scopedPackageName(),
      });
      writeFileSync(path.join(pkgDir, 'vitest.config.ts'), '');
    }

    const discovery = discoverWorkspace({ cwd: root });

    const pattern = /Duplicate package directory basenames/v;

    expect(() => generateCodecovSections(discovery)).toThrow(pattern);
  });
});
