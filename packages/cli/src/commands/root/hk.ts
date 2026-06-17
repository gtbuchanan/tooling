import { defineCommand } from 'citty';
import { type RunOptions, capture, run } from '../../lib/process.ts';
import { rootNames } from './names.ts';

/**
 * hk runs a non-modifying gate in CI and autofixes locally, mirroring
 * prek's `run`. `CI` is set (non-empty) on every runner.
 */
export const hkMode = (env: NodeJS.ProcessEnv): 'check' | 'fix' =>
  env['CI'] ? 'check' : 'fix';

/** A base ref plus the remaining args to forward to hk. */
export interface BaseRef {
  readonly base: string;
  readonly rest: readonly string[];
}

/**
 * Splits `hk base` args into the diff base ref and the hk passthrough.
 * The first non-flag arg is the base; otherwise it defaults to
 * `origin/main` and every arg forwards — so a step can be targeted
 * without repeating the base: `gtb hk base -- -S eslint`.
 */
export const resolveBaseRef = (argv: readonly string[]): BaseRef => {
  const [first, ...tail] = argv;
  return first !== undefined && !first.startsWith('-')
    ? { base: first, rest: tail }
    : { base: 'origin/main', rest: [...argv] };
};

/** A resolved hk invocation. */
export interface HkInvocation {
  readonly args: readonly string[];
  readonly bin: 'hk';
}

/** Inputs to {@link planHkAll}. */
export interface PlanHkAllOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly rawArgs: readonly string[];
}

/** Plans a full-repo hk run. */
export const planHkAll = (options: PlanHkAllOptions): HkInvocation => ({
  args: [hkMode(options.env), '--all', ...options.rawArgs],
  bin: 'hk',
});

/** Inputs to {@link planHkBase}. */
export interface PlanHkBaseOptions {
  readonly base: string;
  readonly mode: 'check' | 'fix';
  readonly rest: readonly string[];
}

/** Plans a base-diff hk run over the range from `base` to HEAD. */
export const planHkBase = (options: PlanHkBaseOptions): HkInvocation => ({
  args: [options.mode, `--from-ref=${options.base}`, '--to-ref=HEAD', ...options.rest],
  bin: 'hk',
});

/**
 * Side-effecting I/O the runners depend on. Injected so the orchestration
 * (shallow detection, base fetch, hk spawn) is unit-testable without
 * spawning git/hk; the citty wrappers wire the real implementations.
 */
export interface HkRunnerDeps {
  readonly capture: (command: string, args: readonly string[]) => Promise<string>;
  readonly env: NodeJS.ProcessEnv;
  readonly run: (command: string, options?: RunOptions) => Promise<void>;
}

const defaultDeps: HkRunnerDeps = { capture, env: process.env, run };

/** Runs hk across all files. */
export const executeHkAll = async (
  rawArgs: readonly string[],
  deps: HkRunnerDeps = defaultDeps,
): Promise<void> => {
  const plan = planHkAll({ env: deps.env, rawArgs });
  await deps.run(plan.bin, { args: plan.args });
};

/** Runs hk over the files changed from the resolved base ref. */
export const executeHkBase = async (
  rawArgs: readonly string[],
  deps: HkRunnerDeps = defaultDeps,
): Promise<void> => {
  const { base, rest } = resolveBaseRef(rawArgs);
  // Shallow clones lack the base commit; fetch it so hk can diff against it.
  // `git fetch origin` wants a remote branch name, so strip any `origin/`.
  const shallow = await deps.capture('git', ['rev-parse', '--is-shallow-repository']);
  if (shallow === 'true') {
    const fetchRef = base.startsWith('origin/') ? base.slice('origin/'.length) : base;
    await deps.run('git', { args: ['fetch', '--no-tags', '--depth=1', 'origin', fetchRef] });
  }
  const plan = planHkBase({ base, mode: hkMode(deps.env), rest });
  await deps.run(plan.bin, { args: plan.args });
};

const all = defineCommand({
  meta: {
    description: 'Run hk across all files (fixes locally, checks in CI)',
    name: 'all',
  },
  run: ({ rawArgs }) => executeHkAll(rawArgs),
});

const base = defineCommand({
  meta: {
    description: 'Run hk on files changed from a base ref',
    name: 'base',
  },
  run: ({ rawArgs }) => executeHkBase(rawArgs),
});

/** `gtb hk` — runs hk pre-commit hooks across all or changed files. */
export const hk = defineCommand({
  meta: {
    description: 'Run hk pre-commit hooks',
    name: rootNames.hk,
  },
  subCommands: { all, base },
});
