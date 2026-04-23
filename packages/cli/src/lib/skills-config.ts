import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as v from 'valibot';

/** Filename of the workspace-root skills-npm configuration. */
export const skillsConfigFilename = 'skills-npm.config.ts';

const SkillsConfigModuleSchema = v.object({
  default: v.object({
    agents: v.pipe(v.array(v.string()), v.minLength(1)),
  }),
});

/** Validated shape of the resolved skills-npm config. */
export type SkillsConfig = v.InferOutput<typeof SkillsConfigModuleSchema>['default'];

/** Loads and validates `skills-npm.config.ts` from the workspace root. */
export const loadSkillsConfig = async (rootDir: string): Promise<SkillsConfig> => {
  const configPath = path.join(rootDir, skillsConfigFilename);
  const module: unknown = await import(pathToFileURL(configPath).href);
  return v.parse(SkillsConfigModuleSchema, module).default;
};
