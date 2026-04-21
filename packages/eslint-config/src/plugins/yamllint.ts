import yamllint from '@gtbuchanan/eslint-plugin-yamllint';
import type { PluginFactory } from '../index.ts';

/** yamllint-equivalent YAML rules via `@gtbuchanan/eslint-plugin-yamllint`. */
const plugin: PluginFactory = () => [
  {
    files: ['**/*.yaml', '**/*.yml'],
    plugins: { yamllint },
    rules: {
      'yamllint/anchors': 'warn',
      'yamllint/document-end': 'warn',
      'yamllint/document-start': 'warn',
      'yamllint/octal-values': 'warn',
      'yamllint/truthy': ['warn', {
        'allowed-values': ['true', 'false'],
      }],
    },
  },
  {
    /*
     * Renovate strips document start markers from pnpm-workspace.yaml
     * when bumping dependencies. Disable the rule to avoid noise.
     */
    files: ['pnpm-workspace.yaml'],
    rules: {
      'yamllint/document-start': 'off',
    },
  },
];

export default plugin;
