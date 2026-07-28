import {
  configs,
  defineSkillFrontmatterConfig,
} from '@gtbuchanan/eslint-plugin-agent-skills';
import type { SkillFrontmatterSource } from '@gtbuchanan/eslint-plugin-agent-skills';
import type { PluginFactory, ResolvedOptions } from '../index.ts';

/*
 * The overlay has to carry every host in one call: it re-points a
 * single rule, so spreading one overlay per host would leave only the
 * last host's schema in force.
 */
const toSources = (
  host: ResolvedOptions['agentSkillsHost'],
): readonly SkillFrontmatterSource[] =>
  host === 'standard' ? [] : [host].flat();

/**
 * Agent Skills `SKILL.md` validation. Delegates the entire wiring
 * (frontmatter schema rule, name-matches-dir rule, file-length cap)
 * to the plugin's recommended flat-config block, then layers on the
 * frontmatter extensions of whichever hosts are selected.
 */
const plugin: PluginFactory = ({ agentSkillsHost }) => {
  const sources = toSources(agentSkillsHost);

  return [
    ...configs.recommended,
    ...(sources.length === 0 ? [] : defineSkillFrontmatterConfig(...sources)),
  ];
};

export default plugin;
