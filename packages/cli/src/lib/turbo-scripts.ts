import { relative } from 'node:path';
import type { PackageCapabilities, WorkspaceDiscovery } from './discovery.ts';
import {
  type ConditionalEntry,
  type ToolFlags,
  collect,
  resolveToolFlags,
} from './turbo-config.ts';

const packageScriptEntries = (
  caps: PackageCapabilities,
  isSelfHosted: boolean,
): readonly ConditionalEntry<string>[] => {
  // Self-hosted repos define gtb as a package.json script (shim to source).
  // Bare `gtb` only resolves node_modules/.bin — not sibling scripts — so
  // Self-hosted must use `pnpm run gtb` to invoke the script by name.
  const cmd = (name: string): string =>
    isSelfHosted ? `pnpm run gtb ${name}` : `gtb ${name}`;

  return [
    { condition: caps.hasTypeScript, key: 'typecheck:ts', value: cmd('typecheck:ts') },
    { condition: caps.isPublished, key: 'compile:ts', value: cmd('compile:ts') },
    { condition: caps.isPublished, key: 'pack:npm', value: cmd('pack:npm') },
    { condition: caps.hasEslint, key: 'lint:eslint', value: cmd('lint:eslint') },
    { condition: caps.hasOxlint, key: 'lint:oxlint', value: cmd('lint:oxlint') },
    {
      condition: caps.hasVitestTests,
      key: 'test:vitest:fast',
      value: cmd('test:vitest:fast'),
    },
    {
      condition: caps.hasVitestTests,
      key: 'test:vitest:slow',
      value: cmd('test:vitest:slow'),
    },
    {
      condition: caps.hasVitestTests,
      key: 'coverage:vitest:merge',
      value: cmd('coverage:vitest:merge'),
    },
  ];
};

/** Generates the gtb shim script for self-hosted packages. */
const gtbShim = (pkgDir: string, rootDir: string): string => {
  const rel = relative(pkgDir, rootDir).replaceAll('\\', '/');

  return `node --experimental-strip-types ${rel}/packages/cli/bin/gtb.ts`;
};

/** Generates per-package scripts from capabilities. */
export const generatePackageScripts = (
  caps: PackageCapabilities,
  isSelfHosted: boolean,
  rootDir?: string,
): Record<string, string> => {
  const scripts = collect(packageScriptEntries(caps, isSelfHosted));
  if (isSelfHosted && rootDir !== undefined) {
    scripts['gtb'] = gtbShim(caps.dir, rootDir);
  }

  return scripts;
};

const rootScriptEntries = (flags: ToolFlags): readonly ConditionalEntry<string>[] => [
  { condition: flags.hasCheck, key: 'check', value: 'turbo run check' },
  { condition: flags.hasCheck || flags.hasPublished, key: 'build:ci', value: 'turbo run build:ci' },
  {
    condition: flags.hasCheck || flags.hasPublished || flags.hasE2e,
    key: 'build',
    value: 'turbo run build',
  },
  { condition: flags.hasVitest, key: 'coverage:merge', value: 'turbo run coverage:merge' },
  { condition: flags.hasPublished, key: 'pack', value: 'gtb pack' },
  { condition: flags.hasE2e, key: 'test:e2e', value: 'turbo run test:e2e' },
  { condition: flags.hasVitest, key: 'test:slow', value: 'turbo run test:slow' },
  { condition: true, key: 'prepare', value: 'gtb prepare' },
];

/** Generates root-level convenience scripts. */
export const generateRootScripts = (
  discovery: WorkspaceDiscovery,
): Record<string, string> => collect(rootScriptEntries(resolveToolFlags(discovery)));
