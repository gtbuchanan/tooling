/* eslint-disable-next-line @typescript-eslint/triple-slash-reference --
   Cross-package tsc needs this to resolve the .d.ts */
/// <reference path="./eslint-plugin-promise.d.ts" />
import type { Linter } from 'eslint';
import { defineConfig } from 'eslint/config';
import { scriptFileExtensions } from './files.ts';
import { plugins } from './plugins/index.ts';
import { defaultPnpmWorkspaceSettings } from './pnpm-workspace.ts';
import type { PnpmWorkspaceSettings } from './pnpm-workspace.ts';

export {
  cjsFiles,
  scriptFileExtensions,
  scriptFiles,
  tsOnlyExtensions,
  tsOnlyFiles,
} from './files.ts';
export { defaultPnpmWorkspaceSettings } from './pnpm-workspace.ts';
export type { PnpmWorkspaceSettings } from './pnpm-workspace.ts';

const entryPointDirs = ['**/bin', '**/scripts'] as const;

/** Default file patterns for entry points (bin and scripts directories). */
export const defaultEntryPoints: readonly string[] = entryPointDirs.flatMap(
  dir => scriptFileExtensions.map(ext => `${dir}/**/*.${ext}`),
);

/** Options for the shared ESLint configuration. */
export interface ESLintConfigureOptions {
  /** Root directory for TypeScript project service. */
  readonly tsconfigRootDir?: string;
  /**
   * Global ignore patterns.
   * @defaultValue Claude Code worktrees and dist output directories
   */
  readonly ignores?: string[];
  /**
   * File patterns for entry points exempt from `process.exit` and hashbang
   * restrictions. In browser mode, also exempt from `no-console`.
   * @defaultValue Bin directories and scripts directories
   */
  readonly entryPoints?: string[];
  /**
   * Irreversible within a process — uses a side-effect import that
   * monkey-patches the ESLint Linter class.
   * @defaultValue true
   */
  readonly onlyWarn?: boolean;
  /**
   * Enable eslint-plugin-pnpm rules for package.json and
   * pnpm-workspace.yaml files.
   * @defaultValue true
   */
  readonly pnpm?: boolean;
  /**
   * Policy enforced on the settings keys of `pnpm-workspace.yaml`.
   * Replaces the default wholesale rather than merging into it — spread
   * {@link defaultPnpmWorkspaceSettings} to extend it. Pass `false` to
   * keep the catalog rules but drop the settings policy. Ignored when
   * `pnpm` is `false`.
   * @defaultValue {@link defaultPnpmWorkspaceSettings}
   */
  readonly pnpmWorkspaceSettings?: PnpmWorkspaceSettings | false;
  /**
   * Target environment. Server targets enable require-unicode-regexp with
   * `/v` flag. Browser targets enable `no-console` and `no-alert`; entry
   * points are exempt from `no-console`.
   * @defaultValue 'server'
   */
  readonly target?: 'browser' | 'server';
}

/** Options with all defaults resolved. Passed to plugin factories. */
export type ResolvedOptions =
  Required<Omit<ESLintConfigureOptions, 'tsconfigRootDir'>>
  & Pick<ESLintConfigureOptions, 'tsconfigRootDir'>;

/** Factory function that produces ESLint configs from resolved options. */
export type PluginFactory = (options: ResolvedOptions) => Linter.Config[];

/** Creates an ESLint flat config for TypeScript projects. */
export const configure = async (
  options: ESLintConfigureOptions = {},
): Promise<Linter.Config[]> => {
  const resolved: ResolvedOptions = {
    entryPoints: options.entryPoints ?? [...defaultEntryPoints],
    ignores: options.ignores ?? [
      '.claude/worktrees/**',
      '**/.turbo/**',
      '**/dist/**',
      '**/pnpm-lock.yaml',
      '**/skills-lock.json',
      '**/skills/*-workspace/**',
      '**/skills/npm-*/**',
    ],
    onlyWarn: options.onlyWarn ?? true,
    pnpm: options.pnpm ?? true,
    pnpmWorkspaceSettings: options.pnpmWorkspaceSettings ?? defaultPnpmWorkspaceSettings,
    target: options.target ?? 'server',
    ...(options.tsconfigRootDir !== undefined && { tsconfigRootDir: options.tsconfigRootDir }),
  };

  if (resolved.onlyWarn) {
    await import('eslint-plugin-only-warn');
  }

  return defineConfig(
    ...plugins.flatMap(plugin => plugin(resolved)),
    { ignores: resolved.ignores },
  );
};
