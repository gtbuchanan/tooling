import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { generateCodecovSections } from '#src/lib/codecov-config.js';
import { discoverWorkspace } from '#src/lib/discovery.js';
import { createTempDir, writeJson } from './helpers.ts';

const createMonorepo = (): string => {
  const root = createTempDir();
  writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  writeJson(root, 'package.json', { name: 'root', private: true });

  const alpha = join(root, 'packages', 'alpha');
  mkdirSync(join(alpha, 'src'), { recursive: true });
  mkdirSync(join(alpha, 'test'));
  writeJson(alpha, 'package.json', {
    devDependencies: { '@gtbuchanan/vitest-config': '^0.1.0' },
    name: '@test/alpha',
  });
  writeFileSync(join(alpha, 'vitest.config.ts'), '');

  const beta = join(root, 'packages', 'beta');
  mkdirSync(join(beta, 'src'), { recursive: true });
  mkdirSync(join(beta, 'test'));
  mkdirSync(join(beta, 'bin'));
  mkdirSync(join(beta, 'scripts'));
  writeJson(beta, 'package.json', {
    devDependencies: { '@gtbuchanan/vitest-config': '^0.1.0' },
    name: '@test/beta',
  });
  writeFileSync(join(beta, 'vitest.config.ts'), '');

  const gamma = join(root, 'packages', 'gamma');
  mkdirSync(join(gamma, 'src'), { recursive: true });
  writeJson(gamma, 'package.json', { name: '@test/gamma', private: true });

  return root;
};

describe(generateCodecovSections, () => {
  it('generates a flag per coverage package', ({ expect }) => {
    const root = createMonorepo();
    const discovery = discoverWorkspace({ cwd: root });

    const { flags } = generateCodecovSections(discovery);

    expect(Object.keys(flags)).toContain('alpha');
    expect(Object.keys(flags)).toContain('beta');
    expect(Object.keys(flags)).not.toContain('gamma');
  });

  it('flag has carryforward true and correct path', ({ expect }) => {
    const root = createMonorepo();
    const discovery = discoverWorkspace({ cwd: root });

    const { flags } = generateCodecovSections(discovery);

    expect(flags['alpha']).toMatchObject({
      carryforward: true,
      paths: ['packages/alpha/'],
    });
  });

  it('generates a component per coverage package', ({ expect }) => {
    const root = createMonorepo();
    const discovery = discoverWorkspace({ cwd: root });

    const { component_management: componentManagement } = generateCodecovSections(discovery);
    const ids = componentManagement.individual_components.map(comp => comp.component_id);

    expect(ids).toContain('alpha');
    expect(ids).toContain('beta');
    expect(ids).not.toContain('gamma');
  });

  it('component paths include only src for package without bin/scripts', ({ expect }) => {
    const root = createMonorepo();
    const discovery = discoverWorkspace({ cwd: root });

    const { component_management: componentManagement } = generateCodecovSections(discovery);
    const alpha = componentManagement.individual_components.find(
      comp => comp.component_id === 'alpha',
    );

    expect(alpha?.paths).toStrictEqual(['packages/alpha/src/**']);
  });

  it('component paths include bin and scripts when present', ({ expect }) => {
    const root = createMonorepo();
    const discovery = discoverWorkspace({ cwd: root });

    const { component_management: componentManagement } = generateCodecovSections(discovery);
    const beta = componentManagement.individual_components.find(
      comp => comp.component_id === 'beta',
    );

    expect(beta?.paths).toStrictEqual([
      'packages/beta/bin/**',
      'packages/beta/scripts/**',
      'packages/beta/src/**',
    ]);
  });

  it('returns empty sections when no package has vitest tests', ({ expect }) => {
    const root = createTempDir();
    writeJson(root, 'package.json', { name: 'root', private: true });
    writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    const pkg = join(root, 'packages', 'lib');
    mkdirSync(join(pkg, 'src'), { recursive: true });
    writeJson(pkg, 'package.json', { name: '@test/lib', private: true });

    const discovery = discoverWorkspace({ cwd: root });
    const { flags, component_management: componentManagement } = generateCodecovSections(discovery);

    expect(Object.keys(flags)).toHaveLength(0);
    expect(componentManagement.individual_components).toHaveLength(0);
  });

  it('throws on duplicate package directory basenames', ({ expect }) => {
    const root = createTempDir();
    writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n  - 'packages/*'\n");
    writeJson(root, 'package.json', { name: 'root', private: true });

    for (const base of ['apps', 'packages']) {
      const pkg = join(root, base, 'app');
      mkdirSync(join(pkg, 'src'), { recursive: true });
      mkdirSync(join(pkg, 'test'));
      writeJson(pkg, 'package.json', {
        devDependencies: { '@gtbuchanan/vitest-config': '^0.1.0' },
        name: `@test/${base}-app`,
      });
      writeFileSync(join(pkg, 'vitest.config.ts'), '');
    }

    const discovery = discoverWorkspace({ cwd: root });

    const pattern = /Duplicate package directory basenames/v;

    expect(() => generateCodecovSections(discovery)).toThrow(pattern);
  });
});
