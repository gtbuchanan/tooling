import {
  type CommandHandler,
  type Scripts,
  resolveParallelCommand,
  resolveStep,
} from '../lib/hook.ts';
import { type ParallelCommand, run, runParallel } from '../lib/process.ts';
import {
  compileTs,
  generate,
  lintEslint,
  lintOxlint,
  prepare,
  testVitest,
  testVitestE2e,
  testVitestFast,
  testVitestSlow,
} from './leaf.ts';
import { pack } from './pack.ts';

/** Command registry mapping CLI names to handler functions. */
export type CommandRegistry = Record<string, CommandHandler>;

/** Known leaf command names. Typed so access is compile-time checked. */
type LeafName =
  | 'compile:ts' | 'generate' | 'lint:eslint' | 'lint:oxlint'
  | 'pack' | 'prepare' | 'test:vitest' | 'test:vitest:e2e'
  | 'test:vitest:fast' | 'test:vitest:slow';

/** Known alias command names. Typed so access is compile-time checked. */
type AliasName = 'test' | 'test:e2e' | 'test:fast' | 'test:slow';

type LeafRegistry = Record<LeafName, CommandHandler>;
type AliasRegistry = Record<AliasName, CommandHandler>;

const lintParallelCmds = (scripts: Scripts): readonly ParallelCommand[] => [
  resolveParallelCommand(scripts, 'lint:oxlint', 'oxlint'),
  resolveParallelCommand(scripts, 'lint:eslint', 'eslint --max-warnings=0'),
];

/** Leaf commands resolved through hooks. */
const resolveLeaf = (scripts: Scripts): LeafRegistry => ({
  'compile:ts': resolveStep(scripts, 'compile:ts', compileTs),
  'generate': resolveStep(scripts, 'generate', generate),
  'lint:eslint': resolveStep(scripts, 'lint:eslint', lintEslint),
  'lint:oxlint': resolveStep(scripts, 'lint:oxlint', lintOxlint),
  'pack': resolveStep(scripts, 'pack', () => {
    pack();
  }),
  'prepare': resolveStep(scripts, 'prepare', prepare),
  'test:vitest': resolveStep(scripts, 'test:vitest', testVitest),
  'test:vitest:e2e': resolveStep(scripts, 'test:vitest:e2e', testVitestE2e),
  'test:vitest:fast': resolveStep(scripts, 'test:vitest:fast', testVitestFast),
  'test:vitest:slow': resolveStep(scripts, 'test:vitest:slow', testVitestSlow),
});

/** Composed aliases that delegate to a leaf command. */
const resolveAliases = (
  leaf: LeafRegistry,
  scripts: Scripts,
): AliasRegistry => ({
  'test': resolveStep(scripts, 'test', async () => {
    await leaf['test:vitest']([]);
  }),
  'test:e2e': resolveStep(scripts, 'test:e2e', async () => {
    await leaf['test:vitest:e2e']([]);
  }),
  'test:fast': resolveStep(scripts, 'test:fast', async () => {
    await leaf['test:vitest:fast']([]);
  }),
  'test:slow': resolveStep(scripts, 'test:slow', async () => {
    await leaf['test:vitest:slow']([]);
  }),
});

/** Composed pipeline commands resolved through hooks. */
const resolvePipeline = (
  leaf: LeafRegistry,
  aliases: AliasRegistry,
  scripts: Scripts,
): CommandRegistry => {
  const compileCmd = resolveStep(scripts, 'compile', async () => {
    await leaf['compile:ts']([]);
    await run('pnpm', { args: ['-r', '--if-present', 'run', 'compile'] });
  });

  const lintCmd = resolveStep(scripts, 'lint', async () => {
    await runParallel(lintParallelCmds(scripts));
  });

  const checkCmd = resolveStep(scripts, 'check', async () => {
    await compileCmd([]);
    await runParallel([
      ...lintParallelCmds(scripts),
      resolveParallelCommand(scripts, 'test:fast', 'vitest run --tags-filter=!slow'),
    ]);
  });

  const buildCiCmd = resolveStep(scripts, 'build:ci', async () => {
    await checkCmd([]);
    await leaf['pack']([]);
  });

  const buildCmd = resolveStep(scripts, 'build', async () => {
    await checkCmd([]);
    await runParallel([
      resolveParallelCommand(
        scripts, 'test:slow', 'vitest run --tags-filter=slow --pass-with-no-tests',
      ),
      resolveParallelCommand(scripts, 'pack', 'gtb pack'),
    ]);
    await aliases['test:e2e']([]);
  });

  return {
    'build': buildCmd,
    'build:ci': buildCiCmd,
    'check': checkCmd,
    'compile': compileCmd,
    'lint': lintCmd,
  };
};

/**
 * Builds the command registry with hook resolution applied.
 * Consumer `gtb:<step>` scripts in root package.json replace default steps.
 */
export const createCommands = (scripts: Scripts): CommandRegistry => {
  const leaf = resolveLeaf(scripts);
  const aliases = resolveAliases(leaf, scripts);
  return { ...leaf, ...aliases, ...resolvePipeline(leaf, aliases, scripts) };
};
