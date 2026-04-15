// @ts-check

/** @typedef {import('markdownlint').Configuration} Configuration */

import prettierStyle from 'markdownlint/style/prettier' with { type: 'json' };

/** @type {Readonly<Configuration>} */
const defaults = Object.freeze({
  ...prettierStyle,
  'single-trailing-newline': false,
});

/** @type {<T>(val: T) => T} */
const identity = val => val;

/**
 * Returns a markdownlint configuration that disables rules conflicting
 * with Prettier-style formatters (e.g. oxfmt). Pass an optional
 * transform to override individual rules.
 *
 * @param {(defaults: Readonly<Configuration>) => Configuration} [fn]
 * @returns {Configuration}
 */
export const configure = (fn = identity) => fn({ ...defaults });

/** @typedef {{ ignores?: string[] }} Cli2Options */

/** @type {Readonly<Cli2Options>} */
const cli2Defaults = Object.freeze({
  ignores: ['.changeset/**'],
});

/**
 * Returns a markdownlint-cli2 options object with standard ignores
 * (e.g. `.changeset/`). Pass an optional transform to override.
 *
 * @param {(defaults: Readonly<Cli2Options>) => Cli2Options} [fn]
 * @returns {Cli2Options}
 */
export const configureCli2 = (fn = identity) =>
  fn({ ...cli2Defaults, ignores: [...(cli2Defaults.ignores ?? [])] });
