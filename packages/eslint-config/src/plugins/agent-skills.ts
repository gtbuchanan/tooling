import { configs } from '@gtbuchanan/eslint-plugin-agent-skills';
import type { PluginFactory } from '../index.ts';

/**
 * Agent Skills `SKILL.md` validation. Delegates the entire wiring
 * (frontmatter schema rule, name-matches-dir rule, file-length cap)
 * to the plugin's recommended flat-config block.
 */
const plugin: PluginFactory = () => [...configs.recommended];

export default plugin;
