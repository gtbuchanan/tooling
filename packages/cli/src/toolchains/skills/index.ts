import type { Toolchain } from '#src/tasks/toolchain.js';
import * as capabilities from '#src/toolchains/skills/capabilities.js';
import { compileSkills } from '#src/toolchains/skills/commands/compile-skills.js';
import { deploySkills } from '#src/toolchains/skills/commands/deploy-skills.js';
import { compileSkillsLeaf, deploySkillsLeaf } from '#src/toolchains/skills/leaves.js';

/**
 * The skills toolchain's `gtb task` subcommands, and what discovery detects
 * for it.
 */
export const skillsToolchain: Toolchain = {
  detects: Object.values(capabilities),
  registrations: [
    { command: compileSkills, leaf: compileSkillsLeaf },
    { command: deploySkills, leaf: deploySkillsLeaf },
  ],
};
