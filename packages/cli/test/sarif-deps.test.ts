import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'vitest';
import { defaultSarifDeps } from '#src/lib/sarif-compare.js';

interface SandboxFixture {
  readonly dir: string;
  readonly [Symbol.dispose]: () => void;
}

const createSandbox = (): SandboxFixture => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sarif-deps-test-'));
  return {
    dir,
    [Symbol.dispose]() {
      rmSync(dir, { force: true, recursive: true });
    },
  };
};

describe.concurrent('defaultSarifDeps', () => {
  it('writeText creates parent directories and readText round-trips', ({
    expect,
  }) => {
    using sandbox = createSandbox();
    const filePath = path.join(sandbox.dir, 'dist', 'sarif', 'base.ref');

    defaultSarifDeps.writeText(filePath, 'abc1234\n');

    expect(defaultSarifDeps.readText(filePath)).toBe('abc1234\n');
  });

  it('copyFile creates the destination directory', ({ expect }) => {
    using sandbox = createSandbox();
    const source = path.join(sandbox.dir, 'eslint.sarif');
    writeFileSync(source, '{}');
    const destination = path.join(sandbox.dir, 'dist', 'sarif', 'base', 'eslint.sarif');

    defaultSarifDeps.copyFile(source, destination);

    expect(readFileSync(destination, 'utf8')).toBe('{}');
  });

  it('list returns only top-level sarif files, sorted', ({ expect }) => {
    using sandbox = createSandbox();
    const dir = path.join(sandbox.dir, 'dist', 'sarif');
    defaultSarifDeps.ensureDir(path.join(dir, 'base'));
    writeFileSync(path.join(dir, 'oxlint.sarif'), '{}');
    writeFileSync(path.join(dir, 'eslint.sarif'), '{}');
    writeFileSync(path.join(dir, 'base.ref'), 'abc\n');
    writeFileSync(path.join(dir, 'base', 'eslint.sarif'), '{}');

    expect(defaultSarifDeps.list(dir)).toStrictEqual([
      'eslint.sarif',
      'oxlint.sarif',
    ]);
  });

  it('list returns empty for a missing directory', ({ expect }) => {
    using sandbox = createSandbox();

    expect(defaultSarifDeps.list(path.join(sandbox.dir, 'missing'))).toStrictEqual([]);
  });

  it('remove deletes directories recursively and ignores missing paths', ({
    expect,
  }) => {
    using sandbox = createSandbox();
    const dir = path.join(sandbox.dir, 'dist', 'sarif', 'base');
    defaultSarifDeps.ensureDir(dir);
    writeFileSync(path.join(dir, 'eslint.sarif'), '{}');

    defaultSarifDeps.remove(dir);
    defaultSarifDeps.remove(dir);

    expect(existsSync(dir)).toBe(false);
  });

  it('ensureDir is recursive and idempotent', ({ expect }) => {
    using sandbox = createSandbox();
    const dir = path.join(sandbox.dir, 'a', 'b', 'c');

    defaultSarifDeps.ensureDir(dir);
    defaultSarifDeps.ensureDir(dir);

    expect(defaultSarifDeps.exists(dir)).toBe(true);
  });

  it('makeTempDir creates a fresh directory', ({ expect }) => {
    const dir = defaultSarifDeps.makeTempDir();
    try {
      expect(existsSync(dir)).toBe(true);
      expect(path.basename(dir)).toMatch(/^gtb-sarif-base-/v);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it('resolveMultitool resolves an existing binary path', ({ expect }) => {
    const binary = defaultSarifDeps.resolveMultitool();

    expect(existsSync(binary)).toBe(true);
  });

  it('workspace resolves single-package mode from an isolated cwd', ({
    expect,
  }) => {
    using sandbox = createSandbox();

    expect(defaultSarifDeps.workspace(sandbox.dir)).toMatchObject({
      packageDirs: [sandbox.dir],
      rootDir: sandbox.dir,
    });
  });
});
