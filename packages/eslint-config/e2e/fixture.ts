import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createIsolatedFixture, runCommand } from '@gtbuchanan/test-utils';

export const createRequireConfig = [
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

export const createRequireOnlyWarnConfig = [
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
}

export const createFixture = () => {
  const fixture = createIsolatedFixture({
    depsPackages: ['typescript'],
    hookPackages: ['eslint', 'jiti'],
    packageName: '@gtbuchanan/eslint-config',
  });

  const eslint = path.join(fixture.hookDir, 'node_modules/.bin/eslint');

  const run = async ({ config, env, files, flags = [] }: RunOptions) => {
    const runDir = mkdtempSync(path.join(fixture.projectDir, 'run-'));
    writeFileSync(path.join(runDir, 'eslint.config.ts'), config ?? createRequireConfig);
    writeFileSync(path.join(runDir, 'tsconfig.json'), tsconfig);
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
    nodePath: fixture.nodePath,
    projectDir: fixture.projectDir,
    run,
    [Symbol.dispose]() {
      fixture[Symbol.dispose]();
    },
  };
};

export type Fixture = ReturnType<typeof createFixture>;
