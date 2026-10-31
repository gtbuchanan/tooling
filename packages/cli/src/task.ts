import { defineCommand } from 'citty';
import { taskCommandName } from '#src/tasks/leaf.js';
import { coverageCodecovUpload } from '#src/toolchains/codecov/commands/coverage-codecov-upload.js';
import { coverageCodecovUploadLeaf } from '#src/toolchains/codecov/leaves.js';
import { lintEslint } from '#src/toolchains/eslint/commands/lint-eslint.js';
import { lintEslintLeaf } from '#src/toolchains/eslint/leaves.js';
import { packNpm } from '#src/toolchains/npm/commands/pack-npm.js';
import { packNpmLeaf } from '#src/toolchains/npm/leaves.js';
import { packPkl } from '#src/toolchains/pkl/commands/pack-pkl.js';
import { typecheckPkl } from '#src/toolchains/pkl/commands/typecheck-pkl.js';
import { packPklLeaf, typecheckPklLeaf } from '#src/toolchains/pkl/leaves.js';
import { compileSkills } from '#src/toolchains/skills/commands/compile-skills.js';
import { deploySkills } from '#src/toolchains/skills/commands/deploy-skills.js';
import { compileSkillsLeaf, deploySkillsLeaf } from '#src/toolchains/skills/leaves.js';
import { compileTs } from '#src/toolchains/typescript/commands/compile-ts.js';
import { typecheckTs } from '#src/toolchains/typescript/commands/typecheck-ts.js';
import { compileTsLeaf, typecheckTsLeaf } from '#src/toolchains/typescript/leaves.js';
import { coverageVitestMerge } from '#src/toolchains/vitest/commands/coverage-vitest-merge.js';
import { testVitestE2e } from '#src/toolchains/vitest/commands/test-vitest-e2e.js';
import { testVitestFast } from '#src/toolchains/vitest/commands/test-vitest-fast.js';
import { testVitestSlow } from '#src/toolchains/vitest/commands/test-vitest-slow.js';
import { testVitest, testVitestName } from '#src/toolchains/vitest/commands/test-vitest.js';
import {
  coverageVitestMergeLeaf,
  testVitestE2eLeaf,
  testVitestFastLeaf,
  testVitestSlowLeaf,
} from '#src/toolchains/vitest/leaves.js';

/**
 * `gtb task <name>` — invokes a single leaf build tool.
 */
export const task = defineCommand({
  meta: {
    description: 'Run a single leaf build tool (intended for turbo tasks)',
    name: taskCommandName,
  },
  subCommands: {
    [compileSkillsLeaf.name]: compileSkills,
    [compileTsLeaf.name]: compileTs,
    [coverageCodecovUploadLeaf.name]: coverageCodecovUpload,
    [coverageVitestMergeLeaf.name]: coverageVitestMerge,
    [deploySkillsLeaf.name]: deploySkills,
    [lintEslintLeaf.name]: lintEslint,
    [packNpmLeaf.name]: packNpm,
    [packPklLeaf.name]: packPkl,
    [testVitestName]: testVitest,
    [testVitestE2eLeaf.name]: testVitestE2e,
    [testVitestFastLeaf.name]: testVitestFast,
    [testVitestSlowLeaf.name]: testVitestSlow,
    [typecheckPklLeaf.name]: typecheckPkl,
    [typecheckTsLeaf.name]: typecheckTs,
  },
});

export { prepack } from '#src/toolchains/npm/commands/pack-npm.js';
