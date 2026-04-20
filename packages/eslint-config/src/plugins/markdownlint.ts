import markdownlint from '@gtbuchanan/eslint-plugin-markdownlint';
import { parser as markdownlintParser } from '@gtbuchanan/eslint-plugin-markdownlint';
import type { PluginFactory } from '../index.ts';

/*
 * Rules from markdownlint/style/prettier (markdownlint@0.40.0) that
 * conflict with Prettier formatting (handled by eslint-plugin-format).
 * md047 (single-trailing-newline) is also disabled because Prettier
 * and pre-commit hooks handle trailing newlines.
 */
const prettierConflicts = {
  'blanks-around-fences': false, // md031
  'blanks-around-headings': false, // md022
  'blanks-around-lists': false, // md032
  'code-fence-style': false, // md046
  'emphasis-style': false, // md049
  'heading-start-left': false, // md023
  'heading-style': false, // md003
  'hr-style': false, // md035
  'line-length': false, // md013
  'list-indent': false, // md005
  'list-marker-space': false, // md030
  'no-blanks-blockquote': false, // md028
  'no-hard-tabs': false, // md010
  'no-missing-space-atx': false, // md018
  'no-missing-space-closed-atx': false, // md020
  'no-multiple-blanks': false, // md012
  'no-multiple-space-atx': false, // md019
  'no-multiple-space-blockquote': false, // md027
  'no-multiple-space-closed-atx': false, // md021
  'no-trailing-spaces': false, // md009
  'ol-prefix': false, // md029
  'single-trailing-newline': false, // md047
  'strong-style': false, // md050
  'ul-indent': false, // md007
} as const;

/**
 * markdownlint structural linting via `@gtbuchanan/eslint-plugin-markdownlint`.
 * Must be registered after the format plugin so the markdownlint
 * parser overrides format.parserPlain for `*.md` files — the
 * format/prettier rule only needs source text access, which the
 * markdownlint parser provides.
 */
const plugin: PluginFactory = () => [
  {
    files: ['**/*.md'],
    ignores: ['.changeset/**'],
    languageOptions: { parser: markdownlintParser },
    plugins: { markdownlint },
    rules: {
      'markdownlint/lint': ['warn', {
        default: true,
        ...prettierConflicts,
      }],
    },
  },
];

export default plugin;
