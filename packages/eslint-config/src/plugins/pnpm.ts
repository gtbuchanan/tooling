import type { Linter } from 'eslint';
import { configs as pnpmPluginConfigs } from 'eslint-plugin-pnpm';
import type { PluginFactory } from '../index.ts';
import type { PnpmWorkspaceSettings } from '../pnpm-workspace.ts';

// --- pnpm ---

/*
 * `pnpm/yaml-enforce-settings` throws at rule-creation time when every
 * knob is empty, so an exhausted policy has to drop the rule entirely
 * rather than pass it through.
 */
const isEmpty = ({
  forbiddenFields = [],
  requiredFields = [],
  settings = {},
}: PnpmWorkspaceSettings): boolean =>
  forbiddenFields.length === 0 &&
  requiredFields.length === 0 &&
  Object.keys(settings).length === 0;

const plugin: PluginFactory = (options) => {
  if (!options.pnpm) {
    return [];
  }

  const policy = options.pnpmWorkspaceSettings;
  const settingsRules: Linter.RulesRecord =
    policy === false || isEmpty(policy)
      ? {}
      : { 'pnpm/yaml-enforce-settings': ['error', policy] };

  /*
   * Merge into the plugin's own YAML config rather than appending a
   * config entry, so the rule inherits its files and YAML parser.
   */
  return [
    ...pnpmPluginConfigs.json,
    ...pnpmPluginConfigs.yaml.map(config => ({
      ...config,
      rules: { ...config.rules, ...settingsRules },
    })),
  ];
};

export default plugin;
