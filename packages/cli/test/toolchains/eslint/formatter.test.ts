import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { faker } from '@faker-js/faker';
import { ESLint } from 'eslint';
import { describe, it } from 'vitest';
import { repositoryRoot } from '#src/toolchains/eslint/formatter.js';
import { findingsLog, formatterPath } from '#src/toolchains/eslint/paths.js';
import { createTempDir } from '#test/helpers.js';

interface LintedProject extends Disposable {
  readonly dir: string;
  readonly format: () => Promise<string>;
}

/*
 * A project with one unused variable, linted by the real ESLint and formatted
 * through the formatter loaded by path, as `--format` loads it. With a
 * `subdir`, the project is a git repository linted from that subdirectory.
 */
const lintProject = (subdir?: string): LintedProject => {
  const dir = createTempDir();
  const lintDir = subdir === undefined ? dir : path.join(dir, subdir);
  if (subdir !== undefined) {
    execFileSync('git', ['init', '--quiet'], { cwd: dir });
  }
  mkdirSync(path.join(lintDir, 'src'), { recursive: true });
  writeFileSync(path.join(lintDir, 'src', 'index.js'), 'const unused = 1;\n');

  return {
    dir: lintDir,
    format: async () => {
      const eslint = new ESLint({
        cwd: lintDir,
        overrideConfig: { rules: { 'no-unused-vars': 'warn' } },
        overrideConfigFile: true,
      });
      const results = await eslint.lintFiles(['src']);
      const formatter = await eslint.loadFormatter(formatterPath);

      return await formatter.format(results);
    },
    [Symbol.dispose]: () => {
      rmSync(dir, { force: true, recursive: true });
    },
  };
};

/*
 * A git runner failing to spawn, as Node rejects when it can't start a
 * process: with an error carrying the system `code`.
 */
const failingGit = (code: string) => async (): Promise<never> => {
  await Promise.resolve();
  throw Object.assign(new Error(`spawn git ${code}`), { code });
};

describe.concurrent(repositoryRoot, () => {
  it('falls back to the linted directory where git is not installed', async ({ expect }) => {
    const cwd = createTempDir();

    const root = await repositoryRoot(cwd, failingGit('ENOENT'));

    expect(root).toBe(cwd);
  });

  it('rethrows a failure to run git other than its absence', async ({ expect }) => {
    const cwd = createTempDir();

    await expect(repositoryRoot(cwd, failingGit('EACCES'))).rejects.toThrow('EACCES');
  });
});

describe.concurrent('formatter', () => {
  it('writes the findings as a SARIF log', async ({ expect }) => {
    using project = lintProject();

    await project.format();
    const log: unknown = JSON.parse(readFileSync(path.join(project.dir, findingsLog), 'utf8'));

    expect(log).toMatchObject({
      runs: [{
        results: [{
          locations: [{ physicalLocation: { artifactLocation: { uri: 'src/index.js' } } }],
          ruleId: 'no-unused-vars',
        }],
      }],
    });
  });

  it('locates findings relative to the git repository root', async ({ expect }) => {
    const subdir = faker.word.noun();
    using project = lintProject(subdir);

    await project.format();
    const log: unknown = JSON.parse(readFileSync(path.join(project.dir, findingsLog), 'utf8'));

    expect(log).toHaveProperty(
      'runs.0.results.0.locations.0.physicalLocation.artifactLocation.uri',
      `${subdir}/src/index.js`,
    );
  });

  it('returns the findings for the console', async ({ expect }) => {
    using project = lintProject();

    const output = await project.format();

    expect(output).toContain('no-unused-vars');
  });
});
