import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type TestAPI, it as base } from 'vitest';
import { type CommandResult, exec, runCommand } from './lib/command.ts';
import { pinned, resolveTarballs } from './lib/tarball.ts';

interface ProjectFixtureOptions {
  readonly packages?: readonly string[];
  readonly packageName: string;
}

/**
 * Disposable fixture with a single npm project directory.
 * Provides helpers to write files and run local binaries.
 */
export interface ProjectFixture {
  readonly projectDir: string;
  readonly run: (command: string, args: readonly string[]) => Promise<CommandResult>;
  readonly writeFile: (name: string, content: string) => string;
  readonly [Symbol.dispose]: () => void;
}

/**
 * Creates a {@link ProjectFixture} from a tarball. Initializes an ESM
 * project and installs the package under test plus optional dependencies.
 */
export const createProjectFixture = (
  options: ProjectFixtureOptions,
): ProjectFixture => {
  const tarballs = resolveTarballs(options.packageName);
  const projectDir = mkdtempSync(path.join(tmpdir(), 'e2e-build-'));

  const pinnedPkgs = (options.packages ?? []).map(pinned);
  exec('npm', ['init', '-y', '--init-type', 'module'], { cwd: projectDir });
  exec('npm', ['install', ...tarballs, ...pinnedPkgs], { cwd: projectDir });

  const writeFile = (name: string, content: string): string => {
    const filePath = path.join(projectDir, name);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
    return filePath;
  };

  const run = (command: string, args: readonly string[]): Promise<CommandResult> => {
    const binPath = path.join(projectDir, 'node_modules', '.bin', command);
    return runCommand(binPath, args, { cwd: projectDir });
  };

  return {
    projectDir,
    run,
    writeFile,
    [Symbol.dispose]() {
      rmSync(projectDir, { force: true, recursive: true });
    },
  };
};

/**
 * Extends the base `it` with a file-scoped {@link ProjectFixture} via
 * Vitest's fixture API. The fixture is created once per test file and
 * disposed automatically.
 */
export const extendWithFixture = (
  create: () => ProjectFixture,
): TestAPI<{ fixture: ProjectFixture }> => base.extend<{ fixture: ProjectFixture }>({

  fixture: [async ({}, use) => {
    using fixture = create();
    await use(fixture);
  }, { scope: 'file' }],
});
