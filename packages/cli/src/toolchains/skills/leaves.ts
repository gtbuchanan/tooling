import { outDirGlob, skillsOutDirEntry } from '#src/core/dist-source.js';
import { Aggregate } from '#src/tasks/aggregates.js';
import type { Leaf } from '#src/tasks/leaf.js';
import { isRootTaskKey } from '#src/tasks/turbo-task.js';
import { published } from '#src/toolchains/npm/capabilities.js';
import { skills } from '#src/toolchains/skills/capabilities.js';
import { skillsConfigFilename } from '#src/toolchains/skills/skills-config.js';

/**
 * Compiles a package's authored skills into its build output.
 *
 * Runs in a package that both publishes and authors skills. Skills and
 * publishing on different packages leave the task with nothing to run.
 */
export const compileSkillsLeaf: Leaf = {
  aggregate: Aggregate.compile,
  appliesTo: pkg => pkg.capabilities.has(published) && pkg.capabilities.has(skills),
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
  appliesTo: pkg => pkg.capabilities.has(skills),
  name: 'deploy:skills',
  /*
   * The root's own copy, for skills that can't move into a package: consumers
   * that read `<root>/skills/<name>/SKILL.md` never see a package's copy. Its
   * inputs need no `$TURBO_ROOT$` prefix (a root task already runs there) and
   * no package-glob subtraction the way `//#lint:eslint` does — both globs are
   * rooted, so neither can reach a package's `skills/`.
   */
  root: {
    appliesTo: discovery => discovery.root.capabilities.has(skills),
    task: graph => ({
      dependsOn: graph.membersOf(Aggregate.lint).filter(isRootTaskKey),
      inputs: [skillsConfigFilename, 'skills/**'],
      outputs: [],
    }),
  },
  task: graph => ({
    /*
     * Same-package lint only (no `^`): skills are authored independently
     * per package and don't depend on sibling packages' lint state. The
     * edges are the lint aggregate's members rather than a named linter, so
     * they follow whichever lint leaves the workspace generates and never
     * name one that isn't generated, which would dangle.
     */
    dependsOn: graph.membersOf(Aggregate.lint).filter(key => !isRootTaskKey(key)),
    inputs: [`$TURBO_ROOT$/${skillsConfigFilename}`, 'skills/**'],
    outputs: [],
  }),
};
