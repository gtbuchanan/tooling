import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, relative } from 'node:path';
import { run } from '../../lib/process.ts';
import { resolveWorkspace } from '../../lib/workspace.ts';
import type { CustomCommandDef } from '../types.ts';

const mergedLcov = 'dist/coverage/vitest/merged/lcov.info';
const fastLcov = 'dist/coverage/vitest/fast/lcov.info';
const sfPrefixLength = 3;
const dotPrefixLength = 2;

/** Resolves the best available lcov file (merged over fast). */
const resolveLcov = (): string | undefined => {
  if (existsSync(mergedLcov)) {
    return mergedLcov;
  }
  if (existsSync(fastLcov)) {
    return fastLcov;
  }
  return undefined;
};

const driveLetterPathPattern = /^[A-Za-z]:(?:\\|\/)/v;

const normalizeSlashes = (path: string): string =>
  path.replaceAll('\\', '/');

const normalizeSourcePath = (
  sourcePath: string,
  packagePath: string,
): string => {
  const source = normalizeSlashes(sourcePath);
  if (
    source.startsWith('/') ||
    driveLetterPathPattern.test(source) ||
    source.startsWith(`${packagePath}/`)
  ) {
    return source;
  }
  const trimmed = source.startsWith('./') ? source.slice(dotPrefixLength) : source;
  return `${packagePath}/${trimmed}`;
};

/** Rewrites relative `SF:` entries to repo-relative paths for Codecov mapping. */
const prepareLcovForUpload = (file: string, packagePath: string): string => {
  if (packagePath === '') {
    return file;
  }
  const content = readFileSync(file, 'utf-8');
  const rewritten = content
    .split('\n')
    .map((line) => {
      if (!line.startsWith('SF:')) {
        return line;
      }
      return `SF:${normalizeSourcePath(line.slice(sfPrefixLength), packagePath)}`;
    })
    .join('\n');
  if (rewritten === content) {
    return file;
  }
  const uploadFile = file.replace(/\.info$/v, '.codecov.info');
  writeFileSync(uploadFile, rewritten);
  return uploadFile;
};

const resolveUploadFile = (): string | undefined => {
  const file = resolveLcov();
  if (file === undefined) {
    console.log('No coverage files found, skipping Codecov upload');
    return undefined;
  }
  const cwd = process.cwd();
  const { rootDir } = resolveWorkspace({ cwd });
  const packagePath = normalizeSlashes(relative(rootDir, cwd));
  return prepareLcovForUpload(file, packagePath);
};

const uploadCodecov = (
  uploadFile: string,
  flag: string,
  args: readonly string[],
): Promise<void> =>
  run('codecov', {
    args: [
      'upload-process',
      '--disable-search',
      '-f', uploadFile,
      '-F', flag,
      ...args,
    ],
  });

/** Uploads coverage to Codecov. No-ops outside CI. */
export const def = {
  handler: async (args) => {
    if (!process.env['CI']) {
      console.log('Codecov upload skipped (not in CI)');
      return;
    }

    const uploadFile = resolveUploadFile();
    if (uploadFile === undefined) {
      return;
    }
    await uploadCodecov(uploadFile, basename(process.cwd()), args);
  },
  name: 'coverage:codecov:upload',
} as const satisfies CustomCommandDef;
