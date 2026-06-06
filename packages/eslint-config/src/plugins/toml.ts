import { configs as tomlConfigs } from 'eslint-plugin-toml';
import type { PluginFactory } from '../index.ts';

// --- TOML ---

/*
 * TOML linting with structural key/table ordering. Whitespace/layout
 * formatting is owned by Prettier (see format.ts) via prettier-plugin-toml,
 * so we start from `flat/recommended` (correctness only) rather than
 * `flat/standard` (which layers on indent/spacing rules that would fight
 * Prettier). The two ordering rules below are the exception we pull from
 * standard: they enforce that a table's keys and subtables stay contiguous
 * (no `[a]`…`[b]`…`[a.c]` split definitions). That is orthogonal to the
 * alphabetical key sort Prettier applies (`reorderKeys`, see format.ts),
 * which orders keys within a block but never splits a table — so the two
 * don't conflict.
 */
const plugin: PluginFactory = () => [
  ...tomlConfigs['flat/recommended'],
  {
    files: ['**/*.toml'],
    rules: {
      // Justification: Keep a table's keys contiguous; split definitions obscure structure
      'toml/keys-order': 'warn',
      // Justification: Keep subtables under their parent; split definitions obscure structure
      'toml/tables-order': 'warn',
    },
  },
];

export default plugin;
