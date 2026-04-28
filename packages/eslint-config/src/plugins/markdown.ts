import markdown from '@eslint/markdown';
import { markdownIgnores } from '../files.ts';
import type { PluginFactory } from '../index.ts';

/*
 * Rules outside `recommended` whose markdownlint counterpart is in
 * `coveredByEslintMarkdown`. Enabled here so disabling the markdownlint
 * rule does not lose coverage. `markdown/no-bare-urls` is omitted —
 * markdownlint MD034 stays active for its autofix (wraps bare URLs in
 * `<>`); the `markdown/*` counterpart only warns.
 */
const extraRules = {
  'markdown/no-duplicate-headings': 'warn', // markdownlint MD024
  'markdown/no-html': 'warn', // markdownlint MD033
} as const;

/*
 * Rules disabled because Prettier (via eslint-plugin-format) already
 * reformats the underlying input, so a separate lint warning would
 * duplicate the format/prettier diagnostic.
 */
const prettierConflicts = {
  'markdown/no-space-in-emphasis': 'off', // Prettier rewrites `* x*` to `*x*`
} as const;

/**
 * Wires `\@eslint/markdown` alongside `eslint-plugin-markdownlint`. The
 * former enforces every rule in its `recommended` set against the
 * commonmark mdast; the latter fills the gap rules `\@eslint/markdown`
 * does not yet implement.
 */
const plugin: PluginFactory = () => [
  ...markdown.configs.recommended.map(cfg => ({
    ...cfg,
    ignores: [...markdownIgnores],
    rules: { ...cfg.rules, ...extraRules, ...prettierConflicts },
  })),
  {
    /*
     * Changesets writes `[<commit>] <message>` for each entry, where
     * `[<commit>]` is parsed as a reference-style link with no matching
     * definition. The rule otherwise applies on authored Markdown.
     */
    files: ['**/CHANGELOG.md'],
    rules: { 'markdown/no-missing-label-refs': 'off' },
  },
];

export default plugin;
