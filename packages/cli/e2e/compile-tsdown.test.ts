import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  type ProjectFixture,
  createProjectFixture,
  npmInstallArgs,
  runCommand,
} from '@gtbuchanan/test-utils';
import * as build from '@gtbuchanan/test-utils/builders';
import * as v from 'valibot';
import { describe, it } from 'vitest';

/*
 * Runs real tsdown over a package `gtb sync` configured, because what this
 * leaf promises is only visible in what tsdown writes: the extensions, the
 * source map, the private dependency inlined, and the files other tasks own
 * in the same directory left alone.
 */

const jsonIndent = 2;

const writeJson = (dir: string, name: string, data: unknown): void => {
  const filePath = path.join(dir, name);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(data, undefined, jsonIndent)}\n`);
};

const writeText = (dir: string, name: string, content: string): void => {
  const filePath = path.join(dir, name);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
};

/*
 * The tsdown this repository tests against, so the fixture installs the
 * version the toolchain was developed with rather than whatever is latest.
 */
const tsdownSpec = (): string => {
  const manifest: unknown = createRequire(import.meta.url)('tsdown/package.json');

  return `tsdown@${v.parse(v.object({ version: v.string() }), manifest).version}`;
};

const script =
  "const { hello } = await import('./dist/source/src/index.js'); console.log(hello());";

interface BundledPackage {
  readonly fixture: ProjectFixture;
  readonly greeting: string;
  readonly helper: string;
  readonly skillName: string;
}

/*
 * A published package importing `helper`, a package no registry holds,
 * standing in for a private workspace package linked into node_modules.
 * Its `dist/source` already holds what a prior run left: a stale compiled
 * file, a compiled skill, and the manifest `pack:npm` writes.
 */
const createBundledPackage = async (): Promise<BundledPackage> => {
  const fixture = createProjectFixture({ packageName: '@gtbuchanan/cli' });
  /*
   * Revalidated: tsdown pins its rolldown and oxc dependencies exactly, so a
   * cache older than the tsdown being tested reports them as nonexistent.
   */
  const install = await runCommand(
    'npm',
    npmInstallArgs([tsdownSpec()], { revalidate: true }),
    { cwd: fixture.projectDir },
  );
  if (install.exitCode !== 0) {
    throw new Error(`npm install tsdown failed: ${install.stderr}`);
  }
  const dir = fixture.projectDir;
  const helper = build.packageName();
  const greeting = build.packageName();
  const skillName = build.packageName();
  writeJson(dir, 'package.json', {
    devDependencies: {
      '@gtbuchanan/cli': build.semverRange(),
      [helper]: '0.0.0',
      'tsdown': build.semverRange(),
    },
    name: build.packageName(),
    packageManager: 'npm@11.0.0',
    publishConfig: { directory: 'dist/source', exports: { '.': './src/index.js' } },
    // What sync wrote before the package adopted tsdown
    scripts: { 'compile:ts': 'gtb task compile:ts' },
    type: 'module',
    version: build.semverVersion(),
  });
  writeJson(path.join(dir, 'node_modules', helper), 'package.json', {
    exports: './index.js',
    name: helper,
    type: 'module',
    version: '0.0.0',
  });
  /*
   * The consumer owns the base config, which sync scaffolds only where it is
   * absent. Writing one keeps the fixture off `@gtbuchanan/tsconfig`, which
   * the scaffold would extend and nothing here installs.
   */
  writeJson(dir, 'tsconfig.base.json', {
    compilerOptions: { module: 'nodenext', strict: true, target: 'es2024' },
  });
  writeText(
    path.join(dir, 'node_modules', helper),
    'index.js',
    `export const greet = () => '${greeting}';\n`,
  );
  writeText(
    dir,
    'src/index.ts',
    `import { greet } from '${helper}';\n\nexport const hello = (): string => greet();\n`,
  );
  writeText(
    dir,
    'tsdown.config.ts',
    "export default { entry: { 'src/index': 'src/index.ts' } };\n",
  );
  writeText(dir, `skills/${skillName}/SKILL.md`, '');
  writeText(dir, 'dist/source/src/stale.js', '');
  writeText(dir, `dist/source/skills/${skillName}/SKILL.md`, '');
  writeText(dir, 'dist/source/package.json', '{}\n');

  return { fixture, greeting, helper, skillName };
};

/* eslint-disable vitest/max-expects --
   One sync and one bundle, each of whose observable outcomes is checked: the
   commands succeeded, and every file the leaf promises is in place */
describe('gtb task compile:tsdown', () => {
  it('bundles a published package in place of compile:ts', async ({ expect }) => {
    const { fixture, greeting, helper, skillName } = await createBundledPackage();
    using disposable = fixture;
    const dir = disposable.projectDir;

    const sync = await disposable.run('gtb', ['sync']);

    expect(sync).toMatchObject({ exitCode: 0 });

    const manifest: unknown = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));

    expect(manifest).toHaveProperty(['scripts', 'compile:tsdown'], 'gtb task compile:tsdown');
    expect(manifest).not.toHaveProperty(['scripts', 'compile:ts']);

    // Through npm, as turbo runs it, so tsdown resolves from node_modules/.bin
    const compile = await runCommand('npm', ['run', 'compile:tsdown'], { cwd: dir });

    expect(compile).toMatchObject({ exitCode: 0 });

    /*
     * With the helper gone, the bundle still runs only if it carries the
     * helper's code rather than an import of it, as a tarball installed where
     * no registry holds the helper would need.
     */
    rmSync(path.join(dir, 'node_modules', helper), { force: true, recursive: true });
    const imported = await runCommand(
      process.execPath,
      ['--input-type=module', '-e', script],
      { cwd: dir },
    );

    expect(imported).toMatchObject({ exitCode: 0, stdout: `${greeting}\n` });

    const outDir = path.join(dir, 'dist', 'source');

    expect(existsSync(path.join(outDir, 'src', 'index.mjs'))).toBe(false);
    expect(existsSync(path.join(outDir, 'src', 'index.js.map'))).toBe(true);
    expect(existsSync(path.join(outDir, 'src', 'stale.js'))).toBe(false);
    expect(existsSync(path.join(outDir, 'skills', skillName, 'SKILL.md'))).toBe(true);
    expect(readFileSync(path.join(outDir, 'package.json'), 'utf8')).toBe('{}\n');
  });
});
/* eslint-enable vitest/max-expects */
