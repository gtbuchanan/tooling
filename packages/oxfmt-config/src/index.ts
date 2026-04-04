import { type OxfmtConfig, defineConfig } from 'oxfmt';

// oxlint-disable-next-line id-length -- functional identity combinator
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
): OxfmtConfig => defineConfig(fn({ ...config, ignorePatterns: [...config.ignorePatterns ?? []] }));
