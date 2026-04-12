import { relative } from 'node:path';
import {
  compileTs, coverageVitestMerge, lintEslint, lintOxlint,
  packNpm, prepare, testVitestFast, testVitestSlow,
  turboCheck, typecheckTs,
} from '../commands/leaf/index.ts';
import type { PackageCapabilities, WorkspaceDiscovery } from './discovery.ts';
import {
  Aggregate,
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
  const cmd = (def: { readonly name: string }): string =>
    isSelfHosted ? `pnpm run gtb ${def.name}` : `gtb ${def.name}`;

  return [
    { condition: caps.hasTypeScript, key: typecheckTs.name, value: cmd(typecheckTs) },
    { condition: caps.isPublished, key: compileTs.name, value: cmd(compileTs) },
    { condition: caps.isPublished, key: packNpm.name, value: cmd(packNpm) },
    { condition: caps.hasEslint, key: lintEslint.name, value: cmd(lintEslint) },
    { condition: caps.hasOxlint, key: lintOxlint.name, value: cmd(lintOxlint) },
    {
      condition: caps.hasVitestTests,
      key: testVitestFast.name,
      value: cmd(testVitestFast),
    },
    {
      condition: caps.hasVitestTests,
      key: testVitestSlow.name,
      value: cmd(testVitestSlow),
    },
    {
      condition: caps.hasVitestTests,
      key: coverageVitestMerge.name,
      value: cmd(coverageVitestMerge),
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
  { condition: flags.hasCheck, key: Aggregate.check, value: `turbo run ${Aggregate.check}` },
  {
    condition: flags.hasCheck || flags.hasPublished,
    key: Aggregate.buildCi,
    value: `turbo run ${Aggregate.buildCi}`,
  },
  {
    condition: flags.hasCheck || flags.hasPublished || flags.hasE2e,
    key: Aggregate.build,
    value: `turbo run ${Aggregate.build}`,
  },
  {
    condition: flags.hasVitest,
    key: Aggregate.coverageMerge,
    value: `turbo run ${Aggregate.coverageMerge}`,
  },
  {
    condition: flags.hasPublished,
    key: Aggregate.pack,
    value: `turbo run ${Aggregate.pack}`,
  },
  { condition: flags.hasE2e, key: Aggregate.testE2e, value: `turbo run ${Aggregate.testE2e}` },
  { condition: flags.hasVitest, key: Aggregate.testSlow, value: `turbo run ${Aggregate.testSlow}` },
  { condition: true, key: prepare.name, value: `gtb ${prepare.name}` },
  { condition: true, key: turboCheck.name, value: `gtb ${turboCheck.name}` },
];

/** Generates root-level convenience scripts. */
export const generateRootScripts = (
  discovery: WorkspaceDiscovery,
): Record<string, string> => collect(rootScriptEntries(resolveToolFlags(discovery)));
