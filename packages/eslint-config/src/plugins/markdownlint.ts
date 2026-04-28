import markdownlint from '@gtbuchanan/eslint-plugin-markdownlint';
import { markdownIgnores } from '../files.ts';
import type { PluginFactory } from '../index.ts';

/*
 * Rules also enforced by @eslint/markdown — disabled here so a single
 * violation does not report twice.
 */
const coveredByEslintMarkdown = {
  'fenced-code-language': false, // md040 → markdown/fenced-code-language
  'heading-increment': false, // md001 → markdown/heading-increment
  'link-fragments': false, // md051 → markdown/no-missing-link-fragments
  'link-image-reference-definitions': false, // md053 → markdown/no-unused-definitions
  'no-alt-text': false, // md045 → markdown/require-alt-text
  'no-duplicate-heading': false, // md024 → markdown/no-duplicate-headings
  'no-empty-links': false, // md042 → markdown/no-empty-links
  'no-inline-html': false, // md033 → markdown/no-html
  'no-reversed-links': false, // md011 → markdown/no-reversed-media-syntax
  'reference-links-images': false, // md052 → markdown/no-missing-label-refs
  'single-h1': false, // md025 → markdown/no-multiple-h1
  'table-column-count': false, // md056 → markdown/table-column-count
} as const;

/*
 * Rules from markdownlint/style/prettier (markdownlint@0.40.0) that
 * conflict with Prettier formatting (handled by eslint-plugin-format).
 * md047 is also disabled because Prettier and pre-commit hooks handle
 * trailing newlines. md037 is added because Prettier reformats
 * spaced emphasis (`* x*` → `*x*`).
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
  'no-space-in-emphasis': false, // md037
  'no-trailing-spaces': false, // md009
  'ol-prefix': false, // md029
  'single-trailing-newline': false, // md047
  'strong-style': false, // md050
  'ul-indent': false, // md007
} as const;

/**
 * markdownlint structural linting via `@gtbuchanan/eslint-plugin-markdownlint`.
 * No parser is set here — `@eslint/markdown` registers
 * `language: 'markdown/commonmark'` for the same files, and the
 * markdownlint rule keys its visitor off the actual AST root.
 */
const plugin: PluginFactory = () => [
  {
    files: ['**/*.md'],
    ignores: [...markdownIgnores],
    plugins: { markdownlint },
    rules: {
      'markdownlint/lint': ['warn', {
        default: true,
        ...prettierConflicts,
        ...coveredByEslintMarkdown,
      }],
    },
  },
];

export default plugin;
