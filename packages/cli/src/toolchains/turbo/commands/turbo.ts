import path from 'node:path';
import { defineCommand } from 'citty';
import { rootNames } from '#src/core/command-names.js';
import { run } from '#src/core/process.js';

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
      env: withAbsolutePathEntries(process.env, process.cwd()),
    });
  },
});
