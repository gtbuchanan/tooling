import { type OxfmtConfig, defineConfig } from 'oxfmt';

// oxlint-disable-next-line id-length -- functional identity combinator
const id = <T>(x: T): T => x;

const config: Readonly<OxfmtConfig> = Object.freeze({
  ignorePatterns: [
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

export const configure = (
  fn: (defaultConfig: Readonly<OxfmtConfig>) => OxfmtConfig = id,
): OxfmtConfig => defineConfig(fn({ ...config, ignorePatterns: [...config.ignorePatterns ?? []] }));
