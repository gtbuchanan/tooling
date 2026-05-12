import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineCommand } from 'citty';
import { run } from '../../lib/process.ts';
import { rootNames } from './names.ts';

/**
 * Setup help shown when the global turbo binary is missing on Android.
 * Termux ships a native turbo via its package registry; the npm
 * `@turbo/linux-<arch>` workaround is no longer needed and the
 * launcher in `node_modules/.bin/turbo` rejects
 * `process.platform === 'android'` upfront.
 *
 * Native android binaries are not coming from upstream — vercel/turborepo#5616
 * was closed as "not planned" — so the Termux-pkg turbo (Bionic-built
 * against `aarch64-linux-android`) is the supported path.
 */
const androidSetupHelp = `
gtb turbo: the global turbo binary is not installed.

On Android (Termux), gtb turbo execs the native turbo from the Termux
package registry instead of the npm-distributed Linux binary. The
node_modules launcher refuses to start when process.platform === 'android'.

Install it from the Termux registry:

  pkg install turbo

If your Termux prefix is non-standard, set $PREFIX before running.
`.trimStart();

/**
 * Resolves the global Termux-pkg-installed turbo binary. Honors
 * Termux's $PREFIX env var; falls back to the standard install path
 * when $PREFIX is unset (matching the convention used by
 * `@gtbuchanan/pnpm-termux-shim`).
 */
const resolveAndroidTurboBinary = (): string | undefined => {
  const prefix = process.env['PREFIX'] ?? '/data/data/com.termux/files/usr';
  const candidate = path.join(prefix, 'bin', 'turbo');
  return existsSync(candidate) ? candidate : undefined;
};

/** Discriminated plan for how to invoke turbo from the current host. */
export type TurboInvocation =
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'spawn'; readonly args: readonly string[]; readonly bin: string };

/** Inputs to {@link planTurboInvocation}. */
export interface PlanTurboInvocationOptions {
  readonly platform: string;
  readonly rawArgs: readonly string[];
  readonly resolveAndroidBinary?: () => string | undefined;
}

/**
 * Computes the turbo invocation plan for a given host. On Android
 * resolves the Termux-pkg turbo binary directly (bypassing the
 * node_modules launcher, which rejects `android` upfront). On every
 * other platform delegates to the launcher on PATH so its native
 * install behavior is preserved.
 *
 * The Termux-pkg turbo is Bionic-built, so its child-process spawns
 * honor Termux's `LD_PRELOAD` shebang rewriter and resolve
 * `#!/usr/bin/env <name>` correctly. The companion
 * `@gtbuchanan/pnpm-termux-shim` package is retained defensively in
 * case turbo reintroduces a glibc npm distribution, or another glibc
 * binary in the graph needs to spawn `pnpm`.
 */
export const planTurboInvocation = (
  options: PlanTurboInvocationOptions,
): TurboInvocation => {
  if (options.platform !== 'android') {
    return { args: [...options.rawArgs], bin: 'turbo', kind: 'spawn' };
  }
  const resolveBin = options.resolveAndroidBinary ?? resolveAndroidTurboBinary;
  const resolved = resolveBin();
  if (resolved === undefined) {
    return { kind: 'error', message: androidSetupHelp };
  }
  return { args: [...options.rawArgs], bin: resolved, kind: 'spawn' };
};

/** `gtb turbo` — runs turbo, with an Android (Termux) escape hatch. */
export const turbo = defineCommand({
  meta: {
    description: 'Run turbo (with an Android escape hatch)',
    name: rootNames.turbo,
  },
  run: async ({ rawArgs }) => {
    const plan = planTurboInvocation({
      platform: process.platform,
      rawArgs,
    });
    if (plan.kind === 'error') {
      console.error(plan.message);
      process.exitCode = 1;
      return;
    }
    await run(plan.bin, { args: plan.args });
  },
});
