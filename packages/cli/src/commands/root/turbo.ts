import path from 'node:path';
import { defineCommand } from 'citty';
import { run } from '../../lib/process.ts';
import { rootNames } from './names.ts';

/** Locates the PATH variable, tolerating Windows' `Path` casing. */
const findPathKey = (env: NodeJS.ProcessEnv): string | undefined =>
  Object.keys(env).find(key => key.toUpperCase() === 'PATH');

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
 * pnpm always prepends a relative `./node_modules/.bin`, so this bites
 * whenever a bin named after the package manager lives there. On Termux
 * that is exactly the layout `@gtbuchanan/pnpm-termux-shim` creates, and
 * every non-root task fails without this normalization.
 *
 * Rewriting is unconditional: a relative PATH entry is cwd-sensitive on
 * every platform, and pinning it to the invoking directory is what the
 * entry already meant when PATH was assembled.
 */
export const withAbsolutePathEntries = (
  env: NodeJS.ProcessEnv,
  cwd: string,
): NodeJS.ProcessEnv => {
  const key = findPathKey(env);
  if (key === undefined) return env;

  return {
    ...env,
    [key]: (env[key] ?? '')
      .split(path.delimiter)
      .map(entry => (path.isAbsolute(entry) ? entry : path.resolve(cwd, entry)))
      .join(path.delimiter),
  };
};

/** `gtb turbo` — runs turbo with cwd-independent PATH entries. */
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
