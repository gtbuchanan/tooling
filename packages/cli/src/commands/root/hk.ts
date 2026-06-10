import { defineCommand } from 'citty';
import { capture, run } from '../../lib/process.ts';
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

const isShallowRepository = async (): Promise<boolean> =>
  (await capture('git', ['rev-parse', '--is-shallow-repository'])) === 'true';

const changedFiles = async (base: string): Promise<readonly string[]> => {
  const out = await capture('git', [
    'diff', '--name-only', '--diff-filter=d', base, 'HEAD',
  ]);
  return out.length === 0 ? [] : out.split('\n');
};

const all = defineCommand({
  meta: {
    description: 'Run hk across all files (fixes locally, checks in CI)',
    name: 'all',
  },
  run: async ({ rawArgs }) => {
    const plan = planHkAll({ env: process.env, rawArgs });
    await run(plan.bin, { args: plan.args, env: plan.env });
  },
});

const base = defineCommand({
  meta: {
    description: 'Run hk on files changed from a base ref',
    name: 'base',
  },
  run: async ({ rawArgs }) => {
    const { base: baseRef, rest } = resolveBaseRef(rawArgs);
    /*
     * We diff ourselves rather than use hk's `--from-ref/--to-ref`, which
     * resolves a merge base and errors on shallow clones with no two-dot
     * fallback (jdx/hk#972). Shallow clones (CI) lack the base commit, so
     * fetch it (depth 1) first; HEAD is then GitHub's test-merge commit,
     * making `diff base HEAD` exactly the PR's changes.
     */
    if (await isShallowRepository()) {
      await run('git', {
        args: ['fetch', '--no-tags', '--depth=1', 'origin', baseRef],
      });
    }
    const plan = planHkBase({
      files: await changedFiles(baseRef),
      mode: hkMode(process.env),
      rest,
    });
    if (plan.kind === 'skip') {
      return;
    }
    await run(plan.bin, { args: plan.args });
  },
});

/** `gtb hk` — runs hk pre-commit hooks across all or changed files. */
export const hk = defineCommand({
  meta: {
    description: 'Run hk pre-commit hooks',
    name: rootNames.hk,
  },
  subCommands: { all, base },
});
