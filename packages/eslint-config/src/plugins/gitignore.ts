import gitignore from 'eslint-config-flat-gitignore';
import type { FlatGitignoreOptions } from 'eslint-config-flat-gitignore';
import type { PluginFactory } from '../index.ts';

// --- gitignore ---

/**
 * Defaults applied to the `gitignore` option. A caller-supplied options
 * object is merged over these, so overriding one field keeps the rest.
 */
export const defaultGitignoreOptions: FlatGitignoreOptions = {
  /*
   * Monorepos keep per-package .gitignore files alongside the root one,
   * and the root config lints every package.
   */
  recursive: true,
  /*
   * Upstream throws when an ignore file is missing. This config is loaded
   * by repos it knows nothing about, so a missing .gitignore contributes
   * no patterns rather than failing the whole lint run.
   */
  strict: false,
};

/*
 * Emits a global-ignores entry (`ignores` and `name` only, no `files`), so
 * the patterns apply to every config that follows regardless of position.
 */
const plugin: PluginFactory = ({ gitignore: option }) => {
  if (option === false) {
    return [];
  }

  const overrides: FlatGitignoreOptions = option === true ? {} : option;

  return [gitignore({ ...defaultGitignoreOptions, ...overrides })];
};

export default plugin;
