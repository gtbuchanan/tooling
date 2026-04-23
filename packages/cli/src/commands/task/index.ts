import { defineCommand } from 'citty';
import { compileTs } from './compile-ts.ts';
import { coverageCodecovUpload } from './coverage-codecov-upload.ts';
import { coverageVitestMerge } from './coverage-vitest-merge.ts';
import { deploySkills } from './deploy-skills.ts';
import { lintEslint } from './lint-eslint.ts';
import { taskCommandName, taskNames } from './names.ts';
import { packNpm } from './pack-npm.ts';
import { testVitestE2e } from './test-vitest-e2e.ts';
import { testVitestFast } from './test-vitest-fast.ts';
import { testVitestSlow } from './test-vitest-slow.ts';
import { testVitest } from './test-vitest.ts';
import { typecheckTs } from './typecheck-ts.ts';

/** `gtb task <name>` — invokes a single leaf build tool. */
export const task = defineCommand({
  meta: {
    description: 'Run a single leaf build tool (intended for turbo tasks)',
    name: taskCommandName,
  },
  subCommands: {
    [taskNames.compileTs]: compileTs,
    [taskNames.coverageCodecovUpload]: coverageCodecovUpload,
    [taskNames.coverageVitestMerge]: coverageVitestMerge,
    [taskNames.deploySkills]: deploySkills,
    [taskNames.lintEslint]: lintEslint,
    [taskNames.packNpm]: packNpm,
    [taskNames.testVitest]: testVitest,
    [taskNames.testVitestE2e]: testVitestE2e,
    [taskNames.testVitestFast]: testVitestFast,
    [taskNames.testVitestSlow]: testVitestSlow,
    [taskNames.typecheckTs]: typecheckTs,
  },
});

export { prepack } from './pack-npm.ts';
