import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createIsolatedFixture, runCommand } from '@gtbuchanan/test-utils';
import { it as base, describe } from 'vitest';

const createRequireConfig = [
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

const createRequireOnlyWarnConfig = [
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

const createFixture = () => {
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

type Fixture = ReturnType<typeof createFixture>;

/* eslint-disable-next-line vitest/consistent-test-it --
   False positive on .extend() factory:
   https://github.com/vitest-dev/eslint-plugin-vitest/issues/884 */
const it = base.extend<{ fixture: Fixture }>({

  fixture: [async ({}, use) => {
    using fixture = createFixture();
    await use(fixture);
  }, { scope: 'file' }],
});

describe.concurrent('eslint CLI integration', () => {
  it('fails with bare import (proves isolation works)', async ({ fixture, expect }) => {
    const runDir = mkdtempSync(path.join(fixture.projectDir, 'run-'));
    const bareConfig = [
      'import { configure } from "@gtbuchanan/eslint-config";',
      'export default configure({',
      '  onlyWarn: false,',
      '  tsconfigRootDir: import.meta.dirname,',
      '});',
    ].join('\n');

    writeFileSync(path.join(runDir, 'eslint.config.ts'), bareConfig);
    writeFileSync(path.join(runDir, 'clean.mjs'), "export const greeting = 'hello';\n");

    const { NODE_PATH: _nodePath, ...envWithoutNodePath } = process.env;
    const { exitCode, stderr } = await runCommand(
      fixture.eslint,
      ['clean.mjs'],
      { cwd: runDir, env: envWithoutNodePath },
    );

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('@gtbuchanan/eslint-config');
  });

  it('passes for a clean file', async ({ fixture, expect }) => {
    const result = await fixture.run({
      files: { 'clean.ts': "export const greeting = 'hello';\n" },
    });

    expect(result).toMatchObject({ exitCode: 0 });
  });

  it('detects process.exit via eslint-plugin-n', async ({ fixture, expect }) => {
    const { exitCode, stdout } = await fixture.run({
      files: { 'bad.ts': 'process.exit(0);\n' },
    });

    expect(exitCode).not.toBe(0);
    expect(stdout).toContain('n/no-process-exit');
  });

  it('applies oxlint overlay as last config', async ({ fixture, expect }) => {
    const { exitCode, stdout } = await fixture.run({
      files: { 'test.ts': 'export const greeting = 42;\n' },
    });

    // Should pass — oxlint overlay disables overlapping ESLint rules
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain('Error');
  });

  it('respects global ignores for dist/', async ({ fixture, expect }) => {
    const longLine = `export const x = '${'a'.repeat(101)}';\n`;
    const { exitCode } = await fixture.run({
      files: { 'dist/bad.mjs': longLine },
    });

    expect(exitCode).toBe(0);
  });

  it('detects duplicate keys in JSON files', async ({ fixture, expect }) => {
    const { exitCode, stdout } = await fixture.run({
      files: { 'bad.json': '{\n  "key": 1,\n  "key": 2\n}\n' },
    });

    expect(exitCode).not.toBe(0);
    expect(stdout).toContain('json/no-duplicate-keys');
  });

  it('passes for a valid JSON file', async ({ fixture, expect }) => {
    const { exitCode } = await fixture.run({
      files: { 'valid.json': '{\n  "key": "value"\n}\n' },
    });

    expect(exitCode).toBe(0);
  });

  it('warns on unsorted keys in JSON files', async ({ fixture, expect }) => {
    const { exitCode, stdout } = await fixture.run({
      files: { 'unsorted.json': '{\n  "beta": 1,\n  "alpha": 2\n}\n' },
    });

    // Warnings don't cause a non-zero exit code
    expect(exitCode).toBe(0);
    expect(stdout).toContain('json/sort-keys');
  });

  it('allows comments in tsconfig.json via JSONC', async ({ fixture, expect }) => {
    const { exitCode } = await fixture.run({
      files: {
        'tsconfig.json': '{\n  // A comment\n  "compilerOptions": {}\n}\n',
      },
    });

    expect(exitCode).toBe(0);
  });

  it('downgrades errors to warnings with onlyWarn', async ({ fixture, expect }) => {
    const { exitCode, stdout } = await fixture.run({
      config: createRequireOnlyWarnConfig,
      files: { 'bad.ts': 'process.exit(0);\n' },
    });

    // Warnings don't cause a non-zero exit code
    expect(exitCode).toBe(0);
    expect(stdout).toContain('n/no-process-exit');
  });

  it('formats JSON, Markdown, YAML, and CSS via Prettier plugins', async ({ fixture, expect }) => {
    const unsortedJson = '{\n  "z": 1,\n  "a": [1, 2]\n}\n';
    const longMarkdown = `# Title\n\n${'word '.repeat(40).trim()}\n`;
    const doubleQuotedYaml = '---\nkey: "value"\n';
    const unsortedCss = '.box {\n  display: flex;\n  color: red;\n}\n';

    const result = await fixture.run({
      files: {
        'config.yml': doubleQuotedYaml,
        'data.json': unsortedJson,
        'doc.md': longMarkdown,
        'style.css': unsortedCss,
      },
      flags: ['--fix'],
    });

    expect(result).toMatchObject({ exitCode: 0 });

    // JSON: sort-json sorts keys, multiline-arrays expands arrays
    expect(result.readFile('data.json')).toBe(
      ['{', '  "a": [', '    1,', '    2', '  ],', '  "z": 1', '}', ''].join('\n'),
    );

    // Markdown: proseWrap 'preserve' keeps long lines unwrapped
    expect(result.readFile('doc.md')).toBe(longMarkdown);

    // YAML: singleQuote from prettierDefaults converts double quotes
    expect(result.readFile('config.yml')).toBe("---\nkey: 'value'\n");

    // CSS: alphabetical property sorting (color before display)
    expect(result.readFile('style.css')).toBe(
      '.box {\n  color: red;\n  display: flex;\n}\n',
    );
  });

  it('detects yamllint violations in YAML files', async ({ fixture, expect }) => {
    const yaml = '---\ncountry: NO\nperms: 0777\n';
    const result = await fixture.run({
      files: { 'config.yml': yaml },
    });

    expect(result.stdout).toContain('yamllint/truthy');
    expect(result.stdout).toContain('yamllint/octal-values');
  });

  it('detects markdownlint violations in markdown files', async ({ fixture, expect }) => {
    const result = await fixture.run({
      files: { 'doc.md': '# Title\n\n# Title\n' },
    });

    expect(result.stdout).toContain('markdownlint/lint');
    expect(result.stdout).toMatch(/MD024/v);
  });

  it('suppresses markdownlint rules disabled by prettier style', async ({ fixture, expect }) => {
    // heading-style (md003) is disabled — mixed ATX/setext should pass
    const result = await fixture.run({
      files: { 'doc.md': '# ATX heading\n\nSetext heading\n---\n' },
    });

    expect(result.stdout).not.toMatch(/MD003/v);
  });

  it('runs both Prettier formatting and markdownlint on markdown', async ({ fixture, expect }) => {
    /*
     * Prettier (format/prettier) and markdownlint (markdownlint/lint)
     * both target *.md. The markdownlint parser must override
     * format.parserPlain so both rule sets work on the same file.
     * Misformatted table triggers Prettier, duplicate heading triggers MD024.
     */
    const result = await fixture.run({
      files: {
        'doc.md': '# Title\n\n| a|b |\n|---|---|\n| 1|2 |\n\n# Title\n',
      },
    });

    expect(result.stdout).toContain('format/prettier');
    expect(result.stdout).toContain('markdownlint/lint');
  });

  it('applies markdownlint autofix via --fix', async ({ fixture, expect }) => {
    // MD034: no-bare-urls (fixable, not disabled by prettier conflicts)
    const result = await fixture.run({
      config: createRequireOnlyWarnConfig,
      files: { 'doc.md': '# Title\n\nVisit https://example.com today.\n' },
      flags: ['--fix'],
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.readFile('doc.md')).toBe(
      '# Title\n\nVisit <https://example.com> today.\n',
    );
  });

  it('ignores .changeset/ files for markdownlint', async ({ fixture, expect }) => {
    // Changeset file without a heading — would fail MD041 if not ignored
    const result = await fixture.run({
      files: {
        '.changeset/test-changeset.md': 'No heading here\n',
        'doc.md': '# Valid\n\nContent.\n',
      },
    });

    expect(result.stdout).not.toMatch(/MD041/v);
  });

  it('formats XML with whitespace-insensitive mode', async ({ fixture, expect }) => {
    const uglyXml = '<Project><PropertyGroup><Version>1.0</Version></PropertyGroup></Project>';

    const result = await fixture.run({
      files: { 'app.csproj': uglyXml },
      flags: ['--fix'],
    });

    expect(result).toMatchObject({ exitCode: 0 });
    expect(result.readFile('app.csproj')).toContain('<PropertyGroup>\n');
  });
});
