import { defineCommand } from 'citty';
import { taskCommandName, taskNames } from './tasks/names.ts';
import { coverageCodecovUpload } from './toolchains/codecov/commands/coverage-codecov-upload.ts';
import { lintEslint } from './toolchains/eslint/commands/lint-eslint.ts';
import { packNpm } from './toolchains/npm/commands/pack-npm.ts';
import { packPkl } from './toolchains/pkl/commands/pack-pkl.ts';
import { typecheckPkl } from './toolchains/pkl/commands/typecheck-pkl.ts';
import { compileSkills } from './toolchains/skills/commands/compile-skills.ts';
import { deploySkills } from './toolchains/skills/commands/deploy-skills.ts';
import { compileTs } from './toolchains/typescript/commands/compile-ts.ts';
import { typecheckTs } from './toolchains/typescript/commands/typecheck-ts.ts';
import { coverageVitestMerge } from './toolchains/vitest/commands/coverage-vitest-merge.ts';
import { testVitestE2e } from './toolchains/vitest/commands/test-vitest-e2e.ts';
import { testVitestFast } from './toolchains/vitest/commands/test-vitest-fast.ts';
import { testVitestSlow } from './toolchains/vitest/commands/test-vitest-slow.ts';
import { testVitest } from './toolchains/vitest/commands/test-vitest.ts';

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

export { prepack } from './toolchains/npm/commands/pack-npm.ts';
