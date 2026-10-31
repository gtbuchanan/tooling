import { outDirGlob, skillsOutDirEntry } from '#src/core/dist-source.js';
import { Aggregate } from '#src/tasks/aggregates.js';
import type { Leaf } from '#src/tasks/leaf.js';
import { rootTaskKey } from '#src/tasks/turbo-task.js';
import { lintEslintLeaf } from '#src/toolchains/eslint/leaves.js';
import { skillsConfigFilename } from '#src/toolchains/skills/skills-config.js';

/**
 * Compiles a package's authored skills into its build output.
 *
 * Runs in a package that both publishes and authors skills. Skills and
 * publishing on different packages leave the task with nothing to run.
 */
export const compileSkillsLeaf: Leaf = {
  aggregate: Aggregate.compile,
  appliesTo: pkg => pkg.isPublished && pkg.hasSkills,
  name: 'compile:skills',
  task: () => ({
    inputs: ['skills/**'],
    outputs: [`${outDirGlob(skillsOutDirEntry)}/**`],
  }),
};

/**
 * Deploys a package's authored skills for local agents to discover.
 */
export const deploySkillsLeaf: Leaf = {
  aggregate: Aggregate.build,
  appliesTo: pkg => pkg.hasSkills,
  name: 'deploy:skills',
  /*
   * The root's own copy, for skills that can't move into a package: consumers
   * that read `<root>/skills/<name>/SKILL.md` never see a package's copy. Its
   * inputs need no `$TURBO_ROOT$` prefix (a root task already runs there) and
   * no package-glob subtraction the way `//#lint:eslint` does — both globs are
   * rooted, so neither can reach a package's `skills/`.
   */
  root: {
    appliesTo: discovery => discovery.root.hasSkills,
    task: graph => ({
      dependsOn: graph.appliesAtRoot(lintEslintLeaf.name)
        ? [rootTaskKey(lintEslintLeaf.name)]
        : [],
      inputs: [skillsConfigFilename, 'skills/**'],
      outputs: [],
    }),
  },
  task: graph => ({
    /*
     * Same-package lint only (no `^`): skills are authored independently
     * per package and don't depend on sibling packages' lint state.
     * Lint dep is conditional on the workspace having ESLint at all —
     * referencing `lint:eslint` when it isn't generated would dangle.
     */
    dependsOn: graph.applies(lintEslintLeaf.name) ? [lintEslintLeaf.name] : [],
    inputs: [`$TURBO_ROOT$/${skillsConfigFilename}`, 'skills/**'],
    outputs: [],
  }),
};
