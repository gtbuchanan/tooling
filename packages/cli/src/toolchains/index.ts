import { localeComparer } from '#src/core/sort.js';
import type { Leaf } from '#src/tasks/leaf.js';
import { coverageCodecovUploadLeaf } from '#src/toolchains/codecov/leaves.js';
import { lintEslintLeaf } from '#src/toolchains/eslint/leaves.js';
import { packNpmLeaf } from '#src/toolchains/npm/leaves.js';
import { packPklLeaf, typecheckPklLeaf } from '#src/toolchains/pkl/leaves.js';
import { compileSkillsLeaf, deploySkillsLeaf } from '#src/toolchains/skills/leaves.js';
import { compileTsLeaf, typecheckTsLeaf } from '#src/toolchains/typescript/leaves.js';
import {
  coverageVitestMergeLeaf,
  testVitestE2eLeaf,
  testVitestFastLeaf,
  testVitestSlowLeaf,
} from '#src/toolchains/vitest/leaves.js';

/**
 * Every leaf task gtb generates a script and a turbo task for, in name order,
 * which is the order each aggregate lists its members in.
 */
export const leaves: readonly Leaf[] = [
  compileSkillsLeaf,
  compileTsLeaf,
  coverageCodecovUploadLeaf,
  coverageVitestMergeLeaf,
  deploySkillsLeaf,
  lintEslintLeaf,
  packNpmLeaf,
  packPklLeaf,
  testVitestE2eLeaf,
  testVitestFastLeaf,
  testVitestSlowLeaf,
  typecheckPklLeaf,
  typecheckTsLeaf,
].toSorted((left, right) => localeComparer(left.name, right.name));
