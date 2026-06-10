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
export interface HkSpawn {
  readonly args: readonly string[];
  readonly bin: 'hk';
  readonly env: NodeJS.ProcessEnv;
}

/** Inputs to {@link planHkAll}. */
export interface PlanHkAllOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly rawArgs: readonly string[];
}

/**
 * Plans a full-repo hk run. Forces `HK_BATCH=1` so file-heavy steps
 * chunk under Windows' cmd.exe 8191-char limit — hk shells each step's
 * command through cmd.exe, and a full-repo file list overflows it
 * (jdx/hk#971). Off by default elsewhere so commits invoke each linter
 * once instead of per-chunk.
 */
export const planHkAll = (options: PlanHkAllOptions): HkSpawn => ({
  args: [hkMode(options.env), '--all', ...options.rawArgs],
  bin: 'hk',
  env: { ...options.env, HK_BATCH: '1' },
});

/** Plan for a base-diff hk run: skip when nothing changed, else spawn. */
export type HkBasePlan =
  | { readonly kind: 'skip' }
  | { readonly args: readonly string[]; readonly bin: 'hk'; readonly kind: 'spawn' };

/** Inputs to {@link planHkBase}. */
export interface PlanHkBaseOptions {
  readonly files: readonly string[];
  readonly mode: 'check' | 'fix';
  readonly rest: readonly string[];
}

/** Plans a base-diff hk run over the changed files. */
export const planHkBase = (options: PlanHkBaseOptions): HkBasePlan =>
  options.files.length === 0
    ? { kind: 'skip' }
    : {
        args: [options.mode, ...options.rest, ...options.files],
        bin: 'hk',
        kind: 'spawn',
      };

/**
 * Side-effecting I/O the runners depend on. Injected so the orchestration
 * (shallow fetch, diff, skip-vs-spawn) is unit-testable without spawning
 * git/hk; the citty wrappers wire the real implementations.
 */
export interface HkRunnerDeps {
  readonly capture: (command: string, args: readonly string[]) => Promise<string>;
  readonly env: NodeJS.ProcessEnv;
  readonly run: (command: string, options?: RunOptions) => Promise<void>;
}

const defaultDeps: HkRunnerDeps = { capture, env: process.env, run };

/** Runs hk across all files (full-repo, with batching forced on). */
export const executeHkAll = async (
  rawArgs: readonly string[],
  deps: HkRunnerDeps = defaultDeps,
): Promise<void> => {
  const plan = planHkAll({ env: deps.env, rawArgs });
  await deps.run(plan.bin, { args: plan.args, env: plan.env });
};

/** Runs hk over the files changed from the resolved base ref. */
export const executeHkBase = async (
  rawArgs: readonly string[],
  deps: HkRunnerDeps = defaultDeps,
): Promise<void> => {
  const { base, rest } = resolveBaseRef(rawArgs);
  /*
   * We diff ourselves rather than use hk's `--from-ref/--to-ref`, which
   * resolves a merge base and errors on shallow clones with no two-dot
   * fallback (jdx/hk#972). Shallow clones (CI) lack the base commit, so
   * fetch it (depth 1) first; HEAD is then GitHub's test-merge commit,
   * making `diff base HEAD` exactly the PR's changes.
   */
  const shallow = await deps.capture('git', ['rev-parse', '--is-shallow-repository']);
  if (shallow === 'true') {
    await deps.run('git', { args: ['fetch', '--no-tags', '--depth=1', 'origin', base] });
  }
  const diff = await deps.capture('git', ['diff', '--name-only', '--diff-filter=d', base, 'HEAD']);
  const plan = planHkBase({
    files: diff.length === 0 ? [] : diff.split('\n'),
    mode: hkMode(deps.env),
    rest,
  });
  if (plan.kind === 'spawn') {
    await deps.run(plan.bin, { args: plan.args });
  }
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
