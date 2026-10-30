import { defineCommand } from 'citty';
import { taskCommandName, taskNames } from '#src/tasks/names.js';
import { coverageCodecovUpload } from '#src/toolchains/codecov/commands/coverage-codecov-upload.js';
import { lintEslint } from '#src/toolchains/eslint/commands/lint-eslint.js';
import { packNpm } from '#src/toolchains/npm/commands/pack-npm.js';
import { packPkl } from '#src/toolchains/pkl/commands/pack-pkl.js';
import { typecheckPkl } from '#src/toolchains/pkl/commands/typecheck-pkl.js';
import { compileSkills } from '#src/toolchains/skills/commands/compile-skills.js';
import { deploySkills } from '#src/toolchains/skills/commands/deploy-skills.js';
import { compileTs } from '#src/toolchains/typescript/commands/compile-ts.js';
import { typecheckTs } from '#src/toolchains/typescript/commands/typecheck-ts.js';
import { coverageVitestMerge } from '#src/toolchains/vitest/commands/coverage-vitest-merge.js';
import { testVitestE2e } from '#src/toolchains/vitest/commands/test-vitest-e2e.js';
import { testVitestFast } from '#src/toolchains/vitest/commands/test-vitest-fast.js';
import { testVitestSlow } from '#src/toolchains/vitest/commands/test-vitest-slow.js';
import { testVitest } from '#src/toolchains/vitest/commands/test-vitest.js';

/**
 * `gtb task <name>` — invokes a single leaf build tool.
 */
export const task = defineCommand({
  meta: {
    description: 'Run a single leaf build tool (intended for turbo tasks)',
    name: taskCommandName,
  },
  subCommands: {
    [taskNames.compileSkills]: compileSkills,
    [taskNames.compileTs]: compileTs,
    [taskNames.coverageCodecovUpload]: coverageCodecovUpload,
    [taskNames.coverageVitestMerge]: coverageVitestMerge,
    [taskNames.deploySkills]: deploySkills,
    [taskNames.lintEslint]: lintEslint,
    [taskNames.packNpm]: packNpm,
    [taskNames.packPkl]: packPkl,
    [taskNames.testVitest]: testVitest,
    [taskNames.testVitestE2e]: testVitestE2e,
    [taskNames.testVitestFast]: testVitestFast,
    [taskNames.testVitestSlow]: testVitestSlow,
    [taskNames.typecheckPkl]: typecheckPkl,
    [taskNames.typecheckTs]: typecheckTs,
  },
});

export { prepack } from '#src/toolchains/npm/commands/pack-npm.js';
