import { type OxfmtConfig, defineConfig } from 'oxfmt';

// eslint-disable-next-line id-length -- functional identity combinator
const id = <T>(x: T): T => x;

const config: Readonly<OxfmtConfig> = Object.freeze({
  ignorePatterns: [
    '.claude/worktrees/**',
    '*.cjs',
    '*.cts',
    '*.js',
    '*.jsx',
    '*.mjs',
    '*.mts',
    '*.ts',
    '*.tsx',
  ],
  overrides: [
    {
      files: ['*.json', '*.json5', '*.jsonc'],
      options: {
        /*
         * Justification: Force JSON arrays to always expand (one element
         * per line) so that JSON.stringify output is already
         * oxfmt-compliant. Without this, oxfmt collapses short arrays to
         * inline, causing turbo:init output to drift from the formatted
         * result on every pre-commit run.
         */
        printWidth: 1,
      },
    },
  ],
  singleQuote: true,
});

/**
 * Creates an oxfmt configuration for non-JS/TS files (JSON, Markdown, etc.).
 * JS/TS files are ignored because `@stylistic` handles formatting through oxlint.
 * @param fn - Transform function to override defaults. Receives a copy of the
 *             base config with `singleQuote: true`.
 */
export const configure = (
  fn: (defaultConfig: Readonly<OxfmtConfig>) => OxfmtConfig = id,
): OxfmtConfig => defineConfig(fn({
  ...config,
  ignorePatterns: [...config.ignorePatterns ?? []],
  overrides: [...config.overrides ?? []],
}));
