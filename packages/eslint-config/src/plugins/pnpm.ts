import { configs as pnpmPluginConfigs } from 'eslint-plugin-pnpm';
import type { PluginFactory } from '../index.ts';

// --- pnpm ---

const plugin: PluginFactory = (options) => {
  if (!options.pnpm) {
    return [];
  }
  return [...pnpmPluginConfigs.json, ...pnpmPluginConfigs.yaml];
};

export default plugin;
