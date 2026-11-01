import type { Toolchain } from '#src/tasks/toolchain.js';
import { compileSkills } from '#src/toolchains/skills/commands/compile-skills.js';
import { deploySkills } from '#src/toolchains/skills/commands/deploy-skills.js';
import { compileSkillsLeaf, deploySkillsLeaf } from '#src/toolchains/skills/leaves.js';

/**
 * The skills toolchain's `gtb task` subcommands.
 */
export const skillsToolchain: Toolchain = {
  registrations: [
    { command: compileSkills, leaf: compileSkillsLeaf },
    { command: deploySkills, leaf: deploySkillsLeaf },
  ],
};
