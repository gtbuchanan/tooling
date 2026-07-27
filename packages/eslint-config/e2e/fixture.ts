import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createIsolatedFixture, runCommand } from '@gtbuchanan/test-utils';

export const requireConfig = [
  'import { createRequire } from "node:module";',
  'import { pathToFileURL } from "node:url";',
  'const { resolve } = createRequire(import.meta.url);',
  'const { href } = pathToFileURL(resolve("@gtbuchanan/eslint-config"));',
  'const { configure } = await import(href);',
  'export default configure({',
  '  onlyWarn: false,',
  '  tsconfigRootDir: import.meta.dirname,',
  '});',
].join('\n');

export const requireOnlyWarnConfig = [
  'import { createRequire } from "node:module";',
  'import { pathToFileURL } from "node:url";',
  'const { resolve } = createRequire(import.meta.url);',
  'const { href } = pathToFileURL(resolve("@gtbuchanan/eslint-config"));',
  'const { configure } = await import(href);',
  'export default configure({',
  '  onlyWarn: true,',
  '  tsconfigRootDir: import.meta.dirname,',
  '});',
].join('\n');

const tsconfigRoot = `${JSON.stringify({
  compilerOptions: {
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    target: 'ESNext',
  },
})}\n`;

const tsconfig = `${JSON.stringify({
  extends: './tsconfig.root.json',
  include: ['**/*.ts', '**/*.mts', '**/*.cts'],
})}\n`;

interface RunOptions {
  config?: string;
  env?: Record<string, string | undefined>;
  files: Record<string, string>;
  flags?: readonly string[];
  /**
   * Overrides the default `tsconfig.json`. Needed for tests that lint
   * non-TypeScript extensions — the project service rejects any file no
   * tsconfig includes, which fails the run before rules ever execute.
   */
  tsconfig?: string;
}

export const createFixture = () => {
  const fixture = createIsolatedFixture({
    depsPackages: ['@types/node', 'typescript'],
    hookPackages: ['eslint', 'jiti'],
    packageName: '@gtbuchanan/eslint-config',
  });

  const eslint = path.join(fixture.hookDir, 'node_modules/.bin/eslint');

  /*
   * Variant of the default tsconfig covering JavaScript extensions, for
   * tests that lint .cjs/.js sources. Without node types, `require` is
   * `any` and `module` is unresolved, so the no-unsafe-* rules fire on
   * any CommonJS sample and drown out what those tests assert. Both
   * fields are required to get them: `typeRoots` because the isolated
   * deps directory is not an ancestor of the run directory, and `types`
   * because TypeScript 6 no longer includes every package under
   * `typeRoots` automatically.
   */
  const jsTsconfig = `${JSON.stringify({
    compilerOptions: {
      allowJs: true,
      typeRoots: [path.join(fixture.depsDir, 'node_modules/@types')],
      types: ['node'],
    },
    extends: './tsconfig.root.json',
    include: ['**/*.cjs', '**/*.js', '**/*.mjs'],
  })}\n`;

  const run = async ({
    config,
    env,
    files,
    flags = [],
    tsconfig: tsconfigOverride,
  }: RunOptions) => {
    const runDir = mkdtempSync(path.join(fixture.projectDir, 'run-'));
    writeFileSync(path.join(runDir, 'eslint.config.ts'), config ?? requireConfig);
    writeFileSync(path.join(runDir, 'tsconfig.json'), tsconfigOverride ?? tsconfig);
    writeFileSync(path.join(runDir, 'tsconfig.root.json'), tsconfigRoot);

    const fileNames = Object.keys(files);
    for (const [name, content] of Object.entries(files)) {
      const filePath = path.join(runDir, name);
      mkdirSync(path.join(filePath, '..'), { recursive: true });
      writeFileSync(filePath, content);
    }

    const result = await runCommand(eslint, [...flags, ...fileNames], {
      cwd: runDir,
      env: {
        ...process.env,
        NODE_PATH: fixture.nodePath,
        ...env,
      },
    });

    return {
      ...result,
      readFile: (name: string) => readFileSync(path.join(runDir, name), 'utf8'),
    };
  };

  return {
    eslint,
    jsTsconfig,
    nodePath: fixture.nodePath,
    projectDir: fixture.projectDir,
    run,
    [Symbol.dispose]() {
      fixture[Symbol.dispose]();
    },
  };
};

export type Fixture = ReturnType<typeof createFixture>;
