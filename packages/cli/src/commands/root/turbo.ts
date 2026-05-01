import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { defineCommand } from 'citty';
import { run } from '../../lib/process.ts';
import { resolveWorkspace } from '../../lib/workspace.ts';
import { rootNames } from './names.ts';

/**
 * Setup help shown when `@turbo/linux-*` is missing on Android. Termux's
 * Node reports `process.platform === 'android'`, so pnpm filters out
 * every turbo platform binary on install. The fix is to widen pnpm's
 * `supportedArchitectures` whitelist via the per-user global rc.
 *
 * Native android binaries are not coming from upstream — vercel/turborepo#5616
 * was closed as "not planned" — so the linux-arm64 binary is the workaround.
 */
const androidSetupHelp = `
gtb turbo: the linux turbo binary is not installed.

On Android (Termux), pnpm filters optional dependencies by host platform,
so @turbo/linux-${process.arch === 'arm64' ? 'arm64' : '64'} is skipped by default.
Add the following to your global pnpm rc and reinstall:

  ~/.config/pnpm/rc

    supported-architectures.os[]=current
    supported-architectures.os[]=linux

Then run \`pnpm install --force\` from the workspace root.
`.trimStart();

const linuxArchSuffix = (): '64' | 'arm64' =>
  process.arch === 'arm64' ? 'arm64' : '64';

/**
 * Resolves the linux turbo binary by mirroring how turbo's own launcher
 * locates its platform package: `require.resolve` from inside
 * `node_modules/turbo/bin/`. Uses realpath because pnpm's strict
 * `node_modules/turbo` is a symlink into `.pnpm/`, and Node's module
 * lookup walks the literal path components of the parent — without
 * realpath we'd never reach the `@turbo/<plat>-<arch>` siblings.
 */
const resolveAndroidTurboBinary = (rootDir: string): string | undefined => {
  const launcherSymlink = path.join(rootDir, 'node_modules', 'turbo', 'bin', 'turbo');
  try {
    const launcherRealpath = realpathSync(launcherSymlink);
    return createRequire(launcherRealpath).resolve(
      `@turbo/linux-${linuxArchSuffix()}/bin/turbo`,
    );
  } catch {
    return undefined;
  }
};

/** Discriminated plan for how to invoke turbo from the current host. */
export type TurboInvocation =
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'spawn'; readonly args: readonly string[]; readonly bin: string };

/** Inputs to {@link planTurboInvocation}. */
export interface PlanTurboInvocationOptions {
  readonly arch: string;
  readonly platform: string;
  readonly rawArgs: readonly string[];
  readonly resolveAndroidBinary?: (rootDir: string) => string | undefined;
  readonly rootDir: string;
}

/**
 * Computes the turbo invocation plan for a given host. On Android
 * resolves the linux platform binary directly (bypassing turbo's
 * launcher, which rejects `android` upfront). On every other platform
 * delegates to the launcher on PATH so its native install behavior is
 * preserved.
 *
 * Issue 2 — turbo's child-process spawn tripping on `/usr/bin/env`
 * shebangs because the glibc binary bypasses Termux's Bionic libc
 * preload — is handled out-of-band by `@gtbuchanan/pnpm-termux-shim`,
 * which lands a working `pnpm` in `node_modules/.bin/` via an
 * `os: ["android"]`-filtered optional dependency.
 */
export const planTurboInvocation = (
  options: PlanTurboInvocationOptions,
): TurboInvocation => {
  if (options.platform !== 'android') {
    return { args: [...options.rawArgs], bin: 'turbo', kind: 'spawn' };
  }
  const resolveBin = options.resolveAndroidBinary ?? resolveAndroidTurboBinary;
  const resolved = resolveBin(options.rootDir);
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
    const { rootDir } = resolveWorkspace();
    const plan = planTurboInvocation({
      arch: process.arch,
      platform: process.platform,
      rawArgs,
      rootDir,
    });
    if (plan.kind === 'error') {
      console.error(plan.message);
      process.exitCode = 1;
      return;
    }
    await run(plan.bin, { args: plan.args });
  },
});
