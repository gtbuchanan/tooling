import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as build from '@gtbuchanan/test-utils/builders';
import { describe, it } from 'vitest';
import { runVerify } from '#src/commands/root/verify.js';
import { createTempDir, initProject, writeJson } from './helpers.ts';

/**
 * Task definitions for a package configuration, as authored.
 */
type PackageTasks = Record<string, unknown>;

interface GenerateProject {
  readonly configPath: string;
  readonly pkgDir: string;
  readonly root: string;
}

interface GenerateProjectOptions {
  /**
   * `generate:*` scripts the package declares.
   */
  readonly scripts: readonly string[];
  /**
   * Package configuration tasks, or `undefined` to write no config at all.
   */
  readonly tasks?: PackageTasks | undefined;
  /**
   * `extends` value for the package configuration. Defaults to `['//']`.
   */
  readonly extendsValue?: readonly string[] | undefined;
  /**
   * Single-package repo (no pnpm-workspace.yaml). Defaults to `false`.
   */
  readonly singlePackage?: boolean;
}

/**
 * Scaffolds a temp workspace whose one package declares `generate:*`
 * scripts, then writes the package configuration described by `options`.
 */
const createGenerateProject = (options: GenerateProjectOptions): GenerateProject => {
  const root = createTempDir();
  const scripts = Object.fromEntries(
    options.scripts.map(name => [name, `${build.packageName()} generate`]),
  );

  if (options.singlePackage === true) {
    writeJson(root, 'package.json', { name: build.packageName(), scripts, version: '0.0.0' });
    /*
     * The root is the package here, and `initProject` writes a root
     * tsconfig.json — so seed one first, otherwise discovery gains a
     * TypeScript capability between generating turbo.json and verifying it.
     */
    writeFileSync(path.join(root, 'tsconfig.json'), '{}');
    initProject(root);
    return { configPath: path.join(root, 'turbo.json'), pkgDir: root, root };
  }

  writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  writeJson(root, 'package.json', { name: build.packageName(), private: true });

  const pkgDir = path.join(root, 'packages', build.packageName());
  mkdirSync(pkgDir, { recursive: true });
  writeJson(pkgDir, 'package.json', { name: build.scopedPackageName(), scripts });
  initProject(root);

  const configPath = path.join(pkgDir, 'turbo.json');
  if (options.tasks !== undefined) {
    writeJson(pkgDir, 'turbo.json', {
      extends: options.extendsValue ?? ['//'],
      tasks: options.tasks,
    });
  }

  return { configPath, pkgDir, root };
};

const verifyTurbo = (root: string, ignored?: ReadonlySet<string>): readonly string[] =>
  runVerify({
    cwd: root,
    ...(ignored !== undefined && { ignored }),
    scopes: new Set(['turbo'] as const),
  });

describe.concurrent('generate task verification', () => {
  it('passes when the package configuration declares outputs', ({ expect }) => {
    const { root } = createGenerateProject({
      scripts: ['generate:prisma'],
      tasks: {
        'generate': { dependsOn: ['generate:prisma'] },
        'generate:prisma': { inputs: ['schema.prisma'], outputs: ['generated/**'] },
      },
    });

    expect(verifyTurbo(root)).toStrictEqual([]);
  });

  it('passes when the leaf opts out of caching instead', ({ expect }) => {
    const { root } = createGenerateProject({
      scripts: ['generate:prisma'],
      tasks: {
        'generate': { dependsOn: ['generate:prisma'] },
        'generate:prisma': { cache: false },
      },
    });

    expect(verifyTurbo(root)).toStrictEqual([]);
  });

  it('reports a package with generate scripts and no configuration', ({ expect }) => {
    const { configPath, root } = createGenerateProject({ scripts: ['generate:prisma'] });

    expect(verifyTurbo(root)).toStrictEqual([
      `${configPath}: missing — add a package configuration defining generate:* tasks`,
    ]);
  });

  it('reports a configuration that does not extend the root', ({ expect }) => {
    const { configPath, root } = createGenerateProject({
      extendsValue: [],
      scripts: ['generate:prisma'],
      tasks: {
        'generate': { dependsOn: ['generate:prisma'] },
        'generate:prisma': { outputs: ['generated/**'] },
      },
    });

    expect(verifyTurbo(root)).toStrictEqual([`${configPath}: must extend '//'`]);
  });

  it('reports a configuration with no extends key', ({ expect }) => {
    const { configPath, pkgDir, root } = createGenerateProject({
      scripts: ['generate:prisma'],
      tasks: { generate: {} },
    });
    writeJson(pkgDir, 'turbo.json', {
      tasks: {
        'generate': { dependsOn: ['generate:prisma'] },
        'generate:prisma': { outputs: ['generated/**'] },
      },
    });

    expect(verifyTurbo(root)).toStrictEqual([`${configPath}: must extend '//'`]);
  });

  it('reports an aggregate that depends on nothing', ({ expect }) => {
    const { configPath, root } = createGenerateProject({
      scripts: ['generate:prisma'],
      tasks: {
        'generate': {},
        'generate:prisma': { outputs: ['generated/**'] },
      },
    });

    expect(verifyTurbo(root)).toStrictEqual([
      `${configPath}: task 'generate' must depend on 'generate:prisma'`,
    ]);
  });

  it('reports a script left out of the generate aggregate', ({ expect }) => {
    const { configPath, root } = createGenerateProject({
      scripts: ['generate:paraglide', 'generate:prisma'],
      tasks: {
        'generate': { dependsOn: ['generate:prisma'] },
        'generate:paraglide': { outputs: ['messages/**'] },
        'generate:prisma': { outputs: ['generated/**'] },
      },
    });

    expect(verifyTurbo(root)).toStrictEqual([
      `${configPath}: task 'generate' must depend on 'generate:paraglide'`,
    ]);
  });

  it('reports a configuration that declares a leaf but no aggregate', ({ expect }) => {
    const { configPath, root } = createGenerateProject({
      scripts: ['generate:prisma'],
      tasks: { 'generate:prisma': { outputs: ['generated/**'] } },
    });

    expect(verifyTurbo(root)).toStrictEqual([
      `${configPath}: task 'generate' must depend on 'generate:prisma'`,
    ]);
  });

  it('reports a configuration with no tasks at all', ({ expect }) => {
    const { configPath, pkgDir, root } = createGenerateProject({
      scripts: ['generate:prisma'],
      tasks: { generate: {} },
    });
    writeJson(pkgDir, 'turbo.json', { extends: ['//'] });

    expect(verifyTurbo(root)).toStrictEqual([
      `${configPath}: task 'generate' must depend on 'generate:prisma'`,
      `${configPath}: missing task 'generate:prisma'`,
    ]);
  });

  it('reports a leaf script with no task definition', ({ expect }) => {
    const { configPath, root } = createGenerateProject({
      scripts: ['generate:prisma'],
      tasks: { generate: { dependsOn: ['generate:prisma'] } },
    });

    expect(verifyTurbo(root)).toStrictEqual([
      `${configPath}: missing task 'generate:prisma'`,
    ]);
  });

  it('reports a leaf that would cache without restoring its output', ({ expect }) => {
    const { configPath, root } = createGenerateProject({
      scripts: ['generate:prisma'],
      tasks: {
        'generate': { dependsOn: ['generate:prisma'] },
        'generate:prisma': { inputs: ['schema.prisma'] },
      },
    });

    expect(verifyTurbo(root)).toStrictEqual([
      `${configPath}: task 'generate:prisma' must declare outputs or cache: false`,
    ]);
  });

  it('treats an empty outputs array as no outputs', ({ expect }) => {
    const { configPath, root } = createGenerateProject({
      scripts: ['generate:prisma'],
      tasks: {
        'generate': { dependsOn: ['generate:prisma'] },
        'generate:prisma': { outputs: [] },
      },
    });

    expect(verifyTurbo(root)).toStrictEqual([
      `${configPath}: task 'generate:prisma' must declare outputs or cache: false`,
    ]);
  });

  it('reports unparseable package configurations', ({ expect }) => {
    const { configPath, root } = createGenerateProject({
      scripts: ['generate:prisma'],
      tasks: { generate: {} },
    });
    writeFileSync(configPath, '{ not json');

    expect(verifyTurbo(root)).toStrictEqual([`${configPath}: failed to parse`]);
  });

  it('ignores a script named in the ignored set', ({ expect }) => {
    const { root } = createGenerateProject({ scripts: ['generate:prisma'] });

    expect(verifyTurbo(root, new Set(['generate:prisma']))).toStrictEqual([]);
  });

  it('skips packages without generate scripts', ({ expect }) => {
    const { root } = createGenerateProject({ scripts: [] });

    expect(verifyTurbo(root)).toStrictEqual([]);
  });

  it('skips single-package repos, which own no package configuration', ({ expect }) => {
    const { root } = createGenerateProject({
      scripts: ['generate:prisma'],
      singlePackage: true,
    });

    expect(verifyTurbo(root)).toStrictEqual([]);
  });

  it('reports every unwired package in a multi-package workspace', ({ expect }) => {
    const { root } = createGenerateProject({ scripts: ['generate:prisma'] });
    const secondDir = path.join(root, 'packages', build.packageName());
    mkdirSync(secondDir, { recursive: true });
    writeJson(secondDir, 'package.json', {
      name: build.scopedPackageName(),
      scripts: { 'generate:paraglide': 'paraglide compile' },
    });

    const drift = verifyTurbo(root);

    expect(drift).toHaveLength(2);
    expect(drift).toContain(
      `${path.join(secondDir, 'turbo.json')}: missing — ` +
      'add a package configuration defining generate:* tasks',
    );
  });
});
