import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as v from 'valibot';
import { StringArray } from './schemas.ts';

/** Filename of the workspace-root skills-npm configuration. */
export const skillsConfigFilename = 'skills-npm.config.ts';

const SkillsConfigDefaultSchema = v.object({
  agents: v.optional(StringArray),
});

const SkillsConfigModuleSchema = v.object({
  default: v.optional(SkillsConfigDefaultSchema),
});

/**
 * Loads the `agents` list from `skills-npm.config.ts` at the workspace
 * root if present. Returns an empty array when the file doesn't exist
 * or doesn't declare any agents.
 */
export const loadConfiguredAgents = async (rootDir: string): Promise<readonly string[]> => {
  const configPath = path.join(rootDir, skillsConfigFilename);
  if (!existsSync(configPath)) {
    return [];
  }
  const module: unknown = await import(pathToFileURL(configPath).href);
  return v.parse(SkillsConfigModuleSchema, module).default?.agents ?? [];
};
