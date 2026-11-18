import { createRequire } from 'node:module';
import path from 'node:path';
import { defineCommand } from 'citty';
import { rootNames } from '#src/core/command-names.js';
import { run } from '#src/core/process.js';

const require = createRequire(import.meta.url);

/**
 * Locates the PATH variable and its value, tolerating Windows' `Path`
 * casing. A key holding no value counts as unset.
 */
const findPath = (env: NodeJS.ProcessEnv): readonly [string, string] | undefined => {
  const key = Object.keys(env).find(name => name.toUpperCase() === 'PATH');
  const value = key === undefined ? undefined : env[key];
  return key === undefined || value === undefined ? undefined : [key, value];
};

/**
 * Returns `env` with every PATH entry rewritten to an absolute path,
 * resolved against `cwd`.
 *
 * Turbo resolves the package manager binary against PATH once, from the
 * directory it was invoked in, and keeps whatever path that search
 * produced — then spawns each task with its own package directory as
 * the cwd. A match from a relative entry therefore yields a relative
 * program path, which the child re-resolves against its own directory:
 * it either misses entirely (ENOENT, with no PATH search to fall back
 * on, since the path now contains a separator) or, if the same relative
 * directory happens to exist there, runs a different binary.
 *
 * pnpm 11 and earlier prepend a relative `./node_modules/.bin` to a
 * script's PATH, so this bites whenever a bin named after the package
 * manager lives there — on Termux, exactly the layout
 * `@gtbuchanan/pnpm-termux-shim` creates. Rewriting is unconditional:
 * a relative PATH entry is cwd-sensitive on every platform, and pinning
 * it to the invoking directory is what the entry already meant when
 * PATH was assembled.
 */
export const withAbsolutePathEntries = (
  env: NodeJS.ProcessEnv,
  cwd: string,
): NodeJS.ProcessEnv => {
  const found = findPath(env);
  if (found === undefined) return env;
  const [key, value] = found;

  return {
    ...env,
    [key]: value
      .split(path.delimiter)
      .map(entry => (path.isAbsolute(entry) ? entry : path.resolve(cwd, entry)))
      .join(path.delimiter),
  };
};

/**
 * Returns `env` with `entry` ahead of every existing PATH entry, keeping
 * the variable's existing casing.
 */
export const withPathEntryFirst = (
  env: NodeJS.ProcessEnv,
  entry: string,
): NodeJS.ProcessEnv => {
  const [key, value] = findPath(env) ?? ['PATH', undefined];
  return {
    ...env,
    [key]: value === undefined ? entry : [entry, value].join(path.delimiter),
  };
};

const isModuleNotFound = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'MODULE_NOT_FOUND';

/**
 * Returns the directory holding `@gtbuchanan/pnpm-termux-shim`'s `pnpm`,
 * or `undefined` where the shim isn't installed. The shim is an optional
 * dependency filtered to Android, so it is absent everywhere else.
 * `resolve` is `require.resolve`, passed in so a test can stand in for
 * the installed layout.
 */
export const termuxShimDirectory = (
  resolve: (specifier: string) => string,
): string | undefined => {
  try {
    return path.join(path.dirname(resolve('@gtbuchanan/pnpm-termux-shim/package.json')), 'bin');
  } catch (error) {
    if (isModuleNotFound(error)) return undefined;
    throw error;
  }
};

/*
 * On Android, turbo can't spawn Termux's own `pnpm` (the shim's README
 * says why), so the shim's directory goes first. It arrives with the CLI
 * rather than as a dependency each repository declares, and goes in
 * after the PATH rewrite, being absolute already.
 */
export const turboEnv = (
  env: NodeJS.ProcessEnv,
  cwd: string,
  platform: NodeJS.Platform,
  resolve: (specifier: string) => string,
): NodeJS.ProcessEnv => {
  const absolute = withAbsolutePathEntries(env, cwd);
  if (platform !== 'android') return absolute;
  const shimDir = termuxShimDirectory(resolve);
  return shimDir === undefined ? absolute : withPathEntryFirst(absolute, shimDir);
};

/**
 * `gtb turbo` — runs turbo with cwd-independent PATH entries.
 */
export const turbo = defineCommand({
  meta: {
    description: 'Run turbo with cwd-independent PATH entries',
    name: rootNames.turbo,
  },
  run: async ({ rawArgs }) => {
    await run('turbo', {
      args: rawArgs,
      env: turboEnv(process.env, process.cwd(), process.platform, require.resolve),
    });
  },
});
